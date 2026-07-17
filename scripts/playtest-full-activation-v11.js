#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = new URL(process.env.PLAYTEST_BASE_URL || "http://127.0.0.1:5174/");
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath();
const artifactRoot = path.resolve(process.env.PLAYTEST_ARTIFACT_DIR
  || path.join(os.tmpdir(), "vetgeme-full-activation-v11-playtest"));
const viewports = Object.freeze([
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 960, height: 720 }
]);
const modeLaunches = Object.freeze([
  { id: "campaign", label: "Новая кампания" },
  { id: "training", label: "Начать обучение" },
  { id: "endless", label: "Новая клиника" },
  { id: "tester", label: "Открыть тестирование" }
]);
const modeKeys = Object.freeze(Object.fromEntries(modeLaunches.map(({ id }) => [
  id,
  `pet-clinic-game-v11:${id}`
])));

fs.mkdirSync(artifactRoot, { recursive: true });

function observePage(page) {
  const issues = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) issues.push(`console ${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.stack || error.message}`));
  page.on("requestfailed", (request) => {
    issues.push(`requestfailed: ${request.method()} ${request.url()} (${request.failure()?.errorText || "unknown"})`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) issues.push(`response ${response.status()}: ${response.url()}`);
  });
  return issues;
}

function menuUrl() {
  const url = new URL(baseUrl.href);
  ["gameMode", "generatorMode", "familyId", "variantId", "presentationId", "testerPool", "legacyCaseId"]
    .forEach((key) => url.searchParams.delete(key));
  url.searchParams.set("playtest", "full-activation-v11");
  return url;
}

async function dismissLegacyNotice(page) {
  const button = page.getByRole("button", { name: "Понятно, удалить старые сохранения" });
  if (await button.isVisible()) await button.click();
}

async function openMenu(page) {
  const response = await page.goto(menuUrl().href, { waitUntil: "networkidle", timeout: 30000 });
  assert.equal(response?.status(), 200);
  await page.locator("#startMenu:not([hidden])").waitFor({ state: "visible", timeout: 30000 });
  await dismissLegacyNotice(page);
  return page.locator("#startMenu");
}

async function waitForGame(page, modeId) {
  await page.locator('html[data-app-status="ready"]').waitFor({ state: "attached", timeout: 30000 });
  await page.waitForFunction((expectedMode) => (
    window.__PET_CLINIC_APP_READY__
    && window.__PET_CLINIC_RUNTIME__?.catalog?.activation
    && document.documentElement.dataset.gameMode === expectedMode
  ), modeId, { timeout: 30000 });
  const evidence = await page.evaluate(() => ({
    modeId: document.documentElement.dataset.gameMode,
    runtimeMode: window.__PET_CLINIC_RUNTIME__?.mode,
    cases: window.__PET_CLINIC_RUNTIME__?.catalog?.cases?.length,
    families: window.__PET_CLINIC_RUNTIME__?.catalog?.activationAudit?.counts?.families,
    variants: window.__PET_CLINIC_RUNTIME__?.catalog?.activationAudit?.counts?.variants,
    presentations: window.__PET_CLINIC_RUNTIME__?.catalog?.activationAudit?.counts?.presentations,
    initializationError: window.__PET_CLINIC_RUNTIME__?.initializationError?.message || null
  }));
  assert.equal(evidence.modeId, modeId);
  assert.equal(evidence.runtimeMode, "tier-01-v2");
  assert.equal(evidence.cases, 645);
  assert.deepEqual([evidence.families, evidence.variants, evidence.presentations], [39, 215, 645]);
  assert.equal(evidence.initializationError, null);
  return evidence;
}

async function launchMode(page, mode) {
  await openMenu(page);
  await page.locator(`[data-mode-launch="${mode.id}"][data-launch-action="new"]`).click();
  await waitForGame(page, mode.id);
  assert.equal(new URL(page.url()).searchParams.get("gameMode"), mode.id);
}

async function openShiftAndSettings(page) {
  const start = page.locator("#startShiftBtn");
  if (await start.isVisible()) await start.click();
  const settings = page.locator("#developerBtn");
  await settings.waitFor({ state: "visible", timeout: 30000 });
  await settings.click();
  await page.locator("#developerPanel:not(.hidden)").waitFor({ state: "visible", timeout: 5000 });
}

async function testerCoverage(page) {
  await openShiftAndSettings(page);
  const family = page.locator("#testerFamilySelect");
  const variant = page.locator("#testerVariantSelect");
  const presentation = page.locator("#testerPresentationSelect");
  const familyValues = await family.locator("option").evaluateAll((options) => options.map((option) => option.value));
  let variants = 0;
  let presentations = 0;
  for (const familyId of familyValues) {
    await family.selectOption(familyId);
    const variantValues = await variant.locator("option").evaluateAll((options) => options.map((option) => option.value));
    variants += variantValues.length;
    for (const variantId of variantValues) {
      await variant.selectOption(variantId);
      presentations += await presentation.locator("option").count();
    }
  }
  assert.deepEqual([familyValues.length, variants, presentations], [39, 215, 645]);
  await page.locator("#testerArchiveToggle").check();
  assert.equal(await page.locator("#testerLegacyCaseSelect option").count(), 30);
  await page.locator("#testerArchiveToggle").uncheck();
  return { families: familyValues.length, variants, presentations, legacyArchive: 30 };
}

async function saveEvidence(page) {
  return page.evaluate((keys) => {
    const raw = Object.fromEntries(Object.entries(keys).map(([modeId, key]) => [modeId, localStorage.getItem(key)]));
    const seed = Object.fromEntries(Object.entries(raw).map(([modeId, value]) => {
      const envelope = value ? JSON.parse(value) : null;
      const generatorRaw = envelope?.generatorStorage?.["pet-clinic-generator-v2"] || null;
      return [modeId, generatorRaw ? JSON.parse(generatorRaw).campaignSeed : null];
    }));
    return { raw, seed };
  }, modeKeys);
}

async function modeAndResetSmoke(page) {
  const modes = {};
  for (const mode of modeLaunches) {
    await launchMode(page, mode);
    const beforeReload = await saveEvidence(page);
    assert(beforeReload.raw[mode.id], `${mode.id}: v11 save is missing`);
    assert(beforeReload.seed[mode.id], `${mode.id}: campaign seed is missing`);
    const visibleSchedule = await page.locator("#shiftForecast").innerText();
    await page.reload({ waitUntil: "networkidle" });
    await waitForGame(page, mode.id);
    const afterReload = await saveEvidence(page);
    assert.equal(afterReload.seed[mode.id], beforeReload.seed[mode.id], `${mode.id}: seed changed after reload`);
    assert.equal(await page.locator("#shiftForecast").innerText(), visibleSchedule,
      `${mode.id}: visible day changed after reload`);
    modes[mode.id] = { seed: beforeReload.seed[mode.id], reloadStable: true };
  }

  await openMenu(page);
  for (const { id } of modeLaunches) {
    assert.equal(await page.locator(`[data-mode-continue="${id}"]`).isEnabled(), true, `${id}: continue is disabled`);
  }
  await page.locator('[data-mode-continue="tester"]').click();
  await waitForGame(page, "tester");
  const tester = await testerCoverage(page);
  const beforeReset = await saveEvidence(page);

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#newGameBtn").click();
  await page.waitForTimeout(200);
  const afterCancel = await saveEvidence(page);
  assert.deepEqual(afterCancel.raw, beforeReset.raw, "cancelled reset changed a save");

  const navigation = page.waitForNavigation({ waitUntil: "networkidle", timeout: 30000 });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#newGameBtn").click();
  await navigation;
  await waitForGame(page, "tester");
  const afterReset = await saveEvidence(page);
  assert.notEqual(afterReset.seed.tester, beforeReset.seed.tester, "tester reset reused the previous campaign seed");
  for (const modeId of ["campaign", "training", "endless"]) {
    assert.equal(afterReset.raw[modeId], beforeReset.raw[modeId], `tester reset changed ${modeId}`);
  }
  modes.tester.reset = { cancelledUnchanged: true, newSeed: true, otherModesUnchanged: true };
  return { modes, tester };
}

async function runtimeScenarios(page) {
  return page.evaluate(() => {
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const runtime = window.__PET_CLINIC_RUNTIME__;
    const catalog = runtime.catalog;
    const p5 = catalog.p5Activation;
    const p6 = catalog.economyActivation;
    const scheduler = window.PET_CLINIC_RESOURCE_SCHEDULER_V5;
    const operations = window.PET_CLINIC_OPERATIONS_RUNTIME_V5.createOperationsRuntime(scheduler);
    const resources = p5.documents.resourceCatalog.resources.map((record) => ({
      ...clone(record.runtimeResourceTemplate),
      unavailableWindows: []
    }));
    let operationsState = operations.createState({ ...scheduler.createState(resources), handoffs: [] });
    const input = (state, researchId, usageId, taskId, branch, at) => ({
      operationsState: state,
      researchId,
      usageId,
      taskId,
      branch,
      at,
      fatigue: { percent: 0, durationMultiplier: 1 },
      identifiers: { patientId: "browser-patient", ownerId: "browser-owner" }
    });

    const xrayResearchId = "pancreatitis_radiography_for_differentials";
    const xrayUsageId = "gi_pancreas_acute.pancreatitis_dog_acute_stable.p1_vomiting_abdominal_pain_after_nonspecific_trigger.pancreatitis_radiography_for_differentials.3";
    const referral = p5.scheduleResearch(input(operationsState, xrayResearchId, xrayUsageId,
      "browser-xray-referral", "referral", 100));
    const localXray = p5.scheduleResearch(input(operationsState, xrayResearchId, xrayUsageId,
      "browser-xray-local", "local", 100));
    if (!localXray.scheduled) throw new Error("browser local xray was not scheduled");
    const localXrayOwners = localXray.reservations.map((reservation) => reservation.resourceId).sort();
    operationsState = localXray.state;

    const gdvResearchId = "gdv_postoperative_reperfusion_arrhythmia_and_organ_monitoring";
    const gdvUsage = p5.documents.usageTasks.usageTasks.find((record) => record.researchId === gdvResearchId);
    const gdv = p5.scheduleResearch(input(operationsState, gdvResearchId, gdvUsage.usageId,
      "browser-gdv", "local", 200));
    if (!gdv.scheduled) throw new Error("browser GDV sequence was not scheduled");
    const procedure = gdv.reservations.find((reservation) => reservation.resourceId === "room.procedure.1");
    const shortStay = gdv.reservations.find((reservation) => reservation.resourceId === "room.short_stay.1");
    const reloadedOperations = operations.deserializeState(operations.serializeState(gdv.state));
    const reloadReservations = reloadedOperations.reservations.filter((reservation) => (
      reservation.taskId === gdv.tasks[0].id || reservation.taskId === gdv.tasks[1].id
    ));

    const economyRuntime = window.PET_CLINIC_ECONOMY_RUNTIME_V6;
    let lifecycleState = p5.createLifecycleState();
    let economyState = p6.initializeEconomyState(economyRuntime.createState());
    const campaignPolicy = p6.modePolicy("campaign", new URLSearchParams());
    const purchase = p6.purchaseAsset({
      lifecycleState,
      economyState,
      assetCatalogId: "asset_tonometer",
      at: 500,
      unlockedAssetCatalogIds: ["asset_tonometer"],
      policy: campaignPolicy
    });
    lifecycleState = purchase.lifecycleState;
    economyState = purchase.economyState;
    const delivery = p6.completeDelivery({ lifecycleState, economyState, assetId: "asset_tonometer", at: 1940 });
    lifecycleState = delivery.lifecycleState;
    economyState = delivery.economyState;
    const training = p6.completeTraining({
      lifecycleState,
      economyState,
      assetId: "asset_tonometer",
      staffId: "staff.doctor.sokolova",
      at: 2000
    });
    lifecycleState = training.lifecycleState;
    economyState = training.economyState;
    const lifecycleOperations = p5.reconcileOperationsState(lifecycleState, operations.createState());
    const schedulerState = {
      schemaVersion: lifecycleOperations.schemaVersion,
      resources: clone(lifecycleOperations.resources),
      tasks: clone(lifecycleOperations.tasks),
      reservations: clone(lifecycleOperations.reservations),
      appliedCommandIds: clone(lifecycleOperations.appliedCommandIds),
      commandFingerprints: clone(lifecycleOperations.commandFingerprints)
    };
    const maintenance = p6.scheduleMaintenance({
      lifecycleState,
      economyState,
      assetId: "asset_tonometer",
      at: 2100,
      schedulerState,
      breakdown: true
    });
    const maintenanceComplete = p6.completeMaintenance({
      lifecycleState: maintenance.lifecycleState,
      economyState: maintenance.economyState,
      assetId: "asset_tonometer",
      maintenanceId: maintenance.maintenanceId,
      at: maintenance.endAt,
      schedulerState,
      policy: campaignPolicy
    });
    const reloadedEconomy = economyRuntime.deserializeState(economyRuntime.serializeState(maintenanceComplete.economyState));

    const generator = window.PET_CLINIC_GENERATOR_V2.createGenerator({
      catalog,
      seed: "browser-follow-up-v11",
      storage: window.PET_CLINIC_GENERATOR_V2.createMemoryStorage(),
      gameModeId: "campaign"
    });
    const dayOne = generator.openDay(1);
    const source = dayOne.visits[0];
    generator.closeDay(1, [{ visitId: source.visitId, completed: true, followUpRequested: true, followUpAfterDays: 1 }]);
    const dayTwo = generator.openDay(2);
    const followUp = dayTwo.visits.find((visit) => visit.originalVisitId === source.visitId);

    return {
      xray: {
        referralScheduled: referral.scheduled,
        referralReservations: referral.reservations.length,
        localOwners: localXrayOwners
      },
      gdv: {
        phases: gdv.tasks.length,
        handoffAt: gdv.handoffAt,
        contiguous: procedure.endAt === shortStay.startAt,
        reloadReservations: reloadReservations.length
      },
      economy: {
        purchasePrice: purchase.price,
        delivery: delivery.lifecycleState !== null,
        training: training.lifecycleState !== null,
        maintenanceCost: maintenanceComplete.cost,
        reloadStable: reloadedEconomy.maintenanceRecords.length === maintenanceComplete.economyState.maintenanceRecords.length
      },
      followUp: {
        inserted: Boolean(followUp),
        identityStable: Boolean(followUp)
          && followUp.patient.animal === source.patient.animal
          && followUp.owner.name === source.owner.name
      },
      dialogue: {
        ownerProfiles: catalog.owners["base-profiles"].profiles.length,
        emergencyHumorDisabled: catalog.operationalActivation.dialogue.renderingRules.rareAbsurdityForbiddenDuringEmergency,
        criticalFactOutsideHumor: catalog.operationalActivation.dialogue.renderingRules.criticalFactMustExistOutsideHumor
      }
    };
  });
}

async function visualEvidence(page, viewport) {
  return page.evaluate((expected) => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const within = (box) => Boolean(box && box.left >= -1 && box.top >= -1
      && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1);
    const canvas = rect("#clinicCanvas");
    const rail = rect(".patient-rail");
    const hud = rect(".bottom-hud");
    const resources = rect(".p9-review-chip");
    return {
      viewport: { width: innerWidth, height: innerHeight },
      expected,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      canvas,
      rail,
      hud,
      resources,
      canvasRailOverlap: Boolean(canvas && rail && canvas.right > rail.left + 1),
      canvasHudOverlap: Boolean(canvas && hud && canvas.bottom > hud.top + 1),
      railWithin: within(rail),
      hudWithin: within(hud),
      resourcesWithin: within(resources)
    };
  }, viewport);
}

async function visualMatrix(browser) {
  const matrix = [];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      if (sessionStorage.getItem("full-activation-v11-clean") === "1") return;
      localStorage.clear();
      sessionStorage.setItem("full-activation-v11-clean", "1");
    });
    const page = await context.newPage();
    const issues = observePage(page);
    await openMenu(page);
    const menu = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".mode-card")].map((node) => {
        const box = node.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
      });
      return {
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        verticalOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        cards,
        allCardsWithin: cards.every((box) => box.left >= -1 && box.top >= -1
          && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1)
      };
    });
    assert.equal(menu.horizontalOverflow, 0, `${viewport.width}: start menu has horizontal overflow`);
    if (viewport.width === 1280) {
      assert.equal(menu.verticalOverflow, 0, "1280x720 start menu requires scrolling");
      assert.equal(menu.allCardsWithin, true, "1280x720 mode cards are clipped");
    }
    await page.screenshot({ path: path.join(artifactRoot, `menu-${viewport.width}x${viewport.height}.png`) });

    await page.locator('[data-mode-launch="campaign"][data-launch-action="new"]').click();
    await waitForGame(page, "campaign");
    const game = await visualEvidence(page, viewport);
    assert.equal(game.horizontalOverflow, 0, `${viewport.width}: game has horizontal overflow`);
    assert.equal(game.canvasRailOverlap, false, `${viewport.width}: canvas overlaps patient rail`);
    assert.equal(game.canvasHudOverlap, false, `${viewport.width}: canvas overlaps HUD`);
    assert.equal(game.railWithin, true, `${viewport.width}: patient rail is clipped`);
    assert.equal(game.hudWithin, true, `${viewport.width}: HUD is clipped`);
    assert.equal(game.resourcesWithin, true,
      `${viewport.width}: resource control is clipped: ${JSON.stringify(game.resources)}`);
    if (viewport.width === 1280) assert.equal(game.verticalOverflow, 0, "1280x720 game requires document scrolling");
    await page.screenshot({ path: path.join(artifactRoot, `game-${viewport.width}x${viewport.height}.png`) });
    assert.deepEqual(issues, [], `${viewport.width}: browser issues: ${issues.join(" | ")}`);
    matrix.push({ viewport, menu, game });
    await context.close();
  }
  return matrix;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      if (sessionStorage.getItem("full-activation-v11-clean") === "1") return;
      localStorage.clear();
      sessionStorage.setItem("full-activation-v11-clean", "1");
    });
    const page = await context.newPage();
    const issues = observePage(page);
    const modeSmoke = await modeAndResetSmoke(page);
    await openMenu(page);
    await page.locator('[data-mode-continue="campaign"]').click();
    await waitForGame(page, "campaign");
    const runtime = await runtimeScenarios(page);
    assert.deepEqual(runtime.xray.localOwners, ["equipment.xray_system", "room.imaging.1", "staff.imaging.zhukova"]);
    assert.equal(runtime.xray.referralScheduled, true);
    assert.equal(runtime.xray.referralReservations, 0);
    assert.equal(runtime.gdv.phases, 2);
    assert.equal(runtime.gdv.contiguous, true);
    assert.equal(runtime.gdv.reloadReservations, 6);
    assert.equal(runtime.economy.purchasePrice, 900);
    assert.equal(runtime.economy.maintenanceCost, 90);
    assert.equal(runtime.economy.reloadStable, true);
    assert.deepEqual(runtime.followUp, { inserted: true, identityStable: true });
    assert.deepEqual(runtime.dialogue, { ownerProfiles: 12, emergencyHumorDisabled: true, criticalFactOutsideHumor: true });
    const visibleText = await page.locator("body").innerText();
    assert.doesNotMatch(visibleText, /(?:reasonCode|reason_code|\b(?:asset|capability|case|equipment|room|staff|task)\.[A-Za-z0-9._:-]+)/iu);
    assert.deepEqual(issues, [], `mode/runtime browser issues: ${issues.join(" | ")}`);
    await context.close();

    const matrix = await visualMatrix(browser);
    console.log(JSON.stringify({
      status: "passed",
      modes: modeSmoke.modes,
      tester: modeSmoke.tester,
      runtime,
      visualMatrix: matrix.map(({ viewport, menu, game }) => ({
        viewport,
        menuOverflow: [menu.horizontalOverflow, menu.verticalOverflow],
        gameOverflow: [game.horizontalOverflow, game.verticalOverflow],
        noPlayfieldOverlap: !game.canvasRailOverlap && !game.canvasHudOverlap
      })),
      artifacts: artifactRoot,
      browserIssues: 0
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
