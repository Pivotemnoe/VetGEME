import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadOperationalAuthoringReviewInputV3 } from "./lib/operational-authoring-review-input-v3.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(projectRoot, "reports/OPERATIONAL_AUTHORING_2026.07.16.3_REVIEW.json");
const write = process.argv.includes("--write");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--write");
if (unknownArguments.length > 0) throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);

const reviewInput = await loadOperationalAuthoringReviewInputV3(projectRoot, { context: "review" });
const report = await buildReport(reviewInput);
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (write) {
  await writeFile(reportPath, serialized);
} else {
  assert.equal(
    await readFile(reportPath, "utf8"),
    serialized,
    "operational .3 review report is stale; run with --write",
  );
}

console.log(JSON.stringify({
  status: "passed_expected_review_only_blockers_preserved",
  mode: write ? "write" : "verify",
  report: path.relative(projectRoot, reportPath),
  authorCorrectionsClosed: report.summary.authorCorrectionsClosed,
  openP1: report.summary.openP1,
  productionPool: report.boundaries.productionPool,
  activationAllowed: report.boundaries.activationAllowed,
}, null, 2));

async function buildReport(input) {
  const [v2Provenance, v2MismatchReport] = await Promise.all([
    readFile(path.join(
      projectRoot,
      "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.2/provenance.json",
    )),
    readFile(path.join(projectRoot, "reports/OPERATIONAL_AUTHORING_2026.07.16.2_MISMATCHES.json")),
  ]);
  return {
    schemaVersion: 1,
    reportId: "vetgeme-operational-authoring-v3-host-review",
    reportVersion: "2026.07.16.3",
    sourcePackage: "vetgeme-operational-production-authoring@2026.07.16.3",
    status: "immutable_review_only_import_valid_activation_blocked",
    boundaries: {
      sourceChangedByReview: false,
      correctionsInvented: false,
      supersedesV2OnlyAsAuthorSourceFor: ["p3", "p4", "p7"],
      v2SourceAndMismatchReportPreserved: true,
      currentThirtyCasePoolChanged: false,
      saveSchemaChanged: false,
      runtimeChanged: false,
      productionPool: 0,
      activationAllowed: false,
      reservationAuthority: false,
    },
    integrity: {
      sourceFiles: input.sourceIntegrity.sourceFiles,
      sourceBytes: input.sourceIntegrity.sourceBytes,
      archiveSha256: input.sourceIntegrity.archiveSha256,
      provenanceSha256: input.sourceIntegrity.provenanceSha256,
      aggregateSha256: input.sourceIntegrity.aggregateSha256,
      priorV2ProvenanceSha256: sha256(v2Provenance),
      priorV2MismatchReportSha256: sha256(v2MismatchReport),
    },
    summary: {
      p0: 0,
      openP1: 2,
      authorCorrectionsClosed: 4,
      runtimeEligible: false,
      nextSafeStep: "exact_p5_v2_join_then_preserve_remaining_medical_authority_and_approval_gates",
    },
    closedAuthorFindings: [
      {
        id: "p3_turnaround_collapsed_by_representative_usage",
        status: "author_closed_host_projection_verified",
        evidence: {
          usageLevelContracts: input.audit.counts.p3.usageLevelTurnaroundContracts,
          multiPolicyResearchIds: input.audit.counts.p3.multiPolicyResearchIds,
          representativeTurnaroundAllowed: false,
        },
      },
      {
        id: "p3_unmatched_urgency_and_classification_defaults",
        status: "author_closed_host_projection_verified",
        evidence: {
          urgencySourceValues: input.audit.counts.p3.exactUrgencySourceValues,
          classificationSourceValues: input.audit.counts.p3.exactClassificationSourceValues,
          fallbackAllowed: false,
          dynamicValuesFailClosed: input.audit.counts.p3.dynamicUrgencyUsages,
        },
      },
      {
        id: "p4_safe_alternative_fact_binding_missing",
        status: "author_closed_host_projection_verified",
        evidence: {
          presentationHandlingBindings: input.audit.counts.p4.presentationHandlingBindings,
          scopedMedicalFactReferences: input.audit.counts.p4.scopedMedicalFactReferences,
          genericSyntheticFactReferences: input.audit.counts.p4.genericSyntheticFactReferences,
        },
      },
      {
        id: "p7_digest_does_not_bind_resolver_or_day_semantics",
        status: "author_closed_host_projection_verified",
        evidence: {
          resolverRecords: input.audit.counts.p7.evidenceResolvers,
          resolverDigest: input.audit.counts.p7.resolverDigest,
          activationDigest: input.audit.counts.p7.activationDigest,
          mutationChangesActivationDigest: input.audit.counts.p7.resolverMutationChangesActivationDigest,
          outerCampaignAndAuthorityProjectionVerified: true,
        },
      },
    ],
    openFindings: [
      {
        id: "p3_medical_result_authority_projection_drift",
        severity: "P1",
        status: "new_author_revision_required",
        count: input.audit.counts.p3.medicalResultAuthorityMismatches,
        sourceAuthority: "medical_family.presentation.investigations[].result_only",
        generatedProjection: "family.presentation.investigations[].result_only",
        correctionInvented: false,
      },
      {
        id: "p5_execution_join_unresolved",
        severity: "P1",
        status: "exact_p5_v2_join_required",
        requirement: "requirementGroups/anyOf/AND/units/duration/lifecycle/scheduler commands",
        reservationAuthority: false,
        flattenedResourceIdsCannotReserve: true,
      },
    ],
    externalGates: [
      "medical_family_external_veterinary_approval",
      "product_owner_balance_acceptance",
      "full_runtime_smoke_and_save_reload_before_activation",
    ],
    knownRisks: [
      "The two dynamic urgency resolver IDs require an external medical state resolver; no state-to-band policy is invented here.",
      "Author scripts may use token matching while producing frozen JSON; runtime authority is exact lookup only.",
      "The activation digest does not own outer day-catalog campaign/authority fields, so the host validates those projections separately.",
      "Dependency root manifests are supplemented by trusted host archive/aggregate/provenance pins.",
    ],
    validationEvidence: input.audit.validationEvidence,
    intentionallyUnchanged: [
      "operational .2 source and mismatch report",
      "medical truth and investigation results",
      "current 30 case IDs and generator pool",
      "current/legacy-v1/tier-01-v2 save namespaces and schema",
      "runtime economy and campaign state",
      "renderer, design, and art",
    ],
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
