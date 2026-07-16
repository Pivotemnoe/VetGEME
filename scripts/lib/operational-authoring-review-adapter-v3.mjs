import { createHash } from "node:crypto";

export const OPERATIONAL_AUTHORING_REVIEW_ADAPTER_V3_VERSION =
  "vetgeme-operational-review-adapter@2026.07.16.3";
export const OPERATIONAL_AUTHORING_REVIEW_ADAPTER_V3_STATE_VERSION = 1;

const P7_RECORD_COUNT = 93;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

function fail(message) {
  throw new Error(`Operational authoring v3 review adapter rejected: ${message}`);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function checkObject(value, label) {
  check(isObject(value), `${label} must be an object`);
  return value;
}

function checkArray(value, label) {
  check(Array.isArray(value), `${label} must be an array`);
  return value;
}

function checkString(value, label) {
  check(isNonEmptyString(value), `${label} must be a non-empty string`);
  return value;
}

function checkMinute(value, label) {
  check(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative safe integer`);
  return value;
}

function checkExactKeys(value, expectedKeys, label) {
  checkObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  check(JSON.stringify(actual) === JSON.stringify(expected), `${label} fields do not match the adapter contract`);
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

function sortedStrings(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right), "en"));
}

function sameStringSet(left, right) {
  return JSON.stringify(sortedStrings(new Set(left))) === JSON.stringify(sortedStrings(new Set(right)));
}

function sameCanonicalJson(left, right) {
  return canonicalOperationalV3Json(left) === canonicalOperationalV3Json(right);
}

export function canonicalOperationalV3Json(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    check(Number.isFinite(value), "canonical JSON cannot contain a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalOperationalV3Json(item)).join(",")}]`;
  }
  checkObject(value, "canonical JSON value");
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalOperationalV3Json(value[key])}`).join(",")}}`;
}

export function sha256CanonicalOperationalV3(value) {
  return createHash("sha256").update(canonicalOperationalV3Json(value), "utf8").digest("hex");
}

function buildUniqueMap(records, keyFor, label) {
  const result = new Map();
  for (const record of checkArray(records, label)) {
    const key = checkString(keyFor(record), `${label} key`);
    check(!result.has(key), `${label} contain duplicate ${key}`);
    result.set(key, record);
  }
  return result;
}

function rejectApproximateAuthorityKeys(value, location = "document") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectApproximateAuthorityKeys(item, `${location}[${index}]`));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    check(!/(?:includes?|regex|regular.?expression|first.?match|default)/iu.test(key),
      `${location}.${key} is forbidden approximate/default runtime authority`);
    rejectApproximateAuthorityKeys(child, `${location}.${key}`);
  }
}

function validateTurnaroundCandidate(candidate, label) {
  checkObject(candidate, label);
  checkString(candidate.capabilityId, `${label}.capabilityId`);
  if (candidate.kind === "categorical_minutes") {
    checkMinute(candidate.minutes, `${label}.minutes`);
    checkString(candidate.category, `${label}.category`);
    return;
  }
  check(candidate.kind === "working_day_range", `${label}.kind is unsupported`);
  check(Number.isSafeInteger(candidate.minimumDays) && candidate.minimumDays > 0,
    `${label}.minimumDays must be a positive safe integer`);
  check(Number.isSafeInteger(candidate.maximumDays) && candidate.maximumDays >= candidate.minimumDays,
    `${label}.maximumDays must be at least minimumDays`);
  check(candidate.deterministicRule === "min_plus_fnv1a32_order_provider_catalog_mod_inclusive_range",
    `${label}.deterministicRule is unsupported`);
}

function validateTurnaroundPolicy(policy, label) {
  checkObject(policy, label);
  if (policy.kind === "local") {
    checkMinute(policy.minutes, `${label}.minutes`);
    return;
  }
  if (policy.kind === "external") {
    checkArray(policy.candidates, `${label}.candidates`);
    check(policy.candidates.length > 0, `${label}.candidates cannot be empty`);
    buildUniqueMap(policy.candidates, (candidate) => candidate.capabilityId, `${label}.candidates`);
    policy.candidates.forEach((candidate, index) => validateTurnaroundCandidate(candidate, `${label}.candidates[${index}]`));
    return;
  }
  check(policy.kind === "state_resolved_before_order", `${label}.kind is unsupported`);
  checkString(policy.resolverRuleId, `${label}.resolverRuleId`);
  checkArray(policy.allowedBandIds, `${label}.allowedBandIds`);
  checkArray(policy.policiesByUrgencyBand, `${label}.policiesByUrgencyBand`);
  check(policy.persistSelectedPolicyOnce === true, `${label} must persist its selected policy once`);
  check(policy.recomputeAfterReloadForbidden === true, `${label} must forbid reload recomputation`);
  const byBand = buildUniqueMap(policy.policiesByUrgencyBand, (record) => record.bandId,
    `${label}.policiesByUrgencyBand`);
  check(sameStringSet(byBand.keys(), policy.allowedBandIds), `${label} allowed bands and policies differ`);
  for (const [bandId, record] of byBand) {
    check(record.bandId === bandId, `${label} band identity mismatch`);
    check(record.turnaroundPolicy?.kind !== "state_resolved_before_order",
      `${label}.${bandId} cannot recursively require state resolution`);
    validateTurnaroundPolicy(record.turnaroundPolicy, `${label}.${bandId}.turnaroundPolicy`);
  }
}

function buildP3Context(input) {
  const exactSourceCrosswalk = clone(checkObject(input.exactSourceCrosswalk, "P3 exact source crosswalk"));
  const investigationUsagePolicy = clone(checkObject(input.investigationUsagePolicy, "P3 investigation usage policy"));
  const p3Policy = clone(checkObject(input.p3Policy, "P3 policy"));
  const researchCatalog = clone(checkObject(input.researchCatalog, "P3 research catalog"));
  const providerCatalog = clone(checkObject(input.providerCatalog, "P3 provider catalog"));
  const explicitResearchRoutes = clone(checkObject(input.explicitResearchRoutes, "P3 explicit research routes"));

  check(exactSourceCrosswalk.catalogId === "vetgeme-p3-exact-source-crosswalk",
    "P3 exact source crosswalk identity mismatch");
  check(exactSourceCrosswalk.catalogVersion === "2026.07.16.3", "P3 exact source crosswalk version mismatch");
  check(exactSourceCrosswalk.runtimeEligible === false, "P3 exact source crosswalk must remain review-only");
  check(exactSourceCrosswalk.fallbackAllowed === false, "P3 exact source fallback must remain disabled");
  check(exactSourceCrosswalk.activation?.unknownSourceValueBlocksBuild === true,
    "P3 unknown source values must block build/order creation");
  check(exactSourceCrosswalk.activation?.dynamicUrgencyRequiresStateResolutionBeforeOrder === true,
    "P3 dynamic urgency must require medical state resolution");
  check(exactSourceCrosswalk.activation?.selectedTurnaroundMustBePersistedOnce === true,
    "P3 selected turnaround must be persisted once");
  rejectApproximateAuthorityKeys(exactSourceCrosswalk.urgencyValues, "P3 urgency crosswalk");
  rejectApproximateAuthorityKeys(exactSourceCrosswalk.classificationValues, "P3 classification crosswalk");

  const urgencyBySource = buildUniqueMap(exactSourceCrosswalk.urgencyValues, (record) => record.sourceValue,
    "P3 urgency values");
  const classificationBySource = buildUniqueMap(exactSourceCrosswalk.classificationValues,
    (record) => record.sourceValue, "P3 classification values");
  check(urgencyBySource.size === 206, "P3 exact urgency source set must contain 206 values");
  check(classificationBySource.size === 875, "P3 exact classification source set must contain 875 values");
  check([...urgencyBySource.values()].filter((record) => record.resolutionMode ===
    "runtime_state_required_before_order").length === 2, "P3 must contain exactly two dynamic urgency sources");

  check(investigationUsagePolicy.catalogId === "vetgeme-p3-investigation-usage-policy",
    "P3 usage policy identity mismatch");
  check(investigationUsagePolicy.catalogVersion === "2026.07.16.3", "P3 usage policy version mismatch");
  check(investigationUsagePolicy.runtimeEligible === false, "P3 usage policy must remain review-only");
  check(investigationUsagePolicy.exactSourceCrosswalk?.catalogId === exactSourceCrosswalk.catalogId,
    "P3 usage policy crosswalk identity mismatch");
  check(investigationUsagePolicy.exactSourceCrosswalk?.catalogVersion === exactSourceCrosswalk.catalogVersion,
    "P3 usage policy crosswalk version mismatch");
  check(investigationUsagePolicy.exactSourceCrosswalk?.fallbackAllowed === false,
    "P3 usage policy cannot enable fallback");

  const usageById = buildUniqueMap(investigationUsagePolicy.usages, (usage) => usage.usageId, "P3 usages");
  check(usageById.size === 1864, "P3 exact usage set must contain 1,864 records");
  check(sameStringSet([...usageById.values()].map((usage) => usage.sourceUrgency), urgencyBySource.keys()),
    "P3 usage urgency sources do not cover the exact source crosswalk");
  check(sameStringSet([...usageById.values()].map((usage) => usage.sourceClassification), classificationBySource.keys()),
    "P3 usage classifications do not cover the exact source crosswalk");
  check(researchCatalog.catalogId === "vetgeme-p3-research-catalog", "P3 research catalog identity mismatch");
  check(researchCatalog.catalogVersion === "2026.07.16.3", "P3 research catalog version mismatch");
  check(researchCatalog.runtimeEligible === false, "P3 research catalog must remain review-only");
  const researchById = buildUniqueMap(researchCatalog.research, (research) => research.researchId,
    "P3 research records");
  check(researchById.size === 361, "P3 generated research set must contain 361 records");
  check(explicitResearchRoutes.catalogId === "vetgeme-p3-explicit-research-routes",
    "P3 explicit research routes identity mismatch");
  check(explicitResearchRoutes.catalogVersion === "2026.07.16.2",
    "P3 explicit research routes version mismatch");
  check(explicitResearchRoutes.runtimeEligible === false,
    "P3 explicit research routes must remain review-only");
  const explicitResearchById = buildUniqueMap(explicitResearchRoutes.researchRoutes,
    (research) => research.researchId, "P3 explicit research routes");
  check(sameStringSet(researchById.keys(), explicitResearchById.keys()),
    "P3 generated and explicit research route sets differ");
  check(providerCatalog.catalogId === "vetgeme-p3-referral-providers", "P3 provider catalog identity mismatch");
  check(providerCatalog.catalogVersion === "2026.07.16.3", "P3 provider catalog version mismatch");
  check(providerCatalog.runtimeEligible === false, "P3 provider catalog must remain review-only");
  const providerById = buildUniqueMap(providerCatalog.providers, (provider) => provider.providerId,
    "P3 providers");
  check(providerById.size === 6, "P3 provider catalog must contain six providers");
  let dynamicUsages = 0;
  for (const [usageId, usage] of usageById) {
    checkString(usage.presentationRef, `P3 usage ${usageId}.presentationRef`);
    checkString(usage.researchId, `P3 usage ${usageId}.researchId`);
    const research = researchById.get(usage.researchId);
    check(research, `P3 usage ${usageId} references unknown exact research route ${usage.researchId}`);
    checkArray(research.providerIds, `P3 research ${usage.researchId}.providerIds`);
    for (const providerId of research.providerIds) {
      check(providerById.has(providerId), `P3 research ${usage.researchId} references unknown provider ${providerId}`);
    }
    const urgency = urgencyBySource.get(usage.sourceUrgency);
    check(urgency, `P3 usage ${usageId} has unknown exact source urgency ${usage.sourceUrgency}`);
    check(sameCanonicalJson(usage.urgencyResolution, urgency),
      `P3 usage ${usageId} urgency projection does not equal its exact source record`);
    const classification = classificationBySource.get(usage.sourceClassification);
    check(classification,
      `P3 usage ${usageId} has unknown exact source classification ${usage.sourceClassification}`);
    check(usage.classificationBandId === classification.bandId,
      `P3 usage ${usageId} classification band drifted`);
    check(usage.decisionWeight === classification.decisionWeight,
      `P3 usage ${usageId} classification weight drifted`);
    check(usage.resultReviewClass === classification.resultReviewClass,
      `P3 usage ${usageId} result review class drifted`);
    check(sameCanonicalJson(usage.reviewPolicy, p3Policy.resultReviewClasses?.[classification.resultReviewClass]),
      `P3 usage ${usageId} review policy drifted from exact P3 policy`);
    check(usage.turnaroundAuthority === "exact_investigation_usage",
      `P3 usage ${usageId} lacks usage-level turnaround authority`);
    validateTurnaroundPolicy(usage.turnaroundPolicy, `P3 usage ${usageId}.turnaroundPolicy`);
    if (urgency.resolutionMode === "fixed_author_crosswalk") {
      check(usage.urgencyBandId === urgency.bandId, `P3 usage ${usageId} fixed urgency band drifted`);
      check(usage.turnaroundPolicy.kind !== "state_resolved_before_order",
        `P3 usage ${usageId} fixed urgency cannot defer due selection`);
    } else {
      dynamicUsages += 1;
      check(urgency.resolutionMode === "runtime_state_required_before_order",
        `P3 usage ${usageId} has unsupported urgency resolution mode`);
      check(usage.urgencyBandId === null, `P3 usage ${usageId} dynamic urgency cannot preselect a band`);
      check(usage.turnaroundPolicy.kind === "state_resolved_before_order",
        `P3 usage ${usageId} must defer due selection until medical state resolution`);
      check(usage.turnaroundPolicy.resolverRuleId === urgency.resolverRuleId,
        `P3 usage ${usageId} resolver rule drifted`);
      check(sameStringSet(usage.turnaroundPolicy.allowedBandIds, urgency.allowedBandIds),
        `P3 usage ${usageId} allowed dynamic bands drifted`);
    }
  }
  const medicalResultAuthorityProjectionDrift = [...researchById.values()].filter((research) =>
    research.medicalResultAuthority !== explicitResearchById.get(research.researchId).medicalResultAuthority).length;
  check(medicalResultAuthorityProjectionDrift === 361,
    "P3 .3 must preserve the explicit 361-record medical-result authority blocker");

  const clock = checkObject(p3Policy.clock, "P3 clock");
  checkMinute(clock.campaignDayStartMinute, "P3 clock.campaignDayStartMinute");
  checkMinute(clock.externalCutoffMinute, "P3 clock.externalCutoffMinute");
  checkArray(clock.externalWorkingWeekdays, "P3 clock.externalWorkingWeekdays");
  check(clock.externalWorkingWeekdays.length > 0, "P3 external working weekdays cannot be empty");
  check(clock.externalWorkingWeekdays.every((day) => Number.isSafeInteger(day) && day >= 1 && day <= 7),
    "P3 external working weekdays must be ISO weekday numbers");
  check(new Set(clock.externalWorkingWeekdays).size === clock.externalWorkingWeekdays.length,
    "P3 external working weekdays contain duplicates");
  check(clock.deterministicRangeRule === "min_plus_fnv1a32_order_provider_catalog_mod_inclusive_range",
    "P3 clock deterministic range rule mismatch");

  return {
    exactSourceCrosswalk,
    investigationUsagePolicy,
    p3Policy,
    researchCatalog,
    providerCatalog,
    explicitResearchRoutes,
    urgencyBySource,
    classificationBySource,
    usageById,
    researchById,
    providerById,
    audit: deepFreeze({
      urgencySourceValues: urgencyBySource.size,
      classificationSourceValues: classificationBySource.size,
      investigationUsages: usageById.size,
      researchRoutes: researchById.size,
      providers: providerById.size,
      dynamicUsages,
      fallbackAllowed: false,
      medicalResultAuthorityProjectionValidated: false,
      medicalResultAuthorityProjectionDrift,
      blockers: medicalResultAuthorityProjectionDrift > 0 ? [{
        id: "p3_medical_result_authority_projection_drift",
        count: medicalResultAuthorityProjectionDrift,
      }] : [],
    }),
  };
}

export function validateOperationalP3AdapterBundleV3(input) {
  return buildP3Context(input).audit;
}

function buildMedicalFactIndex(medicalFamilies) {
  const presentationByRef = new Map();
  for (const [familyIndex, entry] of checkArray(medicalFamilies, "medical families").entries()) {
    checkExactKeys(entry, ["path", "document"], `medicalFamilies[${familyIndex}]`);
    const path = checkString(entry.path, `medicalFamilies[${familyIndex}].path`);
    const family = checkObject(entry.document, `medicalFamilies[${familyIndex}].document`);
    checkString(family.familyId, `${path}.familyId`);
    for (const [variantIndex, variant] of checkArray(family.variants, `${path}.variants`).entries()) {
      checkString(variant.id, `${path}.variants[${variantIndex}].id`);
      for (const [presentationIndex, presentation] of checkArray(variant.presentations,
        `${path}.variants[${variantIndex}].presentations`).entries()) {
        const presentationRef = `${family.familyId}.${variant.id}.${presentation.id}`;
        check(!presentationByRef.has(presentationRef), `medical presentation ${presentationRef} is duplicated`);
        const factById = new Map();
        for (const [factIndex, fact] of checkArray(presentation.criticalFacts,
          `${presentationRef}.criticalFacts`).entries()) {
          const factId = checkString(fact.factId, `${presentationRef}.criticalFacts[${factIndex}].factId`);
          check(!factById.has(factId), `${presentationRef} contains duplicate medical fact ${factId}`);
          checkArray(fact.discoveryPaths, `${presentationRef}.${factId}.discoveryPaths`);
          check(fact.discoveryPaths.length > 0, `${presentationRef}.${factId} has no discovery path`);
          factById.set(factId, {
            fact: clone(fact),
            sourcePointer: `${path}#/variants/${variantIndex}/presentations/${presentationIndex}/criticalFacts/${factIndex}`,
            familyId: family.familyId,
            variantId: variant.id,
            presentationId: presentation.id,
          });
        }
        const requiredHandling = presentation.compatibility?.requiredHandlingAlternative;
        const requiredHandlingTags = Array.isArray(requiredHandling)
          ? requiredHandling
          : requiredHandling ? [requiredHandling] : [];
        check(requiredHandlingTags.every(isNonEmptyString), `${presentationRef} has an invalid handling tag`);
        presentationByRef.set(presentationRef, { presentationRef, factById, requiredHandlingTags });
      }
    }
  }
  return presentationByRef;
}

function buildP4Context(input) {
  const presentationFactCrosswalk = clone(checkObject(input.presentationFactCrosswalk,
    "P4 presentation medical fact crosswalk"));
  const medicalFamilies = clone(checkArray(input.medicalFamilies, "P4 medical families"));
  check(presentationFactCrosswalk.catalogId === "vetgeme-p4-presentation-medical-fact-crosswalk",
    "P4 fact crosswalk identity mismatch");
  check(presentationFactCrosswalk.catalogVersion === "2026.07.16.3", "P4 fact crosswalk version mismatch");
  check(presentationFactCrosswalk.runtimeEligible === false, "P4 fact crosswalk must remain review-only");
  check(presentationFactCrosswalk.activation?.genericHandlingTemplatesAreNotClinicalFactAuthority === true,
    "P4 generic handling templates must not gain medical fact authority");
  check(presentationFactCrosswalk.activation?.presentationBindingRequiredBeforeActionEvaluation === true,
    "P4 exact presentation binding must precede action evaluation");
  check(presentationFactCrosswalk.activation?.unknownFactOrPresentationBlocksRuntime === true,
    "P4 unknown facts and presentations must fail closed");

  const medicalPresentationByRef = buildMedicalFactIndex(medicalFamilies);
  const bindingByKey = buildUniqueMap(presentationFactCrosswalk.bindings,
    (binding) => `${binding.presentationRef}|${binding.handlingTag}`, "P4 presentation handling bindings");
  const expectedBindingKeys = [...medicalPresentationByRef.values()].flatMap((presentation) =>
    presentation.requiredHandlingTags.map((handlingTag) => `${presentation.presentationRef}|${handlingTag}`));
  check(sameStringSet(bindingByKey.keys(), expectedBindingKeys),
    "P4 binding set does not equal medical .40 required presentation/handling compatibility");
  let medicalFactReferences = 0;
  let multiFactBindings = 0;
  for (const [key, binding] of bindingByKey) {
    check(binding.bindingId === `${binding.presentationRef}.${binding.handlingTag}`,
      `P4 binding ${key} identity drifted`);
    check(binding.operationalActionMayGenerateMedicalFact === false,
      `P4 binding ${key} cannot generate medical truth`);
    const medicalPresentation = medicalPresentationByRef.get(binding.presentationRef);
    check(medicalPresentation, `P4 binding ${key} references unknown medical presentation`);
    const factBindings = checkArray(binding.medicalFactBindings, `P4 binding ${key}.medicalFactBindings`);
    check(factBindings.length > 0, `P4 binding ${key} must preserve at least one medical fact`);
    const factBindingById = buildUniqueMap(factBindings, (fact) => fact.factId,
      `P4 binding ${key}.medicalFactBindings`);
    check(sameStringSet(factBindingById.keys(), medicalPresentation.factById.keys()),
      `P4 binding ${key} does not preserve all exact presentation facts`);
    if (factBindings.length > 1) multiFactBindings += 1;
    for (const [factId, factBinding] of factBindingById) {
      medicalFactReferences += 1;
      const medical = medicalPresentation.factById.get(factId);
      check(medical, `P4 binding ${key} references unknown medical fact ${factId}`);
      check(sameStringSet(factBinding.discoveryPaths, medical.fact.discoveryPaths),
        `P4 binding ${key}/${factId} discovery paths drifted from medical .40`);
      const owner = checkObject(factBinding.medicalOwner, `P4 binding ${key}/${factId}.medicalOwner`);
      check(owner.packageId === "vetgeme-medical-production-authoring" &&
        owner.packageVersion === "2026.07.16.40", `P4 binding ${key}/${factId} medical package drifted`);
      check(owner.familyId === medical.familyId && owner.variantId === medical.variantId &&
        owner.presentationId === medical.presentationId,
      `P4 binding ${key}/${factId} medical owner identity drifted`);
      check(owner.sourcePointer === medical.sourcePointer,
        `P4 binding ${key}/${factId} medical source pointer drifted`);
      const alternatives = checkArray(factBinding.safeAlternatives,
        `P4 binding ${key}/${factId}.safeAlternatives`);
      check(alternatives.length > 0, `P4 binding ${key}/${factId} lacks a safe alternative`);
      for (const [alternativeIndex, alternative] of alternatives.entries()) {
        check(alternative.factId === factId,
          `P4 binding ${key}/${factId} safe alternative ${alternativeIndex} changed fact identity`);
        check(alternative.kind === "safe_route",
          `P4 binding ${key}/${factId} safe alternative ${alternativeIndex} is not a safe route`);
        checkString(alternative.alternativeId,
          `P4 binding ${key}/${factId} safe alternative ${alternativeIndex}.alternativeId`);
        checkString(alternative.payload?.routeId,
          `P4 binding ${key}/${factId} safe alternative ${alternativeIndex}.payload.routeId`);
        checkString(alternative.payload?.command,
          `P4 binding ${key}/${factId} safe alternative ${alternativeIndex}.payload.command`);
        const hasProviderResolver = isNonEmptyString(alternative.payload?.providerResolver);
        const hasProviderId = isNonEmptyString(alternative.payload?.providerId);
        check(hasProviderResolver !== hasProviderId,
          `P4 binding ${key}/${factId} safe alternative ${alternativeIndex} must provide exactly one provider resolver or provider ID`);
        check(alternative.payload.factOwner === "medical_family_result_only",
          `P4 binding ${key}/${factId} safe alternative ${alternativeIndex} factOwner drifted`);
        check(alternative.payload.medicalOwnerRef === binding.presentationRef,
          `P4 binding ${key}/${factId} safe alternative changed medical owner reference`);
      }
    }
  }

  return {
    presentationFactCrosswalk,
    bindingByKey,
    audit: deepFreeze({
      presentationHandlingBindings: bindingByKey.size,
      medicalFactReferences,
      multiFactBindings,
      unknownMedicalFactReferences: 0,
      syntheticMedicalFacts: 0,
    }),
  };
}

export function validateOperationalP4AdapterBundleV3(input) {
  return buildP4Context(input).audit;
}

function resolverRecordId(section, record) {
  return section === "eventEffects" ? record.effectId : record.evidenceId;
}

function verifyResolverBinding(binding, recordByKey, resolverDigest, label) {
  checkObject(binding, label);
  const record = recordByKey.get(`${binding.section}|${binding.recordId}`);
  check(record, `${label} references unknown resolver ${binding.section}/${binding.recordId}`);
  check(binding.contentSha256 === record.contentSha256, `${label} content digest mismatch`);
  check(binding.resolverDigest === resolverDigest, `${label} resolver aggregate digest mismatch`);
}

function buildP7Context(input) {
  const evidenceResolver = clone(checkObject(input.evidenceResolver, "P7 evidence resolver"));
  const digestContract = clone(checkObject(input.digestContract, "P7 activation digest contract"));
  const p7Campaign = clone(checkObject(input.p7Campaign, "P7 campaign source"));
  const dayCatalog = clone(checkObject(input.dayCatalog, "P7 day catalog"));
  const directorCatalog = clone(checkObject(input.directorCatalog, "P7 director catalog"));

  check(digestContract.contractId === "vetgeme-p7-activation-digest-contract",
    "P7 digest contract identity mismatch");
  check(digestContract.contractVersion === "2026.07.16.3", "P7 digest contract version mismatch");
  check(digestContract.status === "author_complete_programmer_adapter_required",
    "P7 digest contract author status mismatch");
  check(digestContract.runtimeEligible === false, "P7 digest contract must remain review-only");
  check(digestContract.canonicalization ===
    "recursive_object_keys_lexicographic_arrays_preserve_author_order_utf8_json",
  "P7 canonicalization contract mismatch");
  check(sameCanonicalJson(digestContract.activationDigestScope,
    ["adapterVersion", "dayCatalog", "axes", "catalogEnvelopes", "recovery", "resolverEnvelope"]),
  "P7 activation digest scope changed");

  check(evidenceResolver.catalogId === "vetgeme-p7-evidence-resolver", "P7 resolver identity mismatch");
  check(evidenceResolver.catalogVersion === "2026.07.16.3", "P7 resolver version mismatch");
  check(evidenceResolver.runtimeEligible === false, "P7 resolver must remain review-only");
  check(evidenceResolver.activation?.authorApprovalRecorded === true,
    "P7 resolver must retain recorded author approval");
  check(evidenceResolver.activation?.programmerAdapterValidated === false,
    "P7 resolver cannot claim programmer adapter validation");
  check(evidenceResolver.activation?.productOwnerBalanceAccepted === false,
    "P7 resolver cannot claim product-owner acceptance");
  check(evidenceResolver.activation?.medicalProductionPoolRequiredForCampaignActivation === true,
    "P7 resolver must retain the medical production gate");
  check(evidenceResolver.activation?.runtimeEligible === false,
    "P7 resolver activation must remain runtime-ineligible");
  for (const [catalog, label] of [
    [p7Campaign, "campaign source"],
    [dayCatalog, "day catalog"],
    [directorCatalog, "director catalog"],
  ]) {
    check(catalog.catalogId === "vetgeme-p7-campaign-catalog", `P7 ${label} identity mismatch`);
    check(catalog.catalogVersion === "2026.07.16.3", `P7 ${label} version mismatch`);
    check(catalog.status === "author_complete_programmer_adapter_required",
      `P7 ${label} author status mismatch`);
    check(catalog.runtimeEligible === false, `P7 ${label} must remain review-only`);
  }
  check(sameCanonicalJson(directorCatalog.activationDigestContract, digestContract),
    "P7 director activation digest contract projection drifted");
  const records = [];
  for (const section of digestContract.resolverSections) {
    for (const payload of checkArray(evidenceResolver[section], `P7 resolver section ${section}`)) {
      const recordId = checkString(resolverRecordId(section, payload), `P7 ${section} record ID`);
      records.push({ section, recordId, contentSha256: sha256CanonicalOperationalV3(payload), payload });
    }
  }
  check(records.length === P7_RECORD_COUNT, `P7 resolver must contain ${P7_RECORD_COUNT} records`);
  const recordByKey = buildUniqueMap(records, (record) => `${record.section}|${record.recordId}`,
    "P7 resolver records");
  const expectedResolverEnvelope = {
    schemaVersion: 1,
    catalogId: evidenceResolver.catalogId,
    catalogVersion: "2026.07.16.3",
    adapterVersion: digestContract.adapterVersion,
    canonicalization: digestContract.canonicalization,
    records,
    resolverDigest: sha256CanonicalOperationalV3({ adapterVersion: digestContract.adapterVersion, records }),
  };
  check(sameCanonicalJson(directorCatalog.evidenceResolver, evidenceResolver),
    "P7 director resolver source projection drifted");
  check(sameCanonicalJson(directorCatalog.resolverEnvelope, expectedResolverEnvelope),
    "P7 resolver envelope or an individual content digest drifted");
  const resolverDigest = expectedResolverEnvelope.resolverDigest;

  check(dayCatalog.resolverDigest === resolverDigest, "P7 day catalog resolver digest mismatch");
  check(sameCanonicalJson(dayCatalog.campaign, p7Campaign.campaign),
    "P7 outer campaign projection drifted");
  check(sameCanonicalJson(dayCatalog.authority, p7Campaign.authority),
    "P7 outer authority projection drifted");
  checkArray(dayCatalog.days, "P7 generated days");
  check(dayCatalog.days.length === p7Campaign.days?.length, "P7 source/generated day count mismatch");
  check(dayCatalog.days.length === 30, "P7 campaign must contain 30 days");
  const goalTemplateByType = buildUniqueMap(p7Campaign.goalTemplates, (goal) => goal.goalType,
    "P7 goal templates");
  let goalBindings = 0;
  for (const [dayIndex, generatedDay] of dayCatalog.days.entries()) {
    const sourceDay = p7Campaign.days[dayIndex];
    for (const [key, value] of Object.entries(sourceDay)) {
      check(sameCanonicalJson(generatedDay[key], value), `P7 day ${sourceDay.day} source field ${key} drifted`);
    }
    check(generatedDay.dayId === `campaign_day_${String(sourceDay.day).padStart(2, "0")}`,
      `P7 day ${sourceDay.day} identity drifted`);
    check(generatedDay.goals.length === sourceDay.goalTypes.length, `P7 day ${sourceDay.day} goal count drifted`);
    generatedDay.goals.forEach((goal, goalIndex) => {
      goalBindings += 1;
      const goalType = sourceDay.goalTypes[goalIndex];
      const template = goalTemplateByType.get(goalType);
      check(template, `P7 day ${sourceDay.day} references unknown goal type ${goalType}`);
      check(goal.goalType === goalType && goal.evidence === template.evidence && goal.minimum === template.minimum,
        `P7 day ${sourceDay.day} goal ${goalIndex + 1} source projection drifted`);
      const resolver = recordByKey.get(`goalEvidence|${template.evidence}`);
      check(resolver, `P7 goal ${goal.goalId} references unknown evidence ${template.evidence}`);
      check(sameCanonicalJson(goal.evidenceResolver, resolver.payload),
        `P7 goal ${goal.goalId} resolver payload drifted`);
      verifyResolverBinding(goal.resolverBinding, recordByKey, resolverDigest,
        `P7 goal ${goal.goalId}.resolverBinding`);
      check(goal.resolverBinding.section === "goalEvidence" &&
        goal.resolverBinding.recordId === template.evidence,
      `P7 goal ${goal.goalId} resolver identity drifted`);
    });
  }
  check(goalBindings === 60, "P7 campaign must contain 60 exact goal bindings");

  const sourceEnvelopeSections = {
    events: ["event", "eventId", "event.record"],
    milestones: ["milestone", "milestoneId", "milestone.record"],
    specializations: ["specialization", "specializationId", "specialization.record"],
    endings: ["ending", "endingId", "ending.record"],
  };
  let catalogContents = 0;
  let envelopeResolverBindings = 0;
  for (const [section, [kind, idField, envelopeType]] of Object.entries(sourceEnvelopeSections)) {
    const sourceRecords = checkArray(p7Campaign[section], `P7 source ${section}`);
    const envelopes = checkArray(directorCatalog.catalogEnvelopes?.[section], `P7 ${section} envelopes`);
    check(envelopes.length === sourceRecords.length, `P7 ${section} envelope count drifted`);
    envelopes.forEach((envelope, index) => {
      const sourceRecord = sourceRecords[index];
      catalogContents += 1;
      check(envelope.itemId === sourceRecord[idField], `P7 ${section}[${index}] identity drifted`);
      check(envelope.envelopeType === envelopeType, `P7 ${section}[${index}] envelope type drifted`);
      check(envelope.runtimeEligible === false, `P7 ${section}[${index}] cannot be runtime eligible`);
      check(sameCanonicalJson(envelope.payload, sourceRecord), `P7 ${section}[${index}] payload drifted`);
      check(envelope.catalogRef?.catalogKind === kind, `P7 ${section}[${index}] catalog kind drifted`);
      check(envelope.catalogRef?.contentSha256 === sha256CanonicalOperationalV3(envelope.payload),
        `P7 ${section}[${index}] content digest mismatch`);
      check(envelope.catalogRef?.resolverDigest === resolverDigest,
        `P7 ${section}[${index}] resolver digest mismatch`);
      check(envelope.catalogRef?.approvalStatus === "author_complete_programmer_adapter_required",
        `P7 ${section}[${index}] approval status drifted`);
      const expectedBindingKeys = section === "events"
        ? [`eventTriggers|${sourceRecord.trigger}`, ...sourceRecord.effects.map((id) => `eventEffects|${id}`)]
        : section === "milestones"
          ? sourceRecord.requires.map((id) => `milestoneAndRecoveryRequirements|${id}`)
          : section === "specializations"
            ? sourceRecord.supportingCapabilities.map((id) => `specializationCapabilities|${id}`)
            : Object.keys(sourceRecord.requires).map((id) => `endingPredicates|${id}`);
      const actualBindingKeys = envelope.resolverBindings.map((binding) =>
        `${binding.section}|${binding.recordId}`);
      check(sameCanonicalJson(actualBindingKeys, expectedBindingKeys),
        `P7 ${section}[${index}] exact resolver binding set/order drifted`);
      for (const [bindingIndex, binding] of checkArray(envelope.resolverBindings,
        `P7 ${section}[${index}].resolverBindings`).entries()) {
        envelopeResolverBindings += 1;
        verifyResolverBinding(binding, recordByKey, resolverDigest,
          `P7 ${section}[${index}].resolverBindings[${bindingIndex}]`);
      }
    });
  }
  check(catalogContents === 42, "P7 director must contain 42 exact catalog envelopes");

  check(sameCanonicalJson(directorCatalog.axes, p7Campaign.axes), "P7 axes source projection drifted");
  check(sameCanonicalJson(directorCatalog.recovery, p7Campaign.recovery), "P7 recovery source projection drifted");
  const expectedActivationInput = {
    adapterVersion: digestContract.adapterVersion,
    dayCatalog: dayCatalog.days,
    axes: p7Campaign.axes,
    catalogEnvelopes: directorCatalog.catalogEnvelopes,
    recovery: p7Campaign.recovery,
    resolverEnvelope: expectedResolverEnvelope,
  };
  check(sameCanonicalJson(directorCatalog.activationDigestInput, expectedActivationInput),
    "P7 activation digest input does not include the exact source/day/resolver semantics");
  const activationDigest = sha256CanonicalOperationalV3(expectedActivationInput);
  check(directorCatalog.activationDigest === activationDigest, "P7 activation digest mismatch");
  check(directorCatalog.catalogDigest === activationDigest, "P7 aggregate catalog digest mismatch");

  const mutationProbe = clone(expectedActivationInput);
  const firstPayload = mutationProbe.resolverEnvelope.records[0].payload;
  firstPayload.__adapterMutationProbe = true;
  const mutationDigest = sha256CanonicalOperationalV3(mutationProbe);
  check(mutationDigest !== activationDigest, "P7 semantic mutation did not change the activation digest");

  return {
    evidenceResolver,
    digestContract,
    p7Campaign,
    dayCatalog,
    directorCatalog,
    audit: deepFreeze({
      resolverRecords: records.length,
      goalBindings,
      catalogContents,
      envelopeResolverBindings,
      resolverDigest,
      activationDigest,
      mutationDigest,
      mutationRejected: true,
      runtimeEligible: false,
    }),
  };
}

export function validateOperationalP7DigestBundleV3(input) {
  return buildP7Context(input).audit;
}

function buildP5GateContext(input) {
  const resourceCrosswalk = clone(checkObject(input.resourceCrosswalk, "P5/P6 resource crosswalk"));
  check(resourceCrosswalk.catalogId === "vetgeme-p6-p5-exact-resource-crosswalk",
    "P5/P6 resource crosswalk identity mismatch");
  check(resourceCrosswalk.catalogVersion === "2026.07.16.2", "P5/P6 preserved .2 crosswalk version mismatch");
  check(resourceCrosswalk.runtimeEligible === false, "P5/P6 resource crosswalk must remain review-only");
  check(resourceCrosswalk.reservationAuthority === false,
    "P5/P6 flattened resource crosswalk cannot become reservation authority");
  check(resourceCrosswalk.tokenMatchingAllowed === false,
    "P5/P6 token matching cannot become reservation authority");
  check(resourceCrosswalk.activationGate?.exactP5V2RequirementGroupJoinRequired === true,
    "P5/P6 exact P5 .2 requirement-group join must remain required");
  check(resourceCrosswalk.activationGate?.flattenedResourceIdsCannotReserve === true,
    "P5/P6 flattened resource IDs must remain unable to reserve");
  check(resourceCrosswalk.activationGate?.schedulerCommandRequired === true,
    "P5/P6 scheduler commands must remain required");
  check(resourceCrosswalk.activationGate?.lifecycleAuthority === "p5-production-authoring@2026.07.16.2",
    "P5/P6 lifecycle authority must remain pinned to P5 .2");
  return {
    resourceCrosswalk,
    audit: deepFreeze({
      reservationAuthority: false,
      flattenedResourceIdsCanReserve: false,
      exactP5V2JoinRequired: true,
    }),
  };
}

export function validateOperationalP5ReservationGateV3(input) {
  return buildP5GateContext(input).audit;
}

function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(value, "utf8")) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function normalizeOrderCommand(command) {
  checkObject(command, "investigation order command");
  const allowed = new Set([
    "commandId", "orderId", "usageId", "orderedAtMinute", "selectedCapabilityId", "selectedProviderId",
    "medicalStateRevision",
  ]);
  for (const key of Object.keys(command)) {
    check(allowed.has(key), `investigation order command contains unknown field ${key}`);
  }
  checkString(command.commandId, "investigation order command.commandId");
  checkString(command.orderId, "investigation order command.orderId");
  checkString(command.usageId, "investigation order command.usageId");
  checkMinute(command.orderedAtMinute, "investigation order command.orderedAtMinute");
  const selectedCapabilityId = command.selectedCapabilityId ?? null;
  if (selectedCapabilityId !== null) checkString(selectedCapabilityId, "selectedCapabilityId");
  const selectedProviderId = command.selectedProviderId ?? null;
  if (selectedProviderId !== null) checkString(selectedProviderId, "selectedProviderId");
  const medicalStateRevision = command.medicalStateRevision ?? null;
  if (medicalStateRevision !== null) checkString(medicalStateRevision, "medicalStateRevision");
  return {
    commandId: command.commandId,
    orderId: command.orderId,
    usageId: command.usageId,
    orderedAtMinute: command.orderedAtMinute,
    selectedCapabilityId,
    selectedProviderId,
    medicalStateRevision,
  };
}

function chooseDueContract(p3, usage, command, options = {}) {
  let urgencyBandId = usage.urgencyBandId;
  let policy = usage.turnaroundPolicy;
  let resolvedMedicalState = null;
  if (policy.kind === "state_resolved_before_order") {
    check(command.medicalStateRevision !== null,
      `P3 usage ${usage.usageId} requires a medical state revision before order`);
    if (options.persistedResolution) {
      checkExactKeys(options.persistedResolution,
        ["resolverRuleId", "urgencyBandId", "medicalStateRevision"], "persisted medical urgency resolution");
      check(options.persistedResolution.resolverRuleId === policy.resolverRuleId,
        `P3 usage ${usage.usageId} persisted resolver rule drifted`);
      check(options.persistedResolution.medicalStateRevision === command.medicalStateRevision,
        `P3 usage ${usage.usageId} persisted medical state revision drifted`);
      urgencyBandId = options.persistedResolution.urgencyBandId;
      resolvedMedicalState = clone(options.persistedResolution);
    } else {
      const resolver = options.medicalUrgencyResolvers?.[policy.resolverRuleId];
      check(typeof resolver === "function",
        `P3 usage ${usage.usageId} has no registered medical resolver ${policy.resolverRuleId}`);
      urgencyBandId = resolver(deepFreeze({
        resolverRuleId: policy.resolverRuleId,
        usageId: usage.usageId,
        presentationRef: usage.presentationRef,
        sourceUrgency: usage.sourceUrgency,
        medicalStateRevision: command.medicalStateRevision,
      }));
      checkString(urgencyBandId, `P3 medical resolver ${policy.resolverRuleId} result`);
      resolvedMedicalState = {
        resolverRuleId: policy.resolverRuleId,
        urgencyBandId,
        medicalStateRevision: command.medicalStateRevision,
      };
    }
    check(policy.allowedBandIds.includes(urgencyBandId),
      `P3 usage ${usage.usageId} does not allow resolved urgency band ${urgencyBandId}`);
    const selected = policy.policiesByUrgencyBand.find((record) => record.bandId === urgencyBandId);
    check(selected, `P3 usage ${usage.usageId} lacks exact due policy for ${urgencyBandId}`);
    policy = selected.turnaroundPolicy;
  } else {
    check(command.medicalStateRevision === null,
      `P3 fixed usage ${usage.usageId} cannot accept a dynamic medical-state revision`);
  }

  if (policy.kind === "local") {
    check(command.selectedCapabilityId === null,
      `P3 local usage ${usage.usageId} cannot select an external capability`);
    check(command.selectedProviderId === null,
      `P3 local usage ${usage.usageId} cannot select an external provider`);
    return {
      urgencyBandId,
      resolvedMedicalState,
      selectedCapabilityId: null,
      selectedProviderId: null,
      selectedTurnaroundPolicy: clone(policy),
      selectedWorkingDays: null,
      selectedDueInMinutes: policy.minutes,
      dueAtMinute: command.orderedAtMinute + policy.minutes,
    };
  }

  check(policy.kind === "external", `P3 usage ${usage.usageId} has an unresolved due policy`);
  check(command.selectedCapabilityId !== null,
    `P3 external usage ${usage.usageId} requires an exact selectedCapabilityId`);
  check(command.selectedProviderId !== null,
    `P3 external usage ${usage.usageId} requires an exact selectedProviderId`);
  const candidate = policy.candidates.find((record) => record.capabilityId === command.selectedCapabilityId);
  check(candidate, `P3 usage ${usage.usageId} has no exact candidate ${command.selectedCapabilityId}`);
  const research = p3.researchById.get(usage.researchId);
  check(research.providerIds.includes(command.selectedProviderId),
    `P3 research ${usage.researchId} has no exact provider ${command.selectedProviderId}`);
  const provider = p3.providerById.get(command.selectedProviderId);
  check(provider, `P3 usage ${usage.usageId} selected unknown provider ${command.selectedProviderId}`);
  let selectedWorkingDays = null;
  if (candidate.kind === "categorical_minutes") {
    selectedWorkingDays = null;
  } else {
    const inclusiveRange = candidate.maximumDays - candidate.minimumDays + 1;
    const deterministicInput = [
      command.orderId,
      command.selectedProviderId,
      `${p3.investigationUsagePolicy.catalogId}@${p3.investigationUsagePolicy.catalogVersion}`,
    ].join("|");
    selectedWorkingDays = candidate.minimumDays + (fnv1a32(deterministicInput) % inclusiveRange);
  }
  if (options.persistedSelection) {
    const persisted = options.persistedSelection;
    check(persisted.selectedProviderId === command.selectedProviderId,
      `P3 usage ${usage.usageId} persisted provider drifted`);
    check(sameCanonicalJson(persisted.selectedTurnaroundPolicy, candidate),
      `P3 usage ${usage.usageId} persisted turnaround policy drifted`);
    check(persisted.selectedWorkingDays === selectedWorkingDays,
      `P3 usage ${usage.usageId} persisted working-day selection drifted`);
    check(Number.isSafeInteger(persisted.dueAtMinute) && persisted.dueAtMinute >= command.orderedAtMinute,
      `P3 usage ${usage.usageId} persisted due time is invalid`);
    check(persisted.selectedDueInMinutes === persisted.dueAtMinute - command.orderedAtMinute,
      `P3 usage ${usage.usageId} persisted due interval drifted`);
    return {
      urgencyBandId,
      resolvedMedicalState,
      selectedCapabilityId: candidate.capabilityId,
      selectedProviderId: command.selectedProviderId,
      selectedTurnaroundPolicy: clone(candidate),
      selectedWorkingDays,
      selectedDueInMinutes: persisted.selectedDueInMinutes,
      dueAtMinute: persisted.dueAtMinute,
    };
  }
  check(typeof options.providerDueResolver === "function",
    `P3 external usage ${usage.usageId} has no registered provider calendar/cutoff resolver`);
  const dueAtMinute = options.providerDueResolver(deepFreeze({
    usageId: usage.usageId,
    researchId: usage.researchId,
    orderId: command.orderId,
    orderedAtMinute: command.orderedAtMinute,
    urgencyBandId,
    selectedCapabilityId: candidate.capabilityId,
    selectedProviderId: command.selectedProviderId,
    selectedTurnaroundPolicy: clone(candidate),
    selectedWorkingDays,
    provider: clone(provider),
    providerClock: clone(p3.p3Policy.clock),
  }));
  check(Number.isSafeInteger(dueAtMinute) && dueAtMinute >= command.orderedAtMinute,
    `P3 provider due resolver returned an invalid due time for ${usage.usageId}`);
  return {
    urgencyBandId,
    resolvedMedicalState,
    selectedCapabilityId: candidate.capabilityId,
    selectedProviderId: command.selectedProviderId,
    selectedTurnaroundPolicy: clone(candidate),
    selectedWorkingDays,
    selectedDueInMinutes: dueAtMinute - command.orderedAtMinute,
    dueAtMinute,
  };
}

function emptyState() {
  return {
    schemaVersion: OPERATIONAL_AUTHORING_REVIEW_ADAPTER_V3_STATE_VERSION,
    adapterVersion: OPERATIONAL_AUTHORING_REVIEW_ADAPTER_V3_VERSION,
    reviewOnly: true,
    orders: [],
    commands: [],
  };
}

function normalizeAndValidateState(p3, value) {
  checkExactKeys(value, ["schemaVersion", "adapterVersion", "reviewOnly", "orders", "commands"],
    "adapter state");
  check(value.schemaVersion === OPERATIONAL_AUTHORING_REVIEW_ADAPTER_V3_STATE_VERSION,
    "adapter state schemaVersion mismatch");
  check(value.adapterVersion === OPERATIONAL_AUTHORING_REVIEW_ADAPTER_V3_VERSION,
    "adapter state adapterVersion mismatch");
  check(value.reviewOnly === true, "adapter state must remain review-only");
  const orders = clone(checkArray(value.orders, "adapter state.orders"));
  const commands = clone(checkArray(value.commands, "adapter state.commands"));
  const orderById = new Map();
  for (const [index, order] of orders.entries()) {
    checkExactKeys(order, [
      "orderId", "usageId", "orderedAtMinute", "sourceUrgency", "sourceClassification", "urgencyBandId",
      "resolvedMedicalState", "selectedCapabilityId", "selectedProviderId", "selectedTurnaroundPolicy", "selectedWorkingDays",
      "selectedDueInMinutes", "dueAtMinute", "contractDigest", "commandId",
    ], `adapter state.orders[${index}]`);
    check(!orderById.has(order.orderId), `adapter state contains duplicate order ${order.orderId}`);
    const usage = p3.usageById.get(order.usageId);
    check(usage, `adapter state order ${order.orderId} references unknown exact usage ${order.usageId}`);
    const reconstructedCommand = normalizeOrderCommand({
      commandId: order.commandId,
      orderId: order.orderId,
      usageId: order.usageId,
      orderedAtMinute: order.orderedAtMinute,
      selectedCapabilityId: order.selectedCapabilityId,
      selectedProviderId: order.selectedProviderId,
      medicalStateRevision: order.resolvedMedicalState?.medicalStateRevision ?? null,
    });
    const due = chooseDueContract(p3, usage, reconstructedCommand, {
      persistedResolution: order.resolvedMedicalState,
      persistedSelection: {
        selectedProviderId: order.selectedProviderId,
        selectedTurnaroundPolicy: order.selectedTurnaroundPolicy,
        selectedWorkingDays: order.selectedWorkingDays,
        selectedDueInMinutes: order.selectedDueInMinutes,
        dueAtMinute: order.dueAtMinute,
      },
    });
    check(order.sourceUrgency === usage.sourceUrgency && order.sourceClassification === usage.sourceClassification,
      `adapter state order ${order.orderId} source authority drifted`);
    check(order.urgencyBandId === due.urgencyBandId,
      `adapter state order ${order.orderId} selected urgency drifted`);
    check(sameCanonicalJson(order.resolvedMedicalState, due.resolvedMedicalState),
      `adapter state order ${order.orderId} persisted medical resolution drifted`);
    check(order.selectedCapabilityId === due.selectedCapabilityId,
      `adapter state order ${order.orderId} selected capability drifted`);
    check(order.selectedProviderId === due.selectedProviderId,
      `adapter state order ${order.orderId} selected provider drifted`);
    check(sameCanonicalJson(order.selectedTurnaroundPolicy, due.selectedTurnaroundPolicy),
      `adapter state order ${order.orderId} selected due policy drifted`);
    check(order.selectedWorkingDays === due.selectedWorkingDays &&
      order.selectedDueInMinutes === due.selectedDueInMinutes && order.dueAtMinute === due.dueAtMinute,
    `adapter state order ${order.orderId} persisted due time drifted`);
    const contractDigest = sha256CanonicalOperationalV3({
      usageId: usage.usageId,
      sourceUrgency: usage.sourceUrgency,
      sourceClassification: usage.sourceClassification,
      urgencyResolution: usage.urgencyResolution,
      turnaroundPolicy: usage.turnaroundPolicy,
    });
    check(order.contractDigest === contractDigest, `adapter state order ${order.orderId} contract digest mismatch`);
    orderById.set(order.orderId, order);
  }
  const commandById = new Map();
  for (const [index, record] of commands.entries()) {
    checkExactKeys(record, ["commandId", "orderId", "fingerprint"], `adapter state.commands[${index}]`);
    checkString(record.commandId, `adapter state.commands[${index}].commandId`);
    checkString(record.orderId, `adapter state.commands[${index}].orderId`);
    check(SHA256_PATTERN.test(record.fingerprint), `adapter state.commands[${index}].fingerprint is invalid`);
    check(!commandById.has(record.commandId), `adapter state contains duplicate command ${record.commandId}`);
    const order = orderById.get(record.orderId);
    check(order && order.commandId === record.commandId,
      `adapter state command ${record.commandId} does not own its exact order`);
    const command = normalizeOrderCommand({
      commandId: order.commandId,
      orderId: order.orderId,
      usageId: order.usageId,
      orderedAtMinute: order.orderedAtMinute,
      selectedCapabilityId: order.selectedCapabilityId,
      selectedProviderId: order.selectedProviderId,
      medicalStateRevision: order.resolvedMedicalState?.medicalStateRevision ?? null,
    });
    check(record.fingerprint === sha256CanonicalOperationalV3(command),
      `adapter state command ${record.commandId} fingerprint mismatch`);
    commandById.set(record.commandId, record);
  }
  check(commands.length === orders.length, "adapter state command/order ledger is incomplete");
  return deepFreeze({
    schemaVersion: value.schemaVersion,
    adapterVersion: value.adapterVersion,
    reviewOnly: true,
    orders: orders.sort((left, right) => left.orderId.localeCompare(right.orderId, "en")),
    commands: commands.sort((left, right) => left.commandId.localeCompare(right.commandId, "en")),
  });
}

export function createOperationalAuthoringReviewAdapterV3(input) {
  checkObject(input, "operational v3 adapter input");
  const p3 = buildP3Context({
    exactSourceCrosswalk: input.exactSourceCrosswalk,
    investigationUsagePolicy: input.investigationUsagePolicy,
    p3Policy: input.p3Policy,
    researchCatalog: input.researchCatalog,
    providerCatalog: input.providerCatalog,
    explicitResearchRoutes: input.explicitResearchRoutes,
  });
  const p4 = buildP4Context({
    presentationFactCrosswalk: input.presentationFactCrosswalk,
    medicalFamilies: input.medicalFamilies,
  });
  const p7 = buildP7Context({
    evidenceResolver: input.evidenceResolver,
    digestContract: input.digestContract,
    p7Campaign: input.p7Campaign,
    dayCatalog: input.dayCatalog,
    directorCatalog: input.directorCatalog,
  });
  const p5 = buildP5GateContext({ resourceCrosswalk: input.resourceCrosswalk });
  const suppliedMedicalUrgencyResolvers = input.medicalUrgencyResolvers ?? {};
  checkObject(suppliedMedicalUrgencyResolvers, "medicalUrgencyResolvers");
  const medicalUrgencyResolvers = Object.freeze({ ...suppliedMedicalUrgencyResolvers });
  for (const [resolverRuleId, resolver] of Object.entries(medicalUrgencyResolvers)) {
    checkString(resolverRuleId, "medical urgency resolver rule ID");
    check(typeof resolver === "function", `medical urgency resolver ${resolverRuleId} must be a function`);
  }
  const providerDueResolver = input.providerDueResolver ?? null;
  check(providerDueResolver === null || typeof providerDueResolver === "function",
    "providerDueResolver must be a function when supplied");

  function createState() {
    return normalizeAndValidateState(p3, emptyState());
  }

  function validateState(state) {
    return normalizeAndValidateState(p3, clone(state));
  }

  function serializeState(state) {
    return JSON.stringify(validateState(state));
  }

  function deserializeState(serialized) {
    check(isNonEmptyString(serialized), "serialized adapter state must be non-empty JSON");
    let parsed;
    try {
      parsed = JSON.parse(serialized);
    } catch (error) {
      fail(`cannot parse serialized adapter state: ${error.message}`);
    }
    return normalizeAndValidateState(p3, parsed);
  }

  function placeInvestigationOrder(state, rawCommand) {
    const current = validateState(state);
    const command = normalizeOrderCommand(rawCommand);
    const fingerprint = sha256CanonicalOperationalV3(command);
    const previousCommand = current.commands.find((record) => record.commandId === command.commandId);
    if (previousCommand) {
      check(previousCommand.fingerprint === fingerprint,
        `command ${command.commandId} conflicts with its persisted replay`);
      const persistedOrder = current.orders.find((order) => order.orderId === previousCommand.orderId);
      return deepFreeze({ state: current, order: persistedOrder, idempotent: true });
    }
    check(!current.orders.some((order) => order.orderId === command.orderId),
      `order ${command.orderId} already exists under a different command`);
    const usage = p3.usageById.get(command.usageId);
    check(usage, `unknown exact P3 usage ${command.usageId}`);
    const due = chooseDueContract(p3, usage, command, { medicalUrgencyResolvers, providerDueResolver });
    const order = {
      orderId: command.orderId,
      usageId: command.usageId,
      orderedAtMinute: command.orderedAtMinute,
      sourceUrgency: usage.sourceUrgency,
      sourceClassification: usage.sourceClassification,
      urgencyBandId: due.urgencyBandId,
      resolvedMedicalState: clone(due.resolvedMedicalState),
      selectedCapabilityId: due.selectedCapabilityId,
      selectedProviderId: due.selectedProviderId,
      selectedTurnaroundPolicy: clone(due.selectedTurnaroundPolicy),
      selectedWorkingDays: due.selectedWorkingDays,
      selectedDueInMinutes: due.selectedDueInMinutes,
      dueAtMinute: due.dueAtMinute,
      contractDigest: sha256CanonicalOperationalV3({
        usageId: usage.usageId,
        sourceUrgency: usage.sourceUrgency,
        sourceClassification: usage.sourceClassification,
        urgencyResolution: usage.urgencyResolution,
        turnaroundPolicy: usage.turnaroundPolicy,
      }),
      commandId: command.commandId,
    };
    const next = normalizeAndValidateState(p3, {
      ...current,
      orders: [...current.orders, order],
      commands: [...current.commands, { commandId: command.commandId, orderId: command.orderId, fingerprint }],
    });
    return deepFreeze({
      state: next,
      order: next.orders.find((record) => record.orderId === command.orderId),
      idempotent: false,
    });
  }

  function getExactInvestigationUsage(usageId) {
    checkString(usageId, "usageId");
    const usage = p3.usageById.get(usageId);
    check(usage, `unknown exact P3 usage ${usageId}`);
    return deepFreeze(clone(usage));
  }

  function resolveHandlingAction({ presentationRef, handlingTag, completedDiscoveryPaths }) {
    checkString(presentationRef, "presentationRef");
    checkString(handlingTag, "handlingTag");
    checkArray(completedDiscoveryPaths, "completedDiscoveryPaths");
    check(completedDiscoveryPaths.every(isNonEmptyString), "completedDiscoveryPaths contain an invalid value");
    const binding = p4.bindingByKey.get(`${presentationRef}|${handlingTag}`);
    check(binding, `unknown exact P4 presentation/handling binding ${presentationRef}|${handlingTag}`);
    const completed = new Set(completedDiscoveryPaths);
    const facts = binding.medicalFactBindings.map((fact) => {
      const matchedDiscoveryPaths = fact.discoveryPaths.filter((path) => completed.has(path));
      const available = matchedDiscoveryPaths.length > 0;
      return {
        factId: fact.factId,
        available,
        matchedDiscoveryPaths,
        discoveryPaths: clone(fact.discoveryPaths),
        medicalOwner: clone(fact.medicalOwner),
        safeAlternatives: fact.safeAlternatives.map((alternative) => ({
          ...clone(alternative),
          medicalOwner: clone(fact.medicalOwner),
        })),
        resolution: available ? "medical_fact_available" : "safe_alternative_required",
      };
    });
    return deepFreeze({
      bindingId: binding.bindingId,
      presentationRef,
      handlingTag,
      actionId: binding.actionId,
      operationalActionMayGenerateMedicalFact: false,
      facts,
    });
  }

  function resolveHandlingFact({ presentationRef, handlingTag, factId, completedDiscoveryPaths }) {
    checkString(factId, "factId");
    const action = resolveHandlingAction({ presentationRef, handlingTag, completedDiscoveryPaths });
    const fact = action.facts.find((record) => record.factId === factId);
    check(fact, `unknown exact medical fact ${factId} for ${presentationRef}|${handlingTag}`);
    return fact;
  }

  function rejectReservation() {
    fail("P5/P6 reservation authority is disabled until the exact P5 .2 requirement-group join");
  }

  return deepFreeze({
    adapterVersion: OPERATIONAL_AUTHORING_REVIEW_ADAPTER_V3_VERSION,
    reviewOnly: true,
    runtimeEligible: false,
    productionEligible: false,
    generatorEligible: false,
    audit: {
      p3: p3.audit,
      p4: p4.audit,
      p7: p7.audit,
      p5ReservationGate: p5.audit,
    },
    createState,
    validateState,
    serializeState,
    deserializeState,
    placeInvestigationOrder,
    getExactInvestigationUsage,
    resolveHandlingAction,
    resolveHandlingFact,
    reserveResources: rejectReservation,
    requireReservationAuthority: rejectReservation,
    validateP7Digests: () => p7.audit,
  });
}

export function createOperationalAuthoringReviewAdapterV3FromReviewInputs(
  operationalReviewInput,
  medicalReviewInput,
  options = {},
) {
  checkObject(operationalReviewInput, "operational review input");
  checkObject(medicalReviewInput, "medical review input");
  const documents = checkObject(operationalReviewInput.documents, "operational review input.documents");
  const medicalManifestFamilies = checkArray(medicalReviewInput.manifest?.families,
    "medical review input.manifest.families");
  const medicalDocuments = checkArray(medicalReviewInput.families, "medical review input.families");
  check(medicalManifestFamilies.length === medicalDocuments.length,
    "medical review input family manifest/documents differ");
  return createOperationalAuthoringReviewAdapterV3({
    exactSourceCrosswalk: documents["source/p3-exact-source-crosswalk.json"],
    investigationUsagePolicy: documents["generated/p3/investigation-usage-policy.json"],
    p3Policy: documents["source/p3-policy.json"],
    researchCatalog: documents["generated/p3/research-catalog.json"],
    providerCatalog: documents["generated/p3/provider-catalog.json"],
    explicitResearchRoutes: documents["source/p3-explicit-research-routes.json"],
    presentationFactCrosswalk: documents["source/p4-presentation-medical-fact-crosswalk.json"],
    medicalFamilies: medicalDocuments.map((document, index) => ({
      path: medicalManifestFamilies[index].path,
      document,
    })),
    evidenceResolver: documents["source/p7-evidence-resolver.json"],
    digestContract: documents["source/p7-activation-digest-contract.json"],
    p7Campaign: documents["source/p7-campaign.json"],
    dayCatalog: documents["generated/p7/day-catalog.json"],
    directorCatalog: documents["generated/p7/director-catalog.json"],
    resourceCrosswalk: documents["generated/p6/p3-p5-resource-crosswalk.json"],
    medicalUrgencyResolvers: options.medicalUrgencyResolvers,
    providerDueResolver: options.providerDueResolver,
  });
}
