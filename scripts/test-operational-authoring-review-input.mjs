import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BASELINE_MANIFEST_PATH,
  OPERATIONAL_REVIEW_INPUT_ID,
  OPERATIONAL_REVIEW_INPUT_VERSION,
  loadOperationalAuthoringReviewInput,
  loadOperationalAuthoringReviewInputFromReader,
  validateOperationalAuthoringPackage,
  validateOperationalReviewInputRegistration,
} from "./lib/operational-authoring-review-input.mjs";
import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
} from "./lib/medical-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reader = createFileSystemReviewInputReader(projectRoot);
const registry = await readJson(REVIEW_INPUT_REGISTRY_PATH);
const registration = registry.reviewInputs.find((entry) => (
  entry.reviewInputId === OPERATIONAL_REVIEW_INPUT_ID
    && entry.reviewInputVersion === OPERATIONAL_REVIEW_INPUT_VERSION
));
assert.ok(registration, "operational review input registration is missing");

const reviewInput = await loadOperationalAuthoringReviewInput(projectRoot, { context: "review" });
const sourceRoot = `${registration.root}/${registration.sourceRoot}`;
const sourceFiles = await reader.listFiles(sourceRoot);
const sourceBytesByPath = new Map(await Promise.all(sourceFiles.map(async (relativePath) => [
  relativePath,
  await reader.readBytes(`${sourceRoot}/${relativePath}`),
])));
const capabilityBytes = await reader.readBytes(registration.capabilityRegistry.path);
const capabilityRegistry = JSON.parse(capabilityBytes.toString("utf8"));
const baselineManifest = await readJson(BASELINE_MANIFEST_PATH);

assert.equal(reviewInput.loadContext, "review");
assert.equal(reviewInput.reviewOnly, true);
assert.equal(reviewInput.productionEligible, false);
assert.equal(reviewInput.runtimeEligible, false);
assert.equal(reviewInput.productionPool.length, 0);
assert.equal(reviewInput.audit.counts.sourceFiles, 25);
assert.equal(reviewInput.audit.counts.capabilities, 447);
assert.equal(reviewInput.audit.counts.p3.researchIds, 361);
assert.equal(reviewInput.audit.counts.p3.investigationUsages, 1864);
assert.equal(reviewInput.audit.counts.p3.providers, 6);
assert.equal(reviewInput.audit.counts.p4.ownerProfiles, 12);
assert.equal(reviewInput.audit.counts.p4.temperaments, 8);
assert.equal(reviewInput.audit.counts.p4.observableCues, 10);
assert.equal(reviewInput.audit.counts.p4.ownerModifierTags, 463);
assert.equal(reviewInput.audit.counts.p4.temperamentTags, 128);
assert.equal(reviewInput.audit.counts.p4.handlingAlternativeTags, 446);
assert.equal(reviewInput.audit.counts.p4.presentations, 645);
assert.equal(reviewInput.audit.counts.p6.capabilityEconomics, 447);
assert.equal(reviewInput.audit.counts.p6.inventoryCategories, 10);
assert.equal(reviewInput.audit.counts.p6.reputationAxes, 4);
assert.equal(reviewInput.audit.counts.p7.campaignDays, 30);
assert.equal(reviewInput.audit.counts.p7.chapters, 6);
assert.equal(reviewInput.audit.counts.p7.goals, 60);
assert.equal(reviewInput.audit.counts.p7.events, 27);
assert.equal(reviewInput.audit.counts.p7.milestones, 6);
assert.equal(reviewInput.audit.counts.p7.specializations, 3);
assert.equal(reviewInput.audit.counts.p7.endings, 6);
assert.equal(reviewInput.audit.counts.baselineCases, 30);
assert.equal(reviewInput.audit.counts.baselineCrosswalkMatches, 0);

assert.equal(reviewInput.audit.counts.p4.unknownResourceRequirementIds, 8);
assert.equal(reviewInput.audit.counts.p4.unknownResourceRequirementReferences, 448);
assert.equal(reviewInput.audit.counts.p4.lostRuntimeSafeAlternatives, 446);
assert.deepEqual(reviewInput.audit.counts.p4.defaultFallbacks, {
  ownerModifiers: 341,
  temperamentTags: 82,
  handlingAlternatives: 46,
});
assert.deepEqual(reviewInput.audit.counts.p4.rulePrecedenceAmbiguities, {
  ownerModifiers: 5,
  temperamentTags: 0,
  handlingAlternatives: 183,
});
assert.deepEqual(reviewInput.audit.counts.p4.selectedRuleNonBoundaryTokenMatches, {
  ownerModifiers: 10,
  temperamentTags: 15,
  handlingAlternatives: 2,
});
assert.deepEqual(reviewInput.audit.counts.p4.allRuleNonBoundaryTokenMatches, {
  ownerModifiers: 10,
  temperamentTags: 15,
  handlingAlternatives: 5,
});
assert.equal(reviewInput.audit.counts.p4.exactFalseSubstringMappings, 2);
assert.equal(reviewInput.audit.counts.p4.contextualSubstringRisks, 1);
assert.equal(reviewInput.audit.counts.p3.localProviderNull, 230);
assert.equal(reviewInput.audit.counts.p3.fallbackNull, 12);
assert.equal(reviewInput.audit.counts.p3.imagingProviderRoutes, 64);
assert.equal(reviewInput.audit.counts.p3.suspiciousImagingProviderRoutes, 32);
assert.equal(reviewInput.audit.counts.p3.hardcodedActivationTrueReferences, 1444);
assert.equal(reviewInput.audit.counts.p7.missingCatalogRefDigests, 42);
assert.equal(reviewInput.audit.counts.p7.approvedRuntimeEnvelopes, 0);
assert.equal(reviewInput.audit.counts.p7.goalEvidenceIds, 10);
assert.equal(reviewInput.audit.counts.p7.axisSourceIds, 12);
assert.equal(reviewInput.blockers.length, 13);
assert.deepEqual(
  reviewInput.blockers.map((blocker) => blocker.id),
  [
    "activation_requirements_unsatisfied",
    "p3_local_ownership_resolver_missing",
    "p3_source_fallback_defaulted",
    "p3_activation_state_hardcoded",
    "p3_provider_routing_substring_collision",
    "p4_resource_requirements_unmapped",
    "p4_runtime_safe_alternatives_dropped",
    "p4_default_crosswalk_fallbacks",
    "p4_rule_precedence_and_substring_collisions",
    "p6_p5_catalog_mapping_missing",
    "p7_catalog_ref_digest_missing",
    "p7_approved_runtime_envelope_missing",
    "p7_evidence_resolver_missing",
  ],
);
assert.equal(
  reviewInput.blockers.find((blocker) => blocker.id === "p4_runtime_safe_alternatives_dropped")
    .details.handlingAlternatives.length,
  446,
);
assert.equal(
  reviewInput.blockers.find((blocker) => blocker.id === "p3_provider_routing_substring_collision")
    .details.routes[0].researchId,
  "addison_acth_stimulation_confirmation",
);
const p4RuleBlocker = reviewInput.blockers
  .find((blocker) => blocker.id === "p4_rule_precedence_and_substring_collisions");
assert.deepEqual(p4RuleBlocker.details.exactFalseSubstringMappings, [
  {
    section: "temperamentTags",
    sourceTag: "clinic_inhibited",
    selectedRuleId: "temp_pain_defensive",
    matchedTokens: ["bite"],
  },
  {
    section: "temperamentTags",
    sourceTag: "exercise_intolerant",
    selectedRuleId: "temp_calm",
    matchedTokens: ["tolerant"],
  },
]);
assert.deepEqual(p4RuleBlocker.details.contextualSubstringRisks, [
  {
    section: "temperamentTags",
    sourceTag: "respiratory_distress",
    selectedRuleId: "temp_fearful",
    matchedTokens: ["stress"],
  },
]);
assert.deepEqual(
  p4RuleBlocker.details.ambiguousRuleMatches.ownerModifiers.map((record) => ({
    sourceTag: record.sourceTag,
    selectedRuleId: record.selectedRuleId,
    matchingRuleIds: record.matchingRules.map((rule) => rule.ruleId),
  })),
  [
    { sourceTag: "cost_fatigue", selectedRuleId: "owner_budget", matchingRuleIds: ["owner_budget", "owner_exhausted"] },
    { sourceTag: "cost_or_transport_crisis", selectedRuleId: "owner_budget", matchingRuleIds: ["owner_budget", "owner_time"] },
    { sourceTag: "financial_fatigue", selectedRuleId: "owner_budget", matchingRuleIds: ["owner_budget", "owner_exhausted"] },
    { sourceTag: "frustrated_by_uncertainty", selectedRuleId: "owner_anxiety", matchingRuleIds: ["owner_anxiety", "owner_distrust"] },
    { sourceTag: "worried_about_lifelong_cost", selectedRuleId: "owner_budget", matchingRuleIds: ["owner_budget", "owner_anxiety"] },
  ],
);
const ambiguousHandling = p4RuleBlocker.details.ambiguousRuleMatches.handlingAlternatives;
assert.equal(ambiguousHandling.length, 183);
assert.equal(ambiguousHandling[0].sourceTag, "acclimatized_low_stress_repeat_or_referral");
assert.equal(ambiguousHandling.at(-1).sourceTag, "zoonotic_barrier_minimal_handling");
for (const [sourceTag, expectedRuleIds] of [
  ["anesthesia_or_referral", ["minimal_handling", "sedation_or_anesthesia"]],
  ["barrier_cohort_or_referral", ["minimal_handling", "barrier_isolation"]],
  ["sedation_by_reviewed_protocol_or_referral", ["minimal_handling", "sedation_or_anesthesia"]],
]) {
  assert.deepEqual(
    ambiguousHandling.find((record) => record.sourceTag === sourceTag)
      .matchingRules.map((rule) => rule.ruleId),
    expectedRuleIds,
  );
}
assert.deepEqual(p4RuleBlocker.details.ambiguousRuleMatches.handlingSelectionDistribution, {
  barrier_isolation: 4,
  minimal_handling: 127,
  sedation_or_anesthesia: 1,
  specialist_or_external: 13,
  staged_visit: 38,
});
assert.deepEqual(p4RuleBlocker.details.ambiguousRuleMatches.handlingCardinality, {
  2: 160,
  3: 22,
  4: 1,
});
assert.equal(
  p4RuleBlocker.details.allRuleNonBoundaryTokenMatches.handlingAlternatives.length,
  5,
);
assert.equal(Object.isFrozen(reviewInput), true);
assert.equal(Object.isFrozen(reviewInput.blockers), true);
assert.equal(Object.isFrozen(reviewInput.blockers[0].details), true);
assert.equal(Object.isFrozen(reviewInput.catalogs), true);

await assert.rejects(
  loadOperationalAuthoringReviewInputFromReader(reader, registry),
  /explicit review context is required/,
);
await assert.rejects(
  loadOperationalAuthoringReviewInputFromReader(reader, registry, { context: "production" }),
  /context production is forbidden/,
);

const productionEligibleRegistration = clone(registration);
productionEligibleRegistration.productionEligible = true;
assert.throws(
  () => validateOperationalReviewInputRegistration(productionEligibleRegistration),
  /productionEligible must be false/,
);
const runtimeEligibleRegistration = clone(registration);
runtimeEligibleRegistration.runtimeEligible = true;
assert.throws(
  () => validateOperationalReviewInputRegistration(runtimeEligibleRegistration),
  /runtimeEligible must be false/,
);
const crosswalkEligibleRegistration = clone(registration);
crosswalkEligibleRegistration.allowCurrentCaseCrosswalk = true;
assert.throws(
  () => validateOperationalReviewInputRegistration(crosswalkEligibleRegistration),
  /allowCurrentCaseCrosswalk must be false/,
);
const runtimeKindRegistration = clone(registration);
runtimeKindRegistration.kind = "operational_runtime";
assert.throws(
  () => validateOperationalReviewInputRegistration(runtimeKindRegistration),
  /kind must be operational_authoring/,
);

const tamperedDigestRegistry = clone(registry);
const tamperedRegistration = tamperedDigestRegistry.reviewInputs.find((entry) => (
  entry.reviewInputId === OPERATIONAL_REVIEW_INPUT_ID
));
tamperedRegistration.sourceIntegrity.aggregateSha256 = "0".repeat(64);
await assert.rejects(
  loadOperationalAuthoringReviewInputFromReader(reader, tamperedDigestRegistry, { context: "review" }),
  /provenance aggregate digest mismatch/,
);

const readmePath = `${sourceRoot}/README.md`;
const byteTamperedReader = wrapReader(reader, {
  async readBytes(requestedPath) {
    const bytes = await reader.readBytes(requestedPath);
    if (requestedPath !== readmePath) return bytes;
    return Buffer.concat([bytes, Buffer.from("tampered\n", "utf8")]);
  },
});
await assert.rejects(
  loadOperationalAuthoringReviewInputFromReader(byteTamperedReader, registry, { context: "review" }),
  /byte length mismatch for README\.md/,
);

const missingFileReader = wrapReader(reader, {
  async listFiles(requestedRoot) {
    const files = await reader.listFiles(requestedRoot);
    return requestedRoot === sourceRoot ? files.filter((file) => file !== "README.md") : files;
  },
});
await assert.rejects(
  loadOperationalAuthoringReviewInputFromReader(missingFileReader, registry, { context: "review" }),
  /source file set differs from provenance/,
);

const baseFixture = () => ({
  registration: clone(registration),
  manifest: clone(reviewInput.manifest),
  sourceFiles: [...sourceFiles],
  sourceBytesByPath: new Map([...sourceBytesByPath].map(([key, value]) => [key, Buffer.from(value)])),
  catalogs: clone(reviewInput.catalogs),
  sourcePolicies: clone(reviewInput.sourcePolicies),
  capabilityRegistry: clone(capabilityRegistry),
  capabilityBytes,
  baselineManifest: clone(baselineManifest),
});

const manifestRuntimeFixture = baseFixture();
manifestRuntimeFixture.manifest.runtimeEligible = true;
assert.throws(
  () => validateOperationalAuthoringPackage(manifestRuntimeFixture),
  /manifest runtimeEligible must remain false/,
);
const manifestMedicalVersionFixture = baseFixture();
manifestMedicalVersionFixture.manifest.sources.medicalPackageVersion = "2026.07.16.40";
assert.throws(
  () => validateOperationalAuthoringPackage(manifestMedicalVersionFixture),
  /medical source package version mismatch/,
);
const manifestCapabilityVersionFixture = baseFixture();
manifestCapabilityVersionFixture.manifest.sources.capabilityRegistryVersion = "2026.07.14.39";
assert.throws(
  () => validateOperationalAuthoringPackage(manifestCapabilityVersionFixture),
  /manifest capability registry version mismatch/,
);

const generatedStatusFixture = baseFixture();
generatedStatusFixture.catalogs["generated/p3/research-catalog.json"].runtimeEligible = true;
assert.throws(
  () => validateOperationalAuthoringPackage(generatedStatusFixture),
  /runtimeEligible must remain false/,
);

const sourcePolicyRuntimeFixture = baseFixture();
sourcePolicyRuntimeFixture.sourcePolicies["source/p3-policy.json"].runtimeEligible = true;
assert.throws(
  () => validateOperationalAuthoringPackage(sourcePolicyRuntimeFixture),
  /runtimeEligible must remain false/,
);

const hiddenUnknownP4Fixture = baseFixture();
hiddenUnknownP4Fixture.catalogs["generated/p4/behavior-crosswalk.json"]
  .handlingAlternatives[0].runtimeActionTemplate.resourceRequirements[0].capabilityId = "general_exam";
assert.throws(
  () => validateOperationalAuthoringPackage(hiddenUnknownP4Fixture),
  /unknown runtime resource requirement reference count must remain visible as 448/,
);

const restoredSafeAlternativeFixture = baseFixture();
const firstHandling = restoredSafeAlternativeFixture.catalogs["generated/p4/behavior-crosswalk.json"].handlingAlternatives[0];
firstHandling.runtimeActionTemplate.safeAlternatives = clone(firstHandling.safeAlternatives);
assert.throws(
  () => validateOperationalAuthoringPackage(restoredSafeAlternativeFixture),
  /lost runtime safe alternative count must remain visible as 446/,
);

const changedOwnerFallbackFixture = baseFixture();
changedOwnerFallbackFixture.catalogs["generated/p4/behavior-crosswalk.json"].ownerModifiers[0].ruleId = "owner_anxiety";
assert.throws(
  () => validateOperationalAuthoringPackage(changedOwnerFallbackFixture),
  /selected rule differs from source builder precedence/,
);

const hiddenFalseSubstringFixture = baseFixture();
hiddenFalseSubstringFixture.catalogs["generated/p4/behavior-crosswalk.json"].temperamentTags
  .find((record) => record.sourceTag === "clinic_inhibited").ruleId = "temp_default";
assert.throws(
  () => validateOperationalAuthoringPackage(hiddenFalseSubstringFixture),
  /selected rule differs from source builder precedence/,
);

const sourceAndCrosswalkCollisionHiddenFixture = baseFixture();
const painDefensiveRule = sourceAndCrosswalkCollisionHiddenFixture
  .sourcePolicies["source/p4-policy.json"].temperamentTagRules
  .find((rule) => rule.ruleId === "temp_pain_defensive");
painDefensiveRule.matchTokens = painDefensiveRule.matchTokens.filter((token) => token !== "bite");
const inhibitedMapping = sourceAndCrosswalkCollisionHiddenFixture
  .catalogs["generated/p4/behavior-crosswalk.json"].temperamentTags
  .find((record) => record.sourceTag === "clinic_inhibited");
inhibitedMapping.ruleId = "temp_default";
inhibitedMapping.archetypeId = "patient_cautious";
assert.throws(
  () => validateOperationalAuthoringPackage(sourceAndCrosswalkCollisionHiddenFixture),
  /selected-rule non-boundary temperament token match count must remain visible as 15/,
);

const dynamicActivationFixture = baseFixture();
dynamicActivationFixture.catalogs["generated/p3/research-catalog.json"].research[0].activationGate.delivered = false;
assert.throws(
  () => validateOperationalAuthoringPackage(dynamicActivationFixture),
  /hardcoded activation field delivered count must remain visible as 361/,
);

const changedProviderRouteFixture = baseFixture();
const suspiciousRoute = changedProviderRouteFixture.catalogs["generated/p3/research-catalog.json"].research
  .find((record) => record.researchId === "addison_acth_stimulation_confirmation");
suspiciousRoute.providerId = "ref_clinical_pathology";
assert.throws(
  () => validateOperationalAuthoringPackage(changedProviderRouteFixture),
  /imaging-provider route count mismatch/,
);

const digestAddedFixture = baseFixture();
digestAddedFixture.catalogs["generated/p7/director-catalog.json"]
  .catalogEnvelopes.events[0].catalogRef.digest = "review-digest-0001";
assert.throws(
  () => validateOperationalAuthoringPackage(digestAddedFixture),
  /missing catalogRef digest count must remain visible as 42/,
);

const fakeApprovalFixture = baseFixture();
Object.assign(
  fakeApprovalFixture.catalogs["generated/p7/director-catalog.json"].catalogEnvelopes.events[0],
  { status: "approved", digest: "review-digest-0001", itemIds: ["opening_orientation"] },
);
assert.throws(
  () => validateOperationalAuthoringPackage(fakeApprovalFixture),
  /must not contain an approved runtime envelope/,
);

const currentCaseCrosswalkFixture = baseFixture();
const baselineCaseId = currentCaseCrosswalkFixture.baselineManifest.cases[0].id;
currentCaseCrosswalkFixture.sourceBytesByPath.set(
  "README.md",
  Buffer.concat([currentCaseCrosswalkFixture.sourceBytesByPath.get("README.md"), Buffer.from(`\n${baselineCaseId}\n`)]),
);
assert.throws(
  () => validateOperationalAuthoringPackage(currentCaseCrosswalkFixture),
  /unapproved current 30-card crosswalk/,
);

console.log(JSON.stringify({
  status: "passed",
  reviewOnlyLoadVerified: true,
  productionAndDefaultContextsRejected: true,
  provenanceAndSourceTamperRejected: true,
  sourceAndGeneratedRuntimeEligibilityRejected: true,
  exactP3P4P6P7GapsPreservedForReview: true,
  currentThirtyCardCrosswalkRejected: true,
  fullMismatchDetailsDeepFrozen: true,
  blockers: reviewInput.blockers.map((blocker) => blocker.id),
  counts: reviewInput.audit.counts,
}, null, 2));

async function readJson(relativePath) {
  return JSON.parse((await reader.readBytes(relativePath)).toString("utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function wrapReader(base, overrides) {
  return {
    readBytes: overrides.readBytes || ((requestedPath) => base.readBytes(requestedPath)),
    listFiles: overrides.listFiles || ((requestedRoot) => base.listFiles(requestedRoot)),
  };
}
