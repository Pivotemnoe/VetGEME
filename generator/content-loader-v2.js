(function (root, factory) {
  "use strict";

  const medicalCatalogApi = typeof module === "object" && module.exports
    ? require("./medical-catalog-v2.js")
    : root?.PET_CLINIC_MEDICAL_CATALOG_V2;
  const capabilityRegistryApi = typeof module === "object" && module.exports
    ? require("../systems/capability-registry-v3.js")
    : root?.PET_CLINIC_CAPABILITY_REGISTRY_V3;
  const api = factory(medicalCatalogApi, capabilityRegistryApi);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_CONTENT_V2 = api;
})(typeof window !== "undefined" ? window : globalThis, function (medicalCatalogApi, capabilityRegistryApi) {
  "use strict";

  const CONTENT_REGISTRY_PATH = "content/registry.json";
  const CONTENT_ROOT = "content/packs/tier-01-v2";
  const DEFAULT_PACK_ID = "tier-01-v2";
  const DEFAULT_PACK_VERSION = "2026.07.12.2";
  const DEFAULT_CAPABILITY_REGISTRY_ID = "vetgeme-clinic-capabilities";
  const DEFAULT_CAPABILITY_REGISTRY_VERSION = "2026.07.14.38";
  const DEFAULT_CAPABILITY_REGISTRY_ROOT = "content/system-packs/vetgeme-master-2026-07-14";
  const DEFAULT_CAPABILITY_REGISTRY_PATH = "capability-registry.json";
  const DEFAULT_CAPABILITY_REGISTRY_DIGEST = "16ff64c015a8edb302c15289540a4ed760cfc356d832bca31094f992b1da3c81";
  const KNOWN_PACK_STATUSES = new Set([
    "editorial_complete_pending_medical_review",
    "approved"
  ]);
  const KNOWN_INTEGRATION_STATUSES = new Set(["not_connected", "connected"]);
  const LOAD_CONTEXTS = new Set(["review", "production"]);
  const OWNER_FILES = [
    "base-profiles.json",
    "modifiers.json",
    "home-treatment-actions.json",
    "conflict-lines.json",
    "budget-lines.json",
    "anxiety-lines.json",
    "humorous-lines.json",
    "follow-up-lines.json"
  ];

  if (!medicalCatalogApi) throw new Error("Medical catalog v2 dependency is unavailable");
  if (!capabilityRegistryApi) throw new Error("Capability registry v3 dependency is unavailable");

  function joinPath(...parts) {
    return parts.map((part, index) => {
      const value = String(part);
      if (index === 0) return value.replace(/\/$/, "");
      return value.replace(/^\//, "").replace(/\/$/, "");
    }).filter(Boolean).join("/");
  }

  function assert(condition, message) {
    if (!condition) throw new Error(`Content registry validation failed: ${message}`);
  }

  function isSafeRelativePath(value) {
    if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\")) return false;
    const parts = value.split("/");
    return parts.every((part) => part && part !== "." && part !== "..");
  }

  function createIntegrityJsonReader(loadBytes) {
    const cache = new Map();

    async function load(requestedPath) {
      if (!cache.has(requestedPath)) {
        cache.set(requestedPath, Promise.resolve(loadBytes(requestedPath)).then((value) => {
          const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
          const text = new TextDecoder().decode(bytes);
          return {
            bytes,
            value: JSON.parse(text),
            integrity: null
          };
        }));
      }
      return cache.get(requestedPath);
    }

    const readJson = async (requestedPath) => (await load(requestedPath)).value;
    readJson.integrity = async (requestedPath) => {
      const loaded = await load(requestedPath);
      if (!loaded.integrity) {
        loaded.integrity = medicalCatalogApi.sha256Hex(loaded.bytes).then((sha256) => ({
          bytes: loaded.bytes.byteLength,
          sha256
        }));
      }
      return loaded.integrity;
    };
    return readJson;
  }

  function validateRegistry(registry) {
    assert(registry && typeof registry === "object" && !Array.isArray(registry), "registry must be an object");
    assert(registry.schemaVersion === 1, `unsupported schemaVersion ${registry.schemaVersion ?? "missing"}`);
    assert(typeof registry.registryId === "string" && registry.registryId.length > 0, "registryId is required");
    assert(typeof registry.registryVersion === "string" && registry.registryVersion.length > 0, "registryVersion is required");
    assert(Array.isArray(registry.packs) && registry.packs.length > 0, "packs must be a non-empty array");

    const ids = new Set();
    const versions = new Set();
    const identities = new Set();
    const roots = new Set();
    for (const pack of registry.packs) {
      assert(pack && typeof pack === "object" && !Array.isArray(pack), "pack entry must be an object");
      const id = pack.contentPackId;
      const version = pack.contentPackVersion;
      const identity = `${id || "missing"}@${version || "missing"}`;
      assert(typeof id === "string" && id.length > 0, "contentPackId is required");
      assert(!ids.has(id), `duplicate contentPackId ${id}`);
      ids.add(id);
      assert(typeof version === "string" && version.length > 0, `${id}: contentPackVersion is required`);
      assert(!versions.has(version), `duplicate contentPackVersion ${version}`);
      versions.add(version);
      assert(!identities.has(identity), `duplicate content pack identity ${identity}`);
      identities.add(identity);
      assert(/^[a-f0-9]{64}$/u.test(pack.contentPackHash || ""), `${identity}: contentPackHash must be SHA-256`);
      assert(isSafeRelativePath(pack.root) && pack.root.startsWith("content/packs/"), `${identity}: invalid pack root`);
      assert(!roots.has(pack.root), `duplicate pack root ${pack.root}`);
      roots.add(pack.root);
      assert(isSafeRelativePath(pack.manifestPath), `${identity}: invalid manifestPath`);
      assert(KNOWN_PACK_STATUSES.has(pack.status), `${identity}: unknown status ${pack.status || "missing"}`);
      assert(KNOWN_INTEGRATION_STATUSES.has(pack.integrationStatus), `${identity}: unknown integrationStatus ${pack.integrationStatus || "missing"}`);
      assert(pack.reviewPolicy && typeof pack.reviewPolicy === "object", `${identity}: reviewPolicy is required`);
      assert(typeof pack.reviewPolicy.reviewModeAllowed === "boolean", `${identity}: reviewModeAllowed must be boolean`);
      assert(typeof pack.reviewPolicy.productionEligible === "boolean", `${identity}: productionEligible must be boolean`);
      assert(Array.isArray(pack.allowedModes) && pack.allowedModes.length > 0, `${identity}: allowedModes must be non-empty`);
      assert(new Set(pack.allowedModes).size === pack.allowedModes.length, `${identity}: duplicate allowed mode`);
      assert(pack.allowedModes.every((mode) => typeof mode === "string" && mode.length > 0), `${identity}: invalid allowed mode`);
      if (pack.reviewPolicy.productionEligible) {
        assert(pack.status === "approved", `${identity}: production content must be approved`);
        assert(pack.integrationStatus === "connected", `${identity}: production content must be connected`);
      }
    }
    medicalCatalogApi.validateMedicalRegistrations(registry);
    validateCapabilityRegistrations(registry);
    return registry;
  }

  function validateCapabilityRegistration(registration) {
    assert(registration && typeof registration === "object" && !Array.isArray(registration), "capability registration must be an object");
    const id = registration.capabilityRegistryId;
    const version = registration.capabilityRegistryVersion;
    const identity = `${id || "missing"}@${version || "missing"}`;
    assert(typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(id), "capabilityRegistryId is invalid");
    assert(typeof version === "string" && version.length > 0, `${id}: capabilityRegistryVersion is required`);
    assert(id === capabilityRegistryApi.REGISTRY_ID, `${identity}: registry ID does not match the v3 runtime contract`);
    assert(version === capabilityRegistryApi.REGISTRY_VERSION, `${identity}: registry version does not match the v3 runtime contract`);
    assert(typeof registration.packageId === "string" && registration.packageId.length > 0, `${identity}: packageId is required`);
    assert(typeof registration.packageVersion === "string" && registration.packageVersion.length > 0, `${identity}: packageVersion is required`);
    assert(
      isSafeRelativePath(registration.root) && registration.root.startsWith("content/system-packs/"),
      `${identity}: invalid root`
    );
    assert(isSafeRelativePath(registration.registryPath), `${identity}: invalid registryPath`);
    assert(/^[a-f0-9]{64}$/u.test(registration.sourceDigest || ""), `${identity}: sourceDigest must be SHA-256`);
    assert(registration.root === DEFAULT_CAPABILITY_REGISTRY_ROOT, `${identity}: unexpected registry root ${registration.root}`);
    assert(registration.registryPath === DEFAULT_CAPABILITY_REGISTRY_PATH, `${identity}: unexpected registryPath ${registration.registryPath}`);
    assert(registration.sourceDigest === DEFAULT_CAPABILITY_REGISTRY_DIGEST, `${identity}: sourceDigest does not match the audited source file`);
    assert(registration.status === capabilityRegistryApi.REGISTRY_STATUS, `${identity}: unknown status ${registration.status || "missing"}`);
    assert(registration.expectedCounts && typeof registration.expectedCounts === "object", `${identity}: expectedCounts are required`);
    assert(
      Number.isInteger(registration.expectedCounts.capabilities) && registration.expectedCounts.capabilities > 0,
      `${identity}: expectedCounts.capabilities is invalid`
    );
    assert(
      registration.expectedCounts.capabilities === capabilityRegistryApi.EXPECTED_CAPABILITY_COUNT,
      `${identity}: expected capability count does not match the v3 runtime contract`
    );
    assert(registration.activationPolicy && typeof registration.activationPolicy === "object", `${identity}: activationPolicy is required`);
    for (const field of [
      "registryRuntimeEligible",
      "medicalResearchMappingEligible",
      "criticalityEligible",
      "economicSchedulingEligible",
      "referralOutcomesEligible"
    ]) {
      assert(typeof registration.activationPolicy[field] === "boolean", `${identity}: activationPolicy.${field} must be boolean`);
    }
    assert(registration.activationPolicy.registryRuntimeEligible, `${identity}: registry runtime loading is disabled`);
    for (const blockedField of [
      "medicalResearchMappingEligible",
      "criticalityEligible",
      "economicSchedulingEligible",
      "referralOutcomesEligible"
    ]) {
      assert(registration.activationPolicy[blockedField] === false, `${identity}: ${blockedField} requires authored activation data`);
    }
    assert(Array.isArray(registration.allowedModes) && registration.allowedModes.length > 0, `${identity}: allowedModes must be non-empty`);
    assert(new Set(registration.allowedModes).size === registration.allowedModes.length, `${identity}: duplicate allowed mode`);
    assert(
      registration.allowedModes.every((mode) => typeof mode === "string" && mode.length > 0),
      `${identity}: invalid allowed mode`
    );
    return registration;
  }

  function validateCapabilityRegistrations(registry) {
    assert(
      Array.isArray(registry?.capabilityRegistries) && registry.capabilityRegistries.length > 0,
      "capabilityRegistries must be a non-empty array"
    );
    const ids = new Set();
    const identities = new Set();
    const roots = new Set();
    for (const registration of registry.capabilityRegistries) {
      validateCapabilityRegistration(registration);
      const identity = `${registration.capabilityRegistryId}@${registration.capabilityRegistryVersion}`;
      assert(!ids.has(registration.capabilityRegistryId), `duplicate capabilityRegistryId ${registration.capabilityRegistryId}`);
      ids.add(registration.capabilityRegistryId);
      assert(!identities.has(identity), `duplicate capability registry identity ${identity}`);
      identities.add(identity);
      assert(!roots.has(registration.root), `duplicate capability registry root ${registration.root}`);
      roots.add(registration.root);
    }
    return registry.capabilityRegistries;
  }

  function resolveRegisteredCapabilityRegistry(registry, options = {}) {
    const registrations = validateCapabilityRegistrations(registry);
    const registryId = options.capabilityRegistryId || DEFAULT_CAPABILITY_REGISTRY_ID;
    const registryVersion = options.capabilityRegistryVersion || DEFAULT_CAPABILITY_REGISTRY_VERSION;
    const mode = options.mode || "tier-01-v2";
    const matchesId = registrations.filter((entry) => entry.capabilityRegistryId === registryId);
    assert(matchesId.length === 1, `unknown capabilityRegistryId ${registryId}`);
    const registration = matchesId.find((entry) => entry.capabilityRegistryVersion === registryVersion);
    assert(registration, `unknown capability registry version ${registryId}@${registryVersion}`);
    assert(registration.allowedModes.includes(mode), `${registryId}@${registryVersion}: mode ${mode} is not allowed`);
    assert(registration.activationPolicy.registryRuntimeEligible, `${registryId}@${registryVersion}: registry runtime loading is disabled`);
    return registration;
  }

  function validateCapabilityRegistryIdentity(registration, capabilityRegistry) {
    const identity = `${registration.capabilityRegistryId}@${registration.capabilityRegistryVersion}`;
    assert(capabilityRegistry && typeof capabilityRegistry === "object" && !Array.isArray(capabilityRegistry), `${identity}: registry document is missing`);
    assert(capabilityRegistry.registryId === registration.capabilityRegistryId, `${identity}: registryId mismatch`);
    assert(capabilityRegistry.registryVersion === registration.capabilityRegistryVersion, `${identity}: registryVersion mismatch`);
    assert(capabilityRegistry.status === registration.status, `${identity}: registry status mismatch`);
    const validation = capabilityRegistryApi.validateRegistry(capabilityRegistry, {
      expectedCount: registration.expectedCounts.capabilities,
      requireCanonicalIdentity: true
    });
    assert(validation && validation.valid === true, `${identity}: ${validation?.errors?.join(", ") || "registry validation failed"}`);
    return capabilityRegistry;
  }

  async function loadRegisteredCapabilityRegistry(readJson, registration, options = {}) {
    validateCapabilityRegistration(registration);
    const context = options.context || "production";
    assert(LOAD_CONTEXTS.has(context), `unknown load context ${context}`);
    const requestedPath = joinPath(registration.root, registration.registryPath);
    const capabilityRegistry = validateCapabilityRegistryIdentity(
      registration,
      await readJson(requestedPath)
    );
    if (typeof readJson.integrity === "function") {
      const integrity = await readJson.integrity(requestedPath);
      assert(integrity?.sha256 === registration.sourceDigest, `${registration.capabilityRegistryId}: runtime SHA-256 does not match the registered source digest`);
    } else {
      assert(context !== "production", `${registration.capabilityRegistryId}: production loading requires a source-integrity reader`);
    }
    return capabilityRegistry;
  }

  function resolveRegisteredPack(registry, options = {}) {
    validateRegistry(registry);
    const packId = options.packId || DEFAULT_PACK_ID;
    const packVersion = options.packVersion || DEFAULT_PACK_VERSION;
    const mode = options.mode || "tier-01-v2";
    const context = options.context || "production";
    assert(LOAD_CONTEXTS.has(context), `unknown load context ${context}`);

    const matchesId = registry.packs.filter((pack) => pack.contentPackId === packId);
    assert(matchesId.length === 1, `unknown contentPackId ${packId}`);
    const pack = matchesId.find((entry) => entry.contentPackVersion === packVersion);
    assert(pack, `unknown content pack version ${packId}@${packVersion}`);
    assert(pack.allowedModes.includes(mode), `${packId}@${packVersion}: mode ${mode} is not allowed`);
    if (context === "review") {
      assert(pack.reviewPolicy.reviewModeAllowed, `${packId}@${packVersion}: review loading is disabled`);
    } else {
      assert(pack.reviewPolicy.productionEligible, `${packId}@${packVersion}: production loading is disabled`);
      assert(pack.status === "approved", `${packId}@${packVersion}: production status is not approved`);
      assert(pack.integrationStatus === "connected", `${packId}@${packVersion}: production integration is not connected`);
    }
    return pack;
  }

  function validateManifestIdentity(pack, manifest) {
    const identity = `${pack.contentPackId}@${pack.contentPackVersion}`;
    assert(manifest && typeof manifest === "object", `${identity}: manifest is missing`);
    assert(manifest.contentPackId === pack.contentPackId, `${identity}: manifest contentPackId mismatch`);
    assert(manifest.contentPackVersion === pack.contentPackVersion, `${identity}: manifest contentPackVersion mismatch`);
    assert(manifest.contentPackHash === pack.contentPackHash, `${identity}: manifest contentPackHash mismatch`);
    assert(manifest.status === pack.status, `${identity}: manifest status mismatch`);
    assert(manifest.integrationStatus === pack.integrationStatus, `${identity}: manifest integrationStatus mismatch`);
    return manifest;
  }

  function validateMedicalCapabilityReferences(medicalCatalog, capabilityRegistry, options = {}) {
    const context = options.context || "production";
    assert(LOAD_CONTEXTS.has(context), `unknown load context ${context}`);
    assert(medicalCatalog && Array.isArray(medicalCatalog.families), "medical catalog families are unavailable");
    assert(capabilityRegistry && Array.isArray(capabilityRegistry.capabilities), "capability registry entries are unavailable");
    const capabilityIds = new Set(capabilityRegistry.capabilities.map((entry) => entry.id));
    const declarationDifferences = [];
    const productionCandidateFamilyIds = new Set(medicalCatalog.families.filter((family) => (
      family.status === medicalCatalogApi.APPROVED_STATUS
      && family.generatorEligible === true
    )).map((family) => family.id));
    let registryReferences = 0;
    let familyReferences = 0;
    let safeRouteReferences = 0;

    for (const family of medicalCatalog.families) {
      const registryEntry = medicalCatalog.familyRegistry.families.find((entry) => entry.id === family.id);
      assert(registryEntry, `${family.id}: family registry entry is missing`);
      for (const capabilityId of registryEntry.coreCapabilities) {
        assert(capabilityIds.has(capabilityId), `${family.id}: unknown registry capability reference ${capabilityId}`);
        registryReferences += 1;
      }
      for (const capabilityId of family.coreCapabilities) {
        assert(capabilityIds.has(capabilityId), `${family.id}: unknown family capability reference ${capabilityId}`);
        familyReferences += 1;
      }
      assert(capabilityIds.has(family.safeRouteCapability), `${family.id}: unknown safe-route capability reference ${family.safeRouteCapability}`);
      safeRouteReferences += 1;
      const registrySet = new Set(registryEntry.coreCapabilities);
      const familySet = new Set(family.coreCapabilities);
      const onlyRegistry = [...registrySet].filter((id) => !familySet.has(id)).sort();
      const onlyFamily = [...familySet].filter((id) => !registrySet.has(id)).sort();
      if (onlyRegistry.length || onlyFamily.length) {
        declarationDifferences.push({
          familyId: family.id,
          productionCandidate: productionCandidateFamilyIds.has(family.id),
          onlyRegistry,
          onlyFamily
        });
      }
    }

    const productionCandidateDifferences = declarationDifferences.filter((entry) => entry.productionCandidate);
    if (context === "production") {
      assert(productionCandidateDifferences.length === 0, "production-candidate medical capability declarations are contradictory");
    }
    return {
      capabilityCount: capabilityIds.size,
      registryReferences,
      familyReferences,
      safeRouteReferences,
      declarationDifferences,
      productionCandidateFamilyIds: [...productionCandidateFamilyIds].sort(),
      productionCandidateDifferences
    };
  }

  function requireGeneratorMedicalPool(catalog) {
    assert(catalog && catalog.loadContext === "production", "master medical consumption requires production loadContext");
    assert(catalog.medicalCatalog?.loadContext === "production", "master medical catalog requires production loadContext");
    return medicalCatalogApi.requireProductionPool(catalog.medicalCatalog);
  }

  async function loadCatalog(readJson, rootPath, manifestPath, manifest) {
    const clinicalRoot = joinPath(rootPath, manifestPath.split("/").slice(0, -1).join("/"));
    const ownerRoot = joinPath(rootPath, "owners/tier-01");
    const campaignRoot = joinPath(rootPath, "campaign/tier-01");
    const multiDiagnosisRoot = joinPath(rootPath, "multi-diagnosis");
    if (!manifest || !Array.isArray(manifest.cases)) throw new Error("Tier 01 v2 manifest cases are unavailable");
    const caseIds = manifest.cases.map((entry) => entry?.id);
    if (caseIds.some((id) => typeof id !== "string" || !id) || new Set(caseIds).size !== caseIds.length) {
      throw new Error("Tier 01 v2 manifest contains missing or duplicate case IDs");
    }
    if (manifest.caseCount !== manifest.cases.length) throw new Error("Tier 01 v2 manifest caseCount does not match cases");
    for (const entry of manifest.cases) {
      if (!isSafeRelativePath(entry.file)) throw new Error(`Tier 01 v2 manifest contains an unsafe case path: ${entry.file}`);
    }
    const cases = await Promise.all(manifest.cases.map(async (entry) => {
      const caseData = await readJson(joinPath(clinicalRoot, entry.file));
      if (!caseData || caseData.id !== entry.id) {
        throw new Error(`Tier 01 v2 case identity mismatch: manifest=${entry.id}, file=${caseData?.id || "missing"}`);
      }
      return { ...caseData, manifestEntry: { ...entry } };
    }));
    const resultingCaseIds = cases.map((caseData) => caseData.id);
    if (new Set(resultingCaseIds).size !== resultingCaseIds.length) {
      throw new Error("Tier 01 v2 loaded cases contain duplicate IDs");
    }
    const ownerEntries = await Promise.all(OWNER_FILES.map(async (file) => [
      file.replace(/\.json$/, ""),
      await readJson(joinPath(ownerRoot, file))
    ]));
    const [dayPlan, dayGoals, doctorShifts, labels, tutorial, multiDiagnosisManifest] = await Promise.all([
      readJson(joinPath(campaignRoot, "seven-day-plan.json")),
      readJson(joinPath(campaignRoot, "day-goals.json")),
      readJson(joinPath(campaignRoot, "doctor-shifts.json")),
      readJson(joinPath(rootPath, "ui/clinical-labels.json")),
      readJson(joinPath(rootPath, "ui/tutorial-texts.json")),
      readJson(joinPath(multiDiagnosisRoot, "manifest.json"))
    ]);
    if (!multiDiagnosisManifest || !Array.isArray(multiDiagnosisManifest.bundles)) {
      throw new Error("Tier 01 v2 multi-diagnosis manifest bundles are unavailable");
    }
    const manifestBundleIds = multiDiagnosisManifest.bundles.map((entry) => entry?.bundleId);
    if (manifestBundleIds.some((id) => typeof id !== "string" || !id) || new Set(manifestBundleIds).size !== manifestBundleIds.length) {
      throw new Error("Tier 01 v2 multi-diagnosis manifest contains missing or duplicate bundle IDs");
    }
    for (const entry of multiDiagnosisManifest.bundles) {
      if (!isSafeRelativePath(entry.file)) throw new Error(`Tier 01 v2 multi-diagnosis manifest contains an unsafe bundle path: ${entry.file}`);
    }
    const multiDiagnosisBundles = await Promise.all(multiDiagnosisManifest.bundles.map(async (entry) => {
      const bundle = await readJson(joinPath(multiDiagnosisRoot, entry.file));
      if (!bundle || bundle.bundleId !== entry.bundleId) {
        throw new Error(`Tier 01 v2 bundle identity mismatch: manifest=${entry.bundleId}, file=${bundle?.bundleId || "missing"}`);
      }
      return bundle;
    }));
    const resultingBundleIds = multiDiagnosisBundles.map((bundle) => bundle.bundleId);
    if (new Set(resultingBundleIds).size !== resultingBundleIds.length) {
      throw new Error("Tier 01 v2 loaded bundles contain duplicate IDs");
    }
    if (multiDiagnosisManifest.automaticPairingAllowed !== false) {
      throw new Error("Tier 01 v2 multi-diagnosis automatic pairing must stay disabled");
    }
    for (const bundle of multiDiagnosisBundles) {
      if (bundle.status !== "pending_content" || bundle.approvedClinicalContent !== null) {
        throw new Error(`Tier 01 v2 bundle ${bundle.bundleId} must stay nonselectable pending content`);
      }
    }

    const sourceAudit = {
      cases: cases.map((caseData) => medicalCatalogApi.validateClinicalSourceTree(caseData, {
        label: `case ${caseData.id}`
      })),
      owners: Object.fromEntries(ownerEntries.map(([id, value]) => [
        id,
        medicalCatalogApi.validateClinicalSourceTree(value, { label: `owner library ${id}` })
      ]))
    };

    return {
      schemaVersion: 2,
      contentRoot: rootPath,
      manifest,
      cases,
      casesById: Object.fromEntries(cases.map((item) => [item.id, item])),
      owners: Object.fromEntries(ownerEntries),
      dayPlan,
      dayGoals,
      doctorShifts,
      labels,
      tutorial,
      sourceAudit,
      multiDiagnosis: {
        manifest: multiDiagnosisManifest,
        bundles: multiDiagnosisBundles,
        bundlesById: Object.fromEntries(multiDiagnosisBundles.map((item) => [item.bundleId, item]))
      }
    };
  }

  async function loadRegisteredCatalog(readJson, options = {}) {
    assert(!options.registryPath || options.registryPath === CONTENT_REGISTRY_PATH, `unsupported registryPath ${options.registryPath}`);
    const registry = validateRegistry(await readJson(CONTENT_REGISTRY_PATH));
    const pack = resolveRegisteredPack(registry, options);
    const medicalRegistration = medicalCatalogApi.resolveRegisteredMedicalCatalog(registry, options);
    const capabilityRegistration = resolveRegisteredCapabilityRegistry(registry, options);
    const manifest = validateManifestIdentity(pack, await readJson(joinPath(pack.root, pack.manifestPath)));
    const [catalog, medicalCatalog, compatibilityDocument, capabilityRegistry] = await Promise.all([
      loadCatalog(readJson, pack.root, pack.manifestPath, manifest),
      medicalCatalogApi.loadRegisteredMedicalCatalog(readJson, medicalRegistration, options),
      readJson(joinPath(medicalRegistration.root, medicalRegistration.compatibilityPath)),
      loadRegisteredCapabilityRegistry(readJson, capabilityRegistration, options)
    ]);
    const capabilityReferenceAudit = validateMedicalCapabilityReferences(medicalCatalog, capabilityRegistry, options);
    const compatibility = medicalCatalogApi.applyCompatibilityDocument(catalog, compatibilityDocument);
    return {
      ...catalog,
      registryEntry: JSON.parse(JSON.stringify(pack)),
      medicalRegistryEntry: JSON.parse(JSON.stringify(medicalRegistration)),
      medicalCatalog,
      capabilityRegistryEntry: JSON.parse(JSON.stringify(capabilityRegistration)),
      capabilityRegistry,
      capabilityReferenceAudit,
      compatibility,
      loadContext: options.context || "production"
    };
  }

  async function loadFromFetch(options = {}, fetchImpl = fetch) {
    if (typeof options === "string") throw new Error("Direct content-root loading is disabled; use the content registry");
    const readJson = createIntegrityJsonReader(async (requestedPath) => {
      const response = await fetchImpl(requestedPath);
      if (!response.ok) throw new Error(`Registered content request failed: ${requestedPath} (${response.status})`);
      assert(typeof response.arrayBuffer === "function", `registered content response cannot provide source bytes: ${requestedPath}`);
      return new Uint8Array(await response.arrayBuffer());
    });
    return loadRegisteredCatalog(readJson, options);
  }

  async function loadFromDirectory(projectRoot, options = {}) {
    if (typeof require !== "function") throw new Error("Directory loading is available only in Node.js");
    const fs = require("node:fs/promises");
    const pathModule = require("node:path");
    const resolvedProjectRoot = pathModule.resolve(projectRoot);
    const readJson = createIntegrityJsonReader(async (requestedPath) => {
      const resolved = pathModule.resolve(resolvedProjectRoot, requestedPath);
      const relative = pathModule.relative(resolvedProjectRoot, resolved);
      if (!relative || relative.startsWith(`..${pathModule.sep}`) || pathModule.isAbsolute(relative)) {
        throw new Error(`Registered content path escapes the project root: ${requestedPath}`);
      }
      return fs.readFile(resolved);
    });
    return loadRegisteredCatalog(readJson, options);
  }

  return {
    CONTENT_REGISTRY_PATH,
    CONTENT_ROOT,
    DEFAULT_PACK_ID,
    DEFAULT_PACK_VERSION,
    DEFAULT_CAPABILITY_REGISTRY_ID,
    DEFAULT_CAPABILITY_REGISTRY_VERSION,
    DEFAULT_CAPABILITY_REGISTRY_ROOT,
    DEFAULT_CAPABILITY_REGISTRY_PATH,
    DEFAULT_CAPABILITY_REGISTRY_DIGEST,
    OWNER_FILES,
    medicalCatalogApi,
    capabilityRegistryApi,
    validateRegistry,
    validateCapabilityRegistration,
    validateCapabilityRegistrations,
    resolveRegisteredCapabilityRegistry,
    validateCapabilityRegistryIdentity,
    loadRegisteredCapabilityRegistry,
    validateMedicalCapabilityReferences,
    requireGeneratorMedicalPool,
    resolveRegisteredPack,
    validateManifestIdentity,
    loadRegisteredCatalog,
    loadFromFetch,
    loadFromDirectory
  };
});
