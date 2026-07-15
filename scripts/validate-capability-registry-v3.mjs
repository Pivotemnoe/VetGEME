import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const loader = require("../generator/content-loader-v2.js");
const capabilityApi = require("../systems/capability-registry-v3.js");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = {
  packId: "tier-01-v2",
  packVersion: "2026.07.12.2",
  mode: "tier-01-v2",
  context: "review",
};

const contentRegistry = await readJson(path.join(projectRoot, loader.CONTENT_REGISTRY_PATH));
loader.validateRegistry(contentRegistry);
const registration = loader.resolveRegisteredCapabilityRegistry(contentRegistry, options);
const canonicalPath = path.join(
  projectRoot,
  ...registration.root.split("/"),
  ...registration.registryPath.split("/"),
);
const canonicalBytes = await readFile(canonicalPath);
const canonicalDigest = sha256(canonicalBytes);

assert.equal(canonicalDigest, registration.sourceDigest, "canonical capability registry digest changed");
assert.deepEqual(registration.allowedModes, ["tier-01-v2"], "capability registry mode allow-list changed");
assert.equal(registration.activationPolicy.registryRuntimeEligible, true);
for (const blockedField of [
  "medicalResearchMappingEligible",
  "criticalityEligible",
  "economicSchedulingEligible",
  "referralOutcomesEligible",
]) {
  assert.equal(
    registration.activationPolicy[blockedField],
    false,
    `${blockedField} cannot be enabled without authored activation data`,
  );
}

const canonicalRegistry = JSON.parse(canonicalBytes.toString("utf8"));
loader.validateCapabilityRegistryIdentity(registration, canonicalRegistry);
const validation = capabilityApi.validateRegistry(canonicalRegistry, {
  expectedCount: registration.expectedCounts.capabilities,
  requireCanonicalIdentity: true,
});
assert.equal(validation.valid, true, validation.errors.join(", "));
assert.equal(validation.counts.capabilities, 447);
assert.equal(validation.counts.requiresEdges, 324);
assert.equal(validation.counts.anyOfEdges, 13);
assert.deepEqual(validation.duplicateIds, []);
assert.deepEqual(validation.missingReferences, []);
assert.deepEqual(validation.selfReferences, []);
assert.deepEqual(validation.cycles, []);

const packageManifest = await readJson(path.join(
  projectRoot,
  "content/medical-packs/vetgeme-master-2026-07-14/PACKAGE_MANIFEST.json",
));
assert.equal(packageManifest.packageId, registration.packageId);
assert.equal(packageManifest.packageVersion, registration.packageVersion);
assert.equal(packageManifest.systems?.capabilityCount, registration.expectedCounts.capabilities);
assert.equal(packageManifest.systems?.registry, "systems/catalog/capability-registry.json");

const shippedPackEntries = (await readdir(path.dirname(canonicalPath), { withFileTypes: true }))
  .map((entry) => `${entry.isDirectory() ? "directory" : "file"}:${entry.name}`)
  .sort();
assert.deepEqual(
  shippedPackEntries,
  ["file:capability-registry.json"],
  "the canonical system pack must ship only the registered JSON document",
);

let handoffCompared = false;
if (process.argv.includes("--compare-handoff")) {
  const handoffBytes = await readFile(path.join(
    projectRoot,
    "handoff/vetgeme-master-package/systems/catalog/capability-registry.json",
  ));
  assert.equal(
    Buffer.compare(canonicalBytes, handoffBytes),
    0,
    "canonical capability registry is not byte-identical to the audited handoff source",
  );
  handoffCompared = true;
}

const unlockCounts = countBy(canonicalRegistry.capabilities, "unlock");
const typeCounts = countBy(canonicalRegistry.capabilities, "type");
const effectiveUnlock = capabilityApi.effectiveUnlockReport(canonicalRegistry);

console.log(JSON.stringify({
  status: "passed",
  registration: {
    capabilityRegistryId: registration.capabilityRegistryId,
    capabilityRegistryVersion: registration.capabilityRegistryVersion,
    packageId: registration.packageId,
    packageVersion: registration.packageVersion,
    sourceDigest: registration.sourceDigest,
    allowedModes: registration.allowedModes,
    activationPolicy: registration.activationPolicy,
  },
  counts: {
    ...validation.counts,
    requiresNodes: canonicalRegistry.capabilities.filter((item) => item.requires).length,
    anyOfNodes: canonicalRegistry.capabilities.filter((item) => item.anyOf).length,
    capacityPerDay: canonicalRegistry.capabilities.filter((item) => item.capacityPerDay !== undefined).length,
    turnaroundDays: canonicalRegistry.capabilities.filter((item) => item.turnaroundDays !== undefined).length,
    categoricalTurnaround: canonicalRegistry.capabilities.filter((item) => item.turnaround !== undefined).length,
  },
  unlockCounts,
  typeCounts,
  effectiveUnlockDeferred: effectiveUnlock.deferred,
  canonicalRuntimeFiles: shippedPackEntries,
  handoffCompared,
}, null, 2));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function countBy(items, field) {
  return Object.fromEntries([...items.reduce((counts, item) => {
    const value = item[field] ?? "<missing>";
    counts.set(value, (counts.get(value) || 0) + 1);
    return counts;
  }, new Map())].sort(([left], [right]) => left.localeCompare(right)));
}
