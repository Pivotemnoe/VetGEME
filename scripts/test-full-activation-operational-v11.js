"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const operationalApi = require("../generator/activation-operational-v11.js");
const medicalApi = require("../generator/activation-medical-v11.js");
const generatorApi = require("../generator/generator-v2.js");

const root = path.resolve(__dirname, "..");
const operationalSource = path.join(
  root,
  "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.4/source"
);

function json(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(operationalSource, relativePath), "utf8"));
}

function testerParams(familyId, variantId, presentationId, urgencyBand = null) {
  const params = new URLSearchParams({ familyId, variantId, presentationId });
  if (urgencyBand) params.set("testerUrgency", urgencyBand);
  return params;
}

(async () => {
  const bundle = await operationalApi.loadFromDirectory(root);
  assert.deepEqual(bundle.audit, {
    exactUrgencyValues: 206,
    exactClassificationValues: 875,
    investigationUsages: 1864,
    researchRoutes: 361,
    presentationBehaviorBindings: 645,
    ownerProfiles: 12,
    temperaments: 8,
    p7Days: 30,
    p7EvidenceContracts: 93,
    approximateFallbacks: 0
  });

  const exact = json("source/p3-exact-source-crosswalk.json");
  const usages = json("generated/p3/investigation-usage-policy.json");
  const behavior = json("generated/p4/behavior-crosswalk.json");
  const exactUrgency = new Map(exact.urgencyValues.map((item) => [item.sourceValue, item]));
  const exactClassification = new Map(exact.classificationValues.map((item) => [item.sourceValue, item]));
  const usageById = new Map(usages.usages.map((item) => [item.usageId, item]));
  const behaviorByRef = new Map(behavior.presentations.map((item) => [item.presentationRef, item]));

  const campaign = await medicalApi.loadFromDirectory(root, { modeId: "campaign" });
  assert.equal(campaign.cases.length, 645);
  assert.equal(campaign.cases.filter((item) => item.generationEligible).length, 643);
  assert.equal(campaign.cases.filter((item) => !item.generationEligible).length, 2);
  assert.equal(campaign.operationalActivation.p7.days.length, 30);
  assert.equal(campaign.operationalActivation.p7.evidenceResolver.goalEvidence.length, 10);
  assert.equal(campaign.owners["base-profiles"].profiles.length, 12);
  assert.equal(campaign.owners.modifiers.modifiers.length, 0);
  assert.equal(campaign.patientTemperaments.length, 8);

  for (const caseData of campaign.cases) {
    const ref = caseData.sourceRecord.operationalPresentationRef;
    const presentation = caseData.sourceRecord.presentation;
    const exactBehavior = behaviorByRef.get(ref);
    assert(exactBehavior, `${ref}: exact P4 behavior missing`);
    assert.equal(exactBehavior.urgencySource, presentation.urgency);
    assert.deepEqual(caseData.operationalUrgencyResolution, exactUrgency.get(presentation.urgency));
    assert.equal(caseData.operationalUrgencyBand, exactBehavior.urgencyBandId);
    assert.deepEqual(caseData.compatibleOwnerProfiles, exactBehavior.ownerArchetypeIds);
    assert.deepEqual(caseData.compatibleTemperaments, exactBehavior.temperamentArchetypeIds);
    assert.deepEqual(caseData.sourceRecord.operationalHandlingActionIds, exactBehavior.handlingActionIds);
    for (const test of caseData.diagnosticTests) {
      const exactUsage = usageById.get(test.operationalUsageId);
      assert(exactUsage, `${test.operationalUsageId}: exact P3 usage missing`);
      assert.equal(exactUsage.presentationRef, ref);
      assert.equal(exactUsage.researchId, test.id);
      assert.equal(exactUsage.sourceClassification, test.authoredClassification);
      assert.equal(exactUsage.classificationBandId, test.operationalClassificationBand);
      assert.equal(exactUsage.classificationBandId, exactClassification.get(exactUsage.sourceClassification).bandId);
      assert.deepEqual(exactUsage.turnaroundPolicy, test.operationalTurnaroundPolicy);
    }
  }

  const dynamic = campaign.cases.find((item) => !item.generationEligible);
  assert(dynamic, "dynamic urgency presentation is unavailable");
  const unresolvedTester = await medicalApi.loadFromDirectory(root, {
    modeId: "tester",
    urlSearchParams: testerParams(dynamic.familyId, dynamic.variantId, dynamic.presentationId)
  });
  assert.equal(unresolvedTester.casesById[dynamic.id].generationEligible, false);
  assert.throws(
    () => generatorApi.createGenerator({
      catalog: unresolvedTester,
      seed: "dynamic-without-band",
      storage: generatorApi.createMemoryStorage(),
      gameModeId: "tester"
    }).getOrGenerateDay(1, {}),
    /явно выберите допустимую срочность/u
  );

  const explicitBand = dynamic.operationalUrgencyResolution.allowedBandIds[0];
  const resolvedTester = await medicalApi.loadFromDirectory(root, {
    modeId: "tester",
    urlSearchParams: testerParams(dynamic.familyId, dynamic.variantId, dynamic.presentationId, explicitBand)
  });
  const resolvedCase = resolvedTester.casesById[dynamic.id];
  assert.equal(resolvedCase.generationEligible, true);
  assert.equal(resolvedCase.operationalUrgencyBand, explicitBand);
  const generated = generatorApi.createGenerator({
    catalog: resolvedTester,
    seed: "dynamic-explicit-band",
    storage: generatorApi.createMemoryStorage(),
    gameModeId: "tester"
  }).getOrGenerateDay(1, {});
  assert(generated.visits.every((visit) => visit.caseId === dynamic.id));
  assert(generated.visits.every((visit) => visit.severity === explicitBand));
  assert(generated.visits.every((visit) => visit.patient.temperamentId));

  await assert.rejects(
    medicalApi.loadFromDirectory(root, {
      modeId: "tester",
      urlSearchParams: testerParams(dynamic.familyId, dynamic.variantId, dynamic.presentationId, "unknown")
    }),
    /is not allowed/u
  );

  const dialogue = campaign.operationalActivation.dialogue;
  assert.equal(dialogue.renderingRules.ownerBehaviorCannotRevealClinicalTruth, true);
  assert.equal(dialogue.renderingRules.criticalFactMustExistOutsideHumor, true);
  assert.equal(dialogue.renderingRules.rareAbsurdityForbiddenDuringEmergency, true);
  assert(dialogue.rareAbsurdEvents.every((event) => event.allowedUrgency !== "emergency"));
  campaign.owners["base-profiles"].profiles.forEach((profile) => {
    assert(profile.p8Voice.length > 0, `${profile.id}: P8 voice missing`);
    assert(Object.keys(profile.p8Utterances).length > 0, `${profile.id}: P8 utterances missing`);
  });

  console.log(JSON.stringify({
    status: "passed",
    operationalSource: bundle.sourceVersion,
    p8Source: bundle.p8SourceVersion,
    counts: bundle.audit,
    normalGenerationPresentations: 643,
    dynamicPresentationsFailClosed: 2,
    testerExplicitDynamicUrgency: true,
    p8EmergencyHumorDisabled: true,
    exactJoinsVerified: true
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
