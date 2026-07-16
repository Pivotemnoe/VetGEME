import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { OPERATIONAL_REVIEW_INPUT_VERSION as DEFAULT_OPERATIONAL_VERSION } from "./lib/operational-authoring-review-input.mjs";
import {
  OPERATIONAL_REVIEW_INPUT_V3_ID,
  OPERATIONAL_REVIEW_INPUT_V3_VERSION,
  findForbiddenOperationalV3AuthorityKeys,
  loadOperationalAuthoringReviewInputV3,
  loadOperationalAuthoringReviewInputV3FromReader,
  validateOperationalReviewInputV3Registration,
  validateOperationalV3SafeRouteProviderTarget,
} from "./lib/operational-authoring-review-input-v3.mjs";
import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
} from "./lib/medical-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reader = createFileSystemReviewInputReader(projectRoot);
const registry = await readJson(REVIEW_INPUT_REGISTRY_PATH);
const registration = registry.reviewInputs.find((entry) => (
  entry.reviewInputId === OPERATIONAL_REVIEW_INPUT_V3_ID
    && entry.reviewInputVersion === OPERATIONAL_REVIEW_INPUT_V3_VERSION
));
assert.ok(registration, "operational .3 review input registration is missing");
assert.equal(DEFAULT_OPERATIONAL_VERSION, "2026.07.16.1", "default operational loader must remain on .1");

const reviewInput = await loadOperationalAuthoringReviewInputV3(projectRoot, { context: "review" });
assert.equal(reviewInput.loadContext, "review");
assert.equal(reviewInput.reviewOnly, true);
assert.equal(reviewInput.productionEligible, false);
assert.equal(reviewInput.runtimeEligible, false);
assert.equal(reviewInput.generatorEligible, false);
assert.equal(reviewInput.productionPool.length, 0);
assert.equal(reviewInput.sourceIntegrity.sourceFiles, 40);
assert.equal(reviewInput.sourceIntegrity.sourceBytes, 12860948);
assert.equal(reviewInput.sourceIntegrity.keyFilesVerified, 15);
assert.equal(reviewInput.audit.counts.families, 39);
assert.equal(reviewInput.audit.counts.variants, 215);
assert.equal(reviewInput.audit.counts.presentations, 645);
assert.equal(reviewInput.audit.counts.capabilities, 447);
assert.equal(reviewInput.audit.counts.baselineCases, 30);
assert.equal(reviewInput.audit.counts.baselineCrosswalkMatches, 0);
assert.deepEqual(reviewInput.registration.authorSourceSupersession, {
  supersedesReviewInputVersion: "2026.07.16.2",
  scopes: ["p3", "p4", "p7"],
  priorVersionPreserved: true,
  p5P6ReservationAuthorityJoined: false,
});
assert.deepEqual(reviewInput.blockers.map((blocker) => blocker.id), [
  "activation_requirements_unsatisfied",
  "p3_medical_result_authority_projection_drift",
  "p5_execution_join_unresolved",
]);
assert.equal(reviewInput.blockers.every((blocker) => blocker.status === "unresolved"), true);

assert.deepEqual(reviewInput.audit.counts.p3, {
  researchIds: 361,
  localRoutes: 230,
  externalRoutes: 131,
  investigationUsages: 1864,
  providers: 6,
  medicalResultAuthorityMismatches: 361,
  exactUrgencySourceValues: 206,
  exactClassificationSourceValues: 875,
  fixedUrgencyUsages: 1862,
  dynamicUrgencyUsages: 2,
  usageLevelTurnaroundContracts: 1864,
  multiPolicyResearchIds: 46,
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
assert.equal(reviewInput.audit.counts.p4.presentationHandlingBindings, 514);
assert.equal(reviewInput.audit.counts.p4.scopedMedicalFactReferences, 950);
assert.equal(reviewInput.audit.counts.p4.genericSyntheticFactReferences, 0);
assert.equal(reviewInput.audit.counts.p6.resources, 49);
assert.equal(reviewInput.audit.counts.p6.canonicalCapabilities, 447);
assert.equal(reviewInput.audit.counts.p6.supplementalCapabilities, 8);
assert.equal(reviewInput.audit.counts.p6.reservationAuthority, false);
assert.equal(reviewInput.audit.counts.p6.exactRequirementGroupJoinComplete, false);
assert.equal(reviewInput.audit.counts.p7.evidenceResolvers, 93);
assert.equal(
  reviewInput.audit.counts.p7.resolverDigest,
  "e5c756a3ccc158e509caa2a7e76654981b0ce7cb3f4951fa30c4eeec07123558",
);
assert.equal(
  reviewInput.audit.counts.p7.activationDigest,
  "a588b27bbcffb6e44dc01e135dac2f0aff926124d66b8008578960ef6b25e371",
);
assert.equal(reviewInput.audit.validationEvidence.authorChecks, 62);
assert.equal(reviewInput.audit.validationEvidence.simulatedCampaigns, 10000);
assert.equal(reviewInput.audit.validationEvidence.simulatedDemandDays, 297717);
assert.equal(Object.isFrozen(reviewInput), true);
assert.equal(Object.isFrozen(reviewInput.audit), true);
assert.equal(Object.isFrozen(reviewInput.blockers), true);
assert.equal(Object.isFrozen(reviewInput.documents), true);

assert.deepEqual(
  findForbiddenOperationalV3AuthorityKeys({
    include: "approximate",
    nested: { includes: true, defaultProviderId: "external" },
  }, "fixture"),
  ["fixture.include", "fixture.nested.includes", "fixture.nested.defaultProviderId"],
  "host validator must reject include/includes/default authority keys just like the adapter",
);
assert.doesNotThrow(() => validateOperationalV3SafeRouteProviderTarget({ providerResolver: "resolver-v1" }, "resolver route"));
assert.doesNotThrow(() => validateOperationalV3SafeRouteProviderTarget({ providerId: "provider-v1" }, "fixed route"));
assert.throws(
  () => validateOperationalV3SafeRouteProviderTarget({}, "missing route"),
  /exactly one providerResolver or providerId is required/,
);
assert.throws(
  () => validateOperationalV3SafeRouteProviderTarget({
    providerResolver: "resolver-v1",
    providerId: "provider-v1",
  }, "ambiguous route"),
  /exactly one providerResolver or providerId is required/,
);

await assert.rejects(
  loadOperationalAuthoringReviewInputV3FromReader(reader, registry),
  /explicit review context is required/,
);
await assert.rejects(
  loadOperationalAuthoringReviewInputV3FromReader(reader, registry, { context: "production" }),
  /context production is forbidden/,
);
await assert.rejects(
  loadOperationalAuthoringReviewInputV3FromReader(reader, registry, {
    context: "review",
    reviewInputVersion: "2026.07.16.2",
  }),
  /v3 loader refuses non-\.3 operational input/,
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
  assert.throws(() => validateOperationalReviewInputV3Registration(tampered), expectedError);
}
const wrongSupersession = clone(registration);
wrongSupersession.authorSourceSupersession.scopes.push("p5");
assert.throws(() => validateOperationalReviewInputV3Registration(wrongSupersession), /supersession scope mismatch/);
const wrongMedical = clone(registration);
wrongMedical.medicalReviewInput.reviewInputVersion = "2026.07.16.39";
assert.throws(() => validateOperationalReviewInputV3Registration(wrongMedical), /medical dependency must pin review input \.40/);
const wrongP5 = clone(registration);
wrongP5.p5ReviewInput.sourceIntegrity.archiveSha256 = "0".repeat(64);
assert.throws(() => validateOperationalReviewInputV3Registration(wrongP5), /P5 \.2 archive digest mismatch/);
const wrongCapability = clone(registration);
wrongCapability.capabilityRegistry.sha256 = "0".repeat(64);
assert.throws(() => validateOperationalReviewInputV3Registration(wrongCapability), /capability registry digest mismatch/);

const sourceRoot = `${registration.root}/${registration.sourceRoot}`;
const provenancePath = `${registration.root}/${registration.provenancePath}`;
const provenance = await readJson(provenancePath);
const readmePath = `${sourceRoot}/README.md`;
const originalReadme = await reader.readBytes(readmePath);
const tamperedReadme = Buffer.concat([originalReadme, Buffer.from("tampered\n", "utf8")]);
const byteTamperedReader = wrapReader(reader, {
  async readBytes(requestedPath) {
    return requestedPath === readmePath ? tamperedReadme : reader.readBytes(requestedPath);
  },
});
await assert.rejects(
  loadOperationalAuthoringReviewInputV3FromReader(byteTamperedReader, registry, { context: "review" }),
  /byte length mismatch for README\.md/,
);

const coTamperedRegistry = clone(registry);
const coTamperedProvenance = clone(provenance);
const coTamperedReadme = Buffer.from(originalReadme);
coTamperedReadme[0] = coTamperedReadme[0] === 0x23 ? 0x20 : 0x23;
const coTamperedReadmeEntry = coTamperedProvenance.files.find((entry) => entry.path === "README.md");
coTamperedReadmeEntry.sha256 = sha256(coTamperedReadme);
const aggregate = createHash("sha256");
for (const file of coTamperedProvenance.files) {
  aggregate.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`, "utf8");
}
coTamperedProvenance.aggregateSha256 = aggregate.digest("hex");
const coTamperedProvenanceBytes = Buffer.from(`${JSON.stringify(coTamperedProvenance, null, 2)}\n`, "utf8");
const coTamperedRegistration = coTamperedRegistry.reviewInputs.find((entry) => (
  entry.reviewInputId === OPERATIONAL_REVIEW_INPUT_V3_ID
    && entry.reviewInputVersion === OPERATIONAL_REVIEW_INPUT_V3_VERSION
));
coTamperedRegistration.sourceIntegrity.aggregateSha256 = coTamperedProvenance.aggregateSha256;
coTamperedRegistration.sourceIntegrity.provenanceSha256 = sha256(coTamperedProvenanceBytes);
const coTamperedReader = wrapReader(reader, {
  async readBytes(requestedPath) {
    if (requestedPath === readmePath) return coTamperedReadme;
    if (requestedPath === provenancePath) return coTamperedProvenanceBytes;
    return reader.readBytes(requestedPath);
  },
});
await assert.rejects(
  loadOperationalAuthoringReviewInputV3FromReader(coTamperedReader, coTamperedRegistry, { context: "review" }),
  /operational \.3 (provenance|aggregate) digest mismatch/,
  "joint registry/provenance/source tamper must not rebase immutable operational .3",
);

const v2Registration = registry.reviewInputs.find((entry) => (
  entry.reviewInputId === OPERATIONAL_REVIEW_INPUT_V3_ID
    && entry.reviewInputVersion === "2026.07.16.2"
));
assert.deepEqual(v2Registration.sourceIntegrity, {
  provenanceSha256: "1134ba0ee80a6967b63764ff6e1466b5f5b97b3822bb36f577b391c3d65c6dbd",
  aggregateSha256: "3a92755e321cb3151921f0d8f12b4f52ce3ea2fef136d15ba1014fce141bbd62",
  archiveSha256: "0f271166547eb9dfa08f5bc195d6e5dba123f267353d2f09fbe7786b9bfb46f3",
});
assert.equal(
  sha256(await reader.readBytes("content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.2/provenance.json")),
  "1134ba0ee80a6967b63764ff6e1466b5f5b97b3822bb36f577b391c3d65c6dbd",
  "immutable operational .2 provenance changed",
);
assert.equal(
  sha256(await reader.readBytes("reports/OPERATIONAL_AUTHORING_2026.07.16.2_MISMATCHES.json")),
  "85abd22977eec072dc756f9f7f15cb652909ff131fd3bca8425c3ab54c018b76",
  "immutable operational .2 mismatch report changed",
);

console.log(JSON.stringify({
  status: "passed",
  reviewInput: `${registration.reviewInputId}@${registration.reviewInputVersion}`,
  sourceFiles: reviewInput.sourceIntegrity.sourceFiles,
  sourceBytes: reviewInput.sourceIntegrity.sourceBytes,
  blockers: reviewInput.blockers.map((blocker) => blocker.id),
  priorVersionPreserved: true,
  productionPool: reviewInput.productionPool.length,
}, null, 2));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(relativePath) {
  return JSON.parse((await reader.readBytes(relativePath)).toString("utf8"));
}

function wrapReader(base, overrides) {
  return {
    readBytes: overrides.readBytes || ((requestedPath) => base.readBytes(requestedPath)),
    listFiles: overrides.listFiles || ((requestedPath) => base.listFiles(requestedPath)),
  };
}
