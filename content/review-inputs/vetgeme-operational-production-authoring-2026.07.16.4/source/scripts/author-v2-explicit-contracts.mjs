#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageRoot, "..");
const medicalRoot = path.join(
  repoRoot,
  "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source"
);
const capabilityPath = path.join(
  repoRoot,
  "content/system-packs/vetgeme-master-2026-07-14/capability-registry.json"
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
  return [...new Set(values.filter(Boolean))].sort();
}

function words(tag) {
  return String(tag).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function hasWord(tag, values) {
  const tokenSet = new Set(words(tag));
  return values.some((value) => tokenSet.has(value));
}

function hasPhrase(tag, values) {
  const normalized = `_${String(tag).toLowerCase().replace(/[^a-z0-9]+/g, "_")}_`;
  return values.some((value) => normalized.includes(`_${value}_`));
}

function containsAny(tag, values) {
  return values.some((value) => String(tag).toLowerCase().includes(value));
}

const medicalManifest = readJson(path.join(medicalRoot, "MANIFEST.json"));
const capabilityRegistry = readJson(capabilityPath);
const p4 = readJson(path.join(packageRoot, "source/p4-policy.json"));
const p6 = readJson(path.join(packageRoot, "source/p6-balance.json"));
const capabilityById = new Map(capabilityRegistry.capabilities.map((item) => [item.id, item]));
const families = medicalManifest.families.map((entry) =>
  readJson(path.join(medicalRoot, entry.path))
);

const researchById = new Map();
const ownerTags = new Set();
const temperamentTags = new Set();
const handlingTags = new Set();

for (const family of families) {
  for (const mapping of family.researchCapabilityMap || []) {
    const current = researchById.get(mapping.researchId) || {
      researchId: mapping.researchId,
      familyIds: new Set(),
      requires: new Set(),
      availability: new Set(),
      fallbacks: new Set()
    };
    current.familyIds.add(family.familyId);
    for (const value of mapping.requires || []) current.requires.add(value);
    if (mapping.availability) current.availability.add(mapping.availability);
    if (mapping.fallback) current.fallbacks.add(mapping.fallback);
    researchById.set(mapping.researchId, current);
  }
  for (const variant of family.variants || []) {
    for (const presentation of variant.presentations || []) {
      const compatibility = presentation.compatibility || {};
      for (const tag of compatibility.ownerModifiers || []) ownerTags.add(tag);
      for (const tag of compatibility.temperament || []) temperamentTags.add(tag);
      const handling = Array.isArray(compatibility.requiredHandlingAlternative)
        ? compatibility.requiredHandlingAlternative
        : compatibility.requiredHandlingAlternative
          ? [compatibility.requiredHandlingAlternative]
          : [];
      for (const tag of handling) handlingTags.add(tag);
    }
  }
}

function externalProviderForCapability(capabilityId) {
  const id = String(capabilityId).toLowerCase();
  if (containsAny(id, ["regulated", "rabies", "public_health", "outbreak"])) {
    return "ref_public_health";
  }
  if (containsAny(id, [
    "surgery_referral", "surgical_exploration_referral", "surgery_or_referral",
    "hospital_referral", "intensive_care_referral", "mechanical_ventilation_referral",
    "blood_product_referral", "gastric_decompression_referral", "gdv_surgery_referral",
    "urinary_decompression_referral", "thoracocentesis_referral", "abdominocentesis_referral",
    "advanced_heart_failure_referral"
  ])) return "ref_emergency_24h";
  if (containsAny(id, [
    "imaging", "ultrasound", "radiograph", "radiography", "echocardiography",
    "scintigraphy", "endoscopy", "otoscopy", "uroendoscopy"
  ])) return "ref_imaging_center";
  if (containsAny(id, [
    "culture", "pcr", "serology", "antigen", "susceptibility", "dermatophyte",
    "fungal", "infectious", "distemper", "adenovirus", "lepto", "tick_bacterial",
    "babesia", "hemoplasma", "leishmania", "lungworm", "heartworm", "fecal_pathogen",
    "fecal_egg"
  ])) return "ref_microbiology_pcr";
  if (containsAny(id, [
    "cytology", "histology", "histopathology", "pathology", "panel", "biomarker",
    "fructosamine", "blood_gas", "sdma", "protein_creatinine", "t4", "tsh",
    "cortisol", "acth", "cobalamin", "folate", "tli", "fluid_analysis",
    "effusion_analysis", "urolith_analysis", "hepatic_function", "endocrine_testing"
  ])) return "ref_clinical_pathology";
  return "ref_specialist_network";
}

function lifecyclePredicates(requires) {
  const predicates = [];
  for (const capabilityId of requires) {
    const capability = capabilityById.get(capabilityId);
    if (!capability) {
      predicates.push({
        predicate: "supplemental_capability_resolved",
        capabilityId,
        authority: "author_package.supplementalCapabilityCatalog"
      });
      continue;
    }
    if (["small_equipment", "laboratory_equipment", "treatment_equipment", "imaging_equipment", "consumable_device"].includes(capability.type)) {
      predicates.push(
        { predicate: "owned", capabilityId, authority: "p6.assetState" },
        { predicate: "delivery_complete", capabilityId, authority: "p6.assetState" },
        { predicate: "maintenance_current", capabilityId, authority: "p6.maintenanceState" }
      );
    }
    if (capability.type === "consumable_set") {
      predicates.push({
        predicate: "stock_available",
        capabilityId,
        minimumUnits: 1,
        authority: "p6.inventoryState"
      });
    }
    if (capability.type === "staff_skill") {
      predicates.push({
        predicate: "qualified_staff_scheduled",
        capabilityId,
        authority: "p5.staffAndShiftState"
      });
    }
    if (["room", "room_capability", "room_protocol"].includes(capability.type)) {
      predicates.push({
        predicate: "ready_room_available",
        capabilityId,
        authority: "p5.roomState"
      });
    }
    if (capability.type === "external_service") {
      predicates.push({
        predicate: "provider_route_available",
        capabilityId,
        authority: "p3.providerCalendar"
      });
    }
  }
  return predicates;
}

const researchRoutes = [...researchById.values()]
  .sort((a, b) => a.researchId.localeCompare(b.researchId))
  .map((record) => {
    const requires = uniqueSorted([...record.requires]);
    const externalCapabilities = requires.filter(
      (id) => capabilityById.get(id)?.type === "external_service"
    );
    const routeCapabilityIds = uniqueSorted([
      ...externalCapabilities,
      ...requires.filter((id) => containsAny(id, ["regulated", "rabies", "public_health", "outbreak"]))
    ]);
    const providerIds = uniqueSorted(routeCapabilityIds.map(externalProviderForCapability));
    const sourceFallbacks = uniqueSorted([...record.fallbacks]);
    const fallbackRouteId = sourceFallbacks[0] || "safe_referral";
    return {
      researchId: record.researchId,
      familyIds: uniqueSorted([...record.familyIds]),
      routeMode: externalCapabilities.length ? "external" : "local",
      requiredCapabilityIds: requires,
      externalCapabilityIds: externalCapabilities,
      providerIds,
      providerCoordinationMode: providerIds.length > 1 ? "multi_provider" : providerIds.length === 1 ? "single_provider" : "none",
      primaryProviderId: providerIds.length === 1 ? providerIds[0] : null,
      lifecyclePredicates: lifecyclePredicates(requires),
      fallbackRouteId,
      fallbackDecisionBasis: sourceFallbacks.length
        ? "medical_family_authored"
        : "author_explicit_safe_referral_for_missing_local_capability",
      medicalResultAuthority: "medical_family.presentation.investigations[].result_only",
      operationalResultGenerationForbidden: true
    };
  });

const ownerRuleByArchetype = new Map(
  p4.ownerModifierRules.map((rule) => [rule.archetypeId, rule])
);

function ownerDecision(tag) {
  const normalized = String(tag).toLowerCase();
  let archetypeId = "owner_calm_collaborative";
  let basis = "explicit_neutral_or_collaborative_context";
  if (containsAny(normalized, ["budget", "cost", "financial", "afford", "price", "payment", "money", "low_resource", "limited_resource", "cheapest", "expensive"])) {
    archetypeId = "owner_budget_constrained"; basis = "explicit_financial_constraint";
  } else if (containsAny(normalized, [
    "anxious", "anxiety", "fear", "afraid", "worried", "worry", "panic", "alarmed", "terrified",
    "uncertain", "concern", "shocked", "distress", "risk_averse", "procedure_averse",
    "surprised_by", "regret", "shock"
  ])) {
    archetypeId = "owner_anxious_observant"; basis = "explicit_anxiety_or_uncertainty";
  } else if (containsAny(normalized, ["distrust", "skept", "second_opinion", "conflict", "angry", "frustrated", "hostile", "complaint", "confrontational"])) {
    archetypeId = "owner_distrustful"; basis = "explicit_distrust_or_conflict";
  } else if (containsAny(normalized, [
    "nonadherent", "low_adherence", "inconsistent", "missed", "misses_", "stopped",
    "poor_compliance", "cannot_administer", "forgot", "unreliable", "inattentive",
    "incomplete_", "lost_records", "missing_records", "missing_documents", "delay_prone",
    "delayed_access", "treatment_failure"
  ])) {
    archetypeId = "owner_inconsistent"; basis = "explicit_adherence_risk";
  } else if (containsAny(normalized, [
    "confused", "confuses_", "misunderstands", "misunderstood", "low_comprehension",
    "needs_simple", "language_barrier", "overwhelmed", "inexperienced", "diagnostic_overload",
    "pathology_overload", "medication_confusion", "vaccine_confusion", "uses_wrong_term"
  ])) {
    archetypeId = "owner_low_comprehension"; basis = "explicit_comprehension_support_needed";
  } else if (containsAny(normalized, [
    "time_limited", "time_pressed", "schedule", "transport", "distance", "availability",
    "travel", "work_commitment", "hard_to_reach", "care_barrier", "home_care_barrier",
    "monitoring_barrier", "rehabilitation_barrier", "confinement_barrier", "dexterity_limit",
    "physically_limited", "limited_home", "limited_handling", "medication_access_problem",
    "rural_owner", "cannot_home", "cannot_remove"
  ])) {
    archetypeId = "owner_time_constrained"; basis = "explicit_time_or_transport_constraint";
  } else if (containsAny(normalized, [
    "exhausted", "caregiver", "burnout", "fatigue", "grief", "palliative_burden",
    "care_burden", "complex_chronic_care", "complex_home_care", "home_nursing_barrier"
  ])) {
    archetypeId = "owner_exhausted_caregiver"; basis = "explicit_caregiver_burden";
  } else if (containsAny(normalized, ["defensive", "ashamed", "withholding", "self_treated", "home_treatment", "guilty", "denies", "embarrassed"])) {
    archetypeId = "owner_defensive_after_failure"; basis = "explicit_defensive_disclosure_risk";
  } else if (containsAny(normalized, ["high_resource", "full_workup", "insured", "financially_flexible"])) {
    archetypeId = "owner_high_resource"; basis = "explicit_high_resource_route";
  } else if (containsAny(normalized, [
    "evidence", "detailed", "research", "questions_", "exact_prognosis", "medical_background",
    "wants_numbers", "requests_certainty", "seeks_certainty", "seeks_prognosis",
    "seeks_reassurance", "needs_prognostic_updates", "wants_certain_cause",
    "wants_definitive_answer", "wants_prognosis"
  ])) {
    archetypeId = "owner_skeptical_evidence_seeking"; basis = "explicit_evidence_seeking";
  } else if (containsAny(normalized, [
    "self_diagn", "online_diagn", "internet_diagn", "internet_test", "internet_antibiotic",
    "insists", "demands_",
    "anchored_on", "attributes_", "certain_it_is", "requests_antibiotic", "requests_steroid",
    "expects_", "expecting_", "confident_", "believes_", "assumption", "breed_anchor", "strong_trigger_theory",
    "requests_quick", "requests_simple", "requests_single", "requests_same", "requests_routine",
    "requests_treatment", "requests_diet_only", "requests_wait_and_see", "requests_xray_only",
    "requests_surgery_only", "requests_tablet_only", "requests_worm_only", "requests_", "wants_immediate",
    "wants_one_step", "wants_no_followup", "wants_cough_suppression", "wants_supplement_only",
    "wants_", "normalizes_", "normalization", "minimizes_", "minimized", "mislabels_",
    "misreads_", "false_reassurance", "does_not_", "sees_no_", "self_medicating",
    "feeds_raw", "declines_", "denial", "eager_to_stop", "single_session_preference",
    "focused_only", "focuses_only", "sees_walking_as_recovery"
  ])) {
    archetypeId = "owner_overconfident"; basis = "explicit_home_diagnosis_or_anchor";
  } else if (containsAny(normalized, ["adherent", "reliable", "engaged", "prepared", "compliant", "observant", "motivated", "accepts_plan"])) {
    archetypeId = "owner_calm_collaborative"; basis = "explicit_collaboration_strength";
  }
  const rule = ownerRuleByArchetype.get(archetypeId);
  return {
    sourceTag: tag,
    archetypeId,
    decisionBasis: basis,
    stateEffects: rule?.stateEffects || {},
    mappingAuthority: "author_explicit_crosswalk_v2"
  };
}

function temperamentDecision(tag) {
  const normalized = String(tag).toLowerCase();
  let archetypeId = "patient_cautious";
  let basis = "explicit_clinical_state_not_a_stable_temperament";
  if (containsAny(normalized, ["other_animal", "dog_reactive", "cat_reactive"])) {
    archetypeId = "patient_other_animal_reactive"; basis = "explicit_other_animal_reactivity";
  } else if (containsAny(normalized, ["familiar_staff", "known_staff", "repeat_visit"])) {
    archetypeId = "patient_familiar_staff"; basis = "explicit_familiar_staff_trust";
  } else if (hasWord(normalized, ["pain", "painful", "defensive", "aggressive", "bite", "fractious"]) || containsAny(normalized, ["pain_defensive", "touch_sensitive"])) {
    archetypeId = "patient_pain_defensive"; basis = "explicit_pain_or_defensive_handling_risk";
  } else if (hasWord(normalized, ["fearful", "anxious", "timid", "avoidant", "neophobic", "panic", "stressed", "distressed"]) || containsAny(normalized, ["fear_", "handling_fear", "handling_averse", "head_shy", "clinic_inhibited"])) {
    archetypeId = "patient_fearful"; basis = "explicit_fear_behavior";
  } else if (hasWord(normalized, ["shutdown", "freeze", "freezes", "withdrawn", "depressed", "obtunded", "weak", "recumbent", "collapsed"])) {
    archetypeId = "patient_shutdown"; basis = "explicit_shutdown_or_low_responsiveness";
  } else if (hasWord(normalized, ["excitable", "aroused", "restless", "hyper", "reactive", "vocal", "agitated", "active", "hyperactive", "irritable", "territorial"])) {
    archetypeId = "patient_high_arousal"; basis = "explicit_high_arousal_behavior";
  } else if (hasWord(normalized, ["calm", "cooperative", "social", "tolerant", "comfortable"])) {
    archetypeId = "patient_calm_social"; basis = "explicit_calm_or_cooperative_behavior";
  }
  return { sourceTag: tag, archetypeId, decisionBasis: basis, mappingAuthority: "author_explicit_crosswalk_v2" };
}

const classById = new Map(p4.handlingActionClasses.map((item) => [item.actionClassId, item]));

function handlingDecision(tag) {
  const normalized = String(tag).toLowerCase();
  const classes = [];
  const add = (id) => { if (!classes.includes(id)) classes.push(id); };
  if (containsAny(normalized, ["barrier", "isolation", "zoonotic", "ppe", "infection_control"])) add("barrier_isolation");
  if (containsAny(normalized, ["sedation", "anesthesia", "chemical_restraint"])) add("sedation_or_anesthesia");
  if (containsAny(normalized, ["sampling", "sample", "collection", "low_volume", "site_specific"])) add("sampling_plan");
  if (containsAny(normalized, ["position", "floor", "supported", "warming", "warm_", "spinal", "head_safe", "oxygen_position"])) add("comfort_positioning");
  if (containsAny(normalized, [
    "staged", "short_visit", "repeat_visit", "video_first", "home_first", "separate_visits",
    "acclimatization_visit", "brief_", "followup", "recheck", "home_log", "owner_log",
    "remote_", "longitudinal", "conditioning", "photo_measurement", "report_review", "records"
  ])) add("staged_visit");
  if (containsAny(normalized, [
    "minimal", "no_forced", "stop_forced", "low_manipulation", "gentle", "low_stress",
    "stress_minimized", "telephone_triage", "transfer", "hands_off", "no_contact",
    "without_force", "feline_friendly", "cat_friendly", "pain_aware", "protect_ear",
    "diagnostic_quality_without_force"
  ])) add("minimal_handling");
  if (containsAny(normalized, ["specialist", "external", "referral", "handoff", "image_guided", "endoscopy", "imaging", "surgery"])) add("specialist_or_external");
  if (!classes.length) add("low_stress_general");
  const primaryActionClassId = classes.find((id) => id !== "specialist_or_external") || classes[0];
  const routeActionClassIds = classes.filter((id) => id === "specialist_or_external" || id === "barrier_isolation");
  const requiredCapabilities = uniqueSorted(classes.flatMap((id) => classById.get(id).resourceRequirements));
  const safeRouteIds = uniqueSorted(classes.flatMap((id) => classById.get(id).safeAlternatives));
  return {
    sourceTag: tag,
    actionId: `handling_${tag}`,
    primaryActionClassId,
    actionClassIds: classes,
    routeActionClassIds,
    requiredCapabilities,
    safeRouteIds,
    decisionBasis: classes.length > 1 ? "explicit_compound_handling_plan" : "explicit_single_handling_plan",
    mappingAuthority: "author_explicit_crosswalk_v2"
  };
}

const ownerCrosswalk = [...ownerTags].sort().map(ownerDecision);
const temperamentCrosswalk = [...temperamentTags].sort().map(temperamentDecision);
const handlingCrosswalk = [...handlingTags].sort().map(handlingDecision);

const supplementalCapabilityCatalog = {
  schemaVersion: 1,
  catalogId: "vetgeme-p4-operational-requirements",
  catalogVersion: "2026.07.16.2",
  status: "author_complete_programmer_adapter_required",
  runtimeEligible: false,
  capabilities: [
    { capabilityId: "quiet_route", kind: "workflow", authority: "p5.scheduler", resolver: { anyRoomCapability: ["room.consult", "room.waiting"], staffCapability: "task.low_stress" } },
    { capabilityId: "scheduled_recheck_slot", kind: "schedule", authority: "p5.scheduler", resolver: { command: "schedule_followup", requiresCapacity: true } },
    { capabilityId: "referral_coordination", kind: "workflow", authority: "p5.scheduler", resolver: { staffCapability: "task.referral_coordination", roomCapability: "room.reception" } },
    { capabilityId: "sampling_plan", kind: "workflow", authority: "p5.scheduler", resolver: { staffCapability: "task.sampling", anyRoomCapability: ["room.sampling_basic", "room.lab"] } },
    { capabilityId: "comfort_surface", kind: "room_feature", authority: "p5.roomState", resolver: { anyRoomCapability: ["room.consult", "room.short_stay"] } },
    { capabilityId: "infection_control_capacity", kind: "workflow", authority: "p5.scheduler", resolver: { staffSkill: "trained_infection_control", roomCapability: "task.isolation", inventoryCategoryId: "infection_control" } },
    { capabilityId: "reviewed_sedation_protocol", kind: "staff_protocol", authority: "p5.staffAndShiftState", resolver: { staffSkill: "trained_anesthesia", roomCapability: "task.anesthesia" } },
    { capabilityId: "monitoring_capacity", kind: "equipment_or_referral", authority: "p5.scheduler", resolver: { anyCapabilityId: ["vital_monitor", "pulse_oximeter"], fallbackRouteId: "safe_referral" } }
  ],
  safeRoutes: [
    { routeId: "safe_referral", providerResolver: "p3.researchRoute.primaryProviderId_or_ref_specialist_network", factOwner: "medical_family_result_only", command: "create_referral_task" },
    { routeId: "regulated_referral", providerId: "ref_public_health", factOwner: "medical_family_result_only", command: "create_regulated_referral_task" },
    { routeId: "external_sampling_referral", providerResolver: "p3.researchRoute.primaryProviderId_or_ref_clinical_pathology", factOwner: "medical_family_result_only", command: "create_external_sampling_task" }
  ]
};

function firstExplicitRule(value, rules, label) {
  const normalized = String(value).toLowerCase();
  const matched = rules.find((rule) => rule.matchTokens.length > 0 && rule.matchTokens.some((token) => normalized.includes(token)))
    || rules.find((rule) => rule.matchTokens.length === 0);
  if (!matched) throw new Error(`No author rule for ${label} ${value}.`);
  return matched;
}

const serviceById = new Map(p6.servicePrices.map((item) => [item.serviceId, item]));
const explicitCapabilityEconomics = capabilityRegistry.capabilities.map((capability) => {
  const serviceRule = firstExplicitRule(capability.id, p6.serviceClassRules, "service");
  const service = serviceById.get(serviceRule.serviceId);
  const inventoryRule = capability.type === "consumable_set"
    ? firstExplicitRule(capability.id, p6.consumableMappingRules, "inventory")
    : null;
  const baseAsset = p6.assetPricingByType[capability.type] || null;
  const assetOverride = p6.assetOverrides.find((item) => item.capabilityId === capability.id) || null;
  const asset = baseAsset || assetOverride ? { ...(baseAsset || {}), ...(assetOverride || {}) } : null;
  return {
    capabilityId: capability.id,
    capabilityType: capability.type,
    serviceId: service.serviceId,
    price: service.price,
    variableCost: service.variableCost,
    durationMinutes: service.durationMinutes,
    inventoryPolicy: inventoryRule ? { categoryId: inventoryRule.categoryId, unitsPerUse: inventoryRule.unitsPerUse } : null,
    assetPolicy: asset ? {
      assetCatalogId: `asset_${capability.id}`,
      purchasePrice: asset.purchasePrice,
      deliveryDays: asset.deliveryDays,
      trainingMinutes: asset.trainingMinutes,
      maintenanceIntervalDays: asset.maintenanceIntervalDays,
      maintenanceCost: asset.maintenanceCost,
      startsOwned: Boolean(asset.startsOwned),
      visualPresenceGrantsOwnership: false
    } : null,
    decisionBasis: "author_frozen_exact_capability_mapping_v2"
  };
});

writeJson("source/p3-explicit-research-routes.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p3-explicit-research-routes",
  catalogVersion: "2026.07.16.2",
  sourceMedicalPackageVersion: medicalManifest.packageVersion,
  status: "author_complete_programmer_adapter_required",
  runtimeEligible: false,
  researchRoutes
});

writeJson("source/p4-explicit-behavior-crosswalk.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p4-explicit-behavior-crosswalk",
  catalogVersion: "2026.07.16.2",
  sourceMedicalPackageVersion: medicalManifest.packageVersion,
  status: "author_complete_programmer_adapter_required",
  runtimeEligible: false,
  ownerModifiers: ownerCrosswalk,
  temperamentTags: temperamentCrosswalk,
  handlingAlternatives: handlingCrosswalk
});

writeJson("source/p4-operational-requirements.json", supplementalCapabilityCatalog);

writeJson("source/p6-explicit-capability-economics.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p6-explicit-capability-economics",
  catalogVersion: "2026.07.16.2",
  status: "author_complete_product_owner_balance_acceptance_required",
  runtimeEligible: false,
  mappings: explicitCapabilityEconomics
});

const countBy = (items, key) => Object.fromEntries(
  [...new Set(items.map((item) => item[key]))].sort().map((value) => [value, items.filter((item) => item[key] === value).length])
);

writeJson("reports/AUTHOR_DECISION_MATRIX.json", {
  schemaVersion: 1,
  reportId: "vetgeme-operational-v2-author-decision-matrix",
  reportVersion: "2026.07.16.2",
  medicalPackageVersion: medicalManifest.packageVersion,
  counts: {
    researchRoutes: researchRoutes.length,
    localResearchRoutes: researchRoutes.filter((item) => item.routeMode === "local").length,
    externalResearchRoutes: researchRoutes.filter((item) => item.routeMode === "external").length,
    explicitFallbacks: researchRoutes.filter((item) => item.fallbackRouteId).length,
    ownerModifiers: ownerCrosswalk.length,
    temperamentTags: temperamentCrosswalk.length,
    handlingAlternatives: handlingCrosswalk.length,
    supplementalOperationalCapabilities: supplementalCapabilityCatalog.capabilities.length,
    explicitCapabilityEconomics: explicitCapabilityEconomics.length
  },
  ownerArchetypeDistribution: countBy(ownerCrosswalk, "archetypeId"),
  temperamentDistribution: countBy(temperamentCrosswalk, "archetypeId"),
  handlingPrimaryDistribution: countBy(handlingCrosswalk, "primaryActionClassId"),
  gates: {
    substringMatchingAllowedAtRuntime: false,
    generatedFallbackAllowed: false,
    medicalResultGenerationAllowed: false,
    missingCapabilityFailsClosed: true,
    safeReferralRetained: true
  }
});

console.log(JSON.stringify({
  medicalPackageVersion: medicalManifest.packageVersion,
  researchRoutes: researchRoutes.length,
  ownerModifiers: ownerCrosswalk.length,
  temperamentTags: temperamentCrosswalk.length,
  handlingAlternatives: handlingCrosswalk.length
}, null, 2));
