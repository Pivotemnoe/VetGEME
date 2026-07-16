#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(projectRoot, "visual/clinic-renderer-v2.js"), "utf8");
const animationIds = [
  "animation.cat-gray",
  "animation.dog-brown",
  "animation.owner-female",
  "animation.owner-male",
  "animation.veterinarian-female",
  "animation.veterinarian-male"
];

function asset(id, category = "fixture") {
  return {
    id,
    file: `assets/${id}.png`,
    category,
    source: { width: 100, height: 100 },
    logical: { width: 100, height: 100 },
    anchorX: 0.5,
    anchorY: 1
  };
}

const manifest = {
  assets: [
    asset("room.fixture", "room"),
    asset("equipment.fixture", "diagnostic_equipment"),
    asset("progression.locked-door-overlay", "progression"),
    asset("progression.delivery-pallet", "progression"),
    ...animationIds.map((id) => ({
      ...asset(id, "animation"),
      role: id.includes("owner") ? "owner_animation" : id.includes("veterinarian") ? "staff_animation" : "patient_animation",
      animation: {
        frameWidth: 100,
        frameHeight: 100,
        states: { idle: { frames: [0], durationMs: 100, loop: true } }
      }
    }))
  ]
};
const layout = {
  view: { x: 0, y: 0, scale: 1 },
  background: { path: { x: 0, y: 0, width: 1 } },
  corridor: { tileSize: 32, underlaySegments: [], overlaySegments: [] },
  actorPresentation: {
    runtimeFootOffset: { x: 0, y: 0 },
    animalOffset: { x: 0, y: 0 },
    travelAnimalOffset: { x: 0, y: 0 },
    scaleByRole: {},
    routeOccupants: {}
  },
  rooms: [{
    id: "fixture-room",
    assetId: "room.fixture",
    position: { x: 0, y: 0 },
    logicalBox: { width: 200, height: 120 },
    foregroundSlice: { sourceY: 80, height: 20, zFootY: 120 }
  }],
  placements: [{
    id: "fixture-equipment",
    assetId: "equipment.fixture",
    x: 100,
    y: 90,
    zFootY: 90,
    layer: "floor",
    scale: 0.5
  }],
  staticActors: [],
  routeHints: {}
};
const assetByFile = new Map(manifest.assets.map((record) => [record.file, record.id]));

class FakeImage {
  set src(value) {
    this.assetId = assetByFile.get(new URL(value).pathname.replace(/^\//u, ""));
    queueMicrotask(() => this.onload?.());
  }

  async decode() {}
}

function createRuntimeContext(explicitReviewHarness) {
  const runtimeContext = {
    URL,
    URLSearchParams,
    Promise,
    Map,
    Set,
    AbortController,
    Image: FakeImage,
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    queueMicrotask,
    setTimeout,
    clearTimeout,
    console,
    document: { baseURI: "http://127.0.0.1:5174/", documentElement: { dataset: {} } },
    fetch: async (url) => ({ ok: true, status: 200, json: async () => String(url).includes("manifest") ? manifest : layout })
  };
  runtimeContext.window = {
    location: { search: "?visualMode=modular-v2&p9=review-v2" },
    setTimeout,
    clearTimeout,
    dispatchEvent() {}
  };
  if (explicitReviewHarness) runtimeContext.window.__VETGEME_P9_REVIEW_HARNESS__ = true;
  vm.runInNewContext(source, runtimeContext, { filename: "clinic-renderer-v2.js" });
  return runtimeContext;
}

const context = createRuntimeContext(true);

function drawingContext() {
  const calls = [];
  return {
    calls,
    imageSmoothingEnabled: true,
    drawImage: (...args) => calls.push(args),
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    save() {},
    restore() {},
    translate() {},
    scale() {}
  };
}

(async () => {
  const renderer = context.window.PET_CLINIC_VISUAL_V2;
  await renderer.prepare();

  const baselineContext = drawingContext();
  renderer.drawScene(baselineContext, {});
  const baselineAssets = baselineContext.calls.map((call) => call[0].assetId);
  assert.deepEqual(baselineAssets, ["room.fixture", "equipment.fixture", "room.fixture"],
    "review-capable renderer must keep the exact baseline path without a projection");

  const projection = {
    scene: {
      roomsBySceneId: {
        "fixture-room": {
          resourceId: "room.fixture.1",
          showBase: false,
          overlayAssetIds: ["progression.locked-door-overlay"],
          overlayAnchorsByAssetId: {
            "progression.locked-door-overlay": { x: 100, y: 95, zFootY: 121, scale: 0.42 }
          }
        }
      },
      placementsById: {
        "fixture-equipment": {
          resourceId: "equipment.fixture.1",
          showBase: false,
          overlayAssetIds: ["progression.delivery-pallet"]
        }
      }
    }
  };
  const before = JSON.stringify(projection);
  const projectedContext = drawingContext();
  renderer.drawScene(projectedContext, { visualState: projection });
  const projectedAssets = projectedContext.calls.map((call) => call[0].assetId);
  assert.deepEqual(projectedAssets.sort(), ["progression.delivery-pallet", "progression.locked-door-overlay"].sort(),
    "projection must replace only the explicitly hidden room/equipment with authored progression overlays");
  assert.equal(JSON.stringify(projection), before, "renderer mutated the simulation-derived projection");

  const queryOnlyContext = createRuntimeContext(false);
  const queryOnlyRenderer = queryOnlyContext.window.PET_CLINIC_VISUAL_V2;
  await queryOnlyRenderer.prepare();
  const queryOnlyDrawingContext = drawingContext();
  queryOnlyRenderer.drawScene(queryOnlyDrawingContext, { visualState: projection });
  assert.deepEqual(queryOnlyDrawingContext.calls.map((call) => call[0].assetId), baselineAssets,
    "URL query alone must not activate the explicit P9 review projection");

  const missingAnchorContext = drawingContext();
  renderer.drawScene(missingAnchorContext, {
    visualState: {
      scene: {
        roomsBySceneId: {
          "fixture-room": {
            showBase: true,
            overlayAssetIds: ["progression.locked-door-overlay"],
            overlayAnchorsByAssetId: {}
          }
        },
        placementsById: {}
      }
    }
  });
  assert.deepEqual(missingAnchorContext.calls.map((call) => call[0].assetId), baselineAssets,
    "room overlay without an explicit reviewed anchor must fail closed");

  const unknownContext = drawingContext();
  renderer.drawScene(unknownContext, {
    visualState: {
      scene: {
        roomsBySceneId: { missing: { showBase: false, overlayAssetIds: ["missing.asset"] } },
        placementsById: {}
      }
    }
  });
  assert.deepEqual(unknownContext.calls.map((call) => call[0].assetId), baselineAssets,
    "unknown bindings must fail closed without hiding or inventing scene objects");

  console.log(JSON.stringify({
    status: "passed",
    baselineAssets,
    projectedAssets,
    projectionInputUnchanged: true,
    queryOnlyActivationForbidden: true,
    missingRoomAnchorFailsClosed: true,
    unknownBindingsFailClosed: true
  }, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
