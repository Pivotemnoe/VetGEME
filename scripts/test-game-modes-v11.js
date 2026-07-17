"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const gameModes = require("../systems/game-mode-v11.js");
const indexSource = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const gameSource = fs.readFileSync(path.join(projectRoot, "game.js"), "utf8");
const generatorModeSource = fs.readFileSync(path.join(projectRoot, "generator/generator-mode.js"), "utf8");

assert.equal(gameModes.schemaVersion, 11);
assert.deepEqual(gameModes.modeIds, ["campaign", "training", "endless", "tester"]);
assert.deepEqual(
  gameModes.modeIds.map((modeId) => gameModes.saveKey(modeId)),
  [
    "pet-clinic-game-v11:campaign",
    "pet-clinic-game-v11:training",
    "pet-clinic-game-v11:endless",
    "pet-clinic-game-v11:tester"
  ]
);
assert.equal(new Set(gameModes.modeIds.map((modeId) => gameModes.saveKey(modeId))).size, 4);

for (const modeId of gameModes.modeIds) {
  assert.match(indexSource, new RegExp(`data-mode-launch="${modeId}"`, "u"));
  assert.match(indexSource, new RegExp(`data-mode-continue="${modeId}"`, "u"));
}

assert.ok(indexSource.indexOf("systems/game-mode-v11.js") < indexSource.indexOf("generator/generator-mode.js"));
assert.ok(indexSource.indexOf("systems/game-mode-v11.js") < indexSource.indexOf("game.js"));
assert.ok(indexSource.indexOf("systems/save-manager-v11.js") < indexSource.indexOf("systems/game-mode-v11.js"));
assert.match(gameSource, /activeGameMode = await window\.PET_CLINIC_GAME_MODE_V11\.requireSelection\(\);/u);
assert.ok(
  gameSource.indexOf("activeGameMode = await window.PET_CLINIC_GAME_MODE_V11.requireSelection();")
    < gameSource.indexOf("generatorRuntime = await window.PET_CLINIC_GENERATOR_READY;"),
  "game bootstrap must wait for an explicit mode before initializing the generator"
);
assert.match(generatorModeSource, /window\.PET_CLINIC_GENERATOR_READY = gameModeSelection\.then/u);
assert.doesNotMatch(indexSource, /data-mode-launch="(?:current|legacy-v1|tier-01-v2)"/u);

console.log(JSON.stringify({
  status: "passed",
  schemaVersion: gameModes.schemaVersion,
  modes: gameModes.modeIds,
  simulationWaitsForModeSelection: true,
  legacyGeneratorRoutesRemainDeveloperOnly: true
}, null, 2));
