import { createHash } from "node:crypto";

import {
  MEDICAL_REVIEW_INPUT_V40_VERSION,
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
  loadMedicalAuthoringReviewInputFromReader,
  validateReviewInputRegistry,
} from "./medical-authoring-review-input.mjs";

export const OPERATIONAL_REVIEW_INPUT_V4_ID = "vetgeme-operational-production-authoring";
export const OPERATIONAL_REVIEW_INPUT_V4_VERSION = "2026.07.16.4";
export const OPERATIONAL_REVIEW_INPUT_V4_ROOT =
  "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.4";
export const OPERATIONAL_REVIEW_INPUT_V4_CONTEXT = "review";
export const OPERATIONAL_REVIEW_INPUT_V4_STATUS = "author_complete_validation_passed";
export const BASELINE_MANIFEST_PATH = "content/packs/tier-01-v2/clinical/tier-01/manifest.json";

const OPERATIONAL_PROVENANCE_SHA256 = "e4e60e12f66b5c84166b530ec0ad8da20073be95533be06a0d3940db2ad5a92a";
const OPERATIONAL_AGGREGATE_SHA256 = "c7bb0bd0232ba765a5b3e8a8f0c093e7410e20a9aa435f1e3e3ece6c9f920764";
const OPERATIONAL_ARCHIVE_SHA256 = "0e2fed94349ddfd8b5ace8d19a3e2da723c13bf46ec894b067d56eff5c6854d5";
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
const P3_MEDICAL_RESULT_AUTHORITY =
  "medical_family.presentation.investigations[].result_only";
const P3_AUTHORITY_DRIFT_BLOCKER_ID =
  "p3_medical_result_authority_projection_drift";

const EXPECTED_COUNTS = Object.freeze({
  sourceFiles: 40,
  sourceBytes: 12864215,
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
  p4PresentationHandlingBindings: 514,
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
  "exact_p5_v2_requirement_group_join",
  "medical_family_external_veterinary_approval",
  "full_runtime_smoke_and_save_reload",
  "product_owner_balance_acceptance",
]);

const REQUIRED_JSON_PATHS = Object.freeze([
  "MANIFEST.json",
  "reports/AUTHOR_DECISION_MATRIX.json",
  "reports/CROSS_SYSTEM_V2_AUTHOR_MATRIX.json",
  "reports/P1_CORRECTION_MATRIX.json",
  "reports/VALIDATION_REPORT.json",
  "source/p3-policy.json",
  "source/p3-explicit-research-routes.json",
  "source/p3-exact-source-crosswalk.json",
  "source/p4-policy.json",
  "source/p4-explicit-behavior-crosswalk.json",
  "source/p4-operational-requirements.json",
  "source/p4-presentation-medical-fact-crosswalk.json",
  "source/p6-balance.json",
  "source/p6-explicit-capability-economics.json",
  "source/p6-p5-exact-resource-crosswalk.json",
  "source/p7-campaign.json",
  "source/p7-evidence-resolver.json",
  "source/p7-activation-digest-contract.json",
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
  "source/p3-exact-source-crosswalk.json",
  "source/p4-explicit-behavior-crosswalk.json",
  "source/p4-operational-requirements.json",
  "source/p4-presentation-medical-fact-crosswalk.json",
  "source/p6-explicit-capability-economics.json",
  "source/p6-p5-exact-resource-crosswalk.json",
  "source/p7-evidence-resolver.json",
  "source/p7-activation-digest-contract.json",
]);

function fail(message) {
  throw new Error(`Operational authoring v4 review input validation failed: ${message}`);
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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function stableSha256(value) {
  return sha256(Buffer.from(stableJson(value), "utf8"));
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

function validateCatalogHeader(
  document,
  expectedId,
  label,
  expectedStatus,
  expectedVersion = OPERATIONAL_REVIEW_INPUT_V4_VERSION,
) {
  check(isObject(document), `${label} must be an object`);
  check(document.schemaVersion === 1, `${label}.schemaVersion must be 1`);
  check((document.catalogId || document.policyId) === expectedId, `${label} identity mismatch`);
  check(
    (document.catalogVersion || document.policyVersion) === expectedVersion,
    `${label} version mismatch`,
  );
  check(document.status === expectedStatus, `${label} status mismatch`);
  check(document.runtimeEligible === false, `${label}.runtimeEligible must remain false`);
}

export function findForbiddenOperationalV4AuthorityKeys(value, location = "document", found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenOperationalV4AuthorityKeys(item, `${location}[${index}]`, found));
    return found;
  }
  if (!isObject(value)) return found;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:includes?|match.?tokens?|regex|regular.?expression|first.?match|default)/iu.test(key)) {
      found.push(`${location}.${key}`);
    }
    findForbiddenOperationalV4AuthorityKeys(child, `${location}.${key}`, found);
  }
  return found;
}

export function validateOperationalV4SafeRouteProviderTarget(payload, label = "safe route") {
  check(isObject(payload), `${label}: payload is required`);
  const hasProviderResolver = isNonEmptyString(payload.providerResolver);
  const hasProviderId = isNonEmptyString(payload.providerId);
  check(
    hasProviderResolver !== hasProviderId,
    `${label}: exactly one providerResolver or providerId is required`,
  );
}

export function validateOperationalReviewInputV4Registration(registration) {
  check(isObject(registration), "review input registration must be an object");
  check(registration.reviewInputId === OPERATIONAL_REVIEW_INPUT_V4_ID, "unexpected reviewInputId");
  check(registration.reviewInputVersion === OPERATIONAL_REVIEW_INPUT_V4_VERSION, "unexpected reviewInputVersion");
  check(registration.kind === "operational_authoring", "kind must be operational_authoring");
  check(registration.packageId === OPERATIONAL_REVIEW_INPUT_V4_ID, "packageId mismatch");
  check(registration.packageVersion === OPERATIONAL_REVIEW_INPUT_V4_VERSION, "packageVersion mismatch");
  check(registration.root === OPERATIONAL_REVIEW_INPUT_V4_ROOT, "versioned operational root mismatch");
  checkSafePath(registration.root, "root");
  check(registration.sourceRoot === "source", "sourceRoot must be source");
  check(registration.manifestPath === "source/MANIFEST.json", "manifestPath must target source/MANIFEST.json");
  check(registration.provenancePath === "provenance.json", "provenancePath must be provenance.json");
  check(registration.status === OPERATIONAL_REVIEW_INPUT_V4_STATUS, "status mismatch");
  check(registration.reviewOnly === true, "reviewOnly must be true");
  check(registration.productionEligible === false, "productionEligible must be false");
  check(registration.runtimeEligible === false, "runtimeEligible must be false");
  check(registration.generatorEligible === false, "generatorEligible must be false");
  check(registration.allowCurrentCaseCrosswalk === false, "allowCurrentCaseCrosswalk must be false");
  check(registration.allowRuntimeActivation === false, "allowRuntimeActivation must be false");
  check(registration.allowActivationManifest === false, "allowActivationManifest must be false");
  check(isObject(registration.authorSourceSupersession), "authorSourceSupersession is required");
  check(
    registration.authorSourceSupersession.supersedesReviewInputVersion === "2026.07.16.3",
    "operational .4 must supersede .3 only as an author source",
  );
  check(
    sameJson(registration.authorSourceSupersession.scopes, ["p3", "p4", "p7"]),
    "operational .4 author-source supersession scope mismatch",
  );
  check(registration.authorSourceSupersession.priorVersionPreserved === true, "operational .3 must remain preserved");
  check(
    registration.authorSourceSupersession.p5P6ReservationAuthorityJoined === false,
    "operational .4 must not claim P5/P6 reservation authority",
  );

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
    "operational .4 provenance digest mismatch",
  );
  check(
    registration.sourceIntegrity.aggregateSha256 === OPERATIONAL_AGGREGATE_SHA256,
    "operational .4 aggregate digest mismatch",
  );
  check(
    registration.sourceIntegrity.archiveSha256 === OPERATIONAL_ARCHIVE_SHA256,
    "operational .4 archive digest mismatch",
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

export function resolveOperationalAuthoringReviewInputV4(registry, options = {}) {
  const registrations = validateReviewInputRegistry(registry);
  check(Object.prototype.hasOwnProperty.call(options, "context"), "explicit review context is required");
  check(
    options.context === OPERATIONAL_REVIEW_INPUT_V4_CONTEXT,
    `context ${String(options.context)} is forbidden; review is the only allowed context`,
  );
  const requestedId = options.reviewInputId || OPERATIONAL_REVIEW_INPUT_V4_ID;
  const requestedVersion = options.reviewInputVersion || OPERATIONAL_REVIEW_INPUT_V4_VERSION;
  check(requestedVersion === OPERATIONAL_REVIEW_INPUT_V4_VERSION, "v4 loader refuses non-.4 operational input");
  const registration = registrations.find((entry) => (
    entry.reviewInputId === requestedId && entry.reviewInputVersion === requestedVersion
  ));
  check(registration, `unknown review input ${requestedId}@${requestedVersion}`);
  return validateOperationalReviewInputV4Registration(registration);
}

export function validateOperationalV4SourceProvenance(
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
    provenance.sourceArchive === "operational-production-authoring-2026.07.16.4.zip",
    `${identity}: source archive mismatch`,
  );
  check(
    provenance.sourceDirectory === "operational-production-authoring-2026.07.16.4",
    `${identity}: source directory mismatch`,
  );
  check(isObject(provenance.archive), `${identity}: archive provenance is missing`);
  check(provenance.archive.path === provenance.sourceArchive, `${identity}: archive path mismatch`);
  check(
    provenance.archive.checksumPath === "operational-production-authoring-2026.07.16.4.zip.sha256",
    `${identity}: checksum path mismatch`,
  );
  check(provenance.archive.sha256 === registration.sourceIntegrity.archiveSha256, `${identity}: archive digest mismatch`);
  check(provenance.archive.zipEntryCount === 51, `${identity}: archive entry count mismatch`);
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

export function validateOperationalV4P3MedicalResultAuthorityProjection(documents) {
  check(isObject(documents), `${P3_AUTHORITY_DRIFT_BLOCKER_ID}: parsed documents are required`);
  const explicit = documents["source/p3-explicit-research-routes.json"];
  const generated = documents["generated/p3/research-catalog.json"];
  checkArray(explicit?.researchRoutes, `${P3_AUTHORITY_DRIFT_BLOCKER_ID}: explicit research routes`);
  checkArray(generated?.research, `${P3_AUTHORITY_DRIFT_BLOCKER_ID}: generated research records`);
  const explicitIds = explicit.researchRoutes.map((record) => record.researchId);
  const generatedIds = generated.research.map((record) => record.researchId);
  const routesById = new Map(explicit.researchRoutes.map((record) => [record.researchId, record]));
  const drift = [];
  if (
    explicitIds.length !== EXPECTED_COUNTS.researchIds
    || generatedIds.length !== EXPECTED_COUNTS.researchIds
    || new Set(explicitIds).size !== EXPECTED_COUNTS.researchIds
    || new Set(generatedIds).size !== EXPECTED_COUNTS.researchIds
    || !sameStrings(explicitIds, generatedIds)
  ) {
    drift.push({
      source: "identity_set",
      expected: EXPECTED_COUNTS.researchIds,
      explicit: explicitIds.length,
      generated: generatedIds.length,
    });
  }
  for (const route of explicit.researchRoutes) {
    if (
      route.medicalResultAuthority !== P3_MEDICAL_RESULT_AUTHORITY
      || route.operationalResultGenerationForbidden !== true
    ) {
      drift.push({
        researchId: route.researchId,
        source: "explicit",
        medicalResultAuthority: route.medicalResultAuthority,
        operationalResultGenerationForbidden: route.operationalResultGenerationForbidden,
      });
    }
  }
  for (const record of generated.research) {
    const route = routesById.get(record.researchId);
    if (
      !route
      || record.medicalResultAuthority !== P3_MEDICAL_RESULT_AUTHORITY
      || record.medicalResultAuthority !== route.medicalResultAuthority
      || record.operationalPolicyMayGenerateResult !== false
    ) {
      drift.push({
        researchId: record.researchId,
        source: "generated",
        explicit: route?.medicalResultAuthority,
        generated: record.medicalResultAuthority,
        operationalPolicyMayGenerateResult: record.operationalPolicyMayGenerateResult,
      });
    }
  }
  check(
    drift.length === 0,
    `${P3_AUTHORITY_DRIFT_BLOCKER_ID}: expected 361 exact explicit/generated authority projections and result generation forbidden; found ${drift.length} drift record(s)`,
  );
  return deepFreeze({
    researchRecords: generated.research.length,
    exactAuthority: P3_MEDICAL_RESULT_AUTHORITY,
    explicitGeneratedMismatches: 0,
    operationalPolicyMayGenerateResult: false,
  });
}

function validateP3(documents, capabilityById) {
  const policy = documents["source/p3-policy.json"];
  const explicit = documents["source/p3-explicit-research-routes.json"];
  const exact = documents["source/p3-exact-source-crosswalk.json"];
  const research = documents["generated/p3/research-catalog.json"];
  const usage = documents["generated/p3/investigation-usage-policy.json"];
  const providers = documents["generated/p3/provider-catalog.json"];
  validateOperationalV4P3MedicalResultAuthorityProjection(documents);
  validateCatalogHeader(policy, "vetgeme-p3-operational-policy", "P3 policy", "author_complete_programmer_adapter_required");
  validateCatalogHeader(
    explicit,
    "vetgeme-p3-explicit-research-routes",
    "P3 explicit routes",
    "author_complete_programmer_adapter_required",
    "2026.07.16.2",
  );
  validateCatalogHeader(
    exact,
    "vetgeme-p3-exact-source-crosswalk",
    "P3 exact source crosswalk",
    "author_complete_programmer_adapter_required",
    "2026.07.16.3",
  );
  validateCatalogHeader(
    research,
    "vetgeme-p3-research-catalog",
    "P3 generated research catalog",
    "author_complete_programmer_adapter_required",
  );
  validateCatalogHeader(
    usage,
    "vetgeme-p3-investigation-usage-policy",
    "P3 generated investigation usage catalog",
    "author_complete_programmer_adapter_required",
  );
  validateCatalogHeader(
    providers,
    "vetgeme-p3-referral-providers",
    "P3 generated provider catalog",
    "author_complete_programmer_adapter_required",
  );
  check(explicit.sourceMedicalPackageVersion === MEDICAL_REVIEW_INPUT_V40_VERSION, "P3 explicit routes must pin medical .40");
  check(exact.fallbackAllowed === false, "P3 exact source crosswalk must forbid fallback/default mapping");
  check(exact.activation?.unknownSourceValueBlocksBuild === true, "P3 unknown source values must block the build");
  check(
    exact.activation?.dynamicUrgencyRequiresStateResolutionBeforeOrder === true,
    "P3 dynamic urgency must resolve from state before an order",
  );
  check(exact.activation?.selectedTurnaroundMustBePersistedOnce === true, "P3 selected turnaround must persist once");
  checkArray(explicit.researchRoutes, "P3 explicit research routes");
  checkArray(exact.urgencyValues, "P3 exact urgency values");
  checkArray(exact.classificationValues, "P3 exact classification values");
  checkArray(research.research, "P3 generated research records");
  checkArray(usage.usages, "P3 investigation usages");
  checkArray(providers.providers, "P3 providers");
  check(exact.urgencyValues.length === 206, "P3 exact urgency source value count mismatch");
  check(exact.classificationValues.length === 875, "P3 exact classification source value count mismatch");
  check(explicit.researchRoutes.length === EXPECTED_COUNTS.researchIds, "P3 explicit route count mismatch");
  check(research.research.length === EXPECTED_COUNTS.researchIds, "P3 generated research count mismatch");
  check(usage.usages.length === EXPECTED_COUNTS.investigationUsages, "P3 usage count mismatch");
  check(providers.providers.length === EXPECTED_COUNTS.providers, "P3 provider count mismatch");
  checkUnique(exact.urgencyValues.map((record) => record.sourceValue), "P3 exact urgency source values");
  checkUnique(exact.classificationValues.map((record) => record.sourceValue), "P3 exact classification source values");
  checkUnique(usage.usages.map((record) => record.usageId), "P3 usage IDs");

  const routeIds = explicit.researchRoutes.map((record) => record.researchId);
  const generatedIds = research.research.map((record) => record.researchId);
  checkUnique(routeIds, "P3 explicit research IDs");
  checkUnique(generatedIds, "P3 generated research IDs");
  check(sameStrings(routeIds, generatedIds), "P3 explicit and generated research IDs differ");
  const routesById = new Map(explicit.researchRoutes.map((record) => [record.researchId, record]));
  const providersById = new Set(providers.providers.map((record) => record.providerId));
  const localRoutes = explicit.researchRoutes.filter((record) => record.routeMode === "local");
  const externalRoutes = explicit.researchRoutes.filter((record) => record.routeMode === "external");
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
    check(
      route.medicalResultAuthority === P3_MEDICAL_RESULT_AUTHORITY
        && route.operationalResultGenerationForbidden === true,
      `${P3_AUTHORITY_DRIFT_BLOCKER_ID}: ${route.researchId}: explicit medical-result authority is invalid`,
    );
  }

  const medicalResultAuthorityMismatches = [];
  for (const record of research.research) {
    const route = routesById.get(record.researchId);
    check(route, `${record.researchId}: missing explicit route`);
    check(sameJson(record.familyIds, route.familyIds), `${record.researchId}: generated family IDs differ from explicit authority`);
    check(sameJson(record.requires, route.requiredCapabilityIds), `${record.researchId}: generated requirements differ from explicit authority`);
    check(record.routeMode === route.routeMode, `${record.researchId}: generated routeMode differs from explicit authority`);
    check(sameJson(record.providerIds, route.providerIds), `${record.researchId}: generated providers differ from explicit authority`);
    check(record.providerCoordinationMode === route.providerCoordinationMode, `${record.researchId}: provider coordination differs`);
    check(record.primaryProviderId === route.primaryProviderId, `${record.researchId}: generated primary provider differs`);
    check(
      sameJson(record.activationGate?.requiredStatePredicates, route.lifecyclePredicates),
      `${record.researchId}: lifecycle predicates differ from explicit authority`,
    );
    check(record.activationGate?.fallbackRouteId === route.fallbackRouteId, `${record.researchId}: generated fallback differs`);
    const authorityProjectionValid = record.medicalResultAuthority === P3_MEDICAL_RESULT_AUTHORITY
      && record.medicalResultAuthority === route.medicalResultAuthority
      && record.operationalPolicyMayGenerateResult === false;
    if (!authorityProjectionValid) {
      medicalResultAuthorityMismatches.push({
        researchId: record.researchId,
        explicit: route.medicalResultAuthority,
        generated: record.medicalResultAuthority,
        operationalPolicyMayGenerateResult: record.operationalPolicyMayGenerateResult,
      });
    }
    check(
      authorityProjectionValid,
      `${P3_AUTHORITY_DRIFT_BLOCKER_ID}: ${record.researchId}: generated medical-result authority projection is invalid`,
    );
  }
  check(
    medicalResultAuthorityMismatches.length === 0,
    `${P3_AUTHORITY_DRIFT_BLOCKER_ID}: P3 medical-result authority mismatch count must be 0`,
  );

  check(sameJson(usage.exactSourceCrosswalk, {
    catalogId: exact.catalogId,
    catalogVersion: exact.catalogVersion,
    fallbackAllowed: false,
  }), "P3 generated usage catalog does not pin the exact source crosswalk");
  const urgencyBySource = new Map(exact.urgencyValues.map((record) => [record.sourceValue, record]));
  const classificationBySource = new Map(exact.classificationValues.map((record) => [record.sourceValue, record]));
  check(
    sameStrings(new Set(usage.usages.map((record) => record.sourceUrgency)), urgencyBySource.keys()),
    "P3 exact urgency source set differs from the usage projection",
  );
  check(
    sameStrings(new Set(usage.usages.map((record) => record.sourceClassification)), classificationBySource.keys()),
    "P3 exact classification source set differs from the usage projection",
  );

  let fixedUrgencyUsages = 0;
  let dynamicUrgencyUsages = 0;
  const policiesByResearch = new Map();
  for (const record of usage.usages) {
    check(routesById.has(record.researchId), `${record.usageId}: unknown researchId`);
    check(record.mappedByFamilyResearchContract === true, `${record.usageId}: medical research contract is unmapped`);
    check(record.turnaroundAuthority === "exact_investigation_usage", `${record.usageId}: turnaround authority is not usage-scoped`);
    const urgency = urgencyBySource.get(record.sourceUrgency);
    const classification = classificationBySource.get(record.sourceClassification);
    check(urgency, `${record.usageId}: unknown exact urgency source value`);
    check(classification, `${record.usageId}: unknown exact classification source value`);
    check(sameJson(record.urgencyResolution, urgency), `${record.usageId}: urgency projection differs from exact source`);
    check(record.urgencyBandId === urgency.bandId, `${record.usageId}: urgency band differs from exact source`);
    check(record.classificationBandId === classification.bandId, `${record.usageId}: classification band differs from exact source`);
    check(record.decisionWeight === classification.decisionWeight, `${record.usageId}: decision weight differs from exact source`);
    check(record.resultReviewClass === classification.resultReviewClass, `${record.usageId}: review class differs from exact source`);
    let projectedPolicies;
    if (urgency.resolutionMode === "runtime_state_required_before_order") {
      dynamicUrgencyUsages += 1;
      check(record.turnaroundPolicy?.kind === "state_resolved_before_order", `${record.usageId}: dynamic turnaround must fail closed`);
      check(record.turnaroundPolicy.resolverRuleId === urgency.resolverRuleId, `${record.usageId}: dynamic resolver drifted`);
      check(sameJson(record.turnaroundPolicy.allowedBandIds, urgency.allowedBandIds), `${record.usageId}: allowed dynamic bands drifted`);
      check(record.turnaroundPolicy.persistSelectedPolicyOnce === true, `${record.usageId}: selected policy persistence is missing`);
      check(record.turnaroundPolicy.recomputeAfterReloadForbidden === true, `${record.usageId}: reload recomputation must be forbidden`);
      projectedPolicies = checkArray(record.turnaroundPolicy.policiesByUrgencyBand, `${record.usageId}: dynamic turnaround policies`);
      check(
        sameStrings(projectedPolicies.map((entry) => entry.bandId), urgency.allowedBandIds),
        `${record.usageId}: dynamic turnaround bands are incomplete`,
      );
    } else {
      fixedUrgencyUsages += 1;
      check(isObject(record.turnaroundPolicy), `${record.usageId}: fixed turnaround policy is required`);
      projectedPolicies = [{ bandId: urgency.bandId, turnaroundPolicy: record.turnaroundPolicy }];
    }
    const researchPolicies = policiesByResearch.get(record.researchId) || new Map();
    for (const entry of projectedPolicies) {
      const key = `${entry.bandId}\0${JSON.stringify(entry.turnaroundPolicy)}`;
      researchPolicies.set(key, clone(entry));
    }
    policiesByResearch.set(record.researchId, researchPolicies);
  }
  check(dynamicUrgencyUsages === 2, "P3 dynamic urgency usage count must be 2");
  check(fixedUrgencyUsages === 1862, "P3 fixed urgency usage count must be 1,862");

  let multiPolicyResearchIds = 0;
  for (const record of research.research) {
    check(!Object.prototype.hasOwnProperty.call(record, "turnaroundPolicy"), `${record.researchId}: representative turnaround is forbidden`);
    check(record.representativeUsageTurnaroundForbidden === true, `${record.researchId}: representative turnaround guard is missing`);
    check(record.turnaroundAuthority === "generated/p3/investigation-usage-policy.json", `${record.researchId}: turnaround authority drifted`);
    const sortPolicies = (records) => records.map(clone).sort((left, right) => (
      `${left.bandId}:${JSON.stringify(left.turnaroundPolicy)}`.localeCompare(
        `${right.bandId}:${JSON.stringify(right.turnaroundPolicy)}`,
        "en",
      )
    ));
    const expected = sortPolicies([...(policiesByResearch.get(record.researchId) || new Map()).values()]);
    const actual = sortPolicies(checkArray(record.turnaroundPoliciesByUrgencyBand, `${record.researchId}: turnaround policies`));
    check(sameJson(actual, expected), `${record.researchId}: research turnaround projection differs from usage authority`);
    if (new Set(expected.map((entry) => JSON.stringify(entry.turnaroundPolicy))).size > 1) multiPolicyResearchIds += 1;
  }
  check(multiPolicyResearchIds === 46, "P3 multi-urgency turnaround research count must remain 46");

  const localEmptyLifecyclePredicates = localRoutes
    .filter((route) => route.lifecyclePredicates.length === 0)
    .map((route) => route.researchId);
  const lifecyclePredicateCounts = {};
  for (const predicate of explicit.researchRoutes.flatMap((route) => route.lifecyclePredicates)) {
    lifecyclePredicateCounts[predicate.predicate] = (lifecyclePredicateCounts[predicate.predicate] || 0) + 1;
  }
  return {
    audit: {
      researchIds: explicit.researchRoutes.length,
      localRoutes: localRoutes.length,
      externalRoutes: externalRoutes.length,
      investigationUsages: usage.usages.length,
      providers: providers.providers.length,
      medicalResultAuthorityMismatches: medicalResultAuthorityMismatches.length,
      exactUrgencySourceValues: exact.urgencyValues.length,
      exactClassificationSourceValues: exact.classificationValues.length,
      fixedUrgencyUsages,
      dynamicUrgencyUsages,
      usageLevelTurnaroundContracts: usage.usages.length,
      multiPolicyResearchIds,
      localRoutesWithEmptyLifecyclePredicates: localEmptyLifecyclePredicates.length,
      lifecyclePredicates: Object.values(lifecyclePredicateCounts).reduce((total, count) => total + count, 0),
      lifecyclePredicateCounts,
    },
    blockers: [],
  };
}

function validateP4(documents, capabilityById, medicalReviewInput) {
  const policy = documents["source/p4-policy.json"];
  const explicit = documents["source/p4-explicit-behavior-crosswalk.json"];
  const requirements = documents["source/p4-operational-requirements.json"];
  const factCrosswalk = documents["source/p4-presentation-medical-fact-crosswalk.json"];
  const generated = documents["generated/p4/behavior-crosswalk.json"];
  const owners = documents["generated/p4/owner-profile-catalog.json"];
  const temperaments = documents["generated/p4/temperament-catalog.json"];
  const cues = documents["generated/p4/observable-cues.json"];
  validateCatalogHeader(
    policy,
    "vetgeme-p4-identity-behavior-policy",
    "P4 policy",
    "author_complete_programmer_adapter_required",
    "2026.07.16.3",
  );
  validateCatalogHeader(
    explicit,
    "vetgeme-p4-explicit-behavior-crosswalk",
    "P4 explicit crosswalk",
    "author_complete_programmer_adapter_required",
    "2026.07.16.2",
  );
  validateCatalogHeader(
    requirements,
    "vetgeme-p4-operational-requirements",
    "P4 operational requirements",
    "author_complete_programmer_adapter_required",
    "2026.07.16.2",
  );
  validateCatalogHeader(
    factCrosswalk,
    "vetgeme-p4-presentation-medical-fact-crosswalk",
    "P4 presentation medical-fact crosswalk",
    "author_complete_programmer_adapter_required",
    "2026.07.16.3",
  );
  check(policy.crosswalkAuthority === "source/p4-explicit-behavior-crosswalk.json", "P4 explicit crosswalk authority mismatch");
  check(policy.matchTokensRuntimeForbidden === true, "P4 runtime token matching must remain forbidden");
  check(explicit.sourceMedicalPackageVersion === MEDICAL_REVIEW_INPUT_V40_VERSION, "P4 explicit crosswalk must pin medical .40");
  check(
    factCrosswalk.sourceMedicalPackage?.packageId === "vetgeme-medical-production-authoring"
      && factCrosswalk.sourceMedicalPackage?.packageVersion === MEDICAL_REVIEW_INPUT_V40_VERSION,
    "P4 medical-fact crosswalk must pin medical .40",
  );
  check(
    factCrosswalk.activation?.genericHandlingTemplatesAreNotClinicalFactAuthority === true,
    "P4 generic handling templates must not own clinical facts",
  );
  check(
    factCrosswalk.activation?.presentationBindingRequiredBeforeActionEvaluation === true,
    "P4 presentation-scoped fact binding must precede action evaluation",
  );
  check(
    factCrosswalk.activation?.unknownFactOrPresentationBlocksRuntime === true,
    "P4 unknown facts or presentations must fail closed",
  );
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
    check(runtimeAlternatives.length === 0, `${record.sourceTag}: generic runtime template must not invent fact-scoped alternatives`);
    check(
      generatedRecord.clinicalFactAuthority === "presentation_scoped_binding_required",
      `${record.sourceTag}: presentation-scoped clinical fact authority marker is missing`,
    );
  }

  checkArray(factCrosswalk.bindings, "P4 presentation medical-fact bindings");
  check(
    factCrosswalk.bindings.length === EXPECTED_COUNTS.p4PresentationHandlingBindings,
    "P4 presentation medical-fact binding count mismatch",
  );
  checkUnique(factCrosswalk.bindings.map((record) => record.bindingId), "P4 presentation medical-fact binding IDs");
  const medicalPresentationByRef = new Map();
  for (const family of medicalReviewInput.families) {
    family.variants.forEach((variant, variantIndex) => {
      variant.presentations.forEach((presentation, presentationIndex) => {
        const presentationRef = `${family.familyId}.${variant.id}.${presentation.id}`;
        medicalPresentationByRef.set(presentationRef, {
          family,
          variant,
          presentation,
          variantIndex,
          presentationIndex,
        });
      });
    });
  }
  check(medicalPresentationByRef.size === EXPECTED_COUNTS.presentations, "P4 medical presentation map count mismatch");
  const generatedPresentationByRef = new Map(generated.presentations.map((record) => [record.presentationRef, record]));
  checkUnique([...generatedPresentationByRef.keys()], "P4 generated presentation refs");
  const generatedBindings = generated.presentations.flatMap((presentation) => (
    checkArray(presentation.handlingBindings, `${presentation.presentationRef}: generated handling bindings`)
      .map((binding) => ({ presentationRef: presentation.presentationRef, binding }))
  ));
  check(
    generatedBindings.length === EXPECTED_COUNTS.p4PresentationHandlingBindings,
    "P4 generated presentation binding count mismatch",
  );
  checkUnique(generatedBindings.map(({ binding }) => binding.bindingId), "P4 generated presentation binding IDs");
  const generatedBindingById = new Map(generatedBindings.map((record) => [record.binding.bindingId, record]));
  check(
    sameStrings(factCrosswalk.bindings.map((record) => record.bindingId), generatedBindingById.keys()),
    "P4 exact and generated binding IDs differ",
  );

  let scopedMedicalFactReferences = 0;
  const scopedMedicalFactKeys = new Set();
  const sourcePointerPattern = /^families\/[^/]+\/family\.production\.json#\/variants\/(\d+)\/presentations\/(\d+)\/criticalFacts\/(\d+)$/u;
  for (const binding of factCrosswalk.bindings) {
    checkArray(binding.medicalFactBindings, `${binding.bindingId}: medical fact bindings`);
    check(binding.medicalFactBindings.length > 0, `${binding.bindingId}: medical fact bindings must not be empty`);
    check(binding.bindingAuthority === "author_explicit_presentation_critical_fact_preservation", `${binding.bindingId}: binding authority drifted`);
    check(binding.operationalActionMayGenerateMedicalFact === false, `${binding.bindingId}: operational action cannot generate medical facts`);
    const medical = medicalPresentationByRef.get(binding.presentationRef);
    check(medical, `${binding.bindingId}: unknown medical presentationRef`);
    const generatedPresentation = generatedPresentationByRef.get(binding.presentationRef);
    check(generatedPresentation, `${binding.bindingId}: generated presentation is missing`);
    check(generatedPresentation.handlingAlternativeTags.includes(binding.handlingTag), `${binding.bindingId}: handling tag is not assigned to presentation`);
    check(generatedPresentation.handlingActionIds.includes(binding.actionId), `${binding.bindingId}: action ID is not assigned to presentation`);
    const generic = generatedHandlingByTag.get(binding.handlingTag);
    check(generic, `${binding.bindingId}: generic handling source is missing`);
    check(generic.actionId === binding.actionId, `${binding.bindingId}: generic action ID differs`);

    const generatedBindingRecord = generatedBindingById.get(binding.bindingId);
    check(generatedBindingRecord?.presentationRef === binding.presentationRef, `${binding.bindingId}: generated presentation scope drifted`);
    const projected = generatedBindingRecord.binding;
    check(projected.handlingTag === binding.handlingTag, `${binding.bindingId}: generated handling tag drifted`);
    check(projected.actionId === binding.actionId, `${binding.bindingId}: generated action ID drifted`);
    check(projected.bindingAuthority === binding.bindingAuthority, `${binding.bindingId}: generated binding authority drifted`);
    check(projected.operationalActionMayGenerateMedicalFact === false, `${binding.bindingId}: generated action cannot create medical facts`);

    const expectedFactAccess = [];
    const expectedSafeAlternatives = [];
    for (const factBinding of binding.medicalFactBindings) {
      scopedMedicalFactReferences += 1;
      check(isNonEmptyString(factBinding.factId), `${binding.bindingId}: factId is required`);
      checkArray(factBinding.discoveryPaths, `${binding.bindingId}/${factBinding.factId}: discovery paths`);
      check(factBinding.discoveryPaths.length > 0, `${binding.bindingId}/${factBinding.factId}: discovery paths must not be empty`);
      const criticalFactIndex = medical.presentation.criticalFacts.findIndex((fact) => fact.factId === factBinding.factId);
      check(criticalFactIndex >= 0, `${binding.bindingId}/${factBinding.factId}: fact is not owned by this presentation`);
      const criticalFact = medical.presentation.criticalFacts[criticalFactIndex];
      check(
        sameJson(factBinding.discoveryPaths, criticalFact.discoveryPaths),
        `${binding.bindingId}/${factBinding.factId}: discovery paths differ from medical .40`,
      );
      const owner = factBinding.medicalOwner;
      check(owner?.packageId === "vetgeme-medical-production-authoring", `${binding.bindingId}/${factBinding.factId}: owner package ID drifted`);
      check(owner?.packageVersion === MEDICAL_REVIEW_INPUT_V40_VERSION, `${binding.bindingId}/${factBinding.factId}: owner package version drifted`);
      check(owner?.familyId === medical.family.familyId, `${binding.bindingId}/${factBinding.factId}: owner family drifted`);
      check(owner?.variantId === medical.variant.id, `${binding.bindingId}/${factBinding.factId}: owner variant drifted`);
      check(owner?.presentationId === medical.presentation.id, `${binding.bindingId}/${factBinding.factId}: owner presentation drifted`);
      const pointerMatch = sourcePointerPattern.exec(owner.sourcePointer || "");
      check(pointerMatch, `${binding.bindingId}/${factBinding.factId}: sourcePointer is invalid`);
      check(Number(pointerMatch[1]) === medical.variantIndex, `${binding.bindingId}/${factBinding.factId}: sourcePointer variant index drifted`);
      check(Number(pointerMatch[2]) === medical.presentationIndex, `${binding.bindingId}/${factBinding.factId}: sourcePointer presentation index drifted`);
      check(Number(pointerMatch[3]) === criticalFactIndex, `${binding.bindingId}/${factBinding.factId}: sourcePointer critical fact index drifted`);
      checkArray(factBinding.safeAlternatives, `${binding.bindingId}/${factBinding.factId}: safe alternatives`);
      check(factBinding.safeAlternatives.length > 0, `${binding.bindingId}/${factBinding.factId}: safe alternative is required`);
      for (const alternative of factBinding.safeAlternatives) {
        check(alternative.factId === factBinding.factId, `${binding.bindingId}/${factBinding.factId}: safe route fact drifted`);
        check(alternative.kind === "safe_route", `${binding.bindingId}/${factBinding.factId}: safe route kind drifted`);
        check(isNonEmptyString(alternative.alternativeId), `${binding.bindingId}/${factBinding.factId}: safe route ID is required`);
        check(alternative.payload?.routeId === alternative.alternativeId, `${binding.bindingId}/${factBinding.factId}: safe route payload drifted`);
        check(alternative.payload?.factOwner === "medical_family_result_only", `${binding.bindingId}/${factBinding.factId}: medical fact ownership drifted`);
        check(isNonEmptyString(alternative.payload?.command), `${binding.bindingId}/${factBinding.factId}: safe-route command is required`);
        check(alternative.payload?.medicalOwnerRef === binding.presentationRef, `${binding.bindingId}/${factBinding.factId}: medical owner ref drifted`);
        validateOperationalV4SafeRouteProviderTarget(
          alternative.payload,
          `${binding.bindingId}/${factBinding.factId}`,
        );
      }
      expectedSafeAlternatives.push(...clone(factBinding.safeAlternatives));
      expectedFactAccess.push({
        factId: factBinding.factId,
        required: true,
        availabilityAuthority: "runtime_discovery_state",
        medicalOwner: clone(factBinding.medicalOwner),
        discoveryPaths: clone(factBinding.discoveryPaths),
        safeAlternatives: clone(factBinding.safeAlternatives),
      });
      scopedMedicalFactKeys.add(`${binding.presentationRef}\0${factBinding.factId}`);
    }
    check(sameJson(projected.factAccessContract, expectedFactAccess), `${binding.bindingId}: generated fact-access contract differs from exact source`);
    const expectedRuntimeAction = clone(generic.runtimeActionTemplate);
    expectedRuntimeAction.safeAlternatives = expectedSafeAlternatives;
    check(sameJson(projected.runtimeActionTemplate, expectedRuntimeAction), `${binding.bindingId}: generated runtime action differs from exact scoped projection`);
  }
  check(scopedMedicalFactReferences === 950, "P4 scoped medical fact reference count mismatch");
  check(scopedMedicalFactKeys.size > 0, "P4 scoped medical fact binding set must not be empty");

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
      presentationHandlingBindings: factCrosswalk.bindings.length,
      scopedMedicalFactReferences,
      scopedMedicalFactKeys: scopedMedicalFactKeys.size,
      genericSyntheticFactReferences: 0,
    },
    blockers: [],
  };

}

function validateP6(documents, capabilityById, registration) {
  const balance = documents["source/p6-balance.json"];
  const economics = documents["source/p6-explicit-capability-economics.json"];
  const crosswalk = documents["source/p6-p5-exact-resource-crosswalk.json"];
  const generatedEconomy = documents["generated/p6/economy-catalog.json"];
  const generatedCrosswalk = documents["generated/p6/p3-p5-resource-crosswalk.json"];
  validateCatalogHeader(
    balance,
    "vetgeme-p6-balance-catalog",
    "P6 balance",
    "author_complete_product_owner_balance_acceptance_required",
    "2026.07.16.2",
  );
  validateCatalogHeader(
    economics,
    "vetgeme-p6-explicit-capability-economics",
    "P6 explicit economics",
    "author_complete_product_owner_balance_acceptance_required",
    "2026.07.16.2",
  );
  validateCatalogHeader(
    crosswalk,
    "vetgeme-p6-p5-exact-resource-crosswalk",
    "P6/P5 exact crosswalk",
    "author_complete_product_owner_balance_acceptance_required",
    "2026.07.16.2",
  );
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
  check(generatedCrosswalk.reservationAuthority === false, "P6 flattened crosswalk must never become reservation authority");
  check(
    generatedCrosswalk.activationGate?.exactP5V2RequirementGroupJoinRequired === true,
    "P6 exact P5 .2 requirement-group join gate is missing",
  );
  check(
    generatedCrosswalk.activationGate?.flattenedResourceIdsCannotReserve === true,
    "P6 flattened resource IDs must not reserve resources",
  );
  check(
    generatedCrosswalk.activationGate?.schedulerCommandRequired === true,
    "P6 scheduler command gate is missing",
  );
  check(
    generatedCrosswalk.activationGate?.lifecycleAuthority === "p5-production-authoring@2026.07.16.2",
    "P6 lifecycle authority must remain with P5 .2",
  );
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
      reservationAuthority: false,
      exactRequirementGroupJoinComplete: false,
    },
    blockers: [
      makeBlocker(
        "p5_execution_join_unresolved",
        "The operational package pins the P5 .2 archive but not a content/package/catalog digest and cannot replace the P5 execution authority.",
        {
          p5ReviewInput: clone(registration.p5ReviewInput),
          emptyCanonicalResourceMaps,
          emptySupplementalResourceMaps,
          requiredJoinAuthority: "p5_2026.07.16.2_requirement_groups_lifecycle_scheduler_commands_with_content_digest",
          operationalCrosswalkRole: "p6_economics_overlay_only",
        },
      ),
    ],
  };
}

function validateP7(documents) {
  const source = documents["source/p7-campaign.json"];
  const resolver = documents["source/p7-evidence-resolver.json"];
  const digestContract = documents["source/p7-activation-digest-contract.json"];
  const days = documents["generated/p7/day-catalog.json"];
  const director = documents["generated/p7/director-catalog.json"];
  validateCatalogHeader(
    source,
    "vetgeme-p7-campaign-catalog",
    "P7 source campaign",
    "author_complete_programmer_adapter_required",
    "2026.07.16.3",
  );
  validateCatalogHeader(
    resolver,
    "vetgeme-p7-evidence-resolver",
    "P7 evidence resolver",
    "author_complete_programmer_adapter_required",
    "2026.07.16.3",
  );
  check(isObject(digestContract), "P7 activation digest contract is missing");
  check(digestContract.schemaVersion === 1, "P7 activation digest contract schemaVersion must be 1");
  check(digestContract.contractId === "vetgeme-p7-activation-digest-contract", "P7 activation digest contract ID mismatch");
  check(digestContract.contractVersion === "2026.07.16.3", "P7 activation digest contract version mismatch");
  check(digestContract.status === "author_complete_programmer_adapter_required", "P7 digest contract status mismatch");
  check(digestContract.runtimeEligible === false, "P7 digest contract must remain runtime-ineligible");
  check(
    digestContract.canonicalization === "recursive_object_keys_lexicographic_arrays_preserve_author_order_utf8_json",
    "P7 canonicalization contract mismatch",
  );
  const resolverSections = [
    "goalEvidence",
    "eventTriggers",
    "eventEffects",
    "milestoneAndRecoveryRequirements",
    "specializationCapabilities",
    "endingPredicates",
  ];
  check(sameJson(digestContract.resolverSections, resolverSections), "P7 resolver section order mismatch");
  check(sameJson(digestContract.activationDigestScope, [
    "adapterVersion",
    "dayCatalog",
    "axes",
    "catalogEnvelopes",
    "recovery",
    "resolverEnvelope",
  ]), "P7 activation digest scope mismatch");
  for (const requirement of [
    "everyResolverRecordHasContentDigest",
    "everyDependentEnvelopeBindsResolverDigest",
    "everyGoalBindsExactResolverRecordDigest",
    "mutationOfAnyResolverSemanticChangesActivationDigest",
    "programmerAdapterValidationRequired",
    "productOwnerBalanceAcceptanceRequired",
    "medicalProductionPoolRequired",
  ]) {
    check(digestContract.requirements?.[requirement] === true, `P7 digest requirement ${requirement} is missing`);
  }

  const buildProjection = (resolverSource) => {
    const resolverRecords = resolverSections.flatMap((section) => {
      const records = checkArray(resolverSource[section], `P7 ${section}`);
      return records.map((payload) => {
        const recordId = section === "eventEffects" ? payload.effectId : payload.evidenceId;
        check(isNonEmptyString(recordId), `P7 ${section} resolver record ID is missing`);
        return {
          section,
          recordId,
          contentSha256: stableSha256(payload),
          payload: clone(payload),
        };
      });
    });
    const recordKeys = resolverRecords.map((record) => `${record.section}|${record.recordId}`);
    checkUnique(recordKeys, "P7 scoped resolver record IDs");
    const resolverEnvelope = {
      schemaVersion: 1,
      catalogId: resolverSource.catalogId,
      catalogVersion: "2026.07.16.3",
      adapterVersion: digestContract.adapterVersion,
      canonicalization: digestContract.canonicalization,
      records: resolverRecords,
      resolverDigest: stableSha256({
        adapterVersion: digestContract.adapterVersion,
        records: resolverRecords,
      }),
    };
    const resolverRecordByKey = new Map(resolverRecords.map((record) => [
      `${record.section}|${record.recordId}`,
      record,
    ]));
    const bindResolver = (section, recordId) => {
      const record = resolverRecordByKey.get(`${section}|${recordId}`);
      check(record, `P7 missing resolver record ${section}/${recordId}`);
      return {
        section,
        recordId,
        contentSha256: record.contentSha256,
        resolverDigest: resolverEnvelope.resolverDigest,
      };
    };
    const goalTemplateByType = new Map(source.goalTemplates.map((record) => [record.goalType, record]));
    const dayCatalog = source.days.map((day) => ({
      ...clone(day),
      dayId: `campaign_day_${String(day.day).padStart(2, "0")}`,
      goals: day.goalTypes.map((goalType, index) => {
        const template = goalTemplateByType.get(goalType);
        check(template, `P7 day ${day.day} references unknown goal ${goalType}`);
        const resolverRecord = resolverRecordByKey.get(`goalEvidence|${template.evidence}`);
        check(resolverRecord, `P7 goal ${goalType} lacks an exact resolver`);
        return {
          goalId: `day_${String(day.day).padStart(2, "0")}_goal_${index + 1}_${goalType}`,
          goalType,
          evidence: template.evidence,
          evidenceResolver: clone(resolverRecord.payload),
          resolverBinding: bindResolver("goalEvidence", template.evidence),
          minimum: template.minimum,
          selectionRule: "select_after_persisted_day_schedule_without_patient_or_family_requirement",
        };
      }),
    }));
    const envelope = (catalogKind, itemId, envelopeType, payload, resolverBindings) => ({
      catalogRef: {
        catalogKind,
        catalogId: source.catalogId,
        catalogVersion: source.catalogVersion,
        contentSha256: stableSha256(payload),
        resolverDigest: resolverEnvelope.resolverDigest,
        approvalStatus: "author_complete_programmer_adapter_required",
      },
      itemId,
      envelopeType,
      runtimeEligible: false,
      resolverBindings,
      payload: clone(payload),
    });
    const catalogEnvelopes = {
      events: source.events.map((item) => envelope(
        "event",
        item.eventId,
        "event.record",
        item,
        [bindResolver("eventTriggers", item.trigger), ...item.effects.map((id) => bindResolver("eventEffects", id))],
      )),
      milestones: source.milestones.map((item) => envelope(
        "milestone",
        item.milestoneId,
        "milestone.record",
        item,
        item.requires.map((id) => bindResolver("milestoneAndRecoveryRequirements", id)),
      )),
      specializations: source.specializations.map((item) => envelope(
        "specialization",
        item.specializationId,
        "specialization.record",
        item,
        item.supportingCapabilities.map((id) => bindResolver("specializationCapabilities", id)),
      )),
      endings: source.endings.map((item) => envelope(
        "ending",
        item.endingId,
        "ending.record",
        item,
        Object.keys(item.requires).map((id) => bindResolver("endingPredicates", id)),
      )),
    };
    const activationDigestInput = {
      adapterVersion: digestContract.adapterVersion,
      dayCatalog,
      axes: clone(source.axes),
      catalogEnvelopes,
      recovery: clone(source.recovery),
      resolverEnvelope,
    };
    return {
      resolverEnvelope,
      dayCatalog,
      catalogEnvelopes,
      activationDigestInput,
      activationDigest: stableSha256(activationDigestInput),
    };
  };

  const projection = buildProjection(resolver);
  check(projection.resolverEnvelope.records.length === EXPECTED_COUNTS.p7EvidenceResolvers, "P7 resolver record count mismatch");
  check(
    projection.resolverEnvelope.resolverDigest === "e5c756a3ccc158e509caa2a7e76654981b0ce7cb3f4951fa30c4eeec07123558",
    "P7 trusted resolver digest mismatch",
  );
  check(sameJson(director.evidenceResolver, resolver), "P7 generated evidence resolver differs from author source");
  check(sameJson(director.resolverEnvelope, projection.resolverEnvelope), "P7 resolver envelope differs from canonical source projection");
  check(sameJson(director.activationDigestContract, digestContract), "P7 embedded activation digest contract differs from source");
  check(sameJson(days.campaign, source.campaign), "P7 outer campaign projection differs from exact source");
  check(sameJson(days.authority, source.authority), "P7 outer day authority projection differs from exact source");
  check(days.resolverDigest === projection.resolverEnvelope.resolverDigest, "P7 day catalog resolver digest mismatch");
  check(sameJson(days.days, projection.dayCatalog), "P7 generated day catalog differs from canonical projection");
  check(sameJson(director.axes, source.axes), "P7 generated axes differ from exact source");
  check(sameJson(director.recovery, source.recovery), "P7 generated recovery differs from exact source");
  check(sameJson(director.catalogEnvelopes, projection.catalogEnvelopes), "P7 catalog envelopes differ from canonical projection");
  check(sameJson(director.activationDigestInput, projection.activationDigestInput), "P7 activation digest input differs from canonical projection");
  check(director.activationDigest === projection.activationDigest, "P7 activation digest mismatch");
  check(director.catalogDigest === projection.activationDigest, "P7 catalog digest must equal the combined activation digest");
  check(
    projection.activationDigest === "a588b27bbcffb6e44dc01e135dac2f0aff926124d66b8008578960ef6b25e371",
    "P7 trusted activation digest mismatch",
  );
  check(days.days.length === EXPECTED_COUNTS.campaignDays, "P7 day count mismatch");
  check(days.campaign?.chapters === EXPECTED_COUNTS.chapters, "P7 chapter count mismatch");
  checkUnique(days.days.map((record) => record.day), "P7 day numbers");
  check(sameStrings(days.days.map((record) => record.day), Array.from({ length: 30 }, (_, index) => index + 1)), "P7 days must be 1 through 30");
  const goalCount = days.days.reduce((total, day) => total + day.goals.length, 0);
  check(goalCount === EXPECTED_COUNTS.goals, "P7 goal count mismatch");
  check(days.authority?.dayScheduleCreatedOnceAndPersisted === true, "P7 day schedule persistence authority missing");
  check(days.authority?.saveSchemaChange === false, "P7 must not claim a save-schema change");
  check(resolver.activation?.programmerAdapterValidated === false, "P7 source activation must remain unvalidated");
  check(resolver.activation?.productOwnerBalanceAccepted === false, "P7 source product-owner acceptance must remain pending");
  check(resolver.activation?.runtimeEligible === false, "P7 source must remain runtime-ineligible");

  const mutatedResolver = clone(resolver);
  mutatedResolver.goalEvidence[0].fieldOrPredicate += "__host_mutation_probe";
  const mutatedProjection = buildProjection(mutatedResolver);
  check(
    mutatedProjection.activationDigest !== projection.activationDigest,
    "P7 semantic mutation must change the combined activation digest",
  );
  return {
    audit: {
      campaignDays: days.days.length,
      chapters: days.campaign.chapters,
      goals: goalCount,
      events: director.catalogEnvelopes.events.length,
      milestones: director.catalogEnvelopes.milestones.length,
      specializations: director.catalogEnvelopes.specializations.length,
      endings: director.catalogEnvelopes.endings.length,
      evidenceResolvers: projection.resolverEnvelope.records.length,
      resolverDigest: projection.resolverEnvelope.resolverDigest,
      activationDigest: projection.activationDigest,
      resolverMutationChangesActivationDigest: true,
      outerCampaignProjectionVerified: true,
      outerAuthorityProjectionVerified: true,
      runtimeEligible: false,
    },
    blockers: [],
  };
}

export function validateOperationalAuthoringPackageV4({
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
  validateOperationalReviewInputV4Registration(registration);
  const capabilityById = validateCapabilityRegistry(registration, capabilityRegistry, capabilityBytes);
  check(isObject(manifest), "operational .4 manifest is missing");
  check(manifest.schemaVersion === 1, "operational .4 manifest schemaVersion must be 1");
  check(manifest.packageId === registration.packageId, "operational .4 manifest packageId mismatch");
  check(manifest.packageVersion === registration.packageVersion, "operational .4 manifest packageVersion mismatch");
  check(manifest.status === registration.status, "operational .4 manifest status mismatch");
  check(manifest.runtimeEligible === false, "operational .4 manifest runtimeEligible must remain false");
  check(sameStrings(manifest.activationRequires, EXPECTED_ACTIVATION_REQUIREMENTS), "operational .4 activation requirements changed");
  check(manifest.boundaries?.runtimeChanged === false, "operational .4 must not claim runtime changes");
  check(manifest.boundaries?.designChanged === false, "operational .4 must not claim design changes");
  check(manifest.boundaries?.saveSchemaChanged === false, "operational .4 must not claim save-schema changes");
  check(manifest.boundaries?.medicalTruthAuthoredHere === false, "operational .4 must not author medical truth");
  check(manifest.boundaries?.existingThirtyCardPoolChanged === false, "operational .4 must preserve the current 30-card pool");
  check(manifest.boundaries?.p5CatalogAuthoredHere === false, "operational .4 must not claim P5 catalog authority");
  check(manifest.sources?.medicalPackageId === "vetgeme-medical-production-authoring", "operational .4 medical source ID mismatch");
  check(manifest.sources?.medicalPackageVersion === MEDICAL_REVIEW_INPUT_V40_VERSION, "operational .4 medical source version mismatch");
  check(manifest.sources?.medicalActivationStatus === "blocked_pending_external_veterinary_review", "medical source must remain pending review");
  check(manifest.sources?.capabilityRegistryId === CAPABILITY_REGISTRY_ID, "manifest capability registry ID mismatch");
  check(manifest.sources?.capabilityRegistryVersion === CAPABILITY_REGISTRY_VERSION, "manifest capability registry version mismatch");
  check(
    manifest.sources?.medicalManifestSha256 === "87ded58e62ecf0b05d87af83e00570004cadafa9a0edd74768eda6e8cb9b3f49",
    "manifest medical .40 dependency digest mismatch",
  );
  check(manifest.sources?.capabilityRegistrySha256 === CAPABILITY_REGISTRY_SHA256, "manifest capability registry digest mismatch");
  check(manifest.sources?.p5PackageId === P5_REVIEW_INPUT_ID, "manifest P5 dependency ID mismatch");
  check(manifest.sources?.p5PackageVersion === P5_REVIEW_INPUT_VERSION, "manifest P5 dependency version mismatch");
  check(
    manifest.sources?.p5ManifestSha256 === "25730b20dcc3d0ac840082f353ccea14d11c35aa9c107bf2cb52ccd21e3e69c6",
    "manifest P5 .2 dependency digest mismatch",
  );
  check(manifest.sources?.p5ReservationAuthorityJoined === false, "manifest must keep P5 reservation authority unjoined");
  check(
    manifest.sources?.supersedesOperationalPackageVersion === "2026.07.16.3",
    "manifest must supersede operational .3 only as an author source",
  );
  check(
    manifest.sources?.supersededOperationalArchiveSha256
      === "5abee5242467e703561e0de2eefbb5050345448c90b21b97761d7ee60540a1df",
    "manifest superseded operational .3 archive digest mismatch",
  );
  check(isObject(manifest.counts), "operational .4 manifest counts are missing");
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
    p4PresentationHandlingBindings: 514,
    campaignDays: 30,
    events: 27,
    milestones: 6,
    specializations: 3,
    endings: 6,
  };
  check(sameStrings(Object.keys(manifest.counts), Object.keys(manifestExpectedCounts)), "operational .4 manifest count fields mismatch");
  for (const [field, expected] of Object.entries(manifestExpectedCounts)) {
    check(manifest.counts[field] === expected, `operational .4 manifest count ${field} mismatch`);
  }
  checkArray(manifest.files, "operational .4 manifest files");
  check(manifest.files.length === EXPECTED_COUNTS.sourceFiles, "operational .4 manifest must list 40 files");
  checkUnique(manifest.files, "operational .4 manifest files");
  manifest.files.forEach((file) => checkSafePath(file, `manifest file ${file}`));
  check(sameStrings(manifest.files, sourceFiles), "operational .4 manifest and provenance file sets differ");
  check(sameStrings(REQUIRED_JSON_PATHS, Object.keys(documents)), "operational .4 parsed JSON file set mismatch");
  for (const path of AUTHORITATIVE_EXACT_PATHS) {
    const forbidden = findForbiddenOperationalV4AuthorityKeys(documents[path], path);
    check(
      forbidden.length === 0,
      `${path}: approximate/default runtime authority is forbidden (${forbidden.join(", ")})`,
    );
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
  const p1CorrectionMatrix = documents["reports/P1_CORRECTION_MATRIX.json"];
  check(validationReport.status === "pass", "bundled author validation report must remain pass");
  check(validationReport.checks.length === 64, "bundled author validation check count mismatch");
  const validationChecksById = new Map(validationReport.checks.map((record) => [record.id, record]));
  for (const checkId of [
    "p3_result_authority",
    "p3_result_authority_projection",
    "p3_result_authority_mutation_probe",
  ]) {
    check(validationChecksById.get(checkId)?.status === "pass", `bundled ${checkId} evidence is missing`);
  }
  check(validationReport.simulation?.campaigns === 10000, "bundled author simulation campaign count mismatch");
  check(validationReport.simulation?.demandDays === 297717, "bundled author demand-day count mismatch");
  check(
    p1CorrectionMatrix.status === "author_corrections_complete_exact_p5_join_pending",
    "P1 correction matrix status mismatch",
  );
  checkArray(p1CorrectionMatrix.findings, "P1 correction matrix findings");
  check(p1CorrectionMatrix.findings.length === 6, "P1 correction matrix finding count mismatch");
  check(
    sameStrings(
      p1CorrectionMatrix.findings.filter((record) => record.currentStatus === "author_closed").map((record) => record.id),
      [
        "p3_turnaround_collapsed_by_representative_usage",
        "p3_unmatched_urgency_and_classification_defaults",
        "p3_medical_result_authority_projection_drift",
        "p4_safe_alternative_fact_binding_missing",
        "p7_digest_does_not_bind_resolver_or_day_semantics",
      ],
    ),
    "P1 author-closed correction set mismatch",
  );
  check(
    p1CorrectionMatrix.findings.find((record) => record.id === "p6_crosswalk_is_not_p5_execution_authority")?.currentStatus
      === "external_join_pending",
    "P1 P5/P6 join must remain external_join_pending",
  );
  const p3AuthorityFinding = p1CorrectionMatrix.findings.find((record) => (
    record.id === P3_AUTHORITY_DRIFT_BLOCKER_ID
  ));
  check(p3AuthorityFinding?.currentStatus === "author_closed", "P3 authority projection correction must be author-closed");
  check(p3AuthorityFinding?.evidence?.researchRecords === EXPECTED_COUNTS.researchIds, "P3 authority correction record count mismatch");
  check(p3AuthorityFinding?.evidence?.exactAuthority === P3_MEDICAL_RESULT_AUTHORITY, "P3 authority correction exact path mismatch");
  check(p3AuthorityFinding?.evidence?.explicitGeneratedMismatches === 0, "P3 authority correction mismatch count must be 0");
  check(p3AuthorityFinding?.evidence?.operationalPolicyMayGenerateResult === false, "P3 authority correction must forbid result generation");
  check(p1CorrectionMatrix.activationGate?.runtimeActivationAllowed === false, "P1 matrix must keep runtime activation disabled");

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
  check(baselineCrosswalkMatches.length === 0, "operational .4 contains an unapproved current 30-card crosswalk");
  check(!sourceFiles.some((path) => /activation.?manifest/iu.test(path)), "operational .4 must not contain an activation manifest");

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

export async function loadOperationalAuthoringReviewInputV4FromReader(reader, registry, options = {}) {
  check(reader && typeof reader.readBytes === "function", "reader.readBytes is required");
  check(reader && typeof reader.listFiles === "function", "reader.listFiles is required");
  const registration = resolveOperationalAuthoringReviewInputV4(registry, options);
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
  const documents = Object.fromEntries(REQUIRED_JSON_PATHS.map((relativePath) => [
    relativePath,
    parseJson(sourceBytesByPath.get(relativePath), relativePath),
  ]));
  // Surface the closed P3 authority contract by its stable blocker identity even
  // when a reader is tampered. Full immutable provenance verification still
  // follows for every semantically valid source.
  validateOperationalV4P3MedicalResultAuthorityProjection(documents);
  const sourceIntegrity = validateOperationalV4SourceProvenance(
    registration,
    provenance,
    sourceFiles,
    sourceBytesByPath,
  );
  const manifest = documents["MANIFEST.json"];
  const capabilityRegistry = parseJson(capabilityBytes, registration.capabilityRegistry.path);
  const baselineManifest = parseJson(baselineManifestBytes, BASELINE_MANIFEST_PATH);
  const audit = validateOperationalAuthoringPackageV4({
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
    loadContext: OPERATIONAL_REVIEW_INPUT_V4_CONTEXT,
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

export async function loadOperationalAuthoringReviewInputV4(projectRoot, options = {}) {
  const reader = createFileSystemReviewInputReader(projectRoot);
  const registry = parseJson(await reader.readBytes(REVIEW_INPUT_REGISTRY_PATH), REVIEW_INPUT_REGISTRY_PATH);
  return loadOperationalAuthoringReviewInputV4FromReader(reader, registry, options);
}
