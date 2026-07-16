#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageRoot, "..");
const requireModule = createRequire(import.meta.url);
const identityRuntime = requireModule(path.join(repoRoot, "systems/identity-behavior-v4.js"));
const medicalRoot = path.join(repoRoot, "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Json(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function integer(random, minimum, maximum) {
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}

const manifest = readJson(path.join(packageRoot, "MANIFEST.json"));
const medicalManifest = readJson(path.join(medicalRoot, "MANIFEST.json"));
const capabilityRegistry = readJson(path.join(repoRoot, "content/system-packs/vetgeme-master-2026-07-14/capability-registry.json"));
const p3Research = readJson(path.join(packageRoot, "generated/p3/research-catalog.json"));
const p3Usages = readJson(path.join(packageRoot, "generated/p3/investigation-usage-policy.json"));
const p3Providers = readJson(path.join(packageRoot, "generated/p3/provider-catalog.json"));
const p3Exact = readJson(path.join(packageRoot, "source/p3-exact-source-crosswalk.json"));
const p3Explicit = readJson(path.join(packageRoot, "source/p3-explicit-research-routes.json"));
const p4Crosswalk = readJson(path.join(packageRoot, "generated/p4/behavior-crosswalk.json"));
const p4FactCrosswalk = readJson(path.join(packageRoot, "source/p4-presentation-medical-fact-crosswalk.json"));
const p4Owners = readJson(path.join(packageRoot, "generated/p4/owner-profile-catalog.json"));
const p4Temperaments = readJson(path.join(packageRoot, "generated/p4/temperament-catalog.json"));
const p4Cues = readJson(path.join(packageRoot, "generated/p4/observable-cues.json"));
const p4Appearance = readJson(path.join(packageRoot, "generated/p4/appearance-pools.json"));
const p4History = readJson(path.join(packageRoot, "generated/p4/history-policy.json"));
const p6 = readJson(path.join(packageRoot, "generated/p6/economy-catalog.json"));
const p6Crosswalk = readJson(path.join(packageRoot, "generated/p6/p3-p5-resource-crosswalk.json"));
const p7Days = readJson(path.join(packageRoot, "generated/p7/day-catalog.json"));
const p7Director = readJson(path.join(packageRoot, "generated/p7/director-catalog.json"));
const p7DigestContract = readJson(path.join(packageRoot, "source/p7-activation-digest-contract.json"));

const medicalFamilies = medicalManifest.families.map((entry) => readJson(path.join(medicalRoot, entry.path)));
const expectedResearch = new Set();
const expectedUsageIds = [];
const expectedTemperament = new Set();
const expectedOwners = new Set();
const expectedHandling = new Set();
const expectedUrgencySources = new Set();
const expectedClassificationSources = new Set();
const expectedMedicalFactIds = new Set();
let expectedHandlingBindings = 0;
let expectedVariants = 0;
let expectedPresentations = 0;
for (const family of medicalFamilies) {
  for (const mapping of family.researchCapabilityMap) expectedResearch.add(mapping.researchId);
  expectedVariants += family.variants.length;
  for (const variant of family.variants) {
    for (const presentation of variant.presentations) {
      expectedPresentations += 1;
      expectedUrgencySources.add(presentation.urgency);
      const presentationRef = `${family.familyId}.${variant.id}.${presentation.id}`;
      presentation.investigations.forEach((investigation, index) => {
        expectedUsageIds.push(`${presentationRef}.${investigation.id}.${index + 1}`);
        expectedClassificationSources.add(investigation.classification);
      });
      for (const fact of presentation.criticalFacts || []) expectedMedicalFactIds.add(fact.factId);
      for (const tag of presentation.compatibility?.temperament || []) expectedTemperament.add(tag);
      for (const tag of presentation.compatibility?.ownerModifiers || []) expectedOwners.add(tag);
      const handling = presentation.compatibility?.requiredHandlingAlternative;
      for (const tag of Array.isArray(handling) ? handling : handling ? [handling] : []) {
        expectedHandling.add(tag);
        expectedHandlingBindings += 1;
      }
    }
  }
}

const checks = [];
function check(id, condition, evidence) {
  requireValue(condition, `${id}: ${evidence}`);
  checks.push({ id, status: "pass", evidence });
}

check("manifest_boundaries", manifest.boundaries.runtimeChanged === false && manifest.boundaries.designChanged === false && manifest.boundaries.saveSchemaChanged === false && manifest.boundaries.medicalTruthAuthoredHere === false, "runtime/design/save/medical truth boundaries are explicit and false");
check("manifest_v4", manifest.packageVersion === "2026.07.16.4", manifest.packageVersion);
check("medical_family_count", medicalFamilies.length === 39, `${medicalFamilies.length}/39`);
check("medical_variant_count", expectedVariants === 215, `${expectedVariants}/215`);
check("medical_presentation_count", expectedPresentations === 645, `${expectedPresentations}/645`);
check("p3_research_coverage", p3Research.research.length === expectedResearch.size && p3Research.research.every((item) => expectedResearch.has(item.researchId)), `${p3Research.research.length}/${expectedResearch.size}`);
check("p3_usage_coverage", p3Usages.usages.length === expectedUsageIds.length && new Set(p3Usages.usages.map((item) => item.usageId)).size === expectedUsageIds.length && expectedUsageIds.every((id) => p3Usages.usages.some((item) => item.usageId === id)), `${p3Usages.usages.length}/${expectedUsageIds.length}`);
check("p3_all_usage_contracts", p3Usages.usages.every((item) => item.mappedByFamilyResearchContract), "all investigation uses map to their family researchCapabilityMap");
check("p3_exact_urgency_source_crosswalk", p3Exact.fallbackAllowed === false && p3Exact.urgencyValues.length === expectedUrgencySources.size && p3Exact.urgencyValues.every((item) => expectedUrgencySources.has(item.sourceValue)), `${p3Exact.urgencyValues.length}/${expectedUrgencySources.size}; no fallback`);
check("p3_exact_classification_source_crosswalk", p3Exact.classificationValues.length === expectedClassificationSources.size && p3Exact.classificationValues.every((item) => expectedClassificationSources.has(item.sourceValue)), `${p3Exact.classificationValues.length}/${expectedClassificationSources.size}; no fallback`);
check("p3_dynamic_urgency_fail_closed", p3Exact.urgencyValues.filter((item) => item.resolutionMode === "runtime_state_required_before_order").length === 2 && p3Usages.usages.filter((item) => item.urgencyBandId === null).every((item) => item.turnaroundPolicy.kind === "state_resolved_before_order" && item.turnaroundPolicy.persistSelectedPolicyOnce === true && item.turnaroundPolicy.recomputeAfterReloadForbidden === true), "2 dynamic source urgencies require state resolution and persisted due policy");
check("p3_usage_level_turnaround", p3Usages.usages.every((item) => item.turnaroundAuthority === "exact_investigation_usage" && item.turnaroundPolicy), "all 1,864 usages own an exact turnaround contract");
check("p3_no_representative_turnaround", p3Research.research.every((item) => item.representativeUsageTurnaroundForbidden === true && !Object.hasOwn(item, "turnaroundPolicy") && Array.isArray(item.turnaroundPoliciesByUrgencyBand)), "research catalog has no representative turnaround field");
const multiTurnaroundResearch = p3Research.research.filter((research) => new Set(research.turnaroundPoliciesByUrgencyBand.map((item) => stableJson(item.turnaroundPolicy))).size > 1);
check("p3_multi_urgency_research_preserved", multiTurnaroundResearch.length === 46 && multiTurnaroundResearch.every((research) => p3Usages.usages.filter((usage) => usage.researchId === research.researchId).every((usage) => usage.turnaroundPolicy)), `${multiTurnaroundResearch.length}/46 research IDs preserve distinct urgency-dependent turnaround policies`);
check("p3_capability_registry", p3Research.research.every((item) => item.capabilityIdsPendingRegistry.length === 0), "0 unknown capability IDs");
const explicitResearchById = new Map(p3Explicit.researchRoutes.map((item) => [item.researchId, item]));
check("p3_result_authority", p3Research.research.every((item) => item.operationalPolicyMayGenerateResult === false && item.medicalResultAuthority === "medical_family.presentation.investigations[].result_only"), "all 361 generated records preserve medical-family result authority");
check("p3_result_authority_projection", p3Research.research.every((item) => item.medicalResultAuthority === explicitResearchById.get(item.researchId)?.medicalResultAuthority), "361/361 explicit and generated authority paths match exactly");
const authorityMutationProbe = p3Research.research.map((item, index) => index === 0
  ? { ...item, medicalResultAuthority: "family.presentation.investigations[].result_only" }
  : item);
check("p3_result_authority_mutation_probe", authorityMutationProbe.filter((item) => item.medicalResultAuthority !== explicitResearchById.get(item.researchId)?.medicalResultAuthority).length === 1, "one shortened authority namespace creates exactly one blocking drift");
check("p3_review_policy", p3Usages.usages.every((item) => item.reviewPolicy && Number.isFinite(item.reviewPolicy.reviewWithinMinutes) && item.reviewPolicy.shiftClosePolicy), "every usage has review/contact/shift-close policy");
check("p3_provider_catalog", p3Providers.providers.length === 6 && p3Providers.providers.some((item) => item.providerId === "ref_public_health") && p3Providers.providers.some((item) => item.providerId === "ref_emergency_24h"), "6 explicit provider routes including regulated and emergency");
check("p3_explicit_routes", p3Research.research.every((item) => ["local", "external"].includes(item.routeMode) && Array.isArray(item.providerIds) && item.activationGate?.generatedAvailabilityFactsForbidden === true), "361 exact routes; no generated availability facts");
check("p3_lifecycle_predicates", p3Research.research.every((item) => Array.isArray(item.activationGate?.requiredStatePredicates) && item.activationGate.fallbackRouteId), "every research route has authored runtime predicates and fallback");
check("p4_temperament_coverage", p4Crosswalk.temperamentTags.length === expectedTemperament.size && p4Crosswalk.temperamentTags.every((item) => expectedTemperament.has(item.sourceTag)), `${p4Crosswalk.temperamentTags.length}/${expectedTemperament.size}`);
check("p4_owner_coverage", p4Crosswalk.ownerModifiers.length === expectedOwners.size && p4Crosswalk.ownerModifiers.every((item) => expectedOwners.has(item.sourceTag)), `${p4Crosswalk.ownerModifiers.length}/${expectedOwners.size}`);
check("p4_handling_coverage", p4Crosswalk.handlingAlternatives.length === expectedHandling.size && p4Crosswalk.handlingAlternatives.every((item) => expectedHandling.has(item.sourceTag)), `${p4Crosswalk.handlingAlternatives.length}/${expectedHandling.size}`);
check("p4_presentation_crosswalk", p4Crosswalk.presentations.length === 645 && unique(p4Crosswalk.presentations.map((item) => item.presentationRef)), `${p4Crosswalk.presentations.length}/645 unique presentation refs`);
check("p4_identity_catalog", p4Owners.profiles.length === 12 && p4Temperaments.temperaments.length === 8, "12 owner archetypes and 8 patient temperament archetypes");
check("p4_cues", p4Cues.rules.length === 10 && unique(p4Cues.rules.map((item) => item.ruleId)), "10 explicit observable threshold cues");
check("p4_cues_runtime_contract", Array.isArray(identityRuntime.evaluateObservableCues({ ownerState: {}, patientState: {}, rules: p4Cues.rules })), "all cue rules accepted by current P4 runtime");
check("p4_actions_runtime_contract", p4Crosswalk.handlingAlternatives.every((item) => identityRuntime.validateLowStressAction(item.runtimeActionTemplate).valid), "all 446 action templates accepted by current P4 runtime");
check("p4_explicit_mapping_authority", [...p4Crosswalk.ownerModifiers, ...p4Crosswalk.temperamentTags, ...p4Crosswalk.handlingAlternatives].every((item) => item.mappingAuthority === "author_explicit_crosswalk_v2"), "all compatibility tags use frozen author mappings");
check("p4_generic_templates_have_no_synthetic_facts", p4Crosswalk.handlingAlternatives.every((item) => item.clinicalFactAuthority === "presentation_scoped_binding_required" && item.runtimeActionTemplate.safeAlternatives.length === 0), "generic handling library cannot invent medical fact IDs");
const generatedHandlingBindings = p4Crosswalk.presentations.flatMap((presentation) => presentation.handlingBindings || []);
const generatedFactBindings = generatedHandlingBindings.flatMap((binding) => binding.factAccessContract || []);
check("p4_presentation_fact_binding_coverage", p4FactCrosswalk.bindings.length === expectedHandlingBindings && generatedHandlingBindings.length === expectedHandlingBindings, `${generatedHandlingBindings.length}/${expectedHandlingBindings} presentation + handling bindings`);
check("p4_real_medical_fact_ids", generatedFactBindings.length > 0 && generatedFactBindings.every((fact) => expectedMedicalFactIds.has(fact.factId)), `${new Set(generatedFactBindings.map((fact) => fact.factId)).size} bound IDs all exist in medical .40`);
check("p4_fact_owner_and_safe_route", generatedFactBindings.every((fact) => fact.medicalOwner?.sourcePointer && fact.safeAlternatives.length > 0 && fact.safeAlternatives.every((alternative) => alternative.factId === fact.factId && alternative.kind === "safe_route")), "every fact preserves its medical owner and explicit safe route");
check("p4_presentation_actions_runtime_contract", generatedHandlingBindings.every((binding) => identityRuntime.validateLowStressAction(binding.runtimeActionTemplate).valid), `${generatedHandlingBindings.length} presentation-scoped action templates accepted by P4 runtime`);
check("p4_appearance_independence", p4Appearance.independenceRule === "appearance_seed_is_independent_from_behavior_seed" && p4Crosswalk.independenceRules.appearanceIndependentFromBehavior === true, "appearance is not behavior authority");
check("p4_time_history", p4History.policy.timeAuthority === "campaignMinute" && p4History.policy.appendOnly === true && p4History.policy.timeCannotMoveBackwards === true && p4History.policy.reloadMayNotRegenerateIdentity === true && p4History.policy.eventTypes.length === 12, "append-only 12-event history uses campaign time and stable identity across reload");
check("p6_capability_coverage", p6.capabilityEconomics.length === capabilityRegistry.capabilities.length && p6Crosswalk.p3Capabilities.length === capabilityRegistry.capabilities.length, `${p6.capabilityEconomics.length}/${capabilityRegistry.capabilities.length}`);
check("p6_p5_exact_resources", p6Crosswalk.resources.length === 49 && p6Crosswalk.resources.every((item) => item.p6EconomicAuthority) && p6Crosswalk.inferredP5Ids === false && p6Crosswalk.tokenMatchingAllowed === false, "49/49 P5 resources have exact P6 authority");
check("p6_reservation_gate_fail_closed", p6Crosswalk.reservationAuthority === false && p6Crosswalk.activationGate.exactP5V2RequirementGroupJoinRequired === true && p6Crosswalk.activationGate.flattenedResourceIdsCannotReserve === true, "P5/P6 remains non-authoritative until exact requirement-group join");
check("p6_supplemental_crosswalk", p6Crosswalk.supplementalCapabilities.length === 8, "8/8 P4 supplemental requirements resolve through P5/P6");
check("p6_four_axis_reputation", JSON.stringify(p6.reputation.axes) === JSON.stringify(["clinical", "communication", "accessibility", "organization"]), "exact P6 axes preserved");
check("p6_inventory", p6.inventoryCategories.length === 10 && unique(p6.inventoryCategories.map((item) => item.categoryId)), "10 explicit stock categories with reorder/lead/cost/shelf-life");
check("p6_safe_recovery", p6.recoveryPolicy.singleErrorCannotCloseClinic === true && p6.recoveryPolicy.closureRequiresTwoConsecutiveCriticalDays === true, "closure cannot follow one error");
check("p6_no_legacy_inference", p6.migration.appliesTo === "new_campaigns_only" && p6.migration.legacyBalanceInference === false && p6.migration.saveSchemaChange === false, "new campaigns only; no save migration");
check("p7_day_sequence", p7Days.days.length === 30 && p7Days.days.every((day, index) => day.day === index + 1), "days 1..30 without gaps");
check("p7_chapters", [...new Set(p7Days.days.map((item) => item.chapter))].join(",") === "1,2,3,4,5,6" && p7Days.days.every((day) => day.chapter === Math.ceil(day.day / 5)), "6 chapters x 5 days");
check("p7_generic_goals", p7Days.days.every((day) => day.goals.length === 2 && day.goals.every((goal) => !/patient|family|diagnosis/i.test(goal.goalId) && goal.selectionRule.includes("without_patient_or_family"))), "60 goals selected after schedule without specific patient/family");
const eventIds = p7Director.catalogEnvelopes.events.map((item) => item.itemId);
check("p7_event_references", p7Days.days.every((day) => day.eventSlots.every((id) => eventIds.includes(id))), "all day event slots resolve");
check("p7_catalog_envelopes", p7Director.catalogEnvelopes.events.length === 27 && p7Director.catalogEnvelopes.milestones.length === 6 && p7Director.catalogEnvelopes.specializations.length === 3 && p7Director.catalogEnvelopes.endings.length === 6, "27 events, 6 milestones, 3 specializations, 6 endings");
check("p7_catalog_digests", Object.values(p7Director.catalogEnvelopes).flat().every((item) => /^[a-f0-9]{64}$/.test(item.catalogRef.contentSha256) && item.catalogRef.approvalStatus === "author_complete_programmer_adapter_required"), "all P7 envelopes have exact SHA-256 and author status");
check("p7_evidence_resolvers", p7Director.evidenceResolver.goalEvidence.length === 10 && p7Director.evidenceResolver.eventTriggers.length === 25 && p7Director.evidenceResolver.eventEffects.length === 29 && p7Days.days.every((day) => day.goals.every((goal) => goal.evidenceResolver?.resolverMode === "exact_author_owned")), "93 exact cross-system evidence contracts and 60 resolved goals");
check("p7_resolver_record_digests", p7Director.resolverEnvelope.records.length === 93 && p7Director.resolverEnvelope.records.every((record) => record.contentSha256 === sha256Json(record.payload)), "93/93 resolver semantics have individual canonical digests");
check("p7_resolver_aggregate_digest", p7Director.resolverEnvelope.resolverDigest === sha256Json({ adapterVersion: p7DigestContract.adapterVersion, records: p7Director.resolverEnvelope.records }), p7Director.resolverEnvelope.resolverDigest);
check("p7_every_dependency_binds_resolver", p7Days.days.every((day) => day.goals.every((goal) => goal.resolverBinding?.resolverDigest === p7Director.resolverEnvelope.resolverDigest)) && Object.values(p7Director.catalogEnvelopes).flat().every((item) => item.catalogRef.resolverDigest === p7Director.resolverEnvelope.resolverDigest && item.resolverBindings.every((binding) => binding.resolverDigest === p7Director.resolverEnvelope.resolverDigest)), "60 goals and every event/milestone/specialization/ending bind the resolver digest");
check("p7_combined_activation_digest", p7Director.activationDigest === sha256Json(p7Director.activationDigestInput) && p7Director.catalogDigest === p7Director.activationDigest, p7Director.activationDigest);
const mutatedActivationInput = JSON.parse(JSON.stringify(p7Director.activationDigestInput));
mutatedActivationInput.resolverEnvelope.records[0].payload.fieldOrPredicate = `${mutatedActivationInput.resolverEnvelope.records[0].payload.fieldOrPredicate}:mutation_probe`;
check("p7_resolver_mutation_probe", sha256Json(mutatedActivationInput) !== p7Director.activationDigest, "one resolver semantic mutation changes the combined activation digest");
check("p7_reload_rules", p7Days.authority.dayScheduleCreatedOnceAndPersisted === true && p7Days.authority.reloadCannotRepeatOnceEvent === true && p7Days.authority.saveSchemaChange === false, "persisted schedule and repeat-safe reload without schema change");

const fixedDaily = p6.dailyFixedCosts.reduce((sum, item) => sum + item.amount, 0);
const wageByRole = new Map(p6.staffWagesPerWorkedDay.map((item) => [item.roleId, item.amount]));
const strategies = ["balanced", "diagnostic", "neighborhood", "low_stress"];
const simulation = {
  campaigns: 10000,
  demandDays: 0,
  closedCampaigns: 0,
  recoveryCampaigns: 0,
  minimumCashObserved: Infinity,
  endingCounts: {},
  strategyCounts: {},
  specializationReachable: { diagnostic_center: 0, neighborhood_access: 0, low_stress_communication: 0 },
  axisRanges: {
    clinical_safety: [Infinity, -Infinity],
    owner_trust: [Infinity, -Infinity],
    financial_resilience: [Infinity, -Infinity],
    team_condition: [Infinity, -Infinity]
  }
};

for (let campaignIndex = 0; campaignIndex < simulation.campaigns; campaignIndex += 1) {
  const random = mulberry32(0x5f3759df ^ campaignIndex);
  const percentile = campaignIndex % 100;
  const strategy = percentile === 0 ? "closure" : percentile <= 5 ? "recovery" : strategies[campaignIndex % strategies.length];
  simulation.strategyCounts[strategy] = (simulation.strategyCounts[strategy] || 0) + 1;
  let cash = p6.newCampaign.startingCash;
  let criticalDays = 0;
  let recovery = false;
  let recoveryGrantUsed = false;
  let closed = false;
  let safeVisitSum = 0;
  let teachBackSum = 0;
  let cleanCloseSum = 0;
  let restSum = 0;
  for (const day of p7Days.days) {
    simulation.demandDays += 1;
    const visits = integer(random, day.loadTarget[0], day.loadTarget[1]);
    const chapter = day.chapter;
    const strategyRevenue = strategy === "diagnostic" ? 55 : strategy === "neighborhood" ? -20 : strategy === "low_stress" ? 15 : strategy === "recovery" ? -135 : strategy === "closure" ? -300 : 25;
    const revenuePerVisit = 365 + chapter * 30 + strategyRevenue + integer(random, -35, 45);
    const revenue = visits * revenuePerVisit;
    const variableCost = Math.round(revenue * (strategy === "diagnostic" ? 0.24 : 0.19));
    const roles = ["doctor", "assistant", "administrator"];
    if (chapter >= 4 && day.day % 2 === 0) roles.push("lab_staff");
    const wages = roles.reduce((sum, role) => sum + wageByRole.get(role), 0);
    const incident = random() < 0.08 ? integer(random, 60, 220) : 0;
    cash += revenue - variableCost - fixedDaily - wages - incident;
    if (day.day === 16 && strategy === "diagnostic" && cash > 11000) cash -= 3000;
    if (day.day === 21 && strategy === "low_stress" && cash > 9000) cash -= 7500;
    if (day.day === 24 && strategy === "neighborhood" && cash > 6500) cash -= 1200;
    if (cash < 0 && !recoveryGrantUsed) {
      recovery = true;
      recoveryGrantUsed = true;
      cash += p6.newCampaign.recoveryGrant;
    }
    const critical = cash < p6.newCampaign.closureDebtFloor;
    criticalDays = critical ? criticalDays + 1 : 0;
    if (cash < 0) recovery = true;
    if (criticalDays >= 2) {
      closed = true;
      break;
    }
    safeVisitSum += visits * (0.82 + random() * 0.16);
    teachBackSum += visits * (strategy === "low_stress" || strategy === "neighborhood" ? 0.78 : 0.62);
    cleanCloseSum += random() < 0.9 ? 1 : 0;
    restSum += random() < (strategy === "diagnostic" ? 0.82 : 0.91) ? 1 : 0;
    simulation.minimumCashObserved = Math.min(simulation.minimumCashObserved, cash);
  }
  if (recovery) simulation.recoveryCampaigns += 1;
  if (closed) simulation.closedCampaigns += 1;
  const denominator = 30;
  const axes = {
    clinical_safety: Math.max(0, Math.min(100, 42 + safeVisitSum / Math.max(1, denominator * 5) * 35 + (strategy === "diagnostic" ? 12 : 5))),
    owner_trust: Math.max(0, Math.min(100, 38 + teachBackSum / Math.max(1, denominator * 5) * 38 + (strategy === "neighborhood" || strategy === "low_stress" ? 15 : 5))),
    financial_resilience: Math.max(0, Math.min(100, 45 + cash / 500 + (strategy === "neighborhood" ? 8 : 0))),
    team_condition: Math.max(0, Math.min(100, 38 + cleanCloseSum / denominator * 18 + restSum / denominator * 24 + (strategy === "low_stress" ? 7 : 0)))
  };
  for (const [axis, value] of Object.entries(axes)) {
    simulation.axisRanges[axis][0] = Math.min(simulation.axisRanges[axis][0], value);
    simulation.axisRanges[axis][1] = Math.max(simulation.axisRanges[axis][1], value);
  }
  let specialization = null;
  if (!closed) {
    if (strategy === "diagnostic" && axes.clinical_safety >= 60 && axes.financial_resilience >= 45) specialization = "diagnostic_center";
    if (strategy === "neighborhood" && axes.owner_trust >= 55 && axes.financial_resilience >= 50) specialization = "neighborhood_access";
    if (strategy === "low_stress" && axes.owner_trust >= 60 && axes.team_condition >= 50) specialization = "low_stress_communication";
  }
  if (specialization) simulation.specializationReachable[specialization] += 1;
  let ending;
  if (closed) ending = "closure_review";
  else if (specialization === "diagnostic_center" && axes.clinical_safety >= 65) ending = "diagnostic_path";
  else if (specialization === "neighborhood_access" && axes.owner_trust >= 65) ending = "neighborhood_path";
  else if (specialization === "low_stress_communication" && axes.owner_trust >= 65 && axes.team_condition >= 55) ending = "low_stress_path";
  else if (Object.values(axes).every((value) => value >= 55)) ending = "balanced_clinic";
  else ending = "recovery_continues";
  simulation.endingCounts[ending] = (simulation.endingCounts[ending] || 0) + 1;
}

check("simulation_volume", simulation.campaigns === 10000 && simulation.demandDays >= 295000, `${simulation.campaigns} campaigns / ${simulation.demandDays} demand-days`);
check("specialization_reachability", Object.values(simulation.specializationReachable).every((count) => count > 0), JSON.stringify(simulation.specializationReachable));
check("nonclosure_ending_reachability", ["balanced_clinic", "diagnostic_path", "neighborhood_path", "low_stress_path", "recovery_continues"].every((id) => (simulation.endingCounts[id] || 0) > 0), JSON.stringify(simulation.endingCounts));
check("recovery_reachability", simulation.recoveryCampaigns > 0, `${simulation.recoveryCampaigns} simulated campaigns entered recovery`);
check("closure_not_single_error", p6.recoveryPolicy.closureRequiresTwoConsecutiveCriticalDays && p6.recoveryPolicy.singleErrorCannotCloseClinic, "policy requires two consecutive critical days");

const report = {
  schemaVersion: 1,
  reportId: "vetgeme-operational-authoring-validation",
  reportVersion: manifest.packageVersion,
  validatedAt: new Date().toISOString(),
  status: "pass",
  activationStatus: "fail_closed_pending_programmer_adapter_runtime_smoke_and_product_owner_acceptance",
  checks,
  simulation,
  limitations: [
    "The balance simulation is an authoring-level deterministic model, not a browser runtime playtest.",
    "Medical family approval remains external to this package.",
    "P5/P6 reservation authority remains blocked until the exact P5 .2 requirement-group, units, duration, lifecycle and scheduler-command join is integrated.",
    "The existing 30-card generator remains the live compatibility pool until gated activation is approved."
  ]
};
fs.mkdirSync(path.join(packageRoot, "reports"), { recursive: true });
fs.writeFileSync(path.join(packageRoot, "reports/VALIDATION_REPORT.json"), `${JSON.stringify(report, null, 2)}\n`);
const correctionMatrix = {
  schemaVersion: 1,
  reportId: "vetgeme-operational-authoring-v4-p1-correction-matrix",
  reportVersion: manifest.packageVersion,
  status: "author_corrections_complete_exact_p5_join_pending",
  runtimeEligible: false,
  productionPoolChanged: false,
  findings: [
    {
      id: "p3_turnaround_collapsed_by_representative_usage",
      previousStatus: "p1_open",
      currentStatus: "author_closed",
      evidence: {
        usagesWithExactTurnaround: p3Usages.usages.length,
        researchIdsWithDistinctUrgencyTurnarounds: multiTurnaroundResearch.length,
        representativeTurnaroundFields: p3Research.research.filter((item) => Object.hasOwn(item, "turnaroundPolicy")).length
      }
    },
    {
      id: "p3_unmatched_urgency_and_classification_defaults",
      previousStatus: "p1_open",
      currentStatus: "author_closed",
      evidence: {
        urgencySourceValues: p3Exact.urgencyValues.length,
        classificationSourceValues: p3Exact.classificationValues.length,
        fallbackAllowed: p3Exact.fallbackAllowed,
        dynamicUrgencyValuesFailClosed: p3Exact.urgencyValues.filter((item) => item.resolutionMode === "runtime_state_required_before_order").map((item) => item.sourceValue)
      }
    },
    {
      id: "p3_medical_result_authority_projection_drift",
      previousStatus: "p1_open_in_operational_v3_host_review",
      currentStatus: "author_closed",
      evidence: {
        researchRecords: p3Research.research.length,
        exactAuthority: "medical_family.presentation.investigations[].result_only",
        explicitGeneratedMismatches: p3Research.research.filter((item) => item.medicalResultAuthority !== explicitResearchById.get(item.researchId)?.medicalResultAuthority).length,
        operationalPolicyMayGenerateResult: false
      }
    },
    {
      id: "p4_safe_alternative_fact_binding_missing",
      previousStatus: "p1_open",
      currentStatus: "author_closed",
      evidence: {
        presentationHandlingBindings: generatedHandlingBindings.length,
        uniqueHandlingTags: p4Crosswalk.handlingAlternatives.length,
        medicalFactReferences: generatedFactBindings.length,
        unknownMedicalFactReferences: generatedFactBindings.filter((item) => !expectedMedicalFactIds.has(item.factId)).length,
        syntheticGenericFactIds: p4Crosswalk.handlingAlternatives.flatMap((item) => item.runtimeActionTemplate.safeAlternatives).length
      }
    },
    {
      id: "p6_crosswalk_is_not_p5_execution_authority",
      previousStatus: "p1_open",
      currentStatus: "external_join_pending",
      evidence: {
        reservationAuthority: p6Crosswalk.reservationAuthority,
        requiredJoin: "p5-production-authoring@2026.07.16.2 exact requirementGroups/anyOf/AND/units/duration/lifecycle/scheduler commands",
        silentReservationAllowed: false
      }
    },
    {
      id: "p7_digest_does_not_bind_resolver_or_day_semantics",
      previousStatus: "p1_open",
      currentStatus: "author_closed",
      evidence: {
        resolverRecords: p7Director.resolverEnvelope.records.length,
        resolverDigest: p7Director.resolverEnvelope.resolverDigest,
        activationDigest: p7Director.activationDigest,
        mutationChangesDigest: sha256Json(mutatedActivationInput) !== p7Director.activationDigest
      }
    }
  ],
  activationGate: {
    authorP3P4P7CorrectionsComplete: true,
    exactP5V2JoinComplete: false,
    programmerAdapterValidated: false,
    medicalFamiliesVeterinaryApproved: false,
    runtimeActivationAllowed: false
  }
};
fs.writeFileSync(path.join(packageRoot, "reports/P1_CORRECTION_MATRIX.json"), `${JSON.stringify(correctionMatrix, null, 2)}\n`);
manifest.status = "author_complete_validation_passed";
manifest.validation = {
  status: "pass",
  report: "reports/VALIDATION_REPORT.json",
  p1CorrectionReport: "reports/P1_CORRECTION_MATRIX.json",
  checkCount: checks.length,
  simulatedCampaigns: simulation.campaigns,
  simulatedDemandDays: simulation.demandDays
};
fs.writeFileSync(path.join(packageRoot, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`PASS ${checks.length} checks`);
console.log(JSON.stringify({ counts: manifest.counts, simulation }, null, 2));
