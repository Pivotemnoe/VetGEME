(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_COMPACT_VISIT_V2 = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const COMPACT_VISIT_SCHEMA_VERSION = 1;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function contentPackMetadata(catalog) {
    return {
      contentPackId: catalog.manifest.contentPackId,
      contentPackVersion: catalog.manifest.contentPackVersion,
      contentPackHash: catalog.manifest.contentPackHash
    };
  }

  function contentPackMatches(value, expected) {
    return Boolean(value)
      && value.contentPackId === expected.contentPackId
      && value.contentPackVersion === expected.contentPackVersion
      && value.contentPackHash === expected.contentPackHash;
  }

  function requireContentPack(value, catalog, label = "Compact visit") {
    const expected = contentPackMetadata(catalog);
    if (!contentPackMatches(value, expected)) {
      throw new Error(`${label} content pack mismatch: ${value?.contentPackId || "missing"}/${value?.contentPackVersion || "missing"}/${value?.contentPackHash || "missing"}`);
    }
    return expected;
  }

  function findOwnerProfile(catalog, profileId) {
    return (catalog.owners["base-profiles"]?.profiles || []).find((item) => item.id === profileId) || null;
  }

  function findOwnerModifier(catalog, modifierId) {
    if (!modifierId) return null;
    return (catalog.owners.modifiers?.modifiers || []).find((item) => item.id === modifierId) || null;
  }

  function findHomeAction(catalog, homeActionId) {
    if (!homeActionId) return null;
    return (catalog.owners["home-treatment-actions"]?.actions || []).find((item) => item.id === homeActionId) || null;
  }

  function compactOwner(owner = {}) {
    const compact = {
      name: owner.name,
      profileId: owner.profileId,
      modifierId: owner.modifierId || null,
      homeActionId: owner.homeActionId || null
    };
    if (owner.appearance !== undefined) compact.appearance = clone(owner.appearance);
    return compact;
  }

  function hydrateOwner(owner, catalog) {
    if (!owner?.profileId) throw new Error("Compact owner profileId is missing");
    const profile = findOwnerProfile(catalog, owner.profileId);
    if (!profile) throw new Error(`Unknown owner profile ${owner.profileId}`);
    const modifier = findOwnerModifier(catalog, owner.modifierId);
    if (owner.modifierId && !modifier) throw new Error(`Unknown owner modifier ${owner.modifierId}`);
    const homeAction = findHomeAction(catalog, owner.homeActionId);
    if (owner.homeActionId && !homeAction) throw new Error(`Unknown home action ${owner.homeActionId}`);
    const hydrated = {
      name: owner.name,
      profileId: owner.profileId,
      profile: clone(profile),
      modifierId: owner.modifierId || null,
      modifier: modifier ? clone(modifier) : null,
      homeActionId: owner.homeActionId || null,
      homeAction: homeAction ? clone(homeAction) : null
    };
    if (owner.appearance !== undefined) hydrated.appearance = clone(owner.appearance);
    return hydrated;
  }

  function complaintCandidates(caseData, catalog) {
    return [
      ...(caseData.initialComplaintVariants || []),
      ...(catalog.owners["follow-up-lines"]?.lines || [])
    ];
  }

  function compactComplaint(complaint) {
    if (!complaint) return { id: null, textFallback: "" };
    if (complaint.id) return { id: complaint.id };
    return {
      id: null,
      textFallback: complaint.text || String(complaint),
      source: complaint.source || null
    };
  }

  function hydrateComplaint(selection, caseData, catalog) {
    if (selection?.id) {
      const complaint = complaintCandidates(caseData, catalog).find((item) => item.id === selection.id);
      if (!complaint) throw new Error(`Unknown complaint ${selection.id} for ${caseData.id}`);
      return clone(complaint);
    }
    if (selection && Object.prototype.hasOwnProperty.call(selection, "textFallback")) {
      return {
        id: null,
        source: selection.source || "persisted_text_fallback",
        text: selection.textFallback
      };
    }
    throw new Error(`Compact complaint is missing for ${caseData.id}`);
  }

  function selectedAnswerForQuestion(question, owner) {
    if (question.allowsHiddenHomeTreatment && owner.homeAction) {
      return owner.homeAction.ownerLines?.[0] || null;
    }
    return question.answers.find((answer) => answer.ownerTags.includes(owner.profileId))
      || question.answers[0]
      || null;
  }

  function deriveHistoryAnswerSelections(caseData, owner) {
    return (caseData.historyQuestions || []).map((question) => {
      const answer = selectedAnswerForQuestion(question, owner);
      if (answer?.id) return { questionId: question.id, answerId: answer.id };
      return {
        questionId: question.id || null,
        answerId: null,
        textFallback: answer?.text || "",
        source: answer?.source || null
      };
    });
  }

  function findAnswer(caseData, owner, selection) {
    const question = (caseData.historyQuestions || []).find((item) => item.id === selection.questionId);
    if (!question) throw new Error(`Unknown history question ${selection.questionId} for ${caseData.id}`);
    if (selection.answerId) {
      const candidates = [
        ...(question.answers || []),
        ...(owner.homeAction?.ownerLines || [])
      ];
      const answer = candidates.find((item) => item.id === selection.answerId);
      if (!answer) throw new Error(`Unknown history answer ${selection.answerId} for ${caseData.id}/${selection.questionId}`);
      return { question, answer: clone(answer) };
    }
    if (Object.prototype.hasOwnProperty.call(selection, "textFallback")) {
      return {
        question,
        answer: {
          id: null,
          text: selection.textFallback,
          source: selection.source || "persisted_text_fallback"
        }
      };
    }
    throw new Error(`Compact history answer is missing for ${caseData.id}/${selection.questionId}`);
  }

  function idsWithFallback(items, path, fallbacks) {
    return (items || []).map((item, index) => {
      if (item?.id) return item.id;
      fallbacks.push({ path: `${path}[${index}]`, text: item?.text || item?.label || "" });
      return null;
    });
  }

  function referenceFields(caseData) {
    const fallbacks = [];
    const refs = {
      generalExamFindingIds: idsWithFallback(caseData.generalExam?.findings, "generalExam.findings", fallbacks),
      targetExamFindingIds: idsWithFallback(caseData.targetExam?.findings, "targetExam.findings", fallbacks),
      sampleActionIds: idsWithFallback(caseData.sampleActions, "sampleActions", fallbacks),
      diagnosticTestIds: idsWithFallback(caseData.diagnosticTests, "diagnosticTests", fallbacks),
      diagnosisOptionIds: idsWithFallback(caseData.preliminaryDiagnosisOptions, "preliminaryDiagnosisOptions", fallbacks),
      planOptionIds: idsWithFallback(caseData.planOptions, "planOptions", fallbacks)
    };
    if (fallbacks.length) refs.referenceTextFallbacks = fallbacks;
    return refs;
  }

  function compactVisit(visit, catalog, packOverride) {
    if (!visit || typeof visit !== "object") throw new Error("Generated visit is not an object");
    const caseData = visit.medicalContent || catalog?.casesById?.[visit.caseId];
    if (!caseData) throw new Error(`Medical content is unavailable for ${visit.caseId || "unknown visit"}`);
    const pack = packOverride || contentPackMetadata(catalog);
    const owner = visit.owner?.profile ? visit.owner : hydrateOwner(visit.owner, catalog);
    const compact = {
      compactVisitSchemaVersion: COMPACT_VISIT_SCHEMA_VERSION,
      ...pack,
      visitId: visit.visitId,
      day: visit.day,
      arrivalMinute: visit.arrivalMinute,
      source: visit.source,
      sourceCategory: visit.sourceCategory || null,
      urgency: visit.urgency,
      severity: visit.severity,
      family: visit.family,
      caseId: visit.caseId,
      caseIds: clone(visit.caseIds || [visit.caseId]),
      bundleId: visit.bundleId ?? null,
      diagnosisMode: visit.diagnosisMode || "single",
      maximumDiagnosisSelections: visit.maximumDiagnosisSelections ?? 1,
      trueDiagnosisIds: clone(visit.trueDiagnosisIds || [visit.caseId]),
      diagnosisRoles: clone(visit.diagnosisRoles || [{ caseId: visit.caseId, role: "primary", coverageWeight: 1 }]),
      selectedDiagnosisIds: clone(visit.selectedDiagnosisIds || []),
      diagnosticCoverage: visit.diagnosticCoverage ?? 0,
      treatmentCoverage: visit.treatmentCoverage ?? 0,
      patient: clone(visit.patient),
      owner: compactOwner(owner),
      complaintSelection: compactComplaint(visit.complaint || visit.complaintSelection),
      historyAnswerSelections: clone(visit.historyAnswerSelections || deriveHistoryAnswerSelections(caseData, owner)),
      ...referenceFields(caseData),
      bookingReason: visit.bookingReason,
      returnVisit: Boolean(visit.returnVisit),
      originalVisitId: visit.originalVisitId || null,
      followUpReason: visit.followUpReason || null,
      missingEquipment: clone(visit.missingEquipment || []),
      requiresReferral: Boolean(visit.requiresReferral),
      safeReferralAvailable: Boolean(visit.safeReferralAvailable)
    };
    if (visit.selectedPlanId !== undefined) compact.selectedPlanId = visit.selectedPlanId;
    if (visit.outcome !== undefined) compact.outcome = clone(visit.outcome);
    validateCompactVisit(compact, catalog);
    return compact;
  }

  function hydrateVisit(compact, catalog) {
    validateCompactVisit(compact, catalog, false);
    const caseData = catalog.casesById[compact.caseId];
    const owner = hydrateOwner(compact.owner, catalog);
    const visit = {
      visitId: compact.visitId,
      day: compact.day,
      arrivalMinute: compact.arrivalMinute,
      source: compact.source,
      sourceCategory: compact.sourceCategory || null,
      urgency: compact.urgency,
      severity: compact.severity,
      family: compact.family,
      caseId: compact.caseId,
      caseIds: clone(compact.caseIds),
      bundleId: compact.bundleId ?? null,
      diagnosisMode: compact.diagnosisMode,
      maximumDiagnosisSelections: compact.maximumDiagnosisSelections,
      trueDiagnosisIds: clone(compact.trueDiagnosisIds),
      diagnosisRoles: clone(compact.diagnosisRoles),
      selectedDiagnosisIds: clone(compact.selectedDiagnosisIds || []),
      diagnosticCoverage: compact.diagnosticCoverage ?? 0,
      treatmentCoverage: compact.treatmentCoverage ?? 0,
      patient: clone(compact.patient),
      owner,
      complaint: hydrateComplaint(compact.complaintSelection, caseData, catalog),
      historyAnswerSelections: clone(compact.historyAnswerSelections || []),
      bookingReason: compact.bookingReason,
      returnVisit: Boolean(compact.returnVisit),
      originalVisitId: compact.originalVisitId || null,
      followUpReason: compact.followUpReason || null,
      missingEquipment: clone(compact.missingEquipment || []),
      requiresReferral: Boolean(compact.requiresReferral),
      safeReferralAvailable: Boolean(compact.safeReferralAvailable),
      requiredForDefinitiveDiagnosis: clone(compact.requiredForDefinitiveDiagnosis || caseData.requiredForDefinitiveDiagnosis || []),
      requiredForTreatment: clone(compact.requiredForTreatment || caseData.requiredForTreatment || []),
      preferredEquipment: clone(compact.preferredEquipment || caseData.preferredEquipment || []),
      safeWithoutEquipmentActions: clone(compact.safeWithoutEquipmentActions || caseData.safeWithoutEquipmentActions || caseData.safeAlternatives || []),
      safeReferralPath: compact.safeReferralPath
        || caseData.safeReferralPath
        || caseData.safeAlternatives?.find((id) => /referral|transfer/i.test(id))
        || null,
      referralDestination: compact.referralDestination || caseData.referralDestination || null,
      arrivalAllowedWithoutEquipment: compact.arrivalAllowedWithoutEquipment !== false,
      equipmentAttractionTags: clone(compact.equipmentAttractionTags || caseData.equipmentAttractionTags || []),
      specialistReferralTags: clone(compact.specialistReferralTags || caseData.specialistReferralTags || []),
      medicalContent: clone(caseData)
    };
    if (compact.selectedPlanId !== undefined) visit.selectedPlanId = compact.selectedPlanId;
    if (compact.outcome !== undefined) visit.outcome = clone(compact.outcome);
    return visit;
  }

  function validateCompactVisit(compact, catalog, validateSelections = true) {
    if (!compact || typeof compact !== "object") throw new Error("Compact visit is not an object");
    if (compact.compactVisitSchemaVersion !== COMPACT_VISIT_SCHEMA_VERSION) {
      throw new Error(`Unsupported compact visit schema: ${compact.compactVisitSchemaVersion ?? "missing"}`);
    }
    requireContentPack(compact, catalog);
    const caseData = catalog.casesById[compact.caseId];
    if (!caseData) throw new Error(`Unknown compact visit case ${compact.caseId}`);
    if (!compact.visitId || !compact.patient || !compact.owner?.profileId) throw new Error(`Compact visit identity is incomplete for ${compact.caseId}`);
    hydrateOwner(compact.owner, catalog);
    hydrateComplaint(compact.complaintSelection, caseData, catalog);
    if (validateSelections) {
      const owner = hydrateOwner(compact.owner, catalog);
      (compact.historyAnswerSelections || []).forEach((selection) => findAnswer(caseData, owner, selection));
    }
    return compact;
  }

  function compactDay(day, catalog) {
    const pack = contentPackMetadata(catalog);
    requireContentPack(day, catalog, `Generated day ${day.day}`);
    const compact = clone(day);
    compact.visits = (day.visits || []).map((visit) => compactVisit(visit, catalog, pack));
    return compact;
  }

  function hydrateDay(day, catalog) {
    requireContentPack(day, catalog, `Generated day ${day.day}`);
    const hydrated = clone(day);
    hydrated.visits = (day.visits || []).map((visit) => (
      visit.medicalContent ? clone(visit) : hydrateVisit(visit, catalog)
    ));
    return hydrated;
  }

  function missingStableIdReport(value) {
    const visits = Array.isArray(value?.visits) ? value.visits : [value];
    return visits.flatMap((visit) => {
      const issues = [];
      if (!visit?.complaintSelection?.id) issues.push({ visitId: visit?.visitId, path: "complaintSelection", text: visit?.complaintSelection?.textFallback || "" });
      (visit?.historyAnswerSelections || []).forEach((selection) => {
        if (!selection.answerId) issues.push({ visitId: visit.visitId, path: `historyAnswerSelections.${selection.questionId}`, text: selection.textFallback || "" });
      });
      (visit?.referenceTextFallbacks || []).forEach((fallback) => issues.push({ visitId: visit.visitId, ...fallback }));
      return issues;
    });
  }

  return {
    COMPACT_VISIT_SCHEMA_VERSION,
    clone,
    contentPackMetadata,
    contentPackMatches,
    requireContentPack,
    compactOwner,
    hydrateOwner,
    deriveHistoryAnswerSelections,
    findAnswer,
    compactVisit,
    hydrateVisit,
    validateCompactVisit,
    compactDay,
    hydrateDay,
    missingStableIdReport
  };
});
