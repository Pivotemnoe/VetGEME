const REVIEW_ONLY_STATUS = "external_veterinary_review_pending";
const REVIEW_SCHEMA_VERSION = 1;

const STATUS_LABELS = Object.freeze({
  author_complete: "Авторская часть завершена",
  source_checked: "Источники проверены",
  external_veterinary_review_pending: "Ожидает внешней ветеринарной проверки",
});

const ACRONYMS = new Set([
  "acth",
  "alt",
  "ast",
  "baer",
  "bnp",
  "cbc",
  "ckd",
  "crt",
  "ct",
  "dcm",
  "ecg",
  "epi",
  "fiv",
  "fna",
  "gdv",
  "icu",
  "mri",
  "pcr",
  "pua",
  "snap",
  "t4",
  "tli",
  "tsh",
  "uti",
]);

function fail(message) {
  throw new Error(`Medical review service view failed: ${message}`);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function words(value) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

/**
 * Converts an internal token to a presentation-safe technical name without
 * translating or otherwise changing its medical meaning.
 */
export function technicalDisplayName(value) {
  const result = words(value)
    .map((word) => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.toLowerCase()))
    .join(" ");
  return result ? `${result[0].toUpperCase()}${result.slice(1)}` : "Не указано";
}

/**
 * Deliberately fail-closed: any urgency token containing "emergency" disables
 * humor, including future composite urgency values not known to this code.
 */
export function isEmergencyUrgency(value) {
  return String(value || "").toLowerCase().includes("emergency");
}

function reviewStatus(review, generatorEligible) {
  check(isObject(review), "review status is missing");
  check(review.veterinaryReviewStatus === REVIEW_ONLY_STATUS, "veterinary review status must remain pending");
  check(generatorEligible === false, "review record unexpectedly became generator eligible");
  return {
    author: STATUS_LABELS[review.authorStatus] || technicalDisplayName(review.authorStatus),
    sources: STATUS_LABELS[review.sourceStatus] || technicalDisplayName(review.sourceStatus),
    veterinary: STATUS_LABELS[review.veterinaryReviewStatus],
    generator: "Не допущено в генератор",
  };
}

function sourcePlanForVariant(family, variant) {
  const plan = asArray(family.planBundles).find((entry) => entry.id === variant.planBundleId);
  check(plan, `variant ${variant.id || "unknown"} has no authored plan bundle`);
  return plan;
}

function researchMap(family) {
  return new Map(asArray(family.researchCapabilityMap).map((entry) => [entry.researchId, entry]));
}

function historyQuestionMap(family) {
  return new Map(asArray(family.commonHistoryQuestions).map((entry) => [entry.id, entry.prompt]));
}

function displayCapabilities(values) {
  return asArray(values).map(technicalDisplayName);
}

function buildSpeech(dialogue, urgency) {
  const emergency = isEmergencyUrgency(urgency);
  const doctorSpeech = dialogue.doctorSpeech || {};
  const ownerProfile = asArray(dialogue.ownerProfiles)[0] || {};
  const ownerUtterances = ownerProfile.utterances || {};
  const doctorKeys = emergency
    ? ["urgentRoute", "explainUncertainty"]
    : ["explainInvestigation", "explainUncertainty"];
  const doctorLines = doctorKeys.flatMap((key) => asArray(doctorSpeech[key])).filter(nonEmptyString);
  const ownerLines = [
    ...asArray(ownerUtterances.complaint),
    ...asArray(ownerUtterances.consent),
  ].filter(nonEmptyString);
  const humorLines = emergency
    ? []
    : asArray(ownerUtterances.lightHumor).filter(nonEmptyString);

  check(!emergency || humorLines.length === 0, "emergency presentation retained a humor line");
  return {
    speechFormOnly: true,
    doctorLines,
    ownerLines,
    humorAllowed: !emergency,
    humorLines,
    emergency,
  };
}

function buildPresentation(family, presentation, presentationIndex, plan, dialogue) {
  const questions = historyQuestionMap(family);
  const research = researchMap(family);
  const equipment = presentation.equipment || {};
  const fallbackDeclared = nonEmptyString(equipment.referralFallback)
    || asArray(equipment.missingLocalRoute).length > 0
    || nonEmptyString(family.safeRouteCapability);
  check(fallbackDeclared, `presentation ${presentation.id || "unknown"} has no safe referral route`);

  const investigations = asArray(presentation.investigations).map((investigation, investigationIndex) => {
    const mapping = research.get(investigation.id);
    check(mapping, `investigation ${investigation.id || "unknown"} has no capability mapping`);
    check(nonEmptyString(investigation.result), `investigation ${investigation.id || "unknown"} has no result`);
    return {
      ordinal: investigationIndex + 1,
      title: technicalDisplayName(investigation.id),
      classification: technicalDisplayName(investigation.classification),
      result: investigation.result,
      requiredCapabilities: displayCapabilities(mapping.requires),
      availability: technicalDisplayName(mapping.availability),
      fallbackRoutes: nonEmptyString(mapping.fallback)
        ? [technicalDisplayName(mapping.fallback)]
        : [],
    };
  });

  const history = Object.entries(presentation.historyAnswers || {}).map(([questionId, answer], index) => ({
    ordinal: index + 1,
    question: questions.get(questionId) || `Уточняющий вопрос ${index + 1}`,
    answer,
  }));

  const exam = asArray(presentation.examFindings).map((entry, index) => ({
    ordinal: index + 1,
    finding: entry.finding,
  }));

  const ownerCommunication = asArray(presentation.ownerCommunication).filter(nonEmptyString);
  check(ownerCommunication.length > 0, `presentation ${presentation.id || "unknown"} has no owner communication`);

  return {
    ordinal: presentationIndex + 1,
    status: reviewStatus(presentation.review, presentation.generatorEligible),
    species: displayCapabilities(presentation.species),
    ageBands: displayCapabilities(presentation.ageBands),
    urgency: technicalDisplayName(presentation.urgency),
    workload: presentation.workload,
    complaint: presentation.complaint,
    history,
    exam,
    discovery: {
      criticalFactCount: asArray(presentation.criticalFacts).length,
      pathCount: asArray(presentation.criticalFacts)
        .reduce((sum, fact) => sum + asArray(fact.discoveryPaths).length, 0),
    },
    investigations,
    capabilities: {
      requiredLocal: displayCapabilities(equipment.requiredLocal),
      external: displayCapabilities(equipment.external),
      conditionalRouteCount: asArray(equipment.conditional).length,
    },
    safeReferral: {
      available: true,
      missingLocalRouteCount: asArray(equipment.missingLocalRoute).length,
      referralFallbackDeclared: nonEmptyString(equipment.referralFallback),
      familyFallbackDeclared: nonEmptyString(family.safeRouteCapability),
      missingLocalRoutes: displayCapabilities(equipment.missingLocalRoute),
      presentationFallbacks: nonEmptyString(equipment.referralFallback)
        ? [technicalDisplayName(equipment.referralFallback)]
        : [],
      familyFallbacks: nonEmptyString(family.safeRouteCapability)
        ? [technicalDisplayName(family.safeRouteCapability)]
        : [],
    },
    decisions: {
      correctOutcome: presentation.outcomes.safe,
      minimumSafePlan: displayCapabilities(plan.minimumSafePlan),
      stagedPlan: displayCapabilities(plan.stagedPlan),
      stabilizeAndRefer: displayCapabilities(plan.stabilizeAndRefer),
      unsafeOutcome: presentation.outcomes.unsafe,
      unsafeOrInadequate: displayCapabilities(plan.unsafeOrInadequate),
    },
    ownerCommunication,
    followUp: {
      required: presentation.followUp?.required === true,
      timing: presentation.followUp?.timing || "Не указано",
      targets: displayCapabilities(presentation.followUp?.targets),
    },
    speech: buildSpeech(dialogue, presentation.urgency),
  };
}

function presentationTextWeight(presentation) {
  const text = [
    presentation.complaint,
    ...Object.values(presentation.historyAnswers || {}),
    ...asArray(presentation.examFindings).map((entry) => entry.finding),
    ...asArray(presentation.investigations).map((entry) => entry.result),
    presentation.outcomes?.safe,
    presentation.outcomes?.unsafe,
    ...asArray(presentation.ownerCommunication),
    presentation.followUp?.timing,
  ].filter(nonEmptyString);
  return text.reduce((sum, value) => sum + value.length, 0);
}

function buildFamily(family, familyIndex, dialogue) {
  check(nonEmptyString(family.title), `family ${familyIndex + 1} has no title`);
  const variants = asArray(family.variants).map((variant, variantIndex) => {
    const plan = sourcePlanForVariant(family, variant);
    return {
      ordinal: variantIndex + 1,
      title: variant.title,
      diagnosticTruth: variant.diagnosticTruth,
      status: reviewStatus(variant.review, variant.generatorEligible),
      allowedSpecies: displayCapabilities(variant.allowedSpecies),
      exclusions: displayCapabilities(variant.exclusions),
      presentations: asArray(variant.presentations).map((presentation, presentationIndex) => (
        buildPresentation(family, presentation, presentationIndex, plan, dialogue)
      )),
    };
  });

  let representative = { variantIndex: 0, presentationIndex: 0, weight: -1 };
  asArray(family.variants).forEach((variant, variantIndex) => {
    asArray(variant.presentations).forEach((presentation, presentationIndex) => {
      const weight = presentationTextWeight(presentation);
      if (weight > representative.weight) representative = { variantIndex, presentationIndex, weight };
    });
  });

  const requirementOptions = asArray(family.requirementGroups)
    .reduce((sum, group) => sum + asArray(group.anyOf).length, 0);
  return {
    ordinal: familyIndex + 1,
    title: family.title,
    status: reviewStatus(family.review, family.generatorEligible),
    campaignPhase: technicalDisplayName(family.campaignPhase),
    species: displayCapabilities(family.species),
    capabilities: {
      core: displayCapabilities(family.coreCapabilities),
      requirementGroupCount: asArray(family.requirementGroups).length,
      requirementOptionCount: requirementOptions,
      researchMappingCount: asArray(family.researchCapabilityMap).length,
      safeReferralDeclared: nonEmptyString(family.safeRouteCapability),
    },
    representative: {
      variantIndex: representative.variantIndex,
      presentationIndex: representative.presentationIndex,
      textWeight: representative.weight,
    },
    variants,
  };
}

function countHierarchy(families) {
  const variants = families.reduce((sum, family) => sum + family.variants.length, 0);
  const presentations = families.reduce(
    (sum, family) => sum + family.variants.reduce((variantSum, variant) => (
      variantSum + variant.presentations.length
    ), 0),
    0,
  );
  const investigations = families.reduce(
    (sum, family) => sum + family.variants.reduce(
      (variantSum, variant) => variantSum + variant.presentations.reduce(
        (presentationSum, presentation) => presentationSum + presentation.investigations.length,
        0,
      ),
      0,
    ),
    0,
  );
  return { families: families.length, variants, presentations, investigations };
}

export function buildMedicalReviewServiceView(p8ReviewInput) {
  check(isObject(p8ReviewInput), "P8 v2 input is required");
  check(p8ReviewInput.reviewOnly === true, "P8 input must remain review-only");
  check(p8ReviewInput.productionEligible === false, "P8 input unexpectedly became production eligible");
  check(p8ReviewInput.runtimeEligible === false, "P8 input unexpectedly became runtime eligible");
  check(p8ReviewInput.generatorEligible === false, "P8 input unexpectedly became generator eligible");
  check(p8ReviewInput.activationAllowed === false, "P8 input unexpectedly allows activation");
  check(p8ReviewInput.externalVeterinaryApproval === false, "external veterinary approval must remain pending");
  check(asArray(p8ReviewInput.productionPool).length === 0, "P8 production pool must remain empty");
  check(isObject(p8ReviewInput.medicalReviewInput), "medical .40 dependency is missing");
  check(p8ReviewInput.medicalReviewInput.reviewOnly === true, "medical dependency must remain review-only");
  check(p8ReviewInput.medicalReviewInput.productionEligible === false, "medical dependency became production eligible");
  check(p8ReviewInput.medicalReviewInput.generatorEligible === false, "medical dependency became generator eligible");
  check(asArray(p8ReviewInput.medicalReviewInput.productionPool).length === 0, "medical production pool must remain empty");
  check(isObject(p8ReviewInput.dialogue), "P8 dialogue layer is missing");

  const families = p8ReviewInput.medicalReviewInput.families.map((family, familyIndex) => (
    buildFamily(family, familyIndex, p8ReviewInput.dialogue)
  ));
  const counts = countHierarchy(families);
  check(counts.families === 39, "service hierarchy must contain 39 families");
  check(counts.variants === 215, "service hierarchy must contain 215 variants");
  check(counts.presentations === 645, "service hierarchy must contain 645 presentations");
  check(counts.investigations === 1864, "service hierarchy must contain 1864 investigation results");

  return deepFreeze({
    schemaVersion: REVIEW_SCHEMA_VERSION,
    serviceOnly: true,
    reviewOnly: true,
    activationAllowed: false,
    externalVeterinaryApproval: false,
    title: "Служебный медицинский обзор",
    subtitle: "Материалы не активированы и ожидают внешней ветеринарной проверки",
    counts,
    labels: {
      ownerCommunication: "Авторская коммуникация врача с владельцем",
      diagnosticGate: "Диагностическая истина — только после проверки discovery-фактов",
    },
    p8Authority: {
      speechFormOnly: true,
      mayChangeMedicalTruth: false,
      mayChangeInvestigationResult: false,
      mayChangeConsentOrRefusal: false,
      mayChangeCost: false,
      mayChangeTime: false,
      mayChangeOutcome: false,
      emergencyHumorAllowed: false,
    },
    families,
  });
}

function encodedReviewData(view) {
  return Buffer.from(JSON.stringify(view), "utf8").toString("base64");
}

/**
 * Authored strings are base64-encoded in the source and are only inserted into
 * the live page through textContent by the inline renderer below.
 */
export function renderMedicalReviewServiceHtml(view) {
  check(isObject(view) && view.serviceOnly === true, "service-only view is required");
  const payload = encodedReviewData(view);
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Служебный медицинский обзор VetGEME</title>
  <style>
    :root { color-scheme: light; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #edf3f5; color: #102a3a; }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-width: 0; background: #edf3f5; }
    body { padding: 20px; overflow-x: hidden; }
    button, select { font: inherit; }
    button { cursor: pointer; }
    .shell { width: min(1520px, 100%); margin: 0 auto; display: grid; gap: 16px; }
    .masthead, .panel { background: #fff; border: 1px solid #b8cad3; border-radius: 12px; box-shadow: 0 3px 14px rgb(16 42 58 / 8%); }
    .masthead { padding: 20px; display: grid; gap: 12px; }
    .masthead h1, .masthead p, h2, h3, h4, p { margin-top: 0; }
    .masthead p, .section:last-child > :last-child { margin-bottom: 0; }
    .badges, .status-grid, .metric-grid, .two-column { display: grid; gap: 10px; }
    .badges { grid-template-columns: repeat(auto-fit, minmax(170px, max-content)); }
    .badge { padding: 7px 10px; border-radius: 999px; background: #e8f1f5; border: 1px solid #9ab6c4; font-weight: 700; overflow-wrap: anywhere; }
    .badge.pending { background: #fff3cc; border-color: #d0a92e; color: #5c4500; }
    .metric-grid { grid-template-columns: repeat(4, minmax(120px, 1fr)); }
    .metric { padding: 12px; border-radius: 8px; background: #f3f8fa; border: 1px solid #cbdbe2; }
    .metric strong { display: block; font-size: 1.4rem; }
    .navigation { padding: 16px; display: grid; grid-template-columns: minmax(230px, 1fr) minmax(0, 2fr); gap: 14px; align-items: end; }
    label { display: grid; gap: 6px; font-weight: 700; min-width: 0; }
    select { width: 100%; min-width: 0; padding: 10px; border-radius: 7px; border: 1px solid #7897a6; background: #fff; color: #102a3a; }
    .variant-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
    .variant-button { min-height: 40px; padding: 8px 12px; border: 1px solid #7897a6; border-radius: 7px; background: #f5fafc; color: #163f55; }
    .variant-button[aria-selected="true"] { background: #195b7a; color: #fff; border-color: #123f55; }
    .content { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 0.36fr); gap: 16px; align-items: start; }
    .main-column, .aside-column { display: grid; gap: 16px; min-width: 0; }
    .panel { padding: 18px; min-width: 0; overflow: visible; }
    .section { min-width: 0; padding-top: 14px; margin-top: 14px; border-top: 1px solid #d8e4e9; }
    .section:first-child { padding-top: 0; margin-top: 0; border-top: 0; }
    .status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .status-item { padding: 9px; border-left: 4px solid #5f8191; background: #f3f7f9; overflow-wrap: anywhere; }
    .status-item.pending { border-color: #d0a92e; background: #fff8df; }
    .two-column { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .card-list { display: grid; gap: 10px; }
    .review-card { padding: 12px; border: 1px solid #c7d7de; border-radius: 8px; background: #fbfdfe; min-width: 0; overflow: visible; }
    .review-card > :last-child { margin-bottom: 0; }
    .review-text, li, dd, dt, h1, h2, h3, h4, option, button, label, .badge { max-width: 100%; white-space: normal; overflow-wrap: anywhere; word-break: normal; text-overflow: clip; -webkit-line-clamp: unset; }
    .review-text { overflow: visible; }
    ul, ol { margin: 8px 0 0; padding-left: 22px; }
    li + li { margin-top: 5px; }
    .gate { border: 2px solid #c79016; background: #fff7d9; }
    .gate button { min-height: 44px; padding: 10px 14px; border: 1px solid #7c5c0b; border-radius: 7px; background: #ffe59a; color: #3e2d00; font-weight: 800; }
    .diagnostic-reveal { margin-top: 12px; padding: 12px; border: 1px solid #b78813; border-radius: 7px; background: #fff; }
    .safe { border-left: 5px solid #2e8b57; }
    .unsafe { border-left: 5px solid #b64932; }
    .speech-boundary { padding: 10px; border-radius: 7px; background: #e7f3f8; border: 1px solid #9dbdca; font-weight: 700; }
    [hidden] { display: none !important; }
    @media (max-width: 980px) {
      body { padding: 12px; }
      .content { grid-template-columns: 1fr; }
      .navigation { grid-template-columns: 1fr; }
    }
    @media (max-width: 680px) {
      .metric-grid, .status-grid, .two-column { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body data-review-ready="false">
  <main class="shell">
    <header class="masthead">
      <h1 id="pageTitle"></h1>
      <p id="pageSubtitle" class="review-text" data-review-text></p>
      <div class="badges" aria-label="Границы пакета">
        <span class="badge pending">Внешняя ветеринарная проверка: ожидается</span>
        <span class="badge">Только служебный обзор</span>
        <span class="badge">Production pool: 0</span>
      </div>
      <div id="metrics" class="metric-grid"></div>
    </header>
    <section class="panel navigation" aria-label="Иерархия медицинского обзора">
      <label>Семейство<select id="familySelect"></select></label>
      <div><strong>Варианты</strong><div id="variantButtons" class="variant-buttons" role="tablist"></div></div>
      <label>Клиническое представление<select id="presentationSelect"></select></label>
    </section>
    <div class="content">
      <div class="main-column">
        <section id="familyPanel" class="panel"></section>
        <section id="presentationPanel" class="panel"></section>
        <section id="decisionPanel" class="panel"></section>
      </div>
      <aside class="aside-column">
        <section id="statusPanel" class="panel"></section>
        <section id="diagnosticGatePanel" class="panel gate"></section>
        <section id="speechPanel" class="panel"></section>
      </aside>
    </div>
  </main>
  <script>
    "use strict";
    const decode = (encoded) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))));
    const REVIEW = decode("${payload}");
    const state = { familyIndex: 0, variantIndex: 0, presentationIndex: 0, truthRevealed: false };
    const byId = (id) => document.getElementById(id);
    const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
    const element = (tag, options = {}) => {
      const node = document.createElement(tag);
      if (options.className) node.className = options.className;
      if (options.text !== undefined) node.textContent = String(options.text);
      if (options.reviewText) { node.dataset.reviewText = "true"; node.classList.add("review-text"); }
      if (options.attributes) for (const [name, value] of Object.entries(options.attributes)) node.setAttribute(name, String(value));
      return node;
    };
    const append = (parent, ...children) => { for (const child of children.filter(Boolean)) parent.appendChild(child); return parent; };
    const heading = (level, text) => element("h" + level, { text, reviewText: true });
    const paragraph = (text, className = "") => element("p", { text, className, reviewText: true });
    const list = (values, className = "") => {
      const node = element("ul", { className });
      for (const value of values) append(node, element("li", { text: value, reviewText: true }));
      return node;
    };
    const labeledList = (label, values) => {
      const card = element("div", { className: "review-card" });
      append(card, heading(4, label));
      append(card, values.length ? list(values) : paragraph("Не требуется"));
      return card;
    };
    const current = () => {
      const family = REVIEW.families[state.familyIndex];
      const variant = family.variants[state.variantIndex];
      const presentation = variant.presentations[state.presentationIndex];
      return { family, variant, presentation };
    };
    const renderMetrics = () => {
      const target = byId("metrics"); clear(target);
      for (const [label, value] of [["Семейств", REVIEW.counts.families], ["Вариантов", REVIEW.counts.variants], ["Представлений", REVIEW.counts.presentations], ["Результатов исследований", REVIEW.counts.investigations]]) {
        const card = element("div", { className: "metric" });
        append(card, element("strong", { text: value }), element("span", { text: label }));
        append(target, card);
      }
    };
    const renderFamilyOptions = () => {
      const select = byId("familySelect"); clear(select);
      REVIEW.families.forEach((family, index) => {
        const option = element("option", { text: family.ordinal + ". " + family.title });
        option.value = String(index); select.appendChild(option);
      });
      select.value = String(state.familyIndex);
    };
    const renderHierarchyControls = () => {
      const { family, variant } = current();
      const buttons = byId("variantButtons"); clear(buttons);
      family.variants.forEach((entry, index) => {
        const button = element("button", { className: "variant-button", text: "Вариант " + entry.ordinal, attributes: { type: "button", role: "tab", "aria-selected": index === state.variantIndex ? "true" : "false" } });
        button.addEventListener("click", () => selectVariant(index));
        append(buttons, button);
      });
      const presentations = byId("presentationSelect"); clear(presentations);
      variant.presentations.forEach((entry, index) => {
        const option = element("option", { text: "Представление " + entry.ordinal });
        option.value = String(index); presentations.appendChild(option);
      });
      presentations.value = String(state.presentationIndex);
    };
    const renderFamily = () => {
      const { family } = current();
      const panel = byId("familyPanel"); clear(panel);
      append(panel, heading(2, family.title));
      panel.querySelector("h2").classList.add("family-title");
      append(panel, paragraph("Этап кампании: " + family.campaignPhase));
      const summary = element("div", { className: "two-column section" });
      append(summary,
        labeledList("Виды животных", family.species),
        labeledList("Ключевые возможности", family.capabilities.core),
        labeledList("Маршруты требований", ["Групп: " + family.capabilities.requirementGroupCount, "Допустимых вариантов: " + family.capabilities.requirementOptionCount]),
        labeledList("Исследования и безопасное направление", ["Связей исследований: " + family.capabilities.researchMappingCount, family.capabilities.safeReferralDeclared ? "Семейный маршрут безопасного направления предусмотрен" : "Маршрут не предусмотрен"]),
      );
      append(panel, summary);
    };
    const renderStatus = () => {
      const { family, variant, presentation } = current();
      const panel = byId("statusPanel"); clear(panel);
      append(panel, heading(3, "Статусы"));
      const values = [
        ["Семейство", family.status],
        ["Вариант", variant.status],
        ["Представление", presentation.status],
      ];
      for (const [level, statuses] of values) {
        append(panel, heading(4, level));
        const grid = element("div", { className: "status-grid" });
        for (const [key, label] of Object.entries(statuses)) {
          const item = element("div", { className: "status-item" + (key === "veterinary" ? " pending" : ""), text: label, reviewText: true });
          append(grid, item);
        }
        append(panel, grid);
      }
    };
    const renderPresentation = () => {
      const { presentation } = current();
      const panel = byId("presentationPanel"); clear(panel);
      const title = heading(2, "Клиническое представление " + presentation.ordinal); title.classList.add("presentation-title"); append(panel, title);
      append(panel, paragraph("Срочность: " + presentation.urgency + ". Нагрузка: " + presentation.workload + "."));
      const complaint = element("section", { className: "section" });
      append(complaint, heading(3, "Жалоба"), paragraph(presentation.complaint, "complaint-text")); append(panel, complaint);
      const discovery = element("section", { className: "section" });
      append(discovery, heading(3, "Discovery: анамнез и осмотр"), paragraph("Критических фактов: " + presentation.discovery.criticalFactCount + ". Путей открытия: " + presentation.discovery.pathCount + "."));
      const historyCards = element("div", { className: "card-list" });
      for (const item of presentation.history) {
        const card = element("article", { className: "review-card" });
        append(card, heading(4, item.question), paragraph(item.answer, "history-answer")); append(historyCards, card);
      }
      append(discovery, historyCards);
      if (presentation.exam.length) {
        append(discovery, heading(4, "Данные осмотра"));
        const examList = list(presentation.exam.map((item) => item.finding), "exam-findings"); append(discovery, examList);
      }
      append(panel, discovery);
      const investigations = element("section", { className: "section" });
      append(investigations, heading(3, "Исследования и результаты"));
      const cards = element("div", { className: "card-list investigations" });
      for (const item of presentation.investigations) {
        const card = element("article", { className: "review-card investigation" });
        append(card, heading(4, item.ordinal + ". " + item.title), paragraph("Классификация: " + item.classification + ". Доступность: " + item.availability + "."));
        const result = paragraph(item.result, "investigation-result"); result.dataset.exactInvestigationResult = "true"; append(card, result);
        append(card, labeledList("Требуемые возможности", item.requiredCapabilities));
        if (item.fallbackRoutes.length) {
          const fallbackRoutes = labeledList("Безопасный fallback исследования", item.fallbackRoutes);
          for (const route of fallbackRoutes.querySelectorAll("li")) route.dataset.exactSafeReferral = "true";
          append(card, fallbackRoutes);
        }
        append(cards, card);
      }
      append(investigations, cards); append(panel, investigations);
      const communication = element("section", { className: "section" });
      append(communication, heading(3, REVIEW.labels.ownerCommunication));
      const communicationList = list(presentation.ownerCommunication, "owner-communication");
      for (const item of communicationList.children) item.dataset.exactOwnerCommunication = "true";
      append(communication, communicationList); append(panel, communication);
      const equipment = element("section", { className: "section" });
      append(equipment, heading(3, "Возможности, оборудование и направление"));
      const eqColumns = element("div", { className: "two-column" });
      append(eqColumns, labeledList("Локально требуется", presentation.capabilities.requiredLocal), labeledList("Внешние возможности", presentation.capabilities.external));
      append(equipment, eqColumns, paragraph("Условных маршрутов: " + presentation.capabilities.conditionalRouteCount + "."));
      const routeText = presentation.safeReferral.available
        ? "Безопасный маршрут направления предусмотрен при недоступности локальных возможностей."
        : "Безопасный маршрут направления отсутствует.";
      append(equipment, paragraph(routeText, "safe-referral-text"));
      const routeGroups = [
        ["Маршруты при недоступности локально", presentation.safeReferral.missingLocalRoutes],
        ["Fallback клинического представления", presentation.safeReferral.presentationFallbacks],
        ["Fallback медицинского семейства", presentation.safeReferral.familyFallbacks],
      ];
      for (const [label, routes] of routeGroups) {
        if (!routes.length) continue;
        const routeList = labeledList(label, routes);
        for (const route of routeList.querySelectorAll("li")) route.dataset.exactSafeReferral = "true";
        append(equipment, routeList);
      }
      append(panel, equipment);
    };
    const renderDecisions = () => {
      const { presentation } = current();
      const panel = byId("decisionPanel"); clear(panel);
      append(panel, heading(2, "Корректные и небезопасные решения"));
      const safe = element("section", { className: "section safe" });
      append(safe, heading(3, "Корректное решение и безопасный исход"));
      const safeOutcome = paragraph(presentation.decisions.correctOutcome, "safe-outcome"); safeOutcome.dataset.exactSafeOutcome = "true"; append(safe, safeOutcome);
      append(safe, labeledList("Минимально безопасный план", presentation.decisions.minimumSafePlan));
      append(safe, labeledList("Поэтапный план", presentation.decisions.stagedPlan));
      if (presentation.decisions.stabilizeAndRefer.length) append(safe, labeledList("Стабилизация и направление", presentation.decisions.stabilizeAndRefer));
      const unsafe = element("section", { className: "section unsafe" });
      append(unsafe, heading(3, "Небезопасное решение"));
      const unsafeOutcome = paragraph(presentation.decisions.unsafeOutcome, "unsafe-outcome"); unsafeOutcome.dataset.exactUnsafeOutcome = "true"; append(unsafe, unsafeOutcome);
      append(unsafe, labeledList("Небезопасно или недостаточно", presentation.decisions.unsafeOrInadequate));
      const follow = element("section", { className: "section" });
      append(follow, heading(3, "Наблюдение"), paragraph(presentation.followUp.timing, "follow-up-timing"), labeledList("Цели наблюдения", presentation.followUp.targets));
      append(panel, safe, unsafe, follow);
    };
    const renderDiagnosticGate = () => {
      const { variant } = current();
      const panel = byId("diagnosticGatePanel"); clear(panel);
      append(panel, heading(3, REVIEW.labels.diagnosticGate));
      append(panel, paragraph("Сначала проверьте жалобу, анамнез, осмотр и результаты исследований. Название варианта и диагностическая истина не показаны до явного действия."));
      const button = element("button", { text: state.truthRevealed ? "Скрыть диагностическую истину" : "Discovery проверен — показать истину", attributes: { id: "revealTruthBtn", type: "button", "aria-expanded": state.truthRevealed ? "true" : "false" } });
      button.addEventListener("click", () => { state.truthRevealed = !state.truthRevealed; renderDiagnosticGate(); });
      append(panel, button);
      const reveal = element("div", { className: "diagnostic-reveal", attributes: { id: "diagnosticReveal" } });
      reveal.hidden = !state.truthRevealed;
      append(reveal, heading(4, variant.title));
      const truth = paragraph(variant.diagnosticTruth, "diagnostic-truth"); truth.dataset.exactDiagnosticTruth = "true"; append(reveal, truth);
      append(panel, reveal);
    };
    const renderSpeech = () => {
      const { presentation } = current();
      const panel = byId("speechPanel"); clear(panel);
      append(panel, heading(3, "P8: форма речи"));
      append(panel, paragraph("Речевой слой меняет только форму реплики и не меняет медицинскую истину, результаты, согласие, цену, время или исход.", "speech-boundary"));
      append(panel, labeledList("Реплики врача", presentation.speech.doctorLines));
      append(panel, labeledList("Форма реплики владельца", presentation.speech.ownerLines));
      if (presentation.speech.humorAllowed) {
        const humor = labeledList("Допустимый лёгкий юмор", presentation.speech.humorLines); humor.classList.add("humor-section"); append(panel, humor);
      } else {
        append(panel, paragraph("Юмор выключен для неотложного случая.", "humor-disabled"));
      }
    };
    const render = () => {
      renderHierarchyControls(); renderFamily(); renderPresentation(); renderDecisions(); renderStatus(); renderDiagnosticGate(); renderSpeech();
      byId("familySelect").value = String(state.familyIndex);
      byId("presentationSelect").value = String(state.presentationIndex);
      document.body.dataset.reviewReady = "true";
    };
    const selectFamily = (index) => {
      const next = Number(index); if (!Number.isInteger(next) || next < 0 || next >= REVIEW.families.length) throw new Error("Unknown family index");
      const representative = REVIEW.families[next].representative;
      state.familyIndex = next; state.variantIndex = representative.variantIndex; state.presentationIndex = representative.presentationIndex; state.truthRevealed = false; render();
    };
    const selectVariant = (index) => {
      const family = REVIEW.families[state.familyIndex]; const next = Number(index); if (!Number.isInteger(next) || next < 0 || next >= family.variants.length) throw new Error("Unknown variant index");
      state.variantIndex = next; state.presentationIndex = 0; state.truthRevealed = false; render();
    };
    const selectPresentation = (index) => {
      const variant = REVIEW.families[state.familyIndex].variants[state.variantIndex]; const next = Number(index); if (!Number.isInteger(next) || next < 0 || next >= variant.presentations.length) throw new Error("Unknown presentation index");
      state.presentationIndex = next; state.truthRevealed = false; render();
    };
    byId("familySelect").addEventListener("change", (event) => selectFamily(event.target.value));
    byId("presentationSelect").addEventListener("change", (event) => selectPresentation(event.target.value));
    byId("pageTitle").textContent = REVIEW.title;
    byId("pageSubtitle").textContent = REVIEW.subtitle;
    renderMetrics(); renderFamilyOptions(); selectFamily(0);
    window.__VETGEME_MEDICAL_REVIEW__ = Object.freeze({
      ready: true,
      selectFamily,
      selectVariant,
      selectPresentation,
      getSnapshot: () => cloneSnapshot(),
    });
    function cloneSnapshot() {
      const { family, variant, presentation } = current();
      return JSON.parse(JSON.stringify({ state, family, variant, presentation }));
    }
  </script>
</body>
</html>`;
}

export const MEDICAL_REVIEW_SERVICE_VIEW_VERSION = REVIEW_SCHEMA_VERSION;
