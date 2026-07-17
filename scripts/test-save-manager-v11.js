"use strict";

const assert = require("node:assert/strict");
const saveManager = require("../systems/save-manager-v11.js");

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries.map(([key, value]) => [key, String(value)]));
    this.failKey = null;
    this.failCount = 0;
  }

  get length() { return this.values.size; }
  key(index) { return Array.from(this.values.keys())[index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    if (key === this.failKey && this.failCount > 0) {
      this.failCount -= 1;
      throw new Error("simulated storage failure");
    }
    this.values.set(key, String(value));
  }
  removeItem(key) { this.values.delete(key); }
  failNextWrite(key) { this.failKey = key; this.failCount = 1; }
}

const snapshotApi = {
  createSnapshot(generatorMode, state) {
    return { gameStateSaveVersion: 10, generatorMode, state: JSON.parse(JSON.stringify(state)) };
  },
  validateSnapshot(snapshot, expectedMode) {
    assert.equal(snapshot.gameStateSaveVersion, 10);
    assert.equal(snapshot.generatorMode, expectedMode);
    assert.ok(snapshot.state && typeof snapshot.state === "object");
    return snapshot;
  },
  hydrateTierState(state) {
    return { ...JSON.parse(JSON.stringify(state)), hydrated: true };
  }
};

assert.equal(saveManager.schemaVersion, 11);
assert.deepEqual(saveManager.modeIds, ["campaign", "training", "endless", "tester"]);
assert.deepEqual(saveManager.modeIds.map(saveManager.modeKey), [
  "pet-clinic-game-v11:campaign",
  "pet-clinic-game-v11:training",
  "pet-clinic-game-v11:endless",
  "pet-clinic-game-v11:tester"
]);
assert.equal(saveManager.settingsKey, "pet-clinic-game-v11:settings");
assert.equal(saveManager.legacyClearedKey, "pet-clinic-game-v11:legacy-cleared");

const storage = new MemoryStorage();
const campaignGenerator = saveManager.generatorStorage(storage, "campaign");
const generatorState = JSON.stringify({ saveVersion: 5, campaignSeed: "seed-campaign", generatedDays: { 1: { id: "day-1" } } });
campaignGenerator.setItem(saveManager.generatorSaveKey, generatorState);
assert.equal(campaignGenerator.getItem(saveManager.generatorSaveKey), generatorState);
assert.equal(storage.getItem(saveManager.generatorSaveKey), null, "v11 must not write the legacy generator key");

saveManager.saveGame(storage, "campaign", "tier-01-v2", { day: 1, activeId: "VISIT-1" }, { snapshotApi });
const campaignEnvelope = saveManager.readEnvelope(storage, "campaign");
assert.equal(campaignEnvelope.saveSchemaVersion, 11);
assert.equal(campaignEnvelope.modeId, "campaign");
assert.deepEqual(campaignEnvelope.dependencies, saveManager.dependencies);
assert.equal(campaignEnvelope.generatorStorage[saveManager.generatorSaveKey], generatorState);
assert.equal(campaignEnvelope.gameSnapshot.state.activeId, "VISIT-1");
assert.equal(storage.getItem(saveManager.pendingKey("campaign")), null);

const restored = saveManager.loadGame(storage, "campaign", "tier-01-v2", { snapshotApi });
assert.equal(restored.state.activeId, "VISIT-1");
assert.equal(restored.state.hydrated, true);

const trainingGenerator = saveManager.generatorStorage(storage, "training");
trainingGenerator.setItem(saveManager.generatorSaveKey, JSON.stringify({ campaignSeed: "seed-training" }));
saveManager.saveGame(storage, "training", "tier-01-v2", { day: 3 }, { snapshotApi });
saveManager.clearMode(storage, "training");
assert.equal(storage.getItem(saveManager.modeKey("training")), null);
assert.equal(saveManager.readEnvelope(storage, "campaign").gameSnapshot.state.activeId, "VISIT-1");

const previousCampaignRaw = storage.getItem(saveManager.modeKey("campaign"));
storage.failNextWrite(saveManager.modeKey("campaign"));
assert.throws(
  () => campaignGenerator.setItem(saveManager.generatorSaveKey, JSON.stringify({ campaignSeed: "uncommitted" })),
  /simulated storage failure/u
);
assert.equal(storage.getItem(saveManager.modeKey("campaign")), previousCampaignRaw);
assert.notEqual(storage.getItem(saveManager.pendingKey("campaign")), null);
assert.equal(saveManager.readEnvelope(storage, "campaign").generatorStorage[saveManager.generatorSaveKey], generatorState);
assert.equal(storage.getItem(saveManager.pendingKey("campaign")), null, "valid primary wins over an interrupted update");

const recoveryStorage = new MemoryStorage();
const recoveryGenerator = saveManager.generatorStorage(recoveryStorage, "endless");
recoveryStorage.failNextWrite(saveManager.modeKey("endless"));
assert.throws(
  () => recoveryGenerator.setItem(saveManager.generatorSaveKey, JSON.stringify({ campaignSeed: "recover-me" })),
  /simulated storage failure/u
);
assert.equal(recoveryStorage.getItem(saveManager.modeKey("endless")), null);
assert.notEqual(recoveryStorage.getItem(saveManager.pendingKey("endless")), null);
assert.equal(
  saveManager.readEnvelope(recoveryStorage, "endless").generatorStorage[saveManager.generatorSaveKey],
  JSON.stringify({ campaignSeed: "recover-me" })
);
assert.equal(recoveryStorage.getItem(saveManager.pendingKey("endless")), null);

const mismatchStorage = new MemoryStorage([[saveManager.modeKey("tester"), JSON.stringify({
  saveSchemaVersion: 11,
  modeId: "tester",
  dependencies: { ...saveManager.dependencies, activationId: "wrong-activation" },
  generatorStorage: {},
  gameSnapshot: null
})]]);
assert.throws(() => saveManager.readEnvelope(mismatchStorage, "tester"), /Версии медицинской базы/u);

const corruptStorage = new MemoryStorage([[saveManager.modeKey("tester"), "{not-json"]]);
assert.throws(() => saveManager.readEnvelope(corruptStorage, "tester"), /повреждённый JSON/u);

const legacyEntries = [
  ...saveManager.legacyExactKeys.map((key) => [key, `legacy:${key}`]),
  ["pet-clinic-game-tier-01-v2:migration-source:v9", "backup"],
  ["pet-clinic-generator-v2:migration-source:v4", "backup"],
  [saveManager.modeKey("campaign"), previousCampaignRaw],
  [saveManager.settingsKey, JSON.stringify({ scale: 1 })]
];
const legacyStorage = new MemoryStorage(legacyEntries);
assert.equal(saveManager.legacyCleanupRequired(legacyStorage), true);
const cleanup = saveManager.clearLegacy(legacyStorage);
assert.equal(cleanup.alreadyCleared, false);
assert.equal(cleanup.removedKeys.length, saveManager.legacyExactKeys.length + 2);
for (const key of cleanup.removedKeys) assert.equal(legacyStorage.getItem(key), null);
assert.equal(legacyStorage.getItem(saveManager.modeKey("campaign")), previousCampaignRaw);
assert.notEqual(legacyStorage.getItem(saveManager.settingsKey), null);
assert.equal(saveManager.legacyCleanupRequired(legacyStorage), false);
assert.deepEqual(saveManager.clearLegacy(legacyStorage), { alreadyCleared: true, removedKeys: [] });

saveManager.writeSettings(storage, { lastModeId: "campaign", scale: 1 });
saveManager.writeSettings(storage, { scale: 1.25 });
assert.deepEqual(saveManager.readSettings(storage), { lastModeId: "campaign", scale: 1.25, saveSchemaVersion: 11 });

console.log(JSON.stringify({
  status: "passed",
  schemaVersion: saveManager.schemaVersion,
  isolatedModes: saveManager.modeIds.length,
  atomicWriteRecovery: true,
  dependencyMismatchFailsClosed: true,
  corruptSaveFailsClosed: true,
  legacyCleanupOneTime: true
}, null, 2));
