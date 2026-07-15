"use strict";

const path = require("node:path");
const loader = require("../generator/content-loader-v2.js");
const generatorApi = require("../generator/generator-v2.js");

const runs = Number(process.argv[2] || 1000);
const projectRoot = path.resolve(__dirname, "..");
const contentOptions = {
  packId: "tier-01-v2",
  packVersion: "2026.07.12.2",
  mode: "tier-01-v2",
  context: "review"
};

function outcomesFor(day) {
  return day.visits.map((visit, index) => ({
    visitId: visit.visitId,
    completed: true,
    followUpRequested: day.day < 7 && index < 2,
    followUpAfterDays: 1
  }));
}

async function generateWeek(catalog, seed, storage, options = {}) {
  const generator = generatorApi.createGenerator({ catalog, seed, storage });
  const fingerprints = [];
  const structuralFingerprints = [];
  const visits = [];
  const daySummaries = [];
  for (let dayNumber = 1; dayNumber <= 7; dayNumber += 1) {
    const planned = generator.getOrGenerateDay(dayNumber);
    if (options.verifyPersistence) {
      const repeated = generator.getOrGenerateDay(dayNumber);
      if (JSON.stringify(planned) !== JSON.stringify(repeated)) throw new Error(`${seed}: day ${dayNumber} changed before opening`);
    }
    if (planned.visits.some((visit) => visit.source === "unplanned")) {
      throw new Error(`${seed}: day ${dayNumber} exposed an unplanned visit before opening`);
    }
    if (planned.visits.length + planned.pendingUnplanned !== planned.plannedVisitCount) {
      throw new Error(`${seed}: day ${dayNumber} did not persist the complete plan`);
    }
    const restored = options.verifyPersistence
      ? generatorApi.createGenerator({ catalog, seed: "ignored-after-save", storage })
      : null;
    if (restored && JSON.stringify(restored.getOrGenerateDay(dayNumber)) !== JSON.stringify(planned)) throw new Error(`${seed}: day ${dayNumber} changed after reload`);
    const opened = generator.openDay(dayNumber);
    if (restored) {
      const reopened = restored.openDay(dayNumber);
      if (JSON.stringify(opened) !== JSON.stringify(reopened)) throw new Error(`${seed}: day ${dayNumber} changed after opening/reload`);
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
    structuralFingerprints.push(opened.structuralFingerprint);
    visits.push(...opened.visits);
    daySummaries.push({
      day: dayNumber,
      followUps: opened.visits.filter((visit) => visit.source === "follow_up").length,
      unplanned: opened.visits.filter((visit) => visit.source === "unplanned").length,
      followUpFallbackCount: opened.followUpFallbackCount || 0
    });
    generator.closeDay(dayNumber, outcomesFor(opened));
  }
  return { fingerprints, structuralFingerprints, visits, daySummaries, metadata: generator.metadata(7) };
}

function increment(target, key) {
  const normalized = key || "none";
  target[normalized] = (target[normalized] || 0) + 1;
}

function structuralTokens(visits) {
  return new Set(visits.map((visit) => [
    visit.day,
    visit.caseId,
    visit.source,
    visit.urgency,
    visit.owner.profileId,
    visit.owner.modifierId || "none",
    visit.owner.homeActionId || "none",
    visit.followUpReason || "none"
  ].join("|")));
}

function jaccard(left, right) {
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 1;
}

async function main() {
  const catalog = await loader.loadFromDirectory(projectRoot, contentOptions);
  const uniqueWeeks = new Set();
  const structuralUniqueWeeks = new Set();
  const caseCounts = {};
  const familyCounts = {};
  const ownerProfileCounts = {};
  const homeActionCounts = {};
  const unplannedByDay = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1, { zero: 0, one: 0, total: 0 }]));
  const followUpsByDay = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1, { min: Infinity, max: 0, total: 0 }]));
  let followUpVisits = 0;
  let unplannedVisits = 0;
  let urgentVisits = 0;
  let followUpFallbackReplacements = 0;
  let previousStructuralTokens = null;
  let structuralSimilarityTotal = 0;
  let structuralSimilarityPairs = 0;
  let maximumStructuralSimilarity = 0;

  for (let run = 0; run < runs; run += 1) {
    const seed = `tier-01-v2-simulation-${run}`;
    const result = await generateWeek(catalog, seed, generatorApi.createMemoryStorage());
    uniqueWeeks.add(result.fingerprints.join("-"));
    structuralUniqueWeeks.add(result.structuralFingerprints.join("-"));
    result.visits.forEach((visit) => {
      increment(caseCounts, visit.caseId);
      increment(familyCounts, visit.family);
      increment(ownerProfileCounts, visit.owner.profileId);
      increment(homeActionCounts, visit.owner.homeActionId);
      if (["urgent", "emergency"].includes(visit.urgency)) urgentVisits += 1;
    });
    const tokens = structuralTokens(result.visits);
    if (previousStructuralTokens) {
      const similarity = jaccard(previousStructuralTokens, tokens);
      structuralSimilarityTotal += similarity;
      structuralSimilarityPairs += 1;
      maximumStructuralSimilarity = Math.max(maximumStructuralSimilarity, similarity);
    }
    previousStructuralTokens = tokens;

    for (const summary of result.daySummaries) {
      const day = summary.day;
      const dayFollowUps = summary.followUps;
      const dayUnplanned = summary.unplanned;
      followUpVisits += dayFollowUps;
      unplannedVisits += dayUnplanned;
      followUpFallbackReplacements += summary.followUpFallbackCount;
      unplannedByDay[day].total += dayUnplanned;
      unplannedByDay[day][dayUnplanned === 0 ? "zero" : "one"] += 1;
      followUpsByDay[day].total += dayFollowUps;
      followUpsByDay[day].min = Math.min(followUpsByDay[day].min, dayFollowUps);
      followUpsByDay[day].max = Math.max(followUpsByDay[day].max, dayFollowUps);
    }
  }

  const sameA = await generateWeek(catalog, "determinism-check", generatorApi.createMemoryStorage(), { verifyPersistence: true });
  const sameB = await generateWeek(catalog, "determinism-check", generatorApi.createMemoryStorage(), { verifyPersistence: true });
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

  const migrationStorage = generatorApi.createMemoryStorage();
  const beforeMigrationGenerator = generatorApi.createGenerator({ catalog, seed: "v2-migration-check", storage: migrationStorage });
  const beforeMigrationDay = beforeMigrationGenerator.getOrGenerateDay(1);
  const legacyV2State = JSON.parse(migrationStorage.getItem(generatorApi.SAVE_KEY));
  legacyV2State.saveVersion = 2;
  legacyV2State.generatorVersion = "tier-01-v2.0.0";
  delete legacyV2State.contentPackId;
  delete legacyV2State.contentPackVersion;
  delete legacyV2State.contentPackHash;
  Object.values(legacyV2State.generatedDays).forEach((day) => {
    day.schemaVersion = 2;
    day.generatorVersion = "tier-01-v2.0.0";
    delete day.contentPackId;
    delete day.contentPackVersion;
    delete day.contentPackHash;
    delete day.fullFingerprint;
    delete day.structuralFingerprint;
    day.visits.forEach((visit) => { delete visit.bookingReason; });
  });
  migrationStorage.setItem(generatorApi.SAVE_KEY, JSON.stringify(legacyV2State));
  const migratedGenerator = generatorApi.createGenerator({ catalog, storage: migrationStorage });
  const migratedDay = migratedGenerator.getOrGenerateDay(1);
  if (migratedDay.visits.map((visit) => visit.visitId).join() !== beforeMigrationDay.visits.map((visit) => visit.visitId).join()) {
    throw new Error("v2 migration changed generated patients");
  }
  if (!migratedDay.fullFingerprint || !migratedDay.structuralFingerprint || migratedDay.visits.some((visit) => !visit.bookingReason)) {
    throw new Error("v2 migration did not add new metadata");
  }

  console.log(JSON.stringify({
    status: "passed",
    runs,
    fullUniqueWeeks: uniqueWeeks.size,
    structuralUniqueWeeks: structuralUniqueWeeks.size,
    structuralDuplicates: runs - structuralUniqueWeeks.size,
    averageStructuralSimilarity: structuralSimilarityPairs ? structuralSimilarityTotal / structuralSimilarityPairs : 0,
    maximumStructuralSimilarity,
    casesCovered: Object.keys(caseCounts).length,
    caseCounts,
    familyCounts,
    ownerProfileCounts,
    homeActionCounts,
    urgentVisits,
    followUpFallbackReplacements,
    followUpVisits,
    unplannedVisits,
    unplannedByDay: Object.fromEntries(Object.entries(unplannedByDay).map(([day, value]) => [day, { ...value, average: value.total / runs }])),
    followUpsByDay: Object.fromEntries(Object.entries(followUpsByDay).map(([day, value]) => [day, { ...value, min: Number.isFinite(value.min) ? value.min : 0, average: value.total / runs }])),
    sameSeedStable: true,
    differentSeedDifferent: true,
    reloadStable: true,
    migrationGuard: true,
    v2MigrationPreservesPatients: true,
    contentPackVersion: sameA.metadata.contentPackVersion
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
