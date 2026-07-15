#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const scheduler = require("../systems/resource-scheduler-v5.js");

function resources() {
  return [
    {
      id: "doctor-a",
      capacity: 1,
      capabilities: ["staff.exam", "staff.sample"],
      unavailableWindows: [{ startAt: 50, endAt: 60 }]
    },
    {
      id: "doctor-b",
      capacity: 1,
      capabilities: ["staff.exam", "staff.sample"],
      unavailableWindows: []
    },
    {
      id: "exam-room",
      capacity: 1,
      capabilities: ["room.exam"],
      unavailableWindows: []
    },
    {
      id: "shared-device",
      capacity: 2,
      capabilities: ["device.synthetic"],
      unavailableWindows: []
    }
  ];
}

function task(id, options = {}) {
  return {
    id,
    queuedAt: options.queuedAt === undefined ? 0 : options.queuedAt,
    priority: options.priority === undefined ? 0 : options.priority,
    authoredDurationMinutes: options.duration === undefined ? 10 : options.duration,
    fatigue: options.fatigue || { percent: 0, durationMultiplier: 1 },
    requirementGroups: options.requirementGroups || [{
      id: "staff",
      anyOf: [{ resourceId: "doctor-a", capabilityId: "staff.exam", units: 1 }]
    }],
    urgency: options.urgency || "routine",
    safeRouteRequired: options.safeRouteRequired === undefined
      ? options.urgency === "urgent"
      : options.safeRouteRequired,
    ...(options.refs || {})
  };
}

function enqueue(state, id, options = {}, commandId = `enqueue:${id}`) {
  return scheduler.enqueueTask(state, { commandId, task: task(id, options) });
}

function schedule(state, at, commandId) {
  return scheduler.scheduleTask(state, { commandId, at });
}

assert.equal(scheduler.intervalsOverlap(10, 20, 20, 30), false, "adjacent half-open intervals must not overlap");
assert.equal(scheduler.intervalsOverlap(10, 21, 20, 30), true);
assert.equal(scheduler.adjustDurationForFatigue(7, { percent: 80, durationMultiplier: 1.35 }), 10);

assert.throws(() => scheduler.createState([{
  id: "implicit-capacity",
  capabilities: ["synthetic"],
  unavailableWindows: []
}]), /capacity/);
assert.throws(() => scheduler.createState([{
  id: "implicit-availability",
  capacity: 1,
  capabilities: ["synthetic"]
}]), /unavailableWindows/);

const empty = scheduler.createState(resources());
assert.deepEqual(scheduler.validateState(empty), { valid: true, errors: [] });
assert.deepEqual(Object.keys(empty.resources), ["doctor-a", "doctor-b", "exam-room", "shared-device"]);

const invalidTasks = [
  { mutation: (value) => { delete value.authoredDurationMinutes; }, error: /authoredDurationMinutes/ },
  { mutation: (value) => { value.payload = { text: "forbidden" }; }, error: /unsupported fields: payload/ },
  { mutation: (value) => { value.result = { anything: true }; }, error: /unsupported fields: result/ },
  { mutation: (value) => { value.medicalTruth = "forbidden"; }, error: /unsupported fields: medicalTruth/ },
  { mutation: (value) => { value.requirementGroups[0].anyOf[0].resourceId = "missing"; }, error: /Unknown resource/ },
  { mutation: (value) => { value.requirementGroups[0].anyOf[0].capabilityId = "missing"; }, error: /Unknown capability/ },
  { mutation: (value) => { value.requirementGroups[0].anyOf[0].units = 2; }, error: /exceeds capacity/ }
];
for (const { mutation, error } of invalidTasks) {
  const input = task("invalid-task");
  mutation(input);
  assert.throws(() => scheduler.enqueueTask(empty, { commandId: "invalid-command", task: input }), error);
  assert.equal(empty.tasks.length, 0, "failed enqueue must not mutate its input state");
}
assert.throws(() => enqueue(empty, "unsafe-urgent", {
  urgency: "urgent",
  safeRouteRequired: false
}), /safe route/);

// Queue order is priority descending, then queuedAt ascending, then stable task id.
let queueState = empty;
queueState = enqueue(queueState, "task-low", { priority: 1, queuedAt: 0 }).state;
queueState = enqueue(queueState, "task-late", { priority: 5, queuedAt: 2 }).state;
queueState = enqueue(queueState, "task-z", { priority: 5, queuedAt: 1 }).state;
queueState = enqueue(queueState, "task-a", { priority: 5, queuedAt: 1 }).state;
assert.deepEqual(scheduler.summarizeState(queueState).queuedTaskIds, [
  "task-a", "task-z", "task-late", "task-low"
]);
const firstScheduled = schedule(queueState, 5, "schedule:queue-first");
assert.equal(firstScheduled.task.id, "task-a");
assert.equal(firstScheduled.reasonCode, "scheduled");
assert.equal(queueState.tasks.every((item) => item.status === "queued"), true, "schedule must not mutate its input state");
const replayedSchedule = schedule(firstScheduled.state, 5, "schedule:queue-first");
assert.equal(replayedSchedule.idempotent, true);
assert.equal(replayedSchedule.task.id, "task-a");
assert.deepEqual(replayedSchedule.state, firstScheduled.state);

// AND requirement groups reserve atomically. A busy room cannot leave a partial staff reservation.
let atomicState = scheduler.createState(resources());
atomicState = enqueue(atomicState, "room-blocker", {
  duration: 30,
  requirementGroups: [{
    id: "room",
    anyOf: [{ resourceId: "exam-room", capabilityId: "room.exam", units: 1 }]
  }]
}).state;
atomicState = schedule(atomicState, 100, "schedule:room-blocker").state;
atomicState = enqueue(atomicState, "multi-resource", {
  priority: 10,
  requirementGroups: [{
    id: "staff",
    anyOf: [{ resourceId: "doctor-a", capabilityId: "staff.exam", units: 1 }]
  }, {
    id: "room",
    anyOf: [{ resourceId: "exam-room", capabilityId: "room.exam", units: 1 }]
  }]
}).state;
const beforeAtomicAttempt = JSON.parse(JSON.stringify(atomicState.reservations));
const atomicBlocked = schedule(atomicState, 105, "schedule:atomic-blocked");
assert.equal(atomicBlocked.reasonCode, "capacity_unavailable");
assert.deepEqual(atomicBlocked.state.reservations, beforeAtomicAttempt, "failed multi-resource reservation must be atomic");
assert.equal(atomicBlocked.state.tasks.find((item) => item.id === "multi-resource").status, "queued");

const earliestAtomic = scheduler.findEarliestSlot(atomicBlocked.state, "multi-resource", 105);
assert.equal(earliestAtomic.startAt, 130);
assert.equal(earliestAtomic.endAt, 140);
assert.equal(earliestAtomic.assignments.length, 2);

// OR alternatives and allocation search must not be greedy.
let alternativeState = scheduler.createState(resources());
alternativeState = enqueue(alternativeState, "doctor-a-blocker", { duration: 20 }).state;
alternativeState = schedule(alternativeState, 200, "schedule:doctor-a-blocker").state;
alternativeState = enqueue(alternativeState, "doctor-choice", {
  requirementGroups: [{
    id: "staff",
    anyOf: [
      { resourceId: "doctor-a", capabilityId: "staff.exam", units: 1 },
      { resourceId: "doctor-b", capabilityId: "staff.exam", units: 1 }
    ]
  }]
}).state;
const alternativeScheduled = schedule(alternativeState, 205, "schedule:doctor-choice");
assert.equal(alternativeScheduled.task.id, "doctor-choice");
assert.equal(alternativeScheduled.reservations[0].resourceId, "doctor-b");

let combinationState = scheduler.createState(resources());
combinationState = enqueue(combinationState, "non-greedy-combination", {
  requirementGroups: [{
    id: "flexible",
    anyOf: [
      { resourceId: "doctor-a", capabilityId: "staff.exam", units: 1 },
      { resourceId: "doctor-b", capabilityId: "staff.exam", units: 1 }
    ]
  }, {
    id: "fixed",
    anyOf: [{ resourceId: "doctor-a", capabilityId: "staff.sample", units: 1 }]
  }]
}).state;
const combinationScheduled = schedule(combinationState, 300, "schedule:non-greedy");
assert.equal(combinationScheduled.reasonCode, "scheduled");
assert.deepEqual(combinationScheduled.reservations.map((item) => [item.groupId, item.resourceId]), [
  ["fixed", "doctor-a"],
  ["flexible", "doctor-b"]
]);

// Capacity two permits two simultaneous unit reservations and rejects the third.
let capacityState = scheduler.createState(resources());
for (const id of ["device-1", "device-2", "device-3"]) {
  capacityState = enqueue(capacityState, id, {
    requirementGroups: [{
      id: "device",
      anyOf: [{ resourceId: "shared-device", capabilityId: "device.synthetic", units: 1 }]
    }]
  }).state;
}
capacityState = schedule(capacityState, 400, "schedule:device-1").state;
capacityState = schedule(capacityState, 400, "schedule:device-2").state;
const capacityBlocked = schedule(capacityState, 400, "schedule:device-3");
assert.equal(capacityBlocked.reasonCode, "capacity_unavailable");
assert.equal(capacityBlocked.state.reservations.filter((item) => item.resourceId === "shared-device").length, 2);
assert.equal(scheduler.findEarliestSlot(capacityBlocked.state, "device-3", 400).startAt, 410);

// The end of one interval is an eligible start for the next task.
const firstDevice = capacityState.tasks.find((item) => item.id === "device-1");
capacityState = scheduler.completeTask(capacityState, {
  commandId: "complete:device-1",
  taskId: "device-1",
  at: firstDevice.endAt
}).state;
const adjacentStart = schedule(capacityState, 410, "schedule:device-3-adjacent");
assert.equal(adjacentStart.task.startAt, 410);

// Unavailable windows block any overlap, but not an adjacent start or end.
let unavailableState = scheduler.createState(resources());
unavailableState = enqueue(unavailableState, "ends-at-unavailable", { duration: 10 }).state;
assert.equal(schedule(unavailableState, 40, "schedule:ends-at-unavailable").reasonCode, "scheduled");
unavailableState = scheduler.createState(resources());
unavailableState = enqueue(unavailableState, "overlaps-unavailable", { duration: 11 }).state;
assert.equal(schedule(unavailableState, 40, "schedule:overlaps-unavailable").reasonCode, "capacity_unavailable");
assert.equal(scheduler.findEarliestSlot(unavailableState, "overlaps-unavailable", 40).startAt, 60);
unavailableState = scheduler.createState(resources());
unavailableState = enqueue(unavailableState, "starts-after-unavailable", { duration: 10 }).state;
assert.equal(schedule(unavailableState, 60, "schedule:starts-after-unavailable").reasonCode, "scheduled");

// Fatigue changes duration only. At 100%, routine starts fail closed while urgent starts and completion remain available.
let fatigueState = scheduler.createState(resources());
fatigueState = enqueue(fatigueState, "routine-exhausted", {
  priority: 20,
  duration: 10,
  fatigue: { percent: 100, durationMultiplier: 1.35 }
}).state;
const fatigueBlocked = schedule(fatigueState, 500, "schedule:routine-exhausted");
assert.equal(fatigueBlocked.reasonCode, "routine_blocked_by_fatigue");
assert.equal(fatigueBlocked.state.tasks[0].scheduledDurationMinutes, 14);
assert.equal(Object.prototype.hasOwnProperty.call(fatigueBlocked.state.tasks[0], "result"), false);

let urgentState = scheduler.createState(resources());
urgentState = enqueue(urgentState, "urgent-exhausted", {
  urgency: "urgent",
  duration: 10,
  fatigue: { percent: 100, durationMultiplier: 1.35 }
}).state;
const urgentScheduled = schedule(urgentState, 600, "schedule:urgent-exhausted");
assert.equal(urgentScheduled.reasonCode, "scheduled");
assert.equal(urgentScheduled.task.endAt, 614);
const urgentCompleted = scheduler.completeTask(urgentScheduled.state, {
  commandId: "complete:urgent-exhausted",
  taskId: "urgent-exhausted",
  at: 614
});
assert.equal(urgentCompleted.reasonCode, "completed");
assert.equal(Object.prototype.hasOwnProperty.call(urgentCompleted.task, "result"), false);
assert.deepEqual(
  scheduler.completeTask(urgentCompleted.state, {
    commandId: "complete:urgent-exhausted",
    taskId: "urgent-exhausted",
    at: 614
  }).state,
  urgentCompleted.state
);

// A blocked urgent task is retained and explicitly requires a safe route.
let urgentBlockedState = scheduler.createState(resources());
urgentBlockedState = enqueue(urgentBlockedState, "urgent-blocker", { duration: 20 }).state;
urgentBlockedState = schedule(urgentBlockedState, 700, "schedule:urgent-blocker").state;
urgentBlockedState = enqueue(urgentBlockedState, "urgent-waiting", {
  urgency: "urgent",
  priority: 100
}).state;
const urgentBlocked = schedule(urgentBlockedState, 705, "schedule:urgent-waiting");
assert.equal(urgentBlocked.reasonCode, "urgent_capacity_unavailable_safe_route_required");
assert.equal(urgentBlocked.blockedTaskId, "urgent-waiting");
assert.equal(urgentBlocked.safeRouteRequired, true);
assert.equal(urgentBlocked.state.tasks.find((item) => item.id === "urgent-waiting").status, "queued");
assert.ok(scheduler.summarizeState(urgentBlocked.state).urgentSafeRouteTaskIds.includes("urgent-waiting"));
const repeatedUrgentBlock = schedule(urgentBlocked.state, 705, "schedule:urgent-waiting");
assert.equal(repeatedUrgentBlock.idempotent, true);
assert.deepEqual(repeatedUrgentBlock.state, urgentBlocked.state);
assert.throws(() => scheduler.cancelTask(urgentBlocked.state, {
  commandId: "cancel:urgent-no-route",
  taskId: "urgent-waiting",
  at: 706,
  reasonCode: "local_capacity_full"
}), /safeRouteId/);
const safelyRouted = scheduler.cancelTask(urgentBlocked.state, {
  commandId: "cancel:urgent-safe-route",
  taskId: "urgent-waiting",
  at: 706,
  reasonCode: "local_capacity_full",
  safeRouteId: "referral-order-1"
});
assert.equal(safelyRouted.task.cancellation.safeRouteId, "referral-order-1");

// A blocked urgent item is surfaced before a lower-ranked feasible routine task can start.
let urgentPrecedenceState = scheduler.createState(resources());
urgentPrecedenceState = enqueue(urgentPrecedenceState, "urgent-resource-blocker", { duration: 20 }).state;
urgentPrecedenceState = schedule(urgentPrecedenceState, 750, "schedule:urgent-resource-blocker").state;
urgentPrecedenceState = enqueue(urgentPrecedenceState, "urgent-needs-busy-doctor", {
  urgency: "urgent",
  priority: 100
}).state;
urgentPrecedenceState = enqueue(urgentPrecedenceState, "routine-free-room", {
  priority: 1,
  requirementGroups: [{
    id: "room",
    anyOf: [{ resourceId: "exam-room", capabilityId: "room.exam", units: 1 }]
  }]
}).state;
const urgentPrecedence = schedule(urgentPrecedenceState, 755, "schedule:urgent-precedence");
assert.equal(urgentPrecedence.reasonCode, "urgent_capacity_unavailable_safe_route_required");
assert.equal(urgentPrecedence.state.tasks.find((item) => item.id === "routine-free-room").status, "queued");

// Cancelling an active task releases only the remainder of its reservation.
let cancellationState = scheduler.createState(resources());
cancellationState = enqueue(cancellationState, "active-cancel", { duration: 20 }).state;
cancellationState = schedule(cancellationState, 800, "schedule:active-cancel").state;
const activeCancelled = scheduler.cancelTask(cancellationState, {
  commandId: "cancel:active-cancel",
  taskId: "active-cancel",
  at: 805,
  reasonCode: "operational_stop"
});
assert.equal(activeCancelled.state.reservations[0].startAt, 800);
assert.equal(activeCancelled.state.reservations[0].endAt, 805);
assert.deepEqual(scheduler.validateState(activeCancelled.state), { valid: true, errors: [] });
const replayedCancel = scheduler.cancelTask(activeCancelled.state, {
  commandId: "cancel:active-cancel",
  taskId: "active-cancel",
  at: 805,
  reasonCode: "operational_stop"
});
assert.equal(replayedCancel.idempotent, true);

// Exact command fingerprints distinguish a replay from command-id reuse with different content.
let fingerprintState = scheduler.createState(resources());
const fingerprintEnqueueCommand = {
  commandId: "fingerprint:enqueue",
  task: task("fingerprint-task", { duration: 12 })
};
const fingerprintEnqueued = scheduler.enqueueTask(fingerprintState, fingerprintEnqueueCommand);
assert.equal(scheduler.enqueueTask(fingerprintEnqueued.state, fingerprintEnqueueCommand).idempotent, true);
const reorderedFingerprintTask = Object.fromEntries(Object.entries(fingerprintEnqueueCommand.task).reverse());
assert.equal(scheduler.enqueueTask(fingerprintEnqueued.state, {
  task: reorderedFingerprintTask,
  commandId: "fingerprint:enqueue"
}).idempotent, true, "object property order must not change a deterministic command fingerprint");
assert.throws(() => scheduler.enqueueTask(fingerprintEnqueued.state, {
  commandId: "fingerprint:enqueue",
  task: task("fingerprint-task", { duration: 13 })
}), /already applied with different content/);
assert.throws(() => scheduler.scheduleTask(fingerprintEnqueued.state, {
  commandId: "fingerprint:enqueue",
  at: 900
}), /already applied with different content/);

const fingerprintScheduled = schedule(fingerprintEnqueued.state, 900, "fingerprint:schedule");
assert.equal(schedule(fingerprintScheduled.state, 900, "fingerprint:schedule").idempotent, true);
assert.throws(() => schedule(fingerprintScheduled.state, 901, "fingerprint:schedule"), /already applied with different content/);
const fingerprintCompleted = scheduler.completeTask(fingerprintScheduled.state, {
  commandId: "fingerprint:complete",
  taskId: "fingerprint-task",
  at: 912
});
assert.equal(scheduler.completeTask(fingerprintCompleted.state, {
  commandId: "fingerprint:complete",
  taskId: "fingerprint-task",
  at: 912
}).idempotent, true);
assert.throws(() => scheduler.completeTask(fingerprintCompleted.state, {
  commandId: "fingerprint:complete",
  taskId: "fingerprint-task",
  at: 913
}), /already applied with different content/);

let fingerprintCancelState = scheduler.createState(resources());
fingerprintCancelState = enqueue(fingerprintCancelState, "fingerprint-cancel-task").state;
const fingerprintCancelCommand = {
  commandId: "fingerprint:cancel",
  taskId: "fingerprint-cancel-task",
  at: 10,
  reasonCode: "operational_stop"
};
const fingerprintCancelled = scheduler.cancelTask(fingerprintCancelState, fingerprintCancelCommand);
assert.equal(scheduler.cancelTask(fingerprintCancelled.state, fingerprintCancelCommand).idempotent, true);
assert.throws(() => scheduler.cancelTask(fingerprintCancelled.state, {
  ...fingerprintCancelCommand,
  reasonCode: "different_reason"
}), /already applied with different content/);

const failedSchedule = schedule(scheduler.createState(resources()), 20, "fingerprint:failed-schedule");
assert.equal(failedSchedule.reasonCode, "no_ready_task");
assert.equal(schedule(failedSchedule.state, 20, "fingerprint:failed-schedule").idempotent, true);
assert.throws(() => schedule(failedSchedule.state, 21, "fingerprint:failed-schedule"), /already applied with different content/);
assert.match(failedSchedule.state.commandFingerprints["fingerprint:failed-schedule"], /^schedule:[0-9a-f]{16}$/);

const externalApplied = scheduler.createState(resources());
externalApplied.appliedCommandIds.push("external-imported-command");
assert.deepEqual(scheduler.validateState(externalApplied), { valid: true, errors: [] });
assert.throws(() => schedule(externalApplied, 20, "external-imported-command"), /imported without an exact fingerprint/);
assert.throws(() => scheduler.enqueueTask(externalApplied, {
  commandId: "external-imported-command",
  task: task("external-collision-task")
}), /imported without an exact fingerprint/);
assert.throws(() => scheduler.cancelTask(externalApplied, {
  commandId: "external-imported-command",
  taskId: "external-collision-task",
  at: 20,
  reasonCode: "operational_stop"
}), /imported without an exact fingerprint/);
assert.throws(() => scheduler.completeTask(externalApplied, {
  commandId: "external-imported-command",
  taskId: "external-collision-task",
  at: 20
}), /imported without an exact fingerprint/);
const importedTaskState = JSON.parse(JSON.stringify(fingerprintEnqueued.state));
delete importedTaskState.commandFingerprints;
assert.deepEqual(scheduler.validateState(importedTaskState), { valid: true, errors: [] });
assert.throws(() => scheduler.enqueueTask(importedTaskState, fingerprintEnqueueCommand), /imported without an exact fingerprint/);
const invalidFingerprint = JSON.parse(JSON.stringify(failedSchedule.state));
invalidFingerprint.commandFingerprints["fingerprint:failed-schedule"] = "schedule:not-a-fingerprint";
assert.equal(scheduler.validateState(invalidFingerprint).valid, false);

// Active-task handoff replaces current ownership with gap-free half-open reservation segments.
let handoffState = scheduler.createState(resources());
handoffState = enqueue(handoffState, "handoff-task", {
  duration: 20,
  requirementGroups: [{
    id: "staff",
    anyOf: [
      { resourceId: "doctor-a", capabilityId: "staff.exam", units: 1 },
      { resourceId: "doctor-b", capabilityId: "staff.exam", units: 1 }
    ]
  }]
}).state;
handoffState = schedule(handoffState, 1000, "handoff:schedule").state;
const handoffCommand = {
  commandId: "handoff:a-to-b",
  taskId: "handoff-task",
  at: 1010,
  reassignments: [{
    groupId: "staff",
    fromResourceId: "doctor-a",
    toResourceId: "doctor-b",
    capabilityId: "staff.exam",
    units: 1
  }]
};
const handedOff = scheduler.handoffTask(handoffState, handoffCommand);
assert.equal(handedOff.reasonCode, "handed_off");
assert.deepEqual(handedOff.reservations.map((item) => [item.resourceId, item.startAt, item.endAt]), [
  ["doctor-a", 1000, 1010],
  ["doctor-b", 1010, 1020]
]);
assert.deepEqual(scheduler.validateState(handedOff.state), { valid: true, errors: [] });
assert.equal(scheduler.handoffTask(handedOff.state, handoffCommand).idempotent, true);
assert.throws(() => scheduler.handoffTask(handedOff.state, {
  ...handoffCommand,
  at: 1011
}), /already applied with different content/);

assert.throws(() => scheduler.handoffTask(handedOff.state, {
  commandId: "handoff:previous-owner",
  taskId: "handoff-task",
  at: 1015,
  reassignments: [{
    groupId: "staff",
    fromResourceId: "doctor-a",
    toResourceId: "doctor-b",
    capabilityId: "staff.exam",
    units: 1
  }]
}), /does not own/);
assert.throws(() => scheduler.handoffTask(handoffState, {
  ...handoffCommand,
  commandId: "handoff:before-start",
  at: 999
}), /inside the active task interval/);
assert.throws(() => scheduler.handoffTask(handoffState, {
  ...handoffCommand,
  commandId: "handoff:at-end",
  at: 1020
}), /inside the active task interval/);
assert.throws(() => scheduler.handoffTask(handoffState, {
  commandId: "handoff:missing-capability",
  taskId: "handoff-task",
  at: 1010,
  reassignments: [{
    groupId: "staff",
    fromResourceId: "doctor-a",
    toResourceId: "exam-room",
    capabilityId: "staff.exam",
    units: 1
  }]
}), /lacks capability/);

let disallowedTargetState = scheduler.createState(resources());
disallowedTargetState = enqueue(disallowedTargetState, "disallowed-target-task", {
  duration: 20,
  requirementGroups: [{
    id: "staff",
    anyOf: [{ resourceId: "doctor-a", capabilityId: "staff.exam", units: 1 }]
  }]
}).state;
disallowedTargetState = schedule(disallowedTargetState, 1050, "handoff:disallowed-schedule").state;
assert.throws(() => scheduler.handoffTask(disallowedTargetState, {
  commandId: "handoff:disallowed-target",
  taskId: "disallowed-target-task",
  at: 1060,
  reassignments: [{
    groupId: "staff",
    fromResourceId: "doctor-a",
    toResourceId: "doctor-b",
    capabilityId: "staff.exam",
    units: 1
  }]
}), /not an allowed alternative/);

// Target capacity and availability apply over the entire remaining task interval.
let busyHandoffState = scheduler.createState(resources());
busyHandoffState = enqueue(busyHandoffState, "doctor-b-busy", {
  priority: 20,
  duration: 20,
  requirementGroups: [{
    id: "staff",
    anyOf: [{ resourceId: "doctor-b", capabilityId: "staff.exam", units: 1 }]
  }]
}).state;
busyHandoffState = enqueue(busyHandoffState, "busy-handoff-task", {
  priority: 10,
  duration: 20,
  requirementGroups: [{
    id: "staff",
    anyOf: [
      { resourceId: "doctor-a", capabilityId: "staff.exam", units: 1 },
      { resourceId: "doctor-b", capabilityId: "staff.exam", units: 1 }
    ]
  }]
}).state;
busyHandoffState = schedule(busyHandoffState, 1100, "handoff:busy-schedule-b").state;
busyHandoffState = schedule(busyHandoffState, 1100, "handoff:busy-schedule-a").state;
const busyBefore = JSON.parse(JSON.stringify(busyHandoffState));
assert.throws(() => scheduler.handoffTask(busyHandoffState, {
  commandId: "handoff:busy-target",
  taskId: "busy-handoff-task",
  at: 1110,
  reassignments: [{
    groupId: "staff",
    fromResourceId: "doctor-a",
    toResourceId: "doctor-b",
    capabilityId: "staff.exam",
    units: 1
  }]
}), /cannot reserve all target resources atomically.*capacity is exceeded/);
assert.deepEqual(busyHandoffState, busyBefore, "failed target reservation must not mutate source state");

let unavailableHandoffState = scheduler.createState(resources());
unavailableHandoffState = enqueue(unavailableHandoffState, "unavailable-handoff-task", {
  duration: 20,
  requirementGroups: [{
    id: "staff",
    anyOf: [
      { resourceId: "doctor-a", capabilityId: "staff.exam", units: 1 },
      { resourceId: "doctor-b", capabilityId: "staff.exam", units: 1 }
    ]
  }]
}).state;
// doctor-a is unavailable at 50, so deterministic scheduling starts on doctor-b.
unavailableHandoffState = schedule(unavailableHandoffState, 45, "handoff:unavailable-schedule").state;
assert.throws(() => scheduler.handoffTask(unavailableHandoffState, {
  commandId: "handoff:unavailable-target",
  taskId: "unavailable-handoff-task",
  at: 50,
  reassignments: [{
    groupId: "staff",
    fromResourceId: "doctor-b",
    toResourceId: "doctor-a",
    capabilityId: "staff.exam",
    units: 1
  }]
}), /cannot reserve all target resources atomically.*unavailable window/);

// Every reallocation in a multi-resource handoff succeeds or none is applied.
const multiHandoffResources = resources().concat([{
  id: "room-z",
  capacity: 1,
  capabilities: ["room.exam"],
  unavailableWindows: []
}]);
let multiHandoffState = scheduler.createState(multiHandoffResources);
multiHandoffState = enqueue(multiHandoffState, "multi-handoff-task", {
  duration: 20,
  requirementGroups: [{
    id: "staff",
    anyOf: [
      { resourceId: "doctor-a", capabilityId: "staff.exam", units: 1 },
      { resourceId: "doctor-b", capabilityId: "staff.exam", units: 1 }
    ]
  }, {
    id: "room",
    anyOf: [
      { resourceId: "exam-room", capabilityId: "room.exam", units: 1 },
      { resourceId: "room-z", capabilityId: "room.exam", units: 1 }
    ]
  }]
}).state;
multiHandoffState = schedule(multiHandoffState, 1200, "handoff:multi-schedule").state;
const multiBefore = JSON.parse(JSON.stringify(multiHandoffState));
assert.throws(() => scheduler.handoffTask(multiHandoffState, {
  commandId: "handoff:partial-multi",
  taskId: "multi-handoff-task",
  at: 1210,
  reassignments: [{
    groupId: "staff",
    fromResourceId: "doctor-a",
    toResourceId: "doctor-b",
    capabilityId: "staff.exam",
    units: 1
  }, {
    groupId: "room",
    fromResourceId: "wrong-current-room",
    toResourceId: "room-z",
    capabilityId: "room.exam",
    units: 1
  }]
}), /does not own/);
assert.deepEqual(multiHandoffState, multiBefore, "partial multi-resource handoff must not mutate any segment");
const multiHandedOff = scheduler.handoffTask(multiHandoffState, {
  commandId: "handoff:atomic-multi",
  taskId: "multi-handoff-task",
  at: 1210,
  reassignments: [{
    groupId: "staff",
    fromResourceId: "doctor-a",
    toResourceId: "doctor-b",
    capabilityId: "staff.exam",
    units: 1
  }, {
    groupId: "room",
    fromResourceId: "exam-room",
    toResourceId: "room-z",
    capabilityId: "room.exam",
    units: 1
  }]
});
assert.equal(multiHandedOff.reservations.length, 4);
assert.deepEqual(scheduler.validateState(multiHandedOff.state), { valid: true, errors: [] });

// Repeated handoffs form sequential, non-overlapping ownership segments.
const handedBack = scheduler.handoffTask(handedOff.state, {
  commandId: "handoff:b-to-a",
  taskId: "handoff-task",
  at: 1015,
  reassignments: [{
    groupId: "staff",
    fromResourceId: "doctor-b",
    toResourceId: "doctor-a",
    capabilityId: "staff.exam",
    units: 1
  }]
});
assert.deepEqual(handedBack.reservations.map((item) => [item.resourceId, item.startAt, item.endAt]), [
  ["doctor-a", 1000, 1010],
  ["doctor-b", 1010, 1015],
  ["doctor-a", 1015, 1020]
]);
assert.deepEqual(scheduler.validateState(handedBack.state), { valid: true, errors: [] });
const handedBackBeforeRetroactive = JSON.parse(JSON.stringify(handedBack.state));
assert.throws(() => scheduler.handoffTask(handedBack.state, {
  commandId: "handoff:retroactive-overwrite",
  taskId: "handoff-task",
  at: 1012,
  reassignments: [{
    groupId: "staff",
    fromResourceId: "doctor-b",
    toResourceId: "doctor-a",
    capabilityId: "staff.exam",
    units: 1
  }]
}), /cannot supersede a later reservation segment/);
assert.deepEqual(handedBack.state, handedBackBeforeRetroactive,
  "retroactive handoff rejection must preserve every later ownership segment");

const segmentGap = JSON.parse(JSON.stringify(handedOff.state));
segmentGap.reservations[1].startAt = 1011;
assert.match(scheduler.validateState(segmentGap).errors[0], /gap/);
const segmentOverlap = JSON.parse(JSON.stringify(handedOff.state));
segmentOverlap.reservations[1].startAt = 1009;
assert.match(scheduler.validateState(segmentOverlap).errors[0], /overlapping/);
const segmentWrongAlternative = JSON.parse(JSON.stringify(handedOff.state));
segmentWrongAlternative.reservations[1].capabilityId = "staff.sample";
assert.match(scheduler.validateState(segmentWrongAlternative).errors[0], /does not satisfy/);

// Validation rejects state corruption and overlapping usage beyond capacity.
const corrupt = JSON.parse(JSON.stringify(alternativeScheduled.state));
corrupt.reservations.push({ ...corrupt.reservations[0], taskId: "doctor-a-blocker", groupId: "staff-copy" });
assert.equal(scheduler.validateState(corrupt).valid, false);

const summary = scheduler.summarizeState(safelyRouted.state);
assert.deepEqual(summary.statusCounts, { queued: 0, active: 1, completed: 0, cancelled: 1 });

console.log(JSON.stringify({
  status: "passed",
  schedulerSchemaVersion: scheduler.SCHEMA_VERSION,
  resources: Object.keys(empty.resources).length,
  queueOrdering: true,
  halfOpenIntervals: true,
  atomicReservations: true,
  requirementGroups: "AND_with_OR_alternatives",
  exactCommandFingerprints: true,
  activeTaskHandoffSegments: true,
  atomicMultiResourceHandoffs: true,
  fatigueInvariant: true,
  urgentSafeRouteInvariant: true,
  medicalPayloadRejected: true
}, null, 2));
