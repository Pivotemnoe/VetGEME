(function (root, factory) {
  "use strict";

  const p9AdapterApi = typeof module === "object" && module.exports
    ? require("../systems/resource-visual-projection-v11.js")
    : root.PET_CLINIC_RESOURCE_VISUAL_PROJECTION_V11;
  const api = factory(p9AdapterApi);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_ACTIVATION_VISUAL_V11 = api;
})(typeof window !== "undefined" ? window : globalThis, function (p9AdapterApi) {
  "use strict";

  const VERSION = "pet-clinic-p9-live-adapter-v11@2026.07.17.1";
  const P9_SOURCE_VERSION = "2026.07.16.2";
  const P9_MANIFEST_SHA256 = "7f940f8ba3df745670fc5b4c262a6f79caf5db9edd4f3068a379f18ec4327515";
  const ART_SOURCE_MANIFEST_SHA256 = "5689b5ba5b4fb71e2092e9fecafee5ff16b31b16072c5715694131e67506ed3a";
  const RUNTIME_ART_MANIFEST_SHA256 = "190ab3fa700a4d99950d9d7da1af4590c5da66aeeae54186483453b5a0ca0f1f";
  const CROSSWALK_SHA256 = "8114a14340690523843f6ca19dd0cc7d4e7a48b5261bcb504cb605b6febc9e4a";
  const CATALOG_SHA256 = Object.freeze({
    rooms: "25241dc75767be5b767149ed0337318650babc3b7cb99b4382e2ac4e47675b94",
    equipment: "a8e3214c165c7350d27eae08c756f7719f48a19fa77c87607abb568e5b415e8b",
    staff: "f346037f8dfa2079c537bae818abf707521ba1d1881f11a71b13be566e36d1aa",
    hud: "1be394e082c13dc4007fda01407f8db03b85cc39b22a13485ceb02f10035c751"
  });
  const RUNTIME_ASSET_COUNT = 14;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function assert(condition, message) {
    if (!condition) throw new Error(`Pet Clinic P9 activation rejected input: ${message}`);
  }

  function unique(records, key, label) {
    const map = new Map();
    records.forEach((record) => {
      assert(record && typeof record === "object" && !Array.isArray(record), `${label} record is invalid`);
      assert(typeof record[key] === "string" && record[key], `${label} ${key} is invalid`);
      assert(!map.has(record[key]), `${label} contains duplicate ${record[key]}`);
      map.set(record[key], record);
    });
    return map;
  }

  function validateAssetManifests(sourceManifest, runtimeManifest) {
    assert(sourceManifest?.schemaVersion === 1
      && sourceManifest.manifestId === "pet-clinic-full-activation-art-2026.07.17.1"
      && sourceManifest.runtimeAssetCount === RUNTIME_ASSET_COUNT
      && sourceManifest.assets?.length === RUNTIME_ASSET_COUNT,
    "approved art manifest identity changed");
    assert(sourceManifest.rules?.["sprite presence never grants gameplay capability"] === true
      && sourceManifest.rules?.["room shell is empty and furniture remains separate"] === true
      && sourceManifest.rules?.["missing or failed image falls back to honest Russian DOM label"] === true,
    "approved art safety rules changed");
    assert(runtimeManifest?.schemaVersion === 1
      && runtimeManifest.packId === "pet-clinic-full-activation-art"
      && runtimeManifest.packVersion === "2026.07.17.1"
      && runtimeManifest.capabilityAuthority === "simulation_state_only"
      && runtimeManifest.assets?.length === RUNTIME_ASSET_COUNT,
    "runtime art pack identity changed");
    const sourceByResource = unique(sourceManifest.assets, "resourceId", "source art manifest");
    const runtimeByResource = unique(runtimeManifest.assets, "resourceId", "runtime art manifest");
    assert(sourceByResource.size === runtimeByResource.size, "runtime art pack coverage changed");
    sourceByResource.forEach((source, resourceId) => {
      const runtime = runtimeByResource.get(resourceId);
      assert(runtime
        && runtime.assetId === resourceId
        && runtime.sha256 === source.sha256
        && runtime.title === source.title
        && typeof runtime.file === "string"
        && runtime.file.startsWith("assets/pet-clinic-full-activation-2026.07.17.1/"),
      `runtime art mapping changed for ${resourceId}`);
      if (source.kind === "empty_room_shell") {
        assert(runtime.presentation === "empty_room_shell", "staff room must remain an empty shell");
      } else if (runtime.presentation === "small_device_on_support") {
        assert(source.kind === "equipment_sprite", `${resourceId} support presentation is invalid`);
      }
    });
    return runtimeByResource;
  }

  function buildRuntime(input) {
    assert(p9AdapterApi?.createP9VisualStateAdapter, "P9 .2 adapter is unavailable");
    assert(input?.p9Manifest?.schemaVersion === 1
      && input.p9Manifest.packageId === "vetgeme-p9-visual-state-authoring"
      && input.p9Manifest.packageVersion === P9_SOURCE_VERSION,
    "P9 source manifest identity changed");
    const runtimeAssetByResource = validateAssetManifests(input.artSourceManifest, input.runtimeArtManifest);
    const adapter = p9AdapterApi.createP9VisualStateAdapter({
      roomCatalog: input.roomCatalog,
      equipmentCatalog: input.equipmentCatalog,
      staffCatalog: input.staffCatalog,
      hudContract: input.hudContract,
      resourceCatalog: input.resourceCatalog,
      assetCrosswalk: input.assetCrosswalk,
      schedulerAuthority: input.schedulerAuthority
    });
    assert(adapter.audit.rooms === 12
      && adapter.audit.equipment === 27
      && adapter.audit.staff === 10
      && adapter.audit.hudSurfaces === 9
      && adapter.audit.resources === 49,
    "P9 exact projection counts changed");

    function project(projectionInput) {
      const authored = adapter.project(projectionInput);
      const view = clone(authored);
      view.reviewOnly = false;
      view.runtimeEligible = true;
      view.activationVersion = VERSION;
      view.resources.rooms.forEach((record) => {
        const asset = runtimeAssetByResource.get(record.resourceId);
        if (asset) {
          record.activationAsset = clone(asset);
          record.fallbackLabel = asset.presentation === "empty_room_shell"
            ? "Показана пустая оболочка комнаты; мебель добавляется отдельно."
            : null;
        }
      });
      view.resources.equipment.forEach((record) => {
        const asset = runtimeAssetByResource.get(record.resourceId);
        if (asset) {
          record.activationAsset = clone(asset);
          record.fallbackLabel = null;
        }
      });
      return view;
    }

    return Object.freeze({
      version: VERSION,
      sourceVersion: P9_SOURCE_VERSION,
      p9ManifestSha256: P9_MANIFEST_SHA256,
      artSourceManifestSha256: ART_SOURCE_MANIFEST_SHA256,
      runtimeArtManifestSha256: RUNTIME_ART_MANIFEST_SHA256,
      crosswalkSha256: CROSSWALK_SHA256,
      runtimeEligible: true,
      reviewOnly: false,
      audit: Object.freeze({ ...adapter.audit, runtimeAssets: runtimeAssetByResource.size }),
      project,
      assetForResource(resourceId) {
        return clone(runtimeAssetByResource.get(resourceId) || null);
      }
    });
  }

  function applyCatalog(runtime, catalog) {
    return { ...catalog, visualActivation: runtime };
  }

  return Object.freeze({
    VERSION,
    P9_SOURCE_VERSION,
    P9_MANIFEST_SHA256,
    ART_SOURCE_MANIFEST_SHA256,
    RUNTIME_ART_MANIFEST_SHA256,
    CROSSWALK_SHA256,
    CATALOG_SHA256,
    RUNTIME_ASSET_COUNT,
    buildRuntime,
    applyCatalog
  });
});
