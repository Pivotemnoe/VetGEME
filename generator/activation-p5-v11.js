(function (root, factory) {
  "use strict";

  const supportLoader = typeof module === "object" && module.exports
    ? require("./content-loader-v2.js")
    : root.PET_CLINIC_CONTENT_V2;
  const lifecycleApi = typeof module === "object" && module.exports
    ? require("../systems/resource-lifecycle-v5.js")
    : root.PET_CLINIC_RESOURCE_LIFECYCLE_V5;
  const schedulerApi = typeof module === "object" && module.exports
    ? require("../systems/resource-scheduler-v5.js")
    : root.PET_CLINIC_RESOURCE_SCHEDULER_V5;
  const operationsFactory = typeof module === "object" && module.exports
    ? require("../systems/operations-runtime-v5.js")
    : root.PET_CLINIC_OPERATIONS_RUNTIME_V5;
  const api = factory(root, supportLoader, lifecycleApi, schedulerApi, operationsFactory);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_ACTIVATION_P5_V11 = api;
})(typeof window !== "undefined" ? window : globalThis, function (
  root,
  supportLoader,
  lifecycleApi,
  schedulerApi,
  operationsFactory
) {
  "use strict";

  const ACTIVATION_ROOT = "content/activation-packs/pet-clinic-local-2026.07.17.1";
  const P5_ROOT = `${ACTIVATION_ROOT}/p5-source`;
  const CORRECTION_PATH = `${ACTIVATION_ROOT}/corrections/P5_ROOM_RESERVATION_CORRECTIONS.json`;
  const P5_MANIFEST_SHA256 = "25730b20dcc3d0ac840082f353ccea14d11c35aa9c107bf2cb52ccd21e3e69c6";
  const ROOM_CORRECTION_SHA256 = "f383e503a9b7b07726b1d3edda8bacd8b506a6102ea29ac307d0bfb181ebb87c";
  const RUNTIME_HORIZON = Object.freeze({ startAt: 0, endAt: 31 * 1440 });
  const FILE_HASHES = Object.freeze({
    [`${P5_ROOT}/MANIFEST.json`]: P5_MANIFEST_SHA256,
    [`${P5_ROOT}/generated/capability-operations-map.json`]: "9ffeba51794180f10645b52a3410e0bcdb31afb737526cfc18e07f5e3e0eb129",
    [`${P5_ROOT}/generated/investigation-usage-task-map.json`]: "7b38c7246c99ff4dcef88237b6f0e4bce0c760a0a852198214036fe3332005a7",
    [`${P5_ROOT}/generated/operational-policies.json`]: "1610ae1941d9d108b22fa81fc61b4800d32104641f9ebdb0e53e8bba7f2fc09d",
    [`${P5_ROOT}/generated/recommended-30-day-staffing.json`]: "199b4f15f34e9b7061a0ae02970860d145f42e00f40ea48b8aef762969bfbfa9",
    [`${P5_ROOT}/generated/research-task-catalog.json`]: "f79c0e909da5128e44b49bd6822df5ca2d92a5bda42e27dc90226a9025730270",
    [`${P5_ROOT}/generated/resource-catalog.json`]: "67503f3c3c8257a5a5765abe85319fd343f82e7a3e3c36198a6d9a26f534f34b",
    [`${P5_ROOT}/generated/resource-lifecycle-catalog.json`]: "62b49f14ddb213157c6a59879d33aa3fd65500078c05f3fdbc3b3ab4c491cbc6",
    [`${P5_ROOT}/generated/visit-task-catalog.json`]: "fab15fa36a2a87c0a02a6cf9ceb38d0869f9dea2c07407e48c615378f400d1d4",
    [`${P5_ROOT}/p6-source/p6-p5-exact-resource-crosswalk.json`]: "61a44ff5096c2077635e26b9785a7cbeea0a525b4d6e0f9d395bc12d9f837598",
    [`${P5_ROOT}/source/p5-handoff-contract.json`]: "8c82819147f2a93b1d53f0586fb60462b2ca0cb687162af455bcc781b2a73679",
    [CORRECTION_PATH]: ROOM_CORRECTION_SHA256
  });
  const TASK_BEARING_MODES = Object.freeze(new Set([
    "schedulable_task", "external_coordination", "explicit_alternative_resolution"
  ]));
  const operationsRuntime = operationsFactory?.createOperationsRuntime?.(schedulerApi);

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function assert(condition, message) {
    if (!condition) throw new Error(`Pet Clinic P5 activation rejected input: ${message}`);
  }

  function safeRelativePath(value) {
    return typeof value === "string"
      && value.length > 0
      && !value.startsWith("/")
      && !value.includes("\\")
      && value.split("/").every((part) => part && part !== "." && part !== "..");
  }

  async function sha256Hex(bytes) {
    if (supportLoader?.medicalCatalogApi?.sha256Hex) {
      return supportLoader.medicalCatalogApi.sha256Hex(bytes);
    }
    const cryptoApi = root?.crypto || globalThis.crypto;
    assert(cryptoApi?.subtle, "SHA-256 implementation is unavailable");
    const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
  }

  function createReader(loadBytes) {
    const cache = new Map();
    return async function read(relativePath) {
      assert(safeRelativePath(relativePath), `unsafe source path ${relativePath}`);
      if (!cache.has(relativePath)) {
        cache.set(relativePath, Promise.resolve(loadBytes(relativePath)).then(async (raw) => {
          const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
          const sha256 = await sha256Hex(bytes);
          assert(FILE_HASHES[relativePath] === sha256, `${relativePath}: SHA-256 mismatch`);
          let value;
          try { value = JSON.parse(new TextDecoder().decode(bytes)); }
          catch (error) { throw new Error(`${relativePath}: invalid JSON (${error.message})`); }
          return { bytes, sha256, value };
        }));
      }
      return cache.get(relativePath);
    };
  }

  function uniqueMap(records, key, label) {
    const map = new Map();
    assert(Array.isArray(records), `${label} must be an array`);
    records.forEach((record) => {
      const id = typeof key === "function" ? key(record) : record[key];
      assert(typeof id === "string" && id, `${label} contains a record without an ID`);
      assert(!map.has(id), `${label} contains duplicate ${id}`);
      map.set(id, record);
    });
    return map;
  }

  function canonicalGroups(groups) {
    return clone(groups).sort((left, right) => left.id.localeCompare(right.id, "en"));
  }

  function localRadiographyGroups() {
    return canonicalGroups([
      {
        id: "staff",
        anyOf: [{
          resourceId: "staff.imaging.zhukova",
          capabilityId: "trained_radiography",
          units: 1
        }]
      },
      {
        id: "room",
        anyOf: [{
          resourceId: "room.imaging.1",
          capabilityId: "imaging_room",
          units: 1
        }]
      },
      {
        id: "equipment.xray_system",
        anyOf: [{
          resourceId: "equipment.xray_system",
          capabilityId: "xray_system",
          units: 1
        }]
      }
    ]);
  }

  function gdvPhaseGroups(baseGroups, phase) {
    const shared = clone(baseGroups).filter((group) => group.id !== "room");
    shared.push(phase === "procedure"
      ? {
          id: "room",
          anyOf: [{ resourceId: "room.procedure.1", capabilityId: "procedure_room", units: 1 }]
        }
      : {
          id: "room",
          anyOf: [{ resourceId: "room.short_stay.1", capabilityId: "short_stay", units: 1 }]
        });
    return canonicalGroups(shared);
  }

  function templateRecord(kind, sourceId, runtimeTemplate, extra = {}) {
    return {
      key: `${kind}:${sourceId}`,
      kind,
      sourceId,
      runtimeTemplate: clone(runtimeTemplate),
      correctionId: null,
      executionPlan: null,
      ...clone(extra)
    };
  }

  function buildTemplates(documents, correction) {
    const researchById = uniqueMap(documents.researchTasks.researchTasks, "researchId", "P5 research tasks");
    const usageById = uniqueMap(documents.usageTasks.usageTasks, "usageId", "P5 usage tasks");
    const capabilityRecords = [
      ...documents.capabilityTasks.capabilities,
      ...documents.capabilityTasks.supplementalCapabilities
    ];
    const records = [];
    documents.visitTasks.tasks.forEach((item) => records.push(templateRecord(
      "visit", item.taskTemplateId, item.runtimeTemplate
    )));
    documents.researchTasks.researchTasks.forEach((item) => records.push(templateRecord(
      "research", item.researchId, item.runtimeTemplate, { researchId: item.researchId }
    )));
    documents.usageTasks.usageTasks.forEach((item) => {
      const base = researchById.get(item.researchId);
      assert(base, `${item.usageId}: missing research task`);
      records.push(templateRecord("usage", item.usageId, {
        ...clone(base.runtimeTemplate),
        ...clone(item.runtimeOverrides)
      }, {
        researchId: item.researchId,
        usageId: item.usageId,
        handoffPolicyId: item.handoffPolicyId
      }));
    });
    capabilityRecords.filter((item) => TASK_BEARING_MODES.has(item.executionMode)).forEach((item) => {
      records.push(templateRecord("capability", item.capabilityId, {
        priority: 200,
        authoredDurationMinutes: item.durationMinutes,
        requirementGroups: item.requirementGroups,
        urgency: "routine",
        safeRouteRequired: false
      }, { capabilityId: item.capabilityId }));
    });
    assert(records.length === 2606, `expected 2606 task templates, got ${records.length}`);

    const correctionById = uniqueMap(correction.corrections, "correctionId", "room corrections");
    const gdvCorrection = correctionById.get("gdv_postoperative_ordered_room_handoff");
    const pancreatitisCorrection = correctionById.get("pancreatitis_radiography_local_or_referral");
    const pyometraCorrection = correctionById.get("pyometra_radiography_local_or_referral");
    assert(gdvCorrection && pancreatitisCorrection && pyometraCorrection, "the exact three correction records are required");
    const xrayUsageIds = new Set([
      ...pancreatitisCorrection.appliesTo.usageIds,
      ...pyometraCorrection.appliesTo.usageIds
    ]);
    const xrayResearchIds = new Set([
      ...pancreatitisCorrection.appliesTo.researchIds,
      ...pyometraCorrection.appliesTo.researchIds
    ]);

    let fixedTemplates = 0;
    records.forEach((record) => {
      const isGdv = record.researchId === gdvCorrection.appliesTo.researchIds[0]
        || record.capabilityId === gdvCorrection.appliesTo.capabilityIds[0];
      if (isGdv) {
        const firstMinutes = Math.floor(record.runtimeTemplate.authoredDurationMinutes / 2);
        const secondMinutes = record.runtimeTemplate.authoredDurationMinutes - firstMinutes;
        assert(firstMinutes > 0 && secondMinutes > 0, `${record.key}: GDV phase duration is invalid`);
        record.correctionId = gdvCorrection.correctionId;
        record.executionPlan = {
          type: "atomic_sequential_rooms",
          totalAuthoredDurationMinutes: record.runtimeTemplate.authoredDurationMinutes,
          breakpointAuthority: "p5_handoff_policy_midpoint",
          phases: [
            {
              id: "procedure_and_initial_stabilization",
              authoredDurationMinutes: firstMinutes,
              requirementGroups: gdvPhaseGroups(record.runtimeTemplate.requirementGroups, "procedure")
            },
            {
              id: "short_stay_monitoring",
              authoredDurationMinutes: secondMinutes,
              requirementGroups: gdvPhaseGroups(record.runtimeTemplate.requirementGroups, "short_stay")
            }
          ],
          safeReferral: { localReservations: false }
        };
        fixedTemplates += 1;
        return;
      }
      if (xrayResearchIds.has(record.researchId) || xrayUsageIds.has(record.usageId)) {
        record.correctionId = record.researchId === "pancreatitis_radiography_for_differentials"
          ? pancreatitisCorrection.correctionId
          : pyometraCorrection.correctionId;
        record.executionPlan = {
          type: "local_or_referral",
          local: {
            requirementGroups: localRadiographyGroups(),
            trainedImagingSourceAlias: "trained_imaging",
            exactP5CapabilityId: "trained_radiography"
          },
          referral: { localReservations: false, requirementGroups: [] }
        };
        fixedTemplates += 1;
      }
    });
    assert(fixedTemplates === 10, `expected 10 corrected templates, got ${fixedTemplates}`);

    const byKey = uniqueMap(records, "key", "P5 task templates");
    return {
      records,
      byKey,
      researchById,
      usageById,
      audit: {
        taskTemplates: records.length,
        preOverlayAffectedTemplates: 10,
        preOverlayPredicateGaps: 15,
        fixedTemplates,
        affectedTemplates: 0,
        predicateGaps: 0,
        approximateMatches: 0
      }
    };
  }

  function schedulerSlice(state) {
    return {
      schemaVersion: state.schemaVersion,
      resources: clone(state.resources),
      tasks: clone(state.tasks),
      reservations: clone(state.reservations),
      appliedCommandIds: clone(state.appliedCommandIds),
      commandFingerprints: clone(state.commandFingerprints || {})
    };
  }

  function operationsFromScheduler(state, previousHandoffs = []) {
    return operationsRuntime.createState({ ...clone(state), handoffs: clone(previousHandoffs) });
  }

  function stableIdentifier(value, fallback) {
    const normalized = String(value || "").replace(/[^A-Za-z0-9._:-]/gu, "-").replace(/-+/gu, "-");
    return /^[A-Za-z0-9]/u.test(normalized) ? normalized : fallback;
  }

  function taskInput(record, taskId, at, fatigue, identifiers, phase) {
    const template = phase || record.runtimeTemplate;
    const sourceType = record.kind === "usage" ? "research_usage" : record.kind;
    return {
      id: stableIdentifier(taskId, "p5-task"),
      queuedAt: at,
      priority: record.runtimeTemplate.priority,
      authoredDurationMinutes: template.authoredDurationMinutes,
      fatigue: clone(fatigue),
      requirementGroups: clone(template.requirementGroups),
      urgency: record.runtimeTemplate.urgency,
      safeRouteRequired: Boolean(record.runtimeTemplate.safeRouteRequired || record.correctionId),
      sourceType: stableIdentifier(sourceType, "p5"),
      sourceId: stableIdentifier(record.sourceId, "p5-source"),
      patientId: stableIdentifier(identifiers.patientId, "patient-p5"),
      ownerId: stableIdentifier(identifiers.ownerId, "owner-p5")
    };
  }

  function scheduleOne(operationsState, record, commandRoot, at, fatigue, identifiers, templateOverride) {
    const base = schedulerSlice(operationsState);
    const enqueue = schedulerApi.enqueueTask(base, {
      commandId: `${commandRoot}:enqueue`,
      task: taskInput(record, commandRoot, at, fatigue, identifiers, templateOverride)
    });
    const scheduled = schedulerApi.scheduleTask(enqueue.state, {
      commandId: `${commandRoot}:schedule`,
      at
    });
    if (scheduled.reasonCode !== "scheduled" || scheduled.task.id !== commandRoot) {
      return { scheduled: false, reasonCode: scheduled.reasonCode, state: clone(operationsState) };
    }
    return {
      scheduled: true,
      reasonCode: "scheduled",
      state: operationsFromScheduler(scheduled.state, operationsState.handoffs),
      tasks: [scheduled.task],
      reservations: scheduled.reservations
    };
  }

  function scheduleSequential(operationsState, record, commandRoot, at, fatigue, identifiers) {
    const phases = record.executionPlan.phases;
    let temporary = schedulerSlice(operationsState);
    const tasks = [];
    const reservations = [];
    let phaseAt = at;
    for (const phase of phases) {
      const phaseTaskId = `${commandRoot}:${phase.id}`;
      const enqueue = schedulerApi.enqueueTask(temporary, {
        commandId: `${phaseTaskId}:enqueue`,
        task: taskInput(record, phaseTaskId, phaseAt, fatigue, identifiers, phase)
      });
      const scheduled = schedulerApi.scheduleTask(enqueue.state, {
        commandId: `${phaseTaskId}:schedule`,
        at: phaseAt
      });
      if (scheduled.reasonCode !== "scheduled" || scheduled.task.id !== phaseTaskId
        || scheduled.task.startAt !== phaseAt) {
        return { scheduled: false, reasonCode: scheduled.reasonCode, state: clone(operationsState) };
      }
      temporary = scheduled.state;
      tasks.push(scheduled.task);
      reservations.push(...scheduled.reservations);
      phaseAt = scheduled.task.endAt;
    }
    const procedureRoom = reservations.find((item) => item.taskId.endsWith("procedure_and_initial_stabilization")
      && item.groupId === "room");
    const shortStayRoom = reservations.find((item) => item.taskId.endsWith("short_stay_monitoring")
      && item.groupId === "room");
    assert(procedureRoom?.resourceId === "room.procedure.1", "GDV procedure room was not reserved");
    assert(shortStayRoom?.resourceId === "room.short_stay.1", "GDV short-stay room was not reserved");
    assert(procedureRoom.endAt === shortStayRoom.startAt, "GDV room sequence has a gap or overlap");
    return {
      scheduled: true,
      reasonCode: "scheduled_atomic_room_sequence",
      state: operationsFromScheduler(temporary, operationsState.handoffs),
      tasks,
      reservations,
      handoffAt: procedureRoom.endAt
    };
  }

  function completeTasks(operationsState, tasks, commandRoot) {
    let temporary = schedulerSlice(operationsState);
    [...tasks].sort((left, right) => left.endAt - right.endAt).forEach((task) => {
      const completed = schedulerApi.completeTask(temporary, {
        commandId: `${commandRoot}:${task.id}:complete`,
        taskId: task.id,
        at: task.endAt
      });
      temporary = completed.state;
    });
    return operationsFromScheduler(temporary, operationsState.handoffs);
  }

  async function loadFromReader(loadBytes) {
    assert(lifecycleApi?.createResourceLifecycleRuntime, "resource lifecycle runtime is unavailable");
    assert(schedulerApi?.createState && operationsRuntime, "resource scheduler runtime is unavailable");
    const read = createReader(loadBytes);
    const paths = Object.keys(FILE_HASHES);
    const loaded = await Promise.all(paths.map(async (path) => [path, await read(path)]));
    const documents = Object.fromEntries(loaded.map(([path, document]) => [path, document.value]));
    const manifest = documents[`${P5_ROOT}/MANIFEST.json`];
    const correction = documents[CORRECTION_PATH];
    const resourceCatalog = documents[`${P5_ROOT}/generated/resource-catalog.json`];
    const lifecycleCatalog = documents[`${P5_ROOT}/generated/resource-lifecycle-catalog.json`];
    const operationalPolicies = documents[`${P5_ROOT}/generated/operational-policies.json`];
    const resourceCrosswalk = documents[`${P5_ROOT}/p6-source/p6-p5-exact-resource-crosswalk.json`];
    const handoffContract = documents[`${P5_ROOT}/source/p5-handoff-contract.json`];
    assert(manifest.packageId === "vetgeme-p5-production-authoring" && manifest.packageVersion === "2026.07.16.2",
      "P5 package identity mismatch");
    assert(manifest.runtimeEligible === false, "immutable P5 source must remain review-only");
    assert(correction.overlayId === "pet-clinic-p5-room-reservation-corrections-2026.07.17.1",
      "room correction overlay identity mismatch");
    assert(correction.replaceImmutableSource === false, "room corrections cannot replace immutable P5 source");
    assert(JSON.stringify(handoffContract.reassignmentFields)
      === JSON.stringify(["groupId", "fromResourceId", "toResourceId", "capabilityId", "units"]),
    "P5 handoff reassignment contract changed");
    assert(handoffContract.medicalPayloadForbidden === true, "P5 handoff must forbid medical payloads");
    assert(resourceCatalog.resources.length === 49, "P5 resource count must be 49");
    assert(lifecycleCatalog.commands.length === 13, "P5 lifecycle command count must be 13");
    assert(lifecycleCatalog.roomAssets.length === 12, "P5 room count must be 12");
    const exactCapabilities = documents[`${P5_ROOT}/generated/capability-operations-map.json`];
    assert(exactCapabilities.capabilities.length === 447 && exactCapabilities.supplementalCapabilities.length === 8,
      "P5 exact capability map must contain 447 + 8 entries");
    assert(resourceCrosswalk.catalogId === "vetgeme-p6-p5-exact-resource-crosswalk"
      && resourceCrosswalk.catalogVersion === "2026.07.16.2"
      && resourceCrosswalk.runtimeEligible === false,
    "immutable P5/P6 exact crosswalk identity mismatch");

    const sourceDocuments = {
      researchTasks: documents[`${P5_ROOT}/generated/research-task-catalog.json`],
      usageTasks: documents[`${P5_ROOT}/generated/investigation-usage-task-map.json`],
      visitTasks: documents[`${P5_ROOT}/generated/visit-task-catalog.json`],
      capabilityTasks: exactCapabilities
    };
    const templates = buildTemplates(sourceDocuments, correction);
    assert(templates.audit.affectedTemplates === correction.expectedPostOverlayAudit.affectedTemplates,
      "post-overlay affected-template audit mismatch");
    assert(templates.audit.predicateGaps === correction.expectedPostOverlayAudit.predicateGaps,
      "post-overlay reservation-predicate audit mismatch");
    const lifecycle = lifecycleApi.createResourceLifecycleRuntime({
      resourceCatalog,
      lifecycleCatalog,
      operationalPolicies,
      resourceCrosswalk
    });

    function exactRecord(researchId, usageId) {
      if (usageId) {
        const record = templates.byKey.get(`usage:${usageId}`);
        assert(record && record.researchId === researchId, `${usageId}: exact research/usage join mismatch`);
        return record;
      }
      const record = templates.byKey.get(`research:${researchId}`);
      assert(record, `unknown P5 research task ${researchId}`);
      return record;
    }

    function reconcileOperationsState(lifecycleState, operationsState, horizon = RUNTIME_HORIZON) {
      const normalizedLifecycle = lifecycle.normalizeState(lifecycleState);
      const hasAuthority = operationsState && Object.keys(operationsState.resources || {}).length === 49;
      const authority = hasAuthority ? {
        schedulerState: schedulerSlice(operationsState),
        absenceWindows: []
      } : undefined;
      const resources = lifecycle.projectSchedulerResources(normalizedLifecycle, horizon, authority);
      if (!hasAuthority) {
        return operationsFromScheduler(schedulerApi.createState(resources), []);
      }
      const replaced = schedulerApi.normalizeState({
        ...schedulerSlice(operationsState),
        resources: Object.fromEntries(resources.map((resource) => [resource.id, resource]))
      });
      return operationsFromScheduler(replaced, operationsState.handoffs);
    }

    function scheduleResearch(input) {
      const record = exactRecord(input.researchId, input.usageId);
      const commandRoot = stableIdentifier(input.taskId, "p5-research-task");
      if (record.executionPlan?.type === "local_or_referral" && input.branch === "referral") {
        return {
          scheduled: true,
          reasonCode: "safe_referral_without_local_reservation",
          state: clone(input.operationsState),
          tasks: [],
          reservations: []
        };
      }
      if (record.executionPlan?.type === "local_or_referral") {
        const localTemplate = {
          authoredDurationMinutes: record.runtimeTemplate.authoredDurationMinutes,
          requirementGroups: record.executionPlan.local.requirementGroups
        };
        return scheduleOne(
          input.operationsState, record, commandRoot, input.at, input.fatigue,
          input.identifiers, localTemplate
        );
      }
      if (record.executionPlan?.type === "atomic_sequential_rooms") {
        return scheduleSequential(
          input.operationsState, record, commandRoot, input.at, input.fatigue, input.identifiers
        );
      }
      return scheduleOne(
        input.operationsState, record, commandRoot, input.at, input.fatigue, input.identifiers
      );
    }

    function fatigueFor(percent) {
      assert(Number.isFinite(percent) && percent >= 0 && percent <= 100, "fatigue must be between 0 and 100");
      const band = operationalPolicies.fatigueBands.find((item) => percent >= item.minimum && percent <= item.maximum);
      assert(band, `no P5 fatigue band for ${percent}`);
      return { percent: Math.round(percent), durationMultiplier: band.durationMultiplier };
    }

    return Object.freeze({
      version: "pet-clinic-p5-live-adapter-v11@2026.07.17.1",
      sourceVersion: "2026.07.16.2",
      manifestSha256: P5_MANIFEST_SHA256,
      correctionSha256: ROOM_CORRECTION_SHA256,
      audit: Object.freeze(clone(templates.audit)),
      documents: Object.freeze({
        resourceCatalog,
        lifecycleCatalog,
        operationalPolicies,
        resourceCrosswalk,
        handoffContract,
        researchTasks: sourceDocuments.researchTasks,
        usageTasks: sourceDocuments.usageTasks,
        recommendedStaffing: documents[`${P5_ROOT}/generated/recommended-30-day-staffing.json`]
      }),
      lifecycle,
      createLifecycleState: lifecycle.createState,
      reconcileOperationsState,
      resolveResearchTask(researchId, usageId) { return clone(exactRecord(researchId, usageId)); },
      resolveVisitTask(taskTemplateId) {
        const record = templates.byKey.get(`visit:${taskTemplateId}`);
        assert(record, `unknown P5 visit task ${taskTemplateId}`);
        return clone(record);
      },
      resolveCapabilityTask(capabilityId) {
        const record = templates.byKey.get(`capability:${capabilityId}`);
        assert(record, `unknown schedulable P5 capability ${capabilityId}`);
        return clone(record);
      },
      fatigueFor,
      scheduleResearch,
      completeTasks
    });
  }

  async function loadFromFetch(fetchImpl = fetch) {
    return loadFromReader(async (relativePath) => {
      const response = await fetchImpl(relativePath);
      assert(response.ok, `${relativePath}: HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    });
  }

  async function loadFromDirectory(projectRoot) {
    assert(typeof require === "function", "directory loading is available only in Node.js");
    const fs = require("node:fs/promises");
    const path = require("node:path");
    const rootPath = path.resolve(projectRoot);
    return loadFromReader(async (relativePath) => {
      const resolved = path.resolve(rootPath, relativePath);
      const relative = path.relative(rootPath, resolved);
      assert(relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
        `${relativePath}: path escapes project root`);
      return fs.readFile(resolved);
    });
  }

  function applyCatalog(bundle, catalog) {
    return {
      ...catalog,
      p5Activation: bundle
    };
  }

  return Object.freeze({
    ACTIVATION_ROOT,
    P5_ROOT,
    CORRECTION_PATH,
    P5_MANIFEST_SHA256,
    ROOM_CORRECTION_SHA256,
    FILE_HASHES,
    RUNTIME_HORIZON,
    loadFromReader,
    loadFromFetch,
    loadFromDirectory,
    applyCatalog
  });
});
