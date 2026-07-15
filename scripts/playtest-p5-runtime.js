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
  || path.join(os.tmpdir(), "vetgeme-p5-runtime-playtest"));
if (!baseUrl.searchParams.has("generatorMode")) baseUrl.searchParams.set("generatorMode", "tier-01-v2");
assert.equal(baseUrl.searchParams.get("generatorMode"), "tier-01-v2");
fs.mkdirSync(artifactRoot, { recursive: true });

const foreignSentinels = Object.freeze({
  "pet-clinic-game-current": "p5-current-game",
  "pet-clinic-game-legacy-v1": "p5-legacy-game",
  "pet-clinic-generator-v1": "p5-legacy-generator"
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
    operationsSchema: document.documentElement.dataset.operationsSchema || null
  }));
  assert.ok(detail.ready, "readiness detail is missing");
  assert.equal(detail.mode, "tier-01-v2");
  assert.equal(detail.saveError, null);
  assert.equal(detail.operationsSchema, "1");
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
    const operationsRuntime = window.PET_CLINIC_OPERATIONS_RUNTIME_V5.createOperationsRuntime(
      window.PET_CLINIC_RESOURCE_SCHEDULER_V5
    );
    return {
      gameVersion: compact.gameStateSaveVersion,
      expectedVersion: window.PET_CLINIC_GAME_STATE_SAVE.TIER_01_V2_GAME_STATE_SAVE_VERSION,
      generatorSeed: generator.campaignSeed,
      generatedDayRaw: JSON.stringify(generator.generatedDays?.[String(expanded.state.day)] || null),
      activeVisitId: expanded.state.queue?.find((patient) => patient.id === expanded.state.activeId)?.v2Visit?.visitId || null,
      operationsState: expanded.state.operationsState,
      operationsSummary: operationsRuntime.summarizeState(expanded.state.operationsState),
      containsClinicalTruth: /"(?:authoredResult|diagnosis|diagnosisId|clinicalTruth|medicalTruth|resultText)"\s*:/iu.test(
        JSON.stringify(expanded.state.operationsState)
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

async function injectActiveOperationsTask(page) {
  return page.evaluate(({ gameKey, generatorKey }) => {
    const scheduler = window.PET_CLINIC_RESOURCE_SCHEDULER_V5;
    const saveApi = window.PET_CLINIC_GAME_STATE_SAVE;
    const runtime = window.__PET_CLINIC_RUNTIME__;
    const generator = JSON.parse(window.localStorage.getItem(generatorKey));
    const snapshot = saveApi.load(window.localStorage, "tier-01-v2", {
      catalog: runtime.catalog,
      campaignIdentity: generator.campaignSeed
    });
    const patient = snapshot.state.queue.find((candidate) => candidate.id === snapshot.state.activeId)
      || snapshot.state.queue[0];
    let operations = scheduler.createState([{
      id: "browser-doctor-a",
      capacity: 1,
      capabilities: ["browser-authored-work"],
      unavailableWindows: []
    }, {
      id: "browser-doctor-b",
      capacity: 1,
      capabilities: ["browser-authored-work"],
      unavailableWindows: []
    }, {
      id: "browser-room-a",
      capacity: 1,
      capabilities: ["browser-authored-room"],
      unavailableWindows: []
    }]);
    operations = scheduler.enqueueTask(operations, {
      commandId: "browser-enqueue-active",
      task: {
        id: "browser-active-task",
        queuedAt: 500,
        priority: 20,
        authoredDurationMinutes: 18,
        fatigue: { percent: 40, durationMultiplier: 1.25 },
        requirementGroups: [{
          id: "staff",
          anyOf: [
            { resourceId: "browser-doctor-a", capabilityId: "browser-authored-work", units: 1 },
            { resourceId: "browser-doctor-b", capabilityId: "browser-authored-work", units: 1 }
          ]
        }, {
          id: "room",
          anyOf: [{ resourceId: "browser-room-a", capabilityId: "browser-authored-room", units: 1 }]
        }],
        urgency: "routine",
        safeRouteRequired: false,
        sourceType: "browser_test_fixture",
        sourceId: "browser-source-1",
        patientId: String(patient.persistentPatientId || patient.patientId)
      }
    }).state;
    operations = scheduler.scheduleTask(operations, { commandId: "browser-start-active", at: 500 }).state;
    snapshot.state.operationsState = { ...operations, handoffs: [] };
    saveApi.save(window.localStorage, "tier-01-v2", snapshot.state, {
      catalog: runtime.catalog,
      campaignIdentity: generator.campaignSeed
    });
    return {
      gameRawPresent: Boolean(window.localStorage.getItem(gameKey)),
      taskId: "browser-active-task",
      scheduledDurationMinutes: operations.tasks[0].scheduledDurationMinutes
    };
  }, { gameKey: GAME_KEY, generatorKey: GENERATOR_KEY });
}

async function recordHandoff(page) {
  return page.evaluate(({ generatorKey }) => {
    const saveApi = window.PET_CLINIC_GAME_STATE_SAVE;
    const runtime = window.__PET_CLINIC_RUNTIME__;
    const generator = JSON.parse(window.localStorage.getItem(generatorKey));
    const snapshot = saveApi.load(window.localStorage, "tier-01-v2", {
      catalog: runtime.catalog,
      campaignIdentity: generator.campaignSeed
    });
    const operationsRuntime = window.PET_CLINIC_OPERATIONS_RUNTIME_V5.createOperationsRuntime(
      window.PET_CLINIC_RESOURCE_SCHEDULER_V5
    );
    const result = operationsRuntime.recordHandoff(snapshot.state.operationsState, {
      commandId: "browser-handoff-active",
      handoffId: "browser-handoff-1",
      taskId: "browser-active-task",
      at: 505,
      reassignments: [{
        groupId: "staff",
        fromResourceId: "browser-doctor-a",
        toResourceId: "browser-doctor-b",
        capabilityId: "browser-authored-work",
        units: 1
      }]
    });
    snapshot.state.operationsState = result.state;
    saveApi.save(window.localStorage, "tier-01-v2", snapshot.state, {
      catalog: runtime.catalog,
      campaignIdentity: generator.campaignSeed
    });
    return result.handoff;
  }, { generatorKey: GENERATOR_KEY });
}

async function urgentCapacityEvidence(page) {
  return page.evaluate(() => {
    const scheduler = window.PET_CLINIC_RESOURCE_SCHEDULER_V5;
    let state = scheduler.createState([{
      id: "urgent-doctor",
      capacity: 1,
      capabilities: ["urgent-authored-work"],
      unavailableWindows: [{ startAt: 0, endAt: 1000 }]
    }]);
    state = scheduler.enqueueTask(state, {
      commandId: "browser-enqueue-urgent",
      task: {
        id: "browser-urgent-task",
        queuedAt: 500,
        priority: 100,
        authoredDurationMinutes: 10,
        fatigue: { percent: 100, durationMultiplier: 1.5 },
        requirementGroups: [{
          id: "staff",
          anyOf: [{ resourceId: "urgent-doctor", capabilityId: "urgent-authored-work", units: 1 }]
        }],
        urgency: "urgent",
        safeRouteRequired: true
      }
    }).state;
    const result = scheduler.scheduleTask(state, { commandId: "browser-schedule-urgent", at: 500 });
    return {
      reasonCode: result.reasonCode,
      taskStatus: result.state.tasks[0].status,
      safeRouteRequired: result.state.tasks[0].safeRouteRequired
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    if (window.sessionStorage.getItem("vetgeme-p5-playtest-initialized") === "1") return;
    window.localStorage.clear();
    window.sessionStorage.setItem("vetgeme-p5-playtest-initialized", "1");
  });
  const page = await context.newPage();
  const issues = observePage(page);

  try {
    const response = await page.goto(baseUrl.href, { waitUntil: "networkidle", timeout: 30000 });
    assert.equal(response?.status(), 200);
    const ready = await waitForReady(page);
    assert.equal(ready.ready.operations.activeTaskCount, 0);
    assert.equal(ready.ready.operations.queuedTaskCount, 0);
    const fresh = await storageEvidence(page);
    assert.equal(fresh.gameVersion, fresh.expectedVersion);
    assert.equal(fresh.gameVersion, 9);
    assert.equal(fresh.containsClinicalTruth, false);

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
    const injected = await injectActiveOperationsTask(page);
    assert.equal(injected.gameRawPresent, true);
    assert.equal(injected.scheduledDurationMinutes, 23);
    await page.reload({ waitUntil: "networkidle", timeout: 30000 });
    const restoredReady = await waitForReady(page);
    assert.equal(restoredReady.ready.operations.activeTaskCount, 1);
    assert.equal(restoredReady.ready.operations.reservationCount, 2);
    const restored = await storageEvidence(page);
    assert.equal(restored.operationsState.tasks[0].id, injected.taskId);
    assert.equal(restored.operationsState.tasks[0].status, "active");
    assert.equal(restored.operationsSummary.activeTaskCount, 1);
    assert.deepEqual(
      restored.operationsState.reservations
        .filter((reservation) => reservation.groupId === "staff")
        .map((reservation) => [reservation.resourceId, reservation.startAt, reservation.endAt]),
      [["browser-doctor-a", 500, 523]],
      "the original staff resource must own the whole interval before handoff"
    );
    assert.equal(restored.generatedDayRaw, before.generatedDayRaw, "operations reload changed generated day");
    assert.equal(restored.activeVisitId, before.activeVisitId, "operations reload changed active visit");
    assert.equal(restored.containsClinicalTruth, false);
    await assertForeignStorage(page, "active task reload");

    const handoff = await recordHandoff(page);
    assert.equal(handoff.taskId, injected.taskId);
    await page.reload({ waitUntil: "networkidle", timeout: 30000 });
    await waitForReady(page);
    const afterHandoff = await storageEvidence(page);
    assert.equal(afterHandoff.operationsSummary.handoffCount, 1);
    assert.equal(afterHandoff.operationsSummary.reservationCount, 3);
    assert.equal(afterHandoff.operationsState.tasks[0].status, "active");
    assert.deepEqual(
      afterHandoff.operationsState.reservations
        .filter((reservation) => reservation.groupId === "staff")
        .map((reservation) => [reservation.resourceId, reservation.startAt, reservation.endAt]),
      [
        ["browser-doctor-a", 500, 505],
        ["browser-doctor-b", 505, 523]
      ],
      "handoff ownership segments must survive reload"
    );
    assert.match(
      afterHandoff.operationsState.commandFingerprints["browser-handoff-active"],
      /^handoff:[0-9a-f]{16}$/,
      "handoff idempotency fingerprint must survive reload"
    );
    assert.equal(afterHandoff.generatedDayRaw, before.generatedDayRaw);
    await assertForeignStorage(page, "handoff reload");

    const urgent = await urgentCapacityEvidence(page);
    assert.deepEqual(urgent, {
      reasonCode: "urgent_capacity_unavailable_safe_route_required",
      taskStatus: "queued",
      safeRouteRequired: true
    });
    await page.screenshot({ path: path.join(artifactRoot, "01-operations-active-after-reload.png"), fullPage: true });
    assert.deepEqual(issues, [], `browser issues detected:\n${issues.join("\n")}`);

    console.log(JSON.stringify({
      status: "passed",
      baseUrl: baseUrl.href,
      playwrightVersion,
      gameSaveVersion: afterHandoff.gameVersion,
      activeTaskRestored: true,
      reservationCount: afterHandoff.operationsSummary.reservationCount,
      handoffRestored: true,
      urgentFullLoadReason: urgent.reasonCode,
      generatedDayUnchanged: true,
      activeVisitUnchanged: true,
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
