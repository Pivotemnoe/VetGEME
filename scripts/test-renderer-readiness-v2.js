"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const rendererSource = fs.readFileSync(path.join(root, "visual/clinic-renderer-v2.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const requiredAnimationIds = [
  "animation.cat-gray",
  "animation.dog-brown",
  "animation.owner-female",
  "animation.owner-male",
  "animation.veterinarian-female",
  "animation.veterinarian-male"
];

const manifest = {
  assets: [
    { id: "room.consult", file: "rooms/consult.png" },
    { id: "furniture.desk", file: "furniture/desk.png" },
    ...requiredAnimationIds.map((id) => ({ id, file: `animations/${id}.png` }))
  ]
};

const layout = {
  rooms: [{ assetId: "room.consult" }],
  placements: [{ assetId: "furniture.desk" }],
  staticActors: [{ animationId: "animation.veterinarian-female" }],
  routeHints: {}
};

function createRuntime({
  enabled = true,
  failingAsset = null,
  failingLoadAsset = null,
  hangingAsset = null,
  hangingFetch = false,
  fetchStatus = 200,
  timeoutMs = 15000
} = {}) {
  const fetched = [];
  const decoded = [];
  const events = [];
  const warnings = [];

  class FakeImage {
    set src(value) {
      this.url = value;
      if (hangingAsset && this.url.includes(hangingAsset)) return;
      queueMicrotask(() => {
        if (failingLoadAsset && this.url.includes(failingLoadAsset)) this.onerror?.();
        else this.onload?.();
      });
    }

    async decode() {
      decoded.push(this.url);
      if (failingAsset && this.url.includes(failingAsset)) {
        throw new Error("synthetic decode failure");
      }
    }
  }

  class FakeCustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }

  const context = {
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
    console: {
      warn: (...args) => warnings.push(args),
      error: (...args) => warnings.push(args)
    },
    document: {
      baseURI: "http://127.0.0.1:5174/",
      documentElement: { dataset: {} }
    },
    fetch: async (url) => {
      fetched.push(String(url));
      if (hangingFetch) return new Promise(() => {});
      return {
        ok: fetchStatus >= 200 && fetchStatus < 300,
        status: fetchStatus,
        json: async () => String(url).includes("manifest.json") ? manifest : layout
      };
    }
  };
  context.window = {
    location: { search: enabled ? "?visualMode=modular-v2" : "" },
    setTimeout,
    clearTimeout,
    dispatchEvent: (event) => events.push(event)
  };
  const source = rendererSource.replace("const LOAD_TIMEOUT_MS = 15000;", `const LOAD_TIMEOUT_MS = ${timeoutMs};`);
  vm.runInNewContext(source, context, { filename: "clinic-renderer-v2.js" });
  return {
    api: context.window.PET_CLINIC_VISUAL_V2,
    decoded,
    events,
    fetched,
    warnings
  };
}

async function main() {
  assert.match(html, /data-app-status="loading"/u, "HTML must start in the loading state");
  assert.match(html, /id="appLoadingVeil"/u, "app-level loading veil is missing");
  assert.match(html, /aria-busy="true"/u, "game shell must be busy before bootstrap");
  assert.match(html, /<main[^>]+inert/u, "game controls must be inert during bootstrap");
  assert.match(game, /gameShell\?\.removeAttribute\("inert"\)/u, "readiness must unlock game controls");
  const restorePosition = game.indexOf("const restoreStatus = restoreGameState();");
  const preparePosition = game.indexOf("await prepareVisualRenderer();", restorePosition);
  const resumePosition = game.indexOf("resumeRestoredGame();", preparePosition);
  assert.ok(restorePosition >= 0 && restorePosition < preparePosition && preparePosition < resumePosition,
    "saved state must be restored before visual preparation and resumed afterwards");
  assert.match(game, /render\(\);[\s\S]*await nextPaint\(\);[\s\S]*loadingVeil\.hidden = true/u,
    "veil must remain until the first complete render");
  assert.match(game, /dataset\.appStatus = "ready"[\s\S]*pet-clinic-app-ready/u,
    "app readiness signal is missing");

  const success = createRuntime();
  assert.equal(success.fetched.length, 0, "renderer must not load before the game restores its state");
  assert.deepEqual(plain(success.api.getStatus()), {
    enabled: true,
    ready: false,
    settled: false,
    fallback: false,
    error: null
  });
  const firstPreparation = success.api.prepare();
  assert.equal(success.api.prepare(), firstPreparation, "prepare must be idempotent");
  const successStatus = await firstPreparation;
  assert.equal(success.fetched.length, 2, "manifest and layout must load exactly once");
  assert.equal(success.decoded.length, manifest.assets.length, "every required image must be decoded");
  assert.deepEqual(plain(successStatus), {
    enabled: true,
    ready: true,
    settled: true,
    fallback: false,
    error: null
  });
  assert.equal(success.events.at(-1)?.type, "pet-clinic-visual-v2-ready");

  const failure = createRuntime({ failingAsset: "rooms/consult.png" });
  const failureStatus = await failure.api.prepare();
  assert.equal(failureStatus.ready, false);
  assert.equal(failureStatus.settled, true);
  assert.equal(failureStatus.fallback, true, "decode failure must settle on the classic renderer");
  assert.match(failureStatus.error, /Не удалось декодировать/u);
  assert.equal(failure.events.at(-1)?.type, "pet-clinic-visual-v2-error");
  assert.equal(failure.warnings.length, 1, "handled fallback must emit one diagnostic warning");

  const loadFailure = createRuntime({ failingLoadAsset: "rooms/consult.png" });
  const loadFailureStatus = await loadFailure.api.prepare();
  assert.equal(loadFailureStatus.fallback, true, "image.onerror must settle on fallback");
  assert.match(loadFailureStatus.error, /Не удалось загрузить/u);

  const httpFailure = createRuntime({ fetchStatus: 503 });
  const httpFailureStatus = await httpFailure.api.prepare();
  assert.equal(httpFailureStatus.fallback, true, "HTTP failure must settle on fallback");
  assert.match(httpFailureStatus.error, /HTTP 503/u);

  const hangingImage = createRuntime({ hangingAsset: "rooms/consult.png", timeoutMs: 5 });
  const hangingImageStatus = await hangingImage.api.prepare();
  assert.equal(hangingImageStatus.fallback, true, "hanging image must time out to fallback");
  assert.match(hangingImageStatus.error, /превышено время ожидания/u);

  const hangingRequest = createRuntime({ hangingFetch: true, timeoutMs: 5 });
  const hangingRequestStatus = await hangingRequest.api.prepare();
  assert.equal(hangingRequestStatus.fallback, true, "hanging fetch must time out to fallback");
  assert.match(hangingRequestStatus.error, /превышено время ожидания/u);

  const disabled = createRuntime({ enabled: false });
  const disabledStatus = await disabled.api.prepare();
  assert.deepEqual(plain(disabledStatus), {
    enabled: false,
    ready: false,
    settled: true,
    fallback: false,
    error: null
  });
  assert.equal(disabled.fetched.length, 0, "classic renderer must not fetch the modular pack");

  console.log(JSON.stringify({
    status: "passed",
    decodedRequiredAssets: success.decoded.length,
    deferredUntilPrepare: true,
    idempotentPrepare: true,
    decodeFailureFallback: true,
    loadAndHttpFailureFallback: true,
    hangingRequestFallback: true,
    controlsInertUntilReady: true,
    classicModeUnchanged: true
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
