(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_DIAGNOSTIC_DECISIONS_V2 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CLASSIFICATIONS = Object.freeze({
    required: "обязательное",
    recommended: "рекомендованное",
    optional: "необязательное",
    low_value: "малоценное",
    contraindicated: "противопоказано",
    unavailable: "недоступно"
  });
  const NEUTRAL_LOW_VALUE_RESULT = "Полученный результат не изменил клиническое решение";
  const LOW_VALUE_TEST_ID = "system:additional-low-value-test";

  function testAliases(test) {
    const id = String(test?.id || "");
    const aliases = new Set([id, id.replace(/^optional_/, "")]);
    if (/microscopy/iu.test(id) || /microscop/iu.test(test?.label || "")) aliases.add("microscopy");
    if (/cytology/iu.test(id)) aliases.add("cytology");
    if (test?.type === "media_review") aliases.add("video_review");
    return aliases;
  }

  function isRequiredByCorrectDiagnosis(caseData, test) {
    const aliases = testAliases(test);
    return (caseData?.preliminaryDiagnosisOptions || [])
      .filter((option) => option.isCorrectForTemplate)
      .some((option) => (option.requires || []).some((requirement) => aliases.has(requirement)));
  }

  function classifyDiagnosticTest(caseData, test, context = {}) {
    const unavailableReason = context.unavailableReasons?.[test.id];
    if (unavailableReason || context.availableTestIds && !context.availableTestIds.includes(test.id)) {
      return { classification: "unavailable", reason: unavailableReason || "Необходимое оснащение недоступно." };
    }
    if (context.contraindicatedTestIds?.includes(test.id) || test.classification === "contraindicated") {
      return { classification: "contraindicated", reason: test.reason || "Исследование противопоказано в текущей ситуации." };
    }
    if (test.classification && CLASSIFICATIONS[test.classification]) {
      return { classification: test.classification, reason: test.reason || "" };
    }
    if (isRequiredByCorrectDiagnosis(caseData, test)) return { classification: "required", reason: "Требуется для подтверждения рабочего решения." };
    if (/^optional_/u.test(test.id || "")) return { classification: "low_value", reason: "Дополнительное исследование не обязательно." };
    return { classification: "recommended", reason: "Помогает уточнить клиническое решение." };
  }

  function diagnosticOptionsFor(caseData, context = {}) {
    const tests = caseData?.diagnosticTests || [];
    if (!tests.length) return [];
    return tests.map((test) => {
      const status = classifyDiagnosticTest(caseData, test, context);
      return {
        ...test,
        classification: status.classification,
        classificationLabel: CLASSIFICATIONS[status.classification],
        reason: status.reason,
        resultText: test.text
      };
    });
  }

  function evaluateDiagnosticProposal(tests, ownerState = {}, context = {}) {
    const offered = (tests || []).filter(Boolean);
    const selectable = offered.filter((test) => !["unavailable", "contraindicated"].includes(test.classification));
    const allPricesAuthored = selectable.every((test) => Number.isFinite(test.costVetcoins));
    const totalCost = allPricesAuthored
      ? selectable.reduce((sum, test) => sum + test.costVetcoins, 0)
      : null;
    const required = selectable.filter((test) => test.classification === "required");
    const recommended = selectable.filter((test) => test.classification === "recommended");
    const discretionary = selectable.filter((test) => ["optional", "low_value"].includes(test.classification));
    let decision = "accepted";

    if (!selectable.length) decision = "unavailable";
    else if (!ownerState.budgetDiscussed && Number.isFinite(totalCost) && totalCost > 0
      && (ownerState.budgetLimited || totalCost >= Math.max(50, (ownerState.budget || 0) * 0.2))) decision = "asks_cost";
    else if (Number.isFinite(totalCost) && totalCost > (ownerState.budget || Infinity)) decision = "requests_cheaper_option";
    else if (required.length && discretionary.length && Number.isFinite(totalCost)
      && totalCost >= (ownerState.budget || Infinity) * 0.7) decision = "partially_accepted";
    else if (!required.length && discretionary.length === selectable.length && (ownerState.trust ?? 50) < 55) decision = "refused";
    else if (!required.length && discretionary.length === selectable.length && (ownerState.anxiety ?? 0) >= 75) decision = "delayed";
    else if (!required.length && !recommended.length && (ownerState.irritation ?? 0) >= 55) decision = "refused";
    else if (!required.length && (ownerState.trust ?? 50) < 35) decision = "delayed";

    const acceptedTests = decision === "accepted"
      ? selectable
      : decision === "partially_accepted"
        ? [...required, ...recommended]
        : [];
    return {
      decision,
      offeredTestIds: offered.map((test) => test.id),
      acceptedTestIds: acceptedTests.map((test) => test.id),
      declinedTestIds: selectable.filter((test) => !acceptedTests.includes(test)).map((test) => test.id),
      totalCost,
      priceStatus: allPricesAuthored ? "authored" : "not_authored",
      noResult: !["accepted", "partially_accepted"].includes(decision),
      noPayment: !["accepted", "partially_accepted"].includes(decision),
      diagnosticUncertainty: ["refused", "requests_cheaper_option", "delayed"].includes(decision),
      context: {
        budgetDiscussed: Boolean(ownerState.budgetDiscussed),
        explanationQuality: context.explanationQuality || "not_recorded"
      }
    };
  }

  function isTerminalDecision(decision) {
    return ["refused", "requests_cheaper_option", "delayed", "partially_accepted", "skipped_not_required"].includes(decision);
  }

  return {
    CLASSIFICATIONS,
    LOW_VALUE_TEST_ID,
    NEUTRAL_LOW_VALUE_RESULT,
    classifyDiagnosticTest,
    diagnosticOptionsFor,
    evaluateDiagnosticProposal,
    isTerminalDecision
  };
});
