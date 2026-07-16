#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const reviewRoot = path.join(root, "content/review-inputs/vetgeme-p9-visual-state-authoring-2026.07.16.2");
const read = (relativePath, base = root) => JSON.parse(fs.readFileSync(path.join(base, relativePath), "utf8"));
const crosswalk = read("host/runtime-v2-crosswalk.json", reviewRoot);
const rooms = read("source/generated/room-visual-state-catalog.json", reviewRoot);
const equipment = read("source/generated/equipment-visual-state-catalog.json", reviewRoot);
const staff = read("source/generated/staff-visual-state-catalog.json", reviewRoot);
const manifest = read("art/runtime-v2/manifest.json");
const layout = read("art/runtime-v2/scene-layout.json");

const sorted = (values) => [...values].sort((left, right) => left.localeCompare(right, "en"));
const referenced = sorted(new Set([
  ...rooms.rooms.flatMap((record) => [
    ...record.baseAssetIds,
    ...Object.values(record.visualStates).flatMap((state) => state.overlayAssetIds || [])
  ]),
  ...equipment.equipment.flatMap((record) => [
    ...record.baseAssetIds,
    ...Object.values(record.visualStates).flatMap((state) => state.overlayAssetIds || [])
  ]),
  ...staff.staff.flatMap((record) => record.candidateAssetIds)
]));
const aliases = new Map(crosswalk.assetAliases.map((record) => [record.sourceAssetId, record]));
const runtimeAssetIds = new Set(manifest.assets.map((record) => record.id));
assert.equal(crosswalk.runtimeEligible, false);
assert.equal(crosswalk.unplacedPolicy, "dom_fallback_only_no_coordinate_inference");
assert.equal(aliases.size, 31);
assert.deepEqual(sorted(aliases.keys()), referenced, "crosswalk must cover every and only P9-authored asset reference");
for (const [sourceAssetId, alias] of aliases) {
  assert.ok(runtimeAssetIds.has(alias.targetAssetId), `${sourceAssetId} maps to missing runtime asset ${alias.targetAssetId}`);
  assert.ok(alias.evidence, `${sourceAssetId} lacks explicit mapping evidence`);
}

const sceneRoomIds = new Set(layout.rooms.map((record) => record.id));
const placementIds = new Set(layout.placements.map((record) => record.id));
const roomOverlayAssetIds = [
  "progression.locked-door-overlay",
  "progression.delivery-pallet",
  "progression.stacked-boxes",
  "progression.opened-crates",
  "progression.covered-equipment"
];
assert.equal(
  crosswalk.targetSceneLayoutSha256,
  "de71c885b5f54b2a199b65228a0000106d8be02e6a0b61b8141ed533ee2eec90",
  "explicit overlay anchors must stay pinned to the reviewed scene layout"
);
const boundRoomResourceIds = [];
const boundRoomPlacementIds = [];
for (const binding of crosswalk.sceneBindings.rooms) {
  assert.ok(sceneRoomIds.has(binding.sceneRoomId), `missing placed scene room ${binding.sceneRoomId}`);
  const sceneRoom = layout.rooms.find((record) => record.id === binding.sceneRoomId);
  boundRoomResourceIds.push(binding.resourceId);
  for (const placementId of binding.placementIds) {
    assert.ok(placementIds.has(placementId), `missing placed room object ${placementId}`);
    boundRoomPlacementIds.push(placementId);
  }
  assert.deepEqual(
    sorted(binding.overlayAnchors.map((anchor) => anchor.assetId)),
    sorted(roomOverlayAssetIds),
    `${binding.resourceId}: exact per-asset room overlay anchors are required`
  );
  for (const anchor of binding.overlayAnchors) {
    assert.ok(Number.isFinite(anchor.x) && Number.isFinite(anchor.y)
      && Number.isFinite(anchor.zFootY) && Number.isFinite(anchor.scale) && anchor.scale > 0,
    `${binding.resourceId}/${anchor.assetId}: invalid explicit overlay anchor`);
    assert.ok(anchor.x >= sceneRoom.position.x
      && anchor.x <= sceneRoom.position.x + sceneRoom.logicalBox.width,
    `${binding.resourceId}/${anchor.assetId}: overlay x lies outside its reviewed room`);
    assert.ok(anchor.y >= sceneRoom.position.y
      && anchor.y <= sceneRoom.position.y + sceneRoom.logicalBox.height,
    `${binding.resourceId}/${anchor.assetId}: overlay y lies outside its reviewed room`);
    if (anchor.assetId === "progression.locked-door-overlay") {
      assert.ok(anchor.zFootY > sceneRoom.foregroundSlice.zFootY,
        `${binding.resourceId}: locked door must draw after the foreground wall`);
    } else {
      const foregroundTop = sceneRoom.position.y + sceneRoom.foregroundSlice.sourceY;
      assert.ok(anchor.y < foregroundTop,
        `${binding.resourceId}/${anchor.assetId}: interior transition art would be hidden by the foreground wall`);
    }
  }
}
assert.deepEqual(sorted(boundRoomResourceIds), sorted([
  "room.consult.1",
  "room.lab.basic",
  "room.reception.1",
  "room.waiting.1"
]));
assert.deepEqual(sorted(boundRoomPlacementIds), sorted(placementIds),
  "every current runtime-v2 placement must belong to one explicit placed-room binding");
assert.deepEqual(crosswalk.sceneBindings.equipment, [{
  resourceId: "equipment.microscope",
  placementIds: ["lab-microscope"]
}]);
assert.deepEqual(crosswalk.sceneBindings.staff, [], "staff must remain roster-only without authored scene coordinates");

const allRoomIds = rooms.rooms.map((record) => record.resourceId);
const allEquipmentIds = equipment.equipment.map((record) => record.resourceId);
const allStaffIds = staff.staff.map((record) => record.resourceId);
assert.deepEqual(
  sorted([...boundRoomResourceIds, ...crosswalk.domFallbackBindings.rooms]),
  sorted(allRoomIds),
  "room Canvas and DOM bindings must be an exact partition"
);
assert.deepEqual(
  sorted([crosswalk.sceneBindings.equipment[0].resourceId, ...crosswalk.domFallbackBindings.equipment]),
  sorted(allEquipmentIds),
  "equipment Canvas and DOM bindings must be an exact partition"
);
assert.deepEqual(sorted(crosswalk.domFallbackBindings.staff), sorted(allStaffIds));
assert.ok(crosswalk.domFallbackBindings.staff.includes("staff.administrator.lebedeva"),
  "administrator must remain roster-only; P9 must not place a secretary in the clinic scene");

console.log(JSON.stringify({
  status: "passed",
  sourceAssetAliases: aliases.size,
  targetAssetsVerified: new Set(crosswalk.assetAliases.map((record) => record.targetAssetId)).size,
  canvasRoomBindings: crosswalk.sceneBindings.rooms.length,
  canvasEquipmentBindings: crosswalk.sceneBindings.equipment.length,
  canvasStaffBindings: crosswalk.sceneBindings.staff.length,
  domFallbackRooms: crosswalk.domFallbackBindings.rooms.length,
  domFallbackEquipment: crosswalk.domFallbackBindings.equipment.length,
  domRosterStaff: crosswalk.domFallbackBindings.staff.length,
  explicitRoomOverlayAnchors: crosswalk.sceneBindings.rooms
    .reduce((total, binding) => total + binding.overlayAnchors.length, 0),
  coordinateInference: false
}, null, 2));
