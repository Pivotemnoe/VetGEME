import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { P5_REVIEW_INPUT_VERSION as DEFAULT_P5_VERSION } from "./lib/p5-authoring-review-input.mjs";
import {
  P5_REVIEW_INPUT_V2_ID,
  P5_REVIEW_INPUT_V2_VERSION,
  loadP5AuthoringReviewInputV2,
  loadP5AuthoringReviewInputV2FromReader,
  validateP5ReviewInputV2Registration,
} from "./lib/p5-authoring-review-input-v2.mjs";
import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
} from "./lib/medical-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reader = createFileSystemReviewInputReader(projectRoot);
const registry = JSON.parse(Buffer.from(await reader.readBytes(REVIEW_INPUT_REGISTRY_PATH)).toString("utf8"));
const registration = registry.reviewInputs.find((entry) => (
  entry.reviewInputId === P5_REVIEW_INPUT_V2_ID
    && entry.reviewInputVersion === P5_REVIEW_INPUT_V2_VERSION
));
const v1Registration = registry.reviewInputs.find((entry) => (
  entry.reviewInputId === P5_REVIEW_INPUT_V2_ID && entry.reviewInputVersion === "2026.07.16.1"
));

assert.ok(registration, "P5 .2 review input registration is missing");
assert.ok(v1Registration, "P5 .1 review input registration must be preserved");
assert.equal(DEFAULT_P5_VERSION, "2026.07.16.1", "default P5 loader must remain pinned to .1");
assert.equal(v1Registration.root, "content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.1");
assert.equal(v1Registration.sourceIntegrity.aggregateSha256, "28184d5a34a82ed1694f44b44842b2bc519a09e6e576206603dfc0d3a0427a1f");

const reviewInput = await loadP5AuthoringReviewInputV2(projectRoot, { context: "review" });
assert.equal(reviewInput.loadContext, "review");
assert.equal(reviewInput.reviewOnly, true);
assert.equal(reviewInput.productionEligible, false);
assert.equal(reviewInput.runtimeEligible, false);
assert.equal(reviewInput.allowCurrentCaseCrosswalk, false);
assert.equal(reviewInput.allowRuntimeActivation, false);
assert.equal(reviewInput.productionPool.length, 0);
assert.deepEqual(reviewInput.registration.authorSourceSupersession, {
  supersedesReviewInputVersion: "2026.07.16.1",
  priorVersionPreserved: true,
});
assert.equal(reviewInput.sourceIntegrity.sourceFiles, 23);
assert.equal(reviewInput.sourceIntegrity.sourceBytes, 4007080);
assert.equal(reviewInput.sourceIntegrity.keyFilesVerified, 11);
assert.equal(reviewInput.sourceIntegrity.provenanceSha256, "f5f54786a0a670d3c9fa1fc8c27b003dc76b2593772b61c21a07523121b829e5");
assert.equal(reviewInput.sourceIntegrity.aggregateSha256, "db30b1feacd01fdab2cd6d750b59892c250d4e15eab01d1cd363c49b64dc6ad3");
assert.equal(reviewInput.sourceIntegrity.archiveSha256, "665183acc97096477dd9366b8116a65a11862e4919d02170278f8e97e241a7ab");
assert.deepEqual(reviewInput.audit.counts, {
  sourceFiles: 23,
  sourceBytes: 4007080,
  productionPool: 0,
  staff: 10,
  rooms: 12,
  equipmentResources: 27,
  totalResources: 49,
  visitTaskTemplates: 14,
  capabilitiesMapped: 447,
  supplementalCapabilitiesMapped: 8,
  researchTasks: 361,
  investigationUsagesMapped: 1864,
  scheduleDays: 30,
  staffSkillsCovered: 24,
  runtimeTaskConfigurations: 2606,
  lifecycleCommands: 13,
  roomAssets: 12,
  startingInventoryCategories: 10,
  startingEquipmentEvidence: 2,
  startsActivePhysical: 7,
  startsActiveStaff: 0,
  hiredUnscheduledDoctors: 2,
  baselineCases: 30,
  baselineCrosswalkMatches: 0,
});
assert.deepEqual(reviewInput.audit.activePhysicalResourceIds, [
  "equipment.microscope",
  "equipment.otoscope",
  "room.consult.1",
  "room.lab.basic",
  "room.reception.1",
  "room.storage.1",
  "room.waiting.1",
]);
assert.deepEqual(reviewInput.audit.hiredUnscheduledDoctorIds, [
  "staff.doctor.morozov",
  "staff.doctor.sokolova",
]);
assert.deepEqual(reviewInput.medicalAuthorityBoundary, {
  p5ResearchSentinel: "medical_family_presentation_investigation_result",
  p5SentinelIsMedicalAuthority: false,
  operationalMedicalAuthority: "medical_family.presentation.investigations[].result_only",
  operationalPolicyMayGenerateResult: false,
  normalizationAllowed: false,
  exactResearchRecordsCompared: 361,
});
assert.notEqual(
  reviewInput.medicalAuthorityBoundary.p5ResearchSentinel,
  reviewInput.medicalAuthorityBoundary.operationalMedicalAuthority,
  "P5 sentinel must never be normalized into operational medical authority",
);
assert.equal(reviewInput.operationalReviewInputIdentity.reviewInputVersion, "2026.07.16.4");
assert.equal(reviewInput.operationalReviewInputIdentity.runtimeEligible, false);
assert.equal(reviewInput.capabilityRegistryIdentity.canonicalCapabilities, 447);
assert.deepEqual(reviewInput.blockers.map((blocker) => blocker.id), [
  "activation_requirements_unsatisfied",
  "product_owner_staffing_acceptance_pending",
]);
assert.equal(reviewInput.blockers.every((blocker) => blocker.status === "unresolved"), true);
for (const path of [
  "source/p5-exact-capability-resource-map.json",
  "source/p5-resource-lifecycle.json",
  "source/p5-handoff-contract.json",
  "generated/resource-catalog.json",
  "generated/research-task-catalog.json",
  "reports/VALIDATION_REPORT.json",
]) assert.ok(reviewInput.documents[path], `${path} must be exposed for the later adapter`);
assert.equal(Object.isFrozen(reviewInput), true);
assert.equal(Object.isFrozen(reviewInput.documents), true);
assert.equal(Object.isFrozen(reviewInput.audit), true);
assert.equal(Object.isFrozen(reviewInput.blockers), true);

await assert.rejects(
  loadP5AuthoringReviewInputV2FromReader(reader, registry),
  /explicit review context is required/,
);
await assert.rejects(
  loadP5AuthoringReviewInputV2FromReader(reader, registry, { context: "production" }),
  /context production is forbidden/,
);
await assert.rejects(
  loadP5AuthoringReviewInputV2FromReader(reader, registry, {
    context: "review",
    reviewInputVersion: "2026.07.16.1",
  }),
  /v2 loader refuses non-\.2 P5 input/,
);

for (const [field, expectedError] of [
  ["productionEligible", /productionEligible must be false/],
  ["runtimeEligible", /runtimeEligible must be false/],
  ["allowCurrentCaseCrosswalk", /allowCurrentCaseCrosswalk must be false/],
  ["allowRuntimeActivation", /allowRuntimeActivation must be false/],
  ["allowAutomaticP6Crosswalk", /allowAutomaticP6Crosswalk must be false/],
  ["allowMedicalAuthorityNormalization", /medical authority normalization must be forbidden/],
]) {
  const tampered = clone(registration);
  tampered[field] = true;
  assert.throws(() => validateP5ReviewInputV2Registration(tampered), expectedError);
}

const wrongArchive = clone(registration);
wrongArchive.sourceIntegrity.archiveSha256 = "0".repeat(64);
assert.throws(() => validateP5ReviewInputV2Registration(wrongArchive), /archive digest mismatch/);
const wrongManifest = clone(registration);
wrongManifest.sourceIntegrity.manifestSha256 = "0".repeat(64);
assert.throws(() => validateP5ReviewInputV2Registration(wrongManifest), /manifest digest mismatch/);
const wrongOperational = clone(registration);
wrongOperational.operationalReviewInput.reviewInputVersion = "2026.07.16.3";
assert.throws(() => validateP5ReviewInputV2Registration(wrongOperational), /operational \.4 dependency identity mismatch/);
const wrongOperationalSource = clone(registration);
wrongOperationalSource.operationalReviewInput.catalogSha256.p3Research = "0".repeat(64);
assert.throws(() => validateP5ReviewInputV2Registration(wrongOperationalSource), /operational \.4 p3Research digest mismatch/);
const wrongSupersession = clone(registration);
wrongSupersession.authorSourceSupersession.priorVersionPreserved = false;
assert.throws(() => validateP5ReviewInputV2Registration(wrongSupersession), /supersession contract mismatch/);

const researchPath = `${registration.root}/${registration.sourceRoot}/generated/research-task-catalog.json`;
const tamperedReader = {
  listFiles: (relativePath) => reader.listFiles(relativePath),
  async readBytes(relativePath) {
    const bytes = await reader.readBytes(relativePath);
    if (relativePath !== researchPath) return bytes;
    const document = JSON.parse(Buffer.from(bytes).toString("utf8"));
    document.researchTasks[0].medicalResultAuthority =
      "medical_family.presentation.investigations[].result_only";
    return Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8");
  },
};
await assert.rejects(
  loadP5AuthoringReviewInputV2FromReader(tamperedReader, registry, { context: "review" }),
  /(?:byte length|SHA-256) mismatch for generated\/research-task-catalog\.json/,
  "immutable provenance must reject attempts to normalize the P5 sentinel",
);

console.log("P5 .2 review-input contract tests passed");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
