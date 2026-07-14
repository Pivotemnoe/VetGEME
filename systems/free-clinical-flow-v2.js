(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_FREE_CLINICAL_FLOW_V2 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ACTION_GROUPS = Object.freeze({
    general: "generalExamActionIds",
    target: "targetExamActionIds",
    diagnostic: "diagnosticTestIds"
  });

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function uniqueIds(values) {
    return [...new Set((values || []).filter((value) => typeof value === "string" && value.length > 0))];
  }

  function normalizeActionState(patient) {
    if (!patient || typeof patient !== "object") return null;
    const source = patient.clinicalActionState && typeof patient.clinicalActionState === "object"
      ? patient.clinicalActionState
      : {};
    patient.clinicalActionState = {
      generalExamActionIds: uniqueIds(source.generalExamActionIds),
      targetExamActionIds: uniqueIds(source.targetExamActionIds),
      diagnosticTestIds: uniqueIds(source.diagnosticTestIds)
    };
    return patient.clinicalActionState;
  }

  function actionsFor(caseData, group) {
    if (group === "general") return clone(caseData?.generalExam?.actions || []);
    if (group === "target") return clone(caseData?.targetExam?.actions || []);
    if (group === "diagnostic") return clone(caseData?.diagnosticTests || []);
    return [];
  }

  function hasStructuredExams(caseData) {
    return actionsFor(caseData, "general").length > 0 || actionsFor(caseData, "target").length > 0;
  }

  function performedIds(patient, group) {
    const key = ACTION_GROUPS[group];
    const state = normalizeActionState(patient);
    return key && state ? state[key] : [];
  }

  function isPerformed(patient, group, actionId) {
    return performedIds(patient, group).includes(actionId);
  }

  function recordAction(patient, group, actionId) {
    const key = ACTION_GROUPS[group];
    const state = normalizeActionState(patient);
    if (!key || !state || !actionId) return false;
    if (state[key].includes(actionId)) return false;
    state[key].push(actionId);
    return true;
  }

  function actionResult(action, patient = {}) {
    const result = action?.resultsBySpecies?.[patient.species] || action?.result || null;
    if (!result) return null;
    const measurement = result.measurement;
    if (!measurement) return clone(result);
    const value = String(measurement.displayValue ?? measurement.value ?? "").replace(".", ",");
    const unit = measurement.unit || "";
    const interpretation = measurement.interpretation || "Результат получен";
    const reference = measurement.referenceLabel || measurement.reference || "";
    return {
      ...clone(result),
      text: result.text || `${value}${unit ? ` ${unit}` : ""} — ${interpretation}${reference ? `. Референс: ${reference}` : ""}.`
    };
  }

  function completedActions(caseData, patient, group) {
    const completed = new Set(performedIds(patient, group));
    return actionsFor(caseData, group).filter((action) => completed.has(action.id));
  }

  function missingImportantActions(caseData, patient) {
    return ["general", "target"].flatMap((group) => actionsFor(caseData, group)
      .filter((action) => action.importantForSafety && !isPerformed(patient, group, action.id))
      .map((action) => ({ group, id: action.id, label: action.label })));
  }

  function missingImportantQuestions(caseData, patient) {
    return (caseData?.historyQuestions || [])
      .filter((question) => question.required && !patient?.asked?.[question.id])
      .map((question) => ({ group: "history", id: question.id, label: question.buttonText }));
  }

  function measurementPlaceholders(caseData, patient) {
    return actionsFor(caseData, "general")
      .filter((action) => action.measurementKind && !isPerformed(patient, "general", action.id))
      .map((action) => action.measurementKind === "temperature"
        ? `${action.measurementLabel || "Температура"} не измерена.`
        : `${action.measurementLabel || action.label}: не измерено.`);
  }

  function historyQuestion(caseData, questionId) {
    return (caseData?.historyQuestions || []).find((question) => question.id === questionId) || null;
  }

  function collectedFactIds(patient) {
    const caseData = patient?.v2Visit?.medicalContent;
    if (!caseData) return [];
    const facts = new Set();
    Object.keys(patient.asked || {}).forEach((questionId) => {
      const question = historyQuestion(caseData, questionId);
      (question?.revealsFactIds || []).forEach((id) => facts.add(id));
    });
    ["general", "target"].forEach((group) => {
      completedActions(caseData, patient, group).forEach((action) => {
        (action.revealsFactIds || []).forEach((id) => facts.add(id));
      });
    });
    const completedTests = new Set(performedIds(patient, "diagnostic"));
    (caseData.diagnosticTests || []).filter((test) => completedTests.has(test.id)).forEach((test) => {
      (test.revealsFactIds || []).forEach((id) => facts.add(id));
    });
    return [...facts];
  }

  function visibleEvidenceRules(rules, collectedFacts) {
    const facts = new Set(collectedFacts);
    return (rules || []).filter((rule) => (rule.requiresFactIds || []).every((id) => facts.has(id)));
  }

  function decisionEvidence(patient, diagnosisOption) {
    const caseData = patient?.v2Visit?.medicalContent;
    const rules = diagnosisOption?.evidenceRules;
    if (!caseData || !rules) return null;
    const facts = collectedFactIds(patient);
    const supporting = visibleEvidenceRules(rules.supporting, facts).map((rule) => rule.text);
    const contradicting = visibleEvidenceRules(rules.contradicting, facts).map((rule) => rule.text);
    const missingActions = [
      ...missingImportantQuestions(caseData, patient),
      ...missingImportantActions(caseData, patient)
    ].map((item) => item.label);
    const requiredFacts = uniqueIds([
      ...(rules.supporting || []).flatMap((rule) => rule.requiresFactIds || []),
      ...(rules.safety || []).flatMap((rule) => rule.requiresFactIds || [])
    ]);
    const missingFacts = requiredFacts.filter((id) => !facts.includes(id));
    const unknown = (rules.unknown || [])
      .filter((rule) => (rule.requiresMissingFactIds || []).some((id) => missingFacts.includes(id)))
      .map((rule) => rule.text);
    return {
      supporting,
      contradicting,
      unknown,
      missingActions,
      collectedFactIds: facts,
      safe: !diagnosisOption.isUnsafeChoice && missingActions.length === 0
    };
  }

  function migratePatientActionState(patient) {
    if (!patient || typeof patient !== "object") return patient;
    const caseData = patient.v2Visit?.medicalContent;
    const state = normalizeActionState(patient);
    if (!caseData) return patient;
    if (patient.generalExamDone && !state.generalExamActionIds.length) {
      state.generalExamActionIds = actionsFor(caseData, "general").map((action) => action.id);
    }
    const legacyTargetDone = patient.localDone?.target || patient.localUsed > 0;
    if (legacyTargetDone && !state.targetExamActionIds.length) {
      state.targetExamActionIds = actionsFor(caseData, "target").map((action) => action.id);
    }
    if (patient.microscopyDone && patient.executedDiagnosticTestId && !state.diagnosticTestIds.length) {
      state.diagnosticTestIds = [patient.executedDiagnosticTestId];
    }
    return patient;
  }

  return {
    ACTION_GROUPS,
    normalizeActionState,
    actionsFor,
    hasStructuredExams,
    performedIds,
    isPerformed,
    recordAction,
    actionResult,
    completedActions,
    missingImportantActions,
    missingImportantQuestions,
    measurementPlaceholders,
    collectedFactIds,
    decisionEvidence,
    migratePatientActionState
  };
});
