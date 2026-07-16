"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH || "playwright";
const { chromium } = require(playwrightModule);

const projectRoot = path.resolve(__dirname, "..");
const baseUrl = new URL(
  process.env.PLAYTEST_BASE_URL
    || process.env.BASE_URL
    || "http://127.0.0.1:5174/",
);
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath();
const artifactRoot = path.resolve(
  process.env.PLAYTEST_ARTIFACT_DIR
    || path.join(os.tmpdir(), "vetgeme-p9-authoring-review-v2-playtest"),
);
const temporaryRoots = [path.resolve("/tmp"), path.resolve(os.tmpdir())];
const viewports = Object.freeze([
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 960, height: 720 },
  { width: 390, height: 844 },
]);
const GAME_KEY = "pet-clinic-game-tier-01-v2";
const GENERATOR_KEY = "pet-clinic-generator-v2";
const RELOAD_FIXTURE_KEY = "vetgeme-p9-authoring-review-v2-reload-fixture";
const INITIALIZATION_KEY = "vetgeme-p9-authoring-review-v2-initialized";
const FOREIGN_SENTINELS = Object.freeze({
  "pet-clinic-game-current": "p9v2-current-game-sentinel",
  "pet-clinic-game-legacy-v1": "p9v2-legacy-game-sentinel",
  "pet-clinic-generator-v1": "p9v2-legacy-generator-sentinel",
});
const RAW_PLAYER_TEXT_PATTERN = /(?:reasonCode|reason_code|\b(?:asset|capability|case|equipment|investigation|owner|patient|room|staff|task)\.[A-Za-z0-9._:-]+)/iu;

const reviewUrl = new URL(baseUrl.href);
reviewUrl.searchParams.set("generatorMode", "tier-01-v2");
reviewUrl.searchParams.set("visualMode", "modular-v2");
reviewUrl.searchParams.set("p9", "review-v2");

const ordinaryUrl = new URL(baseUrl.href);
ordinaryUrl.searchParams.set("generatorMode", "tier-01-v2");
ordinaryUrl.searchParams.set("visualMode", "modular-v2");
ordinaryUrl.searchParams.delete("p9");

assert.ok(
  temporaryRoots.some((root) => artifactRoot === root || artifactRoot.startsWith(`${root}${path.sep}`)),
  `P9 review evidence must stay in a temporary directory, received ${artifactRoot}`,
);
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
  page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
  page.on("requestfailed", (request) => {
    issues.push(
      `requestfailed: ${request.method()} ${request.url()} (${request.failure()?.errorText || "unknown"})`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      issues.push(`response ${response.status()}: ${response.request().method()} ${response.url()}`);
    }
  });
  return { issues, requests };
}

async function installCleanStorage(context) {
  await context.addInitScript(({ initializationKey, sentinels }) => {
    window.__VETGEME_P9_REVIEW_HARNESS__ = true;
    if (window.sessionStorage.getItem(initializationKey) === "1") return;
    window.localStorage.clear();
    for (const [key, value] of Object.entries(sentinels)) {
      window.localStorage.setItem(key, value);
    }
    window.sessionStorage.setItem(initializationKey, "1");
  }, { initializationKey: INITIALIZATION_KEY, sentinels: FOREIGN_SENTINELS });
}

async function waitForReady(page) {
  await page.locator('html[data-app-status="ready"]').waitFor({ state: "attached", timeout: 30000 });
  await page.waitForFunction(() => window.PET_CLINIC_VISUAL_V2?.isReady?.() === true, null, {
    timeout: 30000,
  });
  const evidence = await page.evaluate(({ gameKey, generatorKey }) => {
    const runtime = window.__PET_CLINIC_RUNTIME__;
    const game = JSON.parse(window.localStorage.getItem(gameKey) || "null");
    const generator = JSON.parse(window.localStorage.getItem(generatorKey) || "null");
    return {
      ready: window.__PET_CLINIC_APP_READY__ || null,
      appStatus: document.documentElement.dataset.appStatus || null,
      mode: runtime?.mode || null,
      configuredMode: window.PET_CLINIC_GENERATOR_MODE?.mode || null,
      gameSaveKey: window.PET_CLINIC_GENERATOR_MODE?.gameSaveKey || null,
      caseCount: runtime?.catalog?.cases?.length ?? null,
      productionPool: {
        families: runtime?.catalog?.medicalCatalog?.productionPool?.families?.length ?? null,
        variants: runtime?.catalog?.medicalCatalog?.productionPool?.variants?.length ?? null,
        presentations: runtime?.catalog?.medicalCatalog?.productionPool?.presentations?.length ?? null,
      },
      saveSchemaVersion: game?.gameStateSaveVersion ?? null,
      campaignDay: game?.state?.day ?? null,
      campaignSeed: generator?.campaignSeed ?? null,
      generatedDays: JSON.stringify(generator?.generatedDays || {}),
      visualStatus: window.PET_CLINIC_VISUAL_V2?.getStatus?.() || null,
    };
  }, { gameKey: GAME_KEY, generatorKey: GENERATOR_KEY });
  assert.ok(evidence.ready, "tier-01-v2 readiness detail is missing");
  assert.equal(evidence.appStatus, "ready");
  assert.equal(evidence.mode, "tier-01-v2");
  assert.equal(evidence.configuredMode, "tier-01-v2");
  assert.equal(evidence.gameSaveKey, GAME_KEY);
  assert.equal(evidence.caseCount, 30, "the active compatibility catalog changed");
  assert.deepEqual(evidence.productionPool, { families: 0, variants: 0, presentations: 0 });
  assert.equal(evidence.campaignDay, 1);
  assert.equal(typeof evidence.campaignSeed, "string");
  assert.ok(evidence.campaignSeed.trim(), "campaign seed is missing");
  assert.equal(evidence.visualStatus?.ready, true, "modular-v2 renderer did not become ready");
  return evidence;
}

async function ensureShiftStartedAndPaused(page) {
  const startButton = page.locator("#startShiftBtn");
  if (await startButton.isVisible()) {
    await startButton.click();
    await page.locator("#shiftWindow").waitFor({ state: "hidden", timeout: 10000 });
  }
  const pauseButton = page.locator("#pauseBtn");
  if ((await pauseButton.textContent())?.trim() === "II") await pauseButton.click();
  await page.waitForFunction(() => document.querySelector("#pauseBtn")?.textContent?.trim() === "▶");
  await page.waitForTimeout(100);
}

async function storageEvidence(page) {
  return page.evaluate(({ gameKey, generatorKey, sentinels }) => {
    const game = JSON.parse(window.localStorage.getItem(gameKey) || "null");
    const generator = JSON.parse(window.localStorage.getItem(generatorKey) || "null");
    return {
      saveSchemaVersion: game?.gameStateSaveVersion ?? null,
      campaignDay: game?.state?.day ?? null,
      campaignSeed: generator?.campaignSeed ?? null,
      generatedDays: JSON.stringify(generator?.generatedDays || {}),
      foreign: Object.fromEntries(
        Object.keys(sentinels).map((key) => [key, window.localStorage.getItem(key)]),
      ),
    };
  }, { gameKey: GAME_KEY, generatorKey: GENERATOR_KEY, sentinels: FOREIGN_SENTINELS });
}

function assertStorageUnchanged(before, after, label) {
  assert.equal(after.saveSchemaVersion, before.saveSchemaVersion, `${label}: save schema changed`);
  assert.equal(after.campaignDay, before.campaignDay, `${label}: campaign day changed`);
  assert.equal(after.campaignSeed, before.campaignSeed, `${label}: campaign seed changed`);
  assert.equal(after.generatedDays, before.generatedDays, `${label}: generated day changed`);
  assert.deepEqual(after.foreign, FOREIGN_SENTINELS, `${label}: foreign mode storage changed`);
}

async function assertReviewGlobalsDormant(page, label) {
  const globals = await page.evaluate(() => ({
    lifecycle: Boolean(window.PET_CLINIC_RESOURCE_LIFECYCLE_V5),
    scheduler: Boolean(window.PET_CLINIC_RESOURCE_SCHEDULER_V5),
    adapter: Boolean(window.PET_CLINIC_P9_VISUAL_STATE_ADAPTER_V2),
    surface: Boolean(window.PET_CLINIC_P9_REVIEW_SURFACE_V2),
    mounted: Boolean(document.querySelector("[data-p9-review-surface]")),
  }));
  assert.equal(globals.lifecycle, false, `${label}: dormant lifecycle primitive loaded on ordinary boot`);
  assert.equal(globals.scheduler, true, `${label}: canonical scheduler authority is missing`);
  assert.equal(globals.adapter, false, `${label}: P9 adapter loaded on ordinary boot`);
  assert.equal(globals.surface, false, `${label}: P9 review surface loaded on ordinary boot`);
  assert.equal(globals.mounted, false, `${label}: P9 review UI mounted on ordinary boot`);
  return globals;
}

async function injectReviewHarness(page) {
  const scriptPaths = [
    "/systems/resource-lifecycle-v5.js",
    "/systems/resource-scheduler-v5.js",
    "/systems/p9-visual-state-adapter-v2.js",
    "/visual/p9-review-surface-v2.js",
  ];
  for (const pathname of scriptPaths) {
    await page.addScriptTag({ url: new URL(pathname, reviewUrl).href });
  }
  await page.addStyleTag({ url: new URL("/visual/p9-review-surface-v2.css", reviewUrl).href });
  const injected = await page.evaluate(() => ({
    lifecycle: typeof window.PET_CLINIC_RESOURCE_LIFECYCLE_V5?.createResourceLifecycleRuntime,
    schedulerCreate: typeof window.PET_CLINIC_RESOURCE_SCHEDULER_V5?.createState,
    schedulerValidate: typeof window.PET_CLINIC_RESOURCE_SCHEDULER_V5?.validateState,
    adapter: typeof window.PET_CLINIC_P9_VISUAL_STATE_ADAPTER_V2?.createP9VisualStateAdapter,
    surface: typeof window.PET_CLINIC_P9_REVIEW_SURFACE_V2?.createReviewSurface,
  }));
  assert.deepEqual(injected, {
    lifecycle: "function",
    schedulerCreate: "function",
    schedulerValidate: "function",
    adapter: "function",
    surface: "function",
  });
  return scriptPaths;
}

async function projectReviewState(page, { restore = false } = {}) {
  const urls = Object.fromEntries(Object.entries({
    roomCatalog: "/content/review-inputs/vetgeme-p9-visual-state-authoring-2026.07.16.2/source/generated/room-visual-state-catalog.json",
    equipmentCatalog: "/content/review-inputs/vetgeme-p9-visual-state-authoring-2026.07.16.2/source/generated/equipment-visual-state-catalog.json",
    staffCatalog: "/content/review-inputs/vetgeme-p9-visual-state-authoring-2026.07.16.2/source/generated/staff-visual-state-catalog.json",
    hudContract: "/content/review-inputs/vetgeme-p9-visual-state-authoring-2026.07.16.2/source/generated/hud-data-contract.json",
    resourceCatalog: "/content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.2/source/generated/resource-catalog.json",
    lifecycleCatalog: "/content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.2/source/generated/resource-lifecycle-catalog.json",
    operationalPolicies: "/content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.2/source/generated/operational-policies.json",
    resourceCrosswalk: "/content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.4/source/source/p6-p5-exact-resource-crosswalk.json",
    assetCrosswalk: "/content/review-inputs/vetgeme-p9-visual-state-authoring-2026.07.16.2/host/runtime-v2-crosswalk.json",
  }).map(([key, pathname]) => [key, new URL(pathname, reviewUrl).href]));

  return page.evaluate(async ({ fixtureKey, restoreFixture, documentUrls }) => {
    function check(condition, message) {
      if (!condition) throw new Error(`P9 .2 browser review assertion failed: ${message}`);
    }
    async function fetchJson(url) {
      const response = await fetch(url);
      check(response.ok, `${url} returned HTTP ${response.status}`);
      return response.json();
    }
    const entries = await Promise.all(
      Object.entries(documentUrls).map(async ([key, url]) => [key, await fetchJson(url)]),
    );
    const documents = Object.fromEntries(entries);
    const schedulerAuthority = window.PET_CLINIC_RESOURCE_SCHEDULER_V5;
    const adapter = window.PET_CLINIC_P9_VISUAL_STATE_ADAPTER_V2.createP9VisualStateAdapter({
      roomCatalog: documents.roomCatalog,
      equipmentCatalog: documents.equipmentCatalog,
      staffCatalog: documents.staffCatalog,
      hudContract: documents.hudContract,
      resourceCatalog: documents.resourceCatalog,
      assetCrosswalk: documents.assetCrosswalk,
      schedulerAuthority,
    });

    let input;
    let expectedProjection = null;
    if (restoreFixture) {
      const fixture = JSON.parse(window.sessionStorage.getItem(fixtureKey) || "null");
      check(fixture?.schemaVersion === 1, "serialized reload fixture is missing");
      input = fixture.input;
      expectedProjection = fixture.projection;
    } else {
      const lifecycle = window.PET_CLINIC_RESOURCE_LIFECYCLE_V5.createResourceLifecycleRuntime({
        resourceCatalog: documents.resourceCatalog,
        lifecycleCatalog: documents.lifecycleCatalog,
        operationalPolicies: documents.operationalPolicies,
        resourceCrosswalk: documents.resourceCrosswalk,
      });
      const lifecycleState = lifecycle.createState();
      let schedulerState = schedulerAuthority.createState(
        lifecycle.projectSchedulerResources(lifecycleState, { startAt: 0, endAt: 500 }),
      );
      schedulerState = schedulerAuthority.enqueueTask(schedulerState, {
        commandId: "p9-browser-enqueue-resource-review",
        task: {
          id: "p9-browser-active-resource-review",
          queuedAt: 100,
          priority: 0,
          authoredDurationMinutes: 20,
          fatigue: { percent: 0, durationMultiplier: 1 },
          requirementGroups: [
            {
              id: "equipment",
              anyOf: [{
                resourceId: "equipment.microscope",
                capabilityId: "microscope",
                units: 1,
              }],
            },
            {
              id: "room",
              anyOf: [{
                resourceId: "room.consult.1",
                capabilityId: "room.consult",
                units: 1,
              }],
            },
          ],
          urgency: "routine",
          safeRouteRequired: false,
        },
      }).state;
      const scheduled = schedulerAuthority.scheduleTask(schedulerState, {
        commandId: "p9-browser-schedule-resource-review",
        at: 100,
      });
      check(scheduled.reasonCode === "scheduled", "canonical resource review task was not scheduled");
      schedulerState = scheduled.state;
      const schedulerValidation = schedulerAuthority.validateState(schedulerState);
      check(schedulerValidation.valid === true, `canonical scheduler fixture is invalid: ${schedulerValidation.errors}`);
      const lifecycleSnapshot = lifecycle.snapshot(lifecycleState, 100, {
        schedulerState,
        absenceWindows: [],
      });
      input = {
        schemaVersion: 1,
        at: 100,
        lifecycleSnapshot,
        schedulerState,
        preparationSignals: [],
        stockSignals: [],
        hudAuthorities: [
          {
            surfaceId: "clinic_identity",
            authority: "p7.campaignState",
            data: { clinicLevel: 1, chapter: 1, day: 1, campaignDay: 1 },
          },
          {
            surfaceId: "next_patient",
            authority: "p5.queueState+p4.identityState",
            data: {
              patientName: "Тучка",
              species: "кошка",
              waitingMinutes: 4,
              ownerRequestHumanText: "Владелец просит спокойно осмотреть уши",
            },
          },
          {
            surfaceId: "queue",
            authority: "p5.queueState",
            data: {
              waitingCount: 1,
              inRoomCount: 0,
              patientCards: [{ patientName: "Тучка", species: "кошка", status: "Ожидает приёма" }],
            },
          },
          {
            surfaceId: "day_goals",
            authority: "p7.dayState",
            data: { goalHumanText: "Завершить первый приём", progress: 0, completed: false },
          },
          {
            surfaceId: "cash",
            authority: "p6.ledgerState",
            data: { cash: 1350, todayDelta: 0 },
          },
          {
            surfaceId: "clock_controls",
            authority: "simulation.clock",
            data: { day: 1, time: "08:20", minutesToClose: 340, speed: 1, paused: true },
          },
          {
            surfaceId: "trust_reputation",
            authority: "p4.ownerState+p6.reputationState",
            data: { ownerTrust: 74, clinicalReliability: 74, staffFatigue: 6 },
          },
          {
            surfaceId: "active_capacity",
            authority: "p5.scheduler",
            data: { activeVisits: 1, capacity: 1, blockedReasonHumanText: "Кабинет занят проверкой" },
          },
          {
            surfaceId: "event_log",
            authority: "appendOnlyEventLog",
            data: { time: "08:20", humanText: "Клиника открыта", severity: "informational" },
          },
        ],
        transitionNotice: {
          whatHappened: "Доставка прибыла в клинику",
          whatChanged: "Оборудование можно готовить к работе",
          whatCanBeDone: "Назначьте обучение сотрудника",
        },
        presentation: { reducedMotion: false },
      };
    }

    const inputBefore = JSON.stringify(input);
    const view = adapter.project(input);
    check(JSON.stringify(input) === inputBefore, "adapter mutated the simulation fixture");
    const projectionJson = JSON.stringify(view);
    const reloadProjectionExact = expectedProjection === null
      ? null
      : projectionJson === JSON.stringify(expectedProjection);
    if (restoreFixture) check(reloadProjectionExact, "projection changed after sessionStorage reload");
    if (!restoreFixture) {
      window.sessionStorage.setItem(fixtureKey, JSON.stringify({
        schemaVersion: 1,
        input,
        projection: view,
      }));
    }

    const existingSurface = window.__P9_REVIEW_SURFACE_INSTANCE__;
    existingSurface?.destroy?.();
    const surface = window.PET_CLINIC_P9_REVIEW_SURFACE_V2.createReviewSurface({ document });
    surface.mount().render(view).showNotice(view.transitionNotice);
    const toastParts = document.querySelectorAll(".p9-review-toast > *").length;
    check(toastParts === 3, "transition notice does not show three human parts");
    surface.hideNotice();

    window.__P9_VIEW__ = view;
    window.__P9_ADAPTER_INSTANCE__ = adapter;
    window.__P9_REVIEW_SURFACE_INSTANCE__ = surface;
    if (!window.__P9_RENDERER_PATCHED__) {
      const renderer = window.PET_CLINIC_VISUAL_V2;
      const originalDrawScene = renderer.drawScene.bind(renderer);
      window.__P9_DRAW_COUNT__ = 0;
      renderer.drawScene = (context, options = {}) => {
        window.__P9_DRAW_COUNT__ += 1;
        return originalDrawScene(context, { ...options, visualState: window.__P9_VIEW__ });
      };
      window.__P9_RENDERER_PATCHED__ = true;
    }

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const allResources = [
      ...view.resources.rooms,
      ...view.resources.equipment,
      ...view.resources.staff,
    ];
    const canvasResourceIds = [
      ...Object.values(view.scene.roomsBySceneId),
      ...Object.values(view.scene.placementsById),
    ].map((record) => record.resourceId);
    return {
      adapterId: view.adapterId,
      adapterVersion: view.adapterVersion,
      reviewOnly: view.reviewOnly,
      runtimeEligible: view.runtimeEligible,
      resourceCount: allResources.length,
      rooms: view.resources.rooms.length,
      equipment: view.resources.equipment.length,
      staff: view.resources.staff.length,
      hudSurfaces: view.hud.surfaces.length,
      missingArtFallbacks: allResources.filter((record) => Boolean(record.fallbackLabel)).length,
      sharedVariants: allResources.filter((record) => Boolean(record.variantLabel)).length,
      canvasRooms: Object.keys(view.scene.roomsBySceneId).length,
      canvasPlacements: Object.keys(view.scene.placementsById).length,
      canvasStaff: canvasResourceIds.filter((resourceId) => resourceId.startsWith("staff.")).length,
      busyRoomState: view.resources.rooms.find((record) => record.resourceId === "room.consult.1")?.state,
      busyMicroscopeState: view.resources.equipment.find((record) => record.resourceId === "equipment.microscope")?.state,
      schedulerResources: Object.keys(input.schedulerState.resources).length,
      schedulerTasks: input.schedulerState.tasks.length,
      schedulerReservations: input.schedulerState.reservations.length,
      transitionNoticeParts: toastParts,
      drawCount: window.__P9_DRAW_COUNT__,
      reloadProjectionExact,
      projectionJson,
    };
  }, {
    fixtureKey: RELOAD_FIXTURE_KEY,
    restoreFixture: restore,
    documentUrls: urls,
  });
}

function assertProjectionEvidence(evidence, label) {
  assert.equal(evidence.reviewOnly, true, `${label}: reviewOnly boundary changed`);
  assert.equal(evidence.runtimeEligible, false, `${label}: runtime was activated`);
  assert.equal(evidence.resourceCount, 49, `${label}: resource count changed`);
  assert.deepEqual(
    { rooms: evidence.rooms, equipment: evidence.equipment, staff: evidence.staff },
    { rooms: 12, equipment: 27, staff: 10 },
  );
  assert.equal(evidence.hudSurfaces, 9, `${label}: HUD contract count changed`);
  assert.ok(evidence.missingArtFallbacks > 0, `${label}: honest missing-art labels disappeared`);
  assert.ok(evidence.sharedVariants > 0, `${label}: shared variant labels disappeared`);
  assert.equal(evidence.canvasRooms, 4, `${label}: inferred room coordinates reached Canvas`);
  assert.equal(evidence.canvasPlacements, 19, `${label}: Canvas placement binding count changed`);
  assert.equal(evidence.canvasStaff, 0, `${label}: a secretary/staff placement reached Canvas`);
  assert.equal(evidence.busyRoomState, "busy", `${label}: canonical room reservation is not visible`);
  assert.equal(evidence.busyMicroscopeState, "busy", `${label}: canonical microscope reservation is not visible`);
  assert.equal(evidence.schedulerResources, 49, `${label}: scheduler fixture is shortened`);
  assert.equal(evidence.schedulerTasks, 1, `${label}: canonical active scheduler task is missing`);
  assert.equal(evidence.schedulerReservations, 2, `${label}: canonical reservation ownership is missing`);
  assert.equal(evidence.transitionNoticeParts, 3, `${label}: transition notice is incomplete`);
}

async function inspectClosedSurface(page, viewport) {
  const evidence = await page.evaluate(() => {
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const controls = document.querySelector(".p9-review-controls");
    const chip = document.querySelector(".p9-review-chip");
    const summary = document.querySelector(".p9-review-summary");
    const drawer = document.querySelector(".p9-review-drawer");
    const bottomHud = document.querySelector(".bottom-hud");
    const controlsRect = rect(controls);
    const bottomHudRect = rect(bottomHud);
    const center = {
      left: innerWidth * 0.22,
      right: innerWidth * 0.78,
      top: innerHeight * 0.14,
      bottom: innerHeight * 0.82,
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      controls: controlsRect,
      bottomHud: bottomHudRect,
      chip: rect(chip),
      chipText: chip.textContent,
      chipExpanded: chip.getAttribute("aria-expanded"),
      drawerHidden: drawer.hidden,
      summaryDisplay: getComputedStyle(summary).display,
      visibleControlButtons: [...controls.querySelectorAll("button")].filter((button) => {
        const style = getComputedStyle(button);
        const box = button.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
      }).length,
      protectedCenterOverlap: controlsRect.right > center.left
        && controlsRect.left < center.right
        && controlsRect.bottom > center.top
        && controlsRect.top < center.bottom,
      bottomHudOverlap: controlsRect.right > bottomHudRect.left
        && controlsRect.left < bottomHudRect.right
        && controlsRect.bottom > bottomHudRect.top
        && controlsRect.top < bottomHudRect.bottom,
      documentWidth: {
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      },
    };
  });
  assert.deepEqual(evidence.viewport, viewport);
  assert.equal(evidence.drawerHidden, true, `${viewport.width}: normal play drawer is open`);
  assert.equal(evidence.chipExpanded, "false", `${viewport.width}: collapsed chip reports expanded`);
  assert.equal(evidence.visibleControlButtons, 1, `${viewport.width}: expected one collapsed control`);
  assert.ok(evidence.chip.left >= -1 && evidence.chip.right <= viewport.width + 1, `${viewport.width}: chip is clipped`);
  assert.ok(evidence.chip.top >= -1 && evidence.chip.bottom <= viewport.height + 1, `${viewport.width}: chip is vertically clipped`);
  assert.equal(evidence.bottomHudOverlap, false, `${viewport.width}: review controls overlap the bottom HUD`);
  assert.match(evidence.chipText, /^Ресурсы · \d+\/49$/u);
  if (viewport.width <= 760) {
    assert.equal(evidence.summaryDisplay, "none", "mobile review state did not collapse to one chip");
    assert.equal(evidence.protectedCenterOverlap, false, "mobile chip overlaps the protected center");
  } else {
    assert.equal(evidence.protectedCenterOverlap, false, `${viewport.width}: controls overlap protected center`);
    assert.ok(
      evidence.controls.right <= viewport.width * 0.18 + 1,
      `${viewport.width}: closed controls exceed 18% edge budget`,
    );
  }
  return evidence;
}

async function inspectOpenDrawer(page) {
  await page.evaluate(() => window.__P9_REVIEW_SURFACE_INSTANCE__.open());
  await page.locator(".p9-review-drawer").waitFor({ state: "visible" });
  const evidence = await page.evaluate((rawPlayerTextPatternSource) => {
    const drawer = document.querySelector(".p9-review-drawer");
    const rect = drawer.getBoundingClientRect();
    const text = drawer.innerText;
    const textDefects = [...drawer.querySelectorAll("strong, span, small")].flatMap((element) => {
      const style = getComputedStyle(element);
      const reasons = [];
      if (element.scrollWidth > element.clientWidth + 1) reasons.push("horizontal_clip");
      if (style.textOverflow === "ellipsis") reasons.push("ellipsis");
      if (!["", "none", "unset"].includes(style.webkitLineClamp)) reasons.push(`line_clamp_${style.webkitLineClamp}`);
      return reasons.length ? [{ text: element.textContent.slice(0, 80), reasons }] : [];
    });
    return {
      drawer: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      resourceRows: drawer.querySelectorAll(".p9-review-resource").length,
      fallbackLabels: drawer.querySelectorAll(".p9-review-resource-copy small:not(.p9-review-variant)").length,
      variantLabels: drawer.querySelectorAll(".p9-review-variant").length,
      hasHonestMissingArtText: /ещё нет отдельной картинки|отдельная картинка ещё не подготовлена/u.test(text),
      hasRawPlayerText: new RegExp(rawPlayerTextPatternSource, "iu").test(text),
      textDefects,
    };
  }, RAW_PLAYER_TEXT_PATTERN.source);
  assert.equal(evidence.drawer.left, 0);
  assert.ok(evidence.drawer.right <= 1280 + 1 && evidence.drawer.bottom <= 720 + 1, "drawer is clipped");
  assert.equal(evidence.resourceRows, 49, "drawer does not contain all 49 resources");
  assert.ok(evidence.fallbackLabels > 0, "missing-art DOM fallback labels are absent");
  assert.ok(evidence.variantLabels > 0, "shared shell variant labels are absent");
  assert.equal(evidence.hasHonestMissingArtText, true, "missing-art text is not honest Russian fallback text");
  assert.equal(evidence.hasRawPlayerText, false, "drawer exposes raw ID or reasonCode");
  assert.deepEqual(evidence.textDefects, [], `drawer text is clipped: ${JSON.stringify(evidence.textDefects.slice(0, 5))}`);
  return evidence;
}

async function inspectReducedMotion(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const evidence = await page.evaluate((fixtureKey) => {
    window.__P9_REVIEW_SURFACE_INSTANCE__.close();
    const fixture = JSON.parse(window.sessionStorage.getItem(fixtureKey) || "null");
    const reducedInput = JSON.parse(JSON.stringify(fixture.input));
    reducedInput.presentation.reducedMotion = true;
    const reducedView = window.__P9_ADAPTER_INSTANCE__.project(reducedInput);
    const baselineComparable = JSON.parse(JSON.stringify(fixture.projection));
    const reducedComparable = JSON.parse(JSON.stringify(reducedView));
    delete baselineComparable.presentation;
    delete reducedComparable.presentation;
    window.__P9_VIEW__ = reducedView;
    window.__P9_REVIEW_SURFACE_INSTANCE__.render(reducedView);
    const chipStyle = getComputedStyle(document.querySelector(".p9-review-chip"));
    return {
      reducedMotion: reducedView.presentation.reducedMotion,
      motionMode: reducedView.presentation.motionMode,
      transitionsEnabled: reducedView.presentation.transitionsEnabled,
      simulationProjectionUnchanged: JSON.stringify(baselineComparable) === JSON.stringify(reducedComparable),
      surfaceReducedClass: document.querySelector(".p9-review-controls").classList.contains("reduced-motion"),
      animationName: chipStyle.animationName,
      transitionDuration: chipStyle.transitionDuration,
    };
  }, RELOAD_FIXTURE_KEY);
  assert.deepEqual(
    {
      reducedMotion: evidence.reducedMotion,
      motionMode: evidence.motionMode,
      transitionsEnabled: evidence.transitionsEnabled,
      simulationProjectionUnchanged: evidence.simulationProjectionUnchanged,
      surfaceReducedClass: evidence.surfaceReducedClass,
    },
    {
      reducedMotion: true,
      motionMode: "reduced",
      transitionsEnabled: false,
      simulationProjectionUnchanged: true,
      surfaceReducedClass: true,
    },
  );
  assert.equal(evidence.animationName, "none");
  assert.match(evidence.transitionDuration, /^(?:0s)(?:, 0s)*$/u);
  return evidence;
}

async function inspectRoomTransition(page) {
  const evidence = await page.evaluate(async ({ fixtureKey }) => {
    const fixture = JSON.parse(window.sessionStorage.getItem(fixtureKey) || "null");
    if (fixture?.schemaVersion !== 1) throw new Error("P9 transition fixture is missing");
    const input = JSON.parse(JSON.stringify(fixture.input));
    const waitingRoom = input.lifecycleSnapshot.resources["room.waiting.1"];
    Object.assign(waitingRoom, {
      owned: true,
      delivered: false,
      ready: false,
      active: false,
    });
    const view = window.__P9_ADAPTER_INSTANCE__.project(input);
    const room = view.scene.roomsBySceneId.waiting;
    const placementIds = [
      "waiting-diploma",
      "waiting-clock",
      "waiting-bench-1",
      "waiting-bench-2",
    ];
    const placementOverlayCounts = Object.fromEntries(placementIds.map((placementId) => [
      placementId,
      view.scene.placementsById[placementId].overlayAssetIds.length,
    ]));
    if (JSON.stringify(room.overlayAssetIds) !== JSON.stringify([
      "progression.delivery-pallet",
      "progression.stacked-boxes",
    ])) throw new Error("P9 pending-delivery room overlays are incomplete");
    if (Object.values(placementOverlayCounts).some((count) => count !== 0)) {
      throw new Error("P9 room overlays were duplicated on room placements");
    }
    const canvas = document.querySelector("#clinicCanvas");
    if (!canvas) throw new Error("P9 transition pixel evidence cannot read clinic Canvas");
    const captureRegion = () => {
      const sample = document.createElement("canvas");
      sample.width = 170;
      sample.height = 80;
      const sampleContext = sample.getContext("2d", { willReadFrequently: true });
      sampleContext.drawImage(canvas, 300, 430, 170, 80, 0, 0, 170, 80);
      return sampleContext.getImageData(0, 0, 170, 80).data;
    };
    const beforePixels = captureRegion();
    const drawCountBefore = window.__P9_DRAW_COUNT__;
    window.__P9_VIEW__ = view;
    window.__P9_REVIEW_SURFACE_INSTANCE__.render(view);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const afterPixels = captureRegion();
    let changedPixels = 0;
    for (let index = 0; index < beforePixels.length; index += 4) {
      if (beforePixels[index] !== afterPixels[index]
        || beforePixels[index + 1] !== afterPixels[index + 1]
        || beforePixels[index + 2] !== afterPixels[index + 2]
        || beforePixels[index + 3] !== afterPixels[index + 3]) changedPixels += 1;
    }
    return {
      resourceId: "room.waiting.1",
      state: view.resources.rooms.find((record) => record.resourceId === "room.waiting.1")?.state,
      roomOverlayAssetIds: room.overlayAssetIds,
      placementOverlayCounts,
      serializedP5SnapshotShape: input.lifecycleSnapshot.schemaVersion === 1,
      rendererDrawCountDelta: window.__P9_DRAW_COUNT__ - drawCountBefore,
      changedCanvasPixels: changedPixels,
    };
  }, { fixtureKey: RELOAD_FIXTURE_KEY });
  assert.equal(evidence.state, "pending_delivery");
  assert.equal(evidence.serializedP5SnapshotShape, true);
  assert.ok(evidence.rendererDrawCountDelta > 0, "renderer did not draw the room transition state");
  assert.ok(evidence.changedCanvasPixels > 50, "room transition overlays are not visibly changing Canvas pixels");
  return evidence;
}

function p9RequestPaths(requests) {
  return requests.map((request) => new URL(request.url).pathname).filter((pathname) => (
    pathname.includes("/p9-")
    || pathname.includes("/vetgeme-p9-")
    || pathname.includes("/assets/progression/")
  ));
}

async function assertOrdinaryBoot(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await installCleanStorage(context);
  const page = await context.newPage();
  const observed = observePage(page);
  try {
    const response = await page.goto(ordinaryUrl.href, { waitUntil: "networkidle", timeout: 30000 });
    assert.ok(response, "ordinary runtime navigation returned no response");
    assert.equal(response.status(), 200);
    const ready = await waitForReady(page);
    const globals = await assertReviewGlobalsDormant(page, "ordinary page");
    const reviewRequests = p9RequestPaths(observed.requests);
    assert.deepEqual(reviewRequests, [], "ordinary page fetched P9 review resources");
    assert.deepEqual(observed.issues, [], `ordinary browser issues:\n${observed.issues.join("\n")}`);
    return {
      url: ordinaryUrl.href,
      mode: ready.mode,
      compatibilityCases: ready.caseCount,
      productionPool: ready.productionPool,
      globals,
      p9ReviewRequests: reviewRequests,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const screenshots = [];
  try {
    const context = await browser.newContext({ viewport: viewports[0], deviceScaleFactor: 1 });
    await installCleanStorage(context);
    const page = await context.newPage();
    const observed = observePage(page);
    let reviewEvidence;
    try {
      const response = await page.goto(reviewUrl.href, { waitUntil: "networkidle", timeout: 30000 });
      assert.ok(response, "P9 review navigation returned no response");
      assert.equal(response.status(), 200);
      await waitForReady(page);
      await ensureShiftStartedAndPaused(page);
      const storageBefore = await storageEvidence(page);
      assert.deepEqual(storageBefore.foreign, FOREIGN_SENTINELS, "foreign mode sentinels were not installed");
      const globalsBefore = await assertReviewGlobalsDormant(page, "P9 review URL before explicit injection");

      const injectedScripts = await injectReviewHarness(page);
      const firstProjection = await projectReviewState(page);
      assertProjectionEvidence(firstProjection, "initial projection");
      assert.ok(firstProjection.drawCount > 0, "renderer did not consume the explicit P9 visual state");
      const storageAfterProjection = await storageEvidence(page);
      assertStorageUnchanged(storageBefore, storageAfterProjection, "initial P9 projection");

      await page.reload({ waitUntil: "networkidle", timeout: 30000 });
      await waitForReady(page);
      await assertReviewGlobalsDormant(page, "P9 review URL after ordinary reload");
      await injectReviewHarness(page);
      const restoredProjection = await projectReviewState(page, { restore: true });
      assertProjectionEvidence(restoredProjection, "restored projection");
      assert.equal(restoredProjection.reloadProjectionExact, true, "sessionStorage projection changed after reload");
      assert.equal(
        restoredProjection.projectionJson,
        firstProjection.projectionJson,
        "projected visual state is not byte-exact after reload",
      );
      const storageAfterReload = await storageEvidence(page);
      assertStorageUnchanged(storageBefore, storageAfterReload, "P9 projection reload");

      const layoutMatrix = [];
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => window.__P9_REVIEW_SURFACE_INSTANCE__.close());
        await page.waitForTimeout(100);
        layoutMatrix.push(await inspectClosedSurface(page, viewport));
        const screenshot = path.join(artifactRoot, `closed-${viewport.width}x${viewport.height}.png`);
        await page.screenshot({ path: screenshot });
        screenshots.push(screenshot);
      }

      await page.setViewportSize({ width: 1280, height: 720 });
      const roomTransition = await inspectRoomTransition(page);
      const roomTransitionScreenshot = path.join(artifactRoot, "room-pending-delivery-1280x720.png");
      await page.screenshot({ path: roomTransitionScreenshot });
      screenshots.push(roomTransitionScreenshot);
      const restoredAfterTransition = await projectReviewState(page, { restore: true });
      assert.equal(restoredAfterTransition.reloadProjectionExact, true);

      const openDrawer = await inspectOpenDrawer(page);
      const drawerScreenshot = path.join(artifactRoot, "open-drawer-1280x720.png");
      await page.screenshot({ path: drawerScreenshot });
      screenshots.push(drawerScreenshot);

      const reducedMotion = await inspectReducedMotion(page);
      const reducedScreenshot = path.join(artifactRoot, "reduced-motion-1280x720.png");
      await page.screenshot({ path: reducedScreenshot });
      screenshots.push(reducedScreenshot);

      const finalStorage = await storageEvidence(page);
      assertStorageUnchanged(storageBefore, finalStorage, "responsive/reduced-motion matrix");
      const receptionistRequests = observed.requests.filter((request) => (
        /\/receptionist(?:[-/.]|$)/iu.test(new URL(request.url).pathname)
        || /\/secretary(?:[-/.]|$)/iu.test(new URL(request.url).pathname)
      ));
      assert.deepEqual(
        receptionistRequests,
        [],
        "secretary/receptionist image was requested for the Canvas scene",
      );
      assert.deepEqual(observed.issues, [], `P9 review browser issues:\n${observed.issues.join("\n")}`);

      reviewEvidence = {
        url: reviewUrl.href,
        globalsBefore,
        injectedScripts,
        firstProjection: {
          adapterId: firstProjection.adapterId,
          adapterVersion: firstProjection.adapterVersion,
          resourceCount: firstProjection.resourceCount,
          rooms: firstProjection.rooms,
          equipment: firstProjection.equipment,
          staff: firstProjection.staff,
          hudSurfaces: firstProjection.hudSurfaces,
          missingArtFallbacks: firstProjection.missingArtFallbacks,
          sharedVariants: firstProjection.sharedVariants,
          canvasRooms: firstProjection.canvasRooms,
          canvasPlacements: firstProjection.canvasPlacements,
          canvasStaff: firstProjection.canvasStaff,
          busyRoomState: firstProjection.busyRoomState,
          busyMicroscopeState: firstProjection.busyMicroscopeState,
          schedulerResources: firstProjection.schedulerResources,
          schedulerTasks: firstProjection.schedulerTasks,
          schedulerReservations: firstProjection.schedulerReservations,
        },
        reload: {
          exactProjection: restoredProjection.reloadProjectionExact,
          sessionStorageFixture: true,
        },
        storage: {
          saveSchemaVersion: finalStorage.saveSchemaVersion,
          campaignDay: finalStorage.campaignDay,
          campaignSeedUnchanged: finalStorage.campaignSeed === storageBefore.campaignSeed,
          generatedDayUnchanged: finalStorage.generatedDays === storageBefore.generatedDays,
          foreignModeKeysUnchanged: JSON.stringify(finalStorage.foreign) === JSON.stringify(FOREIGN_SENTINELS),
        },
        layoutMatrix,
        roomTransition,
        openDrawer,
        reducedMotion,
        receptionistCanvasRequests: receptionistRequests.length,
        browserIssues: observed.issues,
      };
    } finally {
      await context.close();
    }

    const ordinaryBoot = await assertOrdinaryBoot(browser);
    const evidence = {
      status: "passed",
      reviewOnly: true,
      runtimeEligible: false,
      review: reviewEvidence,
      ordinaryBoot,
      viewports,
      screenshots,
      screenshotCount: screenshots.length,
    };
    const evidencePath = path.join(artifactRoot, "evidence.json");
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({
      status: evidence.status,
      reviewOnly: evidence.reviewOnly,
      runtimeEligible: evidence.runtimeEligible,
      resources: reviewEvidence.firstProjection.resourceCount,
      hudSurfaces: reviewEvidence.firstProjection.hudSurfaces,
      exactProjectionAfterReload: reviewEvidence.reload.exactProjection,
      viewports: viewports.length,
      screenshots: screenshots.length,
      browserIssues: reviewEvidence.browserIssues.length,
      ordinaryP9Requests: ordinaryBoot.p9ReviewRequests.length,
      evidence: evidencePath,
    }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  const failure = {
    status: "failed",
    error: error.stack || error.message,
    evidenceDirectory: artifactRoot,
  };
  try {
    fs.writeFileSync(path.join(artifactRoot, "failure.json"), `${JSON.stringify(failure, null, 2)}\n`, "utf8");
  } catch {
    // The original failure remains the authoritative test result.
  }
  process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exitCode = 1;
});
