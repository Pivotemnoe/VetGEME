"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const playwrightVersion = require("playwright/package.json").version;
const pinnedPlaywrightVersion = require("../package.json").devDependencies.playwright;

assert.equal(playwrightVersion, pinnedPlaywrightVersion, "installed Playwright does not match package.json");

const MODE_KEY = "pet-clinic-generator-mode";
const REMOVE_LOG_KEY = "vetgeme-new-game-reset-remove-log";
const GAME_KEYS = Object.freeze({
  current: "pet-clinic-game-current",
  "legacy-v1": "pet-clinic-game-legacy-v1",
  "tier-01-v2": "pet-clinic-game-tier-01-v2",
});
const GENERATOR_KEYS = Object.freeze({
  "legacy-v1": "pet-clinic-generator-v1",
  "tier-01-v2": "pet-clinic-generator-v2",
});
const MODES = Object.freeze([
  {
    mode: "current",
    dialogPattern: /текущий режим/u,
  },
  {
    mode: "legacy-v1",
    dialogPattern: /legacy-v1/u,
  },
  {
    mode: "tier-01-v2",
    dialogPattern: /tier-01-v2/u,
  },
]);
const baseUrl = new URL(
  process.env.BASE_URL
    || process.env.PLAYTEST_BASE_URL
    || "http://127.0.0.1:5175/",
);
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath();
const artifactRoot = path.resolve(
  process.env.PLAYTEST_ARTIFACT_DIR || path.join(os.tmpdir(), "vetgeme-new-game-reset-playtest"),
);

fs.mkdirSync(artifactRoot, { recursive: true });

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

function targetUrl(mode) {
  const target = new URL(baseUrl.href);
  target.searchParams.set("generatorMode", mode);
  target.searchParams.set("newGameMatrix", mode);
  return target;
}

async function waitForReady(page, spec) {
  await page.locator('html[data-app-status="ready"]').waitFor({ state: "attached", timeout: 30000 });
  const evidence = await page.evaluate(() => ({
    ready: window.__PET_CLINIC_APP_READY__ || null,
    runtimeMode: window.__PET_CLINIC_RUNTIME__?.mode || null,
    configuredMode: window.PET_CLINIC_GENERATOR_MODE?.mode || null,
    gameSaveKey: window.PET_CLINIC_GENERATOR_MODE?.gameSaveKey || null,
    saveError: document.body.dataset.saveError || null,
  }));
  assert.ok(evidence.ready, `${spec.mode}: application readiness detail is missing`);
  assert.equal(evidence.ready.mode, spec.mode, `${spec.mode}: readiness reports another mode`);
  assert.equal(evidence.runtimeMode, spec.mode, `${spec.mode}: runtime initialized another mode`);
  assert.equal(evidence.configuredMode, spec.mode, `${spec.mode}: configured mode changed`);
  assert.equal(evidence.gameSaveKey, GAME_KEYS[spec.mode], `${spec.mode}: game-save namespace changed`);
  assert.equal(evidence.saveError, null, `${spec.mode}: runtime reported a game save error`);
  return evidence.ready;
}

async function storageSnapshot(page) {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(window.localStorage)
      .sort()
      .map((key) => [key, window.localStorage.getItem(key)]),
  ));
}

async function readCampaign(page, spec) {
  return page.evaluate(({ mode, gameKey, generatorKey, modeKey }) => {
    const gameRaw = window.localStorage.getItem(gameKey);
    if (gameRaw === null) throw new Error(`Missing localStorage key ${gameKey}`);
    const game = JSON.parse(gameRaw);
    const generatorRaw = generatorKey ? window.localStorage.getItem(generatorKey) : null;
    if (generatorKey && generatorRaw === null) throw new Error(`Missing localStorage key ${generatorKey}`);
    const generator = generatorRaw === null ? null : JSON.parse(generatorRaw);
    return {
      gameRaw,
      generatorRaw,
      gameVersion: game.gameStateSaveVersion,
      expectedGameVersion: window.PET_CLINIC_GAME_STATE_SAVE.saveVersionForMode(mode),
      day: game.state?.day,
      phase: game.state?.phase,
      dayStarted: game.state?.dayStarted,
      campaignSeed: generator?.campaignSeed || null,
      generatedDays: generator ? Object.keys(generator.generatedDays || {}).sort() : [],
      generatorModePreference: window.localStorage.getItem(modeKey),
    };
  }, {
    mode: spec.mode,
    gameKey: GAME_KEYS[spec.mode],
    generatorKey: GENERATOR_KEYS[spec.mode] || null,
    modeKey: MODE_KEY,
  });
}

function assertFreshDayOne(campaign, spec, label) {
  assert.equal(campaign.gameVersion, campaign.expectedGameVersion, `${label}: game save version is stale`);
  assert.equal(campaign.day, 1, `${label}: campaign did not open on day 1`);
  assert.equal(campaign.phase, "planning", `${label}: campaign did not open in planning`);
  assert.equal(campaign.dayStarted, false, `${label}: a shift was already running`);
  assert.equal(campaign.generatorModePreference, spec.mode, `${label}: generatorMode preference changed`);
  if (GENERATOR_KEYS[spec.mode]) {
    assert.equal(typeof campaign.campaignSeed, "string", `${label}: campaignSeed is not a string`);
    assert.ok(campaign.campaignSeed.trim(), `${label}: campaignSeed is empty`);
    assert.ok(campaign.generatedDays.includes("1"), `${label}: generated day 1 was not persisted`);
  } else {
    assert.equal(campaign.generatorRaw, null, `${label}: current mode unexpectedly created a generator save`);
    assert.equal(campaign.campaignSeed, null, `${label}: current mode unexpectedly acquired a campaignSeed`);
  }
}

function fixturesFor(spec) {
  const activeKeys = [GAME_KEYS[spec.mode], GENERATOR_KEYS[spec.mode]].filter(Boolean);
  const activeBackupKeys = activeKeys.flatMap((key) => [1, 5, 6, 9, 999]
    .map((version) => `${key}:migration-source:v${version}`));
  const allPrimaryKeys = [...Object.values(GAME_KEYS), ...Object.values(GENERATOR_KEYS)];
  const foreignSentinels = {};
  allPrimaryKeys
    .filter((key) => !activeKeys.includes(key))
    .forEach((key) => {
      foreignSentinels[key] = `foreign:${spec.mode}:${key}`;
      [1, 5, 6, 9, 999].forEach((version) => {
        const backupKey = `${key}:migration-source:v${version}`;
        foreignSentinels[backupKey] = `foreign:${spec.mode}:${backupKey}`;
      });
    });
  return { activeKeys, activeBackupKeys, foreignSentinels };
}

async function seedResetFixtures(page, fixtures) {
  await page.evaluate(({ activeBackups, foreign }) => {
    activeBackups.forEach((key, index) => window.localStorage.setItem(key, `active-backup-${index + 1}`));
    Object.entries(foreign).forEach(([key, value]) => window.localStorage.setItem(key, value));
  }, {
    activeBackups: fixtures.activeBackupKeys,
    foreign: fixtures.foreignSentinels,
  });
}

async function assertForeignSentinels(page, fixtures, label) {
  const actual = await page.evaluate((keys) => Object.fromEntries(
    keys.map((key) => [key, window.localStorage.getItem(key)]),
  ), Object.keys(fixtures.foreignSentinels));
  assert.deepEqual(actual, fixtures.foreignSentinels, `${label}: another mode's storage was changed`);
}

async function clearRemovalLog(page) {
  await page.evaluate((key) => window.sessionStorage.setItem(key, "[]"), REMOVE_LOG_KEY);
}

async function readRemovalLog(page) {
  return page.evaluate((key) => JSON.parse(window.sessionStorage.getItem(key) || "[]"), REMOVE_LOG_KEY);
}

function confirmPromise(page, action, spec) {
  return new Promise((resolve, reject) => {
    page.once("dialog", async (dialog) => {
      try {
        assert.equal(dialog.type(), "confirm", `${spec.mode}: new-game action must use a confirm dialog`);
        assert.match(dialog.message(), /Начать новую игру/u, `${spec.mode}: confirmation does not name the action`);
        assert.match(dialog.message(), /Текущая кампания этого режима будет удалена/u, `${spec.mode}: confirmation lacks destructive warning`);
        assert.match(dialog.message(), spec.dialogPattern, `${spec.mode}: confirmation names another mode`);
        if (action === "accept") await dialog.accept();
        else await dialog.dismiss();
        resolve(dialog.message());
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function startAndPauseShift(page, spec) {
  await page.locator("#startShiftBtn").click();
  await page.locator("#shiftWindow").waitFor({ state: "hidden", timeout: 10000 });
  await page.waitForFunction(({ gameKey }) => {
    const raw = window.localStorage.getItem(gameKey);
    return raw && JSON.parse(raw).state?.phase === "running";
  }, { gameKey: GAME_KEYS[spec.mode] }, { timeout: 10000 });
  if ((await page.locator("#pauseBtn").textContent()) !== "▶") await page.locator("#pauseBtn").click();
  await page.locator("#pauseBtn").filter({ hasText: "▶" }).waitFor({ state: "visible", timeout: 10000 });
  const running = await readCampaign(page, spec);
  assert.equal(running.day, 1, `${spec.mode}: pre-reset campaign left day 1 unexpectedly`);
  assert.equal(running.phase, "running", `${spec.mode}: pre-reset shift was not persisted`);
  assert.equal(running.dayStarted, true, `${spec.mode}: pre-reset shift start was not persisted`);
  return running;
}

async function openSettings(page) {
  if (!(await page.locator("#developerPanel").isVisible())) await page.locator("#developerBtn").click();
  await page.locator("#developerPanel").waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: "Начать новую игру", exact: true }).waitFor({ state: "visible" });
}

async function runMode(browser, spec) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installRemoveObserver(context);
  const page = await context.newPage();
  const issues = observePage(page);
  const fixtures = fixturesFor(spec);

  try {
    const navigation = await page.goto(targetUrl(spec.mode).href, { waitUntil: "networkidle", timeout: 30000 });
    assert.ok(navigation, `${spec.mode}: initial navigation returned no response`);
    assert.equal(navigation.status(), 200, `${spec.mode}: initial navigation failed`);
    const initialReady = await waitForReady(page, spec);
    const initialCampaign = await readCampaign(page, spec);
    assertFreshDayOne(initialCampaign, spec, `${spec.mode} fresh boot`);

    const runningCampaign = await startAndPauseShift(page, spec);
    await seedResetFixtures(page, fixtures);
    await openSettings(page);

    await clearRemovalLog(page);
    const beforeCancel = await storageSnapshot(page);
    const cancelDialog = confirmPromise(page, "dismiss", spec);
    await Promise.all([
      cancelDialog,
      page.getByRole("button", { name: "Начать новую игру", exact: true }).click(),
    ]);
    const afterCancel = await storageSnapshot(page);
    assert.deepEqual(afterCancel, beforeCancel, `${spec.mode}: cancelled reset changed localStorage`);
    assert.deepEqual(await readRemovalLog(page), [], `${spec.mode}: cancelled reset removed storage keys`);
    await page.screenshot({
      path: path.join(artifactRoot, `${spec.mode}-01-cancelled.png`),
      fullPage: true,
    });

    await clearRemovalLog(page);
    const acceptDialog = confirmPromise(page, "accept", spec);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }),
      acceptDialog,
      page.getByRole("button", { name: "Начать новую игру", exact: true }).click(),
    ]);
    await page.waitForLoadState("networkidle", { timeout: 30000 });

    const resetReady = await waitForReady(page, spec);
    assert.equal(resetReady.restoreStatus, "empty", `${spec.mode}: reset reload did not boot without the old game save`);
    const resetCampaign = await readCampaign(page, spec);
    assertFreshDayOne(resetCampaign, spec, `${spec.mode} confirmed reset`);
    assert.notEqual(resetCampaign.gameRaw, runningCampaign.gameRaw, `${spec.mode}: reset reused the running game save`);
    if (GENERATOR_KEYS[spec.mode]) {
      assert.notEqual(resetCampaign.campaignSeed, runningCampaign.campaignSeed, `${spec.mode}: reset reused campaignSeed`);
      assert.notEqual(resetCampaign.generatorRaw, runningCampaign.generatorRaw, `${spec.mode}: reset reused generator save`);
    }

    const resetStorage = await storageSnapshot(page);
    fixtures.activeBackupKeys.forEach((key) => {
      assert.equal(resetStorage[key], undefined, `${spec.mode}: active migration backup survived reset: ${key}`);
    });
    await assertForeignSentinels(page, fixtures, `${spec.mode} confirmed reset`);
    assert.equal(resetStorage[MODE_KEY], spec.mode, `${spec.mode}: confirmed reset changed generatorMode preference`);

    const removalLog = await readRemovalLog(page);
    const expectedRemoved = [...fixtures.activeKeys, ...fixtures.activeBackupKeys].sort();
    assert.deepEqual([...removalLog].sort(), expectedRemoved, `${spec.mode}: reset removed keys outside the active mode or missed active keys`);
    assert.ok(!removalLog.includes(MODE_KEY), `${spec.mode}: reset removed generatorMode preference before reload`);
    await page.screenshot({
      path: path.join(artifactRoot, `${spec.mode}-02-fresh-day-one.png`),
      fullPage: true,
    });

    await page.reload({ waitUntil: "networkidle", timeout: 30000 });
    const reloadedReady = await waitForReady(page, spec);
    assert.equal(reloadedReady.restoreStatus, "restored", `${spec.mode}: fresh campaign did not restore on the next reload`);
    const reloadedCampaign = await readCampaign(page, spec);
    assertFreshDayOne(reloadedCampaign, spec, `${spec.mode} second reload`);
    if (GENERATOR_KEYS[spec.mode]) {
      assert.equal(reloadedCampaign.campaignSeed, resetCampaign.campaignSeed, `${spec.mode}: fresh campaignSeed changed on ordinary reload`);
    }
    await assertForeignSentinels(page, fixtures, `${spec.mode} second reload`);
    assert.deepEqual(await readRemovalLog(page), removalLog, `${spec.mode}: ordinary reload removed additional storage keys`);
    assert.deepEqual(issues, [], `${spec.mode}: browser issues detected:\n${issues.join("\n")}`);

    return {
      mode: spec.mode,
      initialRestoreStatus: initialReady.restoreStatus,
      resetRestoreStatus: resetReady.restoreStatus,
      secondReloadStatus: reloadedReady.restoreStatus,
      gameSaveVersion: resetCampaign.gameVersion,
      day: resetCampaign.day,
      phase: resetCampaign.phase,
      seed: GENERATOR_KEYS[spec.mode]
        ? { before: runningCampaign.campaignSeed, after: resetCampaign.campaignSeed }
        : null,
      removedKeys: removalLog,
      preservedForeignKeys: Object.keys(fixtures.foreignSentinels).sort(),
      browserIssues: issues,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  try {
    const results = [];
    for (const spec of MODES) results.push(await runMode(browser, spec));
    console.log(JSON.stringify({
      status: "passed",
      baseUrl: baseUrl.href,
      playwrightVersion,
      chromiumPath,
      artifacts: artifactRoot,
      results,
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
