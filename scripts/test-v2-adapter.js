"use strict";

const path = require("node:path");
const loader = require("../generator/content-loader-v2.js");
const generatorApi = require("../generator/generator-v2.js");
const adapter = require("../generator/game-adapter-v2.js");

async function main() {
  const catalog = await loader.loadFromDirectory(path.resolve(__dirname, "../tier-01-v2/content"));
  const generator = generatorApi.createGenerator({
    catalog,
    seed: "adapter-smoke",
    storage: generatorApi.createMemoryStorage()
  });
  const planned = generator.getOrGenerateDay(1);
  const previewPlan = adapter.planFromDay(planned, catalog);
  if (previewPlan.patients.length !== planned.visits.length) throw new Error("preview plan changed booked visit count");
  const opened = generator.openDay(1);
  const plan = adapter.planFromDay(opened, catalog);
  for (const template of plan.patients) {
    if (template.species === "rabbit") throw new Error("adapter exposed a rabbit in tier-01-v2");
    if (template.bookingLabel !== template.v2Visit.complaint.text) throw new Error("adapter rewrote an approved complaint");
    const patient = { ...template, ownerProfile: adapter.ownerProfileForVisit(template.v2Visit) };
    const diagnoses = adapter.diagnosisOptionsFor(patient, catalog);
    if (diagnoses.length !== 10) throw new Error(`${template.diseaseId}: expected 10 diagnoses`);
    if (!diagnoses.some((item) => item.id === template.diseaseId)) throw new Error(`${template.diseaseId}: correct diagnosis missing`);
    const treatment = adapter.treatmentOptionsFor(patient);
    if (!treatment.length || treatment[0].id !== template.v2Visit.medicalContent.planOptions[0].id) {
      throw new Error(`${template.diseaseId}: approved primary plan missing`);
    }
  }
  console.log(JSON.stringify({
    status: "passed",
    adaptedVisits: plan.patients.length,
    diagnosesPerVisit: 10,
    approvedTextPreserved: true
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
