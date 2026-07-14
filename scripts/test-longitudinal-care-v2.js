"use strict";

const assert = require("node:assert/strict");
const careApi = require("../systems/longitudinal-care-v2.js");
const fungalOtitis = require("../tier-01-v2/content/clinical/tier-01/ear/fungal-otitis.json");

const ownerState = {
  attentiveness: 54,
  responsibility: 61,
  trust: 70,
  comprehension: 66,
  budgetLimited: false
};
const patient = { animal: "Бакс", species: "dog", owner: "Зайцева" };
const plan = {
  id: "approved_course_plan",
  longitudinalCare: {
    setting: "scheduled_course",
    durationDays: 3,
    homeActionIds: ["daily_home_care"],
    clinicActionIds: ["course_procedure"],
    clinicVisitSchedule: {
      offsetDays: [1, 2, 3],
      scheduledTime: 660,
      reason: "course_visit"
    },
    followUpOptions: [{ id: "course_day", offsetDays: 1, reason: "course_visit", required: true }],
    completionCriterionIds: ["course_completed"],
    earlyReturnSignIds: ["worsening"]
  }
};

function create(seed, overrides = {}) {
  return careApi.createCourse({
    seed,
    sourceVisitId: "V2-PRIMARY",
    startDay: 2,
    caseId: "TECHNICAL_CASE",
    patient,
    owner: { name: patient.owner, profileId: "calm" },
    ownerState,
    ownerUnderstood: true,
    planAccepted: true,
    controlConsent: true,
    plan,
    ...overrides
  });
}

assert.notEqual(careApi.reasonLabel("planned_recheck"), careApi.reasonLabel("deterioration"));
assert.notEqual(careApi.reasonLabel("complication"), careApi.reasonLabel("planned_recheck"));
assert.equal(careApi.appointmentPriority("course_visit") < careApi.appointmentPriority("planned_recheck"), true);
assert.equal(careApi.appointmentPriority("planned_recheck") < careApi.appointmentPriority("rescheduled_visit"), true);

const accepted = create("longitudinal-stable-seed");
assert.equal(accepted.appointments.length, 3);
assert.equal(new Set(accepted.appointments.map((item) => item.appointmentId)).size, 3);
assert.deepEqual(new Set(accepted.appointments.map((item) => item.treatmentCourseId)), new Set([accepted.treatmentCourseId]));
assert.equal(accepted.appointments.every((item) => ["confirmed", "rescheduled"].includes(item.status)), true);
assert.equal(accepted.planAccepted, true);
assert.equal(accepted.controlConsent, true);

const refused = create("longitudinal-stable-seed", { planAccepted: false, controlConsent: false });
assert.equal(refused.planAccepted, false);
assert.equal(refused.controlConsent, false);
assert.equal(refused.appointments.every((item) => item.status === "declined"), true);

const selectablePlan = {
  id: "selectable_recheck",
  longitudinalCare: {
    setting: "home_care",
    durationDays: 10,
    homeActionIds: [],
    clinicActionIds: [],
    conditionalClinicActionIds: [],
    followUpOptions: [
      { id: "earlier", offsetDays: 7, reason: "planned_recheck", default: true },
      { id: "later", offsetDays: 10, reason: "planned_recheck" }
    ]
  }
};
const selectedDate = create("selected-follow-up", { plan: selectablePlan, selectedFollowUpOptionId: "later" });
assert.equal(selectedDate.appointments[0].scheduledDay, 12);
assert.equal(selectedDate.selectedFollowUpOptionId, "later");

for (const otitisPlan of fungalOtitis.planOptions) {
  assert.deepEqual(otitisPlan.longitudinalCare.conditionalClinicActionIds, ["repeat_microscopy_if_indicated"]);
  assert.equal(otitisPlan.longitudinalCare.clinicActionIds.includes("repeat_microscopy_if_indicated"), false,
    "conditional repeat microscopy became mandatory because of a recheck");
}

const restored = create("longitudinal-stable-seed");
assert.deepEqual(restored, accepted, "seeded course changed after a simulated reload");
const reminded = careApi.applyReminder(accepted.appointments[0], {
  seed: "longitudinal-stable-seed",
  ownerState,
  day: 2,
  type: "manual_call"
});
const remindedAfterReload = careApi.applyReminder(restored.appointments[0], {
  seed: "longitudinal-stable-seed",
  ownerState,
  day: 2,
  type: "manual_call"
});
assert.deepEqual(remindedAfterReload, reminded);
assert.equal(reminded.reminderHistory.length, 1);

let rescheduled = null;
let noShow = null;
for (let index = 0; index < 1000 && (!rescheduled || !noShow); index += 1) {
  const candidate = create(`attendance-branch-${index}`);
  if (!rescheduled && candidate.appointments.some((item) => item.reason === "rescheduled_visit")) rescheduled = candidate;
  if (!noShow && candidate.appointments.some((item) => item.attendanceDecision === "no_show")) noShow = candidate;
}
assert.ok(rescheduled, "seeded reschedule branch was not reachable");
const moved = rescheduled.appointments.find((item) => item.reason === "rescheduled_visit");
assert.equal(moved.rescheduleHistory.length, 1);
assert.equal(moved.rescheduleHistory[0].toDay, moved.rescheduleHistory[0].fromDay + 1);
assert.ok(noShow, "seeded no-show branch was not reachable");
const missed = careApi.resolveAttendance(noShow.appointments.find((item) => item.attendanceDecision === "no_show"));
assert.equal(missed.status, "no_show");
assert.equal(missed.attendanceState, "missed");
assert.ok(missed.noShowReason);

assert.deepEqual(careApi.longitudinalState("complete", 3), { state: "improving", reason: "planned_recheck" });
assert.deepEqual(careApi.longitudinalState("partial", 3), { state: "partial_improvement", reason: "planned_recheck" });
assert.deepEqual(careApi.longitudinalState("stopped_early", 3), { state: "relapse", reason: "relapse" });
assert.deepEqual(careApi.longitudinalState("complete", 3, { complication: true }), { state: "complication", reason: "complication" });

const report = careApi.attendanceReport([missed], missed.scheduledDay);
assert.equal(report.scheduled, 1);
assert.equal(report.noShow, 1);

console.log(JSON.stringify({
  status: "passed",
  distinctVisitReasons: Object.keys(careApi.VISIT_REASONS).length,
  appointmentIdsStable: true,
  consentSeparatedFromAdherence: true,
  approvedFollowUpDateSelectable: true,
  conditionalTestRemainsOptional: true,
  seededAttendanceStable: true,
  reminderStableAfterReload: true,
  rescheduleHistory: true,
  noShowPreserved: true
}, null, 2));
