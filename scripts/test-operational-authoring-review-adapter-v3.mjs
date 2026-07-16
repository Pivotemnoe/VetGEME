import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  OPERATIONAL_AUTHORING_REVIEW_ADAPTER_V3_STATE_VERSION,
  OPERATIONAL_AUTHORING_REVIEW_ADAPTER_V3_VERSION,
  createOperationalAuthoringReviewAdapterV3,
  createOperationalAuthoringReviewAdapterV3FromReviewInputs,
  sha256CanonicalOperationalV3,
  validateOperationalP3AdapterBundleV3,
  validateOperationalP4AdapterBundleV3,
  validateOperationalP5ReservationGateV3,
  validateOperationalP7DigestBundleV3,
} from "./lib/operational-authoring-review-adapter-v3.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const operationalRoot = path.join(
  projectRoot,
  "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.3/source",
);
const medicalRoot = path.join(
  projectRoot,
  "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source",
);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function operationalJson(relativePath) {
  return readJson(path.join(operationalRoot, relativePath));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadMedicalFamilies() {
  const manifest = readJson(path.join(medicalRoot, "MANIFEST.json"));
  return {
    manifest,
    entries: manifest.families.map((entry) => ({
      path: entry.path,
      document: readJson(path.join(medicalRoot, entry.path)),
    })),
  };
}

function loadInput() {
  const medical = loadMedicalFamilies();
  return {
    exactSourceCrosswalk: operationalJson("source/p3-exact-source-crosswalk.json"),
    investigationUsagePolicy: operationalJson("generated/p3/investigation-usage-policy.json"),
    p3Policy: operationalJson("source/p3-policy.json"),
    researchCatalog: operationalJson("generated/p3/research-catalog.json"),
    providerCatalog: operationalJson("generated/p3/provider-catalog.json"),
    explicitResearchRoutes: operationalJson("source/p3-explicit-research-routes.json"),
    presentationFactCrosswalk: operationalJson("source/p4-presentation-medical-fact-crosswalk.json"),
    medicalFamilies: medical.entries,
    evidenceResolver: operationalJson("source/p7-evidence-resolver.json"),
    digestContract: operationalJson("source/p7-activation-digest-contract.json"),
    p7Campaign: operationalJson("source/p7-campaign.json"),
    dayCatalog: operationalJson("generated/p7/day-catalog.json"),
    directorCatalog: operationalJson("generated/p7/director-catalog.json"),
    resourceCrosswalk: operationalJson("generated/p6/p3-p5-resource-crosswalk.json"),
  };
}

function p3Bundle(input) {
  return {
    exactSourceCrosswalk: input.exactSourceCrosswalk,
    investigationUsagePolicy: input.investigationUsagePolicy,
    p3Policy: input.p3Policy,
    researchCatalog: input.researchCatalog,
    providerCatalog: input.providerCatalog,
    explicitResearchRoutes: input.explicitResearchRoutes,
  };
}

function p4Bundle(input) {
  return {
    presentationFactCrosswalk: input.presentationFactCrosswalk,
    medicalFamilies: input.medicalFamilies,
  };
}

function p7Bundle(input) {
  return {
    evidenceResolver: input.evidenceResolver,
    digestContract: input.digestContract,
    p7Campaign: input.p7Campaign,
    dayCatalog: input.dayCatalog,
    directorCatalog: input.directorCatalog,
  };
}

const input = loadInput();
const dynamicUrgencyBySource = new Map(input.exactSourceCrosswalk.urgencyValues.map((record) => [record.sourceValue, record]));
input.medicalUrgencyResolvers = {
  [dynamicUrgencyBySource.get("by_clinical_status").resolverRuleId]: () => "emergency",
  [dynamicUrgencyBySource.get("by_secondary_disease").resolverRuleId]: () => "routine",
};
let providerDueResolverCalls = 0;
input.providerDueResolver = ({
  orderedAtMinute,
  selectedTurnaroundPolicy,
  selectedWorkingDays,
  provider,
  providerClock,
}) => {
  providerDueResolverCalls += 1;
  if (selectedTurnaroundPolicy.kind === "categorical_minutes") {
    return orderedAtMinute + selectedTurnaroundPolicy.minutes;
  }
  assert.equal(provider.calendar === "always_open" || provider.calendar === "external_workweek", true);
  assert.deepEqual(providerClock.externalWorkingWeekdays, [1, 2, 3, 4, 5, 6]);
  return orderedAtMinute + selectedWorkingDays * 1440;
};
const p3Audit = validateOperationalP3AdapterBundleV3(p3Bundle(input));
assert.deepEqual(p3Audit, {
  urgencySourceValues: 206,
  classificationSourceValues: 875,
  investigationUsages: 1864,
  researchRoutes: 361,
  providers: 6,
  dynamicUsages: 2,
  fallbackAllowed: false,
  medicalResultAuthorityProjectionValidated: false,
  medicalResultAuthorityProjectionDrift: 361,
  blockers: [{
    id: "p3_medical_result_authority_projection_drift",
    count: 361,
  }],
});

const p4Audit = validateOperationalP4AdapterBundleV3(p4Bundle(input));
assert.equal(p4Audit.presentationHandlingBindings, 514);
assert.equal(p4Audit.medicalFactReferences, 950);
assert.equal(p4Audit.unknownMedicalFactReferences, 0);
assert.equal(p4Audit.syntheticMedicalFacts, 0);
assert(p4Audit.multiFactBindings > 0);

const p7Audit = validateOperationalP7DigestBundleV3(p7Bundle(input));
assert.equal(p7Audit.resolverRecords, 93);
assert.equal(p7Audit.goalBindings, 60);
assert.equal(p7Audit.catalogContents, 42);
assert.equal(p7Audit.mutationRejected, true);
assert.equal(p7Audit.runtimeEligible, false);
assert.match(p7Audit.resolverDigest, /^[a-f0-9]{64}$/u);
assert.match(p7Audit.activationDigest, /^[a-f0-9]{64}$/u);
assert.notEqual(p7Audit.mutationDigest, p7Audit.activationDigest);

assert.deepEqual(validateOperationalP5ReservationGateV3({
  resourceCrosswalk: input.resourceCrosswalk,
}), {
  reservationAuthority: false,
  flattenedResourceIdsCanReserve: false,
  exactP5V2JoinRequired: true,
});

const adapter = createOperationalAuthoringReviewAdapterV3(input);
assert.equal(adapter.adapterVersion, OPERATIONAL_AUTHORING_REVIEW_ADAPTER_V3_VERSION);
assert.equal(adapter.reviewOnly, true);
assert.equal(adapter.runtimeEligible, false);
assert.equal(adapter.productionEligible, false);
assert.equal(adapter.generatorEligible, false);
assert.equal(adapter.audit.p5ReservationGate.reservationAuthority, false);
assert.equal(Object.hasOwn(adapter.audit.p3, "medicalResultAuthority"), false,
  "this slice must not close the independently reported 361 medical-result authority drift");
assert(Object.isFrozen(adapter));
assert(Object.isFrozen(adapter.audit));
assert(Object.isFrozen(adapter.audit.p7));
assert.throws(() => {
  adapter.audit.p7.resolverRecords = 0;
}, TypeError);

const initial = adapter.createState();
assert.equal(initial.schemaVersion, OPERATIONAL_AUTHORING_REVIEW_ADAPTER_V3_STATE_VERSION);
assert.equal(initial.orders.length, 0);
assert(Object.isFrozen(initial));
assert(Object.isFrozen(initial.orders));

const usages = input.investigationUsagePolicy.usages;
const fixedLocal = usages.find((usage) => usage.urgencyBandId && usage.turnaroundPolicy.kind === "local");
const fixedCategorical = usages.find((usage) => usage.urgencyBandId &&
  usage.turnaroundPolicy.kind === "external" &&
  usage.turnaroundPolicy.candidates.some((candidate) => candidate.kind === "categorical_minutes"));
const fixedWorkingDay = usages.find((usage) => usage.urgencyBandId &&
  usage.turnaroundPolicy.kind === "external" &&
  usage.turnaroundPolicy.candidates.some((candidate) => candidate.kind === "working_day_range"));
const byClinicalStatus = usages.find((usage) => usage.sourceUrgency === "by_clinical_status");
const bySecondaryDisease = usages.find((usage) => usage.sourceUrgency === "by_secondary_disease");
assert(fixedLocal && fixedCategorical && fixedWorkingDay && byClinicalStatus && bySecondaryDisease);

const fixedLocalCommand = {
  commandId: "command-fixed-local",
  orderId: "order-fixed-local",
  usageId: fixedLocal.usageId,
  orderedAtMinute: 500,
};
let placed = adapter.placeInvestigationOrder(initial, fixedLocalCommand);
assert.equal(placed.idempotent, false);
assert.equal(placed.order.urgencyBandId, fixedLocal.urgencyBandId);
assert.equal(placed.order.selectedDueInMinutes, fixedLocal.turnaroundPolicy.minutes);
assert.equal(placed.order.dueAtMinute, 500 + fixedLocal.turnaroundPolicy.minutes);
assert.equal(placed.order.resolvedMedicalState, null);
assert(Object.isFrozen(placed.order));
assert(Object.isFrozen(placed.order.selectedTurnaroundPolicy));
let state = placed.state;

const categoricalCandidate = fixedCategorical.turnaroundPolicy.candidates.find(
  (candidate) => candidate.kind === "categorical_minutes",
);
const categoricalResearch = input.researchCatalog.research.find(
  (research) => research.researchId === fixedCategorical.researchId,
);
const categoricalCommand = {
  commandId: "command-fixed-categorical",
  orderId: "order-fixed-categorical",
  usageId: fixedCategorical.usageId,
  orderedAtMinute: 900,
  selectedCapabilityId: categoricalCandidate.capabilityId,
  selectedProviderId: categoricalResearch.providerIds[0],
};
placed = adapter.placeInvestigationOrder(state, categoricalCommand);
assert.equal(placed.order.selectedDueInMinutes, categoricalCandidate.minutes);
assert.equal(placed.order.dueAtMinute, categoricalCommand.orderedAtMinute + categoricalCandidate.minutes);
state = placed.state;

const workingCandidate = fixedWorkingDay.turnaroundPolicy.candidates.find(
  (candidate) => candidate.kind === "working_day_range",
);
const workingResearch = input.researchCatalog.research.find(
  (research) => research.researchId === fixedWorkingDay.researchId,
);
const workingCommand = {
  commandId: "command-fixed-working-day",
  orderId: "order-fixed-working-day",
  usageId: fixedWorkingDay.usageId,
  orderedAtMinute: 1000,
  selectedCapabilityId: workingCandidate.capabilityId,
  selectedProviderId: workingResearch.providerIds[0],
};
placed = adapter.placeInvestigationOrder(state, workingCommand);
assert(placed.order.selectedWorkingDays >= workingCandidate.minimumDays);
assert(placed.order.selectedWorkingDays <= workingCandidate.maximumDays);
assert(placed.order.dueAtMinute > workingCommand.orderedAtMinute);
state = placed.state;

const clinicalCommand = {
  commandId: "command-by-clinical-status",
  orderId: "order-by-clinical-status",
  usageId: byClinicalStatus.usageId,
  orderedAtMinute: 1200,
  medicalStateRevision: "visit-clinical-state@7",
};
placed = adapter.placeInvestigationOrder(state, clinicalCommand);
assert.equal(placed.order.urgencyBandId, "emergency");
assert.deepEqual(placed.order.resolvedMedicalState, {
  resolverRuleId: byClinicalStatus.turnaroundPolicy.resolverRuleId,
  urgencyBandId: "emergency",
  medicalStateRevision: clinicalCommand.medicalStateRevision,
});
state = placed.state;

const secondaryCommand = {
  commandId: "command-by-secondary-disease",
  orderId: "order-by-secondary-disease",
  usageId: bySecondaryDisease.usageId,
  orderedAtMinute: 1300,
  medicalStateRevision: "secondary-disease-state@4",
};
placed = adapter.placeInvestigationOrder(state, secondaryCommand);
assert.equal(placed.order.urgencyBandId, "routine");
state = placed.state;

const serialized = adapter.serializeState(state);
const providerCallsBeforeReload = providerDueResolverCalls;
const reloaded = adapter.deserializeState(serialized);
assert.equal(adapter.serializeState(reloaded), serialized);
assert(Object.isFrozen(reloaded));
assert(Object.isFrozen(reloaded.orders[0]));
const persistedClinicalDue = reloaded.orders.find((order) => order.orderId === clinicalCommand.orderId).dueAtMinute;
const replay = adapter.placeInvestigationOrder(reloaded, clinicalCommand);
assert.equal(replay.idempotent, true);
assert.equal(replay.order.dueAtMinute, persistedClinicalDue);
assert.equal(adapter.serializeState(replay.state), serialized);
assert.equal(providerDueResolverCalls, providerCallsBeforeReload,
  "deserialize and idempotent replay must use the persisted due instead of rerunning provider calendar logic");
assert.throws(() => adapter.placeInvestigationOrder(reloaded, {
  ...clinicalCommand,
  orderedAtMinute: clinicalCommand.orderedAtMinute + 1,
}), /conflicts with its persisted replay/u);
assert.equal(adapter.serializeState(reloaded), serialized, "conflicting replay must be atomic");

assert.throws(() => adapter.placeInvestigationOrder(reloaded, {
  commandId: "command-duplicate-order",
  orderId: clinicalCommand.orderId,
  usageId: clinicalCommand.usageId,
  orderedAtMinute: 1400,
  medicalStateRevision: clinicalCommand.medicalStateRevision,
}), /already exists/u);
assert.throws(() => adapter.placeInvestigationOrder(initial, {
  commandId: "command-dynamic-unresolved",
  orderId: "order-dynamic-unresolved",
  usageId: byClinicalStatus.usageId,
  orderedAtMinute: 500,
}), /requires a medical state revision/u);
const noDynamicResolverAdapter = createOperationalAuthoringReviewAdapterV3({
  ...input,
  medicalUrgencyResolvers: {},
});
assert.throws(() => noDynamicResolverAdapter.placeInvestigationOrder(initial, {
  commandId: "command-dynamic-no-resolver",
  orderId: "order-dynamic-no-resolver",
  usageId: byClinicalStatus.usageId,
  orderedAtMinute: 500,
  medicalStateRevision: "state@1",
}), /has no registered medical resolver/u);
const invalidDynamicResolverAdapter = createOperationalAuthoringReviewAdapterV3({
  ...input,
  medicalUrgencyResolvers: {
    ...input.medicalUrgencyResolvers,
    [byClinicalStatus.turnaroundPolicy.resolverRuleId]: () => "not_an_allowed_band",
  },
});
assert.throws(() => invalidDynamicResolverAdapter.placeInvestigationOrder(initial, {
  commandId: "command-dynamic-wrong-band",
  orderId: "order-dynamic-wrong-band",
  usageId: byClinicalStatus.usageId,
  orderedAtMinute: 500,
  medicalStateRevision: "state@1",
}), /does not allow resolved urgency band/u);
assert.throws(() => adapter.placeInvestigationOrder(initial, {
  commandId: "command-external-without-exact-capability",
  orderId: "order-external-without-exact-capability",
  usageId: fixedCategorical.usageId,
  orderedAtMinute: 500,
}), /requires an exact selectedCapabilityId/u);
assert.throws(() => adapter.placeInvestigationOrder(initial, {
  commandId: "command-external-without-exact-provider",
  orderId: "order-external-without-exact-provider",
  usageId: fixedCategorical.usageId,
  orderedAtMinute: 500,
  selectedCapabilityId: categoricalCandidate.capabilityId,
}), /requires an exact selectedProviderId/u);
const noProviderCalendarAdapter = createOperationalAuthoringReviewAdapterV3({
  ...input,
  providerDueResolver: null,
});
assert.throws(() => noProviderCalendarAdapter.placeInvestigationOrder(initial, categoricalCommand),
  /has no registered provider calendar\/cutoff resolver/u);
assert.throws(() => adapter.getExactInvestigationUsage(`${fixedLocal.usageId.slice(0, -1)}`),
  /unknown exact P3 usage/u);
assert.throws(() => adapter.getExactInvestigationUsage("unknown-usage"), /unknown exact P3 usage/u);

const multiFactBinding = input.presentationFactCrosswalk.bindings.find(
  (binding) => binding.medicalFactBindings.length > 1,
);
assert(multiFactBinding);
const firstFact = multiFactBinding.medicalFactBindings[0];
const availableAction = adapter.resolveHandlingAction({
  presentationRef: multiFactBinding.presentationRef,
  handlingTag: multiFactBinding.handlingTag,
  completedDiscoveryPaths: [firstFact.discoveryPaths[0]],
});
assert.equal(availableAction.facts.length, multiFactBinding.medicalFactBindings.length,
  "multiple presentation facts must not collapse to one representative fact");
assert.equal(availableAction.facts.find((fact) => fact.factId === firstFact.factId).available, true);
assert(Object.isFrozen(availableAction));
assert(Object.isFrozen(availableAction.facts));
assert(Object.isFrozen(availableAction.facts[0].medicalOwner));

const unavailableFactSource = multiFactBinding.medicalFactBindings.at(-1);
const unavailableFact = adapter.resolveHandlingFact({
  presentationRef: multiFactBinding.presentationRef,
  handlingTag: multiFactBinding.handlingTag,
  factId: unavailableFactSource.factId,
  completedDiscoveryPaths: [],
});
assert.equal(unavailableFact.available, false);
assert.equal(unavailableFact.resolution, "safe_alternative_required");
assert(unavailableFact.safeAlternatives.length > 0);
for (const alternative of unavailableFact.safeAlternatives) {
  assert.equal(alternative.factId, unavailableFact.factId);
  assert.equal(alternative.medicalOwner.sourcePointer, unavailableFact.medicalOwner.sourcePointer);
  assert.deepEqual(
    alternative.payload,
    unavailableFactSource.safeAlternatives.find((source) => source.alternativeId === alternative.alternativeId).payload,
  );
}
assert.throws(() => adapter.resolveHandlingFact({
  presentationRef: multiFactBinding.presentationRef,
  handlingTag: multiFactBinding.handlingTag,
  factId: "unknown-medical-fact",
  completedDiscoveryPaths: [],
}), /unknown exact medical fact/u);
assert.throws(() => adapter.resolveHandlingAction({
  presentationRef: multiFactBinding.presentationRef,
  handlingTag: multiFactBinding.handlingTag.slice(0, -1),
  completedDiscoveryPaths: [],
}), /unknown exact P4 presentation\/handling binding/u);

assert.throws(() => adapter.reserveResources({ resourceIds: ["resource.any"] }),
  /reservation authority is disabled/u);
assert.throws(() => adapter.requireReservationAuthority(), /reservation authority is disabled/u);

const mutatedP3 = clone(input);
mutatedP3.investigationUsagePolicy.usages[0].sourceUrgency = "unknown_dynamic_default";
assert.throws(() => validateOperationalP3AdapterBundleV3(p3Bundle(mutatedP3)),
  /urgency sources do not cover the exact source crosswalk|unknown exact source urgency/u);

const incompleteP3 = clone(input);
incompleteP3.investigationUsagePolicy.usages.pop();
assert.throws(() => validateOperationalP3AdapterBundleV3(p3Bundle(incompleteP3)),
  /exact usage set must contain 1,864 records/u);

const approximateP3 = clone(input);
approximateP3.exactSourceCrosswalk.urgencyValues[0].regex = ".*";
assert.throws(() => validateOperationalP3AdapterBundleV3(p3Bundle(approximateP3)),
  /forbidden approximate\/default runtime authority/u);

const mutatedP4 = clone(input);
mutatedP4.presentationFactCrosswalk.bindings[0].medicalFactBindings[0].factId = "unknown-medical-fact";
assert.throws(() => validateOperationalP4AdapterBundleV3(p4Bundle(mutatedP4)),
  /does not preserve all exact presentation facts|unknown medical fact/u);

const crossPresentationFactSwap = clone(input);
const targetBinding = crossPresentationFactSwap.presentationFactCrosswalk.bindings[0];
const otherPresentationFact = crossPresentationFactSwap.presentationFactCrosswalk.bindings
  .find((binding) => binding.presentationRef !== targetBinding.presentationRef &&
    binding.medicalFactBindings.some((fact) =>
      !targetBinding.medicalFactBindings.some((targetFact) => targetFact.factId === fact.factId)))
  .medicalFactBindings
  .find((fact) => !targetBinding.medicalFactBindings.some((targetFact) => targetFact.factId === fact.factId));
assert(otherPresentationFact, "test fixture must provide a fact that exists only in another presentation");
targetBinding.medicalFactBindings[0] = clone(otherPresentationFact);
assert.throws(() => validateOperationalP4AdapterBundleV3(p4Bundle(crossPresentationFactSwap)),
  /does not preserve all exact presentation facts|source pointer drifted/u);

const collapsedP4 = clone(input);
const collapsedBinding = collapsedP4.presentationFactCrosswalk.bindings.find(
  (binding) => binding.medicalFactBindings.length > 1,
);
collapsedBinding.medicalFactBindings.splice(1);
assert.throws(() => validateOperationalP4AdapterBundleV3(p4Bundle(collapsedP4)),
  /does not preserve all exact presentation facts/u);

const missingSafeRouteProvider = clone(input);
const missingProviderAlternative = missingSafeRouteProvider.presentationFactCrosswalk.bindings
  .flatMap((binding) => binding.medicalFactBindings)
  .flatMap((fact) => fact.safeAlternatives)[0];
delete missingProviderAlternative.payload.providerResolver;
delete missingProviderAlternative.payload.providerId;
assert.throws(() => validateOperationalP4AdapterBundleV3(p4Bundle(missingSafeRouteProvider)),
  /exactly one provider resolver or provider ID/u);

const ambiguousSafeRouteProvider = clone(input);
const ambiguousProviderAlternative = ambiguousSafeRouteProvider.presentationFactCrosswalk.bindings
  .flatMap((binding) => binding.medicalFactBindings)
  .flatMap((fact) => fact.safeAlternatives)[0];
ambiguousProviderAlternative.payload.providerId = "ref_conflicting_provider";
assert.throws(() => validateOperationalP4AdapterBundleV3(p4Bundle(ambiguousSafeRouteProvider)),
  /exactly one provider resolver or provider ID/u);

const openedP7Activation = clone(input);
openedP7Activation.evidenceResolver.activation.programmerAdapterValidated = true;
assert.throws(() => validateOperationalP7DigestBundleV3(p7Bundle(openedP7Activation)),
  /cannot claim programmer adapter validation/u);

const mutatedOuterCampaign = clone(input);
mutatedOuterCampaign.dayCatalog.campaign.chapters += 1;
assert.throws(() => validateOperationalP7DigestBundleV3(p7Bundle(mutatedOuterCampaign)),
  /outer campaign projection drifted/u);

const mutatedOuterAuthority = clone(input);
mutatedOuterAuthority.dayCatalog.authority.saveSchemaChange = true;
assert.throws(() => validateOperationalP7DigestBundleV3(p7Bundle(mutatedOuterAuthority)),
  /outer authority projection drifted/u);

const mutatedEmbeddedDigestContract = clone(input);
mutatedEmbeddedDigestContract.directorCatalog.activationDigestContract.adapterVersion += "-mutated";
assert.throws(() => validateOperationalP7DigestBundleV3(p7Bundle(mutatedEmbeddedDigestContract)),
  /activation digest contract projection drifted/u);

const mutatedResolver = clone(input);
mutatedResolver.evidenceResolver.goalEvidence[0].fieldOrPredicate += "_mutated";
assert.throws(() => validateOperationalP7DigestBundleV3(p7Bundle(mutatedResolver)),
  /resolver source projection drifted|resolver envelope/u);

const rebuiltResolverWithStaleActivation = clone(input);
const changedResolverPayload = rebuiltResolverWithStaleActivation.evidenceResolver.goalEvidence[0];
changedResolverPayload.fieldOrPredicate += "_semantically_rebuilt";
rebuiltResolverWithStaleActivation.directorCatalog.evidenceResolver =
  clone(rebuiltResolverWithStaleActivation.evidenceResolver);
const changedResolverRecord = rebuiltResolverWithStaleActivation.directorCatalog.resolverEnvelope.records.find(
  (record) => record.section === "goalEvidence" && record.recordId === changedResolverPayload.evidenceId,
);
changedResolverRecord.payload = clone(changedResolverPayload);
changedResolverRecord.contentSha256 = sha256CanonicalOperationalV3(changedResolverRecord.payload);
const rebuiltResolverDigest = sha256CanonicalOperationalV3({
  adapterVersion: rebuiltResolverWithStaleActivation.digestContract.adapterVersion,
  records: rebuiltResolverWithStaleActivation.directorCatalog.resolverEnvelope.records,
});
rebuiltResolverWithStaleActivation.directorCatalog.resolverEnvelope.resolverDigest = rebuiltResolverDigest;
rebuiltResolverWithStaleActivation.dayCatalog.resolverDigest = rebuiltResolverDigest;
for (const day of rebuiltResolverWithStaleActivation.dayCatalog.days) {
  for (const goal of day.goals) {
    goal.resolverBinding.resolverDigest = rebuiltResolverDigest;
    if (goal.resolverBinding.recordId === changedResolverPayload.evidenceId) {
      goal.evidenceResolver = clone(changedResolverPayload);
      goal.resolverBinding.contentSha256 = changedResolverRecord.contentSha256;
    }
  }
}
for (const envelopes of Object.values(rebuiltResolverWithStaleActivation.directorCatalog.catalogEnvelopes)) {
  for (const envelope of envelopes) {
    envelope.catalogRef.resolverDigest = rebuiltResolverDigest;
    for (const binding of envelope.resolverBindings) binding.resolverDigest = rebuiltResolverDigest;
  }
}
rebuiltResolverWithStaleActivation.directorCatalog.activationDigestInput = {
  adapterVersion: rebuiltResolverWithStaleActivation.digestContract.adapterVersion,
  dayCatalog: rebuiltResolverWithStaleActivation.dayCatalog.days,
  axes: rebuiltResolverWithStaleActivation.p7Campaign.axes,
  catalogEnvelopes: rebuiltResolverWithStaleActivation.directorCatalog.catalogEnvelopes,
  recovery: rebuiltResolverWithStaleActivation.p7Campaign.recovery,
  resolverEnvelope: rebuiltResolverWithStaleActivation.directorCatalog.resolverEnvelope,
};
assert.notEqual(
  sha256CanonicalOperationalV3(rebuiltResolverWithStaleActivation.directorCatalog.activationDigestInput),
  rebuiltResolverWithStaleActivation.directorCatalog.activationDigest,
  "rebuilt resolver projection must invalidate the previously approved activation digest",
);
assert.throws(() => validateOperationalP7DigestBundleV3(p7Bundle(rebuiltResolverWithStaleActivation)),
  /activation digest mismatch/u);

const mutatedDay = clone(input);
mutatedDay.dayCatalog.days[0].title += " mutated";
assert.throws(() => validateOperationalP7DigestBundleV3(p7Bundle(mutatedDay)),
  /source field title drifted|activation digest/u);

const mutatedEnvelope = clone(input);
mutatedEnvelope.directorCatalog.catalogEnvelopes.events[0].payload.repeatability = "mutated";
assert.throws(() => validateOperationalP7DigestBundleV3(p7Bundle(mutatedEnvelope)),
  /payload drifted|content digest/u);

const mutatedActivationDigest = clone(input);
mutatedActivationDigest.directorCatalog.activationDigest = "0".repeat(64);
assert.throws(() => validateOperationalP7DigestBundleV3(p7Bundle(mutatedActivationDigest)),
  /activation digest mismatch/u);

const openedP5Gate = clone(input.resourceCrosswalk);
openedP5Gate.reservationAuthority = true;
assert.throws(() => validateOperationalP5ReservationGateV3({ resourceCrosswalk: openedP5Gate }),
  /cannot become reservation authority/u);

const inputMutationProbe = loadInput();
inputMutationProbe.medicalUrgencyResolvers = input.medicalUrgencyResolvers;
inputMutationProbe.providerDueResolver = input.providerDueResolver;
const immutableAdapter = createOperationalAuthoringReviewAdapterV3(inputMutationProbe);
const originalUsageId = inputMutationProbe.investigationUsagePolicy.usages[0].usageId;
inputMutationProbe.investigationUsagePolicy.usages[0].usageId = "mutated-after-construction";
assert.equal(immutableAdapter.getExactInvestigationUsage(originalUsageId).usageId, originalUsageId,
  "adapter must own an immutable clone instead of retaining mutable author input");
assert.throws(() => immutableAdapter.getExactInvestigationUsage("mutated-after-construction"),
  /unknown exact P3 usage/u);

const tamperedState = JSON.parse(serialized);
tamperedState.orders[0].dueAtMinute += 1;
assert.throws(() => adapter.deserializeState(JSON.stringify(tamperedState)), /persisted due time drifted/u);
assert.throws(() => adapter.deserializeState("{"), /cannot parse serialized adapter state/u);

const operationalReviewInput = {
  documents: {
    "source/p3-exact-source-crosswalk.json": input.exactSourceCrosswalk,
    "generated/p3/investigation-usage-policy.json": input.investigationUsagePolicy,
    "source/p3-policy.json": input.p3Policy,
    "generated/p3/research-catalog.json": input.researchCatalog,
    "generated/p3/provider-catalog.json": input.providerCatalog,
    "source/p3-explicit-research-routes.json": input.explicitResearchRoutes,
    "source/p4-presentation-medical-fact-crosswalk.json": input.presentationFactCrosswalk,
    "source/p7-evidence-resolver.json": input.evidenceResolver,
    "source/p7-activation-digest-contract.json": input.digestContract,
    "source/p7-campaign.json": input.p7Campaign,
    "generated/p7/day-catalog.json": input.dayCatalog,
    "generated/p7/director-catalog.json": input.directorCatalog,
    "generated/p6/p3-p5-resource-crosswalk.json": input.resourceCrosswalk,
  },
};
const medical = loadMedicalFamilies();
const fromReviewInputs = createOperationalAuthoringReviewAdapterV3FromReviewInputs(
  operationalReviewInput,
  {
    manifest: medical.manifest,
    families: medical.entries.map((entry) => entry.document),
  },
  {
    medicalUrgencyResolvers: input.medicalUrgencyResolvers,
    providerDueResolver: input.providerDueResolver,
  },
);
assert.equal(fromReviewInputs.audit.p3.investigationUsages, 1864);
assert.equal(fromReviewInputs.audit.p4.presentationHandlingBindings, 514);
assert.equal(fromReviewInputs.audit.p7.resolverRecords, 93);
assert.equal(fromReviewInputs.audit.p5ReservationGate.reservationAuthority, false);

assert.equal(
  sha256CanonicalOperationalV3(input.directorCatalog.activationDigestInput),
  input.directorCatalog.activationDigest,
);

console.log(JSON.stringify({
  status: "pass",
  adapterVersion: adapter.adapterVersion,
  p3: adapter.audit.p3,
  p4: adapter.audit.p4,
  p7: {
    resolverRecords: adapter.audit.p7.resolverRecords,
    goalBindings: adapter.audit.p7.goalBindings,
    catalogContents: adapter.audit.p7.catalogContents,
    resolverDigest: adapter.audit.p7.resolverDigest,
    activationDigest: adapter.audit.p7.activationDigest,
    mutationRejected: adapter.audit.p7.mutationRejected,
  },
  p5ReservationAuthority: adapter.audit.p5ReservationGate.reservationAuthority,
  persistedOrders: reloaded.orders.length,
  replayIdempotent: replay.idempotent,
  medicalResultAuthorityDriftClosedByThisAdapter: false,
}, null, 2));
