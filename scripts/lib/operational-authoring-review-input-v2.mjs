import { createHash } from "node:crypto";

import {
  MEDICAL_REVIEW_INPUT_V40_VERSION,
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
  loadMedicalAuthoringReviewInputFromReader,
  validateReviewInputRegistry,
} from "./medical-authoring-review-input.mjs";

export const OPERATIONAL_REVIEW_INPUT_V2_ID = "vetgeme-operational-production-authoring";
export const OPERATIONAL_REVIEW_INPUT_V2_VERSION = "2026.07.16.2";
export const OPERATIONAL_REVIEW_INPUT_V2_ROOT =
  "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.2";
export const OPERATIONAL_REVIEW_INPUT_V2_CONTEXT = "review";
export const OPERATIONAL_REVIEW_INPUT_V2_STATUS = "author_complete_validation_passed";
export const BASELINE_MANIFEST_PATH = "content/packs/tier-01-v2/clinical/tier-01/manifest.json";

const OPERATIONAL_PROVENANCE_SHA256 = "1134ba0ee80a6967b63764ff6e1466b5f5b97b3822bb36f577b391c3d65c6dbd";
const OPERATIONAL_AGGREGATE_SHA256 = "3a92755e321cb3151921f0d8f12b4f52ce3ea2fef136d15ba1014fce141bbd62";
const OPERATIONAL_ARCHIVE_SHA256 = "0f271166547eb9dfa08f5bc195d6e5dba123f267353d2f09fbe7786b9bfb46f3";
const MEDICAL_ARCHIVE_SHA256 = "171659e929f4b8a83cf921a8fa689cd3f5ac632466c4c328dd047199fced71c5";
const MEDICAL_AGGREGATE_SHA256 = "3f3f89ab93e005a5100b39586328c38fa6b4fcf52887be63cabc41ac05c557c8";
const MEDICAL_PROVENANCE_SHA256 = "8dda49a530366c3b42f0d0c94bb5e7adf322e87b36df6e7d2d321a434012ecab";
const P5_REVIEW_INPUT_ID = "vetgeme-p5-production-authoring";
const P5_REVIEW_INPUT_VERSION = "2026.07.16.2";
const P5_ARCHIVE_SHA256 = "665183acc97096477dd9366b8116a65a11862e4919d02170278f8e97e241a7ab";
const CAPABILITY_REGISTRY_ID = "vetgeme-clinic-capabilities";
const CAPABILITY_REGISTRY_VERSION = "2026.07.14.38";
const CAPABILITY_REGISTRY_PATH =
  "content/system-packs/vetgeme-master-2026-07-14/capability-registry.json";
const CAPABILITY_REGISTRY_SHA256 = "16ff64c015a8edb302c15289540a4ed760cfc356d832bca31094f992b1da3c81";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

const EXPECTED_COUNTS = Object.freeze({
  sourceFiles: 35,
  sourceBytes: 6305058,
  families: 39,
  variants: 215,
  presentations: 645,
  researchIds: 361,
  researchRoutesLocal: 230,
  researchRoutesExternal: 131,
  investigationUsages: 1864,
  providers: 6,
  ownerProfiles: 12,
  temperaments: 8,
  observableCues: 10,
  temperamentTags: 128,
  ownerModifierTags: 463,
  handlingAlternativeTags: 446,
  behaviorPresentations: 645,
  capabilities: 447,
  supplementalCapabilities: 8,
  p5ResourcesCrosswalked: 49,
  inventoryCategories: 10,
  reputationAxes: 4,
  p7EvidenceResolvers: 93,
  campaignDays: 30,
  chapters: 6,
  goals: 60,
  events: 27,
  milestones: 6,
  specializations: 3,
  endings: 6,
  productionPool: 0,
});

const EXPECTED_ACTIVATION_REQUIREMENTS = Object.freeze([
  "programmer_schema_adapter_review",
  "medical_family_external_veterinary_approval",
  "full_runtime_smoke_and_save_reload",
  "product_owner_balance_acceptance",
]);

const REQUIRED_JSON_PATHS = Object.freeze([
  "MANIFEST.json",
  "reports/AUTHOR_DECISION_MATRIX.json",
  "reports/CROSS_SYSTEM_V2_AUTHOR_MATRIX.json",
  "reports/VALIDATION_REPORT.json",
  "source/p3-policy.json",
  "source/p3-explicit-research-routes.json",
  "source/p4-policy.json",
  "source/p4-explicit-behavior-crosswalk.json",
  "source/p4-operational-requirements.json",
  "source/p6-balance.json",
  "source/p6-explicit-capability-economics.json",
  "source/p6-p5-exact-resource-crosswalk.json",
  "source/p7-campaign.json",
  "source/p7-evidence-resolver.json",
  "generated/p3/research-catalog.json",
  "generated/p3/investigation-usage-policy.json",
  "generated/p3/provider-catalog.json",
  "generated/p4/appearance-pools.json",
  "generated/p4/behavior-crosswalk.json",
  "generated/p4/history-policy.json",
  "generated/p4/observable-cues.json",
  "generated/p4/owner-profile-catalog.json",
  "generated/p4/temperament-catalog.json",
  "generated/p6/economy-catalog.json",
  "generated/p6/p3-p5-resource-crosswalk.json",
  "generated/p7/day-catalog.json",
  "generated/p7/director-catalog.json",
]);

const AUTHORITATIVE_EXACT_PATHS = Object.freeze([
  "source/p3-explicit-research-routes.json",
  "source/p4-explicit-behavior-crosswalk.json",
  "source/p4-operational-requirements.json",
  "source/p6-explicit-capability-economics.json",
  "source/p6-p5-exact-resource-crosswalk.json",
  "source/p7-evidence-resolver.json",
]);

function fail(message) {
  throw new Error(`Operational authoring v2 review input validation failed: ${message}`);
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

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
  return { id, status: "unresolved", summary, details };
}

function validateCatalogHeader(document, expectedId, label, expectedStatus) {
  check(isObject(document), `${label} must be an object`);
  check(document.schemaVersion === 1, `${label}.schemaVersion must be 1`);
  check((document.catalogId || document.policyId) === expectedId, `${label} identity mismatch`);
  check(
    (document.catalogVersion || document.policyVersion) === OPERATIONAL_REVIEW_INPUT_V2_VERSION,
    `${label} version mismatch`,
  );
  check(document.status === expectedStatus, `${label} status mismatch`);
  check(document.runtimeEligible === false, `${label}.runtimeEligible must remain false`);
}

function findForbiddenAuthorityKeys(value, location, found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenAuthorityKeys(item, `${location}[${index}]`, found));
    return found;
  }
  if (!isObject(value)) return found;
  for (const [key, child] of Object.entries(value)) {
    if (/match.?tokens?|regex|regular.?expression|first.?match/iu.test(key)) {
      found.push(`${location}.${key}`);
    }
    findForbiddenAuthorityKeys(child, `${location}.${key}`, found);
  }
  return found;
}

export function validateOperationalReviewInputV2Registration(registration) {
  check(isObject(registration), "review input registration must be an object");
  check(registration.reviewInputId === OPERATIONAL_REVIEW_INPUT_V2_ID, "unexpected reviewInputId");
  check(registration.reviewInputVersion === OPERATIONAL_REVIEW_INPUT_V2_VERSION, "unexpected reviewInputVersion");
  check(registration.kind === "operational_authoring", "kind must be operational_authoring");
  check(registration.packageId === OPERATIONAL_REVIEW_INPUT_V2_ID, "packageId mismatch");
  check(registration.packageVersion === OPERATIONAL_REVIEW_INPUT_V2_VERSION, "packageVersion mismatch");
  check(registration.root === OPERATIONAL_REVIEW_INPUT_V2_ROOT, "versioned operational root mismatch");
  checkSafePath(registration.root, "root");
  check(registration.sourceRoot === "source", "sourceRoot must be source");
  check(registration.manifestPath === "source/MANIFEST.json", "manifestPath must target source/MANIFEST.json");
  check(registration.provenancePath === "provenance.json", "provenancePath must be provenance.json");
  check(registration.status === OPERATIONAL_REVIEW_INPUT_V2_STATUS, "status mismatch");
  check(registration.reviewOnly === true, "reviewOnly must be true");
  check(registration.productionEligible === false, "productionEligible must be false");
  check(registration.runtimeEligible === false, "runtimeEligible must be false");
  check(registration.generatorEligible === false, "generatorEligible must be false");
  check(registration.allowCurrentCaseCrosswalk === false, "allowCurrentCaseCrosswalk must be false");
  check(registration.allowRuntimeActivation === false, "allowRuntimeActivation must be false");
  check(registration.allowActivationManifest === false, "allowActivationManifest must be false");

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
    registration.sourceIntegrity.provenanceSha256 === OPERATIONAL_PROVENANCE_SHA256,
    "operational .2 provenance digest mismatch",
  );
  check(
    registration.sourceIntegrity.aggregateSha256 === OPERATIONAL_AGGREGATE_SHA256,
    "operational .2 aggregate digest mismatch",
  );
  check(
    registration.sourceIntegrity.archiveSha256 === OPERATIONAL_ARCHIVE_SHA256,
    "operational .2 archive digest mismatch",
  );

  check(isObject(registration.medicalReviewInput), "medicalReviewInput dependency pin is required");
  check(
    registration.medicalReviewInput.reviewInputId === "vetgeme-medical-production-authoring"
      && registration.medicalReviewInput.reviewInputVersion === MEDICAL_REVIEW_INPUT_V40_VERSION,
    "medical dependency must pin review input .40",
  );
  check(registration.medicalReviewInput.productionEligible === false, "medical dependency must remain production-ineligible");
  check(registration.medicalReviewInput.generatorEligible === false, "medical dependency must remain generator-ineligible");
  check(
    registration.medicalReviewInput.sourceIntegrity?.archiveSha256 === MEDICAL_ARCHIVE_SHA256,
    "medical .40 archive digest mismatch",
  );
  check(
    registration.medicalReviewInput.sourceIntegrity?.aggregateSha256 === MEDICAL_AGGREGATE_SHA256,
    "medical .40 aggregate digest mismatch",
  );
  check(
    registration.medicalReviewInput.sourceIntegrity?.provenanceSha256 === MEDICAL_PROVENANCE_SHA256,
    "medical .40 provenance digest mismatch",
  );

  check(isObject(registration.p5ReviewInput), "p5ReviewInput dependency pin is required");
  check(
    registration.p5ReviewInput.reviewInputId === P5_REVIEW_INPUT_ID
      && registration.p5ReviewInput.reviewInputVersion === P5_REVIEW_INPUT_VERSION,
    "P5 dependency must pin review input .2",
  );
  check(registration.p5ReviewInput.reviewOnly === true, "P5 dependency must remain review-only");
  check(registration.p5ReviewInput.runtimeEligible === false, "P5 dependency must remain runtime-ineligible");
  check(
    registration.p5ReviewInput.sourceIntegrity?.archiveSha256 === P5_ARCHIVE_SHA256,
    "P5 .2 archive digest mismatch",
  );

  check(isObject(registration.capabilityRegistry), "capabilityRegistry pin is required");
  check(registration.capabilityRegistry.registryId === CAPABILITY_REGISTRY_ID, "capability registry ID mismatch");
  check(registration.capabilityRegistry.registryVersion === CAPABILITY_REGISTRY_VERSION, "capability registry version mismatch");
  check(registration.capabilityRegistry.path === CAPABILITY_REGISTRY_PATH, "capability registry path mismatch");
  check(registration.capabilityRegistry.sha256 === CAPABILITY_REGISTRY_SHA256, "capability registry digest mismatch");
  return registration;
}

export function resolveOperationalAuthoringReviewInputV2(registry, options = {}) {
  const registrations = validateReviewInputRegistry(registry);
  check(Object.prototype.hasOwnProperty.call(options, "context"), "explicit review context is required");
  check(
    options.context === OPERATIONAL_REVIEW_INPUT_V2_CONTEXT,
    `context ${String(options.context)} is forbidden; review is the only allowed context`,
  );
  const requestedId = options.reviewInputId || OPERATIONAL_REVIEW_INPUT_V2_ID;
  const requestedVersion = options.reviewInputVersion || OPERATIONAL_REVIEW_INPUT_V2_VERSION;
  check(requestedVersion === OPERATIONAL_REVIEW_INPUT_V2_VERSION, "v2 loader refuses non-.2 operational input");
  const registration = registrations.find((entry) => (
    entry.reviewInputId === requestedId && entry.reviewInputVersion === requestedVersion
  ));
  check(registration, `unknown review input ${requestedId}@${requestedVersion}`);
  return validateOperationalReviewInputV2Registration(registration);
}

export function validateOperationalV2SourceProvenance(
  registration,
  provenance,
  sourceFiles,
  sourceBytesByPath,
) {
  const identity = `${registration.reviewInputId}@${registration.reviewInputVersion}`;
  check(isObject(provenance), `${identity}: provenance is missing`);
  check(provenance.schemaVersion === 1, `${identity}: provenance schemaVersion must be 1`);
  check(
    provenance.provenanceId === "vetgeme-operational-production-authoring-review-source",
    `${identity}: provenanceId mismatch`,
  );
  check(provenance.packageId === registration.packageId, `${identity}: provenance packageId mismatch`);
  check(provenance.packageVersion === registration.packageVersion, `${identity}: provenance packageVersion mismatch`);
  check(
    provenance.sourceArchive === "operational-production-authoring-2026.07.16.2.zip",
    `${identity}: source archive mismatch`,
  );
  check(
    provenance.sourceDirectory === "operational-production-authoring-2026.07.16.2",
    `${identity}: source directory mismatch`,
  );
  check(isObject(provenance.archive), `${identity}: archive provenance is missing`);
  check(provenance.archive.path === provenance.sourceArchive, `${identity}: archive path mismatch`);
  check(
    provenance.archive.checksumPath === "operational-production-authoring-2026.07.16.2.zip.sha256",
    `${identity}: checksum path mismatch`,
  );
  check(provenance.archive.sha256 === registration.sourceIntegrity.archiveSha256, `${identity}: archive digest mismatch`);
  check(provenance.archive.zipEntryCount === 46, `${identity}: archive entry count mismatch`);
  check(provenance.archive.extractedFileCount === EXPECTED_COUNTS.sourceFiles, `${identity}: extracted file count mismatch`);
  check(provenance.archive.extractedBytes === EXPECTED_COUNTS.sourceBytes, `${identity}: extracted byte count mismatch`);
  check(provenance.sourceFileCount === EXPECTED_COUNTS.sourceFiles, `${identity}: source file count mismatch`);
  check(provenance.sourceBytes === EXPECTED_COUNTS.sourceBytes, `${identity}: source byte count mismatch`);
  check(provenance.aggregateSha256 === registration.sourceIntegrity.aggregateSha256, `${identity}: aggregate digest mismatch`);
  checkArray(provenance.files, `${identity}: provenance files`);
  check(provenance.files.length === EXPECTED_COUNTS.sourceFiles, `${identity}: provenance inventory count mismatch`);

  const listedPaths = provenance.files.map((file) => file.path);
  checkUnique(listedPaths, `${identity}: provenance file paths`);
  check(sameStrings(listedPaths, sourceFiles), `${identity}: source file set differs from provenance`);
  let verifiedBytes = 0;
  for (const file of provenance.files) {
    check(isObject(file), `${identity}: invalid provenance file entry`);
    checkSafePath(file.path, `${identity}: provenance file path`);
    check(file.originPath === `${provenance.sourceDirectory}/${file.path}`, `${identity}: originPath mismatch for ${file.path}`);
    checkInteger(file.bytes, `${identity}: ${file.path} bytes`);
    check(SHA256_PATTERN.test(file.sha256 || ""), `${identity}: invalid SHA-256 for ${file.path}`);
    const bytes = sourceBytesByPath.get(file.path);
    check(bytes !== undefined, `${identity}: source file is missing: ${file.path}`);
    check(bytes.length === file.bytes, `${identity}: byte length mismatch for ${file.path}`);
    check(sha256(bytes) === file.sha256, `${identity}: SHA-256 mismatch for ${file.path}`);
    verifiedBytes += bytes.length;
  }
  check(verifiedBytes === provenance.sourceBytes, `${identity}: verified byte total mismatch`);

  const aggregate = createHash("sha256");
  for (const file of provenance.files) {
    aggregate.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`, "utf8");
  }
  check(aggregate.digest("hex") === provenance.aggregateSha256, `${identity}: inventory digest mismatch`);
  check(isObject(provenance.archive.keyFileHashes), `${identity}: keyFileHashes are missing`);
  for (const [relativePath, expectedHash] of Object.entries(provenance.archive.keyFileHashes)) {
    checkSafePath(relativePath, `${identity}: key-file path`);
    check(SHA256_PATTERN.test(expectedHash || ""), `${identity}: invalid key-file digest for ${relativePath}`);
    const file = provenance.files.find((entry) => entry.path === relativePath);
    check(file, `${identity}: key file absent from inventory: ${relativePath}`);
    check(file.sha256 === expectedHash, `${identity}: key-file digest mismatch for ${relativePath}`);
  }
  return deepFreeze({
    sourceFiles: provenance.files.length,
    sourceBytes: verifiedBytes,
    provenanceSha256: registration.sourceIntegrity.provenanceSha256,
    aggregateSha256: provenance.aggregateSha256,
    archiveSha256: provenance.archive.sha256,
    keyFilesVerified: Object.keys(provenance.archive.keyFileHashes).length,
  });
}

function validateCapabilityRegistry(registration, capabilityRegistry, capabilityBytes) {
  check(sha256(capabilityBytes) === registration.capabilityRegistry.sha256, "capability registry SHA-256 mismatch");
  check(isObject(capabilityRegistry), "capability registry is missing");
  check(capabilityRegistry.schemaVersion === 1, "capability registry schemaVersion must be 1");
  check(capabilityRegistry.registryId === CAPABILITY_REGISTRY_ID, "capability registry ID mismatch");
  check(capabilityRegistry.registryVersion === CAPABILITY_REGISTRY_VERSION, "capability registry version mismatch");
  checkArray(capabilityRegistry.capabilities, "capability registry entries");
  check(capabilityRegistry.capabilities.length === EXPECTED_COUNTS.capabilities, "capability registry count mismatch");
  const ids = capabilityRegistry.capabilities.map((entry) => entry.id);
  check(ids.every(isNonEmptyString), "capability registry contains an invalid ID");
  checkUnique(ids, "capability registry IDs");
  return new Map(capabilityRegistry.capabilities.map((entry) => [entry.id, entry]));
}

function matchingBands(source, rules) {
  const normalized = String(source).toLowerCase();
  return rules.filter((rule) => rule.matchTokens.some((token) => normalized.includes(String(token).toLowerCase())));
}

function expectedTurnaroundCandidate(capability, urgencyBandId, p3Policy) {
  if (Array.isArray(capability.turnaroundDays)) {
    return {
      capabilityId: capability.id,
      kind: "working_day_range",
      minimumDays: capability.turnaroundDays[0],
      maximumDays: capability.turnaroundDays[1],
      deterministicRule: p3Policy.clock.deterministicRangeRule,
    };
  }
  const category = capability.turnaround || "contextual";
  const rule = p3Policy.turnaroundCategories[category];
  check(rule, `P3 capability ${capability.id} has unknown turnaround category ${category}`);
  return {
    capabilityId: capability.id,
    kind: "categorical_minutes",
    category,
    minutes: rule.minutes ?? rule.minutesByUrgencyBand?.[urgencyBandId],
  };
}

function validateP3(documents, capabilityById) {
  const policy = documents["source/p3-policy.json"];
  const explicit = documents["source/p3-explicit-research-routes.json"];
  const research = documents["generated/p3/research-catalog.json"];
  const usage = documents["generated/p3/investigation-usage-policy.json"];
  const providers = documents["generated/p3/provider-catalog.json"];
  validateCatalogHeader(policy, "vetgeme-p3-operational-policy", "P3 policy", "author_complete_programmer_adapter_required");
  validateCatalogHeader(explicit, "vetgeme-p3-explicit-research-routes", "P3 explicit routes", "author_complete_programmer_adapter_required");
  check(explicit.sourceMedicalPackageVersion === MEDICAL_REVIEW_INPUT_V40_VERSION, "P3 explicit routes must pin medical .40");
  checkArray(explicit.researchRoutes, "P3 explicit research routes");
  checkArray(research.research, "P3 generated research records");
  checkArray(usage.usages, "P3 investigation usages");
  checkArray(providers.providers, "P3 providers");
  check(explicit.researchRoutes.length === EXPECTED_COUNTS.researchIds, "P3 explicit route count mismatch");
  check(research.research.length === EXPECTED_COUNTS.researchIds, "P3 generated research count mismatch");
  check(usage.usages.length === EXPECTED_COUNTS.investigationUsages, "P3 usage count mismatch");
  check(providers.providers.length === EXPECTED_COUNTS.providers, "P3 provider count mismatch");
  const routeIds = explicit.researchRoutes.map((record) => record.researchId);
  const generatedIds = research.research.map((record) => record.researchId);
  checkUnique(routeIds, "P3 explicit research IDs");
  checkUnique(generatedIds, "P3 generated research IDs");
  checkUnique(usage.usages.map((record) => record.usageId), "P3 usage IDs");
  check(sameStrings(routeIds, generatedIds), "P3 explicit and generated research IDs differ");
  const routesById = new Map(explicit.researchRoutes.map((record) => [record.researchId, record]));
  const providersById = new Set(providers.providers.map((record) => record.providerId));
  const localRoutes = explicit.researchRoutes.filter((record) => record.routeMode === "local");
  const externalRoutes = explicit.researchRoutes.filter((record) => record.routeMode === "external");
  const medicalResultAuthorityMismatches = [];
  check(localRoutes.length === EXPECTED_COUNTS.researchRoutesLocal, "P3 local route count mismatch");
  check(externalRoutes.length === EXPECTED_COUNTS.researchRoutesExternal, "P3 external route count mismatch");
  check(localRoutes.length + externalRoutes.length === explicit.researchRoutes.length, "P3 contains unsupported route modes");
  for (const route of explicit.researchRoutes) {
    checkArray(route.requiredCapabilityIds, `${route.researchId}: requiredCapabilityIds`);
    check(route.requiredCapabilityIds.length > 0, `${route.researchId}: requiredCapabilityIds must not be empty`);
    check(route.requiredCapabilityIds.every((id) => capabilityById.has(id)), `${route.researchId}: unknown required capability`);
    checkArray(route.providerIds, `${route.researchId}: providerIds`);
    check(route.providerIds.every((id) => providersById.has(id)), `${route.researchId}: unknown provider`);
    check(isNonEmptyString(route.fallbackRouteId), `${route.researchId}: safe fallback route is required`);
    check(route.operationalResultGenerationForbidden === true, `${route.researchId}: operational result generation must remain forbidden`);
  }
  for (const record of research.research) {
    const route = routesById.get(record.researchId);
    check(route, `${record.researchId}: missing explicit route`);
    check(sameJson(record.familyIds, route.familyIds), `${record.researchId}: generated family IDs differ from explicit authority`);
    check(sameJson(record.requires, route.requiredCapabilityIds), `${record.researchId}: generated requirements differ from explicit authority`);
    check(record.routeMode === route.routeMode, `${record.researchId}: generated routeMode differs from explicit authority`);
    check(sameJson(record.providerIds, route.providerIds), `${record.researchId}: generated providers differ from explicit authority`);
    check(
      record.providerCoordinationMode === route.providerCoordinationMode,
      `${record.researchId}: generated provider coordination differs from explicit authority`,
    );
    check(record.primaryProviderId === route.primaryProviderId, `${record.researchId}: generated primary provider differs`);
    check(
      sameJson(record.activationGate?.requiredStatePredicates, route.lifecyclePredicates),
      `${record.researchId}: generated lifecycle predicates differ from explicit authority`,
    );
    check(record.activationGate?.fallbackRouteId === route.fallbackRouteId, `${record.researchId}: generated fallback differs`);
    check(record.operationalPolicyMayGenerateResult === false, `${record.researchId}: generated result authority drifted`);
    if (record.medicalResultAuthority !== route.medicalResultAuthority) {
      medicalResultAuthorityMismatches.push({
        researchId: record.researchId,
        explicit: route.medicalResultAuthority,
        generated: record.medicalResultAuthority,
      });
    }
  }
  check(
    medicalResultAuthorityMismatches.length === EXPECTED_COUNTS.researchIds,
    "P3 medical-result authority mismatch count must remain visible as 361",
  );
  check(
    medicalResultAuthorityMismatches.every((record) => (
      record.explicit === "medical_family.presentation.investigations[].result_only"
        && record.generated === "family.presentation.investigations[].result_only"
    )),
    "P3 medical-result authority mismatch shape changed",
  );
  for (const record of usage.usages) {
    check(routesById.has(record.researchId), `${record.usageId}: unknown researchId`);
    check(record.mappedByFamilyResearchContract === true, `${record.usageId}: medical research contract is unmapped`);
  }

  const unmatchedUrgency = usage.usages.filter((record) => (
    matchingBands(record.sourceUrgency, policy.urgencyBands).length === 0
  ));
  const unmatchedClassification = usage.usages.filter((record) => (
    matchingBands(record.sourceClassification, policy.classificationBands).length === 0
  ));
  const unmatchedUrgencyValues = sorted(new Set(unmatchedUrgency.map((record) => record.sourceUrgency)));
  const unmatchedClassificationValues = sorted(new Set(unmatchedClassification.map((record) => record.sourceClassification)));
  check(unmatchedUrgency.length === 2, "P3 unmatched urgency usage count must remain visible as 2");
  check(unmatchedUrgencyValues.length === 2, "P3 unmatched urgency value count must remain visible as 2");
  check(unmatchedClassification.length === 49, "P3 unmatched classification usage count must remain visible as 49");
  check(unmatchedClassificationValues.length === 36, "P3 unmatched classification value count must remain visible as 36");

  const generatedById = new Map(research.research.map((record) => [record.researchId, record]));
  const turnaroundMismatches = [];
  for (const record of usage.usages) {
    const generated = generatedById.get(record.researchId);
    if (generated.turnaroundPolicy?.kind !== "external") continue;
    const expectedCandidates = generated.requires
      .map((id) => capabilityById.get(id))
      .filter((capability) => capability?.type === "external_service")
      .map((capability) => expectedTurnaroundCandidate(capability, record.urgencyBandId, policy));
    const mismatches = expectedCandidates.flatMap((expected) => {
      const actual = generated.turnaroundPolicy.candidates.find((candidate) => (
        candidate.capabilityId === expected.capabilityId
      ));
      return sameJson(expected, actual) ? [] : [{ expected, actual: clone(actual) }];
    });
    if (mismatches.length > 0) {
      turnaroundMismatches.push({
        usageId: record.usageId,
        researchId: record.researchId,
        urgencyBandId: record.urgencyBandId,
        mismatches,
      });
    }
  }
  const turnaroundPairs = turnaroundMismatches.flatMap((record) => (
    record.mismatches.map((mismatch) => ({ ...record, mismatches: undefined, ...mismatch }))
  ));
  const turnaroundResearchIds = new Set(turnaroundMismatches.map((record) => record.researchId));
  check(turnaroundResearchIds.size === 46, "P3 urgency-specific turnaround research count must remain visible as 46");
  check(turnaroundMismatches.length === 137, "P3 urgency-specific turnaround usage count must remain visible as 137");
  check(turnaroundPairs.length === 168, "P3 urgency-specific turnaround pair count must remain visible as 168");
  check(
    turnaroundPairs.filter((record) => record.urgencyBandId === "emergency").length === 57,
    "P3 emergency turnaround pair count must remain visible as 57",
  );

  const localEmptyLifecyclePredicates = localRoutes
    .filter((route) => route.lifecyclePredicates.length === 0)
    .map((route) => route.researchId);
  check(localEmptyLifecyclePredicates.length === 222, "P3 local empty lifecycle predicate count must remain visible as 222");
  const lifecyclePredicateCounts = {};
  for (const predicate of explicit.researchRoutes.flatMap((route) => route.lifecyclePredicates)) {
    lifecyclePredicateCounts[predicate.predicate] = (lifecyclePredicateCounts[predicate.predicate] || 0) + 1;
  }
  check(sameJson(lifecyclePredicateCounts, {
    provider_route_available: 158,
    qualified_staff_scheduled: 6,
    stock_available: 1,
    owned: 3,
    delivery_complete: 3,
    maintenance_current: 3,
    ready_room_available: 1,
  }), "P3 lifecycle predicate distribution mismatch");
  return {
    audit: {
      researchIds: explicit.researchRoutes.length,
      localRoutes: localRoutes.length,
      externalRoutes: externalRoutes.length,
      investigationUsages: usage.usages.length,
      providers: providers.providers.length,
      medicalResultAuthorityMismatches: medicalResultAuthorityMismatches.length,
      unmatchedUrgencyUsages: unmatchedUrgency.length,
      unmatchedUrgencyValues: unmatchedUrgencyValues.length,
      unmatchedClassificationUsages: unmatchedClassification.length,
      unmatchedClassificationValues: unmatchedClassificationValues.length,
      turnaroundMismatchResearchIds: turnaroundResearchIds.size,
      turnaroundMismatchUsages: turnaroundMismatches.length,
      turnaroundMismatchPairs: turnaroundPairs.length,
      emergencyTurnaroundMismatchPairs: turnaroundPairs.filter((record) => record.urgencyBandId === "emergency").length,
      localRoutesWithEmptyLifecyclePredicates: localEmptyLifecyclePredicates.length,
      lifecyclePredicates: Object.values(lifecyclePredicateCounts).reduce((total, count) => total + count, 0),
      lifecyclePredicateCounts,
    },
    blockers: [
      makeBlocker(
        "p3_unmatched_urgency_and_classification",
        "P3 still defaults unmatched urgency and classification strings instead of resolving every usage explicitly.",
        {
          unmatchedUrgencyValues,
          unmatchedUrgencyUsageIds: unmatchedUrgency.map((record) => record.usageId),
          unmatchedClassificationValues,
          unmatchedClassificationUsageIds: unmatchedClassification.map((record) => record.usageId),
        },
      ),
      makeBlocker(
        "p3_urgency_specific_turnaround_ambiguity",
        "Generated P3 research turnaround is selected from one representative usage and is unsafe for usages in other urgency bands.",
        {
          researchIds: sorted(turnaroundResearchIds),
          usageCount: turnaroundMismatches.length,
          capabilityUsagePairCount: turnaroundPairs.length,
          emergencyPairCount: turnaroundPairs.filter((record) => record.urgencyBandId === "emergency").length,
          mismatches: turnaroundMismatches,
        },
      ),
      makeBlocker(
        "p3_medical_result_authority_projection_drift",
        "All generated P3 research records shorten the explicit medical-result authority path; runtime result ownership must remain blocked until a new author package corrects the generated projection.",
        {
          mismatchCount: medicalResultAuthorityMismatches.length,
          mismatches: medicalResultAuthorityMismatches,
          correctionInvented: false,
        },
      ),
    ],
  };
}

function validateP4(documents, capabilityById, medicalReviewInput) {
  const policy = documents["source/p4-policy.json"];
  const explicit = documents["source/p4-explicit-behavior-crosswalk.json"];
  const requirements = documents["source/p4-operational-requirements.json"];
  const generated = documents["generated/p4/behavior-crosswalk.json"];
  const owners = documents["generated/p4/owner-profile-catalog.json"];
  const temperaments = documents["generated/p4/temperament-catalog.json"];
  const cues = documents["generated/p4/observable-cues.json"];
  validateCatalogHeader(policy, "vetgeme-p4-identity-behavior-policy", "P4 policy", "author_complete_programmer_adapter_required");
  validateCatalogHeader(explicit, "vetgeme-p4-explicit-behavior-crosswalk", "P4 explicit crosswalk", "author_complete_programmer_adapter_required");
  validateCatalogHeader(requirements, "vetgeme-p4-operational-requirements", "P4 operational requirements", "author_complete_programmer_adapter_required");
  check(policy.crosswalkAuthority === "source/p4-explicit-behavior-crosswalk.json", "P4 explicit crosswalk authority mismatch");
  check(policy.matchTokensRuntimeForbidden === true, "P4 runtime token matching must remain forbidden");
  check(explicit.sourceMedicalPackageVersion === MEDICAL_REVIEW_INPUT_V40_VERSION, "P4 explicit crosswalk must pin medical .40");
  for (const [field, expected] of [
    ["ownerModifiers", EXPECTED_COUNTS.ownerModifierTags],
    ["temperamentTags", EXPECTED_COUNTS.temperamentTags],
    ["handlingAlternatives", EXPECTED_COUNTS.handlingAlternativeTags],
  ]) {
    checkArray(explicit[field], `P4 explicit ${field}`);
    check(explicit[field].length === expected, `P4 explicit ${field} count mismatch`);
    checkUnique(explicit[field].map((record) => record.sourceTag), `P4 explicit ${field} source tags`);
    check(
      explicit[field].every((record) => /explicit/iu.test(record.mappingAuthority || "")),
      `P4 explicit ${field} contains a non-explicit mapping authority`,
    );
  }
  checkArray(generated.presentations, "P4 generated presentations");
  check(generated.presentations.length === EXPECTED_COUNTS.behaviorPresentations, "P4 presentation count mismatch");
  check(owners.profiles.length === EXPECTED_COUNTS.ownerProfiles, "P4 owner profile count mismatch");
  check(temperaments.temperaments.length === EXPECTED_COUNTS.temperaments, "P4 temperament count mismatch");
  check(cues.rules.length === EXPECTED_COUNTS.observableCues, "P4 observable cue count mismatch");
  for (const field of ["ownerModifiers", "temperamentTags"]) {
    check(
      sameJson(generated[field], explicit[field]),
      `P4 generated ${field} differs from explicit author crosswalk`,
    );
  }
  const generatedHandlingByTag = new Map(generated.handlingAlternatives.map((record) => [record.sourceTag, record]));
  for (const record of explicit.handlingAlternatives) {
    const generatedRecord = generatedHandlingByTag.get(record.sourceTag);
    check(generatedRecord, `P4 generated handling record missing for ${record.sourceTag}`);
    for (const key of Object.keys(record)) {
      check(sameJson(generatedRecord[key], record[key]), `P4 ${record.sourceTag}: generated ${key} differs from explicit source`);
    }
  }
  checkArray(requirements.capabilities, "P4 operational capabilities");
  check(requirements.capabilities.length === EXPECTED_COUNTS.supplementalCapabilities, "P4 supplemental capability count mismatch");
  checkUnique(requirements.capabilities.map((record) => record.capabilityId), "P4 operational capability IDs");
  checkArray(requirements.safeRoutes, "P4 safe routes");
  const supplementalIds = new Set(requirements.capabilities.map((record) => record.capabilityId));
  const safeRouteById = new Map(requirements.safeRoutes.map((record) => [record.routeId, record]));
  for (const record of explicit.handlingAlternatives) {
    check(record.requiredCapabilities.every((id) => supplementalIds.has(id)), `${record.sourceTag}: unknown P4 operational capability`);
    check(record.safeRouteIds.every((id) => safeRouteById.has(id)), `${record.sourceTag}: unknown P4 safe route`);
    const generatedRecord = generatedHandlingByTag.get(record.sourceTag);
    const expectedRoutes = record.safeRouteIds.map((id) => safeRouteById.get(id));
    check(sameJson(generatedRecord.safeAlternatives, expectedRoutes), `${record.sourceTag}: generated safe route payload differs`);
    const runtimeAlternatives = checkArray(
      generatedRecord.runtimeActionTemplate?.safeAlternatives,
      `${record.sourceTag}: runtime safe alternatives`,
    );
    check(runtimeAlternatives.length === expectedRoutes.length, `${record.sourceTag}: runtime safe route count mismatch`);
    for (const alternative of runtimeAlternatives) {
      check(isNonEmptyString(alternative.factId), `${record.sourceTag}: runtime safe alternative factId is required`);
      check(alternative.kind === "safe_route", `${record.sourceTag}: runtime safe alternative kind mismatch`);
      const expectedRoute = safeRouteById.get(alternative.alternativeId);
      check(expectedRoute, `${record.sourceTag}: runtime safe alternative route is unknown`);
      check(sameJson(alternative.payload, expectedRoute), `${record.sourceTag}: runtime safe alternative payload differs from exact route`);
      check(
        isNonEmptyString(alternative.payload.providerResolver) || isNonEmptyString(alternative.payload.providerId),
        `${record.sourceTag}: providerResolver or explicit providerId is required`,
      );
      check(isNonEmptyString(alternative.payload.factOwner), `${record.sourceTag}: factOwner is required`);
      check(isNonEmptyString(alternative.payload.command), `${record.sourceTag}: safe route command is required`);
    }
  }

  const medicalFactIds = new Set();
  let medicalFactReferences = 0;
  for (const family of medicalReviewInput.families) {
    for (const variant of family.variants) {
      for (const presentation of variant.presentations) {
        for (const fact of presentation.criticalFacts || []) {
          medicalFactReferences += 1;
          if (isNonEmptyString(fact.factId)) medicalFactIds.add(fact.factId);
        }
      }
    }
  }
  const safeAlternativeFactIds = generated.handlingAlternatives.flatMap((record) => (
    record.runtimeActionTemplate.safeAlternatives.map((alternative) => alternative.factId)
  ));
  const uniqueSafeAlternativeFactIds = new Set(safeAlternativeFactIds);
  const boundMedicalFactIds = new Set([...uniqueSafeAlternativeFactIds].filter((id) => medicalFactIds.has(id)));
  check(safeAlternativeFactIds.length === 541, "P4 safe-alternative fact reference count must remain visible as 541");
  check(uniqueSafeAlternativeFactIds.size === 446, "P4 unique safe-alternative fact count must remain visible as 446");
  check(boundMedicalFactIds.size === 0, "P4 operational fact bindings unexpectedly claim medical fact authority");

  return {
    audit: {
      ownerProfiles: owners.profiles.length,
      temperaments: temperaments.temperaments.length,
      observableCues: cues.rules.length,
      ownerModifierTags: explicit.ownerModifiers.length,
      temperamentTags: explicit.temperamentTags.length,
      handlingAlternativeTags: explicit.handlingAlternatives.length,
      presentations: generated.presentations.length,
      supplementalCapabilities: requirements.capabilities.length,
      safeRoutes: requirements.safeRoutes.length,
      medicalFactReferences,
      uniqueMedicalFactIds: medicalFactIds.size,
      safeAlternativeFactReferences: safeAlternativeFactIds.length,
      uniqueSafeAlternativeFactIds: uniqueSafeAlternativeFactIds.size,
      boundMedicalFactIds: boundMedicalFactIds.size,
    },
    blockers: [
      makeBlocker(
        "p4_operational_fact_binding_review_required",
        "P4 safe alternatives use operational placeholder fact IDs; no author-approved binding to medical .40 critical fact IDs exists.",
        {
          medicalFactReferences,
          uniqueMedicalFactIds: medicalFactIds.size,
          safeAlternativeFactReferences: safeAlternativeFactIds.length,
          safeAlternativeFactIds: sorted(uniqueSafeAlternativeFactIds),
          medicalFactMatches: sorted(boundMedicalFactIds),
          requiredAuthority: "author_and_veterinary_reviewed_presentation_fact_crosswalk",
        },
      ),
    ],
  };
}

function validateP6(documents, capabilityById, registration) {
  const balance = documents["source/p6-balance.json"];
  const economics = documents["source/p6-explicit-capability-economics.json"];
  const crosswalk = documents["source/p6-p5-exact-resource-crosswalk.json"];
  const generatedEconomy = documents["generated/p6/economy-catalog.json"];
  const generatedCrosswalk = documents["generated/p6/p3-p5-resource-crosswalk.json"];
  validateCatalogHeader(balance, "vetgeme-p6-balance-catalog", "P6 balance", "author_complete_product_owner_balance_acceptance_required");
  validateCatalogHeader(economics, "vetgeme-p6-explicit-capability-economics", "P6 explicit economics", "author_complete_product_owner_balance_acceptance_required");
  validateCatalogHeader(crosswalk, "vetgeme-p6-p5-exact-resource-crosswalk", "P6/P5 exact crosswalk", "author_complete_product_owner_balance_acceptance_required");
  check(balance.capabilityEconomicsAuthority === "source/p6-explicit-capability-economics.json", "P6 explicit economics authority mismatch");
  check(balance.matchTokensRuntimeForbidden === true, "P6 runtime token matching must remain forbidden");
  check(crosswalk.p5PackageVersion === P5_REVIEW_INPUT_VERSION, "P6/P5 crosswalk must pin P5 .2");
  checkArray(economics.mappings, "P6 exact capability economics");
  checkArray(crosswalk.resources, "P6/P5 resources");
  checkArray(crosswalk.capabilities, "P6/P5 capabilities");
  checkArray(crosswalk.supplementalCapabilities, "P6/P5 supplemental capabilities");
  checkArray(crosswalk.startingInventory, "P6 starting inventory");
  check(economics.mappings.length === EXPECTED_COUNTS.capabilities, "P6 exact capability economics count mismatch");
  check(crosswalk.resources.length === EXPECTED_COUNTS.p5ResourcesCrosswalked, "P6/P5 resource count mismatch");
  check(crosswalk.capabilities.length === EXPECTED_COUNTS.capabilities, "P6/P5 canonical capability count mismatch");
  check(crosswalk.supplementalCapabilities.length === EXPECTED_COUNTS.supplementalCapabilities, "P6/P5 supplemental capability count mismatch");
  check(crosswalk.startingInventory.length === EXPECTED_COUNTS.inventoryCategories, "P6 starting inventory category count mismatch");
  const capabilityIds = [...capabilityById.keys()];
  const economicsIds = economics.mappings.map((record) => record.capabilityId);
  const crosswalkIds = crosswalk.capabilities.map((record) => record.capabilityId);
  const resourceIds = crosswalk.resources.map((record) => record.resourceId);
  checkUnique(economicsIds, "P6 economics capability IDs");
  checkUnique(crosswalkIds, "P6/P5 canonical capability IDs");
  checkUnique(resourceIds, "P6/P5 resource IDs");
  checkUnique(crosswalk.supplementalCapabilities.map((record) => record.capabilityId), "P6/P5 supplemental capability IDs");
  check(sameStrings(economicsIds, capabilityIds), "P6 economics capabilities differ from capability registry");
  check(sameStrings(crosswalkIds, capabilityIds), "P6/P5 canonical capabilities differ from capability registry");
  const resourceIdSet = new Set(resourceIds);
  const predicateResourceRefs = crosswalk.capabilities.flatMap((record) => (
    record.p5StatePredicates.flatMap((predicate) => [
      predicate.resourceId,
      ...(predicate.eligibleStaffIds || []),
      ...(predicate.eligibleRoomIds || []),
    ].filter(Boolean))
  ));
  const unknownResourceRefs = sorted(new Set([
    ...crosswalk.capabilities.flatMap((record) => record.p5ResourceIds),
    ...crosswalk.supplementalCapabilities.flatMap((record) => record.p5ResourceIds),
    ...predicateResourceRefs,
  ].filter((id) => !resourceIdSet.has(id))));
  check(unknownResourceRefs.length === 0, "P6/P5 crosswalk contains unknown resource IDs");
  const generatedEconomicsById = new Map(
    generatedEconomy.capabilityEconomics.map((record) => [record.capabilityId, record]),
  );
  for (const mapping of economics.mappings) {
    const generatedMapping = generatedEconomicsById.get(mapping.capabilityId);
    check(generatedMapping, `P6 generated economy is missing ${mapping.capabilityId}`);
    for (const key of Object.keys(mapping)) {
      check(
        sameJson(generatedMapping[key], mapping[key]),
        `P6 ${mapping.capabilityId}: generated ${key} differs from explicit economics`,
      );
    }
  }
  for (const field of ["resources", "capabilities", "supplementalCapabilities", "startingInventory"]) {
    check(sameJson(generatedCrosswalk[field], crosswalk[field]), `P6 generated ${field} differs from exact source crosswalk`);
  }
  check(generatedCrosswalk.generatedFromExactAuthorSource === true, "P6 generated crosswalk exact-source marker is missing");
  check(generatedCrosswalk.inferredP5Ids === false, "P6 must not infer P5 IDs");
  check(generatedCrosswalk.tokenMatchingAllowed === false, "P6 token matching must remain forbidden");
  const emptyCanonicalResourceMaps = crosswalk.capabilities
    .filter((record) => record.p5ResourceIds.length === 0)
    .map((record) => record.capabilityId);
  const emptySupplementalResourceMaps = crosswalk.supplementalCapabilities
    .filter((record) => record.p5ResourceIds.length === 0)
    .map((record) => record.capabilityId);
  check(emptyCanonicalResourceMaps.length === 80, "P6 empty canonical P5 resource mapping count must remain visible as 80");
  check(
    sameStrings(emptySupplementalResourceMaps, ["scheduled_recheck_slot"]),
    "P6 empty supplemental P5 resource mapping fingerprint changed",
  );
  check(
    registration.p5ReviewInput.sourceIntegrity.archiveSha256 === P5_ARCHIVE_SHA256,
    "P5 dependency archive pin drifted",
  );
  return {
    audit: {
      capabilityEconomics: economics.mappings.length,
      resources: crosswalk.resources.length,
      canonicalCapabilities: crosswalk.capabilities.length,
      supplementalCapabilities: crosswalk.supplementalCapabilities.length,
      startingInventory: crosswalk.startingInventory.length,
      unknownResourceReferences: unknownResourceRefs.length,
      canonicalCapabilitiesWithoutResourceIds: emptyCanonicalResourceMaps.length,
      supplementalCapabilitiesWithoutResourceIds: emptySupplementalResourceMaps.length,
      p5ArchivePinned: true,
      p5PackageDigestPinned: false,
      p5CatalogDigestPinned: false,
    },
    blockers: [
      makeBlocker(
        "p5_execution_join_unresolved",
        "The operational package pins the P5 .2 archive but not a content/package/catalog digest and cannot replace the P5 execution authority.",
        {
          p5ReviewInput: clone(registration.p5ReviewInput),
          emptyCanonicalResourceMaps,
          emptySupplementalResourceMaps,
          requiredJoinAuthority: "p5_2026.07.16.2_capability_operations_map_with_content_digest",
          operationalCrosswalkRole: "p6_economics_overlay_only",
        },
      ),
    ],
  };
}

function validateP7(documents) {
  const source = documents["source/p7-campaign.json"];
  const resolver = documents["source/p7-evidence-resolver.json"];
  const days = documents["generated/p7/day-catalog.json"];
  const director = documents["generated/p7/director-catalog.json"];
  validateCatalogHeader(source, "vetgeme-p7-campaign-catalog", "P7 source campaign", "author_complete_programmer_adapter_required");
  validateCatalogHeader(resolver, "vetgeme-p7-evidence-resolver", "P7 evidence resolver", "author_complete_programmer_adapter_required");
  checkArray(days.days, "P7 generated days");
  check(sameJson(days.campaign, source.campaign), "P7 generated campaign differs from exact source authority");
  check(sameJson(days.authority, source.authority), "P7 generated authority differs from exact source authority");
  check(
    sameJson(
      days.days.map((record) => ({
        day: record.day,
        chapter: record.chapter,
        title: record.title,
        loadTarget: record.loadTarget,
        goalTypes: record.goalTypes,
        eventSlots: record.eventSlots,
        unlockCheckpoint: record.unlockCheckpoint,
      })),
      source.days,
    ),
    "P7 generated day projection differs from exact source authority",
  );
  check(sameJson(director.axes, source.axes), "P7 generated axes differ from exact source authority");
  check(sameJson(director.recovery, source.recovery), "P7 generated recovery differs from exact source authority");
  check(days.days.length === EXPECTED_COUNTS.campaignDays, "P7 day count mismatch");
  check(days.campaign?.chapters === EXPECTED_COUNTS.chapters, "P7 chapter count mismatch");
  checkUnique(days.days.map((record) => record.day), "P7 day numbers");
  check(sameStrings(days.days.map((record) => record.day), Array.from({ length: 30 }, (_, index) => index + 1)), "P7 days must be 1 through 30");
  const goalCount = days.days.reduce((total, day) => total + checkArray(day.goals, `P7 day ${day.day} goals`).length, 0);
  check(goalCount === EXPECTED_COUNTS.goals, "P7 goal count mismatch");
  check(days.authority?.dayScheduleCreatedOnceAndPersisted === true, "P7 day schedule persistence authority missing");
  check(days.authority?.goalsSelectedAfterPersistedSchedule === true, "P7 goals-after-schedule authority missing");
  check(days.authority?.goalCannotRequireSpecificPatientOrFamily === true, "P7 patient-independent goal authority missing");
  check(days.authority?.eventCannotBiasDiagnosisGeneration === true, "P7 medical generation boundary missing");
  check(days.authority?.saveSchemaChange === false, "P7 source must not claim a save-schema change");

  const resolverGroups = Object.freeze({
    goalEvidence: 10,
    eventTriggers: 25,
    eventEffects: 29,
    milestoneAndRecoveryRequirements: 15,
    specializationCapabilities: 6,
    endingPredicates: 8,
  });
  let resolverCount = 0;
  const resolverIdentities = [];
  for (const [field, expected] of Object.entries(resolverGroups)) {
    const records = checkArray(resolver[field], `P7 ${field}`);
    check(records.length === expected, `P7 ${field} count mismatch`);
    resolverCount += records.length;
    resolverIdentities.push(...records.map((record) => record.evidenceId || record.effectId));
  }
  check(resolverCount === EXPECTED_COUNTS.p7EvidenceResolvers, "P7 total evidence resolver count mismatch");
  checkUnique(resolverIdentities, "P7 resolver identities");
  check(sameJson(director.evidenceResolver, resolver), "P7 generated evidence resolver differs from author source");
  const goalResolverById = new Map(resolver.goalEvidence.map((record) => [record.evidenceId, record]));
  const goalTemplates = checkArray(source.goalTemplates, "P7 source goal templates");
  checkUnique(goalTemplates.map((record) => record.goalType), "P7 source goal template types");
  const goalTemplateByType = new Map(goalTemplates.map((record) => [record.goalType, record]));
  for (const day of days.days) {
    for (const goal of day.goals) {
      const template = goalTemplateByType.get(goal.goalType);
      check(template, `P7 ${goal.goalId}: unknown source goal template`);
      check(
        goal.evidence === template.evidence && goal.minimum === template.minimum,
        `P7 ${goal.goalId}: generated goal differs from exact source template`,
      );
      check(
        sameJson(goal.evidenceResolver, goalResolverById.get(goal.evidence)),
        `P7 ${goal.goalId}: embedded goal resolver differs from exact author authority`,
      );
      check(
        goal.selectionRule === "select_after_persisted_day_schedule_without_patient_or_family_requirement",
        `P7 ${goal.goalId}: goal selection boundary drifted`,
      );
    }
  }
  check(resolver.activation?.authorApprovalRecorded === true, "P7 author approval evidence is missing");
  check(resolver.activation?.programmerAdapterValidated === false, "P7 programmer adapter must remain unvalidated");
  check(resolver.activation?.productOwnerBalanceAccepted === false, "P7 product-owner balance must remain unaccepted");
  check(resolver.activation?.medicalProductionPoolRequiredForCampaignActivation === true, "P7 must require medical production pool activation");
  check(resolver.activation?.runtimeEligible === false, "P7 resolver runtime eligibility must remain false");

  const expectedEnvelopeCounts = {
    events: EXPECTED_COUNTS.events,
    milestones: EXPECTED_COUNTS.milestones,
    specializations: EXPECTED_COUNTS.specializations,
    endings: EXPECTED_COUNTS.endings,
  };
  const envelopeContentMismatches = [];
  const allEnvelopeItemIds = [];
  const allEnvelopeHashes = [];
  let envelopeCount = 0;
  for (const [kind, expected] of Object.entries(expectedEnvelopeCounts)) {
    const envelopes = checkArray(director.catalogEnvelopes?.[kind], `P7 ${kind} envelopes`);
    check(envelopes.length === expected, `P7 ${kind} envelope count mismatch`);
    check(
      sameJson(envelopes.map((record) => record.payload), source[kind]),
      `P7 ${kind} envelopes differ from exact source authority`,
    );
    checkUnique(envelopes.map((record) => record.itemId), `P7 ${kind} item IDs`);
    envelopeCount += envelopes.length;
    for (const envelope of envelopes) {
      check(envelope.catalogRef?.catalogId === "vetgeme-p7-campaign-catalog", `P7 ${kind}/${envelope.itemId}: catalog ID mismatch`);
      check(envelope.catalogRef?.catalogVersion === OPERATIONAL_REVIEW_INPUT_V2_VERSION, `P7 ${kind}/${envelope.itemId}: catalog version mismatch`);
      check(envelope.catalogRef?.approvalStatus === "author_complete_programmer_adapter_required", `P7 ${kind}/${envelope.itemId}: approval status drifted`);
      check(envelope.runtimeEligible === false, `P7 ${kind}/${envelope.itemId}: runtimeEligible must remain false`);
      const expectedSha = sha256(Buffer.from(JSON.stringify(envelope.payload), "utf8"));
      allEnvelopeItemIds.push(envelope.itemId);
      allEnvelopeHashes.push(envelope.catalogRef.contentSha256);
      if (envelope.catalogRef.contentSha256 !== expectedSha) {
        envelopeContentMismatches.push({ kind, itemId: envelope.itemId, expectedSha, actualSha: envelope.catalogRef.contentSha256 });
      }
    }
  }
  check(envelopeCount === 42, "P7 envelope count mismatch");
  checkUnique(allEnvelopeItemIds, "P7 envelope item IDs");
  checkUnique(allEnvelopeHashes, "P7 envelope content hashes");
  check(envelopeContentMismatches.length === 0, "P7 envelope content SHA-256 mismatch");
  const eventRepeatability = {};
  for (const envelope of director.catalogEnvelopes.events) {
    const repeatability = envelope.payload.repeatability;
    eventRepeatability[repeatability] = (eventRepeatability[repeatability] || 0) + 1;
  }
  check(sameJson(eventRepeatability, {
    once: 16,
    cooldown_5_days: 3,
    once_per_chapter: 2,
    cooldown_7_days: 1,
    unbounded_by_distinct_order: 1,
    cooldown_4_days: 1,
    cooldown_3_days: 1,
    unbounded_by_distinct_asset: 1,
    unbounded_by_distinct_visit: 1,
  }), "P7 event repeatability distribution mismatch");
  const authorDigestPayload = {
    campaign: days.campaign,
    axes: director.axes,
    catalogEnvelopes: director.catalogEnvelopes,
    recovery: director.recovery,
  };
  const computedAuthorCatalogDigest = sha256(Buffer.from(JSON.stringify(authorDigestPayload), "utf8"));
  check(director.catalogDigest === computedAuthorCatalogDigest, "P7 author catalogDigest mismatch");
  const hostReviewDigest = sha256(Buffer.from(JSON.stringify({
    campaign: days.campaign,
    days: days.days,
    axes: director.axes,
    catalogEnvelopes: director.catalogEnvelopes,
    recovery: director.recovery,
    evidenceResolver: resolver,
  }), "utf8"));
  check(hostReviewDigest !== director.catalogDigest, "P7 host review digest must expose omitted resolver/day semantics");
  return {
    audit: {
      campaignDays: days.days.length,
      chapters: days.campaign.chapters,
      goals: goalCount,
      events: director.catalogEnvelopes.events.length,
      milestones: director.catalogEnvelopes.milestones.length,
      specializations: director.catalogEnvelopes.specializations.length,
      endings: director.catalogEnvelopes.endings.length,
      evidenceResolvers: resolverCount,
      evidenceResolverGroups: clone(resolverGroups),
      envelopes: envelopeCount,
      envelopeContentSha256Verified: envelopeCount,
      eventRepeatability,
      authorCatalogDigest: director.catalogDigest,
      hostReviewDigest,
      runtimeEligible: false,
    },
    blockers: [
      makeBlocker(
        "p7_resolver_digest_and_activation_unresolved",
        "P7 item hashes are correct, but the author catalogDigest omits day and evidence-resolver semantics and no approved activation envelope exists.",
        {
          authorCatalogDigest: director.catalogDigest,
          hostReviewDigest,
          envelopeContentSha256Verified: envelopeCount,
          evidenceResolvers: resolverCount,
          activation: clone(resolver.activation),
          requiredAuthority: "digest_bound_programmer_adapter_and_separate_activation_manifest",
        },
      ),
    ],
  };
}

export function validateOperationalAuthoringPackageV2({
  registration,
  manifest,
  sourceFiles,
  sourceBytesByPath,
  documents,
  capabilityRegistry,
  capabilityBytes,
  baselineManifest,
  medicalReviewInput,
}) {
  validateOperationalReviewInputV2Registration(registration);
  const capabilityById = validateCapabilityRegistry(registration, capabilityRegistry, capabilityBytes);
  check(isObject(manifest), "operational .2 manifest is missing");
  check(manifest.schemaVersion === 1, "operational .2 manifest schemaVersion must be 1");
  check(manifest.packageId === registration.packageId, "operational .2 manifest packageId mismatch");
  check(manifest.packageVersion === registration.packageVersion, "operational .2 manifest packageVersion mismatch");
  check(manifest.status === registration.status, "operational .2 manifest status mismatch");
  check(manifest.runtimeEligible === false, "operational .2 manifest runtimeEligible must remain false");
  check(sameStrings(manifest.activationRequires, EXPECTED_ACTIVATION_REQUIREMENTS), "operational .2 activation requirements changed");
  check(manifest.boundaries?.runtimeChanged === false, "operational .2 must not claim runtime changes");
  check(manifest.boundaries?.designChanged === false, "operational .2 must not claim design changes");
  check(manifest.boundaries?.saveSchemaChanged === false, "operational .2 must not claim save-schema changes");
  check(manifest.boundaries?.medicalTruthAuthoredHere === false, "operational .2 must not author medical truth");
  check(manifest.boundaries?.existingThirtyCardPoolChanged === false, "operational .2 must preserve the current 30-card pool");
  check(manifest.boundaries?.p5CatalogAuthoredHere === false, "operational .2 must not claim P5 catalog authority");
  check(manifest.sources?.medicalPackageId === "vetgeme-medical-production-authoring", "operational .2 medical source ID mismatch");
  check(manifest.sources?.medicalPackageVersion === MEDICAL_REVIEW_INPUT_V40_VERSION, "operational .2 medical source version mismatch");
  check(manifest.sources?.medicalActivationStatus === "blocked_pending_external_veterinary_review", "medical source must remain pending review");
  check(manifest.sources?.capabilityRegistryId === CAPABILITY_REGISTRY_ID, "manifest capability registry ID mismatch");
  check(manifest.sources?.capabilityRegistryVersion === CAPABILITY_REGISTRY_VERSION, "manifest capability registry version mismatch");
  check(isObject(manifest.counts), "operational .2 manifest counts are missing");
  const manifestExpectedCounts = {
    families: 39,
    variants: 215,
    presentations: 645,
    researchIds: 361,
    investigationUsages: 1864,
    temperamentTags: 128,
    ownerModifierTags: 463,
    handlingAlternativeTags: 446,
    capabilities: 447,
    p5ResourcesCrosswalked: 49,
    p7EvidenceResolvers: 93,
    campaignDays: 30,
    events: 27,
    milestones: 6,
    specializations: 3,
    endings: 6,
  };
  check(sameStrings(Object.keys(manifest.counts), Object.keys(manifestExpectedCounts)), "operational .2 manifest count fields mismatch");
  for (const [field, expected] of Object.entries(manifestExpectedCounts)) {
    check(manifest.counts[field] === expected, `operational .2 manifest count ${field} mismatch`);
  }
  checkArray(manifest.files, "operational .2 manifest files");
  check(manifest.files.length === EXPECTED_COUNTS.sourceFiles, "operational .2 manifest must list 35 files");
  checkUnique(manifest.files, "operational .2 manifest files");
  manifest.files.forEach((file) => checkSafePath(file, `manifest file ${file}`));
  check(sameStrings(manifest.files, sourceFiles), "operational .2 manifest and provenance file sets differ");
  check(sameStrings(REQUIRED_JSON_PATHS, Object.keys(documents)), "operational .2 parsed JSON file set mismatch");
  for (const path of AUTHORITATIVE_EXACT_PATHS) {
    const forbidden = findForbiddenAuthorityKeys(documents[path], path);
    check(forbidden.length === 0, `${path}: token/regex/first-match runtime authority is forbidden (${forbidden.join(", ")})`);
  }
  for (const [path, document] of Object.entries(documents)) {
    if (Object.prototype.hasOwnProperty.call(document, "runtimeEligible")) {
      check(document.runtimeEligible === false, `${path}.runtimeEligible must remain false`);
    }
  }

  check(medicalReviewInput.reviewOnly === true, "medical .40 dependency must be review-only");
  check(medicalReviewInput.productionEligible === false, "medical .40 dependency must remain production-ineligible");
  check(medicalReviewInput.generatorEligible === false, "medical .40 dependency must remain generator-ineligible");
  check(medicalReviewInput.productionPool.length === 0, "medical .40 production pool must remain 0");
  check(medicalReviewInput.registration.reviewInputVersion === MEDICAL_REVIEW_INPUT_V40_VERSION, "medical dependency version drifted");
  check(medicalReviewInput.sourceIntegrity.aggregateSha256 === MEDICAL_AGGREGATE_SHA256, "loaded medical .40 aggregate digest mismatch");
  check(medicalReviewInput.audit.families === EXPECTED_COUNTS.families, "medical .40 family count mismatch");
  check(medicalReviewInput.audit.variants === EXPECTED_COUNTS.variants, "medical .40 variant count mismatch");
  check(medicalReviewInput.audit.presentations === EXPECTED_COUNTS.presentations, "medical .40 presentation count mismatch");
  check(medicalReviewInput.audit.investigations === EXPECTED_COUNTS.investigationUsages, "medical .40 investigation count mismatch");
  check(medicalReviewInput.audit.nullInvestigationResults === 0, "medical .40 contains empty investigation results");

  const p3 = validateP3(documents, capabilityById);
  const p4 = validateP4(documents, capabilityById, medicalReviewInput);
  const p6 = validateP6(documents, capabilityById, registration);
  const p7 = validateP7(documents);
  const validationReport = documents["reports/VALIDATION_REPORT.json"];
  check(validationReport.status === "pass", "bundled author validation report must remain pass");
  check(validationReport.checks.length === 45, "bundled author validation check count mismatch");
  check(validationReport.simulation?.campaigns === 10000, "bundled author simulation campaign count mismatch");
  check(validationReport.simulation?.demandDays === 297717, "bundled author demand-day count mismatch");

  check(isObject(baselineManifest), "tier-01-v2 baseline manifest is missing");
  check(baselineManifest.caseCount === 30, "tier-01-v2 baseline case count must remain 30");
  checkArray(baselineManifest.cases, "tier-01-v2 baseline cases");
  check(baselineManifest.cases.length === 30, "tier-01-v2 baseline case list must remain 30");
  const baselineCaseIds = baselineManifest.cases.map((entry) => entry.id);
  checkUnique(baselineCaseIds, "tier-01-v2 baseline case IDs");
  const baselineCrosswalkMatches = [];
  for (const caseId of baselineCaseIds) {
    for (const [relativePath, bytes] of sourceBytesByPath) {
      if (Buffer.from(bytes).includes(Buffer.from(caseId, "utf8"))) {
        baselineCrosswalkMatches.push({ caseId, path: relativePath });
      }
    }
  }
  check(baselineCrosswalkMatches.length === 0, "operational .2 contains an unapproved current 30-card crosswalk");
  check(!sourceFiles.some((path) => /activation.?manifest/iu.test(path)), "operational .2 must not contain an activation manifest");

  const blockers = [
    makeBlocker(
      "activation_requirements_unsatisfied",
      "The author package remains review-only until all declared activation requirements and external veterinary review pass.",
      { activationRequires: clone(manifest.activationRequires) },
    ),
    ...p3.blockers,
    ...p4.blockers,
    ...p6.blockers,
    ...p7.blockers,
  ];
  return deepFreeze({
    counts: {
      sourceFiles: sourceFiles.length,
      sourceBytes: [...sourceBytesByPath.values()].reduce((total, bytes) => total + bytes.length, 0),
      families: medicalReviewInput.audit.families,
      variants: medicalReviewInput.audit.variants,
      presentations: medicalReviewInput.audit.presentations,
      capabilities: capabilityById.size,
      productionPool: 0,
      p3: p3.audit,
      p4: p4.audit,
      p6: p6.audit,
      p7: p7.audit,
      baselineCases: baselineCaseIds.length,
      baselineCrosswalkMatches: baselineCrosswalkMatches.length,
    },
    validationEvidence: {
      authorChecks: validationReport.checks.length,
      simulatedCampaigns: validationReport.simulation.campaigns,
      simulatedDemandDays: validationReport.simulation.demandDays,
    },
    baselineCaseIdCrosswalkMatches: baselineCrosswalkMatches,
    blockers,
  });
}

export async function loadOperationalAuthoringReviewInputV2FromReader(reader, registry, options = {}) {
  check(reader && typeof reader.readBytes === "function", "reader.readBytes is required");
  check(reader && typeof reader.listFiles === "function", "reader.listFiles is required");
  const registration = resolveOperationalAuthoringReviewInputV2(registry, options);
  const sourceRoot = joinPath(registration.root, registration.sourceRoot);
  const provenancePath = joinPath(registration.root, registration.provenancePath);
  const [provenanceBytes, sourceFiles, capabilityBytes, baselineManifestBytes, medicalReviewInput] = await Promise.all([
    reader.readBytes(provenancePath),
    reader.listFiles(sourceRoot),
    reader.readBytes(registration.capabilityRegistry.path),
    reader.readBytes(BASELINE_MANIFEST_PATH),
    loadMedicalAuthoringReviewInputFromReader(reader, registry, {
      context: "review",
      reviewInputVersion: MEDICAL_REVIEW_INPUT_V40_VERSION,
    }),
  ]);
  check(sha256(provenanceBytes) === registration.sourceIntegrity.provenanceSha256, "provenance file SHA-256 mismatch");
  const provenance = parseJson(provenanceBytes, provenancePath);
  const sourceBytesByPath = new Map();
  await Promise.all(sourceFiles.map(async (relativePath) => {
    sourceBytesByPath.set(relativePath, await reader.readBytes(joinPath(sourceRoot, relativePath)));
  }));
  const sourceIntegrity = validateOperationalV2SourceProvenance(
    registration,
    provenance,
    sourceFiles,
    sourceBytesByPath,
  );
  const documents = Object.fromEntries(REQUIRED_JSON_PATHS.map((relativePath) => [
    relativePath,
    parseJson(sourceBytesByPath.get(relativePath), relativePath),
  ]));
  const manifest = documents["MANIFEST.json"];
  const capabilityRegistry = parseJson(capabilityBytes, registration.capabilityRegistry.path);
  const baselineManifest = parseJson(baselineManifestBytes, BASELINE_MANIFEST_PATH);
  const audit = validateOperationalAuthoringPackageV2({
    registration,
    manifest,
    sourceFiles,
    sourceBytesByPath,
    documents,
    capabilityRegistry,
    capabilityBytes,
    baselineManifest,
    medicalReviewInput,
  });
  const catalogs = Object.fromEntries(Object.entries(documents).filter(([path]) => path.startsWith("generated/")));
  const sourceAuthorities = Object.fromEntries(Object.entries(documents).filter(([path]) => path.startsWith("source/")));
  return deepFreeze({
    loadContext: OPERATIONAL_REVIEW_INPUT_V2_CONTEXT,
    reviewOnly: true,
    productionEligible: false,
    runtimeEligible: false,
    generatorEligible: false,
    registration: clone(registration),
    manifest: clone(manifest),
    documents: clone(documents),
    catalogs: clone(catalogs),
    sourceAuthorities: clone(sourceAuthorities),
    sourceIntegrity,
    capabilityRegistryIdentity: {
      registryId: capabilityRegistry.registryId,
      registryVersion: capabilityRegistry.registryVersion,
      sha256: registration.capabilityRegistry.sha256,
      count: capabilityRegistry.capabilities.length,
    },
    medicalReviewInputIdentity: {
      reviewInputId: medicalReviewInput.registration.reviewInputId,
      reviewInputVersion: medicalReviewInput.registration.reviewInputVersion,
      aggregateSha256: medicalReviewInput.sourceIntegrity.aggregateSha256,
      archiveSha256: medicalReviewInput.sourceIntegrity.archiveSha256,
      productionPool: medicalReviewInput.productionPool.length,
    },
    p5ReviewInputIdentity: clone(registration.p5ReviewInput),
    productionPool: Object.freeze([]),
    audit,
    blockers: clone(audit.blockers),
  });
}

export async function loadOperationalAuthoringReviewInputV2(projectRoot, options = {}) {
  const reader = createFileSystemReviewInputReader(projectRoot);
  const registry = parseJson(await reader.readBytes(REVIEW_INPUT_REGISTRY_PATH), REVIEW_INPUT_REGISTRY_PATH);
  return loadOperationalAuthoringReviewInputV2FromReader(reader, registry, options);
}
