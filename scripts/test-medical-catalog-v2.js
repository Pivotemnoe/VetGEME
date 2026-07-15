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

function assertDeepFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, "production projection contains a mutable object");
  for (const nested of Object.values(value)) assertDeepFrozen(nested, seen);
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
  assert.equal(medical.loadContext, "review");
  assert.equal(medical.reviewCandidates.families.length, 0);
  assert.throws(
    () => medicalApi.requireProductionPool(medical),
    /master medical consumption requires production loadContext/
  );
  assert.equal(medicalApi.normalizeMedicalCatalog, undefined);
  const forgedProductionCatalog = clone(medical);
  forgedProductionCatalog.loadContext = "production";
  forgedProductionCatalog.productionPool = {
    families: [{ id: "forged_family" }],
    variants: [{ id: "forged_variant" }],
    presentations: [{ id: "forged_presentation" }]
  };
  assert.throws(
    () => medicalApi.requireProductionPool(forgedProductionCatalog),
    /production medical catalog is not loader-attested/
  );
  assert.throws(
    () => loader.requireGeneratorMedicalPool({
      loadContext: "production",
      medicalCatalog: forgedProductionCatalog
    }),
    /production medical catalog is not loader-attested/
  );
  assert.deepEqual(medical.sourceIntegrity, {
    aggregateVerified: true,
    loadedFilesVerified: 41,
    required: false,
    readerAvailable: true
  });

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
  const omittedContext = { ...options };
  delete omittedContext.context;
  assert.throws(
    () => medicalApi.resolveRegisteredMedicalCatalog(registry, omittedContext),
    /production loading is disabled/
  );
  await assert.rejects(
    loader.loadFromDirectory(projectRoot, omittedContext),
    /production loading is disabled/
  );
  assert.throws(() => medicalApi.resolveRegisteredMedicalCatalog(registry, {
    ...options,
    context: "production"
  }), /production loading is disabled/);
  const unknownStatus = clone(registry.medicalCatalogs[0]);
  unknownStatus.status = "unknown";
  assert.throws(() => medicalApi.validateMedicalRegistration(unknownStatus), /unknown status unknown/);
  const unknownPackageStatus = clone(registry.medicalCatalogs[0]);
  unknownPackageStatus.packageStatus = "unknown";
  assert.throws(() => medicalApi.validateMedicalRegistration(unknownPackageStatus), /unknown packageStatus unknown/);
  const contradictoryApproval = clone(registry.medicalCatalogs[0]);
  contradictoryApproval.status = "approved";
  assert.throws(() => medicalApi.validateMedicalRegistration(contradictoryApproval), /approval statuses contradict/);
  const blockedProduction = clone(registry.medicalCatalogs[0]);
  blockedProduction.reviewPolicy.productionEligible = true;
  assert.throws(() => medicalApi.validateMedicalRegistration(blockedProduction), /blocked package cannot be production eligible/);
  const blockedEligibility = clone(registry.medicalCatalogs[0]);
  blockedEligibility.expectedCounts.generatorEligibleFamilies = 1;
  assert.throws(() => medicalApi.validateMedicalRegistration(blockedEligibility), /blocked package cannot register generator-eligible families/);
  const unsafeRoot = clone(registry.medicalCatalogs[0]);
  unsafeRoot.root = "../handoff/vetgeme-master-package";
  assert.throws(() => medicalApi.validateMedicalRegistration(unsafeRoot), /invalid root/);
  const missingDigest = clone(registry.medicalCatalogs[0]);
  delete missingDigest.sourceDigest;
  assert.throws(() => medicalApi.validateMedicalRegistration(missingDigest), /sourceDigest must be SHA-256/);

  const medicalRegistration = registry.medicalCatalogs[0];
  await assert.rejects(
    medicalApi.loadRegisteredMedicalCatalog(readProjectJson, medicalRegistration),
    /production loading is disabled/
  );
  const packageManifestPath = `${medicalRegistration.root}/${medicalRegistration.manifestPath}`;
  const packageManifest = await readProjectJson(packageManifestPath);
  const mismatchedLegacyRollup = clone(packageManifest);
  mismatchedLegacyRollup.medical.familyStatus = "approved";
  assert.throws(
    () => medicalApi.validatePackageManifest(medicalRegistration, mismatchedLegacyRollup),
    /legacy registration\/manifest familyStatus mismatch/
  );
  const familyRegistryPath = `${medicalRegistration.root}/${medicalRegistration.familyRegistryPath}`;
  const familyRegistry = await readProjectJson(familyRegistryPath);
  const firstFamilyPath = `${medicalRegistration.root}/medical/${familyRegistry.families[0].contentFile}`;
  const firstFamily = await readProjectJson(firstFamilyPath);
  const secondFamilyPath = `${medicalRegistration.root}/medical/${familyRegistry.families[1].contentFile}`;
  const secondFamily = await readProjectJson(secondFamilyPath);

  const mixedRegistration = clone(medicalRegistration);
  mixedRegistration.status = "approved";
  mixedRegistration.packageStatus = "approved";
  mixedRegistration.expectedCounts.generatorEligibleFamilies = 1;
  mixedRegistration.reviewPolicy.productionEligible = true;
  const mixedManifest = clone(packageManifest);
  mixedManifest.status = "approved";
  mixedManifest.medical.generatorEligibleFamilies = 1;
  const mixedFamilyRegistry = clone(familyRegistry);
  mixedFamilyRegistry.status = "approved";
  mixedFamilyRegistry.families[0].status = "approved";
  mixedFamilyRegistry.families[1].status = "retired";
  const mixedFirstFamily = clone(firstFamily);
  mixedFirstFamily.status = "approved";
  mixedFirstFamily.generatorEligible = true;
  const fixtureVariantStatuses = [
    "approved",
    "planned",
    "authored",
    "source_checked",
    "pending_veterinary_review",
    "retired"
  ];
  mixedFirstFamily.variants.forEach((variant, index) => {
    variant.version = `mixed-fixture-${index + 1}`;
    variant.status = fixtureVariantStatuses[index % fixtureVariantStatuses.length];
    variant.generatorEligible = index === 0;
  });
  const mixedSecondFamily = clone(secondFamily);
  mixedSecondFamily.status = "retired";
  mixedSecondFamily.generatorEligible = false;
  const mixedReader = async (requestedPath) => {
    if (requestedPath === packageManifestPath) return clone(mixedManifest);
    if (requestedPath === familyRegistryPath) return clone(mixedFamilyRegistry);
    if (requestedPath === firstFamilyPath) return clone(mixedFirstFamily);
    if (requestedPath === secondFamilyPath) return clone(mixedSecondFamily);
    return readProjectJson(requestedPath);
  };
  const mixedCatalog = await medicalApi.loadRegisteredMedicalCatalog(
    mixedReader,
    mixedRegistration,
    { ...options, context: "review" }
  );
  assert.deepEqual(
    [...new Set(mixedCatalog.families.map((family) => family.status))].sort(),
    ["approved", "retired", medicalApi.REVIEW_FAMILY_STATUS].sort()
  );
  assert.deepEqual(
    [...new Set(mixedCatalog.familiesById.ear_external.variants.map((variant) => variant.status))].sort(),
    fixtureVariantStatuses.slice().sort()
  );
  assert.equal(mixedCatalog.counts.generatorEligibleFamilies, 1);
  assert.equal(mixedCatalog.reviewCandidates.families.length, 1);
  assert.equal(mixedCatalog.reviewCandidates.variants.length, 1);
  assert.equal(mixedCatalog.reviewCandidates.presentations.length, 0);
  assert.equal(mixedCatalog.productionPool.families.length, 0);
  assert.equal(mixedCatalog.productionPool.variants.length, 0);
  assert.equal(mixedCatalog.productionPool.presentations.length, 0);
  assert.throws(
    () => medicalApi.requireProductionPool(mixedCatalog),
    /master medical consumption requires production loadContext/
  );

  const projectionSource = clone(mixedCatalog.familiesById.ear_external);
  const eligibleVariant = projectionSource.variants[0];
  const eligiblePresentation = eligibleVariant.presentations[0];
  eligiblePresentation.version = "projection-presentation-v1";
  eligiblePresentation.status = "approved";
  eligiblePresentation.generatorEligible = true;
  const pendingVariant = projectionSource.variants[1];
  pendingVariant.version = "projection-pending-variant-v1";
  pendingVariant.status = "pending_veterinary_review";
  pendingVariant.generatorEligible = false;
  pendingVariant.presentations[0].version = "projection-ineligible-parent-presentation-v1";
  pendingVariant.presentations[0].status = "approved";
  pendingVariant.presentations[0].generatorEligible = true;

  const productionProjection = medicalApi.__testOnly.buildProductionCandidateProjection([projectionSource]);
  assert.equal(productionProjection.families.length, 1);
  assert.equal(productionProjection.variants.length, 1);
  assert.equal(productionProjection.presentations.length, 1);
  assert.deepEqual(productionProjection.families[0].variants.map((variant) => variant.id), [eligibleVariant.id]);
  assert.deepEqual(
    productionProjection.families[0].variants[0].presentations.map((presentation) => presentation.id),
    [eligiblePresentation.id]
  );
  assert.equal(JSON.stringify(productionProjection).includes(pendingVariant.id), false);
  assert.notEqual(productionProjection.families[0], projectionSource);
  assert.notEqual(productionProjection.families[0].variants[0], eligibleVariant);
  assert.notEqual(productionProjection.families[0].variants[0].presentations[0], eligiblePresentation);
  assertDeepFrozen(productionProjection);
  assert.throws(() => productionProjection.families.push({}), TypeError);
  assert.throws(() => {
    productionProjection.families[0].title = "mutated";
  }, TypeError);
  assert.throws(() => productionProjection.families[0].species.push("cat"), TypeError);
  assert.throws(() => {
    productionProjection.families[0].variants[0].presentations[0].id = "mutated";
  }, TypeError);
  assert.throws(
    () => medicalApi.requireProductionPool({
      loadContext: "production",
      productionPool: productionProjection
    }),
    /production medical catalog is not loader-attested/
  );

  const invalidVariantVersion = clone(firstFamily);
  invalidVariantVersion.variants[0].version = 1;
  assert.throws(() => medicalApi.validateFamily(
    medicalRegistration,
    familyRegistry.families[0],
    invalidVariantVersion
  ), /variant version is invalid/);
  const blankVariantVersion = clone(firstFamily);
  blankVariantVersion.variants[0].version = "  ";
  assert.throws(() => medicalApi.validateFamily(
    medicalRegistration,
    familyRegistry.families[0],
    blankVariantVersion
  ), /variant version is invalid/);
  const unknownVariantStatus = clone(firstFamily);
  unknownVariantStatus.variants[0].status = "writer_reviewed";
  assert.throws(() => medicalApi.validateFamily(
    medicalRegistration,
    familyRegistry.families[0],
    unknownVariantStatus
  ), /unknown variant status writer_reviewed/);
  const invalidVariantEligibility = clone(firstFamily);
  invalidVariantEligibility.variants[0].generatorEligible = "false";
  assert.throws(() => medicalApi.validateFamily(
    medicalRegistration,
    familyRegistry.families[0],
    invalidVariantEligibility
  ), /variant generatorEligible must be boolean/);
  const unapprovedEligibleVariant = clone(firstFamily);
  unapprovedEligibleVariant.variants[0].generatorEligible = true;
  assert.throws(() => medicalApi.validateFamily(
    medicalRegistration,
    familyRegistry.families[0],
    unapprovedEligibleVariant
  ), /generator-eligible variant must be approved/);
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
  await assert.rejects(medicalApi.loadRegisteredMedicalCatalog(async (requestedPath) => {
    const value = await readProjectJson(requestedPath);
    if (requestedPath === `${medicalRegistration.root}/${medicalRegistration.provenancePath}`) {
      const tampered = clone(value);
      tampered.files.find((file) => file.path === "medical/00_MASTER_FAMILY_MAP.md").sha256 = "0".repeat(64);
      return tampered;
    }
    return value;
  }, medicalRegistration, options), /provenance inventory digest mismatch/);

  const provenance = await readProjectJson(`${medicalRegistration.root}/${medicalRegistration.provenancePath}`);
  const provenanceByPath = Object.fromEntries(provenance.files.map((file) => [file.path, file]));
  const integrityReader = async (requestedPath) => readProjectJson(requestedPath);
  integrityReader.integrity = async (requestedPath) => {
    const sourcePath = requestedPath.slice(`${medicalRegistration.root}/`.length);
    const expected = provenanceByPath[sourcePath];
    return {
      bytes: expected.bytes,
      sha256: requestedPath === firstFamilyPath ? "0".repeat(64) : expected.sha256
    };
  };
  await assert.rejects(
    medicalApi.loadRegisteredMedicalCatalog(integrityReader, medicalRegistration, options),
    /runtime SHA-256 mismatch.*medical\/families\/01_ear\/family\.json/
  );

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
  assert.equal(gameSaveApi.P5_TIER_01_V2_GAME_STATE_SAVE_VERSION, 8);
  assert.equal(gameSaveApi.P6_TIER_01_V2_GAME_STATE_SAVE_VERSION, 9);
  assert.equal(gameSaveApi.TIER_01_V2_GAME_STATE_SAVE_VERSION, 10);
  assert.equal(compactApi.COMPACT_VISIT_SCHEMA_VERSION, 1);

  console.log(JSON.stringify({
    status: "passed",
    counts: medical.counts,
    productionPoolPresentations: medical.productionPool.presentations.length,
    compositePresentationIdentityVerified: repeatedKeys.length,
    failClosedContextVerified: true,
    contradictoryStatusesRejected: true,
    invalidVariantMetadataRejected: true,
    provenanceTamperRejected: true,
    runtimeSourceFilesVerified: medical.sourceIntegrity.loadedFilesVerified,
    forgedProductionAttestationRejected: true,
    normalizerIsInternal: true,
    productionProjectionDeepFrozen: true,
    pendingVariantsExcludedFromProductionProjection: true,
    mixedFamilyLifecycleLoaded: true,
    reviewCandidatesNotConsumable: true,
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
