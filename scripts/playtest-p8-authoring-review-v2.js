"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH || "playwright";
const { chromium } = require(playwrightModule);
const projectRoot = path.resolve(__dirname, "..");
const artifactRoot = path.resolve(
  process.env.PLAYTEST_ARTIFACT_DIR || "/tmp/vetgeme-p8-authoring-review-v2",
);
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath();
const viewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
];
const dprs = [1, 2];
const serviceTokenPattern = /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/u;

assert.ok(
  artifactRoot === "/tmp" || artifactRoot.startsWith("/tmp/"),
  `review evidence must stay in /tmp, received ${artifactRoot}`,
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
  page.on("requestfailed", (request) => {
    issues.push(`requestfailed: ${request.method()} ${request.url()} (${request.failure()?.errorText || "unknown"})`);
  });
  return issues;
}

function selectedRecords(view, familyIndex) {
  const family = view.families[familyIndex];
  const variant = family.variants[family.representative.variantIndex];
  const presentation = variant.presentations[family.representative.presentationIndex];
  return { family, variant, presentation };
}

function longestRepresentative(view) {
  let selected = { familyIndex: 0, textWeight: -1 };
  view.families.forEach((family, familyIndex) => {
    if (family.representative.textWeight > selected.textWeight) {
      selected = { familyIndex, textWeight: family.representative.textWeight };
    }
  });
  return selected;
}

async function assertExactVisibleText(page, expected, activeCaseIds) {
  assert.equal(await page.locator(".family-title").textContent(), expected.family.title);
  assert.equal(
    await page.locator(".presentation-title").textContent(),
    `Клиническое представление ${expected.presentation.ordinal}`,
  );
  assert.equal(await page.locator(".complaint-text").textContent(), expected.presentation.complaint);
  assert.deepEqual(
    await page.locator("[data-exact-investigation-result]").allTextContents(),
    expected.presentation.investigations.map((investigation) => investigation.result),
  );
  assert.deepEqual(
    await page.locator("[data-exact-owner-communication]").allTextContents(),
    expected.presentation.ownerCommunication,
  );
  assert.equal(await page.locator("[data-exact-safe-outcome]").textContent(), expected.presentation.decisions.correctOutcome);
  assert.equal(await page.locator("[data-exact-unsafe-outcome]").textContent(), expected.presentation.decisions.unsafeOutcome);
  assert.match(await page.locator(".safe-referral-text").textContent(), /маршрут направления предусмотрен/u);
  const expectedSafeRoutes = [
    ...expected.presentation.investigations.flatMap((investigation) => investigation.fallbackRoutes),
    ...expected.presentation.safeReferral.missingLocalRoutes,
    ...expected.presentation.safeReferral.presentationFallbacks,
    ...expected.presentation.safeReferral.familyFallbacks,
  ];
  assert.deepEqual(
    await page.locator("[data-exact-safe-referral]").allTextContents(),
    expectedSafeRoutes,
    "authored safe-referral routes changed or disappeared",
  );
  assert.equal(await page.locator("#familySelect option").count(), 39);
  assert.equal(await page.locator(".variant-button").count(), expected.family.variants.length);
  assert.equal(await page.locator("#presentationSelect option").count(), expected.variant.presentations.length);
  assert.equal(await page.locator("#diagnosticReveal").isVisible(), false, "diagnostic truth was visible before discovery gate");
  assert.equal(await page.locator("#revealTruthBtn").getAttribute("aria-expanded"), "false");
  const visibleText = await page.locator("body").innerText();
  assert.doesNotMatch(visibleText, serviceTokenPattern, "service token is visible in review UI");
  for (const caseId of activeCaseIds) {
    assert.equal(visibleText.includes(caseId), false, `active player case ID ${caseId} is visible`);
  }
  assert.match(visibleText, /Речевой слой меняет только форму реплики/u);
  if (expected.presentation.speech.emergency) {
    assert.equal(await page.locator(".humor-section").count(), 0, "emergency presentation exposes humor");
    assert.equal(await page.locator(".humor-disabled").isVisible(), true, "emergency humor guard is not visible");
  }
}

async function inspectLayout(page, viewport, dpr) {
  const evidence = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const textNodes = [...document.querySelectorAll("[data-review-text]")].filter(visible);
    const defects = textNodes.flatMap((element) => {
      const style = getComputedStyle(element);
      const reasons = [];
      if (element.scrollWidth > element.clientWidth + 1) reasons.push("horizontal_clip");
      if (element.scrollHeight > element.clientHeight + 1) reasons.push("vertical_clip");
      if (style.textOverflow === "ellipsis") reasons.push("ellipsis");
      if (!["", "none", "unset"].includes(style.webkitLineClamp)) reasons.push(`line_clamp_${style.webkitLineClamp}`);
      if (style.whiteSpace === "nowrap") reasons.push("nowrap");
      return reasons.length ? [{ text: element.textContent.slice(0, 100), reasons }] : [];
    });
    const selectRect = document.querySelector("#familySelect").getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      },
      selectRect: {
        left: selectRect.left,
        right: selectRect.right,
        width: selectRect.width,
      },
      textNodes: textNodes.length,
      maximumTextHeight: textNodes.reduce((maximum, element) => Math.max(maximum, element.getBoundingClientRect().height), 0),
      defects,
    };
  });
  assert.deepEqual(evidence.viewport, { ...viewport, dpr });
  assert.equal(
    evidence.document.scrollWidth,
    evidence.document.clientWidth,
    `horizontal document overflow at ${viewport.width} DPR ${dpr}`,
  );
  assert.ok(evidence.selectRect.left >= -1 && evidence.selectRect.right <= viewport.width + 1, "family selector is clipped");
  assert.deepEqual(evidence.defects, [], `truncated review text: ${JSON.stringify(evidence.defects.slice(0, 5))}`);
  return evidence;
}

async function main() {
  const [{ loadP8V2AuthoringReviewInput }, { buildMedicalReviewServiceView, renderMedicalReviewServiceHtml }] = await Promise.all([
    import(pathToFileURL(path.join(projectRoot, "scripts/lib/p8-authoring-review-input-v2.mjs")).href),
    import(pathToFileURL(path.join(projectRoot, "scripts/lib/medical-review-service-view.mjs")).href),
  ]);
  const p8 = await loadP8V2AuthoringReviewInput(projectRoot, { context: "review" });
  const view = buildMedicalReviewServiceView(p8);
  const html = renderMedicalReviewServiceHtml(view);
  const htmlPath = path.join(artifactRoot, "medical-review-service.html");
  fs.writeFileSync(htmlPath, html, "utf8");
  const pageUrl = pathToFileURL(htmlPath).href;
  const baselineManifest = JSON.parse(fs.readFileSync(
    path.join(projectRoot, "content/packs/tier-01-v2/clinical/tier-01/manifest.json"),
    "utf8",
  ));
  const activeCaseIds = baselineManifest.cases.map((entry) => entry.id);
  assert.equal(activeCaseIds.length, 30);
  const stress = longestRepresentative(view);
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  const matrix = [];
  const screenshots = [];
  try {
    for (const dpr of dprs) {
      const context = await browser.newContext({ viewport: viewports[0], deviceScaleFactor: dpr });
      const page = await context.newPage();
      const issues = observePage(page);
      try {
        await page.goto(pageUrl, { waitUntil: "load", timeout: 30000 });
        await page.waitForFunction(() => window.__VETGEME_MEDICAL_REVIEW__?.ready === true, null, { timeout: 30000 });
        for (const viewport of viewports) {
          await page.setViewportSize(viewport);
          for (let familyIndex = 0; familyIndex < view.families.length; familyIndex += 1) {
            await page.evaluate((index) => window.__VETGEME_MEDICAL_REVIEW__.selectFamily(index), familyIndex);
            await page.waitForFunction(
              (index) => window.__VETGEME_MEDICAL_REVIEW__.getSnapshot().state.familyIndex === index,
              familyIndex,
            );
            const expected = selectedRecords(view, familyIndex);
            await assertExactVisibleText(page, expected, activeCaseIds);
            const layout = await inspectLayout(page, viewport, dpr);
            matrix.push({
              dpr,
              viewport,
              familyOrdinal: expected.family.ordinal,
              variantOrdinal: expected.variant.ordinal,
              presentationOrdinal: expected.presentation.ordinal,
              emergency: expected.presentation.speech.emergency,
              documentHeight: layout.document.scrollHeight,
              visibleTextNodes: layout.textNodes,
              maximumTextHeight: layout.maximumTextHeight,
            });
          }

          await page.evaluate((index) => window.__VETGEME_MEDICAL_REVIEW__.selectFamily(index), stress.familyIndex);
          const screenshotPath = path.join(
            artifactRoot,
            `overview-${viewport.width}x${viewport.height}-dpr${dpr}.png`,
          );
          await page.screenshot({ path: screenshotPath, fullPage: true });
          screenshots.push(screenshotPath);
        }

        await page.evaluate((index) => window.__VETGEME_MEDICAL_REVIEW__.selectFamily(index), stress.familyIndex);
        const stressExpected = selectedRecords(view, stress.familyIndex);
        await page.locator("#revealTruthBtn").click();
        assert.equal(await page.locator("#diagnosticReveal").isVisible(), true);
        assert.equal(await page.locator("#diagnosticReveal h4").textContent(), stressExpected.variant.title);
        assert.equal(await page.locator("[data-exact-diagnostic-truth]").textContent(), stressExpected.variant.diagnosticTruth);
        assert.deepEqual(issues, [], `browser issues at DPR ${dpr}:\n${issues.join("\n")}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const expectedStates = view.families.length * viewports.length * dprs.length;
  assert.equal(matrix.length, expectedStates);
  assert.equal(screenshots.length, 6);
  const evidence = {
    status: "passed",
    serviceOnly: true,
    source: {
      medicalVersion: p8.medicalReviewInputIdentity.reviewInputVersion,
      p8Version: p8.registration.reviewInputVersion,
      productionPool: p8.productionPool.length,
      activationAllowed: p8.activationAllowed,
    },
    hierarchy: view.counts,
    coverage: {
      familiesPerViewport: view.families.length,
      viewports,
      dprs,
      matrixStates: matrix.length,
      exactVisibleStates: matrix.length,
      diagnosticGateChecks: dprs.length,
      activePlayerCaseIdsCheckedPerState: activeCaseIds.length,
    },
    stressRepresentative: stress,
    html: htmlPath,
    screenshots,
    matrix,
  };
  const evidencePath = path.join(artifactRoot, "evidence.json");
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: evidence.status,
    hierarchy: evidence.hierarchy,
    matrixStates: evidence.coverage.matrixStates,
    screenshots: screenshots.length,
    evidence: evidencePath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
