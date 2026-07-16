import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMedicalAuthoringReviewInput } from "./lib/medical-authoring-review-input.mjs";
import { runMedicalAuthoringBundledValidator } from "./run-medical-authoring-bundled-validator.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundledValidator = await runMedicalAuthoringBundledValidator();
const reviewInput = await loadMedicalAuthoringReviewInput(projectRoot, { context: "review" });

assert.equal(reviewInput.loadContext, "review");
assert.equal(reviewInput.reviewOnly, true);
assert.equal(reviewInput.productionEligible, false);
assert.equal(reviewInput.generatorEligible, false);
assert.equal(reviewInput.allowCrosswalk, false);
assert.equal(reviewInput.productionPool.length, 0);
assert.deepEqual(
  {
    families: reviewInput.audit.families,
    variants: reviewInput.audit.variants,
    presentations: reviewInput.audit.presentations,
    productionPool: reviewInput.audit.productionPool,
    capabilityRegistryEntries: reviewInput.audit.capabilityRegistryEntries,
  },
  {
    families: 39,
    variants: 215,
    presentations: 645,
    productionPool: 0,
    capabilityRegistryEntries: 447,
  },
);
assert.equal(reviewInput.audit.safeRoutes.familyDeclarations, 39);
assert.equal(reviewInput.audit.safeRoutes.presentationsCovered, 645);

console.log(JSON.stringify({
  status: "passed",
  input: `${reviewInput.registration.reviewInputId}@${reviewInput.registration.reviewInputVersion}`,
  loadContext: reviewInput.loadContext,
  veterinaryReviewStatus: reviewInput.registration.veterinaryReviewStatus,
  productionEligible: reviewInput.productionEligible,
  allowCrosswalk: reviewInput.allowCrosswalk,
  bundledValidator,
  counts: {
    families: reviewInput.audit.families,
    variants: reviewInput.audit.variants,
    presentations: reviewInput.audit.presentations,
    productionPool: reviewInput.audit.productionPool,
  },
  sourceIntegrity: reviewInput.sourceIntegrity,
  authoringAudit: {
    sourceRecords: reviewInput.audit.sourceRecords,
    planBundles: reviewInput.audit.planBundles,
    researchMappings: reviewInput.audit.researchMappings,
    investigations: reviewInput.audit.investigations,
    criticalFacts: reviewInput.audit.criticalFacts,
    capabilityRegistryEntries: reviewInput.audit.capabilityRegistryEntries,
    capabilityReferences: reviewInput.audit.capabilityReferences,
    uniqueCapabilityReferences: reviewInput.audit.uniqueCapabilityReferences,
    requirementGroups: reviewInput.audit.requirementGroups,
    requirementOptions: reviewInput.audit.requirementOptions,
    equipment: reviewInput.audit.equipment,
    safeRoutes: reviewInput.audit.safeRoutes,
  },
}, null, 2));
