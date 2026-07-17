#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const p5Loader = require(path.join(root, "generator/activation-p5-v11.js"));
const scheduler = require(path.join(root, "systems/resource-scheduler-v5.js"));
const operationsFactory = require(path.join(root, "systems/operations-runtime-v5.js"));
const operations = operationsFactory.createOperationsRuntime(scheduler);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fullOperationsState(bundle, mutateResource) {
  const resources = bundle.documents.resourceCatalog.resources.map((record) => {
    const resource = clone(record.runtimeResourceTemplate);
    resource.unavailableWindows = [];
    return mutateResource ? mutateResource(resource) || resource : resource;
  });
  const state = scheduler.createState(resources);
  return operations.createState({ ...state, handoffs: [] });
}

function researchInput(operationsState, researchId, usageId, taskId, branch = "local", at = 480) {
  return {
    operationsState,
    researchId,
    usageId,
    taskId,
    branch,
    at,
    fatigue: { percent: 0, durationMultiplier: 1 },
    identifiers: { patientId: "patient-acceptance", ownerId: "owner-acceptance" }
  };
}

(async () => {
  const bundle = await p5Loader.loadFromDirectory(root);
  assert.equal(bundle.version, "pet-clinic-p5-live-adapter-v11@2026.07.17.1");
  assert.equal(bundle.sourceVersion, "2026.07.16.2");
  assert.equal(bundle.documents.resourceCatalog.resources.length, 49);
  assert.equal(bundle.documents.lifecycleCatalog.commands.length, 13);
  assert.equal(bundle.documents.lifecycleCatalog.roomAssets.length, 12);
  assert.deepEqual(bundle.audit, {
    taskTemplates: 2606,
    preOverlayAffectedTemplates: 10,
    preOverlayPredicateGaps: 15,
    fixedTemplates: 10,
    affectedTemplates: 0,
    predicateGaps: 0,
    approximateMatches: 0
  });

  let lifecycleState = bundle.createLifecycleState();
  const initialSnapshot = bundle.lifecycle.snapshot(lifecycleState, 480);
  assert.equal(Object.keys(initialSnapshot.resources).length, 49);
  assert.deepEqual(initialSnapshot.activeResourceIds.sort(), [
    "equipment.microscope",
    "equipment.otoscope",
    "room.consult.1",
    "room.lab.basic",
    "room.reception.1",
    "room.storage.1",
    "room.waiting.1"
  ]);
  assert.equal(initialSnapshot.resources["staff.doctor.sokolova"].staffAvailabilityState, "hired_unscheduled");
  assert.equal(initialSnapshot.resources["staff.doctor.morozov"].staffAvailabilityState, "hired_unscheduled");

  let runtimeState = bundle.reconcileOperationsState(lifecycleState, operations.createState());
  assert.equal(Object.keys(runtimeState.resources).length, 49);
  const assigned = bundle.lifecycle.execute(lifecycleState, "assign_shift", {
    commandId: "campaign-day-1:staff.doctor.sokolova:assign-shift",
    staffId: "staff.doctor.sokolova",
    shiftId: "campaign-day-1:staff.doctor.sokolova",
    startAt: 480,
    endAt: 1080
  }, { currentMinute: 480 });
  lifecycleState = assigned.state;
  runtimeState = bundle.reconcileOperationsState(lifecycleState, runtimeState);
  assert.equal(bundle.lifecycle.snapshot(lifecycleState, 480).resources["staff.doctor.sokolova"].active, true);
  assert.equal(bundle.lifecycle.snapshot(lifecycleState, 480).resources["staff.doctor.morozov"].active, false);

  const reloadedLifecycle = bundle.lifecycle.deserializeState(bundle.lifecycle.serializeState(lifecycleState));
  const reloadedOperations = operations.deserializeState(operations.serializeState(runtimeState));
  assert.deepEqual(reloadedLifecycle, lifecycleState);
  assert.deepEqual(reloadedOperations, runtimeState);
  runtimeState = bundle.reconcileOperationsState(reloadedLifecycle, reloadedOperations);

  const xrayResearchId = "pancreatitis_radiography_for_differentials";
  const xrayUsageId = "gi_pancreas_acute.pancreatitis_dog_acute_stable.p1_vomiting_abdominal_pain_after_nonspecific_trigger.pancreatitis_radiography_for_differentials.3";
  const beforeUnavailable = clone(runtimeState);
  const unavailable = bundle.scheduleResearch(researchInput(
    runtimeState, xrayResearchId, xrayUsageId, "xray-starting-resources"
  ));
  assert.equal(unavailable.scheduled, false);
  assert.deepEqual(unavailable.state, beforeUnavailable);
  assert.deepEqual(runtimeState, beforeUnavailable, "failed local scheduling must be atomic");

  const referral = bundle.scheduleResearch(researchInput(
    runtimeState, xrayResearchId, xrayUsageId, "xray-safe-referral", "referral"
  ));
  assert.equal(referral.scheduled, true);
  assert.equal(referral.reasonCode, "safe_referral_without_local_reservation");
  assert.deepEqual(referral.tasks, []);
  assert.deepEqual(referral.reservations, []);
  assert.deepEqual(referral.state, runtimeState);

  let commissioned = fullOperationsState(bundle);
  const localXray = bundle.scheduleResearch(researchInput(
    commissioned, xrayResearchId, xrayUsageId, "xray-local", "local", 100
  ));
  assert.equal(localXray.scheduled, true);
  assert.deepEqual(localXray.reservations.map((item) => [item.groupId, item.resourceId, item.capabilityId]).sort(), [
    ["equipment.xray_system", "equipment.xray_system", "xray_system"],
    ["room", "room.imaging.1", "imaging_room"],
    ["staff", "staff.imaging.zhukova", "trained_radiography"]
  ]);
  commissioned = localXray.state;

  const gdvResearchId = "gdv_postoperative_reperfusion_arrhythmia_and_organ_monitoring";
  const gdvUsage = bundle.documents.resourceCatalog.resources
    && require(path.join(root, "content/activation-packs/pet-clinic-local-2026.07.17.1/p5-source/generated/investigation-usage-task-map.json"))
      .usageTasks.find((record) => record.researchId === gdvResearchId);
  assert.ok(gdvUsage?.usageId.startsWith("gi_gdv."));
  const gdv = bundle.scheduleResearch(researchInput(
    commissioned, gdvResearchId, gdvUsage.usageId, "gdv-room-sequence", "local", 200
  ));
  assert.equal(gdv.scheduled, true);
  assert.equal(gdv.reasonCode, "scheduled_atomic_room_sequence");
  assert.equal(gdv.tasks.length, 2);
  const procedure = gdv.reservations.find((item) => item.groupId === "room" && item.resourceId === "room.procedure.1");
  const shortStay = gdv.reservations.find((item) => item.groupId === "room" && item.resourceId === "room.short_stay.1");
  assert.ok(procedure && shortStay);
  assert.equal(procedure.endAt, shortStay.startAt);
  assert.equal(gdv.handoffAt, procedure.endAt);
  assert.equal(gdv.tasks[0].startAt, 200);
  assert.equal(gdv.tasks[1].startAt, gdv.tasks[0].endAt);

  const reloadedGdv = operations.deserializeState(operations.serializeState(gdv.state));
  assert.deepEqual(reloadedGdv, gdv.state);
  const completedGdv = bundle.completeTasks(reloadedGdv, gdv.tasks, "gdv-room-sequence");
  assert.equal(completedGdv.tasks.filter((task) => gdv.tasks.some((item) => item.id === task.id))
    .every((task) => task.status === "completed"), true);
  assert.deepEqual(operations.deserializeState(operations.serializeState(completedGdv)), completedGdv);

  const blockedOperations = fullOperationsState(bundle, (resource) => {
    if (resource.id === "room.short_stay.1") resource.unavailableWindows = [{ startAt: 0, endAt: 500 }];
    return resource;
  });
  const beforeBlocked = clone(blockedOperations);
  const blockedGdv = bundle.scheduleResearch(researchInput(
    blockedOperations, gdvResearchId, gdvUsage.usageId, "gdv-blocked", "local", 200
  ));
  assert.equal(blockedGdv.scheduled, false);
  assert.deepEqual(blockedGdv.state, beforeBlocked);
  assert.deepEqual(blockedOperations, beforeBlocked);
  assert.equal(blockedOperations.reservations.length, 0, "partial GDV reservation must not escape");

  console.log(JSON.stringify({
    status: "passed",
    sourceVersion: bundle.sourceVersion,
    resources: bundle.documents.resourceCatalog.resources.length,
    lifecycleCommands: bundle.documents.lifecycleCatalog.commands.length,
    taskTemplates: bundle.audit.taskTemplates,
    preOverlay: {
      affectedTemplates: bundle.audit.preOverlayAffectedTemplates,
      predicateGaps: bundle.audit.preOverlayPredicateGaps
    },
    postOverlay: {
      affectedTemplates: bundle.audit.affectedTemplates,
      predicateGaps: bundle.audit.predicateGaps
    },
    localXrayReservations: localXray.reservations.length,
    referralReservations: referral.reservations.length,
    gdvPhases: gdv.tasks.length,
    reloadStable: true
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
