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
  || path.join(os.tmpdir(), "vetgeme-p7-runtime-playtest"));
if (!baseUrl.searchParams.has("generatorMode")) baseUrl.searchParams.set("generatorMode", "tier-01-v2");
assert.equal(baseUrl.searchParams.get("generatorMode"), "tier-01-v2");
fs.mkdirSync(artifactRoot, { recursive: true });

const foreignSentinels = Object.freeze({
  "pet-clinic-game-current": "p7-current-game",
  "pet-clinic-game-legacy-v1": "p7-legacy-game",
  "pet-clinic-generator-v1": "p7-legacy-generator"
});

const fixtureCatalogs = Object.freeze({
  event: Object.freeze({
    schemaVersion: 1,
    catalogKind: "event",
    catalogId: "p7-browser-event-fixture",
    catalogVersion: "fixture-1",
    status: "approved",
    digest: "p7-browser-event-digest-0001",
    itemIds: Object.freeze(["p7-browser-event-a", "p7-browser-event-b"])
  }),
  milestone: Object.freeze({
    schemaVersion: 1,
    catalogKind: "milestone",
    catalogId: "p7-browser-milestone-fixture",
    catalogVersion: "fixture-1",
    status: "approved",
    digest: "p7-browser-milestone-digest-0001",
    itemIds: Object.freeze(["p7-browser-milestone-a"])
  }),
  specialization: Object.freeze({
    schemaVersion: 1,
    catalogKind: "specialization",
    catalogId: "p7-browser-specialization-fixture",
    catalogVersion: "fixture-1",
    status: "approved",
    digest: "p7-browser-specialization-digest-0001",
    itemIds: Object.freeze(["p7-browser-specialization-a"])
  }),
  ending: Object.freeze({
    schemaVersion: 1,
    catalogKind: "ending",
    catalogId: "p7-browser-ending-fixture",
    catalogVersion: "fixture-1",
    status: "approved",
    digest: "p7-browser-ending-digest-0001",
    itemIds: Object.freeze(["p7-browser-ending-a"])
  })
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
    campaignDirectorSchema: document.documentElement.dataset.campaignDirectorSchema || null,
    campaignDirectorInitialized: document.documentElement.dataset.campaignDirectorInitialized || null
  }));
  assert.ok(detail.ready, "readiness detail is missing");
  assert.equal(detail.mode, "tier-01-v2");
  assert.equal(detail.saveError, null);
  assert.equal(detail.campaignDirectorSchema, "1");
  assert.equal(detail.ready.campaignDirector?.schemaVersion, 1);
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
      activeVisitId: expanded.state.queue
        ?.find((patient) => patient.id === expanded.state.activeId)?.v2Visit?.visitId || null,
      legacyFields: {
        money: expanded.state.money,
        campaignFinance: expanded.state.campaignFinance,
        dailyLedger: expanded.state.dailyLedger,
        reputation: expanded.state.reputation,
        ownerTrust: expanded.state.ownerTrust,
        clinicalReliability: expanded.state.clinicalReliability,
        demandState: expanded.state.demandState,
        campaignOutcome: expanded.state.campaignOutcome
      },
      upstreamState: {
        capabilityState: expanded.state.capabilityState,
        researchOrders: expanded.state.researchOrders,
        referralOrders: expanded.state.referralOrders,
        asyncEvents: expanded.state.asyncEvents,
        deviceQueues: expanded.state.deviceQueues,
        identityRegistry: expanded.state.identityRegistry,
        operationsState: expanded.state.operationsState,
        economyState: expanded.state.economyState,
        reputationState: expanded.state.reputationState
      },
      campaignDirectorState: expanded.state.campaignDirectorState,
      campaignDirectorSummary: window.PET_CLINIC_CAMPAIGN_DIRECTOR_V7
        .summarizeState(expanded.state.campaignDirectorState)
    };
  }, { gameKey: GAME_KEY, generatorKey: GENERATOR_KEY });
}

async function injectP7Fixture(page) {
  return page.evaluate(({ generatorKey, catalogs }) => {
    const saveApi = window.PET_CLINIC_GAME_STATE_SAVE;
    const director = window.PET_CLINIC_CAMPAIGN_DIRECTOR_V7;
    const runtime = window.__PET_CLINIC_RUNTIME__;
    const generator = JSON.parse(window.localStorage.getItem(generatorKey));
    const campaignId = generator.campaignSeed;
    const snapshot = saveApi.load(window.localStorage, "tier-01-v2", {
      catalog: runtime.catalog,
      campaignIdentity: campaignId
    });
    const catalogRef = (kind) => {
      const catalog = catalogs[kind];
      return {
        catalogKind: catalog.catalogKind,
        catalogId: catalog.catalogId,
        catalogVersion: catalog.catalogVersion,
        digest: catalog.digest
      };
    };
    const key = (value) => [
      value.catalogKind, value.catalogId, value.catalogVersion, value.digest
    ].join("|");
    const catalogsByRef = Object.fromEntries(Object.values(catalogs).map((catalog) => [key(catalog), catalog]));
    const authorizedDirector = director.createRuntime({
      catalogResolver(exactRef) {
        const resolved = catalogsByRef[key(exactRef)];
        return resolved ? JSON.parse(JSON.stringify(resolved)) : undefined;
      }
    });

    let next = director.initializeCampaign(snapshot.state.campaignDirectorState, {
      commandId: "p7-browser-initialize",
      campaignId,
      initializedAt: 100
    }).state;
    let at = 100;
    const dayIds = [];
    const closureIds = [];
    let eventCommand;

    for (let day = 1; day <= director.CAMPAIGN_DAY_COUNT; day += 1) {
      at += 10;
      const dayId = `p7-browser-day-${day}`;
      dayIds.push(dayId);
      next = director.recordCampaignDay(next, {
        commandId: `p7-browser-command-day-${day}`,
        campaignId,
        dayId,
        dayNumber: day,
        recordedAt: at,
        evidenceRefs: []
      }).state;

      if (day === 5) {
        at += 1;
        eventCommand = {
          commandId: "p7-browser-event-command",
          campaignId,
          eventRecordId: "p7-browser-event-record",
          catalogRef: catalogRef("event"),
          itemId: "p7-browser-event-a",
          dayRef: { mode: "campaign", dayNumber: day },
          recordedAt: at,
          evidenceRefs: [dayId]
        };
        next = authorizedDirector.recordEvent(next, eventCommand).state;
        at += 1;
        next = authorizedDirector.recordMilestone(next, {
          commandId: "p7-browser-milestone-command",
          campaignId,
          milestoneRecordId: "p7-browser-milestone-record",
          catalogRef: catalogRef("milestone"),
          itemId: "p7-browser-milestone-a",
          dayRef: { mode: "campaign", dayNumber: day },
          recordedAt: at,
          evidenceRefs: [dayId, eventCommand.eventRecordId]
        }).state;
        at += 1;
        next = authorizedDirector.recordSpecialization(next, {
          commandId: "p7-browser-specialization-command",
          campaignId,
          specializationRecordId: "p7-browser-specialization-record",
          catalogRef: catalogRef("specialization"),
          itemId: "p7-browser-specialization-a",
          dayRef: { mode: "campaign", dayNumber: day },
          recordedAt: at,
          evidenceRefs: ["p7-browser-milestone-record"]
        }).state;
      }

      if (day % director.DAYS_PER_CHAPTER === 0) {
        at += 1;
        const chapterNumber = day / director.DAYS_PER_CHAPTER;
        const closureId = `p7-browser-chapter-${chapterNumber}-closure`;
        closureIds.push(closureId);
        const start = day - director.DAYS_PER_CHAPTER;
        next = director.closeChapter(next, {
          commandId: `p7-browser-command-chapter-${chapterNumber}`,
          campaignId,
          closureId,
          chapterNumber,
          closedAt: at,
          dayIds: dayIds.slice(start, day)
        }).state;
      }
    }

    at += 10;
    const endingCommand = {
      commandId: "p7-browser-ending-command",
      campaignId,
      endingRecordId: "p7-browser-ending-record",
      catalogRef: catalogRef("ending"),
      itemId: "p7-browser-ending-a",
      recordedAt: at,
      campaignDayIds: dayIds,
      chapterClosureIds: closureIds,
      evidenceRefs: [
        "p7-browser-day-30",
        "p7-browser-milestone-record",
        "p7-browser-specialization-record"
      ]
    };
    next = authorizedDirector.recordEnding(next, endingCommand).state;

    at += 10;
    next = director.recordEndlessDay(next, {
      commandId: "p7-browser-endless-1-command",
      campaignId,
      endlessDayId: "p7-browser-endless-day-1",
      endlessDayNumber: 1,
      absoluteDayNumber: 31,
      recordedAt: at,
      evidenceRefs: [endingCommand.endingRecordId]
    }).state;

    const atomicBefore = JSON.stringify(next);
    let atomicRejected = false;
    try {
      director.applyCommandsAtomically(next, [{
        command: {
          type: "endless_day.record",
          commandId: "p7-browser-atomic-endless-2",
          campaignId,
          endlessDayId: "p7-browser-endless-day-2",
          endlessDayNumber: 2,
          absoluteDayNumber: 32,
          recordedAt: at + 10,
          evidenceRefs: []
        }
      }, {
        command: {
          type: "endless_day.record",
          commandId: "p7-browser-atomic-stale",
          campaignId: "stale-campaign",
          endlessDayId: "p7-browser-endless-day-stale",
          endlessDayNumber: 3,
          absoluteDayNumber: 33,
          recordedAt: at + 11,
          evidenceRefs: []
        }
      }]);
    } catch (_error) {
      atomicRejected = true;
    }

    snapshot.state.campaignDirectorState = next;
    saveApi.save(window.localStorage, "tier-01-v2", snapshot.state, {
      catalog: runtime.catalog,
      campaignIdentity: campaignId
    });
    return {
      state: next,
      summary: director.summarizeState(next),
      eventCommand,
      endingCommand,
      atomicRejected,
      atomicSourceUnchanged: JSON.stringify(next) === atomicBefore
    };
  }, { generatorKey: GENERATOR_KEY, catalogs: fixtureCatalogs });
}

async function replayAfterReload(page, commands) {
  return page.evaluate(({ generatorKey, eventCommand, endingCommand }) => {
    const saveApi = window.PET_CLINIC_GAME_STATE_SAVE;
    const director = window.PET_CLINIC_CAMPAIGN_DIRECTOR_V7;
    const runtime = window.__PET_CLINIC_RUNTIME__;
    const generator = JSON.parse(window.localStorage.getItem(generatorKey));
    const snapshot = saveApi.load(window.localStorage, "tier-01-v2", {
      catalog: runtime.catalog,
      campaignIdentity: generator.campaignSeed
    });
    const before = JSON.stringify(snapshot.state.campaignDirectorState);
    const eventRetry = director.recordEvent(snapshot.state.campaignDirectorState, eventCommand);
    const endingRetry = director.recordEnding(snapshot.state.campaignDirectorState, endingCommand);
    let conflictingRetryRejected = false;
    let newCatalogCommandRejected = false;
    let staleCampaignRejected = false;
    try {
      director.recordEnding(snapshot.state.campaignDirectorState, {
        ...endingCommand,
        recordedAt: endingCommand.recordedAt + 1
      });
    } catch (_error) {
      conflictingRetryRejected = true;
    }
    try {
      director.recordEvent(snapshot.state.campaignDirectorState, {
        ...eventCommand,
        commandId: "p7-browser-new-event-command",
        eventRecordId: "p7-browser-new-event-record",
        itemId: "p7-browser-event-b",
        dayRef: { mode: "endless", endlessDayNumber: 1 },
        recordedAt: endingCommand.recordedAt + 20,
        evidenceRefs: ["p7-browser-endless-day-1"]
      });
    } catch (_error) {
      newCatalogCommandRejected = true;
    }
    try {
      director.recordEndlessDay(snapshot.state.campaignDirectorState, {
        commandId: "p7-browser-stale-campaign-command",
        campaignId: "stale-campaign",
        endlessDayId: "p7-browser-stale-endless-day",
        endlessDayNumber: 2,
        absoluteDayNumber: 32,
        recordedAt: endingCommand.recordedAt + 20,
        evidenceRefs: []
      });
    } catch (_error) {
      staleCampaignRejected = true;
    }
    return {
      eventIdempotent: eventRetry.idempotent,
      endingIdempotent: endingRetry.idempotent,
      eventStateUnchanged: JSON.stringify(eventRetry.state) === before,
      endingStateUnchanged: JSON.stringify(endingRetry.state) === before,
      conflictingRetryRejected,
      newCatalogCommandRejected,
      staleCampaignRejected
    };
  }, {
    generatorKey: GENERATOR_KEY,
    eventCommand: commands.eventCommand,
    endingCommand: commands.endingCommand
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
    if (window.sessionStorage.getItem("vetgeme-p7-playtest-initialized") === "1") return;
    window.localStorage.clear();
    window.sessionStorage.setItem("vetgeme-p7-playtest-initialized", "1");
  });
  const page = await context.newPage();
  const issues = observePage(page);

  try {
    const response = await page.goto(baseUrl.href, { waitUntil: "networkidle", timeout: 30000 });
    assert.equal(response?.status(), 200);
    const ready = await waitForReady(page);
    assert.equal(ready.campaignDirectorInitialized, "false");
    assert.deepEqual(ready.ready.campaignDirector, {
      schemaVersion: 1,
      initialized: false,
      campaignDayCount: 0,
      closedChapterCount: 0,
      endlessDayCount: 0,
      eventCount: 0,
      milestoneCount: 0,
      specializationCount: 0,
      endingRecorded: false,
      auditEventCount: 0
    });
    await assert.doesNotReject(async () => {
      await page.locator("#campaignProgress").filter({ hasText: "Глава 1 · день 1/5 · кампания 1/30" })
        .waitFor({ state: "visible", timeout: 5000 });
    });

    await page.evaluate((sentinels) => {
      Object.entries(sentinels).forEach(([key, value]) => window.localStorage.setItem(key, value));
    }, foreignSentinels);
    await page.locator("#startShiftBtn").click();
    const nextPatient = page.locator("#nextPatientCard .queue-card");
    await nextPatient.waitFor({ state: "visible", timeout: 30000 });
    await nextPatient.click();
    await page.waitForFunction((gameKey) => {
      const raw = window.localStorage.getItem(gameKey);
      const state = raw ? JSON.parse(raw).state : null;
      return Boolean(state?.activeId && state?.queue?.length);
    }, GAME_KEY, { timeout: 15000 });
    if ((await page.locator("#pauseBtn").textContent()) !== "▶") await page.locator("#pauseBtn").click();

    const before = await storageEvidence(page);
    assert.equal(before.gameVersion, before.expectedVersion);
    assert.equal(before.gameVersion, 10);
    assert.ok(before.activeVisitId, "browser fixture did not preserve an active visit");
    assert.equal(before.campaignDirectorSummary.initialized, false);
    assert.equal(before.campaignDirectorSummary.auditEventCount, 0);

    const injected = await injectP7Fixture(page);
    assert.equal(injected.atomicRejected, true);
    assert.equal(injected.atomicSourceUnchanged, true);
    assert.deepEqual(injected.summary, {
      schemaVersion: 1,
      initialized: true,
      campaignDayCount: 30,
      closedChapterCount: 6,
      endlessDayCount: 1,
      eventCount: 1,
      milestoneCount: 1,
      specializationCount: 1,
      endingRecorded: true,
      auditEventCount: 42
    });

    await page.reload({ waitUntil: "networkidle", timeout: 30000 });
    const restoredReady = await waitForReady(page);
    assert.equal(restoredReady.campaignDirectorInitialized, "true");
    assert.deepEqual(restoredReady.ready.campaignDirector, injected.summary);

    const restored = await storageEvidence(page);
    assert.deepEqual(restored.campaignDirectorState, injected.state);
    assert.deepEqual(restored.legacyFields, before.legacyFields, "P7 reload changed legacy campaign fields");
    assert.deepEqual(restored.upstreamState, before.upstreamState, "P7 reload changed P3-P6 state");
    assert.equal(restored.generatorSeed, before.generatorSeed);
    assert.equal(restored.generatedDayRaw, before.generatedDayRaw, "P7 reload changed generated day");
    assert.equal(restored.activeVisitId, before.activeVisitId, "P7 reload changed active visit");
    await assertForeignStorage(page, "P7 reload");

    const replay = await replayAfterReload(page, injected);
    assert.deepEqual(replay, {
      eventIdempotent: true,
      endingIdempotent: true,
      eventStateUnchanged: true,
      endingStateUnchanged: true,
      conflictingRetryRejected: true,
      newCatalogCommandRejected: true,
      staleCampaignRejected: true
    });

    const screenshotPath = path.join(artifactRoot, "01-p7-state-after-reload.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    assert.deepEqual(issues, [], `browser issues detected:\n${issues.join("\n")}`);

    console.log(JSON.stringify({
      status: "passed",
      baseUrl: baseUrl.href,
      playwrightVersion,
      gameSaveVersion: restored.gameVersion,
      productionDefaultUninitialized: true,
      campaignStructureRestored: true,
      exactRetryWithoutResolver: true,
      defaultCatalogGateFailClosed: true,
      atomicFailureNotPersisted: true,
      generatedDayUnchanged: true,
      activeVisitUnchanged: true,
      upstreamStateUnchanged: true,
      legacyFieldsUnchanged: true,
      modeIsolation: true,
      browserIssues: issues,
      artifacts: artifactRoot,
      screenshot: screenshotPath
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
