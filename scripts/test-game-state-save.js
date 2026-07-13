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
  transientDomReference: { shouldNotPersist: true }
};

saveApi.save(storage, "tier-01-v2", base);
assert.equal(saveApi.load(storage, "tier-01-v2").state.money, 2040);
assert.equal(saveApi.load(storage, "tier-01-v2").state.queue[0].diagnosticDecisions[0].noResult, true);
assert.equal(saveApi.load(storage, "tier-01-v2").state.queue[0].diagnosticUncertainty.reason, "refused");
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

console.log("game state save: ok");
