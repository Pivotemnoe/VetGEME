import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MEDICAL_REVIEW_INPUT_V40_VERSION,
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
const registration = registry.reviewInputs.find((entry) => (
  entry.reviewInputId === "vetgeme-medical-production-authoring"
    && entry.reviewInputVersion === MEDICAL_REVIEW_INPUT_V40_VERSION
));
assert.ok(registration, "medical .40 review input registration is missing");

const reviewInput = await loadMedicalAuthoringReviewInput(projectRoot, {
  context: "review",
  reviewInputVersion: MEDICAL_REVIEW_INPUT_V40_VERSION,
});
assert.equal(reviewInput.registration.reviewInputVersion, MEDICAL_REVIEW_INPUT_V40_VERSION);
assert.equal(reviewInput.reviewOnly, true);
assert.equal(reviewInput.productionEligible, false);
assert.equal(reviewInput.generatorEligible, false);
assert.equal(reviewInput.allowCrosswalk, false);
assert.equal(reviewInput.productionPool.length, 0);
assert.deepEqual({
  families: reviewInput.audit.families,
  variants: reviewInput.audit.variants,
  presentations: reviewInput.audit.presentations,
  investigationResults: reviewInput.audit.investigations,
  nullInvestigationResults: reviewInput.audit.nullInvestigationResults,
  productionPool: reviewInput.audit.productionPool,
}, {
  families: 39,
  variants: 215,
  presentations: 645,
  investigationResults: 1864,
  nullInvestigationResults: 0,
  productionPool: 0,
});
assert.equal(reviewInput.sourceIntegrity.sourceFilesVerified, 85);
assert.equal(reviewInput.sourceIntegrity.sourceBytesVerified, 5250732);
assert.equal(
  reviewInput.sourceIntegrity.aggregateSha256,
  "3f3f89ab93e005a5100b39586328c38fa6b4fcf52887be63cabc41ac05c557c8",
);
assert.equal(reviewInput.manifest.families.every((family) => family.familyVersion === MEDICAL_REVIEW_INPUT_V40_VERSION), true);
assert.equal(reviewInput.families.every((family) => family.familyVersion === MEDICAL_REVIEW_INPUT_V40_VERSION), true);

const sourceRoot = `${registration.root}/${registration.sourceRoot}`;
const sourceFiles = await reader.listFiles(sourceRoot);
const sourceBytesByPath = new Map(await Promise.all(sourceFiles.map(async (relativePath) => [
  relativePath,
  await reader.readBytes(`${sourceRoot}/${relativePath}`),
])));
assert.equal(sourceFiles.some((file) => /crosswalk|activation.?manifest/iu.test(file)), false);
assert.equal(sourceFiles.length, 85);

const familyHashes = new Set();
for (const manifestFamily of reviewInput.manifest.families) {
  assert.match(manifestFamily.sha256, /^[a-f0-9]{64}$/u);
  familyHashes.add(manifestFamily.sha256);
}
assert.equal(familyHashes.size, 39, "family manifest hashes must cover 39 exact files");

const baselineManifest = await readJson("content/packs/tier-01-v2/clinical/tier-01/manifest.json");
assert.equal(baselineManifest.caseCount, 30);
for (const { id } of baselineManifest.cases) {
  const matches = [...sourceBytesByPath]
    .filter(([, bytes]) => bytes.includes(Buffer.from(id, "utf8")))
    .map(([relativePath]) => relativePath);
  assert.deepEqual(matches, [], `medical .40 contains an unapproved current-case crosswalk for ${id}`);
}

await assert.rejects(
  loadMedicalAuthoringReviewInput(projectRoot, {
    context: "production",
    reviewInputVersion: MEDICAL_REVIEW_INPUT_V40_VERSION,
  }),
  /context production is forbidden/,
);
await assert.rejects(
  loadMedicalAuthoringReviewInput(projectRoot, {
    context: "review",
    reviewInputVersion: "2026.07.16.999",
  }),
  /unknown review input/,
);

const wrongRoot = clone(registration);
wrongRoot.root = "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.39";
assert.throws(() => validateReviewInputRegistration(wrongRoot), /versioned medical review root mismatch/);
const wrongAggregate = clone(registration);
wrongAggregate.sourceIntegrity.aggregateSha256 = "0".repeat(64);
assert.throws(() => validateReviewInputRegistration(wrongAggregate), /provenance aggregate digest mismatch/);
const wrongCapabilityPath = clone(registration);
wrongCapabilityPath.capabilityRegistry.path = "content/system-packs/alternate/capability-registry.json";
assert.throws(() => validateReviewInputRegistration(wrongCapabilityPath), /capability registry path mismatch/);
const wrongCapabilityDigest = clone(registration);
wrongCapabilityDigest.capabilityRegistry.sha256 = "0".repeat(64);
assert.throws(() => validateReviewInputRegistration(wrongCapabilityDigest), /capability registry SHA-256 mismatch/);

const capabilityBytes = await reader.readBytes(registration.capabilityRegistry.path);
const capabilityRegistry = JSON.parse(capabilityBytes.toString("utf8"));
const familiesByPath = new Map(reviewInput.manifest.families.map((entry, index) => [
  entry.path,
  clone(reviewInput.families[index]),
]));
const baseFixture = () => ({
  registration: clone(registration),
  manifest: clone(reviewInput.manifest),
  familiesByPath: new Map([...familiesByPath].map(([key, value]) => [key, clone(value)])),
  sourceFiles: [...sourceFiles],
  sourceBytesByPath: new Map(sourceBytesByPath),
  capabilityRegistry: clone(capabilityRegistry),
  capabilityBytes,
});

const wrongFamilyDigest = baseFixture();
wrongFamilyDigest.manifest.families[0].sha256 = "0".repeat(64);
assert.throws(
  () => validateMedicalAuthoringPackage(wrongFamilyDigest),
  /manifest family SHA-256 mismatch/,
);
const missingResult = baseFixture();
missingResult.familiesByPath.get(missingResult.manifest.families[0].path)
  .variants[0].presentations[0].investigations[0].result = null;
assert.throws(
  () => validateMedicalAuthoringPackage(missingResult),
  /authored result must be non-empty text/,
);
const approvedPresentation = baseFixture();
approvedPresentation.familiesByPath.get(approvedPresentation.manifest.families[0].path)
  .variants[0].presentations[0].review.veterinaryReviewStatus = "approved";
assert.throws(
  () => validateMedicalAuthoringPackage(approvedPresentation),
  /veterinary status must remain external_veterinary_review_pending/,
);

const defaultInput = await loadMedicalAuthoringReviewInput(projectRoot, { context: "review" });
assert.equal(defaultInput.registration.reviewInputVersion, "2026.07.16.39");
assert.equal(defaultInput.sourceIntegrity.aggregateSha256, "e3341e533e09a6f00d09180f7b78808cdf1867406492a27cd17f9dca11bc626c");

console.log(JSON.stringify({
  status: "passed",
  input: `${registration.reviewInputId}@${registration.reviewInputVersion}`,
  exactSourceFiles: sourceFiles.length,
  familyHashes: familyHashes.size,
  baselineCaseIdsScanned: baselineManifest.caseCount,
  defaultVersionPreserved: defaultInput.registration.reviewInputVersion,
  counts: {
    families: reviewInput.audit.families,
    variants: reviewInput.audit.variants,
    presentations: reviewInput.audit.presentations,
    investigationResults: reviewInput.audit.investigations,
    nullInvestigationResults: reviewInput.audit.nullInvestigationResults,
    productionPool: reviewInput.productionPool.length,
  },
}, null, 2));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function readJson(relativePath) {
  return JSON.parse((await reader.readBytes(relativePath)).toString("utf8"));
}
