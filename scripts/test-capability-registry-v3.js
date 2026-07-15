#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const registryPath = path.join(root, "content/system-packs/vetgeme-master-2026-07-14/capability-registry.json");
const registryBytes = fs.readFileSync(registryPath);
const registry = JSON.parse(registryBytes);
const capabilityApi = require(path.join(root, "systems/capability-registry-v3.js"));

const EXPECTED_SHA256 = "16ff64c015a8edb302c15289540a4ed760cfc356d832bca31094f992b1da3c81";
const EXPECTED_START_IDS = [
  "general_exam", "temperature", "body_weight", "body_condition_score", "muscle_condition_score",
  "abdominal_palpation", "digital_rectal_exam", "auscultation", "respiratory_rate", "otoscope",
  "microscope", "ear_cytology", "skin_cytology", "skin_impression_cytology", "skin_tape_cytology",
  "cytology_consumables", "safe_referral", "trained_dermatology_sampling", "skin_exam",
  "hydration_assessment", "respiratory_exam", "local_exam", "pain_assessment", "paw_nail_exam",
  "stabilization", "analgesia", "ear_exam"
];

assert.equal(crypto.createHash("sha256").update(registryBytes).digest("hex"), EXPECTED_SHA256);
assert.equal(registry.registryId, capabilityApi.REGISTRY_ID);
assert.equal(registry.registryVersion, capabilityApi.REGISTRY_VERSION);
assert.equal(registry.capabilities.length, capabilityApi.EXPECTED_CAPABILITY_COUNT);

const validation = capabilityApi.validateRegistry(registry);
assert.deepEqual(validation.errors, []);
assert.equal(validation.valid, true);
assert.equal(validation.counts.capabilities, 447);
assert.equal(validation.counts.requiresEdges, 324);
assert.equal(validation.counts.anyOfEdges, 13);
assert.deepEqual(validation.cycles, []);
assert.deepEqual(validation.missingReferences, []);

const startIds = registry.capabilities.filter((item) => item.unlock === "start").map((item) => item.id);
assert.deepEqual(startIds, EXPECTED_START_IDS);
const index = capabilityApi.buildIndex(registry);
for (const id of startIds) {
  const capability = index.byId[id];
  for (const dependencyId of [...(capability.requires || []), ...(capability.anyOf || [])]) {
    assert.equal(index.byId[dependencyId].unlock, "start", `${id} has a non-start dependency ${dependencyId}`);
  }
}

assert.deepEqual([1, 5, 6, 10, 11, 15, 16, 20, 21, 25, 26, 30, 31].map(capabilityApi.capabilityPhaseForDay), [
  "start", "start", "chapter_2", "chapter_2", "chapter_3", "chapter_3", "chapter_4",
  "chapter_4", "chapter_5", "chapter_5", "post_chapter_5", "post_chapter_5", "post_campaign"
]);

const sparse = capabilityApi.createSparseState(registry, {
  cytology_consumables: { available: false },
  advanced_imaging_referral: { available: true }
});
assert.deepEqual(Object.keys(sparse.entries).sort(), ["advanced_imaging_referral", "cytology_consumables"]);
const ear = capabilityApi.resolveCapability(index, "ear_cytology", { day: 1, state: sparse });
assert.equal(ear.available, false);
assert.equal(ear.reasonCode, "requires_unavailable");
assert.deepEqual(ear.unmetRequires, ["cytology_consumables"]);

const xrayRoute = capabilityApi.resolveCapability(index, "xray_or_referral", { day: 21, state: sparse });
assert.equal(xrayRoute.available, true);
assert.deepEqual(xrayRoute.availableAlternativeIds, ["advanced_imaging_referral"]);
const earlyUltrasoundRoute = capabilityApi.resolveCapability(index, "ultrasound_or_referral", { day: 16, state: sparse });
assert.equal(earlyUltrasoundRoute.available, false);
assert.equal(earlyUltrasoundRoute.reasonCode, "no_available_alternative");

const visualOnly = capabilityApi.createSparseState(registry, {
  advanced_imaging_referral: { visualPresence: true }
});
assert.equal(capabilityApi.resolveCapability(index, "advanced_imaging_referral", { day: 21, state: visualOnly }).reasonCode, "not_activated");

const report = capabilityApi.effectiveUnlockReport(registry);
assert.deepEqual(report.deferred.map((item) => item.id), ["feline_panleukopenia_testing", "ultrasound_or_referral"]);
assert.deepEqual(report.dependencyWarnings.map((item) => item.id), [
  "feline_tooth_resorption_assessment",
  "feline_panleukopenia_testing",
  "heartworm_staged_testing",
  "ultrasound_or_referral",
  "dental_xray_or_referral"
]);

const cycleFixture = {
  schemaVersion: 1,
  registryId: "fixture",
  registryVersion: "fixture",
  status: "fixture",
  rules: {
    medicalResultsAreAuthored: true,
    missingCapabilityRequiresSafeRoute: true,
    visualPresenceDoesNotGrantCapability: true,
    localCapabilityRequiresAllDependencies: true
  },
  capabilities: [
    { id: "fixture_a", type: "clinical_action", unlock: "start", requires: ["fixture_b"] },
    { id: "fixture_b", type: "clinical_action", unlock: "start", requires: ["fixture_a"] }
  ]
};
const cycleValidation = capabilityApi.validateRegistry(cycleFixture, { expectedCount: 2, requireCanonicalIdentity: false });
assert.equal(cycleValidation.valid, false);
assert.equal(cycleValidation.cycles.length, 1);

assert.equal(globalThis.PET_CLINIC_CAPABILITY_REGISTRY_V3, capabilityApi);
console.log("capability-registry-v3: ok (447 capabilities, canonical SHA-256 verified)");
