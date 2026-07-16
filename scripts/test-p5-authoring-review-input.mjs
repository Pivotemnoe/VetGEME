import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  P5_BASELINE_MANIFEST_PATH,
  P5_CAMPAIGN_MECHANICS_PATH,
  P5_CURRENT_CAMPAIGN_PATH,
  P5_ECONOMY_RUNTIME_PATH,
  P5_OPERATIONS_RUNTIME_PATH,
  P5_REVIEW_INPUT_ID,
  P5_REVIEW_INPUT_VERSION,
  P5_SCHEDULER_PATH,
  loadP5AuthoringReviewInput,
  loadP5AuthoringReviewInputFromReader,
  validateP5AuthoringPackage,
  validateP5ReviewInputRegistration,
} from "./lib/p5-authoring-review-input.mjs";
import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
} from "./lib/medical-authoring-review-input.mjs";
import { loadOperationalAuthoringReviewInputFromReader } from "./lib/operational-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reader = createFileSystemReviewInputReader(projectRoot);
const registry = await readJson(REVIEW_INPUT_REGISTRY_PATH);
const registration = registry.reviewInputs.find((entry) => (
  entry.reviewInputId === P5_REVIEW_INPUT_ID && entry.reviewInputVersion === P5_REVIEW_INPUT_VERSION
));
assert.ok(registration, "P5 review input registration is missing");

const reviewInput = await loadP5AuthoringReviewInput(projectRoot, { context: "review" });
assert.equal(reviewInput.loadContext, "review");
assert.equal(reviewInput.reviewOnly, true);
assert.equal(reviewInput.productionEligible, false);
assert.equal(reviewInput.runtimeEligible, false);
assert.equal(reviewInput.allowCurrentCaseCrosswalk, false);
assert.equal(reviewInput.registration.allowRuntimeActivation, false);
assert.equal(reviewInput.registration.allowAutomaticP6Crosswalk, false);
assert.equal(reviewInput.productionPool.length, 0);
assert.deepEqual(reviewInput.audit.counts, {
  sourceFiles: 17,
  sourceBytes: 2947725,
  productionPool: 0,
  staff: 10,
  rooms: 12,
  equipmentResources: 27,
  totalResources: 49,
  visitTaskTemplates: 14,
  capabilitiesMapped: 447,
  researchTasks: 361,
  investigationUsagesMapped: 1864,
  scheduleDays: 30,
  baselineCases: 30,
  baselineCrosswalkMatches: 0,
});
assert.equal(reviewInput.blockers.length, 23);
assert.deepEqual(reviewInput.blockers.map((blocker) => blocker.id), [
  "activation_requirements_unsatisfied",
  "p5_upstream_operational_catalogs_review_only",
  "p5_resource_lifecycle_resolver_missing",
  "p5_p6_room_asset_mapping_missing",
  "p5_starting_room_ownership_seed_missing",
  "p5_starting_equipment_readiness_stock_mapping_missing",
  "p5_p6_imaging_wage_role_missing",
  "p5_day1_checkin_unavailable",
  "p5_inactive_anyof_filtering_missing",
  "p5_skill_requirement_double_reservation",
  "p5_day1_referral_no_doctor_fallback",
  "p5_handoff_policy_gate_missing",
  "p5_capability_handoff_policy_missing",
  "p5_handoff_rounding_undefined",
  "p5_safe_route_precedence_ambiguous",
  "p5_p3_route_branching_missing",
  "p5_stabilization_route_mapping_missing",
  "p5_inventory_scheduler_transaction_missing",
  "p5_p3_device_migration_missing",
  "p5_clock_queue_driver_missing",
  "p5_shift_policy_bridge_missing",
  "p5_runtime_operational_policies_unwired",
  "p5_p6_duration_semantic_divergence",
]);

const gaps = reviewInput.audit.gapAudit;
assert.equal(gaps.startAvailability.startsActiveCandidates, 9);
assert.equal(gaps.startAvailability.p5RequirementFreeResources, 7);
assert.deepEqual([
  gaps.startAvailability.candidate.visit.templatesSchedulableAtStart,
  gaps.startAvailability.candidate.research.templatesSchedulableAtStart,
  gaps.startAvailability.candidate.capability.templatesSchedulableAtStart,
], [13, 144, 140]);
assert.deepEqual([
  gaps.startAvailability.p5RequirementFree.visit.templatesSchedulableAtStart,
  gaps.startAvailability.p5RequirementFree.research.templatesSchedulableAtStart,
  gaps.startAvailability.p5RequirementFree.capability.templatesSchedulableAtStart,
], [13, 124, 125]);
assert.deepEqual([
  gaps.startAvailability.p5RequirementFree.research.templatesBlockedAtStart,
  gaps.startAvailability.p5RequirementFree.capability.templatesBlockedAtStart,
], [237, 242]);
assert.equal(gaps.roomsMissingAssetMappings.length, 4);
assert.equal(gaps.startingRoomOwnership.rooms.length, 5);
assert.equal(gaps.startingRoomOwnership.crossSystemActivatableSetResolved, false);
assert.equal(gaps.startingEquipment.length, 2);
assert.equal(gaps.equipmentWithoutStockMapping.length, 27);
assert.deepEqual(gaps.staffingEconomy.missingWageRoles, ["imaging_staff"]);
assert.equal(gaps.skills.separateSkillRequirementTasks, 33);
assert.deepEqual(
  gaps.skills.multiSkillDoubleReservations.map((record) => record.researchId),
  [
    "chf_ecg_blood_pressure_and_oxygenation",
    "dental_anesthetized_tooth_by_tooth_charting",
    "dental_periodontal_probe_mobility_and_furcation_assessment",
    "feline_asthma_respiratory_triage_and_minimal_handling",
    "pneumonia_respiratory_triage_and_oxygenation",
  ],
);
assert.equal(
  gaps.skills.multiSkillDoubleReservations.find((record) => record.researchId === "chf_ecg_blood_pressure_and_oxygenation")
    .requiredStaffReservationGroups,
  4,
);
assert.equal(gaps.dayOneReferralRoutes.length, 11);
assert.ok(gaps.dayOneReferralRoutes.every((record) => !record.doctorFallbackPresent && record.activeStaffAlternativeIds.length === 0));
assert.deepEqual(gaps.handoff.distribution, {
  not_allowed: 600,
  midpoint: 190,
  urgent_quarter_breakpoints: 1074,
});
assert.equal(gaps.handoff.fractionalUsages.urgent_quarter_breakpoints.length, 476);
assert.equal(gaps.handoff.fractionalUsages.midpoint.length, 51);
assert.deepEqual(gaps.handoff.runtimePolicyIdentifiers, []);
assert.equal(gaps.handoff.bundledValidatorFixture.taskTemplateId, "visit.history");
assert.equal(gaps.handoff.bundledValidatorFixture.authoredPolicyId, "not_allowed");
assert.equal(gaps.handoff.capabilityPolicyCoverage.capabilitiesWithHandoffPolicy, 0);
assert.equal(gaps.handoff.capabilityPolicyCoverage.taskBearingCapabilityIdsWithoutHandoffPolicy.length, 367);
assert.equal(gaps.routeBranching.p3NullFallbackDefaults.length, 12);
assert.ok(gaps.routeBranching.p3NullFallbackDefaults.every((record) => record.p5SafeRouteId === "safe_referral"));
assert.equal(gaps.routeBranching.externalCoordinationTasks, 135);
assert.equal(gaps.routeBranching.externalWithLocalPhysicalRequirements.length, 27);
assert.equal(gaps.inventory.usedCapabilityIds.length, 21);
assert.equal(gaps.inventory.mappedPolicies.length, 21);
assert.equal(gaps.inventory.p6StartingLotsPresent, false);
assert.equal(gaps.inventory.atomicSchedulerEconomyTransactionPresent, false);
assert.equal(gaps.inventory.queuedOrInFlightInventoryOwnershipTransferPresent, false);
assert.equal(gaps.deviceMigration.capabilityId, "cgm_sensor");
assert.equal(gaps.deviceMigration.capabilityType, "consumable_device");
assert.equal(gaps.deviceMigration.p5ResourceKind, "equipment");
assert.equal(gaps.deviceMigration.approvedMigrationRule, null);
assert.equal(gaps.shifts.absenceEventMatches.length, 3);
assert.ok(gaps.shifts.absenceEventMatches.every((record) => record.exactP7EventIds.length === 0));
assert.equal(gaps.shifts.startingDoctorIds.length, 2);
assert.equal(gaps.shifts.oneDoctorUntilSecondConsultOwned, true);
assert.equal(gaps.shifts.secondConsultStartsActive, false);
assert.equal(gaps.shifts.sourceLegacyIdsDroppedFromGenerated.length, 2);
assert.equal(gaps.runtimePolicies.staffCount, 10);
assert.equal(gaps.runtimePolicies.p5FatigueBands, 5);
assert.deepEqual(gaps.runtimePolicies.sourceBaseFatigueValueCounts, [
  { baseFatigue: 0, staffCount: 8 },
  { baseFatigue: 6, staffCount: 1 },
  { baseFatigue: 10, staffCount: 1 },
]);
assert.deepEqual(
  gaps.runtimePolicies.sourceBaseFatigueByStaff.map((record) => [record.resourceId, record.sourceBaseFatigue]),
  [
    ["staff.doctor.sokolova", 10],
    ["staff.doctor.morozov", 6],
    ["staff.assistant.volkova", 0],
    ["staff.administrator.lebedeva", 0],
    ["staff.lab.krylova", 0],
    ["staff.imaging.zhukova", 0],
    ["staff.doctor.belov", 0],
    ["staff.care.romanova", 0],
    ["staff.dentist.orlova", 0],
    ["staff.manager.smirnova", 0],
  ],
);
assert.equal(gaps.runtimePolicies.generatedBaseFatigueMissingStaffIds.length, 10);
assert.equal(gaps.runtimePolicies.generatedBaseFatigueProjectionComplete, false);
assert.deepEqual(gaps.runtimePolicies.explicitBaseFatigueStartupAuthorityFields, []);
assert.equal(gaps.runtimePolicies.adapterMaySeedAuthoredBaseFatigue, false);
assert.equal(gaps.runtimePolicies.p5FatigueAccumulationRulePresent, false);
assert.equal(gaps.runtimePolicies.p5FatigueRecoveryRulePresent, false);
assert.deepEqual(gaps.runtimePolicies.legacyCampaignDoctorIds, ["morozov", "sokolova"]);
assert.equal(gaps.runtimePolicies.approvedStaffCrosswalkPresent, false);
assert.equal(gaps.durationSemantics.comparedCapabilities, 447);
assert.equal(gaps.durationSemantics.divergentCapabilities, 312);
assert.equal(gaps.durationSemantics.matchingCapabilities, 135);
assert.equal(Object.isFrozen(reviewInput), true);
assert.equal(Object.isFrozen(reviewInput.audit.gapAudit), true);
assert.equal(Object.isFrozen(reviewInput.blockers[0].details), true);

await assert.rejects(loadP5AuthoringReviewInputFromReader(reader, registry), /explicit review context is required/);
await assert.rejects(
  loadP5AuthoringReviewInputFromReader(reader, registry, { context: "production" }),
  /context production is forbidden/,
);

for (const [field, value, pattern] of [
  ["productionEligible", true, /productionEligible must be false/],
  ["runtimeEligible", true, /runtimeEligible must be false/],
  ["allowCurrentCaseCrosswalk", true, /allowCurrentCaseCrosswalk must be false/],
  ["allowRuntimeActivation", true, /allowRuntimeActivation must be false/],
  ["allowAutomaticP6Crosswalk", true, /allowAutomaticP6Crosswalk must be false/],
]) {
  const tampered = clone(registration);
  tampered[field] = value;
  assert.throws(() => validateP5ReviewInputRegistration(tampered), pattern);
}
const runtimeKind = clone(registration);
runtimeKind.kind = "p5_runtime";
assert.throws(() => validateP5ReviewInputRegistration(runtimeKind), /kind must be p5_authoring/);
const upstreamDigestRegistration = clone(registration);
upstreamDigestRegistration.operationalReviewInput.catalogSha256.p6Economy = "0".repeat(64);
assert.throws(() => validateP5ReviewInputRegistration(upstreamDigestRegistration), /P6 economy dependency digest mismatch/);

const tamperedDigestRegistry = clone(registry);
tamperedDigestRegistry.reviewInputs.find((entry) => entry.reviewInputId === P5_REVIEW_INPUT_ID)
  .sourceIntegrity.aggregateSha256 = "0".repeat(64);
await assert.rejects(
  loadP5AuthoringReviewInputFromReader(reader, tamperedDigestRegistry, { context: "review" }),
  /provenance aggregate digest mismatch/,
);

const sourceRoot = `${registration.root}/${registration.sourceRoot}`;
const readmePath = `${sourceRoot}/README.md`;
const byteTamperedReader = wrapReader(reader, {
  async readBytes(requestedPath) {
    const bytes = await reader.readBytes(requestedPath);
    return requestedPath === readmePath ? Buffer.concat([bytes, Buffer.from("tampered\n")]) : bytes;
  },
});
await assert.rejects(
  loadP5AuthoringReviewInputFromReader(byteTamperedReader, registry, { context: "review" }),
  /byte length mismatch for README\.md/,
);
const missingFileReader = wrapReader(reader, {
  async listFiles(requestedRoot) {
    const files = await reader.listFiles(requestedRoot);
    return requestedRoot === sourceRoot ? files.filter((file) => file !== "README.md") : files;
  },
});
await assert.rejects(
  loadP5AuthoringReviewInputFromReader(missingFileReader, registry, { context: "review" }),
  /source file set differs from provenance/,
);

const sourceFiles = await reader.listFiles(sourceRoot);
const sourceBytesByPath = new Map(await Promise.all(sourceFiles.map(async (relativePath) => [
  relativePath,
  await reader.readBytes(`${sourceRoot}/${relativePath}`),
])));
const capabilityBytes = await reader.readBytes(registration.capabilityRegistry.path);
const operationalReviewInput = await loadOperationalAuthoringReviewInputFromReader(reader, registry, { context: "review" });
const baseFixture = async () => ({
  registration: clone(registration),
  manifest: clone(reviewInput.manifest),
  sourceFiles: [...sourceFiles],
  sourceBytesByPath: new Map([...sourceBytesByPath].map(([key, value]) => [key, Buffer.from(value)])),
  catalogs: clone(reviewInput.catalogs),
  sourcePolicy: clone(reviewInput.sourcePolicy),
  capabilityRegistry: JSON.parse(capabilityBytes.toString("utf8")),
  capabilityBytes,
  operationalReviewInput,
  baselineManifest: await readJson(P5_BASELINE_MANIFEST_PATH),
  schedulerSource: (await reader.readBytes(P5_SCHEDULER_PATH)).toString("utf8"),
  operationsSource: (await reader.readBytes(P5_OPERATIONS_RUNTIME_PATH)).toString("utf8"),
  economySource: (await reader.readBytes(P5_ECONOMY_RUNTIME_PATH)).toString("utf8"),
  currentCampaignSource: (await reader.readBytes(P5_CURRENT_CAMPAIGN_PATH)).toString("utf8"),
  campaignMechanicsSource: (await reader.readBytes(P5_CAMPAIGN_MECHANICS_PATH)).toString("utf8"),
});

const manifestRuntimeFixture = await baseFixture();
manifestRuntimeFixture.manifest.runtimeEligible = true;
assert.throws(() => validateP5AuthoringPackage(manifestRuntimeFixture), /manifest runtimeEligible must remain false/);
const catalogRuntimeFixture = await baseFixture();
catalogRuntimeFixture.catalogs["generated/resource-catalog.json"].runtimeEligible = true;
assert.throws(() => validateP5AuthoringPackage(catalogRuntimeFixture), /runtimeEligible must remain false/);
const clinicalPayloadFixture = await baseFixture();
clinicalPayloadFixture.catalogs["generated/resource-catalog.json"].diagnosis = "forbidden";
assert.throws(() => validateP5AuthoringPackage(clinicalPayloadFixture), /p5Authoring\.catalogs\.generated\/resource-catalog\.json\.diagnosis/);
const clinicalResultFixture = await baseFixture();
clinicalResultFixture.catalogs["generated/visit-task-catalog.json"].result = "forbidden";
assert.throws(() => validateP5AuthoringPackage(clinicalResultFixture), /visit-task-catalog\.json\.result/);
const boundaryFixture = await baseFixture();
boundaryFixture.sourcePolicy.boundaries.p6OwnsInventoryAssetsAndMaintenanceLedger = false;
assert.throws(() => validateP5AuthoringPackage(boundaryFixture), /source\/manifest authority boundaries differ/);
const crosswalkFixture = await baseFixture();
const baselineId = crosswalkFixture.baselineManifest.cases[0].id;
crosswalkFixture.sourceBytesByPath.set(
  "README.md",
  Buffer.concat([crosswalkFixture.sourceBytesByPath.get("README.md"), Buffer.from(`\n${baselineId}\n`)]),
);
assert.throws(() => validateP5AuthoringPackage(crosswalkFixture), /unapproved current 30-card crosswalk/);
const hiddenSkillGapFixture = await baseFixture();
hiddenSkillGapFixture.catalogs["generated/research-task-catalog.json"].researchTasks
  .find((task) => task.researchId === "chf_ecg_blood_pressure_and_oxygenation")
  .runtimeTemplate.requirementGroups = hiddenSkillGapFixture.catalogs["generated/research-task-catalog.json"].researchTasks
    .find((task) => task.researchId === "chf_ecg_blood_pressure_and_oxygenation")
    .runtimeTemplate.requirementGroups.filter((group) => group.id !== "skill.trained_stabilization");
assert.throws(() => validateP5AuthoringPackage(hiddenSkillGapFixture), /five multi-skill double-reservation cases changed|four conflicting staff reservation groups/);
const fakeCapabilityHandoffFixture = await baseFixture();
fakeCapabilityHandoffFixture.catalogs["generated/capability-operations-map.json"].capabilities[0].handoffPolicyId = "not_allowed";
assert.throws(() => validateP5AuthoringPackage(fakeCapabilityHandoffFixture), /capability handoff policy coverage changed/);
const fakeRouteBranchFixture = await baseFixture();
fakeRouteBranchFixture.catalogs["generated/research-task-catalog.json"].researchTasks
  .find((task) => task.taskClassId === "external_coordination" && task.physicalResourceIds.length > 0)
  .routeBranches = [{ kind: "local" }, { kind: "external" }];
assert.throws(() => validateP5AuthoringPackage(fakeRouteBranchFixture), /route branching gap changed/);
const sourceBaseFatigueFixture = await baseFixture();
sourceBaseFatigueFixture.sourcePolicy.staff.find((staff) => staff.staffId === "staff.doctor.sokolova").baseFatigue = 9;
assert.throws(() => validateP5AuthoringPackage(sourceBaseFatigueFixture), /source baseFatigue distribution must remain 10\/6\/0/);
const generatedBaseFatigueFixture = await baseFixture();
generatedBaseFatigueFixture.catalogs["generated/resource-catalog.json"].resources
  .find((resource) => resource.resourceId === "staff.doctor.sokolova")
  .baseFatigue = 10;
assert.throws(() => validateP5AuthoringPackage(generatedBaseFatigueFixture), /generated resource baseFatigue projection gap changed/);
const startupAuthorityFixture = await baseFixture();
startupAuthorityFixture.sourcePolicy.baseFatigueStartupAuthority = "p5_source_policy";
assert.throws(() => validateP5AuthoringPackage(startupAuthorityFixture), /baseFatigue startup authority changed/);

console.log(JSON.stringify({
  status: "passed",
  reviewOnlyLoadVerified: true,
  productionAndDefaultContextsRejected: true,
  activationAndAutomaticCrosswalkFlipsRejected: true,
  provenanceSourceAndUpstreamPinsVerified: true,
  clinicalPayloadAndCurrentCaseCrosswalkRejected: true,
  candidateAndP5RequirementFreeSlicesSeparated: true,
  exactP5P3P6P7RuntimeGapsPreservedForReview: true,
  blockerCount: reviewInput.blockers.length,
  blockerIds: reviewInput.blockers.map((blocker) => blocker.id),
}, null, 2));

async function readJson(relativePath) {
  return JSON.parse((await reader.readBytes(relativePath)).toString("utf8"));
}

function wrapReader(base, overrides) {
  return {
    readBytes: overrides.readBytes || ((requestedPath) => base.readBytes(requestedPath)),
    listFiles: overrides.listFiles || ((requestedRoot) => base.listFiles(requestedRoot)),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
