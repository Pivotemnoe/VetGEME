(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_CONTENT_V2 = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const CONTENT_REGISTRY_PATH = "content/registry.json";
  const CONTENT_ROOT = "content/packs/tier-01-v2";
  const DEFAULT_PACK_ID = "tier-01-v2";
  const DEFAULT_PACK_VERSION = "2026.07.12.2";
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
    return registry;
  }

  function resolveRegisteredPack(registry, options = {}) {
    validateRegistry(registry);
    const packId = options.packId || DEFAULT_PACK_ID;
    const packVersion = options.packVersion || DEFAULT_PACK_VERSION;
    const mode = options.mode || "tier-01-v2";
    const context = options.context || "review";
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
    const manifest = validateManifestIdentity(pack, await readJson(joinPath(pack.root, pack.manifestPath)));
    const catalog = await loadCatalog(readJson, pack.root, pack.manifestPath, manifest);
    return {
      ...catalog,
      registryEntry: JSON.parse(JSON.stringify(pack)),
      loadContext: options.context || "review"
    };
  }

  async function loadFromFetch(options = {}, fetchImpl = fetch) {
    if (typeof options === "string") throw new Error("Direct content-root loading is disabled; use the content registry");
    return loadRegisteredCatalog(async (path) => {
      const response = await fetchImpl(path);
      if (!response.ok) throw new Error(`Registered content request failed: ${path} (${response.status})`);
      return response.json();
    }, options);
  }

  async function loadFromDirectory(projectRoot, options = {}) {
    if (typeof require !== "function") throw new Error("Directory loading is available only in Node.js");
    const fs = require("node:fs/promises");
    const pathModule = require("node:path");
    const resolvedProjectRoot = pathModule.resolve(projectRoot);
    return loadRegisteredCatalog(async (requestedPath) => {
      const resolved = pathModule.resolve(resolvedProjectRoot, requestedPath);
      const relative = pathModule.relative(resolvedProjectRoot, resolved);
      if (!relative || relative.startsWith(`..${pathModule.sep}`) || pathModule.isAbsolute(relative)) {
        throw new Error(`Registered content path escapes the project root: ${requestedPath}`);
      }
      return JSON.parse(await fs.readFile(resolved, "utf8"));
    }, options);
  }

  return {
    CONTENT_REGISTRY_PATH,
    CONTENT_ROOT,
    DEFAULT_PACK_ID,
    DEFAULT_PACK_VERSION,
    OWNER_FILES,
    validateRegistry,
    resolveRegisteredPack,
    validateManifestIdentity,
    loadRegisteredCatalog,
    loadFromFetch,
    loadFromDirectory
  };
});
