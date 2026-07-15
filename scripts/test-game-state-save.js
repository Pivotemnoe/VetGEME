"use strict";

const assert = require("node:assert/strict");
const saveApi = require("../generator/game-state-save.js");
const namespaces = require("../generator/save-namespaces.js");
const researchApi = require("../systems/research-orders-v3.js");
const referralApi = require("../systems/referral-orders-v3.js");
const asyncEventApi = require("../systems/async-events-v3.js");
const deviceQueueApi = require("../systems/device-queue-v3.js");
const schedulerApi = require("../systems/resource-scheduler-v5.js");
const CAMPAIGN_IDENTITY = "clinic-v2-game-save-test";

function tierOptions(options = {}) {
  return { ...options, campaignIdentity: CAMPAIGN_IDENTITY };
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  const api = {
    setCalls: [],
    failSet: null,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      api.setCalls.push({ key, value: String(value) });
      if (api.failSet?.(key, String(value))) {
        const error = new Error(`quota:${key}`);
        error.name = "QuotaExceededError";
        throw error;
      }
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
    resetCalls() { api.setCalls.length = 0; }
  };
  return api;
}

function transitionResearch(order, to, at, payload = {}) {
  return researchApi.applyResearchTransition(order, {
    commandId: `research-${to}-${at}`,
    to,
    at,
    payload
  }).order;
}

function transitionReferral(order, to, at, payload = {}) {
  return referralApi.applyReferralTransition(order, {
    commandId: `referral-${to}-${at}`,
    to,
    at,
    payload
  }).order;
}

function p3Collections() {
  const researchEvent = asyncEventApi.createAsyncEvent({
    id: "EV-000001",
    kind: "laboratory_result",
    createdAt: 105,
    dueAt: 150,
    priority: 1,
    overduePolicy: "keep_until_handled",
    sourceType: "research_order",
    sourceId: "RO-000001"
  });
  const referralEvent = asyncEventApi.createAsyncEvent({
    id: "EV-000002",
    kind: "referral_response",
    createdAt: 203,
    dueAt: 260,
    priority: 2,
    overduePolicy: "keep_until_handled",
    sourceType: "referral_order",
    sourceId: "RF-000001"
  });

  let research = researchApi.createResearchOrder({
    id: "RO-000001",
    caseId: "EAR_FUNGAL_OTITIS",
    patientId: "LP-000001",
    encounterId: "VISIT-000001",
    researchId: "ear_cytology",
    route: "local",
    sampleRequired: true,
    createdAt: 100
  });
  research = transitionResearch(research, "owner_accepted", 101);
  research = transitionResearch(research, "sample_planned", 102, { samplePlan: { authored: true } });
  research = transitionResearch(research, "sample_collected", 103, { sampleCollection: { authored: true } });
  research = transitionResearch(research, "sent_or_queued", 105, {
    dispatch: { route: "microscope" },
    queueTaskId: "DT-000001",
    asyncEventIds: [researchEvent.id]
  });

  let referral = referralApi.createReferralOrder({
    id: "RF-000001",
    caseId: "EAR_FUNGAL_OTITIS",
    patientId: "LP-000001",
    encounterId: "VISIT-000001",
    reason: "safe_route",
    urgency: "routine",
    routeCapabilityId: "safe_referral",
    createdAt: 200
  });
  referral = transitionReferral(referral, "owner_accepted", 201);
  referral = transitionReferral(referral, "sent", 203, {
    transmission: { authored: true },
    asyncEventIds: [referralEvent.id]
  });

  let deviceQueues = deviceQueueApi.createDeviceQueueState([{ resourceId: "microscope", capacityPerDay: 6 }]);
  deviceQueues = deviceQueueApi.enqueueDeviceTask(deviceQueues, {
    id: "DT-000001",
    resourceId: "microscope",
    orderType: "research_order",
    orderId: research.id,
    queuedAt: 105,
    authoredDurationMinutes: 8
  }).state;

  return {
    capabilityState: {
      schemaVersion: 1,
      registryId: saveApi.CAPABILITY_REGISTRY_ID,
      registryVersion: saveApi.CAPABILITY_REGISTRY_VERSION,
      entries: { microscope: { available: true, operational: true } }
    },
    researchOrders: [research],
    referralOrders: [referral],
    asyncEvents: [researchEvent, referralEvent],
    deviceQueues
  };
}

function activeOperationsState() {
  let state = schedulerApi.createState([{
    id: "doctor-a",
    capacity: 1,
    capabilities: ["synthetic-authored-task"],
    unavailableWindows: []
  }, {
    id: "room-a",
    capacity: 1,
    capabilities: ["synthetic-authored-room"],
    unavailableWindows: []
  }]);
  state = schedulerApi.enqueueTask(state, {
    commandId: "OPS-ENQUEUE-1",
    task: {
      id: "OPS-TASK-1",
      queuedAt: 500,
      priority: 20,
      authoredDurationMinutes: 15,
      fatigue: { percent: 42, durationMultiplier: 1.2 },
      requirementGroups: [{
        id: "staff",
        anyOf: [{ resourceId: "doctor-a", capabilityId: "synthetic-authored-task", units: 1 }]
      }, {
        id: "room",
        anyOf: [{ resourceId: "room-a", capabilityId: "synthetic-authored-room", units: 1 }]
      }],
      urgency: "routine",
      safeRouteRequired: false,
      sourceType: "operations_test_fixture",
      sourceId: "OPS-SOURCE-1",
      patientId: "LP-000001"
    }
  }).state;
  state = schedulerApi.scheduleTask(state, { commandId: "OPS-START-1", at: 500 }).state;
  return { ...state, handoffs: [] };
}

const base = {
  phase: "running",
  day: 4,
  money: 2040,
  reputation: 78.5,
  doctors: [{ id: "doctor-a", fatigue: 42 }],
  queue: [{
    id: 7,
    visitId: "VISIT-000001",
    patientId: "LP-000001",
    animal: "Бакс",
    selectedDiagnosisIds: ["EAR_FUNGAL_OTITIS"],
    diagnosticDecisions: [{
      decision: "refused",
      offeredTestIds: ["ear_cytology"],
      acceptedTestIds: [],
      noResult: true,
      noPayment: true
    }],
    diagnosticUncertainty: { testId: "ear_cytology", reason: "refused" }
  }],
  activeId: 7,
  arrivalSchedule: [],
  caseJournal: [{ day: 3, visitId: "VISIT-000001", patientId: "LP-000001", caseId: "EAR_FUNGAL_OTITIS" }],
  pendingReturns: [{ visitId: "VISIT-000001", day: 5 }],
  appointments: [{ appointmentId: "AP-3-1", treatmentCourseId: "TC-3-1", patientId: "LP-000001", scheduledDay: 5, status: "confirmed" }],
  treatmentCourses: [{ treatmentCourseId: "TC-3-1", status: "active" }],
  longitudinalPatients: { "LP-000001": { patientId: "LP-000001", state: "improving" } },
  attendanceEvents: [{ appointmentId: "AP-2-1", status: "attended" }],
  ...p3Collections(),
  transientDomReference: { shouldNotPersist: true }
};

const storage = memoryStorage();
const saved = saveApi.save(storage, "tier-01-v2", base, tierOptions());
assert.equal(saved.gameStateSaveVersion, 8);
assert.equal(saved.capabilityRegistryId, saveApi.CAPABILITY_REGISTRY_ID);
assert.equal(saved.capabilityRegistryVersion, saveApi.CAPABILITY_REGISTRY_VERSION);
const loaded = saveApi.load(storage, "tier-01-v2", tierOptions());
assert.equal(loaded.state.money, 2040);
assert.equal(loaded.state.activeId, 7);
assert.equal(loaded.state.queue[0].diagnosticDecisions[0].noResult, true);
assert.equal(loaded.state.appointments[0].appointmentId, "AP-3-1");
assert.equal(loaded.state.longitudinalPatients["LP-000001"].state, "improving");
assert.deepEqual(loaded.state.capabilityState, base.capabilityState);
assert.deepEqual(loaded.state.researchOrders, base.researchOrders);
assert.deepEqual(loaded.state.referralOrders, base.referralOrders);
assert.deepEqual(loaded.state.asyncEvents, base.asyncEvents);
assert.deepEqual(loaded.state.deviceQueues, base.deviceQueues);
assert.deepEqual(loaded.state.operationsState, {
  schemaVersion: 1,
  resources: {},
  tasks: [],
  reservations: [],
  handoffs: [],
  appliedCommandIds: [],
  commandFingerprints: {}
});
assert.equal(loaded.state.transientDomReference, undefined);

const operationsStorage = memoryStorage();
const expectedOperationsState = activeOperationsState();
saveApi.save(operationsStorage, "tier-01-v2", {
  ...base,
  operationsState: expectedOperationsState
}, tierOptions());
const operationsLoaded = saveApi.load(operationsStorage, "tier-01-v2", tierOptions());
assert.deepEqual(operationsLoaded.state.operationsState, expectedOperationsState);
assert.equal(operationsLoaded.state.operationsState.tasks[0].status, "active");
assert.equal(operationsLoaded.state.operationsState.reservations.length, 2);
assert.equal(/authoredResult|diagnosis|clinicalTruth/u.test(JSON.stringify(operationsLoaded.state.operationsState)), false);

const duplicateDeviceTaskOperations = activeOperationsState();
duplicateDeviceTaskOperations.tasks[0].id = "DT-000001";
duplicateDeviceTaskOperations.reservations.forEach((reservation) => { reservation.taskId = "DT-000001"; });
assert.throws(() => saveApi.createSnapshot("tier-01-v2", {
  ...base,
  operationsState: duplicateDeviceTaskOperations
}, tierOptions()), /duplicates a P3 device queue task/);

const duplicateDeviceOrderOperations = activeOperationsState();
duplicateDeviceOrderOperations.tasks[0].sourceType = "research_order";
duplicateDeviceOrderOperations.tasks[0].sourceId = "RO-000001";
assert.throws(() => saveApi.createSnapshot("tier-01-v2", {
  ...base,
  operationsState: duplicateDeviceOrderOperations
}, tierOptions()), /duplicates a P3 device queue order/);
assert.doesNotThrow(() => saveApi.createSnapshot("tier-01-v2", base, tierOptions()),
  "a populated P3 device queue without an operations duplicate must stay valid");

storage.resetCalls();
saveApi.load(storage, "tier-01-v2", tierOptions());
assert.equal(storage.setCalls.length, 0, "current tier save load performed a write");

saveApi.save(storage, "current", { ...base, day: 1, money: 100 });
saveApi.save(storage, "legacy-v1", { ...base, day: 2, money: 200 });
assert.equal(saveApi.load(storage, "current").gameStateSaveVersion, 1);
assert.equal(saveApi.load(storage, "current").state.money, 100);
assert.equal(saveApi.load(storage, "legacy-v1").state.money, 200);
assert.equal(saveApi.load(storage, "tier-01-v2", tierOptions()).state.money, 2040);
assert.equal(saveApi.createSnapshot("current", { ownerTrust: 90, reputation: 70 }).state.ownerTrust, undefined);
assert.equal(saveApi.createSnapshot("legacy-v1", { clinicalReliability: 90, reputation: 70 }).state.clinicalReliability, undefined);

const tierKey = namespaces.gameSaveKey("tier-01-v2");
const compactIdentityRaw = storage.getItem(tierKey);
const futureIdentitySnapshot = JSON.parse(compactIdentityRaw);
futureIdentitySnapshot.state.identityRegistry.schemaVersion = 999;
const futureIdentityRaw = JSON.stringify(futureIdentitySnapshot);
const futureIdentityStorage = memoryStorage({ [tierKey]: futureIdentityRaw });
assert.throws(() => saveApi.load(futureIdentityStorage, "tier-01-v2", tierOptions()), /compact identity schema version/);
assert.equal(futureIdentityStorage.getItem(tierKey), futureIdentityRaw);
assert.equal(futureIdentityStorage.setCalls.length, 0, "future compact identity performed a write");

const malformedIdentitySnapshot = JSON.parse(compactIdentityRaw);
malformedIdentitySnapshot.state.identityRegistry.overrides = [["VISIT-000001", {}, null]];
const malformedIdentityRaw = JSON.stringify(malformedIdentitySnapshot);
const malformedIdentityStorage = memoryStorage({ [tierKey]: malformedIdentityRaw });
assert.throws(() => saveApi.load(malformedIdentityStorage, "tier-01-v2", tierOptions()), /four-slot array/);
assert.equal(malformedIdentityStorage.getItem(tierKey), malformedIdentityRaw);
assert.equal(malformedIdentityStorage.setCalls.length, 0, "malformed compact identity performed a write");

const futureOperationsSnapshot = JSON.parse(compactIdentityRaw);
futureOperationsSnapshot.state.operationsState.schemaVersion = 999;
const futureOperationsRaw = JSON.stringify(futureOperationsSnapshot);
const futureOperationsStorage = memoryStorage({ [tierKey]: futureOperationsRaw });
assert.throws(() => saveApi.load(futureOperationsStorage, "tier-01-v2", tierOptions()), /operations state schema version/i);
assert.equal(futureOperationsStorage.getItem(tierKey), futureOperationsRaw);
assert.equal(futureOperationsStorage.setCalls.length, 0, "future operations state performed a write");

const malformedOperationsSnapshot = JSON.parse(compactIdentityRaw);
malformedOperationsSnapshot.state.operationsState.tasks = [{ id: "task-without-authored-duration" }];
const malformedOperationsRaw = JSON.stringify(malformedOperationsSnapshot);
const malformedOperationsStorage = memoryStorage({ [tierKey]: malformedOperationsRaw });
assert.throws(() => saveApi.load(malformedOperationsStorage, "tier-01-v2", tierOptions()), /operationsState|scheduler/i);
assert.equal(malformedOperationsStorage.getItem(tierKey), malformedOperationsRaw);
assert.equal(malformedOperationsStorage.setCalls.length, 0, "malformed operations state performed a write");

const migrationState = {
  phase: "running",
  day: 6,
  money: -120,
  reputation: 68,
  queue: [{
    id: 19,
    visitId: "visit-6-1",
    animal: "Мурка",
    owner: "Орлова",
    species: "cat",
    sex: "самка",
    ageYears: 5,
    asked: { onset: true },
    diagnosticDecisions: [{ decision: "owner_accepted_pending_execution" }],
    pendingDiagnosticTestId: "ear_cytology",
    clinicalRecord: { history: ["Собрано"] }
  }],
  activeId: 19,
  arrivalSchedule: [],
  caseJournal: [{ day: 5, visitId: "visit-5-1" }],
  pendingReturns: [{ visitId: "visit-5-1", day: 7 }],
  equipmentCapabilities: { microscope: { owned: true, operational: true } }
};

for (const sourceVersion of [1, 2, 3, 4, 5]) {
  const source = {
    gameStateSaveVersion: sourceVersion,
    generatorMode: "tier-01-v2",
    savedAt: "2026-07-14T08:00:00.000Z",
    state: JSON.parse(JSON.stringify(migrationState))
  };
  const sourceRaw = JSON.stringify(source, null, 2);
  const migrationStorage = memoryStorage({ [tierKey]: sourceRaw });
  const migrated = saveApi.load(migrationStorage, "tier-01-v2", tierOptions({ catalog: {} }));
  assert.equal(migrated.gameStateSaveVersion, 8, `v${sourceVersion} did not migrate to v8`);
  assert.equal(migrated.capabilityRegistryId, saveApi.CAPABILITY_REGISTRY_ID);
  assert.equal(migrated.state.capabilityState.registryVersion, saveApi.CAPABILITY_REGISTRY_VERSION);
  assert.deepEqual(migrated.state.researchOrders, []);
  assert.deepEqual(migrated.state.referralOrders, []);
  assert.deepEqual(migrated.state.asyncEvents, []);
  assert.deepEqual(migrated.state.deviceQueues, { schemaVersion: 1, resources: {} });
  assert.deepEqual(migrated.state.operationsState, {
    schemaVersion: 1,
    resources: {},
    tasks: [],
    reservations: [],
    handoffs: [],
    appliedCommandIds: [],
    commandFingerprints: {}
  });
  assert.equal(
    migrationStorage.getItem(saveApi.migrationBackupKeyForVersion("tier-01-v2", sourceVersion)),
    sourceRaw,
    `v${sourceVersion} migration did not preserve exact source bytes`
  );
  if (sourceVersion === 5) {
    Object.entries(source.state.queue[0]).forEach(([key, value]) => {
      assert.deepEqual(migrated.state.queue[0][key], value, `v5 migration changed active queue field ${key}`);
    });
    assert.equal(migrated.state.activeId, source.state.activeId);
    assert.deepEqual(migrated.state.capabilityState.entries, source.state.equipmentCapabilities);
    migrationStorage.resetCalls();
    saveApi.load(migrationStorage, "tier-01-v2", tierOptions({ catalog: {} }));
    assert.equal(migrationStorage.setCalls.length, 0, "current migrated save rewrote storage");
    const restored = saveApi.restoreMigrationBackup(migrationStorage, "tier-01-v2", 5, tierOptions({ catalog: {} }));
    assert.equal(restored.raw, sourceRaw);
    assert.equal(migrationStorage.getItem(tierKey), sourceRaw, "rollback did not restore exact v5 bytes");
  }
}

const sourceV5 = {
  gameStateSaveVersion: 5,
  generatorMode: "tier-01-v2",
  savedAt: "2026-07-14T08:00:00.000Z",
  state: migrationState
};
const sourceV5Raw = JSON.stringify(sourceV5);
const sourceV5Backup = saveApi.migrationBackupKeyForVersion("tier-01-v2", 5);

const sourceV6 = saveApi.migrateTierSnapshotToV6(sourceV5, {}, tierOptions());
const sourceV7 = saveApi.migrateTierSnapshotToV7(sourceV6, {}, tierOptions());
assert.equal(sourceV7.gameStateSaveVersion, 7);
const sourceV7Raw = JSON.stringify(sourceV7, null, 2);
const sourceV7Storage = memoryStorage({ [tierKey]: sourceV7Raw });
const migratedV7 = saveApi.load(sourceV7Storage, "tier-01-v2", tierOptions({ catalog: {}, hydrate: false }));
assert.equal(migratedV7.gameStateSaveVersion, 8);
assert.deepEqual(migratedV7.state.identityRegistry, sourceV7.state.identityRegistry);
assert.deepEqual(migratedV7.state.deviceQueues, sourceV7.state.deviceQueues);
assert.deepEqual(migratedV7.state.operationsState, {
  schemaVersion: 1,
  resources: {},
  tasks: [],
  reservations: [],
  handoffs: [],
  appliedCommandIds: [],
  commandFingerprints: {}
});
assert.equal(
  sourceV7Storage.getItem(saveApi.migrationBackupKeyForVersion("tier-01-v2", 7)),
  sourceV7Raw,
  "v7 migration did not preserve exact source bytes"
);
const restoredV7 = saveApi.restoreMigrationBackup(
  sourceV7Storage,
  "tier-01-v2",
  7,
  tierOptions({ catalog: {} })
);
assert.equal(restoredV7.raw, sourceV7Raw);
assert.equal(sourceV7Storage.getItem(tierKey), sourceV7Raw, "rollback did not restore exact v7 bytes");

const sourceV6Raw = JSON.stringify(sourceV6, null, 2);
const sourceV6Storage = memoryStorage({ [tierKey]: sourceV6Raw });
const migratedV6 = saveApi.load(sourceV6Storage, "tier-01-v2", tierOptions({ catalog: {} }));
assert.equal(migratedV6.gameStateSaveVersion, 8);
assert.equal(migratedV6.state.queue[0].visitId, sourceV6.state.queue[0].visitId);
assert.equal(migratedV6.state.queue[0].owner, sourceV6.state.queue[0].owner);
assert.match(migratedV6.state.queue[0].persistentOwnerId, /^OWN-/);
assert.match(migratedV6.state.queue[0].persistentPatientId, /^PAT-/);
assert.equal(migratedV6.state.identityRegistry.campaignIdentity, CAMPAIGN_IDENTITY);
assert.equal(Object.keys(migratedV6.state.identityRegistry.owners).length, 2);
assert.equal(Object.keys(migratedV6.state.identityRegistry.patients).length, 2);
assert.equal(
  sourceV6Storage.getItem(saveApi.migrationBackupKeyForVersion("tier-01-v2", 6)),
  sourceV6Raw,
  "v6 migration did not preserve exact source bytes"
);
sourceV6Storage.resetCalls();
saveApi.load(sourceV6Storage, "tier-01-v2", tierOptions({ catalog: {} }));
assert.equal(sourceV6Storage.setCalls.length, 0, "current v8 save rewrote storage");

const conflict = memoryStorage({ [tierKey]: sourceV5Raw, [sourceV5Backup]: "different-backup" });
assert.throws(() => saveApi.load(conflict, "tier-01-v2", tierOptions({ catalog: {} })), /backup conflict/);
assert.equal(conflict.getItem(tierKey), sourceV5Raw);
assert.equal(conflict.setCalls.length, 0, "backup conflict performed a write");

const backupQuota = memoryStorage({ [tierKey]: sourceV5Raw });
backupQuota.failSet = (key) => key === sourceV5Backup;
assert.throws(() => saveApi.load(backupQuota, "tier-01-v2", tierOptions({ catalog: {} })), /quota/);
assert.equal(backupQuota.getItem(tierKey), sourceV5Raw);
assert.equal(backupQuota.getItem(sourceV5Backup), null);

const primaryQuota = memoryStorage({ [tierKey]: sourceV5Raw });
primaryQuota.failSet = (key) => key === tierKey;
assert.throws(() => saveApi.load(primaryQuota, "tier-01-v2", tierOptions({ catalog: {} })), /quota/);
assert.equal(primaryQuota.getItem(tierKey), sourceV5Raw);
assert.equal(primaryQuota.getItem(sourceV5Backup), sourceV5Raw);
const backupWriteCount = primaryQuota.setCalls.filter((call) => call.key === sourceV5Backup).length;
primaryQuota.failSet = null;
assert.equal(saveApi.load(primaryQuota, "tier-01-v2", tierOptions({ catalog: {} })).gameStateSaveVersion, 8);
assert.equal(primaryQuota.setCalls.filter((call) => call.key === sourceV5Backup).length, backupWriteCount, "retry rewrote exact backup");

const futureRaw = JSON.stringify({ gameStateSaveVersion: 999, generatorMode: "tier-01-v2", state: {} });
const futureStorage = memoryStorage({ [tierKey]: futureRaw });
assert.throws(() => saveApi.load(futureStorage, "tier-01-v2", tierOptions({ catalog: {} })), /Unsupported game save version/);
assert.equal(futureStorage.getItem(tierKey), futureRaw);
assert.equal(futureStorage.setCalls.length, 0, "future save performed a write");

const emptyRawStorage = memoryStorage({ [tierKey]: "" });
assert.throws(() => saveApi.load(emptyRawStorage, "tier-01-v2", tierOptions({ catalog: {} })), /Game save JSON is invalid/);
assert.equal(emptyRawStorage.getItem(tierKey), "");
assert.equal(emptyRawStorage.setCalls.length, 0, "empty corrupt save performed a write");

const mismatchedRaw = JSON.stringify({ gameStateSaveVersion: 1, generatorMode: "current", state: {} });
const mismatchedStorage = memoryStorage({ [tierKey]: mismatchedRaw });
assert.throws(() => saveApi.load(mismatchedStorage, "tier-01-v2", tierOptions({ catalog: {} })), /mode mismatch/);
assert.equal(mismatchedStorage.getItem(tierKey), mismatchedRaw);
assert.equal(mismatchedStorage.setCalls.length, 0, "mode mismatch performed a write");

const runtimeDerivedOrder = researchApi.createResearchOrder({
  id: "RO-000009",
  caseId: "EAR_FUNGAL_OTITIS",
  patientId: "visit-VISIT-RUNTIME-1-patient",
  encounterId: "VISIT-RUNTIME-1",
  researchId: "ear_cytology",
  route: "local",
  sampleRequired: true,
  createdAt: 290
});
assert.doesNotThrow(() => saveApi.createSnapshot("tier-01-v2", {
  queue: [{ id: 29, visitId: "VISIT-RUNTIME-1" }],
  activeId: 29,
  arrivalSchedule: [],
  researchOrders: [runtimeDerivedOrder]
}, tierOptions()));
assert.doesNotThrow(() => saveApi.createSnapshot("tier-01-v2", {
  queue: [],
  activeId: null,
  arrivalSchedule: [],
  caseJournal: [{ visitId: "VISIT-RUNTIME-1" }],
  researchOrders: [runtimeDerivedOrder]
}, tierOptions()));

let refused = researchApi.createResearchOrder({
  id: "RO-000010",
  caseId: "EAR_FUNGAL_OTITIS",
  patientId: "LP-000001",
  researchId: "ear_cytology",
  route: "local",
  sampleRequired: true,
  createdAt: 300
});
refused = transitionResearch(refused, "owner_refused", 301);
refused.authoredResult = { forbidden: true };
assert.throws(() => saveApi.createSnapshot("tier-01-v2", {
  queue: [],
  arrivalSchedule: [],
  longitudinalPatients: { "LP-000001": { patientId: "LP-000001" } },
  researchOrders: [refused]
}, tierOptions()), /refusal_invariant/);

const danglingTaskOrder = researchApi.createResearchOrder({
  id: "RO-000011",
  caseId: "EAR_FUNGAL_OTITIS",
  patientId: "LP-000001",
  researchId: "ear_cytology",
  route: "local",
  sampleRequired: true,
  createdAt: 400
});
danglingTaskOrder.queueTaskId = "DT-999999";
assert.throws(() => saveApi.createSnapshot("tier-01-v2", {
  queue: [],
  arrivalSchedule: [],
  longitudinalPatients: { "LP-000001": { patientId: "LP-000001" } },
  researchOrders: [danglingTaskOrder]
}, tierOptions()), /dangling queueTaskId/);

const invalidActive = { ...base, activeId: 999, researchOrders: [], referralOrders: [], asyncEvents: [], deviceQueues: { schemaVersion: 1, resources: {} } };
assert.throws(() => saveApi.createSnapshot("tier-01-v2", invalidActive, tierOptions()), /activeId does not reference/);

const historicalSnapshotStorage = memoryStorage();
saveApi.save(historicalSnapshotStorage, "tier-01-v2", {
  queue: [{
    id: 51,
    visitId: "VISIT-REPEAT-2",
    originalVisitId: "VISIT-REPEAT-1",
    owner: "Орлова",
    animal: "Тайга",
    species: "dog",
    sex: "female",
    ageYears: 4,
    irritation: 30,
    anxiety: 80,
    trust: 40
  }],
  activeId: 51,
  arrivalSchedule: [],
  caseJournal: [{
    visitId: "VISIT-REPEAT-1",
    identitySourceVisitId: "VISIT-REPEAT-1",
    owner: "Орлова",
    animal: "Тайга",
    species: "dog",
    sex: "female",
    ageYears: 4,
    ownerStateSnapshot: { irritation: 5, anxiety: 20, trust: 70 },
    patientStateSnapshot: {}
  }]
}, tierOptions());
const historicalReload = saveApi.load(historicalSnapshotStorage, "tier-01-v2", tierOptions());
assert.deepEqual(historicalReload.state.caseJournal[0].ownerStateSnapshot, {
  irritation: 5,
  anxiety: 20,
  trust: 70
});
const historicalOwnerId = historicalReload.state.queue[0].persistentOwnerId;
assert.deepEqual(historicalReload.state.identityRegistry.owners[historicalOwnerId].currentState, {
  irritation: 30,
  anxiety: 80,
  trust: 40
});

console.log("game state save: ok");
