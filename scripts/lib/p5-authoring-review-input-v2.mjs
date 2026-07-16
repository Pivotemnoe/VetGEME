import { createHash } from "node:crypto";

import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
  validateReviewInputRegistry,
} from "./medical-authoring-review-input.mjs";
import { loadOperationalAuthoringReviewInputV4FromReader } from "./operational-authoring-review-input-v4.mjs";

export const P5_REVIEW_INPUT_V2_ID = "vetgeme-p5-production-authoring";
export const P5_REVIEW_INPUT_V2_VERSION = "2026.07.16.2";
export const P5_REVIEW_INPUT_V2_ROOT =
  "content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.2";
export const P5_REVIEW_INPUT_V2_CONTEXT = "review";
export const P5_REVIEW_INPUT_V2_STATUS = "author_validated_programmer_integration_required";

const BASELINE_MANIFEST_PATH = "content/packs/tier-01-v2/clinical/tier-01/manifest.json";
const CAPABILITY_REGISTRY_PATH =
  "content/system-packs/vetgeme-master-2026-07-14/capability-registry.json";
const CAPABILITY_REGISTRY_SHA256 =
  "16ff64c015a8edb302c15289540a4ed760cfc356d832bca31094f992b1da3c81";
const OPERATIONAL_V4_ROOT =
  "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.4/source";
const OPERATIONAL_V4_AGGREGATE_SHA256 =
  "c7bb0bd0232ba765a5b3e8a8f0c093e7410e20a9aa435f1e3e3ece6c9f920764";
const OPERATIONAL_V4_PROVENANCE_SHA256 =
  "e4e60e12f66b5c84166b530ec0ad8da20073be95533be06a0d3940db2ad5a92a";
const OPERATIONAL_V4_ARCHIVE_SHA256 =
  "0e2fed94349ddfd8b5ace8d19a3e2da723c13bf46ec894b067d56eff5c6854d5";
const OPERATIONAL_V4_DIGESTS = Object.freeze({
  p3Research: "7bd5694c608c695399fb09c3fe848a530d5bdc1095dd6be821e571c9da587556",
  p3Usages: "d50d175edc177ce11714e1a0df5b94b6c933f2773395114c812ff2da3dd53f08",
  p6Economy: "e3eff3abba3f4b3d7b9f07b1caa7335b5b01c391973dd1647a16ecf858dcd23f",
  p6ExactCrosswalk: "61a44ff5096c2077635e26b9785a7cbeea0a525b4d6e0f9d395bc12d9f837598",
  p3ExactSourceCrosswalk: "ac185625688fb1b1759c59ef74cf8229cac192d61042c78071be48d2a5a4e012",
});
const P5_SENTINEL_AUTHORITY = "medical_family_presentation_investigation_result";
const OPERATIONAL_MEDICAL_AUTHORITY = "medical_family.presentation.investigations[].result_only";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const TASK_BEARING_MODES = new Set([
  "schedulable_task",
  "external_coordination",
  "explicit_alternative_resolution",
]);
const ACTIVATION_REQUIREMENTS = Object.freeze([
  "programmer_adapter",
  "runtime_browser_smoke",
  "save_reload_replay",
  "product_owner_staffing_acceptance",
]);
const LIFECYCLE_COMMANDS = Object.freeze([
  "hire_staff",
  "assign_shift",
  "update_shift",
  "remove_shift",
  "purchase_asset",
  "mark_delivery_complete",
  "complete_training",
  "mark_room_ready",
  "start_maintenance",
  "complete_maintenance",
  "receive_stock",
  "consume_stock",
  "retire_asset",
]);
const ACTIVE_PHYSICAL_RESOURCE_IDS = Object.freeze([
  "equipment.microscope",
  "equipment.otoscope",
  "room.consult.1",
  "room.lab.basic",
  "room.reception.1",
  "room.storage.1",
  "room.waiting.1",
]);
const HIRED_UNSCHEDULED_DOCTOR_IDS = Object.freeze([
  "staff.doctor.morozov",
  "staff.doctor.sokolova",
]);
const EXPECTED_COUNTS = Object.freeze({
  sourceFiles: 23,
  sourceBytes: 4007080,
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
  productionPool: 0,
});
const JSON_PATHS = Object.freeze([
  "MANIFEST.json",
  "source/p5-policy.json",
  "source/p5-exact-capability-resource-map.json",
  "source/p5-resource-lifecycle.json",
  "source/p5-handoff-contract.json",
  "generated/resource-catalog.json",
  "generated/visit-task-catalog.json",
  "generated/capability-operations-map.json",
  "generated/research-task-catalog.json",
  "generated/investigation-usage-task-map.json",
  "generated/recommended-30-day-staffing.json",
  "generated/operational-policies.json",
  "generated/resource-lifecycle-catalog.json",
  "reports/P5_V2_AUTHOR_DECISION_MATRIX.json",
  "reports/VALIDATION_REPORT.json",
]);

function fail(message) {
  throw new Error(`P5 .2 authoring review input validation failed: ${message}`);
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

function checkArray(value, label) {
  check(Array.isArray(value), `${label} must be an array`);
  return value;
}

function checkInteger(value, label) {
  check(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative safe integer`);
}

function checkUnique(values, label) {
  check(new Set(values).size === values.length, `${label} contain duplicates`);
}

function isSafeRelativePath(value) {
  if (!isNonEmptyString(value) || value.startsWith("/") || value.includes("\\")) return false;
  return value.split("/").every((part) => part && part !== "." && part !== "..");
}

function checkSafePath(value, label) {
  check(isSafeRelativePath(value), `${label} must be a safe relative path`);
}

function sorted(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right), "en"));
}

function sameStrings(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function makeBlocker(id, summary, details) {
  return deepFreeze({ id, status: "unresolved", summary, details: clone(details) });
}

function validateHeader(document, expectedId, label) {
  check(isObject(document), `${label} must be an object`);
  check(document.schemaVersion === 1, `${label}.schemaVersion must be 1`);
  check(document.catalogId === expectedId, `${label}.catalogId mismatch`);
  check(document.catalogVersion === P5_REVIEW_INPUT_V2_VERSION, `${label}.catalogVersion mismatch`);
  check(document.runtimeEligible === false, `${label}.runtimeEligible must remain false`);
}

export function validateP5ReviewInputV2Registration(registration) {
  check(isObject(registration), "review input registration must be an object");
  check(registration.reviewInputId === P5_REVIEW_INPUT_V2_ID, "unexpected reviewInputId");
  check(registration.reviewInputVersion === P5_REVIEW_INPUT_V2_VERSION, "unexpected reviewInputVersion");
  check(registration.kind === "p5_authoring", "review input kind must be p5_authoring");
  check(registration.packageId === P5_REVIEW_INPUT_V2_ID, "packageId mismatch");
  check(registration.packageVersion === P5_REVIEW_INPUT_V2_VERSION, "packageVersion mismatch");
  check(registration.root === P5_REVIEW_INPUT_V2_ROOT, "versioned P5 .2 review root mismatch");
  checkSafePath(registration.root, "root");
  check(registration.sourceRoot === "source", "sourceRoot must be source");
  check(registration.manifestPath === "source/MANIFEST.json", "manifestPath mismatch");
  check(registration.provenancePath === "provenance.json", "provenancePath mismatch");
  check(registration.status === P5_REVIEW_INPUT_V2_STATUS, "status mismatch");
  check(registration.reviewOnly === true, "reviewOnly must be true");
  check(registration.productionEligible === false, "productionEligible must be false");
  check(registration.runtimeEligible === false, "runtimeEligible must be false");
  check(registration.allowCurrentCaseCrosswalk === false, "allowCurrentCaseCrosswalk must be false");
  check(registration.allowRuntimeActivation === false, "allowRuntimeActivation must be false");
  check(registration.allowAutomaticP6Crosswalk === false, "allowAutomaticP6Crosswalk must be false");
  check(registration.allowMedicalAuthorityNormalization === false, "medical authority normalization must be forbidden");
  check(sameJson(registration.authorSourceSupersession, {
    supersedesReviewInputVersion: "2026.07.16.1",
    priorVersionPreserved: true,
  }), "P5 .2 author-source supersession contract mismatch");

  check(isObject(registration.expectedCounts), "expectedCounts are required");
  for (const [field, expected] of Object.entries(EXPECTED_COUNTS)) {
    checkInteger(registration.expectedCounts[field], `expectedCounts.${field}`);
    check(registration.expectedCounts[field] === expected, `expectedCounts.${field} must be ${expected}`);
  }
  check(isObject(registration.sourceIntegrity), "sourceIntegrity is required");
  for (const field of ["provenanceSha256", "aggregateSha256", "archiveSha256"]) {
    check(SHA256_PATTERN.test(registration.sourceIntegrity[field] || ""), `sourceIntegrity.${field} is invalid`);
  }
  check(
    registration.sourceIntegrity.provenanceSha256 ===
      "f5f54786a0a670d3c9fa1fc8c27b003dc76b2593772b61c21a07523121b829e5",
    "P5 .2 provenance digest mismatch",
  );
  check(
    registration.sourceIntegrity.aggregateSha256 ===
      "db30b1feacd01fdab2cd6d750b59892c250d4e15eab01d1cd363c49b64dc6ad3",
    "P5 .2 aggregate digest mismatch",
  );
  check(
    registration.sourceIntegrity.archiveSha256 ===
      "665183acc97096477dd9366b8116a65a11862e4919d02170278f8e97e241a7ab",
    "P5 .2 archive digest mismatch",
  );
  check(
    registration.sourceIntegrity.manifestSha256 ===
      "25730b20dcc3d0ac840082f353ccea14d11c35aa9c107bf2cb52ccd21e3e69c6",
    "P5 .2 manifest digest mismatch",
  );
  check(isObject(registration.capabilityRegistry), "capabilityRegistry is required");
  check(registration.capabilityRegistry.registryId === "vetgeme-clinic-capabilities", "capability registry ID mismatch");
  check(registration.capabilityRegistry.registryVersion === "2026.07.14.38", "capability registry version mismatch");
  check(registration.capabilityRegistry.path === CAPABILITY_REGISTRY_PATH, "capability registry path mismatch");
  check(registration.capabilityRegistry.sha256 === CAPABILITY_REGISTRY_SHA256, "capability registry digest mismatch");

  const operational = registration.operationalReviewInput;
  check(isObject(operational), "operationalReviewInput is required");
  check(
    operational.reviewInputId === "vetgeme-operational-production-authoring"
      && operational.reviewInputVersion === "2026.07.16.4",
    "operational .4 dependency identity mismatch",
  );
  check(operational.reviewOnly === true, "operational .4 dependency must remain review-only");
  check(operational.runtimeEligible === false, "operational .4 dependency must remain runtime-ineligible");
  check(operational.sourceIntegrity?.provenanceSha256 === OPERATIONAL_V4_PROVENANCE_SHA256, "operational .4 provenance digest mismatch");
  check(operational.sourceIntegrity?.aggregateSha256 === OPERATIONAL_V4_AGGREGATE_SHA256, "operational .4 aggregate digest mismatch");
  check(operational.sourceIntegrity?.archiveSha256 === OPERATIONAL_V4_ARCHIVE_SHA256, "operational .4 archive digest mismatch");
  for (const [field, digest] of Object.entries(OPERATIONAL_V4_DIGESTS)) {
    check(operational.catalogSha256?.[field] === digest, `operational .4 ${field} digest mismatch`);
  }
  return registration;
}

export function resolveP5AuthoringReviewInputV2(registry, options = {}) {
  const registrations = validateReviewInputRegistry(registry);
  check(Object.prototype.hasOwnProperty.call(options, "context"), "explicit review context is required");
  check(
    options.context === P5_REVIEW_INPUT_V2_CONTEXT,
    `context ${String(options.context)} is forbidden; review is the only allowed context`,
  );
  const requestedId = options.reviewInputId || P5_REVIEW_INPUT_V2_ID;
  const requestedVersion = options.reviewInputVersion || P5_REVIEW_INPUT_V2_VERSION;
  check(requestedVersion === P5_REVIEW_INPUT_V2_VERSION, "v2 loader refuses non-.2 P5 input");
  const registration = registrations.find((entry) => (
    entry.reviewInputId === requestedId && entry.reviewInputVersion === requestedVersion
  ));
  check(registration, `unknown review input ${requestedId}@${requestedVersion}`);
  return validateP5ReviewInputV2Registration(registration);
}

export function validateP5V2SourceProvenance(registration, provenance, sourceFiles, sourceBytesByPath) {
  const identity = `${registration.reviewInputId}@${registration.reviewInputVersion}`;
  check(isObject(provenance), `${identity}: provenance is missing`);
  check(provenance.schemaVersion === 1, `${identity}: provenance schemaVersion must be 1`);
  check(provenance.provenanceId === "vetgeme-p5-production-authoring-review-source", `${identity}: provenanceId mismatch`);
  check(provenance.packageId === registration.packageId, `${identity}: provenance packageId mismatch`);
  check(provenance.packageVersion === registration.packageVersion, `${identity}: provenance packageVersion mismatch`);
  check(provenance.sourceArchive === "p5-production-authoring-2026.07.16.2.zip", `${identity}: source archive mismatch`);
  check(provenance.sourceDirectory === "p5-production-authoring-2026.07.16.2", `${identity}: source directory mismatch`);
  check(isObject(provenance.archive), `${identity}: archive provenance is missing`);
  check(provenance.archive.path === provenance.sourceArchive, `${identity}: archive path mismatch`);
  check(provenance.archive.checksumPath === "p5-production-authoring-2026.07.16.2.zip.sha256", `${identity}: checksum path mismatch`);
  check(provenance.archive.sha256 === registration.sourceIntegrity.archiveSha256, `${identity}: archive digest mismatch`);
  check(provenance.archive.zipEntryCount === 29, `${identity}: archive entry count mismatch`);
  check(provenance.archive.extractedFileCount === EXPECTED_COUNTS.sourceFiles, `${identity}: archive file count mismatch`);
  check(provenance.archive.extractedBytes === EXPECTED_COUNTS.sourceBytes, `${identity}: archive byte count mismatch`);
  check(provenance.sourceFileCount === EXPECTED_COUNTS.sourceFiles, `${identity}: provenance file count mismatch`);
  check(provenance.sourceBytes === EXPECTED_COUNTS.sourceBytes, `${identity}: provenance byte count mismatch`);
  check(provenance.aggregateSha256 === registration.sourceIntegrity.aggregateSha256, `${identity}: aggregate digest mismatch`);
  checkArray(provenance.files, `${identity}: provenance files`);
  check(provenance.files.length === EXPECTED_COUNTS.sourceFiles, `${identity}: provenance inventory count mismatch`);
  const listedPaths = provenance.files.map((file) => file.path);
  checkUnique(listedPaths, `${identity}: provenance file paths`);
  check(sameStrings(sourceFiles, listedPaths), `${identity}: source file set differs from provenance`);
  let verifiedBytes = 0;
  for (const file of provenance.files) {
    check(isObject(file), `${identity}: invalid provenance file entry`);
    checkSafePath(file.path, `${identity}: provenance file path`);
    check(file.originPath === `${provenance.sourceDirectory}/${file.path}`, `${identity}: originPath mismatch for ${file.path}`);
    checkInteger(file.bytes, `${identity}: ${file.path} bytes`);
    check(SHA256_PATTERN.test(file.sha256 || ""), `${identity}: ${file.path} digest is invalid`);
    const bytes = sourceBytesByPath.get(file.path);
    check(bytes !== undefined, `${identity}: source file is missing: ${file.path}`);
    check(bytes.length === file.bytes, `${identity}: byte length mismatch for ${file.path}`);
    check(sha256(bytes) === file.sha256, `${identity}: SHA-256 mismatch for ${file.path}`);
    verifiedBytes += bytes.length;
  }
  check(verifiedBytes === provenance.sourceBytes, `${identity}: verified source byte total mismatch`);
  const aggregate = createHash("sha256");
  for (const file of provenance.files) aggregate.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`, "utf8");
  check(aggregate.digest("hex") === provenance.aggregateSha256, `${identity}: inventory digest mismatch`);
  check(isObject(provenance.archive.keyFileHashes), `${identity}: key file hashes are missing`);
  check(Object.keys(provenance.archive.keyFileHashes).length === 11, `${identity}: key file hash count mismatch`);
  for (const [relativePath, expectedHash] of Object.entries(provenance.archive.keyFileHashes)) {
    const file = provenance.files.find((entry) => entry.path === relativePath);
    check(file?.sha256 === expectedHash, `${identity}: key-file digest mismatch for ${relativePath}`);
  }
  return deepFreeze({
    sourceFiles: provenance.files.length,
    sourceBytes: verifiedBytes,
    keyFilesVerified: Object.keys(provenance.archive.keyFileHashes).length,
    provenanceSha256: registration.sourceIntegrity.provenanceSha256,
    aggregateSha256: provenance.aggregateSha256,
    archiveSha256: provenance.archive.sha256,
  });
}

function validateCapabilityRegistry(registration, capabilityRegistry, capabilityBytes) {
  check(sha256(capabilityBytes) === registration.capabilityRegistry.sha256, "capability registry SHA-256 mismatch");
  check(capabilityRegistry.schemaVersion === 1, "capability registry schemaVersion mismatch");
  check(capabilityRegistry.registryId === registration.capabilityRegistry.registryId, "capability registry ID mismatch");
  check(capabilityRegistry.registryVersion === registration.capabilityRegistry.registryVersion, "capability registry version mismatch");
  checkArray(capabilityRegistry.capabilities, "capabilityRegistry.capabilities");
  check(capabilityRegistry.capabilities.length === EXPECTED_COUNTS.capabilitiesMapped, "capability registry count mismatch");
  const ids = capabilityRegistry.capabilities.map((record) => record.id);
  check(ids.every(isNonEmptyString), "capability registry contains an invalid ID");
  checkUnique(ids, "capability registry IDs");
  return new Set(ids);
}

function validateRequirementGroups(groups, resourcesById, label) {
  checkArray(groups, `${label}.requirementGroups`);
  const groupIds = groups.map((group) => group.id);
  check(groupIds.every(isNonEmptyString), `${label}: requirement group ID is invalid`);
  checkUnique(groupIds, `${label}: requirement group IDs`);
  for (const group of groups) {
    checkArray(group.anyOf, `${label}/${group.id}.anyOf`);
    check(group.anyOf.length > 0, `${label}/${group.id}.anyOf must not be empty`);
    for (const option of group.anyOf) {
      check(isNonEmptyString(option.resourceId), `${label}/${group.id}: resourceId is missing`);
      check(isNonEmptyString(option.capabilityId), `${label}/${group.id}: capabilityId is missing`);
      check(Number.isSafeInteger(option.units) && option.units > 0, `${label}/${group.id}: units must be positive`);
      const resource = resourcesById.get(option.resourceId);
      check(resource, `${label}/${group.id}: unknown resource ${option.resourceId}`);
      check(
        resource.runtimeResourceTemplate.capabilities.includes(option.capabilityId),
        `${label}/${group.id}: ${option.resourceId} lacks ${option.capabilityId}`,
      );
    }
  }
}

export function validateP5AuthoringPackageV2({
  registration,
  documents,
  sourceFiles,
  sourceBytesByPath,
  capabilityRegistry,
  capabilityBytes,
  baselineManifest,
  operationalReviewInput,
}) {
  validateP5ReviewInputV2Registration(registration);
  const capabilityRegistryIds = validateCapabilityRegistry(registration, capabilityRegistry, capabilityBytes);
  const manifest = documents["MANIFEST.json"];
  check(
    sha256(sourceBytesByPath.get("MANIFEST.json")) === registration.sourceIntegrity.manifestSha256,
    "P5 .2 manifest SHA-256 mismatch",
  );
  check(manifest.schemaVersion === 1, "P5 .2 manifest schemaVersion must be 1");
  check(manifest.packageId === registration.packageId, "P5 .2 manifest packageId mismatch");
  check(manifest.packageVersion === registration.packageVersion, "P5 .2 manifest packageVersion mismatch");
  check(manifest.status === registration.status, "P5 .2 manifest status mismatch");
  check(manifest.runtimeEligible === false, "P5 .2 manifest runtimeEligible must remain false");
  check(sameStrings(manifest.activationRequires, ACTIVATION_REQUIREMENTS), "P5 .2 activation requirements changed");
  check(manifest.boundaries?.medicalTruthAllowed === false, "P5 .2 must not author medical truth");
  check(manifest.boundaries?.rendererGrantsOwnership === false, "renderer must not grant ownership");
  check(manifest.boundaries?.fatigueChangesClinicalResult === false, "fatigue must not change clinical results");
  check(manifest.boundaries?.p3OwnsResearchResults === true, "P3 must retain result authority");
  check(manifest.boundaries?.saveSchemaChange === false, "P5 .2 must not change save schema");
  check(manifest.boundaries?.newCampaignsOnly === true, "P5 .2 must remain new-campaign-only");
  check(manifest.sources?.capabilityRegistryId === registration.capabilityRegistry.registryId, "manifest capability registry ID mismatch");
  check(manifest.sources?.capabilityRegistryVersion === registration.capabilityRegistry.registryVersion, "manifest capability registry version mismatch");
  check(manifest.sources?.p3ResearchCatalogVersion === P5_REVIEW_INPUT_V2_VERSION, "P3 research source version mismatch");
  check(manifest.sources?.p3UsageCatalogVersion === P5_REVIEW_INPUT_V2_VERSION, "P3 usage source version mismatch");
  check(manifest.sources?.p6EconomyCatalogVersion === P5_REVIEW_INPUT_V2_VERSION, "P6 economy source version mismatch");
  checkArray(manifest.files, "P5 .2 manifest files");
  checkUnique(manifest.files, "P5 .2 manifest files");
  check(sameStrings(manifest.files, sourceFiles), "P5 .2 manifest and provenance file sets differ");
  for (const [field, expected] of Object.entries({
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
  })) check(manifest.counts?.[field] === expected, `P5 .2 manifest count ${field} mismatch`);
  check(manifest.validation?.status === "pass", "P5 .2 manifest validation status mismatch");
  check(manifest.validation?.runtimeTasksValidated === 2606, "P5 .2 manifest runtime task evidence mismatch");
  check(manifest.validation?.simulatedCampaigns === 10000, "P5 .2 manifest campaign evidence mismatch");
  check(manifest.validation?.simulatedDemandDays === 300000, "P5 .2 manifest demand-day evidence mismatch");

  const policy = documents["source/p5-policy.json"];
  const exactMap = documents["source/p5-exact-capability-resource-map.json"];
  const lifecycle = documents["source/p5-resource-lifecycle.json"];
  const handoff = documents["source/p5-handoff-contract.json"];
  const resources = documents["generated/resource-catalog.json"];
  const visits = documents["generated/visit-task-catalog.json"];
  const generatedMap = documents["generated/capability-operations-map.json"];
  const research = documents["generated/research-task-catalog.json"];
  const usages = documents["generated/investigation-usage-task-map.json"];
  const staffing = documents["generated/recommended-30-day-staffing.json"];
  const generatedPolicies = documents["generated/operational-policies.json"];
  const generatedLifecycle = documents["generated/resource-lifecycle-catalog.json"];
  const decisionMatrix = documents["reports/P5_V2_AUTHOR_DECISION_MATRIX.json"];
  const validationReport = documents["reports/VALIDATION_REPORT.json"];

  validateHeader(policy, "vetgeme-p5-operations-authoring", "source P5 policy");
  validateHeader(exactMap, "vetgeme-p5-exact-capability-resource-map", "source exact capability map");
  validateHeader(lifecycle, "vetgeme-p5-resource-lifecycle", "source resource lifecycle");
  validateHeader(resources, "vetgeme-p5-resource-catalog", "resource catalog");
  validateHeader(visits, "vetgeme-p5-visit-task-catalog", "visit task catalog");
  validateHeader(generatedMap, "vetgeme-p5-capability-operations-map", "capability operations map");
  validateHeader(research, "vetgeme-p5-research-task-catalog", "research task catalog");
  validateHeader(usages, "vetgeme-p5-investigation-usage-task-map", "investigation usage map");
  validateHeader(staffing, "vetgeme-p5-recommended-staffing", "staffing catalog");
  validateHeader(generatedPolicies, "vetgeme-p5-operational-policies", "operational policies");
  validateHeader(generatedLifecycle, "vetgeme-p5-resource-lifecycle-runtime-contract", "resource lifecycle catalog");
  check(policy.matchTokensRuntimeForbidden === true, "token/substring runtime matching must be forbidden");
  check(policy.capabilityResourceAuthority === "source/p5-exact-capability-resource-map.json", "exact map authority path mismatch");
  check(policy.lifecycleAuthority === "source/p5-resource-lifecycle.json", "lifecycle authority path mismatch");
  check(sameJson(policy.boundaries, manifest.boundaries), "source policy and manifest boundaries differ");
  check(policy.staff.length === 10, "source policy staff count mismatch");
  check(
    sameStrings(policy.staff.filter((record) => record.startsHired).map((record) => record.staffId), HIRED_UNSCHEDULED_DOCTOR_IDS),
    "source policy must start exactly Sokolova and Morozov hired",
  );
  check(policy.rooms.length === 12, "source policy room count mismatch");
  check(
    sameStrings(
      policy.rooms.filter((record) => record.startsOwned).map((record) => record.roomId),
      ACTIVE_PHYSICAL_RESOURCE_IDS.filter((id) => id.startsWith("room.")),
    ),
    "source policy must start exactly five rooms owned",
  );
  check(sameJson(exactMap.capabilities, generatedMap.capabilities), "source and generated canonical capability maps differ");
  check(sameJson(exactMap.supplementalCapabilities, generatedMap.supplementalCapabilities), "source and generated supplemental capability maps differ");
  check(sameJson(lifecycle.commands, generatedPolicies.lifecycleCommands), "source and generated lifecycle commands differ");
  check(sameJson(lifecycle.invariants, generatedPolicies.lifecycleInvariants), "source and generated lifecycle invariants differ");
  for (const field of [
    "commands",
    "roomAssets",
    "startingInventory",
    "startingEquipmentEvidence",
    "resourceLifecycleSeeds",
    "invariants",
  ]) check(sameJson(lifecycle[field], generatedLifecycle[field]), `source and generated lifecycle ${field} differ`);
  check(sameJson(policy.handoffPolicies, handoff.policyBreakpoints), "policy and handoff breakpoints differ");
  check(sameJson(policy.handoffPolicies, generatedPolicies.handoffPolicies), "source and generated handoff policies differ");
  check(sameJson(policy.handoffRuntimeContract.commandFields, handoff.commandFields), "handoff command fields differ");
  check(sameJson(policy.handoffRuntimeContract.reassignmentFields, handoff.reassignmentFields), "handoff reassignment fields differ");

  checkArray(resources.resources, "resources.resources");
  check(resources.resources.length === EXPECTED_COUNTS.totalResources, "resource count mismatch");
  const resourceIds = resources.resources.map((record) => record.resourceId);
  check(resourceIds.every(isNonEmptyString), "resource catalog contains an invalid ID");
  checkUnique(resourceIds, "resource IDs");
  const resourcesById = new Map(resources.resources.map((record) => [record.resourceId, record]));
  const resourceKinds = Object.groupBy
    ? Object.groupBy(resources.resources, (record) => record.resourceKind)
    : resources.resources.reduce((groups, record) => {
      (groups[record.resourceKind] ||= []).push(record);
      return groups;
    }, {});
  check((resourceKinds.staff || []).length === 10, "staff resource count mismatch");
  check((resourceKinds.room || []).length === 12, "room resource count mismatch");
  check((resourceKinds.equipment || []).length === 27, "equipment resource count mismatch");
  const activeIds = sorted(resources.resources.filter((record) => record.startsActive).map((record) => record.resourceId));
  check(sameStrings(activeIds, ACTIVE_PHYSICAL_RESOURCE_IDS), "exact seven-resource physical start set mismatch");
  check(resources.resources.filter((record) => record.resourceKind === "staff" && record.startsActive).length === 0, "staff must not start scheduler-active");
  for (const resource of resources.resources) {
    check(resource.runtimeResourceTemplate?.id === resource.resourceId, `${resource.resourceId}: runtime resource ID mismatch`);
    check(Number.isSafeInteger(resource.runtimeResourceTemplate.capacity) && resource.runtimeResourceTemplate.capacity > 0, `${resource.resourceId}: invalid capacity`);
    checkArray(resource.runtimeResourceTemplate.capabilities, `${resource.resourceId}: capabilities`);
    checkUnique(resource.runtimeResourceTemplate.capabilities, `${resource.resourceId}: capabilities`);
  }

  checkArray(lifecycle.resourceLifecycleSeeds, "resource lifecycle seeds");
  check(lifecycle.resourceLifecycleSeeds.length === 49, "resource lifecycle seed count mismatch");
  const seedIds = lifecycle.resourceLifecycleSeeds.map((record) => record.resourceId);
  check(seedIds.every(isNonEmptyString), "resource lifecycle seeds contain an invalid ID");
  checkUnique(seedIds, "resource lifecycle seed IDs");
  const seedsById = new Map(lifecycle.resourceLifecycleSeeds.map((record) => [record.resourceId, record]));
  check(sameStrings([...seedsById.keys()], [...resourcesById.keys()]), "resource and lifecycle seed sets differ");
  for (const id of HIRED_UNSCHEDULED_DOCTOR_IDS) {
    check(seedsById.get(id)?.state === "hired_unscheduled", `${id} must start hired_unscheduled`);
    check(resourcesById.get(id)?.startsActive === false, `${id} must require an explicit shift before activation`);
    check(sameStrings(resourcesById.get(id)?.activationRequirements || [], ["valid_shift"]), `${id} activation evidence mismatch`);
  }
  for (const resource of resourceKinds.staff || []) {
    if (HIRED_UNSCHEDULED_DOCTOR_IDS.includes(resource.resourceId)) continue;
    check(seedsById.get(resource.resourceId)?.state === "not_hired", `${resource.resourceId} must start not_hired`);
  }
  checkArray(lifecycle.commands, "lifecycle commands");
  check(sameStrings(lifecycle.commands.map((record) => record.command), LIFECYCLE_COMMANDS), "lifecycle command inventory mismatch");
  check(lifecycle.invariants?.unlockIsNotOwnership === true, "unlock must not imply ownership");
  check(lifecycle.invariants?.purchaseDoesNotActivate === true, "purchase must not activate a resource");
  check(lifecycle.invariants?.visualPresenceDoesNotActivate === true, "visual presence must not activate a resource");
  check(lifecycle.invariants?.missingEvidenceFailsClosed === true, "missing lifecycle evidence must fail closed");
  check(lifecycle.invariants?.savePersistsCommandsAndDerivedResourceState === true, "lifecycle commands and derived state must persist");
  check(lifecycle.invariants?.saveSchemaChangeAllowedWithoutMigration === false, "save schema changes without migration must remain forbidden");
  check(lifecycle.roomAssets.length === 12, "room asset count mismatch");
  check(lifecycle.startingInventory.length === 10, "starting inventory category count mismatch");
  check(lifecycle.startingEquipmentEvidence.length === 2, "starting equipment evidence count mismatch");
  check(
    sameStrings(
      lifecycle.startingEquipmentEvidence.map((record) => record.resourceId),
      ACTIVE_PHYSICAL_RESOURCE_IDS.filter((id) => id.startsWith("equipment.")),
    ),
    "starting equipment evidence must cover exactly otoscope and microscope",
  );
  check(lifecycle.roomAssets.every((record) => record.visualPresenceGrantsOwnership === false), "room visuals must not grant ownership");

  checkArray(exactMap.capabilities, "exact canonical capabilities");
  checkArray(exactMap.supplementalCapabilities, "exact supplemental capabilities");
  check(exactMap.capabilities.length === 447, "canonical capability map count mismatch");
  check(exactMap.supplementalCapabilities.length === 8, "supplemental capability map count mismatch");
  const canonicalIds = exactMap.capabilities.map((record) => record.capabilityId);
  const supplementalIds = exactMap.supplementalCapabilities.map((record) => record.capabilityId);
  checkUnique(canonicalIds, "canonical capability IDs");
  checkUnique(supplementalIds, "supplemental capability IDs");
  check(sameStrings(canonicalIds, [...capabilityRegistryIds]), "canonical capability map must exactly cover the registry");
  check(supplementalIds.every((id) => !capabilityRegistryIds.has(id)), "supplemental capabilities must stay separate from the canonical registry");
  check(exactMap.capabilities.every((record) => record.mappingAuthority === "author_frozen_exact_capability_resource_map_v2"), "canonical mapping authority drifted");
  check(exactMap.capabilities.every((record) => record.tokenOrSubstringResolutionForbidden === true), "canonical token matching must remain forbidden");
  check(exactMap.supplementalCapabilities.every((record) => record.resolutionMode === "exact_authored_resource_ids"), "supplemental resolution must remain exact");
  check(exactMap.supplementalCapabilities.every((record) => record.unknownOrUnavailableFailsClosed === true), "supplemental unknowns must fail closed");
  for (const capability of exactMap.capabilities) {
    validateRequirementGroups(capability.requirementGroups, resourcesById, `capability ${capability.capabilityId}`);
  }

  check(visits.tasks.length === 14, "visit task count mismatch");
  check(research.researchTasks.length === 361, "research task count mismatch");
  check(usages.usageTasks.length === 1864, "investigation usage count mismatch");
  check(staffing.days.length === 30, "staffing day count mismatch");
  check(staffing.authority === "recommendation_only_player_choice_persists_actual_shift", "staffing recommendation must not become schedule authority");
  for (const task of visits.tasks) validateRequirementGroups(task.runtimeTemplate.requirementGroups, resourcesById, `visit ${task.taskTemplateId}`);
  for (const task of research.researchTasks) validateRequirementGroups(task.runtimeTemplate.requirementGroups, resourcesById, `research ${task.researchId}`);
  const taskBearingCapabilities = exactMap.capabilities.filter((record) => TASK_BEARING_MODES.has(record.executionMode));
  check(
    visits.tasks.length + research.researchTasks.length + usages.usageTasks.length + taskBearingCapabilities.length === 2606,
    "runtime task configuration count mismatch",
  );

  check(handoff.schemaVersion === 1, "handoff contract schemaVersion mismatch");
  check(handoff.contractId === "vetgeme-p5-handoff-contract", "handoff contract ID mismatch");
  check(handoff.contractVersion === P5_REVIEW_INPUT_V2_VERSION, "handoff contract version mismatch");
  check(sameStrings(handoff.allowedTaskStates, ["active"]), "handoff must be limited to active tasks");
  check(sameJson(handoff.commandFields, ["commandId", "taskId", "at", "reassignments"]), "handoff command field contract mismatch");
  check(sameJson(handoff.reassignmentFields, ["groupId", "fromResourceId", "toResourceId", "capabilityId", "units"]), "handoff reassignment field contract mismatch");
  check(handoff.medicalPayloadForbidden === true, "handoff must not mutate medical payload");
  for (const invariant of [
    "target_resource_must_be_active_available_and_capable",
    "source_reservation_owned_before_command",
    "all_reassignments_validate_before_any_mutation",
    "release_and_reserve_are_atomic",
    "elapsed_work_and_medical_payload_are_unchanged",
    "command_id_is_idempotent",
    "reload_reconstructs_same_reservation_ownership",
  ]) check(handoff.invariants.includes(invariant), `handoff invariant missing: ${invariant}`);
  for (const forbidden of [
    "handoff_before_task_start",
    "handoff_after_task_completion",
    "partial_reassignment_commit",
    "renderer_owned_reservation",
    "medical_result_mutation",
  ]) check(handoff.forbidden.includes(forbidden), `handoff forbidden behavior missing: ${forbidden}`);

  check(decisionMatrix.reportId === "vetgeme-p5-v2-author-decision-matrix", "P5 .2 decision matrix ID mismatch");
  check(decisionMatrix.reportVersion === P5_REVIEW_INPUT_V2_VERSION, "P5 .2 decision matrix version mismatch");
  check(decisionMatrix.staffingCoverage.length === 24, "staff skill coverage count mismatch");
  check(decisionMatrix.counts?.uncoveredStaffSkills === 0, "staff skills must have exact coverage");
  check(decisionMatrix.productOwnerDecision?.accepted === false, "product-owner staffing acceptance must remain external");
  check(decisionMatrix.gates?.capabilityTokenMatchingAllowed === false, "capability token matching gate drifted");
  check(decisionMatrix.gates?.lifecycleStateMayBeInferredFromVisual === false, "visual lifecycle inference gate drifted");
  check(decisionMatrix.gates?.handoffMayMutateMedicalPayload === false, "handoff medical boundary drifted");
  check(decisionMatrix.gates?.unknownResourceFailsClosed === true, "unknown resources must fail closed");

  check(validationReport.packageId === registration.packageId, "validation report package ID mismatch");
  check(validationReport.packageVersion === registration.packageVersion, "validation report version mismatch");
  check(validationReport.result === "pass", "bundled author validation must remain pass");
  check(validationReport.runtimeContract?.resourcesValidated === 49, "bundled resource validation evidence mismatch");
  check(validationReport.runtimeContract?.runtimeTasksValidated === 2606, "bundled runtime task evidence mismatch");
  check(validationReport.runtimeContract?.handoffSaveReload === "pass", "bundled handoff save/reload evidence mismatch");
  check(validationReport.runtimeContract?.urgentOvercapacitySafeRoute === "pass", "bundled safe-route evidence mismatch");
  check(validationReport.simulations?.campaigns === 10000, "bundled campaign simulation evidence mismatch");
  check(validationReport.simulations?.demandDays === 300000, "bundled demand-day simulation evidence mismatch");
  check(validationReport.authorityBoundaries?.medicalTruth === "not_authored_by_p5", "bundled medical authority boundary mismatch");
  check(validationReport.authorityBoundaries?.saveSchemaChangedByPackage === false, "bundled save-schema boundary mismatch");

  check(operationalReviewInput.registration.reviewInputVersion === "2026.07.16.4", "loaded operational dependency version mismatch");
  check(operationalReviewInput.sourceIntegrity.aggregateSha256 === OPERATIONAL_V4_AGGREGATE_SHA256, "loaded operational .4 aggregate drift");
  check(operationalReviewInput.reviewOnly === true && operationalReviewInput.runtimeEligible === false, "operational .4 must remain review-only");
  const operationalResearch = operationalReviewInput.documents["generated/p3/research-catalog.json"].research;
  const p5ResearchIds = research.researchTasks.map((record) => record.researchId);
  const operationalResearchIds = operationalResearch.map((record) => record.researchId);
  checkUnique(p5ResearchIds, "P5 research IDs");
  checkUnique(operationalResearchIds, "operational .4 research IDs");
  check(sameStrings(p5ResearchIds, operationalResearchIds), "P5 and operational .4 research ID sets differ");
  check(research.researchTasks.every((record) => record.medicalResultAuthority === P5_SENTINEL_AUTHORITY), "P5 non-authoritative medical-result sentinel drifted");
  check(operationalResearch.every((record) => record.medicalResultAuthority === OPERATIONAL_MEDICAL_AUTHORITY), "operational .4 exact medical-result authority drifted");
  check(operationalResearch.every((record) => record.operationalPolicyMayGenerateResult === false), "operational policy must not generate medical results");
  check(P5_SENTINEL_AUTHORITY !== OPERATIONAL_MEDICAL_AUTHORITY, "P5 sentinel must not be normalized into operational medical authority");

  check(isObject(baselineManifest) && baselineManifest.caseCount === 30, "tier-01-v2 baseline must remain 30 cases");
  const baselineCaseIds = checkArray(baselineManifest.cases, "tier-01-v2 baseline cases").map((record) => record.id);
  checkUnique(baselineCaseIds, "tier-01-v2 baseline case IDs");
  const baselineCrosswalkMatches = [];
  for (const caseId of baselineCaseIds) {
    for (const [relativePath, bytes] of sourceBytesByPath) {
      if (Buffer.from(bytes).includes(Buffer.from(caseId, "utf8"))) baselineCrosswalkMatches.push({ caseId, path: relativePath });
    }
  }
  check(baselineCrosswalkMatches.length === 0, "P5 .2 contains an unapproved current 30-card crosswalk");
  check(!sourceFiles.some((path) => /activation.?manifest/iu.test(path)), "P5 .2 must not contain an activation manifest");

  const blockers = [
    makeBlocker(
      "activation_requirements_unsatisfied",
      "P5 .2 remains review-only until all declared activation requirements are satisfied.",
      { activationRequires: clone(manifest.activationRequires) },
    ),
    makeBlocker(
      "product_owner_staffing_acceptance_pending",
      "The author package recommends staffing but does not supply product-owner acceptance.",
      { productOwnerDecision: clone(decisionMatrix.productOwnerDecision) },
    ),
  ];
  return deepFreeze({
    counts: {
      sourceFiles: sourceFiles.length,
      sourceBytes: [...sourceBytesByPath.values()].reduce((total, bytes) => total + bytes.length, 0),
      productionPool: 0,
      staff: (resourceKinds.staff || []).length,
      rooms: (resourceKinds.room || []).length,
      equipmentResources: (resourceKinds.equipment || []).length,
      totalResources: resources.resources.length,
      visitTaskTemplates: visits.tasks.length,
      capabilitiesMapped: exactMap.capabilities.length,
      supplementalCapabilitiesMapped: exactMap.supplementalCapabilities.length,
      researchTasks: research.researchTasks.length,
      investigationUsagesMapped: usages.usageTasks.length,
      scheduleDays: staffing.days.length,
      staffSkillsCovered: decisionMatrix.staffingCoverage.length,
      runtimeTaskConfigurations: 2606,
      lifecycleCommands: lifecycle.commands.length,
      roomAssets: lifecycle.roomAssets.length,
      startingInventoryCategories: lifecycle.startingInventory.length,
      startingEquipmentEvidence: lifecycle.startingEquipmentEvidence.length,
      startsActivePhysical: activeIds.length,
      startsActiveStaff: 0,
      hiredUnscheduledDoctors: HIRED_UNSCHEDULED_DOCTOR_IDS.length,
      baselineCases: baselineCaseIds.length,
      baselineCrosswalkMatches: baselineCrosswalkMatches.length,
    },
    activePhysicalResourceIds: activeIds,
    hiredUnscheduledDoctorIds: [...HIRED_UNSCHEDULED_DOCTOR_IDS],
    medicalAuthorityBoundary: {
      p5ResearchSentinel: P5_SENTINEL_AUTHORITY,
      p5SentinelIsMedicalAuthority: false,
      operationalMedicalAuthority: OPERATIONAL_MEDICAL_AUTHORITY,
      operationalPolicyMayGenerateResult: false,
      normalizationAllowed: false,
      exactResearchRecordsCompared: operationalResearch.length,
    },
    validationEvidence: {
      resourcesValidated: validationReport.runtimeContract.resourcesValidated,
      runtimeTasksValidated: validationReport.runtimeContract.runtimeTasksValidated,
      handoffSaveReload: validationReport.runtimeContract.handoffSaveReload,
      urgentOvercapacitySafeRoute: validationReport.runtimeContract.urgentOvercapacitySafeRoute,
      simulatedCampaigns: validationReport.simulations.campaigns,
      simulatedDemandDays: validationReport.simulations.demandDays,
    },
    baselineCaseIdCrosswalkMatches: baselineCrosswalkMatches,
    blockers,
  });
}

export async function loadP5AuthoringReviewInputV2FromReader(reader, registry, options = {}) {
  check(reader && typeof reader.readBytes === "function", "reader.readBytes is required");
  check(reader && typeof reader.listFiles === "function", "reader.listFiles is required");
  const registration = resolveP5AuthoringReviewInputV2(registry, options);
  const sourceRoot = joinPath(registration.root, registration.sourceRoot);
  const provenancePath = joinPath(registration.root, registration.provenancePath);
  const [
    provenanceBytes,
    sourceFiles,
    capabilityBytes,
    baselineManifestBytes,
    operationalReviewInput,
    ...operationalDependencyBytes
  ] = await Promise.all([
    reader.readBytes(provenancePath),
    reader.listFiles(sourceRoot),
    reader.readBytes(registration.capabilityRegistry.path),
    reader.readBytes(BASELINE_MANIFEST_PATH),
    loadOperationalAuthoringReviewInputV4FromReader(reader, registry, { context: "review" }),
    reader.readBytes(`${OPERATIONAL_V4_ROOT}/generated/p3/research-catalog.json`),
    reader.readBytes(`${OPERATIONAL_V4_ROOT}/generated/p3/investigation-usage-policy.json`),
    reader.readBytes(`${OPERATIONAL_V4_ROOT}/generated/p6/economy-catalog.json`),
    reader.readBytes(`${OPERATIONAL_V4_ROOT}/source/p6-p5-exact-resource-crosswalk.json`),
    reader.readBytes(`${OPERATIONAL_V4_ROOT}/source/p3-exact-source-crosswalk.json`),
  ]);
  check(sha256(provenanceBytes) === registration.sourceIntegrity.provenanceSha256, "provenance file SHA-256 mismatch");
  for (const [index, [field, expectedDigest]] of Object.entries(OPERATIONAL_V4_DIGESTS).entries()) {
    check(sha256(operationalDependencyBytes[index]) === expectedDigest, `operational .4 ${field} source digest drift`);
  }
  const provenance = parseJson(provenanceBytes, provenancePath);
  const sourceBytesByPath = new Map();
  await Promise.all(sourceFiles.map(async (relativePath) => {
    sourceBytesByPath.set(relativePath, await reader.readBytes(joinPath(sourceRoot, relativePath)));
  }));
  const sourceIntegrity = validateP5V2SourceProvenance(registration, provenance, sourceFiles, sourceBytesByPath);
  const documents = Object.fromEntries(JSON_PATHS.map((relativePath) => [
    relativePath,
    parseJson(sourceBytesByPath.get(relativePath), relativePath),
  ]));
  const capabilityRegistry = parseJson(capabilityBytes, registration.capabilityRegistry.path);
  const baselineManifest = parseJson(baselineManifestBytes, BASELINE_MANIFEST_PATH);
  const audit = validateP5AuthoringPackageV2({
    registration,
    documents,
    sourceFiles,
    sourceBytesByPath,
    capabilityRegistry,
    capabilityBytes,
    baselineManifest,
    operationalReviewInput,
  });
  const catalogs = Object.fromEntries(Object.entries(documents).filter(([relativePath]) => relativePath.startsWith("generated/")));
  const sourceAuthorities = Object.fromEntries(Object.entries(documents).filter(([relativePath]) => relativePath.startsWith("source/")));
  const reports = Object.fromEntries(Object.entries(documents).filter(([relativePath]) => relativePath.startsWith("reports/")));
  return deepFreeze({
    loadContext: P5_REVIEW_INPUT_V2_CONTEXT,
    reviewOnly: true,
    productionEligible: false,
    runtimeEligible: false,
    allowCurrentCaseCrosswalk: false,
    allowRuntimeActivation: false,
    registration: clone(registration),
    manifest: clone(documents["MANIFEST.json"]),
    documents: clone(documents),
    catalogs: clone(catalogs),
    sourceAuthorities: clone(sourceAuthorities),
    reports: clone(reports),
    sourceIntegrity,
    capabilityRegistryIdentity: {
      registryId: capabilityRegistry.registryId,
      registryVersion: capabilityRegistry.registryVersion,
      sha256: registration.capabilityRegistry.sha256,
      canonicalCapabilities: capabilityRegistry.capabilities.length,
    },
    operationalReviewInputIdentity: {
      reviewInputId: operationalReviewInput.registration.reviewInputId,
      reviewInputVersion: operationalReviewInput.registration.reviewInputVersion,
      provenanceSha256: operationalReviewInput.sourceIntegrity.provenanceSha256,
      aggregateSha256: operationalReviewInput.sourceIntegrity.aggregateSha256,
      archiveSha256: operationalReviewInput.sourceIntegrity.archiveSha256,
      runtimeEligible: operationalReviewInput.runtimeEligible,
    },
    medicalAuthorityBoundary: clone(audit.medicalAuthorityBoundary),
    productionPool: Object.freeze([]),
    audit,
    blockers: clone(audit.blockers),
  });
}

export async function loadP5AuthoringReviewInputV2(projectRoot, options = {}) {
  const reader = createFileSystemReviewInputReader(projectRoot);
  const registry = parseJson(await reader.readBytes(REVIEW_INPUT_REGISTRY_PATH), REVIEW_INPUT_REGISTRY_PATH);
  return loadP5AuthoringReviewInputV2FromReader(reader, registry, options);
}
