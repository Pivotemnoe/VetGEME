(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_CLINICAL_DECISIONS_V2 = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const COMMUNICATION_OPTIONS = Object.freeze([
    Object.freeze({
      id: "calmDetailed",
      label: "Спокойно и подробно",
      communicationGoal: "separate_known_unknown_and_next_steps",
      recommendedOwnerTraits: ["anxious", "low_comprehension"],
      riskyOwnerTraits: ["impatient", "irritated"],
      timeCost: 6,
      comprehensionEffect: 18,
      trustEffect: 4,
      anxietyEffect: -10,
      irritationEffect: 3,
      adherenceEffect: 10,
      risk: "time_pressure"
    }),
    Object.freeze({
      id: "riskFocus",
      label: "Сначала объяснить риски",
      communicationGoal: "correct_underestimation_of_urgency",
      recommendedOwnerTraits: ["underestimates_risk", "low_medical_literacy"],
      riskyOwnerTraits: ["high_anxiety"],
      timeCost: 4,
      comprehensionEffect: 12,
      trustEffect: 2,
      anxietyEffect: 6,
      irritationEffect: 0,
      adherenceEffect: 8,
      risk: "anxiety_escalation"
    }),
    Object.freeze({
      id: "budgetPlan",
      label: "Обсудить варианты и стоимость",
      communicationGoal: "agree_affordable_safe_plan",
      recommendedOwnerTraits: ["budget_limited", "budget_unknown"],
      riskyOwnerTraits: ["urgent_without_delay"],
      timeCost: 5,
      comprehensionEffect: 10,
      trustEffect: 6,
      anxietyEffect: -2,
      irritationEffect: -2,
      adherenceEffect: 12,
      risk: "critical_action_delay"
    }),
    Object.freeze({
      id: "strict",
      label: "Коротко и конкретно",
      communicationGoal: "give_memorable_short_instructions",
      recommendedOwnerTraits: ["irritated", "impatient"],
      riskyOwnerTraits: ["complex_plan", "low_comprehension"],
      timeCost: 3,
      comprehensionEffect: 6,
      trustEffect: 1,
      anxietyEffect: 0,
      irritationEffect: -8,
      adherenceEffect: 4,
      risk: "partial_understanding"
    })
  ]);

  const REACTION_TEXT = Object.freeze({
    understood: "Владелец понял объяснение.",
    partially_understood: "Владелец понял объяснение частично.",
    questions_remain: "У владельца остались вопросы.",
    calmed_down: "Владелец заметно успокоился.",
    more_anxious: "Владелец встревожился сильнее.",
    irritated: "Владелец раздражён выбранным способом объяснения.",
    requests_cheaper_option: "Владелец просит обсудить более доступный вариант."
  });
  const OWNER_DECISION_TEXT = Object.freeze({
    accepted: "владелец согласился",
    declined: "владелец отказался",
    partially_accepted: "владелец отказался от части назначений",
    requests_cheaper_option: "владелец просит более доступный вариант",
    requests_repeat_explanation: "владелец просит повторить объяснение",
    delayed: "владелец отложил решение",
    accepted_partial_understanding: "владелец согласился, но понял инструкции частично"
  });

  function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function observableOwnerSigns(ownerState = {}) {
    const signs = [];
    if (ownerState.anxiety >= 60) signs.push("Владелец заметно тревожится.");
    if (ownerState.irritation >= 55) signs.push("Владелец раздражён или торопится.");
    if (ownerState.underestimatesRisk) signs.push("Владелец недооценивает опасность состояния.");
    if (!ownerState.budgetDiscussed) signs.push("Бюджет ещё не обсуждался.");
    if ((ownerState.comprehension ?? 50) < 45) signs.push("Владельцу сложно запомнить подробные инструкции.");
    return signs;
  }

  function evaluateCommunication(optionOrId, ownerState = {}, context = {}) {
    const option = typeof optionOrId === "string"
      ? COMMUNICATION_OPTIONS.find((item) => item.id === optionOrId)
      : optionOrId;
    if (!option) throw new Error("Unknown communication option");
    let comprehensionEffect = option.comprehensionEffect;
    let trustEffect = option.trustEffect;
    let anxietyEffect = option.anxietyEffect;
    let irritationEffect = option.irritationEffect;
    let adherenceEffect = option.adherenceEffect;

    if (option.id === "calmDetailed" && ownerState.anxiety >= 60) comprehensionEffect += 5;
    if (option.id === "calmDetailed" && ownerState.irritation >= 60) irritationEffect += 7;
    if (option.id === "riskFocus" && ownerState.underestimatesRisk) comprehensionEffect += 6;
    if (option.id === "riskFocus" && ownerState.anxiety >= 70) anxietyEffect += 5;
    if (option.id === "budgetPlan" && (ownerState.budgetLimited || !ownerState.budgetDiscussed)) trustEffect += 4;
    if (option.id === "strict" && context.complexPlan) comprehensionEffect -= 5;
    if (context.doctorFatigue >= 70) comprehensionEffect -= 3;

    const comprehension = clamp((ownerState.comprehension ?? 45) + comprehensionEffect);
    const anxiety = clamp((ownerState.anxiety ?? 40) + anxietyEffect);
    const irritation = clamp((ownerState.irritation ?? 20) + irritationEffect);
    const trust = clamp((ownerState.trust ?? 50) + trustEffect);
    const adherence = clamp((ownerState.adherence ?? 60) + adherenceEffect);
    let reactionId = comprehension >= 70 ? "understood" : comprehension >= 50 ? "partially_understood" : "questions_remain";
    if (option.id === "budgetPlan" && ownerState.budgetLimited && context.totalCost > (ownerState.budget || 0)) reactionId = "requests_cheaper_option";
    else if (anxietyEffect <= -6) reactionId = "calmed_down";
    else if (anxietyEffect >= 8 && ownerState.anxiety >= 65) reactionId = "more_anxious";
    else if (irritationEffect >= 8) reactionId = "irritated";

    return {
      optionId: option.id,
      communicationGoal: option.communicationGoal,
      timeCost: option.timeCost,
      comprehension,
      trust,
      anxiety,
      irritation,
      adherence,
      comprehensionEffect,
      trustEffect,
      anxietyEffect,
      irritationEffect,
      adherenceEffect,
      risk: option.risk,
      reactionId,
      reactionText: REACTION_TEXT[reactionId],
      observedSigns: observableOwnerSigns(ownerState)
    };
  }

  function prescriptionComponentsFor(plan, diagnosisIds = []) {
    if (!plan) return [];
    if (Array.isArray(plan.components) && plan.components.length) {
      return plan.components.map((component) => ({ ...component }));
    }
    return [{
      id: plan.id,
      title: plan.label,
      type: "approved_plan_bundle",
      coversDiagnosisIds: [...diagnosisIds],
      requiredForSafety: Boolean(plan.disabledWhenRedFlags === false),
      optional: false,
      lowValue: false,
      cost: 110 + (plan.steps || []).length * 20,
      timeCost: 2,
      ownerMayDecline: true,
      approvedTextId: plan.id,
      approvedSteps: [...(plan.steps || [])],
      componentSchemaStatus: "pending_component_authoring"
    }];
  }

  function evaluateOwnerPlanDecision(components, ownerState = {}, context = {}) {
    const totalCost = components.reduce((sum, item) => sum + (item.cost || 0), 0);
    const required = components.filter((item) => item.requiredForSafety);
    let decision = "accepted";
    if (totalCost > (ownerState.budget || Infinity) && ownerState.trust < 60) decision = "requests_cheaper_option";
    else if (ownerState.irritation >= 80 && ownerState.trust < 40) decision = "delayed";
    else if (ownerState.comprehension < 45 || context.communicationReaction === "questions_remain") decision = "accepted_partial_understanding";
    const acceptedComponentIds = decision === "accepted" || decision === "accepted_partial_understanding"
      ? components.map((item) => item.id)
      : required.filter((item) => !item.ownerMayDecline).map((item) => item.id);
    return {
      decision,
      decisionText: OWNER_DECISION_TEXT[decision],
      totalCost,
      acceptedComponentIds,
      declinedComponentIds: components.filter((item) => !acceptedComponentIds.includes(item.id)).map((item) => item.id),
      comprehension: ownerState.comprehension ?? 50
    };
  }

  return {
    COMMUNICATION_OPTIONS,
    REACTION_TEXT,
    OWNER_DECISION_TEXT,
    observableOwnerSigns,
    evaluateCommunication,
    prescriptionComponentsFor,
    evaluateOwnerPlanDecision
  };
});
