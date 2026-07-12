"use strict";

const campaign = require("../campaign-node.js");
const generatorApi = require("../generator.js");

const runs = Number(process.argv[2] || 1000);
const fingerprints = new Set();
const diseaseCounts = {};

for (let run = 0; run < runs; run += 1) {
  const storage = generatorApi.createMemoryStorage();
  const generator = generatorApi.createGenerator({
    campaign,
    storage,
    seed: `simulation-${run}`
  });
  const week = [];
  for (let day = 1; day <= 5; day += 1) {
    const context = day === 2
      ? { caseJournal: [{ day: 1, diseaseId: "bacterialOtitis", animal: "Бакс", owner: "Зайцева", species: "dog", sex: "самец", ageYears: 4 }] }
      : {};
    const plan = generator.getOrGenerateDay(day, context);
    const repeated = generator.getOrGenerateDay(day, { caseJournal: [] });
    if (JSON.stringify(plan) !== JSON.stringify(repeated)) {
      throw new Error(`seed simulation-${run}: generated day ${day} changed inside one campaign`);
    }
    const errors = generatorApi.validateDay(plan);
    if (errors.length) throw new Error(`seed simulation-${run}: ${errors.join("; ")}`);
    week.push(plan.fingerprint);
    plan.patients.forEach((patient) => {
      diseaseCounts[patient.diseaseId] = (diseaseCounts[patient.diseaseId] || 0) + 1;
    });
  }
  const restored = generatorApi.createGenerator({ campaign, storage, seed: "ignored-after-save" });
  const restoredFirstDay = restored.getOrGenerateDay(1, {});
  if (restoredFirstDay.fingerprint !== week[0]) {
    throw new Error(`seed simulation-${run}: saved campaign did not restore the first day`);
  }
  fingerprints.add(week.join("-"));
}

const fallback = generatorApi.createGenerator({
  campaign,
  storage: generatorApi.createMemoryStorage(),
  seed: "fallback-check"
}).getOrGenerateDay(2, { caseJournal: [] });
if (fallback.title !== "Неполный анамнез" || fallback.patients[0].returnVisit) {
  throw new Error("day 2 fallback must not claim a repeat visit without a completed day 1 case");
}

console.log(JSON.stringify({
  runs,
  uniqueWeeks: fingerprints.size,
  diseaseCounts
}, null, 2));
