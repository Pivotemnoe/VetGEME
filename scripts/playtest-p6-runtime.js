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
const baseUrl = new URL(process.env.BASE_URL || process.env.PLAYTEST_BASE_URL
  || "http://127.0.0.1:5175/?generatorMode=tier-01-v2");
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath();
const artifactRoot = path.resolve(process.env.PLAYTEST_ARTIFACT_DIR
  || path.join(os.tmpdir(), "vetgeme-p6-runtime-playtest"));
if (!baseUrl.searchParams.has("generatorMode")) baseUrl.searchParams.set("generatorMode", "tier-01-v2");
assert.equal(baseUrl.searchParams.get("generatorMode"), "tier-01-v2");
fs.mkdirSync(artifactRoot, { recursive: true });

const foreignSentinels = Object.freeze({
  "pet-clinic-game-current": "p6-current-game",
  "pet-clinic-game-legacy-v1": "p6-legacy-game",
  "pet-clinic-generator-v1": "p6-legacy-generator"
});

const ledgerCommand = Object.freeze({
  commandId: "p6-browser-ledger-1",
  sourceType: "synthetic_browser_fixture",
  sourceId: "p6-browser-source-1",
  postingId: "p6-browser-posting-1",
  postedAt: 600,
  currencyId: "synthetic-cu",
  lines: Object.freeze([{
    lineId: "p6-browser-line-debit",
    accountId: "synthetic-cash",
    side: "debit",
    amount: 11
  }, {
    lineId: "p6-browser-line-credit",
    accountId: "synthetic-fixture-offset",
    side: "credit",
    amount: 11
  }])
});

const reputationBaselineCommand = Object.freeze({
  commandId: "p6-browser-reputation-baseline",
  catalogId: "synthetic-browser-reputation",
  catalogVersion: "fixture-1",
  status: "approved",
  scores: Object.freeze({
    clinical: 41,
    communication: 42,
    accessibility: 43,
    organization: 44
  })
});

const reputationEventCommand = Object.freeze({
  commandId: "p6-browser-reputation-event",
  eventId: "p6-browser-event-1",
  sourceType: "synthetic_browser_fixture",
  sourceId: "p6-browser-reputation-source-1",
  axis: "organization",
  delta: 3
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
    saveError: document.body.dataset.saveError || null,
    economySchema: document.documentElement.dataset.economySchema || null,
    reputationSchema: document.documentElement.dataset.reputationSchema || null
  }));
  assert.ok(detail.ready, "readiness detail is missing");
  assert.equal(detail.mode, "tier-01-v2");
  assert.equal(detail.saveError, null);
  assert.equal(detail.economySchema, "1");
  assert.equal(detail.reputationSchema, "1");
  return detail;
}

async function storageEvidence(page) {
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
    return {
      gameVersion: compact.gameStateSaveVersion,
      expectedVersion: window.PET_CLINIC_GAME_STATE_SAVE.TIER_01_V2_GAME_STATE_SAVE_VERSION,
      generatorSeed: generator.campaignSeed,
      generatedDayRaw: JSON.stringify(generator.generatedDays?.[String(expanded.state.day)] || null),
      activeVisitId: expanded.state.queue?.find((patient) => patient.id === expanded.state.activeId)?.v2Visit?.visitId || null,
      legacyFields: {
        money: expanded.state.money,
        campaignFinance: expanded.state.campaignFinance,
        dailyLedger: expanded.state.dailyLedger,
        reputation: expanded.state.reputation,
        ownerTrust: expanded.state.ownerTrust,
        clinicalReliability: expanded.state.clinicalReliability
      },
      operationsState: expanded.state.operationsState,
      economyState: expanded.state.economyState,
      reputationState: expanded.state.reputationState,
      economySummary: window.PET_CLINIC_ECONOMY_RUNTIME_V6.summarizeState(expanded.state.economyState),
      reputationSummary: window.PET_CLINIC_REPUTATION_RUNTIME_V6.summarizeState(expanded.state.reputationState)
    };
  }, { gameKey: GAME_KEY, generatorKey: GENERATOR_KEY });
}

async function injectP6State(page) {
  return page.evaluate(({ generatorKey, ledger, baseline, reputationEvent }) => {
    const saveApi = window.PET_CLINIC_GAME_STATE_SAVE;
    const economy = window.PET_CLINIC_ECONOMY_RUNTIME_V6;
    const reputation = window.PET_CLINIC_REPUTATION_RUNTIME_V6;
    const runtime = window.__PET_CLINIC_RUNTIME__;
    const generator = JSON.parse(window.localStorage.getItem(generatorKey));
    const snapshot = saveApi.load(window.localStorage, "tier-01-v2", {
      catalog: runtime.catalog,
      campaignIdentity: generator.campaignSeed
    });
    const ledgerResult = economy.postLedger(snapshot.state.economyState, ledger);
    const baselineResult = reputation.initializeBaseline(snapshot.state.reputationState, baseline);
    const reputationResult = reputation.recordEvent(baselineResult.state, reputationEvent);
    snapshot.state.economyState = ledgerResult.state;
    snapshot.state.reputationState = reputationResult.state;
    saveApi.save(window.localStorage, "tier-01-v2", snapshot.state, {
      catalog: runtime.catalog,
      campaignIdentity: generator.campaignSeed
    });
    return {
      economyState: ledgerResult.state,
      reputationState: reputationResult.state,
      ledgerIdempotent: ledgerResult.idempotent,
      baselineIdempotent: baselineResult.idempotent,
      eventIdempotent: reputationResult.idempotent
    };
  }, {
    generatorKey: GENERATOR_KEY,
    ledger: ledgerCommand,
    baseline: reputationBaselineCommand,
    reputationEvent: reputationEventCommand
  });
}

async function replayAfterReload(page) {
  return page.evaluate(({ generatorKey, ledger, reputationEvent }) => {
    const saveApi = window.PET_CLINIC_GAME_STATE_SAVE;
    const economy = window.PET_CLINIC_ECONOMY_RUNTIME_V6;
    const reputation = window.PET_CLINIC_REPUTATION_RUNTIME_V6;
    const runtime = window.__PET_CLINIC_RUNTIME__;
    const generator = JSON.parse(window.localStorage.getItem(generatorKey));
    const snapshot = saveApi.load(window.localStorage, "tier-01-v2", {
      catalog: runtime.catalog,
      campaignIdentity: generator.campaignSeed
    });
    const ledgerReplay = economy.postLedger(snapshot.state.economyState, ledger);
    const reputationReplay = reputation.recordEvent(snapshot.state.reputationState, reputationEvent);
    let conflictingLedgerRejected = false;
    try {
      economy.postLedger(snapshot.state.economyState, {
        ...ledger,
        lines: ledger.lines.map((line) => ({ ...line, amount: line.amount + 1 }))
      });
    } catch (_error) {
      conflictingLedgerRejected = true;
    }
    return {
      ledgerIdempotent: ledgerReplay.idempotent,
      reputationIdempotent: reputationReplay.idempotent,
      economyUnchanged: JSON.stringify(ledgerReplay.state) === JSON.stringify(snapshot.state.economyState),
      reputationUnchanged: JSON.stringify(reputationReplay.state) === JSON.stringify(snapshot.state.reputationState),
      conflictingLedgerRejected
    };
  }, {
    generatorKey: GENERATOR_KEY,
    ledger: ledgerCommand,
    reputationEvent: reputationEventCommand
  });
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
    if (window.sessionStorage.getItem("vetgeme-p6-playtest-initialized") === "1") return;
    window.localStorage.clear();
    window.sessionStorage.setItem("vetgeme-p6-playtest-initialized", "1");
  });
  const page = await context.newPage();
  const issues = observePage(page);

  try {
    const response = await page.goto(baseUrl.href, { waitUntil: "networkidle", timeout: 30000 });
    assert.equal(response?.status(), 200);
    const ready = await waitForReady(page);
    assert.equal(ready.ready.economy.auditEventCount, 0);
    assert.equal(ready.ready.reputation.initialized, false);
    assert.equal(ready.ready.reputation.auditEntryCount, 0);

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

    const before = await storageEvidence(page);
    assert.equal(before.gameVersion, before.expectedVersion);
    assert.equal(before.gameVersion, 9);
    assert.equal(before.economySummary.auditEventCount, 0);
    assert.equal(before.reputationSummary.initialized, false);
    const injected = await injectP6State(page);
    assert.equal(injected.ledgerIdempotent, false);
    assert.equal(injected.baselineIdempotent, false);
    assert.equal(injected.eventIdempotent, false);

    await page.reload({ waitUntil: "networkidle", timeout: 30000 });
    const restoredReady = await waitForReady(page);
    assert.equal(restoredReady.ready.economy.ledgerPostingCount, 1);
    assert.equal(restoredReady.ready.economy.auditEventCount, 1);
    assert.equal(restoredReady.ready.reputation.initialized, true);
    assert.equal(restoredReady.ready.reputation.eventCount, 1);
    assert.equal(restoredReady.ready.reputation.scores.organization, 47);

    const restored = await storageEvidence(page);
    assert.deepEqual(restored.economyState, injected.economyState);
    assert.deepEqual(restored.reputationState, injected.reputationState);
    assert.deepEqual(restored.legacyFields, before.legacyFields, "P6 reload changed legacy economy/reputation fields");
    assert.deepEqual(restored.operationsState, before.operationsState, "P6 reload changed P5 operations state");
    assert.equal(restored.generatorSeed, before.generatorSeed);
    assert.equal(restored.generatedDayRaw, before.generatedDayRaw, "P6 reload changed generated day");
    assert.equal(restored.activeVisitId, before.activeVisitId, "P6 reload changed active visit");
    await assertForeignStorage(page, "P6 reload");

    const replay = await replayAfterReload(page);
    assert.deepEqual(replay, {
      ledgerIdempotent: true,
      reputationIdempotent: true,
      economyUnchanged: true,
      reputationUnchanged: true,
      conflictingLedgerRejected: true
    });

    await page.screenshot({ path: path.join(artifactRoot, "01-p6-state-after-reload.png"), fullPage: true });
    assert.deepEqual(issues, [], `browser issues detected:\n${issues.join("\n")}`);

    console.log(JSON.stringify({
      status: "passed",
      baseUrl: baseUrl.href,
      playwrightVersion,
      gameSaveVersion: restored.gameVersion,
      economyAuditRestored: true,
      reputationAuditRestored: true,
      idempotentReplayAfterReload: true,
      generatedDayUnchanged: true,
      activeVisitUnchanged: true,
      legacyFieldsUnchanged: true,
      operationsStateUnchanged: true,
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
