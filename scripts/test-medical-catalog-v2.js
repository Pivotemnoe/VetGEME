"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const loader = require("../generator/content-loader-v2.js");
const medicalApi = require("../generator/medical-catalog-v2.js");
const generatorApi = require("../generator/generator-v2.js");
const compactApi = require("../generator/compact-visit-v2.js");
const gameSaveApi = require("../generator/game-state-save.js");

const projectRoot = path.resolve(__dirname, "..");
const options = {
  packId: "tier-01-v2",
  packVersion: "2026.07.12.2",
  medicalCatalogId: "vetgeme-medical-family-registry",
  medicalCatalogVersion: "2026.07.14.3",
  mode: "tier-01-v2",
  context: "review"
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function readProjectJson(requestedPath) {
  return JSON.parse(await fs.readFile(path.join(projectRoot, ...requestedPath.split("/")), "utf8"));
}

async function main() {
  const catalog = await loader.loadFromDirectory(projectRoot, options);
  const medical = catalog.medicalCatalog;
  assert.deepEqual(medical.counts, {
    families: 39,
    variants: 215,
    presentations: 645,
    generatorEligibleFamilies: 0
  });
  assert.equal(Object.keys(medical.familiesById).length, 39);
  assert.equal(Object.keys(medical.familiesByKey).length, 39);
  assert.equal(Object.keys(medical.variantsByKey).length, 215);
  assert.equal(Object.keys(medical.presentationsByKey).length, 645);
  assert.equal(medical.productionPool.families.length, 0);
  assert.equal(medical.productionPool.variants.length, 0);
  assert.equal(medical.productionPool.presentations.length, 0);

  const repeatedPresentationId = "p2_behavior_swallowing_salivation_paralysis_or_unexplained_neurologic_signs";
  const repeatedKeys = Object.keys(medical.presentationsByKey).filter((key) => key.endsWith(`/presentation/${repeatedPresentationId}`));
  assert.equal(repeatedKeys.length, 2, "presentation IDs were treated as globally unique instead of composite identities");
  assert.notEqual(repeatedKeys[0], repeatedKeys[1]);

  assert.ok(Object.values(medical.variantsByKey).every((variant) => (
    variant.version === null
    && variant.status === null
    && variant.versionOrigin === "family"
    && variant.statusOrigin === "family"
    && variant.generatorEligible === false
  )));
  assert.ok(Object.values(medical.presentationsByKey).every((presentation) => (
    presentation.version === null
    && presentation.status === null
    && presentation.generatorEligible === false
  )));

  const registry = await readProjectJson(loader.CONTENT_REGISTRY_PATH);
  assert.throws(() => medicalApi.resolveRegisteredMedicalCatalog(registry, {
    ...options,
    context: "production"
  }), /production loading is disabled/);
  const unknownStatus = clone(registry.medicalCatalogs[0]);
  unknownStatus.status = "unknown";
  assert.throws(() => medicalApi.validateMedicalRegistration(unknownStatus), /unknown status unknown/);
  const unsafeRoot = clone(registry.medicalCatalogs[0]);
  unsafeRoot.root = "../handoff/vetgeme-master-package";
  assert.throws(() => medicalApi.validateMedicalRegistration(unsafeRoot), /invalid root/);
  const missingDigest = clone(registry.medicalCatalogs[0]);
  delete missingDigest.sourceDigest;
  assert.throws(() => medicalApi.validateMedicalRegistration(missingDigest), /sourceDigest must be SHA-256/);

  const medicalRegistration = registry.medicalCatalogs[0];
  const familyRegistryPath = `${medicalRegistration.root}/${medicalRegistration.familyRegistryPath}`;
  const familyRegistry = await readProjectJson(familyRegistryPath);
  const firstFamilyPath = `${medicalRegistration.root}/medical/${familyRegistry.families[0].contentFile}`;
  await assert.rejects(medicalApi.loadRegisteredMedicalCatalog(async (requestedPath) => {
    const value = await readProjectJson(requestedPath);
    if (requestedPath === firstFamilyPath) return { ...value, familyId: "tampered_family" };
    return value;
  }, medicalRegistration, options), /familyId mismatch/);
  await assert.rejects(medicalApi.loadRegisteredMedicalCatalog(async (requestedPath) => {
    const value = await readProjectJson(requestedPath);
    if (requestedPath === firstFamilyPath) {
      const tampered = clone(value);
      tampered.variants[1].id = tampered.variants[0].id;
      return tampered;
    }
    return value;
  }, medicalRegistration, options), /duplicate variant id/);
  await assert.rejects(medicalApi.loadRegisteredMedicalCatalog(async (requestedPath) => {
    const value = await readProjectJson(requestedPath);
    if (requestedPath === `${medicalRegistration.root}/${medicalRegistration.provenancePath}`) {
      return { ...value, aggregateSha256: "0".repeat(64) };
    }
    return value;
  }, medicalRegistration, options), /provenance aggregate digest mismatch/);

  assert.equal(catalog.compatibility.mappingPolicy, "identity_only_no_master_crosswalk");
  assert.equal(catalog.compatibility.cases.length, 30);
  assert.equal(catalog.compatibility.cases.reduce((sum, entry) => sum + entry.complaints.length, 0), 90);
  assert.doesNotMatch(JSON.stringify(catalog.compatibility.cases), /masterFamily|masterVariant|masterPresentation/iu);
  for (const caseData of catalog.cases) {
    const entry = catalog.compatibility.casesById[caseData.id];
    assert.equal(caseData.compatibilityRef, medicalApi.compatibilityCaseRef(caseData.family, caseData.id));
    assert.equal(entry.family, caseData.family);
    for (const complaint of caseData.initialComplaintVariants) {
      assert.equal(
        complaint.compatibilityRef,
        medicalApi.compatibilityComplaintRef(caseData.family, caseData.id, complaint.id)
      );
    }
  }

  const measurementAudit = medicalApi.validateClinicalSourceTree({
    nested: [{ value: "38.6", unit: "°C", source: "measurement" }]
  }, { label: "measurement fixture" });
  assert.equal(measurementAudit.counts.measurement, 1);
  assert.equal(measurementAudit.primaryFactCount, 1);
  assert.throws(() => medicalApi.validateClinicalSourceTree({
    nested: { source: "invented_source" }
  }, { label: "unknown source fixture" }), /unknown source invented_source.*\.nested/);
  assert.equal(medicalApi.validateClinicalSourceTree({
    planOptions: [{ longitudinalCare: { homeFrequency: { cadence: "daily", source: "plan_steps" } } }]
  }).legacyMetadataCount, 1);
  assert.throws(() => medicalApi.validateClinicalSourceTree({
    wrongLocation: { source: "plan_steps" }
  }), /unknown source plan_steps/);

  assert.equal(catalog.multiDiagnosis.manifest.automaticPairingAllowed, false);
  assert.equal(catalog.multiDiagnosis.bundles.length, 10);
  assert.ok(catalog.multiDiagnosis.bundles.every((bundle) => (
    bundle.status === "pending_content" && bundle.approvedClinicalContent === null
  )));

  const storage = generatorApi.createMemoryStorage();
  const generator = generatorApi.createGenerator({ catalog, seed: "medical-compatibility-selected-complaint", storage });
  const day = generator.getOrGenerateDay(1);
  const selected = day.visits[0];
  assert.equal(
    catalog.compatibility.selectedComplaintRef(selected.caseId, selected.complaint.id),
    selected.complaint.compatibilityRef
  );
  const compactVisit = compactApi.compactVisit(selected, catalog);
  const serializedVisit = JSON.stringify(compactVisit);
  assert.doesNotMatch(serializedVisit, /vetgeme-master-medical|medicalCatalog|compatibilityRef/iu);
  assert.equal(compactVisit.compactVisitSchemaVersion, 1);
  const serializedGeneratorSave = storage.getItem(generatorApi.SAVE_KEY);
  assert.doesNotMatch(serializedGeneratorSave, /vetgeme-master-medical|medicalCatalog|compatibilityRef/iu);
  assert.equal(JSON.parse(serializedGeneratorSave).saveVersion, generatorApi.SAVE_VERSION);
  assert.equal(generatorApi.SAVE_VERSION, 7);
  assert.equal(gameSaveApi.TIER_01_V2_GAME_STATE_SAVE_VERSION, 8);
  assert.equal(compactApi.COMPACT_VISIT_SCHEMA_VERSION, 1);

  console.log(JSON.stringify({
    status: "passed",
    counts: medical.counts,
    productionPoolPresentations: medical.productionPool.presentations.length,
    compositePresentationIdentityVerified: repeatedKeys.length,
    failClosedTamperCases: 6,
    compatibilityCases: catalog.compatibility.cases.length,
    compatibilityComplaints: catalog.compatibility.cases.reduce((sum, entry) => sum + entry.complaints.length, 0),
    masterCrosswalks: 0,
    recursiveMeasurementSourceAccepted: true,
    unknownSourceRejected: true,
    pendingMultiDiagnosisSelectable: 0,
    selectedComplaintRefHydrated: true,
    serializedMasterCatalogCopies: 0,
    generatorSaveVersion: generatorApi.SAVE_VERSION,
    tierGameSaveVersion: gameSaveApi.TIER_01_V2_GAME_STATE_SAVE_VERSION,
    compactVisitSchemaVersion: compactApi.COMPACT_VISIT_SCHEMA_VERSION
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
