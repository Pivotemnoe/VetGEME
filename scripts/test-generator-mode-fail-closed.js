"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const namespaces = require("../generator/save-namespaces.js");
const legacyGenerator = require("../legacy/generator-v1.js");
const tierGenerator = require("../generator/generator-v2.js");

const projectRoot = path.resolve(__dirname, "..");
const generatorModeSource = fs.readFileSync(path.join(projectRoot, "generator/generator-mode.js"), "utf8");
const gameSource = fs.readFileSync(path.join(projectRoot, "game.js"), "utf8");
const indexSource = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const protectedSaveKeys = [
  ...Object.values(namespaces.GAME_SAVE_KEYS),
  legacyGenerator.SAVE_KEY,
  tierGenerator.SAVE_KEY
];

function storageWithSentinels() {
  const values = new Map(protectedSaveKeys.map((key) => [key, `sentinel:${key}`]));
  const writes = [];
  return {
    values,
    writes,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      writes.push([key, String(value)]);
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); }
  };
}

async function runRejectedLoad(message) {
  const storage = storageWithSentinels();
  const expectedError = new Error(message);
  let createGeneratorCalls = 0;
  const context = {
    URLSearchParams,
    console,
    location: { search: "?generatorMode=tier-01-v2" },
    localStorage: storage,
    PET_CLINIC_SAVE_NAMESPACES: namespaces,
    PET_CLINIC_CONTENT_V2: {
      async loadFromFetch() { throw expectedError; }
    },
    PET_CLINIC_GENERATOR_V2: {
      createGenerator() {
        createGeneratorCalls += 1;
        throw new Error("generator must not be created after a rejected content load");
      }
    }
  };
  context.window = context;
  context.globalThis = context;

  vm.runInNewContext(generatorModeSource, context, { filename: "generator/generator-mode.js" });
  const runtime = await context.PET_CLINIC_GENERATOR_READY;

  assert.equal(context.PET_CLINIC_GENERATOR_MODE.mode, "tier-01-v2");
  assert.equal(runtime.mode, "tier-01-v2");
  assert.equal(runtime.catalog, null);
  assert.equal(runtime.generator, null);
  assert.equal(runtime.initializationError, expectedError);
  assert.equal(createGeneratorCalls, 0);
  assert.deepEqual(storage.writes, [["pet-clinic-generator-mode", "tier-01-v2"]]);
  for (const key of protectedSaveKeys) {
    assert.equal(storage.getItem(key), `sentinel:${key}`, `${message}: save key ${key} was overwritten`);
  }
  return runtime;
}

async function main() {
  await runRejectedLoad("unknown content registry");
  await runRejectedLoad("manifest identity mismatch");
  await runRejectedLoad("capability registry identity mismatch");
  assert.match(
    gameSource,
    /if \(generatorRuntime\.initializationError\)[\s\S]{0,500}await initBlockedGenerator\(generatorRuntime\.initializationError\)/u,
    "game bootstrap no longer blocks a rejected tier runtime"
  );
  assert.match(indexSource, /generator\/medical-catalog-v2\.js\?v=20260715a/u);
  assert.match(indexSource, /systems\/capability-registry-v3\.js\?v=20260715a/u);
  assert.match(indexSource, /systems\/device-queue-v3\.js\?v=20260715a/u);
  assert.match(indexSource, /systems\/research-orders-v3\.js\?v=20260715a/u);
  assert.match(indexSource, /systems\/referral-orders-v3\.js\?v=20260715a/u);
  assert.match(indexSource, /systems\/async-events-v3\.js\?v=20260715a/u);
  assert.match(indexSource, /generator\/atomic-save-migration\.js\?v=20260715a/u);
  assert.match(indexSource, /generator\/content-loader-v2\.js\?v=20260715c/u);
  assert.match(indexSource, /generator\/generator-mode\.js\?v=20260715b/u);
  assert.ok(
    indexSource.indexOf("generator/medical-catalog-v2.js") < indexSource.indexOf("generator/content-loader-v2.js"),
    "medical gate must load before the registered content loader"
  );
  assert.ok(
    indexSource.indexOf("systems/capability-registry-v3.js") < indexSource.indexOf("generator/content-loader-v2.js"),
    "capability registry v3 must load before the registered content loader"
  );
  assert.ok(
    indexSource.indexOf("generator/atomic-save-migration.js") < indexSource.indexOf("generator/game-state-save.js")
      && indexSource.indexOf("generator/atomic-save-migration.js") < indexSource.indexOf("generator/generator-v2.js"),
    "atomic migration dependency must load before both save runtimes"
  );
  for (const runtimeFile of [
    "systems/capability-registry-v3.js",
    "systems/device-queue-v3.js",
    "systems/research-orders-v3.js",
    "systems/referral-orders-v3.js",
    "systems/async-events-v3.js"
  ]) {
    assert.ok(
      indexSource.indexOf(runtimeFile) < indexSource.indexOf("generator/game-state-save.js")
        && indexSource.indexOf(runtimeFile) < indexSource.indexOf("game.js"),
      `${runtimeFile} must load before game-state-save.js and game.js`
    );
  }
  console.log(JSON.stringify({
    status: "passed",
    rejectedLoadsStayInTierMode: true,
    blockedRuntimeCarriesInitializationError: true,
    protectedSaveKeysUnchanged: protectedSaveKeys
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
