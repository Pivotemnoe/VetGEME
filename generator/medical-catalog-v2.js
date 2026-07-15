(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_MEDICAL_CATALOG_V2 = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DEFAULT_MEDICAL_CATALOG_ID = "vetgeme-medical-family-registry";
  const DEFAULT_MEDICAL_CATALOG_VERSION = "2026.07.14.3";
  const MEDICAL_NAMESPACE = "vetgeme-master-medical";
  const COMPATIBILITY_NAMESPACE = "tier-01-v2-compat";
  const REVIEW_FAMILY_STATUS = "source_checked_pending_veterinary_review";
  const REVIEW_CATALOG_STATUS = "all_families_authored_pending_veterinary_review";
  const REVIEW_PACKAGE_STATUS = "handoff_ready_medical_activation_requires_veterinary_approval";
  const APPROVED_STATUS = "approved";
  const KNOWN_CATALOG_STATUSES = new Set([
    REVIEW_CATALOG_STATUS,
    APPROVED_STATUS
  ]);
  const KNOWN_PACKAGE_STATUSES = new Set([
    REVIEW_PACKAGE_STATUS,
    APPROVED_STATUS
  ]);
  const KNOWN_FAMILY_STATUSES = new Set([
    REVIEW_FAMILY_STATUS,
    APPROVED_STATUS,
    "retired"
  ]);
  const KNOWN_VARIANT_STATUSES = new Set([
    "planned",
    "authored",
    "source_checked",
    "pending_veterinary_review",
    APPROVED_STATUS,
    "retired"
  ]);
  const LOAD_CONTEXTS = new Set(["review", "production"]);
  const PRODUCTION_ATTESTATIONS = new WeakMap();
  const PRIMARY_FACT_SOURCES = Object.freeze([
    "initial_complaint",
    "owner_history",
    "physical_exam",
    "measurement",
    "diagnostic_test",
    "doctor_interpretation",
    "follow_up"
  ]);
  const PRIMARY_FACT_SOURCE_SET = new Set(PRIMARY_FACT_SOURCES);
  const LEGACY_METADATA_SOURCE = "plan_steps";

  function assert(condition, message) {
    if (!condition) throw new Error(`Medical catalog validation failed: ${message}`);
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== "object" || seen.has(value)) return value;
    seen.add(value);
    for (const nested of Object.values(value)) deepFreeze(nested, seen);
    return Object.freeze(value);
  }

  function isApprovedEligibleEntity(value) {
    return value
      && value.status === APPROVED_STATUS
      && value.generatorEligible === true
      && isNonEmptyString(value.version);
  }

  function buildProductionCandidateProjection(normalizedFamilies) {
    assert(Array.isArray(normalizedFamilies), "production projection families must be an array");
    const families = [];
    const variants = [];
    const presentations = [];

    for (const family of normalizedFamilies) {
      if (!isApprovedEligibleEntity(family)) continue;
      const eligibleVariants = [];
      for (const variant of family.variants || []) {
        if (!isApprovedEligibleEntity(variant)) continue;
        const eligiblePresentations = (variant.presentations || [])
          .filter(isApprovedEligibleEntity)
          .map((presentation) => clone(presentation));
        if (eligiblePresentations.length === 0) continue;
        const variantProjection = {
          ...clone(variant),
          presentations: eligiblePresentations
        };
        eligibleVariants.push(variantProjection);
        variants.push(variantProjection);
        presentations.push(...eligiblePresentations);
      }
      if (eligibleVariants.length === 0) continue;
      families.push({
        ...clone(family),
        variants: eligibleVariants
      });
    }

    return deepFreeze({ families, variants, presentations });
  }

  function joinPath(...parts) {
    return parts.map((part, index) => {
      const value = String(part);
      if (index === 0) return value.replace(/\/$/u, "");
      return value.replace(/^\//u, "").replace(/\/$/u, "");
    }).filter(Boolean).join("/");
  }

  function isSafeRelativePath(value) {
    if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\")) return false;
    const parts = value.split("/");
    return parts.every((part) => part && part !== "." && part !== "..");
  }

  function assertId(value, label) {
    assert(typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(value), `${label} is invalid`);
  }

  function assertStringArray(value, label, { nonEmpty = true, unique = true } = {}) {
    assert(Array.isArray(value), `${label} must be an array`);
    if (nonEmpty) assert(value.length > 0, `${label} must be non-empty`);
    assert(value.every((item) => typeof item === "string" && item.length > 0), `${label} contains an invalid value`);
    if (unique) assert(new Set(value).size === value.length, `${label} contains duplicates`);
  }

  function assertCount(value, expected, label) {
    assert(Number.isInteger(value) && value >= 0, `${label} must be a non-negative integer`);
    assert(value === expected, `${label} is ${value}, expected ${expected}`);
  }

  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  async function sha256Hex(value) {
    if (typeof require === "function") {
      const crypto = require("node:crypto");
      return crypto.createHash("sha256").update(value).digest("hex");
    }
    const subtle = globalThis.crypto?.subtle;
    assert(subtle && typeof subtle.digest === "function", "SHA-256 runtime is unavailable");
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function familyKey(familyId, familyVersion) {
    return `${MEDICAL_NAMESPACE}/family/${familyId}@${familyVersion}`;
  }

  function variantKey(familyId, familyVersion, variantId) {
    return `${familyKey(familyId, familyVersion)}/variant/${variantId}`;
  }

  function presentationKey(familyId, familyVersion, variantId, presentationId) {
    return `${variantKey(familyId, familyVersion, variantId)}/presentation/${presentationId}`;
  }

  function compatibilityCaseRef(family, caseId) {
    return `${COMPATIBILITY_NAMESPACE}/family/${family}/case/${caseId}`;
  }

  function compatibilityComplaintRef(family, caseId, complaintId) {
    return `${compatibilityCaseRef(family, caseId)}/complaint/${complaintId}`;
  }

  function validateMedicalRegistration(registration) {
    assert(registration && typeof registration === "object" && !Array.isArray(registration), "medical registration must be an object");
    assertId(registration.medicalCatalogId, "medicalCatalogId");
    assert(typeof registration.medicalCatalogVersion === "string" && registration.medicalCatalogVersion.length > 0, `${registration.medicalCatalogId}: medicalCatalogVersion is required`);
    assertId(registration.packageId, `${registration.medicalCatalogId}: packageId`);
    assert(typeof registration.packageVersion === "string" && registration.packageVersion.length > 0, `${registration.medicalCatalogId}: packageVersion is required`);
    assert(isSafeRelativePath(registration.root) && registration.root.startsWith("content/medical-packs/"), `${registration.medicalCatalogId}: invalid root`);
    for (const field of ["manifestPath", "familyRegistryPath", "provenancePath", "compatibilityPath"]) {
      assert(isSafeRelativePath(registration[field]), `${registration.medicalCatalogId}: invalid ${field}`);
    }
    assert(/^[a-f0-9]{64}$/u.test(registration.sourceDigest || ""), `${registration.medicalCatalogId}: sourceDigest must be SHA-256`);
    assert(KNOWN_CATALOG_STATUSES.has(registration.status), `${registration.medicalCatalogId}: unknown status ${registration.status || "missing"}`);
    assert(KNOWN_PACKAGE_STATUSES.has(registration.packageStatus), `${registration.medicalCatalogId}: unknown packageStatus ${registration.packageStatus || "missing"}`);
    if (registration.familyStatus !== undefined) {
      assert(KNOWN_FAMILY_STATUSES.has(registration.familyStatus), `${registration.medicalCatalogId}: unknown legacy familyStatus ${registration.familyStatus || "missing"}`);
    }
    assert(registration.expectedCounts && typeof registration.expectedCounts === "object", `${registration.medicalCatalogId}: expectedCounts are required`);
    for (const field of ["families", "variants", "presentations", "generatorEligibleFamilies", "sourceFiles"]) {
      assert(Number.isInteger(registration.expectedCounts[field]) && registration.expectedCounts[field] >= 0, `${registration.medicalCatalogId}: expectedCounts.${field} is invalid`);
    }
    assert(registration.reviewPolicy && typeof registration.reviewPolicy === "object", `${registration.medicalCatalogId}: reviewPolicy is required`);
    assert(typeof registration.reviewPolicy.reviewModeAllowed === "boolean", `${registration.medicalCatalogId}: reviewModeAllowed must be boolean`);
    assert(typeof registration.reviewPolicy.productionEligible === "boolean", `${registration.medicalCatalogId}: productionEligible must be boolean`);
    assertStringArray(registration.allowedModes, `${registration.medicalCatalogId}: allowedModes`);
    const catalogApproved = registration.status === APPROVED_STATUS;
    const packageApproved = registration.packageStatus === APPROVED_STATUS;
    assert(catalogApproved === packageApproved, `${registration.medicalCatalogId}: catalog and package approval statuses contradict each other`);
    if (!packageApproved) {
      assert(registration.reviewPolicy.productionEligible === false, `${registration.medicalCatalogId}: blocked package cannot be production eligible`);
      assert(registration.expectedCounts.generatorEligibleFamilies === 0, `${registration.medicalCatalogId}: blocked package cannot register generator-eligible families`);
    }
    if (registration.reviewPolicy.productionEligible) {
      assert(registration.status === APPROVED_STATUS, `${registration.medicalCatalogId}: production catalog status must be approved`);
      assert(registration.packageStatus === APPROVED_STATUS, `${registration.medicalCatalogId}: production package status must be approved`);
    }
    return registration;
  }

  function validateMedicalRegistrations(registry) {
    assert(Array.isArray(registry?.medicalCatalogs) && registry.medicalCatalogs.length > 0, "medicalCatalogs must be a non-empty array");
    const ids = new Set();
    const identities = new Set();
    const roots = new Set();
    for (const registration of registry.medicalCatalogs) {
      validateMedicalRegistration(registration);
      const identity = `${registration.medicalCatalogId}@${registration.medicalCatalogVersion}`;
      assert(!ids.has(registration.medicalCatalogId), `duplicate medicalCatalogId ${registration.medicalCatalogId}`);
      ids.add(registration.medicalCatalogId);
      assert(!identities.has(identity), `duplicate medical catalog identity ${identity}`);
      identities.add(identity);
      assert(!roots.has(registration.root), `duplicate medical catalog root ${registration.root}`);
      roots.add(registration.root);
    }
    return registry.medicalCatalogs;
  }

  function resolveRegisteredMedicalCatalog(registry, options = {}) {
    const registrations = validateMedicalRegistrations(registry);
    const catalogId = options.medicalCatalogId || DEFAULT_MEDICAL_CATALOG_ID;
    const catalogVersion = options.medicalCatalogVersion || DEFAULT_MEDICAL_CATALOG_VERSION;
    const mode = options.mode || "tier-01-v2";
    const context = options.context || "production";
    assert(LOAD_CONTEXTS.has(context), `unknown load context ${context}`);
    const matchesId = registrations.filter((entry) => entry.medicalCatalogId === catalogId);
    assert(matchesId.length === 1, `unknown medicalCatalogId ${catalogId}`);
    const registration = matchesId.find((entry) => entry.medicalCatalogVersion === catalogVersion);
    assert(registration, `unknown medical catalog version ${catalogId}@${catalogVersion}`);
    assert(registration.allowedModes.includes(mode), `${catalogId}@${catalogVersion}: mode ${mode} is not allowed`);
    if (context === "review") {
      assert(registration.reviewPolicy.reviewModeAllowed, `${catalogId}@${catalogVersion}: review loading is disabled`);
    } else {
      assert(registration.reviewPolicy.productionEligible, `${catalogId}@${catalogVersion}: production loading is disabled`);
      assert(registration.status === APPROVED_STATUS, `${catalogId}@${catalogVersion}: production status is not approved`);
      assert(registration.packageStatus === APPROVED_STATUS, `${catalogId}@${catalogVersion}: production package status is not approved`);
    }
    return registration;
  }

  function validatePackageManifest(registration, manifest) {
    const identity = `${registration.medicalCatalogId}@${registration.medicalCatalogVersion}`;
    assert(manifest && typeof manifest === "object" && !Array.isArray(manifest), `${identity}: package manifest is missing`);
    assert(manifest.packageId === registration.packageId, `${identity}: packageId mismatch`);
    assert(manifest.packageVersion === registration.packageVersion, `${identity}: packageVersion mismatch`);
    assert(KNOWN_PACKAGE_STATUSES.has(manifest.status), `${identity}: unknown package manifest status ${manifest.status || "missing"}`);
    assert(manifest.status === registration.packageStatus, `${identity}: package status mismatch`);
    assert(manifest.medical && typeof manifest.medical === "object", `${identity}: medical manifest section is missing`);
    assertCount(manifest.medical.familyCount, registration.expectedCounts.families, `${identity}: familyCount`);
    assertCount(manifest.medical.variantCount, registration.expectedCounts.variants, `${identity}: variantCount`);
    assertCount(manifest.medical.presentationCount, registration.expectedCounts.presentations, `${identity}: presentationCount`);
    assertCount(manifest.medical.generatorEligibleFamilies, registration.expectedCounts.generatorEligibleFamilies, `${identity}: generatorEligibleFamilies`);
    if (manifest.medical.familyStatus !== undefined) {
      assert(KNOWN_FAMILY_STATUSES.has(manifest.medical.familyStatus), `${identity}: unknown legacy manifest familyStatus ${manifest.medical.familyStatus || "missing"}`);
    }
    assert(
      manifest.medical.familyStatus === registration.familyStatus,
      `${identity}: legacy registration/manifest familyStatus mismatch`
    );
    assert(manifest.medical.registry === registration.familyRegistryPath.replace(/^medical\//u, "medical/"), `${identity}: family registry path mismatch`);
    assert(Array.isArray(manifest.activationRules) && manifest.activationRules.length > 0, `${identity}: activationRules are missing`);
    if (manifest.status !== APPROVED_STATUS) {
      assert(manifest.medical.generatorEligibleFamilies === 0, `${identity}: blocked package cannot declare generator-eligible families`);
    }
    return manifest;
  }

  function validateProvenance(registration, provenance) {
    const identity = `${registration.medicalCatalogId}@${registration.medicalCatalogVersion}`;
    assert(provenance && typeof provenance === "object" && !Array.isArray(provenance), `${identity}: provenance is missing`);
    assert(provenance.schemaVersion === 1, `${identity}: unsupported provenance schemaVersion ${provenance.schemaVersion ?? "missing"}`);
    assert(provenance.packageId === registration.packageId, `${identity}: provenance packageId mismatch`);
    assert(provenance.packageVersion === registration.packageVersion, `${identity}: provenance packageVersion mismatch`);
    assert(provenance.archive && typeof provenance.archive === "object", `${identity}: archive identity is missing`);
    assert(isSafeRelativePath(provenance.archive.path), `${identity}: archive path is invalid`);
    assert(/^[a-f0-9]{64}$/u.test(provenance.archive.sha256 || ""), `${identity}: archive SHA-256 is invalid`);
    assert(Number.isInteger(provenance.archive.extractedFileCount) && provenance.archive.extractedFileCount > 0, `${identity}: archive extractedFileCount is invalid`);
    assert(Number.isInteger(provenance.archive.extractedBytes) && provenance.archive.extractedBytes > 0, `${identity}: archive extractedBytes is invalid`);
    assert(provenance.archive.keyFileHashes && typeof provenance.archive.keyFileHashes === "object", `${identity}: audited key-file hashes are missing`);
    for (const requiredPath of [
      "PACKAGE_MANIFEST.json",
      "medical/catalog/family-registry.json",
      "systems/catalog/capability-registry.json"
    ]) {
      assert(/^[a-f0-9]{64}$/u.test(provenance.archive.keyFileHashes[requiredPath] || ""), `${identity}: missing audited hash for ${requiredPath}`);
    }
    assert(provenance.aggregateSha256 === registration.sourceDigest, `${identity}: provenance aggregate digest mismatch`);
    assertCount(provenance.sourceFileCount, registration.expectedCounts.sourceFiles, `${identity}: provenance sourceFileCount`);
    assert(Array.isArray(provenance.files) && provenance.files.length === provenance.sourceFileCount, `${identity}: provenance file inventory mismatch`);
    const paths = new Set();
    let previousPath = "";
    for (const file of provenance.files) {
      assert(file && typeof file === "object", `${identity}: invalid provenance file entry`);
      assert(isSafeRelativePath(file.path), `${identity}: unsafe provenance path ${file.path || "missing"}`);
      assert(!paths.has(file.path), `${identity}: duplicate provenance path ${file.path}`);
      assert(file.path > previousPath, `${identity}: provenance files must use canonical path order`);
      paths.add(file.path);
      previousPath = file.path;
      assert(file.originPath === file.path, `${identity}: provenance origin path mismatch for ${file.path}`);
      assert(Number.isInteger(file.bytes) && file.bytes > 0, `${identity}: invalid byte count for ${file.path}`);
      assert(/^[a-f0-9]{64}$/u.test(file.sha256 || ""), `${identity}: invalid SHA-256 for ${file.path}`);
    }
    assert(paths.has(registration.manifestPath), `${identity}: package manifest is absent from provenance`);
    assert(paths.has(registration.familyRegistryPath), `${identity}: family registry is absent from provenance`);
    assert(
      provenance.files.find((file) => file.path === registration.manifestPath)?.sha256
        === provenance.archive.keyFileHashes["PACKAGE_MANIFEST.json"],
      `${identity}: package manifest key-file hash mismatch`
    );
    assert(
      provenance.files.find((file) => file.path === registration.familyRegistryPath)?.sha256
        === provenance.archive.keyFileHashes["medical/catalog/family-registry.json"],
      `${identity}: family registry key-file hash mismatch`
    );
    return provenance;
  }

  async function verifyProvenanceAggregate(registration, provenance) {
    const aggregateInput = provenance.files.map((file) => (
      `${file.path}\0${file.bytes}\0${file.sha256}\n`
    )).join("");
    const actual = await sha256Hex(aggregateInput);
    assert(actual === provenance.aggregateSha256, `${registration.medicalCatalogId}: provenance inventory digest mismatch`);
    assert(actual === registration.sourceDigest, `${registration.medicalCatalogId}: provenance inventory does not match the registered source digest`);
    return actual;
  }

  async function verifyRuntimeSourceIntegrity(readJson, registration, provenance, requestedPaths, options = {}) {
    const required = options.required === true;
    if (typeof readJson.integrity !== "function") {
      assert(!required, `${registration.medicalCatalogId}: production loading requires a source-integrity reader`);
      return {
        aggregateVerified: true,
        loadedFilesVerified: 0,
        required,
        readerAvailable: false
      };
    }
    const entriesByPath = Object.fromEntries(provenance.files.map((file) => [file.path, file]));
    const verified = new Set();
    for (const requestedPath of requestedPaths) {
      const prefix = `${registration.root}/`;
      assert(requestedPath.startsWith(prefix), `${registration.medicalCatalogId}: integrity path is outside the registered root`);
      const sourcePath = requestedPath.slice(prefix.length);
      const expected = entriesByPath[sourcePath];
      assert(expected, `${registration.medicalCatalogId}: runtime source ${sourcePath} is absent from provenance`);
      const actual = await readJson.integrity(requestedPath);
      assert(actual && Number.isInteger(actual.bytes) && actual.bytes >= 0, `${registration.medicalCatalogId}: invalid runtime byte count for ${sourcePath}`);
      assert(/^[a-f0-9]{64}$/u.test(actual.sha256 || ""), `${registration.medicalCatalogId}: invalid runtime SHA-256 for ${sourcePath}`);
      assert(actual.bytes === expected.bytes, `${registration.medicalCatalogId}: runtime byte count mismatch for ${sourcePath}`);
      assert(actual.sha256 === expected.sha256, `${registration.medicalCatalogId}: runtime SHA-256 mismatch for ${sourcePath}`);
      verified.add(sourcePath);
    }
    return {
      aggregateVerified: true,
      loadedFilesVerified: verified.size,
      required,
      readerAvailable: true
    };
  }

  function validateFamilyRegistry(registration, manifest, registry) {
    const identity = `${registration.medicalCatalogId}@${registration.medicalCatalogVersion}`;
    assert(registry && typeof registry === "object" && !Array.isArray(registry), `${identity}: family registry is missing`);
    assert(registry.schemaVersion === 1, `${identity}: unsupported family registry schemaVersion ${registry.schemaVersion ?? "missing"}`);
    assert(registry.catalogId === registration.medicalCatalogId, `${identity}: family registry catalogId mismatch`);
    assert(registry.catalogVersion === registration.medicalCatalogVersion, `${identity}: family registry catalogVersion mismatch`);
    assert(registry.status === registration.status, `${identity}: family registry status mismatch`);
    assertCount(registry.targetVariantCount, manifest.medical.variantCount, `${identity}: targetVariantCount`);
    assert(Array.isArray(registry.families), `${identity}: families must be an array`);
    assertCount(registry.families.length, manifest.medical.familyCount, `${identity}: registry family count`);
    const ids = new Set();
    const paths = new Set();
    let variants = 0;
    let presentations = 0;
    for (const entry of registry.families) {
      assert(entry && typeof entry === "object" && !Array.isArray(entry), `${identity}: family registry entry is invalid`);
      assertId(entry.id, `${identity}: family id`);
      assert(!ids.has(entry.id), `${identity}: duplicate family id ${entry.id}`);
      ids.add(entry.id);
      assert(typeof entry.title === "string" && entry.title.length > 0, `${entry.id}: title is required`);
      assert(Number.isInteger(entry.targetVariants) && entry.targetVariants > 0, `${entry.id}: targetVariants is invalid`);
      assertCount(entry.authoredVariants, entry.targetVariants, `${entry.id}: authoredVariants`);
      assertCount(entry.authoredPresentations, entry.authoredVariants * 3, `${entry.id}: authoredPresentations`);
      assert(isSafeRelativePath(entry.contentFile) && entry.contentFile.startsWith("families/") && entry.contentFile.endsWith("/family.json"), `${entry.id}: invalid contentFile`);
      assert(!paths.has(entry.contentFile), `${identity}: duplicate family contentFile ${entry.contentFile}`);
      paths.add(entry.contentFile);
      assert(KNOWN_FAMILY_STATUSES.has(entry.status), `${entry.id}: unknown registry family status ${entry.status || "missing"}`);
      assert(typeof entry.phase === "string" && entry.phase.length > 0, `${entry.id}: phase is required`);
      assertStringArray(entry.coreCapabilities, `${entry.id}: coreCapabilities`);
      variants += entry.authoredVariants;
      presentations += entry.authoredPresentations;
    }
    assertCount(variants, manifest.medical.variantCount, `${identity}: authored variant sum`);
    assertCount(presentations, manifest.medical.presentationCount, `${identity}: authored presentation sum`);
    return registry;
  }

  function validateFamily(registration, registryEntry, family) {
    assert(family && typeof family === "object" && !Array.isArray(family), `${registryEntry.id}: family file is missing`);
    assert(family.schemaVersion === 1, `${registryEntry.id}: unsupported schemaVersion ${family.schemaVersion ?? "missing"}`);
    assert(family.familyId === registryEntry.id, `${registryEntry.id}: familyId mismatch`);
    assert(typeof family.familyVersion === "string" && family.familyVersion.length > 0, `${registryEntry.id}: familyVersion is required`);
    assert(KNOWN_FAMILY_STATUSES.has(family.status), `${registryEntry.id}: unknown status ${family.status || "missing"}`);
    assert(family.status === registryEntry.status, `${registryEntry.id}: family status mismatch`);
    assert(typeof family.generatorEligible === "boolean", `${registryEntry.id}: generatorEligible must be boolean`);
    if (family.status !== APPROVED_STATUS) {
      assert(family.generatorEligible === false, `${registryEntry.id}: unapproved family cannot be generator eligible`);
    }
    if (family.generatorEligible) {
      assert(family.status === APPROVED_STATUS, `${registryEntry.id}: generator-eligible family must be approved`);
    }
    assertStringArray(family.species, `${registryEntry.id}: species`);
    assert(family.species.every((species) => species === "dog" || species === "cat"), `${registryEntry.id}: unsupported species`);
    assertStringArray(family.coreCapabilities, `${registryEntry.id}: coreCapabilities`);
    assert(typeof family.safeRouteCapability === "string" && family.safeRouteCapability.length > 0, `${registryEntry.id}: safeRouteCapability is required`);
    assertCount(family.variantCount, registryEntry.authoredVariants, `${registryEntry.id}: variantCount`);
    assertCount(family.presentationCount, registryEntry.authoredPresentations, `${registryEntry.id}: presentationCount`);
    assert(Array.isArray(family.variants), `${registryEntry.id}: variants must be an array`);
    assertCount(family.variants.length, family.variantCount, `${registryEntry.id}: variants length`);
    assertStringArray(family.researchIds, `${registryEntry.id}: researchIds`);
    assertStringArray(family.sourceUrls, `${registryEntry.id}: sourceUrls`);
    assert(family.sourceUrls.every((url) => /^https:\/\/[^\s]+$/u.test(url)), `${registryEntry.id}: sourceUrls must be HTTPS URLs`);
    const variantIds = new Set();
    let presentationCount = 0;
    for (const variant of family.variants) {
      assert(variant && typeof variant === "object" && !Array.isArray(variant), `${registryEntry.id}: invalid variant`);
      assertId(variant.id, `${registryEntry.id}: variant id`);
      assert(!variantIds.has(variant.id), `${registryEntry.id}: duplicate variant id ${variant.id}`);
      variantIds.add(variant.id);
      assert(typeof variant.title === "string" && variant.title.length > 0, `${registryEntry.id}/${variant.id}: title is required`);
      if (variant.version !== undefined) {
        assert(isNonEmptyString(variant.version), `${registryEntry.id}/${variant.id}: variant version is invalid`);
      }
      if (variant.status !== undefined) {
        assert(KNOWN_VARIANT_STATUSES.has(variant.status), `${registryEntry.id}/${variant.id}: unknown variant status ${variant.status || "missing"}`);
      }
      if (variant.generatorEligible !== undefined) {
        assert(typeof variant.generatorEligible === "boolean", `${registryEntry.id}/${variant.id}: variant generatorEligible must be boolean`);
      }
      if (variant.generatorEligible === true) {
        assert(variant.status === APPROVED_STATUS, `${registryEntry.id}/${variant.id}: generator-eligible variant must be approved`);
        assert(isNonEmptyString(variant.version), `${registryEntry.id}/${variant.id}: generator-eligible variant requires its own version`);
        assert(family.generatorEligible === true, `${registryEntry.id}/${variant.id}: generator-eligible variant requires an eligible family`);
      } else if (variant.status !== undefined && variant.status !== APPROVED_STATUS) {
        assert(variant.generatorEligible !== true, `${registryEntry.id}/${variant.id}: unapproved variant cannot be generator eligible`);
      }
      assertStringArray(variant.presentations, `${registryEntry.id}/${variant.id}: presentations`);
      assert(variant.presentations.length === 3, `${registryEntry.id}/${variant.id}: exactly three presentations are required`);
      presentationCount += variant.presentations.length;
    }
    assertCount(presentationCount, family.presentationCount, `${registryEntry.id}: presentation sum`);
    if (family.crossFamilyLinks !== undefined) assertStringArray(family.crossFamilyLinks, `${registryEntry.id}: crossFamilyLinks`, { nonEmpty: false });
    return family;
  }

  function normalizeMedicalCatalog(registration, manifest, familyRegistry, families, provenance, options = {}) {
    const context = options.context || "production";
    assert(LOAD_CONTEXTS.has(context), `unknown load context ${context}`);
    const familiesById = Object.create(null);
    const familiesByKey = Object.create(null);
    const variantsByKey = Object.create(null);
    const presentationsByKey = Object.create(null);
    const normalizedFamilies = [];
    const globalVariantIds = new Set();
    let generatorEligibleFamilies = 0;

    for (const family of families) {
      const registryEntry = familyRegistry.families.find((entry) => entry.id === family.familyId);
      const normalizedFamily = {
        key: familyKey(family.familyId, family.familyVersion),
        id: family.familyId,
        version: family.familyVersion,
        title: registryEntry.title,
        status: family.status,
        generatorEligible: family.generatorEligible,
        species: family.species.slice(),
        coreCapabilities: family.coreCapabilities.slice(),
        safeRouteCapability: family.safeRouteCapability,
        phase: registryEntry.phase,
        sourcePath: joinPath("medical", registryEntry.contentFile),
        variants: []
      };
      if (family.generatorEligible) generatorEligibleFamilies += 1;
      for (const variant of family.variants) {
        assert(!globalVariantIds.has(variant.id), `duplicate global variant id ${variant.id}`);
        globalVariantIds.add(variant.id);
        const normalizedVariant = {
          key: variantKey(family.familyId, family.familyVersion, variant.id),
          id: variant.id,
          title: variant.title,
          familyId: family.familyId,
          familyVersion: family.familyVersion,
          version: typeof variant.version === "string" ? variant.version : null,
          status: typeof variant.status === "string" ? variant.status : null,
          effectiveReviewStatus: typeof variant.status === "string" ? variant.status : family.status,
          effectiveVersion: typeof variant.version === "string" ? variant.version : family.familyVersion,
          statusOrigin: typeof variant.status === "string" ? "variant" : "family",
          versionOrigin: typeof variant.version === "string" ? "variant" : "family",
          generatorEligible: family.generatorEligible === true && variant.generatorEligible === true,
          presentations: []
        };
        for (const presentationId of variant.presentations) {
          const normalizedPresentation = {
            key: presentationKey(family.familyId, family.familyVersion, variant.id, presentationId),
            id: presentationId,
            familyId: family.familyId,
            familyVersion: family.familyVersion,
            variantId: variant.id,
            version: null,
            status: null,
            effectiveReviewStatus: family.status,
            effectiveVersion: family.familyVersion,
            statusOrigin: "family",
            versionOrigin: "family",
            generatorEligible: false
          };
          assert(!presentationsByKey[normalizedPresentation.key], `duplicate presentation key ${normalizedPresentation.key}`);
          presentationsByKey[normalizedPresentation.key] = normalizedPresentation;
          normalizedVariant.presentations.push(normalizedPresentation);
        }
        assert(!variantsByKey[normalizedVariant.key], `duplicate variant key ${normalizedVariant.key}`);
        variantsByKey[normalizedVariant.key] = normalizedVariant;
        normalizedFamily.variants.push(normalizedVariant);
      }
      assert(!familiesById[normalizedFamily.id], `duplicate normalized family id ${normalizedFamily.id}`);
      assert(!familiesByKey[normalizedFamily.key], `duplicate normalized family key ${normalizedFamily.key}`);
      familiesById[normalizedFamily.id] = normalizedFamily;
      familiesByKey[normalizedFamily.key] = normalizedFamily;
      normalizedFamilies.push(normalizedFamily);
    }

    assertCount(normalizedFamilies.length, registration.expectedCounts.families, "normalized family count");
    assertCount(Object.keys(variantsByKey).length, registration.expectedCounts.variants, "normalized variant count");
    assertCount(Object.keys(presentationsByKey).length, registration.expectedCounts.presentations, "normalized presentation count");
    assertCount(generatorEligibleFamilies, registration.expectedCounts.generatorEligibleFamilies, "normalized generator-eligible family count");

    const candidateFamilies = normalizedFamilies.filter((family) => (
      family.status === APPROVED_STATUS
      && family.generatorEligible === true
    ));
    const candidateVariants = Object.values(variantsByKey).filter((variant) => (
      candidateFamilies.some((family) => family.id === variant.familyId)
      && variant.status === APPROVED_STATUS
      && typeof variant.version === "string"
      && variant.generatorEligible === true
    ));
    const candidatePresentations = Object.values(presentationsByKey).filter((presentation) => (
      candidateVariants.some((variant) => variant.key === variantKey(
        presentation.familyId,
        presentation.familyVersion,
        presentation.variantId
      ))
      && presentation.status === APPROVED_STATUS
      && typeof presentation.version === "string"
      && presentation.generatorEligible === true
    ));

    const productionPool = context === "production"
      ? buildProductionCandidateProjection(normalizedFamilies)
      : deepFreeze({ families: [], variants: [], presentations: [] });

    return {
      schemaVersion: 1,
      namespace: MEDICAL_NAMESPACE,
      loadContext: context,
      registration: clone(registration),
      packageManifest: clone(manifest),
      familyRegistry: clone(familyRegistry),
      provenance: clone(provenance),
      families: normalizedFamilies,
      familiesById,
      familiesByKey,
      variantsByKey,
      presentationsByKey,
      counts: {
        families: normalizedFamilies.length,
        variants: Object.keys(variantsByKey).length,
        presentations: Object.keys(presentationsByKey).length,
        generatorEligibleFamilies
      },
      reviewCandidates: {
        auditOnly: context === "review",
        families: candidateFamilies,
        variants: candidateVariants,
        presentations: candidatePresentations
      },
      productionPool
    };
  }

  function requireProductionPool(medicalCatalog) {
    assert(medicalCatalog && medicalCatalog.loadContext === "production", "master medical consumption requires production loadContext");
    const attestedPool = PRODUCTION_ATTESTATIONS.get(medicalCatalog);
    assert(attestedPool && medicalCatalog.productionPool === attestedPool, "production medical catalog is not loader-attested");
    return attestedPool;
  }

  async function loadRegisteredMedicalCatalog(readJson, registration, options = {}) {
    validateMedicalRegistration(registration);
    const context = options.context || "production";
    assert(LOAD_CONTEXTS.has(context), `unknown load context ${context}`);
    if (context === "production") {
      assert(registration.reviewPolicy.productionEligible, `${registration.medicalCatalogId}: production loading is disabled`);
      assert(registration.status === APPROVED_STATUS, `${registration.medicalCatalogId}: production catalog status is not approved`);
      assert(registration.packageStatus === APPROVED_STATUS, `${registration.medicalCatalogId}: production package status is not approved`);
    }
    const manifestRequestPath = joinPath(registration.root, registration.manifestPath);
    const provenanceRequestPath = joinPath(registration.root, registration.provenancePath);
    const manifest = validatePackageManifest(registration, await readJson(manifestRequestPath));
    const provenance = validateProvenance(registration, await readJson(provenanceRequestPath));
    await verifyProvenanceAggregate(registration, provenance);
    const familyRegistryRequestPath = joinPath(registration.root, registration.familyRegistryPath);
    const familyRegistry = validateFamilyRegistry(
      registration,
      manifest,
      await readJson(familyRegistryRequestPath)
    );
    const familyRequestPaths = familyRegistry.families.map((entry) => (
      joinPath(registration.root, "medical", entry.contentFile)
    ));
    const families = await Promise.all(familyRegistry.families.map(async (entry, index) => validateFamily(
      registration,
      entry,
      await readJson(familyRequestPaths[index])
    )));
    const familyIds = new Set(families.map((family) => family.familyId));
    for (const family of families) {
      for (const link of family.crossFamilyLinks || []) {
        assert(familyIds.has(link), `${family.familyId}: unknown crossFamilyLink ${link}`);
      }
    }
    const sourceIntegrity = await verifyRuntimeSourceIntegrity(
      readJson,
      registration,
      provenance,
      [manifestRequestPath, familyRegistryRequestPath, ...familyRequestPaths],
      { required: context === "production" }
    );
    const normalized = normalizeMedicalCatalog(registration, manifest, familyRegistry, families, provenance, { context });
    normalized.sourceIntegrity = sourceIntegrity;
    if (context === "production") {
      assert(sourceIntegrity.required === true && sourceIntegrity.readerAvailable === true, `${registration.medicalCatalogId}: production source integrity is not attested`);
      assert(normalized.productionPool.presentations.length > 0, `${registration.medicalCatalogId}: production pool is empty`);
      PRODUCTION_ATTESTATIONS.set(normalized, normalized.productionPool);
    }
    return normalized;
  }

  function sourcePathLabel(path) {
    if (!path.length) return "$";
    return path.reduce((label, segment) => (
      Number.isInteger(segment) ? `${label}[${segment}]` : `${label}.${segment}`
    ), "$");
  }

  function isAllowedLegacyMetadataSource(source, path) {
    if (source !== LEGACY_METADATA_SOURCE) return false;
    const tail = path.slice(-4);
    return tail.length === 4
      && tail[0] === "planOptions"
      && Number.isInteger(tail[1])
      && tail[2] === "longitudinalCare"
      && tail[3] === "homeFrequency";
  }

  function validateClinicalSourceTree(value, options = {}) {
    const label = options.label || "clinical content";
    const counts = Object.fromEntries(PRIMARY_FACT_SOURCES.map((source) => [source, 0]));
    let legacyMetadataCount = 0;
    const seen = new Set();

    function visit(node, path) {
      if (!node || typeof node !== "object") return;
      if (seen.has(node)) throw new Error(`Medical source validation failed: ${label} contains a recursive object at ${sourcePathLabel(path)}`);
      seen.add(node);
      if (!Array.isArray(node) && Object.prototype.hasOwnProperty.call(node, "source")) {
        const source = node.source;
        if (PRIMARY_FACT_SOURCE_SET.has(source)) {
          counts[source] += 1;
        } else if (isAllowedLegacyMetadataSource(source, path)) {
          legacyMetadataCount += 1;
        } else {
          throw new Error(`Medical source validation failed: ${label} has unknown source ${String(source)} at ${sourcePathLabel(path)}`);
        }
      }
      if (Array.isArray(node)) {
        node.forEach((item, index) => visit(item, [...path, index]));
      } else {
        for (const [key, child] of Object.entries(node)) visit(child, [...path, key]);
      }
      seen.delete(node);
    }

    visit(value, []);
    return {
      label,
      counts,
      primaryFactCount: Object.values(counts).reduce((sum, count) => sum + count, 0),
      legacyMetadataCount
    };
  }

  function buildCompatibilityDocument(cases, metadata = {}) {
    assert(Array.isArray(cases) && cases.length > 0, "compatibility cases must be a non-empty array");
    const entries = cases.map((caseData) => {
      assertId(caseData.family, `${caseData.id || "case"}: compatibility family`);
      assertId(caseData.id, "compatibility caseId");
      assert(Array.isArray(caseData.initialComplaintVariants) && caseData.initialComplaintVariants.length > 0, `${caseData.id}: compatibility complaints are missing`);
      const complaintIds = new Set();
      const complaints = caseData.initialComplaintVariants.map((complaint) => {
        assertId(complaint.id, `${caseData.id}: complaintId`);
        assert(!complaintIds.has(complaint.id), `${caseData.id}: duplicate complaintId ${complaint.id}`);
        complaintIds.add(complaint.id);
        return {
          complaintId: complaint.id,
          ref: compatibilityComplaintRef(caseData.family, caseData.id, complaint.id)
        };
      });
      return {
        family: caseData.family,
        caseId: caseData.id,
        ref: compatibilityCaseRef(caseData.family, caseData.id),
        complaints
      };
    }).sort((left, right) => left.caseId.localeCompare(right.caseId));
    assert(new Set(entries.map((entry) => entry.caseId)).size === entries.length, "duplicate compatibility caseId");
    return {
      schemaVersion: 1,
      namespace: COMPATIBILITY_NAMESPACE,
      namespaceVersion: metadata.namespaceVersion || "2026.07.15.1",
      sourceContentPackId: metadata.contentPackId || "tier-01-v2",
      sourceContentPackVersion: metadata.contentPackVersion || "2026.07.12.2",
      mappingPolicy: "identity_only_no_master_crosswalk",
      caseCount: entries.length,
      cases: entries
    };
  }

  function applyCompatibilityDocument(catalog, compatibility) {
    assert(catalog && Array.isArray(catalog.cases), "tier catalog is unavailable for compatibility validation");
    const expected = buildCompatibilityDocument(catalog.cases, {
      namespaceVersion: compatibility?.namespaceVersion,
      contentPackId: catalog.manifest?.contentPackId,
      contentPackVersion: catalog.manifest?.contentPackVersion
    });
    assert(JSON.stringify(compatibility) === JSON.stringify(expected), "tier compatibility document does not match the existing family/case/complaint identities");
    const casesById = Object.create(null);
    const complaintsByRef = Object.create(null);
    for (const entry of compatibility.cases) {
      const caseData = catalog.cases.find((item) => item.id === entry.caseId);
      assert(caseData && caseData.family === entry.family, `${entry.caseId}: compatibility family mismatch`);
      caseData.compatibilityRef = entry.ref;
      const complaintsById = Object.fromEntries(entry.complaints.map((item) => [item.complaintId, item]));
      for (const complaint of caseData.initialComplaintVariants) {
        const identity = complaintsById[complaint.id];
        assert(identity, `${entry.caseId}: missing compatibility complaint ${complaint.id}`);
        complaint.compatibilityRef = identity.ref;
        complaintsByRef[identity.ref] = complaint;
      }
      casesById[entry.caseId] = entry;
    }
    catalog.casesById = Object.fromEntries(catalog.cases.map((item) => [item.id, item]));
    return {
      schemaVersion: compatibility.schemaVersion,
      namespace: compatibility.namespace,
      namespaceVersion: compatibility.namespaceVersion,
      mappingPolicy: compatibility.mappingPolicy,
      cases: compatibility.cases,
      casesById,
      complaintsByRef,
      selectedComplaintRef(caseId, complaintId) {
        const entry = casesById[caseId];
        const complaint = entry?.complaints.find((item) => item.complaintId === complaintId);
        assert(complaint, `${caseId}: unknown compatibility complaint ${complaintId}`);
        return complaint.ref;
      }
    };
  }

  const api = {
    DEFAULT_MEDICAL_CATALOG_ID,
    DEFAULT_MEDICAL_CATALOG_VERSION,
    MEDICAL_NAMESPACE,
    COMPATIBILITY_NAMESPACE,
    REVIEW_FAMILY_STATUS,
    REVIEW_CATALOG_STATUS,
    REVIEW_PACKAGE_STATUS,
    APPROVED_STATUS,
    PRIMARY_FACT_SOURCES,
    compatibilityCaseRef,
    compatibilityComplaintRef,
    familyKey,
    variantKey,
    presentationKey,
    validateMedicalRegistration,
    validateMedicalRegistrations,
    resolveRegisteredMedicalCatalog,
    validatePackageManifest,
    validateProvenance,
    verifyProvenanceAggregate,
    verifyRuntimeSourceIntegrity,
    sha256Hex,
    validateFamilyRegistry,
    validateFamily,
    requireProductionPool,
    loadRegisteredMedicalCatalog,
    validateClinicalSourceTree,
    buildCompatibilityDocument,
    applyCompatibilityDocument
  };

  if (typeof module === "object" && module.exports) {
    Object.defineProperty(api, "__testOnly", {
      value: Object.freeze({ buildProductionCandidateProjection }),
      enumerable: false,
      configurable: false,
      writable: false
    });
  }

  return api;
});
