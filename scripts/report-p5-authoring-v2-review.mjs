import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createP5AuthoringReviewAdapterV2 } from "./lib/p5-authoring-review-adapter-v2.mjs";
import { loadP5AuthoringReviewInputV2 } from "./lib/p5-authoring-review-input-v2.mjs";
import { loadOperationalAuthoringReviewInputV4 } from "./lib/operational-authoring-review-input-v4.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(projectRoot, "reports/P5_AUTHORING_2026.07.16.2_REVIEW.json");
const receiptPath = path.join(projectRoot, "reports/P5_AUTHORING_2026.07.16.2_GATE_RECEIPTS.json");
const completionPath = path.join(projectRoot, "reports/P5_AUTHORING_2026.07.16.2_COMPLETION.md");
const write = process.argv.includes("--write");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--write");
if (unknownArguments.length > 0) throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);

const REQUIRED_GATE_COMMANDS = Object.freeze([
  {
    commandId: "p5_provenance_intake_v2",
    command: "npm run validate:p5-authoring-review-provenance:v2:intake",
    gate: "author_input",
  },
  {
    commandId: "p5_bundled_validator_v2",
    command: "npm run validate:p5-authoring-review:bundled:v2",
    gate: "author_input",
  },
  {
    commandId: "p5_input_validator_v2",
    command: "npm run validate:p5-authoring-review:v2",
    gate: "author_input",
  },
  {
    commandId: "p5_input_contract_v2",
    command: "npm run test:p5-authoring-review:v2",
    gate: "host_contract",
  },
  {
    commandId: "p5_lifecycle_contract_v5",
    command: "npm run test:resource-lifecycle:v5",
    gate: "host_contract",
  },
  {
    commandId: "resource_scheduler_v5",
    command: "npm run test:resource-scheduler:v5",
    gate: "host_contract",
  },
  {
    commandId: "operations_runtime_v5",
    command: "npm run test:operations-runtime:v5",
    gate: "host_contract",
  },
  {
    commandId: "campaign_mechanics_v2",
    command: "npm run test:campaign-mechanics:v2",
    gate: "host_regression",
  },
  {
    commandId: "atomic_save_migration",
    command: "npm run test:atomic-save-migration",
    gate: "save_migration_regression",
  },
  {
    commandId: "p5_adapter_contract_v2",
    command: "npm run test:p5-authoring-review:adapter:v2",
    gate: "host_contract",
  },
  {
    commandId: "p5_browser_handoff_reload_v2",
    command: "npm run test:p5-authoring-review:browser:v2",
    gate: "browser",
  },
  {
    commandId: "new_game_reset_mode_isolation",
    command: "npm run test:new-game-reset-browser",
    gate: "reset_cancel_mode_isolation",
  },
  {
    commandId: "docker_prebuild",
    command: "npm run test:docker:prebuild",
    gate: "docker",
  },
  {
    commandId: "docker_build",
    command: "npm run docker:build",
    gate: "docker",
  },
  {
    commandId: "docker_image",
    command: "npm run test:docker:image",
    gate: "docker",
  },
  {
    commandId: "docker_http",
    command: "npm run test:docker:http",
    gate: "docker",
  },
  {
    commandId: "docker_browser",
    command: "npm run test:docker:browser",
    gate: "docker",
  },
  {
    commandId: "git_diff_check",
    command: "git diff --check",
    gate: "repository_hygiene",
  },
]);

const PRIOR_BLOCKER_RESOLUTIONS = Object.freeze({
  activation_requirements_unsatisfied: {
    resolutionStatus: "partially_closed_review_only_activation_still_blocked",
    evidence: "The exact adapter and lifecycle primitives exist, while required receipts and external activation acceptance remain explicit gates.",
    remainingBoundary: "No live activation is allowed from this review-only report.",
  },
  p5_upstream_operational_catalogs_review_only: {
    resolutionStatus: "intentionally_preserved_review_only_boundary",
    evidence: "The join uses immutable operational .4 provenance and does not promote P3/P6/P7 authoring to runtime authority.",
    remainingBoundary: "A later authorized activation slice is still required.",
  },
  p5_resource_lifecycle_resolver_missing: {
    resolutionStatus: "closed_in_dormant_review_primitive",
    evidence: "The versioned lifecycle primitive implements the exact 13 authored commands and atomic scheduler reprojection.",
    remainingBoundary: "The primitive is not embedded into the live save schema.",
  },
  p5_p6_room_asset_mapping_missing: {
    resolutionStatus: "closed_by_exact_v2_v4_join",
    evidence: "All 12 rooms participate in the exact 49-resource P5/P6 crosswalk with explicit asset IDs.",
    remainingBoundary: "Review-only crosswalk authority is not live activation authority.",
  },
  p5_starting_room_ownership_seed_missing: {
    resolutionStatus: "closed_by_exact_v2_lifecycle_seed",
    evidence: "Five authored starting rooms are explicitly owned, delivered and ready in lifecycle evidence.",
    remainingBoundary: "Renderer state is not ownership evidence.",
  },
  p5_starting_equipment_readiness_stock_mapping_missing: {
    resolutionStatus: "closed_by_exact_v2_lifecycle_and_inventory_contract",
    evidence: "Otoscope and microscope have explicit starting evidence; 10 inventory categories and exact per-task consumption are joined atomically.",
    remainingBoundary: "No live economy/save migration is authorized.",
  },
  p5_p6_imaging_wage_role_missing: {
    resolutionStatus: "closed_by_exact_v4_resource_economics",
    evidence: "The exact crosswalk supplies economic records for all 10 staff resources, including imaging staff.",
    remainingBoundary: "Product-owner staffing balance acceptance remains external.",
  },
  p5_day1_checkin_unavailable: {
    resolutionStatus: "activation_gated_by_explicit_staffing",
    evidence: "The adapter correctly keeps the administrator unavailable until an explicit hire and shift command; it does not invent a doctor fallback.",
    remainingBoundary: "Day-one production staffing flow requires product-owner acceptance before activation.",
  },
  p5_inactive_anyof_filtering_missing: {
    resolutionStatus: "closed_by_full_resource_projection",
    evidence: "All 49 exact resources are projected and inactive alternatives remain known but unavailable instead of being string-filtered or dropped.",
    remainingBoundary: "Availability is lifecycle authority, never renderer inference.",
  },
  p5_skill_requirement_double_reservation: {
    resolutionStatus: "closed_by_exact_requirement_group_authority",
    evidence: "P5 .2 requirement groups are preserved as independent AND groups; the adapter neither merges them nor infers a single-worker shortcut.",
    remainingBoundary: "Any staffing balance change must be authored, not inferred by the adapter.",
  },
  p5_day1_referral_no_doctor_fallback: {
    resolutionStatus: "technically_closed_by_direct_safe_referral",
    evidence: "Unavailable exact tasks return their authored safe route without requiring an invented local referral-coordinator reservation.",
    remainingBoundary: "A local staffing fallback is not invented.",
  },
  p5_handoff_policy_gate_missing: {
    resolutionStatus: "closed_in_exact_handoff_gate",
    evidence: "The adapter enforces not_allowed, midpoint and urgent-quarter policies before atomic reservation reassignment.",
    remainingBoundary: "Only active tasks at exact authored breakpoints may hand off.",
  },
  p5_capability_handoff_policy_missing: {
    resolutionStatus: "closed_at_task_template_authority",
    evidence: "Handoff policy is resolved from the exact visit/research/usage task template rather than inferred from a capability token.",
    remainingBoundary: "Capability-only policy inference remains forbidden.",
  },
  p5_handoff_rounding_undefined: {
    resolutionStatus: "safe_closed_without_invented_rounding",
    evidence: "Fractional authored breakpoints are rejected; the adapter never rounds them to a campaign minute.",
    remainingBoundary: "An author-supplied rounding rule is required to enable those handoffs.",
  },
  p5_safe_route_precedence_ambiguous: {
    resolutionStatus: "closed_by_exact_task_safe_route",
    evidence: "The exact task safeRouteId is preserved and returned on unavailability; no generic route replaces an authored route.",
    remainingBoundary: "Unknown or missing route authority fails closed.",
  },
  p5_p3_route_branching_missing: {
    resolutionStatus: "safe_closed_without_branch_inference",
    evidence: "The adapter does not choose between local and external execution without exact authored reservation authority and returns the exact safe route when blocked.",
    remainingBoundary: "No automatic local-versus-external policy is introduced.",
  },
  p5_stabilization_route_mapping_missing: {
    resolutionStatus: "safe_closed_to_referral",
    evidence: "When no exact stabilization task can reserve, urgent work remains blocked and exposes safe_referral instead of inventing a stabilization mapping.",
    remainingBoundary: "An explicit stabilization mapping is still required for that optional branch.",
  },
  p5_inventory_scheduler_transaction_missing: {
    resolutionStatus: "closed_in_atomic_review_envelope",
    evidence: "Exact inventory reservations and lifecycle consumption commit with scheduler activation or do not mutate state; reload rejects half-applied ledgers.",
    remainingBoundary: "The live economy/save schema remains unchanged.",
  },
  p5_p3_device_migration_missing: {
    resolutionStatus: "preserved_as_explicit_v2_author_model",
    evidence: "The adapter follows the immutable .2 resource and lifecycle declarations for cgm_sensor and performs no automatic device/consumable migration.",
    remainingBoundary: "Any semantic migration requires a new author source and activation review.",
  },
  p5_clock_queue_driver_missing: {
    resolutionStatus: "closed_for_explicit_command_review_adapter",
    evidence: "Queue scheduling is driven only by explicit command minutes inside a persisted horizon; no automatic policy is invented.",
    remainingBoundary: "The existing live browser clock is intentionally not replaced or rewired.",
  },
  p5_shift_policy_bridge_missing: {
    resolutionStatus: "closed_in_lifecycle_and_absence_primitives",
    evidence: "Hire, shift assignment/update/removal and explicit absence projection are persisted and reloaded atomically.",
    remainingBoundary: "Recommended staffing remains recommendation-only until player commands exist in an authorized runtime slice.",
  },
  p5_runtime_operational_policies_unwired: {
    resolutionStatus: "partially_closed_review_adapter_product_gate_remains",
    evidence: "Exact fatigue bands, activation, maintenance, absence, delegation limits and urgent fallback are validated in the review adapter.",
    remainingBoundary: "Fatigue accumulation/recovery balance and live legacy transition remain outside this review-only slice.",
  },
  p5_p6_duration_semantic_divergence: {
    resolutionStatus: "closed_by_separate_clock_authorities",
    evidence: "P5 authoredDurationMinutes drives reservation time while P6 economic durations remain separate economic metadata and are never merged.",
    remainingBoundary: "Changing either clock requires its own author authority.",
  },
});

const [p5Input, operationalInput, receiptBytes] = await Promise.all([
  loadP5AuthoringReviewInputV2(projectRoot, { context: "review" }),
  loadOperationalAuthoringReviewInputV4(projectRoot, { context: "review" }),
  readFile(receiptPath),
]);
assert.deepEqual(
  p5Input.blockers.map((blocker) => blocker.id),
  ["activation_requirements_unsatisfied", "product_owner_staffing_acceptance_pending"],
  "P5 .2 review report refuses an unexpected blocker set",
);
const adapter = createP5AuthoringReviewAdapterV2(p5Input, operationalInput);
assert.equal(adapter.reviewOnly, true);
assert.equal(adapter.runtimeEligible, false);
assert.equal(adapter.audit.exactRequirementGroupsAreReservationAuthority, true);
assert.equal(adapter.audit.reservationAuthorityScope, "review_adapter_only");
assert.equal(adapter.audit.liveRuntimeReservationAuthorityEnabled, false);
assert.equal(adapter.audit.liveSaveSchemaChanged, false);
assert.equal(adapter.productionPool.length, 0);
assert.equal(adapter.atomicStateSchemaVersion, 1);
for (const method of [
  "createAtomicState",
  "normalizeAtomicState",
  "serializeAtomicState",
  "deserializeAtomicState",
  "applyLifecycleCommandAtomic",
  "extendAtomicHorizon",
  "enqueueAtomicTask",
  "scheduleAtomicTask",
  "handoffAtomicTask",
  "auditReservationPredicateAuthority",
]) {
  assert.equal(typeof adapter[method], "function", `P5 .2 review adapter is missing ${method}`);
}

const receiptSet = validateReceiptSet(JSON.parse(receiptBytes));
const report = await buildReport(p5Input, adapter, receiptSet, receiptBytes);
const completion = buildCompletionMarkdown(report);
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (write) {
  await Promise.all([
    writeFile(reportPath, serialized),
    writeFile(completionPath, completion),
  ]);
} else {
  assert.equal(await readFile(reportPath, "utf8"), serialized,
    "P5 .2 review report is stale; run with --write");
  assert.equal(await readFile(completionPath, "utf8"), completion,
    "P5 .2 completion draft is stale; run report with --write");
}

console.log(JSON.stringify({
  status: report.status,
  mode: write ? "write" : "verify",
  report: path.relative(projectRoot, reportPath),
  completion: path.relative(projectRoot, completionPath),
  p0: report.summary.p0,
  p1: report.summary.p1,
  authorPredicateGapTemplates: report.authorReservationPredicateAudit.affectedTaskTemplates,
  authorPredicateGaps: report.authorReservationPredicateAudit.gapCount,
  confirmedGateReceipts: report.gateReceipts.confirmedCommandIds.length,
  pendingGateReceipts: report.gateReceipts.pendingCommandIds.length,
  productionPool: report.boundaries.productionPool,
  liveRuntimeActivationAllowed: report.boundaries.liveRuntimeActivationAllowed,
}, null, 2));

async function buildReport(input, reviewAdapter, receipts, rawReceiptBytes) {
  const [
    priorProvenance,
    priorMismatchBytes,
    operationalV4Provenance,
    operationalV4Review,
    lifecycleRuntime,
    adapterSource,
  ] = await Promise.all([
    readFile(path.join(projectRoot,
      "content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.1/provenance.json")),
    readFile(path.join(projectRoot, "reports/P5_AUTHORING_MISMATCHES.json")),
    readFile(path.join(projectRoot,
      "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.4/provenance.json")),
    readFile(path.join(projectRoot, "reports/OPERATIONAL_AUTHORING_2026.07.16.4_REVIEW.json")),
    readFile(path.join(projectRoot, "systems/resource-lifecycle-v5.js")),
    readFile(path.join(projectRoot, "scripts/lib/p5-authoring-review-adapter-v2.mjs")),
  ]);
  const priorMismatchReport = JSON.parse(priorMismatchBytes);
  assert.equal(priorMismatchReport.mismatches.length, 23,
    "P5 .1 resolution matrix requires exactly 23 prior blockers");
  assert.deepEqual(
    priorMismatchReport.mismatches.map((finding) => finding.id).sort(),
    Object.keys(PRIOR_BLOCKER_RESOLUTIONS).sort(),
    "P5 .1 resolution matrix must cover every prior blocker ID exactly once",
  );
  const resolutionMatrix = priorMismatchReport.mismatches.map((finding) => ({
    id: finding.id,
    priorStatus: finding.status,
    priorSummary: finding.summary,
    ...PRIOR_BLOCKER_RESOLUTIONS[finding.id],
  }));
  const reservationPredicateAudit = reviewAdapter.auditReservationPredicateAuthority();
  assert.equal(reservationPredicateAudit.taskTemplatesAudited, 2606);
  assert.equal(reservationPredicateAudit.affectedTaskTemplates, 10);
  assert.equal(reservationPredicateAudit.gapCount, 15);
  const receiptFindings = receipts.receipts
    .filter((receipt) => !receipt.confirmed)
    .map((receipt) => ({
      id: `p5_gate_receipt_${receipt.commandId}`,
      severity: "p1",
      status: receipt.status === "failed" ? "open_failed" : "open_pending",
      scope: "completion_evidence",
      summary: receipt.status === "failed"
        ? `Required gate command failed: ${receipt.command}`
        : `Required gate command has no confirmed passing receipt: ${receipt.command}`,
      evidence: {
        commandId: receipt.commandId,
        command: receipt.command,
        receiptStatus: receipt.status,
      },
    }));
  const findings = [
    {
      id: "p5_immutable_author_reservation_predicate_gaps",
      severity: "p1",
      status: "open_authoring_activation_gate",
      scope: "immutable_author_source",
      summary: "Ten immutable P5 .2 task templates expose 15 lifecycle predicates that are not guaranteed by their reservation groups.",
      evidence: {
        taskTemplatesAudited: reservationPredicateAudit.taskTemplatesAudited,
        affectedTaskTemplates: reservationPredicateAudit.affectedTaskTemplates,
        gapCount: reservationPredicateAudit.gapCount,
      },
    },
    ...receiptFindings,
  ];
  const openFindings = findings.filter((finding) => finding.status.startsWith("open_"));
  const p0 = openFindings.filter((finding) => finding.severity === "p0").length;
  const p1 = openFindings.filter((finding) => finding.severity === "p1").length;
  const confirmedCommandIds = receipts.receipts
    .filter((receipt) => receipt.confirmed)
    .map((receipt) => receipt.commandId);
  const pendingCommandIds = receipts.receipts
    .filter((receipt) => !receipt.confirmed)
    .map((receipt) => receipt.commandId);
  const adapterReceiptConfirmed = confirmedCommandIds.includes("p5_adapter_contract_v2");
  const counts = input.audit.counts;
  return {
    schemaVersion: 2,
    reportId: "vetgeme-p5-authoring-v2-host-review",
    reportVersion: "2026.07.16.2",
    sourcePackage: "vetgeme-p5-production-authoring@2026.07.16.2",
    status: p0 > 0 ? "blocked_by_p0_findings"
      : p1 > 0 ? "blocked_by_p1_findings"
        : "review_gates_confirmed_live_activation_still_external",
    boundaries: {
      sourceChangedByReview: false,
      correctionsInvented: false,
      priorV1SourceAndMismatchReportPreserved: true,
      operationalV4SourceAndReviewPreserved: true,
      reviewOnly: true,
      currentThirtyCasePoolChanged: false,
      currentCaseCrosswalkCreated: false,
      medicalTruthAuthorityGrantedToP5: false,
      saveSchemaChanged: false,
      liveRuntimeChanged: false,
      reviewAdapterReservationAuthority: true,
      liveRuntimeReservationAuthority: false,
      lifecycleInferredFromVisual: false,
      productionPool: 0,
      liveRuntimeActivationAllowed: false,
    },
    integrity: {
      sourceFiles: input.sourceIntegrity.sourceFiles,
      sourceBytes: input.sourceIntegrity.sourceBytes,
      archiveSha256: input.sourceIntegrity.archiveSha256,
      provenanceSha256: input.sourceIntegrity.provenanceSha256,
      aggregateSha256: input.sourceIntegrity.aggregateSha256,
      manifestSha256: input.registration.sourceIntegrity.manifestSha256,
      priorV1ProvenanceSha256: sha256(priorProvenance),
      priorV1MismatchReportSha256: sha256(priorMismatchBytes),
      operationalV4ProvenanceSha256: sha256(operationalV4Provenance),
      operationalV4ReviewSha256: sha256(operationalV4Review),
      lifecycleRuntimeSha256: sha256(lifecycleRuntime),
      reviewAdapterSha256: sha256(adapterSource),
      gateReceiptSetSha256: sha256(rawReceiptBytes),
    },
    summary: {
      p0,
      p1,
      findingCountsComputedFromOpenFindings: true,
      exactExecutionJoinClosedInReviewAdapter: true,
      lifecycleAndHandoffPrimitiveImplemented: true,
      allRequiredGateReceiptsConfirmed: pendingCommandIds.length === 0,
      immutableAuthorPredicateGapsClosed: false,
      runtimeEligible: false,
      nextSafeStep: "author_corrects_10_templates_15_predicates_then_all_required_gates_are_rerun_and_reviewed",
    },
    findings,
    authorReservationPredicateAudit: {
      status: "unresolved_immutable_authoring_activation_p1",
      ...reservationPredicateAudit,
      technicalSafeReferralContainment: {
        status: adapterReceiptConfirmed
          ? "verified_in_review_adapter"
          : "implemented_but_required_adapter_receipt_pending",
        schedulerMayAllocatePartialReservation: false,
        blockedTaskReturnsSafeRoute: true,
        authorSourceCorrectedByHost: false,
        liveActivationAllowed: false,
        receiptCommandId: "p5_adapter_contract_v2",
      },
    },
    priorV1BlockerResolutionMatrix: {
      sourceReport: "reports/P5_AUTHORING_MISMATCHES.json",
      blockerCount: resolutionMatrix.length,
      exactCoverage: true,
      resolutions: resolutionMatrix,
    },
    gateReceipts: {
      contract: path.relative(projectRoot, receiptPath),
      receiptSetId: receipts.receiptSetId,
      requiredCommandIds: REQUIRED_GATE_COMMANDS.map((entry) => entry.commandId),
      confirmedCommandIds,
      pendingCommandIds,
      receipts: receipts.receipts,
    },
    exactJoin: {
      resources: reviewAdapter.audit.resources,
      staff: reviewAdapter.audit.staff,
      rooms: reviewAdapter.audit.rooms,
      equipment: reviewAdapter.audit.equipment,
      lifecycleCommands: reviewAdapter.audit.lifecycleCommands,
      canonicalCapabilities: reviewAdapter.audit.canonicalCapabilities,
      supplementalCapabilities: reviewAdapter.audit.supplementalCapabilities,
      researchTasks: reviewAdapter.audit.researchTasks,
      investigationUsages: reviewAdapter.audit.investigationUsages,
      runtimeTaskTemplates: reviewAdapter.audit.runtimeTaskTemplates,
      inventoryCapabilities: reviewAdapter.audit.inventoryCapabilities,
      statePredicates: reviewAdapter.audit.statePredicates,
      requirementGroupsAuthority: "exact_p5_v2_review_adapter_only",
      flattenedOperationalResourceIdsAreReservationAuthority: false,
      activePhysicalResources: input.audit.activePhysicalResourceIds,
      activeStaffAtStart: counts.startsActiveStaff,
      hiredUnscheduledDoctors: input.audit.hiredUnscheduledDoctorIds,
    },
    medicalAuthorityBoundary: input.medicalAuthorityBoundary,
    closedTechnicalFindings: [
      {
        id: "p5_execution_join_unresolved",
        status: "implemented_in_exact_review_adapter",
        evidenceReceiptCommandId: "p5_adapter_contract_v2",
      },
      {
        id: "p5_lifecycle_primitive_missing",
        status: "implemented_in_dormant_review_primitive",
        evidenceReceiptCommandId: "p5_lifecycle_contract_v5",
      },
      {
        id: "p5_lifecycle_scheduler_atomicity_missing",
        status: "implemented_in_versioned_review_adapter_envelope",
        evidenceReceiptCommandId: "p5_adapter_contract_v2",
      },
      {
        id: "p5_atomic_handoff_and_reload_missing",
        status: "implemented_unit_receipt_and_browser_receipt_required",
        evidenceReceiptCommandIds: [
          "p5_adapter_contract_v2",
          "p5_browser_handoff_reload_v2",
        ],
      },
    ],
    externalGates: [
      {
        id: "product_owner_staffing_acceptance_pending",
        status: "unresolved_external_gate",
      },
      {
        id: "medical_family_external_veterinary_approval",
        status: "unresolved_external_gate",
      },
      {
        id: "live_runtime_activation_and_save_migration_plan",
        status: "not_authorized_in_this_review_only_slice",
      },
    ],
    knownRisks: [
      "The immutable .2 author source has 15 reservation-predicate gaps across 10 templates; host code blocks and refers safely but must not repair author semantics.",
      "Authored fractional handoff breakpoints have no rounding rule and therefore fail closed.",
      "The day-one recommended flow cannot make administrator-owned work schedulable until the administrator is explicitly hired and shifted.",
      "Product-owner staffing and fatigue balance acceptance remains external.",
      "The independent lifecycle ledger is intentionally not embedded into the current game save without a versioned migration plan.",
    ],
    validationEvidence: {
      authorPackageBundledClaims: input.audit.validationEvidence,
      hostGateEvidenceComesOnlyFromReceiptSet: true,
      browserClaimAllowed: confirmedCommandIds.includes("p5_browser_handoff_reload_v2"),
      resetCancelClaimAllowed: confirmedCommandIds.includes("new_game_reset_mode_isolation"),
      dockerClaimsAllowed: REQUIRED_GATE_COMMANDS
        .filter((entry) => entry.gate === "docker")
        .every((entry) => confirmedCommandIds.includes(entry.commandId)),
    },
    intentionallyUnchanged: [
      "P5 .1 source, provenance, and mismatch report",
      "operational .2, .3, and .4 immutable author sources and reports",
      "immutable P5 .2 author files, including the reported 10-template/15-predicate gap",
      "medical truth, medical texts, and investigation results",
      "current 30 case IDs and generator pool",
      "current/legacy-v1/tier-01-v2 save namespaces and schema",
      "generator randomness and persisted generated day",
      "runtime economy, queue, and campaign state",
      "renderer, clinic design, and user art",
    ],
  };
}

function validateReceiptSet(value) {
  assertPlainObject(value, "gate receipt set");
  assert.deepEqual(Object.keys(value).sort(), [
    "receipts", "receiptSetId", "reportVersion", "schemaVersion",
  ].sort(), "gate receipt set fields changed");
  assert.equal(value.schemaVersion, 1, "unsupported gate receipt schemaVersion");
  assert.equal(value.receiptSetId, "vetgeme-p5-authoring-v2-gate-receipts");
  assert.equal(value.reportVersion, "2026.07.16.2");
  assert.ok(Array.isArray(value.receipts), "gate receipt set receipts must be an array");
  const expectedById = new Map(REQUIRED_GATE_COMMANDS.map((entry) => [entry.commandId, entry]));
  assert.equal(value.receipts.length, expectedById.size,
    "gate receipt set must contain every required command exactly once");
  const seen = new Set();
  const receipts = value.receipts.map((receipt, index) => {
    assertPlainObject(receipt, `gate receipt[${index}]`);
    assert.deepEqual(Object.keys(receipt).sort(), [
      "command", "commandId", "evidence", "gate", "status",
    ].sort(), `gate receipt[${index}] fields changed`);
    assert.equal(typeof receipt.commandId, "string");
    assert.ok(!seen.has(receipt.commandId), `duplicate gate receipt ${receipt.commandId}`);
    seen.add(receipt.commandId);
    const expected = expectedById.get(receipt.commandId);
    assert.ok(expected, `unknown gate receipt commandId ${receipt.commandId}`);
    assert.equal(receipt.command, expected.command,
      `gate receipt ${receipt.commandId} command differs from contract`);
    assert.equal(receipt.gate, expected.gate,
      `gate receipt ${receipt.commandId} gate differs from contract`);
    assert.ok(["passed", "pending", "failed"].includes(receipt.status),
      `gate receipt ${receipt.commandId} has unsupported status`);
    let confirmed = false;
    if (receipt.status === "pending") {
      assert.equal(receipt.evidence, null,
        `pending gate receipt ${receipt.commandId} cannot carry passing evidence`);
    } else {
      assertPlainObject(receipt.evidence, `gate receipt ${receipt.commandId}.evidence`);
      assert.deepEqual(Object.keys(receipt.evidence).sort(), [
        "assertions", "exitCode", "observedOutput",
      ].sort(), `gate receipt ${receipt.commandId} evidence fields changed`);
      assert.ok(Number.isSafeInteger(receipt.evidence.exitCode),
        `gate receipt ${receipt.commandId} evidence exitCode must be an integer`);
      assert.equal(typeof receipt.evidence.observedOutput, "string");
      assert.ok(receipt.evidence.observedOutput.trim(),
        `gate receipt ${receipt.commandId} needs observed output`);
      assert.ok(Array.isArray(receipt.evidence.assertions)
        && receipt.evidence.assertions.length > 0
        && receipt.evidence.assertions.every((entry) => typeof entry === "string" && entry.trim()),
      `gate receipt ${receipt.commandId} needs concrete assertions`);
      if (receipt.status === "passed") {
        assert.equal(receipt.evidence.exitCode, 0,
          `passed gate receipt ${receipt.commandId} must have exitCode 0`);
        confirmed = true;
      } else {
        assert.notEqual(receipt.evidence.exitCode, 0,
          `failed gate receipt ${receipt.commandId} cannot have exitCode 0`);
      }
    }
    return { ...receipt, confirmed };
  });
  assert.deepEqual([...seen].sort(), [...expectedById.keys()].sort(),
    "gate receipt set does not exactly cover required command IDs");
  return {
    schemaVersion: value.schemaVersion,
    receiptSetId: value.receiptSetId,
    reportVersion: value.reportVersion,
    receipts,
  };
}

function buildCompletionMarkdown(report) {
  const receiptLines = report.gateReceipts.receipts.map((receipt) =>
    `- \`${receipt.command}\`: **${receipt.confirmed ? "confirmed pass" : receipt.status}**${
      receipt.confirmed ? ` — ${receipt.evidence.observedOutput}` : " — no confirmed passing receipt"
    }`);
  const dockerGateLine = report.gateReceipts.pendingCommandIds.some((commandId) =>
    commandId.startsWith("docker_"))
    ? "- Docker remains unconfirmed until every required Docker receipt above is a confirmed pass."
    : "- Every required Docker build, image, HTTP and browser receipt is a confirmed pass.";
  return `# P5 authoring 2026.07.16.2 — completion report

Status: **${report.status}**. This is a completed review-only integration slice, not an activation approval.

## Changed

- Registered the immutable P5 \`.2\` review input and exact operational \`.4\` join.
- Added dormant exact lifecycle, scheduler, inventory and handoff review primitives.
- Added a fail-closed gate-receipt contract; P0/P1 counts are computed from open findings.
- Added exact resolution accounting for all 23 blocker IDs from \`P5_AUTHORING_MISMATCHES.json\`.
- Recorded the independent immutable-author audit: 10 affected templates and 15 reservation-predicate gaps.

## Checks and receipts

${receiptLines.join("\n")}

Current computed findings: P0=${report.summary.p0}, P1=${report.summary.p1}.

Browser, Docker and reset/cancel checks are claimed only when their exact command receipts are confirmed above. Pending rows are not passes.

## Intentionally unchanged

${report.intentionallyUnchanged.map((entry) => `- ${entry}`).join("\n")}

## Risks and remaining gates

- The immutable author source still has 15 reservation-predicate gaps across 10 task templates. The review adapter prevents partial reservation and exposes safe referral, but this does not repair or approve the source.
- Production pool remains 0; live runtime activation is forbidden.
- Product-owner staffing acceptance, veterinary approval and any save-schema migration remain external.
${dockerGateLine}

## Branch and commit

- Branch: \`codex/tier-01-v2-integration\`
- Parent before this slice: \`78256b1ad2da68a2639b4496f2b1127b7a34ad73\`
- Commit: the dedicated P5 commit containing this report; its exact resulting hash is reported by Git after creation because embedding a commit's own hash would change that hash.
`;
}

function assertPlainObject(value, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value),
    `${label} must be a plain object`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
