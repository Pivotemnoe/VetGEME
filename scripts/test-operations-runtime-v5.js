#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const operationsApi = require(path.join(root, "systems/operations-runtime-v5.js"));
const schedulerApi = require(path.join(root, "systems/resource-scheduler-v5.js"));

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function syntheticSchedulerValidation(state) {
  const errors = [];
  if (!isObject(state) || state.schemaVersion !== 1) return { valid: false, errors: ["invalid_scheduler_state"] };
  if (!isObject(state.resources)) errors.push("invalid_resources");
  if (!Array.isArray(state.tasks)) errors.push("invalid_tasks");
  if (!Array.isArray(state.reservations)) errors.push("invalid_reservations");
  if (!Array.isArray(state.appliedCommandIds) ||
      new Set(state.appliedCommandIds).size !== state.appliedCommandIds.length) {
    errors.push("invalid_applied_command_ids");
  }
  if (errors.length) return { valid: false, errors };

  const taskIds = new Set();
  state.tasks.forEach((task, index) => {
    if (!isObject(task)) {
      errors.push(`task_not_object:${index}`);
      return;
    }
    const allowed = new Set([
      "taskId", "status", "priority", "queuedAt", "authoredDurationMinutes", "fatigue",
      "requirementGroups", "safeRouteRequired"
    ]);
    Object.keys(task).forEach((key) => {
      if (!allowed.has(key)) errors.push(`unsupported_task_field:${index}:${key}`);
    });
    if (typeof task.taskId !== "string" || !task.taskId) errors.push(`invalid_task_id:${index}`);
    else if (taskIds.has(task.taskId)) errors.push(`duplicate_task_id:${task.taskId}`);
    else taskIds.add(task.taskId);
    if (!["queued", "scheduled", "active", "completed", "cancelled"].includes(task.status)) {
      errors.push(`invalid_task_status:${index}`);
    }
    if (!Number.isInteger(task.priority)) errors.push(`invalid_priority:${index}`);
    if (!Number.isInteger(task.queuedAt) || task.queuedAt < 0) errors.push(`invalid_queued_at:${index}`);
    if (!Number.isInteger(task.authoredDurationMinutes) || task.authoredDurationMinutes <= 0) {
      errors.push(`invalid_authored_duration:${index}`);
    }
    if (!isObject(task.fatigue) || !Number.isFinite(task.fatigue.percent) ||
        !Number.isFinite(task.fatigue.durationMultiplier)) errors.push(`invalid_fatigue:${index}`);
    if (!Array.isArray(task.requirementGroups)) errors.push(`invalid_requirement_groups:${index}`);
    if (typeof task.safeRouteRequired !== "boolean") errors.push(`invalid_safe_route_required:${index}`);
  });

  const reservationIds = new Set();
  state.reservations.forEach((reservation, index) => {
    if (!isObject(reservation)) {
      errors.push(`reservation_not_object:${index}`);
      return;
    }
    const required = ["taskId", "groupId", "resourceId", "capabilityId"];
    required.forEach((field) => {
      if (typeof reservation[field] !== "string" || !reservation[field]) errors.push(`invalid_${field}:${index}`);
    });
    if (!Number.isFinite(reservation.units) || reservation.units <= 0) errors.push(`invalid_units:${index}`);
    if (!Number.isInteger(reservation.startAt) || !Number.isInteger(reservation.endAt) ||
        reservation.startAt < 0 || reservation.endAt <= reservation.startAt) errors.push(`invalid_interval:${index}`);
    if (!taskIds.has(reservation.taskId)) errors.push(`unknown_reservation_task:${index}`);
    if (!Object.prototype.hasOwnProperty.call(state.resources, reservation.resourceId)) {
      errors.push(`unknown_reservation_resource:${index}`);
    }
    const id = JSON.stringify([
      reservation.taskId, reservation.groupId, reservation.resourceId, reservation.capabilityId,
      reservation.units, reservation.startAt, reservation.endAt
    ]);
    if (reservationIds.has(id)) errors.push(`duplicate_reservation:${index}`);
    reservationIds.add(id);
  });
  return { valid: errors.length === 0, errors };
}

const runtime = operationsApi.createOperationsRuntime({ validateState: syntheticSchedulerValidation });

function resource(resourceId, capabilityId) {
  return { resourceId, capabilityIds: [capabilityId], units: 1 };
}

function task(taskId, status, priority, queuedAt, duration) {
  return {
    taskId,
    status,
    priority,
    queuedAt,
    authoredDurationMinutes: duration,
    fatigue: { percent: 0, durationMultiplier: 1 },
    requirementGroups: [{
      groupId: "responsible_staff",
      anyOf: [{ resourceId: "doctor-a", capabilityId: "authored-test-capability", units: 1 }]
    }],
    safeRouteRequired: false
  };
}

function reservation(taskId, resourceId, startAt, endAt) {
  return {
    taskId,
    groupId: "responsible_staff",
    resourceId,
    capabilityId: "authored-test-capability",
    units: 1,
    startAt,
    endAt
  };
}

const empty = runtime.createState();
assert.deepEqual(empty, {
  schemaVersion: 1,
  resources: {},
  tasks: [],
  reservations: [],
  handoffs: [],
  appliedCommandIds: [],
  commandFingerprints: {}
});
assert.deepEqual(runtime.summarizeState(empty), {
  schemaVersion: 1,
  resourceCount: 0,
  taskCount: 0,
  queuedTaskCount: 0,
  activeTaskCount: 0,
  reservationCount: 0,
  handoffCount: 0,
  appliedCommandCount: 0,
  taskStatusCounts: {}
});

const firstTask = task("TASK-B", "scheduled", 20, 12, 15);
const secondTask = task("TASK-A", "queued", 10, 11, 8);
const firstReservation = reservation("TASK-B", "doctor-b", 40, 55);
const source = {
  resources: {
    "doctor-b": resource("doctor-b", "authored-test-capability"),
    "doctor-a": resource("doctor-a", "authored-test-capability")
  },
  tasks: [firstTask, secondTask],
  reservations: [firstReservation],
  handoffs: [{
    schemaVersion: 1,
    handoffId: "handoff-2",
    commandId: "handoff-command-2",
    taskId: "TASK-A",
    at: 70,
    reassignments: [{
      groupId: "responsible_staff",
      fromResourceId: "doctor-b",
      toResourceId: "doctor-a",
      capabilityId: "authored-test-capability",
      units: 1
    }]
  }, {
    schemaVersion: 1,
    handoffId: "handoff-1",
    commandId: "handoff-command-1",
    taskId: "TASK-A",
    at: 60,
    reassignments: [{
      groupId: "responsible_staff",
      fromResourceId: "doctor-a",
      toResourceId: "doctor-b",
      capabilityId: "authored-test-capability",
      units: 1
    }]
  }],
  appliedCommandIds: ["handoff-command-2", "handoff-command-1"]
};
const sourceBefore = JSON.parse(JSON.stringify(source));
const normalized = runtime.createState(source);
assert.deepEqual(source, sourceBefore, "normalization must not mutate caller state");
assert.deepEqual(Object.keys(normalized.resources), ["doctor-a", "doctor-b"]);
assert.deepEqual(normalized.tasks.map((item) => item.taskId), ["TASK-A", "TASK-B"]);
assert.deepEqual(normalized.handoffs.map((item) => item.handoffId), ["handoff-1", "handoff-2"]);
assert.deepEqual(normalized.appliedCommandIds, ["handoff-command-1", "handoff-command-2"]);
assert.equal(runtime.validateState(normalized).valid, true);
assert.deepEqual(runtime.deserializeState(runtime.serializeState(normalized)), normalized);

const reordered = {
  resources: { "doctor-a": source.resources["doctor-a"], "doctor-b": source.resources["doctor-b"] },
  tasks: [secondTask, firstTask],
  reservations: [firstReservation],
  handoffs: [source.handoffs[1], source.handoffs[0]],
  appliedCommandIds: ["handoff-command-1", "handoff-command-2"]
};
assert.equal(runtime.serializeState(runtime.createState(reordered)), runtime.serializeState(normalized));

let importBase = runtime.createState({
  resources: {
    "doctor-a": resource("doctor-a", "authored-test-capability"),
    "doctor-b": resource("doctor-b", "authored-test-capability")
  }
});
const legacyTask = task("DT-000001", "queued", 5, 100, 8);
const importCommand = {
  commandId: "import-DT-000001",
  task: legacyTask,
  reservations: [],
  sourceAppliedCommandIds: []
};
const importBefore = JSON.parse(JSON.stringify(importBase));
const imported = runtime.importExactTask(importBase, importCommand);
assert.deepEqual(importBase, importBefore, "task import must not mutate persisted state");
assert.equal(imported.idempotent, false);
assert.deepEqual(imported.task, legacyTask);
assert.equal(Object.prototype.hasOwnProperty.call(imported.task, "startAt"), false);
assert.equal(Object.prototype.hasOwnProperty.call(imported.task, "endAt"), false);
assert.equal(Object.prototype.hasOwnProperty.call(imported.task, "result"), false);
assert.equal(runtime.importExactTask(imported.state, importCommand).idempotent, true);
assert.throws(() => runtime.importExactTask(imported.state, {
  ...importCommand,
  task: { ...legacyTask, authoredDurationMinutes: 9 }
}), /conflicts with persisted task/);
assert.throws(() => runtime.importExactTask(imported.state, {
  commandId: "import-DT-000002",
  task: { ...legacyTask, taskId: "DT-000002" },
  reservations: [],
  sourceAppliedCommandIds: ["import-DT-000001"]
}), /must exactly match its task history/);
assert.throws(() => runtime.importExactTask(importBase, {
  commandId: "incomplete-import",
  task: (() => {
    const incomplete = { ...legacyTask };
    delete incomplete.authoredDurationMinutes;
    return incomplete;
  })(),
  reservations: [],
  sourceAppliedCommandIds: []
}), /invalid_authored_duration/);
assert.throws(() => runtime.importExactTask(importBase, {
  commandId: "clinical-import",
  task: { ...legacyTask, result: "must stay on the research order" },
  reservations: [],
  sourceAppliedCommandIds: []
}), /cannot carry medical or clinical field result/);
assert.throws(() => runtime.importExactTask(importBase, {
  commandId: "implicit-source-commands",
  task: legacyTask,
  reservations: []
}), /sourceAppliedCommandIds must be an explicit array/);

assert.throws(() => runtime.recordHandoff(imported.state, {
  commandId: "handoff-DT-000001",
  handoffId: "HO-000001",
  taskId: "DT-000001",
  at: 120,
  reassignments: [{
    groupId: "responsible_staff",
    fromResourceId: "doctor-a",
    toResourceId: "doctor-b",
    capabilityId: "authored-test-capability",
    units: 1
  }]
}), /must expose handoffTask/, "an injected scheduler without transfer support must fail closed");

assert.deepEqual(runtime.summarizeState(normalized), {
  schemaVersion: 1,
  resourceCount: 2,
  taskCount: 2,
  queuedTaskCount: 1,
  activeTaskCount: 0,
  reservationCount: 1,
  handoffCount: 2,
  appliedCommandCount: 2,
  taskStatusCounts: { queued: 1, scheduled: 1 }
});

assert.equal(runtime.validateState({ ...empty, schemaVersion: 2 }).valid, false);
assert.equal(runtime.validateState({ ...empty, unsupported: true }).valid, false);
assert.equal(runtime.validateState({ ...empty, resources: { bad: { description: "medical narrative" } } }).valid, false);
assert.throws(() => runtime.deserializeState("{"), /Cannot parse operations state/);
assert.throws(() => runtime.createState({ resources: null }), /must be a plain object/);
assert.throws(() => runtime.createState({ tasks: [{ taskId: "missing-authored-fields" }] }), /Injected scheduler rejected/);

const cyclic = {};
cyclic.self = cyclic;
assert.throws(() => runtime.createState({ resources: cyclic }), /contains a cycle/);

const integratedRuntime = operationsApi.createOperationsRuntime(schedulerApi);
const schedulerEmpty = schedulerApi.createState([{
  id: "doctor-a",
  capacity: 1,
  capabilities: ["synthetic-test-task"],
  unavailableWindows: []
}, {
  id: "doctor-b",
  capacity: 1,
  capabilities: ["synthetic-test-task"],
  unavailableWindows: []
}, {
  id: "no-exam-resource",
  capacity: 1,
  capabilities: ["synthetic-other-work"],
  unavailableWindows: []
}]);
assert.equal(integratedRuntime.validateState(integratedRuntime.createState(schedulerEmpty)).valid, true);
const integratedEmpty = integratedRuntime.createState({
  resources: schedulerEmpty.resources,
  tasks: schedulerEmpty.tasks,
  reservations: schedulerEmpty.reservations,
  appliedCommandIds: schedulerEmpty.appliedCommandIds
});
const syntheticTaskInput = {
  id: "DT-000777",
  queuedAt: 200,
  priority: 30,
  authoredDurationMinutes: 12,
  fatigue: { percent: 20, durationMultiplier: 1.25 },
  requirementGroups: [{
    id: "responsible-staff",
    anyOf: [{
      resourceId: "doctor-a",
      capabilityId: "synthetic-test-task",
      units: 1
    }, {
      resourceId: "doctor-b",
      capabilityId: "synthetic-test-task",
      units: 1
    }]
  }],
  urgency: "routine",
  safeRouteRequired: false,
  sourceType: "research-order",
  sourceId: "RO-000777"
};
const exactQueuedSource = schedulerApi.enqueueTask(schedulerEmpty, {
  commandId: "source-enqueue-777",
  task: syntheticTaskInput
});
const exactQueuedImport = integratedRuntime.importExactTask(integratedEmpty, {
  commandId: "import-exact-777",
  task: exactQueuedSource.task,
  reservations: [],
  sourceAppliedCommandIds: ["source-enqueue-777"]
});
assert.equal(exactQueuedImport.task.id, "DT-000777", "legacy task id must be preserved exactly");
assert.equal(exactQueuedImport.task.authoredDurationMinutes, 12);
assert.equal(exactQueuedImport.task.scheduledDurationMinutes, 15);
assert.equal(Object.prototype.hasOwnProperty.call(exactQueuedImport.task, "result"), false);
assert.equal(integratedRuntime.validateState(exactQueuedImport.state).valid, true);
assert.equal(integratedRuntime.importExactTask(exactQueuedImport.state, {
  commandId: "import-exact-777",
  task: exactQueuedSource.task,
  reservations: [],
  sourceAppliedCommandIds: ["source-enqueue-777"]
}).idempotent, true);
assert.throws(() => integratedRuntime.importExactTask(exactQueuedImport.state, {
  commandId: "import-exact-777",
  task: exactQueuedSource.task,
  reservations: [],
  sourceAppliedCommandIds: []
}), /must exactly match its task history/, "idempotent import must not omit source command ownership");

const activeSource = schedulerApi.scheduleTask(exactQueuedSource.state, {
  commandId: "source-schedule-777",
  at: 200
});
const exactActiveImport = integratedRuntime.importExactTask(integratedEmpty, {
  commandId: "import-active-777",
  task: activeSource.task,
  reservations: activeSource.reservations,
  sourceAppliedCommandIds: ["source-enqueue-777", "source-schedule-777"]
});
const restoredActive = integratedRuntime.deserializeState(integratedRuntime.serializeState(exactActiveImport.state));
assert.equal(restoredActive.tasks[0].status, "active");
assert.deepEqual(restoredActive.reservations, activeSource.reservations);
assert.equal(integratedRuntime.summarizeState(restoredActive).activeTaskCount, 1);
assert.equal(integratedRuntime.summarizeState(restoredActive).queuedTaskCount, 0);
assert.throws(() => integratedRuntime.importExactTask(restoredActive, {
  commandId: "import-active-777",
  task: activeSource.task,
  reservations: [],
  sourceAppliedCommandIds: ["source-enqueue-777", "source-schedule-777"]
}), /conflicts with persisted task/, "idempotent import must not accept a reservation subset");

const restoredBeforeRejectedHandoffs = JSON.parse(JSON.stringify(restoredActive));
const rejectedHandoffBase = {
  handoffId: "HO-REJECTED-777",
  taskId: "DT-000777",
  at: 205,
  reassignments: [{
    groupId: "responsible-staff",
    fromResourceId: "doctor-a",
    toResourceId: "doctor-b",
    capabilityId: "synthetic-test-task",
    units: 1
  }]
};
assert.throws(() => integratedRuntime.recordHandoff(exactQueuedImport.state, {
  ...rejectedHandoffBase,
  commandId: "handoff-queued-777",
  handoffId: "HO-QUEUED-777",
  taskId: exactQueuedImport.task.id
}), /Only an active task/, "queued tasks must not be handed off");
assert.throws(() => integratedRuntime.recordHandoff(restoredActive, {
  ...rejectedHandoffBase,
  commandId: "handoff-outside-777",
  at: 199
}), /inside the active task interval/);
assert.throws(() => integratedRuntime.recordHandoff(restoredActive, {
  ...rejectedHandoffBase,
  commandId: "handoff-previous-owner-777",
  reassignments: [{
    ...rejectedHandoffBase.reassignments[0],
    fromResourceId: "doctor-b",
    toResourceId: "doctor-a"
  }]
}), /does not own/);
assert.throws(() => integratedRuntime.recordHandoff(restoredActive, {
  ...rejectedHandoffBase,
  commandId: "handoff-missing-capability-777",
  reassignments: [{
    ...rejectedHandoffBase.reassignments[0],
    toResourceId: "no-exam-resource"
  }]
}), /lacks capability/);
assert.deepEqual(restoredActive, restoredBeforeRejectedHandoffs,
  "a rejected handoff must not mutate persisted operations state");

const integratedHandoff = integratedRuntime.recordHandoff(restoredActive, {
  commandId: "handoff-active-777",
  handoffId: "HO-ACTIVE-777",
  taskId: "DT-000777",
  at: 205,
  reassignments: [{
    groupId: "responsible-staff",
    fromResourceId: "doctor-a",
    toResourceId: "doctor-b",
    capabilityId: "synthetic-test-task",
    units: 1
  }]
});
assert.equal(integratedHandoff.handoff.taskId, "DT-000777");
assert.equal(integratedRuntime.validateState(integratedHandoff.state).valid, true);
assert.deepEqual(
  integratedHandoff.state.reservations.map((item) => [item.resourceId, item.startAt, item.endAt]),
  [["doctor-a", 200, 205], ["doctor-b", 205, 215]]
);
const reloadedHandoff = integratedRuntime.deserializeState(integratedRuntime.serializeState(integratedHandoff.state));
assert.deepEqual(reloadedHandoff.reservations, integratedHandoff.state.reservations,
  "reservation ownership segments must survive reload");
assert.deepEqual(reloadedHandoff.handoffs, integratedHandoff.state.handoffs,
  "handoff records must survive reload");
assert.equal(integratedRuntime.recordHandoff(reloadedHandoff, {
  commandId: "handoff-active-777",
  handoffId: "HO-ACTIVE-777",
  taskId: "DT-000777",
  at: 205,
  reassignments: [{
    groupId: "responsible-staff",
    fromResourceId: "doctor-a",
    toResourceId: "doctor-b",
    capabilityId: "synthetic-test-task",
    units: 1
  }]
}).idempotent, true, "exact handoff replay must remain idempotent after deserialize");

const tamperedHandoffFingerprint = JSON.parse(JSON.stringify(reloadedHandoff));
tamperedHandoffFingerprint.commandFingerprints["handoff-active-777"] = "handoff:0000000000000000";
assert.match(integratedRuntime.validateState(tamperedHandoffFingerprint).errors[0], /fingerprint.*different content/i);
const missingHandoffFingerprint = JSON.parse(JSON.stringify(reloadedHandoff));
delete missingHandoffFingerprint.commandFingerprints["handoff-active-777"];
assert.match(integratedRuntime.validateState(missingHandoffFingerprint).errors[0], /fingerprint.*without an exact fingerprint/i);
const missingHandoffEvent = JSON.parse(JSON.stringify(reloadedHandoff));
missingHandoffEvent.handoffs = [];
assert.match(integratedRuntime.validateState(missingHandoffEvent).errors[0], /has no persisted handoff event/i);

const tamperedHandoffEvent = JSON.parse(JSON.stringify(reloadedHandoff));
tamperedHandoffEvent.handoffs[0].reassignments[0].toResourceId = "no-exam-resource";
assert.match(integratedRuntime.validateState(tamperedHandoffEvent).errors[0], /new-owner reservation boundary/i);
const tamperedHandoffSegments = JSON.parse(JSON.stringify(reloadedHandoff));
tamperedHandoffSegments.reservations.find((item) => item.startAt === 205).resourceId = "doctor-a";
assert.match(integratedRuntime.validateState(tamperedHandoffSegments).errors[0], /new-owner reservation boundary/i);

const secondHandoffCommand = {
  commandId: "handoff-active-777-back",
  handoffId: "HO-ACTIVE-777-BACK",
  taskId: "DT-000777",
  at: 208,
  reassignments: [{
    groupId: "responsible-staff",
    fromResourceId: "doctor-b",
    toResourceId: "doctor-a",
    capabilityId: "synthetic-test-task",
    units: 1
  }]
};
const secondHandoff = integratedRuntime.recordHandoff(reloadedHandoff, secondHandoffCommand);
assert.deepEqual(secondHandoff.state.reservations.map((item) => [item.resourceId, item.startAt, item.endAt]), [
  ["doctor-a", 200, 205],
  ["doctor-b", 205, 208],
  ["doctor-a", 208, 215]
]);
const reloadedSecondHandoff = integratedRuntime.deserializeState(integratedRuntime.serializeState(secondHandoff.state));
assert.equal(integratedRuntime.recordHandoff(reloadedSecondHandoff, secondHandoffCommand).idempotent, true);
const beforeRetroactiveHandoff = JSON.parse(JSON.stringify(reloadedSecondHandoff));
assert.throws(() => integratedRuntime.recordHandoff(reloadedSecondHandoff, {
  commandId: "handoff-active-777-retroactive",
  handoffId: "HO-ACTIVE-777-RETROACTIVE",
  taskId: "DT-000777",
  at: 206,
  reassignments: [{
    groupId: "responsible-staff",
    fromResourceId: "doctor-b",
    toResourceId: "doctor-a",
    capabilityId: "synthetic-test-task",
    units: 1
  }]
}), /cannot supersede transfer HO-ACTIVE-777-BACK/);
assert.deepEqual(reloadedSecondHandoff, beforeRetroactiveHandoff,
  "retroactive handoff rejection must preserve later events and segments");
assert.equal(integratedRuntime.recordHandoff(integratedHandoff.state, {
  commandId: "handoff-active-777",
  handoffId: "HO-ACTIVE-777",
  taskId: "DT-000777",
  at: 205,
  reassignments: [{
    groupId: "responsible-staff",
    fromResourceId: "doctor-a",
    toResourceId: "doctor-b",
    capabilityId: "synthetic-test-task",
    units: 1
  }]
}).idempotent, true);
assert.throws(() => integratedRuntime.recordHandoff(integratedHandoff.state, {
  commandId: "handoff-active-777",
  handoffId: "HO-ACTIVE-777",
  taskId: "DT-000777",
  at: 206,
  reassignments: [{
    groupId: "responsible-staff",
    fromResourceId: "doctor-a",
    toResourceId: "doctor-b",
    capabilityId: "synthetic-test-task",
    units: 1
  }]
}), /conflicts with persisted state/, "a reused commandId with different content must fail");

let busySource = schedulerApi.createState([{
  id: "busy-doctor-a", capacity: 1, capabilities: ["busy-work"], unavailableWindows: []
}, {
  id: "busy-doctor-b", capacity: 1, capabilities: ["busy-work"], unavailableWindows: []
}]);
busySource = schedulerApi.enqueueTask(busySource, {
  commandId: "busy-enqueue-blocker",
  task: {
    id: "busy-blocker", queuedAt: 300, priority: 20, authoredDurationMinutes: 20,
    fatigue: { percent: 0, durationMultiplier: 1 },
    requirementGroups: [{ id: "staff", anyOf: [{ resourceId: "busy-doctor-b", capabilityId: "busy-work", units: 1 }] }],
    urgency: "routine", safeRouteRequired: false
  }
}).state;
busySource = schedulerApi.enqueueTask(busySource, {
  commandId: "busy-enqueue-transfer",
  task: {
    id: "busy-transfer", queuedAt: 300, priority: 10, authoredDurationMinutes: 20,
    fatigue: { percent: 0, durationMultiplier: 1 },
    requirementGroups: [{ id: "staff", anyOf: [
      { resourceId: "busy-doctor-a", capabilityId: "busy-work", units: 1 },
      { resourceId: "busy-doctor-b", capabilityId: "busy-work", units: 1 }
    ] }],
    urgency: "routine", safeRouteRequired: false
  }
}).state;
busySource = schedulerApi.scheduleTask(busySource, { commandId: "busy-start-blocker", at: 300 }).state;
busySource = schedulerApi.scheduleTask(busySource, { commandId: "busy-start-transfer", at: 300 }).state;
const busyOperations = integratedRuntime.createState({ ...busySource, handoffs: [] });
const busyOperationsBefore = JSON.parse(JSON.stringify(busyOperations));
assert.throws(() => integratedRuntime.recordHandoff(busyOperations, {
  commandId: "busy-handoff",
  handoffId: "HO-BUSY",
  taskId: "busy-transfer",
  at: 305,
  reassignments: [{
    groupId: "staff", fromResourceId: "busy-doctor-a", toResourceId: "busy-doctor-b",
    capabilityId: "busy-work", units: 1
  }]
}), /capacity is exceeded/);
assert.deepEqual(busyOperations, busyOperationsBefore, "busy target rejection must be atomic");

let multiSource = schedulerApi.createState([{
  id: "multi-doctor-a", capacity: 1, capabilities: ["multi-staff"], unavailableWindows: []
}, {
  id: "multi-doctor-b", capacity: 1, capabilities: ["multi-staff"], unavailableWindows: []
}, {
  id: "multi-room-a", capacity: 1, capabilities: ["multi-room"], unavailableWindows: []
}, {
  id: "multi-room-b", capacity: 1, capabilities: ["multi-room"], unavailableWindows: []
}]);
multiSource = schedulerApi.enqueueTask(multiSource, {
  commandId: "multi-enqueue",
  task: {
    id: "multi-transfer", queuedAt: 400, priority: 10, authoredDurationMinutes: 20,
    fatigue: { percent: 0, durationMultiplier: 1 },
    requirementGroups: [{ id: "staff", anyOf: [
      { resourceId: "multi-doctor-a", capabilityId: "multi-staff", units: 1 },
      { resourceId: "multi-doctor-b", capabilityId: "multi-staff", units: 1 }
    ] }, { id: "room", anyOf: [
      { resourceId: "multi-room-a", capabilityId: "multi-room", units: 1 },
      { resourceId: "multi-room-b", capabilityId: "multi-room", units: 1 }
    ] }],
    urgency: "routine", safeRouteRequired: false
  }
}).state;
multiSource = schedulerApi.scheduleTask(multiSource, { commandId: "multi-start", at: 400 }).state;
const multiOperations = integratedRuntime.createState({ ...multiSource, handoffs: [] });
const multiOperationsBefore = JSON.parse(JSON.stringify(multiOperations));
assert.throws(() => integratedRuntime.recordHandoff(multiOperations, {
  commandId: "multi-partial-handoff",
  handoffId: "HO-MULTI-PARTIAL",
  taskId: "multi-transfer",
  at: 405,
  reassignments: [{
    groupId: "staff", fromResourceId: "multi-doctor-a", toResourceId: "multi-doctor-b",
    capabilityId: "multi-staff", units: 1
  }, {
    groupId: "room", fromResourceId: "multi-room-b", toResourceId: "multi-room-a",
    capabilityId: "multi-room", units: 1
  }]
}), /does not own/);
assert.deepEqual(multiOperations, multiOperationsBefore,
  "a partially valid multi-resource handoff must transfer none of its groups");

assert.equal(globalThis.PET_CLINIC_OPERATIONS_RUNTIME_V5, operationsApi);
console.log("operations-runtime-v5: ok (deterministic persistence, exact imports, idempotent handoffs, clinical isolation)");
