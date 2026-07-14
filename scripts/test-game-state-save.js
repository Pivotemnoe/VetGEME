"use strict";

const assert = require("node:assert/strict");
const saveApi = require("../generator/game-state-save.js");
const namespaces = require("../generator/save-namespaces.js");

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

const storage = memoryStorage();
const base = {
  phase: "running",
  day: 4,
  money: 2040,
  reputation: 78.5,
  doctors: [{ id: "doctor-a", fatigue: 42 }],
  queue: [{
    id: 7,
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
  caseJournal: [{ day: 3, visitId: "visit-3-1" }],
  pendingReturns: [{ visitId: "visit-3-1", day: 5 }],
  appointments: [{ appointmentId: "AP-3-1", treatmentCourseId: "TC-3-1", scheduledDay: 5, status: "confirmed" }],
  treatmentCourses: [{ treatmentCourseId: "TC-3-1", status: "active" }],
  longitudinalPatients: { "LP-3-1": { patientId: "LP-3-1", state: "improving" } },
  attendanceEvents: [{ appointmentId: "AP-2-1", status: "attended" }],
  transientDomReference: { shouldNotPersist: true }
};

saveApi.save(storage, "tier-01-v2", base);
assert.equal(saveApi.load(storage, "tier-01-v2").state.money, 2040);
assert.equal(saveApi.load(storage, "tier-01-v2").state.queue[0].diagnosticDecisions[0].noResult, true);
assert.equal(saveApi.load(storage, "tier-01-v2").state.queue[0].diagnosticUncertainty.reason, "refused");
assert.equal(saveApi.load(storage, "tier-01-v2").state.appointments[0].appointmentId, "AP-3-1");
assert.equal(saveApi.load(storage, "tier-01-v2").state.treatmentCourses[0].treatmentCourseId, "TC-3-1");
assert.equal(saveApi.load(storage, "tier-01-v2").state.longitudinalPatients["LP-3-1"].state, "improving");
assert.equal(saveApi.load(storage, "tier-01-v2").state.attendanceEvents[0].status, "attended");
assert.equal(saveApi.load(storage, "current"), null);
assert.equal(saveApi.load(storage, "legacy-v1"), null);
assert.equal(saveApi.load(storage, "tier-01-v2").state.transientDomReference, undefined);

saveApi.save(storage, "current", { ...base, day: 1, money: 100 });
saveApi.save(storage, "legacy-v1", { ...base, day: 2, money: 200 });
assert.equal(saveApi.load(storage, "current").state.money, 100);
assert.equal(saveApi.load(storage, "legacy-v1").state.money, 200);
assert.equal(saveApi.load(storage, "tier-01-v2").state.money, 2040);

const incompatibleKey = namespaces.gameSaveKey("tier-01-v2");
storage.setItem(incompatibleKey, JSON.stringify({ gameStateSaveVersion: 999, generatorMode: "tier-01-v2", state: {} }));
assert.throws(() => saveApi.load(storage, "tier-01-v2"), /Unsupported game save version/);

storage.setItem(incompatibleKey, JSON.stringify({ gameStateSaveVersion: 1, generatorMode: "current", state: {} }));
assert.throws(() => saveApi.load(storage, "tier-01-v2"), /mode mismatch/);

const previousV2 = {
  gameStateSaveVersion: 2,
  generatorMode: "tier-01-v2",
  savedAt: "2026-07-12T12:00:00.000Z",
  state: {
    phase: "running",
    day: 6,
    money: -120,
    reputation: 68,
    queue: [],
    arrivalSchedule: [],
    caseJournal: [{ day: 5, visitId: "visit-5-1" }],
    pendingReturns: [{ visitId: "visit-5-1", day: 7 }]
  }
};
storage.setItem(incompatibleKey, JSON.stringify(previousV2));
const migrated = saveApi.load(storage, "tier-01-v2", { catalog: {} });
assert.equal(migrated.gameStateSaveVersion, 5);
assert.equal(migrated.state.ownerTrust, 68);
assert.equal(migrated.state.clinicalReliability, 68);
assert.equal(migrated.state.campaignFinance.debt, 120);
assert.deepEqual(migrated.state.caseJournal, previousV2.state.caseJournal);
assert.deepEqual(migrated.state.pendingReturns, previousV2.state.pendingReturns);
assert.deepEqual(migrated.state.appointments, []);
assert.deepEqual(migrated.state.treatmentCourses, []);
assert.deepEqual(migrated.state.longitudinalPatients, {});
assert.deepEqual(migrated.state.attendanceEvents, []);
assert.equal(JSON.parse(storage.getItem(incompatibleKey)).gameStateSaveVersion, 5);

const previousV3 = {
  gameStateSaveVersion: 3,
  generatorMode: "tier-01-v2",
  savedAt: "2026-07-13T12:00:00.000Z",
  state: {
    phase: "planning",
    day: 7,
    money: 900,
    ownerTrust: 77,
    clinicalReliability: 81,
    campaignFinance: { creditLimit: 2500, debt: 0, weeklyReview: null, closureRisk: "stable" },
    queue: [],
    arrivalSchedule: []
  }
};
storage.setItem(incompatibleKey, JSON.stringify(previousV3));
const migratedV3 = saveApi.load(storage, "tier-01-v2", { catalog: {} });
assert.equal(migratedV3.gameStateSaveVersion, 5);
assert.equal(migratedV3.state.ownerTrust, 77);
assert.equal(migratedV3.state.clinicalReliability, 81);
assert.deepEqual(migratedV3.state.campaignFinance, previousV3.state.campaignFinance);

const previousV4 = {
  gameStateSaveVersion: 4,
  generatorMode: "tier-01-v2",
  savedAt: "2026-07-14T08:00:00.000Z",
  state: {
    phase: "running",
    day: 2,
    money: 1100,
    ownerTrust: 72,
    clinicalReliability: 76,
    queue: [],
    arrivalSchedule: []
  }
};
storage.setItem(incompatibleKey, JSON.stringify(previousV4));
const migratedV4 = saveApi.load(storage, "tier-01-v2", { catalog: {} });
assert.equal(migratedV4.gameStateSaveVersion, 5);
assert.deepEqual(migratedV4.state.appointments, []);
assert.deepEqual(migratedV4.state.treatmentCourses, []);
assert.deepEqual(migratedV4.state.longitudinalPatients, {});
assert.deepEqual(migratedV4.state.attendanceEvents, []);

const impossibleV2 = {
  gameStateSaveVersion: 2,
  generatorMode: "tier-01-v2",
  state: {
    queue: [{ id: 1, v2Visit: { caseId: "MISSING_CASE", contentPackHash: "missing" } }],
    arrivalSchedule: []
  }
};
const impossibleRaw = JSON.stringify(impossibleV2);
storage.setItem(incompatibleKey, impossibleRaw);
assert.throws(() => saveApi.load(storage, "tier-01-v2", { catalog: {} }));
assert.equal(storage.getItem(incompatibleKey), impossibleRaw, "failed migration overwrote the source snapshot");

assert.equal(saveApi.createSnapshot("current", { ownerTrust: 90, reputation: 70 }).state.ownerTrust, undefined);
assert.equal(saveApi.createSnapshot("legacy-v1", { clinicalReliability: 90, reputation: 70 }).state.clinicalReliability, undefined);

console.log("game state save: ok");
