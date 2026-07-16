import { createHash } from "node:crypto";

import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
  validateReviewInputRegistry,
} from "./medical-authoring-review-input.mjs";

export const OPERATIONAL_REVIEW_INPUT_ID = "vetgeme-operational-production-authoring";
export const OPERATIONAL_REVIEW_INPUT_VERSION = "2026.07.16.1";
export const OPERATIONAL_REVIEW_INPUT_ROOT =
  "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.1";
export const OPERATIONAL_REVIEW_CONTEXT = "review";
export const OPERATIONAL_REVIEW_STATUS = "author_complete_validation_passed";
export const OPERATIONAL_CATALOG_STATUS = "author_complete_simulation_pending";
export const BASELINE_MANIFEST_PATH = "content/packs/tier-01-v2/clinical/tier-01/manifest.json";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const EXPECTED_COUNTS = Object.freeze({
  families: 39,
  variants: 215,
  presentations: 645,
  researchIds: 361,
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
  inventoryCategories: 10,
  reputationAxes: 4,
  campaignDays: 30,
  chapters: 6,
  goals: 60,
  events: 27,
  milestones: 6,
  specializations: 3,
  endings: 6,
  productionPool: 0,
});

const EXPECTED_MANIFEST_COUNTS = Object.freeze({
  families: 39,
  variants: 215,
  presentations: 645,
  researchIds: 361,
  investigationUsages: 1864,
  temperamentTags: 128,
  ownerModifierTags: 463,
  handlingAlternativeTags: 446,
  capabilities: 447,
  campaignDays: 30,
  events: 27,
  milestones: 6,
  specializations: 3,
  endings: 6,
});

const EXPECTED_GENERATED_CATALOGS = Object.freeze({
  "generated/p3/investigation-usage-policy.json": "vetgeme-p3-investigation-usage-policy",
  "generated/p3/provider-catalog.json": "vetgeme-p3-referral-providers",
  "generated/p3/research-catalog.json": "vetgeme-p3-research-catalog",
  "generated/p4/appearance-pools.json": "vetgeme-p4-appearance-pools",
  "generated/p4/behavior-crosswalk.json": "vetgeme-p4-medical-compatibility-crosswalk",
  "generated/p4/history-policy.json": "vetgeme-p4-identity-history-policy",
  "generated/p4/observable-cues.json": "vetgeme-p4-observable-cues",
  "generated/p4/owner-profile-catalog.json": "vetgeme-p4-owner-profiles",
  "generated/p4/temperament-catalog.json": "vetgeme-p4-temperaments",
  "generated/p6/economy-catalog.json": "vetgeme-p6-balance-catalog",
  "generated/p6/p3-p5-resource-crosswalk.json": "vetgeme-p6-resource-crosswalk",
  "generated/p7/day-catalog.json": "vetgeme-p7-campaign-catalog",
  "generated/p7/director-catalog.json": "vetgeme-p7-campaign-catalog",
});

const EXPECTED_SOURCE_POLICIES = Object.freeze({
  "source/p3-policy.json": "vetgeme-p3-operational-policy",
  "source/p4-policy.json": "vetgeme-p4-identity-behavior-policy",
  "source/p6-balance.json": "vetgeme-p6-balance-catalog",
  "source/p7-campaign.json": "vetgeme-p7-campaign-catalog",
});

const EXPECTED_UNKNOWN_P4_RESOURCE_IDS = Object.freeze([
  "comfort_surface",
  "infection_control_capacity",
  "monitoring_capacity",
  "quiet_route",
  "referral_coordination",
  "reviewed_sedation_protocol",
  "sampling_plan",
  "scheduled_recheck_slot",
]);

const EXPECTED_P4_EXACT_FALSE_SUBSTRING_MAPPINGS = Object.freeze([
  Object.freeze({
    section: "temperamentTags",
    sourceTag: "clinic_inhibited",
    selectedRuleId: "temp_pain_defensive",
    matchedTokens: Object.freeze(["bite"]),
  }),
  Object.freeze({
    section: "temperamentTags",
    sourceTag: "exercise_intolerant",
    selectedRuleId: "temp_calm",
    matchedTokens: Object.freeze(["tolerant"]),
  }),
]);

const EXPECTED_P4_CONTEXTUAL_SUBSTRING_RISKS = Object.freeze([
  Object.freeze({
    section: "temperamentTags",
    sourceTag: "respiratory_distress",
    selectedRuleId: "temp_fearful",
    matchedTokens: Object.freeze(["stress"]),
  }),
]);

const EXPECTED_ACTIVATION_REQUIREMENTS = Object.freeze([
  "programmer_schema_adapter_review",
  "medical_family_external_veterinary_approval",
  "full_runtime_smoke_and_save_reload",
  "product_owner_balance_acceptance",
]);

function fail(message) {
  throw new Error(`Operational authoring review input validation failed: ${message}`);
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

function hasTagTokenBoundary(value, token) {
  const normalizedValue = String(value).toLowerCase();
  const normalizedToken = String(token).toLowerCase();
  return normalizedValue === normalizedToken
    || normalizedValue.startsWith(`${normalizedToken}_`)
    || normalizedValue.endsWith(`_${normalizedToken}`)
    || normalizedValue.includes(`_${normalizedToken}_`);
}

function auditP4RuleSelection(records, rules, {
  label,
  ruleIdentityKey,
  selectedIdentityKey,
}) {
  checkArray(rules, `${label} rules`);
  const activeRules = rules.filter((rule) => {
    check(isObject(rule), `${label} rule must be an object`);
    checkArray(rule.matchTokens, `${label} rule matchTokens`);
    check(isNonEmptyString(rule[ruleIdentityKey]), `${label} rule identity is missing`);
    return rule.matchTokens.length > 0;
  });
  const fallbackRules = rules.filter((rule) => rule.matchTokens.length === 0);
  check(fallbackRules.length === 1, `${label} must have exactly one fallback rule`);

  const ambiguous = [];
  const selectedRuleNonBoundaryTokenMatches = [];
  const allRuleNonBoundaryTokenMatches = [];
  for (const record of records) {
    const normalizedTag = String(record.sourceTag).toLowerCase();
    const matchingRules = activeRules.flatMap((rule) => {
      const matchedTokens = rule.matchTokens.filter((token) => (
        normalizedTag.includes(String(token).toLowerCase())
      ));
      return matchedTokens.length > 0
        ? [{ ruleId: rule[ruleIdentityKey], matchedTokens: clone(matchedTokens) }]
        : [];
    });
    const expectedRuleId = matchingRules[0]?.ruleId || fallbackRules[0][ruleIdentityKey];
    check(
      record[selectedIdentityKey] === expectedRuleId,
      `${label}/${record.sourceTag}: selected rule differs from source builder precedence`,
    );
    if (matchingRules.length > 1) {
      ambiguous.push({
        sourceTag: record.sourceTag,
        selectedRuleId: record[selectedIdentityKey],
        matchingRules,
      });
    }
    const allNonBoundaryMatches = matchingRules.flatMap((match) => {
      const matchedTokens = match.matchedTokens
        .filter((token) => !hasTagTokenBoundary(record.sourceTag, token));
      return matchedTokens.length > 0
        ? [{ ruleId: match.ruleId, matchedTokens }]
        : [];
    });
    if (allNonBoundaryMatches.length > 0) {
      allRuleNonBoundaryTokenMatches.push({
        sourceTag: record.sourceTag,
        selectedRuleId: record[selectedIdentityKey],
        matchingRules: allNonBoundaryMatches,
      });
    }
    const selectedMatch = matchingRules.find((match) => match.ruleId === record[selectedIdentityKey]);
    const nonBoundaryMatchedTokens = (selectedMatch?.matchedTokens || [])
      .filter((token) => !hasTagTokenBoundary(record.sourceTag, token));
    if (nonBoundaryMatchedTokens.length > 0) {
      selectedRuleNonBoundaryTokenMatches.push({
        sourceTag: record.sourceTag,
        selectedRuleId: record[selectedIdentityKey],
        matchedTokens: nonBoundaryMatchedTokens,
      });
    }
  }
  return {
    ambiguous,
    selectedRuleNonBoundaryTokenMatches,
    allRuleNonBoundaryTokenMatches,
  };
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

function checkCatalogHeader(catalog, expectedId, label) {
  check(isObject(catalog), `${label} must be an object`);
  check(catalog.schemaVersion === 1, `${label}.schemaVersion must be 1`);
  const identity = catalog.catalogId || catalog.policyId;
  const version = catalog.catalogVersion || catalog.policyVersion;
  check(identity === expectedId, `${label} identity mismatch`);
  check(version === OPERATIONAL_REVIEW_INPUT_VERSION, `${label} version mismatch`);
  check(catalog.status === OPERATIONAL_CATALOG_STATUS, `${label} status must remain ${OPERATIONAL_CATALOG_STATUS}`);
  check(catalog.runtimeEligible === false, `${label}.runtimeEligible must remain false`);
}

export function validateOperationalReviewInputRegistration(registration) {
  check(isObject(registration), "review input registration must be an object");
  check(registration.reviewInputId === OPERATIONAL_REVIEW_INPUT_ID, "unexpected reviewInputId");
  check(registration.reviewInputVersion === OPERATIONAL_REVIEW_INPUT_VERSION, "unexpected reviewInputVersion");
  check(registration.kind === "operational_authoring", "review input kind must be operational_authoring");
  check(registration.packageId === OPERATIONAL_REVIEW_INPUT_ID, "packageId mismatch");
  check(registration.packageVersion === OPERATIONAL_REVIEW_INPUT_VERSION, "packageVersion mismatch");
  check(registration.root === OPERATIONAL_REVIEW_INPUT_ROOT, "operational review root mismatch");
  checkSafePath(registration.root, "root");
  check(registration.sourceRoot === "source", "sourceRoot must be source");
  check(registration.manifestPath === "source/MANIFEST.json", "manifestPath must target source/MANIFEST.json");
  check(registration.provenancePath === "provenance.json", "provenancePath must be provenance.json");
  check(registration.status === OPERATIONAL_REVIEW_STATUS, `status must remain ${OPERATIONAL_REVIEW_STATUS}`);
  check(registration.reviewOnly === true, "reviewOnly must be true");
  check(registration.productionEligible === false, "productionEligible must be false");
  check(registration.runtimeEligible === false, "runtimeEligible must be false");
  check(registration.allowCurrentCaseCrosswalk === false, "allowCurrentCaseCrosswalk must be false");

  check(isObject(registration.expectedCounts), "expectedCounts are required");
  checkInteger(registration.expectedCounts.sourceFiles, "expectedCounts.sourceFiles");
  checkInteger(registration.expectedCounts.sourceBytes, "expectedCounts.sourceBytes");
  check(registration.expectedCounts.sourceFiles === 25, "expected source file count must be 25");
  check(registration.expectedCounts.sourceBytes === 3925919, "expected source byte count must be 3925919");
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
  checkSafePath(registration.capabilityRegistry.path, "capabilityRegistry.path");
  check(
    registration.capabilityRegistry.path ===
      "content/system-packs/vetgeme-master-2026-07-14/capability-registry.json",
    "capability registry path mismatch",
  );
  check(SHA256_PATTERN.test(registration.capabilityRegistry.sha256 || ""), "capability registry SHA-256 is invalid");
  return registration;
}

export function resolveOperationalAuthoringReviewInput(registry, options = {}) {
  const registrations = validateReviewInputRegistry(registry);
  check(Object.prototype.hasOwnProperty.call(options, "context"), "explicit review context is required");
  check(
    options.context === OPERATIONAL_REVIEW_CONTEXT,
    `context ${String(options.context)} is forbidden; review is the only allowed context`,
  );
  const requestedId = options.reviewInputId || OPERATIONAL_REVIEW_INPUT_ID;
  const requestedVersion = options.reviewInputVersion || OPERATIONAL_REVIEW_INPUT_VERSION;
  const registration = registrations.find((entry) => (
    entry.reviewInputId === requestedId && entry.reviewInputVersion === requestedVersion
  ));
  check(registration, `unknown review input ${requestedId}@${requestedVersion}`);
  return validateOperationalReviewInputRegistration(registration);
}

export function validateOperationalSourceProvenance(
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
    provenance.sourceArchive === "operational-production-authoring-2026.07.16.1.zip",
    `${identity}: source archive identity mismatch`,
  );
  check(provenance.sourceDirectory === "operational-production-authoring", `${identity}: source directory identity mismatch`);
  check(isObject(provenance.archive), `${identity}: archive provenance is missing`);
  check(provenance.archive.path === provenance.sourceArchive, `${identity}: archive path mismatch`);
  check(
    provenance.archive.checksumPath === "operational-production-authoring-2026.07.16.1.zip.sha256",
    `${identity}: archive checksum path mismatch`,
  );
  check(provenance.archive.sha256 === registration.sourceIntegrity.archiveSha256, `${identity}: archive digest mismatch`);
  check(provenance.archive.zipEntryCount === 36, `${identity}: archive entry count mismatch`);
  check(
    provenance.archive.extractedFileCount === registration.expectedCounts.sourceFiles,
    `${identity}: archive file count mismatch`,
  );
  check(
    provenance.archive.extractedBytes === registration.expectedCounts.sourceBytes,
    `${identity}: archive byte count mismatch`,
  );
  check(provenance.sourceFileCount === registration.expectedCounts.sourceFiles, `${identity}: provenance file count mismatch`);
  check(provenance.sourceBytes === registration.expectedCounts.sourceBytes, `${identity}: provenance byte count mismatch`);
  check(provenance.aggregateSha256 === registration.sourceIntegrity.aggregateSha256, `${identity}: provenance aggregate digest mismatch`);
  check(Array.isArray(provenance.files), `${identity}: provenance files must be an array`);
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
  for (const file of provenance.files) {
    aggregate.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`, "utf8");
  }
  check(aggregate.digest("hex") === provenance.aggregateSha256, `${identity}: provenance inventory digest mismatch`);
  check(isObject(provenance.archive.keyFileHashes), `${identity}: keyFileHashes are missing`);
  for (const [relativePath, expectedHash] of Object.entries(provenance.archive.keyFileHashes)) {
    checkSafePath(relativePath, `${identity}: key file path`);
    check(SHA256_PATTERN.test(expectedHash || ""), `${identity}: invalid key-file digest for ${relativePath}`);
    const file = provenance.files.find((entry) => entry.path === relativePath);
    check(file, `${identity}: key file is absent from inventory: ${relativePath}`);
    check(file.sha256 === expectedHash, `${identity}: key-file digest mismatch for ${relativePath}`);
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
  check(
    capabilityRegistry.capabilities.length === registration.expectedCounts.capabilities,
    "capability registry count mismatch",
  );
  const ids = capabilityRegistry.capabilities.map((entry) => entry.id);
  check(ids.every(isNonEmptyString), "capability registry contains an invalid ID");
  checkUnique(ids, "capability registry IDs");
  return new Set(ids);
}

function hasGenuineImagingToken(record) {
  const tokens = [...record.requires, record.researchId]
    .flatMap((value) => String(value).toLowerCase().split("_"));
  return tokens.some((token) => (
    token === "xray"
      || token.startsWith("radiograph")
      || token === "ultrasound"
      || token === "imaging"
      || token === "ct"
      || token === "mri"
      || token.startsWith("echo")
      || token === "endoscopy"
      || token === "scintigraphy"
  ));
}

function makeBlocker(id, summary, details) {
  return { id, status: "unresolved", summary, details };
}

function validateP3(catalogs, capabilityIds, registration) {
  const research = catalogs["generated/p3/research-catalog.json"];
  const usage = catalogs["generated/p3/investigation-usage-policy.json"];
  const providers = catalogs["generated/p3/provider-catalog.json"];
  checkArray(research.research, "P3 research catalog records");
  checkArray(usage.usages, "P3 investigation usages");
  checkArray(providers.providers, "P3 providers");
  check(research.research.length === registration.expectedCounts.researchIds, "P3 research count mismatch");
  check(usage.usages.length === registration.expectedCounts.investigationUsages, "P3 usage count mismatch");
  check(providers.providers.length === registration.expectedCounts.providers, "P3 provider count mismatch");
  const researchIds = research.research.map((record) => record.researchId);
  checkUnique(researchIds, "P3 research IDs");
  checkUnique(providers.providers.map((provider) => provider.providerId), "P3 provider IDs");
  const researchIdSet = new Set(researchIds);
  for (const record of research.research) {
    check(Array.isArray(record.requires) && record.requires.length > 0, `${record.researchId}: requires must be non-empty`);
    check(record.requires.every((id) => capabilityIds.has(id)), `${record.researchId}: unknown capability in requires`);
    check(Array.isArray(record.capabilityIdsPendingRegistry), `${record.researchId}: capabilityIdsPendingRegistry is missing`);
    check(record.capabilityIdsPendingRegistry.length === 0, `${record.researchId}: pending capability registry mapping`);
    check(record.operationalPolicyMayGenerateResult === false, `${record.researchId}: operational result generation is forbidden`);
  }
  for (const record of usage.usages) {
    check(researchIdSet.has(record.researchId), `${record.usageId}: unknown researchId`);
    check(record.mappedByFamilyResearchContract === true, `${record.usageId}: family research contract is unmapped`);
  }

  const localProviderNullIds = research.research
    .filter((record) => record.turnaroundPolicy?.kind === "local" && record.providerId === null)
    .map((record) => record.researchId);
  const fallbackNullIds = research.research
    .filter((record) => record.fallback === null)
    .map((record) => record.researchId);
  const imagingProviderRecords = research.research.filter((record) => record.providerId === "ref_imaging_center");
  const suspiciousImagingRoutes = imagingProviderRecords
    .filter((record) => !hasGenuineImagingToken(record))
    .map((record) => ({
      researchId: record.researchId,
      requires: clone(record.requires),
      providerId: record.providerId,
    }));
  const hardcodedActivationByField = Object.fromEntries(
    ["delivered", "trainingComplete", "maintenanceCurrent", "stockAvailable"].map((field) => [
      field,
      research.research.filter((record) => record.activationGate?.[field] === true).map((record) => record.researchId),
    ]),
  );
  check(localProviderNullIds.length === 230, "P3 local provider null count must remain visible as 230");
  check(fallbackNullIds.length === 12, "P3 fallback null count must remain visible as 12");
  check(imagingProviderRecords.length === 64, "P3 imaging-provider route count mismatch");
  check(suspiciousImagingRoutes.length === 32, "P3 suspicious imaging-provider route count must remain visible as 32");
  for (const [field, ids] of Object.entries(hardcodedActivationByField)) {
    check(ids.length === 361, `P3 hardcoded activation field ${field} count must remain visible as 361`);
  }

  return {
    audit: {
      researchIds: research.research.length,
      investigationUsages: usage.usages.length,
      providers: providers.providers.length,
      localProviderNull: localProviderNullIds.length,
      fallbackNull: fallbackNullIds.length,
      imagingProviderRoutes: imagingProviderRecords.length,
      suspiciousImagingProviderRoutes: suspiciousImagingRoutes.length,
      hardcodedActivationTrueReferences: Object.values(hardcodedActivationByField)
        .reduce((total, ids) => total + ids.length, 0),
    },
    blockers: [
      makeBlocker(
        "p3_local_ownership_resolver_missing",
        "Local P3 records intentionally omit referral provider IDs and still need explicit P5 resource ownership resolution.",
        {
          researchIds: localProviderNullIds,
          providerId: null,
          requiredRuntimeAuthority: "p5_resource_ownership_and_availability_resolver",
        },
      ),
      makeBlocker(
        "p3_source_fallback_defaulted",
        "P3 source records omit explicit fallbacks that the generated activation gate defaults to safe_referral.",
        {
          researchIds: fallbackNullIds,
          sourceFallback: null,
          generatedDefault: "safe_referral",
          requiredAuthority: "author_and_veterinary_approval",
        },
      ),
      makeBlocker(
        "p3_activation_state_hardcoded",
        "P3 activation gates are authored as true instead of being supplied by runtime state.",
        { byField: hardcodedActivationByField },
      ),
      makeBlocker(
        "p3_provider_routing_substring_collision",
        "Imaging routing includes records without a genuine standalone imaging token.",
        { routes: suspiciousImagingRoutes },
      ),
    ],
  };
}

function validateP4(catalogs, capabilityIds, registration, policy) {
  const owners = catalogs["generated/p4/owner-profile-catalog.json"];
  const temperaments = catalogs["generated/p4/temperament-catalog.json"];
  const cues = catalogs["generated/p4/observable-cues.json"];
  const crosswalk = catalogs["generated/p4/behavior-crosswalk.json"];
  checkArray(owners.profiles, "P4 owner profiles");
  checkArray(temperaments.temperaments, "P4 temperaments");
  checkArray(cues.rules, "P4 observable cues");
  checkArray(crosswalk.ownerModifiers, "P4 owner modifiers");
  checkArray(crosswalk.temperamentTags, "P4 temperament tags");
  checkArray(crosswalk.handlingAlternatives, "P4 handling alternatives");
  checkArray(crosswalk.presentations, "P4 presentations");
  check(owners.profiles.length === registration.expectedCounts.ownerProfiles, "P4 owner profile count mismatch");
  check(temperaments.temperaments.length === registration.expectedCounts.temperaments, "P4 temperament count mismatch");
  check(cues.rules.length === registration.expectedCounts.observableCues, "P4 observable cue count mismatch");
  check(crosswalk.ownerModifiers.length === registration.expectedCounts.ownerModifierTags, "P4 owner modifier count mismatch");
  check(crosswalk.temperamentTags.length === registration.expectedCounts.temperamentTags, "P4 temperament tag count mismatch");
  check(
    crosswalk.handlingAlternatives.length === registration.expectedCounts.handlingAlternativeTags,
    "P4 handling alternative count mismatch",
  );
  check(crosswalk.presentations.length === registration.expectedCounts.behaviorPresentations, "P4 presentation count mismatch");
  checkUnique(owners.profiles.map((record) => record.profileId), "P4 owner profile IDs");
  checkUnique(temperaments.temperaments.map((record) => record.temperamentId), "P4 temperament IDs");
  checkUnique(crosswalk.ownerModifiers.map((record) => record.sourceTag), "P4 owner modifier source tags");
  checkUnique(crosswalk.temperamentTags.map((record) => record.sourceTag), "P4 temperament source tags");
  checkUnique(crosswalk.handlingAlternatives.map((record) => record.sourceTag), "P4 handling source tags");
  checkUnique(crosswalk.presentations.map((record) => record.presentationRef), "P4 presentation refs");

  const ruleSelectionAudit = {
    ownerModifiers: auditP4RuleSelection(
      crosswalk.ownerModifiers,
      policy.ownerModifierRules,
      {
        label: "P4 owner modifier",
        ruleIdentityKey: "ruleId",
        selectedIdentityKey: "ruleId",
      },
    ),
    temperamentTags: auditP4RuleSelection(
      crosswalk.temperamentTags,
      policy.temperamentTagRules,
      {
        label: "P4 temperament tag",
        ruleIdentityKey: "ruleId",
        selectedIdentityKey: "ruleId",
      },
    ),
    handlingAlternatives: auditP4RuleSelection(
      crosswalk.handlingAlternatives,
      policy.handlingActionClasses,
      {
        label: "P4 handling alternative",
        ruleIdentityKey: "actionClassId",
        selectedIdentityKey: "actionClassId",
      },
    ),
  };
  check(ruleSelectionAudit.ownerModifiers.ambiguous.length === 5, "P4 ambiguous owner rule count must remain visible as 5");
  check(ruleSelectionAudit.temperamentTags.ambiguous.length === 0, "P4 ambiguous temperament rule count must remain visible as 0");
  check(ruleSelectionAudit.handlingAlternatives.ambiguous.length === 183, "P4 ambiguous handling rule count must remain visible as 183");
  check(ruleSelectionAudit.ownerModifiers.selectedRuleNonBoundaryTokenMatches.length === 10, "P4 selected-rule non-boundary owner token match count must remain visible as 10");
  check(ruleSelectionAudit.temperamentTags.selectedRuleNonBoundaryTokenMatches.length === 15, "P4 selected-rule non-boundary temperament token match count must remain visible as 15");
  check(ruleSelectionAudit.handlingAlternatives.selectedRuleNonBoundaryTokenMatches.length === 2, "P4 selected-rule non-boundary handling token match count must remain visible as 2");
  check(ruleSelectionAudit.ownerModifiers.allRuleNonBoundaryTokenMatches.length === 10, "P4 all-rule non-boundary owner token match count must remain visible as 10");
  check(ruleSelectionAudit.temperamentTags.allRuleNonBoundaryTokenMatches.length === 15, "P4 all-rule non-boundary temperament token match count must remain visible as 15");
  check(ruleSelectionAudit.handlingAlternatives.allRuleNonBoundaryTokenMatches.length === 5, "P4 all-rule non-boundary handling token match count must remain visible as 5");

  const exactFalseSubstringMappings = EXPECTED_P4_EXACT_FALSE_SUBSTRING_MAPPINGS.map((expected) => {
    const mapping = ruleSelectionAudit[expected.section].selectedRuleNonBoundaryTokenMatches
      .find((record) => record.sourceTag === expected.sourceTag);
    return { section: expected.section, ...clone(mapping) };
  });
  check(
    sameJson(exactFalseSubstringMappings, EXPECTED_P4_EXACT_FALSE_SUBSTRING_MAPPINGS),
    "P4 exact false substring mapping fingerprints changed",
  );
  const contextualSubstringRisks = EXPECTED_P4_CONTEXTUAL_SUBSTRING_RISKS.map((expected) => {
    const mapping = ruleSelectionAudit[expected.section].selectedRuleNonBoundaryTokenMatches
      .find((record) => record.sourceTag === expected.sourceTag);
    return { section: expected.section, ...clone(mapping) };
  });
  check(
    sameJson(contextualSubstringRisks, EXPECTED_P4_CONTEXTUAL_SUBSTRING_RISKS),
    "P4 contextual substring risk fingerprints changed",
  );

  const ambiguousHandlingSelectionDistribution = Object.fromEntries(sorted(new Set(
    ruleSelectionAudit.handlingAlternatives.ambiguous.map((record) => record.selectedRuleId),
  )).map((ruleId) => [
    ruleId,
    ruleSelectionAudit.handlingAlternatives.ambiguous
      .filter((record) => record.selectedRuleId === ruleId).length,
  ]));
  check(sameJson(ambiguousHandlingSelectionDistribution, {
    barrier_isolation: 4,
    minimal_handling: 127,
    sedation_or_anesthesia: 1,
    specialist_or_external: 13,
    staged_visit: 38,
  }), "P4 ambiguous handling selection distribution changed");
  const ambiguousHandlingCardinality = Object.fromEntries([2, 3, 4].map((count) => [
    String(count),
    ruleSelectionAudit.handlingAlternatives.ambiguous
      .filter((record) => record.matchingRules.length === count).length,
  ]));
  check(sameJson(ambiguousHandlingCardinality, {
    2: 160,
    3: 22,
    4: 1,
  }), "P4 ambiguous handling cardinality distribution changed");

  const unknownById = new Map();
  let resourceRequirementReferences = 0;
  const lostSafeAlternatives = [];
  for (const handling of crosswalk.handlingAlternatives) {
    check(Array.isArray(handling.safeAlternatives) && handling.safeAlternatives.length > 0, `${handling.sourceTag}: top-level safeAlternatives missing`);
    const runtimeRequirements = handling.runtimeActionTemplate?.resourceRequirements;
    check(Array.isArray(runtimeRequirements) && runtimeRequirements.length > 0, `${handling.sourceTag}: runtime resourceRequirements missing`);
    for (const requirement of runtimeRequirements) {
      check(isObject(requirement) && isNonEmptyString(requirement.capabilityId), `${handling.sourceTag}: invalid runtime resource requirement`);
      check(requirement.quantity === 1, `${handling.sourceTag}: runtime resource requirement quantity must be 1`);
      resourceRequirementReferences += 1;
      if (!capabilityIds.has(requirement.capabilityId)) {
        const values = unknownById.get(requirement.capabilityId) || [];
        values.push(handling.sourceTag);
        unknownById.set(requirement.capabilityId, values);
      }
    }
    const runtimeSafeAlternatives = handling.runtimeActionTemplate?.safeAlternatives;
    check(Array.isArray(runtimeSafeAlternatives), `${handling.sourceTag}: runtime safeAlternatives missing`);
    if (handling.safeAlternatives.length > 0 && runtimeSafeAlternatives.length === 0) {
      lostSafeAlternatives.push({
        sourceTag: handling.sourceTag,
        authoredSafeAlternatives: clone(handling.safeAlternatives),
        runtimeSafeAlternatives: [],
      });
    }
  }
  const unknownResourceRequirements = sorted(unknownById.keys()).map((capabilityId) => ({
    capabilityId,
    referenceCount: unknownById.get(capabilityId).length,
    sourceTags: sorted(unknownById.get(capabilityId)),
  }));
  const unknownReferenceCount = unknownResourceRequirements
    .reduce((total, item) => total + item.referenceCount, 0);
  check(resourceRequirementReferences === 448, "P4 runtime resource requirement reference count mismatch");
  check(
    sameStrings(unknownResourceRequirements.map((item) => item.capabilityId), EXPECTED_UNKNOWN_P4_RESOURCE_IDS),
    "P4 unknown runtime resource requirement IDs differ from the eight reviewed gaps",
  );
  check(unknownReferenceCount === 448, "P4 unknown runtime resource requirement reference count must remain visible as 448");
  check(lostSafeAlternatives.length === 446, "P4 lost runtime safe alternative count must remain visible as 446");

  const defaultFallbacks = {
    ownerModifiers: crosswalk.ownerModifiers
      .filter((record) => record.ruleId === "owner_default")
      .map((record) => clone(record)),
    temperamentTags: crosswalk.temperamentTags
      .filter((record) => record.ruleId === "temp_default")
      .map((record) => clone(record)),
    handlingAlternatives: crosswalk.handlingAlternatives
      .filter((record) => record.actionClassId === "low_stress_general")
      .map((record) => ({ sourceTag: record.sourceTag, actionClassId: record.actionClassId })),
  };
  check(defaultFallbacks.ownerModifiers.length === 341, "P4 default owner fallback count must remain visible as 341");
  check(defaultFallbacks.temperamentTags.length === 82, "P4 default temperament fallback count must remain visible as 82");
  check(defaultFallbacks.handlingAlternatives.length === 46, "P4 default handling fallback count must remain visible as 46");

  return {
    audit: {
      ownerProfiles: owners.profiles.length,
      temperaments: temperaments.temperaments.length,
      observableCues: cues.rules.length,
      ownerModifierTags: crosswalk.ownerModifiers.length,
      temperamentTags: crosswalk.temperamentTags.length,
      handlingAlternativeTags: crosswalk.handlingAlternatives.length,
      presentations: crosswalk.presentations.length,
      resourceRequirementReferences,
      unknownResourceRequirementIds: unknownResourceRequirements.length,
      unknownResourceRequirementReferences: unknownReferenceCount,
      lostRuntimeSafeAlternatives: lostSafeAlternatives.length,
      defaultFallbacks: {
        ownerModifiers: defaultFallbacks.ownerModifiers.length,
        temperamentTags: defaultFallbacks.temperamentTags.length,
        handlingAlternatives: defaultFallbacks.handlingAlternatives.length,
      },
      rulePrecedenceAmbiguities: {
        ownerModifiers: ruleSelectionAudit.ownerModifiers.ambiguous.length,
        temperamentTags: ruleSelectionAudit.temperamentTags.ambiguous.length,
        handlingAlternatives: ruleSelectionAudit.handlingAlternatives.ambiguous.length,
      },
      selectedRuleNonBoundaryTokenMatches: {
        ownerModifiers: ruleSelectionAudit.ownerModifiers.selectedRuleNonBoundaryTokenMatches.length,
        temperamentTags: ruleSelectionAudit.temperamentTags.selectedRuleNonBoundaryTokenMatches.length,
        handlingAlternatives: ruleSelectionAudit.handlingAlternatives.selectedRuleNonBoundaryTokenMatches.length,
      },
      allRuleNonBoundaryTokenMatches: {
        ownerModifiers: ruleSelectionAudit.ownerModifiers.allRuleNonBoundaryTokenMatches.length,
        temperamentTags: ruleSelectionAudit.temperamentTags.allRuleNonBoundaryTokenMatches.length,
        handlingAlternatives: ruleSelectionAudit.handlingAlternatives.allRuleNonBoundaryTokenMatches.length,
      },
      exactFalseSubstringMappings: exactFalseSubstringMappings.length,
      contextualSubstringRisks: contextualSubstringRisks.length,
    },
    blockers: [
      makeBlocker(
        "p4_resource_requirements_unmapped",
        "P4 runtime action requirements do not resolve through the capability registry.",
        { requirements: unknownResourceRequirements },
      ),
      makeBlocker(
        "p4_runtime_safe_alternatives_dropped",
        "P4 runtime action templates omit every authored safe alternative.",
        { handlingAlternatives: lostSafeAlternatives },
      ),
      makeBlocker(
        "p4_default_crosswalk_fallbacks",
        "P4 crosswalk relies on broad default rules that require author review.",
        defaultFallbacks,
      ),
      makeBlocker(
        "p4_rule_precedence_and_substring_collisions",
        "P4 crosswalk uses first-match substring precedence for ambiguous and lexically unsafe tags.",
        {
          ambiguousRuleMatches: {
            ownerModifiers: ruleSelectionAudit.ownerModifiers.ambiguous,
            temperamentTags: ruleSelectionAudit.temperamentTags.ambiguous,
            handlingAlternatives: ruleSelectionAudit.handlingAlternatives.ambiguous,
            handlingSelectionDistribution: ambiguousHandlingSelectionDistribution,
            handlingCardinality: ambiguousHandlingCardinality,
          },
          selectedRuleNonBoundaryTokenMatches: {
            ownerModifiers: ruleSelectionAudit.ownerModifiers.selectedRuleNonBoundaryTokenMatches,
            temperamentTags: ruleSelectionAudit.temperamentTags.selectedRuleNonBoundaryTokenMatches,
            handlingAlternatives: ruleSelectionAudit.handlingAlternatives.selectedRuleNonBoundaryTokenMatches,
          },
          allRuleNonBoundaryTokenMatches: {
            ownerModifiers: ruleSelectionAudit.ownerModifiers.allRuleNonBoundaryTokenMatches,
            temperamentTags: ruleSelectionAudit.temperamentTags.allRuleNonBoundaryTokenMatches,
            handlingAlternatives: ruleSelectionAudit.handlingAlternatives.allRuleNonBoundaryTokenMatches,
          },
          exactFalseSubstringMappings,
          contextualSubstringRisks,
          resolutionAuthority: "explicit_author_crosswalk_required",
        },
      ),
    ],
  };
}

function validateP6(catalogs, capabilityIds, registration) {
  const economy = catalogs["generated/p6/economy-catalog.json"];
  const crosswalk = catalogs["generated/p6/p3-p5-resource-crosswalk.json"];
  checkArray(economy.capabilityEconomics, "P6 capability economics");
  checkArray(economy.inventoryCategories, "P6 inventory categories");
  checkArray(economy.reputation?.axes, "P6 reputation axes");
  checkArray(crosswalk.p3Capabilities, "P6 P3 capability crosswalk");
  checkArray(crosswalk.p5ContractRefs, "P6 P5 contract refs");
  check(economy.capabilityEconomics.length === registration.expectedCounts.capabilities, "P6 capability economics count mismatch");
  check(economy.inventoryCategories.length === registration.expectedCounts.inventoryCategories, "P6 inventory category count mismatch");
  check(economy.reputation.axes.length === registration.expectedCounts.reputationAxes, "P6 reputation axis count mismatch");
  check(crosswalk.p3Capabilities.length === registration.expectedCounts.capabilities, "P6 P3 capability crosswalk count mismatch");
  check(crosswalk.p5ContractRefs.length === 5, "P6 P5 contract reference count mismatch");
  check(crosswalk.inferredP5Ids === false, "P6 must not infer P5 IDs");
  check(
    crosswalk.p5CatalogAuthority === "runtime_p5_catalog_or_explicit_programmer_mapping_required",
    "P6 P5 catalog authority mismatch",
  );
  const economyIds = economy.capabilityEconomics.map((record) => record.capabilityId);
  const crosswalkIds = crosswalk.p3Capabilities.map((record) => record.capabilityId);
  checkUnique(economyIds, "P6 capability economics IDs");
  checkUnique(crosswalkIds, "P6 crosswalk capability IDs");
  check(sameStrings(economyIds, capabilityIds), "P6 capability economics differ from capability registry");
  check(sameStrings(crosswalkIds, capabilityIds), "P6 crosswalk differs from capability registry");
  return {
    audit: {
      capabilityEconomics: economy.capabilityEconomics.length,
      inventoryCategories: economy.inventoryCategories.length,
      reputationAxes: economy.reputation.axes.length,
      p5ContractRefs: crosswalk.p5ContractRefs.length,
      inferredP5Ids: crosswalk.inferredP5Ids,
    },
    blockers: [
      makeBlocker(
        "p6_p5_catalog_mapping_missing",
        "P6 declares that a runtime P5 catalog or explicit programmer mapping is still required.",
        {
          p5CatalogAuthority: crosswalk.p5CatalogAuthority,
          p5ContractRefs: clone(crosswalk.p5ContractRefs),
          inferredP5Ids: crosswalk.inferredP5Ids,
        },
      ),
    ],
  };
}

function validateP7(catalogs, registration) {
  const days = catalogs["generated/p7/day-catalog.json"];
  const director = catalogs["generated/p7/director-catalog.json"];
  checkArray(days.days, "P7 campaign days");
  check(days.days.length === registration.expectedCounts.campaignDays, "P7 campaign day count mismatch");
  check(days.campaign?.chapters === registration.expectedCounts.chapters, "P7 chapter count mismatch");
  const dayNumbers = days.days.map((day) => day.day);
  checkUnique(dayNumbers, "P7 campaign day numbers");
  check(sameStrings(dayNumbers, Array.from({ length: 30 }, (_, index) => index + 1)), "P7 campaign days must be 1 through 30");
  const goalCount = days.days.reduce((total, day) => total + checkArray(day.goals, `P7 day ${day.day} goals`).length, 0);
  check(goalCount === registration.expectedCounts.goals, "P7 goal count mismatch");

  const expectedByKind = {
    events: registration.expectedCounts.events,
    milestones: registration.expectedCounts.milestones,
    specializations: registration.expectedCounts.specializations,
    endings: registration.expectedCounts.endings,
  };
  const missingDigestRefs = [];
  const approvedRuntimeEnvelopes = [];
  for (const [kind, expected] of Object.entries(expectedByKind)) {
    const records = checkArray(director.catalogEnvelopes?.[kind], `P7 ${kind} envelopes`);
    check(records.length === expected, `P7 ${kind} count mismatch`);
    checkUnique(records.map((record) => record.itemId), `P7 ${kind} item IDs`);
    for (const record of records) {
      check(record.catalogRef?.catalogId === "vetgeme-p7-campaign-catalog", `P7 ${kind}/${record.itemId}: catalog ID mismatch`);
      check(record.catalogRef?.catalogVersion === OPERATIONAL_REVIEW_INPUT_VERSION, `P7 ${kind}/${record.itemId}: catalog version mismatch`);
      if (!isNonEmptyString(record.catalogRef.digest)) {
        missingDigestRefs.push({ catalogKind: record.catalogRef?.catalogKind, itemId: record.itemId });
      }
      if (record.status === "approved" && isNonEmptyString(record.digest) && Array.isArray(record.itemIds)) {
        approvedRuntimeEnvelopes.push(clone(record));
      }
    }
  }
  check(missingDigestRefs.length === 42, "P7 missing catalogRef digest count must remain visible as 42");
  check(approvedRuntimeEnvelopes.length === 0, "P7 package must not contain an approved runtime envelope");
  check(!Object.prototype.hasOwnProperty.call(days, "evidenceResolver"), "P7 day catalog must not claim an unreviewed evidence resolver");
  check(!Object.prototype.hasOwnProperty.call(director, "evidenceResolver"), "P7 director catalog must not claim an unreviewed evidence resolver");
  const goalEvidenceIds = sorted(new Set(days.days.flatMap((day) => day.goals.map((goal) => goal.evidence))));
  const axisSourceIds = sorted(new Set(checkArray(director.axes, "P7 campaign axes")
    .flatMap((axis) => checkArray(axis.sources, `P7 axis ${axis.axisId} sources`))));
  return {
    audit: {
      campaignDays: days.days.length,
      chapters: days.campaign.chapters,
      goals: goalCount,
      events: director.catalogEnvelopes.events.length,
      milestones: director.catalogEnvelopes.milestones.length,
      specializations: director.catalogEnvelopes.specializations.length,
      endings: director.catalogEnvelopes.endings.length,
      missingCatalogRefDigests: missingDigestRefs.length,
      approvedRuntimeEnvelopes: approvedRuntimeEnvelopes.length,
      goalEvidenceIds: goalEvidenceIds.length,
      axisSourceIds: axisSourceIds.length,
    },
    blockers: [
      makeBlocker(
        "p7_catalog_ref_digest_missing",
        "P7 director item references omit the digest required by the runtime contract.",
        { items: missingDigestRefs },
      ),
      makeBlocker(
        "p7_approved_runtime_envelope_missing",
        "P7 contains no approved digest-bound runtime catalog envelope.",
        { approvedRuntimeEnvelopes },
      ),
      makeBlocker(
        "p7_evidence_resolver_missing",
        "P7 policy evidence identifiers are not bound to exact P3-P6 audit record IDs.",
        { goalEvidenceIds, axisSourceIds },
      ),
    ],
  };
}

export function validateOperationalAuthoringPackage({
  registration,
  manifest,
  sourceFiles,
  sourceBytesByPath,
  catalogs,
  sourcePolicies,
  capabilityRegistry,
  capabilityBytes,
  baselineManifest,
}) {
  validateOperationalReviewInputRegistration(registration);
  const capabilityIds = validateCapabilityRegistry(registration, capabilityRegistry, capabilityBytes);
  check(isObject(manifest), "operational authoring manifest is missing");
  check(manifest.schemaVersion === 1, "operational manifest schemaVersion must be 1");
  check(manifest.packageId === registration.packageId, "operational manifest packageId mismatch");
  check(manifest.packageVersion === registration.packageVersion, "operational manifest packageVersion mismatch");
  check(manifest.status === registration.status, "operational manifest status mismatch");
  check(manifest.runtimeEligible === false, "operational manifest runtimeEligible must remain false");
  check(sameStrings(manifest.activationRequires, EXPECTED_ACTIVATION_REQUIREMENTS), "operational activation requirements changed");
  check(manifest.boundaries?.runtimeChanged === false, "operational manifest must not claim runtime changes");
  check(manifest.boundaries?.designChanged === false, "operational manifest must not claim design changes");
  check(manifest.boundaries?.saveSchemaChanged === false, "operational manifest must not claim save-schema changes");
  check(manifest.boundaries?.medicalTruthAuthoredHere === false, "operational manifest must not author medical truth");
  check(manifest.boundaries?.existingThirtyCardPoolChanged === false, "operational manifest must preserve the 30-card pool");
  check(manifest.boundaries?.p5CatalogAuthoredHere === false, "operational manifest must not claim a P5 catalog");
  check(manifest.sources?.medicalActivationStatus === "blocked_pending_external_veterinary_review", "medical source must remain pending");
  check(manifest.sources?.medicalPackageId === "vetgeme-medical-production-authoring", "medical source package ID mismatch");
  check(manifest.sources?.medicalPackageVersion === "2026.07.16.39", "medical source package version mismatch");
  check(manifest.sources?.capabilityRegistryId === registration.capabilityRegistry.registryId, "manifest capability registry ID mismatch");
  check(manifest.sources?.capabilityRegistryVersion === registration.capabilityRegistry.registryVersion, "manifest capability registry version mismatch");
  check(isObject(manifest.counts), "operational manifest counts are missing");
  check(sameStrings(Object.keys(manifest.counts), Object.keys(EXPECTED_MANIFEST_COUNTS)), "operational manifest count fields mismatch");
  for (const [field, expected] of Object.entries(EXPECTED_MANIFEST_COUNTS)) {
    check(manifest.counts[field] === expected, `operational manifest count ${field} mismatch`);
  }

  checkArray(manifest.files, "operational manifest files");
  checkUnique(manifest.files, "operational manifest files");
  manifest.files.forEach((file) => checkSafePath(file, `manifest file ${file}`));
  const expectedSourceFiles = ["MANIFEST.json", ...manifest.files];
  check(expectedSourceFiles.length === 25, "operational manifest must describe exactly 25 source files including itself");
  check(sameStrings(sourceFiles, expectedSourceFiles), "operational manifest and source file set differ");
  check(sameStrings(Object.keys(catalogs), Object.keys(EXPECTED_GENERATED_CATALOGS)), "generated operational catalog file set mismatch");
  check(sameStrings(Object.keys(sourcePolicies), Object.keys(EXPECTED_SOURCE_POLICIES)), "operational source policy file set mismatch");
  for (const [relativePath, expectedId] of Object.entries(EXPECTED_GENERATED_CATALOGS)) {
    checkCatalogHeader(catalogs[relativePath], expectedId, relativePath);
  }
  for (const [relativePath, expectedId] of Object.entries(EXPECTED_SOURCE_POLICIES)) {
    checkCatalogHeader(sourcePolicies[relativePath], expectedId, relativePath);
  }

  const p3 = validateP3(catalogs, capabilityIds, registration);
  const p4 = validateP4(
    catalogs,
    capabilityIds,
    registration,
    sourcePolicies["source/p4-policy.json"],
  );
  const p6 = validateP6(catalogs, capabilityIds, registration);
  const p7 = validateP7(catalogs, registration);

  check(isObject(baselineManifest), "tier-01-v2 baseline manifest is missing");
  check(baselineManifest.caseCount === 30, "tier-01-v2 baseline must remain at 30 cases");
  checkArray(baselineManifest.cases, "tier-01-v2 baseline cases");
  check(baselineManifest.cases.length === 30, "tier-01-v2 baseline case list must remain at 30 cases");
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
  check(baselineCrosswalkMatches.length === 0, "operational review input contains an unapproved current 30-card crosswalk");

  const blockers = [
    makeBlocker(
      "activation_requirements_unsatisfied",
      "The package declares four external activation requirements and remains review-only.",
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
      productionPool: 0,
      capabilities: capabilityIds.size,
      p3: p3.audit,
      p4: p4.audit,
      p6: p6.audit,
      p7: p7.audit,
      baselineCases: baselineCaseIds.length,
      baselineCrosswalkMatches: baselineCrosswalkMatches.length,
    },
    baselineCaseIdCrosswalkMatches: baselineCrosswalkMatches,
    blockers,
  });
}

export async function loadOperationalAuthoringReviewInputFromReader(reader, registry, options = {}) {
  check(reader && typeof reader.readBytes === "function", "reader.readBytes is required");
  check(reader && typeof reader.listFiles === "function", "reader.listFiles is required");
  const registration = resolveOperationalAuthoringReviewInput(registry, options);
  const sourceRoot = joinPath(registration.root, registration.sourceRoot);
  const provenancePath = joinPath(registration.root, registration.provenancePath);
  const [provenanceBytes, sourceFiles, capabilityBytes, baselineManifestBytes] = await Promise.all([
    reader.readBytes(provenancePath),
    reader.listFiles(sourceRoot),
    reader.readBytes(registration.capabilityRegistry.path),
    reader.readBytes(BASELINE_MANIFEST_PATH),
  ]);
  check(sha256(provenanceBytes) === registration.sourceIntegrity.provenanceSha256, "provenance file SHA-256 mismatch");
  const provenance = parseJson(provenanceBytes, provenancePath);
  const sourceBytesByPath = new Map();
  await Promise.all(sourceFiles.map(async (relativePath) => {
    sourceBytesByPath.set(relativePath, await reader.readBytes(joinPath(sourceRoot, relativePath)));
  }));
  const sourceIntegrity = validateOperationalSourceProvenance(
    registration,
    provenance,
    sourceFiles,
    sourceBytesByPath,
  );
  const manifest = parseJson(sourceBytesByPath.get("MANIFEST.json"), registration.manifestPath);
  const catalogs = Object.fromEntries(Object.keys(EXPECTED_GENERATED_CATALOGS).map((relativePath) => [
    relativePath,
    parseJson(sourceBytesByPath.get(relativePath), relativePath),
  ]));
  const sourcePolicies = Object.fromEntries(Object.keys(EXPECTED_SOURCE_POLICIES).map((relativePath) => [
    relativePath,
    parseJson(sourceBytesByPath.get(relativePath), relativePath),
  ]));
  const capabilityRegistry = parseJson(capabilityBytes, registration.capabilityRegistry.path);
  const baselineManifest = parseJson(baselineManifestBytes, BASELINE_MANIFEST_PATH);
  const audit = validateOperationalAuthoringPackage({
    registration,
    manifest,
    sourceFiles,
    sourceBytesByPath,
    catalogs,
    sourcePolicies,
    capabilityRegistry,
    capabilityBytes,
    baselineManifest,
  });

  return deepFreeze({
    loadContext: OPERATIONAL_REVIEW_CONTEXT,
    reviewOnly: true,
    productionEligible: false,
    runtimeEligible: false,
    registration: clone(registration),
    manifest: clone(manifest),
    catalogs: clone(catalogs),
    sourcePolicies: clone(sourcePolicies),
    sourceIntegrity,
    capabilityRegistryIdentity: {
      registryId: capabilityRegistry.registryId,
      registryVersion: capabilityRegistry.registryVersion,
      sha256: registration.capabilityRegistry.sha256,
      count: capabilityRegistry.capabilities.length,
    },
    productionPool: Object.freeze([]),
    audit,
    blockers: clone(audit.blockers),
  });
}

export async function loadOperationalAuthoringReviewInput(projectRoot, options = {}) {
  const reader = createFileSystemReviewInputReader(projectRoot);
  const registry = parseJson(await reader.readBytes(REVIEW_INPUT_REGISTRY_PATH), REVIEW_INPUT_REGISTRY_PATH);
  return loadOperationalAuthoringReviewInputFromReader(reader, registry, options);
}
