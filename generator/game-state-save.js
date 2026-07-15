(function (root, factory) {
  "use strict";
  const namespaces = typeof module === "object" && module.exports
    ? require("./save-namespaces.js")
    : root.PET_CLINIC_SAVE_NAMESPACES;
  const compactApi = typeof module === "object" && module.exports
    ? require("./compact-visit-v2.js")
    : root.PET_CLINIC_COMPACT_VISIT_V2;
  const freeClinicalFlow = typeof module === "object" && module.exports
    ? require("../systems/free-clinical-flow-v2.js")
    : root.PET_CLINIC_FREE_CLINICAL_FLOW_V2;
  const atomicSaveMigration = typeof module === "object" && module.exports
    ? require("./atomic-save-migration.js")
    : root.PET_CLINIC_ATOMIC_SAVE_MIGRATION;
  const capabilityApi = typeof module === "object" && module.exports
    ? require("../systems/capability-registry-v3.js")
    : root.PET_CLINIC_CAPABILITY_REGISTRY_V3;
  const researchApi = typeof module === "object" && module.exports
    ? require("../systems/research-orders-v3.js")
    : root.PET_CLINIC_RESEARCH_ORDERS_V3;
  const referralApi = typeof module === "object" && module.exports
    ? require("../systems/referral-orders-v3.js")
    : root.PET_CLINIC_REFERRAL_ORDERS_V3;
  const asyncEventApi = typeof module === "object" && module.exports
    ? require("../systems/async-events-v3.js")
    : root.PET_CLINIC_ASYNC_EVENTS_V3;
  const deviceQueueApi = typeof module === "object" && module.exports
    ? require("../systems/device-queue-v3.js")
    : root.PET_CLINIC_DEVICE_QUEUE_V3;
  const identityApi = typeof module === "object" && module.exports
    ? require("../systems/identity-behavior-v4.js")
    : root.PET_CLINIC_IDENTITY_BEHAVIOR_V4;
  const identityRuntime = typeof module === "object" && module.exports
    ? require("../systems/identity-runtime-v4.js")
    : root.PET_CLINIC_IDENTITY_RUNTIME_V4;
  const api = factory(
    namespaces,
    compactApi,
    freeClinicalFlow,
    atomicSaveMigration,
    capabilityApi,
    researchApi,
    referralApi,
    asyncEventApi,
    deviceQueueApi,
    identityApi,
    identityRuntime
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_GAME_STATE_SAVE = api;
})(typeof window !== "undefined" ? window : globalThis, function (
  namespaces,
  compactApi,
  freeClinicalFlow,
  atomicSaveMigration,
  capabilityApi,
  researchApi,
  referralApi,
  asyncEventApi,
  deviceQueueApi,
  identityApi,
  identityRuntime
) {
  "use strict";

  const GAME_STATE_SAVE_VERSION = 1;
  const LEGACY_TIER_01_V2_GAME_STATE_SAVE_VERSIONS = Object.freeze([1, 2, 3, 4]);
  const PREVIOUS_TIER_01_V2_GAME_STATE_SAVE_VERSION = 5;
  const P3_TIER_01_V2_GAME_STATE_SAVE_VERSION = 6;
  const TIER_01_V2_GAME_STATE_SAVE_VERSION = 7;
  const CAPABILITY_REGISTRY_ID = "vetgeme-clinic-capabilities";
  const CAPABILITY_REGISTRY_VERSION = "2026.07.14.38";
  const SERIALIZED_FIELDS = Object.freeze([
    "phase", "day", "minute", "dayEnd", "money", "reputation", "queue", "activeId",
    "nextPatientId", "paused", "speed", "spawnMeter", "log", "treatedToday", "revenueToday",
    "expensesToday", "diagnosticRevenueToday", "microscopyToday", "arrivalsToday",
    "plannedArrivalsToday", "specialEventsToday", "handledSpecialEventsToday", "arrivalSchedule",
    "reputationStartToday", "reputationEvents", "returnsToday", "mistakesToday", "pendingReturns",
    "caseJournal", "dayStarted", "hoursMode", "selectedDoctorId", "doctors", "lostToday", "goalStats",
    "shiftExtended", "chapterComplete", "firstArrivalPaused", "tutorialVisitId", "tutorialStepIndex",
    "tutorialComplete", "summaryTitle", "summaryHtml"
  ]);
  const TIER_01_V2_SERIALIZED_FIELDS = Object.freeze([
    ...SERIALIZED_FIELDS,
    "ownerTrust", "clinicalReliability", "awareness", "campaignFinance", "dailyLedger",
    "equipmentCapabilities", "demandState", "campaignOutcome", "appointments", "treatmentCourses",
    "longitudinalPatients", "attendanceEvents", "capabilityState", "researchOrders", "referralOrders",
    "asyncEvents", "deviceQueues", "identityRegistry"
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function snapshotState(state, fields = SERIALIZED_FIELDS) {
    const snapshot = {};
    fields.forEach((field) => {
      if (state[field] !== undefined) snapshot[field] = clone(state[field]);
    });
    return snapshot;
  }

  function saveVersionForMode(mode) {
    return mode === "tier-01-v2" ? TIER_01_V2_GAME_STATE_SAVE_VERSION : GAME_STATE_SAVE_VERSION;
  }

  function compactPatient(patient, catalog) {
    const compact = clone(patient);
    if (!compact.v2Visit) return compact;
    if (!catalog) throw new Error("Tier 01 v2 catalog is required to compact a queued visit");
    compact.v2Visit = compactApi.compactVisit(compact.v2Visit, catalog);
    delete compact.ownerProfile;
    return compact;
  }

  function compactTierState(state, catalog) {
    const compact = snapshotState(state, TIER_01_V2_SERIALIZED_FIELDS);
    compact.queue = (compact.queue || []).map((patient) => compactPatient(patient, catalog));
    compact.arrivalSchedule = (compact.arrivalSchedule || []).map((arrival) => ({
      ...arrival,
      template: compactPatient(arrival.template, catalog)
    }));
    return identityRuntime.compactStateIdentityRegistry(compact);
  }

  function campaignDefaults(state = {}) {
    const legacyReputation = Number.isFinite(Number(state.reputation)) ? Number(state.reputation) : 74;
    const ownerTrust = Number.isFinite(Number(state.ownerTrust)) ? Number(state.ownerTrust) : legacyReputation;
    const clinicalReliability = Number.isFinite(Number(state.clinicalReliability))
      ? Number(state.clinicalReliability)
      : legacyReputation;
    const money = Number(state.money) || 0;
    return {
      ownerTrust,
      clinicalReliability,
      awareness: Number.isFinite(Number(state.awareness)) ? Number(state.awareness) : 30,
      campaignFinance: state.campaignFinance || {
        creditLimit: 2500,
        debt: Math.max(0, -money),
        weeklyReview: null,
        closureRisk: "stable"
      },
      dailyLedger: Array.isArray(state.dailyLedger) ? state.dailyLedger : [],
      equipmentCapabilities: state.equipmentCapabilities || {},
      demandState: state.demandState || null,
      campaignOutcome: state.campaignOutcome || null
    };
  }

  function addCampaignDefaults(state) {
    return { ...clone(state || {}), ...campaignDefaults(state) };
  }

  function addLongitudinalDefaults(state) {
    return {
      ...clone(state || {}),
      appointments: Array.isArray(state?.appointments) ? clone(state.appointments) : [],
      treatmentCourses: Array.isArray(state?.treatmentCourses) ? clone(state.treatmentCourses) : [],
      longitudinalPatients: state?.longitudinalPatients && typeof state.longitudinalPatients === "object"
        ? clone(state.longitudinalPatients)
        : {},
      attendanceEvents: Array.isArray(state?.attendanceEvents) ? clone(state.attendanceEvents) : []
    };
  }

  function defaultCapabilityState(state = {}) {
    if (isRecord(state.capabilityState)
      && state.capabilityState.schemaVersion === 1
      && isRecord(state.capabilityState.entries)) {
      return clone(state.capabilityState);
    }
    return {
      schemaVersion: 1,
      registryId: CAPABILITY_REGISTRY_ID,
      registryVersion: CAPABILITY_REGISTRY_VERSION,
      entries: isRecord(state.equipmentCapabilities) ? clone(state.equipmentCapabilities) : {}
    };
  }

  function defaultDeviceQueues(state = {}) {
    if (isRecord(state.deviceQueues)
      && state.deviceQueues.schemaVersion === 1
      && isRecord(state.deviceQueues.resources)) {
      return clone(state.deviceQueues);
    }
    return { schemaVersion: 1, resources: {} };
  }

  function addP3Defaults(state) {
    return {
      ...clone(state || {}),
      capabilityState: defaultCapabilityState(state),
      researchOrders: Array.isArray(state?.researchOrders) ? clone(state.researchOrders) : [],
      referralOrders: Array.isArray(state?.referralOrders) ? clone(state.referralOrders) : [],
      asyncEvents: Array.isArray(state?.asyncEvents) ? clone(state.asyncEvents) : [],
      deviceQueues: defaultDeviceQueues(state)
    };
  }

  function requireCampaignIdentity(options = {}) {
    if (typeof options.campaignIdentity !== "string" || !options.campaignIdentity) {
      throw new Error("Tier 01 v2 campaign identity is required");
    }
    return options.campaignIdentity;
  }

  function addP4Defaults(state, options = {}) {
    const next = clone(state || {});
    identityRuntime.syncStateIdentityReferences(next, {
      campaignIdentity: requireCampaignIdentity(options)
    });
    return next;
  }

  function hydratePatient(patient, catalog) {
    const hydrated = clone(patient);
    if (!hydrated.v2Visit) return hydrated;
    if (!catalog) throw new Error("Tier 01 v2 catalog is required to hydrate a queued visit");
    hydrated.v2Visit = hydrated.v2Visit.medicalContent
      ? clone(hydrated.v2Visit)
      : compactApi.hydrateVisit(hydrated.v2Visit, catalog);
    return hydrated;
  }

  function hydrateTierState(state, catalog) {
    const hydrated = clone(state);
    hydrated.queue = (hydrated.queue || []).map((patient) => hydratePatient(patient, catalog));
    hydrated.arrivalSchedule = (hydrated.arrivalSchedule || []).map((arrival) => ({
      ...arrival,
      template: hydratePatient(arrival.template, catalog)
    }));
    return identityRuntime.hydrateStateIdentityRegistry(hydrated);
  }

  function migrateClinicalActionState(state, catalog) {
    const hydrated = hydrateTierState(state, catalog);
    (hydrated.queue || []).forEach((patient) => freeClinicalFlow.migratePatientActionState(patient));
    (hydrated.arrivalSchedule || []).forEach((arrival) => freeClinicalFlow.migratePatientActionState(arrival.template));
    return compactTierState(hydrated, catalog);
  }

  function assertUniqueIds(items, label) {
    const ids = new Set();
    items.forEach((item, index) => {
      if (!isRecord(item) || typeof item.id !== "string" || !item.id) {
        throw new Error(`${label} ${index} has no stable id`);
      }
      if (ids.has(item.id)) throw new Error(`${label} contains duplicate id ${item.id}`);
      ids.add(item.id);
    });
    return ids;
  }

  function validateLifecycle(item, transitions, initialStatus, label) {
    if (!Array.isArray(item.history) || item.history.length < 1) throw new Error(`${label} history is missing`);
    if (!Array.isArray(item.appliedCommandIds)) throw new Error(`${label} appliedCommandIds is missing`);
    if (new Set(item.appliedCommandIds).size !== item.appliedCommandIds.length) {
      throw new Error(`${label} appliedCommandIds contains duplicates`);
    }
    let current = null;
    let previousAt = -1;
    const historyCommandIds = new Set();
    item.history.forEach((entry, index) => {
      if (!isRecord(entry) || !Number.isInteger(entry.at) || entry.at < 0) {
        throw new Error(`${label} history ${index} is invalid`);
      }
      if (entry.at < previousAt) throw new Error(`${label} history time moves backwards`);
      if (index === 0) {
        if (entry.from !== null || entry.to !== initialStatus) throw new Error(`${label} history does not start at ${initialStatus}`);
      } else {
        if (entry.from !== current) throw new Error(`${label} history has a broken from reference`);
        if (!Array.isArray(transitions[current]) || !transitions[current].includes(entry.to)) {
          throw new Error(`${label} has invalid transition ${current} -> ${entry.to}`);
        }
        if (typeof entry.commandId !== "string" || !entry.commandId) throw new Error(`${label} transition commandId is missing`);
        if (historyCommandIds.has(entry.commandId)) throw new Error(`${label} history commandId is duplicated`);
        historyCommandIds.add(entry.commandId);
      }
      current = entry.to;
      previousAt = entry.at;
    });
    if (item.status !== current) throw new Error(`${label} status does not match history`);
    if (item.createdAt !== undefined && item.history[0].at !== item.createdAt) {
      throw new Error(`${label} createdAt does not match history`);
    }
    if (item.queuedAt !== undefined && item.history[0].at !== item.queuedAt) {
      throw new Error(`${label} queuedAt does not match history`);
    }
    if (item.appliedCommandIds.length !== historyCommandIds.size
      || item.appliedCommandIds.some((id) => !historyCommandIds.has(id))) {
      throw new Error(`${label} appliedCommandIds does not match history`);
    }
  }

  function collectStateReferences(state) {
    const patientIds = new Set();
    const encounterIds = new Set();
    const caseIds = new Set();
    const add = (set, value) => {
      if (value !== undefined && value !== null && String(value)) set.add(String(value));
    };
    const addPatient = (patient) => {
      if (!isRecord(patient)) return;
      const visitId = patient.v2Visit?.visitId || patient.visitId || patient.id;
      add(patientIds, patient.patientId);
      add(patientIds, patient.longitudinalPatientId);
      add(patientIds, patient.persistentPatientId);
      add(patientIds, patient.id);
      if (visitId !== undefined && visitId !== null) add(patientIds, `visit-${visitId}-patient`);
      add(encounterIds, patient.visitId);
      add(encounterIds, patient.v2Visit?.visitId);
      add(caseIds, patient.caseId);
      add(caseIds, patient.diseaseId);
      add(caseIds, patient.v2Visit?.caseId);
      add(patientIds, patient.v2Visit?.patient?.patientId);
      add(patientIds, patient.v2Visit?.patient?.id);
    };
    (state.queue || []).forEach(addPatient);
    (state.arrivalSchedule || []).forEach((arrival) => addPatient(arrival.template));
    (state.caseJournal || []).forEach((entry) => {
      add(patientIds, entry.patientId);
      if (entry.visitId !== undefined && entry.visitId !== null) add(patientIds, `visit-${entry.visitId}-patient`);
      add(encounterIds, entry.encounterId);
      add(encounterIds, entry.visitId);
      add(caseIds, entry.caseId);
    });
    Object.entries(state.longitudinalPatients || {}).forEach(([id, patient]) => {
      add(patientIds, id);
      add(patientIds, patient?.patientId);
      add(caseIds, patient?.caseId);
    });
    (state.appointments || []).forEach((appointment) => {
      add(patientIds, appointment.patientId);
      const visitId = appointment.encounterId || appointment.visitId || appointment.originalVisitId;
      if (visitId !== undefined && visitId !== null) add(patientIds, `visit-${visitId}-patient`);
      add(encounterIds, appointment.encounterId);
      add(encounterIds, appointment.visitId);
      add(encounterIds, appointment.originalVisitId);
      add(caseIds, appointment.caseId);
    });
    return { patientIds, encounterIds, caseIds };
  }

  function validatePatientStateReferences(state, catalog, label) {
    if (state.queue !== undefined && !Array.isArray(state.queue)) throw new Error(`${label} queue must be an array`);
    if (state.arrivalSchedule !== undefined && !Array.isArray(state.arrivalSchedule)) {
      throw new Error(`${label} arrivalSchedule must be an array`);
    }
    if (state.activeId !== undefined && state.activeId !== null
      && !(state.queue || []).some((patient) => patient?.id === state.activeId)) {
      throw new Error(`${label} activeId does not reference a queued patient`);
    }
    hydrateTierState(state, catalog);
  }

  function validateRuntimeObject(result, label) {
    if (!result?.valid) throw new Error(`${label} is invalid: ${(result?.errors || ["unknown error"]).join(", ")}`);
  }

  function validateP3State(state, options = {}) {
    if (!isRecord(state.capabilityState)
      || state.capabilityState.schemaVersion !== 1
      || state.capabilityState.registryId !== CAPABILITY_REGISTRY_ID
      || state.capabilityState.registryVersion !== CAPABILITY_REGISTRY_VERSION
      || !isRecord(state.capabilityState.entries)) {
      throw new Error("Game save capabilityState is invalid or uses a different registry");
    }
    const capabilityRegistry = options.capabilityRegistry || options.catalog?.capabilityRegistry;
    if (capabilityRegistry) {
      validateRuntimeObject(capabilityApi.validateSparseState(capabilityRegistry, state.capabilityState), "Game save capabilityState");
    }
    if (!Array.isArray(state.researchOrders)) throw new Error("Game save researchOrders must be an array");
    if (!Array.isArray(state.referralOrders)) throw new Error("Game save referralOrders must be an array");
    if (!Array.isArray(state.asyncEvents)) throw new Error("Game save asyncEvents must be an array");
    if (!isRecord(state.deviceQueues)) throw new Error("Game save deviceQueues must be an object");

    const researchIds = assertUniqueIds(state.researchOrders, "Research orders");
    const referralIds = assertUniqueIds(state.referralOrders, "Referral orders");
    const eventIds = assertUniqueIds(state.asyncEvents, "Async events");
    validateRuntimeObject(deviceQueueApi.validateDeviceQueueState(state.deviceQueues), "Device queues");

    const references = collectStateReferences(state);
    state.researchOrders.forEach((order) => {
      validateRuntimeObject(researchApi.validateResearchOrder(order), `Research order ${order.id}`);
      validateLifecycle(order, researchApi.TRANSITIONS, "proposed", `Research order ${order.id}`);
      if (!references.patientIds.has(String(order.patientId))) throw new Error(`Research order ${order.id} has dangling patientId`);
      if (order.encounterId !== undefined && !references.encounterIds.has(String(order.encounterId))) {
        throw new Error(`Research order ${order.id} has dangling encounterId`);
      }
      if (order.supersedesOrderId !== undefined && !researchIds.has(order.supersedesOrderId)) {
        throw new Error(`Research order ${order.id} has dangling supersedesOrderId`);
      }
    });
    state.referralOrders.forEach((order) => {
      validateRuntimeObject(referralApi.validateReferralOrder(order), `Referral order ${order.id}`);
      validateLifecycle(order, referralApi.TRANSITIONS, "proposed", `Referral order ${order.id}`);
      if (!references.patientIds.has(String(order.patientId))) throw new Error(`Referral order ${order.id} has dangling patientId`);
      if (order.encounterId !== undefined && !references.encounterIds.has(String(order.encounterId))) {
        throw new Error(`Referral order ${order.id} has dangling encounterId`);
      }
      if (order.supersedesOrderId !== undefined && !referralIds.has(order.supersedesOrderId)) {
        throw new Error(`Referral order ${order.id} has dangling supersedesOrderId`);
      }
      if (["response_received", "reviewed", "communicated", "closed"].includes(order.status)
        && order.response === undefined) {
        throw new Error(`Referral order ${order.id} reached ${order.status} without a response`);
      }
    });

    const asyncTransitions = { scheduled: ["handled", "cancelled"], handled: [], cancelled: [] };
    state.asyncEvents.forEach((event) => {
      validateRuntimeObject(asyncEventApi.validateAsyncEvent(event), `Async event ${event.id}`);
      validateLifecycle(event, asyncTransitions, "scheduled", `Async event ${event.id}`);
      if (event.dueAt < event.createdAt) throw new Error(`Async event ${event.id} is due before it was created`);
      if ((event.sourceType === undefined) !== (event.sourceId === undefined)) {
        throw new Error(`Async event ${event.id} has incomplete source reference`);
      }
      if (["research", "research_order"].includes(event.sourceType) && !researchIds.has(event.sourceId)) {
        throw new Error(`Async event ${event.id} has dangling research source`);
      }
      if (["referral", "referral_order"].includes(event.sourceType) && !referralIds.has(event.sourceId)) {
        throw new Error(`Async event ${event.id} has dangling referral source`);
      }
    });

    const deviceTransitions = {
      queued: ["processing", "cancelled"],
      processing: ["completed", "cancelled"],
      completed: [],
      cancelled: []
    };
    const deviceTaskIds = new Set();
    Object.values(state.deviceQueues.resources).forEach((resource) => {
      resource.tasks.forEach((task) => {
        if (deviceTaskIds.has(task.id)) throw new Error(`Device queues contain duplicate task ${task.id}`);
        deviceTaskIds.add(task.id);
        validateLifecycle(task, deviceTransitions, "queued", `Device task ${task.id}`);
        if (["research", "research_order"].includes(task.orderType) && !researchIds.has(task.orderId)) {
          throw new Error(`Device task ${task.id} has dangling research order`);
        }
        if (["referral", "referral_order"].includes(task.orderType) && !referralIds.has(task.orderId)) {
          throw new Error(`Device task ${task.id} has dangling referral order`);
        }
      });
    });
    state.researchOrders.forEach((order) => {
      if (order.queueTaskId !== undefined && !deviceTaskIds.has(order.queueTaskId)) {
        throw new Error(`Research order ${order.id} has dangling queueTaskId`);
      }
      if (order.asyncEventIds !== undefined) {
        if (!Array.isArray(order.asyncEventIds) || new Set(order.asyncEventIds).size !== order.asyncEventIds.length) {
          throw new Error(`Research order ${order.id} has invalid asyncEventIds`);
        }
        order.asyncEventIds.forEach((id) => {
          if (!eventIds.has(id)) throw new Error(`Research order ${order.id} has dangling async event ${id}`);
        });
      }
    });
    state.referralOrders.forEach((order) => {
      if (order.asyncEventIds !== undefined) {
        if (!Array.isArray(order.asyncEventIds) || new Set(order.asyncEventIds).size !== order.asyncEventIds.length) {
          throw new Error(`Referral order ${order.id} has invalid asyncEventIds`);
        }
        order.asyncEventIds.forEach((id) => {
          if (!eventIds.has(id)) throw new Error(`Referral order ${order.id} has dangling async event ${id}`);
        });
      }
    });
    return state;
  }

  function validateP4State(state, options = {}) {
    const campaignIdentity = requireCampaignIdentity(options);
    const validation = identityApi.validateIdentityRegistry(state.identityRegistry);
    if (!validation.valid) throw new Error(`Game save identityRegistry is invalid: ${validation.errors.join(", ")}`);
    if (state.identityRegistry.campaignIdentity !== campaignIdentity) {
      throw new Error("Game save identityRegistry belongs to a different campaign");
    }
    const validateStateSnapshot = (snapshot, allowedKeys, label) => {
      if (!isRecord(snapshot)) throw new Error(`${label} is missing`);
      Object.entries(snapshot).forEach(([key, score]) => {
        if (!allowedKeys.includes(key) || !Number.isFinite(score) || score < 0 || score > 100) {
          throw new Error(`${label} contains invalid state ${key}`);
        }
      });
    };
    const validateReference = (value, label, sourceIdentityOverride, requiresCurrentSnapshot = false) => {
      if (!isRecord(value)) return;
      const sourceIdentity = identityRuntime.sourceIdentityFor(value, { sourceIdentity: sourceIdentityOverride });
      if (!sourceIdentity) return;
      const ownerId = identityApi.stableIdentityId("owner", campaignIdentity, sourceIdentity);
      const patientId = identityApi.stableIdentityId("patient", campaignIdentity, sourceIdentity);
      const referencedOwnerId = value.persistentOwnerId || value.ownerId;
      const referencedPatientId = value.persistentPatientId || value.patientId;
      if (referencedOwnerId !== ownerId || referencedPatientId !== patientId) {
        throw new Error(`${label} identity references do not match its stable source`);
      }
      if (!state.identityRegistry.owners[ownerId] || !state.identityRegistry.patients[patientId]) {
        throw new Error(`${label} identity references are missing from identityRegistry`);
      }
      validateStateSnapshot(value.ownerStateSnapshot, identityApi.OWNER_STATE_KEYS, `${label} ownerStateSnapshot`);
      validateStateSnapshot(value.patientStateSnapshot, identityApi.ANIMAL_STATE_KEYS, `${label} patientStateSnapshot`);
      if (requiresCurrentSnapshot && JSON.stringify(value.ownerStateSnapshot)
        !== JSON.stringify(state.identityRegistry.owners[ownerId].currentState)) {
        throw new Error(`${label} ownerStateSnapshot is stale`);
      }
      if (requiresCurrentSnapshot && JSON.stringify(value.patientStateSnapshot)
        !== JSON.stringify(state.identityRegistry.patients[patientId].currentState)) {
        throw new Error(`${label} patientStateSnapshot is stale`);
      }
    };
    (state.appointments || []).forEach((item, index) => validateReference(item, `Appointment ${index}`));
    Object.entries(state.longitudinalPatients || {}).forEach(([id, item]) => validateReference(
      item, `Longitudinal patient ${id}`, undefined, true
    ));
    (state.arrivalSchedule || []).forEach((arrival, index) => validateReference(
      arrival.template, `Arrival ${index}`, undefined, true
    ));
    (state.queue || []).forEach((item, index) => validateReference(item, `Queue patient ${index}`, undefined, true));
    const appointmentRoots = new Map((state.appointments || []).map((appointment) => [
      appointment.appointmentId,
      appointment.sourceVisitId || appointment.originalVisitId || null
    ]));
    (state.caseJournal || []).forEach((item, index) => validateReference(
      item,
      `Case journal ${index}`,
      item.identitySourceVisitId || item.sourceVisitId || appointmentRoots.get(item.appointmentId) || item.visitId
    ));
    return state;
  }

  function createSnapshot(mode, state, options = {}) {
    const snapshot = {
      gameStateSaveVersion: saveVersionForMode(mode),
      generatorMode: mode,
      savedAt: new Date().toISOString(),
      state: mode === "tier-01-v2"
        ? addP3Defaults(compactTierState(addP4Defaults(state, options), options.catalog))
        : snapshotState(state)
    };
    if (mode === "tier-01-v2") {
      snapshot.capabilityRegistryId = CAPABILITY_REGISTRY_ID;
      snapshot.capabilityRegistryVersion = CAPABILITY_REGISTRY_VERSION;
    }
    validateSnapshot(snapshot, mode, options);
    return snapshot;
  }

  function validateSnapshot(snapshot, expectedMode, options = {}) {
    if (!snapshot || typeof snapshot !== "object") throw new Error("Game save is not an object");
    const expectedVersion = saveVersionForMode(expectedMode);
    if (snapshot.gameStateSaveVersion !== expectedVersion) {
      throw new Error(`Unsupported game save version: ${snapshot.gameStateSaveVersion ?? "missing"}`);
    }
    if (snapshot.generatorMode !== expectedMode) {
      throw new Error(`Game save mode mismatch: expected ${expectedMode}, got ${snapshot.generatorMode}`);
    }
    if (!snapshot.state || typeof snapshot.state !== "object") throw new Error("Game save state is missing");
    if (expectedMode === "tier-01-v2") {
      if (snapshot.capabilityRegistryId !== CAPABILITY_REGISTRY_ID
        || snapshot.capabilityRegistryVersion !== CAPABILITY_REGISTRY_VERSION) {
        throw new Error("Game save capability registry identity is missing or incompatible");
      }
      const validationState = hydrateTierState(snapshot.state, options.catalog);
      validatePatientStateReferences(validationState, options.catalog, "Game save");
      validateP3State(validationState, options);
      validateP4State(validationState, options);
    }
    return snapshot;
  }

  function validateTierMigrationSource(snapshot, catalog) {
    if (snapshot.generatorMode !== "tier-01-v2") {
      throw new Error(`Game save mode mismatch: expected tier-01-v2, got ${snapshot.generatorMode}`);
    }
    const supportedVersions = [
      ...LEGACY_TIER_01_V2_GAME_STATE_SAVE_VERSIONS,
      PREVIOUS_TIER_01_V2_GAME_STATE_SAVE_VERSION,
      P3_TIER_01_V2_GAME_STATE_SAVE_VERSION
    ];
    if (!supportedVersions.includes(snapshot.gameStateSaveVersion)) {
      throw new Error(`Unsupported game save version: ${snapshot.gameStateSaveVersion ?? "missing"}`);
    }
    if (!catalog) throw new Error(`Tier 01 v2 catalog is required to migrate game save version ${snapshot.gameStateSaveVersion}`);
    if (!isRecord(snapshot.state)) throw new Error("Game save state is missing");
    validatePatientStateReferences(snapshot.state, catalog, "Game migration source");
    if (snapshot.gameStateSaveVersion === P3_TIER_01_V2_GAME_STATE_SAVE_VERSION) {
      validateP3TierSnapshot(snapshot, catalog);
    }
    return snapshot;
  }

  function validateP3TierSnapshot(snapshot, catalog, options = {}) {
    if (snapshot.gameStateSaveVersion !== P3_TIER_01_V2_GAME_STATE_SAVE_VERSION) {
      throw new Error(`Expected P3 game save version ${P3_TIER_01_V2_GAME_STATE_SAVE_VERSION}`);
    }
    if (snapshot.generatorMode !== "tier-01-v2") throw new Error("P3 game save mode mismatch");
    if (snapshot.capabilityRegistryId !== CAPABILITY_REGISTRY_ID
      || snapshot.capabilityRegistryVersion !== CAPABILITY_REGISTRY_VERSION) {
      throw new Error("P3 game save capability registry identity is missing or incompatible");
    }
    validatePatientStateReferences(snapshot.state, catalog, "P3 game save");
    validateP3State(snapshot.state, { ...options, catalog });
    return snapshot;
  }

  function migrateLegacyTierSnapshotToV5(snapshot, catalog) {
    const compactState = snapshot.gameStateSaveVersion === GAME_STATE_SAVE_VERSION
      ? compactTierState(snapshot.state || {}, catalog)
      : clone(snapshot.state || {});
    const campaignState = snapshot.gameStateSaveVersion < 3
      ? addCampaignDefaults(compactState)
      : compactState;
    return {
      gameStateSaveVersion: PREVIOUS_TIER_01_V2_GAME_STATE_SAVE_VERSION,
      generatorMode: "tier-01-v2",
      savedAt: snapshot.savedAt || new Date().toISOString(),
      state: migrateClinicalActionState(addLongitudinalDefaults(campaignState), catalog)
    };
  }

  function migrateTierSnapshotToV6(snapshot, catalog, options = {}) {
    const sourceV5 = snapshot.gameStateSaveVersion === PREVIOUS_TIER_01_V2_GAME_STATE_SAVE_VERSION
      ? clone(snapshot)
      : migrateLegacyTierSnapshotToV5(snapshot, catalog);
    const migrated = {
      ...sourceV5,
      gameStateSaveVersion: P3_TIER_01_V2_GAME_STATE_SAVE_VERSION,
      capabilityRegistryId: CAPABILITY_REGISTRY_ID,
      capabilityRegistryVersion: CAPABILITY_REGISTRY_VERSION,
      state: addP3Defaults(sourceV5.state)
    };
    Object.keys(sourceV5.state).forEach((key) => {
      if (JSON.stringify(migrated.state[key]) !== JSON.stringify(sourceV5.state[key])) {
        throw new Error(`Game v5 migration changed active state field ${key}`);
      }
    });
    validateP3TierSnapshot(migrated, catalog, options);
    return migrated;
  }

  function assertExistingStatePreserved(source, candidate, path = "state") {
    if (Array.isArray(source)) {
      if (!Array.isArray(candidate) || candidate.length !== source.length) {
        throw new Error(`Game v6 migration changed ${path} length`);
      }
      source.forEach((item, index) => assertExistingStatePreserved(item, candidate[index], `${path}[${index}]`));
      return;
    }
    if (isRecord(source)) {
      if (!isRecord(candidate)) throw new Error(`Game v6 migration changed ${path} type`);
      Object.keys(source).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(candidate, key)) {
          throw new Error(`Game v6 migration removed ${path}.${key}`);
        }
        assertExistingStatePreserved(source[key], candidate[key], `${path}.${key}`);
      });
      return;
    }
    if (!Object.is(source, candidate)) throw new Error(`Game v6 migration changed ${path}`);
  }

  function migrateTierSnapshot(snapshot, catalog, options = {}) {
    validateTierMigrationSource(snapshot, catalog);
    const sourceV6 = snapshot.gameStateSaveVersion === P3_TIER_01_V2_GAME_STATE_SAVE_VERSION
      ? clone(snapshot)
      : migrateTierSnapshotToV6(snapshot, catalog, options);
    const hydratedState = hydrateTierState(sourceV6.state, catalog);
    const linkedState = addP4Defaults(hydratedState, options);
    const migrated = {
      ...sourceV6,
      gameStateSaveVersion: TIER_01_V2_GAME_STATE_SAVE_VERSION,
      state: compactTierState(linkedState, catalog)
    };
    assertExistingStatePreserved(sourceV6.state, migrated.state);
    validateSnapshot(migrated, "tier-01-v2", { ...options, catalog });
    return migrated;
  }

  function save(storage, mode, state, options = {}) {
    const snapshot = createSnapshot(mode, state, options);
    storage.setItem(namespaces.gameSaveKey(mode), JSON.stringify(snapshot));
    return snapshot;
  }

  function migrationBackupKeyForVersion(mode, sourceVersion) {
    return atomicSaveMigration.migrationBackupKey(namespaces.gameSaveKey(mode), sourceVersion);
  }

  function load(storage, mode, options = {}) {
    const key = namespaces.gameSaveKey(mode);
    const raw = storage.getItem(key);
    if (raw === null) return null;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Game save JSON is invalid: ${error.message}`);
    }
    let compactSnapshot = parsed;
    if (mode === "tier-01-v2" && [
      ...LEGACY_TIER_01_V2_GAME_STATE_SAVE_VERSIONS,
      PREVIOUS_TIER_01_V2_GAME_STATE_SAVE_VERSION,
      P3_TIER_01_V2_GAME_STATE_SAVE_VERSION
    ].includes(parsed.gameStateSaveVersion)) {
      validateTierMigrationSource(parsed, options.catalog);
      compactSnapshot = atomicSaveMigration.migrate({
        storage,
        primaryKey: key,
        backupKey: migrationBackupKeyForVersion(mode, parsed.gameStateSaveVersion),
        sourceRaw: raw,
        label: "Tier 01 v2 game save migration",
        validateSource: (source) => validateTierMigrationSource(source, options.catalog),
        buildCandidate: (source) => migrateTierSnapshot(source, options.catalog, options),
        validateCandidate: (candidate) => validateSnapshot(candidate, mode, options)
      }).value;
    }
    validateSnapshot(compactSnapshot, mode, options);
    if (mode !== "tier-01-v2" || options.hydrate === false) return compactSnapshot;
    return { ...compactSnapshot, state: hydrateTierState(compactSnapshot.state, options.catalog) };
  }

  function restoreMigrationBackup(storage, mode, sourceVersion, options = {}) {
    const supportedVersions = [
      ...LEGACY_TIER_01_V2_GAME_STATE_SAVE_VERSIONS,
      PREVIOUS_TIER_01_V2_GAME_STATE_SAVE_VERSION,
      P3_TIER_01_V2_GAME_STATE_SAVE_VERSION
    ];
    if (mode !== "tier-01-v2" || !supportedVersions.includes(sourceVersion)) {
      throw new Error(`Unsupported game migration backup: ${mode}/${sourceVersion}`);
    }
    return atomicSaveMigration.restore({
      storage,
      primaryKey: namespaces.gameSaveKey(mode),
      backupKey: migrationBackupKeyForVersion(mode, sourceVersion),
      label: "Tier 01 v2 game save migration rollback",
      validateBackup: (backup) => {
        if (backup.gameStateSaveVersion !== sourceVersion) {
          throw new Error(`Game migration backup version mismatch: expected ${sourceVersion}, got ${backup.gameStateSaveVersion ?? "missing"}`);
        }
        validateTierMigrationSource(backup, options.catalog);
      }
    });
  }

  function clear(storage, mode) {
    storage.removeItem(namespaces.gameSaveKey(mode));
  }

  return {
    GAME_STATE_SAVE_VERSION,
    LEGACY_TIER_01_V2_GAME_STATE_SAVE_VERSIONS,
    PREVIOUS_TIER_01_V2_GAME_STATE_SAVE_VERSION,
    P3_TIER_01_V2_GAME_STATE_SAVE_VERSION,
    TIER_01_V2_GAME_STATE_SAVE_VERSION,
    CAPABILITY_REGISTRY_ID,
    CAPABILITY_REGISTRY_VERSION,
    RESEARCH_ORDER_STATUSES: researchApi.STATUSES,
    REFERRAL_ORDER_STATUSES: referralApi.STATUSES,
    ASYNC_EVENT_STATUSES: asyncEventApi.STATUSES,
    DEVICE_TASK_STATUSES: deviceQueueApi.TASK_STATUSES,
    SERIALIZED_FIELDS,
    TIER_01_V2_SERIALIZED_FIELDS,
    saveVersionForMode,
    compactPatient,
    compactTierState,
    campaignDefaults,
    addCampaignDefaults,
    addLongitudinalDefaults,
    addP3Defaults,
    addP4Defaults,
    hydratePatient,
    hydrateTierState,
    createSnapshot,
    validateSnapshot,
    validateP3State,
    validateP4State,
    validateTierMigrationSource,
    migrateTierSnapshotToV6,
    migrateTierSnapshot,
    migrationBackupKeyForVersion,
    restoreMigrationBackup,
    save,
    load,
    clear
  };
});
