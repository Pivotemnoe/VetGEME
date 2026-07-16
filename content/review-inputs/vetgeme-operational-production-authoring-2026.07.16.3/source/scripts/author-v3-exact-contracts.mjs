#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageRoot, "..");
const medicalRoot = process.env.VETGEME_MEDICAL_ROOT || path.join(
  repoRoot,
  "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source"
);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(relativePath, value) {
  const file = path.join(packageRoot, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

const p3 = readJson(path.join(packageRoot, "source/p3-policy.json"));
const p4Explicit = readJson(path.join(packageRoot, "source/p4-explicit-behavior-crosswalk.json"));
const p4Operational = readJson(path.join(packageRoot, "source/p4-operational-requirements.json"));
const medicalManifest = readJson(path.join(medicalRoot, "MANIFEST.json"));
const families = medicalManifest.families.map((entry) => ({
  manifest: entry,
  content: readJson(path.join(medicalRoot, entry.path))
}));

const urgencyDynamicDecisions = new Map([
  ["by_clinical_status", {
    resolutionMode: "runtime_state_required_before_order",
    allowedBandIds: ["emergency", "urgent", "priority", "scheduled"],
    resolverRuleId: "medical_current_clinical_status_to_operational_urgency",
    rationale: "The source explicitly delegates urgency to current clinical status; no fixed fallback is medically safe."
  }],
  ["by_secondary_disease", {
    resolutionMode: "runtime_state_required_before_order",
    allowedBandIds: ["emergency", "urgent", "priority", "scheduled", "routine"],
    resolverRuleId: "medical_secondary_disease_state_to_operational_urgency",
    rationale: "The source explicitly delegates urgency to the active secondary disease; no fixed fallback is medically safe."
  }]
]);

const classificationDecisions = new Map(Object.entries({
  already_available_and_validated: "required",
  available_or_confirmatory: "recommended",
  before_each_major_intervention: "required",
  completed_exit_evidence: "required",
  completed_negative_with_known_limitation: "required",
  component_specific: "conditional",
  deferred_until_safe: "conditional",
  deferred_until_stable: "conditional",
  discordant_evidence: "recommended",
  focused_acute_mimic: "recommended",
  limited_until_analgesia_or_anesthesia: "conditional",
  parallel_serial: "must_not_delay_safety",
  phenotype_reviewed: "recommended",
  pocus_or_safe_imaging_only: "must_not_delay_safety",
  post_diagnosis_specialist_selection: "conditional",
  preserved: "required",
  prioritized_per_mass: "required",
  scheduled_not_daily_default: "conditional",
  screen_only: "optional_or_low_value",
  secondary_not_delay_corneal_route: "recommended",
  secondary_not_sufficient: "recommended",
  selected_external_screen: "conditional",
  selective_localized_not_whole_body_screen: "conditional",
  serial_not_exclusionary: "recommended",
  supporting_not_delay: "recommended",
  supportive_but_negative_does_not_exclude: "recommended",
  supportive_not_exclusionary: "recommended",
  supportive_not_explanatory: "recommended",
  supportive_only: "recommended",
  surveillance_as_applicable: "conditional",
  triage_then_safe_imaging: "must_not_delay_safety",
  tumor_specific: "conditional",
  unavailable_requires_referral: "required",
  urgent_advanced_neuro_ear_route: "must_not_delay_safety",
  urgent_expert: "must_not_delay_safety",
  urgent_imaging_without_massage: "must_not_delay_safety"
}));

const urgencyValues = [];
const classificationValues = [];
const presentationFactBindings = [];
const urgencySources = new Set();
const classificationSources = new Set();
const handlingByTag = new Map(p4Explicit.handlingAlternatives.map((record) => [record.sourceTag, record]));
const safeRouteById = new Map(p4Operational.safeRoutes.map((record) => [record.routeId, record]));

for (const { manifest, content: family } of families) {
  for (const variant of family.variants || []) {
    for (const presentation of variant.presentations || []) {
      urgencySources.add(presentation.urgency);
      for (const investigation of presentation.investigations || []) {
        classificationSources.add(investigation.classification);
      }

      const compatibility = presentation.compatibility || {};
      const handlingTags = Array.isArray(compatibility.requiredHandlingAlternative)
        ? compatibility.requiredHandlingAlternative
        : compatibility.requiredHandlingAlternative
          ? [compatibility.requiredHandlingAlternative]
          : [];
      const factBindings = (presentation.criticalFacts || []).map((fact, factIndex) => ({
        factId: fact.factId,
        discoveryPaths: [...fact.discoveryPaths],
        medicalOwner: {
          packageId: medicalManifest.packageId,
          packageVersion: medicalManifest.packageVersion,
          familyId: family.familyId,
          variantId: variant.id,
          presentationId: presentation.id,
          sourcePointer: `${manifest.path}#/variants/${family.variants.indexOf(variant)}/presentations/${variant.presentations.indexOf(presentation)}/criticalFacts/${factIndex}`
        }
      }));
      if (handlingTags.length > 0 && factBindings.length === 0) {
        throw new Error(`${family.familyId}.${variant.id}.${presentation.id} has handling requirements without critical facts.`);
      }
      for (const handlingTag of handlingTags) {
        const handling = handlingByTag.get(handlingTag);
        if (!handling) throw new Error(`Missing exact P4 handling decision for ${handlingTag}.`);
        const safeRoutes = handling.safeRouteIds.map((routeId) => {
          const route = safeRouteById.get(routeId);
          if (!route) throw new Error(`Missing P4 safe route ${routeId} for ${handlingTag}.`);
          return route;
        });
        presentationFactBindings.push({
          bindingId: `${family.familyId}.${variant.id}.${presentation.id}.${handlingTag}`,
          presentationRef: `${family.familyId}.${variant.id}.${presentation.id}`,
          handlingTag,
          actionId: handling.actionId,
          medicalFactBindings: factBindings.map((fact) => ({
            ...fact,
            safeAlternatives: safeRoutes.map((route) => ({
              factId: fact.factId,
              alternativeId: route.routeId,
              kind: "safe_route",
              payload: {
                ...route,
                medicalOwnerRef: `${fact.medicalOwner.familyId}.${fact.medicalOwner.variantId}.${fact.medicalOwner.presentationId}`
              }
            }))
          })),
          bindingAuthority: "author_explicit_presentation_critical_fact_preservation",
          operationalActionMayGenerateMedicalFact: false
        });
      }
    }
  }
}

for (const sourceValue of uniqueSorted(urgencySources)) {
  const dynamic = urgencyDynamicDecisions.get(sourceValue);
  if (dynamic) {
    urgencyValues.push({
      sourceValue,
      bandId: null,
      ...dynamic,
      authorDecisionId: `p3.urgency.${sourceValue}.v3`
    });
    continue;
  }
  const matched = p3.urgencyBands
    .map((band) => ({
      band,
      token: band.matchTokens.find((token) => sourceValue.toLowerCase().includes(token))
    }))
    .find((candidate) => candidate.token);
  if (!matched) throw new Error(`No explicit urgency decision for source value ${sourceValue}.`);
  urgencyValues.push({
    sourceValue,
    bandId: matched.band.bandId,
    resolutionMode: "fixed_author_crosswalk",
    matchedAuthorToken: matched.token,
    authorDecisionId: `p3.urgency.${sourceValue}.v3`
  });
}

for (const sourceValue of uniqueSorted(classificationSources)) {
  const explicitBandId = classificationDecisions.get(sourceValue);
  const matched = explicitBandId
    ? { band: p3.classificationBands.find((band) => band.bandId === explicitBandId), token: null }
    : p3.classificationBands
      .map((band) => ({
        band,
        token: band.matchTokens.find((token) => sourceValue.toLowerCase().includes(token))
      }))
      .find((candidate) => candidate.token);
  if (!matched?.band) throw new Error(`No explicit classification decision for source value ${sourceValue}.`);
  classificationValues.push({
    sourceValue,
    bandId: matched.band.bandId,
    decisionWeight: matched.band.decisionWeight,
    resultReviewClass: matched.band.resultReviewClass,
    resolutionMode: "fixed_author_crosswalk",
    decisionBasis: explicitBandId ? "explicit_exception_review" : `ordered_author_token:${matched.token}`,
    authorDecisionId: `p3.classification.${sourceValue}.v3`
  });
}

writeJson("source/p3-exact-source-crosswalk.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p3-exact-source-crosswalk",
  catalogVersion: "2026.07.16.3",
  status: "author_complete_programmer_adapter_required",
  runtimeEligible: false,
  fallbackAllowed: false,
  urgencyValues,
  classificationValues,
  activation: {
    unknownSourceValueBlocksBuild: true,
    dynamicUrgencyRequiresStateResolutionBeforeOrder: true,
    selectedTurnaroundMustBePersistedOnce: true
  }
});

writeJson("source/p4-presentation-medical-fact-crosswalk.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p4-presentation-medical-fact-crosswalk",
  catalogVersion: "2026.07.16.3",
  status: "author_complete_programmer_adapter_required",
  runtimeEligible: false,
  sourceMedicalPackage: {
    packageId: medicalManifest.packageId,
    packageVersion: medicalManifest.packageVersion
  },
  rule: "Every required handling action preserves a safe route to every critical fact already authored for that exact presentation; it never creates or changes medical truth.",
  bindings: presentationFactBindings,
  activation: {
    genericHandlingTemplatesAreNotClinicalFactAuthority: true,
    presentationBindingRequiredBeforeActionEvaluation: true,
    unknownFactOrPresentationBlocksRuntime: true
  }
});

console.log(JSON.stringify({
  urgencySourceValues: urgencyValues.length,
  dynamicUrgencyValues: urgencyValues.filter((record) => record.resolutionMode !== "fixed_author_crosswalk").length,
  classificationSourceValues: classificationValues.length,
  explicitClassificationExceptions: classificationValues.filter((record) => record.decisionBasis === "explicit_exception_review").length,
  presentationHandlingBindings: presentationFactBindings.length,
  medicalFactReferences: presentationFactBindings.reduce((sum, record) => sum + record.medicalFactBindings.length, 0),
  uniqueHandlingTags: uniqueSorted(presentationFactBindings.map((record) => record.handlingTag)).length
}, null, 2));
