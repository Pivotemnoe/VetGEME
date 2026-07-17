#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const activationLoader = require("../generator/activation-medical-v11.js");
const generatorApi = require("../generator/generator-v2.js");

const runs = Number(process.argv[2] || 10000);
assert(Number.isSafeInteger(runs) && runs > 0, "run count must be a positive integer");

const root = path.resolve(__dirname, "..");
const knownUrgencies = new Set(["routine", "scheduled", "priority", "urgent", "emergency"]);

function ensureAuthoredCase(caseData, legacyIds) {
  assert(caseData, "generated visit references an unknown case");
  assert(!legacyIds.has(caseData.id), `${caseData.id}: legacy case leaked into ordinary generation`);
  assert.equal(caseData.sourceVersion, "2026.07.16.40");
  if (caseData.generationEligible === false) {
    assert.equal(caseData.operationalUrgencyResolution.resolutionMode, "runtime_state_required_before_order",
      `${caseData.id}: non-dynamic presentation is unexpectedly ineligible`);
  }
  assert(caseData.initialComplaintVariants.some((item) => String(item.text || "").trim()), `${caseData.id}: empty complaint`);
  const correct = caseData.preliminaryDiagnosisOptions.filter((item) => item.isCorrectForTemplate === true);
  assert(correct.length > 0, `${caseData.id}: empty correct answer`);
  correct.forEach((item) => {
    assert(String(item.label || "").trim(), `${caseData.id}: empty correct answer label`);
    assert(String(item.feedback || "").trim(), `${caseData.id}: empty correct answer feedback`);
  });
  caseData.diagnosticTests.forEach((item) => {
    assert(String(item.text || "").trim(), `${caseData.id}/${item.id}: empty investigation result`);
  });
  assert.equal(caseData.referenceTextFallbacks?.length || 0, 0, `${caseData.id}: silent reference fallback escaped`);
}

function ensureCompatibleVisit(visit, caseData) {
  assert(knownUrgencies.has(visit.urgency), `${visit.visitId}: unknown urgency ${visit.urgency}`);
  assert(caseData.species.includes(visit.patient.species), `${visit.visitId}: incompatible species`);
  assert(caseData.allowedSex.includes(visit.patient.sex), `${visit.visitId}: incompatible sex`);
  assert(caseData.compatibleOwnerProfiles.includes(visit.owner.profileId), `${visit.visitId}: incompatible owner profile`);
  assert(caseData.compatibleTemperaments.includes(visit.patient.temperamentId), `${visit.visitId}: incompatible temperament`);
  const urgency = caseData.operationalUrgencyResolution;
  if (urgency.resolutionMode === "fixed_author_crosswalk") {
    assert.equal(visit.urgency, urgency.bandId, `${visit.visitId}: urgency differs from exact author crosswalk`);
  } else {
    assert(urgency.allowedBandIds.includes(visit.urgency), `${visit.visitId}: dynamic urgency outside allowed set`);
  }
  assert.equal(visit.medicalContent.id, caseData.id);
  assert.equal(visit.medicalContent.sourceVersion, "2026.07.16.40");
  assert.equal(visit.medicalContent.referenceTextFallbacks?.length || 0, 0, `${visit.visitId}: silent visit fallback escaped`);
}

(async () => {
  const catalog = await activationLoader.loadFromDirectory(root, { modeId: "campaign" });
  const legacyIds = new Set(catalog.legacyArchiveIndex.map((item) => item.caseId));
  const coveredCases = new Set();
  const coveredFamilies = new Set();
  let visits = 0;

  catalog.cases.forEach((caseData) => ensureAuthoredCase(caseData, legacyIds));

  let generatedDays = 0;
  let campaignIndex = 0;
  while (generatedDays < runs) {
    const seed = `full-activation-v11-campaign-${campaignIndex}`;
    const storage = generatorApi.createMemoryStorage();
    const generator = generatorApi.createGenerator({ catalog, seed, storage, gameModeId: "campaign" });
    for (let dayNumber = 1; dayNumber <= 30 && generatedDays < runs; dayNumber += 1) {
      const planned = generator.getOrGenerateDay(dayNumber, {});
      assert.deepEqual(generator.getOrGenerateDay(dayNumber, {}), planned, `${seed}: day ${dayNumber} changed before opening`);
      if (generatedDays < 100) {
        const reloaded = generatorApi.createGenerator({
          catalog,
          seed: "ignored-after-save",
          storage,
          gameModeId: "campaign"
        });
        assert.deepEqual(reloaded.getOrGenerateDay(dayNumber, {}), planned,
          `${seed}: day ${dayNumber} changed after reload`);
      }
      const day = generator.openDay(dayNumber);
      assert.deepEqual(generatorApi.validateGeneratedDay(day, catalog), [], `${seed}: day ${dayNumber} is invalid`);
      day.visits.forEach((visit) => {
        const caseData = catalog.casesById[visit.caseId];
        ensureAuthoredCase(caseData, legacyIds);
        ensureCompatibleVisit(visit, caseData);
        coveredCases.add(caseData.id);
        coveredFamilies.add(caseData.familyId);
        visits += 1;
      });
      generator.closeDay(dayNumber, day.visits.map((visit) => ({
        visitId: visit.visitId,
        completed: true,
        followUpRequested: false
      })));
      generatedDays += 1;
    }
    campaignIndex += 1;
  }

  async function deterministicCampaign(seed) {
    const storage = generatorApi.createMemoryStorage();
    const generator = generatorApi.createGenerator({ catalog, seed, storage, gameModeId: "campaign" });
    const fingerprints = [];
    for (let dayNumber = 1; dayNumber <= 30; dayNumber += 1) {
      const day = generator.openDay(dayNumber);
      fingerprints.push(day.fingerprint);
      generator.closeDay(dayNumber, day.visits.map((visit) => ({
        visitId: visit.visitId,
        completed: true,
        followUpRequested: false
      })));
    }
    return fingerprints;
  }
  assert.deepEqual(await deterministicCampaign("activation-determinism"),
    await deterministicCampaign("activation-determinism"), "same seed changed across a 30-day campaign");

  const ordinaryEligibleCases = catalog.cases.filter((item) => item.generationEligible !== false);
  assert.equal(ordinaryEligibleCases.length, 643);
  const uncoveredCampaignCases = ordinaryEligibleCases
    .filter((item) => !coveredCases.has(item.id))
    .map((item) => item.id);
  if (runs >= 10000) {
    assert.equal(coveredFamilies.size, 39, "10,000 generations did not cover every medical family");
  } else {
    assert(coveredFamilies.size > 0 && coveredCases.size > 0, "smoke run produced no medical coverage");
  }

  const tester = await activationLoader.loadFromDirectory(root, { modeId: "tester" });
  const selectable = tester.activationIndex.flatMap((family) => family.variants.flatMap((variant) =>
    variant.presentations.map((presentation) => activationLoader.internalCaseId(
      family.familyId,
      variant.variantId,
      presentation.presentationId
    ))
  ));
  assert.equal(new Set(selectable).size, 645);
  selectable.forEach((caseId) => assert(tester.casesById[caseId], `${caseId}: tester cannot open presentation`));

  for (const caseData of tester.cases.filter((item) => item.generationEligible !== false)) {
    const selectedCatalog = {
      ...tester,
      selectionPolicy: {
        ...tester.selectionPolicy,
        forcedCaseId: caseData.id,
        allowedCaseIds: [caseData.id]
      }
    };
    const day = generatorApi.createGenerator({
      catalog: selectedCatalog,
      seed: `tester-selectable-${caseData.id}`,
      storage: generatorApi.createMemoryStorage(),
      gameModeId: "tester"
    }).getOrGenerateDay(1, {});
    const visit = day.visits.find((item) => item.caseId === caseData.id);
    assert(visit, `${caseData.id}: tester did not open the selected presentation`);
    ensureCompatibleVisit(visit, caseData);
  }

  const dynamicCases = tester.cases.filter((item) => item.generationEligible === false);
  assert.equal(dynamicCases.length, 2);
  for (const caseData of dynamicCases) {
    const selected = await activationLoader.loadFromDirectory(root, {
      modeId: "tester",
      urlSearchParams: new URLSearchParams({
        familyId: caseData.familyId,
        variantId: caseData.variantId,
        presentationId: caseData.presentationId,
        testerUrgency: caseData.operationalUrgencyResolution.allowedBandIds[0]
      })
    });
    const day = generatorApi.createGenerator({
      catalog: selected,
      seed: `tester-dynamic-${caseData.id}`,
      storage: generatorApi.createMemoryStorage(),
      gameModeId: "tester"
    }).getOrGenerateDay(1, {});
    assert(day.visits.every((visit) => visit.caseId === caseData.id));
    assert(day.visits.every((visit) => visit.urgency === caseData.operationalUrgencyResolution.allowedBandIds[0]));
  }

  console.log(JSON.stringify({
    status: "passed",
    deterministicGenerations: runs,
    generatedVisits: visits,
    coveredFamilies: coveredFamilies.size,
    coveredCampaignPresentations: coveredCases.size,
    campaignEligiblePresentations: ordinaryEligibleCases.length,
    uncoveredByDeterministicCampaignSample: runs >= 10000
      ? uncoveredCampaignCases
      : { count: uncoveredCampaignCases.length, idsReportedAt: 10000 },
    testerSelectablePresentations: selectable.length,
    testerDynamicUrgencyPresentations: dynamicCases.length,
    legacyCasesInOrdinaryPool: 0,
    emptyCorrectAnswers: 0,
    unknownUrgencies: 0,
    silentFallbacks: 0,
    incompatibleEntities: 0
  }, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
