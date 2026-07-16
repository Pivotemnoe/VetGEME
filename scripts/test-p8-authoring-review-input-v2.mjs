import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  P8_REVIEW_INPUT_V2_ID,
  P8_REVIEW_INPUT_V2_VERSION,
  loadP8V2AuthoringReviewInput,
  loadP8V2AuthoringReviewInputFromReader,
  validateP8ReviewerDecisionSet,
  validateP8V2ReviewInputRegistration,
} from "./lib/p8-authoring-review-input-v2.mjs";
import { evaluateP8SourceCleanGate } from "./lib/p8-authoring-review-input.mjs";
import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
} from "./lib/medical-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reader = createFileSystemReviewInputReader(projectRoot);
const registry = await readJson(REVIEW_INPUT_REGISTRY_PATH);
const registration = registry.reviewInputs.find((entry) => (
  entry.reviewInputId === P8_REVIEW_INPUT_V2_ID
    && entry.reviewInputVersion === P8_REVIEW_INPUT_V2_VERSION
));
assert.ok(registration, "P8 v2 review input registration is missing");

const reviewInput = await loadP8V2AuthoringReviewInput(projectRoot, {
  context: "review",
  reviewInputId: P8_REVIEW_INPUT_V2_ID,
  reviewInputVersion: P8_REVIEW_INPUT_V2_VERSION,
});

assert.equal(reviewInput.loadContext, "review");
assert.equal(reviewInput.registration.reviewInputVersion, "2026.07.16.2");
assert.equal(reviewInput.medicalReviewInputIdentity.reviewInputVersion, "2026.07.16.40");
assert.equal(reviewInput.operationalReviewInputIdentity.reviewInputVersion, "2026.07.16.1");
assert.equal(
  reviewInput.medicalReviewInputIdentity.aggregateSha256,
  "3f3f89ab93e005a5100b39586328c38fa6b4fcf52887be63cabc41ac05c557c8",
);
assert.equal(
  reviewInput.operationalReviewInputIdentity.aggregateSha256,
  "0a42bad7eccf70ba4eb3c18738c4b6653ab06d75056526ca828707b11e33f055",
);
assert.equal(reviewInput.sourceIntegrity.archiveSha256, registration.sourceIntegrity.archiveSha256);
assert.equal(reviewInput.sourceIntegrity.provenanceSha256, registration.sourceIntegrity.provenanceSha256);
assert.equal(reviewInput.sourceIntegrity.aggregateSha256, registration.sourceIntegrity.aggregateSha256);
assert.equal(reviewInput.sourceIntegrity.sourceFiles, 29);
assert.equal(reviewInput.sourceIntegrity.sourceBytes, 488589);
assert.deepEqual(reviewInput.reviewerDecisionHostTemplate.reviewPackage, {
  packageId: reviewInput.registration.packageId,
  packageVersion: reviewInput.registration.packageVersion,
  archiveSha256: reviewInput.sourceIntegrity.archiveSha256,
  provenanceSha256: reviewInput.sourceIntegrity.provenanceSha256,
  sourceAggregateSha256: reviewInput.sourceIntegrity.aggregateSha256,
});
assert.equal(
  reviewInput.reviewerDecisionHostContract.templateSha256,
  registration.reviewerDecisionContract.hostTemplateSha256,
);

for (const field of [
  "reviewOnly",
  "productionEligible",
  "runtimeEligible",
  "generatorEligible",
  "activationAllowed",
  "externalVeterinaryApproval",
  "allowCurrentCaseCrosswalk",
]) {
  assert.equal(reviewInput[field], field === "reviewOnly", `${field} changed fail-closed state`);
}
for (const field of [
  "allowRuntimeActivation",
  "allowPlayerFacingDialogue",
  "allowReviewerDecisionImport",
  "allowActivationManifest",
]) {
  assert.equal(reviewInput.registration[field], false, `${field} must remain false`);
}
assert.equal(reviewInput.productionPool.length, 0);
assert.equal(reviewInput.reviewerDecisionSets.length, 0);
assert.equal(reviewInput.activationManifests.length, 0);
assert.equal(reviewInput.audit.counts.baselineCases, 30);
assert.equal(reviewInput.audit.counts.baselineCrosswalkMatches, 0);
assert.equal(reviewInput.audit.counts.families, 39);
assert.equal(reviewInput.audit.counts.variants, 215);
assert.equal(reviewInput.audit.counts.presentations, 645);
assert.equal(reviewInput.audit.counts.investigations, 1864);
assert.equal(reviewInput.audit.counts.playerFacingFields, 9847);
assert.deepEqual(reviewInput.audit.cleanGate, {
  allowedP0: 0,
  allowedP1: 0,
  actualP0: 0,
  actualP1: 0,
  p0Clean: true,
  p1Clean: true,
  passed: true,
});
assert.deepEqual(reviewInput.audit.nonAuthoritativeArtifacts, [{
  path: "generated/P8_SOURCE_AUDIT_2026.07.16.40.json",
  reason: "stale_v1_medical_v39_snapshot_not_listed_in_manifest_authoritative_files",
}]);
assert.equal(
  reviewInput.manifest.authoritativeFiles.includes("generated/P8_SOURCE_AUDIT_2026.07.16.40.json"),
  false,
  "stale versioned source audit must not become authoritative",
);
assert.equal(reviewInput.sourceAudit.reportVersion, "2026.07.16.2");
assert.equal(reviewInput.sourceAudit.input.packageVersion, "2026.07.16.40");
assert.deepEqual(reviewInput.blockers.map((blocker) => blocker.id), [
  "p8_external_veterinary_approval_missing",
  "p8_reviewer_decisions_missing",
  "p8_activation_manifest_missing",
  "p8_player_facing_dialogue_runtime_forbidden",
  "p8_upstream_catalogs_review_only",
  "p8_operational_semantics_not_audited",
  "p8_unmapped_research_tasks",
]);

assert.equal(Object.isFrozen(reviewInput), true);
assert.equal(Object.isFrozen(reviewInput.registration), true);
assert.equal(Object.isFrozen(reviewInput.sourceIntegrity), true);
assert.equal(Object.isFrozen(reviewInput.audit), true);
assert.equal(Object.isFrozen(reviewInput.audit.reviewRecords), true);
assert.equal(Object.isFrozen(reviewInput.audit.nonAuthoritativeArtifacts), true);
assert.equal(Object.isFrozen(reviewInput.blockers), true);
assert.throws(() => {
  reviewInput.registration.allowRuntimeActivation = true;
}, TypeError);

assert.deepEqual(evaluateP8SourceCleanGate({ P0: 0, P1: 0 }), reviewInput.audit.cleanGate);
assert.equal(evaluateP8SourceCleanGate({ P0: 0, P1: 1 }).passed, false, "P1-only defects must fail closed");
assert.equal(evaluateP8SourceCleanGate({ P0: 1, P1: 0 }).passed, false, "P0-only defects must fail closed");
assert.throws(() => evaluateP8SourceCleanGate({ P0: 0, P1: -1 }), /non-negative safe integer/);

await assert.rejects(loadP8V2AuthoringReviewInput(projectRoot), /explicit review context is required/);
for (const context of ["production", "runtime"]) {
  await assert.rejects(
    loadP8V2AuthoringReviewInput(projectRoot, { context }),
    new RegExp(`${context} context is forbidden`),
  );
}
await assert.rejects(
  loadP8V2AuthoringReviewInput(projectRoot, {
    context: "review",
    reviewInputVersion: "2026.07.16.1",
  }),
  /unexpected requested reviewInputVersion/,
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
  assert.throws(() => validateP8V2ReviewInputRegistration(tampered), new RegExp(field));
}
const wrongMedicalVersion = clone(registration);
wrongMedicalVersion.medicalReviewInput.reviewInputVersion = "2026.07.16.39";
assert.throws(() => validateP8V2ReviewInputRegistration(wrongMedicalVersion), /medical review input identity mismatch/);
const wrongOperationalVersion = clone(registration);
wrongOperationalVersion.operationalReviewInput.reviewInputVersion = "2026.07.16.2";
assert.throws(() => validateP8V2ReviewInputRegistration(wrongOperationalVersion), /operational review input identity mismatch/);
for (const [field, message] of [
  ["archiveSha256", /P8 v2 archive digest mismatch/],
  ["aggregateSha256", /P8 v2 aggregate digest mismatch/],
  ["provenanceSha256", /P8 v2 provenance digest mismatch/],
]) {
  const tampered = clone(registration);
  tampered.sourceIntegrity[field] = "0".repeat(64);
  assert.throws(() => validateP8V2ReviewInputRegistration(tampered), message);
}

const tamperedRegistry = clone(registry);
tamperedRegistry.reviewInputs.find((entry) => (
  entry.reviewInputId === P8_REVIEW_INPUT_V2_ID
    && entry.reviewInputVersion === P8_REVIEW_INPUT_V2_VERSION
)).sourceIntegrity.aggregateSha256 = "0".repeat(64);
await assert.rejects(
  loadP8V2AuthoringReviewInputFromReader(reader, tamperedRegistry, { context: "review" }),
  /P8 v2 aggregate digest mismatch/,
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
  loadP8V2AuthoringReviewInputFromReader(byteTamperedReader, registry, { context: "review" }),
  /byte length mismatch for README\.md/,
);
const missingFileReader = wrapReader(reader, {
  async listFiles(requestedRoot) {
    const files = await reader.listFiles(requestedRoot);
    return requestedRoot === sourceRoot ? files.filter((file) => file !== "README.md") : files;
  },
});
await assert.rejects(
  loadP8V2AuthoringReviewInputFromReader(missingFileReader, registry, { context: "review" }),
  /source file set differs from provenance/,
);
const hostTemplateTamperedReader = wrapReader(reader, {
  async readBytes(requestedPath) {
    const bytes = await reader.readBytes(requestedPath);
    return requestedPath === registration.reviewerDecisionContract.hostTemplatePath
      ? Buffer.concat([bytes, Buffer.from("\n")])
      : bytes;
  },
});
await assert.rejects(
  loadP8V2AuthoringReviewInputFromReader(hostTemplateTamperedReader, registry, { context: "review" }),
  /host reviewer template SHA-256 mismatch/,
);

assert.throws(
  () => validateP8ReviewerDecisionSet(reviewInput.reviewerDecisionTemplate, reviewInput),
  /reviewer decision template cannot be imported/,
);
const firstFamily = reviewInput.audit.reviewRecords.find((record) => record.recordType === "family");
const decision = makeDecisionSet(firstFamily, reviewInput);
assert.throws(
  () => validateP8ReviewerDecisionSet(decision, reviewInput),
  /without external veterinary approval/,
);
const wrongPackageVersion = clone(decision);
wrongPackageVersion.reviewPackage.packageVersion = "2026.07.16.1";
assert.throws(() => validateP8ReviewerDecisionSet(wrongPackageVersion, reviewInput), /P8 packageVersion mismatch/);
const wrongMedicalDecisionVersion = clone(decision);
wrongMedicalDecisionVersion.inputPackage.packageVersion = "2026.07.16.39";
assert.throws(() => validateP8ReviewerDecisionSet(wrongMedicalDecisionVersion, reviewInput), /decision packageVersion mismatch/);
const implicitChildApproval = clone(decision);
implicitChildApproval.decisions[0].variantId = "implicit-child";
assert.throws(
  () => validateP8ReviewerDecisionSet(implicitChildApproval, reviewInput),
  /family decision may not imply variant or presentation scope/,
);
const duplicateDecision = clone(decision);
duplicateDecision.decisions.push(clone(duplicateDecision.decisions[0]));
assert.throws(() => validateP8ReviewerDecisionSet(duplicateDecision, reviewInput), /record keys contain duplicates/);
const openReviewInput = clone(reviewInput);
openReviewInput.externalVeterinaryApproval = true;
openReviewInput.registration.allowReviewerDecisionImport = true;
const acceptedEnvelope = validateP8ReviewerDecisionSet(decision, openReviewInput);
assert.equal(acceptedEnvelope.decisionSetId, decision.decisionSetId);
assert.equal(acceptedEnvelope.exactRecordKeys.length, 1);

const changesRequiredWithoutMatchingDomain = clone(decision);
changesRequiredWithoutMatchingDomain.decisions[0].decision = "changes_required";
changesRequiredWithoutMatchingDomain.decisions[0].issueIds = ["medical-issue-001"];
assert.throws(
  () => validateP8ReviewerDecisionSet(changesRequiredWithoutMatchingDomain, openReviewInput),
  /changes_required record .* must have at least one matching decision domain/,
);
const changesRequiredWithoutIssue = clone(changesRequiredWithoutMatchingDomain);
changesRequiredWithoutIssue.decisions[0].decisionDomains.clinicalTruth = "changes_required";
changesRequiredWithoutIssue.decisions[0].issueIds = [];
assert.throws(
  () => validateP8ReviewerDecisionSet(changesRequiredWithoutIssue, openReviewInput),
  /changes_required record .* must reference at least one issue ID/,
);
for (const decisionValue of ["rejected", "not_reviewed"]) {
  const inconsistentRollup = clone(decision);
  inconsistentRollup.decisions[0].decision = decisionValue;
  assert.throws(
    () => validateP8ReviewerDecisionSet(inconsistentRollup, openReviewInput),
    new RegExp(`${decisionValue} record .* must have at least one matching decision domain`),
  );
}

console.log(JSON.stringify({
  status: "passed",
  reviewInput: `${P8_REVIEW_INPUT_V2_ID}@${P8_REVIEW_INPUT_V2_VERSION}`,
  dependencies: {
    medical: reviewInput.medicalReviewInputIdentity.reviewInputVersion,
    operational: reviewInput.operationalReviewInputIdentity.reviewInputVersion,
  },
  sourceFilesVerified: reviewInput.sourceIntegrity.sourceFiles,
  sourceBytesVerified: reviewInput.sourceIntegrity.sourceBytes,
  p0: reviewInput.audit.counts.p0,
  p1: reviewInput.audit.counts.p1,
  productionPool: reviewInput.productionPool.length,
  currentCaseCrosswalkMatches: reviewInput.audit.counts.baselineCrosswalkMatches,
  reviewerDecisionImport: "fail_closed",
  hostReviewerDecisionEnvelope: "verified_and_structurally_importable_when_external_gates_open",
  staleAuditAuthority: "rejected",
  blockerIds: reviewInput.blockers.map((blocker) => blocker.id),
}, null, 2));

function makeDecisionSet(record, input) {
  const decisionSet = clone(input.reviewerDecisionHostTemplate);
  decisionSet.decisionSetId = "external-review-v2-001";
  decisionSet.reviewer = {
      reviewerId: "reviewer-v2-001",
      fullName: "External Veterinary Reviewer",
      qualification: "veterinarian",
      jurisdiction: "external",
      conflictOfInterestDeclared: true,
  };
  decisionSet.reviewedAt = "2026-07-16T12:00:00.000Z";
  decisionSet.decisions = [{
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
      comment: "Exact record reviewed for contract validation only.",
      reviewerSignature: "external-signature-placeholder-for-contract-test",
  }];
  return decisionSet;
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
