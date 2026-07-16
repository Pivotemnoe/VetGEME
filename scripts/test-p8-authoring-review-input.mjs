import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  P8_REVIEW_INPUT_ID,
  P8_REVIEW_INPUT_VERSION,
  evaluateP8SourceCleanGate,
  loadP8AuthoringReviewInput,
  loadP8AuthoringReviewInputFromReader,
  validateP8ReviewInputRegistration,
  validateP8ReviewerDecisionSet,
} from "./lib/p8-authoring-review-input.mjs";
import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
} from "./lib/medical-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reader = createFileSystemReviewInputReader(projectRoot);
const registry = await readJson(REVIEW_INPUT_REGISTRY_PATH);
const registration = registry.reviewInputs.find((entry) => (
  entry.reviewInputId === P8_REVIEW_INPUT_ID && entry.reviewInputVersion === P8_REVIEW_INPUT_VERSION
));
assert.ok(registration, "P8 review input registration is missing");

const reviewInput = await loadP8AuthoringReviewInput(projectRoot, { context: "review" });
assert.equal(reviewInput.loadContext, "review");
assert.equal(reviewInput.reviewOnly, true);
assert.equal(reviewInput.productionEligible, false);
assert.equal(reviewInput.runtimeEligible, false);
assert.equal(reviewInput.generatorEligible, false);
assert.equal(reviewInput.activationAllowed, false);
assert.equal(reviewInput.externalVeterinaryApproval, false);
assert.equal(reviewInput.allowCurrentCaseCrosswalk, false);
assert.equal(reviewInput.registration.allowRuntimeActivation, false);
assert.equal(reviewInput.registration.allowPlayerFacingDialogue, false);
assert.equal(reviewInput.registration.allowReviewerDecisionImport, false);
assert.equal(reviewInput.registration.allowActivationManifest, false);
assert.equal(reviewInput.productionPool.length, 0);
assert.equal(reviewInput.reviewerDecisionSets.length, 0);
assert.equal(reviewInput.activationManifests.length, 0);
assert.deepEqual(reviewInput.audit.counts, {
  sourceFiles: 16,
  sourceBytes: 4561393,
  families: 39,
  variants: 215,
  presentations: 645,
  auditIssues: 5976,
  p0: 735,
  p1: 5241,
  p2: 0,
  p3: 0,
  ownerProfiles: 12,
  doctorSpeechFunctions: 15,
  rareAbsurdEvents: 4,
  p4Presentations: 645,
  p3ResearchTasks: 361,
  p3InvestigationUsages: 1864,
  baselineCases: 30,
  baselineCrosswalkMatches: 0,
  productionPool: 0,
});
assert.deepEqual(reviewInput.audit.cleanGate, {
  allowedP0: 0,
  allowedP1: 0,
  actualP0: 735,
  actualP1: 5241,
  p0Clean: false,
  p1Clean: false,
  passed: false,
});
assert.deepEqual(reviewInput.audit.p4PresentationClosure, { medical: 645, operational: 645, exact: true });
assert.deepEqual(reviewInput.audit.dialogueAuthority, {
  speechFormOnly: true,
  mayChangeMedicalTruth: false,
  mayChangeInvestigationResult: false,
  mayChangeConsentOrRefusal: false,
  mayChangeCost: false,
  mayChangeTime: false,
  mayChangeOutcome: false,
  emergencyHumorAllowed: false,
});
assert.deepEqual(reviewInput.audit.unmappedResearchTasks, [
  "gi_abdominal_palpation",
  "parasite_risk_and_prevention_history",
  "vestibular_owner_home_environment_and_emergency_red_flag_plan",
]);
assert.deepEqual(reviewInput.blockers.map((blocker) => blocker.id), [
  "p8_source_correction_gate_blocked",
  "p8_bundled_p1_clean_gate_incomplete",
  "p8_external_veterinary_approval_missing",
  "p8_reviewer_decisions_missing",
  "p8_activation_manifest_missing",
  "p8_player_facing_dialogue_runtime_forbidden",
  "p8_upstream_catalogs_review_only",
  "p8_operational_semantics_not_audited",
  "p8_unmapped_research_tasks",
]);
assert.equal(reviewInput.blockers.length, 9);
assert.equal(reviewInput.medicalReviewInputIdentity.reviewInputVersion, "2026.07.16.39");
assert.equal(
  reviewInput.medicalReviewInputIdentity.aggregateSha256,
  "e3341e533e09a6f00d09180f7b78808cdf1867406492a27cd17f9dca11bc626c",
);
assert.equal(reviewInput.operationalReviewInputIdentity.reviewInputVersion, "2026.07.16.1");
assert.equal(
  reviewInput.operationalReviewInputIdentity.p4OwnerProfilesSha256,
  "3e722abff5eb46e0161f714dd6fe2386e0f6f4c3997dc276bd0752930b682b9f",
);
assert.equal(
  reviewInput.operationalReviewInputIdentity.p4BehaviorCrosswalkSha256,
  "0d211caf8b5af4ae64cda672a36836350411b82053c29cb6741252dbfcb65582",
);
assert.equal(Object.isFrozen(reviewInput), true);
assert.equal(Object.isFrozen(reviewInput.registration), true);
assert.equal(Object.isFrozen(reviewInput.audit), true);
assert.equal(Object.isFrozen(reviewInput.audit.reviewRecords), true);
assert.equal(Object.isFrozen(reviewInput.audit.reviewRecords[0]), true);
assert.equal(Object.isFrozen(reviewInput.blockers), true);
assert.equal(Object.isFrozen(reviewInput.blockers[0].details), true);
assert.throws(() => {
  reviewInput.registration.allowRuntimeActivation = true;
}, TypeError);

assert.deepEqual(evaluateP8SourceCleanGate({ P0: 0, P1: 0 }), {
  allowedP0: 0,
  allowedP1: 0,
  actualP0: 0,
  actualP1: 0,
  p0Clean: true,
  p1Clean: true,
  passed: true,
});
assert.equal(evaluateP8SourceCleanGate({ P0: 0, P1: 1 }).passed, false, "P1-only defects must fail closed");
assert.equal(evaluateP8SourceCleanGate({ P0: 1, P1: 0 }).passed, false, "P0-only defects must fail closed");
assert.throws(() => evaluateP8SourceCleanGate({ P0: -1, P1: 0 }), /non-negative safe integer/);

await assert.rejects(loadP8AuthoringReviewInput(projectRoot), /explicit review context is required/);
await assert.rejects(
  loadP8AuthoringReviewInput(projectRoot, { context: "production" }),
  /production context is forbidden/,
);
await assert.rejects(
  loadP8AuthoringReviewInput(projectRoot, { context: "runtime" }),
  /runtime context is forbidden/,
);

for (const field of [
  "productionEligible",
  "runtimeEligible",
  "generatorEligible",
  "activationAllowed",
  "allowCurrentCaseCrosswalk",
  "allowRuntimeActivation",
  "allowPlayerFacingDialogue",
  "allowReviewerDecisionImport",
  "allowActivationManifest",
]) {
  const tampered = clone(registration);
  tampered[field] = true;
  assert.throws(() => validateP8ReviewInputRegistration(tampered), new RegExp(field));
}
const medicalVersionRegistration = clone(registration);
medicalVersionRegistration.medicalReviewInput.reviewInputVersion = "2026.07.16.40";
assert.throws(() => validateP8ReviewInputRegistration(medicalVersionRegistration), /medical review input identity mismatch/);
const p4DigestRegistration = clone(registration);
p4DigestRegistration.operationalReviewInput.catalogSha256.p4BehaviorCrosswalk = "0".repeat(64);
assert.throws(() => validateP8ReviewInputRegistration(p4DigestRegistration), /P4 behavior-crosswalk digest mismatch/);

const tamperedDigestRegistry = clone(registry);
tamperedDigestRegistry.reviewInputs.find((entry) => entry.reviewInputId === P8_REVIEW_INPUT_ID)
  .sourceIntegrity.aggregateSha256 = "0".repeat(64);
await assert.rejects(
  loadP8AuthoringReviewInputFromReader(reader, tamperedDigestRegistry, { context: "review" }),
  /P8 aggregate digest mismatch/,
);

const sourceRoot = `${registration.root}/${registration.sourceRoot}`;
const readmePath = `${sourceRoot}/README.md`;
const byteTamperedReader = wrapReader(reader, {
  async readBytes(requestedPath) {
    const bytes = await reader.readBytes(requestedPath);
    return requestedPath === readmePath ? Buffer.concat([bytes, Buffer.from("tampered\n")]) : bytes;
  },
});
await assert.rejects(
  loadP8AuthoringReviewInputFromReader(byteTamperedReader, registry, { context: "review" }),
  /byte length mismatch for README\.md/,
);
const missingFileReader = wrapReader(reader, {
  async listFiles(requestedRoot) {
    const files = await reader.listFiles(requestedRoot);
    return requestedRoot === sourceRoot ? files.filter((file) => file !== "README.md") : files;
  },
});
await assert.rejects(
  loadP8AuthoringReviewInputFromReader(missingFileReader, registry, { context: "review" }),
  /source file set differs from provenance/,
);

assert.throws(
  () => validateP8ReviewerDecisionSet(reviewInput.reviewerDecisionTemplate, reviewInput),
  /reviewer decision template cannot be imported/,
);
const firstFamily = reviewInput.audit.reviewRecords.find((record) => record.recordType === "family");
const validBlockedDecision = makeDecisionSet(firstFamily, reviewInput);
assert.throws(
  () => validateP8ReviewerDecisionSet(validBlockedDecision, reviewInput),
  /P0\/P1 clean gate is blocked/,
);
const wrongP8IdDecision = clone(validBlockedDecision);
wrongP8IdDecision.reviewPackage.packageId = "unknown-p8-package";
assert.throws(() => validateP8ReviewerDecisionSet(wrongP8IdDecision, reviewInput), /P8 packageId mismatch/);
const wrongP8VersionDecision = clone(validBlockedDecision);
wrongP8VersionDecision.reviewPackage.packageVersion = "2026.07.16.2";
assert.throws(() => validateP8ReviewerDecisionSet(wrongP8VersionDecision, reviewInput), /P8 packageVersion mismatch/);
for (const [field, message] of [
  ["archiveSha256", /P8 archive digest mismatch/],
  ["provenanceSha256", /P8 provenance digest mismatch/],
  ["sourceAggregateSha256", /P8 aggregate digest mismatch/],
]) {
  const wrongP8DigestDecision = clone(validBlockedDecision);
  wrongP8DigestDecision.reviewPackage[field] = "0".repeat(64);
  assert.throws(() => validateP8ReviewerDecisionSet(wrongP8DigestDecision, reviewInput), message);
}
const wrongMedicalIdDecision = clone(validBlockedDecision);
wrongMedicalIdDecision.inputPackage.packageId = "unknown-medical-package";
assert.throws(() => validateP8ReviewerDecisionSet(wrongMedicalIdDecision, reviewInput), /decision packageId mismatch/);
const wrongMedicalVersionDecision = clone(validBlockedDecision);
wrongMedicalVersionDecision.inputPackage.packageVersion = "2026.07.16.40";
assert.throws(() => validateP8ReviewerDecisionSet(wrongMedicalVersionDecision, reviewInput), /decision packageVersion mismatch/);
const wrongDigestDecision = clone(validBlockedDecision);
wrongDigestDecision.inputPackage.sourceAggregateSha256 = "0".repeat(64);
assert.throws(() => validateP8ReviewerDecisionSet(wrongDigestDecision, reviewInput), /medical digest mismatch/);
const wrongRecordDecision = clone(validBlockedDecision);
wrongRecordDecision.decisions[0].familyId = "unknown_family";
assert.throws(() => validateP8ReviewerDecisionSet(wrongRecordDecision, reviewInput), /unknown reviewer decision record/);
const wrongVersionDecision = clone(validBlockedDecision);
wrongVersionDecision.decisions[0].exactVersion = "0.0.0";
assert.throws(() => validateP8ReviewerDecisionSet(wrongVersionDecision, reviewInput), /exact version mismatch/);
const implicitChildScopeDecision = clone(validBlockedDecision);
implicitChildScopeDecision.decisions[0].variantId = "implicit-child";
assert.throws(
  () => validateP8ReviewerDecisionSet(implicitChildScopeDecision, reviewInput),
  /family decision may not imply variant or presentation scope/,
);
const duplicateDecision = clone(validBlockedDecision);
duplicateDecision.decisions.push(clone(duplicateDecision.decisions[0]));
assert.throws(() => validateP8ReviewerDecisionSet(duplicateDecision, reviewInput), /record keys contain duplicates/);

console.log(JSON.stringify({
  status: "passed",
  reviewInput: `${P8_REVIEW_INPUT_ID}@${P8_REVIEW_INPUT_VERSION}`,
  sourceFilesVerified: reviewInput.sourceIntegrity.sourceFiles,
  p0: reviewInput.audit.counts.p0,
  p1: reviewInput.audit.counts.p1,
  productionPool: reviewInput.productionPool.length,
  blockerCount: reviewInput.blockers.length,
  blockerIds: reviewInput.blockers.map((blocker) => blocker.id),
  reviewerDecisionImport: "fail_closed",
  currentCaseCrosswalkMatches: reviewInput.audit.counts.baselineCrosswalkMatches,
}, null, 2));

function makeDecisionSet(record, input) {
  return {
    schemaVersion: 1,
    decisionSetId: "external-review-001",
    decisionSetVersion: "1.0.0",
    reviewPackage: {
      packageId: input.registration.packageId,
      packageVersion: input.registration.packageVersion,
      archiveSha256: input.sourceIntegrity.archiveSha256,
      provenanceSha256: input.sourceIntegrity.provenanceSha256,
      sourceAggregateSha256: input.sourceIntegrity.aggregateSha256,
    },
    inputPackage: {
      packageId: input.medicalReviewInputIdentity.reviewInputId,
      packageVersion: input.medicalReviewInputIdentity.reviewInputVersion,
      sourceAggregateSha256: input.medicalReviewInputIdentity.aggregateSha256,
    },
    reviewer: {
      reviewerId: "reviewer-001",
      fullName: "External Veterinary Reviewer",
      qualification: "veterinarian",
      jurisdiction: "external",
      conflictOfInterestDeclared: true,
    },
    reviewedAt: "2026-07-16T12:00:00.000Z",
    decisions: [{
      ...record,
      decision: "approved",
      medicalSeverity: "P0",
      languageSeverity: "P1",
      decisionDomains: Object.fromEntries([
        "clinicalTruth",
        "differentialsAndExclusions",
        "investigationsAndInterpretation",
        "safeAndUnsafeDecisions",
        "equipmentAndReferral",
        "followUpAndOutcomes",
        "ownerAndDoctorLanguage",
        "sourcesAndScope",
      ].map((domain) => [domain, "approved"])),
      issueIds: [],
      comment: "Exact record reviewed.",
      reviewerSignature: "external-signature-placeholder-for-contract-test",
    }],
    activationRecommendation: "forbidden_until_all_target_records_approved_and_clean_audit_passes",
  };
}

function wrapReader(base, overrides) {
  return {
    readBytes: overrides.readBytes || ((...args) => base.readBytes(...args)),
    listFiles: overrides.listFiles || ((...args) => base.listFiles(...args)),
  };
}

async function readJson(relativePath) {
  return JSON.parse((await reader.readBytes(relativePath)).toString("utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
