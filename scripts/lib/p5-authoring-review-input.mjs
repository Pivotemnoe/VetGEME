import { createHash } from "node:crypto";

import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
  validateReviewInputRegistry,
} from "./medical-authoring-review-input.mjs";
import { loadOperationalAuthoringReviewInputFromReader } from "./operational-authoring-review-input.mjs";

export const P5_REVIEW_INPUT_ID = "vetgeme-p5-production-authoring";
export const P5_REVIEW_INPUT_VERSION = "2026.07.16.1";
export const P5_REVIEW_INPUT_ROOT =
  "content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.1";
export const P5_REVIEW_CONTEXT = "review";
export const P5_REVIEW_STATUS = "author_validated_programmer_integration_required";
export const P5_BASELINE_MANIFEST_PATH = "content/packs/tier-01-v2/clinical/tier-01/manifest.json";
export const P5_SCHEDULER_PATH = "systems/resource-scheduler-v5.js";
export const P5_OPERATIONS_RUNTIME_PATH = "systems/operations-runtime-v5.js";
export const P5_ECONOMY_RUNTIME_PATH = "systems/economy-runtime-v6.js";
export const P5_CURRENT_CAMPAIGN_PATH = "campaign.js";
export const P5_CAMPAIGN_MECHANICS_PATH = "systems/campaign-mechanics-v2.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const EXPECTED_ACTIVATION_REQUIREMENTS = Object.freeze([
  "programmer_adapter",
  "runtime_browser_smoke",
  "save_reload_replay",
  "product_owner_staffing_acceptance",
]);
const EXPECTED_COUNTS = Object.freeze({
  staff: 10,
  rooms: 12,
  equipmentResources: 27,
  totalResources: 49,
  visitTaskTemplates: 14,
  capabilitiesMapped: 447,
  researchTasks: 361,
  investigationUsagesMapped: 1864,
  scheduleDays: 30,
  staffSkillsCovered: 24,
  runtimeTaskConfigurations: 2606,
  startsActiveCandidates: 9,
  p5RequirementFreeResources: 7,
  startsActiveStaff: 2,
  startsActiveRooms: 5,
  startsActiveEquipment: 2,
  productionPool: 0,
});
const EXPECTED_MANIFEST_COUNTS = Object.freeze({
  staff: 10,
  rooms: 12,
  equipmentResources: 27,
  totalResources: 49,
  visitTaskTemplates: 14,
  capabilitiesMapped: 447,
  researchTasks: 361,
  investigationUsagesMapped: 1864,
  scheduleDays: 30,
  staffSkillsCovered: 24,
});
const EXPECTED_GENERATED_CATALOGS = Object.freeze({
  "generated/resource-catalog.json": "vetgeme-p5-resource-catalog",
  "generated/visit-task-catalog.json": "vetgeme-p5-visit-task-catalog",
  "generated/capability-operations-map.json": "vetgeme-p5-capability-operations-map",
  "generated/research-task-catalog.json": "vetgeme-p5-research-task-catalog",
  "generated/investigation-usage-task-map.json": "vetgeme-p5-investigation-usage-task-map",
  "generated/recommended-30-day-staffing.json": "vetgeme-p5-recommended-staffing",
  "generated/operational-policies.json": "vetgeme-p5-operational-policies",
});
const TASK_BEARING_MODES = new Set([
  "schedulable_task",
  "external_coordination",
  "explicit_alternative_resolution",
]);
const EXPECTED_MISSING_ROOM_ASSET_MAPPINGS = Object.freeze([
  "room.consult.2",
  "room.dental.1",
  "room.isolation.1",
  "room.staff.1",
]);
const EXPECTED_MULTI_SKILL_DOUBLE_RESERVATIONS = Object.freeze([
  "chf_ecg_blood_pressure_and_oxygenation",
  "dental_anesthetized_tooth_by_tooth_charting",
  "dental_periodontal_probe_mobility_and_furcation_assessment",
  "feline_asthma_respiratory_triage_and_minimal_handling",
  "pneumonia_respiratory_triage_and_oxygenation",
]);
const FORBIDDEN_CLINICAL_PAYLOAD_KEYS = new Set([
  "diagnosis",
  "result",
  "clinicalResult",
  "correctAnswer",
  "treatmentProtocol",
  "dose",
  "dosage",
  "doseMgKg",
  "prescription",
  "fluidRate",
]);

function fail(message) {
  throw new Error(`P5 authoring review input validation failed: ${message}`);
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

function checkSafePath(value, label) {
  check(isSafeRelativePath(value), `${label} must be a safe relative path`);
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

function makeBlocker(id, summary, details) {
  return deepFreeze({ id, status: "blocked", summary, details: clone(details) });
}

function findForbiddenClinicalPayloadKeys(value, location, found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenClinicalPayloadKeys(item, `${location}[${index}]`, found));
    return found;
  }
  if (!isObject(value)) return found;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_CLINICAL_PAYLOAD_KEYS.has(key)) found.push(`${location}.${key}`);
    findForbiddenClinicalPayloadKeys(child, `${location}.${key}`, found);
  }
  return found;
}

function checkCatalogHeader(catalog, expectedId, label) {
  check(isObject(catalog), `${label} must be an object`);
  check(catalog.schemaVersion === 1, `${label}.schemaVersion must be 1`);
  check(catalog.catalogId === expectedId, `${label} catalogId mismatch`);
  check(catalog.catalogVersion === P5_REVIEW_INPUT_VERSION, `${label} catalogVersion mismatch`);
  check(catalog.status === P5_REVIEW_STATUS, `${label} status mismatch`);
  check(catalog.runtimeEligible === false, `${label}.runtimeEligible must remain false`);
}

export function validateP5ReviewInputRegistration(registration) {
  check(isObject(registration), "review input registration must be an object");
  check(registration.reviewInputId === P5_REVIEW_INPUT_ID, "unexpected reviewInputId");
  check(registration.reviewInputVersion === P5_REVIEW_INPUT_VERSION, "unexpected reviewInputVersion");
  check(registration.kind === "p5_authoring", "review input kind must be p5_authoring");
  check(registration.packageId === P5_REVIEW_INPUT_ID, "packageId mismatch");
  check(registration.packageVersion === P5_REVIEW_INPUT_VERSION, "packageVersion mismatch");
  check(registration.root === P5_REVIEW_INPUT_ROOT, "P5 review root mismatch");
  checkSafePath(registration.root, "root");
  check(registration.sourceRoot === "source", "sourceRoot must be source");
  check(registration.manifestPath === "source/MANIFEST.json", "manifestPath must target source/MANIFEST.json");
  check(registration.provenancePath === "provenance.json", "provenancePath must be provenance.json");
  check(registration.status === P5_REVIEW_STATUS, `status must remain ${P5_REVIEW_STATUS}`);
  check(registration.reviewOnly === true, "reviewOnly must be true");
  check(registration.productionEligible === false, "productionEligible must be false");
  check(registration.runtimeEligible === false, "runtimeEligible must be false");
  check(registration.allowCurrentCaseCrosswalk === false, "allowCurrentCaseCrosswalk must be false");
  check(registration.allowRuntimeActivation === false, "allowRuntimeActivation must be false");
  check(registration.allowAutomaticP6Crosswalk === false, "allowAutomaticP6Crosswalk must be false");

  check(isObject(registration.expectedCounts), "expectedCounts are required");
  check(registration.expectedCounts.sourceFiles === 17, "expected source file count must be 17");
  check(registration.expectedCounts.sourceBytes === 2947725, "expected source byte count must be 2947725");
  for (const [field, expected] of Object.entries(EXPECTED_COUNTS)) {
    checkInteger(registration.expectedCounts[field], `expectedCounts.${field}`);
    check(registration.expectedCounts[field] === expected, `expectedCounts.${field} must be ${expected}`);
  }

  check(isObject(registration.sourceIntegrity), "sourceIntegrity is required");
  for (const field of ["provenanceSha256", "aggregateSha256", "archiveSha256"]) {
    check(SHA256_PATTERN.test(registration.sourceIntegrity[field] || ""), `sourceIntegrity.${field} is invalid`);
  }
  check(isObject(registration.capabilityRegistry), "capabilityRegistry is required");
  check(registration.capabilityRegistry.registryId === "vetgeme-clinic-capabilities", "capability registry ID mismatch");
  check(registration.capabilityRegistry.registryVersion === "2026.07.14.38", "capability registry version mismatch");
  check(
    registration.capabilityRegistry.path === "content/system-packs/vetgeme-master-2026-07-14/capability-registry.json",
    "capability registry path mismatch",
  );
  check(SHA256_PATTERN.test(registration.capabilityRegistry.sha256 || ""), "capability registry SHA-256 is invalid");
  check(isObject(registration.operationalReviewInput), "operationalReviewInput is required");
  check(
    registration.operationalReviewInput.reviewInputId === "vetgeme-operational-production-authoring"
      && registration.operationalReviewInput.reviewInputVersion === "2026.07.16.1",
    "operational review input identity mismatch",
  );
  check(registration.operationalReviewInput.runtimeEligible === false, "operational dependency must remain review-only");
  check(
    registration.operationalReviewInput.sourceIntegrity?.aggregateSha256
      === "0a42bad7eccf70ba4eb3c18738c4b6653ab06d75056526ca828707b11e33f055",
    "operational dependency aggregate digest mismatch",
  );
  check(
    registration.operationalReviewInput.catalogSha256?.p3Research
      === "ad2ad2784b697c63307b030013af95bf006586f2983f3bf3ac61fdbed783ba63",
    "P3 research dependency digest mismatch",
  );
  check(
    registration.operationalReviewInput.catalogSha256?.p3Usages
      === "bc0e456a2c70e8108803a8f7ceb8b6d5fb17fab0efc8003798fe4675225bded1",
    "P3 usage dependency digest mismatch",
  );
  check(
    registration.operationalReviewInput.catalogSha256?.p6Economy
      === "9bebb845efad13f5717b1bf8c4e9d7e872acf0ab6e71f76a88f1e87a18e9cd32",
    "P6 economy dependency digest mismatch",
  );
  return registration;
}

export function resolveP5AuthoringReviewInput(registry, options = {}) {
  const registrations = validateReviewInputRegistry(registry);
  check(Object.prototype.hasOwnProperty.call(options, "context"), "explicit review context is required");
  check(
    options.context === P5_REVIEW_CONTEXT,
    `context ${String(options.context)} is forbidden; review is the only allowed context`,
  );
  const requestedId = options.reviewInputId || P5_REVIEW_INPUT_ID;
  const requestedVersion = options.reviewInputVersion || P5_REVIEW_INPUT_VERSION;
  const registration = registrations.find((entry) => (
    entry.reviewInputId === requestedId && entry.reviewInputVersion === requestedVersion
  ));
  check(registration, `unknown review input ${requestedId}@${requestedVersion}`);
  return validateP5ReviewInputRegistration(registration);
}

export function validateP5SourceProvenance(registration, provenance, sourceFiles, sourceBytesByPath) {
  const identity = `${registration.reviewInputId}@${registration.reviewInputVersion}`;
  check(isObject(provenance), `${identity}: provenance is missing`);
  check(provenance.schemaVersion === 1, `${identity}: provenance schemaVersion must be 1`);
  check(provenance.provenanceId === "vetgeme-p5-production-authoring-review-source", `${identity}: provenanceId mismatch`);
  check(provenance.packageId === registration.packageId, `${identity}: provenance packageId mismatch`);
  check(provenance.packageVersion === registration.packageVersion, `${identity}: provenance packageVersion mismatch`);
  check(provenance.sourceArchive === "p5-production-authoring-2026.07.16.1.zip", `${identity}: source archive identity mismatch`);
  check(provenance.sourceDirectory === "p5-production-authoring", `${identity}: source directory identity mismatch`);
  check(isObject(provenance.archive), `${identity}: archive provenance is missing`);
  check(provenance.archive.path === provenance.sourceArchive, `${identity}: archive path mismatch`);
  check(provenance.archive.checksumPath === "p5-production-authoring-2026.07.16.1.zip.sha256", `${identity}: checksum path mismatch`);
  check(provenance.archive.sha256 === registration.sourceIntegrity.archiveSha256, `${identity}: archive digest mismatch`);
  check(provenance.archive.zipEntryCount === 23, `${identity}: archive entry count mismatch`);
  check(provenance.archive.extractedFileCount === registration.expectedCounts.sourceFiles, `${identity}: archive file count mismatch`);
  check(provenance.archive.extractedBytes === registration.expectedCounts.sourceBytes, `${identity}: archive byte count mismatch`);
  check(provenance.sourceFileCount === registration.expectedCounts.sourceFiles, `${identity}: provenance file count mismatch`);
  check(provenance.sourceBytes === registration.expectedCounts.sourceBytes, `${identity}: provenance byte count mismatch`);
  check(provenance.aggregateSha256 === registration.sourceIntegrity.aggregateSha256, `${identity}: provenance aggregate digest mismatch`);
  checkArray(provenance.files, `${identity}: provenance files`);
  check(provenance.files.length === registration.expectedCounts.sourceFiles, `${identity}: provenance inventory count mismatch`);
  const listedPaths = provenance.files.map((file) => file.path);
  checkUnique(listedPaths, `${identity}: provenance file paths`);
  for (const file of provenance.files) {
    check(isObject(file), `${identity}: invalid provenance file entry`);
    checkSafePath(file.path, `${identity}: provenance file path`);
    check(file.originPath === `${provenance.sourceDirectory}/${file.path}`, `${identity}: originPath mismatch for ${file.path}`);
    checkInteger(file.bytes, `${identity}: ${file.path} bytes`);
    check(SHA256_PATTERN.test(file.sha256 || ""), `${identity}: ${file.path} SHA-256 is invalid`);
  }
  check(sameStrings(sourceFiles, listedPaths), `${identity}: source file set differs from provenance`);
  let verifiedBytes = 0;
  for (const file of provenance.files) {
    const bytes = sourceBytesByPath.get(file.path);
    check(bytes !== undefined, `${identity}: source file is missing: ${file.path}`);
    check(bytes.length === file.bytes, `${identity}: byte length mismatch for ${file.path}`);
    check(sha256(bytes) === file.sha256, `${identity}: SHA-256 mismatch for ${file.path}`);
    verifiedBytes += bytes.length;
  }
  check(verifiedBytes === provenance.sourceBytes, `${identity}: verified source byte total mismatch`);
  const aggregate = createHash("sha256");
  for (const file of provenance.files) aggregate.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`, "utf8");
  check(aggregate.digest("hex") === provenance.aggregateSha256, `${identity}: provenance inventory digest mismatch`);
  check(isObject(provenance.archive.keyFileHashes), `${identity}: keyFileHashes are missing`);
  for (const [relativePath, expectedHash] of Object.entries(provenance.archive.keyFileHashes)) {
    checkSafePath(relativePath, `${identity}: key file path`);
    check(SHA256_PATTERN.test(expectedHash || ""), `${identity}: invalid key-file digest for ${relativePath}`);
    const file = provenance.files.find((entry) => entry.path === relativePath);
    check(file && file.sha256 === expectedHash, `${identity}: key-file digest mismatch for ${relativePath}`);
  }
  return deepFreeze({
    sourceFilesVerified: provenance.files.length,
    sourceBytesVerified: verifiedBytes,
    aggregateSha256: provenance.aggregateSha256,
    archiveSha256: provenance.archive.sha256,
  });
}

function validateCapabilityRegistry(registration, capabilityRegistry, capabilityBytes) {
  check(sha256(capabilityBytes) === registration.capabilityRegistry.sha256, "capability registry SHA-256 mismatch");
  check(isObject(capabilityRegistry), "capability registry is missing");
  check(capabilityRegistry.schemaVersion === 1, "capability registry schemaVersion must be 1");
  check(capabilityRegistry.registryId === registration.capabilityRegistry.registryId, "capability registry ID mismatch");
  check(capabilityRegistry.registryVersion === registration.capabilityRegistry.registryVersion, "capability registry version mismatch");
  checkArray(capabilityRegistry.capabilities, "capabilityRegistry.capabilities");
  check(capabilityRegistry.capabilities.length === 447, "capability registry count mismatch");
  const ids = capabilityRegistry.capabilities.map((entry) => entry.id);
  check(ids.every(isNonEmptyString), "capability registry contains an invalid ID");
  checkUnique(ids, "capability registry IDs");
  return new Set(ids);
}

function validateRequirementGroups(groups, resourcesById, label) {
  checkArray(groups, `${label}.requirementGroups`);
  const groupIds = groups.map((group) => group.id);
  check(groupIds.every(isNonEmptyString), `${label} has an invalid requirement group ID`);
  checkUnique(groupIds, `${label} requirement group IDs`);
  for (const group of groups) {
    checkArray(group.anyOf, `${label}/${group.id}.anyOf`);
    check(group.anyOf.length > 0, `${label}/${group.id}.anyOf must not be empty in authored source`);
    const optionKeys = [];
    for (const option of group.anyOf) {
      check(isObject(option), `${label}/${group.id}: invalid alternative`);
      check(isNonEmptyString(option.resourceId), `${label}/${group.id}: resourceId is missing`);
      check(isNonEmptyString(option.capabilityId), `${label}/${group.id}: capabilityId is missing`);
      check(Number.isSafeInteger(option.units) && option.units > 0, `${label}/${group.id}: units must be positive`);
      const resource = resourcesById.get(option.resourceId);
      check(resource, `${label}/${group.id}: unknown resource ${option.resourceId}`);
      check(
        resource.runtimeResourceTemplate.capabilities.includes(option.capabilityId),
        `${label}/${group.id}: ${option.resourceId} lacks ${option.capabilityId}`,
      );
      optionKeys.push(`${option.resourceId}\0${option.capabilityId}\0${option.units}`);
    }
    checkUnique(optionKeys, `${label}/${group.id} alternatives`);
  }
}

function auditStartAvailability(templates, activeResourceIds) {
  const inactiveResourceIds = new Set();
  const recordsWithInactiveAlternatives = [];
  const blockedTemplates = [];
  let inactiveAlternatives = 0;
  let emptyGroups = 0;
  for (const template of templates) {
    const inactiveByGroup = [];
    const emptyGroupIds = [];
    for (const group of template.requirementGroups) {
      const inactive = group.anyOf.filter((option) => !activeResourceIds.has(option.resourceId));
      if (inactive.length > 0) {
        inactiveAlternatives += inactive.length;
        inactive.forEach((option) => inactiveResourceIds.add(option.resourceId));
        inactiveByGroup.push({ groupId: group.id, resourceIds: inactive.map((option) => option.resourceId) });
      }
      if (inactive.length === group.anyOf.length) {
        emptyGroups += 1;
        emptyGroupIds.push(group.id);
      }
    }
    if (inactiveByGroup.length > 0) recordsWithInactiveAlternatives.push({ templateId: template.id, groups: inactiveByGroup });
    if (emptyGroupIds.length > 0) blockedTemplates.push({ templateId: template.id, emptyGroupIds });
  }
  return {
    templates: templates.length,
    templatesWithInactiveAlternatives: recordsWithInactiveAlternatives.length,
    templatesBlockedAtStart: blockedTemplates.length,
    templatesSchedulableAtStart: templates.length - blockedTemplates.length,
    inactiveAlternatives,
    emptyGroups,
    inactiveResourceIds: sorted(inactiveResourceIds),
    blockedTemplates,
  };
}

function validateP5Catalogs({ registration, catalogs, capabilityIds, operationalReviewInput }) {
  for (const [relativePath, expectedId] of Object.entries(EXPECTED_GENERATED_CATALOGS)) {
    checkCatalogHeader(catalogs[relativePath], expectedId, relativePath);
  }
  const resourcesCatalog = catalogs["generated/resource-catalog.json"];
  const visitCatalog = catalogs["generated/visit-task-catalog.json"];
  const capabilityCatalog = catalogs["generated/capability-operations-map.json"];
  const researchCatalog = catalogs["generated/research-task-catalog.json"];
  const usageCatalog = catalogs["generated/investigation-usage-task-map.json"];
  const staffingCatalog = catalogs["generated/recommended-30-day-staffing.json"];
  const operationsPolicy = catalogs["generated/operational-policies.json"];

  checkArray(resourcesCatalog.resources, "resource catalog resources");
  check(resourcesCatalog.resources.length === 49, "resource catalog must contain 49 resources");
  const resourceIds = resourcesCatalog.resources.map((resource) => resource.resourceId);
  checkUnique(resourceIds, "resource IDs");
  const resourcesById = new Map(resourcesCatalog.resources.map((resource) => [resource.resourceId, resource]));
  for (const resource of resourcesCatalog.resources) {
    check(["staff", "room", "equipment"].includes(resource.resourceKind), `${resource.resourceId}: invalid resourceKind`);
    check(typeof resource.startsActive === "boolean", `${resource.resourceId}: startsActive must be boolean`);
    checkArray(resource.activationRequirements, `${resource.resourceId}.activationRequirements`);
    check(isObject(resource.runtimeResourceTemplate), `${resource.resourceId}: runtimeResourceTemplate is missing`);
    check(resource.runtimeResourceTemplate.id === resource.resourceId, `${resource.resourceId}: runtime ID mismatch`);
    check(Number.isSafeInteger(resource.runtimeResourceTemplate.capacity) && resource.runtimeResourceTemplate.capacity > 0, `${resource.resourceId}: capacity must be positive`);
    checkArray(resource.runtimeResourceTemplate.capabilities, `${resource.resourceId}: capabilities`);
    check(resource.runtimeResourceTemplate.capabilities.length > 0, `${resource.resourceId}: capabilities must not be empty`);
    checkUnique(resource.runtimeResourceTemplate.capabilities, `${resource.resourceId}: capabilities`);
    checkArray(resource.runtimeResourceTemplate.unavailableWindows, `${resource.resourceId}: unavailableWindows`);
    if (resource.resourceKind === "equipment") {
      check(capabilityIds.has(resource.capabilityId), `${resource.resourceId}: unknown equipment capability ${resource.capabilityId}`);
      check(resource.runtimeResourceTemplate.capabilities.length === 1, `${resource.resourceId}: equipment must expose one capability`);
      check(resource.runtimeResourceTemplate.capabilities[0] === resource.capabilityId, `${resource.resourceId}: equipment capability mismatch`);
    }
  }
  const resourcesByKind = Object.fromEntries(["staff", "room", "equipment"].map((kind) => [
    kind,
    resourcesCatalog.resources.filter((resource) => resource.resourceKind === kind),
  ]));
  check(resourcesByKind.staff.length === 10, "staff resource count mismatch");
  check(resourcesByKind.room.length === 12, "room resource count mismatch");
  check(resourcesByKind.equipment.length === 27, "equipment resource count mismatch");
  check(resourcesByKind.staff.filter((resource) => resource.startsActive).length === 2, "starting staff count mismatch");
  check(resourcesByKind.room.filter((resource) => resource.startsActive).length === 5, "starting room count mismatch");
  check(resourcesByKind.equipment.filter((resource) => resource.startsActive).length === 2, "starting equipment count mismatch");

  checkArray(visitCatalog.tasks, "visit tasks");
  check(visitCatalog.tasks.length === 14, "visit task count mismatch");
  checkUnique(visitCatalog.tasks.map((task) => task.taskTemplateId), "visit task IDs");
  for (const task of visitCatalog.tasks) validateRequirementGroups(task.runtimeTemplate?.requirementGroups, resourcesById, task.taskTemplateId);

  checkArray(capabilityCatalog.capabilities, "capability operations");
  check(capabilityCatalog.capabilities.length === 447, "capability operation count mismatch");
  const mappedCapabilityIds = capabilityCatalog.capabilities.map((record) => record.capabilityId);
  checkUnique(mappedCapabilityIds, "mapped capability IDs");
  check(sameStrings(mappedCapabilityIds, capabilityIds), "capability operation map does not cover the canonical registry exactly");
  for (const record of capabilityCatalog.capabilities) {
    check(isNonEmptyString(record.executionMode), `${record.capabilityId}: executionMode is missing`);
    validateRequirementGroups(record.requirementGroups, resourcesById, `capability.${record.capabilityId}`);
    if (TASK_BEARING_MODES.has(record.executionMode)) {
      check(record.requirementGroups.length > 0, `${record.capabilityId}: task-bearing capability lacks requirements`);
    } else {
      check(record.requirementGroups.length === 0, `${record.capabilityId}: non-task capability creates requirements`);
    }
  }

  const upstreamResearch = operationalReviewInput.catalogs["generated/p3/research-catalog.json"].research;
  const upstreamUsages = operationalReviewInput.catalogs["generated/p3/investigation-usage-policy.json"].usages;
  checkArray(researchCatalog.researchTasks, "research tasks");
  check(researchCatalog.researchTasks.length === 361, "research task count mismatch");
  checkUnique(researchCatalog.researchTasks.map((task) => task.researchId), "research task IDs");
  check(
    sameStrings(researchCatalog.researchTasks.map((task) => task.researchId), upstreamResearch.map((record) => record.researchId)),
    "P5 research task IDs do not exactly cover P3",
  );
  for (const task of researchCatalog.researchTasks) {
    check(task.medicalResultAuthority === "medical_family_presentation_investigation_result", `${task.researchId}: medical result authority changed`);
    validateRequirementGroups(task.runtimeTemplate?.requirementGroups, resourcesById, `research.${task.researchId}`);
  }

  checkArray(usageCatalog.usageTasks, "usage tasks");
  check(usageCatalog.usageTasks.length === 1864, "investigation usage task count mismatch");
  checkUnique(usageCatalog.usageTasks.map((task) => task.usageId), "usage task IDs");
  check(
    sameStrings(usageCatalog.usageTasks.map((task) => task.usageId), upstreamUsages.map((record) => record.usageId)),
    "P5 usage task IDs do not exactly cover P3",
  );
  const researchIds = new Set(researchCatalog.researchTasks.map((task) => task.researchId));
  for (const usage of usageCatalog.usageTasks) check(researchIds.has(usage.researchId), `${usage.usageId}: unknown researchId`);
  checkArray(staffingCatalog.days, "recommended staffing days");
  check(staffingCatalog.days.length === 30, "recommended staffing day count mismatch");
  check(staffingCatalog.authority === "recommendation_only_player_choice_persists_actual_shift", "staffing authority must remain recommendation-only");
  checkArray(operationsPolicy.handoffPolicies, "handoff policies");
  checkArray(operationsPolicy.absencePolicies, "absence policies");

  return {
    resourcesCatalog,
    visitCatalog,
    capabilityCatalog,
    researchCatalog,
    usageCatalog,
    staffingCatalog,
    operationsPolicy,
    resourcesById,
    resourcesByKind,
  };
}

function buildGapAudit(
  validated,
  sourcePolicy,
  operationalReviewInput,
  schedulerSource,
  operationsSource,
  economySource,
  currentCampaignSource,
  campaignMechanicsSource,
) {
  const {
    resourcesCatalog,
    visitCatalog,
    capabilityCatalog,
    researchCatalog,
    usageCatalog,
    staffingCatalog,
    operationsPolicy,
    resourcesById,
    resourcesByKind,
  } = validated;
  const p6Economy = operationalReviewInput.catalogs["generated/p6/economy-catalog.json"];
  const p6Crosswalk = operationalReviewInput.catalogs["generated/p6/p3-p5-resource-crosswalk.json"];
  const p6ByCapability = new Map(p6Economy.capabilityEconomics.map((record) => [record.capabilityId, record]));
  const p6CrosswalkByCapability = new Map(p6Crosswalk.p3Capabilities.map((record) => [record.capabilityId, record]));
  const candidateActiveResourceIds = new Set(resourcesCatalog.resources.filter((resource) => resource.startsActive).map((resource) => resource.resourceId));
  const p5RequirementFreeResourceIds = new Set(resourcesCatalog.resources
    .filter((resource) => resource.startsActive && resource.activationRequirements.length === 0)
    .map((resource) => resource.resourceId));
  const inactiveResourceIds = new Set(resourcesCatalog.resources.filter((resource) => !resource.startsActive).map((resource) => resource.resourceId));
  check(candidateActiveResourceIds.size === 9, "startsActive candidate count must remain 9");
  check(p5RequirementFreeResourceIds.size === 7, "P5 requirement-free resource count must remain 7");

  const lifecycleCommands = ["addResource", "removeResource", "activateResource", "deactivateResource", "updateResource"];
  const missingLifecycleCommands = lifecycleCommands.filter((command) => !new RegExp(`\\b${command}\\b`, "u").test(schedulerSource));
  check(missingLifecycleCommands.length === lifecycleCommands.length, "resource lifecycle resolver gap changed; review adapter authority");

  const lockedRooms = resourcesByKind.room.filter((resource) => !resource.startsActive && resource.activationRequirements.includes("p6_asset_owned"));
  const roomAssetMappings = lockedRooms.map((resource) => {
    const mapping = resource.runtimeResourceTemplate.capabilities
      .map((capabilityId) => p6CrosswalkByCapability.get(capabilityId))
      .find((record) => record?.assetCatalogId);
    return {
      resourceId: resource.resourceId,
      matchedCapabilityId: mapping?.capabilityId || null,
      assetCatalogId: mapping?.assetCatalogId || null,
    };
  });
  const roomsMissingAssetMappings = roomAssetMappings.filter((record) => !record.assetCatalogId).map((record) => record.resourceId);
  check(sameStrings(roomsMissingAssetMappings, EXPECTED_MISSING_ROOM_ASSET_MAPPINGS), "four missing P5/P6 room asset mappings must remain visible");
  const startingRoomOwnership = resourcesByKind.room.filter((resource) => resource.startsActive).map((resource) => {
    const mapping = resource.runtimeResourceTemplate.capabilities
      .map((capabilityId) => p6CrosswalkByCapability.get(capabilityId))
      .find((record) => record?.assetCatalogId);
    return {
      resourceId: resource.resourceId,
      p5ActivationRequirements: clone(resource.activationRequirements),
      p6AssetCatalogId: mapping?.assetCatalogId || null,
    };
  });
  check(startingRoomOwnership.length === 5, "starting room count must remain 5");
  check(startingRoomOwnership.every((record) => record.p5ActivationRequirements.length === 0 && record.p6AssetCatalogId === null), "starting room P6 ownership seed gap changed");

  const equipmentAssetMappings = resourcesByKind.equipment.map((resource) => {
    const crosswalk = p6CrosswalkByCapability.get(resource.capabilityId);
    const economy = p6ByCapability.get(resource.capabilityId);
    return {
      resourceId: resource.resourceId,
      capabilityId: resource.capabilityId,
      startsActive: resource.startsActive,
      activationRequirements: clone(resource.activationRequirements),
      assetCatalogId: crosswalk?.assetCatalogId || null,
      p6StartsOwned: economy?.assetPolicy?.startsOwned ?? null,
      p6InventoryPolicy: crosswalk?.inventoryPolicy ?? null,
      p6MaintenanceIntervalDays: economy?.assetPolicy?.maintenanceIntervalDays ?? null,
    };
  });
  check(equipmentAssetMappings.every((record) => record.assetCatalogId), "all 27 equipment resources must retain exact P6 asset mappings");
  const startingEquipment = equipmentAssetMappings.filter((record) => record.startsActive);
  check(sameStrings(startingEquipment.map((record) => record.resourceId), ["equipment.microscope", "equipment.otoscope"]), "starting equipment set mismatch");
  const equipmentWithoutStockMapping = equipmentAssetMappings
    .filter((record) => record.activationRequirements.includes("required_stock_available") && record.p6InventoryPolicy === null)
    .map((record) => record.resourceId);
  check(equipmentWithoutStockMapping.length === 27, "all 27 equipment stock requirements must remain visibly unmapped");

  const p5Roles = sorted(new Set(resourcesByKind.staff.map((resource) => resource.role)));
  const p6WageRoles = sorted(p6Economy.staffWagesPerWorkedDay.map((record) => record.roleId));
  const missingWageRoles = p5Roles.filter((role) => !p6WageRoles.includes(role));
  check(sameStrings(missingWageRoles, ["imaging_staff"]), "P6 missing imaging wage role must remain visible");

  const visitTemplates = visitCatalog.tasks.map((task) => ({ id: task.taskTemplateId, requirementGroups: task.runtimeTemplate.requirementGroups }));
  const researchTemplates = researchCatalog.researchTasks.map((task) => ({ id: task.researchId, requirementGroups: task.runtimeTemplate.requirementGroups }));
  const capabilityTemplates = capabilityCatalog.capabilities
    .filter((record) => TASK_BEARING_MODES.has(record.executionMode))
    .map((record) => ({ id: record.capabilityId, requirementGroups: record.requirementGroups }));
  const candidateStartAvailability = {
    visit: auditStartAvailability(visitTemplates, candidateActiveResourceIds),
    research: auditStartAvailability(researchTemplates, candidateActiveResourceIds),
    capability: auditStartAvailability(capabilityTemplates, candidateActiveResourceIds),
  };
  const p5RequirementFreeStartAvailability = {
    visit: auditStartAvailability(visitTemplates, p5RequirementFreeResourceIds),
    research: auditStartAvailability(researchTemplates, p5RequirementFreeResourceIds),
    capability: auditStartAvailability(capabilityTemplates, p5RequirementFreeResourceIds),
  };
  check(candidateStartAvailability.visit.templatesWithInactiveAlternatives === 14, "visit inactive alternative count changed");
  check(candidateStartAvailability.visit.templatesBlockedAtStart === 1, "exactly one visit stage must remain blocked for candidate resources");
  check(candidateStartAvailability.research.templatesBlockedAtStart === 217 && candidateStartAvailability.research.templatesSchedulableAtStart === 144, "candidate research filtering gap changed");
  check(candidateStartAvailability.capability.templates === 367, "task-bearing capability count mismatch");
  check(candidateStartAvailability.capability.templatesBlockedAtStart === 227 && candidateStartAvailability.capability.templatesSchedulableAtStart === 140, "candidate capability filtering gap changed");
  check(p5RequirementFreeStartAvailability.visit.templatesBlockedAtStart === 1 && p5RequirementFreeStartAvailability.visit.templatesSchedulableAtStart === 13, "P5 requirement-free visit filtering gap changed");
  check(p5RequirementFreeStartAvailability.research.templatesBlockedAtStart === 237 && p5RequirementFreeStartAvailability.research.templatesSchedulableAtStart === 124, "P5 requirement-free research filtering gap changed");
  check(p5RequirementFreeStartAvailability.capability.templatesBlockedAtStart === 242 && p5RequirementFreeStartAvailability.capability.templatesSchedulableAtStart === 125, "P5 requirement-free capability filtering gap changed");
  const candidateBlockedResearchIds = new Set(candidateStartAvailability.research.blockedTemplates.map((record) => record.templateId));
  const p5RequirementFreeBlockedResearchIds = new Set(p5RequirementFreeStartAvailability.research.blockedTemplates.map((record) => record.templateId));
  const candidateBlockedUsageCount = usageCatalog.usageTasks.filter((usage) => candidateBlockedResearchIds.has(usage.researchId)).length;
  const p5RequirementFreeBlockedUsageCount = usageCatalog.usageTasks.filter((usage) => p5RequirementFreeBlockedResearchIds.has(usage.researchId)).length;
  check(candidateBlockedUsageCount === 1159, "usage tasks inheriting candidate-blocked research changed");

  const checkin = visitCatalog.tasks.find((task) => task.taskTemplateId === "visit.checkin");
  const checkinStaffGroup = checkin.runtimeTemplate.requirementGroups.find((group) => group.id === "staff");
  const checkinDetails = {
    taskTemplateId: checkin.taskTemplateId,
    startingStaffIds: sorted(resourcesByKind.staff.filter((resource) => resource.startsActive).map((resource) => resource.resourceId)),
    staffAlternatives: clone(checkinStaffGroup.anyOf),
    inactiveStaffAlternatives: checkinStaffGroup.anyOf.filter((option) => inactiveResourceIds.has(option.resourceId)).map((option) => option.resourceId),
    doctorFallbackPresent: checkinStaffGroup.anyOf.some((option) => option.capabilityId === "role.doctor"),
  };
  check(checkinDetails.inactiveStaffAlternatives.length === 1 && checkinDetails.doctorFallbackPresent === false, "day-one checkin gap changed");

  const skillTasks = researchCatalog.researchTasks.filter((task) => (
    task.runtimeTemplate.requirementGroups.some((group) => group.id.startsWith("skill."))
  ));
  check(skillTasks.length === 33, "separate skill requirement task count must remain 33");
  const multiSkillDoubleReservations = skillTasks.filter((task) => (
    task.runtimeTemplate.requirementGroups.filter((group) => group.id.startsWith("skill.")).length > 1
  )).map((task) => {
    const staffGroup = task.runtimeTemplate.requirementGroups.find((group) => group.id === "staff");
    const skillGroups = task.runtimeTemplate.requirementGroups.filter((group) => group.id.startsWith("skill."));
    const baseStaffIds = new Set(staffGroup.anyOf.map((option) => option.resourceId));
    return {
      researchId: task.researchId,
      requiredStaffReservationGroups: 1 + skillGroups.length,
      skillGroupIds: skillGroups.map((group) => group.id),
      baseStaffSkillOverlaps: skillGroups.map((group) => ({
        groupId: group.id,
        overlappingBaseStaffIds: group.anyOf.map((option) => option.resourceId).filter((resourceId) => baseStaffIds.has(resourceId)),
      })).filter((record) => record.overlappingBaseStaffIds.length > 0),
    };
  });
  check(sameStrings(multiSkillDoubleReservations.map((record) => record.researchId), EXPECTED_MULTI_SKILL_DOUBLE_RESERVATIONS), "five multi-skill double-reservation cases changed");
  check(multiSkillDoubleReservations.find((record) => record.researchId === "chf_ecg_blood_pressure_and_oxygenation").requiredStaffReservationGroups === 4, "CHF task must retain four conflicting staff reservation groups");

  const researchSafeRouteIds = sorted(new Set(researchCatalog.researchTasks.map((task) => task.safeRouteId).filter(Boolean)));
  check(researchSafeRouteIds.length === 11, "research safe-route capability count must remain 11");
  const capabilityById = new Map(capabilityCatalog.capabilities.map((record) => [record.capabilityId, record]));
  const dayOneReferralRoutes = researchSafeRouteIds.map((capabilityId) => {
    const capability = capabilityById.get(capabilityId);
    const staffGroup = capability.requirementGroups.find((group) => group.id === "staff");
    const roomGroup = capability.requirementGroups.find((group) => group.id === "room");
    return {
      capabilityId,
      staffAlternatives: clone(staffGroup?.anyOf || []),
      roomAlternatives: clone(roomGroup?.anyOf || []),
      activeStaffAlternativeIds: (staffGroup?.anyOf || []).filter((option) => p5RequirementFreeResourceIds.has(option.resourceId)).map((option) => option.resourceId),
      doctorFallbackPresent: (staffGroup?.anyOf || []).some((option) => option.capabilityId === "role.doctor"),
    };
  });
  check(dayOneReferralRoutes.every((record) => record.activeStaffAlternativeIds.length === 0 && !record.doctorFallbackPresent), "all 11 research safe routes must retain the day-one administrator-only gap");

  const upstreamResearchRecords = operationalReviewInput.catalogs["generated/p3/research-catalog.json"].research;
  const p5ResearchById = new Map(researchCatalog.researchTasks.map((task) => [task.researchId, task]));
  const nullFallbackDefaults = upstreamResearchRecords.filter((record) => record.fallback === null).map((record) => ({
    researchId: record.researchId,
    p3Fallback: null,
    p5SafeRouteId: p5ResearchById.get(record.researchId)?.safeRouteId || null,
  }));
  check(nullFallbackDefaults.length === 12, "P3 null fallback count must remain 12");
  check(nullFallbackDefaults.every((record) => record.p5SafeRouteId === "safe_referral"), "all 12 null P3 fallbacks must remain visibly defaulted to safe_referral");
  const externalCoordinationTasks = researchCatalog.researchTasks.filter((task) => task.taskClassId === "external_coordination");
  const externalWithLocalPhysicalRequirements = externalCoordinationTasks
    .filter((task) => task.physicalResourceIds.length > 0)
    .map((task) => ({
      researchId: task.researchId,
      physicalResourceIds: clone(task.physicalResourceIds),
      safeRouteId: task.safeRouteId,
      authoredRouteBranches: clone(task.routeBranches || []),
    }));
  check(externalCoordinationTasks.length === 135, "external_coordination research count must remain 135");
  check(externalWithLocalPhysicalRequirements.length === 27, "external research retaining local physical requirements must remain 27");
  check(externalWithLocalPhysicalRequirements.every((record) => record.authoredRouteBranches.length === 0), "external/local route branching gap changed");

  const handoffDistribution = Object.fromEntries(operationsPolicy.handoffPolicies.map((policy) => [
    policy.policyId,
    usageCatalog.usageTasks.filter((usage) => usage.handoffPolicyId === policy.policyId).length,
  ]));
  check(handoffDistribution.urgent_quarter_breakpoints === 1074, "urgent-quarter handoff usage count changed");
  check(handoffDistribution.midpoint === 190, "midpoint handoff usage count changed");
  check(handoffDistribution.not_allowed === 600, "not-allowed handoff usage count changed");
  const researchById = new Map(researchCatalog.researchTasks.map((task) => [task.researchId, task]));
  const policyById = new Map(operationsPolicy.handoffPolicies.map((policy) => [policy.policyId, policy]));
  const fractionalHandoffUsages = Object.fromEntries(["urgent_quarter_breakpoints", "midpoint"].map((policyId) => {
    const records = usageCatalog.usageTasks.filter((usage) => usage.handoffPolicyId === policyId).flatMap((usage) => {
      const durationMinutes = researchById.get(usage.researchId).durationMinutes;
      const fractions = policyById.get(policyId).allowedFractions;
      const fractionalBreakpoints = fractions.map((fraction) => durationMinutes * fraction).filter((minute) => !Number.isInteger(minute));
      return fractionalBreakpoints.length > 0 ? [{ usageId: usage.usageId, researchId: usage.researchId, durationMinutes, fractionalBreakpoints }] : [];
    });
    return [policyId, records];
  }));
  check(fractionalHandoffUsages.urgent_quarter_breakpoints.length === 476, "fractional urgent-quarter handoff count changed");
  check(fractionalHandoffUsages.midpoint.length === 51, "fractional midpoint handoff count changed");
  const runtimeHandoffPolicyIdentifiers = operationsPolicy.handoffPolicies
    .map((policy) => policy.policyId)
    .filter((policyId) => schedulerSource.includes(policyId) || operationsSource.includes(policyId));
  check(runtimeHandoffPolicyIdentifiers.length === 0, "runtime handoff policy gate changed; re-review adapter contract");
  const bundledHandoffFixture = visitCatalog.tasks.find((task) => task.taskTemplateId === "visit.history");
  check(bundledHandoffFixture?.handoff === "not_allowed", "bundled handoff fixture policy changed; re-review package validator");
  const capabilityMappingsWithHandoffPolicy = capabilityCatalog.capabilities.filter((record) => (
    Object.prototype.hasOwnProperty.call(record, "handoff")
      || Object.prototype.hasOwnProperty.call(record, "handoffPolicyId")
  ));
  const taskBearingCapabilityIdsWithoutHandoffPolicy = capabilityCatalog.capabilities
    .filter((record) => TASK_BEARING_MODES.has(record.executionMode)
      && !Object.prototype.hasOwnProperty.call(record, "handoff")
      && !Object.prototype.hasOwnProperty.call(record, "handoffPolicyId"))
    .map((record) => record.capabilityId);
  check(capabilityMappingsWithHandoffPolicy.length === 0, "capability handoff policy coverage changed");
  check(taskBearingCapabilityIdsWithoutHandoffPolicy.length === 367, "task-bearing capabilities without handoff policy must remain 367");

  const stabilizationVisitTemplates = visitCatalog.tasks.filter((task) => /stabili/iu.test(task.taskTemplateId)).map((task) => task.taskTemplateId);
  check(stabilizationVisitTemplates.length === 0, "explicit stabilization visit-task mapping changed");
  check(operationsPolicy.urgentOvercapacity.attemptOrder.includes("explicit_stabilization_task"), "urgent policy must retain explicit stabilization step");

  const inventoryCapabilityIds = sorted(new Set(researchCatalog.researchTasks.flatMap((task) => task.inventoryCapabilityIds)));
  check(inventoryCapabilityIds.length === 21, "used inventory capability count must remain 21");
  const inventoryMappings = inventoryCapabilityIds.map((capabilityId) => ({
    capabilityId,
    inventoryPolicy: clone(p6ByCapability.get(capabilityId)?.inventoryPolicy || null),
  }));
  check(inventoryMappings.every((record) => record.inventoryPolicy), "all 21 used inventory capabilities must retain P6 policy mappings");
  const p6StartingLotsPresent = Object.prototype.hasOwnProperty.call(p6Economy.newCampaign || {}, "inventoryLots");
  check(p6StartingLotsPresent === false, "P6 starting-lot gap changed; review initial inventory authority");
  const schedulerInventoryContractPresent = /\b(inventory|stock|lot|consume)\b/iu.test(schedulerSource);
  check(schedulerInventoryContractPresent === false, "scheduler inventory transaction surface changed; re-review integration");
  const economyInventoryCommandsPresent = ["receiveInventory", "consumeInventory", "expireInventory"]
    .filter((command) => new RegExp(`\\b${command}\\b`, "u").test(economySource));
  check(economyInventoryCommandsPresent.length === 3, "P6 economy inventory command surface changed; re-review bridge");
  const operationsEconomyBridgePresent = /\b(economy|inventoryLots|consumeInventory)\b/iu.test(operationsSource);
  check(operationsEconomyBridgePresent === false, "operations/economy cross-state bridge changed; re-review atomicity");

  const cgmCapability = capabilityCatalog.capabilities.find((record) => record.capabilityId === "cgm_sensor");
  const cgmResource = resourcesById.get("equipment.cgm_sensor");
  const cgmEconomy = p6ByCapability.get("cgm_sensor");
  const deviceMigration = {
    capabilityId: "cgm_sensor",
    capabilityType: cgmCapability.capabilityType,
    p5ResourceId: cgmResource.resourceId,
    p5ResourceKind: cgmResource.resourceKind,
    p6AssetCatalogId: cgmEconomy.assetPolicy?.assetCatalogId || null,
    p6InventoryPolicy: clone(cgmEconomy.inventoryPolicy),
    approvedMigrationRule: null,
  };
  check(deviceMigration.capabilityType === "consumable_device" && deviceMigration.p6InventoryPolicy === null, "P3 consumable-device migration gap changed");

  const p5DurationByCapability = new Map(capabilityCatalog.capabilities.map((record) => [record.capabilityId, record.durationMinutes]));
  const durationDivergences = p6Economy.capabilityEconomics.flatMap((record) => {
    const p5DurationMinutes = p5DurationByCapability.get(record.capabilityId);
    return p5DurationMinutes !== record.durationMinutes ? [{
      capabilityId: record.capabilityId,
      p5ExecutionDurationMinutes: p5DurationMinutes,
      p6EconomyDurationMinutes: record.durationMinutes,
    }] : [];
  });
  check(durationDivergences.length === 312, "P5/P6 duration semantic divergence count must remain 312");

  const shiftBridgeMethods = ["hireStaff", "assignShift", "startShift", "endShift", "recordAbsence", "appendUnavailableWindow"];
  const missingShiftBridgeMethods = shiftBridgeMethods.filter((method) => !new RegExp(`\\b${method}\\b`, "u").test(`${schedulerSource}\n${operationsSource}`));
  check(missingShiftBridgeMethods.length === shiftBridgeMethods.length, "shift-policy bridge surface changed; re-review integration");
  const clockDriverMethods = ["advanceClock", "tick", "driveQueue", "scheduleQueuedTasks"];
  const missingClockDriverMethods = clockDriverMethods.filter((method) => !new RegExp(`\\b${method}\\b`, "u").test(`${schedulerSource}\n${operationsSource}`));
  check(missingClockDriverMethods.length === clockDriverMethods.length, "clock/queue driver surface changed; re-review integration");
  const p7Events = operationalReviewInput.sourcePolicies["source/p7-campaign.json"].events;
  const absenceEventMatches = operationsPolicy.absencePolicies.map((absence) => ({
    absenceTypeId: absence.absenceTypeId,
    exactP7EventIds: p7Events.filter((event) => event.eventId === absence.absenceTypeId).map((event) => event.eventId),
  }));
  check(absenceEventMatches.length === 3 && absenceEventMatches.every((record) => record.exactP7EventIds.length === 0), "P5 absence/P7 exact event mapping gap changed");
  const sourceLegacyIds = sourcePolicy.staff.filter((staff) => staff.legacyId !== null).map((staff) => ({
    resourceId: staff.staffId,
    legacyId: staff.legacyId,
    generatedLegacyId: resourcesById.get(staff.staffId)?.legacyId ?? null,
  }));
  check(sourceLegacyIds.length === 2 && sourceLegacyIds.every((record) => record.generatedLegacyId === null), "two dropped staff legacy IDs must remain visible");
  const sourceBaseFatigueByStaff = sourcePolicy.staff.map((staff) => {
    const generatedResource = resourcesById.get(staff.staffId);
    const generatedBaseFatigueFieldPaths = [
      Object.prototype.hasOwnProperty.call(generatedResource || {}, "baseFatigue") ? "baseFatigue" : null,
      Object.prototype.hasOwnProperty.call(generatedResource?.runtimeResourceTemplate || {}, "baseFatigue")
        ? "runtimeResourceTemplate.baseFatigue"
        : null,
    ].filter(Boolean);
    return {
      resourceId: staff.staffId,
      startsHired: staff.startsHired,
      sourceBaseFatigue: staff.baseFatigue,
      generatedBaseFatigueFieldPaths,
    };
  });
  check(sourceBaseFatigueByStaff.length === 10, "source baseFatigue staff count must remain 10");
  check(
    sourceBaseFatigueByStaff.every((record) => Number.isSafeInteger(record.sourceBaseFatigue)
      && record.sourceBaseFatigue >= 0
      && record.sourceBaseFatigue <= 100),
    "source baseFatigue values must remain valid",
  );
  const sourceBaseFatigueValueCounts = [...new Set(sourceBaseFatigueByStaff.map((record) => record.sourceBaseFatigue))]
    .sort((left, right) => left - right)
    .map((baseFatigue) => ({
      baseFatigue,
      staffCount: sourceBaseFatigueByStaff.filter((record) => record.sourceBaseFatigue === baseFatigue).length,
    }));
  check(
    JSON.stringify(sourceBaseFatigueValueCounts) === JSON.stringify([
      { baseFatigue: 0, staffCount: 8 },
      { baseFatigue: 6, staffCount: 1 },
      { baseFatigue: 10, staffCount: 1 },
    ]),
    "source baseFatigue distribution must remain 10/6/0",
  );
  const generatedBaseFatigueMissingStaffIds = sourceBaseFatigueByStaff
    .filter((record) => record.generatedBaseFatigueFieldPaths.length === 0)
    .map((record) => record.resourceId);
  check(generatedBaseFatigueMissingStaffIds.length === 10, "generated resource baseFatigue projection gap changed");
  const explicitBaseFatigueStartupAuthorityFields = [
    "baseFatigueStartupAuthority",
    "fatigueStartupAuthority",
    "initialFatigueAuthority",
  ].filter((field) => Object.prototype.hasOwnProperty.call(sourcePolicy, field));
  check(explicitBaseFatigueStartupAuthorityFields.length === 0, "baseFatigue startup authority changed; re-review adapter authority");
  const startingDoctorIds = resourcesByKind.staff
    .filter((resource) => resource.startsActive && resource.role === "doctor")
    .map((resource) => resource.resourceId);
  check(startingDoctorIds.length === 2, "two starting doctors must remain visible");
  const authoredPolicyIdentifiers = [
    ...operationsPolicy.fatigueBands.map((band) => `${band.minimum}-${band.maximum}`),
    ...operationsPolicy.absencePolicies.map((policy) => policy.absenceTypeId),
    ...operationsPolicy.handoffPolicies.map((policy) => policy.policyId),
  ];
  const legacyCampaignDoctorIds = sorted(new Set(
    [...currentCampaignSource.matchAll(/\bid:\s*"(sokolova|morozov)"/gu)].map((match) => match[1]),
  ));
  check(sameStrings(legacyCampaignDoctorIds, ["morozov", "sokolova"]), "current legacy campaign doctor set changed");
  const p5FatigueAccumulationRulePresent = Object.prototype.hasOwnProperty.call(sourcePolicy, "fatigueAccumulation");
  const p5FatigueRecoveryRulePresent = Object.prototype.hasOwnProperty.call(sourcePolicy, "fatigueRecovery");
  check(!p5FatigueAccumulationRulePresent && !p5FatigueRecoveryRulePresent, "P5 fatigue authoring rules changed; re-review transition authority");
  const legacyMechanicsAccumulationPresent = /forecastFatigue/gu.test(campaignMechanicsSource);
  const legacyMechanicsRecoveryPresent = /REST_RECOVERY_PER_DAY/gu.test(campaignMechanicsSource);
  check(legacyMechanicsAccumulationPresent && legacyMechanicsRecoveryPresent, "legacy campaign fatigue mechanics surface changed");

  return deepFreeze({
    startsActiveCandidates: {
      staff: sorted(resourcesByKind.staff.filter((resource) => resource.startsActive).map((resource) => resource.resourceId)),
      rooms: sorted(resourcesByKind.room.filter((resource) => resource.startsActive).map((resource) => resource.resourceId)),
      equipment: sorted(resourcesByKind.equipment.filter((resource) => resource.startsActive).map((resource) => resource.resourceId)),
    },
    lifecycle: { missingLifecycleCommands },
    roomAssetMappings,
    roomsMissingAssetMappings,
    startingRoomOwnership: {
      rooms: startingRoomOwnership,
      p6NewCampaignAssetSeedPresent: Object.prototype.hasOwnProperty.call(p6Economy.newCampaign || {}, "assets"),
      crossSystemActivatableSetResolved: false,
      p5RequirementFreeStaffIds: sorted(resourcesByKind.staff.filter((resource) => resource.startsActive && resource.activationRequirements.length === 0).map((resource) => resource.resourceId)),
    },
    equipmentAssetMappings,
    startingEquipment,
    equipmentWithoutStockMapping,
    staffingEconomy: { p5Roles, p6WageRoles, missingWageRoles, affectedResourceIds: ["staff.imaging.zhukova"] },
    startAvailability: {
      startsActiveCandidates: candidateActiveResourceIds.size,
      p5RequirementFreeResources: p5RequirementFreeResourceIds.size,
      candidate: { ...candidateStartAvailability, blockedUsageCount: candidateBlockedUsageCount },
      p5RequirementFree: { ...p5RequirementFreeStartAvailability, blockedUsageCount: p5RequirementFreeBlockedUsageCount },
    },
    checkin: checkinDetails,
    skills: { separateSkillRequirementTasks: skillTasks.length, multiSkillDoubleReservations },
    dayOneReferralRoutes,
    handoff: {
      distribution: handoffDistribution,
      fractionalUsages: fractionalHandoffUsages,
      runtimePolicyIdentifiers: runtimeHandoffPolicyIdentifiers,
      bundledValidatorFixture: {
        taskTemplateId: bundledHandoffFixture.taskTemplateId,
        authoredPolicyId: bundledHandoffFixture.handoff,
        packageValidatorCallsSchedulerHandoffDirectly: true,
      },
      capabilityPolicyCoverage: {
        capabilities: capabilityCatalog.capabilities.length,
        capabilitiesWithHandoffPolicy: capabilityMappingsWithHandoffPolicy.length,
        taskBearingCapabilities: 367,
        taskBearingCapabilityIdsWithoutHandoffPolicy,
      },
    },
    safeRoutes: {
      researchSafeRouteIds,
      urgentPolicySafeRouteId: operationsPolicy.urgentOvercapacity.safeRouteId,
      usageRuntimeOverrideFields: sorted(new Set(usageCatalog.usageTasks.flatMap((usage) => Object.keys(usage.runtimeOverrides)))),
    },
    routeBranching: {
      p3NullFallbackDefaults: nullFallbackDefaults,
      externalCoordinationTasks: externalCoordinationTasks.length,
      externalWithLocalPhysicalRequirements,
    },
    stabilization: {
      attemptOrder: clone(operationsPolicy.urgentOvercapacity.attemptOrder),
      mappedVisitTaskTemplateIds: stabilizationVisitTemplates,
      explicitMappingFieldPresent: Object.prototype.hasOwnProperty.call(operationsPolicy.urgentOvercapacity, "stabilizationTaskTemplateId"),
    },
    inventory: {
      usedCapabilityIds: inventoryCapabilityIds,
      mappedPolicies: inventoryMappings,
      p6StartingLotsPresent,
      schedulerInventoryContractPresent,
      economyInventoryCommandsPresent,
      operationsEconomyBridgePresent,
      atomicSchedulerEconomyTransactionPresent: false,
      queuedOrInFlightInventoryOwnershipTransferPresent: false,
    },
    deviceMigration,
    clockQueue: { clock: clone(operationsPolicy.clock), missingClockDriverMethods },
    shifts: {
      scheduleDays: staffingCatalog.days.length,
      scheduleAuthority: staffingCatalog.authority,
      missingShiftBridgeMethods,
      oneDoctorUntilSecondConsultOwned: operationsPolicy.scheduling.oneDoctorUntilSecondConsultOwned,
      startingDoctorIds: sorted(startingDoctorIds),
      secondConsultStartsActive: resourcesById.get("room.consult.2").startsActive,
      sourceLegacyIdsDroppedFromGenerated: sourceLegacyIds,
      absenceEventMatches,
    },
    runtimePolicies: {
      policySections: ["clock", "fatigueBands", "scheduling", "delegation", "handoffPolicies", "absencePolicies", "maintenancePolicy", "urgentOvercapacity", "activation"],
      authoredPolicyIdentifiers,
      staffCount: resourcesByKind.staff.length,
      p5FatigueBands: operationsPolicy.fatigueBands.length,
      sourceBaseFatigueByStaff,
      sourceBaseFatigueValueCounts,
      generatedBaseFatigueMissingStaffIds,
      generatedBaseFatigueProjectionComplete: generatedBaseFatigueMissingStaffIds.length === 0,
      explicitBaseFatigueStartupAuthorityFields,
      adapterMaySeedAuthoredBaseFatigue: false,
      p5FatigueAccumulationRulePresent,
      p5FatigueRecoveryRulePresent,
      legacyCampaignDoctorIds,
      legacyMechanicsAccumulationPresent,
      legacyMechanicsRecoveryPresent,
      approvedStaffCrosswalkPresent: false,
      approvedFatigueTransitionAuthorityPresent: false,
    },
    durationSemantics: {
      comparedCapabilities: p6Economy.capabilityEconomics.length,
      divergentCapabilities: durationDivergences.length,
      matchingCapabilities: p6Economy.capabilityEconomics.length - durationDivergences.length,
      divergences: durationDivergences,
    },
  });
}

export function validateP5AuthoringPackage({
  registration,
  manifest,
  sourceFiles,
  sourceBytesByPath,
  catalogs,
  sourcePolicy,
  capabilityRegistry,
  capabilityBytes,
  operationalReviewInput,
  baselineManifest,
  schedulerSource,
  operationsSource,
  economySource,
  currentCampaignSource,
  campaignMechanicsSource,
}) {
  validateP5ReviewInputRegistration(registration);
  const capabilityIds = validateCapabilityRegistry(registration, capabilityRegistry, capabilityBytes);
  check(isObject(manifest), "P5 authoring manifest is missing");
  check(manifest.schemaVersion === 1, "P5 manifest schemaVersion must be 1");
  check(manifest.packageId === registration.packageId, "P5 manifest packageId mismatch");
  check(manifest.packageVersion === registration.packageVersion, "P5 manifest packageVersion mismatch");
  check(manifest.status === registration.status, "P5 manifest status mismatch");
  check(manifest.runtimeEligible === false, "P5 manifest runtimeEligible must remain false");
  check(sameStrings(manifest.activationRequires, EXPECTED_ACTIVATION_REQUIREMENTS), "P5 activation requirements changed");
  check(manifest.boundaries?.medicalTruthAllowed === false, "P5 must not author medical truth");
  check(manifest.boundaries?.rendererGrantsOwnership === false, "renderer must not grant ownership");
  check(manifest.boundaries?.fatigueChangesClinicalResult === false, "fatigue must not change clinical results");
  check(manifest.boundaries?.p3OwnsResearchResults === true, "P3 must retain result authority");
  check(manifest.boundaries?.p6OwnsInventoryAssetsAndMaintenanceLedger === true, "P6 must retain inventory/asset authority");
  check(manifest.boundaries?.p7OwnsEventTriggering === true, "P7 must retain event authority");
  check(manifest.boundaries?.saveSchemaChange === false, "P5 must not change save schema");
  check(manifest.boundaries?.newCampaignsOnly === true, "P5 must remain new-campaign-only");
  check(manifest.sources?.capabilityRegistryId === registration.capabilityRegistry.registryId, "manifest capability registry ID mismatch");
  check(manifest.sources?.capabilityRegistryVersion === registration.capabilityRegistry.registryVersion, "manifest capability registry version mismatch");
  check(manifest.sources?.p3ResearchCatalogVersion === "2026.07.16.1", "P3 research source version mismatch");
  check(manifest.sources?.p3UsageCatalogVersion === "2026.07.16.1", "P3 usage source version mismatch");
  check(manifest.sources?.p6EconomyCatalogVersion === "2026.07.16.1", "P6 economy source version mismatch");
  check(isObject(manifest.counts), "P5 manifest counts are missing");
  for (const [field, expected] of Object.entries(EXPECTED_MANIFEST_COUNTS)) {
    check(manifest.counts[field] === expected, `P5 manifest count ${field} mismatch`);
  }
  checkArray(manifest.files, "P5 manifest files");
  checkUnique(manifest.files, "P5 manifest files");
  manifest.files.forEach((file) => checkSafePath(file, `manifest file ${file}`));
  check(manifest.files.length === 17, "P5 manifest must describe exactly 17 source files");
  check(sameStrings(sourceFiles, manifest.files), "P5 manifest and source file set differ");
  check(sameStrings(Object.keys(catalogs), Object.keys(EXPECTED_GENERATED_CATALOGS)), "generated P5 catalog file set mismatch");
  check(isObject(sourcePolicy), "P5 source policy is missing");
  check(sourcePolicy.catalogVersion === P5_REVIEW_INPUT_VERSION, "P5 source policy version mismatch");
  check(sourcePolicy.status === P5_REVIEW_STATUS, "P5 source policy status mismatch");
  check(sourcePolicy.runtimeEligible === false, "P5 source policy runtimeEligible must remain false");
  check(JSON.stringify(sourcePolicy.boundaries) === JSON.stringify(manifest.boundaries), "P5 source/manifest authority boundaries differ");
  const forbiddenClinicalPayloadKeys = findForbiddenClinicalPayloadKeys({ catalogs, sourcePolicy }, "p5Authoring");
  check(forbiddenClinicalPayloadKeys.length === 0, forbiddenClinicalPayloadKeys[0] || "P5 generated catalogs contain forbidden clinical payload");
  check(operationalReviewInput.reviewOnly === true && operationalReviewInput.runtimeEligible === false, "operational dependency must remain review-only");

  const validated = validateP5Catalogs({ registration, catalogs, capabilityIds, operationalReviewInput });
  check(isObject(baselineManifest) && baselineManifest.caseCount === 30, "tier-01-v2 baseline must remain at 30 cases");
  checkArray(baselineManifest.cases, "tier-01-v2 baseline cases");
  const baselineCaseIds = baselineManifest.cases.map((entry) => entry.id);
  checkUnique(baselineCaseIds, "tier-01-v2 baseline case IDs");
  const baselineCrosswalkMatches = [];
  for (const caseId of baselineCaseIds) {
    for (const [relativePath, bytes] of sourceBytesByPath) {
      if (Buffer.from(bytes).includes(Buffer.from(caseId, "utf8"))) baselineCrosswalkMatches.push({ caseId, path: relativePath });
    }
  }
  check(baselineCrosswalkMatches.length === 0, "P5 review input contains an unapproved current 30-card crosswalk");

  const gapAudit = buildGapAudit(
    validated,
    sourcePolicy,
    operationalReviewInput,
    schedulerSource,
    operationsSource,
    economySource,
    currentCampaignSource,
    campaignMechanicsSource,
  );
  check(
    validated.visitCatalog.tasks.length
      + validated.researchCatalog.researchTasks.length
      + validated.usageCatalog.usageTasks.length
      + validated.capabilityCatalog.capabilities.filter((record) => TASK_BEARING_MODES.has(record.executionMode)).length
      === registration.expectedCounts.runtimeTaskConfigurations,
    "runtime task configuration count mismatch",
  );
  const blockers = [
    makeBlocker("activation_requirements_unsatisfied", "P5 declares four external activation gates and remains review-only.", { activationRequires: manifest.activationRequires }),
    makeBlocker("p5_upstream_operational_catalogs_review_only", "P3/P6/P7 authoring dependencies are validated review inputs, not runtime-eligible production catalogs.", {
      operationalInput: `${operationalReviewInput.registration.reviewInputId}@${operationalReviewInput.registration.reviewInputVersion}`,
      runtimeEligible: operationalReviewInput.runtimeEligible,
      p3RuntimeEligible: operationalReviewInput.catalogs["generated/p3/research-catalog.json"].runtimeEligible,
      p6RuntimeEligible: operationalReviewInput.catalogs["generated/p6/economy-catalog.json"].runtimeEligible,
    }),
    makeBlocker("p5_resource_lifecycle_resolver_missing", "The scheduler has no command surface that atomically activates/deactivates authored potential resources from ownership, hire, delivery, training, readiness, maintenance, stock and shift evidence.", gapAudit.lifecycle),
    makeBlocker("p5_p6_room_asset_mapping_missing", "Four locked P5 rooms requiring P6 ownership have no exact P6 assetCatalogId mapping.", { mappings: gapAudit.roomAssetMappings, missingResourceIds: gapAudit.roomsMissingAssetMappings }),
    makeBlocker("p5_starting_room_ownership_seed_missing", "Five starting rooms have no P5 activation requirements, but P6 is the ownership authority and provides neither exact asset mappings nor a new-campaign ownership seed/exception; the cross-system activatable set is unresolved.", gapAudit.startingRoomOwnership),
    makeBlocker("p5_starting_equipment_readiness_stock_mapping_missing", "The two starting devices still require maintenance/stock evidence, while all 27 equipment stock gates lack an exact P6 inventory policy mapping.", { startingEquipment: gapAudit.startingEquipment, equipmentWithoutStockMapping: gapAudit.equipmentWithoutStockMapping }),
    makeBlocker("p5_p6_imaging_wage_role_missing", "P5 authors imaging_staff, but P6 has no wage row for that role.", gapAudit.staffingEconomy),
    makeBlocker("p5_day1_checkin_unavailable", "visit.checkin can only reserve the inactive administrator and has no authored doctor fallback.", gapAudit.checkin),
    makeBlocker("p5_inactive_anyof_filtering_missing", "Generated anyOf lists contain potential inactive resources; importing startsActive resources without an explicit filter leaves empty requirement groups and unknown resource IDs.", gapAudit.startAvailability),
    makeBlocker("p5_skill_requirement_double_reservation", "Thirty-three research tasks create separate skill groups; five multi-skill tasks can reserve extra staff even when the base staff already owns part of the qualification, conflicting with capacity=1 and the single-qualified-staff rule.", gapAudit.skills),
    makeBlocker("p5_day1_referral_no_doctor_fallback", "All 11 research safe-route capabilities require the inactive administrator for referral coordination and have no doctor fallback on day one.", { routes: gapAudit.dayOneReferralRoutes }),
    makeBlocker("p5_handoff_policy_gate_missing", "The runtime exposes the safe atomic handoff primitive but does not enforce P5 not_allowed/midpoint/urgent-quarter policy IDs.", { distribution: gapAudit.handoff.distribution, runtimePolicyIdentifiers: gapAudit.handoff.runtimePolicyIdentifiers }),
    makeBlocker("p5_capability_handoff_policy_missing", "None of 447 capability mappings, including all 367 task-bearing capability configurations, declares a handoff policy; independent capability tasks cannot safely infer one.", gapAudit.handoff.capabilityPolicyCoverage),
    makeBlocker("p5_handoff_rounding_undefined", "Authored fractional handoff breakpoints have no minute-rounding rule, so the adapter cannot choose a deterministic valid minute without new policy.", { fractionalUsages: gapAudit.handoff.fractionalUsages }),
    makeBlocker("p5_safe_route_precedence_ambiguous", "Research tasks declare 11 route IDs while urgent-overcapacity declares generic safe_referral; runtimeOverrides carry no route ID and precedence is unspecified.", gapAudit.safeRoutes),
    makeBlocker("p5_p3_route_branching_missing", "Twelve null P3 fallbacks are defaulted to safe_referral, and 27 of 135 external-coordination tasks retain local physical requirements without an explicit local-versus-external branch contract.", gapAudit.routeBranching),
    makeBlocker("p5_stabilization_route_mapping_missing", "urgentOvercapacity names explicit_stabilization_task but does not map it to an authored visit task template.", gapAudit.stabilization),
    makeBlocker("p5_inventory_scheduler_transaction_missing", "All 21 used consumable capabilities map to P6 inventory policies, but there are no starting lots, no atomic scheduler/economy transaction, and no exact queued/in-flight stock ownership-transfer contract.", gapAudit.inventory),
    makeBlocker("p5_p3_device_migration_missing", "cgm_sensor is authored as a reusable P5 equipment resource and P6 asset despite canonical consumable_device semantics; no approved migration rule exists.", gapAudit.deviceMigration),
    makeBlocker("p5_clock_queue_driver_missing", "P5 clock and queue policies are data only; no runtime driver advances campaign minutes and schedules queued work against them.", gapAudit.clockQueue),
    makeBlocker("p5_shift_policy_bridge_missing", "The 30-day staffing catalog is recommendation-only and no hire/shift/absence bridge binds player choice and P6 wages to scheduler availability.", gapAudit.shifts),
    makeBlocker("p5_runtime_operational_policies_unwired", "P5 supplies fatigue bands and per-staff baseFatigue values (10, 6 and 0), but all 10 authored baseFatigue values are dropped from the generated resource projection and no explicit contract defines whether or how they seed runtime fatigue. Accumulation/recovery, delegation, absence, maintenance, urgent-overcapacity, activation and the transition from the two legacy doctors also remain unwired.", gapAudit.runtimePolicies),
    makeBlocker("p5_p6_duration_semantic_divergence", "P5 execution durations and P6 economy durations differ for 312 capabilities; the adapter needs an explicit two-clock authority rule and must not merge them automatically.", gapAudit.durationSemantics),
  ];
  check(blockers.length === 23, "P5 blocker inventory must remain complete");

  return deepFreeze({
    counts: {
      sourceFiles: sourceFiles.length,
      sourceBytes: [...sourceBytesByPath.values()].reduce((total, bytes) => total + bytes.length, 0),
      productionPool: 0,
      staff: validated.resourcesByKind.staff.length,
      rooms: validated.resourcesByKind.room.length,
      equipmentResources: validated.resourcesByKind.equipment.length,
      totalResources: validated.resourcesCatalog.resources.length,
      visitTaskTemplates: validated.visitCatalog.tasks.length,
      capabilitiesMapped: validated.capabilityCatalog.capabilities.length,
      researchTasks: validated.researchCatalog.researchTasks.length,
      investigationUsagesMapped: validated.usageCatalog.usageTasks.length,
      scheduleDays: validated.staffingCatalog.days.length,
      baselineCases: baselineCaseIds.length,
      baselineCrosswalkMatches: baselineCrosswalkMatches.length,
    },
    baselineCaseIdCrosswalkMatches: baselineCrosswalkMatches,
    gapAudit,
    blockers,
  });
}

export async function loadP5AuthoringReviewInputFromReader(reader, registry, options = {}) {
  check(reader && typeof reader.readBytes === "function", "reader.readBytes is required");
  check(reader && typeof reader.listFiles === "function", "reader.listFiles is required");
  const registration = resolveP5AuthoringReviewInput(registry, options);
  const sourceRoot = joinPath(registration.root, registration.sourceRoot);
  const provenancePath = joinPath(registration.root, registration.provenancePath);
  const [
    provenanceBytes,
    sourceFiles,
    capabilityBytes,
    baselineManifestBytes,
    schedulerBytes,
    operationsBytes,
    economyBytes,
    currentCampaignBytes,
    campaignMechanicsBytes,
    p3ResearchBytes,
    p3UsageBytes,
    p6EconomyBytes,
    operationalReviewInput,
  ] = await Promise.all([
    reader.readBytes(provenancePath),
    reader.listFiles(sourceRoot),
    reader.readBytes(registration.capabilityRegistry.path),
    reader.readBytes(P5_BASELINE_MANIFEST_PATH),
    reader.readBytes(P5_SCHEDULER_PATH),
    reader.readBytes(P5_OPERATIONS_RUNTIME_PATH),
    reader.readBytes(P5_ECONOMY_RUNTIME_PATH),
    reader.readBytes(P5_CURRENT_CAMPAIGN_PATH),
    reader.readBytes(P5_CAMPAIGN_MECHANICS_PATH),
    reader.readBytes("content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.1/source/generated/p3/research-catalog.json"),
    reader.readBytes("content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.1/source/generated/p3/investigation-usage-policy.json"),
    reader.readBytes("content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.1/source/generated/p6/economy-catalog.json"),
    loadOperationalAuthoringReviewInputFromReader(reader, registry, { context: "review" }),
  ]);
  check(
    operationalReviewInput.sourceIntegrity.aggregateSha256
      === registration.operationalReviewInput.sourceIntegrity.aggregateSha256,
    "operational review input aggregate digest drift",
  );
  check(sha256(p3ResearchBytes) === registration.operationalReviewInput.catalogSha256.p3Research, "P3 research catalog digest drift");
  check(sha256(p3UsageBytes) === registration.operationalReviewInput.catalogSha256.p3Usages, "P3 usage catalog digest drift");
  check(sha256(p6EconomyBytes) === registration.operationalReviewInput.catalogSha256.p6Economy, "P6 economy catalog digest drift");
  check(sha256(provenanceBytes) === registration.sourceIntegrity.provenanceSha256, "provenance file SHA-256 mismatch");
  const provenance = parseJson(provenanceBytes, provenancePath);
  const sourceBytesByPath = new Map();
  await Promise.all(sourceFiles.map(async (relativePath) => {
    sourceBytesByPath.set(relativePath, await reader.readBytes(joinPath(sourceRoot, relativePath)));
  }));
  const sourceIntegrity = validateP5SourceProvenance(registration, provenance, sourceFiles, sourceBytesByPath);
  const manifest = parseJson(sourceBytesByPath.get("MANIFEST.json"), registration.manifestPath);
  const catalogs = Object.fromEntries(Object.keys(EXPECTED_GENERATED_CATALOGS).map((relativePath) => [
    relativePath,
    parseJson(sourceBytesByPath.get(relativePath), relativePath),
  ]));
  const sourcePolicy = parseJson(sourceBytesByPath.get("source/p5-policy.json"), "source/p5-policy.json");
  const capabilityRegistry = parseJson(capabilityBytes, registration.capabilityRegistry.path);
  const baselineManifest = parseJson(baselineManifestBytes, P5_BASELINE_MANIFEST_PATH);
  const audit = validateP5AuthoringPackage({
    registration,
    manifest,
    sourceFiles,
    sourceBytesByPath,
    catalogs,
    sourcePolicy,
    capabilityRegistry,
    capabilityBytes,
    operationalReviewInput,
    baselineManifest,
    schedulerSource: Buffer.from(schedulerBytes).toString("utf8"),
    operationsSource: Buffer.from(operationsBytes).toString("utf8"),
    economySource: Buffer.from(economyBytes).toString("utf8"),
    currentCampaignSource: Buffer.from(currentCampaignBytes).toString("utf8"),
    campaignMechanicsSource: Buffer.from(campaignMechanicsBytes).toString("utf8"),
  });
  return deepFreeze({
    loadContext: P5_REVIEW_CONTEXT,
    reviewOnly: true,
    productionEligible: false,
    runtimeEligible: false,
    allowCurrentCaseCrosswalk: false,
    registration: clone(registration),
    manifest: clone(manifest),
    catalogs: clone(catalogs),
    sourcePolicy: clone(sourcePolicy),
    sourceIntegrity,
    capabilityRegistryIdentity: {
      registryId: capabilityRegistry.registryId,
      registryVersion: capabilityRegistry.registryVersion,
      sha256: registration.capabilityRegistry.sha256,
      count: capabilityRegistry.capabilities.length,
    },
    upstreamOperationalIdentity: {
      reviewInputId: operationalReviewInput.registration.reviewInputId,
      reviewInputVersion: operationalReviewInput.registration.reviewInputVersion,
      runtimeEligible: operationalReviewInput.runtimeEligible,
    },
    productionPool: Object.freeze([]),
    audit,
    blockers: clone(audit.blockers),
  });
}

export async function loadP5AuthoringReviewInput(projectRoot, options = {}) {
  const reader = createFileSystemReviewInputReader(projectRoot);
  const registry = parseJson(await reader.readBytes(REVIEW_INPUT_REGISTRY_PATH), REVIEW_INPUT_REGISTRY_PATH);
  return loadP5AuthoringReviewInputFromReader(reader, registry, options);
}
