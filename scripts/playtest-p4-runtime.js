"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const playwrightVersion = require("playwright/package.json").version;
const pinnedPlaywrightVersion = require("../package.json").devDependencies.playwright;

assert.equal(playwrightVersion, pinnedPlaywrightVersion, "installed Playwright does not match package.json");

const GAME_KEY = "pet-clinic-game-tier-01-v2";
const GENERATOR_KEY = "pet-clinic-generator-v2";
const baseUrl = new URL(
  process.env.BASE_URL
    || process.env.PLAYTEST_BASE_URL
    || "http://127.0.0.1:5175/?generatorMode=tier-01-v2"
);
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath();
const artifactRoot = path.resolve(
  process.env.PLAYTEST_ARTIFACT_DIR || path.join(os.tmpdir(), "vetgeme-p4-runtime-playtest")
);

if (!baseUrl.searchParams.has("generatorMode")) baseUrl.searchParams.set("generatorMode", "tier-01-v2");
assert.equal(baseUrl.searchParams.get("generatorMode"), "tier-01-v2");
fs.mkdirSync(artifactRoot, { recursive: true });

const foreignSentinels = Object.freeze({
  "pet-clinic-game-current": "p4-current-game",
  "pet-clinic-game-legacy-v1": "p4-legacy-game",
  "pet-clinic-generator-v1": "p4-legacy-generator"
});

function observePage(page) {
  const issues = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) issues.push(`console ${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.stack || error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) issues.push(`response ${response.status()}: ${response.url()}`);
  });
  return issues;
}

async function waitForReady(page) {
  await page.locator('html[data-app-status="ready"]').waitFor({ state: "attached", timeout: 30000 });
  const detail = await page.evaluate(() => ({
    ready: window.__PET_CLINIC_APP_READY__ || null,
    mode: window.__PET_CLINIC_RUNTIME__?.mode || null,
    saveError: document.body.dataset.saveError || null
  }));
  assert.ok(detail.ready, "readiness detail is missing");
  assert.equal(detail.mode, "tier-01-v2");
  assert.equal(detail.saveError, null);
  return detail;
}

async function readIdentityEvidence(page) {
  return page.evaluate(({ gameKey, generatorKey }) => {
    const rawGame = window.localStorage.getItem(gameKey);
    const rawGenerator = window.localStorage.getItem(generatorKey);
    if (!rawGame || !rawGenerator) throw new Error("Tier save pair is missing");
    const compact = JSON.parse(rawGame);
    const generator = JSON.parse(rawGenerator);
    const runtime = window.__PET_CLINIC_RUNTIME__;
    const expanded = window.PET_CLINIC_GAME_STATE_SAVE.load(window.localStorage, "tier-01-v2", {
      catalog: runtime.catalog,
      campaignIdentity: generator.campaignSeed
    });
    const patient = expanded.state.queue?.[0] || null;
    const ownerId = patient?.persistentOwnerId || null;
    const patientId = patient?.persistentPatientId || null;
    const owner = ownerId ? expanded.state.identityRegistry.owners[ownerId] : null;
    const animal = patientId ? expanded.state.identityRegistry.patients[patientId] : null;
    return {
      gameVersion: compact.gameStateSaveVersion,
      expectedGameVersion: window.PET_CLINIC_GAME_STATE_SAVE.TIER_01_V2_GAME_STATE_SAVE_VERSION,
      storageFormat: compact.state.identityRegistry?.storageFormat || null,
      compactHasExpandedOwners: Object.prototype.hasOwnProperty.call(compact.state.identityRegistry || {}, "owners"),
      campaignSeed: generator.campaignSeed,
      generatedDayOneRaw: JSON.stringify(generator.generatedDays?.["1"] || null),
      ownerId,
      patientId,
      visitId: patient?.v2Visit?.visitId || patient?.visitId || null,
      sourceVisitId: patient?.identitySourceVisitId || null,
      visibleCues: owner?.persistentProfile?.visibleCues || [],
      ownerHistory: owner?.history || [],
      patientHistory: animal?.history || [],
      hasTemperament: Object.prototype.hasOwnProperty.call(animal?.persistentProfile || {}, "temperament"),
      registryContainsClinicalTruth: /"(?:diagnosis|diagnosisId|medicalTruth|clinicalTruth|disease|diseaseId)"\s*:/iu.test(
        JSON.stringify(expanded.state.identityRegistry)
      )
    };
  }, { gameKey: GAME_KEY, generatorKey: GENERATOR_KEY });
}

async function assertForeignStorage(page, label) {
  const actual = await page.evaluate((keys) => Object.fromEntries(
    keys.map((key) => [key, window.localStorage.getItem(key)])
  ), Object.keys(foreignSentinels));
  assert.deepEqual(actual, foreignSentinels, `${label}: foreign mode storage changed`);
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    if (window.sessionStorage.getItem("vetgeme-p4-playtest-initialized") === "1") return;
    window.localStorage.clear();
    window.sessionStorage.setItem("vetgeme-p4-playtest-initialized", "1");
  });
  const page = await context.newPage();
  const issues = observePage(page);

  try {
    const response = await page.goto(baseUrl.href, { waitUntil: "networkidle", timeout: 30000 });
    assert.equal(response?.status(), 200);
    await waitForReady(page);
    const fresh = await readIdentityEvidence(page);
    assert.equal(fresh.gameVersion, fresh.expectedGameVersion);
    assert.equal(fresh.storageFormat, "identity-v4-delta-2");
    assert.equal(fresh.compactHasExpandedOwners, false, "expanded identity registry leaked into localStorage");

    await page.evaluate((sentinels) => {
      Object.entries(sentinels).forEach(([key, value]) => window.localStorage.setItem(key, value));
    }, foreignSentinels);
    await page.locator("#startShiftBtn").click();
    await page.locator("#nextPatientCard .queue-card").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction((gameKey) => {
      const raw = window.localStorage.getItem(gameKey);
      return raw && JSON.parse(raw).state?.queue?.length > 0;
    }, GAME_KEY, { timeout: 15000 });
    if ((await page.locator("#pauseBtn").textContent()) !== "▶") await page.locator("#pauseBtn").click();
    await page.locator("#pauseBtn").filter({ hasText: "▶" }).waitFor({ state: "visible" });

    const arrived = await readIdentityEvidence(page);
    assert.match(arrived.ownerId, /^OWN-[0-9a-f]{16}$/u);
    assert.match(arrived.patientId, /^PAT-[0-9a-f]{16}$/u);
    assert.ok(arrived.visitId);
    assert.equal(arrived.sourceVisitId, arrived.visitId);
    assert.ok(arrived.visibleCues.length > 0, "authored owner cues were not retained");
    assert.equal(arrived.hasTemperament, false, "runtime invented an animal temperament");
    assert.equal(arrived.registryContainsClinicalTruth, false, "identity registry contains clinical truth");
    assert.ok(arrived.ownerHistory.some((event) => event.type === "visit_arrived"));
    assert.ok(arrived.patientHistory.some((event) => event.type === "visit_arrived"));

    await page.locator("#nextPatientCard .queue-card").click();
    await page.locator("#caseWindow").waitFor({ state: "visible", timeout: 10000 });
    const domEvidence = await page.locator("#caseWindow").evaluate((element) => ({
      ownerId: element.dataset.ownerIdentity,
      patientId: element.dataset.patientIdentity,
      cueCount: Number(element.dataset.ownerCueCount)
    }));
    assert.equal(domEvidence.ownerId, arrived.ownerId);
    assert.equal(domEvidence.patientId, arrived.patientId);
    assert.equal(domEvidence.cueCount, arrived.visibleCues.length);
    assert.equal(
      (await page.locator(".owner-observable-cue").innerText()).trim(),
      `Наблюдение: ${arrived.visibleCues[0]}`
    );
    await page.screenshot({ path: path.join(artifactRoot, "01-identity-cue-open-visit.png"), fullPage: true });

    const opened = await readIdentityEvidence(page);
    assert.equal(opened.ownerId, arrived.ownerId);
    assert.ok(opened.ownerHistory.some((event) => event.type === "visit_opened"));
    const generatedDayBeforeReload = opened.generatedDayOneRaw;

    await page.reload({ waitUntil: "networkidle", timeout: 30000 });
    await waitForReady(page);
    await page.locator("#caseWindow").waitFor({ state: "visible", timeout: 10000 });
    const restored = await readIdentityEvidence(page);
    assert.equal(restored.ownerId, arrived.ownerId);
    assert.equal(restored.patientId, arrived.patientId);
    assert.deepEqual(restored.ownerHistory, opened.ownerHistory);
    assert.deepEqual(restored.patientHistory, opened.patientHistory);
    assert.equal(restored.generatedDayOneRaw, generatedDayBeforeReload, "P4 reload changed generated day 1");
    assert.equal(restored.registryContainsClinicalTruth, false);
    await assertForeignStorage(page, "P4 reload");
    await page.screenshot({ path: path.join(artifactRoot, "02-identity-after-reload.png"), fullPage: true });

    assert.deepEqual(issues, [], `browser issues detected:\n${issues.join("\n")}`);
    console.log(JSON.stringify({
      status: "passed",
      baseUrl: baseUrl.href,
      playwrightVersion,
      gameSaveVersion: restored.gameVersion,
      identityStorageFormat: restored.storageFormat,
      ownerId: restored.ownerId,
      patientId: restored.patientId,
      ownerHistoryEvents: restored.ownerHistory.length,
      authoredCueCount: restored.visibleCues.length,
      generatedDayUnchanged: true,
      modeIsolation: true,
      browserIssues: issues,
      artifacts: artifactRoot
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
