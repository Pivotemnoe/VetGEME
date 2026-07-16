#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageRoot, "..");
const p5Root = path.join(repoRoot, "p5-production-authoring-2026.07.16.2");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(relativePath, value) {
  const file = path.join(packageRoot, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const p6 = readJson(path.join(packageRoot, "source/p6-balance.json"));
const p7 = readJson(path.join(packageRoot, "source/p7-campaign.json"));
const p5Manifest = readJson(path.join(p5Root, "MANIFEST.json"));
const p5Resources = readJson(path.join(p5Root, "generated/resource-catalog.json"));
const p5CapabilityMap = readJson(path.join(p5Root, "generated/capability-operations-map.json"));
const p5Lifecycle = readJson(path.join(p5Root, "generated/resource-lifecycle-catalog.json"));
const p6Economy = readJson(path.join(packageRoot, "generated/p6/economy-catalog.json"));

const wageByRole = new Map(p6.staffWagesPerWorkedDay.map((item) => [item.roleId, item]));
const roomAssetById = new Map(p5Lifecycle.roomAssets.map((item) => [item.roomId, item]));
const capabilityEconomyById = new Map(p6Economy.capabilityEconomics.map((item) => [item.capabilityId, item]));

const resources = p5Resources.resources.map((resource) => {
  if (resource.resourceKind === "staff") {
    const wage = wageByRole.get(resource.role);
    if (!wage) throw new Error(`Missing P6 wage for ${resource.resourceId}.`);
    return {
      resourceId: resource.resourceId,
      resourceKind: resource.resourceKind,
      p5LifecycleState: resource.initialLifecycleState,
      p6EconomicAuthority: "staffWagesPerWorkedDay",
      economicRecord: wage,
      activationEvidenceIds: resource.initialEvidenceIds
    };
  }
  if (resource.resourceKind === "room") {
    const asset = roomAssetById.get(resource.resourceId);
    if (!asset) throw new Error(`Missing P6 room asset for ${resource.resourceId}.`);
    return {
      resourceId: resource.resourceId,
      resourceKind: resource.resourceKind,
      p5LifecycleState: resource.initialLifecycleState,
      p6EconomicAuthority: "roomAssets",
      assetCatalogId: asset.assetCatalogId,
      economicRecord: asset,
      activationEvidenceIds: resource.initialEvidenceIds
    };
  }
  const economy = capabilityEconomyById.get(resource.capabilityId);
  if (!economy?.assetPolicy) throw new Error(`Missing P6 equipment asset for ${resource.resourceId}.`);
  return {
    resourceId: resource.resourceId,
    resourceKind: resource.resourceKind,
    capabilityId: resource.capabilityId,
    p5LifecycleState: resource.initialLifecycleState,
    p6EconomicAuthority: "capabilityEconomics.assetPolicy",
    assetCatalogId: economy.assetPolicy.assetCatalogId,
    economicRecord: economy.assetPolicy,
    activationEvidenceIds: resource.initialEvidenceIds
  };
});

const capabilities = p5CapabilityMap.capabilities.map((operation) => {
  const economy = capabilityEconomyById.get(operation.capabilityId);
  if (!economy) throw new Error(`Missing P6 economics for capability ${operation.capabilityId}.`);
  return {
    capabilityId: operation.capabilityId,
    p5ExecutionMode: operation.executionMode,
    p5ResourceIds: [...new Set([
      ...(operation.eligibleStaffIds || []),
      ...(operation.eligibleRoomIds || []),
      ...(operation.physicalResourceIds || [])
    ])].sort(),
    p5StatePredicates: operation.statePredicates || [],
    p6ServiceId: economy.serviceId,
    p6InventoryPolicy: economy.inventoryPolicy,
    p6AssetCatalogId: economy.assetPolicy?.assetCatalogId || null,
    mappingAuthority: "author_exact_p5_p6_crosswalk_v2"
  };
});

const supplementalCapabilities = (p5CapabilityMap.supplementalCapabilities || []).map((operation) => ({
  capabilityId: operation.capabilityId,
  p5ResourceIds: [...new Set([
    ...(operation.eligibleStaffIds || []),
    ...(operation.eligibleRoomIds || []),
    ...(operation.eligibleEquipmentIds || [])
  ])].sort(),
  p6InventoryCategoryId: operation.inventoryCategoryId,
  fallbackRouteId: operation.fallbackRouteId,
  mappingAuthority: "author_exact_p4_p5_p6_crosswalk_v2"
}));

const evidenceResolvers = {
  completed_visit_ids: ["p5", "visitState", "completedVisitIds"],
  reviewed_order_ids: ["p3", "resultObligationState", "reviewedOrderIds"],
  shift_close_audit_id: ["p5", "shiftAudit", "closedShiftAuditId"],
  teach_back_fact_ids: ["p4", "ownerCommunicationState", "teachBackFactIds"],
  inventory_audit_id: ["p6", "inventoryState", "latestAuditId"],
  referral_order_ids: ["p3", "referralState", "referralOrderIds"],
  staff_rest_audit_id: ["p5", "shiftAudit", "restComplianceAuditId"],
  ledger_close_id: ["p6", "ledgerState", "latestCloseId"],
  completed_followup_visit_ids: ["p5", "visitState", "completedFollowupVisitIds"],
  process_result_ids: ["p4", "handlingActionState", "processResultIds"]
};

const triggerResolvers = {
  asset_maintenance_due: ["p6", "maintenanceState", "dueAssetIds"],
  campaign_day_30_complete: ["p7", "campaignState", "completedDay"],
  cash_above_protected_reserve: ["p6", "ledgerState", "cashVsProtectedReserve"],
  chapter_2_active: ["p7", "campaignState", "activeChapter"],
  chapter_3_active: ["p7", "campaignState", "activeChapter"],
  chapter_4_active: ["p7", "campaignState", "activeChapter"],
  chapter_5_active: ["p7", "campaignState", "activeChapter"],
  chapter_5_close: ["p7", "campaignState", "chapterClose"],
  chapter_last_day: ["p7", "campaignState", "isChapterLastDay"],
  critical_result_due: ["p3", "resultObligationState", "criticalDueOrderIds"],
  day_close: ["p7", "campaignState", "dayClose"],
  day_start: ["p7", "campaignState", "dayStart"],
  external_result_due: ["p3", "resultObligationState", "externalDueOrderIds"],
  first_owner_anxiety_gte_70: ["p4", "ownerState", "firstAnxietyAtLeast70"],
  followup_visit_due: ["p5", "visitState", "dueFollowupVisitIds"],
  inventory_below_reorder: ["p6", "inventoryState", "belowReorderCategoryIds"],
  owner_cost_consent_lte_30: ["p4", "ownerState", "costConsentAtMost30"],
  patient_fear_gte_70: ["p4", "patientState", "fearAtLeast70"],
  procedure_demand_exceeds_capacity: ["p5", "scheduler", "procedureDemandExceedsCapacity"],
  procurement_in_transit: ["p6", "assetState", "inTransitAssetIds"],
  safe_local_route_missing: ["p3", "researchRouteState", "missingLocalRouteIds"],
  shift_close: ["p5", "shiftState", "shiftClose"],
  specialization_recorded: ["p7", "campaignState", "specializationId"],
  three_or_more_owner_barriers: ["p4", "ownerState", "barrierCountAtLeast3"],
  waiting_count_gte_3: ["p5", "queueState", "waitingCountAtLeast3"]
};

const effectAuthorities = {
  audit_delivery_training_stock_maintenance: "p5_p6",
  audit_owned_work: "p5",
  axis_specific_goal: "p7",
  block_close_until_handoff: "p5",
  chapter_axis_snapshot: "p7",
  create_owned_review_task: "p3_p5",
  delay_one_day: "p6",
  explicit_procurement_choice: "p6",
  explicit_shift_choice: "p5",
  freeze_final_axis_evidence: "p7",
  increase_arrivals_by_one: "p5",
  isolation_capacity_audit: "p4_p5_p6",
  no_diagnosis_bias: "p7_guard",
  offer_full_staged_minimum_safe: "p4",
  offer_low_stress_action: "p4_p5",
  offer_recovery_if_needed: "p6_p7",
  offer_specialization_support_asset: "p6_p7",
  offer_teach_back: "p4",
  purchase_or_referral_tradeoff: "p3_p6",
  record_one_specialization: "p7",
  require_feasible_plan_and_teach_back: "p4_p5",
  require_referral_choice: "p3_p5",
  retain_referral: "p3",
  schedule_or_refer: "p3_p5",
  select_reachable_ending: "p7",
  show_system_boundaries: "p7_ui_projection",
  suspend_if_overdue: "p6",
  time_pressure_only: "p5",
  use_existing_history: "p4"
};

const requirementResolvers = {
  five_campaign_days: ["p7", "campaignState", "completedDayGte5"],
  ten_campaign_days: ["p7", "campaignState", "completedDayGte10"],
  fifteen_campaign_days: ["p7", "campaignState", "completedDayGte15"],
  twenty_campaign_days: ["p7", "campaignState", "completedDayGte20"],
  twenty_five_campaign_days: ["p7", "campaignState", "completedDayGte25"],
  thirty_campaign_days: ["p7", "campaignState", "completedDayGte30"],
  no_unowned_critical_work: ["p5", "schedulerAudit", "unownedCriticalWorkCountEq0"],
  inventory_audit_recorded: ["p6", "inventoryState", "latestAuditIdExists"],
  rest_compliance_gte_0_8: ["p5", "shiftAudit", "restComplianceGte0.8"],
  due_result_review_rate_gte_0_8: ["p3", "resultObligationState", "dueReviewRateGte0.8"],
  cash_above_closure_floor: ["p6", "ledgerState", "cashAboveClosureFloor"],
  ending_evidence_complete: ["p7", "endingState", "evidenceComplete"],
  staff_rest_plan: ["p5", "shiftState", "futureRestPlanExists"],
  two_consecutive_critical_days: ["p6", "riskState", "consecutiveCriticalDaysGte2"],
  recovery_actions_exhausted: ["p6", "recoveryState", "actionsExhausted"]
};

const specializationResolvers = {
  laboratory_equipment: ["p6", "assetState", "ownedActiveCapabilityType:laboratory_equipment"],
  imaging_equipment: ["p6", "assetState", "ownedActiveCapabilityType:imaging_equipment"],
  staged_owner_plans: ["p4", "handlingActionState", "completedActionClass:staged_visit"],
  referral_coordination: ["p5", "scheduler", "completedTask:visit.referral_coordination"],
  low_stress_zone: ["p5", "roomState", "readyCapability:quiet_route"],
  trained_low_stress_handling: ["p5", "staffAndShiftState", "scheduledCapability:task.low_stress"]
};

const endingResolvers = {
  allAxesMinimum: ["p7", "axisSnapshot", "allAxesMinimum"],
  anyAxisMinimum: ["p7", "axisSnapshot", "anyAxisMinimum"],
  clinical_safetyMinimum: ["p7", "axisSnapshot", "clinical_safety"],
  closureReview: ["p6_p7", "recoveryState", "closureReview"],
  financial_resilienceMinimum: ["p7", "axisSnapshot", "financial_resilience"],
  owner_trustMinimum: ["p7", "axisSnapshot", "owner_trust"],
  specializationId: ["p7", "campaignState", "specializationId"],
  team_conditionMinimum: ["p7", "axisSnapshot", "team_condition"]
};

function recordsFromMap(map, kind) {
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([evidenceId, value]) => ({
    evidenceId,
    kind,
    authority: value[0],
    recordType: value[1],
    fieldOrPredicate: value[2],
    resolverMode: "exact_author_owned"
  }));
}

writeJson("source/p6-p5-exact-resource-crosswalk.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p6-p5-exact-resource-crosswalk",
  catalogVersion: "2026.07.16.2",
  status: "author_complete_product_owner_balance_acceptance_required",
  runtimeEligible: false,
  p5PackageVersion: p5Manifest.packageVersion,
  resources,
  capabilities,
  supplementalCapabilities,
  startingInventory: p5Lifecycle.startingInventory
});

writeJson("source/p7-evidence-resolver.json", {
  schemaVersion: 1,
  catalogId: "vetgeme-p7-evidence-resolver",
  catalogVersion: "2026.07.16.2",
  status: "author_complete_programmer_adapter_required",
  runtimeEligible: false,
  goalEvidence: recordsFromMap(evidenceResolvers, "goal_evidence"),
  eventTriggers: recordsFromMap(triggerResolvers, "event_trigger"),
  eventEffects: Object.entries(effectAuthorities).sort(([a], [b]) => a.localeCompare(b)).map(([effectId, authority]) => ({ effectId, authority, commandResolver: `effect.${effectId}`, medicalGenerationBiasForbidden: true })),
  milestoneAndRecoveryRequirements: recordsFromMap(requirementResolvers, "requirement"),
  specializationCapabilities: recordsFromMap(specializationResolvers, "specialization_support"),
  endingPredicates: recordsFromMap(endingResolvers, "ending_predicate"),
  activation: {
    authorApprovalRecorded: true,
    programmerAdapterValidated: false,
    productOwnerBalanceAccepted: false,
    medicalProductionPoolRequiredForCampaignActivation: true,
    runtimeEligible: false
  }
});

writeJson("reports/CROSS_SYSTEM_V2_AUTHOR_MATRIX.json", {
  schemaVersion: 1,
  reportId: "vetgeme-cross-system-v2-author-matrix",
  reportVersion: "2026.07.16.2",
  counts: {
    p5ResourcesWithP6Authority: resources.length,
    canonicalCapabilitiesCrosswalked: capabilities.length,
    supplementalCapabilitiesCrosswalked: supplementalCapabilities.length,
    goalEvidenceResolvers: Object.keys(evidenceResolvers).length,
    eventTriggerResolvers: Object.keys(triggerResolvers).length,
    eventEffectResolvers: Object.keys(effectAuthorities).length,
    requirementResolvers: Object.keys(requirementResolvers).length,
    specializationResolvers: Object.keys(specializationResolvers).length,
    endingResolvers: Object.keys(endingResolvers).length
  },
  gates: {
    unresolvedP5Resource: resources.some((item) => !item.p6EconomicAuthority),
    unresolvedCanonicalCapability: capabilities.some((item) => !item.p6ServiceId),
    tokenMatchingAllowed: false,
    rendererMayOwnState: false,
    campaignMayBiasMedicalGeneration: false
  }
});

console.log(JSON.stringify({
  resources: resources.length,
  capabilities: capabilities.length,
  supplementalCapabilities: supplementalCapabilities.length,
  evidenceResolvers: Object.keys(evidenceResolvers).length,
  triggerResolvers: Object.keys(triggerResolvers).length,
  effectResolvers: Object.keys(effectAuthorities).length
}, null, 2));
