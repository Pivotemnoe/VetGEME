(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_LONGITUDINAL_CARE_V2 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VISIT_REASONS = Object.freeze({
    planned_recheck: "Плановый контроль",
    scheduled_procedure: "Повторная процедура",
    course_visit: "Курсовое посещение",
    test_result_review: "Обсуждение результата исследования",
    deterioration: "Ухудшение",
    complication: "Осложнение",
    relapse: "Рецидив",
    owner_concern: "Повторное обращение владельца",
    error_return: "Возврат после пропуска или ошибки",
    rescheduled_visit: "Перенесённый визит"
  });
  const CARE_SETTINGS = Object.freeze(["home_care", "outpatient", "scheduled_course", "inpatient", "referral"]);
  const CARE_SETTING_LABELS = Object.freeze({
    home_care: "дома",
    outpatient: "амбулаторно в клинике",
    scheduled_course: "курсом посещений в клинике",
    inpatient: "в стационаре",
    referral: "по направлению"
  });
  const APPOINTMENT_STATUSES = Object.freeze(["planned", "confirmed", "attended", "late", "cancelled", "rescheduled", "no_show", "declined"]);

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function hashString(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededUnit(seed, key) {
    return hashString(`${seed}:${key}`) / 4294967296;
  }

  function reasonLabel(reason) {
    return VISIT_REASONS[reason] || "Повторное посещение";
  }

  function appointmentPriority(reason) {
    if (["scheduled_procedure", "course_visit"].includes(reason)) return 0;
    if (reason === "planned_recheck") return 1;
    if (reason === "rescheduled_visit") return 2;
    return 3;
  }

  function adherenceFor(options = {}) {
    const owner = options.ownerState || {};
    const care = options.care || {};
    const complexity = clamp((care.homeActionIds?.length || 0) + (care.durationDays || 0) / 5, 0, 8);
    const score = clamp(
      42
      + (owner.attentiveness ?? 50) * 0.22
      + (owner.responsibility ?? owner.adherence ?? 50) * 0.18
      + (owner.trust ?? 50) * 0.16
      + (owner.comprehension ?? 50) * 0.15
      + (owner.explanationQuality ?? owner.comprehension ?? 50) * 0.06
      + (owner.severityConcern ?? 0) * 0.08
      - (owner.subjectiveImprovement ? 8 : 0)
      - complexity * 4
      - (owner.budgetLimited ? 9 : 0),
      8,
      94
    );
    const roll = seededUnit(options.seed, `${options.courseId}:adherence`) * 100;
    const state = roll <= score ? "complete" : roll <= score + 22 ? "partial" : "stopped_early";
    return { state, scoreBand: score >= 75 ? "high" : score >= 50 ? "medium" : "low", rollKey: `${options.courseId}:adherence` };
  }

  function attendanceFor(options = {}) {
    const owner = options.ownerState || {};
    const appointment = options.appointment || {};
    const reminderBonus = appointment.reminderState === "manual_call" ? 18 : appointment.reminderState === "automatic" ? 10 : 0;
    const requiredBonus = appointment.required ? 8 : 0;
    const score = clamp(
      34
      + (owner.attentiveness ?? 50) * 0.2
      + (owner.responsibility ?? owner.adherence ?? 50) * 0.2
      + (owner.trust ?? 50) * 0.14
      + (owner.comprehension ?? 50) * 0.12
      + (owner.explanationQuality ?? owner.comprehension ?? 50) * 0.05
      + (owner.severityConcern ?? 0) * 0.08
      + Math.max(0, Number(owner.anxiety) - 50) * 0.04
      - (owner.subjectiveImprovement ? 6 : 0)
      + requiredBonus
      + reminderBonus
      - (owner.budgetLimited ? 10 : 0),
      5,
      97
    );
    const roll = seededUnit(options.seed, `${appointment.appointmentId}:attendance`) * 100;
    let decision = "attended";
    if (roll > score + 18) decision = "no_show";
    else if (roll > score + 10) decision = "rescheduled";
    else if (roll > score) decision = "late";
    return { decision, scoreBand: score >= 75 ? "high" : score >= 50 ? "medium" : "low", rollKey: `${appointment.appointmentId}:attendance` };
  }

  function longitudinalState(adherenceState, elapsedDays, options = {}) {
    const elapsed = Math.max(0, Number(elapsedDays) || 0);
    if (options.complication) return { state: "complication", reason: "complication" };
    if (options.deteriorated) return { state: "deteriorated", reason: "deterioration" };
    if (adherenceState === "stopped_early") return { state: elapsed >= 2 ? "relapse" : "unchanged", reason: elapsed >= 2 ? "relapse" : "planned_recheck" };
    if (adherenceState === "partial") return { state: "partial_improvement", reason: "planned_recheck" };
    return { state: "improving", reason: "planned_recheck" };
  }

  function appointmentOffsets(care = {}, selectedFollowUpOptionId = null) {
    const explicit = care.clinicVisitSchedule?.offsetDays || [];
    if (explicit.length) return explicit;
    const selected = care.followUpOptions?.find((option) => option.id === selectedFollowUpOptionId)
      || care.followUpOptions?.find((option) => option.default)
      || care.followUpOptions?.[0];
    return selected ? [selected.offsetDays] : [];
  }

  function createCourse(options = {}) {
    const care = clone(options.plan?.longitudinalCare);
    if (!care) return null;
    if (!CARE_SETTINGS.includes(care.setting)) throw new Error(`Unsupported care setting: ${care.setting}`);
    const courseId = `TC-${options.sourceVisitId}-${options.plan.id}`;
    const adherence = adherenceFor({ seed: options.seed, courseId, ownerState: options.ownerState, care });
    const consent = options.controlConsent !== false && options.planAccepted !== false;
    const offsets = appointmentOffsets(care, options.selectedFollowUpOptionId);
    const appointments = offsets.map((offset, index) => {
      const scheduledDay = Number(options.startDay) + Number(offset);
      const appointmentId = `AP-${options.sourceVisitId}-${options.plan.id}-${index + 1}`;
      const followUp = care.followUpOptions?.find((item) => Number(item.offsetDays) === Number(offset));
      const base = {
        appointmentId,
        treatmentCourseId: courseId,
        sourceVisitId: options.sourceVisitId,
        caseId: options.caseId,
        patient: clone(options.patient),
        owner: clone(options.owner),
        scheduledDay,
        scheduledTime: followUp?.scheduledTime || care.clinicVisitSchedule?.scheduledTime || 660,
        reason: followUp?.reason || care.clinicVisitSchedule?.reason || "planned_recheck",
        required: Boolean(followUp?.required ?? care.followUpRequired),
        status: consent ? "confirmed" : "declined",
        reminderState: "none",
        reminderHistory: [],
        attendanceState: "pending",
        adherenceState: adherence.state,
        noShowReason: null,
        rescheduleHistory: []
      };
      const attendance = attendanceFor({ seed: options.seed, appointment: base, ownerState: options.ownerState });
      if (options.startDay === 1) attendance.decision = "attended";
      if (attendance.decision === "rescheduled") {
        base.rescheduleHistory.push({ fromDay: scheduledDay, toDay: scheduledDay + 1, reason: "owner_requested" });
        base.scheduledDay += 1;
        base.reason = "rescheduled_visit";
        base.status = consent ? "rescheduled" : "declined";
        attendance.decision = "attended";
      }
      base.attendanceDecision = attendance.decision;
      base.attendanceScoreBand = attendance.scoreBand;
      return base;
    });
    return {
      treatmentCourseId: courseId,
      sourceVisitId: options.sourceVisitId,
      caseId: options.caseId,
      patientId: `LP-${options.sourceVisitId}`,
      selectedPlanId: options.plan.id,
      setting: care.setting,
      startDay: Number(options.startDay),
      durationDays: Number(care.durationDays) || null,
      homeActionIds: clone(care.homeActionIds || []),
      clinicActionIds: clone(care.clinicActionIds || []),
      conditionalClinicActionIds: clone(care.conditionalClinicActionIds || []),
      completionCriterionIds: clone(care.completionCriterionIds || []),
      earlyReturnSignIds: clone(care.earlyReturnSignIds || []),
      ownerUnderstood: Boolean(options.ownerUnderstood),
      selectedFollowUpOptionId: options.selectedFollowUpOptionId || null,
      planAccepted: options.planAccepted !== false,
      controlConsent: consent,
      adherenceState: adherence.state,
      adherenceScoreBand: adherence.scoreBand,
      status: options.planAccepted === false ? "declined" : "active",
      appointments
    };
  }

  function applyReminder(appointment, options = {}) {
    const updated = clone(appointment);
    if (!updated || !["planned", "confirmed", "rescheduled"].includes(updated.status)) return updated;
    updated.reminderState = options.type || "manual_call";
    updated.reminderHistory = [...(updated.reminderHistory || []), {
      day: Number(options.day),
      type: updated.reminderState,
      minutes: Number(options.minutes) || 5
    }];
    const attendance = attendanceFor({ seed: options.seed, appointment: updated, ownerState: options.ownerState });
    updated.attendanceDecision = attendance.decision === "rescheduled" ? "late" : attendance.decision;
    updated.attendanceScoreBand = attendance.scoreBand;
    return updated;
  }

  function resolveAttendance(appointment) {
    const updated = clone(appointment);
    if (!updated || !["planned", "confirmed", "rescheduled"].includes(updated.status)) return updated;
    if (updated.attendanceDecision === "no_show") {
      updated.status = "no_show";
      updated.attendanceState = "missed";
      updated.noShowReason = updated.adherenceState === "stopped_early" ? "stopped_after_improvement" : "forgot_or_could_not_attend";
    } else if (updated.attendanceDecision === "late") {
      updated.status = "late";
      updated.attendanceState = "arrived_late";
    } else {
      updated.status = "attended";
      updated.attendanceState = "arrived";
    }
    return updated;
  }

  function summarizePlan(plan, course) {
    const care = plan?.longitudinalCare;
    if (!care || !course) return [];
    const next = course.appointments.find((item) => item.status === "confirmed");
    return [
      course.durationDays ? `Лечение: ${course.durationDays} игровых дней.` : "Лечение: длительность определяется выбранным планом.",
      CARE_SETTING_LABELS[course.setting] ? `Где: ${CARE_SETTING_LABELS[course.setting]}.` : null,
      care.homeSummary ? `Дома: ${care.homeSummary}.` : null,
      care.clinicSummary ? `В клинике: ${care.clinicSummary}.` : null,
      next ? `Контроль: день ${next.scheduledDay}.` : course.controlConsent ? "Контроль: дата не выбрана." : "Контроль: владелец не подтвердил запись.",
      care.followUpGoal ? `Цель контроля: ${care.followUpGoal}.` : null,
      care.earlyReturnSummary ? `Обратиться раньше при: ${care.earlyReturnSummary}.` : null
    ].filter(Boolean);
  }

  function attendanceReport(appointments, day) {
    const items = (appointments || []).filter((item) => Number(item.scheduledDay) === Number(day));
    return {
      scheduled: items.length,
      attended: items.filter((item) => item.status === "attended").length,
      late: items.filter((item) => item.status === "late").length,
      cancelled: items.filter((item) => item.status === "cancelled").length,
      rescheduled: items.filter((item) => item.status === "rescheduled" || item.reason === "rescheduled_visit").length,
      noShow: items.filter((item) => item.status === "no_show").length
    };
  }

  return {
    VISIT_REASONS,
    CARE_SETTINGS,
    CARE_SETTING_LABELS,
    APPOINTMENT_STATUSES,
    seededUnit,
    reasonLabel,
    appointmentPriority,
    adherenceFor,
    attendanceFor,
    longitudinalState,
    createCourse,
    applyReminder,
    resolveAttendance,
    summarizePlan,
    attendanceReport
  };
});
