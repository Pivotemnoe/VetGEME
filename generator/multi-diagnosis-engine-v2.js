(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_MULTI_DIAGNOSIS_V2 = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function uniqueStrings(values) {
    return [...new Set((values || []).filter((value) => typeof value === "string" && value.length > 0))];
  }

  function normalizeVisitSchema(visit) {
    const caseIds = uniqueStrings(visit.caseIds?.length ? visit.caseIds : [visit.caseId]);
    const trueDiagnosisIds = uniqueStrings(visit.trueDiagnosisIds?.length ? visit.trueDiagnosisIds : caseIds);
    const diagnosisMode = visit.diagnosisMode === "multiple" ? "multiple" : "single";
    const maximumDiagnosisSelections = diagnosisMode === "multiple" ? 2 : 1;
    const selectedDiagnosisIds = uniqueStrings(
      visit.selectedDiagnosisIds?.length ? visit.selectedDiagnosisIds : visit.selectedDiagnosisId ? [visit.selectedDiagnosisId] : []
    ).slice(0, maximumDiagnosisSelections);

    return {
      ...visit,
      caseIds,
      bundleId: visit.bundleId || null,
      diagnosisMode,
      maximumDiagnosisSelections,
      trueDiagnosisIds,
      diagnosisRoles: Array.isArray(visit.diagnosisRoles) ? visit.diagnosisRoles : [],
      selectedDiagnosisIds
    };
  }

  function weightsFor(visit) {
    const normalized = normalizeVisitSchema(visit);
    const equalWeight = normalized.trueDiagnosisIds.length ? 1 / normalized.trueDiagnosisIds.length : 0;
    const roleById = new Map(normalized.diagnosisRoles.map((role) => [role.caseId, role]));
    const raw = normalized.trueDiagnosisIds.map((id) => {
      const weight = Number(roleById.get(id)?.coverageWeight);
      return [id, Number.isFinite(weight) && weight > 0 ? weight : equalWeight];
    });
    const total = raw.reduce((sum, entry) => sum + entry[1], 0) || 1;
    return new Map(raw.map(([id, weight]) => [id, weight / total]));
  }

  function unsafeDiagnosisIds(visit) {
    const roleUnsafe = (visit.diagnosisRoles || [])
      .filter((role) => role.missPolicy === "unsafe" || role.clinicalSafety === "critical")
      .map((role) => role.caseId);
    return new Set([...roleUnsafe, ...(visit.unsafeDiagnosisIds || [])]);
  }

  function evaluateDiagnosticCoverage(visit, selectedIds) {
    const normalized = normalizeVisitSchema({ ...visit, selectedDiagnosisIds: selectedIds });
    const submitted = uniqueStrings(selectedIds);
    if (submitted.length > normalized.maximumDiagnosisSelections) {
      throw new Error(`At most ${normalized.maximumDiagnosisSelections} diagnoses may be selected`);
    }
    const selected = uniqueStrings(submitted);
    const truth = new Set(normalized.trueDiagnosisIds);
    const correct = selected.filter((id) => truth.has(id));
    const incorrect = selected.filter((id) => !truth.has(id));
    const missed = normalized.trueDiagnosisIds.filter((id) => !selected.includes(id));
    const weights = weightsFor(normalized);
    const coverage = correct.reduce((sum, id) => sum + (weights.get(id) || 0), 0);
    const unsafeMisses = missed.filter((id) => unsafeDiagnosisIds(normalized).has(id));
    const unnecessaryTreatment = incorrect.length > 0;
    const status = unsafeMisses.length
      ? "unsafe"
      : coverage === 1 && !unnecessaryTreatment
        ? "full"
        : coverage > 0 ? "partial" : "wrong";

    return {
      status,
      coverage,
      correctDiagnosisIds: correct,
      incorrectDiagnosisIds: incorrect,
      missedDiagnosisIds: missed,
      unsafeMissedDiagnosisIds: unsafeMisses,
      unnecessaryTreatment,
      clinicalSafety: unsafeMisses.length ? "unsafe" : "safe"
    };
  }

  function evaluateTreatmentCoverage(visit, selectedPlanIds, planOptions) {
    const normalized = normalizeVisitSchema(visit);
    const selected = uniqueStrings(selectedPlanIds);
    const plans = Array.isArray(planOptions) ? planOptions : [];
    const selectedPlans = plans.filter((plan) => selected.includes(plan.id));
    const covered = uniqueStrings(selectedPlans.flatMap((plan) => plan.coversDiagnosisIds || []))
      .filter((id) => normalized.trueDiagnosisIds.includes(id));
    const missed = normalized.trueDiagnosisIds.filter((id) => !covered.includes(id));
    const weights = weightsFor(normalized);
    const coverage = covered.reduce((sum, id) => sum + (weights.get(id) || 0), 0);
    const irrelevantPlanIds = selectedPlans
      .filter((plan) => !(plan.coversDiagnosisIds || []).some((id) => normalized.trueDiagnosisIds.includes(id)))
      .map((plan) => plan.id);
    const missingPlanIds = selected.filter((id) => !plans.some((plan) => plan.id === id));
    const unsafeMisses = missed.filter((id) => unsafeDiagnosisIds(normalized).has(id));
    const unnecessaryTreatment = irrelevantPlanIds.length > 0 || missingPlanIds.length > 0;
    const status = unsafeMisses.length
      ? "unsafe"
      : coverage === 1 && !unnecessaryTreatment
        ? "full"
        : coverage > 0 ? "partial" : "wrong";

    return {
      status,
      coverage,
      coveredDiagnosisIds: covered,
      missedDiagnosisIds: missed,
      unsafeMissedDiagnosisIds: unsafeMisses,
      irrelevantPlanIds,
      missingPlanIds,
      unnecessaryTreatment,
      clinicalSafety: unsafeMisses.length ? "unsafe" : "safe"
    };
  }

  function evaluateCombinedOutcome(visit, selectedDiagnosisIds, selectedPlanIds, planOptions) {
    const diagnostic = evaluateDiagnosticCoverage(visit, selectedDiagnosisIds);
    const treatment = evaluateTreatmentCoverage(visit, selectedPlanIds, planOptions);
    const unsafe = diagnostic.status === "unsafe" || treatment.status === "unsafe";
    const full = diagnostic.status === "full" && treatment.status === "full";
    const anyCoverage = diagnostic.coverage > 0 || treatment.coverage > 0;
    return {
      status: unsafe ? "unsafe" : full ? "full" : anyCoverage ? "partial" : "wrong",
      diagnosticCoverage: diagnostic.coverage,
      treatmentCoverage: treatment.coverage,
      clinicalSafety: unsafe ? "unsafe" : "safe",
      unnecessaryTreatment: diagnostic.unnecessaryTreatment || treatment.unnecessaryTreatment,
      diagnostic,
      treatment
    };
  }

  return {
    normalizeVisitSchema,
    evaluateDiagnosticCoverage,
    evaluateTreatmentCoverage,
    evaluateCombinedOutcome
  };
});
