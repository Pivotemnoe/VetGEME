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
  const api = factory(namespaces, compactApi, freeClinicalFlow);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_GAME_STATE_SAVE = api;
})(typeof window !== "undefined" ? window : globalThis, function (namespaces, compactApi, freeClinicalFlow) {
  "use strict";

  const GAME_STATE_SAVE_VERSION = 1;
  const LEGACY_TIER_01_V2_GAME_STATE_SAVE_VERSIONS = Object.freeze([1, 2]);
  const PREVIOUS_TIER_01_V2_GAME_STATE_SAVE_VERSION = 3;
  const TIER_01_V2_GAME_STATE_SAVE_VERSION = 4;
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
    "equipmentCapabilities", "demandState", "campaignOutcome"
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
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
    return compact;
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
    return hydrated;
  }

  function migrateClinicalActionState(state, catalog) {
    const hydrated = hydrateTierState(state, catalog);
    (hydrated.queue || []).forEach((patient) => freeClinicalFlow.migratePatientActionState(patient));
    (hydrated.arrivalSchedule || []).forEach((arrival) => freeClinicalFlow.migratePatientActionState(arrival.template));
    return compactTierState(hydrated, catalog);
  }

  function createSnapshot(mode, state, options = {}) {
    return {
      gameStateSaveVersion: saveVersionForMode(mode),
      generatorMode: mode,
      savedAt: new Date().toISOString(),
      state: mode === "tier-01-v2" ? compactTierState(state, options.catalog) : snapshotState(state)
    };
  }

  function validateSnapshot(snapshot, expectedMode) {
    if (!snapshot || typeof snapshot !== "object") throw new Error("Game save is not an object");
    const expectedVersion = saveVersionForMode(expectedMode);
    if (snapshot.gameStateSaveVersion !== expectedVersion) {
      throw new Error(`Unsupported game save version: ${snapshot.gameStateSaveVersion ?? "missing"}`);
    }
    if (snapshot.generatorMode !== expectedMode) {
      throw new Error(`Game save mode mismatch: expected ${expectedMode}, got ${snapshot.generatorMode}`);
    }
    if (!snapshot.state || typeof snapshot.state !== "object") throw new Error("Game save state is missing");
    return snapshot;
  }

  function migrateTierSnapshot(snapshot, catalog) {
    if (snapshot.generatorMode !== "tier-01-v2") {
      throw new Error(`Game save mode mismatch: expected tier-01-v2, got ${snapshot.generatorMode}`);
    }
    const supportedVersions = [...LEGACY_TIER_01_V2_GAME_STATE_SAVE_VERSIONS, PREVIOUS_TIER_01_V2_GAME_STATE_SAVE_VERSION];
    if (!supportedVersions.includes(snapshot.gameStateSaveVersion)) {
      throw new Error(`Unsupported game save version: ${snapshot.gameStateSaveVersion ?? "missing"}`);
    }
    if (!catalog) throw new Error(`Tier 01 v2 catalog is required to migrate game save version ${snapshot.gameStateSaveVersion}`);
    const compactState = snapshot.gameStateSaveVersion === GAME_STATE_SAVE_VERSION
      ? compactTierState(snapshot.state || {}, catalog)
      : clone(snapshot.state || {});
    const campaignState = snapshot.gameStateSaveVersion < PREVIOUS_TIER_01_V2_GAME_STATE_SAVE_VERSION
      ? addCampaignDefaults(compactState)
      : compactState;
    const migrated = {
      gameStateSaveVersion: TIER_01_V2_GAME_STATE_SAVE_VERSION,
      generatorMode: "tier-01-v2",
      savedAt: snapshot.savedAt || new Date().toISOString(),
      state: migrateClinicalActionState(campaignState, catalog)
    };
    validateSnapshot(migrated, "tier-01-v2");
    hydrateTierState(migrated.state, catalog);
    return migrated;
  }

  function save(storage, mode, state, options = {}) {
    const snapshot = createSnapshot(mode, state, options);
    storage.setItem(namespaces.gameSaveKey(mode), JSON.stringify(snapshot));
    return snapshot;
  }

  function load(storage, mode, options = {}) {
    const key = namespaces.gameSaveKey(mode);
    const raw = storage.getItem(key);
    if (!raw) return null;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Game save JSON is invalid: ${error.message}`);
    }
    let compactSnapshot = parsed;
    if (mode === "tier-01-v2" && [
      ...LEGACY_TIER_01_V2_GAME_STATE_SAVE_VERSIONS,
      PREVIOUS_TIER_01_V2_GAME_STATE_SAVE_VERSION
    ].includes(parsed.gameStateSaveVersion)) {
      compactSnapshot = migrateTierSnapshot(parsed, options.catalog);
      storage.setItem(key, JSON.stringify(compactSnapshot));
    }
    validateSnapshot(compactSnapshot, mode);
    if (mode !== "tier-01-v2" || options.hydrate === false) return compactSnapshot;
    return { ...compactSnapshot, state: hydrateTierState(compactSnapshot.state, options.catalog) };
  }

  function clear(storage, mode) {
    storage.removeItem(namespaces.gameSaveKey(mode));
  }

  return {
    GAME_STATE_SAVE_VERSION,
    LEGACY_TIER_01_V2_GAME_STATE_SAVE_VERSIONS,
    PREVIOUS_TIER_01_V2_GAME_STATE_SAVE_VERSION,
    TIER_01_V2_GAME_STATE_SAVE_VERSION,
    SERIALIZED_FIELDS,
    TIER_01_V2_SERIALIZED_FIELDS,
    saveVersionForMode,
    compactPatient,
    compactTierState,
    campaignDefaults,
    addCampaignDefaults,
    hydratePatient,
    hydrateTierState,
    createSnapshot,
    validateSnapshot,
    migrateTierSnapshot,
    save,
    load,
    clear
  };
});
