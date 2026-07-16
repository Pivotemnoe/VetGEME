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

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
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
const p3Exact = readJson(path.join(packageRoot, "source/p3-exact-source-crosswalk.json"));
const p4Explicit = readJson(path.join(packageRoot, "source/p4-explicit-behavior-crosswalk.json"));
const p4Operational = readJson(path.join(packageRoot, "source/p4-operational-requirements.json"));
const p4FactCrosswalk = readJson(path.join(packageRoot, "source/p4-presentation-medical-fact-crosswalk.json"));
const p6Explicit = readJson(path.join(packageRoot, "source/p6-explicit-capability-economics.json"));
const p6P5Crosswalk = readJson(path.join(packageRoot, "source/p6-p5-exact-resource-crosswalk.json"));
const p7Evidence = readJson(path.join(packageRoot, "source/p7-evidence-resolver.json"));
const p7DigestContract = readJson(path.join(packageRoot, "source/p7-activation-digest-contract.json"));
const medicalManifest = readJson(path.join(medicalRoot, "MANIFEST.json"));
const capabilityRegistry = readJson(capabilityPath);
const capabilityById = new Map(capabilityRegistry.capabilities.map((item) => [item.id, item]));
const researchRouteById = new Map(p3Explicit.researchRoutes.map((item) => [item.researchId, item]));
const urgencyDecisionBySource = new Map(p3Exact.urgencyValues.map((item) => [item.sourceValue, item]));
const classificationDecisionBySource = new Map(p3Exact.classificationValues.map((item) => [item.sourceValue, item]));
const ownerDecisionByTag = new Map(p4Explicit.ownerModifiers.map((item) => [item.sourceTag, item]));
const temperamentDecisionByTag = new Map(p4Explicit.temperamentTags.map((item) => [item.sourceTag, item]));
const handlingDecisionByTag = new Map(p4Explicit.handlingAlternatives.map((item) => [item.sourceTag, item]));
const handlingClassById = new Map(p4.handlingActionClasses.map((item) => [item.actionClassId, item]));
const safeRouteById = new Map(p4Operational.safeRoutes.map((item) => [item.routeId, item]));
const factBindingByPresentationAndTag = new Map(p4FactCrosswalk.bindings.map((item) => [`${item.presentationRef}|${item.handlingTag}`, item]));
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
      const urgencyDecision = urgencyDecisionBySource.get(presentation.urgency);
      if (!urgencyDecision) throw new Error(`Missing exact P3 urgency decision for ${presentation.urgency}.`);
      const urgency = urgencyDecision.bandId
        ? p3.urgencyBands.find((item) => item.bandId === urgencyDecision.bandId)
        : null;
      if (urgencyDecision.bandId && !urgency) throw new Error(`Unknown urgency band ${urgencyDecision.bandId}.`);
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
        urgencyBandId: urgency?.bandId || null,
        urgencyResolution: urgencyDecision,
        temperamentTags: uniqueSorted(compatibility.temperament || []),
        ownerModifierTags: uniqueSorted(compatibility.ownerModifiers || []),
        handlingAlternativeTags: uniqueSorted(handlingValues)
      });
      (presentation.investigations || []).forEach((investigation, index) => {
        const classification = classificationDecisionBySource.get(investigation.classification);
        if (!classification) throw new Error(`Missing exact P3 classification decision for ${investigation.classification}.`);
        const research = researchById.get(investigation.id);
        if (!research) throw new Error(`Missing family research capability map for ${investigation.id}.`);
        const turnaroundPolicy = urgency
          ? turnaroundFor(research.requires, urgency, capabilityById, p3)
          : {
            kind: "state_resolved_before_order",
            resolverRuleId: urgencyDecision.resolverRuleId,
            allowedBandIds: urgencyDecision.allowedBandIds,
            policiesByUrgencyBand: urgencyDecision.allowedBandIds.map((bandId) => {
              const band = p3.urgencyBands.find((item) => item.bandId === bandId);
              if (!band) throw new Error(`Unknown dynamic urgency band ${bandId}.`);
              return { bandId, turnaroundPolicy: turnaroundFor(research.requires, band, capabilityById, p3) };
            }),
            persistSelectedPolicyOnce: true,
            recomputeAfterReloadForbidden: true
          };
        investigationUsages.push({
          usageId: `${presentationRef}.${investigation.id}.${index + 1}`,
          presentationRef,
          familyId: family.familyId,
          variantId: variant.id,
          presentationId: presentation.id,
          researchId: investigation.id,
          sourceUrgency: presentation.urgency,
          urgencyBandId: urgency?.bandId || null,
          urgencyResolution: urgencyDecision,
          sourceClassification: investigation.classification,
          classificationBandId: classification.bandId,
          decisionWeight: classification.decisionWeight,
          resultReviewClass: classification.resultReviewClass,
          reviewPolicy: p3.resultReviewClasses[classification.resultReviewClass],
          turnaroundPolicy,
          turnaroundAuthority: "exact_investigation_usage",
          mappedByFamilyResearchContract: true
        });
      });
    }
  }
}

const researchCatalog = [...researchById.values()].sort((a, b) => a.researchId.localeCompare(b.researchId)).map((record) => {
  const firstFamily = families.find(({ content }) => record.familyIds.includes(content.familyId));
  const usages = investigationUsages.filter((usage) => usage.researchId === record.researchId);
  const usedBandIds = uniqueSorted(usages.flatMap((usage) => (
    usage.urgencyBandId ? [usage.urgencyBandId] : usage.urgencyResolution.allowedBandIds
  )));
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
    turnaroundAuthority: "generated/p3/investigation-usage-policy.json",
    turnaroundPoliciesByUrgencyBand: usedBandIds.map((bandId) => {
      const urgency = p3.urgencyBands.find((item) => item.bandId === bandId);
      if (!urgency) throw new Error(`Unknown exact urgency band ${bandId}.`);
      return { bandId, turnaroundPolicy: turnaroundFor(record.requires, urgency, capabilityById, p3) };
    }),
    representativeUsageTurnaroundForbidden: true,
    activationGate: {
      requiredStatePredicates: explicitRoute.lifecyclePredicates,
      fallbackRouteId: explicitRoute.fallbackRouteId,
      generatedAvailabilityFactsForbidden: true
    },
    medicalResultAuthority: explicitRoute.medicalResultAuthority,
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
    clinicalFactAuthority: "presentation_scoped_binding_required",
    runtimeActionTemplate: {
      actionId: decision.actionId,
      timeMinutes: Math.max(...classes.map((item) => item.timeMinutes)),
      resourceRequirements: decision.requiredCapabilities.map((capabilityId) => ({ capabilityId, quantity: 1 })),
      effects: { stateSet: {}, stateDeltas: primary.effects, factAvailability: [] },
      safeAlternatives: [],
      temperamentRules: []
    }
  };
});

const explicitCompatibility = presentationCompatibility.map((record) => {
  const handlingBindings = record.handlingAlternativeTags.map((tag) => {
    const binding = factBindingByPresentationAndTag.get(`${record.presentationRef}|${tag}`);
    if (!binding) throw new Error(`Missing P4 presentation fact binding for ${record.presentationRef}/${tag}.`);
    const handling = handlingCrosswalk.find((item) => item.sourceTag === tag);
    if (!handling) throw new Error(`Missing P4 handling action for ${tag}.`);
    const factAccessContract = binding.medicalFactBindings.map((fact) => ({
      factId: fact.factId,
      required: true,
      availabilityAuthority: "runtime_discovery_state",
      medicalOwner: fact.medicalOwner,
      discoveryPaths: fact.discoveryPaths,
      safeAlternatives: fact.safeAlternatives
    }));
    return {
      bindingId: binding.bindingId,
      handlingTag: tag,
      actionId: handling.actionId,
      factAccessContract,
      runtimeActionTemplate: {
        ...handling.runtimeActionTemplate,
        safeAlternatives: factAccessContract.flatMap((fact) => fact.safeAlternatives)
      },
      bindingAuthority: binding.bindingAuthority,
      operationalActionMayGenerateMedicalFact: false
    };
  });
  return {
    ...record,
    temperamentArchetypeIds: uniqueSorted(record.temperamentTags.map((tag) => temperamentCrosswalk.find((item) => item.sourceTag === tag)?.archetypeId)),
    ownerArchetypeIds: uniqueSorted(record.ownerModifierTags.map((tag) => ownerModifierCrosswalk.find((item) => item.sourceTag === tag)?.archetypeId)),
    handlingActionIds: uniqueSorted(record.handlingAlternativeTags.map((tag) => handlingCrosswalk.find((item) => item.sourceTag === tag)?.actionId)),
    handlingBindings
  };
});

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
function resolverRecordId(section, record) {
  return section === "eventEffects" ? record.effectId : record.evidenceId;
}

const resolverRecords = p7DigestContract.resolverSections.flatMap((section) => {
  const records = p7Evidence[section];
  if (!Array.isArray(records)) throw new Error(`Missing P7 resolver section ${section}.`);
  return records.map((payload) => {
    const recordId = resolverRecordId(section, payload);
    if (!recordId) throw new Error(`Missing P7 resolver ID in ${section}.`);
    return {
      section,
      recordId,
      contentSha256: sha256Json(payload),
      payload
    };
  });
});
const resolverRecordByKey = new Map(resolverRecords.map((record) => [`${record.section}|${record.recordId}`, record]));
const resolverEnvelope = {
  schemaVersion: 1,
  catalogId: p7Evidence.catalogId,
  catalogVersion: "2026.07.16.3",
  adapterVersion: p7DigestContract.adapterVersion,
  canonicalization: p7DigestContract.canonicalization,
  records: resolverRecords,
  resolverDigest: sha256Json({
    adapterVersion: p7DigestContract.adapterVersion,
    records: resolverRecords
  })
};

function bindResolver(section, recordId) {
  const record = resolverRecordByKey.get(`${section}|${recordId}`);
  if (!record) throw new Error(`Missing P7 resolver record ${section}/${recordId}.`);
  return {
    section,
    recordId,
    contentSha256: record.contentSha256,
    resolverDigest: resolverEnvelope.resolverDigest
  };
}

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
      evidenceResolver: resolverRecordByKey.get(`goalEvidence|${template.evidence}`)?.payload,
      resolverBinding: bindResolver("goalEvidence", template.evidence),
      minimum: template.minimum,
      selectionRule: "select_after_persisted_day_schedule_without_patient_or_family_requirement"
    };
  })
}));

function envelope(catalogKind, itemId, envelopeType, payload, resolverBindings) {
  return {
    catalogRef: {
      catalogKind,
      catalogId: p7.catalogId,
      catalogVersion: p7.catalogVersion,
      contentSha256: sha256Json(payload),
      resolverDigest: resolverEnvelope.resolverDigest,
      approvalStatus: "author_complete_programmer_adapter_required"
    },
    itemId,
    envelopeType,
    runtimeEligible: false,
    resolverBindings,
    payload
  };
}

const catalogEnvelopes = {
  events: p7.events.map((item) => envelope(
    "event",
    item.eventId,
    "event.record",
    item,
    [bindResolver("eventTriggers", item.trigger), ...item.effects.map((id) => bindResolver("eventEffects", id))]
  )),
  milestones: p7.milestones.map((item) => envelope(
    "milestone",
    item.milestoneId,
    "milestone.record",
    item,
    item.requires.map((id) => bindResolver("milestoneAndRecoveryRequirements", id))
  )),
  specializations: p7.specializations.map((item) => envelope(
    "specialization",
    item.specializationId,
    "specialization.record",
    item,
    item.supportingCapabilities.map((id) => bindResolver("specializationCapabilities", id))
  )),
  endings: p7.endings.map((item) => envelope(
    "ending",
    item.endingId,
    "ending.record",
    item,
    Object.keys(item.requires).map((id) => bindResolver("endingPredicates", id))
  ))
};

const activationDigestInput = {
  adapterVersion: p7DigestContract.adapterVersion,
  dayCatalog,
  axes: p7.axes,
  catalogEnvelopes,
  recovery: p7.recovery,
  resolverEnvelope
};
const activationDigest = sha256Json(activationDigestInput);

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
  exactSourceCrosswalk: {
    catalogId: p3Exact.catalogId,
    catalogVersion: p3Exact.catalogVersion,
    fallbackAllowed: false
  },
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
  clinicalFactAuthority: {
    catalogId: p4FactCrosswalk.catalogId,
    catalogVersion: p4FactCrosswalk.catalogVersion,
    genericHandlingTemplatesAreNotClinicalFactAuthority: true,
    presentationBindingRequiredBeforeActionEvaluation: true
  },
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
  reservationAuthority: false,
  activationGate: {
    exactP5V2RequirementGroupJoinRequired: true,
    flattenedResourceIdsCannotReserve: true,
    schedulerCommandRequired: true,
    lifecycleAuthority: "p5-production-authoring@2026.07.16.2"
  },
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
  resolverDigest: resolverEnvelope.resolverDigest,
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
  resolverEnvelope,
  activationDigestContract: p7DigestContract,
  activationDigest,
  activationDigestInput,
  catalogDigest: activationDigest
});

const manifest = {
  schemaVersion: 1,
  packageId: "vetgeme-operational-production-authoring",
  packageVersion: "2026.07.16.4",
  createdAt: "2026-07-16",
  status: "author_complete_validation_pending",
  runtimeEligible: false,
  activationRequires: [
    "programmer_schema_adapter_review",
    "exact_p5_v2_requirement_group_join",
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
    capabilityRegistryVersion: capabilityRegistry.registryVersion,
    medicalManifestSha256: sha256File(path.join(medicalRoot, "MANIFEST.json")),
    capabilityRegistrySha256: sha256File(capabilityPath),
    p5PackageId: "vetgeme-p5-production-authoring",
    p5PackageVersion: "2026.07.16.2",
    p5ManifestSha256: sha256File(path.join(repoRoot, "p5-production-authoring-2026.07.16.2/MANIFEST.json")),
    p5ReservationAuthorityJoined: false,
    supersedesOperationalPackageVersion: "2026.07.16.3",
    supersededOperationalArchiveSha256: "5abee5242467e703561e0de2eefbb5050345448c90b21b97761d7ee60540a1df"
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
    p4PresentationHandlingBindings: p4FactCrosswalk.bindings.length,
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
    "scripts/author-v3-exact-contracts.mjs",
    "scripts/validate-operational-package.mjs",
    "reports/VALIDATION_REPORT.json",
    "reports/P1_CORRECTION_MATRIX.json",
    "source/p3-policy.json",
    "source/p3-explicit-research-routes.json",
    "source/p3-exact-source-crosswalk.json",
    "source/p4-policy.json",
    "source/p4-explicit-behavior-crosswalk.json",
    "source/p4-operational-requirements.json",
    "source/p4-presentation-medical-fact-crosswalk.json",
    "source/p6-balance.json",
    "source/p6-explicit-capability-economics.json",
    "source/p6-p5-exact-resource-crosswalk.json",
    "source/p7-campaign.json",
    "source/p7-evidence-resolver.json",
    "source/p7-activation-digest-contract.json",
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
