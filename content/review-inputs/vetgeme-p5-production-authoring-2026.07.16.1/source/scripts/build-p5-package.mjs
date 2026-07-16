#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageRoot, "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(relativePath, value) {
  const file = path.join(packageRoot, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))].sort();
}

const policy = readJson(path.join(packageRoot, "source/p5-policy.json"));
const capabilityRegistry = readJson(path.join(repoRoot, "content/system-packs/vetgeme-master-2026-07-14/capability-registry.json"));
const researchCatalog = readJson(path.join(repoRoot, "operational-production-authoring/generated/p3/research-catalog.json"));
const usagePolicy = readJson(path.join(repoRoot, "operational-production-authoring/generated/p3/investigation-usage-policy.json"));
const economyCatalog = readJson(path.join(repoRoot, "operational-production-authoring/generated/p6/economy-catalog.json"));

const capabilityById = new Map(capabilityRegistry.capabilities.map((item) => [item.id, item]));
const economyByCapability = new Map(economyCatalog.capabilityEconomics.map((item) => [item.capabilityId, item]));
const staffById = new Map(policy.staff.map((item) => [item.staffId, item]));
const roomById = new Map(policy.rooms.map((item) => [item.roomId, item]));

const physicalTypes = new Set(["small_equipment", "laboratory_equipment", "treatment_equipment", "imaging_equipment", "consumable_device"]);
const nonTaskTypes = new Set(["small_equipment", "laboratory_equipment", "treatment_equipment", "imaging_equipment", "consumable_set", "consumable_device", "staff_skill", "room", "room_capability"]);

function dependencyClosure(capabilityIds) {
  const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const capability = capabilityById.get(id);
    if (!capability) throw new Error(`Unknown capability ${id}.`);
    for (const dependency of capability.requires || []) visit(dependency);
  }
  for (const id of capabilityIds) visit(id);
  return [...visited].sort();
}

function classFor(capability) {
  const rule = policy.taskClassRules.find((item) => item.capabilityTypes.includes(capability.type));
  if (!rule) throw new Error(`No task class for capability type ${capability.type}.`);
  return rule;
}

function durationFor(capabilityIds, fallbackClass) {
  let duration = fallbackClass.durationMinutes;
  for (const override of policy.durationOverrides) {
    if (capabilityIds.some((id) => override.capabilityIds.includes(id))) duration = Math.max(duration, override.durationMinutes);
  }
  return duration;
}

function roomCapabilityFor(capabilityIds, fallback) {
  for (const override of policy.roomRoutingOverrides) {
    if (capabilityIds.some((id) => override.capabilityIds.includes(id))) return override.roomCapability;
  }
  return fallback;
}

function eligibleStaff(capability, fallbackCapability = null) {
  const ids = policy.staff
    .filter((staff) => staff.operationalCapabilities.includes(capability) || staff.skills.includes(capability))
    .map((staff) => staff.staffId);
  if (!ids.length && fallbackCapability) {
    return uniqueSorted(policy.staff
      .filter((staff) => staff.operationalCapabilities.includes(fallbackCapability) || staff.skills.includes(fallbackCapability))
      .map((staff) => staff.staffId));
  }
  return uniqueSorted(ids);
}

function eligibleRooms(capability) {
  return uniqueSorted(policy.rooms.filter((room) => room.capabilities.includes(capability)).map((room) => room.roomId));
}

const staffResources = policy.staff.map((staff) => ({
  resourceId: staff.staffId,
  resourceKind: "staff",
  title: staff.name,
  role: staff.role,
  unlock: staff.unlock,
  startsActive: staff.startsHired,
  activationRequirements: staff.startsHired ? [] : ["hire_record", "shift_assignment"],
  runtimeResourceTemplate: {
    id: staff.staffId,
    capacity: staff.capacity,
    capabilities: uniqueSorted([...staff.operationalCapabilities, ...staff.skills]),
    unavailableWindows: []
  }
}));

const roomResources = policy.rooms.map((room) => ({
  resourceId: room.roomId,
  resourceKind: "room",
  title: room.title,
  unlock: room.unlock,
  startsActive: room.startsOwned,
  visualAlias: room.visualAlias,
  activationRequirements: room.startsOwned ? [] : ["p6_asset_owned", "delivery_complete", "room_ready"],
  runtimeResourceTemplate: {
    id: room.roomId,
    capacity: room.capacity,
    capabilities: uniqueSorted(room.capabilities),
    unavailableWindows: []
  }
}));

const equipmentResources = capabilityRegistry.capabilities
  .filter((capability) => physicalTypes.has(capability.type))
  .map((capability) => {
    const economy = economyByCapability.get(capability.id);
    if (!economy?.assetPolicy) throw new Error(`Physical capability ${capability.id} lacks P6 asset policy.`);
    return {
      resourceId: `equipment.${capability.id}`,
      resourceKind: "equipment",
      capabilityId: capability.id,
      equipmentType: capability.type,
      unlock: capability.unlock,
      startsActive: economy.assetPolicy.startsOwned,
      dailyThroughputReference: capability.capacityPerDay ?? null,
      concurrentCapacity: policy.equipmentCapacityByType[capability.type],
      capacityConversionSource: "p5_authored_concurrent_capacity_not_capacityPerDay",
      activationRequirements: economy.assetPolicy.startsOwned
        ? ["maintenance_current", "required_stock_available"]
        : ["p6_asset_owned", "delivery_complete", "training_complete", "maintenance_current", "required_stock_available"],
      runtimeResourceTemplate: {
        id: `equipment.${capability.id}`,
        capacity: policy.equipmentCapacityByType[capability.type],
        capabilities: [capability.id],
        unavailableWindows: []
      }
    };
  });

const allResources = [...staffResources, ...roomResources, ...equipmentResources];
const resourceById = new Map(allResources.map((item) => [item.resourceId, item]));

function runtimeGroup(id, resourceIds, capabilityId) {
  const anyOf = resourceIds.map((resourceId) => ({ resourceId, capabilityId, units: 1 }));
  if (!anyOf.length) throw new Error(`Requirement group ${id} has no authored resources for ${capabilityId}.`);
  return { id, anyOf };
}

function operationalRequirements(capabilityIds, taskClass, options = {}) {
  const closure = dependencyClosure(capabilityIds);
  const external = closure.some((id) => capabilityById.get(id).type === "external_service");
  const staffCapability = external ? "task.referral_coordination" : taskClass.staffCapability;
  const staffFallback = external ? "role.doctor" : null;
  const exactSkills = closure.filter((id) => capabilityById.get(id).type === "staff_skill");
  const baseStaffIds = eligibleStaff(staffCapability, staffFallback);
  const onePersonQualifiedIds = baseStaffIds.filter((id) => {
    const staff = staffById.get(id);
    return exactSkills.every((skillId) => staff.skills.includes(skillId));
  });
  const staffIds = exactSkills.length > 0 && onePersonQualifiedIds.length > 0 ? onePersonQualifiedIds : baseStaffIds;
  const staffReservationCapability = exactSkills.length > 0 && onePersonQualifiedIds.length > 0
    ? exactSkills[0]
    : (staffIds.some((id) => {
        const staff = staffById.get(id);
        return staff.operationalCapabilities.includes(staffCapability) || staff.skills.includes(staffCapability);
      }) ? staffCapability : staffFallback);
  const groups = [runtimeGroup("staff", staffIds, staffReservationCapability)];

  // A single qualified employee normally satisfies all authored skills. Only when no
  // such employee exists do the requirements intentionally describe a multi-person team.
  if (exactSkills.length > 0 && onePersonQualifiedIds.length === 0) {
    for (const skillId of exactSkills) {
      groups.push(runtimeGroup(`skill.${skillId}`, eligibleStaff(skillId), skillId));
    }
  }

  let roomCapability = external ? "room.reception" : roomCapabilityFor(closure, taskClass.roomCapability);
  const roomIds = eligibleRooms(roomCapability);
  groups.push(runtimeGroup("room", roomIds, roomCapability));

  if (closure.includes("isolation_protocol") && roomCapability !== "task.isolation") {
    groups.push(runtimeGroup("room.isolation", eligibleRooms("task.isolation"), "task.isolation"));
  }

  const physical = closure.filter((id) => physicalTypes.has(capabilityById.get(id).type));
  for (const capabilityId of physical) {
    groups.push(runtimeGroup(`equipment.${capabilityId}`, [`equipment.${capabilityId}`], capabilityId));
  }

  return {
    closure,
    external,
    requirementGroups: groups,
    inventoryCapabilityIds: closure.filter((id) => capabilityById.get(id).type === "consumable_set"),
    protocolCapabilityIds: closure.filter((id) => ["staff_protocol", "room_protocol"].includes(capabilityById.get(id).type)),
    physicalResourceIds: physical.map((id) => `equipment.${id}`),
    qualifiedBySkillIds: exactSkills,
    qualificationMode: exactSkills.length === 0 ? "none" : (onePersonQualifiedIds.length > 0 ? "single_staff" : "authored_team"),
    safeRouteId: external || options.safeRouteRequired ? "safe_referral" : null
  };
}

const visitTasks = policy.visitTaskTemplates.map((template) => {
  const staffIds = uniqueSorted([
    ...eligibleStaff(template.staffCapability),
    ...(template.fallbackStaffCapability ? eligibleStaff(template.fallbackStaffCapability) : [])
  ]);
  const staffCapabilityForResource = (resourceId) => {
    const staff = staffById.get(resourceId);
    if (staff.operationalCapabilities.includes(template.staffCapability) || staff.skills.includes(template.staffCapability)) return template.staffCapability;
    return template.fallbackStaffCapability;
  };
  const roomIds = eligibleRooms(template.roomCapability);
  return {
    ...template,
    sourceType: "visit_stage",
    eligibleStaffIds: staffIds,
    eligibleRoomIds: roomIds,
    runtimeTemplate: {
      priority: template.priority,
      authoredDurationMinutes: template.durationMinutes,
      requirementGroups: [
        { id: "staff", anyOf: staffIds.map((resourceId) => ({ resourceId, capabilityId: staffCapabilityForResource(resourceId), units: 1 })) },
        { id: "room", anyOf: roomIds.map((resourceId) => ({ resourceId, capabilityId: template.roomCapability, units: 1 })) }
      ],
      urgency: template.urgency,
      safeRouteRequired: template.urgency === "urgent"
    }
  };
});

const capabilityOperations = capabilityRegistry.capabilities.map((capability) => {
  const closure = dependencyClosure([capability.id]);
  const taskClass = classFor(capability);
  let executionMode;
  if (physicalTypes.has(capability.type)) executionMode = "physical_resource";
  else if (capability.type === "consumable_set") executionMode = "inventory_only";
  else if (capability.type === "staff_skill") executionMode = "staff_qualification";
  else if (["room", "room_capability"].includes(capability.type)) executionMode = "room_resource";
  else if (capability.type === "external_service") executionMode = "external_coordination";
  else if (capability.type === "requirement_group") executionMode = "explicit_alternative_resolution";
  else executionMode = "schedulable_task";

  let requirements = null;
  if (!nonTaskTypes.has(capability.type)) requirements = operationalRequirements([capability.id], taskClass);
  const durationMinutes = durationFor(closure, taskClass);
  return {
    capabilityId: capability.id,
    capabilityType: capability.type,
    unlock: capability.unlock,
    executionMode,
    taskClassId: taskClass.classId,
    durationMinutes,
    provider: capability.provider || null,
    dependencyClosure: closure,
    eligibleStaffIds: requirements ? uniqueSorted(requirements.requirementGroups.filter((group) => group.id === "staff").flatMap((group) => group.anyOf.map((item) => item.resourceId))) : [],
    eligibleRoomIds: requirements ? uniqueSorted(requirements.requirementGroups.filter((group) => group.id.startsWith("room")).flatMap((group) => group.anyOf.map((item) => item.resourceId))) : [],
    physicalResourceIds: requirements?.physicalResourceIds || [],
    inventoryCapabilityIds: requirements?.inventoryCapabilityIds || [],
    protocolCapabilityIds: requirements?.protocolCapabilityIds || [],
    requirementGroups: requirements?.requirementGroups || [],
    safeRouteId: requirements?.safeRouteId || (executionMode === "external_coordination" ? "safe_referral" : null),
    medicalResultAuthority: "p3_or_medical_presentation_only"
  };
});

const researchTasks = researchCatalog.research.map((research) => {
  const closure = dependencyClosure(research.requires);
  const representative = closure.map((id) => capabilityById.get(id)).find((item) => !nonTaskTypes.has(item.type))
    || capabilityById.get(research.requires[0]);
  let taskClass = classFor(representative);
  if (closure.some((id) => capabilityById.get(id).type === "external_service")) {
    taskClass = policy.taskClassRules.find((item) => item.classId === "external_coordination");
  } else if (closure.some((id) => capabilityById.get(id).type === "imaging_method")) {
    taskClass = policy.taskClassRules.find((item) => item.classId === "imaging");
  } else if (closure.some((id) => capabilityById.get(id).type === "clinical_procedure")) {
    taskClass = policy.taskClassRules.find((item) => item.classId === "clinical_procedure");
  } else {
    taskClass = policy.taskClassRules.find((item) => item.classId === "research_local");
  }
  const requirements = operationalRequirements(research.requires, taskClass, { safeRouteRequired: true });
  const usageBands = uniqueSorted(usagePolicy.usages.filter((usage) => usage.researchId === research.researchId).map((usage) => usage.urgencyBandId));
  return {
    taskTemplateId: `research.${research.researchId}`,
    researchId: research.researchId,
    familyIds: research.familyIds,
    unlockAvailability: research.availability,
    taskClassId: taskClass.classId,
    durationMinutes: durationFor(closure, taskClass),
    usageUrgencyBands: usageBands,
    dependencyClosure: requirements.closure,
    inventoryCapabilityIds: requirements.inventoryCapabilityIds,
    protocolCapabilityIds: requirements.protocolCapabilityIds,
    physicalResourceIds: requirements.physicalResourceIds,
    safeRouteId: research.fallback || "safe_referral",
    runtimeTemplate: {
      priority: 220,
      authoredDurationMinutes: durationFor(closure, taskClass),
      requirementGroups: requirements.requirementGroups,
      urgency: "routine",
      safeRouteRequired: false
    },
    medicalResultAuthority: "medical_family_presentation_investigation_result"
  };
});

const researchTaskById = new Map(researchTasks.map((item) => [item.researchId, item]));
const usageTasks = usagePolicy.usages.map((usage) => {
  const base = researchTaskById.get(usage.researchId);
  if (!base) throw new Error(`Usage ${usage.usageId} lacks research task.`);
  const urgent = ["emergency", "urgent"].includes(usage.urgencyBandId);
  const priority = usage.urgencyBandId === "emergency" ? 500
    : usage.urgencyBandId === "urgent" ? 450
      : usage.urgencyBandId === "priority" ? 350
        : usage.urgencyBandId === "scheduled" ? 180 : 150;
  return {
    usageId: usage.usageId,
    researchId: usage.researchId,
    taskTemplateId: base.taskTemplateId,
    urgency: urgent ? "urgent" : "routine",
    priority,
    safeRouteRequired: urgent,
    handoffPolicyId: urgent ? "urgent_quarter_breakpoints" : base.durationMinutes >= 20 ? "midpoint" : "not_allowed",
    reviewPolicy: usage.reviewPolicy,
    runtimeOverrides: { urgency: urgent ? "urgent" : "routine", priority, safeRouteRequired: urgent }
  };
});

const recommendedSchedule = [];
for (let day = 1; day <= 30; day += 1) {
  const primary = policy.scheduling.recommendedPrimaryPattern[(day - 1) % policy.scheduling.recommendedPrimaryPattern.length];
  const alternate = primary === "staff.doctor.sokolova" ? "staff.doctor.morozov" : "staff.doctor.sokolova";
  recommendedSchedule.push({
    day,
    dayStartAt: (day - 1) * policy.clock.dayLengthMinutes,
    clinicOpenAt: (day - 1) * policy.clock.dayLengthMinutes + policy.clock.clinicOpenMinute,
    clinicCloseAt: (day - 1) * policy.clock.dayLengthMinutes + policy.clock.clinicCloseMinute,
    recommendedPrimaryStaffId: primary,
    recommendedAlternateStaffId: alternate,
    primaryShift: {
      startAt: (day - 1) * policy.clock.dayLengthMinutes + policy.scheduling.defaultStaffShift.startMinute,
      endAt: (day - 1) * policy.clock.dayLengthMinutes + policy.scheduling.defaultStaffShift.endMinute
    },
    playerMayChooseOtherEligibleDoctor: policy.scheduling.playerChoosesPrimaryDoctorDaily
  });
}

const operationalPolicies = {
  schemaVersion: 1,
  catalogId: "vetgeme-p5-operational-policies",
  catalogVersion: policy.catalogVersion,
  status: policy.status,
  runtimeEligible: false,
  clock: policy.clock,
  fatigueBands: policy.fatigueBands,
  scheduling: policy.scheduling,
  delegation: policy.delegation,
  handoffPolicies: policy.handoffPolicies,
  handoffRuntimeContract: policy.handoffRuntimeContract,
  absencePolicies: policy.absencePolicies,
  maintenancePolicy: policy.maintenancePolicy,
  urgentOvercapacity: policy.urgentOvercapacity,
  activation: policy.activation
};

writeJson("generated/resource-catalog.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p5-resource-catalog",
  catalogVersion: policy.catalogVersion,
  status: policy.status,
  runtimeEligible: false,
  resources: allResources
});
writeJson("generated/visit-task-catalog.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p5-visit-task-catalog",
  catalogVersion: policy.catalogVersion,
  status: policy.status,
  runtimeEligible: false,
  tasks: visitTasks
});
writeJson("generated/capability-operations-map.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p5-capability-operations-map",
  catalogVersion: policy.catalogVersion,
  status: policy.status,
  runtimeEligible: false,
  capabilities: capabilityOperations
});
writeJson("generated/research-task-catalog.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p5-research-task-catalog",
  catalogVersion: policy.catalogVersion,
  status: policy.status,
  runtimeEligible: false,
  researchTasks
});
writeJson("generated/investigation-usage-task-map.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p5-investigation-usage-task-map",
  catalogVersion: policy.catalogVersion,
  status: policy.status,
  runtimeEligible: false,
  usageTasks
});
writeJson("generated/recommended-30-day-staffing.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p5-recommended-staffing",
  catalogVersion: policy.catalogVersion,
  status: policy.status,
  runtimeEligible: false,
  authority: "recommendation_only_player_choice_persists_actual_shift",
  days: recommendedSchedule
});
writeJson("generated/operational-policies.json", operationalPolicies);

const manifest = {
  schemaVersion: 1,
  packageId: "vetgeme-p5-production-authoring",
  packageVersion: policy.catalogVersion,
  createdAt: "2026-07-16",
  status: policy.status,
  runtimeEligible: false,
  activationRequires: ["programmer_adapter", "runtime_browser_smoke", "save_reload_replay", "product_owner_staffing_acceptance"],
  boundaries: policy.boundaries,
  sources: {
    capabilityRegistryId: capabilityRegistry.registryId,
    capabilityRegistryVersion: capabilityRegistry.registryVersion,
    p3ResearchCatalogVersion: researchCatalog.catalogVersion,
    p3UsageCatalogVersion: usagePolicy.catalogVersion,
    p6EconomyCatalogVersion: economyCatalog.catalogVersion
  },
  counts: {
    staff: staffResources.length,
    rooms: roomResources.length,
    equipmentResources: equipmentResources.length,
    totalResources: allResources.length,
    visitTaskTemplates: visitTasks.length,
    capabilitiesMapped: capabilityOperations.length,
    researchTasks: researchTasks.length,
    investigationUsagesMapped: usageTasks.length,
    scheduleDays: recommendedSchedule.length,
    staffSkillsCovered: uniqueSorted(policy.staff.flatMap((item) => item.skills)).length
  },
  files: [
    "MANIFEST.json",
    "README.md",
    "PROGRAMMER_HANDOFF.md",
    "FINAL_COMPLETION_AUDIT.md",
    "schemas/P5_AUTHORING_CONTRACT.md",
    "source/p5-policy.json",
    "scripts/build-p5-package.mjs",
    "scripts/validate-p5-package.mjs",
    "generated/resource-catalog.json",
    "generated/visit-task-catalog.json",
    "generated/capability-operations-map.json",
    "generated/research-task-catalog.json",
    "generated/investigation-usage-task-map.json",
    "generated/recommended-30-day-staffing.json",
    "generated/operational-policies.json",
    "reports/ENGINE_COMPATIBILITY_REPORT.md",
    "reports/VALIDATION_REPORT.json"
  ]
};
writeJson("MANIFEST.json", manifest);
console.log(JSON.stringify(manifest.counts, null, 2));
