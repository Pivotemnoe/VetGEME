"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH || "playwright";
const { chromium } = require(playwrightModule);
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath();
const baseUrl = process.env.PLAYTEST_BASE_URL || "http://127.0.0.1:5174/";
const artifactDir = path.resolve(
  process.env.PLAYTEST_ARTIFACT_DIR || path.join(os.tmpdir(), "vetgeme-p9-visual-audit")
);
const reportPath = path.resolve(
  process.env.P9_AUDIT_REPORT || path.join(artifactDir, "visual-p9-audit.json")
);

const viewportCases = [
  { width: 1280, height: 720, supportedBaseline: true },
  { width: 960, height: 720, supportedBaseline: false },
  { width: 760, height: 700, supportedBaseline: false }
];

fs.mkdirSync(artifactDir, { recursive: true });

function observePage(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
  return errors;
}

async function installAuditObservers(context) {
  await context.addInitScript(() => {
    window.__P9_LONG_TASKS__ = [];
    window.__P9_LONG_TASK_OBSERVER_SUPPORTED__ = false;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__P9_LONG_TASKS__.push({
            startTime: entry.startTime,
            duration: entry.duration
          });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
      window.__P9_LONG_TASK_OBSERVER_SUPPORTED__ = true;
    } catch (_error) {
      // Unsupported browsers are reported as an empty measurement, not guessed.
    }
    let value = 0x1a2b3c4d;
    Math.random = () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    };
    Date.now = () => 1784100000000;
  });
}

async function waitForReady(page) {
  await page.locator('html[data-app-status="ready"]').waitFor({ state: "attached", timeout: 30000 });
  const ready = await page.evaluate(() => ({
    detail: window.__PET_CLINIC_APP_READY__,
    elapsedMs: performance.now()
  }));
  assert.ok(ready.detail, "readiness detail is missing");
  assert.equal(ready.detail.visualStatus.ready, true, "modular renderer did not become ready");
  return ready;
}

async function ensureShiftStarted(page) {
  const startButton = page.locator("#startShiftBtn");
  if (await startButton.isVisible()) await startButton.click();
  await page.locator("#nextPatientCard .queue-card").waitFor({ state: "visible", timeout: 30000 });
}

async function inspectViewport(page, viewportCase) {
  await page.setViewportSize({ width: viewportCase.width, height: viewportCase.height });
  await page.waitForTimeout(200);
  const evidence = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        right: box.right,
        bottom: box.bottom
      } : null;
    };
    const visibleControls = [...document.querySelectorAll("button, [href], input, select, textarea")]
      .filter((node) => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
      })
      .map((node) => {
        const box = node.getBoundingClientRect();
        return {
          id: node.id || null,
          labelTextHint: (
            node.getAttribute("aria-label") ||
            node.getAttribute("title") ||
            node.textContent ||
            ""
          ).trim(),
          clipped: box.left < 0 || box.top < 0 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1,
          width: box.width,
          height: box.height
        };
      });
    const canvas = document.querySelector("#clinicCanvas");
    const shell = document.querySelector(".game-shell");
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      documentOverflow: {
        width: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        height: document.documentElement.scrollHeight - document.documentElement.clientHeight
      },
      shell: rect(".game-shell"),
      canvas: rect("#clinicCanvas"),
      patientRail: rect(".patient-rail"),
      bottomHud: rect(".bottom-hud"),
      canvasContract: {
        ariaLabel: canvas?.getAttribute("aria-label") || null,
        objectFit: canvas ? getComputedStyle(canvas).objectFit : null,
        imageRendering: canvas ? getComputedStyle(canvas).imageRendering : null,
        intrinsicWidth: canvas?.width || null,
        intrinsicHeight: canvas?.height || null
      },
      shellAccessibility: {
        ariaBusy: shell?.getAttribute("aria-busy") || null,
        inert: shell?.hasAttribute("inert") || false
      },
      controlsWithoutLabelTextHint: visibleControls.filter((control) => !control.labelTextHint),
      clippedVisibleControls: visibleControls.filter((control) => control.clipped),
      undersizedVisibleControls: visibleControls.filter((control) => control.width < 28 || control.height < 28)
    };
  });

  if (viewportCase.supportedBaseline) {
    assert.deepEqual(evidence.documentOverflow, { width: 0, height: 0 }, "baseline viewport overflowed");
    assert.deepEqual(evidence.clippedVisibleControls, [], "baseline viewport clips visible controls");
  }
  assert.equal(evidence.canvasContract.ariaLabel, "Клиника", "Canvas needs a text label");
  assert.equal(evidence.canvasContract.objectFit, "contain", "Canvas aspect ratio must be preserved");
  assert.equal(evidence.canvasContract.imageRendering, "pixelated", "Canvas smoothing CSS changed");
  assert.equal(evidence.canvasContract.intrinsicWidth / evidence.canvasContract.intrinsicHeight, 1280 / 720);
  assert.equal(evidence.shellAccessibility.ariaBusy, "false", "ready shell remains aria-busy");
  assert.equal(evidence.shellAccessibility.inert, false, "ready shell remains inert");

  await page.screenshot({
    path: path.join(artifactDir, `p9-${viewportCase.width}x${viewportCase.height}.png`),
    fullPage: true
  });
  return evidence;
}

async function inspectKeyboard(page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(100);

  const requiredControls = [
    { id: "pauseBtn" },
    { id: "speedBtn" },
    { id: "nextPatientBtn" },
    { id: "closeShiftBtn" },
    { id: "developerBtn", expectedAccessibleName: "Открыть настройки" }
  ];
  const roleEvidence = [];
  for (const control of requiredControls) {
    const locator = page.locator(`#${control.id}`);
    const ariaSnapshot = await locator.ariaSnapshot();
    const nameMatch = ariaSnapshot.match(/^- button "([^"]+)"/u);
    assert.ok(nameMatch?.[1]?.trim(), `button #${control.id} lacks a computed accessible name`);
    const accessibleName = nameMatch[1].trim();
    if (control.expectedAccessibleName) {
      assert.equal(accessibleName, control.expectedAccessibleName);
      assert.equal(
        await page.getByRole("button", { name: control.expectedAccessibleName, exact: true }).getAttribute("id"),
        control.id
      );
    }
    roleEvidence.push({
      id: control.id,
      accessibleName,
      ariaSnapshot
    });
  }

  await page.locator("#pauseBtn").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const tabRoute = [];
  for (let index = 0; index < requiredControls.length; index += 1) {
    const focus = await page.evaluate(() => {
      const node = document.activeElement;
      if (!node) return null;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        tagName: node.tagName,
        id: node.id || null,
        visible: box.width > 0 && box.height > 0,
        insideViewport: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
        focusVisible: node.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth
      };
    });
    assert.ok(focus, `Tab route lost focus at index ${index}`);
    assert.equal(focus.id, requiredControls[index].id, `unexpected Tab route at index ${index}`);
    assert.equal(focus.tagName, "BUTTON");
    assert.equal(focus.visible, true, `focused control #${focus.id} is hidden`);
    assert.equal(focus.insideViewport, true, `focused control #${focus.id} is clipped`);
    assert.equal(focus.focusVisible, true, `focused control #${focus.id} lacks :focus-visible state`);
    tabRoute.push(focus);
    if (index < requiredControls.length - 1) await page.keyboard.press("Tab");
  }
  return { roleEvidence, tabRoute };
}

async function inspectSaveContract(page) {
  const evidence = await page.evaluate(() => {
    const mode = window.PET_CLINIC_GENERATOR_MODE?.mode || null;
    const gameSaveKey = window.PET_CLINIC_GENERATOR_MODE?.gameSaveKey || null;
    const raw = gameSaveKey ? window.localStorage.getItem(gameSaveKey) : null;
    const save = raw ? JSON.parse(raw) : null;
    return {
      mode,
      gameSaveKey,
      version: save?.gameStateSaveVersion ?? null,
      expectedVersion: window.PET_CLINIC_GAME_STATE_SAVE?.TIER_01_V2_GAME_STATE_SAVE_VERSION ?? null
    };
  });
  assert.equal(evidence.mode, "tier-01-v2", "P9 audit ran in the wrong generator mode");
  assert.equal(evidence.gameSaveKey, "pet-clinic-game-tier-01-v2", "P9 audit used the wrong save namespace");
  assert.equal(evidence.expectedVersion, 10, "tier game save contract changed unexpectedly");
  assert.equal(evidence.version, evidence.expectedVersion, "P9 audit did not persist save schema v10");
  return evidence;
}

async function measureFrames(page, sampleCount = 120) {
  return page.evaluate((count) => new Promise((resolve) => {
    const timestamps = [];
    const sample = (timestamp) => {
      timestamps.push(timestamp);
      if (timestamps.length < count + 1) {
        requestAnimationFrame(sample);
        return;
      }
      const intervals = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index]);
      const sorted = [...intervals].sort((left, right) => left - right);
      const sum = intervals.reduce((total, interval) => total + interval, 0);
      resolve({
        sampleCount: intervals.length,
        meanFrameMs: sum / intervals.length,
        maxFrameMs: Math.max(...intervals),
        p95FrameMs: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)],
        gapsOver50Ms: intervals.filter((interval) => interval > 50).length
      });
    };
    requestAnimationFrame(sample);
  }), sampleCount);
}

async function inspectRuntime(page) {
  const frames = await measureFrames(page);
  const runtime = await page.evaluate(async () => {
    const resources = performance.getEntriesByType("resource").map((entry) => ({
      name: entry.name,
      duration: entry.duration,
      transferSize: entry.transferSize,
      decodedBodySize: entry.decodedBodySize
    }));
    const visualResources = resources.filter((entry) => entry.name.includes("/art/runtime-v2/"));
    const sum = (entries, field) => entries.reduce((total, entry) => total + (entry[field] || 0), 0);
    const sceneLayout = await fetch("art/runtime-v2/scene-layout.json").then((response) => {
      if (!response.ok) throw new Error(`scene layout request failed: HTTP ${response.status}`);
      return response.json();
    });
    const routeNames = Object.keys(sceneLayout.routeContracts);
    return {
      visualResources: {
        count: visualResources.length,
        transferSize: sum(visualResources, "transferSize"),
        decodedBodySize: sum(visualResources, "decodedBodySize"),
        maxDurationMs: visualResources.reduce((maximum, entry) => Math.max(maximum, entry.duration), 0)
      },
      longTasks: {
        observerSupported: window.__P9_LONG_TASK_OBSERVER_SUPPORTED__ === true,
        entries: window.__P9_LONG_TASKS__ || []
      },
      reducedMotion: {
        mediaMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
        cssRulePresent: [...document.styleSheets].some((sheet) => {
          try {
            return [...sheet.cssRules].some((rule) => String(rule.cssText).includes("prefers-reduced-motion"));
          } catch (_error) {
            return false;
          }
        })
      },
      scene: {
        schemaVersion: sceneLayout.schemaVersion,
        routeLengths: Object.fromEntries(routeNames.map((name) => [
          name,
          window.PET_CLINIC_VISUAL_V2?.route?.(name)?.length || 0
        ]))
      }
    };
  });
  assert.ok(runtime.visualResources.count > 0, "no modular visual resources were measured");
  assert.ok(Object.values(runtime.scene.routeLengths).every((length) => length >= 2), "a required route is absent");
  return { frames, ...runtime };
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1
    });
    await installAuditObservers(context);
    const page = await context.newPage();
    const errors = observePage(page);
    const targetUrl = new URL(baseUrl);
    targetUrl.searchParams.set("generatorMode", "tier-01-v2");
    targetUrl.searchParams.set("visualMode", "modular-v2");
    targetUrl.searchParams.set("p9", "audit");
    await page.goto(targetUrl.href, {
      waitUntil: "networkidle"
    });
    const readiness = await waitForReady(page);
    await ensureShiftStarted(page);
    const saveContract = await inspectSaveContract(page);

    const runtime = await inspectRuntime(page);
    const viewports = [];
    for (const viewportCase of viewportCases) {
      viewports.push(await inspectViewport(page, viewportCase));
    }
    const keyboard = await inspectKeyboard(page);
    assert.deepEqual(errors, [], `browser errors: ${errors.join(" | ")}`);

    const report = {
      status: "audit_complete_with_observations",
      generatedAt: new Date().toISOString(),
      baseUrl,
      artifactDir,
      readiness,
      saveContract,
      runtime,
      viewports,
      keyboard
    };
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
    console.log(`P9 visual audit report written to ${reportPath}`);
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
