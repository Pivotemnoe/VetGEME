import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { OPERATIONAL_REVIEW_INPUT_VERSION as DEFAULT_OPERATIONAL_VERSION } from "./lib/operational-authoring-review-input.mjs";
import {
  BASELINE_MANIFEST_PATH,
  OPERATIONAL_REVIEW_INPUT_V2_ID,
  OPERATIONAL_REVIEW_INPUT_V2_VERSION,
  loadOperationalAuthoringReviewInputV2,
  loadOperationalAuthoringReviewInputV2FromReader,
  validateOperationalAuthoringPackageV2,
  validateOperationalReviewInputV2Registration,
} from "./lib/operational-authoring-review-input-v2.mjs";
import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
  loadMedicalAuthoringReviewInputFromReader,
} from "./lib/medical-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reader = createFileSystemReviewInputReader(projectRoot);
const registry = await readJson(REVIEW_INPUT_REGISTRY_PATH);
const registration = registry.reviewInputs.find((entry) => (
  entry.reviewInputId === OPERATIONAL_REVIEW_INPUT_V2_ID
    && entry.reviewInputVersion === OPERATIONAL_REVIEW_INPUT_V2_VERSION
));
assert.ok(registration, "operational .2 review input registration is missing");
assert.equal(DEFAULT_OPERATIONAL_VERSION, "2026.07.16.1", "default operational loader must remain on .1");

const reviewInput = await loadOperationalAuthoringReviewInputV2(projectRoot, { context: "review" });
const sourceRoot = `${registration.root}/${registration.sourceRoot}`;
const sourceFiles = await reader.listFiles(sourceRoot);
const sourceBytesByPath = new Map(await Promise.all(sourceFiles.map(async (relativePath) => [
  relativePath,
  await reader.readBytes(`${sourceRoot}/${relativePath}`),
])));
const capabilityBytes = await reader.readBytes(registration.capabilityRegistry.path);
const capabilityRegistry = JSON.parse(capabilityBytes.toString("utf8"));
const baselineManifest = await readJson(BASELINE_MANIFEST_PATH);
const medicalReviewInput = await loadMedicalAuthoringReviewInputFromReader(reader, registry, {
  context: "review",
  reviewInputVersion: "2026.07.16.40",
});

assert.equal(reviewInput.loadContext, "review");
assert.equal(reviewInput.reviewOnly, true);
assert.equal(reviewInput.productionEligible, false);
assert.equal(reviewInput.runtimeEligible, false);
assert.equal(reviewInput.generatorEligible, false);
assert.equal(reviewInput.productionPool.length, 0);
assert.equal(reviewInput.sourceIntegrity.sourceFiles, 35);
assert.equal(reviewInput.sourceIntegrity.sourceBytes, 6305058);
assert.equal(reviewInput.sourceIntegrity.keyFilesVerified, 10);
assert.equal(reviewInput.audit.counts.families, 39);
assert.equal(reviewInput.audit.counts.variants, 215);
assert.equal(reviewInput.audit.counts.presentations, 645);
assert.equal(reviewInput.audit.counts.capabilities, 447);
assert.equal(reviewInput.audit.counts.baselineCases, 30);
assert.equal(reviewInput.audit.counts.baselineCrosswalkMatches, 0);

assert.deepEqual(reviewInput.audit.counts.p3, {
  researchIds: 361,
  localRoutes: 230,
  externalRoutes: 131,
  investigationUsages: 1864,
  providers: 6,
  medicalResultAuthorityMismatches: 361,
  unmatchedUrgencyUsages: 2,
  unmatchedUrgencyValues: 2,
  unmatchedClassificationUsages: 49,
  unmatchedClassificationValues: 36,
  turnaroundMismatchResearchIds: 46,
  turnaroundMismatchUsages: 137,
  turnaroundMismatchPairs: 168,
  emergencyTurnaroundMismatchPairs: 57,
  localRoutesWithEmptyLifecyclePredicates: 222,
  lifecyclePredicates: 175,
  lifecyclePredicateCounts: {
    provider_route_available: 158,
    qualified_staff_scheduled: 6,
    stock_available: 1,
    owned: 3,
    delivery_complete: 3,
    maintenance_current: 3,
    ready_room_available: 1,
  },
});
assert.equal(reviewInput.audit.counts.p4.ownerModifierTags, 463);
assert.equal(reviewInput.audit.counts.p4.temperamentTags, 128);
assert.equal(reviewInput.audit.counts.p4.handlingAlternativeTags, 446);
assert.equal(reviewInput.audit.counts.p4.presentations, 645);
assert.equal(reviewInput.audit.counts.p4.safeAlternativeFactReferences, 541);
assert.equal(reviewInput.audit.counts.p4.uniqueSafeAlternativeFactIds, 446);
assert.equal(reviewInput.audit.counts.p4.boundMedicalFactIds, 0);
assert.equal(reviewInput.audit.counts.p6.resources, 49);
assert.equal(reviewInput.audit.counts.p6.canonicalCapabilities, 447);
assert.equal(reviewInput.audit.counts.p6.supplementalCapabilities, 8);
assert.equal(reviewInput.audit.counts.p6.startingInventory, 10);
assert.equal(reviewInput.audit.counts.p6.p5ArchivePinned, true);
assert.equal(reviewInput.audit.counts.p6.p5PackageDigestPinned, false);
assert.equal(reviewInput.audit.counts.p7.evidenceResolvers, 93);
assert.deepEqual(reviewInput.audit.counts.p7.evidenceResolverGroups, {
  goalEvidence: 10,
  eventTriggers: 25,
  eventEffects: 29,
  milestoneAndRecoveryRequirements: 15,
  specializationCapabilities: 6,
  endingPredicates: 8,
});
assert.equal(reviewInput.audit.counts.p7.envelopeContentSha256Verified, 42);
assert.equal(
  reviewInput.audit.counts.p7.authorCatalogDigest,
  "995378fea5529ff8babd7abb2af6c459f730591ae35e699ce39c1dbc38fef888",
);
assert.equal(reviewInput.audit.validationEvidence.authorChecks, 45);
assert.equal(reviewInput.audit.validationEvidence.simulatedCampaigns, 10000);
assert.equal(reviewInput.audit.validationEvidence.simulatedDemandDays, 297717);
assert.deepEqual(reviewInput.blockers.map((blocker) => blocker.id), [
  "activation_requirements_unsatisfied",
  "p3_unmatched_urgency_and_classification",
  "p3_urgency_specific_turnaround_ambiguity",
  "p3_medical_result_authority_projection_drift",
  "p4_operational_fact_binding_review_required",
  "p5_execution_join_unresolved",
  "p7_resolver_digest_and_activation_unresolved",
]);
assert.equal(reviewInput.blockers.every((blocker) => blocker.status === "unresolved"), true);
assert.equal(Object.isFrozen(reviewInput), true);
assert.equal(Object.isFrozen(reviewInput.audit), true);
assert.equal(Object.isFrozen(reviewInput.blockers), true);
assert.equal(Object.isFrozen(reviewInput.documents), true);

await assert.rejects(
  loadOperationalAuthoringReviewInputV2FromReader(reader, registry),
  /explicit review context is required/,
);
await assert.rejects(
  loadOperationalAuthoringReviewInputV2FromReader(reader, registry, { context: "production" }),
  /context production is forbidden/,
);
await assert.rejects(
  loadOperationalAuthoringReviewInputV2FromReader(reader, registry, {
    context: "review",
    reviewInputVersion: "2026.07.16.1",
  }),
  /v2 loader refuses non-\.2 operational input/,
);

for (const [field, expectedError] of [
  ["productionEligible", /productionEligible must be false/],
  ["runtimeEligible", /runtimeEligible must be false/],
  ["generatorEligible", /generatorEligible must be false/],
  ["allowCurrentCaseCrosswalk", /allowCurrentCaseCrosswalk must be false/],
  ["allowRuntimeActivation", /allowRuntimeActivation must be false/],
  ["allowActivationManifest", /allowActivationManifest must be false/],
]) {
  const tampered = clone(registration);
  tampered[field] = true;
  assert.throws(() => validateOperationalReviewInputV2Registration(tampered), expectedError);
}
const wrongMedical = clone(registration);
wrongMedical.medicalReviewInput.reviewInputVersion = "2026.07.16.39";
assert.throws(() => validateOperationalReviewInputV2Registration(wrongMedical), /medical dependency must pin review input \.40/);
const wrongP5 = clone(registration);
wrongP5.p5ReviewInput.sourceIntegrity.archiveSha256 = "0".repeat(64);
assert.throws(() => validateOperationalReviewInputV2Registration(wrongP5), /P5 \.2 archive digest mismatch/);
const wrongCapability = clone(registration);
wrongCapability.capabilityRegistry.sha256 = "0".repeat(64);
assert.throws(() => validateOperationalReviewInputV2Registration(wrongCapability), /capability registry digest mismatch/);

const tamperedDigestRegistry = clone(registry);
findRegistration(tamperedDigestRegistry).sourceIntegrity.aggregateSha256 = "0".repeat(64);
await assert.rejects(
  loadOperationalAuthoringReviewInputV2FromReader(reader, tamperedDigestRegistry, { context: "review" }),
  /aggregate digest mismatch/,
);
const readmePath = `${sourceRoot}/README.md`;
const coTamperedRegistry = clone(registry);
const coTamperedProvenance = await readJson(`${registration.root}/${registration.provenancePath}`);
const originalReadme = sourceBytesByPath.get("README.md");
const coTamperedReadme = Buffer.from(originalReadme);
coTamperedReadme[0] = coTamperedReadme[0] === 0x23 ? 0x20 : 0x23;
const coTamperedReadmeEntry = coTamperedProvenance.files.find((entry) => entry.path === "README.md");
coTamperedReadmeEntry.sha256 = sha256(coTamperedReadme);
const coTamperedAggregate = createHash("sha256");
for (const file of coTamperedProvenance.files) {
  coTamperedAggregate.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`, "utf8");
}
coTamperedProvenance.aggregateSha256 = coTamperedAggregate.digest("hex");
const coTamperedProvenanceBytes = Buffer.from(`${JSON.stringify(coTamperedProvenance, null, 2)}\n`, "utf8");
findRegistration(coTamperedRegistry).sourceIntegrity.aggregateSha256 = coTamperedProvenance.aggregateSha256;
findRegistration(coTamperedRegistry).sourceIntegrity.provenanceSha256 = sha256(coTamperedProvenanceBytes);
const coTamperedReader = wrapReader(reader, {
  async readBytes(requestedPath) {
    if (requestedPath === readmePath) return coTamperedReadme;
    if (requestedPath === `${registration.root}/${registration.provenancePath}`) {
      return coTamperedProvenanceBytes;
    }
    return reader.readBytes(requestedPath);
  },
});
await assert.rejects(
  loadOperationalAuthoringReviewInputV2FromReader(coTamperedReader, coTamperedRegistry, { context: "review" }),
  /operational \.2 (provenance|aggregate) digest mismatch/,
  "joint registry/provenance/source tamper must not rebase immutable operational .2",
);
const byteTamperedReader = wrapReader(reader, {
  async readBytes(requestedPath) {
    const bytes = await reader.readBytes(requestedPath);
    return requestedPath === readmePath
      ? Buffer.concat([bytes, Buffer.from("tampered\n", "utf8")])
      : bytes;
  },
});
await assert.rejects(
  loadOperationalAuthoringReviewInputV2FromReader(byteTamperedReader, registry, { context: "review" }),
  /byte length mismatch for README\.md/,
);
const missingFileReader = wrapReader(reader, {
  async listFiles(requestedRoot) {
    const files = await reader.listFiles(requestedRoot);
    return requestedRoot === sourceRoot ? files.filter((file) => file !== "README.md") : files;
  },
});
await assert.rejects(
  loadOperationalAuthoringReviewInputV2FromReader(missingFileReader, registry, { context: "review" }),
  /source file set differs from provenance/,
);

assertPackageReject("MANIFEST.json", (document) => {
  document.runtimeEligible = true;
}, /manifest runtimeEligible must remain false/);
assertPackageReject("source/p3-explicit-research-routes.json", (document) => {
  document.researchRoutes[0].requiredCapabilityIds = ["unknown_capability"];
}, /unknown required capability/);
assertPackageReject("source/p3-explicit-research-routes.json", (document) => {
  document.researchRoutes[0].matchTokens = ["unsafe"];
}, /token\/regex\/first-match runtime authority is forbidden/);
assertPackageReject("generated/p3/research-catalog.json", (document) => {
  document.research[0].requires = ["ear_cytology"];
}, /generated requirements differ from explicit authority/);
assertPackageReject("generated/p4/behavior-crosswalk.json", (document) => {
  delete document.handlingAlternatives[0].runtimeActionTemplate.safeAlternatives[0].payload.factOwner;
}, /runtime safe alternative payload differs from exact route/);
assertPackageReject("generated/p6/p3-p5-resource-crosswalk.json", (document) => {
  document.tokenMatchingAllowed = true;
}, /token matching must remain forbidden/);
assertPackageReject("source/p6-p5-exact-resource-crosswalk.json", (document) => {
  document.capabilities[0].p5ResourceIds.push("room.unknown.1");
}, /unknown resource IDs/);
assertPackageReject("generated/p7/director-catalog.json", (document) => {
  document.catalogEnvelopes.events[0].payload.window = [1, 2];
}, /events envelopes differ from exact source authority/);
assertPackageReject("generated/p7/director-catalog.json", (document) => {
  document.catalogDigest = "0".repeat(64);
}, /author catalogDigest mismatch/);
assertPackageReject("source/p7-campaign.json", (document) => {
  document.events[0].eventId = "mutated_event_id";
}, /events envelopes differ from exact source authority/);
assertPackageReject("source/p7-campaign.json", (document) => {
  document.goalTemplates[0].minimum += 1;
}, /generated goal differs from exact source template/);
const p7ActivationFixture = baseFixture();
const activatedResolver = clone(reviewInput.documents["source/p7-evidence-resolver.json"]);
const activatedDirector = clone(reviewInput.documents["generated/p7/director-catalog.json"]);
activatedResolver.activation.programmerAdapterValidated = true;
activatedDirector.evidenceResolver.activation.programmerAdapterValidated = true;
p7ActivationFixture.documents = {
  ...reviewInput.documents,
  "source/p7-evidence-resolver.json": activatedResolver,
  "generated/p7/director-catalog.json": activatedDirector,
};
assert.throws(
  () => validateOperationalAuthoringPackageV2(p7ActivationFixture),
  /programmer adapter must remain unvalidated/,
);

const baselineCrosswalkFixture = baseFixture();
const baselineCaseId = baselineManifest.cases[0].id;
baselineCrosswalkFixture.sourceBytesByPath = new Map(sourceBytesByPath);
baselineCrosswalkFixture.sourceBytesByPath.set(
  "README.md",
  Buffer.concat([sourceBytesByPath.get("README.md"), Buffer.from(`\n${baselineCaseId}\n`, "utf8")]),
);
assert.throws(
  () => validateOperationalAuthoringPackageV2(baselineCrosswalkFixture),
  /unapproved current 30-card crosswalk/,
);

console.log(JSON.stringify({
  status: "passed",
  defaultOperationalVersionPreserved: DEFAULT_OPERATIONAL_VERSION,
  v2ReviewOnlyLoadVerified: true,
  sourceFilesVerified: reviewInput.sourceIntegrity.sourceFiles,
  sourceBytesVerified: reviewInput.sourceIntegrity.sourceBytes,
  productionPool: reviewInput.productionPool.length,
  exactP3P4P6P7CountsVerified: true,
  negativeContextTamperAndActivationTestsPassed: true,
  unresolvedBlockersPreserved: reviewInput.blockers.map((blocker) => blocker.id),
}, null, 2));

function baseFixture() {
  return {
    registration: clone(registration),
    manifest: reviewInput.manifest,
    sourceFiles: [...sourceFiles],
    sourceBytesByPath,
    documents: reviewInput.documents,
    capabilityRegistry,
    capabilityBytes,
    baselineManifest,
    medicalReviewInput,
  };
}

function assertPackageReject(relativePath, mutate, expectedError) {
  const fixture = baseFixture();
  const changed = clone(reviewInput.documents[relativePath]);
  mutate(changed);
  fixture.documents = { ...reviewInput.documents, [relativePath]: changed };
  if (relativePath === "MANIFEST.json") fixture.manifest = changed;
  assert.throws(() => validateOperationalAuthoringPackageV2(fixture), expectedError);
}

async function readJson(relativePath) {
  return JSON.parse((await reader.readBytes(relativePath)).toString("utf8"));
}

function findRegistration(targetRegistry) {
  return targetRegistry.reviewInputs.find((entry) => (
    entry.reviewInputId === OPERATIONAL_REVIEW_INPUT_V2_ID
      && entry.reviewInputVersion === OPERATIONAL_REVIEW_INPUT_V2_VERSION
  ));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function wrapReader(base, overrides) {
  return {
    readBytes: overrides.readBytes || ((requestedPath) => base.readBytes(requestedPath)),
    listFiles: overrides.listFiles || ((requestedRoot) => base.listFiles(requestedRoot)),
  };
}
