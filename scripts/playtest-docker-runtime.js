"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const playwrightVersion = require("playwright/package.json").version;
const pinnedPlaywrightVersion = require("../package.json").devDependencies.playwright;

assert.equal(playwrightVersion, pinnedPlaywrightVersion, "installed Playwright does not match package.json");

const port = process.env.VETGEME_PORT || "5174";
const baseUrl = new URL(
  process.env.PLAYTEST_BASE_URL
    || process.env.DOCKER_BASE_URL
    || process.env.VETGEME_BASE_URL
    || `http://127.0.0.1:${port}/`,
);
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath();
const artifactRoot = path.resolve(
  process.env.PLAYTEST_ARTIFACT_DIR || path.join(os.tmpdir(), "vetgeme-docker-playtest"),
);
const modes = [
  { id: "current", generatorMode: "current", saveKey: "pet-clinic-game-current", catalog: false, generator: false, visual: false },
  { id: "legacy-v1", generatorMode: "legacy-v1", saveKey: "pet-clinic-game-legacy-v1", catalog: false, generator: true, visual: false },
  { id: "tier-01-v2", generatorMode: "tier-01-v2", saveKey: "pet-clinic-game-tier-01-v2", catalog: true, generator: true, visual: false },
  { id: "tier-01-v2-modular", generatorMode: "tier-01-v2", visualMode: "modular-v2", saveKey: "pet-clinic-game-tier-01-v2", catalog: true, generator: true, visual: true },
];

fs.mkdirSync(artifactRoot, { recursive: true });

async function installCspObserver(context) {
  await context.addInitScript(() => {
    window.__VETGEME_CSP_VIOLATIONS__ = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__VETGEME_CSP_VIOLATIONS__.push({
        blockedURI: event.blockedURI,
        effectiveDirective: event.effectiveDirective,
        violatedDirective: event.violatedDirective,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber,
      });
    });
  });
}

function observePage(page) {
  const issues = [];
  const requests = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      issues.push(`console ${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.stack || error.message}`));
  page.on("requestfailed", (request) => {
    issues.push(`requestfailed: ${request.method()} ${request.url()} (${request.failure()?.errorText || "unknown"})`);
  });
  page.on("request", (request) => {
    requests.push({ method: request.method(), url: request.url() });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      issues.push(`response ${response.status()}: ${response.request().method()} ${response.url()}`);
    }
  });
  return { issues, requests };
}

async function waitForReady(page) {
  await page.locator('html[data-app-status="ready"]').waitFor({ state: "attached", timeout: 30000 });
  return page.evaluate(() => ({
    detail: window.__PET_CLINIC_APP_READY__ || null,
    configuredMode: window.PET_CLINIC_GENERATOR_MODE?.mode || null,
    saveKey: window.PET_CLINIC_GENERATOR_MODE?.gameSaveKey || null,
    runtimeMode: window.__PET_CLINIC_RUNTIME__?.mode || null,
    hasCatalog: Boolean(window.__PET_CLINIC_RUNTIME__?.catalog),
    hasGenerator: Boolean(window.__PET_CLINIC_RUNTIME__?.generator),
    catalogCaseCount: window.__PET_CLINIC_RUNTIME__?.catalog?.cases?.length ?? null,
    medicalLoadContext: window.__PET_CLINIC_RUNTIME__?.catalog?.medicalCatalog?.loadContext ?? null,
    medicalProductionPool: window.__PET_CLINIC_RUNTIME__?.catalog?.medicalCatalog
      ? {
          families: window.__PET_CLINIC_RUNTIME__.catalog.medicalCatalog.productionPool?.families?.length ?? null,
          variants: window.__PET_CLINIC_RUNTIME__.catalog.medicalCatalog.productionPool?.variants?.length ?? null,
          presentations: window.__PET_CLINIC_RUNTIME__.catalog.medicalCatalog.productionPool?.presentations?.length ?? null,
        }
      : null,
    initializationError: window.__PET_CLINIC_RUNTIME__?.initializationError?.message || null,
    appStatus: document.documentElement.dataset.appStatus,
    shellBusy: document.querySelector(".game-shell")?.getAttribute("aria-busy"),
    shellInert: document.querySelector(".game-shell")?.hasAttribute("inert"),
    veilHidden: document.querySelector("#appLoadingVeil")?.hidden,
  }));
}

function assertReady(evidence, mode) {
  assert.ok(evidence.detail, `${mode.id}: readiness detail is missing`);
  assert.equal(evidence.detail.mode, mode.generatorMode, `${mode.id}: readiness reports another mode`);
  assert.equal(evidence.configuredMode, mode.generatorMode, `${mode.id}: generator mode selection is wrong`);
  assert.equal(evidence.runtimeMode, mode.generatorMode, `${mode.id}: runtime initialized another mode`);
  assert.equal(evidence.saveKey, mode.saveKey, `${mode.id}: save namespace changed`);
  assert.equal(evidence.hasCatalog, mode.catalog, `${mode.id}: unexpected catalog readiness`);
  assert.equal(evidence.hasGenerator, mode.generator, `${mode.id}: unexpected generator readiness`);
  assert.equal(
    evidence.catalogCaseCount,
    mode.catalog ? 30 : null,
    `${mode.id}: active compatibility case count changed`,
  );
  assert.equal(
    evidence.medicalLoadContext,
    mode.catalog ? "review" : null,
    `${mode.id}: medical load context changed`,
  );
  assert.deepEqual(
    evidence.medicalProductionPool,
    mode.catalog ? { families: 0, variants: 0, presentations: 0 } : null,
    `${mode.id}: pending medical content entered the production pool`,
  );
  assert.equal(evidence.initializationError, null, `${mode.id}: generator initialization failed`);
  assert.equal(evidence.appStatus, "ready", `${mode.id}: HTML is not ready`);
  assert.equal(evidence.shellBusy, "false", `${mode.id}: shell is still busy`);
  assert.equal(evidence.shellInert, false, `${mode.id}: shell is still inert`);
  assert.equal(evidence.veilHidden, true, `${mode.id}: loading veil is still visible`);
  assert.deepEqual(evidence.detail.visualStatus, {
    enabled: mode.visual,
    ready: mode.visual,
    settled: true,
    fallback: false,
    error: null,
  }, `${mode.id}: default visual readiness changed`);
}

async function testMode(browser, mode) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await installCspObserver(context);
  const page = await context.newPage();
  const observed = observePage(page);
  const url = new URL("/", baseUrl);
  url.searchParams.set("generatorMode", mode.generatorMode);
  if (mode.visualMode) url.searchParams.set("visualMode", mode.visualMode);
  url.searchParams.set("dockerSmoke", "1");

  try {
    const navigation = await page.goto(url.href, { waitUntil: "networkidle", timeout: 30000 });
    assert.ok(navigation, `${mode.id}: navigation returned no response`);
    assert.equal(navigation.status(), 200, `${mode.id}: navigation failed`);
    assert.ok(navigation.headers()["content-security-policy"], `${mode.id}: CSP header is missing`);
    const initial = await waitForReady(page);
    assertReady(initial, mode);
    const initialCspViolations = await page.evaluate(() => window.__VETGEME_CSP_VIOLATIONS__ || []);
    assert.deepEqual(initialCspViolations, [], `${mode.id}: CSP violations detected on first load`);

    const sentinelKey = `vetgeme-docker-smoke-${mode.id}`;
    const sentinelValue = `local-storage-${mode.id}`;
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: sentinelKey,
      value: sentinelValue,
    });

    await page.reload({ waitUntil: "networkidle", timeout: 30000 });
    const restored = await waitForReady(page);
    assertReady(restored, mode);
    const persisted = await page.evaluate((key) => localStorage.getItem(key), sentinelKey);
    assert.equal(persisted, sentinelValue, `${mode.id}: localStorage did not survive reload`);

    const cspViolations = await page.evaluate(() => window.__VETGEME_CSP_VIOLATIONS__ || []);
    assert.deepEqual(cspViolations, [], `${mode.id}: CSP violations detected`);
    assert.deepEqual(observed.issues, [], `${mode.id}: browser issues detected:\n${observed.issues.join("\n")}`);
    assert.ok(observed.requests.length > 0, `${mode.id}: no browser requests were observed`);
    const reviewInputRequests = observed.requests.filter((request) => (
      new URL(request.url).pathname.startsWith("/content/review-inputs/")
    ));
    assert.deepEqual(
      reviewInputRequests,
      [],
      `${mode.id}: review-only authoring input was requested by the browser runtime`,
    );
    for (const request of observed.requests) {
      assert.ok(["GET", "HEAD"].includes(request.method), `${mode.id}: ${request.method} ${request.url}`);
      const requestUrl = new URL(request.url);
      if (["http:", "https:"].includes(requestUrl.protocol)) {
        assert.equal(requestUrl.origin, baseUrl.origin, `${mode.id}: cross-origin request ${request.url}`);
      } else {
        assert.equal(requestUrl.protocol, "data:", `${mode.id}: unexpected request scheme ${request.url}`);
      }
    }
    if (mode.visual) {
      const runtimeAssetRequests = observed.requests.filter((request) => (
        new URL(request.url).pathname.startsWith("/art/runtime-v2/")
      ));
      assert.ok(runtimeAssetRequests.length >= 10, `${mode.id}: modular visual assets were not loaded`);
      assert.ok(
        runtimeAssetRequests.some((request) => new URL(request.url).pathname.endsWith("/manifest.json")),
        `${mode.id}: visual manifest was not requested`,
      );
      assert.ok(
        runtimeAssetRequests.some((request) => new URL(request.url).pathname.endsWith("/scene-layout.json")),
        `${mode.id}: visual layout was not requested`,
      );
      assert.ok(
        runtimeAssetRequests.some((request) => new URL(request.url).pathname.endsWith(".png")),
        `${mode.id}: visual PNG assets were not requested`,
      );
    }

    const screenshot = path.join(artifactRoot, `${mode.id}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    return {
      mode: mode.id,
      initial,
      restored,
      sentinel: { key: sentinelKey, value: persisted },
      requestCount: observed.requests.length,
      requestMethods: [...new Set(observed.requests.map((request) => request.method))].sort(),
      reviewInputRequestCount: reviewInputRequests.length,
      screenshot,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  try {
    const results = [];
    for (const mode of modes) results.push(await testMode(browser, mode));
    console.log(JSON.stringify({
      status: "passed",
      baseUrl: baseUrl.href,
      playwrightVersion,
      artifacts: artifactRoot,
      modes: results,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

const keepAlive = setInterval(() => {}, 1000);
main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => clearInterval(keepAlive));
