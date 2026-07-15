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
  const omittedContext = { ...options };
  delete omittedContext.context;
  assert.throws(
    () => loader.resolveRegisteredPack(registry, omittedContext),
    /production loading is disabled/
  );
  await assert.rejects(
    loader.loadFromDirectory(projectRoot, omittedContext),
    /production loading is disabled/
  );

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

  const missingCapabilityRegistries = clone(registry);
  delete missingCapabilityRegistries.capabilityRegistries;
  assert.throws(
    () => loader.validateRegistry(missingCapabilityRegistries),
    /capabilityRegistries must be a non-empty array/
  );

  const unknownCapabilityDigest = clone(registry);
  unknownCapabilityDigest.capabilityRegistries[0].sourceDigest = "0".repeat(64);
  assert.throws(
    () => loader.validateRegistry(unknownCapabilityDigest),
    /sourceDigest does not match the audited source file/
  );

  const activatedUnauthoredResearch = clone(registry);
  activatedUnauthoredResearch.capabilityRegistries[0].activationPolicy.medicalResearchMappingEligible = true;
  assert.throws(
    () => loader.validateRegistry(activatedUnauthoredResearch),
    /medicalResearchMappingEligible requires authored activation data/
  );

  assert.throws(() => loader.resolveRegisteredCapabilityRegistry(registry, {
    ...options,
    capabilityRegistryId: "unknown-capability-registry"
  }), /unknown capabilityRegistryId unknown-capability-registry/);

  assert.throws(() => loader.resolveRegisteredCapabilityRegistry(registry, {
    ...options,
    capabilityRegistryVersion: "unknown-version"
  }), /unknown capability registry version vetgeme-clinic-capabilities@unknown-version/);

  assert.throws(() => loader.resolveRegisteredCapabilityRegistry(registry, {
    ...options,
    mode: "current"
  }), /mode current is not allowed/);

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

  const capabilityRegistration = loader.resolveRegisteredCapabilityRegistry(registry, options);
  const capabilityRequestPath = `${capabilityRegistration.root}/${capabilityRegistration.registryPath}`;
  await assert.rejects(loader.loadRegisteredCatalog(async (requestedPath) => {
    const value = await readProjectJson(requestedPath);
    if (requestedPath === capabilityRequestPath) return { ...value, registryVersion: "TAMPERED_VERSION" };
    return value;
  }, options), /registryVersion mismatch/);

  await assert.rejects(loader.loadRegisteredCatalog(async (requestedPath) => {
    const value = await readProjectJson(requestedPath);
    if (requestedPath !== capabilityRequestPath) return value;
    const tampered = clone(value);
    tampered.capabilities[0].requires = ["missing_authored_capability"];
    return tampered;
  }, options), /missing_reference:general_exam->missing_authored_capability/);

  const medicalRegistration = registry.medicalCatalogs[0];
  const familyRegistry = await readProjectJson(`${medicalRegistration.root}/${medicalRegistration.familyRegistryPath}`);
  const firstMedicalFamilyPath = `${medicalRegistration.root}/medical/${familyRegistry.families[0].contentFile}`;
  await assert.rejects(loader.loadRegisteredCatalog(async (requestedPath) => {
    const value = await readProjectJson(requestedPath);
    if (requestedPath !== firstMedicalFamilyPath) return value;
    const tampered = clone(value);
    tampered.coreCapabilities.push("missing_medical_capability");
    return tampered;
  }, options), /ear_external: unknown family capability reference missing_medical_capability/);

  const capabilityDigestReader = async (requestedPath) => readProjectJson(requestedPath);
  capabilityDigestReader.integrity = async () => ({ bytes: 1, sha256: "0".repeat(64) });
  await assert.rejects(
    loader.loadRegisteredCapabilityRegistry(capabilityDigestReader, capabilityRegistration, options),
    /runtime SHA-256 does not match the registered source digest/
  );

  const catalog = await loader.loadFromDirectory(projectRoot, options);
  assert.equal(catalog.loadContext, "review");
  assert.equal(catalog.contentRoot, "content/packs/tier-01-v2");
  assert.equal(catalog.registryEntry.contentPackHash, catalog.manifest.contentPackHash);
  assert.equal(catalog.cases.length, 30);
  assert.equal(Object.keys(catalog.casesById).length, 30);
  assert.equal(catalog.capabilityRegistryEntry.capabilityRegistryId, "vetgeme-clinic-capabilities");
  assert.equal(catalog.capabilityRegistryEntry.capabilityRegistryVersion, "2026.07.14.38");
  assert.equal(catalog.capabilityRegistryEntry.activationPolicy.medicalResearchMappingEligible, false);
  assert.equal(catalog.capabilityRegistry.registryId, catalog.capabilityRegistryEntry.capabilityRegistryId);
  assert.equal(catalog.capabilityRegistry.registryVersion, catalog.capabilityRegistryEntry.capabilityRegistryVersion);
  assert.equal(catalog.capabilityRegistry.capabilities.length, 447);
  assert.equal(catalog.capabilityReferenceAudit.capabilityCount, 447);
  assert.equal(catalog.capabilityReferenceAudit.safeRouteReferences, 39);
  assert.equal(catalog.capabilityReferenceAudit.declarationDifferences.length, 39);
  assert.equal(catalog.capabilityReferenceAudit.productionCandidateDifferences.length, 0);
  assert.doesNotThrow(
    () => loader.validateMedicalCapabilityReferences(catalog.medicalCatalog, catalog.capabilityRegistry, {
      context: "production"
    })
  );
  assert.throws(
    () => loader.requireGeneratorMedicalPool(catalog),
    /master medical consumption requires production loadContext/
  );

  const mixedCandidateCatalog = clone(catalog.medicalCatalog);
  mixedCandidateCatalog.families[0].status = "approved";
  mixedCandidateCatalog.families[0].generatorEligible = true;
  mixedCandidateCatalog.families[1].status = "retired";
  assert.throws(
    () => loader.validateMedicalCapabilityReferences(mixedCandidateCatalog, catalog.capabilityRegistry, {
      context: "production"
    }),
    /production-candidate medical capability declarations are contradictory/
  );
  mixedCandidateCatalog.familyRegistry.families[0].coreCapabilities = mixedCandidateCatalog.families[0].coreCapabilities.slice();
  const candidateScopedAudit = loader.validateMedicalCapabilityReferences(
    mixedCandidateCatalog,
    catalog.capabilityRegistry,
    { context: "production" }
  );
  assert.equal(candidateScopedAudit.productionCandidateFamilyIds.length, 1);
  assert.equal(candidateScopedAudit.productionCandidateDifferences.length, 0);
  assert.equal(candidateScopedAudit.declarationDifferences.length, 38);

  console.log("Content registry tests passed: fail-closed context, review pool isolation, candidate-scoped capability audit, runtime digest gate, authored activation gates, case/bundle/graph integrity.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
