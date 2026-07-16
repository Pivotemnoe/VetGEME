#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageRoot, "..");
const medicalRoot = path.join(repoRoot, "medical-production-authoring");
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

function matchesToken(value, token) {
  return String(value).toLowerCase().includes(String(token).toLowerCase());
}

function selectRule(value, rules, fallbackLabel) {
  for (const rule of rules) {
    if (rule.matchTokens.length && rule.matchTokens.some((token) => matchesToken(value, token))) return rule;
  }
  const fallback = rules.find((rule) => rule.matchTokens.length === 0);
  if (fallback) return fallback;
  throw new Error(`No authored ${fallbackLabel} rule matches ${value}.`);
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

function providerFor(tokens, p3) {
  const text = tokens.join(" ").toLowerCase();
  const match = (needles) => needles.some((needle) => text.includes(needle));
  if (match(["rabies", "regulated", "zoonotic", "outbreak", "public_health"])) return "ref_public_health";
  if (match(["emergency", "intensive", "oxygen", "transfusion", "surgery", "stabilization"])) return "ref_emergency_24h";
  if (match(["xray", "radiograph", "ultrasound", "imaging", "ct", "mri", "echo", "endoscopy", "scintigraphy"])) return "ref_imaging_center";
  if (match(["culture", "pcr", "serology", "susceptibility", "fungal", "parasite", "mycology", "antigen"])) return "ref_microbiology_pcr";
  if (match(["pathology", "histology", "cytology", "cbc", "biochem", "coag", "endocrine", "t4", "cortisol", "acth"])) return "ref_clinical_pathology";
  return "ref_specialist_network";
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

function serviceFor(capabilityId, p6) {
  return selectRule(capabilityId, p6.serviceClassRules, "service class").serviceId;
}

function mergeOverride(base, override) {
  return override ? { ...base, ...override } : base;
}

const p3 = readJson(path.join(packageRoot, "source/p3-policy.json"));
const p4 = readJson(path.join(packageRoot, "source/p4-policy.json"));
const p6 = readJson(path.join(packageRoot, "source/p6-balance.json"));
const p7 = readJson(path.join(packageRoot, "source/p7-campaign.json"));
const medicalManifest = readJson(path.join(medicalRoot, "MANIFEST.json"));
const capabilityRegistry = readJson(capabilityPath);
const capabilityById = new Map(capabilityRegistry.capabilities.map((item) => [item.id, item]));
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
  const researchContract = firstFamily.content.researchCapabilityMap.find((item) => item.researchId === record.researchId);
  const representativeUsage = investigationUsages.find((usage) => usage.researchId === record.researchId);
  const urgency = representativeUsage
    ? p3.urgencyBands.find((item) => item.bandId === representativeUsage.urgencyBandId)
    : p3.urgencyBands.find((item) => item.bandId === "scheduled");
  const unknownCapabilities = record.requires.filter((id) => !capabilityById.has(id));
  const providerId = providerFor([...record.requires, record.researchId], p3);
  return {
    ...record,
    capabilityContractSource: `${firstFamily.manifest.path}#researchCapabilityMap/${record.researchId}`,
    capabilityIdsKnown: record.requires.filter((id) => capabilityById.has(id)),
    capabilityIdsPendingRegistry: unknownCapabilities,
    providerId: record.requires.some((id) => capabilityById.get(id)?.type === "external_service") ? providerId : null,
    turnaroundPolicy: turnaroundFor(record.requires, urgency, capabilityById, p3),
    activationGate: {
      dependenciesOwned: record.requires,
      delivered: true,
      trainingComplete: true,
      maintenanceCurrent: true,
      stockAvailable: true,
      fallback: researchContract.fallback || "safe_referral"
    },
    medicalResultAuthority: "family.presentation.investigations[].result_only",
    operationalPolicyMayGenerateResult: false
  };
});

const ownerModifierCrosswalk = [...ownerModifierTags].sort().map((tag) => {
  const rule = selectRule(tag, p4.ownerModifierRules, "owner modifier");
  return { sourceTag: tag, ruleId: rule.ruleId, archetypeId: rule.archetypeId, stateEffects: rule.stateEffects };
});
const temperamentCrosswalk = [...temperamentTags].sort().map((tag) => {
  const rule = selectRule(tag, p4.temperamentTagRules, "temperament tag");
  return { sourceTag: tag, ruleId: rule.ruleId, archetypeId: rule.archetypeId };
});
const handlingCrosswalk = [...handlingTags].sort().map((tag) => {
  const rule = selectRule(tag, p4.handlingActionClasses, "handling action");
  return {
    sourceTag: tag,
    actionClassId: rule.actionClassId,
    actionId: `handling_${tag}`,
    timeMinutes: rule.timeMinutes,
    resourceRequirements: rule.resourceRequirements,
    effects: rule.effects,
    safeAlternatives: rule.safeAlternatives,
    runtimeActionTemplate: {
      actionId: `handling_${tag}`,
      timeMinutes: rule.timeMinutes,
      resourceRequirements: rule.resourceRequirements.map((capabilityId) => ({ capabilityId, quantity: 1 })),
      effects: { stateSet: {}, stateDeltas: rule.effects, factAvailability: [] },
      safeAlternatives: [],
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

const servicePriceById = new Map(p6.servicePrices.map((item) => [item.serviceId, item]));
const capabilityEconomics = capabilityRegistry.capabilities.map((capability) => {
  const serviceId = serviceFor(capability.id, p6);
  const service = servicePriceById.get(serviceId);
  const consumableRule = capability.type === "consumable_set"
    ? selectRule(capability.id, p6.consumableMappingRules, "consumable category")
    : null;
  const assetBase = p6.assetPricingByType[capability.type];
  const override = p6.assetOverrides.find((item) => item.capabilityId === capability.id);
  const asset = assetBase || override ? mergeOverride(assetBase || {}, override) : null;
  return {
    capabilityId: capability.id,
    capabilityType: capability.type,
    unlock: capability.unlock,
    serviceId,
    price: service.price,
    variableCost: service.variableCost,
    durationMinutes: service.durationMinutes,
    inventoryPolicy: consumableRule ? { categoryId: consumableRule.categoryId, unitsPerUse: consumableRule.unitsPerUse } : null,
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
    capacityPerDay: capability.capacityPerDay ?? null,
    dependencies: uniqueSorted(capability.requires || [])
  };
});

const goalTemplateByType = new Map(p7.goalTemplates.map((goal) => [goal.goalType, goal]));
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
      minimum: template.minimum,
      selectionRule: "select_after_persisted_day_schedule_without_patient_or_family_requirement"
    };
  })
}));

const catalogEnvelopes = {
  events: p7.events.map((item) => ({ catalogRef: { catalogKind: "event", catalogId: p7.catalogId, catalogVersion: p7.catalogVersion }, itemId: item.eventId, envelopeType: "event.record", payload: item })),
  milestones: p7.milestones.map((item) => ({ catalogRef: { catalogKind: "milestone", catalogId: p7.catalogId, catalogVersion: p7.catalogVersion }, itemId: item.milestoneId, envelopeType: "milestone.record", payload: item })),
  specializations: p7.specializations.map((item) => ({ catalogRef: { catalogKind: "specialization", catalogId: p7.catalogId, catalogVersion: p7.catalogVersion }, itemId: item.specializationId, envelopeType: "specialization.record", payload: item })),
  endings: p7.endings.map((item) => ({ catalogRef: { catalogKind: "ending", catalogId: p7.catalogId, catalogVersion: p7.catalogVersion }, itemId: item.endingId, envelopeType: "ending.record", payload: item }))
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
  schemaVersion: 1,
  catalogId: "vetgeme-p6-resource-crosswalk",
  catalogVersion: p6.catalogVersion,
  status: p6.status,
  runtimeEligible: false,
  p3Capabilities: capabilityEconomics.map((item) => ({ capabilityId: item.capabilityId, serviceId: item.serviceId, inventoryPolicy: item.inventoryPolicy, assetCatalogId: item.assetPolicy?.assetCatalogId || null })),
  p5ContractRefs: ["staff_role_id", "shift_id", "reservation_id", "resource_id", "owner_id"],
  p5CatalogAuthority: "runtime_p5_catalog_or_explicit_programmer_mapping_required",
  inferredP5Ids: false
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
  recovery: p7.recovery
});

const manifest = {
  schemaVersion: 1,
  packageId: "vetgeme-operational-production-authoring",
  packageVersion: "2026.07.16.1",
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
    campaignDays: dayCatalog.length,
    events: p7.events.length,
    milestones: p7.milestones.length,
    specializations: p7.specializations.length,
    endings: p7.endings.length
  },
  files: [
    "README.md",
    "PROGRAMMER_HANDOFF.md",
    "FINAL_COMPLETION_AUDIT.md",
    "schemas/OPERATIONAL_PACKAGE_CONTRACT.md",
    "scripts/build-operational-package.mjs",
    "scripts/validate-operational-package.mjs",
    "reports/VALIDATION_REPORT.json",
    "source/p3-policy.json",
    "source/p4-policy.json",
    "source/p6-balance.json",
    "source/p7-campaign.json",
    "generated/p3/research-catalog.json",
    "generated/p3/investigation-usage-policy.json",
    "generated/p3/provider-catalog.json",
    "generated/p4/owner-profile-catalog.json",
    "generated/p4/temperament-catalog.json",
    "generated/p4/behavior-crosswalk.json",
    "generated/p4/observable-cues.json",
    "generated/p4/appearance-pools.json",
    "generated/p4/history-policy.json",
    "generated/p6/economy-catalog.json",
    "generated/p6/p3-p5-resource-crosswalk.json",
    "generated/p7/day-catalog.json",
    "generated/p7/director-catalog.json"
  ]
};
writeJson("MANIFEST.json", manifest);
console.log(JSON.stringify(manifest.counts, null, 2));
