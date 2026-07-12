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
  if (!["EAR_FUNGAL_OTITIS", "EAR_MITES"].includes(planned.visits[0].caseId)) {
    throw new Error(`unexpected first tutorial case: ${planned.visits[0].caseId}`);
  }
  const previewPlan = adapter.planFromDay(planned, catalog);
  if (previewPlan.patients.length !== planned.visits.length) throw new Error("preview plan changed booked visit count");
  if (/генератор/i.test(previewPlan.briefing)) throw new Error("player briefing exposes generator terminology");
  if (previewPlan.patients.some((patient) => patient.arrivalMinute % 5 !== 0)) throw new Error("booked time is not rounded to five minutes");
  if (new Set(previewPlan.patients.map((patient) => patient.arrivalMinute)).size !== previewPlan.patients.length) {
    throw new Error("two booked patients share the same arrival time");
  }
  const opened = generator.openDay(1);
  const plan = adapter.planFromDay(opened, catalog);
  for (const template of plan.patients) {
    if (template.species === "rabbit") throw new Error("adapter exposed a rabbit in tier-01-v2");
    if (template.bookingLabel !== template.v2Visit.bookingReason) throw new Error("adapter did not use bookingReason");
    if (template.bookingLabel === template.v2Visit.complaint.text) throw new Error("planning exposes initialComplaint");
    if (template.complaints[0] !== template.v2Visit.complaint.text) throw new Error("adapter rewrote an approved complaint");
    const patient = { ...template, ownerProfile: adapter.ownerProfileForVisit(template.v2Visit) };
    const diagnoses = adapter.diagnosisOptionsFor(patient, catalog);
    if (diagnoses.length < 3 || diagnoses.length > 5) throw new Error(`${template.diseaseId}: expected 3-5 contextual diagnoses`);
    if (!diagnoses.some((item) => item.id === template.diseaseId)) throw new Error(`${template.diseaseId}: correct diagnosis missing`);
    const treatment = adapter.treatmentOptionsFor(patient);
    if (!treatment.length || treatment[0].id !== template.v2Visit.medicalContent.planOptions[0].id) {
      throw new Error(`${template.diseaseId}: approved primary plan missing`);
    }
  }
  const requiredContextCases = [
    "EAR_FUNGAL_OTITIS",
    "SKIN_GROOMING_IRRITATION",
    "GI_ACUTE_UPSET",
    "URINARY_OBSTRUCTION",
    "TRAUMA_SUPERFICIAL_WOUND"
  ];
  for (const caseId of requiredContextCases) {
    const caseData = catalog.casesById[caseId];
    const diagnoses = adapter.diagnosisOptionsFor({ diseaseId: caseId, v2Visit: { medicalContent: caseData } }, catalog);
    if (diagnoses.length !== caseData.preliminaryDiagnosisOptions.length) throw new Error(`${caseId}: adapter added global diagnoses`);
    if (!diagnoses.some((item) => item.id === caseId)) throw new Error(`${caseId}: correct contextual diagnosis missing`);
  }
  const twoVisitGoal = previewPlan.goals.find((goal) => goal.id === "complete_two_full_visits");
  if (!twoVisitGoal || twoVisitGoal.target !== 2) throw new Error("two-visit goal denominator is not 2");
  console.log(JSON.stringify({
    status: "passed",
    adaptedVisits: plan.patients.length,
    contextualDiagnosisCases: requiredContextCases.length,
    approvedTextPreserved: true
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
