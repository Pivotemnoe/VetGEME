#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageRoot, "..");
const medicalRoot = process.env.VETGEME_MEDICAL_ROOT || path.join(
  repoRoot,
  "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source"
);
const capabilityPath = path.join(repoRoot, "content/system-packs/vetgeme-master-2026-07-14/capability-registry.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(relativePath, value) {
  const file = path.join(packageRoot, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))].sort();
}

function sha256Json(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function urgencyBand(value, policy) {
  const text = String(value).toLowerCase();
  const ordered = ["emergency", "urgent", "priority", "scheduled", "routine"];
  for (const id of ordered) {
    const rule = policy.urgencyBands.find((item) => item.bandId === id);
    if (rule.matchTokens.some((token) => text.includes(token))) return rule;
  }
  return policy.urgencyBands.find((item) => item.bandId === "priority");
}

function classificationBand(value, policy) {
  const text = String(value).toLowerCase();
  for (const rule of policy.classificationBands) {
    if (rule.matchTokens.some((token) => text.includes(token))) return rule;
  }
  return policy.classificationBands.find((item) => item.bandId === "conditional");
}

function turnaroundFor(requirements, urgency, capabilityById, p3) {
  const external = requirements.map((id) => capabilityById.get(id)).filter((capability) => capability?.type === "external_service");
  if (!external.length) return { kind: "local", minutes: 0 };
  const candidates = external.map((capability) => {
    if (Array.isArray(capability.turnaroundDays)) {
      return { capabilityId: capability.id, kind: "working_day_range", minimumDays: capability.turnaroundDays[0], maximumDays: capability.turnaroundDays[1], deterministicRule: p3.clock.deterministicRangeRule };
    }
    const category = capability.turnaround || "contextual";
    const rule = p3.turnaroundCategories[category];
    if (!rule) throw new Error(`Missing authored turnaround category ${category} for ${capability.id}.`);
    return {
      capabilityId: capability.id,
      kind: "categorical_minutes",
      category,
      minutes: rule.minutes ?? rule.minutesByUrgencyBand[urgency.bandId]
    };
  });
  return { kind: "external", candidates };
}

const p3 = readJson(path.join(packageRoot, "source/p3-policy.json"));
const p4 = readJson(path.join(packageRoot, "source/p4-policy.json"));
const p6 = readJson(path.join(packageRoot, "source/p6-balance.json"));
const p7 = readJson(path.join(packageRoot, "source/p7-campaign.json"));
const p3Explicit = readJson(path.join(packageRoot, "source/p3-explicit-research-routes.json"));
const p4Explicit = readJson(path.join(packageRoot, "source/p4-explicit-behavior-crosswalk.json"));
const p4Operational = readJson(path.join(packageRoot, "source/p4-operational-requirements.json"));
const p6Explicit = readJson(path.join(packageRoot, "source/p6-explicit-capability-economics.json"));
const p6P5Crosswalk = readJson(path.join(packageRoot, "source/p6-p5-exact-resource-crosswalk.json"));
const p7Evidence = readJson(path.join(packageRoot, "source/p7-evidence-resolver.json"));
const medicalManifest = readJson(path.join(medicalRoot, "MANIFEST.json"));
const capabilityRegistry = readJson(capabilityPath);
const capabilityById = new Map(capabilityRegistry.capabilities.map((item) => [item.id, item]));
const researchRouteById = new Map(p3Explicit.researchRoutes.map((item) => [item.researchId, item]));
const ownerDecisionByTag = new Map(p4Explicit.ownerModifiers.map((item) => [item.sourceTag, item]));
const temperamentDecisionByTag = new Map(p4Explicit.temperamentTags.map((item) => [item.sourceTag, item]));
const handlingDecisionByTag = new Map(p4Explicit.handlingAlternatives.map((item) => [item.sourceTag, item]));
const handlingClassById = new Map(p4.handlingActionClasses.map((item) => [item.actionClassId, item]));
const safeRouteById = new Map(p4Operational.safeRoutes.map((item) => [item.routeId, item]));
const families = medicalManifest.families.map((entry) => ({
  manifest: entry,
  content: readJson(path.join(medicalRoot, entry.path))
}));

const researchById = new Map();
const investigationUsages = [];
const presentationCompatibility = [];
const temperamentTags = new Set();
const ownerModifierTags = new Set();
const handlingTags = new Set();

for (const { content: family } of families) {
  for (const mapping of family.researchCapabilityMap || []) {
    const existing = researchById.get(mapping.researchId);
    const normalized = {
      researchId: mapping.researchId,
      familyIds: uniqueSorted([...(existing?.familyIds || []), family.familyId]),
      requires: uniqueSorted([...(existing?.requires || []), ...(mapping.requires || [])]),
      availability: uniqueSorted([...(existing?.availability || []), mapping.availability]),
      fallback: mapping.fallback || existing?.fallback || null
    };
    researchById.set(mapping.researchId, normalized);
  }
  for (const variant of family.variants || []) {
    for (const presentation of variant.presentations || []) {
      const urgency = urgencyBand(presentation.urgency, p3);
      const compatibility = presentation.compatibility || {};
      for (const tag of compatibility.temperament || []) temperamentTags.add(tag);
      for (const tag of compatibility.ownerModifiers || []) ownerModifierTags.add(tag);
      const handlingValues = Array.isArray(compatibility.requiredHandlingAlternative)
        ? compatibility.requiredHandlingAlternative
        : compatibility.requiredHandlingAlternative ? [compatibility.requiredHandlingAlternative] : [];
      for (const tag of handlingValues) handlingTags.add(tag);
      const presentationRef = `${family.familyId}.${variant.id}.${presentation.id}`;
      presentationCompatibility.push({
        presentationRef,
        familyId: family.familyId,
        variantId: variant.id,
        presentationId: presentation.id,
        urgencySource: presentation.urgency,
        urgencyBandId: urgency.bandId,
        temperamentTags: uniqueSorted(compatibility.temperament || []),
        ownerModifierTags: uniqueSorted(compatibility.ownerModifiers || []),
        handlingAlternativeTags: uniqueSorted(handlingValues)
      });
      (presentation.investigations || []).forEach((investigation, index) => {
        const classification = classificationBand(investigation.classification, p3);
        const research = researchById.get(investigation.id);
        investigationUsages.push({
          usageId: `${presentationRef}.${investigation.id}.${index + 1}`,
          presentationRef,
          familyId: family.familyId,
          variantId: variant.id,
          presentationId: presentation.id,
          researchId: investigation.id,
          sourceUrgency: presentation.urgency,
          urgencyBandId: urgency.bandId,
          sourceClassification: investigation.classification,
          classificationBandId: classification.bandId,
          decisionWeight: classification.decisionWeight,
          resultReviewClass: classification.resultReviewClass,
          reviewPolicy: p3.resultReviewClasses[classification.resultReviewClass],
          mappedByFamilyResearchContract: Boolean(research)
        });
      });
    }
  }
}

const researchCatalog = [...researchById.values()].sort((a, b) => a.researchId.localeCompare(b.researchId)).map((record) => {
  const firstFamily = families.find(({ content }) => record.familyIds.includes(content.familyId));
  const representativeUsage = investigationUsages.find((usage) => usage.researchId === record.researchId);
  const urgency = representativeUsage
    ? p3.urgencyBands.find((item) => item.bandId === representativeUsage.urgencyBandId)
    : p3.urgencyBands.find((item) => item.bandId === "scheduled");
  const unknownCapabilities = record.requires.filter((id) => !capabilityById.has(id));
  const explicitRoute = researchRouteById.get(record.researchId);
  if (!explicitRoute) throw new Error(`Missing explicit P3 route for ${record.researchId}.`);
  return {
    ...record,
    capabilityContractSource: `${firstFamily.manifest.path}#researchCapabilityMap/${record.researchId}`,
    capabilityIdsKnown: record.requires.filter((id) => capabilityById.has(id)),
    capabilityIdsPendingRegistry: unknownCapabilities,
    routeMode: explicitRoute.routeMode,
    providerIds: explicitRoute.providerIds,
    providerCoordinationMode: explicitRoute.providerCoordinationMode,
    primaryProviderId: explicitRoute.primaryProviderId,
    turnaroundPolicy: turnaroundFor(record.requires, urgency, capabilityById, p3),
    activationGate: {
      requiredStatePredicates: explicitRoute.lifecyclePredicates,
      fallbackRouteId: explicitRoute.fallbackRouteId,
      generatedAvailabilityFactsForbidden: true
    },
    medicalResultAuthority: "family.presentation.investigations[].result_only",
    operationalPolicyMayGenerateResult: false
  };
});

const ownerModifierCrosswalk = [...ownerModifierTags].sort().map((tag) => {
  const decision = ownerDecisionByTag.get(tag);
  if (!decision) throw new Error(`Missing explicit owner decision for ${tag}.`);
  return decision;
});
const temperamentCrosswalk = [...temperamentTags].sort().map((tag) => {
  const decision = temperamentDecisionByTag.get(tag);
  if (!decision) throw new Error(`Missing explicit temperament decision for ${tag}.`);
  return decision;
});
const handlingCrosswalk = [...handlingTags].sort().map((tag) => {
  const decision = handlingDecisionByTag.get(tag);
  if (!decision) throw new Error(`Missing explicit handling decision for ${tag}.`);
  const primary = handlingClassById.get(decision.primaryActionClassId);
  const classes = decision.actionClassIds.map((id) => handlingClassById.get(id));
  const safeRoutes = decision.safeRouteIds.map((id) => safeRouteById.get(id));
  if (classes.some((item) => !item) || safeRoutes.some((item) => !item)) throw new Error(`Unresolved handling contract for ${tag}.`);
  return {
    ...decision,
    actionClassId: decision.primaryActionClassId,
    timeMinutes: Math.max(...classes.map((item) => item.timeMinutes)),
    resourceRequirements: decision.requiredCapabilities,
    effects: primary.effects,
    safeAlternatives: safeRoutes,
    runtimeActionTemplate: {
      actionId: decision.actionId,
      timeMinutes: Math.max(...classes.map((item) => item.timeMinutes)),
      resourceRequirements: decision.requiredCapabilities.map((capabilityId) => ({ capabilityId, quantity: 1 })),
      effects: { stateSet: {}, stateDeltas: primary.effects, factAvailability: [] },
      safeAlternatives: safeRoutes.map((route) => ({
        factId: `handling.${tag}.required_fact`,
        alternativeId: route.routeId,
        kind: "safe_route",
        payload: route
      })),
      temperamentRules: []
    }
  };
});

const explicitCompatibility = presentationCompatibility.map((record) => ({
  ...record,
  temperamentArchetypeIds: uniqueSorted(record.temperamentTags.map((tag) => temperamentCrosswalk.find((item) => item.sourceTag === tag)?.archetypeId)),
  ownerArchetypeIds: uniqueSorted(record.ownerModifierTags.map((tag) => ownerModifierCrosswalk.find((item) => item.sourceTag === tag)?.archetypeId)),
  handlingActionIds: uniqueSorted(record.handlingAlternativeTags.map((tag) => handlingCrosswalk.find((item) => item.sourceTag === tag)?.actionId))
}));

const capabilityEconomics = p6Explicit.mappings.map((mapping) => {
  const capability = capabilityById.get(mapping.capabilityId);
  if (!capability) throw new Error(`P6 explicit mapping references unknown capability ${mapping.capabilityId}.`);
  return {
    ...mapping,
    unlock: capability.unlock,
    capacityPerDay: capability.capacityPerDay ?? null,
    dependencies: uniqueSorted(capability.requires || [])
  };
});

const goalTemplateByType = new Map(p7.goalTemplates.map((goal) => [goal.goalType, goal]));
const goalEvidenceById = new Map(p7Evidence.goalEvidence.map((item) => [item.evidenceId, item]));
const dayCatalog = p7.days.map((day) => ({
  ...day,
  dayId: `campaign_day_${String(day.day).padStart(2, "0")}`,
  goals: day.goalTypes.map((goalType, index) => {
    const template = goalTemplateByType.get(goalType);
    if (!template) throw new Error(`Day ${day.day} references missing goal ${goalType}.`);
    return {
      goalId: `day_${String(day.day).padStart(2, "0")}_goal_${index + 1}_${goalType}`,
      goalType,
      evidence: template.evidence,
      evidenceResolver: goalEvidenceById.get(template.evidence),
      minimum: template.minimum,
      selectionRule: "select_after_persisted_day_schedule_without_patient_or_family_requirement"
    };
  })
}));

function envelope(catalogKind, itemId, envelopeType, payload) {
  return {
    catalogRef: {
      catalogKind,
      catalogId: p7.catalogId,
      catalogVersion: p7.catalogVersion,
      contentSha256: sha256Json(payload),
      approvalStatus: "author_complete_programmer_adapter_required"
    },
    itemId,
    envelopeType,
    runtimeEligible: false,
    payload
  };
}

const catalogEnvelopes = {
  events: p7.events.map((item) => envelope("event", item.eventId, "event.record", item)),
  milestones: p7.milestones.map((item) => envelope("milestone", item.milestoneId, "milestone.record", item)),
  specializations: p7.specializations.map((item) => envelope("specialization", item.specializationId, "specialization.record", item)),
  endings: p7.endings.map((item) => envelope("ending", item.endingId, "ending.record", item))
};

writeJson("generated/p3/research-catalog.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p3-research-catalog",
  catalogVersion: p3.policyVersion,
  status: p3.status,
  runtimeEligible: false,
  sourceMedicalVersion: medicalManifest.packageVersion,
  research: researchCatalog
});
writeJson("generated/p3/investigation-usage-policy.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p3-investigation-usage-policy",
  catalogVersion: p3.policyVersion,
  status: p3.status,
  runtimeEligible: false,
  usages: investigationUsages.sort((a, b) => a.usageId.localeCompare(b.usageId))
});
writeJson("generated/p3/provider-catalog.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p3-referral-providers",
  catalogVersion: p3.policyVersion,
  status: p3.status,
  runtimeEligible: false,
  providers: p3.providers,
  clock: p3.clock,
  activation: p3.activation
});

writeJson("generated/p4/owner-profile-catalog.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p4-owner-profiles",
  catalogVersion: p4.policyVersion,
  status: p4.status,
  runtimeEligible: false,
  profiles: p4.ownerArchetypes.map((profile) => ({
    ...profile,
    runtimePersistentProfile: { profileId: profile.profileId, traits: profile.traits }
  }))
});
writeJson("generated/p4/temperament-catalog.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p4-temperaments",
  catalogVersion: p4.policyVersion,
  status: p4.status,
  runtimeEligible: false,
  temperaments: p4.temperamentArchetypes.map((temperament) => ({
    ...temperament,
    runtimePatientProfileTemplate: { temperament: temperament.axes }
  }))
});
writeJson("generated/p4/behavior-crosswalk.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p4-medical-compatibility-crosswalk",
  catalogVersion: p4.policyVersion,
  status: p4.status,
  runtimeEligible: false,
  independenceRules: p4.independenceRules,
  ownerModifiers: ownerModifierCrosswalk,
  temperamentTags: temperamentCrosswalk,
  handlingAlternatives: handlingCrosswalk,
  presentations: explicitCompatibility
});
writeJson("generated/p4/observable-cues.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p4-observable-cues",
  catalogVersion: p4.policyVersion,
  status: p4.status,
  runtimeEligible: false,
  rules: p4.observableCueRules.map((rule) => ({
    ruleId: rule.ruleId,
    entity: rule.entity,
    when: { field: rule.axis, operator: rule.operator, value: rule.value },
    cue: { cueId: rule.cueId }
  }))
});
writeJson("generated/p4/appearance-pools.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p4-appearance-pools",
  catalogVersion: p4.policyVersion,
  status: p4.status,
  runtimeEligible: false,
  independenceRule: "appearance_seed_is_independent_from_behavior_seed",
  pools: p4.appearancePools
});
writeJson("generated/p4/history-policy.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p4-identity-history-policy",
  catalogVersion: p4.policyVersion,
  status: p4.status,
  runtimeEligible: false,
  policy: p4.historyPolicy
});

writeJson("generated/p6/economy-catalog.json", {
  schemaVersion: 1,
  catalogId: p6.catalogId,
  catalogVersion: p6.catalogVersion,
  status: p6.status,
  runtimeEligible: false,
  currency: p6.currency,
  newCampaign: p6.newCampaign,
  dailyFixedCosts: p6.dailyFixedCosts,
  staffWagesPerWorkedDay: p6.staffWagesPerWorkedDay,
  servicePrices: p6.servicePrices,
  capabilityEconomics,
  inventoryCategories: p6.inventoryCategories,
  reputation: p6.reputation,
  riskStates: p6.riskStates,
  recoveryPolicy: p6.recoveryPolicy,
  migration: p6.migration
});
writeJson("generated/p6/p3-p5-resource-crosswalk.json", {
  ...p6P5Crosswalk,
  generatedFromExactAuthorSource: true,
  p3Capabilities: capabilityEconomics.map((item) => ({ capabilityId: item.capabilityId, serviceId: item.serviceId, inventoryPolicy: item.inventoryPolicy, assetCatalogId: item.assetPolicy?.assetCatalogId || null })),
  inferredP5Ids: false,
  tokenMatchingAllowed: false
});

writeJson("generated/p7/day-catalog.json", {
  schemaVersion: 1,
  catalogId: p7.catalogId,
  catalogVersion: p7.catalogVersion,
  status: p7.status,
  runtimeEligible: false,
  campaign: p7.campaign,
  days: dayCatalog,
  authority: p7.authority
});
writeJson("generated/p7/director-catalog.json", {
  schemaVersion: 1,
  catalogId: p7.catalogId,
  catalogVersion: p7.catalogVersion,
  status: p7.status,
  runtimeEligible: false,
  axes: p7.axes,
  catalogEnvelopes,
  recovery: p7.recovery,
  evidenceResolver: p7Evidence,
  catalogDigest: sha256Json({ campaign: p7.campaign, axes: p7.axes, catalogEnvelopes, recovery: p7.recovery })
});

const manifest = {
  schemaVersion: 1,
  packageId: "vetgeme-operational-production-authoring",
  packageVersion: "2026.07.16.2",
  createdAt: "2026-07-16",
  status: "author_complete_validation_pending",
  runtimeEligible: false,
  activationRequires: [
    "programmer_schema_adapter_review",
    "medical_family_external_veterinary_approval",
    "full_runtime_smoke_and_save_reload",
    "product_owner_balance_acceptance"
  ],
  boundaries: {
    runtimeChanged: false,
    designChanged: false,
    saveSchemaChanged: false,
    medicalTruthAuthoredHere: false,
    existingThirtyCardPoolChanged: false,
    p5CatalogAuthoredHere: false
  },
  sources: {
    medicalPackageId: medicalManifest.packageId,
    medicalPackageVersion: medicalManifest.packageVersion,
    medicalActivationStatus: medicalManifest.activationStatus,
    capabilityRegistryId: capabilityRegistry.registryId,
    capabilityRegistryVersion: capabilityRegistry.registryVersion
  },
  counts: {
    families: families.length,
    variants: families.reduce((sum, item) => sum + item.content.variants.length, 0),
    presentations: presentationCompatibility.length,
    researchIds: researchCatalog.length,
    investigationUsages: investigationUsages.length,
    temperamentTags: temperamentCrosswalk.length,
    ownerModifierTags: ownerModifierCrosswalk.length,
    handlingAlternativeTags: handlingCrosswalk.length,
    capabilities: capabilityEconomics.length,
    p5ResourcesCrosswalked: p6P5Crosswalk.resources.length,
    p7EvidenceResolvers: p7Evidence.goalEvidence.length + p7Evidence.eventTriggers.length + p7Evidence.eventEffects.length + p7Evidence.milestoneAndRecoveryRequirements.length + p7Evidence.specializationCapabilities.length + p7Evidence.endingPredicates.length,
    campaignDays: dayCatalog.length,
    events: p7.events.length,
    milestones: p7.milestones.length,
    specializations: p7.specializations.length,
    endings: p7.endings.length
  },
  files: [
    "MANIFEST.json",
    "README.md",
    "PROGRAMMER_HANDOFF.md",
    "FINAL_COMPLETION_AUDIT.md",
    "schemas/OPERATIONAL_PACKAGE_CONTRACT.md",
    "scripts/build-operational-package.mjs",
    "scripts/author-v2-explicit-contracts.mjs",
    "scripts/author-v2-cross-system-contracts.mjs",
    "scripts/validate-operational-package.mjs",
    "reports/VALIDATION_REPORT.json",
    "source/p3-policy.json",
    "source/p3-explicit-research-routes.json",
    "source/p4-policy.json",
    "source/p4-explicit-behavior-crosswalk.json",
    "source/p4-operational-requirements.json",
    "source/p6-balance.json",
    "source/p6-explicit-capability-economics.json",
    "source/p6-p5-exact-resource-crosswalk.json",
    "source/p7-campaign.json",
    "source/p7-evidence-resolver.json",
    "generated/p3/research-catalog.json",
    "generated/p3/investigation-usage-policy.json",
    "generated/p3/provider-catalog.json",
    "generated/p4/owner-profile-catalog.json",
    "generated/p4/temperament-catalog.json",
    "generated/p4/behavior-crosswalk.json",
    "generated/p4/observable-cues.json",
    "generated/p4/appearance-pools.json",
    "generated/p4/history-policy.json",
    "reports/AUTHOR_DECISION_MATRIX.json",
    "reports/CROSS_SYSTEM_V2_AUTHOR_MATRIX.json",
    "generated/p6/economy-catalog.json",
    "generated/p6/p3-p5-resource-crosswalk.json",
    "generated/p7/day-catalog.json",
    "generated/p7/director-catalog.json"
  ]
};
writeJson("MANIFEST.json", manifest);
console.log(JSON.stringify(manifest.counts, null, 2));
