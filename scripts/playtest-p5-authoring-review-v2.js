"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const playwrightVersion = require("playwright/package.json").version;
const pinnedPlaywrightVersion = require("../package.json").devDependencies.playwright;

assert.equal(playwrightVersion, pinnedPlaywrightVersion, "installed Playwright does not match package.json");

const projectRoot = path.resolve(__dirname, "..");
const baseUrl = new URL(
  process.env.PLAYTEST_BASE_URL
    || process.env.BASE_URL
    || "http://127.0.0.1:5174/?generatorMode=tier-01-v2",
);
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath();
const artifactRoot = path.resolve(
  process.env.PLAYTEST_ARTIFACT_DIR
    || path.join(os.tmpdir(), "vetgeme-p5-authoring-review-v2-playtest"),
);
const GAME_KEY = "pet-clinic-game-tier-01-v2";
const GENERATOR_KEY = "pet-clinic-generator-v2";
const RELOAD_STATE_KEY = "vetgeme-p5-authoring-review-v2-reload";
const INITIALIZATION_KEY = "vetgeme-p5-authoring-review-v2-initialized";
const TARGET_ROOM_ID = "room.consult.2";
const TARGET_ROOM_ASSET_ID = "asset.room.consult.2";
const TASK_ID = "browser-p5v2-referral";
const START_AT = 500;
const HANDOFF_AT = 506;
const END_AT = 512;
const ORIGINAL_DOCTOR_ID = "staff.doctor.morozov";
const TARGET_DOCTOR_ID = "staff.doctor.sokolova";
const FOREIGN_SENTINELS = Object.freeze({
  "pet-clinic-game-current": "p5v2-current-game-sentinel",
  "pet-clinic-game-legacy-v1": "p5v2-legacy-game-sentinel",
  "pet-clinic-generator-v1": "p5v2-legacy-generator-sentinel",
});

if (!baseUrl.searchParams.has("generatorMode")) baseUrl.searchParams.set("generatorMode", "tier-01-v2");
assert.equal(baseUrl.searchParams.get("generatorMode"), "tier-01-v2");
fs.mkdirSync(artifactRoot, { recursive: true });

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
  page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      issues.push(`response ${response.status()}: ${response.request().method()} ${response.url()}`);
    }
  });
  return { issues, requests };
}

async function waitForReady(page) {
  await page.locator('html[data-app-status="ready"]').waitFor({ state: "attached", timeout: 30000 });
  const evidence = await page.evaluate(({ gameKey, generatorKey }) => {
    const runtime = window.__PET_CLINIC_RUNTIME__;
    const ready = window.__PET_CLINIC_APP_READY__ || null;
    const compactGame = JSON.parse(window.localStorage.getItem(gameKey) || "null");
    const generator = JSON.parse(window.localStorage.getItem(generatorKey) || "null");
    const pool = runtime?.catalog?.medicalCatalog?.productionPool;
    return {
      ready,
      mode: runtime?.mode || null,
      configuredMode: window.PET_CLINIC_GENERATOR_MODE?.mode || null,
      gameSaveKey: window.PET_CLINIC_GENERATOR_MODE?.gameSaveKey || null,
      catalogCaseIds: runtime?.catalog?.cases?.map((record) => record.id) || [],
      medicalLoadContext: runtime?.catalog?.medicalCatalog?.loadContext || null,
      medicalProductionPool: pool ? {
        families: pool.families?.length ?? null,
        variants: pool.variants?.length ?? null,
        presentations: pool.presentations?.length ?? null,
      } : null,
      gameSaveVersion: compactGame?.gameStateSaveVersion ?? null,
      campaignDay: compactGame?.state?.day ?? null,
      generatorSeed: generator?.campaignSeed ?? null,
      generatedDays: JSON.stringify(generator?.generatedDays || {}),
      campaignProgress: document.querySelector("#campaignProgress")?.textContent?.trim() || "",
      lifecycleLoaded: Boolean(window.PET_CLINIC_RESOURCE_LIFECYCLE_V5),
      appStatus: document.documentElement.dataset.appStatus || null,
      initializationError: runtime?.initializationError?.message || null,
    };
  }, { gameKey: GAME_KEY, generatorKey: GENERATOR_KEY });
  assert.ok(evidence.ready, "tier-01-v2 readiness detail is missing");
  assert.equal(evidence.mode, "tier-01-v2");
  assert.equal(evidence.configuredMode, "tier-01-v2");
  assert.equal(evidence.gameSaveKey, GAME_KEY);
  assert.equal(evidence.catalogCaseIds.length, 30, "the active compatibility catalog changed");
  assert.equal(new Set(evidence.catalogCaseIds).size, 30, "the active compatibility catalog contains duplicate IDs");
  assert.equal(evidence.medicalLoadContext, "review");
  assert.deepEqual(evidence.medicalProductionPool, { families: 0, variants: 0, presentations: 0 });
  assert.equal(evidence.campaignDay, 1);
  assert.equal(typeof evidence.generatorSeed, "string", "campaign seed is not a string");
  assert.ok(evidence.generatorSeed.trim(), "campaign seed is missing");
  assert.match(evidence.campaignProgress, /(?:кампания|campaign)\s*1\/30/iu);
  assert.equal(evidence.appStatus, "ready");
  assert.equal(evidence.initializationError, null);
  return evidence;
}

function assertNormalRuntimeUnchanged(before, after) {
  assert.equal(after.mode, before.mode);
  assert.equal(after.configuredMode, before.configuredMode);
  assert.equal(after.gameSaveKey, before.gameSaveKey);
  assert.deepEqual(after.catalogCaseIds, before.catalogCaseIds, "the active 30-case catalog changed");
  assert.deepEqual(after.medicalProductionPool, before.medicalProductionPool);
  assert.equal(after.gameSaveVersion, before.gameSaveVersion, "game save schema changed");
  assert.equal(after.campaignDay, before.campaignDay, "campaign day changed");
  assert.equal(after.generatorSeed, before.generatorSeed, "campaign seed changed");
  assert.equal(after.generatedDays, before.generatedDays, "persisted generated day changed");
  assert.equal(after.campaignProgress, before.campaignProgress, "30-day campaign progress changed");
}

async function assertForeignStorage(page, label) {
  const actual = await page.evaluate((keys) => Object.fromEntries(
    keys.map((key) => [key, window.localStorage.getItem(key)]),
  ), Object.keys(FOREIGN_SENTINELS));
  assert.deepEqual(actual, FOREIGN_SENTINELS, `${label}: foreign mode storage changed`);
}

async function addDormantLifecycleScript(page) {
  assert.equal(
    await page.evaluate(() => Boolean(window.PET_CLINIC_RESOURCE_LIFECYCLE_V5)),
    false,
    "review-only lifecycle primitive was loaded by the ordinary game boot",
  );
  const lifecycleUrl = new URL("/systems/resource-lifecycle-v5.js", baseUrl).href;
  await page.addScriptTag({ url: lifecycleUrl });
  assert.equal(
    await page.evaluate(() => typeof window.PET_CLINIC_RESOURCE_LIFECYCLE_V5?.createResourceLifecycleRuntime),
    "function",
    "dormant lifecycle primitive did not load on explicit test request",
  );
}

async function exerciseLifecycleAndHandoff(page, payload) {
  return page.evaluate((input) => {
    function check(condition, message) {
      if (!condition) throw new Error(`P5 .2 browser smoke assertion failed: ${message}`);
    }
    function sorted(values) {
      return [...values].sort((left, right) => String(left).localeCompare(String(right), "en"));
    }
    function sameStrings(left, right) {
      return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
    }
    function activePhysical(snapshot) {
      return snapshot.activeResourceIds.filter((resourceId) => !resourceId.startsWith("staff."));
    }
    function activeStaff(snapshot) {
      return snapshot.activeResourceIds.filter((resourceId) => resourceId.startsWith("staff."));
    }
    function room(snapshot) {
      return snapshot.resources[input.targetRoomId];
    }
    function execute(runtime, state, command, commandPayload, context = {}) {
      const beforeReload = runtime.deserializeState(runtime.serializeState(state));
      check(JSON.stringify(beforeReload) === JSON.stringify(state), `${command} changed before-transition reload state`);
      const executed = runtime.execute(beforeReload, command, commandPayload, context).state;
      const afterReload = runtime.deserializeState(runtime.serializeState(executed));
      check(JSON.stringify(afterReload) === JSON.stringify(executed), `${command} changed after-transition reload state`);
      return afterReload;
    }

    const lifecycleApi = window.PET_CLINIC_RESOURCE_LIFECYCLE_V5;
    const scheduler = window.PET_CLINIC_RESOURCE_SCHEDULER_V5;
    check(lifecycleApi && scheduler, "lifecycle or scheduler API is missing");
    const lifecycle = lifecycleApi.createResourceLifecycleRuntime(input.lifecycleConfig);
    let lifecycleState = lifecycle.createState();
    const initial = lifecycle.snapshot(lifecycleState, input.startAt);
    check(sameStrings(activePhysical(initial), input.expectedInitialPhysicalIds),
      "initial physical authority is not exactly five rooms plus two equipment assets");
    check(activeStaff(initial).length === 0, "staff became active without a shift");
    for (const doctorId of input.doctorIds) {
      const doctor = initial.resources[doctorId];
      check(doctor.hired === true && doctor.shifts.length === 0 && doctor.active === false,
        `${doctorId} did not start hired_unscheduled`);
    }

    lifecycleState = execute(lifecycle, lifecycleState, "purchase_asset", {
      commandId: "browser-p5v2-purchase-room",
      assetCatalogId: input.targetRoomAssetId,
      purchasedAt: input.targetRoomPurchasedAt,
      price: input.targetRoomPurchasePrice,
    }, {
      currentMinute: input.targetRoomPurchasedAt,
      unlockedAssetCatalogIds: [input.targetRoomAssetId],
    });
    const afterPurchase = lifecycle.snapshot(lifecycleState, input.startAt);
    check(room(afterPurchase).owned === true && room(afterPurchase).delivered === false
      && room(afterPurchase).ready === false && room(afterPurchase).active === false,
    "purchase incorrectly activated the room");

    for (const [doctorIndex, doctorId] of input.doctorIds.entries()) {
      lifecycleState = execute(lifecycle, lifecycleState, "assign_shift", {
        commandId: `browser-p5v2-assign-${doctorId.split(".").pop()}`,
        staffId: doctorId,
        shiftId: `browser-p5v2-shift-${doctorId.split(".").pop()}`,
        startAt: 480,
        endAt: doctorIndex === 0 ? 840 : 960,
      }, { currentMinute: input.targetRoomPurchasedAt });
    }

    lifecycleState = execute(lifecycle, lifecycleState, "mark_delivery_complete", {
      commandId: "browser-p5v2-deliver-room",
      assetId: input.targetRoomAssetId,
      deliveredAt: input.targetRoomDeliveredAt,
    }, { currentMinute: input.targetRoomDeliveredAt });
    const afterDelivery = lifecycle.snapshot(lifecycleState, input.targetRoomDeliveredAt);
    check(room(afterDelivery).owned === true && room(afterDelivery).delivered === true
      && room(afterDelivery).ready === false && room(afterDelivery).active === false,
    "delivery incorrectly bypassed the room-ready gate");

    lifecycleState = execute(lifecycle, lifecycleState, "mark_room_ready", {
      commandId: "browser-p5v2-ready-room",
      roomId: input.targetRoomId,
      readyAt: input.targetRoomReadyAt,
    }, { currentMinute: input.targetRoomReadyAt });
    const afterReady = lifecycle.snapshot(lifecycleState, input.targetRoomReadyAt);
    check(room(afterReady).active === true, "room did not activate after ownership, delivery and ready evidence");

    const active = lifecycle.snapshot(lifecycleState, input.startAt);
    check(sameStrings(activeStaff(active), input.doctorIds), "the two explicit doctor shifts did not activate exactly two doctors");
    check(activePhysical(active).length === input.expectedInitialPhysicalIds.length,
      "a future room lifecycle transition changed current physical availability");
    check(active.commandCount === 5, "unexpected lifecycle command count");

    let schedulerState = scheduler.createState(lifecycle.projectSchedulerResources(lifecycleState, {
      startAt: 480,
      endAt: 960,
    }));
    schedulerState = scheduler.enqueueTask(schedulerState, {
      commandId: "browser-p5v2-enqueue-referral",
      task: input.exactTask,
    }).state;
    const scheduled = scheduler.scheduleTask(schedulerState, {
      commandId: "browser-p5v2-schedule-referral",
      at: input.startAt,
    });
    check(scheduled.reasonCode === "scheduled", "exact authored task was not scheduled");
    schedulerState = scheduled.state;
    const originalReservations = schedulerState.reservations.filter((reservation) => reservation.taskId === input.taskId);
    const originalStaff = originalReservations.filter((reservation) => reservation.groupId === "staff");
    check(originalStaff.length === 1
      && originalStaff[0].resourceId === input.originalDoctorId
      && originalStaff[0].capabilityId === "role.doctor"
      && originalStaff[0].startAt === input.startAt
      && originalStaff[0].endAt === input.endAt,
    "original doctor does not own the exact active reservation");

    const handedOff = scheduler.handoffTask(schedulerState, {
      commandId: "browser-p5v2-handoff-referral",
      taskId: input.taskId,
      at: input.handoffAt,
      reassignments: [{
        groupId: "staff",
        fromResourceId: input.originalDoctorId,
        toResourceId: input.targetDoctorId,
        capabilityId: "role.doctor",
        units: 1,
      }],
    });
    check(handedOff.reasonCode === "handed_off", "atomic handoff was not accepted");
    schedulerState = handedOff.state;
    const staffSegments = schedulerState.reservations
      .filter((reservation) => reservation.taskId === input.taskId && reservation.groupId === "staff")
      .map((reservation) => [reservation.resourceId, reservation.startAt, reservation.endAt]);
    check(JSON.stringify(staffSegments) === JSON.stringify([
      [input.originalDoctorId, input.startAt, input.handoffAt],
      [input.targetDoctorId, input.handoffAt, input.endAt],
    ]), "handoff reservation ownership segments are wrong");
    const roomReservations = schedulerState.reservations
      .filter((reservation) => reservation.taskId === input.taskId && reservation.groupId === "room");
    check(roomReservations.length === 1
      && roomReservations[0].resourceId === "room.reception.1"
      && roomReservations[0].startAt === input.startAt
      && roomReservations[0].endAt === input.endAt,
    "unassigned room reservation changed during staff handoff");

    const lifecycleSerialized = lifecycle.serializeState(lifecycleState);
    const schedulerSerialized = JSON.stringify(schedulerState);
    window.sessionStorage.setItem(input.reloadStateKey, JSON.stringify({
      lifecycleSerialized,
      schedulerSerialized,
    }));
    return {
      initialActivePhysicalIds: sorted(activePhysical(initial)),
      initialActiveStaffIds: sorted(activeStaff(initial)),
      initialDoctorStates: Object.fromEntries(input.doctorIds.map((doctorId) => [doctorId, {
        hired: initial.resources[doctorId].hired,
        shifts: initial.resources[doctorId].shifts.length,
        active: initial.resources[doctorId].active,
      }])),
      roomGates: {
        purchaseActive: room(afterPurchase).active,
        deliveryActive: room(afterDelivery).active,
        readyActive: room(afterReady).active,
      },
      activeDoctorIds: sorted(activeStaff(active)),
      lifecycleCommandCount: active.commandCount,
      originalStaffOwner: originalStaff[0].resourceId,
      staffSegments,
      roomOwner: roomReservations[0].resourceId,
      schedulerReservationCount: schedulerState.reservations.length,
    };
  }, payload);
}

async function restoreLifecycleAndHandoff(page, payload) {
  return page.evaluate((input) => {
    function check(condition, message) {
      if (!condition) throw new Error(`P5 .2 browser reload assertion failed: ${message}`);
    }
    const stored = JSON.parse(window.sessionStorage.getItem(input.reloadStateKey) || "null");
    check(stored, "serialized review state is missing after reload");
    const lifecycleApi = window.PET_CLINIC_RESOURCE_LIFECYCLE_V5;
    const scheduler = window.PET_CLINIC_RESOURCE_SCHEDULER_V5;
    const lifecycle = lifecycleApi.createResourceLifecycleRuntime(input.lifecycleConfig);
    const lifecycleState = lifecycle.deserializeState(stored.lifecycleSerialized);
    const schedulerState = scheduler.normalizeState(JSON.parse(stored.schedulerSerialized));
    const snapshot = lifecycle.snapshot(lifecycleState, input.startAt);
    const staffSegments = schedulerState.reservations
      .filter((reservation) => reservation.taskId === input.taskId && reservation.groupId === "staff")
      .map((reservation) => [reservation.resourceId, reservation.startAt, reservation.endAt]);
    const task = schedulerState.tasks.find((record) => record.id === input.taskId);
    check(snapshot.commandCount === 5, "lifecycle commands did not survive serialization");
    check(snapshot.resources[input.targetRoomId].active === false,
      "future room readiness activated capacity before its authored time after reload");
    check(lifecycle.snapshot(lifecycleState, input.targetRoomReadyAt).resources[input.targetRoomId].active === true,
      "ready room did not survive serialization at its authored ready time");
    check(input.doctorIds.every((doctorId) => snapshot.resources[doctorId].active === true),
      "doctor shifts did not survive serialization");
    check(task?.status === "active" && task.startAt === input.startAt && task.endAt === input.endAt,
      "active exact task did not survive scheduler normalization");
    check(JSON.stringify(staffSegments) === JSON.stringify([
      [input.originalDoctorId, input.startAt, input.handoffAt],
      [input.targetDoctorId, input.handoffAt, input.endAt],
    ]), "handoff ownership did not survive serialization/reload");
    check(/^handoff:[0-9a-f]{16}$/u.test(
      schedulerState.commandFingerprints?.["browser-p5v2-handoff-referral"] || "",
    ), "handoff idempotency fingerprint did not survive serialization/reload");
    window.sessionStorage.removeItem(input.reloadStateKey);
    return {
      lifecycleCommandCount: snapshot.commandCount,
      activeResourceCount: snapshot.activeResourceIds.length,
      taskStatus: task.status,
      staffSegments,
      reservationCount: schedulerState.reservations.length,
      handoffFingerprint: schedulerState.commandFingerprints["browser-p5v2-handoff-referral"],
    };
  }, payload);
}

async function main() {
  const [p5InputModule, operationalInputModule, adapterModule] = await Promise.all([
    import(pathToFileURL(path.join(projectRoot, "scripts/lib/p5-authoring-review-input-v2.mjs")).href),
    import(pathToFileURL(path.join(projectRoot, "scripts/lib/operational-authoring-review-input-v4.mjs")).href),
    import(pathToFileURL(path.join(projectRoot, "scripts/lib/p5-authoring-review-adapter-v2.mjs")).href),
  ]);
  const [p5ReviewInput, operationalReviewInput] = await Promise.all([
    p5InputModule.loadP5AuthoringReviewInputV2(projectRoot, { context: "review" }),
    operationalInputModule.loadOperationalAuthoringReviewInputV4(projectRoot, { context: "review" }),
  ]);
  const adapter = adapterModule.createP5AuthoringReviewAdapterV2(p5ReviewInput, operationalReviewInput);
  assert.equal(adapter.reviewOnly, true);
  assert.equal(adapter.runtimeEligible, false);
  assert.equal(adapter.productionEligible, false);
  assert.equal(adapter.generatorEligible, false);
  assert.equal(adapter.productionPool.length, 0);
  assert.equal(adapter.audit.resources, 49);
  assert.equal(adapter.audit.lifecycleCommands, 13);
  assert.equal(adapter.audit.exactRequirementGroupsAreReservationAuthority, true);
  assert.equal(adapter.audit.reservationAuthorityScope, "review_adapter_only");
  assert.equal(adapter.audit.liveRuntimeReservationAuthorityEnabled, false);
  assert.equal(adapter.audit.flattenedOperationalResourceIdsAreReservationAuthority, false);
  assert.equal(adapter.audit.liveSaveSchemaChanged, false);
  const reservationPredicateAudit = adapter.auditReservationPredicateAuthority();
  assert.equal(reservationPredicateAudit.taskTemplatesAudited, 2606);
  assert.equal(reservationPredicateAudit.affectedTaskTemplates, 10);
  assert.equal(reservationPredicateAudit.gapCount, 15);

  const resourceCrosswalk = operationalReviewInput.documents["source/p6-p5-exact-resource-crosswalk.json"];
  const targetRoomCrosswalk = resourceCrosswalk.resources.find((record) => record.resourceId === TARGET_ROOM_ID);
  assert.ok(targetRoomCrosswalk, `${TARGET_ROOM_ID} is absent from the exact resource crosswalk`);
  assert.equal(targetRoomCrosswalk.assetCatalogId, TARGET_ROOM_ASSET_ID);
  const exactTask = adapter.createTask({
    kind: "visit",
    sourceId: "visit.referral_coordination",
    taskId: TASK_ID,
    queuedAt: START_AT,
    fatigue: { percent: 0, durationMultiplier: 1 },
    patientId: "browser-p5v2-patient",
  });
  assert.equal(exactTask.authoredDurationMinutes, END_AT - START_AT);
  const payload = {
    lifecycleConfig: {
      resourceCatalog: p5ReviewInput.documents["generated/resource-catalog.json"],
      lifecycleCatalog: p5ReviewInput.documents["generated/resource-lifecycle-catalog.json"],
      operationalPolicies: p5ReviewInput.documents["generated/operational-policies.json"],
      resourceCrosswalk,
    },
    expectedInitialPhysicalIds: p5ReviewInput.audit.activePhysicalResourceIds,
    doctorIds: [ORIGINAL_DOCTOR_ID, TARGET_DOCTOR_ID],
    targetRoomId: TARGET_ROOM_ID,
    targetRoomAssetId: TARGET_ROOM_ASSET_ID,
    targetRoomPurchasePrice: targetRoomCrosswalk.economicRecord.purchasePrice,
    targetRoomPurchasedAt: 100,
    targetRoomDeliveredAt: 100
      + targetRoomCrosswalk.economicRecord.deliveryDays
        * p5ReviewInput.documents["generated/operational-policies.json"].clock.dayLengthMinutes,
    targetRoomReadyAt: 100
      + (targetRoomCrosswalk.economicRecord.deliveryDays
        + targetRoomCrosswalk.economicRecord.readyingDays)
        * p5ReviewInput.documents["generated/operational-policies.json"].clock.dayLengthMinutes,
    exactTask,
    taskId: TASK_ID,
    startAt: START_AT,
    handoffAt: HANDOFF_AT,
    endAt: END_AT,
    originalDoctorId: ORIGINAL_DOCTOR_ID,
    targetDoctorId: TARGET_DOCTOR_ID,
    reloadStateKey: RELOAD_STATE_KEY,
  };

  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ initializationKey }) => {
    if (window.sessionStorage.getItem(initializationKey) === "1") return;
    window.localStorage.clear();
    window.sessionStorage.setItem(initializationKey, "1");
  }, { initializationKey: INITIALIZATION_KEY });
  const page = await context.newPage();
  const observed = observePage(page);
  try {
    const navigation = await page.goto(baseUrl.href, { waitUntil: "networkidle", timeout: 30000 });
    assert.ok(navigation, "normal tier-01-v2 navigation returned no response");
    assert.equal(navigation.status(), 200);
    const before = await waitForReady(page);
    assert.equal(before.lifecycleLoaded, false, "P5 .2 lifecycle primitive must remain dormant on normal boot");
    const startupReviewRequests = observed.requests.filter((request) => (
      new URL(request.url).pathname.startsWith("/content/review-inputs/")
    ));
    assert.deepEqual(startupReviewRequests, [], "normal startup fetched review-only authoring input");

    await page.evaluate((sentinels) => {
      for (const [key, value] of Object.entries(sentinels)) window.localStorage.setItem(key, value);
    }, FOREIGN_SENTINELS);
    await assertForeignStorage(page, "before review primitive exercise");
    await addDormantLifecycleScript(page);
    const exercised = await exerciseLifecycleAndHandoff(page, payload);
    await assertForeignStorage(page, "after review primitive exercise");

    await page.reload({ waitUntil: "networkidle", timeout: 30000 });
    const afterReload = await waitForReady(page);
    assert.equal(afterReload.lifecycleLoaded, false, "normal reload unexpectedly activated P5 .2 lifecycle");
    assertNormalRuntimeUnchanged(before, afterReload);
    await assertForeignStorage(page, "normal game reload");
    await addDormantLifecycleScript(page);
    const restored = await restoreLifecycleAndHandoff(page, payload);
    await assertForeignStorage(page, "review primitive restore");
    const afterRestore = await waitForReady(page);
    assertNormalRuntimeUnchanged(before, afterRestore);

    const reviewInputRequests = observed.requests.filter((request) => (
      new URL(request.url).pathname.startsWith("/content/review-inputs/")
    ));
    assert.deepEqual(reviewInputRequests, [], "browser runtime fetched review-only authoring input");
    assert.deepEqual(observed.issues, [], `browser issues detected:\n${observed.issues.join("\n")}`);
    const screenshot = path.join(artifactRoot, "tier-01-v2-after-dormant-p5-review-smoke.png");
    await page.screenshot({ path: screenshot, fullPage: true });

    console.log(JSON.stringify({
      status: "passed",
      baseUrl: baseUrl.href,
      playwrightVersion,
      normalRuntime: {
        mode: afterRestore.mode,
        compatibilityCases: afterRestore.catalogCaseIds.length,
        campaignDay: afterRestore.campaignDay,
        campaignDays: 30,
        campaignSeedUnchanged: afterRestore.generatorSeed === before.generatorSeed,
        generatedDayUnchanged: afterRestore.generatedDays === before.generatedDays,
        medicalProductionPool: afterRestore.medicalProductionPool,
        reviewInputRequests: reviewInputRequests.length,
      },
      dormantAdapter: {
        version: adapter.adapterVersion,
        p5Version: adapter.audit.p5Version,
        operationalVersion: adapter.audit.operationalVersion,
        productionPool: adapter.productionPool.length,
        resources: adapter.audit.resources,
        lifecycleCommands: adapter.audit.lifecycleCommands,
        reservationPredicateAuthorGaps: {
          affectedTaskTemplates: reservationPredicateAudit.affectedTaskTemplates,
          gapCount: reservationPredicateAudit.gapCount,
          safeReferralFailClosed: true,
        },
      },
      lifecycle: exercised,
      restored,
      modeIsolation: true,
      browserIssues: observed.issues,
      screenshot,
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
