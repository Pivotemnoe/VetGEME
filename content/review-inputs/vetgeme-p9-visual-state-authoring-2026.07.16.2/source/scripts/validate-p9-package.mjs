#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(root, "..");
const read = (file, base = root) => JSON.parse(fs.readFileSync(path.join(base, file), "utf8"));
const manifest = read("MANIFEST.json");
const policy = read("source/visual-policy.json");
const rooms = read("generated/room-visual-state-catalog.json");
const equipment = read("generated/equipment-visual-state-catalog.json");
const staff = read("generated/staff-visual-state-catalog.json");
const hud = read("generated/hud-data-contract.json");
const art = read("art/ASSET_MANIFEST.json", repoRoot);
const p5 = read("p5-production-authoring-2026.07.16.2/generated/resource-catalog.json", repoRoot);
const artIds = new Set(art.assets.map((item) => item.id));
const referenced = [
  ...rooms.rooms.flatMap((item) => [
    ...item.baseAssetIds,
    ...Object.values(item.visualStates).flatMap((state) => state.overlayAssetIds || [])
  ]),
  ...equipment.equipment.flatMap((item) => [
    ...item.baseAssetIds,
    ...Object.values(item.visualStates).flatMap((state) => state.overlayAssetIds || [])
  ]),
  ...staff.staff.flatMap((item) => item.candidateAssetIds)
];
assert.equal(rooms.rooms.length, p5.resources.filter((item) => item.resourceKind === "room").length);
assert.equal(equipment.equipment.length, p5.resources.filter((item) => item.resourceKind === "equipment").length);
assert.equal(staff.staff.length, p5.resources.filter((item) => item.resourceKind === "staff").length);
assert.ok(referenced.every((id) => artIds.has(id)));
assert.ok(equipment.equipment.every((item) => item.title && !item.title.includes("_")));
assert.ok(rooms.rooms.every((item) => Object.values(item.visualStates).every((state) => state.label || state.domStatus)));
assert.ok(equipment.equipment.every((item) => Object.values(item.visualStates).every((state) => state.label)));
assert.ok(equipment.equipment.filter((item) => item.baseAssetIds.length === 0).every((item) => item.missingAssetFallback?.capabilityMustRemainStateDriven === true));
assert.equal(policy.renderBoundaries.rendererMayMutateSimulation, false);
assert.equal(policy.renderBoundaries.visualPresenceMayGrantOwnership, false);
assert.equal(policy.humanTextRules.rawIdsPlayerVisible, false);
assert.equal(policy.humanTextRules.ownerAndDoctorSpeechUsesConversationalRussian, true);
assert.equal(policy.playfieldProtection.centerPlayfieldMustRemainClear, true);
assert.equal(hud.disclosure.normalPlayCenterOverlay, false);
assert.equal(hud.persistentSurfaces.length, 9);
assert.equal(manifest.boundaries.designChanged, false);
assert.equal(manifest.boundaries.saveSchemaChanged, false);

const report = {
  schemaVersion: 1,
  reportId: "vetgeme-p9-visual-state-validation",
  reportVersion: manifest.packageVersion,
  validatedAt: "2026-07-16",
  status: "pass",
  checks: {
    roomCoverage: rooms.rooms.length,
    equipmentCoverage: equipment.equipment.length,
    staffCoverage: staff.staff.length,
    referencedAssets: new Set(referenced).size,
    missingAssetReferences: [...new Set(referenced)].filter((id) => !artIds.has(id)).length,
    hudSurfaces: hud.persistentSurfaces.length,
    redesignPerformed: false,
    runtimeChanged: false
  },
  limitations: [
    "This package specifies projections and human-readable states; it does not edit the live scene.",
    "One staff room and several small devices intentionally use DOM fallback labels until separate art exists.",
    "Shared analyzer and procedure-room shells require a visible human label so they cannot be confused."
  ]
};
fs.writeFileSync(path.join(root, "reports/VALIDATION_REPORT.json"), `${JSON.stringify(report, null, 2)}\n`);
manifest.status = "author_complete_validation_passed";
manifest.validation = { status: "pass", report: "reports/VALIDATION_REPORT.json", referencedAssets: report.checks.referencedAssets };
fs.writeFileSync(path.join(root, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
