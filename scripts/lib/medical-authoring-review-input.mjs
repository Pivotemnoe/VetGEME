import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const REVIEW_INPUT_REGISTRY_PATH = "content/review-inputs/registry.json";
export const DEFAULT_REVIEW_INPUT_ID = "vetgeme-medical-production-authoring";
export const DEFAULT_REVIEW_INPUT_VERSION = "2026.07.16.39";
export const REVIEW_CONTEXT = "review";
export const BLOCKED_STATUS = "blocked_pending_external_veterinary_review";
export const PENDING_VETERINARY_STATUS = "external_veterinary_review_pending";
export const AUTHOR_COMPLETE_STATUS = "author_complete";
export const SOURCE_CHECKED_STATUS = "source_checked";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const FORBIDDEN_GENERATED_MEDICAL_KEYS = new Set([
  "drug",
  "dose",
  "dosage",
  "doseMgKg",
  "fluidRate",
  "prescription",
  "treatmentProtocol",
  "transfusionRate",
]);
const CAPABILITY_ARRAY_FIELDS = ["requiredLocal", "external", "missingLocalRoute"];

function fail(message) {
  throw new Error(`Medical authoring review input validation failed: ${message}`);
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

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function isSafeRelativePath(value) {
  if (!isNonEmptyString(value) || value.startsWith("/") || value.includes("\\")) return false;
  return value.split("/").every((part) => part && part !== "." && part !== "..");
}

function checkSafePath(value, label) {
  check(isSafeRelativePath(value), `${label} must be a safe relative path`);
}

function checkInteger(value, label) {
  check(Number.isInteger(value) && value >= 0, `${label} must be a non-negative integer`);
}

function checkUnique(values, label) {
  check(new Set(values).size === values.length, `${label} contain duplicates`);
}

function checkStringArray(value, label, { allowEmpty = false } = {}) {
  check(Array.isArray(value), `${label} must be an array`);
  if (!allowEmpty) check(value.length > 0, `${label} must not be empty`);
  check(value.every(isNonEmptyString), `${label} contain an invalid string`);
  checkUnique(value, label);
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

function assertReviewState(review, label) {
  check(isObject(review), `${label}.review is missing`);
  check(review.authorStatus === AUTHOR_COMPLETE_STATUS, `${label} author status must be ${AUTHOR_COMPLETE_STATUS}`);
  check(review.sourceStatus === SOURCE_CHECKED_STATUS, `${label} source status must be ${SOURCE_CHECKED_STATUS}`);
  check(
    review.veterinaryReviewStatus === PENDING_VETERINARY_STATUS,
    `${label} veterinary status must remain ${PENDING_VETERINARY_STATUS}`,
  );
}

function findForbiddenKeys(value, location, found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${location}[${index}]`, found));
    return found;
  }
  if (!isObject(value)) return found;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_GENERATED_MEDICAL_KEYS.has(key)) found.push(`${location}.${key}`);
    if (/crosswalk|masterFamily|masterVariant|masterPresentation|caseId/iu.test(key)) {
      found.push(`${location}.${key}: forbidden crosswalk field`);
    }
    findForbiddenKeys(child, `${location}.${key}`, found);
  }
  return found;
}

export function validateReviewInputRegistration(registration) {
  check(isObject(registration), "review input registration must be an object");
  check(registration.reviewInputId === DEFAULT_REVIEW_INPUT_ID, "unexpected reviewInputId");
  check(registration.reviewInputVersion === DEFAULT_REVIEW_INPUT_VERSION, "unexpected reviewInputVersion");
  check(registration.kind === "medical_authoring", "review input kind must be medical_authoring");
  check(registration.packageId === DEFAULT_REVIEW_INPUT_ID, "packageId mismatch");
  check(registration.packageVersion === DEFAULT_REVIEW_INPUT_VERSION, "packageVersion mismatch");
  checkSafePath(registration.root, "root");
  check(registration.root.startsWith("content/review-inputs/"), "root must stay under content/review-inputs");
  checkSafePath(registration.sourceRoot, "sourceRoot");
  checkSafePath(registration.manifestPath, "manifestPath");
  checkSafePath(registration.provenancePath, "provenancePath");
  check(registration.manifestPath === joinPath(registration.sourceRoot, "MANIFEST.json"), "manifestPath must target source/MANIFEST.json");
  check(registration.status === BLOCKED_STATUS, `status must remain ${BLOCKED_STATUS}`);
  check(
    registration.veterinaryReviewStatus === PENDING_VETERINARY_STATUS,
    `veterinaryReviewStatus must remain ${PENDING_VETERINARY_STATUS}`,
  );
  check(registration.reviewOnly === true, "reviewOnly must be true");
  check(registration.productionEligible === false, "productionEligible must be false");
  check(registration.generatorEligible === false, "generatorEligible must be false");
  check(registration.allowCrosswalk === false, "allowCrosswalk must be false");

  check(isObject(registration.expectedCounts), "expectedCounts are required");
  for (const field of [
    "families",
    "variants",
    "presentations",
    "productionPool",
    "sourceFiles",
    "sourceBytes",
    "capabilities",
  ]) {
    checkInteger(registration.expectedCounts[field], `expectedCounts.${field}`);
  }
  check(registration.expectedCounts.productionPool === 0, "expected production pool must be 0");
  check(registration.expectedCounts.families === 39, "expected family count must be 39");
  check(registration.expectedCounts.variants === 215, "expected variant count must be 215");
  check(registration.expectedCounts.presentations === 645, "expected presentation count must be 645");
  check(registration.expectedCounts.capabilities === 447, "expected capability count must be 447");

  check(isObject(registration.sourceIntegrity), "sourceIntegrity is required");
  check(SHA256_PATTERN.test(registration.sourceIntegrity.provenanceSha256 || ""), "provenance SHA-256 is invalid");
  check(SHA256_PATTERN.test(registration.sourceIntegrity.aggregateSha256 || ""), "source aggregate SHA-256 is invalid");
  check(SHA256_PATTERN.test(registration.sourceIntegrity.archiveSha256 || ""), "archive SHA-256 is invalid");

  check(isObject(registration.capabilityRegistry), "capabilityRegistry is required");
  check(registration.capabilityRegistry.registryId === "vetgeme-clinic-capabilities", "capability registry ID mismatch");
  check(registration.capabilityRegistry.registryVersion === "2026.07.14.38", "capability registry version mismatch");
  checkSafePath(registration.capabilityRegistry.path, "capabilityRegistry.path");
  check(registration.capabilityRegistry.path.startsWith("content/system-packs/"), "capability registry must stay under content/system-packs");
  check(SHA256_PATTERN.test(registration.capabilityRegistry.sha256 || ""), "capability registry SHA-256 is invalid");
  return registration;
}

function validateCommonReviewInputRegistration(registration) {
  check(isObject(registration), "review input registration must be an object");
  check(isNonEmptyString(registration.reviewInputId), "reviewInputId is required");
  check(isNonEmptyString(registration.reviewInputVersion), "reviewInputVersion is required");
  check(isNonEmptyString(registration.kind), "review input kind is required");
  checkSafePath(registration.root, "root");
  check(registration.root.startsWith("content/review-inputs/"), "root must stay under content/review-inputs");
  check(isNonEmptyString(registration.status), "review input status is required");
  check(registration.reviewOnly === true, "reviewOnly must be true");
  check(registration.productionEligible === false, "productionEligible must be false");
  return registration;
}

export function validateReviewInputRegistry(registry) {
  check(isObject(registry), "review input registry must be an object");
  check(registry.schemaVersion === 1, "review input registry schemaVersion must be 1");
  check(registry.registryId === "vetgeme-review-input-registry", "review input registryId mismatch");
  check(isNonEmptyString(registry.registryVersion), "review input registryVersion is required");
  check(Array.isArray(registry.reviewInputs) && registry.reviewInputs.length > 0, "reviewInputs must be a non-empty array");
  const identities = [];
  const roots = [];
  for (const registration of registry.reviewInputs) {
    validateCommonReviewInputRegistration(registration);
    identities.push(`${registration.reviewInputId}@${registration.reviewInputVersion}`);
    roots.push(registration.root);
  }
  checkUnique(identities, "review input identities");
  checkUnique(roots, "review input roots");
  return registry.reviewInputs;
}

export function resolveMedicalAuthoringReviewInput(registry, options = {}) {
  const registrations = validateReviewInputRegistry(registry);
  check(Object.prototype.hasOwnProperty.call(options, "context"), "explicit review context is required");
  check(options.context === REVIEW_CONTEXT, `context ${String(options.context)} is forbidden; review is the only allowed context`);
  const reviewInputId = options.reviewInputId || DEFAULT_REVIEW_INPUT_ID;
  const reviewInputVersion = options.reviewInputVersion || DEFAULT_REVIEW_INPUT_VERSION;
  const registration = registrations.find((entry) => (
    entry.reviewInputId === reviewInputId && entry.reviewInputVersion === reviewInputVersion
  ));
  check(registration, `unknown review input ${reviewInputId}@${reviewInputVersion}`);
  return validateReviewInputRegistration(registration);
}

export function createFileSystemReviewInputReader(projectRoot) {
  const absoluteRoot = path.resolve(projectRoot);

  function resolveRelative(relativePath) {
    checkSafePath(relativePath, "requested path");
    const absolutePath = path.resolve(absoluteRoot, ...relativePath.split("/"));
    check(absolutePath.startsWith(`${absoluteRoot}${path.sep}`), `requested path escapes project root: ${relativePath}`);
    return absolutePath;
  }

  async function assertNoSymbolicLinkSegments(relativePath) {
    const absolutePath = resolveRelative(relativePath);
    const relativeFromRoot = path.relative(absoluteRoot, absolutePath);
    const segments = relativeFromRoot.split(path.sep).filter(Boolean);
    const pathsToCheck = [absoluteRoot];
    let current = absoluteRoot;
    for (const segment of segments) {
      current = path.join(current, segment);
      pathsToCheck.push(current);
    }
    for (const candidate of pathsToCheck) {
      const stats = await lstat(candidate);
      check(!stats.isSymbolicLink(), `${path.relative(absoluteRoot, candidate) || "."}: symbolic links are forbidden`);
    }
    return absolutePath;
  }

  async function listFiles(relativeRoot) {
    const files = [];
    async function visit(prefix) {
      const directory = await assertNoSymbolicLinkSegments(prefix);
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const relative = `${prefix}/${entry.name}`;
        check(!entry.isSymbolicLink(), `${relative}: symbolic links are forbidden`);
        if (entry.isDirectory()) await visit(relative);
        else if (entry.isFile()) files.push(relative.slice(`${relativeRoot}/`.length));
        else fail(`${relative}: unsupported filesystem entry`);
      }
    }
    await visit(relativeRoot);
    return files;
  }

  return Object.freeze({
    async readBytes(relativePath) {
      return readFile(await assertNoSymbolicLinkSegments(relativePath));
    },
    listFiles,
  });
}

export function validateSourceProvenance(registration, provenance, sourceFiles, sourceBytesByPath) {
  const identity = `${registration.reviewInputId}@${registration.reviewInputVersion}`;
  check(isObject(provenance), `${identity}: provenance is missing`);
  check(provenance.schemaVersion === 1, `${identity}: provenance schemaVersion must be 1`);
  check(provenance.provenanceId === "vetgeme-medical-production-authoring-review-source", `${identity}: provenanceId mismatch`);
  check(provenance.packageId === registration.packageId, `${identity}: provenance packageId mismatch`);
  check(provenance.packageVersion === registration.packageVersion, `${identity}: provenance packageVersion mismatch`);
  check(provenance.sourceArchive === "medical-production-authoring-2026.07.16.39.zip", `${identity}: source archive identity mismatch`);
  check(provenance.sourceDirectory === "medical-production-authoring", `${identity}: source directory identity mismatch`);
  check(isObject(provenance.archive), `${identity}: archive provenance is missing`);
  check(provenance.archive.path === provenance.sourceArchive, `${identity}: archive path mismatch`);
  check(
    provenance.archive.checksumPath === "medical-production-authoring-2026.07.16.39.zip.sha256",
    `${identity}: archive checksum path mismatch`,
  );
  check(provenance.archive.sha256 === registration.sourceIntegrity.archiveSha256, `${identity}: archive digest mismatch`);
  check(provenance.archive.zipEntryCount === 129, `${identity}: archive entry count mismatch`);
  check(provenance.archive.extractedFileCount === registration.expectedCounts.sourceFiles, `${identity}: archive file count mismatch`);
  check(provenance.archive.extractedBytes === registration.expectedCounts.sourceBytes, `${identity}: archive byte count mismatch`);
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
    check(!/crosswalk/iu.test(file.path), `${identity}: crosswalk artifact is forbidden (${file.path})`);
    check(file.originPath === `${provenance.sourceDirectory}/${file.path}`, `${identity}: originPath mismatch for ${file.path}`);
    checkInteger(file.bytes, `${identity}: ${file.path} bytes`);
    check(SHA256_PATTERN.test(file.sha256 || ""), `${identity}: ${file.path} SHA-256 is invalid`);
  }

  check(
    sourceFiles.length === listedPaths.length
      && sourceFiles.every((relativePath) => listedPaths.includes(relativePath)),
    `${identity}: source file set differs from provenance`,
  );

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
  return {
    sourceFilesVerified: provenance.files.length,
    sourceBytesVerified: verifiedBytes,
    aggregateSha256: provenance.aggregateSha256,
    archiveSha256: provenance.archive.sha256,
  };
}

function capabilityCheckFactory(capabilityIds, audit) {
  return (capabilityId, label, kind = "general") => {
    check(isNonEmptyString(capabilityId), `${label}: capability ID is missing`);
    check(capabilityIds.has(capabilityId), `${label}: unknown capability ${capabilityId}`);
    audit.capabilityReferences += 1;
    audit.uniqueCapabilityReferences.add(capabilityId);
    if (kind === "equipment") audit.equipment.capabilityReferences += 1;
  };
}

function validateCapabilityRegistry(registration, capabilityRegistry, capabilityBytes) {
  check(sha256(capabilityBytes) === registration.capabilityRegistry.sha256, "capability registry SHA-256 mismatch");
  check(isObject(capabilityRegistry), "capability registry is missing");
  check(capabilityRegistry.schemaVersion === 1, "capability registry schemaVersion must be 1");
  check(capabilityRegistry.registryId === registration.capabilityRegistry.registryId, "capability registry ID mismatch");
  check(capabilityRegistry.registryVersion === registration.capabilityRegistry.registryVersion, "capability registry version mismatch");
  check(Array.isArray(capabilityRegistry.capabilities), "capabilities must be an array");
  check(capabilityRegistry.capabilities.length === registration.expectedCounts.capabilities, "capability registry count mismatch");
  const ids = capabilityRegistry.capabilities.map((entry) => entry.id);
  check(ids.every(isNonEmptyString), "capability registry contains an invalid ID");
  checkUnique(ids, "capability IDs");
  return new Set(ids);
}

export function validateMedicalAuthoringPackage({
  registration,
  manifest,
  familiesByPath,
  sourceFiles,
  capabilityRegistry,
  capabilityBytes,
}) {
  validateReviewInputRegistration(registration);
  const capabilityIds = validateCapabilityRegistry(registration, capabilityRegistry, capabilityBytes);
  check(isObject(manifest), "authoring manifest is missing");
  check(manifest.schemaVersion === 1, "authoring manifest schemaVersion must be 1");
  check(manifest.packageId === registration.packageId, "authoring manifest packageId mismatch");
  check(manifest.packageVersion === registration.packageVersion, "authoring manifest packageVersion mismatch");
  check(manifest.activationStatus === registration.status, "authoring manifest activationStatus mismatch");
  check(manifest.generatorEligible === false, "authoring manifest must remain generator-ineligible");
  check(manifest.productionPoolSize === 0, "authoring manifest production pool must remain 0");
  check(manifest.familyTargetCount === registration.expectedCounts.families, "authoring manifest family target mismatch");
  check(manifest.variantTargetCount === registration.expectedCounts.variants, "authoring manifest variant target mismatch");
  check(manifest.presentationTargetCount === registration.expectedCounts.presentations, "authoring manifest presentation target mismatch");
  check(manifest.familiesAuthored === registration.expectedCounts.families, "authoring manifest authored family count mismatch");
  check(Array.isArray(manifest.families), "authoring manifest families must be an array");
  check(manifest.families.length === registration.expectedCounts.families, "authoring manifest family entry count mismatch");

  const familyIds = manifest.families.map((entry) => entry.familyId);
  const familyPaths = manifest.families.map((entry) => entry.path);
  checkUnique(familyIds, "authoring manifest family IDs");
  checkUnique(familyPaths, "authoring manifest family paths");
  for (const familyPath of familyPaths) {
    checkSafePath(familyPath, `family path ${familyPath}`);
    check(/^families\/[^/]+\/family\.production\.json$/u.test(familyPath), `unexpected family path ${familyPath}`);
  }
  const onDiskFamilyPaths = sourceFiles
    .filter((file) => /^families\/[^/]+\/family\.production\.json$/u.test(file))
    .sort();
  check(
    JSON.stringify([...familyPaths].sort()) === JSON.stringify(onDiskFamilyPaths),
    "manifest family paths and source family files differ",
  );
  const expectedReviewPaths = familyPaths
    .map((familyPath) => `review/${path.posix.basename(path.posix.dirname(familyPath))}-source-review.md`)
    .sort();
  const sourceReviewPaths = sourceFiles.filter((file) => /^review\/.*-source-review\.md$/u.test(file)).sort();
  check(JSON.stringify(sourceReviewPaths) === JSON.stringify(expectedReviewPaths), "source-review files do not match manifest families");
  check(sourceFiles.every((file) => !/crosswalk/iu.test(file)), "crosswalk artifact is forbidden");

  const audit = {
    families: 0,
    variants: 0,
    presentations: 0,
    generatorEligibleRecords: 0,
    sourceRecords: 0,
    planBundles: 0,
    researchMappings: 0,
    investigations: 0,
    criticalFacts: 0,
    capabilityReferences: 0,
    uniqueCapabilityReferences: new Set(),
    requirementGroups: 0,
    requirementOptions: 0,
    equipment: {
      requiredLocal: 0,
      external: 0,
      missingLocalRoute: 0,
      conditionalRequirementReferences: 0,
      referralFallbacks: 0,
      capabilityReferences: 0,
    },
    safeRoutes: {
      familyDeclarations: 0,
      explicitPresentationRoutes: 0,
      presentationsCovered: 0,
    },
  };
  const checkCapability = capabilityCheckFactory(capabilityIds, audit);

  for (const manifestFamily of manifest.families) {
    const family = familiesByPath.get(manifestFamily.path);
    const familyLabel = manifestFamily.familyId;
    check(family, `${familyLabel}: family file is missing`);
    check(family.schemaVersion === 1, `${familyLabel}: schemaVersion must be 1`);
    check(family.familyId === manifestFamily.familyId, `${familyLabel}: manifest familyId mismatch`);
    check(isNonEmptyString(family.familyVersion), `${familyLabel}: familyVersion is missing`);
    check(family.familyVersion === manifestFamily.familyVersion, `${familyLabel}: manifest familyVersion mismatch`);
    assertReviewState(family.review, familyLabel);
    check(manifestFamily.authorStatus === AUTHOR_COMPLETE_STATUS, `${familyLabel}: manifest author status mismatch`);
    check(manifestFamily.sourceStatus === SOURCE_CHECKED_STATUS, `${familyLabel}: manifest source status mismatch`);
    check(manifestFamily.veterinaryReviewStatus === PENDING_VETERINARY_STATUS, `${familyLabel}: manifest veterinary status mismatch`);
    check(manifestFamily.generatorEligible === false, `${familyLabel}: manifest family must remain generator-ineligible`);
    check(family.generatorEligible === false, `${familyLabel}: family must remain generator-ineligible`);
    audit.families += 1;

    checkStringArray(family.coreCapabilities, `${familyLabel}.coreCapabilities`);
    for (const capabilityId of family.coreCapabilities) checkCapability(capabilityId, `${familyLabel}.coreCapabilities`);
    checkCapability(family.safeRouteCapability, `${familyLabel}.safeRouteCapability`);
    audit.safeRoutes.familyDeclarations += 1;

    check(isNonEmptyArray(family.planBundles), `${familyLabel}: plan bundles are missing`);
    check(isNonEmptyArray(family.sourceCatalog), `${familyLabel}: source catalog is missing`);
    check(isNonEmptyArray(family.researchCapabilityMap), `${familyLabel}: research capability map is missing`);
    check(isNonEmptyArray(family.commonHistoryQuestions), `${familyLabel}: common history questions are missing`);
    check(isNonEmptyArray(family.commonExamActions), `${familyLabel}: common exam actions are missing`);
    check(isNonEmptyArray(family.familyValidationRules), `${familyLabel}: family validation rules are missing`);
    check(isNonEmptyArray(family.variants), `${familyLabel}: variants are missing`);

    const planIds = family.planBundles.map((plan) => plan.id);
    const sourceIds = family.sourceCatalog.map((source) => source.id);
    const sourceUrls = family.sourceCatalog.map((source) => source.url);
    const researchIds = family.researchCapabilityMap.map((research) => research.researchId);
    const requirementGroups = new Map((family.requirementGroups || []).map((group) => [group.id, group]));
    const discoveryIds = new Set([
      ...family.commonHistoryQuestions.map((question) => question.id),
      ...family.commonExamActions.map((action) => action.id),
    ]);
    checkUnique(planIds, `${familyLabel}: plan bundle IDs`);
    checkUnique(sourceIds, `${familyLabel}: source IDs`);
    checkUnique(sourceUrls, `${familyLabel}: source URLs`);
    checkUnique(researchIds, `${familyLabel}: research IDs`);
    check(requirementGroups.size === (family.requirementGroups || []).length, `${familyLabel}: requirement group IDs contain duplicates`);
    audit.planBundles += family.planBundles.length;
    audit.sourceRecords += family.sourceCatalog.length;
    audit.researchMappings += family.researchCapabilityMap.length;
    audit.requirementGroups += requirementGroups.size;

    for (const source of family.sourceCatalog) {
      check(isNonEmptyString(source.title), `${familyLabel}/${source.id}: source title is missing`);
      check(/^https:\/\//u.test(source.url || ""), `${familyLabel}/${source.id}: source URL must use HTTPS`);
      check(isNonEmptyString(source.scope) || isNonEmptyArray(source.supports), `${familyLabel}/${source.id}: source scope/support mapping is missing`);
    }
    for (const [groupId, group] of requirementGroups) {
      checkStringArray(group.anyOf, `${familyLabel}/${groupId}.anyOf`);
      audit.requirementOptions += group.anyOf.length;
      for (const capabilityId of group.anyOf) checkCapability(capabilityId, `${familyLabel}/${groupId}`);
    }
    for (const plan of family.planBundles) {
      check(isNonEmptyString(plan.id), `${familyLabel}: plan bundle ID is missing`);
      for (const field of ["fullPlan", "stagedPlan", "minimumSafePlan", "stabilizeAndRefer", "unsafeOrInadequate"]) {
        check(isNonEmptyArray(plan[field]), `${familyLabel}/${plan.id}: ${field} is missing`);
      }
    }
    for (const research of family.researchCapabilityMap) {
      check(isNonEmptyString(research.researchId), `${familyLabel}: researchId is missing`);
      checkStringArray(research.requires, `${familyLabel}/${research.researchId}.requires`);
      for (const capabilityId of research.requires) checkCapability(capabilityId, `${familyLabel}/${research.researchId}`);
      if (research.fallback !== undefined) checkCapability(research.fallback, `${familyLabel}/${research.researchId}.fallback`);
    }
    for (const action of family.commonExamActions) {
      check(isNonEmptyString(action.id), `${familyLabel}: common exam action ID is missing`);
      checkStringArray(action.requires, `${familyLabel}/${action.id}.requires`, { allowEmpty: true });
      for (const capabilityId of action.requires) checkCapability(capabilityId, `${familyLabel}/${action.id}`);
    }

    const variantIds = family.variants.map((variant) => variant.id);
    checkUnique(variantIds, `${familyLabel}: variant IDs`);
    check(family.variants.length === manifestFamily.variantCount, `${familyLabel}: manifest variant count mismatch`);
    let familyPresentations = 0;

    for (const variant of family.variants) {
      const variantLabel = `${familyLabel}/${variant.id}`;
      check(isNonEmptyString(variant.id), `${variantLabel}: variant ID is missing`);
      check(isNonEmptyString(variant.version), `${variantLabel}: version is missing`);
      assertReviewState(variant.review, variantLabel);
      check(variant.generatorEligible === false, `${variantLabel}: variant must remain generator-ineligible`);
      check(isNonEmptyString(variant.diagnosticTruth), `${variantLabel}: diagnostic truth is missing`);
      checkStringArray(variant.allowedSpecies, `${variantLabel}.allowedSpecies`);
      checkStringArray(variant.sourceIds, `${variantLabel}.sourceIds`);
      check(
        (isNonEmptyString(variant.primaryDiagnosisId) && isNonEmptyArray(variant.differentials)) || isNonEmptyArray(variant.exclusions),
        `${variantLabel}: diagnostic catalog truth or explicit exclusions are required`,
      );
      check(planIds.includes(variant.planBundleId), `${variantLabel}: unknown plan bundle ${variant.planBundleId}`);
      for (const sourceId of variant.sourceIds) check(sourceIds.includes(sourceId), `${variantLabel}: unknown source ${sourceId}`);
      check(Array.isArray(variant.presentations), `${variantLabel}: presentations must be an array`);
      check(variant.presentations.length === 3, `${variantLabel}: exactly three presentations are required`);
      const presentationIds = variant.presentations.map((presentation) => presentation.id);
      checkUnique(presentationIds, `${variantLabel}: presentation IDs`);
      audit.variants += 1;

      for (const presentation of variant.presentations) {
        const presentationLabel = `${variantLabel}/${presentation.id}`;
        check(isNonEmptyString(presentation.id), `${presentationLabel}: presentation ID is missing`);
        check(isNonEmptyString(presentation.version), `${presentationLabel}: version is missing`);
        assertReviewState(presentation.review, presentationLabel);
        check(presentation.generatorEligible === false, `${presentationLabel}: presentation must remain generator-ineligible`);
        for (const field of [
          "species",
          "ageBands",
          "campaignAvailability",
          "urgency",
          "workload",
          "complaint",
          "historyAnswers",
          "examFindings",
          "criticalFacts",
          "investigations",
          "dataSufficiency",
          "equipment",
          "carePlanId",
          "followUp",
          "outcomes",
          "ownerCommunication",
          "compatibility",
        ]) {
          check(presentation[field] !== undefined && presentation[field] !== null, `${presentationLabel}: ${field} is missing`);
        }
        checkStringArray(presentation.species, `${presentationLabel}.species`);
        checkStringArray(presentation.ageBands, `${presentationLabel}.ageBands`);
        check(isObject(presentation.campaignAvailability) && Object.keys(presentation.campaignAvailability).length > 0, `${presentationLabel}: campaign availability is missing`);
        check(typeof presentation.workload === "number" && presentation.workload > 0, `${presentationLabel}: workload must be positive`);
        check(isNonEmptyString(presentation.complaint), `${presentationLabel}: complaint is missing`);
        check(isObject(presentation.historyAnswers) && Object.keys(presentation.historyAnswers).length > 0, `${presentationLabel}: history answers are missing`);
        check(isNonEmptyArray(presentation.examFindings), `${presentationLabel}: exam findings are missing`);
        check(isNonEmptyArray(presentation.criticalFacts), `${presentationLabel}: critical facts are missing`);
        check(isNonEmptyArray(presentation.investigations), `${presentationLabel}: investigations are missing`);
        check(isNonEmptyArray(presentation.ownerCommunication), `${presentationLabel}: owner communication is missing`);
        check(isObject(presentation.followUp) && Object.keys(presentation.followUp).length > 0, `${presentationLabel}: follow-up is missing`);
        check(isObject(presentation.outcomes) && Object.keys(presentation.outcomes).length > 0, `${presentationLabel}: outcomes are missing`);
        check(isObject(presentation.compatibility) && Object.keys(presentation.compatibility).length > 0, `${presentationLabel}: compatibility is missing`);
        check(isNonEmptyArray(presentation.dataSufficiency?.safePlanRequires), `${presentationLabel}: safe-plan criteria are missing`);
        check(isNonEmptyArray(presentation.dataSufficiency?.confirmedDiagnosisRequires), `${presentationLabel}: confirmation criteria are missing`);
        check(planIds.includes(presentation.carePlanId), `${presentationLabel}: unknown care plan ${presentation.carePlanId}`);

        for (const finding of presentation.examFindings) {
          check(isNonEmptyString(finding.factId), `${presentationLabel}: exam finding factId is missing`);
          check(isNonEmptyString(finding.source), `${presentationLabel}/${finding.factId}: exam finding source is missing`);
          check(isNonEmptyString(finding.finding), `${presentationLabel}/${finding.factId}: exam finding text is missing`);
        }
        const factIds = presentation.criticalFacts.map((fact) => fact.factId);
        checkUnique(factIds, `${presentationLabel}: critical fact IDs`);
        audit.criticalFacts += presentation.criticalFacts.length;
        for (const fact of presentation.criticalFacts) {
          check(isNonEmptyArray(fact.discoveryPaths), `${presentationLabel}/${fact.factId}: discovery paths are missing`);
          for (const discoveryPath of fact.discoveryPaths) {
            check(discoveryIds.has(discoveryPath), `${presentationLabel}/${fact.factId}: unknown discovery path ${discoveryPath}`);
          }
        }
        audit.investigations += presentation.investigations.length;
        for (const investigation of presentation.investigations) {
          check(researchIds.includes(investigation.id), `${presentationLabel}: unmapped investigation ${investigation.id}`);
          check(isNonEmptyString(investigation.classification), `${presentationLabel}/${investigation.id}: classification is missing`);
          check(Object.prototype.hasOwnProperty.call(investigation, "result"), `${presentationLabel}/${investigation.id}: authored result state is missing`);
        }

        check(isObject(presentation.equipment), `${presentationLabel}: equipment contract is missing`);
        let explicitSafeRoute = false;
        for (const field of CAPABILITY_ARRAY_FIELDS) {
          const references = presentation.equipment[field] || [];
          checkStringArray(references, `${presentationLabel}.equipment.${field}`, { allowEmpty: true });
          audit.equipment[field] += references.length;
          if (field === "missingLocalRoute" && references.length > 0) explicitSafeRoute = true;
          for (const capabilityId of references) checkCapability(capabilityId, `${presentationLabel}.equipment.${field}`, "equipment");
        }
        const conditional = presentation.equipment.conditional || [];
        checkStringArray(conditional, `${presentationLabel}.equipment.conditional`, { allowEmpty: true });
        audit.equipment.conditionalRequirementReferences += conditional.length;
        for (const groupId of conditional) {
          check(requirementGroups.has(groupId), `${presentationLabel}: unknown conditional requirement group ${groupId}`);
        }
        if (presentation.equipment.referralFallback !== undefined) {
          checkCapability(presentation.equipment.referralFallback, `${presentationLabel}.equipment.referralFallback`, "equipment");
          audit.equipment.referralFallbacks += 1;
          explicitSafeRoute = true;
        }
        check(
          explicitSafeRoute || isNonEmptyString(family.safeRouteCapability),
          `${presentationLabel}: no presentation or family safe route`,
        );
        if (explicitSafeRoute) audit.safeRoutes.explicitPresentationRoutes += 1;
        audit.safeRoutes.presentationsCovered += 1;
        audit.presentations += 1;
        familyPresentations += 1;
      }
    }

    check(familyPresentations === manifestFamily.presentationCount, `${familyLabel}: manifest presentation count mismatch`);
    const forbidden = findForbiddenKeys(family, familyLabel);
    check(forbidden.length === 0, forbidden[0] || `${familyLabel}: forbidden medical or crosswalk field`);
  }

  check(audit.families === registration.expectedCounts.families, "validated family count mismatch");
  check(audit.variants === registration.expectedCounts.variants, "validated variant count mismatch");
  check(audit.presentations === registration.expectedCounts.presentations, "validated presentation count mismatch");
  check(audit.generatorEligibleRecords === registration.expectedCounts.productionPool, "production pool must remain 0");
  check(audit.safeRoutes.familyDeclarations === audit.families, "every family must declare a safe route capability");
  check(audit.safeRoutes.presentationsCovered === audit.presentations, "every presentation must have a safe route");

  return deepFreeze({
    families: audit.families,
    variants: audit.variants,
    presentations: audit.presentations,
    productionPool: audit.generatorEligibleRecords,
    sourceRecords: audit.sourceRecords,
    planBundles: audit.planBundles,
    researchMappings: audit.researchMappings,
    investigations: audit.investigations,
    criticalFacts: audit.criticalFacts,
    capabilityRegistryEntries: capabilityIds.size,
    capabilityReferences: audit.capabilityReferences,
    uniqueCapabilityReferences: audit.uniqueCapabilityReferences.size,
    requirementGroups: audit.requirementGroups,
    requirementOptions: audit.requirementOptions,
    equipment: audit.equipment,
    safeRoutes: audit.safeRoutes,
  });
}

export async function loadMedicalAuthoringReviewInputFromReader(reader, registry, options = {}) {
  check(reader && typeof reader.readBytes === "function", "reader.readBytes is required");
  check(reader && typeof reader.listFiles === "function", "reader.listFiles is required");
  const registration = resolveMedicalAuthoringReviewInput(registry, options);
  const sourceRoot = joinPath(registration.root, registration.sourceRoot);
  const provenancePath = joinPath(registration.root, registration.provenancePath);
  const [provenanceBytes, sourceFiles, capabilityBytes] = await Promise.all([
    reader.readBytes(provenancePath),
    reader.listFiles(sourceRoot),
    reader.readBytes(registration.capabilityRegistry.path),
  ]);
  check(sha256(provenanceBytes) === registration.sourceIntegrity.provenanceSha256, "provenance file SHA-256 mismatch");
  const provenance = parseJson(provenanceBytes, provenancePath);
  const sourceBytesByPath = new Map();
  await Promise.all(sourceFiles.map(async (relativePath) => {
    sourceBytesByPath.set(relativePath, await reader.readBytes(joinPath(sourceRoot, relativePath)));
  }));
  const sourceIntegrity = validateSourceProvenance(registration, provenance, sourceFiles, sourceBytesByPath);
  const manifestRelativePath = registration.manifestPath.slice(`${registration.sourceRoot}/`.length);
  const manifest = parseJson(sourceBytesByPath.get(manifestRelativePath), registration.manifestPath);
  const familiesByPath = new Map();
  for (const manifestFamily of manifest.families || []) {
    if (!isSafeRelativePath(manifestFamily.path)) continue;
    const bytes = sourceBytesByPath.get(manifestFamily.path);
    if (bytes !== undefined) familiesByPath.set(manifestFamily.path, parseJson(bytes, manifestFamily.path));
  }
  const capabilityRegistry = parseJson(capabilityBytes, registration.capabilityRegistry.path);
  const audit = validateMedicalAuthoringPackage({
    registration,
    manifest,
    familiesByPath,
    sourceFiles,
    capabilityRegistry,
    capabilityBytes,
  });

  return deepFreeze({
    loadContext: REVIEW_CONTEXT,
    reviewOnly: true,
    productionEligible: false,
    generatorEligible: false,
    allowCrosswalk: false,
    registration: clone(registration),
    manifest: clone(manifest),
    families: manifest.families.map((entry) => clone(familiesByPath.get(entry.path))),
    productionPool: Object.freeze([]),
    sourceIntegrity: deepFreeze(sourceIntegrity),
    audit,
  });
}

export async function loadMedicalAuthoringReviewInput(projectRoot, options = {}) {
  const reader = createFileSystemReviewInputReader(projectRoot);
  const registry = parseJson(await reader.readBytes(REVIEW_INPUT_REGISTRY_PATH), REVIEW_INPUT_REGISTRY_PATH);
  return loadMedicalAuthoringReviewInputFromReader(reader, registry, options);
}
