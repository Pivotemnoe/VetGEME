#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageRoot, "..");
const operationalRoot = path.join(repoRoot, "operational-production-authoring-2026.07.16.2");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(relativePath, value) {
  const file = path.join(packageRoot, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

const policy = readJson(path.join(packageRoot, "source/p5-policy.json"));
const registry = readJson(path.join(repoRoot, "content/system-packs/vetgeme-master-2026-07-14/capability-registry.json"));
const preliminaryOperations = readJson(path.join(packageRoot, "generated/capability-operations-map.json"));
const preliminaryResources = readJson(path.join(packageRoot, "generated/resource-catalog.json"));
const p4Requirements = readJson(path.join(operationalRoot, "source/p4-operational-requirements.json"));
const p6Economy = readJson(path.join(operationalRoot, "generated/p6/economy-catalog.json"));

const capabilityById = new Map(registry.capabilities.map((item) => [item.id, item]));
const resourceById = new Map(preliminaryResources.resources.map((item) => [item.resourceId, item]));
const roomById = new Map(policy.rooms.map((item) => [item.roomId, item]));
const staffById = new Map(policy.staff.map((item) => [item.staffId, item]));

const physicalTypes = new Set([
  "small_equipment",
  "laboratory_equipment",
  "treatment_equipment",
  "imaging_equipment",
  "consumable_device"
]);

function statePredicatesForCapability(capabilityId) {
  const capability = capabilityById.get(capabilityId);
  if (!capability) throw new Error(`Unknown capability ${capabilityId}.`);
  const predicates = [];
  if (physicalTypes.has(capability.type)) {
    predicates.push(
      { predicate: "resource_owned", resourceId: `equipment.${capabilityId}`, authority: "p6.assetState" },
      { predicate: "delivery_complete", resourceId: `equipment.${capabilityId}`, authority: "p6.assetState" },
      { predicate: "training_complete", resourceId: `equipment.${capabilityId}`, authority: "p5.trainingState" },
      { predicate: "maintenance_current", resourceId: `equipment.${capabilityId}`, authority: "p6.maintenanceState" }
    );
  }
  if (capability.type === "consumable_set") {
    const economy = p6Economy.capabilityEconomics.find((item) => item.capabilityId === capabilityId);
    predicates.push({
      predicate: "inventory_units_gte",
      inventoryCategoryId: economy?.inventoryPolicy?.categoryId,
      minimumUnits: economy?.inventoryPolicy?.unitsPerUse || 1,
      authority: "p6.inventoryState"
    });
  }
  if (capability.type === "staff_skill") {
    predicates.push({
      predicate: "qualified_staff_scheduled",
      capabilityId,
      eligibleStaffIds: uniqueSorted(policy.staff.filter((staff) => staff.skills.includes(capabilityId)).map((staff) => staff.staffId)),
      authority: "p5.staffAndShiftState"
    });
  }
  if (["room", "room_capability", "room_protocol"].includes(capability.type)) {
    const eligibleRoomIds = uniqueSorted(policy.rooms.filter((room) => room.capabilities.includes(capabilityId)).map((room) => room.roomId));
    predicates.push({
      predicate: "ready_room_available",
      capabilityId,
      eligibleRoomIds,
      authority: "p5.roomState"
    });
  }
  if (capability.type === "external_service") {
    predicates.push({
      predicate: "referral_coordination_slot_available",
      capabilityId,
      eligibleStaffIds: ["staff.administrator.lebedeva", "staff.doctor.morozov", "staff.doctor.sokolova"],
      eligibleRoomIds: ["room.reception.1"],
      authority: "p5.scheduler"
    });
  }
  return predicates;
}

const exactCapabilityOperations = preliminaryOperations.capabilities.map((operation) => ({
  ...operation,
  statePredicates: statePredicatesForCapability(operation.capabilityId),
  mappingAuthority: "author_frozen_exact_capability_resource_map_v2",
  tokenOrSubstringResolutionForbidden: true
}));

const baselineRoomIds = new Set([
  "room.reception.1",
  "room.waiting.1",
  "room.consult.1",
  "room.lab.basic",
  "room.storage.1"
]);

const roomCommercialTerms = {
  "room.isolation.1": { purchasePrice: 8500, deliveryDays: 3, readyingDays: 1 },
  "room.consult.2": { purchasePrice: 12000, deliveryDays: 5, readyingDays: 1 },
  "room.staff.1": { purchasePrice: 6000, deliveryDays: 3, readyingDays: 1 },
  "room.procedure.1": { purchasePrice: 16000, deliveryDays: 5, readyingDays: 2 },
  "room.imaging.1": { purchasePrice: 18000, deliveryDays: 5, readyingDays: 2 },
  "room.short_stay.1": { purchasePrice: 14000, deliveryDays: 5, readyingDays: 2 },
  "room.dental.1": { purchasePrice: 22000, deliveryDays: 6, readyingDays: 2 }
};

const roomAssets = policy.rooms.map((room) => {
  const baseline = baselineRoomIds.has(room.roomId);
  const terms = roomCommercialTerms[room.roomId] || null;
  if (!baseline && !terms) throw new Error(`Missing commercial terms for ${room.roomId}.`);
  return {
    roomId: room.roomId,
    assetCatalogId: `asset.${room.roomId}`,
    unlock: room.unlock,
    acquisitionMode: baseline ? "baseline_leasehold" : "player_purchase",
    purchasePrice: baseline ? 0 : terms.purchasePrice,
    deliveryDays: baseline ? 0 : terms.deliveryDays,
    readyingDays: baseline ? 0 : terms.readyingDays,
    startsOwned: baseline,
    startsDelivered: baseline,
    startsReady: baseline,
    visualPresenceGrantsOwnership: false,
    lifecycleAuthority: "p6.assetState_and_p5.roomState"
  };
});

const startingInventory = [
  { categoryId: "general_exam", units: 30 },
  { categoryId: "cytology", units: 30 },
  { categoryId: "urine", units: 15 },
  { categoryId: "blood", units: 15 },
  { categoryId: "rapid_tests", units: 6 },
  { categoryId: "wound_procedure", units: 12 },
  { categoryId: "infusion", units: 8 },
  { categoryId: "oxygen", units: 4 },
  { categoryId: "anesthesia", units: 5 },
  { categoryId: "infection_control", units: 30 }
];

const startingEquipmentEvidence = [
  {
    resourceId: "equipment.otoscope",
    owned: true,
    delivered: true,
    trainedStaffIds: ["staff.doctor.morozov", "staff.doctor.sokolova"],
    maintenanceCurrentThroughCampaignDay: 20,
    evidenceId: "new_campaign_baseline_otoscope_commissioning"
  },
  {
    resourceId: "equipment.microscope",
    owned: true,
    delivered: true,
    trainedStaffIds: ["staff.doctor.morozov", "staff.doctor.sokolova"],
    maintenanceCurrentThroughCampaignDay: 15,
    evidenceId: "new_campaign_baseline_microscope_commissioning"
  }
];

const lifecycleCommands = [
  { command: "hire_staff", authority: "p5.staffState", requiredFields: ["commandId", "staffId", "hiredAt"], result: "staff_hired_not_scheduled" },
  { command: "assign_shift", authority: "p5.staffAndShiftState", requiredFields: ["commandId", "staffId", "shiftId", "startAt", "endAt"], result: "shift_capacity_available_if_rest_valid" },
  { command: "update_shift", authority: "p5.staffAndShiftState", requiredFields: ["commandId", "shiftId", "startAt", "endAt"], result: "future_unreserved_capacity_updated" },
  { command: "remove_shift", authority: "p5.staffAndShiftState", requiredFields: ["commandId", "shiftId"], result: "future_unreserved_capacity_removed" },
  { command: "purchase_asset", authority: "p6.assetState", requiredFields: ["commandId", "assetCatalogId", "purchasedAt", "price"], result: "pending_delivery" },
  { command: "mark_delivery_complete", authority: "p6.assetState", requiredFields: ["commandId", "assetId", "deliveredAt"], result: "delivered_not_ready" },
  { command: "complete_training", authority: "p5.trainingState", requiredFields: ["commandId", "assetId", "staffId", "completedAt"], result: "staff_asset_training_recorded" },
  { command: "mark_room_ready", authority: "p5.roomState", requiredFields: ["commandId", "roomId", "readyAt"], result: "room_schedulable_if_owned_and_delivered" },
  { command: "start_maintenance", authority: "p6.maintenanceState", requiredFields: ["commandId", "assetId", "startAt", "endAt"], result: "resource_unavailable_window_appended" },
  { command: "complete_maintenance", authority: "p6.maintenanceState", requiredFields: ["commandId", "assetId", "completedAt", "nextDueAt"], result: "maintenance_current" },
  { command: "receive_stock", authority: "p6.inventoryState", requiredFields: ["commandId", "categoryId", "units", "receivedAt"], result: "inventory_incremented" },
  { command: "consume_stock", authority: "p6.inventoryState", requiredFields: ["commandId", "categoryId", "units", "reservationId"], result: "inventory_decremented_atomically" },
  { command: "retire_asset", authority: "p6.assetState", requiredFields: ["commandId", "assetId", "retiredAt"], result: "future_use_forbidden" }
];

function resourcesWithCapability(capabilityId) {
  const resources = [];
  for (const room of policy.rooms) {
    if (room.capabilities.includes(capabilityId)) resources.push(room.roomId);
  }
  for (const staff of policy.staff) {
    if (staff.skills.includes(capabilityId) || staff.operationalCapabilities.includes(capabilityId)) resources.push(staff.staffId);
  }
  if (capabilityById.has(capabilityId) && physicalTypes.has(capabilityById.get(capabilityId).type)) {
    resources.push(`equipment.${capabilityId}`);
  }
  return uniqueSorted(resources);
}

const supplementalRequirementOperations = p4Requirements.capabilities.map((item) => {
  const resolver = item.resolver;
  const roomIds = uniqueSorted([
    ...(resolver.roomCapability ? resourcesWithCapability(resolver.roomCapability) : []),
    ...(resolver.anyRoomCapability || []).flatMap(resourcesWithCapability)
  ].filter((id) => id.startsWith("room.")));
  const staffIds = uniqueSorted([
    ...(resolver.staffCapability ? resourcesWithCapability(resolver.staffCapability) : []),
    ...(resolver.staffSkill ? resourcesWithCapability(resolver.staffSkill) : [])
  ].filter((id) => id.startsWith("staff.")));
  const equipmentIds = uniqueSorted((resolver.anyCapabilityId || []).flatMap(resourcesWithCapability).filter((id) => id.startsWith("equipment.")));
  return {
    capabilityId: item.capabilityId,
    kind: item.kind,
    authority: item.authority,
    eligibleRoomIds: roomIds,
    eligibleStaffIds: staffIds,
    eligibleEquipmentIds: equipmentIds,
    inventoryCategoryId: resolver.inventoryCategoryId || null,
    schedulerCommand: resolver.command || null,
    fallbackRouteId: resolver.fallbackRouteId || null,
    resolutionMode: "exact_authored_resource_ids",
    unknownOrUnavailableFailsClosed: true
  };
});

const resourceLifecycleSeeds = preliminaryResources.resources.map((resource) => {
  if (resource.resourceKind === "staff") {
    const staff = staffById.get(resource.resourceId);
    return {
      resourceId: resource.resourceId,
      state: staff.startsHired ? "hired_unscheduled" : "not_hired",
      evidenceIds: staff.startsHired ? [`new_campaign_baseline_hire_${staff.legacyId || staff.staffId}`] : [],
      activationRequires: staff.startsHired ? ["valid_shift"] : ["hire_record", "valid_shift"]
    };
  }
  if (resource.resourceKind === "room") {
    const asset = roomAssets.find((item) => item.roomId === resource.resourceId);
    return {
      resourceId: resource.resourceId,
      state: asset.startsReady ? "owned_delivered_ready" : "not_owned",
      evidenceIds: asset.startsReady ? [`new_campaign_baseline_room_${resource.resourceId}`] : [],
      activationRequires: ["owned", "delivery_complete", "room_ready"]
    };
  }
  const evidence = startingEquipmentEvidence.find((item) => item.resourceId === resource.resourceId);
  return {
    resourceId: resource.resourceId,
    state: evidence ? "owned_delivered_trained_maintained" : "not_owned",
    evidenceIds: evidence ? [evidence.evidenceId] : [],
    activationRequires: ["owned", "delivery_complete", "training_complete", "maintenance_current"]
  };
});

const handoffContract = {
  schemaVersion: 1,
  contractId: "vetgeme-p5-handoff-contract",
  contractVersion: "2026.07.16.2",
  allowedTaskStates: ["active"],
  commandFields: policy.handoffRuntimeContract.commandFields,
  reassignmentFields: policy.handoffRuntimeContract.reassignmentFields,
  medicalPayloadForbidden: true,
  policyBreakpoints: policy.handoffPolicies,
  invariants: [
    "target_resource_must_be_active_available_and_capable",
    "source_reservation_owned_before_command",
    "all_reassignments_validate_before_any_mutation",
    "release_and_reserve_are_atomic",
    "elapsed_work_and_medical_payload_are_unchanged",
    "command_id_is_idempotent",
    "reload_reconstructs_same_reservation_ownership"
  ],
  forbidden: [
    "handoff_before_task_start",
    "handoff_after_task_completion",
    "partial_reassignment_commit",
    "renderer_owned_reservation",
    "medical_result_mutation"
  ]
};

const requiredSkills = registry.capabilities.filter((item) => item.type === "staff_skill").map((item) => item.id).sort();
const coverage = requiredSkills.map((skillId) => ({
  skillId,
  eligibleStaffIds: uniqueSorted(policy.staff.filter((staff) => staff.skills.includes(skillId)).map((staff) => staff.staffId)),
  earliestUnlock: uniqueSorted(policy.staff.filter((staff) => staff.skills.includes(skillId)).map((staff) => staff.unlock))[0]
}));

writeJson("source/p5-exact-capability-resource-map.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p5-exact-capability-resource-map",
  catalogVersion: "2026.07.16.2",
  status: "author_complete_programmer_adapter_required",
  runtimeEligible: false,
  capabilities: exactCapabilityOperations,
  supplementalCapabilities: supplementalRequirementOperations
});

writeJson("source/p5-resource-lifecycle.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p5-resource-lifecycle",
  catalogVersion: "2026.07.16.2",
  status: "author_complete_programmer_adapter_required",
  runtimeEligible: false,
  commands: lifecycleCommands,
  roomAssets,
  startingInventory,
  startingEquipmentEvidence,
  resourceLifecycleSeeds,
  invariants: {
    unlockIsNotOwnership: true,
    purchaseDoesNotActivate: true,
    visualPresenceDoesNotActivate: true,
    missingEvidenceFailsClosed: true,
    savePersistsCommandsAndDerivedResourceState: true,
    saveSchemaChangeAllowedWithoutMigration: false
  }
});

writeJson("source/p5-handoff-contract.json", handoffContract);

writeJson("reports/P5_V2_AUTHOR_DECISION_MATRIX.json", {
  schemaVersion: 1,
  reportId: "vetgeme-p5-v2-author-decision-matrix",
  reportVersion: "2026.07.16.2",
  counts: {
    canonicalCapabilities: exactCapabilityOperations.length,
    supplementalCapabilities: supplementalRequirementOperations.length,
    resources: resourceLifecycleSeeds.length,
    lifecycleCommands: lifecycleCommands.length,
    roomAssets: roomAssets.length,
    startingInventoryCategories: startingInventory.length,
    startingEquipmentEvidence: startingEquipmentEvidence.length,
    staffSkills: coverage.length,
    uncoveredStaffSkills: coverage.filter((item) => item.eligibleStaffIds.length === 0).length
  },
  staffingCoverage: coverage,
  productOwnerDecision: {
    recommendation: "accept_as_30_day_candidate_then_tune_only_from_simulation_evidence",
    accepted: false,
    reason: "product_owner_acceptance_is_external_to_author_package"
  },
  gates: {
    capabilityTokenMatchingAllowed: false,
    lifecycleStateMayBeInferredFromVisual: false,
    handoffMayMutateMedicalPayload: false,
    unknownResourceFailsClosed: true
  }
});

console.log(JSON.stringify({
  capabilities: exactCapabilityOperations.length,
  supplementalCapabilities: supplementalRequirementOperations.length,
  resources: resourceLifecycleSeeds.length,
  lifecycleCommands: lifecycleCommands.length,
  roomAssets: roomAssets.length,
  staffSkills: coverage.length
}, null, 2));
