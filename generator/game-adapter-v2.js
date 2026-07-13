(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_GAME_ADAPTER_V2 = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const goalLabels = {
    finish_guided_visit: "Завершить первый прием по всем этапам",
    complete_two_full_visits: "Провести два полных приема",
    include_control_in_discharge: "Указать контроль при выписке",
    discover_one_hidden_noncritical_fact: "Выяснить скрытую деталь анамнеза",
    discuss_budget_before_tests: "Обсудить бюджет до исследований",
    complete_real_followup_if_present: "Завершить повторный прием",
    check_owner_understanding_twice: "Дважды проверить понимание владельца",
    separate_owner_theory_from_observation: "Отделить версию владельца от фактов",
    identify_misnamed_symptom: "Уточнить бытовое название симптома",
    warn_one_waiting_owner_about_delay: "Предупредить владельца о задержке",
    finish_real_followup_if_present: "Завершить повторный прием",
    triage_urgent_within_10_game_minutes: "Определить срочность за 10 игровых минут",
    explain_priority_to_waiting_clients: "Объяснить изменение очереди",
    refer_without_unnecessary_delay: "Не задерживать необходимое направление",
    leave_no_critical_result_unreviewed: "Проверить все критические результаты",
    discover_home_action_nonjudgmentally: "Выяснить домашние действия без осуждения",
    avoid_blame_response: "Не обвинять владельца",
    identify_home_action_that_is_distractor: "Отделить домашнее действие от причины",
    document_exact_product_when_relevant: "Уточнить примененный препарат",
    refuse_one_unsafe_demand_safely: "Безопасно отказать в опасном требовании",
    offer_minimum_safe_budget_plan: "Предложить минимально безопасный план",
    resolve_conflict_without_false_guarantee: "Разрешить конфликт без ложной гарантии",
    delegate_one_waiting_room_conversation: "Объяснить задержку в зоне ожидания",
    close_all_critical_cases: "Закрыть все критические случаи",
    finish_two_followups: "Завершить два повторных приема",
    end_shift_without_unreviewed_urgent_tasks: "Не оставить срочные задачи без решения",
    maintain_team_fatigue_below_critical: "Не довести усталость врача до критической"
  };
  const goalTargets = {
    complete_two_full_visits: 2,
    check_owner_understanding_twice: 2,
    finish_two_followups: 2
  };
  const bookingReasonByFamily = {
    ear: "Проблема с ухом",
    skin: "Зуд или изменение кожи",
    gastrointestinal: "Проблема с пищеварением",
    urinary: "Проблема с мочеиспусканием",
    eyes: "Проблема с глазом",
    respiratory: "Кашель или выделения",
    trauma: "Травма или хромота",
    perianal: "Дискомфорт под хвостом"
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function ownerProfileForVisit(visit) {
    const traits = visit.owner.profile.traits;
    const preferences = {
      budget_limited: "budgetPlan",
      anxious: "empathetic",
      demanding: "strict"
    };
    return {
      id: visit.owner.profileId,
      label: visit.owner.profile.label,
      budget: visit.owner.profileId === "budget_limited" ? 520 : 820,
      trust: traits.trust,
      anxiety: traits.anxiety,
      visitLimit: Math.max(18, Math.round(22 + traits.patience * 0.18)),
      prefers: preferences[visit.owner.profileId] || "evidence",
      reliability: traits.adherence / 100
    };
  }

  function answerForQuestion(question, visit) {
    const selected = visit.historyAnswerSelections?.find((item) => item.questionId === question.id);
    if (selected) {
      const candidates = [
        ...(question.answers || []),
        ...(visit.owner.homeAction?.ownerLines || [])
      ];
      const answer = candidates.find((item) => item.id === selected.answerId);
      if (answer) return answer;
      if (Object.prototype.hasOwnProperty.call(selected, "textFallback")) {
        return { id: null, text: selected.textFallback, source: selected.source || "persisted_text_fallback" };
      }
    }
    if (question.allowsHiddenHomeTreatment && visit.owner.homeAction) {
      const line = visit.owner.homeAction.ownerLines[0];
      return { id: line.id, text: line.text, source: line.source };
    }
    return question.answers.find((answer) => answer.ownerTags.includes(visit.owner.profileId))
      || question.answers[0];
  }

  function diseaseForVisit(visit) {
    const caseData = visit.medicalContent;
    const general = caseData.generalExam.findings.map((item) => item.text);
    const target = caseData.targetExam.findings.map((item) => item.text);
    const test = caseData.diagnosticTests[0] || null;
    return {
      name: caseData.preliminaryDiagnosisLabel,
      short: visit.complaint.text,
      species: caseData.species.slice(),
      baseFee: caseData.severity === "emergency" ? 180 : caseData.severity === "urgent" ? 160 : 120,
      complaints: [visit.complaint.text],
      makeFlags() { return {}; },
      anamnesis(patient) {
        return caseData.historyQuestions.map((question) => {
          const answer = answerForQuestion(question, patient.v2Visit);
          return { id: question.id, label: question.buttonText, answer: answer.text, source: answer.source };
        });
      },
      temperature() { return general[1] || general[0]; },
      mucous() { return general.filter((item, index) => index !== 1).join(" "); },
      local: { target: target.join(" ") },
      microscopy() { return test ? test.text : caseData.targetExam.findings.map((item) => item.text).join(" "); },
      evaluate(patient, treatmentId) {
        const index = caseData.planOptions.findIndex((plan) => plan.id === treatmentId);
        if (index === 0) return { quality: "correct", returnRisk: 0.04, note: caseData.ownerExplanation.plan };
        const plan = caseData.planOptions[index];
        if (plan && plan.disabledWhenRedFlags) return { quality: "wrong", returnRisk: 0.3, note: plan.label };
        return { quality: "partial", returnRisk: 0.14, note: plan?.label || caseData.ownerExplanation.uncertain };
      }
    };
  }

  function patientFromVisit(visit) {
    return {
      arrivalMinute: visit.arrivalMinute,
      source: visit.source === "unplanned" ? "walkIn" : visit.source,
      bookingLabel: visit.bookingReason || bookingReasonByFamily[visit.family] || "Причина обращения",
      diseaseId: visit.caseId,
      profileId: visit.owner.profileId,
      ownerProfile: ownerProfileForVisit(visit),
      animal: visit.patient.animal,
      owner: visit.owner.name,
      species: visit.patient.species,
      sex: visit.patient.sex === "male" ? "самец" : "самка",
      ageYears: visit.patient.ageYears,
      returnVisit: visit.returnVisit,
      urgency: visit.urgency === "urgent" ? "urgent" : "routine",
      eventLabel: visit.source === "unplanned" ? "Незапланированный пациент" : "",
      complaints: [visit.complaint.text],
      v2Visit: clone(visit)
    };
  }

  function goalsForDay(catalog, dayNumber) {
    const definition = catalog.dayGoals.goalsByDay.find((item) => item.day === dayNumber);
    if (!definition) return [];
    const ids = [...definition.required, ...definition.candidates.slice(0, 1)];
    return ids.map((id) => ({ id, label: goalLabels[id] || id, target: goalTargets[id] || 1 }));
  }

  function planFromDay(day, catalog) {
    return {
      day: day.day,
      chapterDay: day.day,
      title: day.title,
      briefing: "В расписании показаны пациенты, записанные заранее. Обращения без записи могут появиться в течение дня.",
      endMinute: Number(day.end.split(":")[0]) * 60 + Number(day.end.split(":")[1]),
      maxWaiting: Math.min(4, Math.max(1, Math.ceil(day.plannedVisitCount / 2))),
      loadLabel: `${day.plannedVisitCount} визитов`,
      goals: goalsForDay(catalog, day.day),
      patients: day.visits.map(patientFromVisit),
      unplannedRange: clone(day.unplannedRange),
      generatorFingerprint: day.fingerprint
    };
  }

  function diagnosisOptionsFor(patient, catalog) {
    const caseData = patient.v2Visit.medicalContent;
    const primary = caseData.preliminaryDiagnosisOptions.map((option) => ({
      id: option.isCorrectForTemplate ? caseData.id : option.id,
      label: option.label,
      note: option.feedback,
      unsafe: option.isUnsafeChoice
    }));
    return primary;
  }

  function treatmentOptionsFor(patient) {
    return patient.v2Visit.medicalContent.planOptions.map((plan, index) => ({
      id: plan.id,
      label: plan.label,
      fee: 110 + plan.steps.length * 20,
      note: `${plan.steps.join(" ")} ${plan.followUp?.text || ""}`.trim(),
      quality: index === 0 ? "correct" : plan.disabledWhenRedFlags ? "wrong" : "partial"
    }));
  }

  function targetExamOptionFor(patient) {
    const targetExam = patient.v2Visit.medicalContent.targetExam;
    return { id: "target", label: targetExam.label, time: 4 };
  }

  function sampleResultFor(patient) {
    return patient.v2Visit.medicalContent.sampleActions[0]?.result?.text || null;
  }

  function diagnosticTestFor(patient) {
    return patient.v2Visit.medicalContent.diagnosticTests[0] || null;
  }

  return {
    ownerProfileForVisit,
    diseaseForVisit,
    patientFromVisit,
    planFromDay,
    diagnosisOptionsFor,
    treatmentOptionsFor,
    targetExamOptionFor,
    sampleResultFor,
    diagnosticTestFor
  };
});
