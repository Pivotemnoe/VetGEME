"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const rendererSource = fs.readFileSync(path.join(root, "visual/clinic-renderer-v2.js"), "utf8");
const requiredAnimationIds = [
  "animation.cat-gray",
  "animation.dog-brown",
  "animation.owner-female",
  "animation.owner-male",
  "animation.veterinarian-female",
  "animation.veterinarian-male"
];

function animationAsset(id) {
  const role = id.includes("owner")
    ? "owner_animation"
    : id.includes("veterinarian")
      ? "staff_animation"
      : "patient_animation";
  return {
    id,
    file: `assets/${id}.png`,
    role,
    source: { width: 120, height: 60 },
    logical: { width: 65, height: 65 },
    anchorX: 0.5,
    anchorY: 1,
    animation: {
      frameWidth: 60,
      frameHeight: 60,
      frameCount: 2,
      states: { idle: { frames: [0], durationMs: 100, loop: true } }
    }
  };
}

const manifest = {
  assets: [
    {
      id: "room.consult",
      file: "assets/room.consult.png",
      source: { width: 100, height: 100 },
      logical: { width: 100, height: 100 }
    },
    {
      id: "furniture.desk",
      file: "assets/furniture.desk.png",
      source: { width: 20, height: 20 },
      logical: { width: 20, height: 20 },
      anchorX: 0.5,
      anchorY: 1
    },
    ...requiredAnimationIds.map(animationAsset)
  ]
};

const layout = {
  view: { x: 28, y: 42, scale: 0.88 },
  background: { path: { x: 90, y: 90, width: 10, tileSize: 8 } },
  corridor: { tileSize: 8, underlaySegments: [], overlaySegments: [] },
  actorPresentation: {
    anchor: "bottom_center",
    routeCoordinate: "bottom_center",
    runtimeFootOffset: { x: 0, y: 42 },
    animalOffset: { x: 27, y: 2 },
    travelScale: 0.84,
    travelAnimalOffset: { x: 0, y: 2 },
    scaleByRole: {
      staff_animation: 1.12,
      owner_animation: 1.12,
      patient_animation: 1.06
    },
    routeOccupants: { sample: ["owner_animation", "patient_animation"] }
  },
  rooms: [{
    id: "consult",
    assetId: "room.consult",
    position: { x: 0, y: 0 },
    logicalBox: { width: 100, height: 100 },
    foregroundSlice: { sourceY: 80, height: 20, zFootY: 300 }
  }],
  placements: [{
    id: "desk",
    assetId: "furniture.desk",
    x: 50,
    y: 50,
    zFootY: 240,
    layer: "floor"
  }],
  staticActors: [],
  routeHints: { sample: [[10, 20], [30, 40]] }
};

const assetIdByFile = new Map(manifest.assets.map((asset) => [asset.file, asset.id]));

class FakeImage {
  set src(value) {
    const pathname = new URL(value).pathname.replace(/^\//u, "");
    this.assetId = assetIdByFile.get(pathname);
    queueMicrotask(() => this.onload?.());
  }

  async decode() {}
}

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

const runtime = {
  URL,
  URLSearchParams,
  Promise,
  Map,
  Set,
  AbortController,
  Image: FakeImage,
  CustomEvent: FakeCustomEvent,
  queueMicrotask,
  setTimeout,
  clearTimeout,
  console,
  document: {
    baseURI: "http://127.0.0.1:5174/",
    documentElement: { dataset: {} }
  },
  fetch: async (url) => ({
    ok: true,
    status: 200,
    json: async () => String(url).includes("manifest.json") ? manifest : layout
  })
};
runtime.window = {
  location: { search: "?visualMode=modular-v2" },
  setTimeout,
  clearTimeout,
  dispatchEvent() {}
};

vm.runInNewContext(rendererSource, runtime, { filename: "clinic-renderer-v2.js" });

async function main() {
  const api = runtime.window.PET_CLINIC_VISUAL_V2;
  await api.prepare();

  const drawCalls = [];
  const context = {
    imageSmoothingEnabled: true,
    drawImage: (...args) => drawCalls.push(args),
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
  api.drawScene(context, {
    time: 0,
    actors: [
      { id: "owner-behind", animationId: "animation.owner-female", state: "idle", x: 30, y: 200, zFootY: 200 },
      { id: "owner-front", animationId: "animation.owner-male", state: "idle", x: 70, y: 260, zFootY: 260 }
    ]
  });

  const order = drawCalls.map((call) => call[0].assetId);
  assert.deepEqual(order, [
    "room.consult",
    "animation.owner-female",
    "furniture.desk",
    "animation.owner-male",
    "room.consult"
  ], "room foreground, furniture and actors must share one depth order");
  assert.equal(context.imageSmoothingEnabled, false, "pixel art smoothing must stay disabled");

  const ownerDraw = drawCalls.find((call) => call[0].assetId === "animation.owner-female");
  assert.equal(ownerDraw[7], 73, "scene role scale must apply to actor width");
  assert.equal(ownerDraw[8], 73, "scene role scale must apply to actor height");

  assert.deepEqual(JSON.parse(JSON.stringify(api.route("sample"))), [[10, 20], [30, 40]]);
  const firstMetrics = api.getSceneMetrics();
  firstMetrics.view.x = 999;
  firstMetrics.actorPresentation.travelAnimalOffset.x = 999;
  firstMetrics.actorPresentation.routeOccupants.sample.push("staff_animation");
  assert.equal(api.getSceneMetrics().view.x, 28, "scene metrics must be returned as defensive copies");
  assert.equal(api.getSceneMetrics().actorPresentation.travelAnimalOffset.x, 0);
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.getSceneMetrics().actorPresentation.routeOccupants.sample)),
    ["owner_animation", "patient_animation"]
  );

  console.log(JSON.stringify({
    status: "passed",
    depthOrder: order,
    actorScale: ownerDraw[7],
    routeCoordinate: api.getSceneMetrics().actorPresentation.routeCoordinate
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
