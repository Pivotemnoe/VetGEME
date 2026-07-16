import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
  loadMedicalAuthoringReviewInput,
  loadMedicalAuthoringReviewInputFromReader,
  validateMedicalAuthoringPackage,
  validateReviewInputRegistration,
} from "./lib/medical-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reader = createFileSystemReviewInputReader(projectRoot);
const registry = await readJson(REVIEW_INPUT_REGISTRY_PATH);
const registration = registry.reviewInputs[0];
const sourceRoot = `${registration.root}/${registration.sourceRoot}`;
const sourceFiles = await reader.listFiles(sourceRoot);
const capabilityBytes = await reader.readBytes(registration.capabilityRegistry.path);
const capabilityRegistry = JSON.parse(capabilityBytes.toString("utf8"));
const reviewInput = await loadMedicalAuthoringReviewInput(projectRoot, { context: "review" });

const registryWithAnotherReviewKind = clone(registry);
registryWithAnotherReviewKind.reviewInputs.push({
  reviewInputId: "vetgeme-operational-production-authoring",
  reviewInputVersion: "2026.07.16.1",
  kind: "operational_authoring",
  root: "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.1",
  status: "blocked_pending_review",
  reviewOnly: true,
  productionEligible: false,
});
const reviewInputWithAnotherReviewKind = await loadMedicalAuthoringReviewInputFromReader(
  reader,
  registryWithAnotherReviewKind,
  { context: "review" },
);
assert.equal(reviewInputWithAnotherReviewKind.audit.families, 39);

assert.deepEqual(
  {
    families: reviewInput.audit.families,
    variants: reviewInput.audit.variants,
    presentations: reviewInput.audit.presentations,
    productionPool: reviewInput.productionPool.length,
  },
  { families: 39, variants: 215, presentations: 645, productionPool: 0 },
);
assert.equal(reviewInput.registration.veterinaryReviewStatus, "external_veterinary_review_pending");
assert.equal(reviewInput.productionEligible, false);
assert.equal(reviewInput.allowCrosswalk, false);
assert.equal(reviewInput.sourceIntegrity.sourceFilesVerified, 85);
assert.equal(reviewInput.audit.capabilityRegistryEntries, 447);
assert.equal(Object.isFrozen(reviewInput), true);
assert.equal(Object.isFrozen(reviewInput.families[0]), true);

await assert.rejects(
  loadMedicalAuthoringReviewInputFromReader(reader, registry),
  /explicit review context is required/,
);
await assert.rejects(
  loadMedicalAuthoringReviewInputFromReader(reader, registry, { context: "production" }),
  /context production is forbidden/,
);

const digestTamperedRegistry = clone(registry);
digestTamperedRegistry.reviewInputs[0].sourceIntegrity.aggregateSha256 = "0".repeat(64);
await assert.rejects(
  loadMedicalAuthoringReviewInputFromReader(reader, digestTamperedRegistry, { context: "review" }),
  /provenance aggregate digest mismatch/,
);

const readmePath = `${sourceRoot}/README.md`;
const byteTamperedReader = wrapReader(reader, {
  async readBytes(requestedPath) {
    const bytes = await reader.readBytes(requestedPath);
    if (requestedPath !== readmePath) return bytes;
    const tampered = Buffer.from(bytes);
    tampered[0] ^= 1;
    return tampered;
  },
});
await assert.rejects(
  loadMedicalAuthoringReviewInputFromReader(byteTamperedReader, registry, { context: "review" }),
  /SHA-256 mismatch for README\.md/,
);

const badStatus = clone(registration);
badStatus.status = "approved";
assert.throws(() => validateReviewInputRegistration(badStatus), /status must remain blocked_pending_external_veterinary_review/);
const badKind = clone(registration);
badKind.kind = "runtime_medical_catalog";
assert.throws(() => validateReviewInputRegistration(badKind), /review input kind must be medical_authoring/);
const badProductionEligibility = clone(registration);
badProductionEligibility.productionEligible = true;
assert.throws(() => validateReviewInputRegistration(badProductionEligibility), /productionEligible must be false/);
const badGeneratorEligibility = clone(registration);
badGeneratorEligibility.generatorEligible = true;
assert.throws(() => validateReviewInputRegistration(badGeneratorEligibility), /generatorEligible must be false/);
const badRegisteredPool = clone(registration);
badRegisteredPool.expectedCounts.productionPool = 1;
assert.throws(() => validateReviewInputRegistration(badRegisteredPool), /expected production pool must be 0/);
const badCrosswalkPolicy = clone(registration);
badCrosswalkPolicy.allowCrosswalk = true;
assert.throws(() => validateReviewInputRegistration(badCrosswalkPolicy), /allowCrosswalk must be false/);

const baseFixture = () => ({
  registration: clone(registration),
  manifest: clone(reviewInput.manifest),
  familiesByPath: new Map(reviewInput.manifest.families.map((entry, index) => [
    entry.path,
    clone(reviewInput.families[index]),
  ])),
  sourceFiles: [...sourceFiles],
  capabilityRegistry: clone(capabilityRegistry),
  capabilityBytes,
});

const veterinaryStatusFixture = baseFixture();
veterinaryStatusFixture.familiesByPath.get(reviewInput.manifest.families[0].path)
  .variants[0].presentations[0].review.veterinaryReviewStatus = "approved";
assert.throws(
  () => validateMedicalAuthoringPackage(veterinaryStatusFixture),
  /veterinary status must remain external_veterinary_review_pending/,
);

const eligibleVariantFixture = baseFixture();
eligibleVariantFixture.familiesByPath.get(reviewInput.manifest.families[0].path)
  .variants[0].generatorEligible = true;
assert.throws(
  () => validateMedicalAuthoringPackage(eligibleVariantFixture),
  /variant must remain generator-ineligible/,
);

const nonzeroPoolFixture = baseFixture();
nonzeroPoolFixture.manifest.productionPoolSize = 1;
assert.throws(
  () => validateMedicalAuthoringPackage(nonzeroPoolFixture),
  /production pool must remain 0/,
);

const unknownCapabilityFixture = baseFixture();
unknownCapabilityFixture.familiesByPath.get(reviewInput.manifest.families[0].path)
  .coreCapabilities[0] = "unknown_review_capability";
assert.throws(
  () => validateMedicalAuthoringPackage(unknownCapabilityFixture),
  /unknown capability unknown_review_capability/,
);

const crosswalkFixture = baseFixture();
crosswalkFixture.familiesByPath.get(reviewInput.manifest.families[0].path)
  .variants[0].presentations[0].caseId = "EAR_FUNGAL_OTITIS";
assert.throws(
  () => validateMedicalAuthoringPackage(crosswalkFixture),
  /forbidden crosswalk field/,
);

const crosswalkFileFixture = baseFixture();
crosswalkFileFixture.sourceFiles.push("compatibility/tier-01-v2-crosswalk.json");
assert.throws(
  () => validateMedicalAuthoringPackage(crosswalkFileFixture),
  /crosswalk artifact is forbidden/,
);

const wrongCountFixture = baseFixture();
wrongCountFixture.manifest.familyTargetCount = 38;
assert.throws(
  () => validateMedicalAuthoringPackage(wrongCountFixture),
  /family target mismatch/,
);

const unsafePathFixture = baseFixture();
unsafePathFixture.manifest.families[0].path = "../family.production.json";
assert.throws(
  () => validateMedicalAuthoringPackage(unsafePathFixture),
  /must be a safe relative path/,
);

const missingFileReader = wrapReader(reader, {
  async listFiles(requestedRoot) {
    const files = await reader.listFiles(requestedRoot);
    return requestedRoot === sourceRoot ? files.filter((file) => file !== "README.md") : files;
  },
});
await assert.rejects(
  loadMedicalAuthoringReviewInputFromReader(missingFileReader, registry, { context: "review" }),
  /source file set differs from provenance/,
);

const readerSandbox = await mkdtemp(path.join(os.tmpdir(), "vetgeme-review-reader-test-"));
try {
  const realDirectory = path.join(readerSandbox, "real");
  await mkdir(realDirectory, { recursive: true });
  await writeFile(path.join(realDirectory, "value.txt"), "review-only\n", "utf8");
  await symlink("real", path.join(readerSandbox, "linked"), "dir");
  const symlinkReader = createFileSystemReviewInputReader(readerSandbox);
  await assert.rejects(
    symlinkReader.readBytes("linked/value.txt"),
    /symbolic links are forbidden/,
  );
  await assert.rejects(
    symlinkReader.listFiles("linked"),
    /symbolic links are forbidden/,
  );
} finally {
  await rm(readerSandbox, { recursive: true, force: true });
}

const baselineManifest = await readJson("content/packs/tier-01-v2/clinical/tier-01/manifest.json");
assert.equal(baselineManifest.caseCount, 30, "the existing tier-01-v2 baseline must remain at 30 cases");
assert.equal(baselineManifest.cases.length, 30, "the existing tier-01-v2 case list changed");
assert.equal(new Set(baselineManifest.cases.map((entry) => entry.id)).size, 30, "baseline case IDs contain duplicates");
const sourceBytesByPath = new Map(await Promise.all(sourceFiles.map(async (relativePath) => [
  relativePath,
  await reader.readBytes(`${sourceRoot}/${relativePath}`),
])));
for (const { id } of baselineManifest.cases) {
  const containingFiles = [...sourceBytesByPath]
    .filter(([, bytes]) => bytes.includes(Buffer.from(id, "utf8")))
    .map(([relativePath]) => relativePath);
  assert.deepEqual(
    containingFiles,
    [],
    `review input contains an unapproved crosswalk to ${id}: ${containingFiles.join(", ")}`,
  );
}

console.log(JSON.stringify({
  status: "passed",
  reviewOnlyLoadVerified: true,
  productionAndDefaultContextsRejected: true,
  additionalReviewInputKindsIgnoredByMedicalResolver: true,
  provenanceDigestAndByteTamperRejected: true,
  pendingStatusEligibilityAndZeroPoolEnforced: true,
  unknownCapabilitiesRejected: true,
  crosswalkPolicyAndArtifactsRejected: true,
  countPathAndFileSetTamperRejected: true,
  symbolicLinkPathSegmentsRejected: true,
  allSourceFilesScannedForBaselineCaseIds: sourceFiles.length,
  baselineCasesUnchanged: baselineManifest.caseCount,
  counts: {
    families: reviewInput.audit.families,
    variants: reviewInput.audit.variants,
    presentations: reviewInput.audit.presentations,
    productionPool: reviewInput.productionPool.length,
  },
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
