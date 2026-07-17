"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const operationalLoader = require("../generator/activation-operational-v11.js");
const loader = require("../generator/activation-medical-v11.js");
const generatorApi = require("../generator/generator-v2.js");

const root = path.resolve(__dirname, "..");
const sourceRoot = path.join(root, "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source");
const sourceManifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, "MANIFEST.json"), "utf8"));
const sourceById = new Map();
const sourceFamilyHashes = new Map();

for (const entry of sourceManifest.families) {
  const family = JSON.parse(fs.readFileSync(path.join(sourceRoot, entry.path), "utf8"));
  sourceFamilyHashes.set(family.familyId, entry.sha256);
  for (const variant of family.variants) {
    for (const presentation of variant.presentations) {
      sourceById.set(loader.internalCaseId(family.familyId, variant.id, presentation.id), {
        family,
        variant,
        presentation
      });
    }
  }
}

function generatedDay(catalog, seed, storage = generatorApi.createMemoryStorage()) {
  const generator = generatorApi.createGenerator({ catalog, seed, storage, gameModeId: catalog.runtimeModeId });
  return { generator, day: generator.getOrGenerateDay(1, {}) };
}

(async () => {
  const campaign = await loader.loadFromDirectory(root, { modeId: "campaign" });
  assert.deepEqual(campaign.activationAudit.counts, { families: 39, variants: 215, presentations: 645 });
  assert.equal(campaign.cases.length, 645);
  assert.equal(Object.keys(campaign.casesById).length, 645);
  assert.equal(campaign.activationAudit.medicalManifestSha256, "87ded58e62ecf0b05d87af83e00570004cadafa9a0edd74768eda6e8cb9b3f49");
  assert.equal(campaign.activationAudit.sourceFamilyHashesVerified, 39);
  assert.equal(campaign.activationAudit.normalPoolContainsLegacyIds, false);
  assert.equal(campaign.activationAudit.operationalManifestSha256, operationalLoader.OPERATIONAL_MANIFEST_SHA256);
  assert.equal(campaign.activationAudit.p8ManifestSha256, operationalLoader.P8_MANIFEST_SHA256);
  assert.equal(campaign.activationAudit.p5ManifestSha256, campaign.p5Activation.manifestSha256);
  assert.equal(campaign.activationAudit.p5RoomCorrectionSha256, campaign.p5Activation.correctionSha256);
  assert.equal(campaign.p5Activation.documents.resourceCatalog.resources.length, 49);
  assert.equal(campaign.p5Activation.audit.taskTemplates, 2606);
  assert.equal(campaign.p5Activation.audit.preOverlayAffectedTemplates, 10);
  assert.equal(campaign.p5Activation.audit.preOverlayPredicateGaps, 15);
  assert.equal(campaign.p5Activation.audit.affectedTemplates, 0);
  assert.equal(campaign.p5Activation.audit.predicateGaps, 0);
  assert.equal(campaign.activationAudit.unresolvedDynamicPresentations, 2);
  assert.equal(campaign.activationAudit.removedLegacyUrgentPoolIds, 4);
  assert.deepEqual(campaign.dayPlan.days.find((day) => day.day === 4).urgentPool, []);
  assert.equal(campaign.operationalActivation.audit.exactUrgencyValues, 206);
  assert.equal(campaign.operationalActivation.audit.exactClassificationValues, 875);
  assert.equal(campaign.operationalActivation.audit.investigationUsages, 1864);
  assert.equal(campaign.operationalActivation.audit.researchRoutes, 361);
  assert.equal(campaign.operationalActivation.audit.presentationBehaviorBindings, 645);
  assert.equal(campaign.operationalActivation.audit.p7EvidenceContracts, 93);
  assert.equal(campaign.owners["base-profiles"].profiles.length, 12);
  assert.equal(campaign.patientTemperaments.length, 8);
  assert.equal(campaign.manifest.contentPolicy.runtimeGenerationOfMedicalText, false);
  assert.equal(campaign.manifest.contentPolicy.externalVeterinaryCertificationClaimed, false);

  const legacyIds = new Set(campaign.legacyArchiveIndex.map((item) => item.caseId));
  assert.equal(legacyIds.size, 30);
  campaign.cases.forEach((caseData) => {
    assert(!legacyIds.has(caseData.id), `${caseData.id}: legacy ID leaked into normal pool`);
    const source = sourceById.get(caseData.id);
    assert(source, `${caseData.id}: source presentation is missing`);
    assert.equal(caseData.familyId, source.family.familyId);
    assert.equal(caseData.variantId, source.variant.id);
    assert.equal(caseData.presentationId, source.presentation.id);
    assert.equal(caseData.initialComplaintVariants[0].text, source.presentation.complaint);
    assert.equal(caseData.preliminaryDiagnosisLabel, source.variant.title);
    assert.equal(caseData.preliminaryDiagnosisOptions[0].feedback, source.variant.diagnosticTruth);
    assert.deepEqual(caseData.planOptions[0].steps, source.presentation.ownerCommunication);
    assert.equal(caseData.planOptions[0].followUp.text, source.presentation.followUp.timing);
    assert.equal(caseData.ownerExplanation.uncertain, source.presentation.outcomes.unsafe);
    assert.equal(caseData.sourceRecord.familyManifestSha256, sourceFamilyHashes.get(source.family.familyId));
    assert.equal(caseData.reviewStatus, "external_veterinary_review_pending");

    const sourceAnswers = source.presentation.historyAnswers;
    for (const question of caseData.historyQuestions) {
      assert.equal(question.buttonText, source.family.commonHistoryQuestions.find((item) => item.id === question.id).text);
      assert.equal(question.answers[0].text, sourceAnswers[question.id]);
    }
    const runtimeFindings = [...caseData.generalExam.findings, ...caseData.targetExam.findings]
      .map((item) => [item.id, item.text]).sort();
    const sourceFindings = source.presentation.examFindings
      .map((item) => [item.factId, item.finding]).sort();
    assert.deepEqual(runtimeFindings, sourceFindings);
    assert.deepEqual(
      caseData.diagnosticTests.map((item) => [item.id, item.text]),
      source.presentation.investigations.map((item) => [item.id, item.result])
    );
  });

  const sequence = campaign.trainingSequence.lessons;
  assert.equal(sequence.length, 8);
  const training = await loader.loadFromDirectory(root, { modeId: "training" });
  const expectedTrainingIds = sequence.map((lesson) => loader.internalCaseId(
    lesson.familyId,
    lesson.variantId,
    lesson.presentationId
  ));
  assert.deepEqual(training.selectionPolicy.allowedCaseIds, expectedTrainingIds);
  assert.deepEqual(Object.values(training.selectionPolicy.forcedCaseIdByDay), expectedTrainingIds);
  expectedTrainingIds.forEach((id) => assert(training.casesById[id], `${id}: training source missing`));
  const trainingDay = generatedDay(training, "training-seed").day;
  assert.equal(trainingDay.visits[0].caseId, expectedTrainingIds[0]);
  assert(trainingDay.visits.every((visit) => expectedTrainingIds.includes(visit.caseId)));

  const testerTarget = expectedTrainingIds[6];
  const [familyId, variantId, presentationId] = testerTarget.split("::");
  const tester = await loader.loadFromDirectory(root, {
    modeId: "tester",
    urlSearchParams: new URLSearchParams({ familyId, variantId, presentationId })
  });
  assert.equal(tester.selectionPolicy.forcedCaseId, testerTarget);
  assert.deepEqual(tester.selectionPolicy.allowedCaseIds, [testerTarget]);
  assert.equal(tester.activationIndex.length, 39);
  assert.equal(tester.activationIndex.flatMap((family) => family.variants).length, 215);
  assert.equal(
    tester.activationIndex.flatMap((family) => family.variants.flatMap((variant) => variant.presentations)).length,
    645
  );
  const testerDay = generatedDay(tester, "tester-seed").day;
  assert(testerDay.visits.every((visit) => visit.caseId === testerTarget));

  const legacyTarget = campaign.legacyArchiveIndex[7].caseId;
  const archive = await loader.loadFromDirectory(root, {
    modeId: "tester",
    urlSearchParams: new URLSearchParams({ testerPool: "legacy30", legacyCaseId: legacyTarget })
  });
  assert.equal(archive.selectionPolicy.testerPool, "legacy_30_archive");
  assert.deepEqual(archive.selectionPolicy.allowedCaseIds, [legacyTarget]);
  const archiveDay = generatedDay(archive, "archive-seed").day;
  assert(archiveDay.visits.every((visit) => visit.caseId === legacyTarget));

  const first = generatedDay(campaign, "deterministic-seed").day;
  const second = generatedDay(campaign, "deterministic-seed").day;
  assert.deepEqual(first, second);
  const storage = generatorApi.createMemoryStorage();
  const initial = generatedDay(campaign, "reload-seed", storage);
  const reloaded = generatedDay(campaign, "ignored-after-save", storage);
  assert.deepEqual(reloaded.day, initial.day);
  assert.equal(generatorApi.validateGeneratedDay(first, campaign).length, 0);

  console.log(JSON.stringify({
    status: "passed",
    activation: `${loader.PACKAGE_ID}@${loader.PACKAGE_VERSION}`,
    medicalManifestSha256: campaign.activationAudit.medicalManifestSha256,
    counts: campaign.activationAudit.counts,
    sourceFamilyHashesVerified: campaign.activationAudit.sourceFamilyHashesVerified,
    trainingLessons: expectedTrainingIds.length,
    testerPresentationsSelectable: 645,
    legacyArchiveCases: archive.legacyArchiveIndex.length,
    ordinaryPoolLegacyCases: 0,
    deterministicGeneration: true,
    reloadStable: true
  }, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
