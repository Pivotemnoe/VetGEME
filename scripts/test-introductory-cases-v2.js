"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const loader = require("../generator/content-loader-v2.js");
const generatorApi = require("../generator/generator-v2.js");

const PARASITE_DISCLOSURE = /(клещ|яйц|фрагмент|подвижн\S*\s+(?:светл|точ))/iu;

async function main() {
  const catalog = await loader.loadFromDirectory(path.resolve(__dirname, ".."), {
    packId: "tier-01-v2",
    packVersion: "2026.07.12.2",
    mode: "tier-01-v2",
    context: "review"
  });
  const earMites = catalog.casesById.EAR_MITES;
  const fleaCase = catalog.casesById.SKIN_FLEA_INFESTATION;
  const superficialWound = catalog.casesById.TRAUMA_SUPERFICIAL_WOUND;

  const historyText = earMites.historyQuestions.flatMap((question) => question.answers.map((answer) => answer.text)).join(" ");
  const targetText = earMites.targetExam.findings.map((finding) => finding.text).join(" ");
  const sampleText = earMites.sampleActions.map((action) => action.result?.text || "").join(" ");
  const microscopyText = earMites.diagnosticTests.map((test) => test.text).join(" ");
  assert.equal(PARASITE_DISCLOSURE.test(historyText), false, "history reveals the parasite");
  assert.equal(PARASITE_DISCLOSURE.test(targetText), false, "target exam reveals the parasite");
  assert.equal(PARASITE_DISCLOSURE.test(sampleText), false, "sampling confirms the parasite");
  assert.equal(/ушн\S*\s+клещ/iu.test(microscopyText), true, "microscopy does not confirm ear mites");
  const correctEarDiagnosis = earMites.preliminaryDiagnosisOptions.find((option) => option.isCorrectForTemplate);
  assert.ok(correctEarDiagnosis.requires.includes("microscopy"), "ear-mite diagnosis is available before microscopy");

  for (const caseData of catalog.cases) {
    for (const species of caseData.species) {
      assert.ok(caseData.initialComplaintVariants.some((variant) => !variant.species || variant.species.includes(species)), `${caseData.id} has no complaint for ${species}`);
    }
  }

  const fleaById = Object.fromEntries(fleaCase.preliminaryDiagnosisOptions.map((option) => [option.id, option]));
  assert.equal(fleaById.flea_infestation.decisionAssessment, "justified");
  assert.equal(fleaById.flea_allergy.decisionAssessment, "acceptable");
  assert.equal(fleaById.food_allergy.decisionAssessment, "insufficient");
  assert.equal(fleaById.fungal_dermatitis.decisionAssessment, "insufficient");
  for (const option of fleaCase.preliminaryDiagnosisOptions) {
    assert.equal(/в этом варианте|в данном случае преобладает/iu.test(option.feedback), false, `${option.id} contains author meta text`);
    assert.ok((option.supportingEvidence?.length || 0) + (option.contradictingEvidence?.length || 0) > 0, `${option.id} has no evidence`);
  }

  assert.equal(
    superficialWound.preliminaryDiagnosisOptions.some((option) => /оставить\s+.*без\s+обработ/iu.test(option.label || "")),
    false,
    "a management action is exposed as a diagnosis"
  );
  assert.deepEqual(
    superficialWound.excludedPreliminaryDiagnosisOptions,
    [{ id: "observe_dirty", status: "pending_medical_review", reason: "management_action_not_diagnosis" }],
    "the missing diagnosis slot is not explicitly pending medical review"
  );

  let reloadChecked = false;
  for (let index = 0; index < 100 && !reloadChecked; index += 1) {
    const storage = generatorApi.createMemoryStorage();
    const seed = `intro-ear-reload-${index}`;
    const first = generatorApi.createGenerator({ catalog, seed, storage });
    const day = first.openDay(1);
    const visit = day.visits.find((item) => item.caseId === "EAR_MITES");
    if (!visit) continue;
    const before = JSON.stringify({
      complaint: visit.complaint,
      history: visit.historyAnswerSelections,
      targetExam: visit.medicalContent.targetExam,
      sample: visit.medicalContent.sampleActions,
      tests: visit.medicalContent.diagnosticTests,
      diagnoses: visit.medicalContent.preliminaryDiagnosisOptions
    });
    const reloaded = generatorApi.createGenerator({ catalog, seed, storage }).getOrGenerateDay(1);
    const afterVisit = reloaded.visits.find((item) => item.visitId === visit.visitId);
    const after = JSON.stringify({
      complaint: afterVisit.complaint,
      history: afterVisit.historyAnswerSelections,
      targetExam: afterVisit.medicalContent.targetExam,
      sample: afterVisit.medicalContent.sampleActions,
      tests: afterVisit.medicalContent.diagnosticTests,
      diagnoses: afterVisit.medicalContent.preliminaryDiagnosisOptions
    });
    assert.equal(after, before, "EAR_MITES sequence changed after reload");
    reloadChecked = true;
  }
  assert.equal(reloadChecked, true, "could not generate EAR_MITES for reload test");

  console.log(JSON.stringify({
    status: "passed",
    earMitesDisclosureOrder: true,
    complaintSpeciesCompatibility: true,
    fleaDecisionAssessment: true,
    woundDiagnosisSlots: true,
    reloadStable: true
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
