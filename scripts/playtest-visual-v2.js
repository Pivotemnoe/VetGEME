"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH || "playwright";
const { chromium } = require(playwrightModule);
const root = path.resolve(__dirname, "..");
const screenshots = path.join(root, "artifacts", "visual-p0v");
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath();
const baseUrl = process.env.PLAYTEST_BASE_URL || "http://127.0.0.1:5174/";
const viewports = [
  { width: 1920, height: 1200 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 }
];

fs.mkdirSync(screenshots, { recursive: true });

async function installDeterministicClock(context) {
  await context.addInitScript(() => {
    let value = 0x1a2b3c4d;
    Math.random = () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    };
    Date.now = () => 1784100000000;
  });
}

function observePage(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
  return errors;
}

async function waitForReady(page) {
  await page.locator('html[data-app-status="ready"]').waitFor({ state: "attached", timeout: 30000 });
  const ready = await page.evaluate(() => window.__PET_CLINIC_APP_READY__);
  assert.ok(ready, "readiness detail is missing");
  return ready;
}

async function assertViewport(page, viewport, dpr) {
  const evidence = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom
      } : null;
    };
    const visibleButtons = [...document.querySelectorAll(".bottom-hud button")]
      .filter((button) => {
        const style = getComputedStyle(button);
        return style.display !== "none" && style.visibility !== "hidden";
      })
      .map((button) => ({ id: button.id, ...box(`#${button.id}`) }));
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      overflow: {
        width: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        height: document.documentElement.scrollHeight - document.documentElement.clientHeight
      },
      canvas: box("#clinicCanvas"),
      canvasFit: getComputedStyle(document.querySelector("#clinicCanvas")).objectFit,
      canvasIntrinsic: {
        width: document.querySelector("#clinicCanvas").width,
        height: document.querySelector("#clinicCanvas").height
      },
      rail: box(".patient-rail"),
      hud: box(".bottom-hud"),
      visibleButtons
    };
  });

  assert.deepEqual(evidence.viewport, { ...viewport, dpr });
  assert.deepEqual(evidence.overflow, { width: 0, height: 0 }, "document overflow detected");
  assert.equal(evidence.canvasFit, "contain", "canvas must preserve its intrinsic aspect ratio");
  assert.equal(evidence.canvasIntrinsic.width / evidence.canvasIntrinsic.height, 1280 / 720);
  assert.ok(evidence.canvas.right <= evidence.rail.x, "canvas overlaps the patient rail");
  assert.ok(evidence.canvas.bottom <= evidence.hud.y, "canvas overlaps the bottom HUD");
  assert.ok(evidence.rail.right <= viewport.width + 1 && evidence.rail.bottom <= viewport.height + 1, "patient rail is clipped");
  assert.ok(evidence.hud.right <= viewport.width + 1 && evidence.hud.bottom <= viewport.height + 1, "bottom HUD is clipped");
  for (const button of evidence.visibleButtons) {
    assert.ok(button.width >= 28 && button.height >= 28, `${button.id} is smaller than 28×28`);
    assert.ok(
      button.right <= viewport.width + 1 && button.bottom <= viewport.height + 1,
      `${button.id} is clipped: ${JSON.stringify({ button, viewport })}`
    );
  }
  return evidence;
}

async function assertQueueIdentity(page) {
  const identity = await page.evaluate(() => {
    const ids = (selector) => [...document.querySelectorAll(selector)].map((card) => card.dataset.patientId);
    const nextIds = ids("#nextPatientCard .queue-card");
    const queueIds = ids("#queueStrip .queue-card");
    const waitingMatch = document.querySelector("#queueCountLabel").textContent.match(/^(\d+)/u);
    return { nextIds, queueIds, waitingCount: Number(waitingMatch?.[1] || 0) };
  });
  const intersection = identity.nextIds.filter((id) => identity.queueIds.includes(id));
  const allIds = [...identity.nextIds, ...identity.queueIds];
  assert.deepEqual(intersection, [], "the same patient is shown in both HUD sections");
  assert.equal(new Set(allIds).size, allIds.length, "patient card IDs must be unique");
  assert.equal(allIds.length, identity.waitingCount, "HUD cards must equal the waiting counter");
  assert.ok(identity.nextIds.length <= 1, "next-patient section may contain at most one patient");
  return identity;
}

async function persistAndAssertActivePatientAtConsult(page) {
  await page.locator("#closeCaseBtn").click();
  const evidence = await page.evaluate(() => {
    const key = window.PET_CLINIC_GENERATOR_MODE?.gameSaveKey || "pet-clinic-game-tier-01-v2";
    const snapshot = JSON.parse(window.localStorage.getItem(key));
    const patient = snapshot.state.queue.find((item) => item.id === snapshot.state.activeId);
    const route = window.PET_CLINIC_VISUAL_V2.route("waitingToDoctor");
    const footOffset = window.PET_CLINIC_VISUAL_V2.getSceneMetrics().actorPresentation.runtimeFootOffset;
    const target = route.at(-1);
    return {
      patientId: patient.id,
      motion: patient.motion,
      routeLength: patient.route.length,
      routeIndex: patient.routeIndex,
      actual: [patient.screenX, patient.screenY],
      expected: [target[0] - footOffset.x, target[1] - footOffset.y]
    };
  });
  assert.equal(evidence.motion, "inCabinet", "restored consultation must settle in the cabinet");
  assert.equal(evidence.routeLength, 0, "settled consultation must not retain a stale route");
  assert.equal(evidence.routeIndex, 0, "settled consultation route index must be reset");
  assert.deepEqual(evidence.actual, evidence.expected, "restored actor did not reach the modular consult anchor");
  return evidence;
}

async function runMatrix(browser, dpr) {
  const context = await browser.newContext({ viewport: viewports[0], deviceScaleFactor: dpr });
  await installDeterministicClock(context);
  const page = await context.newPage();
  const errors = observePage(page);
  await page.goto(`${baseUrl}?generatorMode=tier-01-v2&visualMode=modular-v2&p0v=matrix-dpr${dpr}`, { waitUntil: "networkidle" });
  const ready = await waitForReady(page);
  assert.equal(ready.visualStatus.ready, true, "modular renderer did not become ready");
  await page.locator("#startShiftBtn").click();
  await page.locator("#nextPatientCard .queue-card").waitFor({ state: "visible", timeout: 30000 });
  const queueIdentity = await assertQueueIdentity(page);

  const matrix = [];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    matrix.push(await assertViewport(page, viewport, dpr));
    await page.screenshot({
      path: path.join(screenshots, `normal-${viewport.width}x${viewport.height}-dpr${dpr}.png`),
      fullPage: true
    });
  }

  let rendererSwitchEvidence = null;
  if (dpr === 1) {
    const waitingPatientId = queueIdentity.nextIds[0];
    await page.goto(`${baseUrl}?generatorMode=tier-01-v2&p0v=switch-classic`, { waitUntil: "networkidle" });
    const classicReady = await waitForReady(page);
    assert.equal(classicReady.visualStatus.enabled, false);
    await page.locator("#nextPatientCard .queue-card").waitFor({ state: "visible" });
    assert.equal(await page.locator("#nextPatientCard .queue-card").getAttribute("data-patient-id"), waitingPatientId);
    await page.locator("#nextPatientCard .queue-card").click();
    await page.locator("#caseWindow").waitFor({ state: "visible" });
    const classicPatientTitle = await page.locator("#caseTitle").textContent();

    await page.goto(`${baseUrl}?generatorMode=tier-01-v2&visualMode=modular-v2&p0v=switch-modular`, { waitUntil: "networkidle" });
    const modularReady = await waitForReady(page);
    await page.locator("#caseWindow").waitFor({ state: "visible" });
    const modularPatientTitle = await page.locator("#caseTitle").textContent();
    assert.equal(modularReady.visualStatus.ready, true);
    assert.equal(modularPatientTitle, classicPatientTitle, "renderer switch changed the active patient");
    const restoredConsult = await persistAndAssertActivePatientAtConsult(page);
    rendererSwitchEvidence = { waitingPatientId, classicPatientTitle, modularPatientTitle, restoredConsult };
  }

  let reloadEvidence = null;
  if (dpr === 2) {
    await page.locator("#nextPatientCard .queue-card").click();
    await page.locator("#caseWindow").waitFor({ state: "visible" });
    const patientTitle = await page.locator("#caseTitle").textContent();
    await assertQueueIdentity(page);
    assert.match(await page.locator("#queueCountLabel").textContent(), /1 в кабинете/u);
    await page.screenshot({ path: path.join(screenshots, "active-consultation-1280x720-dpr2.png"), fullPage: true });

    await page.reload({ waitUntil: "networkidle" });
    const reloadReady = await waitForReady(page);
    await page.locator("#caseWindow").waitFor({ state: "visible" });
    const reloadedTitle = await page.locator("#caseTitle").textContent();
    assert.equal(reloadedTitle, patientTitle, "reload changed the active patient");
    assert.equal(reloadReady.visualStatus.ready, true, "reload did not restore the modular renderer");
    await page.screenshot({ path: path.join(screenshots, "reload-active-consultation-1280x720-dpr2.png"), fullPage: true });
    const restoredConsult = await persistAndAssertActivePatientAtConsult(page);
    reloadEvidence = { patientTitle, reloadedTitle, restoredConsult };
  }

  assert.deepEqual(errors, [], `browser errors in DPR ${dpr}: ${errors.join(" | ")}`);
  await context.close();
  return { dpr, queueIdentity, matrix, rendererSwitchEvidence, reloadEvidence };
}

async function assertClassicAndFallback(browser) {
  const classicContext = await browser.newContext({ viewport: viewports[2], deviceScaleFactor: 1 });
  const classicPage = await classicContext.newPage();
  const classicErrors = observePage(classicPage);
  const runtimeRequests = [];
  classicPage.on("request", (request) => {
    if (request.url().includes("art/runtime-v2/")) runtimeRequests.push(request.url());
  });
  await classicPage.goto(`${baseUrl}?generatorMode=current&p0v=classic`, { waitUntil: "networkidle" });
  const classicReady = await waitForReady(classicPage);
  assert.equal(classicReady.visualStatus.enabled, false);
  assert.deepEqual(runtimeRequests, [], "classic mode fetched modular assets");

  const unknownPage = await classicContext.newPage();
  const unknownRequests = [];
  unknownPage.on("request", (request) => {
    if (request.url().includes("art/runtime-v2/")) unknownRequests.push(request.url());
  });
  await unknownPage.goto(`${baseUrl}?generatorMode=legacy-v1&visualMode=unknown&p0v=unknown`, { waitUntil: "networkidle" });
  const unknownReady = await waitForReady(unknownPage);
  assert.equal(unknownReady.visualStatus.enabled, false);
  assert.deepEqual(unknownRequests, [], "unknown feature flag fetched modular assets");
  assert.deepEqual(classicErrors, [], `classic browser errors: ${classicErrors.join(" | ")}`);
  await classicContext.close();

  const fallbackContext = await browser.newContext({ viewport: viewports[2], deviceScaleFactor: 1 });
  const fallbackPage = await fallbackContext.newPage();
  const fallbackErrors = observePage(fallbackPage);
  await fallbackPage.route("**/assets/rooms/doctor-office.png*", (route) => route.fulfill({ status: 404 }));
  await fallbackPage.goto(`${baseUrl}?generatorMode=tier-01-v2&visualMode=modular-v2&p0v=fallback`, { waitUntil: "networkidle" });
  const fallbackReady = await waitForReady(fallbackPage);
  assert.equal(fallbackReady.visualStatus.fallback, true, "404 must settle on the classic renderer");
  assert.equal(await fallbackPage.locator("#appLoadingVeil").isVisible(), false, "fallback left the readiness veil visible");
  const unexpectedFallbackErrors = fallbackErrors.filter((message) => !/Failed to load resource.*404/u.test(message));
  assert.deepEqual(unexpectedFallbackErrors, [], `fallback browser errors: ${fallbackErrors.join(" | ")}`);
  await fallbackContext.close();
  return { classicReady, unknownReady, fallbackReady };
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  try {
    const matrix = [await runMatrix(browser, 1), await runMatrix(browser, 2)];
    const fallback = await assertClassicAndFallback(browser);
    console.log(JSON.stringify({
      status: "passed",
      screenshots,
      viewports,
      matrix: matrix.map((result) => ({
        dpr: result.dpr,
        queueIdentity: result.queueIdentity,
        viewports: result.matrix.map((evidence) => ({
          viewport: evidence.viewport,
          overflow: evidence.overflow
        })),
        rendererSwitchEvidence: result.rendererSwitchEvidence,
        reloadEvidence: result.reloadEvidence
      })),
      fallback: {
        classic: fallback.classicReady.visualStatus,
        unknown: fallback.unknownReady.visualStatus,
        failedAsset: fallback.fallbackReady.visualStatus
      }
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
