#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const lifecycleApi = require("../systems/resource-lifecycle-v5.js");
const schedulerApi = require("../systems/resource-scheduler-v5.js");

const projectRoot = path.resolve(__dirname, "..");
const p5Root = path.join(
  projectRoot,
  "content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.2/source"
);
const operationalRoot = path.join(
  projectRoot,
  "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.4/source"
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const resourceCatalog = readJson(path.join(p5Root, "generated/resource-catalog.json"));
const lifecycleCatalog = readJson(path.join(p5Root, "generated/resource-lifecycle-catalog.json"));
const operationalPolicies = readJson(path.join(p5Root, "generated/operational-policies.json"));
const resourceCrosswalk = readJson(path.join(operationalRoot, "source/p6-p5-exact-resource-crosswalk.json"));
const lifecycle = lifecycleApi.createResourceLifecycleRuntime({
  resourceCatalog,
  lifecycleCatalog,
  operationalPolicies,
  resourceCrosswalk
});
const dayLengthMinutes = operationalPolicies.clock.dayLengthMinutes;

function execute(state, command, payload, context = {}) {
  const beforeReload = lifecycle.deserializeState(lifecycle.serializeState(state));
  assert.deepEqual(beforeReload, state, `${command}: save/reload before transition changed state`);
  const result = lifecycle.execute(beforeReload, command, payload, context);
  const afterReload = lifecycle.deserializeState(lifecycle.serializeState(result.state));
  assert.deepEqual(afterReload, result.state, `${command}: save/reload after transition changed state`);
  return {
    ...result,
    state: afterReload,
    snapshot: lifecycle.snapshot(afterReload, context.currentMinute ?? 0)
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalSchedulerState(reservationSpecs = []) {
  let state = schedulerApi.createState(
    resourceCatalog.resources.map((resource) => clone(resource.runtimeResourceTemplate))
  );
  reservationSpecs.forEach((spec, index) => {
    const taskId = spec.taskId || `authority.task.${index + 1}`;
    const groupId = spec.groupId || `authority_group_${index + 1}`;
    const duration = spec.endAt - spec.startAt;
    state = schedulerApi.enqueueTask(state, {
      commandId: `authority.enqueue.${index + 1}`,
      task: {
        id: taskId,
        queuedAt: spec.startAt,
        priority: 1000 - index,
        authoredDurationMinutes: duration,
        fatigue: { percent: 0, durationMultiplier: 1 },
        requirementGroups: [{
          id: groupId,
          anyOf: [{
            resourceId: spec.resourceId,
            capabilityId: spec.capabilityId,
            units: spec.units || 1
          }]
        }],
        urgency: "routine",
        safeRouteRequired: false
      }
    }).state;
    const scheduled = schedulerApi.scheduleTask(state, {
      commandId: `authority.schedule.${index + 1}`,
      at: spec.startAt
    });
    assert.equal(scheduled.reasonCode, "scheduled", `authority reservation ${index + 1} must schedule`);
    state = scheduled.state;
  });
  assert.deepEqual(schedulerApi.validateState(state), { valid: true, errors: [] });
  return state;
}

function emptySchedulerState() {
  return canonicalSchedulerState();
}

function assertUnchanged(before, after, message) {
  assert.deepEqual(after, before, message);
}

assert.equal(dayLengthMinutes, 1440, "the lifecycle clock must use exact 24-hour campaign days");
for (const mutation of [
  (config) => { config.operationalPolicies.clock.dayLengthMinutes = 60; },
  (config) => { config.operationalPolicies.maintenancePolicy.defaultDurationsByEquipmentType.small_equipment = 61; },
  (config) => {
    config.resourceCatalog.resources.find((resource) => resource.resourceId === "equipment.tonometer")
      .equipmentType = "unknown_equipment";
  },
  (config) => {
    config.resourceCrosswalk.resources.find((resource) => resource.resourceId === "equipment.tonometer")
      .capabilityId = "different_capability";
  },
  (config) => { config.operationalPolicies.scheduling.oneDoctorUntilSecondConsultOwned = false; },
  (config) => { config.operationalPolicies.scheduling.secondDoctorOverlapMaximumMinutes = 480; },
  (config) => { config.operationalPolicies.clock.breakDurationMinutes = 29; },
  (config) => {
    config.operationalPolicies.absencePolicies.find((policy) => policy.absenceTypeId === "planned_leave")
      .triggerAuthority = "automatic";
  }
]) {
  const config = clone({ resourceCatalog, lifecycleCatalog, operationalPolicies, resourceCrosswalk });
  mutation(config);
  assert.throws(() => lifecycleApi.createResourceLifecycleRuntime(config),
    /dayLengthMinutes|maintenance duration|equipment type|capability differs|one doctor|overlap|rest and break|absence policy|planned_leave policy/);
}

const expectedCommands = [
  "hire_staff",
  "assign_shift",
  "update_shift",
  "remove_shift",
  "purchase_asset",
  "mark_delivery_complete",
  "complete_training",
  "mark_room_ready",
  "start_maintenance",
  "complete_maintenance",
  "receive_stock",
  "consume_stock",
  "retire_asset"
];
assert.deepEqual(lifecycle.commandNames, expectedCommands, "the runtime must expose the exact 13-command contract");
assert.deepEqual(lifecycle.staffAvailabilityStates, [
  "not_hired",
  "hired_unscheduled",
  "available",
  "busy",
  "resting",
  "absent"
]);

const initial = lifecycle.createState();
assert.deepEqual(initial, {
  schemaVersion: 1,
  catalogVersion: "2026.07.16.2",
  commands: []
});
assert.deepEqual(lifecycle.validateState(initial), { valid: true, errors: [] });

const initialSnapshot = lifecycle.snapshot(initial, 0);
assert.equal(Object.keys(initialSnapshot.resources).length, 49);
assert.deepEqual(initialSnapshot.activeResourceIds, [
  "equipment.microscope",
  "equipment.otoscope",
  "room.consult.1",
  "room.lab.basic",
  "room.reception.1",
  "room.storage.1",
  "room.waiting.1"
]);
assert.equal(initialSnapshot.activeResourceIds.filter((id) => id.startsWith("staff.")).length, 0);
for (const doctorId of ["staff.doctor.morozov", "staff.doctor.sokolova"]) {
  const doctor = initialSnapshot.resources[doctorId];
  assert.equal(doctor.hired, true, `${doctorId} must start hired`);
  assert.equal(doctor.shifts.length, 0, `${doctorId} must start unscheduled`);
  assert.equal(doctor.staffAvailabilityState, "hired_unscheduled");
  assert.equal(doctor.active, false, `${doctorId} must not become active without a shift`);
}
assert.equal(initialSnapshot.resources["staff.administrator.lebedeva"].hired, false);
assert.equal(initialSnapshot.resources["staff.administrator.lebedeva"].staffAvailabilityState, "not_hired");
assert.equal(initialSnapshot.resources["equipment.microscope"].nextDueAt, 15 * dayLengthMinutes);
assert.equal(initialSnapshot.resources["equipment.otoscope"].nextDueAt, 20 * dayLengthMinutes);
assert.equal(lifecycle.snapshot(initial, 15 * dayLengthMinutes - 1).resources["equipment.microscope"].active, true);
assert.equal(lifecycle.snapshot(initial, 15 * dayLengthMinutes).resources["equipment.microscope"].active, false);
assert.equal(lifecycle.snapshot(initial, 20 * dayLengthMinutes - 1).resources["equipment.otoscope"].active, true);
assert.equal(lifecycle.snapshot(initial, 20 * dayLengthMinutes).resources["equipment.otoscope"].active, false);
assert.deepEqual(
  lifecycle.projectSchedulerResources(initial, {
    startAt: 15 * dayLengthMinutes - 10,
    endAt: 15 * dayLengthMinutes + 10
  }).find((resource) => resource.id === "equipment.microscope").unavailableWindows,
  [{ startAt: 15 * dayLengthMinutes, endAt: 15 * dayLengthMinutes + 10 }],
  "initial maintenance evidence must expire at the authored campaign-day boundary"
);

const initialProjection = lifecycle.projectSchedulerResources(initial, { startAt: 0, endAt: 1440 });
assert.equal(initialProjection.length, 49);
assert.deepEqual(
  initialProjection.find((resource) => resource.id === "staff.doctor.sokolova").unavailableWindows,
  [{ startAt: 0, endAt: 1440 }],
  "an unscheduled hired doctor must project as unavailable"
);
assert.deepEqual(
  initialProjection.find((resource) => resource.id === "equipment.tonometer").unavailableWindows,
  [{ startAt: 0, endAt: 1440 }],
  "an unowned asset must project as unavailable"
);

// Staff lifecycle: hiring is separate from scheduling, shifts obey duration/rest,
// and future capacity cannot be edited while it owns a reservation.
let staffState = initial;
assert.throws(() => execute(staffState, "hire_staff", {
  commandId: "staff:hire:administrator:wrong-minute",
  staffId: "staff.administrator.lebedeva",
  hiredAt: 100
}, { currentMinute: 99 }), /hiredAt must equal context.currentMinute/);
const hired = execute(staffState, "hire_staff", {
  commandId: "staff:hire:administrator",
  staffId: "staff.administrator.lebedeva",
  hiredAt: 100
}, { currentMinute: 100 });
staffState = hired.state;
assert.equal(hired.snapshot.resources["staff.administrator.lebedeva"].hired, true);
assert.equal(hired.snapshot.resources["staff.administrator.lebedeva"].active, false);
assert.throws(() => execute(staffState, "hire_staff", {
  commandId: "staff:hire:administrator:again",
  staffId: "staff.administrator.lebedeva",
  hiredAt: 101
}, { currentMinute: 101 }), /cannot be hired/);

const assigned = execute(staffState, "assign_shift", {
  commandId: "staff:shift:sokolova:day1",
  staffId: "staff.doctor.sokolova",
  shiftId: "shift.sokolova.day1",
  startAt: 480,
  endAt: 1080
}, { currentMinute: 400 });
staffState = assigned.state;
assert.equal(lifecycle.snapshot(staffState, 479).resources["staff.doctor.sokolova"].active, false);
assert.equal(lifecycle.snapshot(staffState, 480).resources["staff.doctor.sokolova"].active, true);
assert.equal(lifecycle.snapshot(staffState, 1079).resources["staff.doctor.sokolova"].active, true);
assert.equal(lifecycle.snapshot(staffState, 1080).resources["staff.doctor.sokolova"].active, false);
assert.throws(() => execute(staffState, "assign_shift", {
  commandId: "staff:shift:too-long",
  staffId: "staff.doctor.sokolova",
  shiftId: "shift.sokolova.too-long",
  startAt: 1800,
  endAt: 2401
}, { currentMinute: 1100 }), /maximum shift duration/);
assert.throws(() => execute(staffState, "assign_shift", {
  commandId: "staff:shift:no-rest",
  staffId: "staff.doctor.sokolova",
  shiftId: "shift.sokolova.no-rest",
  startAt: 1700,
  endAt: 1800
}, { currentMinute: 1100 }), /mandatory rest/);
assert.throws(() => execute(staffState, "assign_shift", {
  commandId: "staff:shift:past",
  staffId: "staff.doctor.morozov",
  shiftId: "shift.morozov.past",
  startAt: 499,
  endAt: 600
}, { currentMinute: 500 }), /context.currentMinute/);

const shiftedProjection = lifecycle.projectSchedulerResources(staffState, { startAt: 0, endAt: 1440 });
assert.deepEqual(
  shiftedProjection.find((resource) => resource.id === "staff.doctor.sokolova").unavailableWindows,
  [{ startAt: 0, endAt: 480 }, { startAt: 1080, endAt: 1440 }]
);

const beforeUnownedSecondDoctor = clone(staffState);
assert.throws(() => execute(staffState, "assign_shift", {
  commandId: "staff:shift:morozov:blocked-without-consult2",
  staffId: "staff.doctor.morozov",
  shiftId: "shift.morozov.blocked-without-consult2",
  startAt: 720,
  endAt: 1080
}, { currentMinute: 400 }), /until room\.consult\.2 is owned/);
assertUnchanged(beforeUnownedSecondDoctor, staffState,
  "blocked second-doctor overlap must not mutate lifecycle state");

const secondConsultAsset = "asset.room.consult.2";
const secondConsultPrice = resourceCrosswalk.resources
  .find((resource) => resource.resourceId === "room.consult.2").economicRecord.purchasePrice;
let overlapState = execute(initial, "purchase_asset", {
  commandId: "asset:purchase:consult2:doctor-overlap",
  assetCatalogId: secondConsultAsset,
  purchasedAt: 200,
  price: secondConsultPrice
}, { currentMinute: 200, unlockedAssetCatalogIds: [secondConsultAsset] }).state;
overlapState = execute(overlapState, "assign_shift", {
  commandId: "staff:shift:sokolova:overlap-authority",
  staffId: "staff.doctor.sokolova",
  shiftId: "shift.sokolova.overlap-authority",
  startAt: 480,
  endAt: 1080
}, { currentMinute: 400 }).state;
const beforeExcessDoctorOverlap = clone(overlapState);
assert.throws(() => execute(overlapState, "assign_shift", {
  commandId: "staff:shift:morozov:overlap-361",
  staffId: "staff.doctor.morozov",
  shiftId: "shift.morozov.overlap-361",
  startAt: 719,
  endAt: 1080
}, { currentMinute: 400 }), /exact 360-minute second-doctor overlap limit/);
assertUnchanged(beforeExcessDoctorOverlap, overlapState,
  "excess doctor overlap must fail atomically");
overlapState = execute(overlapState, "assign_shift", {
  commandId: "staff:shift:morozov:overlap-360",
  staffId: "staff.doctor.morozov",
  shiftId: "shift.morozov.overlap-360",
  startAt: 720,
  endAt: 1080
}, { currentMinute: 400 }).state;
const reloadedOverlapStateBeforeRetirement = lifecycle.deserializeState(lifecycle.serializeState(overlapState));
assert.deepEqual(reloadedOverlapStateBeforeRetirement, overlapState,
  "consult2 retirement regression setup must survive save/reload");
const overlapProjectionBeforeRetirement = lifecycle.projectSchedulerResources(
  reloadedOverlapStateBeforeRetirement,
  { startAt: 0, endAt: 2000 }
);
const beforeIllegalConsult2Retirement = clone(reloadedOverlapStateBeforeRetirement);
assert.throws(() => execute(reloadedOverlapStateBeforeRetirement, "retire_asset", {
  commandId: "asset:retire:consult2:future-doctor-overlap",
  assetId: secondConsultAsset,
  retiredAt: 500
}, {
  currentMinute: 500,
  schedulerState: emptySchedulerState()
}), /cannot retire room\.consult\.2 while future doctor shift overlap exists/);
assertUnchanged(beforeIllegalConsult2Retirement, reloadedOverlapStateBeforeRetirement,
  "consult2 retirement with a future two-doctor overlap must fail atomically");
assert.deepEqual(
  lifecycle.deserializeState(lifecycle.serializeState(reloadedOverlapStateBeforeRetirement)),
  beforeIllegalConsult2Retirement,
  "failed consult2 retirement must remain unchanged after save/reload"
);
assert.deepEqual(
  lifecycle.projectSchedulerResources(reloadedOverlapStateBeforeRetirement, { startAt: 0, endAt: 2000 }),
  overlapProjectionBeforeRetirement,
  "failed consult2 retirement must not change the 0..2000 scheduler projection"
);
const beforeExcessDoctorUpdate = clone(overlapState);
assert.throws(() => execute(overlapState, "update_shift", {
  commandId: "staff:shift:morozov:update-overlap-361",
  shiftId: "shift.morozov.overlap-360",
  startAt: 719,
  endAt: 1080
}, { currentMinute: 500, schedulerState: emptySchedulerState() }),
/exact 360-minute second-doctor overlap limit/);
assertUnchanged(beforeExcessDoctorUpdate, overlapState,
  "excess overlap update must fail atomically");

assert.equal(lifecycle.snapshot(staffState, 479).resources["staff.doctor.sokolova"].staffAvailabilityState,
  "hired_unscheduled");
assert.equal(lifecycle.snapshot(staffState, 480).resources["staff.doctor.sokolova"].staffAvailabilityState,
  "available");
assert.equal(lifecycle.snapshot(staffState, 790).resources["staff.doctor.sokolova"].staffAvailabilityState,
  "available", "the runtime must not invent break placement from duration-only P5 policy");
assert.equal(lifecycle.snapshot(staffState, 1080).resources["staff.doctor.sokolova"].staffAvailabilityState,
  "resting");
assert.equal(lifecycle.snapshot(staffState, 1799).resources["staff.doctor.sokolova"].staffAvailabilityState,
  "resting");
assert.equal(lifecycle.snapshot(staffState, 1800).resources["staff.doctor.sokolova"].staffAvailabilityState,
  "hired_unscheduled");

const busyAvailabilityAuthority = lifecycle.normalizeStaffAvailabilityProjectionAuthority({
  schedulerState: canonicalSchedulerState([{
    taskId: "task.busy-sokolova",
    groupId: "staff",
    resourceId: "staff.doctor.sokolova",
    capabilityId: "task.exam",
    startAt: 500,
    endAt: 520
  }]),
  absenceWindows: []
});
assert.equal(lifecycle.snapshot(staffState, 510, busyAvailabilityAuthority)
  .resources["staff.doctor.sokolova"].staffAvailabilityState, "busy");
assert.equal(lifecycle.snapshot(staffState, 510, busyAvailabilityAuthority)
  .resources["staff.doctor.sokolova"].active, true);
assert.equal(lifecycle.snapshot(staffState, 520, busyAvailabilityAuthority)
  .resources["staff.doctor.sokolova"].staffAvailabilityState, "available");
const outsideShiftBusyAuthority = lifecycle.normalizeStaffAvailabilityProjectionAuthority({
  schedulerState: canonicalSchedulerState([{
    taskId: "task.busy-sokolova-outside-shift",
    groupId: "staff",
    resourceId: "staff.doctor.sokolova",
    capabilityId: "task.exam",
    startAt: 200,
    endAt: 220
  }]),
  absenceWindows: []
});
assert.throws(() => lifecycle.snapshot(staffState, 210, outsideShiftBusyAuthority),
  /outside an authoritative lifecycle shift/);

const trainingAbsenceAuthority = lifecycle.normalizeStaffAvailabilityProjectionAuthority({
  schedulerState: emptySchedulerState(),
  absenceWindows: [{
    staffId: "staff.doctor.sokolova",
    absenceTypeId: "training_block",
    triggerAuthority: "player_training_decision",
    startAt: 600,
    endAt: 720
  }]
});
assert.equal(lifecycle.snapshot(staffState, 610).resources["staff.doctor.sokolova"].staffAvailabilityState,
  "available", "absence must never be generated without explicit authority");
assert.equal(lifecycle.snapshot(staffState, 610, trainingAbsenceAuthority)
  .resources["staff.doctor.sokolova"].staffAvailabilityState, "absent");
assert.equal(lifecycle.snapshot(staffState, 610, trainingAbsenceAuthority)
  .resources["staff.doctor.sokolova"].active, false);
assert.deepEqual(
  lifecycle.projectSchedulerResources(staffState, { startAt: 0, endAt: 1440 }, trainingAbsenceAuthority)
    .find((resource) => resource.id === "staff.doctor.sokolova").unavailableWindows,
  [{ startAt: 0, endAt: 480 }, { startAt: 600, endAt: 720 }, { startAt: 1080, endAt: 1440 }]
);

const illnessAbsenceAuthority = lifecycle.normalizeStaffAvailabilityProjectionAuthority({
  schedulerState: emptySchedulerState(),
  absenceWindows: [{
    staffId: "staff.doctor.sokolova",
    absenceTypeId: "unplanned_illness",
    triggerAuthority: "p7_event_only",
    startAt: 480,
    endAt: 1920
  }]
});
assert.equal(lifecycle.snapshot(staffState, 500, illnessAbsenceAuthority)
  .resources["staff.doctor.sokolova"].staffAvailabilityState, "absent");
assert.deepEqual(
  lifecycle.projectSchedulerResources(staffState, { startAt: 0, endAt: 1440 }, illnessAbsenceAuthority)
    .find((resource) => resource.id === "staff.doctor.sokolova").unavailableWindows,
  [{ startAt: 0, endAt: 1440 }]
);

for (const { authority, error } of [{
  authority: { schedulerState: emptySchedulerState(), absenceWindows: [{
    staffId: "staff.doctor.sokolova",
    absenceTypeId: "training_block",
    triggerAuthority: "p7_event_only",
    startAt: 600,
    endAt: 720
  }] },
  error: /trigger authority differs/
}, {
  authority: { schedulerState: emptySchedulerState(), absenceWindows: [{
    staffId: "staff.doctor.sokolova",
    absenceTypeId: "training_block",
    triggerAuthority: "player_training_decision",
    startAt: 600,
    endAt: 719
  }] },
  error: /duration differs/
}, {
  authority: { schedulerState: canonicalSchedulerState([{
    resourceId: "staff.doctor.sokolova",
    capabilityId: "task.exam",
    startAt: 610,
    endAt: 620
  }]), absenceWindows: [{
    staffId: "staff.doctor.sokolova",
    absenceTypeId: "training_block",
    triggerAuthority: "player_training_decision",
    startAt: 600,
    endAt: 720
  }] },
  error: /overlaps already reserved work/
}, {
  authority: { schedulerState: emptySchedulerState(), absenceWindows: [{
    staffId: "staff.doctor.sokolova",
    absenceTypeId: "planned_leave",
    triggerAuthority: "p7_event_only",
    startAt: 2000,
    endAt: 3440
  }, {
    staffId: "staff.doctor.morozov",
    absenceTypeId: "planned_leave",
    triggerAuthority: "p7_event_only",
    startAt: 2000,
    endAt: 3440
  }] },
  error: /maximumConcurrentStaff/
}]) {
  assert.throws(() => lifecycle.normalizeStaffAvailabilityProjectionAuthority(authority), error);
}
assert.throws(() => lifecycle.normalizeStaffAvailabilityProjectionAuthority({
  schedulerState: { reservations: [] },
  absenceWindows: []
}), /canonical scheduler state fields/);

const reloadedStaffState = lifecycle.deserializeState(lifecycle.serializeState(staffState));
const reloadedTrainingAuthority = lifecycle.normalizeStaffAvailabilityProjectionAuthority(
  JSON.parse(JSON.stringify(trainingAbsenceAuthority))
);
assert.deepEqual(
  lifecycle.snapshot(reloadedStaffState, 610, reloadedTrainingAuthority),
  lifecycle.snapshot(staffState, 610, trainingAbsenceAuthority)
);
assert.deepEqual(
  lifecycle.projectSchedulerResources(reloadedStaffState, { startAt: 0, endAt: 1440 }, reloadedTrainingAuthority),
  lifecycle.projectSchedulerResources(staffState, { startAt: 0, endAt: 1440 }, trainingAbsenceAuthority)
);

const reservedContext = {
  currentMinute: 400,
  schedulerState: canonicalSchedulerState([{
    taskId: "task.reserved",
    groupId: "staff",
    resourceId: "staff.doctor.sokolova",
    capabilityId: "task.exam",
    units: 1,
    startAt: 500,
    endAt: 520
  }])
};
const beforeReservedEdit = clone(staffState);
assert.throws(() => execute(staffState, "update_shift", {
  commandId: "staff:shift:update:missing-reservation-authority",
  shiftId: "shift.sokolova.day1",
  startAt: 500,
  endAt: 1000
}, { currentMinute: 400, reservations: [] }), /canonical schedulerState reservation authority/);
assert.throws(() => execute(staffState, "remove_shift", {
  commandId: "staff:shift:remove:missing-reservation-authority",
  shiftId: "shift.sokolova.day1"
}, { currentMinute: 400, schedulerState: { reservations: [] } }), /canonical scheduler state fields/);
assert.throws(() => execute(staffState, "update_shift", {
  commandId: "staff:shift:update:reserved",
  shiftId: "shift.sokolova.day1",
  startAt: 500,
  endAt: 1000
}, reservedContext), /reserved shift capacity/);
assert.throws(() => execute(staffState, "remove_shift", {
  commandId: "staff:shift:remove:reserved",
  shiftId: "shift.sokolova.day1"
}, reservedContext), /reserved shift capacity/);
assertUnchanged(beforeReservedEdit, staffState, "failed shift edits must not mutate lifecycle state");
assert.throws(() => execute(staffState, "update_shift", {
  commandId: "staff:shift:update:started",
  shiftId: "shift.sokolova.day1",
  startAt: 600,
  endAt: 1000
}, { currentMinute: 600, schedulerState: emptySchedulerState() }), /future shift/);

let editableShiftState = execute(initial, "assign_shift", {
  commandId: "staff:shift:morozov:future",
  staffId: "staff.doctor.morozov",
  shiftId: "shift.morozov.future",
  startAt: 900,
  endAt: 1200
}, { currentMinute: 500 }).state;
editableShiftState = execute(editableShiftState, "update_shift", {
  commandId: "staff:shift:morozov:update",
  shiftId: "shift.morozov.future",
  startAt: 960,
  endAt: 1260
}, { currentMinute: 500, schedulerState: emptySchedulerState() }).state;
assert.deepEqual(
  lifecycle.snapshot(editableShiftState, 1000).resources["staff.doctor.morozov"].shifts
    .map(({ shiftId, startAt, endAt }) => ({ shiftId, startAt, endAt })),
  [{ shiftId: "shift.morozov.future", startAt: 960, endAt: 1260 }]
);
editableShiftState = execute(editableShiftState, "remove_shift", {
  commandId: "staff:shift:morozov:remove",
  shiftId: "shift.morozov.future"
}, { currentMinute: 500, schedulerState: emptySchedulerState() }).state;
assert.equal(lifecycle.snapshot(editableShiftState, 1000).resources["staff.doctor.morozov"].shifts.length, 0);

// Unlock evidence permits purchase but is not ownership itself; purchase and a
// renderer-style field cannot activate a room. Delivery and readiness are explicit.
const consult2Asset = "asset.room.consult.2";
const consult2Price = resourceCrosswalk.resources
  .find((resource) => resource.resourceId === "room.consult.2").economicRecord.purchasePrice;
const roomPurchasePayload = {
  commandId: "asset:purchase:consult2",
  assetCatalogId: consult2Asset,
  purchasedAt: 200,
  price: consult2Price
};
assert.throws(() => execute(initial, "purchase_asset", roomPurchasePayload, {
  currentMinute: 200,
  unlockedAssetCatalogIds: []
}), /no explicit unlock evidence/);
assert.throws(() => execute(initial, "purchase_asset", {
  ...roomPurchasePayload,
  commandId: "asset:purchase:consult2:wrong-price",
  price: consult2Price + 1
}, { currentMinute: 200, unlockedAssetCatalogIds: [consult2Asset] }), /purchase price differs from P6 authority/);
assert.throws(() => execute(initial, "purchase_asset", {
  ...roomPurchasePayload,
  visualPresence: true
}, { currentMinute: 200, unlockedAssetCatalogIds: [consult2Asset] }), /fields must be exactly/);
assert.throws(() => execute(initial, "purchase_asset", {
  ...roomPurchasePayload,
  commandId: "asset:purchase:consult2:wrong-minute"
}, { currentMinute: 201, unlockedAssetCatalogIds: [consult2Asset] }), /purchasedAt must equal context.currentMinute/);
let roomState = execute(initial, "purchase_asset", roomPurchasePayload, {
  currentMinute: 200,
  unlockedAssetCatalogIds: [consult2Asset]
}).state;
assert.equal(lifecycle.snapshot(roomState, 201).resources["room.consult.2"].owned, true);
assert.equal(lifecycle.snapshot(roomState, 201).resources["room.consult.2"].active, false,
  "purchase must not activate a room");
assert.throws(() => execute(roomState, "mark_delivery_complete", {
  commandId: "asset:deliver:consult2:too-early",
  assetId: consult2Asset,
  deliveredAt: 300
}, { currentMinute: 300 }), /authored delivery interval/);
const consult2DeliveredAt = roomPurchasePayload.purchasedAt + 5 * dayLengthMinutes;
roomState = execute(roomState, "mark_delivery_complete", {
  commandId: "asset:deliver:consult2",
  assetId: consult2Asset,
  deliveredAt: consult2DeliveredAt
}, { currentMinute: consult2DeliveredAt }).state;
assert.equal(lifecycle.snapshot(roomState, consult2DeliveredAt).resources["room.consult.2"].active, false,
  "delivery must not bypass room readiness");
assert.throws(() => execute(roomState, "mark_room_ready", {
  commandId: "room:ready:consult2:too-early",
  roomId: "room.consult.2",
  readyAt: consult2DeliveredAt + 1
}, { currentMinute: consult2DeliveredAt + 1 }), /authored readying interval/);
const consult2ReadyAt = consult2DeliveredAt + dayLengthMinutes;
roomState = execute(roomState, "mark_room_ready", {
  commandId: "room:ready:consult2",
  roomId: "room.consult.2",
  readyAt: consult2ReadyAt
}, { currentMinute: consult2ReadyAt }).state;
assert.equal(lifecycle.snapshot(roomState, consult2ReadyAt - 1).resources["room.consult.2"].active, false);
assert.equal(lifecycle.snapshot(roomState, consult2ReadyAt).resources["room.consult.2"].active, true);
assert.deepEqual(
  lifecycle.projectSchedulerResources(roomState, { startAt: 0, endAt: consult2ReadyAt + 1 })
    .find((resource) => resource.id === "room.consult.2").unavailableWindows,
  [{ startAt: 0, endAt: consult2ReadyAt }],
  "future purchase/delivery/ready evidence must not activate capacity early"
);

// Equipment requires purchase, delivery, staff training and current maintenance.
const tonometerAsset = "asset_tonometer";
const tonometerPrice = resourceCrosswalk.resources
  .find((resource) => resource.resourceId === "equipment.tonometer").economicRecord.purchasePrice;
let equipmentState = execute(initial, "purchase_asset", {
  commandId: "asset:purchase:tonometer",
  assetCatalogId: tonometerAsset,
  purchasedAt: 200,
  price: tonometerPrice
}, { currentMinute: 200, unlockedAssetCatalogIds: [tonometerAsset] }).state;
assert.equal(lifecycle.snapshot(equipmentState, 201).resources["equipment.tonometer"].active, false);
assert.throws(() => execute(equipmentState, "mark_delivery_complete", {
  commandId: "asset:deliver:tonometer:too-early",
  assetId: tonometerAsset,
  deliveredAt: 300
}, { currentMinute: 300 }), /authored delivery interval/);
const tonometerDeliveredAt = 200 + dayLengthMinutes;
equipmentState = execute(equipmentState, "mark_delivery_complete", {
  commandId: "asset:deliver:tonometer",
  assetId: tonometerAsset,
  deliveredAt: tonometerDeliveredAt
}, { currentMinute: tonometerDeliveredAt }).state;
assert.throws(() => execute(equipmentState, "complete_training", {
  commandId: "asset:train:tonometer:sokolova:too-early",
  assetId: tonometerAsset,
  staffId: "staff.doctor.sokolova",
  completedAt: tonometerDeliveredAt + 59
}, { currentMinute: tonometerDeliveredAt + 59 }), /authored training interval/);
const tonometerTrainingCompletedAt = tonometerDeliveredAt + 60;
equipmentState = execute(equipmentState, "complete_training", {
  commandId: "asset:train:tonometer:sokolova",
  assetId: tonometerAsset,
  staffId: "staff.doctor.sokolova",
  completedAt: tonometerTrainingCompletedAt
}, { currentMinute: tonometerTrainingCompletedAt }).state;
assert.equal(lifecycle.snapshot(equipmentState, tonometerTrainingCompletedAt + 1).resources["equipment.tonometer"].active, false,
  "training without current maintenance must fail closed");
const tonometerMaintenanceStartAt = tonometerTrainingCompletedAt + 100;
const tonometerMaintenanceEndAt = tonometerMaintenanceStartAt + 60;
const beforeReservedMaintenance = clone(equipmentState);
assert.throws(() => execute(equipmentState, "start_maintenance", {
  commandId: "asset:maintenance:tonometer:wrong-duration",
  assetId: tonometerAsset,
  startAt: tonometerMaintenanceStartAt,
  endAt: tonometerMaintenanceEndAt - 1
}, {
  currentMinute: tonometerMaintenanceStartAt,
  schedulerState: emptySchedulerState()
}), /authored equipment-type duration/);
assert.throws(() => execute(equipmentState, "start_maintenance", {
  commandId: "asset:maintenance:tonometer:wrong-minute",
  assetId: tonometerAsset,
  startAt: tonometerMaintenanceStartAt,
  endAt: tonometerMaintenanceEndAt
}, {
  currentMinute: tonometerMaintenanceStartAt - 1,
  schedulerState: emptySchedulerState()
}), /startAt must equal context.currentMinute/);
assert.throws(() => execute(equipmentState, "start_maintenance", {
  commandId: "asset:maintenance:tonometer:reserved",
  assetId: tonometerAsset,
  startAt: tonometerMaintenanceStartAt,
  endAt: tonometerMaintenanceEndAt
}, {
  currentMinute: tonometerMaintenanceStartAt,
  schedulerState: canonicalSchedulerState([{
    resourceId: "equipment.tonometer",
    capabilityId: "tonometer",
    startAt: tonometerMaintenanceStartAt + 10,
    endAt: tonometerMaintenanceEndAt + 10
  }])
}),
/maintenance overlaps a reservation/);
assert.throws(() => execute(equipmentState, "start_maintenance", {
  commandId: "asset:maintenance:tonometer:missing-reservation-authority",
  assetId: tonometerAsset,
  startAt: tonometerMaintenanceStartAt,
  endAt: tonometerMaintenanceEndAt
}, { currentMinute: tonometerMaintenanceStartAt }), /canonical schedulerState reservation authority/);
assertUnchanged(beforeReservedMaintenance, equipmentState, "failed maintenance must be atomic");
equipmentState = execute(equipmentState, "start_maintenance", {
  commandId: "asset:maintenance:tonometer:start",
  assetId: tonometerAsset,
  startAt: tonometerMaintenanceStartAt,
  endAt: tonometerMaintenanceEndAt
}, {
  currentMinute: tonometerMaintenanceStartAt,
  schedulerState: emptySchedulerState()
}).state;
const maintenanceStartRetry = execute(equipmentState, "start_maintenance", {
  commandId: "asset:maintenance:tonometer:start",
  assetId: tonometerAsset,
  startAt: tonometerMaintenanceStartAt,
  endAt: tonometerMaintenanceEndAt
}, { currentMinute: tonometerMaintenanceStartAt + 1 });
assert.equal(maintenanceStartRetry.idempotent, true,
  "an exact lifecycle retry may succeed later without reapplying current-minute authority");
assert.deepEqual(maintenanceStartRetry.state, equipmentState);
assert.equal(lifecycle.snapshot(equipmentState, tonometerMaintenanceStartAt + 10).resources["equipment.tonometer"].active, false);
const tonometerNextDueAt = tonometerMaintenanceEndAt + 20 * dayLengthMinutes;
assert.throws(() => execute(equipmentState, "complete_maintenance", {
  commandId: "asset:maintenance:tonometer:complete:missing-reservation-authority",
  assetId: tonometerAsset,
  completedAt: tonometerMaintenanceEndAt,
  nextDueAt: tonometerNextDueAt
}, { currentMinute: tonometerMaintenanceEndAt }), /canonical schedulerState reservation authority/);
assert.throws(() => execute(equipmentState, "complete_maintenance", {
  commandId: "asset:maintenance:tonometer:complete:early",
  assetId: tonometerAsset,
  completedAt: tonometerMaintenanceEndAt - 1,
  nextDueAt: tonometerMaintenanceEndAt - 1 + 20 * dayLengthMinutes
}, {
  currentMinute: tonometerMaintenanceEndAt - 1,
  schedulerState: emptySchedulerState()
}), /exact authored end minute/);
assert.throws(() => execute(equipmentState, "complete_maintenance", {
  commandId: "asset:maintenance:tonometer:complete:late",
  assetId: tonometerAsset,
  completedAt: tonometerMaintenanceEndAt + 1,
  nextDueAt: tonometerMaintenanceEndAt + 1 + 20 * dayLengthMinutes
}, {
  currentMinute: tonometerMaintenanceEndAt + 1,
  schedulerState: emptySchedulerState()
}), /exact authored end minute/);
assert.throws(() => execute(equipmentState, "complete_maintenance", {
  commandId: "asset:maintenance:tonometer:complete:overlap",
  assetId: tonometerAsset,
  completedAt: tonometerMaintenanceEndAt,
  nextDueAt: tonometerNextDueAt
}, {
  currentMinute: tonometerMaintenanceEndAt,
  schedulerState: canonicalSchedulerState([{
    resourceId: "equipment.tonometer",
    capabilityId: "tonometer",
    startAt: tonometerMaintenanceStartAt + 10,
    endAt: tonometerMaintenanceStartAt + 20
  }])
}), /completed maintenance overlaps a reservation/);
assert.throws(() => execute(equipmentState, "complete_maintenance", {
  commandId: "asset:maintenance:tonometer:complete:wrong-due",
  assetId: tonometerAsset,
  completedAt: tonometerMaintenanceEndAt,
  nextDueAt: tonometerNextDueAt - 1
}, {
  currentMinute: tonometerMaintenanceEndAt,
  schedulerState: emptySchedulerState()
}), /next maintenance due time differs/);
equipmentState = execute(equipmentState, "complete_maintenance", {
  commandId: "asset:maintenance:tonometer:complete",
  assetId: tonometerAsset,
  completedAt: tonometerMaintenanceEndAt,
  nextDueAt: tonometerNextDueAt
}, {
  currentMinute: tonometerMaintenanceEndAt,
  schedulerState: emptySchedulerState()
}).state;
assert.equal(lifecycle.snapshot(equipmentState, tonometerNextDueAt - 1).resources["equipment.tonometer"].active, true);
assert.equal(lifecycle.snapshot(equipmentState, tonometerNextDueAt).resources["equipment.tonometer"].active, false);
assert.ok(lifecycle.projectSchedulerResources(equipmentState, {
  startAt: tonometerNextDueAt - 50,
  endAt: tonometerNextDueAt + 50
})
  .find((resource) => resource.id === "equipment.tonometer").unavailableWindows
  .some((window) => window.startAt === tonometerNextDueAt && window.endAt === tonometerNextDueAt + 50));

// Inventory consumption is atomic and reservation IDs cannot be double-spent.
let inventoryState = execute(initial, "receive_stock", {
  commandId: "stock:receive:rapid-tests",
  categoryId: "rapid_tests",
  units: 4,
  receivedAt: 100
}, { currentMinute: 100 }).state;
assert.equal(lifecycle.snapshot(inventoryState, 100).inventory.rapid_tests, 10);
const stockReservation = {
  reservationId: "inventory:task.stock.1:rapid_tests",
  taskId: "task.stock.1",
  categoryId: "rapid_tests",
  units: 3
};
assert.throws(() => execute(inventoryState, "consume_stock", {
  commandId: "stock:consume:rapid-tests:no-authority",
  categoryId: "rapid_tests",
  units: 3,
  reservationId: stockReservation.reservationId
}), /context.stockReservation/);
assert.throws(() => execute(inventoryState, "consume_stock", {
  commandId: "stock:consume:rapid-tests:wrong-authority",
  categoryId: "rapid_tests",
  units: 3,
  reservationId: stockReservation.reservationId
}, { stockReservation: { ...stockReservation, units: 2 } }), /differs from the command payload/);
inventoryState = execute(inventoryState, "consume_stock", {
  commandId: "stock:consume:rapid-tests:1",
  categoryId: "rapid_tests",
  units: 3,
  reservationId: stockReservation.reservationId
}, { stockReservation }).state;
assert.equal(lifecycle.snapshot(inventoryState, 100).inventory.rapid_tests, 7);
const beforeInsufficientStock = clone(inventoryState);
assert.throws(() => execute(inventoryState, "consume_stock", {
  commandId: "stock:consume:rapid-tests:too-many",
  categoryId: "rapid_tests",
  units: 8,
  reservationId: "inventory:task.stock.2:rapid_tests"
}, { stockReservation: {
  reservationId: "inventory:task.stock.2:rapid_tests",
  taskId: "task.stock.2",
  categoryId: "rapid_tests",
  units: 8
} }), /insufficient rapid_tests inventory/);
assert.throws(() => execute(inventoryState, "consume_stock", {
  commandId: "stock:consume:rapid-tests:duplicate-reservation",
  categoryId: "rapid_tests",
  units: 1,
  reservationId: stockReservation.reservationId
}, { stockReservation: { ...stockReservation, units: 2 } }), /differs from the command payload/);
assert.throws(() => execute(inventoryState, "consume_stock", {
  commandId: "stock:consume:rapid-tests:duplicate-reservation:exact",
  categoryId: "rapid_tests",
  units: 3,
  reservationId: stockReservation.reservationId
}, { stockReservation }), /already consumed stock/);
assertUnchanged(beforeInsufficientStock, inventoryState, "failed stock consumption must not partially decrement inventory");

// Retirement is blocked by future reservations and removes future scheduler capacity.
const beforeReservedRetirement = clone(equipmentState);
const tonometerRetiredAt = tonometerNextDueAt - 100;
assert.throws(() => execute(equipmentState, "retire_asset", {
  commandId: "asset:retire:tonometer:missing-reservation-authority",
  assetId: tonometerAsset,
  retiredAt: tonometerRetiredAt
}, { currentMinute: tonometerRetiredAt }), /canonical schedulerState reservation authority/);
assert.throws(() => execute(equipmentState, "retire_asset", {
  commandId: "asset:retire:tonometer:malformed-reservation-authority",
  assetId: tonometerAsset,
  retiredAt: tonometerRetiredAt
}, {
  currentMinute: tonometerRetiredAt,
  schedulerState: { reservations: [] }
}), /canonical scheduler state fields/);
assert.throws(() => execute(equipmentState, "retire_asset", {
  commandId: "asset:retire:tonometer:wrong-minute",
  assetId: tonometerAsset,
  retiredAt: tonometerRetiredAt
}, {
  currentMinute: tonometerRetiredAt - 1,
  schedulerState: emptySchedulerState()
}), /retiredAt must equal context.currentMinute/);
assert.throws(() => execute(equipmentState, "retire_asset", {
  commandId: "asset:retire:tonometer:reserved",
  assetId: tonometerAsset,
  retiredAt: tonometerRetiredAt
}, {
  currentMinute: tonometerRetiredAt,
  schedulerState: canonicalSchedulerState([{
    resourceId: "equipment.tonometer",
    capabilityId: "tonometer",
    startAt: tonometerRetiredAt - 10,
    endAt: tonometerRetiredAt + 20
  }])
}),
/future reservations exist/);
assertUnchanged(beforeReservedRetirement, equipmentState, "failed retirement must not mutate the asset");
equipmentState = execute(equipmentState, "retire_asset", {
  commandId: "asset:retire:tonometer",
  assetId: tonometerAsset,
  retiredAt: tonometerRetiredAt
}, {
  currentMinute: tonometerRetiredAt,
  schedulerState: emptySchedulerState()
}).state;
assert.equal(lifecycle.snapshot(equipmentState, tonometerRetiredAt - 1).resources["equipment.tonometer"].active, true);
assert.equal(lifecycle.snapshot(equipmentState, tonometerRetiredAt).resources["equipment.tonometer"].active, false);
assert.ok(lifecycle.projectSchedulerResources(equipmentState, {
  startAt: tonometerRetiredAt - 50,
  endAt: tonometerRetiredAt + 50
})
  .find((resource) => resource.id === "equipment.tonometer").unavailableWindows
  .some((window) => window.startAt === tonometerRetiredAt && window.endAt === tonometerRetiredAt + 50));

// Same command content is idempotent; a reused commandId with different content conflicts.
const stockCommand = {
  commandId: "stock:receive:idempotent",
  categoryId: "blood",
  units: 2,
  receivedAt: 120
};
assert.throws(() => execute(initial, "receive_stock", {
  ...stockCommand,
  commandId: "stock:receive:wrong-minute"
}, { currentMinute: 121 }), /receivedAt must equal context.currentMinute/);
const stockOnce = execute(initial, "receive_stock", stockCommand, { currentMinute: 120 });
const stockTwice = execute(stockOnce.state, "receive_stock", stockCommand, { currentMinute: 999 });
assert.equal(stockOnce.idempotent, false);
assert.equal(stockTwice.idempotent, true);
assert.deepEqual(stockTwice.state, stockOnce.state);
assert.equal(stockTwice.snapshot.inventory.blood, 17);
assert.throws(() => execute(stockOnce.state, "receive_stock", {
  ...stockCommand,
  units: 3
}, { currentMinute: 999 }), /already applied with different content/);

// Save/reload replays all derived state and rejects state/version/fingerprint tampering.
const serialized = lifecycle.serializeState(equipmentState);
const reloaded = lifecycle.deserializeState(serialized);
assert.deepEqual(reloaded, equipmentState);
assert.deepEqual(
  lifecycle.snapshot(reloaded, tonometerRetiredAt + 1),
  lifecycle.snapshot(equipmentState, tonometerRetiredAt + 1)
);
assert.deepEqual(
  lifecycle.projectSchedulerResources(reloaded, {
    startAt: tonometerRetiredAt - 50,
    endAt: tonometerRetiredAt + 50
  }),
  lifecycle.projectSchedulerResources(equipmentState, {
    startAt: tonometerRetiredAt - 50,
    endAt: tonometerRetiredAt + 50
  })
);
const tampered = JSON.parse(serialized);
tampered.commands[0].payload.price += 1;
assert.throws(() => lifecycle.deserializeState(JSON.stringify(tampered)), /fingerprint mismatch/);
const wrongVersion = { ...initial, schemaVersion: 2 };
assert.deepEqual(lifecycle.validateState(wrongVersion).valid, false);
assert.throws(() => lifecycle.normalizeState(wrongVersion), /version mismatch/);
const duplicateCommand = clone(stockOnce.state);
duplicateCommand.commands.push(clone(duplicateCommand.commands[0]));
assert.throws(() => lifecycle.normalizeState(duplicateCommand), /duplicate lifecycle command ID/);

console.log("Resource lifecycle v5: 13 commands, activation evidence, atomicity, replay and scheduler projection passed.");
