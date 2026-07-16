import { createHash } from "node:crypto";

import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
  validateReviewInputRegistry,
} from "./medical-authoring-review-input.mjs";
import { loadP5AuthoringReviewInputV2FromReader } from "./p5-authoring-review-input-v2.mjs";

export const P9_REVIEW_INPUT_V2_ID = "vetgeme-p9-visual-state-authoring";
export const P9_REVIEW_INPUT_V2_VERSION = "2026.07.16.2";
export const P9_REVIEW_INPUT_V2_ROOT =
  "content/review-inputs/vetgeme-p9-visual-state-authoring-2026.07.16.2";
export const P9_REVIEW_INPUT_V2_CONTEXT = "review";
export const P9_REVIEW_INPUT_V2_STATUS =
  "author_complete_validation_passed";
export const P9_REVIEW_INPUT_V2_ASSET_INDEX_PATH =
  `${P9_REVIEW_INPUT_V2_ROOT}/host/author-asset-id-index.json`;

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const EXPECTED_COUNTS = Object.freeze({
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
});
const SOURCE_INTEGRITY = Object.freeze({
  provenanceSha256: "ab998c36bc8e0db55a2f0938ada9ab00b4de5fc81ea7a4960e319c9705597d97",
  aggregateSha256: "99bf856f6ebb3fc1cdf4491c770fc330a26f63e5f450a1a9da12a03d9c65e907",
  archiveSha256: "049f554c54dd10ba6c2b141af92f9a327b09d715dd93d6b7b98874e8b5ea2284",
  manifestSha256: "7f940f8ba3df745670fc5b4c262a6f79caf5db9edd4f3068a379f18ec4327515",
});
const ASSET_INDEX = Object.freeze({
  path: P9_REVIEW_INPUT_V2_ASSET_INDEX_PATH,
  sha256: "d609cfdbb76dce9fd2d505fdc83d32e5ea478e1f44d8f0c3cf0a87e40cf7ae0e",
  sourcePackId: "vetgeme-modular-clinic-art-v1",
  sourceAssetManifestSha256: "9a209ac734297e2e01308f6be1a68e32d8c92515290de4aab1997f11185fc7b1",
  assets: 133,
});
const P5_REVIEW_INPUT = Object.freeze({
  reviewInputId: "vetgeme-p5-production-authoring",
  reviewInputVersion: "2026.07.16.2",
  reviewOnly: true,
  runtimeEligible: false,
  sourceIntegrity: Object.freeze({
    provenanceSha256: "f5f54786a0a670d3c9fa1fc8c27b003dc76b2593772b61c21a07523121b829e5",
    aggregateSha256: "db30b1feacd01fdab2cd6d750b59892c250d4e15eab01d1cd363c49b64dc6ad3",
    archiveSha256: "665183acc97096477dd9366b8116a65a11862e4919d02170278f8e97e241a7ab",
  }),
  resourceCatalogSha256: "67503f3c3c8257a5a5765abe85319fd343f82e7a3e3c36198a6d9a26f534f34b",
  resourceLifecycleCatalogSha256: "62b49f14ddb213157c6a59879d33aa3fd65500078c05f3fdbc3b3ab4c491cbc6",
});
const HOST_REVIEW_HARNESS = Object.freeze({
  status: "host_review_harness_validation_passed_activation_forbidden",
  integrationStatus: "explicit_review_harness_only",
  browserAcceptanceStatus: "passed",
  explicitReviewOnly: true,
  ordinaryRuntimeConnected: false,
  ordinaryRuntimeLoads: false,
  runtimeEligible: false,
  activationAllowed: false,
  artifacts: Object.freeze({
    assetCrosswalk: Object.freeze({
      path: `${P9_REVIEW_INPUT_V2_ROOT}/host/runtime-v2-crosswalk.json`,
      sha256: "8114a14340690523843f6ca19dd0cc7d4e7a48b5261bcb504cb605b6febc9e4a",
    }),
    adapter: Object.freeze({
      path: "systems/p9-visual-state-adapter-v2.js",
      sha256: "92f06aa646dad512359bca965d89ee1d1a8c456bfb1a0a07d838c831c54515f6",
    }),
    renderer: Object.freeze({
      path: "visual/clinic-renderer-v2.js",
      sha256: "478cc81de32ededb566b3b6c5c93e466340fd834dba8cb4fcbc7059d4b765b6b",
    }),
    surfaceScript: Object.freeze({
      path: "visual/p9-review-surface-v2.js",
      sha256: "e93591b2cd0bc122886a3c856cfe9392b1e554ed05042a5130e6ec3c5b0ec4cb",
    }),
    surfaceStyles: Object.freeze({
      path: "visual/p9-review-surface-v2.css",
      sha256: "0d648d61a8922de31fed1d9a41c23f264e6bc6fd04906a52c378189b4a4d3290",
    }),
    browserSmoke: Object.freeze({
      path: "scripts/playtest-p9-authoring-review-v2.js",
      sha256: "bbab2c5bec507929a7d6d46c037cdb1da9abc9e32788ad83cd34ef454e9f9174",
    }),
    runtimeManifest: Object.freeze({
      path: "art/runtime-v2/manifest.json",
      sha256: "04679357ad52782466dd8d1747d341a52a651bc804d67c8fc2eb3e3570b4f719",
    }),
    sceneLayout: Object.freeze({
      path: "art/runtime-v2/scene-layout.json",
      sha256: "de71c885b5f54b2a199b65228a0000106d8be02e6a0b61b8141ed533ee2eec90",
    }),
  }),
  bindings: Object.freeze({
    assetAliases: 31,
    canvasRooms: 4,
    canvasEquipment: 1,
    canvasStaff: 0,
    explicitRoomOverlayAnchors: 20,
    domRooms: 8,
    domEquipment: 26,
    domStaff: 10,
  }),
});
const JSON_PATHS = Object.freeze([
  "MANIFEST.json",
  "source/visual-policy.json",
  "generated/room-visual-state-catalog.json",
  "generated/equipment-visual-state-catalog.json",
  "generated/staff-visual-state-catalog.json",
  "generated/hud-data-contract.json",
  "reports/ASSET_GAPS.json",
  "reports/VALIDATION_REPORT.json",
]);
const ROOM_STATES = Object.freeze([
  "not_owned", "pending_delivery", "delivered_not_ready", "ready", "busy",
]);
const EQUIPMENT_STATES = Object.freeze([
  "not_owned", "pending_delivery", "delivered_not_ready", "training_pending",
  "maintenance_due", "maintenance_active", "stock_blocked", "ready", "busy",
]);
const STAFF_STATES = Object.freeze([
  "not_hired", "hired_unscheduled", "scheduled", "busy", "resting", "absent",
]);
const HUD_SURFACE_IDS = Object.freeze([
  "clinic_identity", "next_patient", "queue", "day_goals", "cash",
  "clock_controls", "trust_reputation", "active_capacity", "event_log",
]);

function fail(message) {
  throw new Error(`P9 .2 authoring review input validation failed: ${message}`);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeRelativePath(value) {
  if (!isNonEmptyString(value) || value.startsWith("/") || value.includes("\\")) return false;
  return value.split("/").every((part) => part && part !== "." && part !== "..");
}

function checkInteger(value, label) {
  check(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative safe integer`);
}

function checkArray(value, label) {
  check(Array.isArray(value), `${label} must be an array`);
  return value;
}

function checkUnique(values, label) {
  check(new Set(values).size === values.length, `${label} contain duplicates`);
}

function sorted(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right), "en"));
}

function sameStrings(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function joinPath(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && String(part).length > 0)
    .map((part, index) => {
      const value = String(part);
      return index === 0
        ? value.replace(/\/$/u, "")
        : value.replace(/^\//u, "").replace(/\/$/u, "");
    })
    .join("/");
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function checkCatalogHeader(document, catalogId, label) {
  check(isObject(document), `${label} must be an object`);
  check(document.schemaVersion === 1, `${label}.schemaVersion must be 1`);
  check(document.catalogId === catalogId, `${label}.catalogId mismatch`);
  check(document.catalogVersion === P9_REVIEW_INPUT_V2_VERSION, `${label}.catalogVersion mismatch`);
  check(document.status === "author_complete_programmer_adapter_required", `${label}.status mismatch`);
  check(document.runtimeEligible === false, `${label}.runtimeEligible must remain false`);
}

export function createP9ReviewInputV2Registration() {
  return clone({
    reviewInputId: P9_REVIEW_INPUT_V2_ID,
    reviewInputVersion: P9_REVIEW_INPUT_V2_VERSION,
    kind: "p9_visual_state_authoring",
    packageId: P9_REVIEW_INPUT_V2_ID,
    packageVersion: P9_REVIEW_INPUT_V2_VERSION,
    root: P9_REVIEW_INPUT_V2_ROOT,
    sourceRoot: "source",
    manifestPath: "source/MANIFEST.json",
    provenancePath: "provenance.json",
    status: P9_REVIEW_INPUT_V2_STATUS,
    reviewOnly: true,
    productionEligible: false,
    runtimeEligible: false,
    generatorEligible: false,
    activationAllowed: false,
    allowRuntimeActivation: false,
    allowActivationManifest: false,
    allowSimulationMutation: false,
    allowVisualCapabilityGrant: false,
    allowArtMutation: false,
    expectedCounts: EXPECTED_COUNTS,
    sourceIntegrity: SOURCE_INTEGRITY,
    p5ReviewInput: P5_REVIEW_INPUT,
    authorAssetIdIndex: ASSET_INDEX,
    hostReviewHarness: HOST_REVIEW_HARNESS,
  });
}

export function validateP9ReviewInputV2Registration(registration) {
  check(isObject(registration), "review input registration must be an object");
  check(registration.reviewInputId === P9_REVIEW_INPUT_V2_ID, "unexpected reviewInputId");
  check(registration.reviewInputVersion === P9_REVIEW_INPUT_V2_VERSION, "unexpected reviewInputVersion");
  check(registration.kind === "p9_visual_state_authoring", "review input kind mismatch");
  check(registration.packageId === P9_REVIEW_INPUT_V2_ID, "packageId mismatch");
  check(registration.packageVersion === P9_REVIEW_INPUT_V2_VERSION, "packageVersion mismatch");
  check(registration.root === P9_REVIEW_INPUT_V2_ROOT, "versioned P9 .2 review root mismatch");
  check(isSafeRelativePath(registration.root), "root must be a safe relative path");
  check(registration.sourceRoot === "source", "sourceRoot must be source");
  check(registration.manifestPath === "source/MANIFEST.json", "manifestPath mismatch");
  check(registration.provenancePath === "provenance.json", "provenancePath mismatch");
  check(registration.status === P9_REVIEW_INPUT_V2_STATUS, "status mismatch");
  check(registration.reviewOnly === true, "reviewOnly must be true");
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
  ]) check(registration[field] === false, `${field} must remain false`);

  check(isObject(registration.expectedCounts), "expectedCounts are required");
  for (const [field, expected] of Object.entries(EXPECTED_COUNTS)) {
    checkInteger(registration.expectedCounts[field], `expectedCounts.${field}`);
    check(registration.expectedCounts[field] === expected, `expectedCounts.${field} must be ${expected}`);
  }
  check(isObject(registration.sourceIntegrity), "sourceIntegrity is required");
  for (const [field, expected] of Object.entries(SOURCE_INTEGRITY)) {
    check(SHA256_PATTERN.test(registration.sourceIntegrity[field] || ""), `sourceIntegrity.${field} is invalid`);
    check(registration.sourceIntegrity[field] === expected, `sourceIntegrity.${field} mismatch`);
  }
  validateP5DependencyRegistration(registration.p5ReviewInput);
  validateAssetIndexRegistration(registration.authorAssetIdIndex);
  validateHostReviewHarnessRegistration(registration.hostReviewHarness);
  return registration;
}

function validateP5DependencyRegistration(dependency) {
  check(isObject(dependency), "P5 .2 review dependency mismatch");
  for (const field of [
    "reviewInputId",
    "reviewInputVersion",
    "reviewOnly",
    "runtimeEligible",
    "resourceCatalogSha256",
    "resourceLifecycleCatalogSha256",
  ]) {
    check(dependency[field] === P5_REVIEW_INPUT[field], "P5 .2 review dependency mismatch");
  }
  check(isObject(dependency.sourceIntegrity), "P5 .2 review dependency mismatch");
  for (const [field, expected] of Object.entries(P5_REVIEW_INPUT.sourceIntegrity)) {
    check(dependency.sourceIntegrity[field] === expected, "P5 .2 review dependency mismatch");
  }
}

function validateHostReviewHarnessRegistration(harness) {
  check(isObject(harness), "host review harness contract mismatch");
  const harnessFields = [
    "status",
    "integrationStatus",
    "browserAcceptanceStatus",
    "explicitReviewOnly",
    "ordinaryRuntimeConnected",
    "ordinaryRuntimeLoads",
    "runtimeEligible",
    "activationAllowed",
    "artifacts",
    "bindings",
  ];
  check(sameStrings(Object.keys(harness), harnessFields), "hostReviewHarness fields mismatch");
  for (const field of harnessFields.filter((field) => !["artifacts", "bindings"].includes(field))) {
    check(harness[field] === HOST_REVIEW_HARNESS[field], `hostReviewHarness.${field} mismatch`);
  }
  check(isObject(harness.artifacts), "hostReviewHarness.artifacts are required");
  check(
    sameStrings(Object.keys(harness.artifacts), Object.keys(HOST_REVIEW_HARNESS.artifacts)),
    "hostReviewHarness.artifacts inventory mismatch",
  );
  for (const [artifactId, expected] of Object.entries(HOST_REVIEW_HARNESS.artifacts)) {
    const actual = harness.artifacts[artifactId];
    check(isObject(actual), `hostReviewHarness.artifacts.${artifactId} is required`);
    check(
      sameStrings(Object.keys(actual), ["path", "sha256"]),
      `hostReviewHarness.artifacts.${artifactId} fields mismatch`,
    );
    check(actual.path === expected.path, `hostReviewHarness.artifacts.${artifactId}.path mismatch`);
    check(isSafeRelativePath(actual.path), `hostReviewHarness.artifacts.${artifactId}.path must be safe`);
    check(SHA256_PATTERN.test(actual.sha256 || ""), `hostReviewHarness.artifacts.${artifactId}.sha256 is invalid`);
    check(actual.sha256 === expected.sha256, `hostReviewHarness.artifacts.${artifactId}.sha256 mismatch`);
  }
  check(isObject(harness.bindings), "hostReviewHarness.bindings are required");
  check(
    sameStrings(Object.keys(harness.bindings), Object.keys(HOST_REVIEW_HARNESS.bindings)),
    "hostReviewHarness.bindings fields mismatch",
  );
  for (const [field, expected] of Object.entries(HOST_REVIEW_HARNESS.bindings)) {
    checkInteger(harness.bindings[field], `hostReviewHarness.bindings.${field}`);
    check(harness.bindings[field] === expected, `hostReviewHarness.bindings.${field} mismatch`);
  }
}

function validateAssetIndexRegistration(assetIndex) {
  check(isObject(assetIndex), "author asset ID index contract mismatch");
  for (const [field, expected] of Object.entries(ASSET_INDEX)) {
    check(assetIndex[field] === expected, "author asset ID index contract mismatch");
  }
}

export function resolveP9AuthoringReviewInputV2(registry, options = {}) {
  const registrations = validateReviewInputRegistry(registry);
  check(Object.prototype.hasOwnProperty.call(options, "context"), "explicit review context is required");
  check(
    options.context === P9_REVIEW_INPUT_V2_CONTEXT,
    `${String(options.context)} context is forbidden; review is the only allowed context`,
  );
  if (options.reviewInputId !== undefined) {
    check(options.reviewInputId === P9_REVIEW_INPUT_V2_ID, "unexpected requested reviewInputId");
  }
  if (options.reviewInputVersion !== undefined) {
    check(options.reviewInputVersion === P9_REVIEW_INPUT_V2_VERSION, "unexpected requested reviewInputVersion");
  }
  const registration = registrations.find((entry) => (
    entry.reviewInputId === P9_REVIEW_INPUT_V2_ID
      && entry.reviewInputVersion === P9_REVIEW_INPUT_V2_VERSION
  ));
  check(registration, `unknown review input ${P9_REVIEW_INPUT_V2_ID}@${P9_REVIEW_INPUT_V2_VERSION}`);
  return validateP9ReviewInputV2Registration(registration);
}

export function validateP9ReviewInputV2SourceProvenance(
  registration,
  provenance,
  sourceFiles,
  sourceBytesByPath,
) {
  validateP9ReviewInputV2Registration(registration);
  const identity = `${registration.reviewInputId}@${registration.reviewInputVersion}`;
  check(isObject(provenance), `${identity}: provenance is missing`);
  check(provenance.schemaVersion === 1, `${identity}: provenance schemaVersion must be 1`);
  check(
    provenance.provenanceId === "vetgeme-p9-visual-state-authoring-review-source",
    `${identity}: provenanceId mismatch`,
  );
  check(provenance.packageId === registration.packageId, `${identity}: provenance packageId mismatch`);
  check(provenance.packageVersion === registration.packageVersion, `${identity}: provenance packageVersion mismatch`);
  check(
    provenance.sourceArchive === "p9-visual-state-authoring-2026.07.16.2.zip",
    `${identity}: source archive identity mismatch`,
  );
  check(
    provenance.sourceDirectory === "p9-visual-state-authoring-2026.07.16.2",
    `${identity}: source directory identity mismatch`,
  );
  check(isObject(provenance.archive), `${identity}: archive provenance is missing`);
  check(provenance.archive.path === provenance.sourceArchive, `${identity}: archive path mismatch`);
  check(
    provenance.archive.checksumPath === "p9-visual-state-authoring-2026.07.16.2.zip.sha256",
    `${identity}: archive checksum path mismatch`,
  );
  check(provenance.archive.sha256 === registration.sourceIntegrity.archiveSha256, `${identity}: archive digest mismatch`);
  check(provenance.archive.zipEntryCount === 17, `${identity}: archive entry count mismatch`);
  check(provenance.archive.extractedFileCount === EXPECTED_COUNTS.sourceFiles, `${identity}: archive file count mismatch`);
  check(provenance.archive.extractedBytes === EXPECTED_COUNTS.sourceBytes, `${identity}: archive byte count mismatch`);
  check(provenance.sourceFileCount === EXPECTED_COUNTS.sourceFiles, `${identity}: provenance file count mismatch`);
  check(provenance.sourceBytes === EXPECTED_COUNTS.sourceBytes, `${identity}: provenance byte count mismatch`);
  check(provenance.aggregateSha256 === registration.sourceIntegrity.aggregateSha256, `${identity}: aggregate digest mismatch`);
  checkArray(provenance.files, `${identity}: provenance files`);
  check(provenance.files.length === EXPECTED_COUNTS.sourceFiles, `${identity}: provenance file entries mismatch`);
  const provenancePaths = provenance.files.map((file) => file.path);
  checkUnique(provenancePaths, `${identity}: provenance paths`);
  check(sameStrings(provenancePaths, sourceFiles), `${identity}: source file set differs from provenance`);
  let sourceBytes = 0;
  const aggregate = createHash("sha256");
  for (const file of provenance.files) {
    check(isObject(file), `${identity}: invalid provenance file entry`);
    check(isSafeRelativePath(file.path), `${identity}: unsafe provenance path`);
    check(file.originPath === `${provenance.sourceDirectory}/${file.path}`, `${identity}: origin path mismatch for ${file.path}`);
    checkInteger(file.bytes, `${identity}: bytes for ${file.path}`);
    check(SHA256_PATTERN.test(file.sha256 || ""), `${identity}: invalid SHA-256 for ${file.path}`);
    const bytes = sourceBytesByPath[file.path];
    check(bytes, `${identity}: source bytes missing for ${file.path}`);
    check(bytes.length === file.bytes, `${identity}: byte length mismatch for ${file.path}`);
    check(sha256(bytes) === file.sha256, `${identity}: SHA-256 mismatch for ${file.path}`);
    sourceBytes += bytes.length;
    aggregate.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`, "utf8");
  }
  check(sourceBytes === EXPECTED_COUNTS.sourceBytes, `${identity}: verified source byte count mismatch`);
  check(aggregate.digest("hex") === provenance.aggregateSha256, `${identity}: computed aggregate mismatch`);
  return deepFreeze({ sourceFiles: sourceFiles.length, sourceBytes });
}

export async function loadP9AuthoringReviewInputV2FromReader(reader, registry, options = {}) {
  check(reader && typeof reader.readBytes === "function", "review reader must provide readBytes");
  check(reader && typeof reader.listFiles === "function", "review reader must provide listFiles");
  const registration = resolveP9AuthoringReviewInputV2(registry, options);
  const sourceRoot = joinPath(registration.root, registration.sourceRoot);
  const sourceFiles = await reader.listFiles(sourceRoot);
  const sourceBytesByPath = {};
  for (const relativePath of sourceFiles) {
    check(isSafeRelativePath(relativePath), `unsafe source path ${relativePath}`);
    sourceBytesByPath[relativePath] = await reader.readBytes(joinPath(sourceRoot, relativePath));
  }
  const provenanceBytes = await reader.readBytes(joinPath(registration.root, registration.provenancePath));
  check(
    sha256(provenanceBytes) === registration.sourceIntegrity.provenanceSha256,
    "provenance SHA-256 mismatch",
  );
  const provenance = parseJson(provenanceBytes, "P9 .2 provenance");
  const sourceIntegrity = validateP9ReviewInputV2SourceProvenance(
    registration,
    provenance,
    sourceFiles,
    sourceBytesByPath,
  );
  const documents = {};
  for (const relativePath of JSON_PATHS) {
    check(sourceBytesByPath[relativePath], `${relativePath} is missing from immutable source`);
    documents[relativePath] = parseJson(sourceBytesByPath[relativePath], relativePath);
  }
  check(
    sha256(sourceBytesByPath["MANIFEST.json"]) === registration.sourceIntegrity.manifestSha256,
    "manifest SHA-256 mismatch",
  );

  const assetIndexBytes = await reader.readBytes(registration.authorAssetIdIndex.path);
  check(sha256(assetIndexBytes) === registration.authorAssetIdIndex.sha256, "author asset ID index SHA-256 mismatch");
  const assetIndex = parseJson(assetIndexBytes, "P9 author asset ID index");
  validateAssetIndex(assetIndex, registration);

  const p5ReviewInput = await loadP5AuthoringReviewInputV2FromReader(reader, registry, { context: "review" });
  check(
    p5ReviewInput.sourceIntegrity.provenanceSha256
      === registration.p5ReviewInput.sourceIntegrity.provenanceSha256,
    "P5 .2 provenance dependency digest drift",
  );
  check(
    p5ReviewInput.sourceIntegrity.aggregateSha256
      === registration.p5ReviewInput.sourceIntegrity.aggregateSha256,
    "P5 .2 aggregate dependency digest drift",
  );
  check(
    p5ReviewInput.sourceIntegrity.archiveSha256
      === registration.p5ReviewInput.sourceIntegrity.archiveSha256,
    "P5 .2 archive dependency digest drift",
  );
  const p5GeneratedRoot = joinPath(
    p5ReviewInput.registration.root,
    p5ReviewInput.registration.sourceRoot,
    "generated",
  );
  const [p5ResourceCatalogBytes, p5LifecycleCatalogBytes] = await Promise.all([
    reader.readBytes(joinPath(p5GeneratedRoot, "resource-catalog.json")),
    reader.readBytes(joinPath(p5GeneratedRoot, "resource-lifecycle-catalog.json")),
  ]);
  check(
    sha256(p5ResourceCatalogBytes) === registration.p5ReviewInput.resourceCatalogSha256,
    "P5 .2 resource catalog dependency digest drift",
  );
  check(
    sha256(p5LifecycleCatalogBytes) === registration.p5ReviewInput.resourceLifecycleCatalogSha256,
    "P5 .2 lifecycle catalog dependency digest drift",
  );
  const verifiedHostArtifacts = [];
  for (const [artifactId, artifact] of Object.entries(registration.hostReviewHarness.artifacts)) {
    const bytes = await reader.readBytes(artifact.path);
    check(sha256(bytes) === artifact.sha256, `host review harness ${artifactId} SHA-256 mismatch`);
    verifiedHostArtifacts.push(artifactId);
  }
  check(
    sha256(sourceBytesByPath["generated/room-visual-state-catalog.json"])
      === "25241dc75767be5b767149ed0337318650babc3b7cb99b4382e2ac4e47675b94",
    "room visual-state catalog digest mismatch",
  );
  check(
    sha256(sourceBytesByPath["generated/equipment-visual-state-catalog.json"])
      === "a8e3214c165c7350d27eae08c756f7719f48a19fa77c87607abb568e5b415e8b",
    "equipment visual-state catalog digest mismatch",
  );
  check(
    sha256(sourceBytesByPath["generated/staff-visual-state-catalog.json"])
      === "f346037f8dfa2079c537bae818abf707521ba1d1881f11a71b13be566e36d1aa",
    "staff visual-state catalog digest mismatch",
  );
  check(
    sha256(sourceBytesByPath["generated/hud-data-contract.json"])
      === "1be394e082c13dc4007fda01407f8db03b85cc39b22a13485ceb02f10035c751",
    "HUD data contract digest mismatch",
  );
  const audit = validatePackageDocuments(documents, assetIndex, p5ReviewInput);
  return deepFreeze({
    registration: clone(registration),
    loadContext: P9_REVIEW_INPUT_V2_CONTEXT,
    reviewOnly: true,
    productionEligible: false,
    runtimeEligible: false,
    generatorEligible: false,
    activationAllowed: false,
    productionPool: [],
    sourceIntegrity: {
      ...sourceIntegrity,
      provenanceSha256: registration.sourceIntegrity.provenanceSha256,
      aggregateSha256: registration.sourceIntegrity.aggregateSha256,
      archiveSha256: registration.sourceIntegrity.archiveSha256,
    },
    p5ReviewInputIdentity: {
      reviewInputId: p5ReviewInput.registration.reviewInputId,
      reviewInputVersion: p5ReviewInput.registration.reviewInputVersion,
      provenanceSha256: p5ReviewInput.sourceIntegrity.provenanceSha256,
      aggregateSha256: p5ReviewInput.sourceIntegrity.aggregateSha256,
      archiveSha256: p5ReviewInput.sourceIntegrity.archiveSha256,
      resourceCatalogSha256: registration.p5ReviewInput.resourceCatalogSha256,
      resourceLifecycleCatalogSha256: registration.p5ReviewInput.resourceLifecycleCatalogSha256,
      runtimeEligible: p5ReviewInput.runtimeEligible,
    },
    authorSource: {
      status: registration.status,
      immutable: true,
      validationPassed: true,
      runtimeEligible: false,
      activationAllowed: false,
    },
    hostReviewHarness: {
      ...clone(registration.hostReviewHarness),
      artifactsVerified: true,
      verifiedArtifactIds: verifiedHostArtifacts,
    },
    assetIndex,
    documents,
    audit,
    blockers: [
      {
        id: "ordinary_runtime_activation_forbidden",
        status: "unresolved",
        summary: "Обычный runtime не подключён: P5 lifecycle остаётся review-only, а изменение save schema требует отдельного versioned migration plan.",
      },
      {
        id: "live_visual_placement_and_mobile_layout_pending",
        status: "unresolved",
        summary: "Для live-активации остаются отсутствующие и неразмещённые art bindings, а также существующая минимальная ширина live-сцены 760 px.",
      },
      {
        id: "product_owner_acceptance_pending",
        status: "unresolved",
        summary: "Explicit review harness проверен, но активация требует отдельного product-owner acceptance.",
      },
    ],
  });
}

export async function loadP9AuthoringReviewInputV2(projectRoot, options = {}) {
  const reader = createFileSystemReviewInputReader(projectRoot);
  const registry = parseJson(await reader.readBytes(REVIEW_INPUT_REGISTRY_PATH), REVIEW_INPUT_REGISTRY_PATH);
  return loadP9AuthoringReviewInputV2FromReader(reader, registry, options);
}

function validateAssetIndex(index, registration) {
  check(isObject(index), "author asset ID index must be an object");
  check(index.schemaVersion === 1, "author asset ID index schemaVersion must be 1");
  check(index.indexId === "vetgeme-p9-author-asset-id-index", "author asset ID indexId mismatch");
  check(index.indexVersion === P9_REVIEW_INPUT_V2_VERSION, "author asset index version mismatch");
  check(index.sourcePackId === registration.authorAssetIdIndex.sourcePackId, "author art pack ID mismatch");
  check(
    index.sourceAssetManifestSha256 === registration.authorAssetIdIndex.sourceAssetManifestSha256,
    "source asset manifest digest mismatch",
  );
  check(index.sourceAssetCount === EXPECTED_COUNTS.artAssetsAvailable, "source asset count mismatch");
  checkArray(index.assetIds, "author asset IDs");
  check(index.assetIds.length === EXPECTED_COUNTS.artAssetsAvailable, "author asset ID count mismatch");
  check(index.assetIds.every(isNonEmptyString), "author asset IDs contain an invalid value");
  checkUnique(index.assetIds, "author asset IDs");
}

function validatePackageDocuments(documents, assetIndex, p5ReviewInput) {
  const manifest = documents["MANIFEST.json"];
  const policy = documents["source/visual-policy.json"];
  const rooms = documents["generated/room-visual-state-catalog.json"];
  const equipment = documents["generated/equipment-visual-state-catalog.json"];
  const staff = documents["generated/staff-visual-state-catalog.json"];
  const hud = documents["generated/hud-data-contract.json"];
  const gaps = documents["reports/ASSET_GAPS.json"];
  const report = documents["reports/VALIDATION_REPORT.json"];

  check(isObject(manifest), "manifest must be an object");
  check(manifest.schemaVersion === 1, "manifest.schemaVersion must be 1");
  check(manifest.packageId === P9_REVIEW_INPUT_V2_ID, "manifest packageId mismatch");
  check(manifest.packageVersion === P9_REVIEW_INPUT_V2_VERSION, "manifest packageVersion mismatch");
  check(manifest.status === "author_complete_validation_passed", "manifest status mismatch");
  check(manifest.runtimeEligible === false, "manifest runtimeEligible must remain false");
  checkUnique(manifest.files, "manifest source file inventory");
  check(sameStrings(manifest.files, [
    "MANIFEST.json", "README.md", "PROGRAMMER_TASK.md", "source/visual-policy.json",
    "scripts/build-p9-package.mjs", "scripts/validate-p9-package.mjs",
    "generated/room-visual-state-catalog.json", "generated/equipment-visual-state-catalog.json",
    "generated/staff-visual-state-catalog.json", "generated/hud-data-contract.json",
    "reports/ASSET_GAPS.json", "reports/VALIDATION_REPORT.json",
  ]), "manifest source file inventory mismatch");
  for (const field of ["runtimeChanged", "designChanged", "saveSchemaChanged", "simulationAuthorityChanged", "artFilesChanged"]) {
    check(manifest.boundaries?.[field] === false, `manifest.boundaries.${field} must remain false`);
  }
  check(sameStrings(manifest.activationRequires, [
    "programmer_projection_adapter", "1280x720_browser_smoke", "mobile_collapse_smoke",
    "save_reload_visual_parity",
  ]), "manifest activation requirements mismatch");
  for (const [field, expected] of Object.entries({
    artAssetsAvailable: 133,
    rooms: 12,
    roomsWithBaseAsset: 11,
    equipment: 27,
    equipmentWithBaseAsset: 14,
    equipmentMissingBaseAsset: 13,
    staff: 10,
    hudSurfaces: 9,
  })) check(manifest.counts?.[field] === expected, `manifest.counts.${field} mismatch`);

  check(isObject(policy), "visual policy must be an object");
  check(policy.schemaVersion === 1, "visual policy schemaVersion must be 1");
  check(policy.policyId === "vetgeme-p9-visual-state-policy", "visual policy ID mismatch");
  check(policy.policyVersion === P9_REVIEW_INPUT_V2_VERSION, "visual policy version mismatch");
  check(policy.runtimeEligible === false, "visual policy runtimeEligible must remain false");
  check(policy.direction?.redesignAllowed === false, "visual policy must forbid redesign");
  check(policy.direction?.existingClinicCompositionPreserved === true, "existing clinic composition must be preserved");
  check(policy.renderBoundaries?.rendererMayMutateSimulation === false, "renderer must not mutate simulation");
  check(policy.renderBoundaries?.visualPresenceMayGrantOwnership === false, "visual presence must not grant ownership");
  check(policy.renderBoundaries?.missingAssetMayGrantCapability === false, "missing art must not grant capability");
  check(policy.playfieldProtection?.centerPlayfieldMustRemainClear === true, "center playfield must remain clear");
  check(policy.playfieldProtection?.lowerMiddlePlayfieldMustRemainClear === true, "lower middle playfield must remain clear");
  check(policy.playfieldProtection?.mobilePersistentPanelsCollapseToChips === true, "mobile panels must collapse to chips");
  check(policy.accessibility?.reducedMotionSupported === true, "reduced motion support is required");
  check(policy.humanTextRules?.rawIdsPlayerVisible === false, "raw IDs must remain hidden");
  check(policy.humanTextRules?.technicalReasonCodesPlayerVisible === false, "reason codes must remain hidden");

  checkCatalogHeader(rooms, "vetgeme-p9-room-visual-states", "room catalog");
  checkCatalogHeader(equipment, "vetgeme-p9-equipment-visual-states", "equipment catalog");
  checkCatalogHeader(staff, "vetgeme-p9-staff-visual-states", "staff catalog");
  checkCatalogHeader(hud, "vetgeme-p9-hud-data-contract", "HUD contract");
  const p5Resources = p5ReviewInput.documents["generated/resource-catalog.json"].resources;
  checkArray(p5Resources, "P5 resources");
  const p5ByKind = Object.fromEntries(["room", "equipment", "staff"].map((kind) => [
    kind,
    p5Resources.filter((resource) => resource.resourceKind === kind).map((resource) => resource.resourceId),
  ]));
  validateVisualResources(rooms.rooms, p5ByKind.room, ROOM_STATES, "room", "visualStates");
  validateVisualResources(equipment.equipment, p5ByKind.equipment, EQUIPMENT_STATES, "equipment", "visualStates");
  validateVisualResources(staff.staff, p5ByKind.staff, STAFF_STATES, "staff", "visualStates");
  check(rooms.rooms.length === EXPECTED_COUNTS.rooms, "room count mismatch");
  check(equipment.equipment.length === EXPECTED_COUNTS.equipment, "equipment count mismatch");
  check(staff.staff.length === EXPECTED_COUNTS.staff, "staff count mismatch");

  for (const entry of rooms.rooms) {
    for (const state of Object.values(entry.visualStates)) {
      check(isNonEmptyString(state.label), `${entry.resourceId}: every room state needs a human label`);
    }
  }
  for (const entry of equipment.equipment) {
    check(isNonEmptyString(entry.title) && !entry.title.includes("_"), `${entry.resourceId}: invalid human title`);
    for (const state of Object.values(entry.visualStates)) {
      check(isNonEmptyString(state.label), `${entry.resourceId}: every equipment state needs a human label`);
    }
    if (entry.baseAssetIds.length === 0) {
      check(entry.missingAssetFallback?.capabilityMustRemainStateDriven === true, `${entry.resourceId}: missing art fallback must be state-driven`);
      check(isNonEmptyString(entry.missingAssetFallback?.label), `${entry.resourceId}: missing art needs a human label`);
    }
    if (entry.sharedAnalyzerShell) {
      check(entry.variantLabelRequired === true, `${entry.resourceId}: shared analyzer shell needs a variant label`);
    }
  }
  for (const entry of staff.staff) {
    check(entry.appearanceSelectionAuthority === "p4_identity_appearance_seed", `${entry.resourceId}: appearance authority mismatch`);
    check(entry.behaviorSelectionAuthority === "p4_owner_patient_state_not_sprite", `${entry.resourceId}: behavior authority mismatch`);
  }

  const referencedAssets = [
    ...rooms.rooms.flatMap((entry) => [
      ...entry.baseAssetIds,
      ...Object.values(entry.visualStates).flatMap((state) => state.overlayAssetIds || []),
    ]),
    ...equipment.equipment.flatMap((entry) => [
      ...entry.baseAssetIds,
      ...Object.values(entry.visualStates).flatMap((state) => state.overlayAssetIds || []),
    ]),
    ...staff.staff.flatMap((entry) => entry.candidateAssetIds),
  ];
  const uniqueReferencedAssets = sorted(new Set(referencedAssets));
  const availableAssetIds = new Set(assetIndex.assetIds);
  check(uniqueReferencedAssets.length === EXPECTED_COUNTS.referencedAssets, "referenced asset count mismatch");
  check(uniqueReferencedAssets.every((assetId) => availableAssetIds.has(assetId)), "catalog references an unknown author asset ID");

  checkArray(hud.persistentSurfaces, "HUD persistent surfaces");
  check(hud.persistentSurfaces.length === EXPECTED_COUNTS.hudSurfaces, "HUD surface count mismatch");
  const surfaceIds = hud.persistentSurfaces.map((surface) => surface.surfaceId);
  checkUnique(surfaceIds, "HUD surface IDs");
  check(sameStrings(surfaceIds, HUD_SURFACE_IDS), "HUD surface inventory mismatch");
  for (const surface of hud.persistentSurfaces) {
    check(isNonEmptyString(surface.zone), `${surface.surfaceId}: HUD zone is required`);
    check(isNonEmptyString(surface.authority), `${surface.surfaceId}: HUD authority is required`);
    checkArray(surface.fields, `${surface.surfaceId}: HUD fields`);
    check(surface.fields.length > 0 && surface.fields.every(isNonEmptyString), `${surface.surfaceId}: invalid HUD fields`);
  }
  check(hud.disclosure?.normalPlayCenterOverlay === false, "normal play center overlay must remain disabled");

  check(gaps.status === "non_blocking_dom_fallback_authored", "asset gap status mismatch");
  check(gaps.rule === "Missing art never changes simulation availability and never permits a misleading substitute without a human label.", "asset gap rule mismatch");
  check(gaps.missingRoomAssets.length === 1, "missing room asset count mismatch");
  check(gaps.missingEquipmentAssets.length === EXPECTED_COUNTS.equipmentMissingBaseAsset, "missing equipment asset count mismatch");
  check(gaps.missingRoomAssets.every((entry) => entry.fallback?.capabilityMustRemainStateDriven === true), "room asset fallback must remain state-driven");
  check(gaps.missingEquipmentAssets.every((entry) => entry.fallback?.capabilityMustRemainStateDriven === true), "equipment asset fallback must remain state-driven");
  check(gaps.sharedShellVariants.every((entry) => isNonEmptyString(entry.title)), "shared shell variants need human labels");

  check(report.status === "pass", "author validation report must pass");
  check(report.checks?.roomCoverage === 12, "author validation room coverage mismatch");
  check(report.checks?.equipmentCoverage === 27, "author validation equipment coverage mismatch");
  check(report.checks?.staffCoverage === 10, "author validation staff coverage mismatch");
  check(report.checks?.referencedAssets === 31, "author validation referenced asset count mismatch");
  check(report.checks?.missingAssetReferences === 0, "author validation contains unknown asset references");
  check(report.checks?.hudSurfaces === 9, "author validation HUD count mismatch");
  check(report.checks?.redesignPerformed === false, "author package must not perform redesign");
  check(report.checks?.runtimeChanged === false, "author package must not change runtime");

  return deepFreeze({
    counts: {
      ...EXPECTED_COUNTS,
      p5Resources: p5Resources.length,
      exactP5RoomMatches: p5ByKind.room.length,
      exactP5EquipmentMatches: p5ByKind.equipment.length,
      exactP5StaffMatches: p5ByKind.staff.length,
      missingRoomAssets: gaps.missingRoomAssets.length,
      sharedShellVariants: gaps.sharedShellVariants.length,
    },
    sourceBoundaries: clone(manifest.boundaries),
    renderBoundaries: clone(policy.renderBoundaries),
    activationRequires: clone(manifest.activationRequires),
    missingRoomResourceIds: gaps.missingRoomAssets.map((entry) => entry.resourceId),
    missingEquipmentResourceIds: gaps.missingEquipmentAssets.map((entry) => entry.resourceId),
    sharedShellResourceIds: gaps.sharedShellVariants.map((entry) => entry.resourceId),
    referencedAssetIds: uniqueReferencedAssets,
  });
}

function validateVisualResources(entries, expectedResourceIds, expectedStates, kind, stateField) {
  checkArray(entries, `${kind} visual resources`);
  const resourceIds = entries.map((entry) => entry.resourceId);
  checkUnique(resourceIds, `${kind} visual resource IDs`);
  check(sameStrings(resourceIds, expectedResourceIds), `${kind} visual resources do not exactly join P5 .2`);
  for (const entry of entries) {
    check(isNonEmptyString(entry.resourceId), `${kind}: resourceId is required`);
    check(isObject(entry[stateField]), `${entry.resourceId}: visual states are required`);
    check(sameStrings(Object.keys(entry[stateField]), expectedStates), `${entry.resourceId}: visual state inventory mismatch`);
  }
}
