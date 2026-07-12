"use strict";

const legacy = require("../legacy/generator-v1.js");
const v2 = require("../generator/generator-v2.js");
const namespaces = require("../generator/save-namespaces.js");

const gameKeys = Object.values(namespaces.GAME_SAVE_KEYS);
if (new Set(gameKeys).size !== 3) throw new Error("game save keys are not isolated by mode");
if (legacy.SAVE_KEY === v2.SAVE_KEY) throw new Error("generator save keys overlap");
if (gameKeys.includes(legacy.SAVE_KEY) || gameKeys.includes(v2.SAVE_KEY)) throw new Error("game and generator save keys overlap");

console.log(JSON.stringify({
  status: "passed",
  gameSaveKeys: namespaces.GAME_SAVE_KEYS,
  generatorSaveKeys: { legacy: legacy.SAVE_KEY, tier01v2: v2.SAVE_KEY },
  note: "The current static prototype does not yet persist the full game state; these namespaces reserve isolated keys for that implementation."
}, null, 2));
