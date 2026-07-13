"use strict";

const path = require("path");
const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH || "playwright";
const { chromium } = require(playwrightModule);

const root = path.resolve(__dirname, "..");
const screenshots = path.join(root, "artifacts", "playtest-clinical-visit");
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH || chromium.executablePath();

async function reloadInConsultation(page, expectedTitle) {
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#caseWindow").waitFor({ state: "visible" });
  if ((await page.locator("#caseTitle").textContent()) !== expectedTitle) {
    throw new Error("Reload changed the patient currently in consultation");
  }
}

async function answerRequiredHistory(page) {
  let safety = 12;
  while ((await page.locator("#tutorialTitle").textContent()) === "Соберите анамнез" && safety > 0) {
    if (!(await page.locator("#choiceWindow").isVisible())) await page.locator("#anamnesisBtn").click();
    await page.locator(".choice-item:not(:disabled)").first().click();
    safety -= 1;
  }
  if (safety === 0) throw new Error("Required history loop did not finish");
}

async function bootMode(browser, mode) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
  await page.goto(`http://127.0.0.1:5174/?generatorMode=${mode}`, { waitUntil: "networkidle" });
  const shiftVisible = await page.locator("#shiftWindow").isVisible();
  await page.locator("#startShiftBtn").click();
  await page.locator(".next-patient .queue-card").waitFor({ state: "visible", timeout: 30000 });
  await page.locator(".next-patient .queue-card").click();
  await page.locator("#developerBtn").click();
  await page.locator("#devResolvePatientBtn").click();
  try {
    await page.locator("#caseWindow").waitFor({ state: "hidden", timeout: 15000 });
  } catch (error) {
    const diagnostic = {
      mode,
      errors,
      log: await page.locator("#messageLog").textContent(),
      choiceVisible: await page.locator("#choiceWindow").isVisible(),
      choiceTitle: await page.locator("#choiceTitle").textContent(),
      finishVisible: await page.locator("#finishVisitBtn").isVisible(),
      finishDisabled: await page.locator("#finishVisitBtn").isDisabled(),
      treatmentDisabled: await page.locator("#treatmentBtn").isDisabled()
    };
    await context.close();
    throw new Error(`Developer completion failed: ${JSON.stringify(diagnostic)}\n${error.message}`);
  }
  await context.close();
  return { mode, shiftVisible, errors };
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
  if (process.env.PLAYTEST_BOOT_MODE) {
    const result = await bootMode(browser, process.env.PLAYTEST_BOOT_MODE);
    await browser.close();
    console.log(JSON.stringify({ status: "passed", bootOnly: result }, null, 2));
    return;
  }
  const context = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));

  await page.goto("http://127.0.0.1:5174/?generatorMode=tier-01-v2", { waitUntil: "networkidle" });
  await page.locator("#startShiftBtn").click();
  try {
    await page.locator(".next-patient .queue-card").waitFor({ state: "visible", timeout: 30000 });
  } catch (error) {
    await page.screenshot({ path: path.join(screenshots, "00-boot-timeout.png"), fullPage: true });
    const diagnostic = {
      errors,
      shiftVisible: await page.locator("#shiftWindow").isVisible(),
      startDisabled: await page.locator("#startShiftBtn").isDisabled(),
      saveError: await page.locator("body").getAttribute("data-save-error"),
      message: await page.locator("#messageLog").textContent(),
      time: await page.locator("#timeValue").textContent()
    };
    await browser.close();
    throw new Error(`First patient did not arrive: ${JSON.stringify(diagnostic)}\n${error.message}`);
  }
  await page.locator(".next-patient .queue-card").click();
  await page.locator("#caseWindow").waitFor({ state: "visible" });

  const patientTitle = await page.locator("#caseTitle").textContent();
  const queueDuringVisit = await page.locator("#queueCountLabel").textContent();
  if (!queueDuringVisit.includes("1 в кабинете")) throw new Error(`Consultation counter is missing: ${queueDuringVisit}`);
  await page.screenshot({ path: path.join(screenshots, "01-queue-during-visit.png"), fullPage: true });
  await reloadInConsultation(page, patientTitle);

  await page.locator("#anamnesisBtn").click();
  await answerRequiredHistory(page);
  await page.screenshot({ path: path.join(screenshots, "02-after-history.png"), fullPage: true });
  await reloadInConsultation(page, patientTitle);

  await page.locator("#generalExamBtn").click();
  await page.locator("#localExamBtn").click();
  await page.locator(".choice-item:not(:disabled)").first().click();
  await page.screenshot({ path: path.join(screenshots, "03-after-exams.png"), fullPage: true });
  await reloadInConsultation(page, patientTitle);

  if (await page.locator("#sampleBtn").isEnabled()) {
    await page.locator("#sampleBtn").click();
    if (await page.locator("#choiceWindow").isVisible()) await page.locator(".choice-item:not(:disabled)").first().click();
    if (await page.locator("#sampleBtn").isEnabled()) await page.locator("#sampleBtn").click();
  }
  if (await page.locator("#microscopyBtn").isEnabled()) {
    await page.locator("#microscopyBtn").click();
    if (await page.locator("#choiceWindow").isVisible()) await page.locator(".choice-item:not(:disabled)").first().click();
  }
  await page.locator("#diagnosisBtn").click();
  await page.locator(".choice-item:not(:disabled)").first().click();
  await page.locator("#communicationBtn").click();
  await page.locator(".choice-item:not(:disabled)").first().click();
  await page.locator("#treatmentBtn").click();
  await page.locator(".choice-item:not(:disabled)").first().click();
  await page.screenshot({ path: path.join(screenshots, "04-after-care-plan.png"), fullPage: true });
  await reloadInConsultation(page, patientTitle);

  if (!(await page.locator("#finishVisitBtn").isEnabled())) throw new Error("Finish visit button stayed disabled after care plan");
  await page.locator("#finishVisitBtn").click();
  await page.locator("#caseWindow").waitFor({ state: "hidden" });
  const goals = await page.locator("#dayGoalsList").allTextContents();
  if (!goals.some((goal) => goal.includes("1/1"))) throw new Error(`Tutorial goal did not update: ${goals.join(" | ")}`);
  if (!goals.some((goal) => goal.includes("1/2"))) throw new Error(`Full visit goal did not update: ${goals.join(" | ")}`);

  const v2Result = {
    patientTitle,
    queueDuringVisit,
    queueAfterVisit: await page.locator("#queueCountLabel").textContent(),
    goals,
    errors
  };
  await context.close();
  const otherModes = [await bootMode(browser, "current"), await bootMode(browser, "legacy-v1")];
  await browser.close();

  if (errors.length || otherModes.some((result) => result.errors.length || !result.shiftVisible)) {
    throw new Error(JSON.stringify({ v2Result, otherModes }, null, 2));
  }
  console.log(JSON.stringify({ status: "passed", v2Result, otherModes }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
