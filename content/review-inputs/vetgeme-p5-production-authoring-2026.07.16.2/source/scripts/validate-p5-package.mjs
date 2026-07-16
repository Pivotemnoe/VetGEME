#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageRoot, "..");
const require = createRequire(import.meta.url);
const scheduler = require(path.join(repoRoot, "systems/resource-scheduler-v5.js"));

function readJson(relativePath, root = packageRoot) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  const file = path.join(packageRoot, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must contain unique IDs`);
}

function taskInput(id, runtimeTemplate, sourceType, sourceId) {
  return {
    id,
    queuedAt: 0,
    priority: runtimeTemplate.priority,
    authoredDurationMinutes: runtimeTemplate.authoredDurationMinutes,
    fatigue: { percent: 0, durationMultiplier: 1 },
    requirementGroups: runtimeTemplate.requirementGroups,
    urgency: runtimeTemplate.urgency,
    safeRouteRequired: runtimeTemplate.safeRouteRequired,
    sourceType,
    sourceId,
    patientId: "patient.validation",
    ownerId: "owner.validation"
  };
}

function assertRuntimeTask(resources, id, runtimeTemplate, sourceType, sourceId) {
  let state = scheduler.createState(resources);
  const enqueued = scheduler.enqueueTask(state, {
    commandId: `enqueue.${id}`,
    task: taskInput(id, runtimeTemplate, sourceType, sourceId)
  });
  assert.equal(enqueued.reasonCode, "enqueued");
  state = enqueued.state;
  const scheduled = scheduler.scheduleTask(state, { commandId: `schedule.${id}`, at: 0 });
  assert.equal(scheduled.reasonCode, "scheduled", `${sourceType}:${sourceId} must be schedulable with the full authored catalog`);
  assert.equal(scheduled.task.startAt, 0);
  assert.ok(scheduled.reservations.length >= 1);
}

const manifest = readJson("MANIFEST.json");
const policy = readJson("source/p5-policy.json");
const resourcesCatalog = readJson("generated/resource-catalog.json");
const visitsCatalog = readJson("generated/visit-task-catalog.json");
const capabilitiesCatalog = readJson("generated/capability-operations-map.json");
const researchCatalog = readJson("generated/research-task-catalog.json");
const usagesCatalog = readJson("generated/investigation-usage-task-map.json");
const scheduleCatalog = readJson("generated/recommended-30-day-staffing.json");
const operationsPolicy = readJson("generated/operational-policies.json");
const lifecycleCatalog = readJson("generated/resource-lifecycle-catalog.json");
const registry = readJson("content/system-packs/vetgeme-master-2026-07-14/capability-registry.json", repoRoot);
const p3Research = readJson("operational-production-authoring-2026.07.16.2/generated/p3/research-catalog.json", repoRoot);
const p3Usages = readJson("operational-production-authoring-2026.07.16.2/generated/p3/investigation-usage-policy.json", repoRoot);
const p6Economy = readJson("operational-production-authoring-2026.07.16.2/generated/p6/economy-catalog.json", repoRoot);

const catalogs = [resourcesCatalog, visitsCatalog, capabilitiesCatalog, researchCatalog, usagesCatalog, scheduleCatalog, operationsPolicy, lifecycleCatalog];
for (const catalog of catalogs) {
  assert.equal(catalog.catalogVersion, policy.catalogVersion);
  assert.equal(catalog.runtimeEligible, false, `${catalog.catalogId} must remain gated until programmer integration`);
}

const resourceIds = resourcesCatalog.resources.map((item) => item.resourceId);
const visitIds = visitsCatalog.tasks.map((item) => item.taskTemplateId);
const capabilityIds = capabilitiesCatalog.capabilities.map((item) => item.capabilityId);
const researchIds = researchCatalog.researchTasks.map((item) => item.researchId);
const usageIds = usagesCatalog.usageTasks.map((item) => item.usageId);
unique(resourceIds, "resource catalog");
unique(visitIds, "visit task catalog");
unique(capabilityIds, "capability operations map");
unique(researchIds, "research task catalog");
unique(usageIds, "investigation usage task map");

assert.equal(resourcesCatalog.resources.length, manifest.counts.totalResources);
assert.equal(visitsCatalog.tasks.length, manifest.counts.visitTaskTemplates);
assert.equal(capabilitiesCatalog.capabilities.length, registry.capabilities.length);
assert.equal(capabilitiesCatalog.supplementalCapabilities.length, 8);
assert.equal(researchCatalog.researchTasks.length, p3Research.research.length);
assert.equal(usagesCatalog.usageTasks.length, p3Usages.usages.length);
assert.deepEqual([...capabilityIds].sort(), registry.capabilities.map((item) => item.id).sort());
assert.deepEqual([...researchIds].sort(), p3Research.research.map((item) => item.researchId).sort());
assert.deepEqual([...usageIds].sort(), p3Usages.usages.map((item) => item.usageId).sort());
assert.ok(capabilitiesCatalog.capabilities.every((item) => item.mappingAuthority === "author_frozen_exact_capability_resource_map_v2" && item.tokenOrSubstringResolutionForbidden === true));
assert.equal(lifecycleCatalog.commands.length, 13);
assert.equal(lifecycleCatalog.roomAssets.length, 12);
assert.equal(lifecycleCatalog.startingInventory.length, 10);
assert.equal(lifecycleCatalog.startingEquipmentEvidence.length, 2);
assert.deepEqual(resourcesCatalog.resources.filter((item) => item.startsActive).map((item) => item.resourceId).sort(), [
  "equipment.microscope",
  "equipment.otoscope",
  "room.consult.1",
  "room.lab.basic",
  "room.reception.1",
  "room.storage.1",
  "room.waiting.1"
]);

const runtimeResources = resourcesCatalog.resources.map((item) => item.runtimeResourceTemplate);
const fullState = scheduler.createState(runtimeResources);
assert.deepEqual(scheduler.validateState(fullState), { valid: true, errors: [] });
assert.equal(Object.keys(fullState.resources).length, manifest.counts.totalResources);

const registrySkills = registry.capabilities.filter((item) => item.type === "staff_skill").map((item) => item.id).sort();
const coveredSkills = [...new Set(policy.staff.flatMap((item) => item.skills))].sort();
assert.deepEqual(coveredSkills, registrySkills, "every registered staff skill must have an authored employee");
for (const capability of registry.capabilities.filter((item) => ["small_equipment", "laboratory_equipment", "treatment_equipment", "imaging_equipment", "consumable_device"].includes(item.type))) {
  const resource = resourcesCatalog.resources.find((item) => item.resourceId === `equipment.${capability.id}`);
  assert.ok(resource, `${capability.id} must have a P5 equipment resource`);
  const economy = p6Economy.capabilityEconomics.find((item) => item.capabilityId === capability.id);
  assert.ok(economy?.assetPolicy, `${capability.id} must retain P6 ownership and maintenance authority`);
}

let runtimeTasksValidated = 0;
for (const visit of visitsCatalog.tasks) {
  if (visit.urgency === "urgent") assert.equal(visit.runtimeTemplate.safeRouteRequired, true);
  assertRuntimeTask(runtimeResources, `validation.visit.${runtimeTasksValidated}`, visit.runtimeTemplate, "visit_stage", visit.taskTemplateId);
  runtimeTasksValidated += 1;
}
for (const research of researchCatalog.researchTasks) {
  assert.equal(research.medicalResultAuthority, "medical_family_presentation_investigation_result");
  assertRuntimeTask(runtimeResources, `validation.research.${runtimeTasksValidated}`, research.runtimeTemplate, "research", research.researchId);
  runtimeTasksValidated += 1;
}

const researchById = new Map(researchCatalog.researchTasks.map((item) => [item.researchId, item]));
for (const usage of usagesCatalog.usageTasks) {
  const base = researchById.get(usage.researchId);
  assert.ok(base, `${usage.usageId} must reference an authored research task`);
  const runtimeTemplate = { ...base.runtimeTemplate, ...usage.runtimeOverrides };
  assert.equal(usage.urgency === "urgent", usage.safeRouteRequired);
  if (usage.urgency === "urgent") assert.equal(runtimeTemplate.safeRouteRequired, true);
  assertRuntimeTask(runtimeResources, `validation.usage.${runtimeTasksValidated}`, runtimeTemplate, "research_usage", usage.usageId);
  runtimeTasksValidated += 1;
}

const taskBearingModes = new Set(["schedulable_task", "external_coordination", "explicit_alternative_resolution"]);
for (const capability of capabilitiesCatalog.capabilities) {
  assert.ok(capability.executionMode, `${capability.capabilityId} must have an execution mode`);
  if (taskBearingModes.has(capability.executionMode)) {
    assert.ok(capability.requirementGroups.length > 0, `${capability.capabilityId} must have resource requirements`);
    const runtimeTemplate = {
      priority: 200,
      authoredDurationMinutes: capability.durationMinutes,
      requirementGroups: capability.requirementGroups,
      urgency: "routine",
      safeRouteRequired: false
    };
    assertRuntimeTask(runtimeResources, `validation.capability.${runtimeTasksValidated}`, runtimeTemplate, "capability", capability.capabilityId);
    runtimeTasksValidated += 1;
  } else {
    assert.equal(capability.requirementGroups.length, 0, `${capability.capabilityId} is a non-task resource and must not create a duplicate task`);
  }
}

assert.equal(scheduleCatalog.days.length, 30);
assert.equal(scheduleCatalog.authority, "recommendation_only_player_choice_persists_actual_shift");
for (let index = 0; index < scheduleCatalog.days.length; index += 1) {
  const day = scheduleCatalog.days[index];
  assert.equal(day.day, index + 1);
  assert.equal(day.playerMayChooseOtherEligibleDoctor, true);
  assert.ok(resourceIds.includes(day.recommendedPrimaryStaffId));
  assert.ok(resourceIds.includes(day.recommendedAlternateStaffId));
  assert.ok(day.primaryShift.endAt > day.primaryShift.startAt);
}

const exactHandoffFields = ["groupId", "fromResourceId", "toResourceId", "capabilityId", "units"];
assert.deepEqual(operationsPolicy.handoffRuntimeContract.reassignmentFields, exactHandoffFields);
assert.equal(operationsPolicy.handoffRuntimeContract.medicalPayloadForbidden, true);
const historyVisit = visitsCatalog.tasks.find((item) => item.taskTemplateId === "visit.history");
let handoffState = scheduler.createState(runtimeResources);
handoffState = scheduler.enqueueTask(handoffState, {
  commandId: "enqueue.validation.handoff",
  task: taskInput("validation.handoff", historyVisit.runtimeTemplate, "visit_stage", historyVisit.taskTemplateId)
}).state;
const handoffScheduled = scheduler.scheduleTask(handoffState, { commandId: "schedule.validation.handoff", at: 0 });
const staffReservation = handoffScheduled.reservations.find((item) => item.groupId === "staff");
const replacement = historyVisit.runtimeTemplate.requirementGroups.find((item) => item.id === "staff").anyOf
  .find((item) => item.resourceId !== staffReservation.resourceId && item.capabilityId === staffReservation.capabilityId);
assert.ok(replacement, "history/exam must allow a second qualified doctor for handoff");
const handedOff = scheduler.handoffTask(handoffScheduled.state, {
  commandId: "handoff.validation.handoff",
  taskId: "validation.handoff",
  at: Math.floor((handoffScheduled.task.startAt + handoffScheduled.task.endAt) / 2),
  reassignments: [{
    groupId: "staff",
    fromResourceId: staffReservation.resourceId,
    toResourceId: replacement.resourceId,
    capabilityId: replacement.capabilityId,
    units: 1
  }]
});
assert.equal(handedOff.reasonCode, "handed_off");
const reloaded = scheduler.normalizeState(JSON.parse(JSON.stringify(handedOff.state)));
assert.deepEqual(reloaded, handedOff.state, "handoff state must survive JSON save/reload normalization");

const microscope = runtimeResources.find((item) => item.id === "equipment.microscope");
const blockedResource = { ...microscope, unavailableWindows: [{ startAt: 0, endAt: 60 }] };
let urgentState = scheduler.createState([blockedResource]);
urgentState = scheduler.enqueueTask(urgentState, {
  commandId: "enqueue.validation.urgent",
  task: {
    id: "validation.urgent",
    queuedAt: 0,
    priority: 500,
    authoredDurationMinutes: 10,
    fatigue: { percent: 100, durationMultiplier: 1.35 },
    requirementGroups: [{ id: "equipment", anyOf: [{ resourceId: microscope.id, capabilityId: "microscope", units: 1 }] }],
    urgency: "urgent",
    safeRouteRequired: true
  }
}).state;
const urgentBlocked = scheduler.scheduleTask(urgentState, { commandId: "schedule.validation.urgent", at: 0 });
assert.equal(urgentBlocked.reasonCode, "urgent_capacity_unavailable_safe_route_required");
const urgentSafeRoute = scheduler.cancelTask(urgentBlocked.state, {
  commandId: "cancel.validation.urgent",
  taskId: "validation.urgent",
  at: 0,
  reasonCode: "local_capacity_unavailable",
  safeRouteId: operationsPolicy.urgentOvercapacity.safeRouteId
});
assert.equal(urgentSafeRoute.task.cancellation.safeRouteId, "safe_referral");

assert.equal(operationsPolicy.maintenancePolicy.authority, "p6_maintenance_command_only");
assert.ok(operationsPolicy.absencePolicies.every((item) => ["p7_event_only", "player_training_decision"].includes(item.triggerAuthority)));
assert.equal(operationsPolicy.delegation.delegationNeverChangesMedicalResult, true);
assert.equal(manifest.boundaries.fatigueChangesClinicalResult, false);
assert.equal(manifest.boundaries.saveSchemaChange, false);

let seed = 0x5eed1234;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}
let urgentDemandDays = 0;
let routineBlockedAtMaximumFatigue = 0;
for (let campaign = 0; campaign < 10000; campaign += 1) {
  for (let day = 0; day < 30; day += 1) {
    const fatigue = Math.floor(random() * 101);
    const urgentDemand = random() < 0.18;
    if (urgentDemand) urgentDemandDays += 1;
    const band = operationsPolicy.fatigueBands.find((item) => fatigue >= item.minimum && fatigue <= item.maximum);
    assert.ok(band, `fatigue ${fatigue} must resolve to one band`);
    if (fatigue === 100 && !band.routineStartAllowed) routineBlockedAtMaximumFatigue += 1;
    if (urgentDemand) assert.equal(band.urgentStartAllowed, true);
    assert.ok(band.durationMultiplier >= 1);
  }
}

const report = {
  schemaVersion: 1,
  packageId: manifest.packageId,
  packageVersion: manifest.packageVersion,
  validatedAt: "2026-07-16",
  result: "pass",
  runtimeContract: {
    schedulerSchemaVersion: scheduler.SCHEMA_VERSION,
    resourcesValidated: runtimeResources.length,
    runtimeTasksValidated,
    handoffSaveReload: "pass",
    urgentOvercapacitySafeRoute: "pass"
  },
  exactCoverage: {
    staff: policy.staff.length,
    rooms: policy.rooms.length,
    equipmentResources: resourcesCatalog.resources.filter((item) => item.resourceKind === "equipment").length,
    staffSkills: coveredSkills.length,
    visitTasks: visitsCatalog.tasks.length,
    capabilities: capabilitiesCatalog.capabilities.length,
    researchTasks: researchCatalog.researchTasks.length,
    investigationUsages: usagesCatalog.usageTasks.length,
    scheduleDays: scheduleCatalog.days.length,
    supplementalCapabilities: capabilitiesCatalog.supplementalCapabilities.length,
    lifecycleCommands: lifecycleCatalog.commands.length,
    roomAssets: lifecycleCatalog.roomAssets.length,
    startingInventoryCategories: lifecycleCatalog.startingInventory.length
  },
  simulations: {
    campaigns: 10000,
    demandDays: 300000,
    urgentDemandDays,
    routineBlockedAtMaximumFatigue,
    deterministicSeed: "0x5eed1234",
    result: "pass"
  },
  authorityBoundaries: {
    medicalTruth: "not_authored_by_p5",
    researchResults: "p3_and_medical_family_presentations",
    assetsInventoryMaintenanceLedger: "p6",
    eventsAndAbsences: "p7",
    visuals: "projection_only",
    saveSchemaChangedByPackage: false
  }
};

writeJson("reports/VALIDATION_REPORT.json", report);
manifest.validation = {
  status: "pass",
  report: "reports/VALIDATION_REPORT.json",
  runtimeTasksValidated,
  simulatedCampaigns: 10000,
  simulatedDemandDays: 300000
};
writeJson("MANIFEST.json", manifest);
console.log(JSON.stringify(report, null, 2));
