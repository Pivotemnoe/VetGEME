#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const researchApi = require(path.join(root, "systems/research-orders-v3.js"));
const referralApi = require(path.join(root, "systems/referral-orders-v3.js"));
const eventApi = require(path.join(root, "systems/async-events-v3.js"));
const queueApi = require(path.join(root, "systems/device-queue-v3.js"));

assert.equal(researchApi.formatResearchOrderId(1), "RO-000001");
assert.equal(researchApi.allocateResearchOrderId(["RO-000002", { id: "RO-000004" }]), "RO-000005");
assert.equal(referralApi.formatReferralOrderId(1), "RF-000001");
assert.equal(referralApi.allocateReferralOrderId(["RF-000003"]), "RF-000004");
assert.equal(eventApi.formatAsyncEventId(1), "EV-000001");
assert.equal(queueApi.formatDeviceTaskId(1), "DT-000001");

let research = researchApi.createResearchOrder({
  id: "RO-000001",
  caseId: "case-1",
  encounterId: "encounter-1",
  patientId: "patient-1",
  researchId: "ear_cytology",
  route: "local",
  sampleRequired: true,
  createdAt: 10,
  createdBy: "doctor-1"
});
assert.equal(research.status, "proposed");
assert.equal(Object.prototype.hasOwnProperty.call(research, "authoredResult"), false);

let transitioned = researchApi.applyResearchTransition(research, {
  commandId: "research-accept", to: "owner_accepted", at: 11, payload: { ownerDecision: { accepted: true } }
});
research = transitioned.order;
assert.deepEqual(transitioned.effects, []);
assert.equal(Object.prototype.hasOwnProperty.call(research, "charges"), false);
assert.equal(Object.prototype.hasOwnProperty.call(research, "consumptions"), false);

research = researchApi.applyResearchTransition(research, {
  commandId: "research-plan", to: "sample_planned", at: 12, payload: { samplePlan: { sampleType: "ear_swab" } }
}).order;
const collected = researchApi.applyResearchTransition(research, {
  commandId: "research-collect",
  to: "sample_collected",
  at: 13,
  payload: {
    sampleCollection: { collectedBy: "doctor-1" },
    sampleConsumptions: [{ capabilityId: "cytology_consumables", quantity: 1 }]
  }
});
research = collected.order;
assert.deepEqual(collected.effects, [{
  type: "consume",
  stage: "sample_collected",
  items: [{ capabilityId: "cytology_consumables", quantity: 1 }]
}]);

const dispatched = researchApi.applyResearchTransition(research, {
  commandId: "research-dispatch",
  to: "sent_or_queued",
  at: 14,
  payload: {
    dispatch: { route: "microscope" },
    charge: { amount: 320, currency: "V" },
    queueTaskId: "DT-000001",
    asyncEventIds: ["EV-000001"]
  }
});
research = dispatched.order;
assert.deepEqual(dispatched.effects, [{ type: "charge", stage: "sent_or_queued", charge: { amount: 320, currency: "V" } }]);
research = researchApi.applyResearchTransition(research, {
  commandId: "research-processing", to: "processing", at: 15, payload: { processing: { deviceTaskId: "DT-000001" } }
}).order;
assert.equal(Object.prototype.hasOwnProperty.call(research, "authoredResult"), false);
research = researchApi.applyResearchTransition(research, {
  commandId: "research-result", to: "resulted", at: 45,
  payload: { authoredResult: { summary: "authored fixture result", source: "test fixture" } }
}).order;
research = researchApi.applyResearchTransition(research, {
  commandId: "research-review", to: "reviewed_by_doctor", at: 46,
  payload: { review: { reviewerId: "doctor-1", reviewedAt: 46 } }
}).order;
research = researchApi.applyResearchTransition(research, {
  commandId: "research-communicate", to: "communicated_to_owner", at: 47,
  payload: { communication: { channel: "in_person", communicatedAt: 47 } }
}).order;
research = researchApi.applyResearchTransition(research, {
  commandId: "research-close", to: "follow_up_closed", at: 48, payload: { closure: { closedBy: "doctor-1" } }
}).order;
assert.equal(researchApi.validateResearchOrder(research).valid, true);
assert.equal(research.status, "follow_up_closed");
const duplicateResearch = researchApi.applyResearchTransition(research, {
  commandId: "research-close", to: "follow_up_closed", at: 48
});
assert.equal(duplicateResearch.idempotent, true);
assert.deepEqual(duplicateResearch.order, research);
assert.throws(() => researchApi.applyResearchTransition(research, {
  commandId: "research-reverse", to: "processing", at: 49
}), /Invalid research transition/);

let refusedResearch = researchApi.createResearchOrder({
  id: "RO-000002", caseId: "case-2", patientId: "patient-2", researchId: "cbc",
  route: "external", sampleRequired: true, createdAt: 20
});
assert.throws(() => researchApi.applyResearchTransition(refusedResearch, {
  commandId: "bad-refusal", to: "owner_refused", at: 21,
  payload: { charge: { amount: 1, currency: "V" } }
}), /not allowed/);
refusedResearch = researchApi.applyResearchTransition(refusedResearch, {
  commandId: "valid-refusal", to: "owner_refused", at: 21,
  payload: { ownerDecision: { reasonCode: "declined" } }
}).order;
for (const field of ["authoredResult", "charges", "consumptions", "queueTaskId", "asyncEventIds"]) {
  assert.equal(Object.prototype.hasOwnProperty.call(refusedResearch, field), false);
}
assert.equal(researchApi.validateResearchOrder(refusedResearch).valid, true);
const reoffered = researchApi.createSupersedingResearchOrder(refusedResearch, {
  id: "RO-000003", caseId: "case-2", patientId: "patient-2", researchId: "cbc",
  route: "external", sampleRequired: true, createdAt: 30
});
assert.equal(reoffered.supersedesOrderId, "RO-000002");

let referral = referralApi.createReferralOrder({
  id: "RF-000001", caseId: "case-3", patientId: "patient-3", reason: "explicit authored reason",
  urgency: "authored urgency", routeCapabilityId: "safe_referral", createdAt: 50
});
assert.equal(Object.prototype.hasOwnProperty.call(referral, "destination"), false);
referral = referralApi.applyReferralTransition(referral, {
  commandId: "referral-accept", to: "owner_accepted", at: 51, payload: { ownerDecision: { accepted: true } }
}).order;
referral = referralApi.applyReferralTransition(referral, {
  commandId: "referral-send", to: "sent", at: 52,
  payload: { transmission: { sentBy: "doctor-1" }, destination: "authored-destination", asyncEventIds: ["EV-000002"] }
}).order;
referral = referralApi.applyReferralTransition(referral, {
  commandId: "referral-response", to: "response_received", at: 100,
  payload: { response: { summary: "authored response" }, outcome: { followUp: "authored outcome" } }
}).order;
referral = referralApi.applyReferralTransition(referral, {
  commandId: "referral-review", to: "reviewed", at: 101,
  payload: { review: { reviewerId: "doctor-1" } }
}).order;
referral = referralApi.applyReferralTransition(referral, {
  commandId: "referral-communicate", to: "communicated", at: 102,
  payload: { communication: { channel: "phone" } }
}).order;
referral = referralApi.applyReferralTransition(referral, {
  commandId: "referral-close", to: "closed", at: 103, payload: {}
}).order;
assert.equal(referralApi.validateReferralOrder(referral).valid, true);
assert.equal(referral.status, "closed");

let refusedReferral = referralApi.createReferralOrder({
  id: "RF-000002", caseId: "case-4", patientId: "patient-4", reason: "authored reason",
  urgency: "authored urgency", routeCapabilityId: "safe_referral", createdAt: 60
});
assert.throws(() => referralApi.applyReferralTransition(refusedReferral, {
  commandId: "bad-referral-refusal", to: "owner_refused", at: 61, payload: { response: "invented" }
}), /not allowed/);
refusedReferral = referralApi.applyReferralTransition(refusedReferral, {
  commandId: "referral-refusal", to: "owner_refused", at: 61,
  payload: { ownerDecision: { reasonCode: "declined" } }
}).order;
assert.equal(Object.prototype.hasOwnProperty.call(refusedReferral, "response"), false);
assert.equal(Object.prototype.hasOwnProperty.call(refusedReferral, "outcome"), false);
assert.equal(referralApi.validateReferralOrder(refusedReferral).valid, true);

assert.equal(eventApi.toCampaignMinute(2, 15.9), 1455);
assert.deepEqual(eventApi.fromCampaignMinute(1455), { day: 2, minute: 15 });
assert.deepEqual(eventApi.turnaroundWindow(100, [1, 4]), { earliestAt: 1540, latestAt: 5860 });
assert.equal(Object.keys(eventApi.turnaroundWindow(100, [1, 4])).includes("dueAt"), false);
const lateEvent = eventApi.createAsyncEvent({
  id: "EV-000001", kind: "research_window_open", createdAt: 10, dueAt: 200,
  priority: 20, overduePolicy: "explicit-test-policy", sourceType: "research_order", sourceId: "RO-000001"
});
const earlyEvent = eventApi.createAsyncEvent({
  id: "EV-000002", kind: "referral_response_due", createdAt: 10, dueAt: 100,
  priority: 10, overduePolicy: "explicit-test-policy", sourceType: "referral_order", sourceId: "RF-000001"
});
let events = eventApi.enqueueAsyncEvent([], lateEvent);
events = eventApi.enqueueAsyncEvent(events, earlyEvent);
assert.deepEqual(events.map((event) => event.id), ["EV-000002", "EV-000001"]);
assert.deepEqual(eventApi.dueEvents(events, 150).map((event) => event.id), ["EV-000002"]);
const handled = eventApi.markAsyncEventHandled(events[0], { commandId: "handle-event", at: 150, record: { handledBy: "doctor-1" } });
assert.equal(handled.event.status, "handled");
assert.equal(eventApi.markAsyncEventHandled(handled.event, { commandId: "handle-event", at: 150 }).idempotent, true);

let queues = queueApi.createDeviceQueueState([{ resourceId: "microscope", capacityPerDay: 6 }]);
for (let sequence = 1; sequence <= 7; sequence += 1) {
  queues = queueApi.enqueueDeviceTask(queues, {
    id: queueApi.formatDeviceTaskId(sequence),
    resourceId: "microscope",
    orderType: "research_order",
    orderId: researchApi.formatResearchOrderId(sequence),
    queuedAt: 10 + sequence,
    authoredDurationMinutes: 30
  }).state;
}
for (let sequence = 1; sequence <= 6; sequence += 1) {
  const started = queueApi.startNextDeviceTask(queues, {
    commandId: `start-${sequence}`, resourceId: "microscope", day: 1, startedAt: 100 + sequence
  });
  assert.equal(started.reasonCode, "started");
  assert.equal(started.task.dueAt, 130 + sequence);
  queues = started.state;
}
const capacityBlocked = queueApi.startNextDeviceTask(queues, {
  commandId: "start-seven-day-one", resourceId: "microscope", day: 1, startedAt: 110
});
assert.equal(capacityBlocked.reasonCode, "daily_capacity_reached");
assert.equal(queueApi.listDeviceTasks(queues, { status: "queued" }).length, 1);
assert.throws(() => queueApi.completeDeviceTask(queues, {
  commandId: "complete-too-soon", taskId: "DT-000001", at: 130
}), /before dueAt/);
queues = queueApi.completeDeviceTask(queues, {
  commandId: "complete-one", taskId: "DT-000001", at: 131
}).state;
assert.equal(queueApi.listDeviceTasks(queues, { status: "completed" }).length, 1);
const reloadedQueues = JSON.parse(JSON.stringify(queues));
const nextDay = queueApi.startNextDeviceTask(reloadedQueues, {
  commandId: "start-seven-day-two", resourceId: "microscope", day: 2, startedAt: 1450
});
assert.equal(nextDay.reasonCode, "started");
assert.equal(nextDay.task.id, "DT-000007");
assert.equal(nextDay.task.dueAt, 1480);
assert.equal(queueApi.validateDeviceQueueState(nextDay.state).valid, true);
assert.equal(Object.prototype.hasOwnProperty.call(nextDay.task, "result"), false);

for (const value of [research, refusedResearch, referral, refusedReferral, events, nextDay.state]) {
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value);
}
assert.equal(globalThis.PET_CLINIC_RESEARCH_ORDERS_V3, researchApi);
assert.equal(globalThis.PET_CLINIC_REFERRAL_ORDERS_V3, referralApi);
assert.equal(globalThis.PET_CLINIC_ASYNC_EVENTS_V3, eventApi);
assert.equal(globalThis.PET_CLINIC_DEVICE_QUEUE_V3, queueApi);

console.log("research-referral-v3: ok (lifecycles, refusal invariants, async clock, device capacity)");
