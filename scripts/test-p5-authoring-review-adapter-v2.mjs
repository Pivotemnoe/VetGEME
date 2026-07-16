#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadP5AuthoringReviewInputV2,
} from "./lib/p5-authoring-review-input-v2.mjs";
import {
  loadOperationalAuthoringReviewInputV4,
} from "./lib/operational-authoring-review-input-v4.mjs";
import {
  OPERATIONAL_MEDICAL_RESULT_AUTHORITY,
  P5_NON_AUTHORITATIVE_RESULT_SENTINEL,
  createP5AuthoringReviewAdapterV2,
  validateP5AuthoringReviewJoinV2,
} from "./lib/p5-authoring-review-adapter-v2.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const resourceSchedulerV5 = require("../systems/resource-scheduler-v5.js");
const [p5Input, operationalInput] = await Promise.all([
  loadP5AuthoringReviewInputV2(projectRoot, { context: "review" }),
  loadOperationalAuthoringReviewInputV4(projectRoot, { context: "review" }),
]);

function clone(value) {
  return structuredClone(value);
}

function withDocument(input, relativePath, mutate) {
  const document = clone(input.documents[relativePath]);
  mutate(document);
  return {
    ...input,
    documents: {
      ...input.documents,
      [relativePath]: document,
    },
  };
}

function executeLifecycle(lifecycle, state, command, payload, context = {}) {
  const timestampFieldByCommand = {
    hire_staff: "hiredAt",
    assign_shift: "startAt",
    purchase_asset: "purchasedAt",
    mark_delivery_complete: "deliveredAt",
    complete_training: "completedAt",
    mark_room_ready: "readyAt",
    start_maintenance: "startAt",
    complete_maintenance: "completedAt",
    receive_stock: "receivedAt",
    retire_asset: "retiredAt",
  };
  const timestampField = timestampFieldByCommand[command];
  const authoritativeContext = timestampField && context.currentMinute === undefined
    ? { ...context, currentMinute: payload[timestampField] }
    : context;
  return lifecycle.execute(state, command, payload, authoritativeContext).state;
}

function consumeStockForSetup(lifecycle, state, categoryId, units, suffix) {
  const taskId = `setup.stock.${suffix}`;
  const reservationId = `setup-inventory:${suffix}:${categoryId}`;
  return executeLifecycle(lifecycle, state, "consume_stock", {
    commandId: `setup:consume:${suffix}:${categoryId}`,
    categoryId,
    units,
    reservationId,
  }, {
    stockReservation: { reservationId, taskId, categoryId, units },
  });
}

function enqueue(adapter, state, commandId, task) {
  return adapter.enqueueExactTask(state, { commandId, task }).state;
}

function schedule(adapter, state, commandId, at) {
  return adapter.scheduleTask(state, { commandId, at });
}

function taskInput(kind, sourceId, taskId, queuedAt = 500, fatigue = { percent: 0, durationMultiplier: 1 }) {
  return { kind, sourceId, taskId, queuedAt, fatigue };
}

function assertRejectedWithoutMutation(state, action, pattern, message) {
  const before = clone(state);
  assert.throws(action, pattern);
  assert.deepEqual(state, before, message);
}

const joinAudit = validateP5AuthoringReviewJoinV2(p5Input, operationalInput);
assert.deepEqual(joinAudit, {
  p5Version: "2026.07.16.2",
  operationalVersion: "2026.07.16.4",
  resources: 49,
  staff: 10,
  rooms: 12,
  equipment: 27,
  lifecycleCommands: 13,
  canonicalCapabilities: 447,
  supplementalCapabilities: 8,
  researchTasks: 361,
  investigationUsages: 1864,
  runtimeTaskTemplates: 2606,
  inventoryCapabilities: 26,
  statePredicates: 293,
  fatigueBands: 5,
  absencePolicies: 3,
  exactRequirementGroupsAreReservationAuthority: true,
  reservationAuthorityScope: "review_adapter_only",
  liveRuntimeReservationAuthorityEnabled: false,
  flattenedOperationalResourceIdsAreReservationAuthority: false,
  liveSaveSchemaChanged: false,
  p5ResultMarkerRole: "non_authoritative_ownership_sentinel",
  operationalMedicalResultAuthority: "medical_family.presentation.investigations[].result_only",
  productionPool: 0,
});

const adapter = createP5AuthoringReviewAdapterV2(p5Input, operationalInput);
assert.equal(adapter.reviewOnly, true);
assert.equal(adapter.runtimeEligible, false);
assert.equal(adapter.productionEligible, false);
assert.equal(adapter.generatorEligible, false);
assert.deepEqual(adapter.productionPool, []);
assert.equal(adapter.audit.runtimeTaskTemplates, 2606);
const reservationPredicateAudit = adapter.auditReservationPredicateAuthority();
assert.equal(reservationPredicateAudit.taskTemplatesAudited, 2606);
assert.equal(reservationPredicateAudit.affectedTaskTemplates, 10);
assert.equal(reservationPredicateAudit.gapCount, 15);
assert.deepEqual(
  [...new Set(reservationPredicateAudit.findings.map((finding) => finding.capabilityId))],
  ["procedure_room", "short_stay", "imaging_room"],
);
assert.ok(reservationPredicateAudit.findings.some((finding) =>
  finding.kind === "research"
  && finding.sourceId === "pancreatitis_radiography_for_differentials"
  && finding.capabilityId === "imaging_room"
  && finding.eligibleResourceIds.includes("room.imaging.1")));

// The P5 marker proves ownership boundaries only; operational .4 keeps the
// exact medical result authority. Neither may be silently normalized to the other.
const p5Research = p5Input.documents["generated/research-task-catalog.json"].researchTasks;
const operationalResearch = operationalInput.documents["generated/p3/research-catalog.json"].research;
assert.equal(p5Research.length, 361);
assert.equal(operationalResearch.length, 361);
assert.ok(p5Research.every((record) =>
  record.medicalResultAuthority === P5_NON_AUTHORITATIVE_RESULT_SENTINEL));
assert.ok(operationalResearch.every((record) =>
  record.medicalResultAuthority === OPERATIONAL_MEDICAL_RESULT_AUTHORITY));

const p5AuthorityMutation = withDocument(
  p5Input,
  "generated/research-task-catalog.json",
  (document) => { document.researchTasks[0].medicalResultAuthority = OPERATIONAL_MEDICAL_RESULT_AUTHORITY; },
);
assert.throws(
  () => createP5AuthoringReviewAdapterV2(p5AuthorityMutation, operationalInput),
  /P5 non-authoritative result sentinel changed/,
);
const operationalAuthorityMutation = withDocument(
  operationalInput,
  "generated/p3/research-catalog.json",
  (document) => { document.research[0].medicalResultAuthority = "family.presentation.investigations[].result_only"; },
);
assert.throws(
  () => createP5AuthoringReviewAdapterV2(p5Input, operationalAuthorityMutation),
  /exact operational medical result authority changed/,
);
const flattenedAuthorityMutation = withDocument(
  operationalInput,
  "generated/p6/p3-p5-resource-crosswalk.json",
  (document) => { document.reservationAuthority = true; },
);
assert.throws(
  () => createP5AuthoringReviewAdapterV2(p5Input, flattenedAuthorityMutation),
  /flattened operational crosswalk must never become reservation authority/,
);
const exactCapabilityMutation = withDocument(
  p5Input,
  "source/p5-exact-capability-resource-map.json",
  (document) => { document.capabilities[0].eligibleStaffIds.pop(); },
);
assert.throws(
  () => createP5AuthoringReviewAdapterV2(exactCapabilityMutation, operationalInput),
  /P5 generated capability map differs from exact source authority/,
);
const inventorySourceMutation = withDocument(
  p5Input,
  "source/p5-exact-capability-resource-map.json",
  (document) => {
    document.capabilities.find((record) => record.executionMode === "inventory_only")
      .statePredicates[0].authority = "ui.inventory";
  },
);
const inventoryPredicateMutation = withDocument(
  inventorySourceMutation,
  "generated/capability-operations-map.json",
  (document) => {
    document.capabilities.find((record) => record.executionMode === "inventory_only")
      .statePredicates[0].authority = "ui.inventory";
  },
);
assert.throws(
  () => createP5AuthoringReviewAdapterV2(inventoryPredicateMutation, operationalInput),
  /inventory authority must remain p6.inventoryState/,
);
const referralCapability = p5Input.documents["generated/capability-operations-map.json"].capabilities
  .find((record) => record.capabilityId === "safe_referral");
assert.equal(referralCapability.statePredicates[0].predicate, "referral_coordination_slot_available");
let statePredicateMutation = withDocument(
  p5Input,
  "source/p5-exact-capability-resource-map.json",
  (document) => {
    document.capabilities.find((record) => record.capabilityId === "safe_referral")
      .statePredicates[0].authority = "ui.scheduler";
  },
);
statePredicateMutation = withDocument(
  statePredicateMutation,
  "generated/capability-operations-map.json",
  (document) => {
    document.capabilities.find((record) => record.capabilityId === "safe_referral")
      .statePredicates[0].authority = "ui.scheduler";
  },
);
assert.throws(
  () => createP5AuthoringReviewAdapterV2(statePredicateMutation, operationalInput),
  /safe_referral\.statePredicates\[0\] authority changed/,
);
const safeRouteMutation = withDocument(
  p5Input,
  "generated/research-task-catalog.json",
  (document) => { document.researchTasks[0].safeRouteId = "missing_referral"; },
);
assert.throws(
  () => createP5AuthoringReviewAdapterV2(safeRouteMutation, operationalInput),
  /safeRouteId must reference an exact external-service capability/,
);
const protocolMutation = withDocument(
  p5Input,
  "generated/research-task-catalog.json",
  (document) => {
    const record = document.researchTasks.find((item) => item.protocolCapabilityIds.length > 0);
    record.protocolCapabilityIds[0] = "microscope";
  },
);
assert.throws(
  () => createP5AuthoringReviewAdapterV2(protocolMutation, operationalInput),
  /protocol microscope is outside its exact dependency closure|unsupported capability type/,
);

// Task construction copies only exact authored scheduling fields and stays immutable.
const historyTemplate = adapter.getTaskTemplate("visit", "visit.history");
assert.equal(historyTemplate.sourceType, "visit_stage");
assert.equal(historyTemplate.handoffPolicyId, "not_allowed");
assert.equal(historyTemplate.runtimeTemplate.authoredDurationMinutes, 10);
assert.equal(historyTemplate.runtimeTemplate.requirementGroups.length, 2);
assert.ok(Object.isFrozen(historyTemplate));
const historyTask = adapter.createTask({
  ...taskInput("visit", "visit.history", "task.history"),
  patientId: "patient.1",
  ownerId: "owner.1",
});
assert.equal(historyTask.sourceType, "visit_stage");
assert.equal(historyTask.sourceId, "visit.history");
assert.equal(historyTask.authoredDurationMinutes, 10);
assert.equal(historyTask.patientId, "patient.1");
assert.equal(historyTask.ownerId, "owner.1");
assert.equal(Object.isFrozen(historyTask), true);
assert.throws(() => { historyTask.priority = -1; }, TypeError);
assert.throws(() => adapter.createTask({
  ...taskInput("visit", "visit.history", "task.forbidden"),
  medicalResult: "forbidden",
}), /forbidden field medicalResult/);
assert.throws(() => adapter.createTask(taskInput("visit", "visit.missing", "task.missing")), /unknown visit task/);
assert.throws(() => adapter.getTaskTemplate("capability", "unknown.capability"), /unknown capability task/);
const firstResearchId = p5Input.documents["generated/research-task-catalog.json"].researchTasks[0].researchId;
const firstUsageId = p5Input.documents["generated/investigation-usage-task-map.json"].usageTasks[0].usageId;
const firstTaskCapabilityId = p5Input.documents["generated/capability-operations-map.json"].capabilities
  .find((record) => [
    "schedulable_task",
    "external_coordination",
    "explicit_alternative_resolution",
  ].includes(record.executionMode)).capabilityId;
assert.equal(
  adapter.createTask(taskInput("research", firstResearchId, "task.research")).sourceType,
  "research",
);
assert.equal(
  adapter.createTask(taskInput("usage", firstUsageId, "task.usage")).sourceType,
  "research_usage",
);
assert.equal(
  adapter.createTask(taskInput("capability", firstTaskCapabilityId, "task.capability")).sourceType,
  "capability",
);
for (const [percent, durationMultiplier] of [
  [0, 1], [39, 1], [40, 1.1], [59, 1.1], [60, 1.2], [79, 1.2],
  [80, 1.35], [99, 1.35], [100, 1.35],
]) {
  assert.deepEqual(
    adapter.createTask(taskInput(
      "visit",
      "visit.history",
      `task.fatigue.${percent}`,
      500,
      { percent, durationMultiplier },
    )).fatigue,
    { percent, durationMultiplier },
  );
}
assert.throws(() => adapter.createTask(taskInput(
  "visit",
  "visit.history",
  "task.fatigue.forged",
  500,
  { percent: 10, durationMultiplier: 1.1 },
)), /duration multiplier 1.1 differs from authored band 0-39/);
assert.throws(() => adapter.createTask(taskInput(
  "visit",
  "visit.history",
  "task.fatigue.extra-field",
  500,
  { percent: 10, durationMultiplier: 1, routineStartAllowed: true },
)), /fatigue fields must be exactly/);

// Initial doctors are hired_unscheduled; no staff-dependent task may run until
// an explicit persisted shift is selected. Check-in also fails closed without admin staff.
const initialLifecycleState = adapter.lifecycle.createState();
let noShiftScheduler = adapter.createSchedulerState(initialLifecycleState, { startAt: 480, endAt: 620 });
noShiftScheduler = enqueue(
  adapter,
  noShiftScheduler,
  "enqueue:no-shift-history",
  taskInput("visit", "visit.history", "task.no-shift-history"),
);
const noShiftResult = schedule(adapter, noShiftScheduler, "schedule:no-shift-history", 500);
assert.equal(noShiftResult.reasonCode, "capacity_unavailable");
assert.equal(noShiftResult.task, null);

let noAdminScheduler = adapter.createSchedulerState(initialLifecycleState, { startAt: 480, endAt: 620 });
noAdminScheduler = enqueue(
  adapter,
  noAdminScheduler,
  "enqueue:no-admin-checkin",
  taskInput("visit", "visit.checkin", "task.no-admin-checkin"),
);
const noAdminResult = schedule(adapter, noAdminScheduler, "schedule:no-admin-checkin", 500);
assert.equal(noAdminResult.reasonCode, "capacity_unavailable");

let noUrgentStaffScheduler = adapter.createSchedulerState(initialLifecycleState, { startAt: 480, endAt: 620 });
noUrgentStaffScheduler = enqueue(
  adapter,
  noUrgentStaffScheduler,
  "enqueue:no-staff-urgent",
  taskInput("visit", "visit.urgent_triage", "task.no-staff-urgent"),
);
const noUrgentStaff = schedule(adapter, noUrgentStaffScheduler, "schedule:no-staff-urgent", 500);
assert.equal(noUrgentStaff.reasonCode, "urgent_capacity_unavailable_safe_route_required");
assert.equal(noUrgentStaff.safeRouteRequired, true);
assert.equal(noUrgentStaff.safeRouteId, "safe_referral");

let staffedLifecycleState = initialLifecycleState;
staffedLifecycleState = executeLifecycle(adapter.lifecycle, staffedLifecycleState, "purchase_asset", {
  commandId: "purchase:consult2:staffing-authority",
  assetCatalogId: "asset.room.consult.2",
  purchasedAt: 100,
  price: 12000,
}, { unlockedAssetCatalogIds: ["asset.room.consult.2"] });
for (const [doctor, suffix, endAt] of [
  ["staff.doctor.morozov", "morozov", 840],
  ["staff.doctor.sokolova", "sokolova", 1080],
]) {
  staffedLifecycleState = executeLifecycle(adapter.lifecycle, staffedLifecycleState, "assign_shift", {
    commandId: `shift:${suffix}:day1`,
    staffId: doctor,
    shiftId: `shift.${suffix}.day1`,
    startAt: 480,
    endAt,
  });
}
const staffedSerialized = adapter.lifecycle.serializeState(staffedLifecycleState);
const staffedReloaded = adapter.lifecycle.deserializeState(staffedSerialized);
assert.deepEqual(staffedReloaded, staffedLifecycleState);

// The immutable .2 author source contains 15 room-state predicates across 10
// templates that their reservation groups do not guarantee. Do not synthesize
// missing groups: even if a stale standalone scheduler projection can allocate
// the authored groups, the exact adapter must revert the allocation and return
// the authored safe referral route.
let authorGapScheduler = adapter.createSchedulerState(staffedReloaded, {
  startAt: 480,
  endAt: 620,
});
authorGapScheduler = clone(authorGapScheduler);
authorGapScheduler.resources["room.procedure.1"].unavailableWindows = [];
authorGapScheduler.resources["equipment.vital_monitor"].unavailableWindows = [];
authorGapScheduler = adapter.normalizeSchedulerState(authorGapScheduler);
authorGapScheduler = enqueue(
  adapter,
  authorGapScheduler,
  "enqueue:author-gap:gdv-monitoring",
  taskInput(
    "research",
    "gdv_postoperative_reperfusion_arrhythmia_and_organ_monitoring",
    "task.author-gap.gdv-monitoring",
  ),
);
const authorGapBeforeSchedule = clone(authorGapScheduler);
const authorGapBlocked = adapter.scheduleExactTask(
  staffedReloaded,
  authorGapScheduler,
  { commandId: "schedule:author-gap:gdv-monitoring", at: 500 },
);
assert.equal(
  authorGapBlocked.reasonCode,
  "state_predicate_reservation_unavailable_safe_route_required",
);
assert.equal(authorGapBlocked.safeRouteRequired, true);
assert.equal(authorGapBlocked.safeRouteId, "safe_referral");
assert.equal(authorGapBlocked.task, null);
assert.equal(authorGapBlocked.blockedTaskId, "task.author-gap.gdv-monitoring");
assert.deepEqual(
  authorGapBlocked.missingReservationPredicates.map((finding) => finding.capabilityId),
  ["procedure_room", "short_stay"],
);
assert.deepEqual(authorGapBlocked.state, authorGapBeforeSchedule,
  "author-source reservation gap must not persist a partial scheduler allocation");

// The authoritative adapter path persists lifecycle, scheduler and their exact
// projection horizon together. Lifecycle mutations either reconcile all 49
// resources while preserving scheduler work, or return no state at all.
const atomicHorizon = { startAt: 0, endAt: 50000 };
let atomicState = adapter.createAtomicState(initialLifecycleState, atomicHorizon);
assert.equal(atomicState.schemaVersion, adapter.atomicStateSchemaVersion);
assert.deepEqual(
  adapter.deserializeAtomicState(adapter.serializeAtomicState(atomicState)),
  atomicState,
);
function applyAtomic(state, transaction) {
  const beforeReload = adapter.deserializeAtomicState(adapter.serializeAtomicState(state));
  assert.deepEqual(beforeReload, state, `${transaction.command}: atomic reload before transition changed state`);
  const result = adapter.applyLifecycleCommandAtomic(beforeReload, transaction);
  const afterReload = adapter.deserializeAtomicState(adapter.serializeAtomicState(result.state));
  assert.deepEqual(afterReload, result.state,
    `${transaction.command}: atomic reload after transition changed state`);
  return { ...result, state: afterReload };
}
atomicState = applyAtomic(atomicState, {
  command: "purchase_asset",
  payload: {
    commandId: "atomic:purchase:consult2:staffing-authority",
    assetCatalogId: "asset.room.consult.2",
    purchasedAt: 100,
    price: 12000,
  },
  currentMinute: 100,
  authorityContext: { unlockedAssetCatalogIds: ["asset.room.consult.2"] },
}).state;
for (const [doctor, suffix, endAt] of [
  ["staff.doctor.morozov", "morozov", 840],
  ["staff.doctor.sokolova", "sokolova", 1080],
]) {
  atomicState = applyAtomic(atomicState, {
    command: "assign_shift",
    payload: {
      commandId: `atomic:shift:${suffix}:day1`,
      staffId: doctor,
      shiftId: `atomic.shift.${suffix}.day1`,
      startAt: 480,
      endAt,
    },
    currentMinute: 100,
    authorityContext: {},
  }).state;
}
const availableStaffSnapshot = adapter.getAtomicStaffSnapshot(atomicState, 500);
assert.equal(
  availableStaffSnapshot.resources["staff.doctor.morozov"].staffAvailabilityState,
  "available",
);
assert.equal(
  availableStaffSnapshot.resources["staff.doctor.sokolova"].staffAvailabilityState,
  "available",
);
assert.equal(
  adapter.getAtomicStaffSnapshot(atomicState, 850)
    .resources["staff.doctor.morozov"].staffAvailabilityState,
  "resting",
);

// Raw scheduler APIs accept any multiplier >= 1, but the P5 join owns five
// exact fatigue bands. Atomic reload must reject forged queued and active tasks
// before their altered duration can affect time or economy.
const forgedFatigueTask = clone(adapter.createTask(taskInput(
  "visit",
  "visit.history",
  "task.atomic.forged-fatigue",
)));
forgedFatigueTask.fatigue.durationMultiplier = 5;
const forgedFatigueEnqueued = resourceSchedulerV5.enqueueTask(atomicState.schedulerState, {
  commandId: "atomic:enqueue:forged-fatigue",
  task: forgedFatigueTask,
});
assert.throws(
  () => adapter.normalizeAtomicState({
    ...clone(atomicState),
    schedulerState: forgedFatigueEnqueued.state,
  }),
  /fatigue multiplier differs from exact authored band/,
);
const forgedFatigueScheduled = resourceSchedulerV5.scheduleTask(forgedFatigueEnqueued.state, {
  commandId: "atomic:schedule:forged-fatigue",
  at: 500,
});
assert.equal(forgedFatigueScheduled.reasonCode, "scheduled");
assert.equal(forgedFatigueScheduled.task.scheduledDurationMinutes, 50);
assert.throws(
  () => adapter.deserializeAtomicState(JSON.stringify({
    ...clone(atomicState),
    schedulerState: forgedFatigueScheduled.state,
  })),
  /fatigue multiplier differs from exact authored band/,
);

// Reload validation must independently reject an active task whose authored
// state predicates are not backed by its persisted reservation segments. Use a
// count-preserving input mutation so the regression does not depend on the
// much larger lifecycle setup of the real 15-gap author-source examples.
let reloadGapInput = withDocument(
  p5Input,
  "source/p5-exact-capability-resource-map.json",
  (document) => {
    const microscope = document.capabilities.find((record) => record.capabilityId === "microscope");
    microscope.statePredicates[3] = {
      predicate: "ready_room_available",
      capabilityId: "microscope",
      eligibleRoomIds: ["room.short_stay.1"],
      authority: "p5.roomState",
    };
  },
);
reloadGapInput = withDocument(
  reloadGapInput,
  "generated/capability-operations-map.json",
  (document) => {
    const microscope = document.capabilities.find((record) => record.capabilityId === "microscope");
    microscope.statePredicates[3] = {
      predicate: "ready_room_available",
      capabilityId: "microscope",
      eligibleRoomIds: ["room.short_stay.1"],
      authority: "p5.roomState",
    };
  },
);
const reloadGapAdapter = createP5AuthoringReviewAdapterV2(reloadGapInput, operationalInput);
let forgedReloadEnvelope = reloadGapAdapter.normalizeAtomicState(atomicState);
forgedReloadEnvelope = reloadGapAdapter.enqueueAtomicTask(forgedReloadEnvelope, {
  commandId: "atomic:enqueue:forged-reload-gap",
  task: taskInput(
    "research",
    "acetate_tape_prep",
    "task.atomic.forged-reload-gap",
  ),
}).state;
const rawGapAllocation = resourceSchedulerV5.scheduleTask(forgedReloadEnvelope.schedulerState, {
  commandId: "atomic:schedule:forged-reload-gap",
  at: 500,
});
assert.equal(rawGapAllocation.reasonCode, "scheduled");
const halfAppliedGapEnvelope = {
  ...clone(forgedReloadEnvelope),
  schedulerState: rawGapAllocation.state,
};
assert.throws(
  () => reloadGapAdapter.deserializeAtomicState(JSON.stringify(halfAppliedGapEnvelope)),
  /lacks ready_room_available evidence for microscope/,
);
assert.deepEqual(
  reloadGapAdapter.deserializeAtomicState(reloadGapAdapter.serializeAtomicState(forgedReloadEnvelope)),
  forgedReloadEnvelope,
  "rejected state-predicate forgery must not mutate the last valid atomic envelope",
);
let absenceAtomic = adapter.recordStaffAbsenceAtomic(atomicState, {
  commandId: "atomic:absence:sokolova:planned-day3",
  authorityId: "p7.event.planned-leave.sokolova.day3",
  staffId: "staff.doctor.sokolova",
  absenceTypeId: "planned_leave",
  triggerAuthority: "p7_event_only",
  recordedAt: 100,
  startAt: 3000,
  endAt: 4440,
});
assert.equal(absenceAtomic.idempotent, false);
absenceAtomic = {
  ...absenceAtomic,
  state: adapter.deserializeAtomicState(adapter.serializeAtomicState(absenceAtomic.state)),
};
assert.equal(
  adapter.getAtomicStaffSnapshot(absenceAtomic.state, 3000)
    .resources["staff.doctor.sokolova"].staffAvailabilityState,
  "absent",
);
assert.ok(absenceAtomic.state.schedulerState.resources["staff.doctor.sokolova"].unavailableWindows
  .some((window) => window.startAt <= 3000 && window.endAt >= 4440));
assert.equal(adapter.recordStaffAbsenceAtomic(absenceAtomic.state, {
  commandId: "atomic:absence:sokolova:planned-day3",
  authorityId: "p7.event.planned-leave.sokolova.day3",
  staffId: "staff.doctor.sokolova",
  absenceTypeId: "planned_leave",
  triggerAuthority: "p7_event_only",
  recordedAt: 100,
  startAt: 3000,
  endAt: 4440,
}).idempotent, true);
assert.throws(() => adapter.recordStaffAbsenceAtomic(absenceAtomic.state, {
  commandId: "atomic:absence:duplicate-external-authority",
  authorityId: "p7.event.planned-leave.sokolova.day3",
  staffId: "staff.doctor.morozov",
  absenceTypeId: "planned_leave",
  triggerAuthority: "p7_event_only",
  recordedAt: 100,
  startAt: 4500,
  endAt: 5940,
}), /staff absence authority .* is already bound to another command/);
assert.throws(() => adapter.recordStaffAbsenceAtomic(atomicState, {
  commandId: "atomic:absence:forged-notice",
  authorityId: "p7.event.forged",
  staffId: "staff.doctor.sokolova",
  absenceTypeId: "planned_leave",
  triggerAuthority: "p7_event_only",
  recordedAt: 200,
  startAt: 3000,
  endAt: 4440,
}), /violates exact P5 absence notice/);
assert.throws(() => adapter.recordStaffAbsenceAtomic(atomicState, {
  commandId: "atomic:absence:forged-trigger",
  authorityId: "p7.event.forged",
  staffId: "staff.doctor.sokolova",
  absenceTypeId: "planned_leave",
  triggerAuthority: "player_training_decision",
  recordedAt: 100,
  startAt: 3000,
  endAt: 4440,
}), /triggerAuthority differs from exact P5 policy/);

// An authoritative absence must participate in projection validation without
// making unrelated work stale. Persist it, schedule a task on other resources,
// transfer that task, and prove the exact ownership segments survive reload.
let unrelatedAbsenceAtomic = applyAtomic(atomicState, {
  command: "hire_staff",
  payload: {
    commandId: "atomic:hire:assistant:absence-regression",
    staffId: "staff.assistant.volkova",
    hiredAt: 100,
  },
  currentMinute: 100,
  authorityContext: {},
}).state;
unrelatedAbsenceAtomic = applyAtomic(unrelatedAbsenceAtomic, {
  command: "assign_shift",
  payload: {
    commandId: "atomic:shift:assistant:absence-regression",
    staffId: "staff.assistant.volkova",
    shiftId: "atomic.shift.assistant.absence-regression",
    startAt: 480,
    endAt: 840,
  },
  currentMinute: 100,
  authorityContext: {},
}).state;
unrelatedAbsenceAtomic = adapter.recordStaffAbsenceAtomic(unrelatedAbsenceAtomic, {
  commandId: "atomic:absence:assistant:unplanned-regression",
  authorityId: "p7.event.unplanned-illness.assistant.regression",
  staffId: "staff.assistant.volkova",
  absenceTypeId: "unplanned_illness",
  triggerAuthority: "p7_event_only",
  recordedAt: 500,
  startAt: 500,
  endAt: 1940,
}).state;
unrelatedAbsenceAtomic = adapter.deserializeAtomicState(
  adapter.serializeAtomicState(unrelatedAbsenceAtomic),
);
assert.equal(
  adapter.getAtomicStaffSnapshot(unrelatedAbsenceAtomic, 500)
    .resources["staff.assistant.volkova"].staffAvailabilityState,
  "absent",
);
// These two task IDs deliberately collide under the legacy 32-bit adapter
// fingerprint for this exact handoff payload. Idempotency must therefore also
// compare canonical payloads, never the fingerprint alone.
const handoffCollisionTaskId = "task.collision.20969";
const conflictingHandoffCollisionTaskId = "task.collision.286534";
unrelatedAbsenceAtomic = adapter.enqueueAtomicTask(unrelatedAbsenceAtomic, {
  commandId: "atomic:enqueue:referral:unrelated-absence",
  task: taskInput(
    "visit",
    "visit.referral_coordination",
    handoffCollisionTaskId,
  ),
}).state;
const unrelatedAbsenceScheduled = adapter.scheduleAtomicTask(unrelatedAbsenceAtomic, {
  commandId: "atomic:schedule:referral:unrelated-absence",
  at: 500,
});
assert.equal(unrelatedAbsenceScheduled.reasonCode, "scheduled");
assert.equal(
  unrelatedAbsenceScheduled.reservations.find((record) => record.groupId === "staff").resourceId,
  "staff.doctor.morozov",
);
const rawPolicyBypass = clone(unrelatedAbsenceScheduled.state);
rawPolicyBypass.schedulerState = resourceSchedulerV5.handoffTask(
  rawPolicyBypass.schedulerState,
  {
    commandId: "raw:handoff:invalid-authored-point",
    taskId: handoffCollisionTaskId,
    at: 505,
    reassignments: [{
      groupId: "staff",
      fromResourceId: "staff.doctor.morozov",
      toResourceId: "staff.doctor.sokolova",
      capabilityId: "role.doctor",
      units: 1,
    }],
  },
).state;
assertRejectedWithoutMutation(
  rawPolicyBypass,
  () => adapter.normalizeAtomicState(rawPolicyBypass),
  /unsupported durable type handoff/,
  "raw scheduler handoff without an authored receipt must not enter atomic state",
);
const atomicHandoffCommand = {
  commandId: "atomic:handoff:referral:unrelated-absence",
  taskId: handoffCollisionTaskId,
  at: 506,
  reassignments: [{
    groupId: "staff",
    fromResourceId: "staff.doctor.morozov",
    toResourceId: "staff.doctor.sokolova",
    capabilityId: "role.doctor",
    units: 1,
  }],
};
const unrelatedAbsenceHandedOff = adapter.handoffAtomicTask(
  adapter.deserializeAtomicState(adapter.serializeAtomicState(unrelatedAbsenceScheduled.state)),
  atomicHandoffCommand,
);
assert.equal(unrelatedAbsenceHandedOff.reasonCode, "handed_off");
assert.equal(unrelatedAbsenceHandedOff.state.schedulerState.appliedCommandIds.includes(
  atomicHandoffCommand.commandId,
), false);
assert.equal(unrelatedAbsenceHandedOff.state.adapterCommands.find((entry) =>
  entry.commandId === atomicHandoffCommand.commandId).type, "handoff_receipt");
const unrelatedAbsenceReloaded = adapter.deserializeAtomicState(
  adapter.serializeAtomicState(unrelatedAbsenceHandedOff.state),
);
assert.deepEqual(
  unrelatedAbsenceReloaded.schedulerState.reservations
    .filter((record) => record.taskId === handoffCollisionTaskId
      && record.groupId === "staff")
    .map(({ resourceId, startAt, endAt }) => ({ resourceId, startAt, endAt })),
  [
    { resourceId: "staff.doctor.morozov", startAt: 500, endAt: 506 },
    { resourceId: "staff.doctor.sokolova", startAt: 506, endAt: 512 },
  ],
);
assert.equal(adapter.handoffAtomicTask(
  unrelatedAbsenceReloaded,
  atomicHandoffCommand,
).idempotent, true);
assert.throws(() => adapter.handoffAtomicTask(
  unrelatedAbsenceReloaded,
  {
    ...atomicHandoffCommand,
    taskId: conflictingHandoffCollisionTaskId,
  },
), /already applied with different content/);
const missingHandoffReceipt = clone(unrelatedAbsenceReloaded);
missingHandoffReceipt.adapterCommands = missingHandoffReceipt.adapterCommands.filter((entry) =>
  entry.commandId !== atomicHandoffCommand.commandId);
assertRejectedWithoutMutation(
  missingHandoffReceipt,
  () => adapter.normalizeAtomicState(missingHandoffReceipt),
  /reservation ownership cuts differ from exact handoff receipts/,
  "reservation ownership cuts without a handoff receipt must fail reload",
);
let atomicEnqueued = adapter.enqueueAtomicTask(atomicState, {
  commandId: "atomic:enqueue:microscope",
  task: taskInput(
    "research",
    "acetate_tape_prep",
    "task.atomic.microscope",
  ),
});
atomicState = atomicEnqueued.state;
const atomicScheduled = adapter.scheduleAtomicTask(atomicState, {
  commandId: "atomic:schedule:microscope",
  at: 500,
});
assert.equal(atomicScheduled.reasonCode, "scheduled");
assert.ok(atomicScheduled.reservations.some((reservation) =>
  reservation.resourceId === "equipment.microscope"));
atomicState = adapter.deserializeAtomicState(adapter.serializeAtomicState(atomicScheduled.state));
assert.equal(
  adapter.getAtomicStaffSnapshot(atomicState, 500)
    .resources["staff.doctor.morozov"].staffAvailabilityState,
  "busy",
);
let stockHalfAtomic = adapter.enqueueAtomicTask(atomicState, {
  commandId: "atomic:enqueue:stock-half",
  task: taskInput(
    "research",
    "minimum_dermatologic_database",
    "task.atomic.stock-half",
    700,
  ),
}).state;
const stockHalfBeforeSchedule = clone(stockHalfAtomic);
const stockHalfScheduled = adapter.scheduleAtomicTask(stockHalfAtomic, {
  commandId: "atomic:schedule:stock-half",
  at: 700,
});
assert.equal(stockHalfScheduled.reasonCode, "scheduled");
assert.equal(
  adapter.lifecycle.snapshot(stockHalfScheduled.state.lifecycleState, 700).inventory.cytology,
  adapter.lifecycle.snapshot(stockHalfBeforeSchedule.lifecycleState, 700).inventory.cytology - 2,
);
const halfAppliedStockState = {
  ...clone(stockHalfScheduled.state),
  lifecycleState: clone(stockHalfBeforeSchedule.lifecycleState),
};
assert.throws(
  () => adapter.normalizeAtomicState(halfAppliedStockState),
  /inventory consumption ledger differs from active scheduler tasks/,
);
assert.deepEqual(
  adapter.deserializeAtomicState(adapter.serializeAtomicState(stockHalfScheduled.state)),
  stockHalfScheduled.state,
);

let refillAtomic = adapter.createAtomicState(staffedReloaded, atomicHorizon);
let refillAt = 500;
for (let index = 0; index < 15; index += 1) {
  const taskId = `task.atomic.deplete-cytology.${index}`;
  refillAtomic = adapter.enqueueAtomicTask(refillAtomic, {
    commandId: `atomic:enqueue:deplete-cytology:${index}`,
    task: taskInput("research", "minimum_dermatologic_database", taskId, refillAt),
  }).state;
  const scheduled = adapter.scheduleAtomicTask(refillAtomic, {
    commandId: `atomic:schedule:deplete-cytology:${index}`,
    at: refillAt,
  });
  assert.equal(scheduled.reasonCode, "scheduled");
  refillAtomic = scheduled.state;
  refillAt = scheduled.task.endAt;
}
assert.equal(adapter.lifecycle.snapshot(refillAtomic.lifecycleState, refillAt).inventory.cytology, 0);
refillAtomic = adapter.enqueueAtomicTask(refillAtomic, {
  commandId: "atomic:enqueue:depleted-cytology",
  task: taskInput(
    "research",
    "minimum_dermatologic_database",
    "task.atomic.depleted-cytology",
    refillAt,
  ),
}).state;
const blockedForStock = adapter.scheduleAtomicTask(refillAtomic, {
  commandId: "atomic:schedule:depleted-cytology",
  at: refillAt,
});
assert.equal(blockedForStock.reasonCode, "inventory_unavailable_safe_route_required");
assert.equal(blockedForStock.safeRouteId, "safe_referral");
assert.equal(blockedForStock.state.schedulerState.tasks
  .find((task) => task.id === "task.atomic.depleted-cytology").status, "queued");
assert.equal(blockedForStock.state.adapterCommands.some((entry) =>
  entry.commandId === "atomic:schedule:depleted-cytology"
  && entry.type === "blocked_schedule"), true);

// A blocked attempt has exactly one durable idempotency owner: the adapter
// ledger. Scheduler capacity receipts are rolled back, and unrelated enqueue
// or earlier no-ready scheduler receipts cannot be reinterpreted as a block.
const dualLedgerCommandId = "atomic:dual:enqueue-as-blocked";
let genuineCapacityBlockedState = adapter.createAtomicState(initialLifecycleState, atomicHorizon);
genuineCapacityBlockedState = adapter.enqueueAtomicTask(genuineCapacityBlockedState, {
  commandId: "atomic:enqueue:genuine-capacity-block",
  task: taskInput(
    "visit",
    "visit.history",
    "task.atomic.genuine-capacity-block",
    500,
  ),
}).state;
const genuineCapacityBlocked = adapter.scheduleAtomicTask(genuineCapacityBlockedState, {
  commandId: "atomic:schedule:genuine-capacity-block",
  at: 500,
});
assert.equal(genuineCapacityBlocked.reasonCode, "capacity_unavailable");
assert.equal(genuineCapacityBlocked.state.schedulerState.appliedCommandIds.includes(
  "atomic:schedule:genuine-capacity-block",
), false);
assert.equal(genuineCapacityBlocked.state.adapterCommands.find((entry) =>
  entry.commandId === "atomic:schedule:genuine-capacity-block")
  .payload.schedulerCommandApplied, false);
const enqueueThenForgeBlocked = adapter.enqueueAtomicTask(genuineCapacityBlocked.state, {
  commandId: dualLedgerCommandId,
  task: taskInput(
    "visit",
    "visit.history",
    "task.atomic.dual-ledger-collision",
    500,
  ),
}).state;
const genuineBlockedReceipt = genuineCapacityBlocked.state.adapterCommands.find((entry) =>
  entry.commandId === "atomic:schedule:genuine-capacity-block");
const forgedEnqueueAsBlocked = {
  ...clone(enqueueThenForgeBlocked),
  adapterCommands: [
    ...clone(enqueueThenForgeBlocked.adapterCommands),
    { ...clone(genuineBlockedReceipt), commandId: dualLedgerCommandId },
  ],
};
assertRejectedWithoutMutation(
  forgedEnqueueAsBlocked,
  () => adapter.normalizeAtomicState(forgedEnqueueAsBlocked),
  /bound to incompatible scheduler and adapter effects/,
  "forged enqueue-to-blocked receipt rejection must preserve the supplied state",
);

const noReadyCommandId = "atomic:schedule:early-no-ready";
const noReadyAttempt = adapter.scheduleAtomicTask(
  adapter.createAtomicState(initialLifecycleState, atomicHorizon),
  {
    commandId: noReadyCommandId,
    at: 500,
  },
);
assert.equal(noReadyAttempt.reasonCode, "no_ready_task");
assert.equal(noReadyAttempt.state.schedulerState.appliedCommandIds.includes(noReadyCommandId), false);
assert.equal(noReadyAttempt.state.adapterCommands.find((entry) =>
  entry.commandId === noReadyCommandId).type, "no_ready_schedule");
const noReadyReloaded = adapter.deserializeAtomicState(
  adapter.serializeAtomicState(noReadyAttempt.state),
);
assert.equal(adapter.scheduleAtomicTask(noReadyReloaded, {
  commandId: noReadyCommandId,
  at: 500,
}).idempotent, true);

const directExactBlocked = adapter.scheduleExactTask(
  initialLifecycleState,
  genuineCapacityBlockedState.schedulerState,
  { commandId: "direct:schedule:capacity-block", at: 500 },
);
assert.equal(directExactBlocked.reasonCode, "capacity_unavailable");
assert.equal(directExactBlocked.state.appliedCommandIds.includes(
  "direct:schedule:capacity-block",
), false);
const directSimpleBlocked = adapter.scheduleTask(
  genuineCapacityBlockedState.schedulerState,
  { commandId: "direct:schedule:simple-capacity-block", at: 500 },
);
assert.equal(directSimpleBlocked.reasonCode, "capacity_unavailable");
assert.equal(directSimpleBlocked.state.appliedCommandIds.includes(
  "direct:schedule:simple-capacity-block",
), false);

const rawSchedulerNoReadyEnvelope = adapter.createAtomicState(
  initialLifecycleState,
  atomicHorizon,
);
rawSchedulerNoReadyEnvelope.schedulerState = resourceSchedulerV5.scheduleTask(
  rawSchedulerNoReadyEnvelope.schedulerState,
  { commandId: "raw:schedule:no-ready", at: 500 },
).state;
assertRejectedWithoutMutation(
  rawSchedulerNoReadyEnvelope,
  () => adapter.normalizeAtomicState(rawSchedulerNoReadyEnvelope),
  /must own exactly one matching task transition/,
  "raw scheduler no-ready receipt rejection must preserve the supplied state",
);
const disguisedRawSchedulerNoReadyEnvelope = clone(rawSchedulerNoReadyEnvelope);
disguisedRawSchedulerNoReadyEnvelope.schedulerState.commandFingerprints[
  "raw:schedule:no-ready"
] = disguisedRawSchedulerNoReadyEnvelope.schedulerState.commandFingerprints[
  "raw:schedule:no-ready"
].replace(/^schedule:/, "enqueue:");
assertRejectedWithoutMutation(
  disguisedRawSchedulerNoReadyEnvelope,
  () => adapter.normalizeAtomicState(disguisedRawSchedulerNoReadyEnvelope),
  /must own exactly one matching task transition/,
  "a forged enqueue prefix must not disguise a raw no-ready scheduler receipt",
);

const rawSchedulerBlockedEnvelope = clone(genuineCapacityBlockedState);
rawSchedulerBlockedEnvelope.schedulerState = resourceSchedulerV5.scheduleTask(
  rawSchedulerBlockedEnvelope.schedulerState,
  { commandId: "raw:schedule:capacity-block", at: 500 },
).state;
assertRejectedWithoutMutation(
  rawSchedulerBlockedEnvelope,
  () => adapter.normalizeAtomicState(rawSchedulerBlockedEnvelope),
  /must own exactly one matching task transition/,
  "raw scheduler capacity receipt rejection must preserve the supplied state",
);
const disguisedRawSchedulerBlockedEnvelope = clone(rawSchedulerBlockedEnvelope);
disguisedRawSchedulerBlockedEnvelope.schedulerState.commandFingerprints[
  "raw:schedule:capacity-block"
] = disguisedRawSchedulerBlockedEnvelope.schedulerState.commandFingerprints[
  "raw:schedule:capacity-block"
].replace(/^schedule:/, "enqueue:");
assertRejectedWithoutMutation(
  disguisedRawSchedulerBlockedEnvelope,
  () => adapter.normalizeAtomicState(disguisedRawSchedulerBlockedEnvelope),
  /must own exactly one matching task transition/,
  "a forged enqueue prefix must not disguise a raw capacity scheduler receipt",
);

const exactBlockedReload = adapter.deserializeAtomicState(
  adapter.serializeAtomicState(genuineCapacityBlocked.state),
);
assert.equal(adapter.scheduleAtomicTask(exactBlockedReload, {
  commandId: "atomic:schedule:genuine-capacity-block",
  at: 500,
}).idempotent, true);
assert.equal(adapter.scheduleAtomicTask(blockedForStock.state, {
  commandId: "atomic:schedule:depleted-cytology",
  at: refillAt,
}).idempotent, true);
assert.throws(() => adapter.scheduleAtomicTask(blockedForStock.state, {
  commandId: "atomic:schedule:depleted-cytology",
  at: refillAt + 1,
}), /already applied with different content/);
const replenished = adapter.applyLifecycleCommandAtomic(blockedForStock.state, {
  command: "receive_stock",
  payload: {
    commandId: "atomic:receive:depleted-cytology",
    categoryId: "cytology",
    units: 2,
    receivedAt: refillAt + 1,
  },
  currentMinute: refillAt + 1,
  authorityContext: {},
});
const scheduledAfterReplenishment = adapter.scheduleAtomicTask(replenished.state, {
  commandId: "atomic:schedule:depleted-cytology:retry",
  at: refillAt + 2,
});
assert.equal(scheduledAfterReplenishment.reasonCode, "scheduled");
assert.equal(adapter.lifecycle.snapshot(
  scheduledAfterReplenishment.state.lifecycleState,
  refillAt + 2,
).inventory.cytology, 0);
assert.deepEqual(
  adapter.deserializeAtomicState(adapter.serializeAtomicState(scheduledAfterReplenishment.state)),
  scheduledAfterReplenishment.state,
);
const preservedSchedulerWork = {
  tasks: clone(atomicState.schedulerState.tasks),
  reservations: clone(atomicState.schedulerState.reservations),
  appliedCommandIds: clone(atomicState.schedulerState.appliedCommandIds),
  commandFingerprints: clone(atomicState.schedulerState.commandFingerprints),
};
assert.deepEqual(
  atomicState.schedulerState.resources["staff.doctor.morozov"].unavailableWindows
    .filter((window) => window.endAt <= 1080),
  [{ startAt: 0, endAt: 480 }],
  "atomic shift commands did not reconcile doctor availability",
);
const beforeReservedAtomicShiftRemoval = clone(atomicState);
assert.throws(
  () => adapter.applyLifecycleCommandAtomic(atomicState, {
    command: "remove_shift",
    payload: {
      commandId: "atomic:remove:reserved-morozov-shift",
      shiftId: "atomic.shift.morozov.day1",
    },
    currentMinute: 400,
    authorityContext: {},
  }),
  /reserved shift capacity/,
);
assert.deepEqual(atomicState, beforeReservedAtomicShiftRemoval,
  "rejected atomic shift removal must preserve both ledgers");
assert.throws(
  () => adapter.applyLifecycleCommandAtomic(atomicState, {
    command: "receive_stock",
    payload: {
      commandId: "atomic:stock:outside-horizon",
      categoryId: "blood",
      units: 1,
      receivedAt: atomicHorizon.endAt,
    },
    currentMinute: atomicHorizon.endAt,
    authorityContext: {},
  }),
  /outside its persisted horizon/,
);
assert.throws(
  () => adapter.applyLifecycleCommandAtomic(atomicState, {
    command: "receive_stock",
    payload: {
      commandId: "atomic:stock:forged-reservations",
      categoryId: "blood",
      units: 1,
      receivedAt: 550,
    },
    currentMinute: 550,
    authorityContext: { reservations: [] },
  }),
  /cannot override reservations/,
);
assert.throws(
  () => adapter.applyLifecycleCommandAtomic(atomicState, {
    command: "consume_stock",
    payload: {
      commandId: "atomic:stock:forged-consume",
      categoryId: "blood",
      units: 1,
      reservationId: "inventory:ghost:blood",
    },
    currentMinute: 550,
    authorityContext: {
      stockReservation: {
        reservationId: "inventory:ghost:blood",
        taskId: "ghost-task",
        categoryId: "blood",
        units: 1,
      },
    },
  }),
  /consume_stock is task-derived authority/,
);
assert.throws(
  () => adapter.applyLifecycleCommandAtomic(atomicState, {
    command: "receive_stock",
    payload: {
      commandId: "atomic:stock:forged-authority-context",
      categoryId: "blood",
      units: 1,
      receivedAt: 550,
    },
    currentMinute: 550,
    authorityContext: {
      stockReservation: {
        reservationId: "inventory:ghost:blood",
        taskId: "ghost-task",
        categoryId: "blood",
        units: 1,
      },
    },
  }),
  /cannot override stockReservation/,
);
const lifecycleNamespaceState = adapter.applyLifecycleCommandAtomic(atomicState, {
  command: "receive_stock",
  payload: {
    commandId: "atomic:namespace:lifecycle",
    categoryId: "blood",
    units: 1,
    receivedAt: 560,
  },
  currentMinute: 560,
  authorityContext: {},
}).state;
assert.throws(() => adapter.extendAtomicHorizon(lifecycleNamespaceState, {
  commandId: "atomic:namespace:lifecycle",
  horizon: { startAt: 0, endAt: atomicHorizon.endAt + 1 },
}), /already bound to the lifecycle ledger/);
assert.throws(() => adapter.enqueueAtomicTask(lifecycleNamespaceState, {
  commandId: "atomic:namespace:lifecycle",
  task: taskInput("visit", "visit.history", "task.namespace.lifecycle", 570),
}), /already bound to the lifecycle ledger/);
const schedulerNamespaceState = adapter.enqueueAtomicTask(atomicState, {
  commandId: "atomic:namespace:scheduler",
  task: taskInput("visit", "visit.history", "task.namespace.scheduler", 570),
}).state;
assert.throws(() => adapter.applyLifecycleCommandAtomic(schedulerNamespaceState, {
  command: "receive_stock",
  payload: {
    commandId: "atomic:namespace:scheduler",
    categoryId: "blood",
    units: 1,
    receivedAt: 570,
  },
  currentMinute: 570,
  authorityContext: {},
}), /already bound to the scheduler ledger/);
const adapterNamespaceState = adapter.extendAtomicHorizon(atomicState, {
  commandId: "atomic:namespace:adapter",
  horizon: { startAt: 0, endAt: atomicHorizon.endAt + 1 },
}).state;
assert.throws(() => adapter.applyLifecycleCommandAtomic(adapterNamespaceState, {
  command: "receive_stock",
  payload: {
    commandId: "atomic:namespace:adapter",
    categoryId: "blood",
    units: 1,
    receivedAt: 570,
  },
  currentMinute: 570,
  authorityContext: {},
}), /already bound to the adapter ledger/);

const overlappingMaintenance = {
  command: "start_maintenance",
  payload: {
    commandId: "atomic:maintenance:microscope:overlap",
    assetId: "asset_microscope",
    startAt: 500,
    endAt: 620,
  },
  currentMinute: 500,
  authorityContext: {},
};
const beforeOverlappingMaintenance = clone(atomicState);
assert.throws(
  () => adapter.applyLifecycleCommandAtomic(atomicState, overlappingMaintenance),
  /maintenance overlaps a reservation/,
);
assert.deepEqual(atomicState, beforeOverlappingMaintenance,
  "rejected atomic maintenance must preserve both ledgers");

const maintenanceDuration = p5Input.documents["generated/operational-policies.json"]
  .maintenancePolicy.defaultDurationsByEquipmentType.laboratory_equipment;
const maintenanceStartAt = 600;
const maintenanceEndAt = maintenanceStartAt + maintenanceDuration;
const maintenanceTransaction = {
  command: "start_maintenance",
  payload: {
    commandId: "atomic:maintenance:microscope:start",
    assetId: "asset_microscope",
    startAt: maintenanceStartAt,
    endAt: maintenanceEndAt,
  },
  currentMinute: maintenanceStartAt,
  authorityContext: {},
};
const maintenanceStarted = applyAtomic(atomicState, maintenanceTransaction);
assert.equal(maintenanceStarted.idempotent, false);
atomicState = maintenanceStarted.state;
assert.ok(atomicState.schedulerState.resources["equipment.microscope"].unavailableWindows
  .some((window) => window.startAt <= maintenanceStartAt && window.endAt >= maintenanceEndAt));
assert.deepEqual({
  tasks: atomicState.schedulerState.tasks,
  reservations: atomicState.schedulerState.reservations,
  appliedCommandIds: atomicState.schedulerState.appliedCommandIds,
  commandFingerprints: atomicState.schedulerState.commandFingerprints,
}, preservedSchedulerWork, "resource reconciliation changed scheduler work");

const maintenanceReplay = adapter.applyLifecycleCommandAtomic(atomicState, {
  ...maintenanceTransaction,
  currentMinute: maintenanceStartAt + 1,
});
assert.equal(maintenanceReplay.idempotent, true);
assert.deepEqual(maintenanceReplay.state, atomicState);
assertRejectedWithoutMutation(
  atomicState,
  () => adapter.applyLifecycleCommandAtomic(atomicState, {
    ...maintenanceTransaction,
    payload: { ...maintenanceTransaction.payload, endAt: maintenanceEndAt + 1 },
  }),
  /already applied with different content/,
  "conflicting lifecycle retry must preserve the atomic envelope",
);

const microscopeMaintenanceDays = operationalInput
  .documents["source/p6-p5-exact-resource-crosswalk.json"].resources
  .find((resource) => resource.resourceId === "equipment.microscope")
  .economicRecord.maintenanceIntervalDays;
atomicState = applyAtomic(atomicState, {
  command: "complete_maintenance",
  payload: {
    commandId: "atomic:maintenance:microscope:complete",
    assetId: "asset_microscope",
    completedAt: maintenanceEndAt,
    nextDueAt: maintenanceEndAt + microscopeMaintenanceDays * 1440,
  },
  currentMinute: maintenanceEndAt,
  authorityContext: {},
}).state;
atomicState = applyAtomic(atomicState, {
  command: "retire_asset",
  payload: {
    commandId: "atomic:retire:microscope",
    assetId: "asset_microscope",
    retiredAt: 800,
  },
  currentMinute: 800,
  authorityContext: {},
}).state;
assert.ok(atomicState.schedulerState.resources["equipment.microscope"].unavailableWindows
  .some((window) => window.startAt <= 800 && window.endAt >= atomicHorizon.endAt));
assert.deepEqual({
  tasks: atomicState.schedulerState.tasks,
  reservations: atomicState.schedulerState.reservations,
  appliedCommandIds: atomicState.schedulerState.appliedCommandIds,
  commandFingerprints: atomicState.schedulerState.commandFingerprints,
}, preservedSchedulerWork, "maintenance completion or retirement changed scheduler work");

const extended = adapter.extendAtomicHorizon(atomicState, {
  commandId: "atomic:horizon:extend:60000",
  horizon: { startAt: 0, endAt: 60000 },
});
assert.equal(extended.idempotent, false);
const extendedReloaded = adapter.deserializeAtomicState(adapter.serializeAtomicState(extended.state));
const extendedReplay = adapter.extendAtomicHorizon(extendedReloaded, {
  commandId: "atomic:horizon:extend:60000",
  horizon: { startAt: 0, endAt: 60000 },
});
assert.equal(extendedReplay.idempotent, true);
assert.deepEqual(extendedReplay.state, extendedReloaded);
assertRejectedWithoutMutation(
  extendedReloaded,
  () => adapter.extendAtomicHorizon(extendedReloaded, {
    commandId: "atomic:horizon:extend:60000",
    horizon: { startAt: 0, endAt: 61000 },
  }),
  /already applied with different content/,
  "conflicting horizon retry must preserve the atomic envelope",
);
assert.throws(
  () => adapter.scheduleAtomicTask(extendedReloaded, {
    commandId: "atomic:schedule:outside-horizon",
    at: 60000,
  }),
  /outside its persisted horizon/,
);

const staleAtomicResources = clone(atomicScheduled.state);
staleAtomicResources.schedulerState.resources["room.consult.1"].unavailableWindows.push({
  startAt: 30000,
  endAt: 30001,
});
assert.throws(
  () => adapter.normalizeAtomicState(staleAtomicResources),
  /atomic scheduler resources differ from the exact lifecycle projection/,
);
const driftedAtomicResource = clone(atomicScheduled.state);
driftedAtomicResource.schedulerState.resources["room.consult.1"].capacity += 1;
assert.throws(
  () => adapter.normalizeAtomicState(driftedAtomicResource),
  /scheduler resource room\.consult\.1 capacity differs from P5 authority/,
);
const halfAppliedLifecycle = adapter.lifecycle.execute(
  atomicScheduled.state.lifecycleState,
  "start_maintenance",
  {
    commandId: "atomic:half-applied:maintenance",
    assetId: "asset_microscope",
    startAt: 900,
    endAt: 900 + maintenanceDuration,
  },
  {
    currentMinute: 900,
    schedulerState: atomicScheduled.state.schedulerState,
  },
).state;
const halfAppliedAtomic = {
  ...clone(atomicScheduled.state),
  lifecycleState: halfAppliedLifecycle,
};
assert.throws(
  () => adapter.normalizeAtomicState(halfAppliedAtomic),
  /atomic scheduler resources differ from the exact lifecycle projection/,
  "reload must reject a half-applied lifecycle/scheduler envelope",
);

// Inventory is exact task authority, not a visual/equipment inference. Two
// authored consumable capabilities sharing one category aggregate to two units.
const dermatologyTemplate = adapter.getTaskTemplate("research", "minimum_dermatologic_database");
assert.deepEqual(dermatologyTemplate.inventoryCapabilityIds, [
  "cytology_consumables",
  "skin_sampling_kit",
]);
assert.equal(dermatologyTemplate.safeRouteId, "safe_referral");
assert.deepEqual(dermatologyTemplate.protocolCapabilityIds, []);
assert.ok(dermatologyTemplate.statePredicates.some((entry) =>
  entry.capabilityId === "microscope" && entry.predicate.predicate === "maintenance_current"));
assert.ok(dermatologyTemplate.statePredicates.some((entry) =>
  entry.capabilityId === "trained_dermatology_sampling"
  && entry.predicate.predicate === "qualified_staff_scheduled"));
let stockScheduler = adapter.createSchedulerState(staffedReloaded, { startAt: 480, endAt: 620 });
stockScheduler = enqueue(
  adapter,
  stockScheduler,
  "enqueue:stock:dermatology",
  taskInput("research", "minimum_dermatologic_database", "task.stock.dermatology"),
);
assertRejectedWithoutMutation(
  stockScheduler,
  () => adapter.scheduleTask(stockScheduler, { commandId: "schedule:stock:legacy", at: 500 }),
  /requires exact lifecycle evidence; use scheduleExactTask/,
  "the scheduler-only adapter path must fail closed for stock-bearing tasks",
);
const stockScheduleCommand = { commandId: "schedule:stock:dermatology", at: 500 };
const stockScheduled = adapter.scheduleExactTask(
  staffedReloaded,
  stockScheduler,
  stockScheduleCommand,
);
assert.equal(stockScheduled.reasonCode, "scheduled");
assert.equal(stockScheduled.inventoryIdempotent, false);
assert.equal(stockScheduled.safeRouteId, "safe_referral");
assert.equal(stockScheduled.executionEvidence.safeRouteId, "safe_referral");
assert.deepEqual(stockScheduled.executionEvidence.protocolCapabilityIds, []);
assert.equal(stockScheduled.executionEvidence.validatedAt, 500);
assert.deepEqual(stockScheduled.inventoryConsumptions, [{
  commandId: "schedule:stock:dermatology:stock:cytology",
  reservationId: "inventory:task.stock.dermatology:cytology",
  taskId: "task.stock.dermatology",
  categoryId: "cytology",
  units: 2,
}]);
assert.equal(adapter.lifecycle.snapshot(stockScheduled.lifecycleState, 500).inventory.cytology, 28);

const staleLifecycleBefore = clone(initialLifecycleState);
const evidenceSchedulerBefore = clone(stockScheduled.state);
assert.throws(
  () => adapter.validateTaskExecutionEvidence(
    initialLifecycleState,
    stockScheduled.state,
    "task.stock.dermatology",
  ),
  /stale relative to lifecycle unavailability|outside an authoritative lifecycle shift/,
);
assert.deepEqual(initialLifecycleState, staleLifecycleBefore,
  "missing lifecycle evidence must not mutate lifecycle state");
assert.deepEqual(stockScheduled.state, evidenceSchedulerBefore,
  "missing lifecycle evidence must not mutate scheduler state");

const stockSchedulerReloaded = adapter.normalizeSchedulerState(clone(stockScheduled.state));
const stockLifecycleReloaded = adapter.lifecycle.deserializeState(
  adapter.lifecycle.serializeState(stockScheduled.lifecycleState),
);
assert.deepEqual(
  adapter.getTaskInventoryConsumptions(stockSchedulerReloaded, "task.stock.dermatology"),
  stockScheduled.inventoryConsumptions,
);
const stockReplay = adapter.scheduleExactTask(
  stockLifecycleReloaded,
  stockSchedulerReloaded,
  stockScheduleCommand,
);
assert.equal(stockReplay.idempotent, true);
assert.equal(stockReplay.inventoryIdempotent, true);
assert.deepEqual(stockReplay.state, stockSchedulerReloaded);
assert.deepEqual(stockReplay.lifecycleState, stockLifecycleReloaded);

const fakeConsumption = clone(stockScheduled.inventoryConsumptions);
fakeConsumption[0].reservationId = "inventory:task.fake:cytology";
const fakeLifecycleBefore = clone(staffedReloaded);
const fakeSchedulerBefore = clone(stockScheduled.state);
assert.throws(() => adapter.consumeTaskInventory(
  staffedReloaded,
  stockScheduled.state,
  { taskId: "task.stock.dermatology", consumptions: fakeConsumption },
), /inventory consumption evidence differs from exact P5 requirements/);
assert.deepEqual(staffedReloaded, fakeLifecycleBefore, "fake inventory evidence must not mutate lifecycle state");
assert.deepEqual(stockScheduled.state, fakeSchedulerBefore, "fake inventory evidence must not mutate scheduler state");
assert.throws(
  () => adapter.getTaskInventoryConsumptions(stockScheduled.state, "task.stock.fake"),
  /unknown inventory task task.stock.fake/,
);
const forgedScheduler = clone(stockScheduled.state);
forgedScheduler.tasks.find((task) => task.id === "task.stock.dermatology").sourceId = "forged_research";
assert.throws(
  () => adapter.getTaskInventoryConsumptions(forgedScheduler, "task.stock.dermatology"),
  /unknown research task forged_research/,
);

let depletedLifecycle = consumeStockForSetup(
  adapter.lifecycle,
  staffedReloaded,
  "cytology",
  29,
  "deplete-cytology",
);
assert.equal(adapter.lifecycle.snapshot(depletedLifecycle, 500).inventory.cytology, 1);
let depletedScheduler = adapter.createSchedulerState(depletedLifecycle, { startAt: 480, endAt: 620 });
depletedScheduler = enqueue(
  adapter,
  depletedScheduler,
  "enqueue:stock:depleted",
  taskInput("research", "minimum_dermatologic_database", "task.stock.depleted"),
);
const depletedLifecycleBefore = clone(depletedLifecycle);
const depletedSchedulerBefore = clone(depletedScheduler);
const depletedBlocked = adapter.scheduleExactTask(
  depletedLifecycle,
  depletedScheduler,
  { commandId: "schedule:stock:depleted", at: 500 },
);
assert.equal(depletedBlocked.reasonCode, "inventory_unavailable_safe_route_required");
assert.equal(depletedBlocked.safeRouteId, "safe_referral");
assert.equal(depletedBlocked.safeRouteRequired, true);
assert.equal(depletedBlocked.task, null);
assert.equal(depletedBlocked.blockedTaskId, "task.stock.depleted");
assert.deepEqual(
  depletedBlocked.missingInventory.map(({ categoryId, units }) => ({ categoryId, units })),
  [{ categoryId: "cytology", units: 2 }],
);
assert.deepEqual(depletedBlocked.lifecycleState, depletedLifecycleBefore);
assert.deepEqual(depletedBlocked.state, depletedSchedulerBefore);
assert.deepEqual(depletedLifecycle, depletedLifecycleBefore,
  "depleted-stock rejection must not mutate lifecycle state");
assert.deepEqual(depletedScheduler, depletedSchedulerBefore,
  "depleted-stock rejection must not activate or reserve the task");

// Multi-category stock is preflighted as one unit: if one category is empty,
// no other category is consumed and no scheduler reservation becomes visible.
let multiStockLifecycle = executeLifecycle(adapter.lifecycle, staffedReloaded, "hire_staff", {
  commandId: "hire:lab:krylova:inventory-test",
  staffId: "staff.lab.krylova",
  hiredAt: 100,
});
multiStockLifecycle = executeLifecycle(adapter.lifecycle, multiStockLifecycle, "assign_shift", {
  commandId: "shift:lab:krylova:inventory-test",
  staffId: "staff.lab.krylova",
  shiftId: "shift.lab.krylova.inventory-test",
  startAt: 480,
  endAt: 900,
});
multiStockLifecycle = consumeStockForSetup(
  adapter.lifecycle,
  multiStockLifecycle,
  "general_exam",
  30,
  "deplete-general-exam",
);
let multiStockScheduler = adapter.createSchedulerState(multiStockLifecycle, { startAt: 480, endAt: 620 });
multiStockScheduler = enqueue(
  adapter,
  multiStockScheduler,
  "enqueue:stock:reticulocyte",
  taskInput("capability", "reticulocyte_count", "task.stock.reticulocyte"),
);
const multiStockLifecycleBefore = clone(multiStockLifecycle);
const multiStockSchedulerBefore = clone(multiStockScheduler);
const multiStockBlocked = adapter.scheduleExactTask(
  multiStockLifecycle,
  multiStockScheduler,
  { commandId: "schedule:stock:reticulocyte:blocked", at: 500 },
);
assert.equal(multiStockBlocked.reasonCode, "inventory_unavailable_safe_route_required");
assert.equal(multiStockBlocked.safeRouteId, "safe_referral");
assert.deepEqual(
  multiStockBlocked.missingInventory.map(({ categoryId, units }) => ({ categoryId, units })),
  [{ categoryId: "general_exam", units: 1 }],
);
assert.deepEqual(multiStockBlocked.lifecycleState, multiStockLifecycleBefore);
assert.deepEqual(multiStockBlocked.state, multiStockSchedulerBefore);
assert.deepEqual(multiStockLifecycle, multiStockLifecycleBefore,
  "multi-category preflight must not partially consume available cytology stock");
assert.deepEqual(multiStockScheduler, multiStockSchedulerBefore,
  "multi-category preflight must not partially reserve scheduler resources");
assert.equal(adapter.lifecycle.snapshot(multiStockLifecycle, 500).inventory.cytology, 30);

multiStockLifecycle = executeLifecycle(adapter.lifecycle, multiStockLifecycle, "receive_stock", {
  commandId: "receive:general-exam:inventory-test",
  categoryId: "general_exam",
  units: 1,
  receivedAt: 400,
});
const multiStockScheduled = adapter.scheduleExactTask(
  multiStockLifecycle,
  multiStockScheduler,
  { commandId: "schedule:stock:reticulocyte", at: 500 },
);
assert.equal(multiStockScheduled.reasonCode, "scheduled");
assert.deepEqual(
  multiStockScheduled.inventoryConsumptions.map(({ categoryId, units }) => ({ categoryId, units })),
  [
    { categoryId: "cytology", units: 1 },
    { categoryId: "general_exam", units: 1 },
  ],
);
const multiStockSnapshot = adapter.lifecycle.snapshot(multiStockScheduled.lifecycleState, 500);
assert.equal(multiStockSnapshot.inventory.cytology, 29);
assert.equal(multiStockSnapshot.inventory.general_exam, 0);
const multiStockReloadedScheduler = adapter.normalizeSchedulerState(clone(multiStockScheduled.state));
const multiStockReloadedLifecycle = adapter.lifecycle.deserializeState(
  adapter.lifecycle.serializeState(multiStockScheduled.lifecycleState),
);
const multiStockReplay = adapter.scheduleExactTask(
  multiStockReloadedLifecycle,
  multiStockReloadedScheduler,
  { commandId: "schedule:stock:reticulocyte", at: 500 },
);
assert.equal(multiStockReplay.idempotent, true);
assert.equal(multiStockReplay.inventoryIdempotent, true);
assert.deepEqual(multiStockReplay.lifecycleState, multiStockReloadedLifecycle);

// A protocol capability may execute its own exact task. A dependent research
// task remains fail-closed because the package does not author sequencing or
// completion evidence for that prerequisite.
let protocolLifecycle = executeLifecycle(adapter.lifecycle, staffedReloaded, "hire_staff", {
  commandId: "hire:assistant:protocol-test",
  staffId: "staff.assistant.volkova",
  hiredAt: 100,
});
protocolLifecycle = executeLifecycle(adapter.lifecycle, protocolLifecycle, "assign_shift", {
  commandId: "shift:assistant:protocol-test",
  staffId: "staff.assistant.volkova",
  shiftId: "shift.assistant.protocol-test",
  startAt: 480,
  endAt: 900,
});
const protocolTemplate = adapter.getTaskTemplate("capability", "lab_quality_control");
assert.deepEqual(protocolTemplate.protocolCapabilityIds, ["lab_quality_control"]);
assert.equal(protocolTemplate.safeRouteId, null);
let protocolScheduler = adapter.createSchedulerState(protocolLifecycle, { startAt: 480, endAt: 620 });
protocolScheduler = enqueue(
  adapter,
  protocolScheduler,
  "enqueue:protocol:lab-quality",
  taskInput("capability", "lab_quality_control", "task.protocol.lab-quality"),
);
assertRejectedWithoutMutation(
  protocolScheduler,
  () => adapter.scheduleTask(protocolScheduler, { commandId: "schedule:protocol:legacy", at: 500 }),
  /requires exact lifecycle evidence; use scheduleExactTask/,
  "a protocol task must not bypass exact execution evidence",
);
const protocolScheduled = adapter.scheduleExactTask(
  protocolLifecycle,
  protocolScheduler,
  { commandId: "schedule:protocol:lab-quality", at: 500 },
);
assert.equal(protocolScheduled.reasonCode, "scheduled");
assert.deepEqual(protocolScheduled.executionEvidence.protocolCapabilityIds, ["lab_quality_control"]);
assert.equal(protocolScheduled.executionEvidence.safeRouteId, null);
assert.deepEqual(
  adapter.getTaskExecutionContract(protocolScheduled.state, "task.protocol.lab-quality")
    .protocolCapabilityIds,
  ["lab_quality_control"],
);

let missingProtocolScheduler = adapter.createSchedulerState(staffedReloaded, {
  startAt: 480,
  endAt: 620,
});
missingProtocolScheduler = enqueue(
  adapter,
  missingProtocolScheduler,
  "enqueue:protocol:missing-environment-control",
  taskInput(
    "research",
    "atopy_flea_comb_scraping_and_ectoparasite_control_trial",
    "task.protocol.missing-environment-control",
  ),
);
const missingProtocolBefore = clone(missingProtocolScheduler);
const missingProtocol = adapter.scheduleExactTask(
  staffedReloaded,
  missingProtocolScheduler,
  { commandId: "schedule:protocol:missing-environment-control", at: 500 },
);
assert.equal(missingProtocol.reasonCode, "protocol_authority_unavailable_safe_route_required");
assert.equal(missingProtocol.safeRouteId, "safe_referral");
assert.equal(missingProtocol.task, null);
assert.equal(missingProtocol.blockedTaskId, "task.protocol.missing-environment-control");
assert.deepEqual(missingProtocol.state, missingProtocolBefore);
assert.equal(missingProtocol.state.tasks.some((task) =>
  task.sourceId === "parasite_environment_control"), false);
assert.equal(
  adapter.lifecycle.snapshot(staffedReloaded, 500)
    .resources["staff.assistant.volkova"].active,
  false,
);
let missingProtocolAtomic = adapter.createAtomicState(staffedReloaded, atomicHorizon);
missingProtocolAtomic = adapter.enqueueAtomicTask(missingProtocolAtomic, {
  commandId: "atomic:enqueue:protocol:missing-environment-control",
  task: taskInput(
    "research",
    "atopy_flea_comb_scraping_and_ectoparasite_control_trial",
    "task.atomic.protocol.missing-environment-control",
  ),
}).state;
const missingProtocolAtomicResult = adapter.scheduleAtomicTask(missingProtocolAtomic, {
  commandId: "atomic:schedule:protocol:missing-environment-control",
  at: 500,
});
assert.equal(
  missingProtocolAtomicResult.reasonCode,
  "protocol_authority_unavailable_safe_route_required",
);
assert.equal(missingProtocolAtomicResult.safeRouteId, "safe_referral");
assert.deepEqual(
  adapter.deserializeAtomicState(adapter.serializeAtomicState(missingProtocolAtomicResult.state)),
  missingProtocolAtomicResult.state,
);
assert.equal(adapter.scheduleAtomicTask(missingProtocolAtomicResult.state, {
  commandId: "atomic:schedule:protocol:missing-environment-control",
  at: 500,
}).idempotent, true);

let staffedScheduler = adapter.createSchedulerState(staffedReloaded, { startAt: 480, endAt: 620 });
staffedScheduler = enqueue(
  adapter,
  staffedScheduler,
  "enqueue:staffed-history",
  taskInput("visit", "visit.history", "task.staffed-history"),
);
const staffedHistory = schedule(adapter, staffedScheduler, "schedule:staffed-history", 500);
assert.equal(staffedHistory.reasonCode, "scheduled");
assert.equal(staffedHistory.task.startAt, 500);
assert.equal(staffedHistory.task.endAt, 510);
assert.equal(staffedHistory.reservations.find((record) => record.groupId === "staff").resourceId,
  "staff.doctor.morozov");

const staffedHistoryStaffReservation = staffedHistory.reservations.find((record) =>
  record.groupId === "staff");
const rawForbiddenHandoffEnvelope = adapter.createAtomicState(
  staffedReloaded,
  { startAt: 480, endAt: 620 },
);
rawForbiddenHandoffEnvelope.schedulerState = resourceSchedulerV5.handoffTask(
  staffedHistory.state,
  {
    commandId: "raw:handoff:not-allowed-history",
    taskId: "task.staffed-history",
    at: 505,
    reassignments: [{
      groupId: "staff",
      fromResourceId: "staff.doctor.morozov",
      toResourceId: "staff.doctor.sokolova",
      capabilityId: staffedHistoryStaffReservation.capabilityId,
      units: staffedHistoryStaffReservation.units,
    }],
  },
).state;
assertRejectedWithoutMutation(
  rawForbiddenHandoffEnvelope,
  () => adapter.normalizeAtomicState(rawForbiddenHandoffEnvelope),
  /unsupported durable type handoff/,
  "a raw scheduler handoff must not bypass the exact not_allowed author policy",
);

// not_allowed is an exact policy, not a default that can be bypassed.
assertRejectedWithoutMutation(
  staffedHistory.state,
  () => adapter.handoffExactTask(staffedReloaded, staffedHistory.state, {
    commandId: "handoff:not-allowed-history",
    taskId: "task.staffed-history",
    at: 505,
    reassignments: [{
      groupId: "staff",
      fromResourceId: "staff.doctor.morozov",
      toResourceId: "staff.doctor.sokolova",
      capabilityId: "task.history",
      units: 1,
    }],
  }),
  /handoff is forbidden by policy not_allowed/,
  "forbidden handoff must preserve scheduler state",
);

// Exact midpoint transfer: old ownership ends at the breakpoint, new ownership
// starts there, and the same command remains idempotent after JSON reload.
let referralScheduler = adapter.createSchedulerState(staffedReloaded, { startAt: 480, endAt: 620 });
referralScheduler = enqueue(
  adapter,
  referralScheduler,
  "enqueue:referral",
  taskInput("visit", "visit.referral_coordination", "task.referral"),
);
const referralScheduled = schedule(adapter, referralScheduler, "schedule:referral", 500);
assert.equal(referralScheduled.task.endAt - referralScheduled.task.startAt, 12);
const referralStaff = referralScheduled.reservations.find((record) => record.groupId === "staff");
assert.equal(referralStaff.resourceId, "staff.doctor.morozov");
const referralHandoffCommand = {
  commandId: "handoff:referral:midpoint",
  taskId: "task.referral",
  at: 506,
  reassignments: [{
    groupId: "staff",
    fromResourceId: "staff.doctor.morozov",
    toResourceId: "staff.doctor.sokolova",
    capabilityId: "role.doctor",
    units: 1,
  }],
};
const referralHandoff = adapter.handoffExactTask(
  staffedReloaded,
  referralScheduled.state,
  referralHandoffCommand,
);
assert.equal(referralHandoff.reasonCode, "handed_off");
assert.deepEqual(
  referralHandoff.reservations
    .filter((record) => record.groupId === "staff")
    .map(({ resourceId, startAt, endAt }) => ({ resourceId, startAt, endAt })),
  [
    { resourceId: "staff.doctor.morozov", startAt: 500, endAt: 506 },
    { resourceId: "staff.doctor.sokolova", startAt: 506, endAt: 512 },
  ],
);
const referralReloaded = adapter.normalizeSchedulerState(clone(referralHandoff.state));
assert.deepEqual(referralReloaded, referralHandoff.state);
const referralReplay = adapter.handoffExactTask(staffedReloaded, referralReloaded, referralHandoffCommand);
assert.equal(referralReplay.idempotent, true);
assert.deepEqual(referralReplay.state, referralReloaded);
assertRejectedWithoutMutation(
  referralReloaded,
  () => adapter.handoffExactTask(staffedReloaded, referralReloaded, {
    ...referralHandoffCommand,
    reassignments: [{
      ...referralHandoffCommand.reassignments[0],
      fromResourceId: "staff.doctor.sokolova",
      toResourceId: "staff.doctor.morozov",
    }],
  }),
  /Command id conflict: .* already applied with different content/,
  "a conflicting replay must preserve the reloaded scheduler",
);

for (const [at, pattern] of [
  [504, /at least 5 elapsed minutes/],
  [505, /not an exact authored breakpoint/],
  [512, /not an exact authored breakpoint/],
]) {
  assertRejectedWithoutMutation(
    referralScheduled.state,
    () => adapter.handoffExactTask(staffedReloaded, referralScheduled.state, {
      ...referralHandoffCommand,
      commandId: `handoff:referral:invalid:${at}`,
      at,
    }),
    pattern,
    `invalid midpoint ${at} must preserve scheduler state`,
  );
}
assertRejectedWithoutMutation(
  referralScheduled.state,
  () => adapter.handoffExactTask(staffedReloaded, referralScheduled.state, {
    ...referralHandoffCommand,
    commandId: "handoff:referral:wrong-owner",
    reassignments: [{
      ...referralHandoffCommand.reassignments[0],
      fromResourceId: "staff.doctor.sokolova",
      toResourceId: "staff.doctor.morozov",
    }],
  }),
  /source does not own task group staff/,
  "wrong previous owner must preserve scheduler state",
);
assertRejectedWithoutMutation(
  referralScheduled.state,
  () => adapter.handoffExactTask(staffedReloaded, referralScheduled.state, {
    ...referralHandoffCommand,
    commandId: "handoff:referral:missing-capability",
    reassignments: [{
      ...referralHandoffCommand.reassignments[0],
      toResourceId: "room.consult.1",
    }],
  }),
  /lacks capability role.doctor/,
  "a target without capability must preserve scheduler state",
);
assertRejectedWithoutMutation(
  referralScheduled.state,
  () => adapter.handoffExactTask(staffedReloaded, referralScheduled.state, {
    ...referralHandoffCommand,
    commandId: "handoff:referral:inactive-target",
    reassignments: [{
      ...referralHandoffCommand.reassignments[0],
      toResourceId: "staff.doctor.belov",
    }],
  }),
  /cannot reserve all target resources atomically/,
  "an inactive but capable target must preserve scheduler state",
);

// A capable target that is already reserved for part of the remaining interval
// is rejected atomically.
let busyScheduler = adapter.createSchedulerState(staffedReloaded, { startAt: 480, endAt: 620 });
busyScheduler = enqueue(
  adapter,
  busyScheduler,
  "enqueue:busy-doctor",
  taskInput("visit", "visit.history", "task.busy-doctor"),
);
busyScheduler = schedule(adapter, busyScheduler, "schedule:busy-doctor", 500).state;
busyScheduler = enqueue(
  adapter,
  busyScheduler,
  "enqueue:busy-referral",
  taskInput("visit", "visit.referral_coordination", "task.busy-referral"),
);
const busyReferral = schedule(adapter, busyScheduler, "schedule:busy-referral", 500);
assert.equal(busyReferral.reservations.find((record) => record.groupId === "staff").resourceId,
  "staff.doctor.sokolova");
assertRejectedWithoutMutation(
  busyReferral.state,
  () => adapter.handoffExactTask(staffedReloaded, busyReferral.state, {
    commandId: "handoff:busy-referral",
    taskId: "task.busy-referral",
    at: 506,
    reassignments: [{
      groupId: "staff",
      fromResourceId: "staff.doctor.sokolova",
      toResourceId: "staff.doctor.morozov",
      capabilityId: "role.doctor",
      units: 1,
    }],
  }),
  /cannot reserve all target resources atomically/,
  "busy-target rejection must not split ownership",
);

// The adapter refuses to invent rounding for authored fractional breakpoints.
let fractionalScheduler = adapter.createSchedulerState(staffedReloaded, { startAt: 480, endAt: 620 });
fractionalScheduler = enqueue(
  adapter,
  fractionalScheduler,
  "enqueue:fractional-urgent",
  taskInput(
    "visit",
    "visit.urgent_triage",
    "task.fractional-urgent",
    500,
    { percent: 40, durationMultiplier: 1.1 },
  ),
);
const fractionalUrgent = schedule(adapter, fractionalScheduler, "schedule:fractional-urgent", 500);
assert.equal(fractionalUrgent.task.endAt - fractionalUrgent.task.startAt, 9);
assertRejectedWithoutMutation(
  fractionalUrgent.state,
  () => adapter.handoffExactTask(staffedReloaded, fractionalUrgent.state, {
    commandId: "handoff:fractional-urgent",
    taskId: "task.fractional-urgent",
    at: 502,
    reassignments: [{
      groupId: "staff",
      fromResourceId: "staff.doctor.morozov",
      toResourceId: "staff.doctor.sokolova",
      capabilityId: "task.urgent_triage",
      units: 1,
    }],
  }),
  /breakpoints are fractional.*no author rounding rule exists/,
  "fractional breakpoint rejection must preserve reservations",
);

// Activate consult room 2 via explicit lifecycle evidence, then transfer both
// requirement groups atomically at an exact urgent-quarter breakpoint.
let expandedLifecycleState = staffedReloaded;
expandedLifecycleState = executeLifecycle(adapter.lifecycle, expandedLifecycleState, "mark_delivery_complete", {
  commandId: "deliver:consult2",
  assetId: "asset.room.consult.2",
  deliveredAt: 7300,
});
expandedLifecycleState = executeLifecycle(adapter.lifecycle, expandedLifecycleState, "mark_room_ready", {
  commandId: "ready:consult2",
  roomId: "room.consult.2",
  readyAt: 8740,
});
for (const [doctor, suffix, endAt] of [
  ["staff.doctor.morozov", "morozov", 9160],
  ["staff.doctor.sokolova", "sokolova", 9400],
]) {
  expandedLifecycleState = executeLifecycle(adapter.lifecycle, expandedLifecycleState, "assign_shift", {
    commandId: `shift:${suffix}:late-inventory-test`,
    staffId: doctor,
    shiftId: `shift.${suffix}.late-inventory-test`,
    startAt: 8800,
    endAt,
  });
}
expandedLifecycleState = adapter.lifecycle.deserializeState(
  adapter.lifecycle.serializeState(expandedLifecycleState),
);

let multiScheduler = adapter.createSchedulerState(expandedLifecycleState, { startAt: 8800, endAt: 9500 });
multiScheduler = enqueue(
  adapter,
  multiScheduler,
  "enqueue:multi-urgent",
  taskInput("visit", "visit.urgent_triage", "task.multi-urgent"),
);
const multiScheduled = schedule(adapter, multiScheduler, "schedule:multi-urgent", 8900);
assert.deepEqual(
  multiScheduled.reservations.map(({ groupId, resourceId }) => ({ groupId, resourceId })),
  [
    { groupId: "room", resourceId: "room.consult.1" },
    { groupId: "staff", resourceId: "staff.doctor.morozov" },
  ],
);
const multiBefore = clone(multiScheduled.state);
assert.throws(() => adapter.handoffExactTask(expandedLifecycleState, multiScheduled.state, {
  commandId: "handoff:multi:partial-invalid",
  taskId: "task.multi-urgent",
  at: 8902,
  reassignments: [
    {
      groupId: "staff",
      fromResourceId: "staff.doctor.morozov",
      toResourceId: "staff.doctor.sokolova",
      capabilityId: "task.urgent_triage",
      units: 1,
    },
    {
      groupId: "room",
      fromResourceId: "room.consult.2",
      toResourceId: "room.consult.1",
      capabilityId: "task.exam",
      units: 1,
    },
  ],
}), /source does not own task group room/);
assert.deepEqual(multiScheduled.state, multiBefore, "partial multi-resource handoff must roll back all groups");

const multiCommand = {
  commandId: "handoff:multi:quarter",
  taskId: "task.multi-urgent",
  at: 8902,
  reassignments: [
    {
      groupId: "staff",
      fromResourceId: "staff.doctor.morozov",
      toResourceId: "staff.doctor.sokolova",
      capabilityId: "task.urgent_triage",
      units: 1,
    },
    {
      groupId: "room",
      fromResourceId: "room.consult.1",
      toResourceId: "room.consult.2",
      capabilityId: "task.exam",
      units: 1,
    },
  ],
};
const multiHanded = adapter.handoffExactTask(expandedLifecycleState, multiScheduled.state, multiCommand);
assert.equal(multiHanded.reasonCode, "handed_off");
for (const [groupId, expectedOwners] of [
  ["staff", ["staff.doctor.morozov", "staff.doctor.sokolova"]],
  ["room", ["room.consult.1", "room.consult.2"]],
]) {
  const segments = multiHanded.reservations.filter((record) => record.groupId === groupId);
  assert.deepEqual(segments.map((record) => record.resourceId), expectedOwners);
  assert.deepEqual(segments.map(({ startAt, endAt }) => ({ startAt, endAt })), [
    { startAt: 8900, endAt: 8902 },
    { startAt: 8902, endAt: 8908 },
  ]);
}
const multiReloaded = adapter.normalizeSchedulerState(JSON.parse(JSON.stringify(multiHanded.state)));
assert.deepEqual(multiReloaded, multiHanded.state);
const multiReplay = adapter.handoffExactTask(expandedLifecycleState, multiReloaded, multiCommand);
assert.equal(multiReplay.idempotent, true);
assert.deepEqual(multiReplay.state, multiReloaded);

console.log(
  "P5 authoring adapter v2: exact 49/447+8/2606 join, authority boundary, lifecycle scheduling, authored handoff and reload passed.",
);
