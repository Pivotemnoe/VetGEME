"use strict";

const path = require("node:path");
const loader = require("../generator/content-loader-v2.js");
const generatorApi = require("../generator/generator-v2.js");

async function generatorWithOpenedDayOne(catalog, seed) {
  const generator = generatorApi.createGenerator({
    catalog,
    seed,
    storage: generatorApi.createMemoryStorage()
  });
  return { generator, day: generator.openDay(1) };
}

async function main() {
  const catalog = await loader.loadFromDirectory(path.resolve(__dirname, "../tier-01-v2/content"));
  const scenarios = [
    { id: "zero-completed-visits", outcome: () => [] },
    { id: "all-patients-left", outcome: (day) => day.visits.map((visit) => ({ visitId: visit.visitId, completed: false })) },
    { id: "no-follow-up-scheduled", outcome: (day) => [{ visitId: day.visits[0].visitId, completed: true }] },
    { id: "referral-without-local-follow-up", outcome: (day) => [{ visitId: day.visits[0].visitId, completed: true, followUpRequested: true, referred: true }] },
    { id: "owner-declined-follow-up", outcome: (day) => [{ visitId: day.visits[0].visitId, completed: true, followUpRequested: true, ownerDeclinedFollowUp: true }] }
  ];
  for (const scenario of scenarios) {
    const { generator, day } = await generatorWithOpenedDayOne(catalog, scenario.id);
    generator.closeDay(1, scenario.outcome(day));
    if (generator.metadata(1).pendingFollowUps !== 0) throw new Error(`${scenario.id}: created an invalid follow-up`);
    const dayTwo = generator.openDay(2);
    generator.closeDay(2, []);
    const dayThree = generator.getOrGenerateDay(3);
    if (dayThree.visits.length + dayThree.pendingUnplanned !== dayThree.plannedVisitCount) throw new Error(`${scenario.id}: fallback reduced day load`);
    if (dayThree.followUpFallbackCount < 1) throw new Error(`${scenario.id}: missing follow-up was not recorded as a booked fallback`);
  }

  const deterioration = await generatorWithOpenedDayOne(catalog, "deterioration-follow-up");
  deterioration.generator.closeDay(1, [{
    visitId: deterioration.day.visits[0].visitId,
    completed: true,
    deteriorated: true,
    followUpAfterDays: 1
  }]);
  if (deterioration.generator.metadata(1).pendingFollowUps !== 1) throw new Error("deterioration did not create a follow-up");

  const single = await generatorWithOpenedDayOne(catalog, "one-follow-up-only");
  const original = single.day.visits[0];
  single.generator.closeDay(1, [{ visitId: original.visitId, completed: true, followUpRequested: true, followUpAfterDays: 1 }]);
  const dayTwo = single.generator.openDay(2);
  single.generator.closeDay(2, []);
  const dayThree = single.generator.openDay(3);
  const related = [...dayTwo.visits, ...dayThree.visits].filter((visit) => visit.originalVisitId === original.visitId);
  if (related.length !== 1) throw new Error(`one follow-up was inserted ${related.length} times`);
  if (related[0].patient.animal !== original.patient.animal || related[0].owner.name !== original.owner.name) {
    throw new Error("follow-up changed patient or owner identity");
  }

  const scheduled = await generatorWithOpenedDayOne(catalog, "explicit-appointment-priority");
  const procedureSource = scheduled.day.visits[0];
  const recheckSource = scheduled.day.visits[1];
  scheduled.generator.closeDay(1, [
    {
      visitId: procedureSource.visitId,
      completed: true,
      appointments: [{
        appointmentId: "AP-COURSE-1",
        treatmentCourseId: "TC-COURSE",
        scheduledDay: 2,
        scheduledTime: 660,
        reason: "course_visit",
        status: "confirmed",
        attendanceDecision: "attended",
        adherenceState: "complete",
        longitudinalState: { state: "improving", reason: "planned_recheck" }
      }]
    },
    {
      visitId: recheckSource.visitId,
      completed: true,
      appointments: [{
        appointmentId: "AP-RECHECK-1",
        treatmentCourseId: "TC-RECHECK",
        scheduledDay: 2,
        scheduledTime: 720,
        reason: "planned_recheck",
        status: "confirmed",
        attendanceDecision: "attended",
        adherenceState: "partial",
        longitudinalState: { state: "partial_improvement", reason: "planned_recheck" }
      }]
    }
  ]);
  scheduled.generator.updatePendingAppointment("AP-COURSE-1", { attendanceDecision: "late" });
  const scheduledDayTwo = scheduled.generator.openDay(2);
  const insertedProcedure = scheduledDayTwo.visits.find((visit) => visit.appointmentId === "AP-COURSE-1");
  if (!insertedProcedure) throw new Error("course visit did not receive schedule priority");
  if (scheduledDayTwo.visits.some((visit) => visit.appointmentId === "AP-RECHECK-1")) {
    throw new Error("planned recheck displaced the higher-priority course visit");
  }
  if (insertedProcedure.treatmentCourseId !== "TC-COURSE" || insertedProcedure.appointmentReason !== "course_visit") {
    throw new Error("appointment/course identity was not preserved");
  }
  if (insertedProcedure.attendanceDecision !== "late") throw new Error("appointment reminder decision was not persisted in the generator");
  if (insertedProcedure.patient.animal !== procedureSource.patient.animal || insertedProcedure.owner.name !== procedureSource.owner.name) {
    throw new Error("scheduled visit changed patient or owner identity");
  }
  scheduled.generator.closeDay(2, []);
  const scheduledDayThree = scheduled.generator.openDay(3);
  if (!scheduledDayThree.visits.some((visit) => visit.appointmentId === "AP-RECHECK-1")) {
    throw new Error("deferred planned recheck was lost");
  }

  console.log(JSON.stringify({
    status: "passed",
    negativeScenarios: scenarios.map((item) => item.id),
    deteriorationFollowUp: true,
    duplicateProtection: true,
    identityPreserved: true,
    explicitAppointmentPriority: true,
    deferredAppointmentPreserved: true
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
