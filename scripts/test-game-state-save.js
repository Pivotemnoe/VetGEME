"use strict";

const assert = require("node:assert/strict");
const saveApi = require("../generator/game-state-save.js");
const namespaces = require("../generator/save-namespaces.js");
const researchApi = require("../systems/research-orders-v3.js");
const referralApi = require("../systems/referral-orders-v3.js");
const asyncEventApi = require("../systems/async-events-v3.js");
const deviceQueueApi = require("../systems/device-queue-v3.js");

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
const saved = saveApi.save(storage, "tier-01-v2", base);
assert.equal(saved.gameStateSaveVersion, 6);
assert.equal(saved.capabilityRegistryId, saveApi.CAPABILITY_REGISTRY_ID);
assert.equal(saved.capabilityRegistryVersion, saveApi.CAPABILITY_REGISTRY_VERSION);
const loaded = saveApi.load(storage, "tier-01-v2");
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
assert.equal(loaded.state.transientDomReference, undefined);

storage.resetCalls();
saveApi.load(storage, "tier-01-v2");
assert.equal(storage.setCalls.length, 0, "current tier save load performed a write");

saveApi.save(storage, "current", { ...base, day: 1, money: 100 });
saveApi.save(storage, "legacy-v1", { ...base, day: 2, money: 200 });
assert.equal(saveApi.load(storage, "current").gameStateSaveVersion, 1);
assert.equal(saveApi.load(storage, "current").state.money, 100);
assert.equal(saveApi.load(storage, "legacy-v1").state.money, 200);
assert.equal(saveApi.load(storage, "tier-01-v2").state.money, 2040);
assert.equal(saveApi.createSnapshot("current", { ownerTrust: 90, reputation: 70 }).state.ownerTrust, undefined);
assert.equal(saveApi.createSnapshot("legacy-v1", { clinicalReliability: 90, reputation: 70 }).state.clinicalReliability, undefined);

const tierKey = namespaces.gameSaveKey("tier-01-v2");
const migrationState = {
  phase: "running",
  day: 6,
  money: -120,
  reputation: 68,
  queue: [{
    id: 19,
    animal: "Мурка",
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
  const migrated = saveApi.load(migrationStorage, "tier-01-v2", { catalog: {} });
  assert.equal(migrated.gameStateSaveVersion, 6, `v${sourceVersion} did not migrate to v6`);
  assert.equal(migrated.capabilityRegistryId, saveApi.CAPABILITY_REGISTRY_ID);
  assert.equal(migrated.state.capabilityState.registryVersion, saveApi.CAPABILITY_REGISTRY_VERSION);
  assert.deepEqual(migrated.state.researchOrders, []);
  assert.deepEqual(migrated.state.referralOrders, []);
  assert.deepEqual(migrated.state.asyncEvents, []);
  assert.deepEqual(migrated.state.deviceQueues, { schemaVersion: 1, resources: {} });
  assert.equal(
    migrationStorage.getItem(saveApi.migrationBackupKeyForVersion("tier-01-v2", sourceVersion)),
    sourceRaw,
    `v${sourceVersion} migration did not preserve exact source bytes`
  );
  if (sourceVersion === 5) {
    assert.equal(JSON.stringify(migrated.state.queue), JSON.stringify(source.state.queue), "v5 migration changed active queue bytes");
    assert.equal(migrated.state.activeId, source.state.activeId);
    assert.deepEqual(migrated.state.capabilityState.entries, source.state.equipmentCapabilities);
    migrationStorage.resetCalls();
    saveApi.load(migrationStorage, "tier-01-v2", { catalog: {} });
    assert.equal(migrationStorage.setCalls.length, 0, "current migrated save rewrote storage");
    const restored = saveApi.restoreMigrationBackup(migrationStorage, "tier-01-v2", 5, { catalog: {} });
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

const conflict = memoryStorage({ [tierKey]: sourceV5Raw, [sourceV5Backup]: "different-backup" });
assert.throws(() => saveApi.load(conflict, "tier-01-v2", { catalog: {} }), /backup conflict/);
assert.equal(conflict.getItem(tierKey), sourceV5Raw);
assert.equal(conflict.setCalls.length, 0, "backup conflict performed a write");

const backupQuota = memoryStorage({ [tierKey]: sourceV5Raw });
backupQuota.failSet = (key) => key === sourceV5Backup;
assert.throws(() => saveApi.load(backupQuota, "tier-01-v2", { catalog: {} }), /quota/);
assert.equal(backupQuota.getItem(tierKey), sourceV5Raw);
assert.equal(backupQuota.getItem(sourceV5Backup), null);

const primaryQuota = memoryStorage({ [tierKey]: sourceV5Raw });
primaryQuota.failSet = (key) => key === tierKey;
assert.throws(() => saveApi.load(primaryQuota, "tier-01-v2", { catalog: {} }), /quota/);
assert.equal(primaryQuota.getItem(tierKey), sourceV5Raw);
assert.equal(primaryQuota.getItem(sourceV5Backup), sourceV5Raw);
const backupWriteCount = primaryQuota.setCalls.filter((call) => call.key === sourceV5Backup).length;
primaryQuota.failSet = null;
assert.equal(saveApi.load(primaryQuota, "tier-01-v2", { catalog: {} }).gameStateSaveVersion, 6);
assert.equal(primaryQuota.setCalls.filter((call) => call.key === sourceV5Backup).length, backupWriteCount, "retry rewrote exact backup");

const futureRaw = JSON.stringify({ gameStateSaveVersion: 999, generatorMode: "tier-01-v2", state: {} });
const futureStorage = memoryStorage({ [tierKey]: futureRaw });
assert.throws(() => saveApi.load(futureStorage, "tier-01-v2", { catalog: {} }), /Unsupported game save version/);
assert.equal(futureStorage.getItem(tierKey), futureRaw);
assert.equal(futureStorage.setCalls.length, 0, "future save performed a write");

const emptyRawStorage = memoryStorage({ [tierKey]: "" });
assert.throws(() => saveApi.load(emptyRawStorage, "tier-01-v2", { catalog: {} }), /Game save JSON is invalid/);
assert.equal(emptyRawStorage.getItem(tierKey), "");
assert.equal(emptyRawStorage.setCalls.length, 0, "empty corrupt save performed a write");

const mismatchedRaw = JSON.stringify({ gameStateSaveVersion: 1, generatorMode: "current", state: {} });
const mismatchedStorage = memoryStorage({ [tierKey]: mismatchedRaw });
assert.throws(() => saveApi.load(mismatchedStorage, "tier-01-v2", { catalog: {} }), /mode mismatch/);
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
}));
assert.doesNotThrow(() => saveApi.createSnapshot("tier-01-v2", {
  queue: [],
  activeId: null,
  arrivalSchedule: [],
  caseJournal: [{ visitId: "VISIT-RUNTIME-1" }],
  researchOrders: [runtimeDerivedOrder]
}));

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
}), /refusal_invariant/);

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
}), /dangling queueTaskId/);

const invalidActive = { ...base, activeId: 999, researchOrders: [], referralOrders: [], asyncEvents: [], deviceQueues: { schemaVersion: 1, resources: {} } };
assert.throws(() => saveApi.createSnapshot("tier-01-v2", invalidActive), /activeId does not reference/);

console.log("game state save: ok");
