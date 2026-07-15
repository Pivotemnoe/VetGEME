"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const playwrightVersion = require("playwright/package.json").version;
const pinnedPlaywrightVersion = require("../package.json").devDependencies.playwright;

assert.equal(playwrightVersion, pinnedPlaywrightVersion, "installed Playwright does not match package.json");

const ACTIVE_GAME_KEY = "pet-clinic-game-tier-01-v2";
const ACTIVE_GENERATOR_KEY = "pet-clinic-generator-v2";
const MODE_KEY = "pet-clinic-generator-mode";
const REMOVE_LOG_KEY = "vetgeme-p3-playtest-remove-log";
const baseUrl = new URL(
  process.env.BASE_URL
    || process.env.PLAYTEST_BASE_URL
    || "http://127.0.0.1:5175/?generatorMode=tier-01-v2",
);
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath();
const artifactRoot = path.resolve(
  process.env.PLAYTEST_ARTIFACT_DIR || path.join(os.tmpdir(), "vetgeme-p3-runtime-playtest"),
);

if (!baseUrl.searchParams.has("generatorMode")) baseUrl.searchParams.set("generatorMode", "tier-01-v2");
assert.equal(baseUrl.searchParams.get("generatorMode"), "tier-01-v2", "P3 smoke must run in tier-01-v2 mode");
fs.mkdirSync(artifactRoot, { recursive: true });

const activeBackupKeys = [
  `${ACTIVE_GAME_KEY}:migration-source:v1`,
  `${ACTIVE_GAME_KEY}:migration-source:v5`,
  `${ACTIVE_GAME_KEY}:migration-source:v999`,
  `${ACTIVE_GENERATOR_KEY}:migration-source:v1`,
  `${ACTIVE_GENERATOR_KEY}:migration-source:v6`,
  `${ACTIVE_GENERATOR_KEY}:migration-source:v999`,
];

const foreignSentinels = Object.freeze({
  "pet-clinic-game-current": JSON.stringify({ sentinel: "current-game", owner: "p3-playtest" }),
  "pet-clinic-game-legacy-v1": JSON.stringify({ sentinel: "legacy-game", owner: "p3-playtest" }),
  "pet-clinic-generator-v1": JSON.stringify({ sentinel: "legacy-generator", owner: "p3-playtest" }),
  "pet-clinic-game-current:migration-source:v1": "current-game-backup-sentinel",
  "pet-clinic-game-legacy-v1:migration-source:v1": "legacy-game-backup-sentinel",
  "pet-clinic-generator-v1:migration-source:v1": "legacy-generator-backup-sentinel",
});

function observePage(page) {
  const issues = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      issues.push(`console ${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.stack || error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) issues.push(`response ${response.status()}: ${response.url()}`);
  });
  return issues;
}

async function installRemoveObserver(context) {
  await context.addInitScript((logKey) => {
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function removeItem(key) {
      if (this === window.localStorage) {
        let log = [];
        try {
          log = JSON.parse(window.sessionStorage.getItem(logKey) || "[]");
        } catch (_error) {
          log = [];
        }
        log.push(String(key));
        window.sessionStorage.setItem(logKey, JSON.stringify(log));
      }
      return originalRemoveItem.call(this, key);
    };
  }, REMOVE_LOG_KEY);
}

async function waitForReady(page) {
  await page.locator('html[data-app-status="ready"]').waitFor({ state: "attached", timeout: 30000 });
  const evidence = await page.evaluate(() => ({
    ready: window.__PET_CLINIC_APP_READY__ || null,
    runtimeMode: window.__PET_CLINIC_RUNTIME__?.mode || null,
    configuredMode: window.PET_CLINIC_GENERATOR_MODE?.mode || null,
    gameSaveKey: window.PET_CLINIC_GENERATOR_MODE?.gameSaveKey || null,
    saveError: document.body.dataset.saveError || null,
  }));
  assert.ok(evidence.ready, "application readiness detail is missing");
  assert.equal(evidence.ready.mode, "tier-01-v2", "readiness reports another mode");
  assert.equal(evidence.runtimeMode, "tier-01-v2", "runtime initialized another mode");
  assert.equal(evidence.configuredMode, "tier-01-v2", "generator mode preference is wrong");
  assert.equal(evidence.gameSaveKey, ACTIVE_GAME_KEY, "tier game-save namespace changed");
  assert.equal(evidence.saveError, null, "runtime reported a game save error");
  return evidence;
}

async function storageSnapshot(page) {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(window.localStorage)
      .sort()
      .map((key) => [key, window.localStorage.getItem(key)]),
  ));
}

async function readCampaign(page) {
  return page.evaluate(({ gameKey, generatorKey, modeKey }) => {
    const parse = (key) => {
      const raw = window.localStorage.getItem(key);
      if (raw === null) throw new Error(`Missing localStorage key ${key}`);
      return { raw, value: JSON.parse(raw) };
    };
    const game = parse(gameKey);
    const generator = parse(generatorKey);
    return {
      gameRaw: game.raw,
      generatorRaw: generator.raw,
      gameVersion: game.value.gameStateSaveVersion,
      expectedGameVersion: window.PET_CLINIC_GAME_STATE_SAVE?.TIER_01_V2_GAME_STATE_SAVE_VERSION,
      generatorVersion: generator.value.saveVersion,
      expectedGeneratorVersion: window.PET_CLINIC_GENERATOR_V2?.SAVE_VERSION,
      day: game.value.state?.day,
      phase: game.value.state?.phase,
      campaignSeed: generator.value.campaignSeed,
      generatedDays: Object.keys(generator.value.generatedDays || {}).sort(),
      generatorModePreference: window.localStorage.getItem(modeKey),
    };
  }, { gameKey: ACTIVE_GAME_KEY, generatorKey: ACTIVE_GENERATOR_KEY, modeKey: MODE_KEY });
}

function assertFreshDayOne(campaign, label) {
  assert.equal(campaign.gameVersion, campaign.expectedGameVersion, `${label}: game save version is stale`);
  assert.equal(campaign.generatorVersion, campaign.expectedGeneratorVersion, `${label}: generator save version is stale`);
  assert.equal(campaign.day, 1, `${label}: campaign did not open on day 1`);
  assert.equal(campaign.phase, "planning", `${label}: campaign did not open in planning`);
  assert.equal(typeof campaign.campaignSeed, "string", `${label}: campaignSeed is not a string`);
  assert.ok(campaign.campaignSeed.trim(), `${label}: campaignSeed is empty`);
  assert.ok(campaign.generatedDays.includes("1"), `${label}: generated day 1 was not persisted`);
  assert.equal(campaign.generatorModePreference, "tier-01-v2", `${label}: generatorMode preference changed`);
}

function confirmPromise(page, action, expectedPattern) {
  return new Promise((resolve, reject) => {
    page.once("dialog", async (dialog) => {
      try {
        assert.equal(dialog.type(), "confirm", "new-game action must use a confirm dialog");
        assert.match(dialog.message(), expectedPattern, "new-game confirmation copy changed unexpectedly");
        if (action === "accept") await dialog.accept();
        else await dialog.dismiss();
        resolve(dialog.message());
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function seedResetFixtures(page) {
  await page.evaluate(({ backups, foreign }) => {
    backups.forEach((key, index) => window.localStorage.setItem(key, `active-backup-${index + 1}`));
    Object.entries(foreign).forEach(([key, value]) => window.localStorage.setItem(key, value));
  }, { backups: activeBackupKeys, foreign: foreignSentinels });
}

async function assertForeignSentinels(page, label) {
  const actual = await page.evaluate((keys) => Object.fromEntries(
    keys.map((key) => [key, window.localStorage.getItem(key)]),
  ), Object.keys(foreignSentinels));
  assert.deepEqual(actual, foreignSentinels, `${label}: current/legacy storage was changed by tier reset`);
}

async function injectCriticalResult(page) {
  return page.evaluate(({ gameKey }) => {
    const raw = window.localStorage.getItem(gameKey);
    if (raw === null) throw new Error("Tier game save is missing before research injection");
    const snapshot = JSON.parse(raw);
    const patient = snapshot.state?.queue?.[0];
    if (!patient?.v2Visit) throw new Error("No persisted tier queue patient is available for research injection");
    const catalog = window.__PET_CLINIC_RUNTIME__?.catalog;
    if (!catalog) throw new Error("Tier content catalog is unavailable");
    const visit = patient.v2Visit.medicalContent
      ? patient.v2Visit
      : window.PET_CLINIC_COMPACT_VISIT_V2.hydrateVisit(patient.v2Visit, catalog);
    const test = visit.medicalContent?.diagnosticTests?.[0];
    const authoredResultText = typeof test?.resultText === "string" && test.resultText.trim()
      ? test.resultText
      : test?.text;
    if (!test?.id || typeof authoredResultText !== "string" || !authoredResultText.trim()) {
      throw new Error("Queue patient has no fully authored diagnostic test result");
    }

    const api = window.PET_CLINIC_RESEARCH_ORDERS_V3;
    if (!api) throw new Error("Research-order runtime API is unavailable");
    const existing = Array.isArray(snapshot.state.researchOrders) ? snapshot.state.researchOrders : [];
    const id = api.allocateResearchOrderId(existing);
    const visitId = String(visit.visitId);
    const createdAt = (Number(snapshot.state.day) - 1) * 1440 + Math.floor(Number(snapshot.state.minute));
    const input = {
      id,
      caseId: String(visit.caseId),
      patientId: String(patient.persistentPatientId || `visit-${visitId}-patient`),
      encounterId: visitId,
      researchId: String(test.id),
      route: String(test.route || test.type || "local"),
      sampleRequired: true,
      createdAt,
    };
    if (typeof snapshot.state.selectedDoctorId === "string" && snapshot.state.selectedDoctorId) {
      input.createdBy = snapshot.state.selectedDoctorId;
    }
    let order = api.createResearchOrder(input);
    const transition = (to, payload) => {
      order = api.applyResearchTransition(order, {
        commandId: `${id}:playtest:${to}`,
        to,
        at: createdAt,
        payload,
      }).order;
    };
    transition("owner_accepted", { ownerDecision: { decision: "accepted", source: "browser_playtest" } });
    transition("sample_planned", { samplePlan: { source: "browser_playtest", researchId: test.id } });
    transition("sample_collected", { sampleCollection: { source: "browser_playtest", researchId: test.id } });
    transition("sent_or_queued", { dispatch: { source: "browser_playtest", route: input.route } });
    transition("processing", { processing: { source: "browser_playtest", status: "completed" } });
    transition("resulted", {
      authoredResult: {
        resultRefId: String(test.id),
        text: authoredResultText,
        source: "diagnostic_test",
        critical: true,
      },
    });
    const validation = api.validateResearchOrder(order);
    if (!validation.valid) throw new Error(`Injected research order is invalid: ${validation.errors.join(", ")}`);

    snapshot.state.researchOrders = [...existing, order];
    snapshot.state.phase = "running";
    snapshot.state.dayStarted = true;
    snapshot.state.paused = false;
    snapshot.state.activeId = null;
    snapshot.state.minute = snapshot.state.dayEnd;
    window.localStorage.setItem(gameKey, JSON.stringify(snapshot));
    return {
      orderId: id,
      patientId: input.patientId,
      encounterId: visitId,
      caseId: input.caseId,
      researchId: input.researchId,
      status: order.status,
      critical: order.authoredResult.critical,
    };
  }, { gameKey: ACTIVE_GAME_KEY });
}

async function readCloseShiftState(page) {
  const summary = (await page.locator("#closeShiftSummary").innerText()).replace(/\s+/gu, " ").trim();
  return {
    summary,
    finishDisabled: await page.locator("#finishShiftBtn").isDisabled(),
    transferDisabled: await page.locator("#transferQueueBtn").isDisabled(),
    reviewButtons: await page.locator(".close-shift-results button").allTextContents(),
  };
}

async function readResearchOrder(page, orderId) {
  return page.evaluate(({ gameKey, id }) => {
    const snapshot = JSON.parse(window.localStorage.getItem(gameKey));
    const order = snapshot.state.researchOrders.find((item) => item.id === id);
    return order || null;
  }, { gameKey: ACTIVE_GAME_KEY, id: orderId });
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installRemoveObserver(context);
  const page = await context.newPage();
  const issues = observePage(page);

  try {
    const navigation = await page.goto(baseUrl.href, { waitUntil: "networkidle", timeout: 30000 });
    assert.ok(navigation, "initial navigation returned no response");
    assert.equal(navigation.status(), 200, "initial navigation failed");
    const initialReady = await waitForReady(page);
    const initialCampaign = await readCampaign(page);
    assertFreshDayOne(initialCampaign, "fresh boot");
    await page.screenshot({ path: path.join(artifactRoot, "01-fresh-day-one.png"), fullPage: true });

    await seedResetFixtures(page);
    await page.locator("#startShiftBtn").click();
    await page.locator("#shiftWindow").waitFor({ state: "hidden" });
    await page.locator("#pauseBtn").click();
    await page.locator("#pauseBtn").filter({ hasText: "▶" }).waitFor({ state: "visible" });
    await page.locator("#developerBtn").click();
    await page.locator("#developerPanel").waitFor({ state: "visible" });
    const beforeCancel = await storageSnapshot(page);
    const cancelDialog = confirmPromise(page, "dismiss", /Начать новую игру/u);
    await Promise.all([cancelDialog, page.locator("#newGameBtn").click()]);
    const afterCancel = await storageSnapshot(page);
    assert.deepEqual(afterCancel, beforeCancel, "cancelled new game changed localStorage");
    await page.screenshot({ path: path.join(artifactRoot, "02-new-game-cancelled.png"), fullPage: true });

    const previousSeed = initialCampaign.campaignSeed;
    const acceptDialog = confirmPromise(page, "accept", /Начать новую игру/u);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
      acceptDialog,
      page.locator("#newGameBtn").click(),
    ]);
    await page.waitForLoadState("networkidle", { timeout: 30000 });
    const resetReady = await waitForReady(page);
    const resetCampaign = await readCampaign(page);
    assertFreshDayOne(resetCampaign, "confirmed reset");
    assert.notEqual(resetCampaign.campaignSeed, previousSeed, "confirmed reset reused the previous campaignSeed");
    assert.notEqual(resetCampaign.gameRaw, initialCampaign.gameRaw, "confirmed reset reused the previous game save");
    assert.notEqual(resetCampaign.generatorRaw, initialCampaign.generatorRaw, "confirmed reset reused the previous generator save");

    const resetStorage = await storageSnapshot(page);
    activeBackupKeys.forEach((key) => assert.equal(resetStorage[key], undefined, `active backup survived reset: ${key}`));
    await assertForeignSentinels(page, "confirmed reset");
    assert.equal(resetStorage[MODE_KEY], "tier-01-v2", "confirmed reset deleted generatorMode preference");
    const removalLog = await page.evaluate((key) => JSON.parse(window.sessionStorage.getItem(key) || "[]"), REMOVE_LOG_KEY);
    [ACTIVE_GAME_KEY, ACTIVE_GENERATOR_KEY, ...activeBackupKeys].forEach((key) => {
      assert.ok(removalLog.includes(key), `reset did not remove active key before reload: ${key}`);
    });

    await page.locator("#startShiftBtn").click();
    await page.locator("#nextPatientCard .queue-card").waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction((gameKey) => {
      const raw = window.localStorage.getItem(gameKey);
      return raw && JSON.parse(raw).state?.queue?.length > 0;
    }, ACTIVE_GAME_KEY, { timeout: 15000 });
    if ((await page.locator("#pauseBtn").textContent()) !== "▶") await page.locator("#pauseBtn").click();
    await page.locator("#pauseBtn").filter({ hasText: "▶" }).waitFor({ state: "visible" });

    const injected = await injectCriticalResult(page);
    assert.equal(injected.status, "resulted", "injected research order did not reach resulted");
    assert.equal(injected.critical, true, "injected result is not explicitly critical");
    await page.reload({ waitUntil: "networkidle", timeout: 30000 });
    await waitForReady(page);
    await page.locator("#closeShiftWindow").waitFor({ state: "visible", timeout: 10000 });
    const criticalClose = await readCloseShiftState(page);
    assert.match(criticalClose.summary, /Непросмотренных результатов:\s*1/u, "close shift did not count the result");
    assert.match(criticalClose.summary, /Из них критических:\s*1/u, "close shift did not count the critical result");
    assert.match(criticalClose.summary, /Ожидают связи с владельцем:\s*0/u, "unreviewed result was counted as owner contact");
    assert.equal(criticalClose.finishDisabled, true, "finish remained enabled with a critical result");
    assert.equal(criticalClose.transferDisabled, true, "transfer remained enabled with a critical result");
    assert.equal(criticalClose.reviewButtons.length, 1, "critical result has no unique review action");
    assert.match(criticalClose.reviewButtons[0], new RegExp(injected.researchId, "u"), "review action references another result");
    await page.screenshot({ path: path.join(artifactRoot, "03-critical-result-blocks-close.png"), fullPage: true });

    await page.locator(".close-shift-results button").click();
    const reviewedImmediately = await readCloseShiftState(page);
    assert.match(reviewedImmediately.summary, /Из них критических:\s*0/u, "review did not clear critical count");
    assert.match(reviewedImmediately.summary, /Ожидают связи с владельцем:\s*1/u, "review did not create owner-contact obligation");
    const persistedReview = await readResearchOrder(page, injected.orderId);
    assert.equal(persistedReview?.status, "reviewed_by_doctor", "review transition was not persisted");
    assert.equal(typeof persistedReview?.review?.reviewerId, "string", "reviewer identity was not persisted");

    await page.reload({ waitUntil: "networkidle", timeout: 30000 });
    const reviewedReady = await waitForReady(page);
    await page.locator("#closeShiftWindow").waitFor({ state: "visible", timeout: 10000 });
    const reviewedAfterReload = await readCloseShiftState(page);
    assert.match(reviewedAfterReload.summary, /Непросмотренных результатов:\s*0/u, "reviewed result became unreviewed after reload");
    assert.match(reviewedAfterReload.summary, /Из них критических:\s*0/u, "critical count returned after reload");
    assert.match(reviewedAfterReload.summary, /Ожидают связи с владельцем:\s*1/u, "owner-contact obligation was lost on reload");
    assert.equal(reviewedAfterReload.transferDisabled, false, "critical-only transfer block survived review");
    const reloadedReview = await readResearchOrder(page, injected.orderId);
    assert.equal(reloadedReview?.status, "reviewed_by_doctor", "review status changed after reload");
    await assertForeignSentinels(page, "P3 research lifecycle");
    await page.screenshot({ path: path.join(artifactRoot, "04-reviewed-result-after-reload.png"), fullPage: true });

    assert.deepEqual(issues, [], `browser issues detected:\n${issues.join("\n")}`);
    console.log(JSON.stringify({
      status: "passed",
      baseUrl: baseUrl.href,
      playwrightVersion,
      chromiumPath,
      artifacts: artifactRoot,
      initialReady,
      resetReady,
      reviewedReady,
      seed: { before: previousSeed, after: resetCampaign.campaignSeed },
      removedKeys: removalLog,
      injected,
      criticalClose,
      reviewedAfterReload,
      browserIssues: issues,
    }, null, 2));
  } finally {
    await context.close();
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
