"use strict";

const path = require("node:path");
const loader = require("../generator/content-loader-v2.js");
const generatorApi = require("../generator/generator-v2.js");

const runs = Number(process.argv[2] || 1000);
const root = path.resolve(__dirname, "../tier-01-v2/content");

function outcomesFor(day) {
  return day.visits.map((visit, index) => ({
    visitId: visit.visitId,
    completed: true,
    followUpRequested: day.day < 7 && index < 2,
    followUpAfterDays: 1
  }));
}

async function generateWeek(catalog, seed, storage) {
  const generator = generatorApi.createGenerator({ catalog, seed, storage });
  const fingerprints = [];
  const cases = [];
  for (let dayNumber = 1; dayNumber <= 7; dayNumber += 1) {
    const planned = generator.getOrGenerateDay(dayNumber);
    const repeated = generator.getOrGenerateDay(dayNumber);
    if (JSON.stringify(planned) !== JSON.stringify(repeated)) {
      throw new Error(`${seed}: day ${dayNumber} changed before opening`);
    }
    if (planned.visits.some((visit) => visit.source === "unplanned")) {
      throw new Error(`${seed}: day ${dayNumber} exposed an unplanned visit before opening`);
    }
    if (planned.visits.length + planned.pendingUnplanned !== planned.plannedVisitCount) {
      throw new Error(`${seed}: day ${dayNumber} did not persist the complete plan`);
    }
    const restored = generatorApi.createGenerator({ catalog, seed: "ignored-after-save", storage });
    if (JSON.stringify(restored.getOrGenerateDay(dayNumber)) !== JSON.stringify(planned)) {
      throw new Error(`${seed}: day ${dayNumber} changed after reload`);
    }
    const opened = generator.openDay(dayNumber);
    const reopened = restored.openDay(dayNumber);
    if (JSON.stringify(opened) !== JSON.stringify(reopened)) {
      throw new Error(`${seed}: day ${dayNumber} changed after opening/reload`);
    }
    const errors = generatorApi.validateGeneratedDay(opened, catalog, generatorApi.DEFAULT_EQUIPMENT);
    if (errors.length) throw new Error(`${seed}: ${errors.join("; ")}`);
    if (opened.visits.some((visit) => visit.patient.species === "rabbit")) {
      throw new Error(`${seed}: rabbit generated in tier-01-v2`);
    }
    if (opened.visits.some((visit) => !catalog.casesById[visit.caseId])) {
      throw new Error(`${seed}: visit references content outside tier-01-v2`);
    }
    fingerprints.push(opened.fingerprint);
    cases.push(...opened.visits.map((visit) => visit.caseId));
    generator.closeDay(dayNumber, outcomesFor(opened));
  }
  return { fingerprints, cases, metadata: generator.metadata(7) };
}

async function main() {
  const catalog = await loader.loadFromDirectory(root);
  const uniqueWeeks = new Set();
  const caseCounts = {};
  let followUpVisits = 0;
  let unplannedVisits = 0;

  for (let run = 0; run < runs; run += 1) {
    const seed = `tier-01-v2-simulation-${run}`;
    const result = await generateWeek(catalog, seed, generatorApi.createMemoryStorage());
    uniqueWeeks.add(result.fingerprints.join("-"));
    result.cases.forEach((caseId) => { caseCounts[caseId] = (caseCounts[caseId] || 0) + 1; });

    const auditStorage = generatorApi.createMemoryStorage();
    const audit = generatorApi.createGenerator({ catalog, seed, storage: auditStorage });
    for (let day = 1; day <= 7; day += 1) {
      const opened = audit.openDay(day);
      followUpVisits += opened.visits.filter((visit) => visit.source === "follow_up").length;
      unplannedVisits += opened.visits.filter((visit) => visit.source === "unplanned").length;
      audit.closeDay(day, outcomesFor(opened));
    }
  }

  const sameA = await generateWeek(catalog, "determinism-check", generatorApi.createMemoryStorage());
  const sameB = await generateWeek(catalog, "determinism-check", generatorApi.createMemoryStorage());
  if (JSON.stringify(sameA.fingerprints) !== JSON.stringify(sameB.fingerprints)) {
    throw new Error("same seed produced a different seven-day campaign");
  }
  const different = await generateWeek(catalog, "different-seed-check", generatorApi.createMemoryStorage());
  if (JSON.stringify(sameA.fingerprints) === JSON.stringify(different.fingerprints)) {
    throw new Error("different seed produced the same seven-day campaign");
  }
  if (Object.keys(caseCounts).length !== catalog.manifest.caseCount) {
    throw new Error(`coverage reached ${Object.keys(caseCounts).length}/${catalog.manifest.caseCount} cases`);
  }
  if (unplannedVisits <= runs || unplannedVisits >= runs * 5) {
    throw new Error(`optional unplanned visits are not varying: ${unplannedVisits} across ${runs} weeks`);
  }
  const incompatibleStorage = generatorApi.createMemoryStorage();
  incompatibleStorage.setItem(generatorApi.SAVE_KEY, JSON.stringify({
    saveVersion: 1,
    generatorVersion: "tier-01-v2.future",
    campaignSeed: "must-not-regenerate",
    generatedDays: { "1": { protected: true } }
  }));
  let migrationBlocked = false;
  try {
    generatorApi.createGenerator({ catalog, storage: incompatibleStorage });
  } catch (error) {
    migrationBlocked = error.message.includes("migration required");
  }
  if (!migrationBlocked) throw new Error("incompatible v2 save was silently regenerated");

  console.log(JSON.stringify({
    status: "passed",
    runs,
    uniqueWeeks: uniqueWeeks.size,
    casesCovered: Object.keys(caseCounts).length,
    followUpVisits,
    unplannedVisits,
    sameSeedStable: true,
    differentSeedDifferent: true,
    reloadStable: true,
    migrationGuard: true
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
