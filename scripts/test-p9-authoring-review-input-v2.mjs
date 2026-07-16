import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  P9_REVIEW_INPUT_V2_ASSET_INDEX_PATH,
  P9_REVIEW_INPUT_V2_ID,
  P9_REVIEW_INPUT_V2_VERSION,
  loadP9AuthoringReviewInputV2FromReader,
  validateP9ReviewInputV2Registration,
} from "./lib/p9-authoring-review-input-v2.mjs";
import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
} from "./lib/medical-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reader = createFileSystemReviewInputReader(projectRoot);
const baseRegistry = JSON.parse(Buffer.from(await reader.readBytes(REVIEW_INPUT_REGISTRY_PATH)).toString("utf8"));
const existingRegistration = baseRegistry.reviewInputs.find((entry) => (
    entry.reviewInputId === P9_REVIEW_INPUT_V2_ID
      && entry.reviewInputVersion === P9_REVIEW_INPUT_V2_VERSION
  ));
assert.ok(existingRegistration, "P9 .2 must be explicitly registered; synthetic intake registration is forbidden");
const registration = existingRegistration;
const registry = clone(baseRegistry);

const reviewInput = await loadP9AuthoringReviewInputV2FromReader(reader, registry, {
  context: "review",
  reviewInputId: P9_REVIEW_INPUT_V2_ID,
  reviewInputVersion: P9_REVIEW_INPUT_V2_VERSION,
});
assert.equal(reviewInput.loadContext, "review");
assert.equal(reviewInput.reviewOnly, true);
assert.equal(reviewInput.productionEligible, false);
assert.equal(reviewInput.runtimeEligible, false);
assert.equal(reviewInput.generatorEligible, false);
assert.equal(reviewInput.activationAllowed, false);
assert.equal(reviewInput.productionPool.length, 0);
assert.equal(reviewInput.registration.allowRuntimeActivation, false);
assert.equal(reviewInput.registration.allowActivationManifest, false);
assert.equal(reviewInput.registration.allowSimulationMutation, false);
assert.equal(reviewInput.registration.allowVisualCapabilityGrant, false);
assert.equal(reviewInput.registration.allowArtMutation, false);
assert.equal(reviewInput.sourceIntegrity.sourceFiles, 12);
assert.equal(reviewInput.sourceIntegrity.sourceBytes, 134143);
assert.equal(reviewInput.sourceIntegrity.archiveSha256, "049f554c54dd10ba6c2b141af92f9a327b09d715dd93d6b7b98874e8b5ea2284");
assert.equal(reviewInput.sourceIntegrity.aggregateSha256, "99bf856f6ebb3fc1cdf4491c770fc330a26f63e5f450a1a9da12a03d9c65e907");
assert.equal(reviewInput.sourceIntegrity.provenanceSha256, "ab998c36bc8e0db55a2f0938ada9ab00b4de5fc81ea7a4960e319c9705597d97");
assert.equal(reviewInput.p5ReviewInputIdentity.reviewInputVersion, "2026.07.16.2");
assert.equal(reviewInput.p5ReviewInputIdentity.runtimeEligible, false);
assert.equal(reviewInput.p5ReviewInputIdentity.provenanceSha256, "f5f54786a0a670d3c9fa1fc8c27b003dc76b2593772b61c21a07523121b829e5");
assert.equal(reviewInput.p5ReviewInputIdentity.resourceLifecycleCatalogSha256, "62b49f14ddb213157c6a59879d33aa3fd65500078c05f3fdbc3b3ab4c491cbc6");
assert.deepEqual(reviewInput.authorSource, {
  status: "author_complete_validation_passed",
  immutable: true,
  validationPassed: true,
  runtimeEligible: false,
  activationAllowed: false,
});
assert.equal(reviewInput.hostReviewHarness.status, "host_review_harness_validation_passed_activation_forbidden");
assert.equal(reviewInput.hostReviewHarness.integrationStatus, "explicit_review_harness_only");
assert.equal(reviewInput.hostReviewHarness.browserAcceptanceStatus, "passed");
assert.equal(reviewInput.hostReviewHarness.explicitReviewOnly, true);
assert.equal(reviewInput.hostReviewHarness.ordinaryRuntimeConnected, false);
assert.equal(reviewInput.hostReviewHarness.ordinaryRuntimeLoads, false);
assert.equal(reviewInput.hostReviewHarness.runtimeEligible, false);
assert.equal(reviewInput.hostReviewHarness.activationAllowed, false);
assert.equal(reviewInput.hostReviewHarness.artifactsVerified, true);
assert.equal(reviewInput.hostReviewHarness.verifiedArtifactIds.length, 8);
assert.deepEqual(reviewInput.hostReviewHarness.bindings, {
  assetAliases: 31,
  canvasRooms: 4,
  canvasEquipment: 1,
  canvasStaff: 0,
  explicitRoomOverlayAnchors: 20,
  domRooms: 8,
  domEquipment: 26,
  domStaff: 10,
});
assert.equal(reviewInput.assetIndex.sourceAssetCount, 133);
assert.equal(reviewInput.assetIndex.assetIds.length, 133);
assert.deepEqual(reviewInput.audit.counts, {
  sourceFiles: 12,
  sourceBytes: 134143,
  artAssetsAvailable: 133,
  referencedAssets: 31,
  rooms: 12,
  roomsWithBaseAsset: 11,
  equipment: 27,
  equipmentWithBaseAsset: 14,
  equipmentMissingBaseAsset: 13,
  staff: 10,
  hudSurfaces: 9,
  productionPool: 0,
  p5Resources: 49,
  exactP5RoomMatches: 12,
  exactP5EquipmentMatches: 27,
  exactP5StaffMatches: 10,
  missingRoomAssets: 1,
  sharedShellVariants: 5,
});
assert.deepEqual(reviewInput.audit.activationRequires, [
  "programmer_projection_adapter",
  "1280x720_browser_smoke",
  "mobile_collapse_smoke",
  "save_reload_visual_parity",
]);
assert.equal(reviewInput.audit.referencedAssetIds.length, 31);
assert.deepEqual(reviewInput.audit.missingRoomResourceIds, ["room.staff.1"]);
assert.equal(reviewInput.audit.missingEquipmentResourceIds.length, 13);
assert.deepEqual(reviewInput.audit.sharedShellResourceIds, [
  "room.short_stay.1",
  "room.dental.1",
  "equipment.biochemistry_analyzer",
  "equipment.electrolyte_analyzer",
  "equipment.coagulation_analyzer",
]);
assert.deepEqual(reviewInput.blockers.map((blocker) => blocker.id), [
  "ordinary_runtime_activation_forbidden",
  "live_visual_placement_and_mobile_layout_pending",
  "product_owner_acceptance_pending",
]);
assert.equal(Object.isFrozen(reviewInput), true);
assert.equal(Object.isFrozen(reviewInput.documents), true);
assert.equal(Object.isFrozen(reviewInput.audit), true);
assert.equal(Object.isFrozen(reviewInput.assetIndex), true);

await assert.rejects(
  loadP9AuthoringReviewInputV2FromReader(reader, registry),
  /explicit review context is required/,
);
await assert.rejects(
  loadP9AuthoringReviewInputV2FromReader(reader, registry, { context: "runtime" }),
  /runtime context is forbidden/,
);
await assert.rejects(
  loadP9AuthoringReviewInputV2FromReader(reader, registry, {
    context: "review",
    reviewInputVersion: "2026.07.16.1",
  }),
  /unexpected requested reviewInputVersion/,
);
const registryWithoutP9 = clone(registry);
registryWithoutP9.reviewInputs = registryWithoutP9.reviewInputs.filter((entry) => !(
  entry.reviewInputId === P9_REVIEW_INPUT_V2_ID
    && entry.reviewInputVersion === P9_REVIEW_INPUT_V2_VERSION
));
await assert.rejects(
  loadP9AuthoringReviewInputV2FromReader(reader, registryWithoutP9, { context: "review" }),
  /unknown review input vetgeme-p9-visual-state-authoring@2026\.07\.16\.2/,
);

for (const field of [
  "productionEligible",
  "runtimeEligible",
  "generatorEligible",
  "activationAllowed",
  "allowRuntimeActivation",
  "allowActivationManifest",
  "allowSimulationMutation",
  "allowVisualCapabilityGrant",
  "allowArtMutation",
]) {
  const tampered = clone(registration);
  tampered[field] = true;
  assert.throws(() => validateP9ReviewInputV2Registration(tampered), new RegExp(`${field} must remain false`));
}

const wrongP5 = clone(registration);
wrongP5.p5ReviewInput.reviewInputVersion = "2026.07.16.1";
assert.throws(() => validateP9ReviewInputV2Registration(wrongP5), /P5 \.2 review dependency mismatch/);
for (const field of ["provenanceSha256", "aggregateSha256", "archiveSha256"]) {
  const tampered = clone(registration);
  tampered.p5ReviewInput.sourceIntegrity[field] = "0".repeat(64);
  assert.throws(() => validateP9ReviewInputV2Registration(tampered), /P5 \.2 review dependency mismatch/);
}
for (const field of ["resourceCatalogSha256", "resourceLifecycleCatalogSha256"]) {
  const tampered = clone(registration);
  tampered.p5ReviewInput[field] = "0".repeat(64);
  assert.throws(() => validateP9ReviewInputV2Registration(tampered), /P5 \.2 review dependency mismatch/);
}
const wrongAssetManifest = clone(registration);
wrongAssetManifest.authorAssetIdIndex.sourceAssetManifestSha256 = "0".repeat(64);
assert.throws(() => validateP9ReviewInputV2Registration(wrongAssetManifest), /asset ID index contract mismatch/);
for (const field of [
  "status",
  "integrationStatus",
  "browserAcceptanceStatus",
  "explicitReviewOnly",
  "ordinaryRuntimeConnected",
  "ordinaryRuntimeLoads",
  "runtimeEligible",
  "activationAllowed",
]) {
  const tampered = clone(registration);
  tampered.hostReviewHarness[field] = field === "explicitReviewOnly" ? false : "tampered";
  assert.throws(
    () => validateP9ReviewInputV2Registration(tampered),
    new RegExp(`hostReviewHarness\\.${field} mismatch`),
  );
}
for (const artifactId of Object.keys(registration.hostReviewHarness.artifacts)) {
  const tampered = clone(registration);
  tampered.hostReviewHarness.artifacts[artifactId].sha256 = "0".repeat(64);
  assert.throws(
    () => validateP9ReviewInputV2Registration(tampered),
    new RegExp(`hostReviewHarness\\.artifacts\\.${artifactId}\\.sha256 mismatch`),
  );
}
const unknownHarnessField = clone(registration);
unknownHarnessField.hostReviewHarness.unreviewedActivationPath = true;
assert.throws(
  () => validateP9ReviewInputV2Registration(unknownHarnessField),
  /hostReviewHarness fields mismatch/,
);
const unknownHarnessArtifact = clone(registration);
unknownHarnessArtifact.hostReviewHarness.artifacts.unreviewedRuntimeLoader = {
  path: "game.js",
  sha256: "0".repeat(64),
};
assert.throws(
  () => validateP9ReviewInputV2Registration(unknownHarnessArtifact),
  /hostReviewHarness\.artifacts inventory mismatch/,
);

const manifestPath = `${registration.root}/source/MANIFEST.json`;
const tamperedSourceReader = wrapReader(reader, async (relativePath, bytes) => {
  if (relativePath !== manifestPath) return bytes;
  const manifest = JSON.parse(Buffer.from(bytes).toString("utf8"));
  manifest.runtimeEligible = true;
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
});
await assert.rejects(
  loadP9AuthoringReviewInputV2FromReader(tamperedSourceReader, registry, { context: "review" }),
  /(?:byte length|SHA-256) mismatch for MANIFEST\.json/,
  "immutable provenance must reject source mutation before semantic validation",
);

const tamperedAssetIndexReader = wrapReader(reader, async (relativePath, bytes) => {
  if (relativePath !== P9_REVIEW_INPUT_V2_ASSET_INDEX_PATH) return bytes;
  const index = JSON.parse(Buffer.from(bytes).toString("utf8"));
  index.assetIds.pop();
  return Buffer.from(`${JSON.stringify(index, null, 2)}\n`, "utf8");
});
await assert.rejects(
  loadP9AuthoringReviewInputV2FromReader(tamperedAssetIndexReader, registry, { context: "review" }),
  /author asset ID index SHA-256 mismatch/,
);
const adapterPath = registration.hostReviewHarness.artifacts.adapter.path;
const tamperedHarnessReader = wrapReader(reader, async (relativePath, bytes) => (
  relativePath === adapterPath ? Buffer.concat([bytes, Buffer.from("\n")]) : bytes
));
await assert.rejects(
  loadP9AuthoringReviewInputV2FromReader(tamperedHarnessReader, registry, { context: "review" }),
  /host review harness adapter SHA-256 mismatch/,
);

console.log("P9 .2 review-input intake contract tests passed");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function wrapReader(base, transform) {
  return {
    listFiles: (relativePath) => base.listFiles(relativePath),
    async readBytes(relativePath) {
      return transform(relativePath, await base.readBytes(relativePath));
    },
  };
}
