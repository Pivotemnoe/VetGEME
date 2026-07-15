import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const loader = require("../generator/content-loader-v2.js");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = await loader.loadFromDirectory(projectRoot, {
  packId: "tier-01-v2",
  packVersion: "2026.07.12.2",
  medicalCatalogId: "vetgeme-medical-family-registry",
  medicalCatalogVersion: "2026.07.14.3",
  mode: "tier-01-v2",
  context: "review"
});

assert.deepEqual(catalog.medicalCatalog.counts, {
  families: 39,
  variants: 215,
  presentations: 645,
  generatorEligibleFamilies: 0
});
assert.equal(catalog.medicalCatalog.productionPool.families.length, 0);
assert.equal(catalog.medicalCatalog.productionPool.variants.length, 0);
assert.equal(catalog.medicalCatalog.productionPool.presentations.length, 0);
assert.equal(catalog.compatibility.cases.length, 30);
assert.equal(
  catalog.compatibility.cases.reduce((sum, entry) => sum + entry.complaints.length, 0),
  90
);
assert.equal(catalog.multiDiagnosis.bundles.length, 10);
assert.ok(catalog.multiDiagnosis.bundles.every((bundle) => (
  bundle.status === "pending_content" && bundle.approvedClinicalContent === null
)));

const variantGaps = Object.values(catalog.medicalCatalog.variantsByKey).filter((variant) => (
  variant.version === null && variant.status === null
));
const presentationGaps = Object.values(catalog.medicalCatalog.presentationsByKey).filter((presentation) => (
  presentation.version === null && presentation.status === null
));
assert.equal(variantGaps.length, 215);
assert.equal(presentationGaps.length, 645);

const compatibilityText = JSON.stringify(catalog.compatibility.cases);
assert.doesNotMatch(compatibilityText, /masterFamily|masterVariant|masterPresentation/iu);
assert.equal(catalog.compatibility.mappingPolicy, "identity_only_no_master_crosswalk");

const sourceAudit = [
  ...catalog.sourceAudit.cases,
  ...Object.values(catalog.sourceAudit.owners)
];
const primaryFactCount = sourceAudit.reduce((sum, item) => sum + item.primaryFactCount, 0);
const measurementSourceCount = sourceAudit.reduce((sum, item) => sum + item.counts.measurement, 0);
const legacyMetadataCount = sourceAudit.reduce((sum, item) => sum + item.legacyMetadataCount, 0);
assert.ok(primaryFactCount > 0);
assert.equal(legacyMetadataCount, 3);

console.log(JSON.stringify({
  status: "passed",
  package: `${catalog.medicalRegistryEntry.packageId}@${catalog.medicalRegistryEntry.packageVersion}`,
  registry: `${catalog.medicalRegistryEntry.medicalCatalogId}@${catalog.medicalRegistryEntry.medicalCatalogVersion}`,
  sourceDigest: catalog.medicalRegistryEntry.sourceDigest,
  counts: catalog.medicalCatalog.counts,
  productionPool: {
    families: catalog.medicalCatalog.productionPool.families.length,
    variants: catalog.medicalCatalog.productionPool.variants.length,
    presentations: catalog.medicalCatalog.productionPool.presentations.length
  },
  compatibility: {
    policy: catalog.compatibility.mappingPolicy,
    cases: catalog.compatibility.cases.length,
    complaints: catalog.compatibility.cases.reduce((sum, entry) => sum + entry.complaints.length, 0),
    masterCrosswalks: 0
  },
  machineContractGaps: {
    variantsWithoutOwnVersionOrStatus: variantGaps.length,
    presentationsWithoutOwnVersionOrStatus: presentationGaps.length
  },
  sourceAudit: {
    primaryFactCount,
    measurementSourceCount,
    legacyMetadataCount,
    allowedPrimarySources: loader.medicalCatalogApi.PRIMARY_FACT_SOURCES
  },
  multiDiagnosisSelectable: 0
}, null, 2));
