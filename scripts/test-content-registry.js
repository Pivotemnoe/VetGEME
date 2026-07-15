"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const loader = require("../generator/content-loader-v2.js");

const projectRoot = path.resolve(__dirname, "..");
const options = {
  packId: "tier-01-v2",
  packVersion: "2026.07.12.2",
  mode: "tier-01-v2",
  context: "review"
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withSecondPack(registry, overrides) {
  const copy = clone(registry);
  copy.packs.push({ ...clone(copy.packs[0]), ...overrides });
  return copy;
}

async function readProjectJson(requestedPath) {
  return JSON.parse(await fs.readFile(path.join(projectRoot, requestedPath), "utf8"));
}

async function main() {
  const registry = await readProjectJson(loader.CONTENT_REGISTRY_PATH);
  const selected = loader.resolveRegisteredPack(registry, options);
  assert.equal(selected.root, "content/packs/tier-01-v2");

  assert.throws(() => loader.validateRegistry(withSecondPack(registry, {
    contentPackVersion: "2026.07.15.duplicate-id",
    root: "content/packs/duplicate-id"
  })), /duplicate contentPackId tier-01-v2/);

  assert.throws(() => loader.validateRegistry(withSecondPack(registry, {
    contentPackId: "tier-02-test",
    root: "content/packs/tier-02-test"
  })), /duplicate contentPackVersion 2026\.07\.12\.2/);

  assert.throws(() => loader.validateRegistry(withSecondPack(registry, {
    contentPackId: "tier-02-test",
    contentPackVersion: "2026.07.15.2"
  })), /duplicate pack root content\/packs\/tier-01-v2/);

  assert.throws(() => loader.resolveRegisteredPack(registry, {
    ...options,
    packId: "unknown-pack"
  }), /unknown contentPackId unknown-pack/);

  assert.throws(() => loader.resolveRegisteredPack(registry, {
    ...options,
    packVersion: "unknown-version"
  }), /unknown content pack version tier-01-v2@unknown-version/);

  const unknownHash = clone(registry);
  unknownHash.packs[0].contentPackHash = "unknown-hash";
  assert.throws(() => loader.validateRegistry(unknownHash), /contentPackHash must be SHA-256/);

  const unknownStatus = clone(registry);
  unknownStatus.packs[0].status = "unknown-status";
  assert.throws(() => loader.validateRegistry(unknownStatus), /unknown status unknown-status/);

  const unknownIntegrationStatus = clone(registry);
  unknownIntegrationStatus.packs[0].integrationStatus = "unknown-integration-status";
  assert.throws(() => loader.validateRegistry(unknownIntegrationStatus), /unknown integrationStatus unknown-integration-status/);

  await assert.rejects(loader.loadFromDirectory(projectRoot, {
    ...options,
    context: "production"
  }), /production loading is disabled/);

  await assert.rejects(loader.loadFromDirectory(projectRoot, {
    ...options,
    registryPath: "content/alternate-registry.json"
  }), /unsupported registryPath content\/alternate-registry\.json/);

  await assert.rejects(loader.loadFromFetch("content/packs/tier-01-v2"), /Direct content-root loading is disabled/);

  const hashMismatch = clone(registry);
  hashMismatch.packs[0].contentPackHash = "0".repeat(64);
  await assert.rejects(loader.loadRegisteredCatalog(async (requestedPath) => {
    if (requestedPath === loader.CONTENT_REGISTRY_PATH) return hashMismatch;
    return readProjectJson(requestedPath);
  }, options), /manifest contentPackHash mismatch/);

  const manifestRequestPath = `${selected.root}/${selected.manifestPath}`;
  const manifest = await readProjectJson(manifestRequestPath);
  const firstCaseRequestPath = `${selected.root}/clinical/tier-01/${manifest.cases[0].file}`;
  await assert.rejects(loader.loadRegisteredCatalog(async (requestedPath) => {
    const value = await readProjectJson(requestedPath);
    if (requestedPath === firstCaseRequestPath) return { ...value, id: "TAMPERED_CASE_ID" };
    return value;
  }, options), /case identity mismatch: manifest=EAR_FUNGAL_OTITIS, file=TAMPERED_CASE_ID/);

  const multiManifestRequestPath = `${selected.root}/multi-diagnosis/manifest.json`;
  const multiManifest = await readProjectJson(multiManifestRequestPath);
  const firstBundleRequestPath = `${selected.root}/multi-diagnosis/${multiManifest.bundles[0].file}`;
  await assert.rejects(loader.loadRegisteredCatalog(async (requestedPath) => {
    const value = await readProjectJson(requestedPath);
    if (requestedPath === firstBundleRequestPath) return { ...value, bundleId: "TAMPERED_BUNDLE_ID" };
    return value;
  }, options), /bundle identity mismatch: manifest=DUAL_EAR_FUNGAL_BACTERIAL, file=TAMPERED_BUNDLE_ID/);

  const catalog = await loader.loadFromDirectory(projectRoot, options);
  assert.equal(catalog.loadContext, "review");
  assert.equal(catalog.contentRoot, "content/packs/tier-01-v2");
  assert.equal(catalog.registryEntry.contentPackHash, catalog.manifest.contentPackHash);
  assert.equal(catalog.cases.length, 30);
  assert.equal(Object.keys(catalog.casesById).length, 30);

  console.log("Content registry tests passed: unique identity/root, strict lookup/hash/status, case/bundle identity, review-only gate.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
