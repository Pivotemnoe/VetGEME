import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(
  projectRoot,
  "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.2/source",
);
const medicalRoot = path.join(
  projectRoot,
  "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source",
);
const capabilityPath = path.join(
  projectRoot,
  "content/system-packs/vetgeme-master-2026-07-14/capability-registry.json",
);
const reportPath = path.join(
  projectRoot,
  "reports/OPERATIONAL_AUTHORING_2026.07.16.2_MISMATCHES.json",
);
const write = process.argv.includes("--write");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--write");

if (unknownArguments.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
}

const report = await buildReport();
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (write) {
  await writeFile(reportPath, serialized);
} else {
  const current = await readFile(reportPath, "utf8");
  assert.equal(current, serialized, "operational .2 mismatch report is stale; run with --write");
}

console.log(JSON.stringify({
  status: "passed_expected_activation_blockers_preserved",
  mode: write ? "write" : "verify",
  report: path.relative(projectRoot, reportPath),
  p1: report.summary.p1,
  p2: report.summary.p2,
  productionPool: report.boundaries.productionPool,
  activationAllowed: report.boundaries.activationAllowed,
}, null, 2));

async function buildReport() {
  const [
    medicalManifest,
    p3Policy,
    p3Research,
    p3Usages,
    p3Explicit,
    p4Explicit,
    p4Generated,
    p6Crosswalk,
    p7Campaign,
    p7Day,
    p7Director,
    p7Evidence,
    capabilityRegistry,
  ] = await Promise.all([
    readJson(path.join(medicalRoot, "MANIFEST.json")),
    readJson(path.join(sourceRoot, "source/p3-policy.json")),
    readJson(path.join(sourceRoot, "generated/p3/research-catalog.json")),
    readJson(path.join(sourceRoot, "generated/p3/investigation-usage-policy.json")),
    readJson(path.join(sourceRoot, "source/p3-explicit-research-routes.json")),
    readJson(path.join(sourceRoot, "source/p4-explicit-behavior-crosswalk.json")),
    readJson(path.join(sourceRoot, "generated/p4/behavior-crosswalk.json")),
    readJson(path.join(sourceRoot, "source/p6-p5-exact-resource-crosswalk.json")),
    readJson(path.join(sourceRoot, "source/p7-campaign.json")),
    readJson(path.join(sourceRoot, "generated/p7/day-catalog.json")),
    readJson(path.join(sourceRoot, "generated/p7/director-catalog.json")),
    readJson(path.join(sourceRoot, "source/p7-evidence-resolver.json")),
    readJson(capabilityPath),
  ]);

  const families = await Promise.all(medicalManifest.families.map(async (entry) => ({
    path: entry.path,
    content: await readJson(path.join(medicalRoot, entry.path)),
  })));
  const rawMappingAudit = auditRawUrgencyAndClassification(families, p3Policy);
  const turnaroundAudit = auditTurnaround(p3Research, p3Usages, p3Policy, capabilityRegistry);
  const p4Audit = auditP4Facts(families, p4Explicit, p4Generated);
  const p6Audit = auditP6ExecutionAuthority(p3Explicit, p6Crosswalk);
  const p7Audit = auditP7Digest(p7Campaign, p7Day, p7Director, p7Evidence);

  assert.equal(turnaroundAudit.researchIds.length, 46, "expected 46 research IDs with per-usage turnaround mismatch");
  assert.equal(turnaroundAudit.usageIds.length, 137, "expected 137 usages with per-usage turnaround mismatch");
  assert.equal(turnaroundAudit.pairs.length, 168, "expected 168 capability/usage turnaround mismatches");
  assert.equal(turnaroundAudit.emergencySlowerPairs.length, 57, "expected 57 emergency pairs slower than policy");
  assert.equal(rawMappingAudit.unmatchedClassificationUsageIds.length, 49, "expected 49 unmatched classifications");
  assert.equal(rawMappingAudit.unmatchedClassificationValues.length, 36, "expected 36 unmatched classification values");
  assert.equal(rawMappingAudit.unmatchedUrgencyUsageIds.length, 2, "expected 2 unmatched urgency usages");
  assert.equal(rawMappingAudit.unmatchedUrgencyValues.length, 2, "expected 2 unmatched urgency values");
  assert.equal(p4Audit.criticalFactReferences, 1213, "expected 1,213 critical fact references");
  assert.equal(p4Audit.criticalFactIds.length, 1207, "expected 1,207 unique critical fact IDs");
  assert.equal(p4Audit.examFindingReferences, 1000, "expected 1,000 exam finding references");
  assert.equal(p4Audit.medicalFactIds.length, 1228, "expected 1,228 unique medical fact IDs in all fact-bearing fields");
  assert.equal(p4Audit.explicitHandlingAlternatives, 446, "expected 446 explicit handling alternatives");
  assert.equal(p4Audit.explicitMissingFactIds.length, 446, "explicit P4 fact binding gap changed");
  assert.equal(p4Audit.explicitMissingMedicalResultOwners.length, 446, "explicit P4 result owner gap changed");
  assert.equal(p4Audit.explicitMissingSafeRoutes.length, 0, "explicit P4 safe routes changed");
  assert.equal(p4Audit.alternativeFactIds.length, 446, "expected 446 P4 alternative fact IDs");
  assert.equal(p4Audit.intersection.length, 0, "P4 alternative facts must remain visibly unbound");
  assert.equal(p6Audit.localRoutesWithEmptyPredicates.length, 222, "expected 222 local routes with empty lifecycle predicates");
  assert.equal(p6Audit.capabilityIdsWithoutExecutionShape.length, 447, "expected 447 lossy capability overlays");
  assert.equal(p7Audit.resolverRecordCount, 93, "expected 93 evidence resolver records");
  assert.equal(p7Audit.authorDigestMatches, true, "author P7 digest must reproduce exactly");
  assert.equal(p7Audit.authorDigestChangesAfterResolverMutation, false, "author P7 digest gap must remain visible");
  assert.equal(p7Audit.hostCombinedDigestChangesAfterResolverMutation, true, "combined mutation proof failed");

  return {
    schemaVersion: 1,
    reportId: "vetgeme-operational-authoring-v2-runtime-mismatches",
    reportVersion: "2026.07.16.2",
    sourcePackage: "vetgeme-operational-production-authoring@2026.07.16.2",
    status: "review_only_import_allowed_activation_blocked",
    boundaries: {
      sourceChangedByAudit: false,
      correctionsInvented: false,
      currentThirtyCasePoolChanged: false,
      saveSchemaChanged: false,
      productionPool: 0,
      activationAllowed: false,
    },
    summary: {
      p0: 0,
      p1: 5,
      p2: 2,
      runtimeEligible: false,
      nextSafeStep: "import_immutable_review_input_and_keep_all_runtime_gates_fail_closed",
    },
    findings: [
      {
        id: "p3_turnaround_collapsed_by_representative_usage",
        severity: "P1",
        status: "author_revision_or_usage_level_adapter_contract_required",
        source: "source/scripts/build-operational-package.mjs#representativeUsage",
        requirement: "turnaround must be resolved per exact usage urgency and persisted once",
        evidence: turnaroundAudit,
      },
      {
        id: "p3_unmatched_urgency_and_classification_defaults",
        severity: "P1",
        status: "author_explicit_crosswalk_required",
        source: "source/scripts/build-operational-package.mjs#urgencyBand/classificationBand",
        requirement: "unknown source strings must block the record instead of receiving a silent default",
        evidence: rawMappingAudit,
      },
      {
        id: "p4_safe_alternative_fact_binding_missing",
        severity: "P1",
        status: "author_presentation_fact_crosswalk_required",
        source: "source/generated/p4/behavior-crosswalk.json#handlingAlternatives",
        requirement: "handling alternative must preserve an existing fact binding, route, and medical-result owner",
        evidence: p4Audit,
      },
      {
        id: "p6_crosswalk_is_not_p5_execution_authority",
        severity: "P1",
        status: "exact_p5_v2_join_required",
        source: "source/source/p6-p5-exact-resource-crosswalk.json",
        requirement: "P5 requirementGroups, anyOf/AND, units, duration, lifecycle and scheduler commands remain authoritative",
        evidence: p6Audit,
      },
      {
        id: "p7_digest_does_not_bind_resolver_or_day_semantics",
        severity: "P1",
        status: "combined_activation_digest_required",
        source: "source/scripts/build-operational-package.mjs#catalogDigest",
        requirement: "activation digest must bind day catalog, all 93 resolver records, envelopes, and adapter version",
        evidence: p7Audit,
      },
      {
        id: "bundled_validator_has_runtime_false_positives",
        severity: "P2",
        status: "host_validator_compensation_required",
        source: "source/scripts/validate-operational-package.mjs",
        requirement: "host gate must test per-usage P3, real P4 fact binding, exact P5 join, and resolver digest coverage",
      },
      {
        id: "dependency_versions_not_content_addressed_in_author_manifest",
        severity: "P2",
        status: "host_provenance_pins_required",
        source: "source/MANIFEST.json#sources",
        requirement: "host registration must pin operational archive, medical .40, P5 .2, capability registry, and adapter digests",
      },
    ],
    intentionallyUnchanged: [
      "exact author package bytes",
      "medical truth and investigation results",
      "current 30 case IDs",
      "current/legacy-v1/tier-01-v2 save namespaces",
      "runtime economy and campaign state",
      "renderer and art",
    ],
  };
}

function auditRawUrgencyAndClassification(families, policy) {
  const unmatchedClassificationUsageIds = [];
  const unmatchedClassificationValues = new Set();
  const unmatchedUrgencyUsageIds = [];
  const unmatchedUrgencyValues = new Set();

  for (const { content: family } of families) {
    for (const variant of family.variants || []) {
      for (const presentation of variant.presentations || []) {
        const presentationRef = `${family.familyId}.${variant.id}.${presentation.id}`;
        const urgencyMatched = matchingRules(presentation.urgency, policy.urgencyBands).length > 0;
        (presentation.investigations || []).forEach((investigation, index) => {
          const usageId = `${presentationRef}.${investigation.id}.${index + 1}`;
          if (!urgencyMatched) {
            unmatchedUrgencyUsageIds.push(usageId);
            unmatchedUrgencyValues.add(String(presentation.urgency));
          }
          if (matchingRules(investigation.classification, policy.classificationBands).length === 0) {
            unmatchedClassificationUsageIds.push(usageId);
            unmatchedClassificationValues.add(String(investigation.classification));
          }
        });
      }
    }
  }

  return {
    unmatchedClassificationUsageIds: sorted(unmatchedClassificationUsageIds),
    unmatchedClassificationValues: sorted(unmatchedClassificationValues),
    unmatchedUrgencyUsageIds: sorted(unmatchedUrgencyUsageIds),
    unmatchedUrgencyValues: sorted(unmatchedUrgencyValues),
    currentBuilderDefaults: {
      classification: "conditional",
      urgency: "priority",
    },
  };
}

function auditTurnaround(researchCatalog, usageCatalog, policy, capabilityRegistry) {
  const capabilityById = new Map(capabilityRegistry.capabilities.map((item) => [item.id, item]));
  const researchById = new Map(researchCatalog.research.map((item) => [item.researchId, item]));
  const researchIds = new Set();
  const usageIds = new Set();
  const pairs = [];
  const emergencySlowerPairs = [];

  for (const usage of usageCatalog.usages) {
    const research = researchById.get(usage.researchId);
    assert.ok(research, `missing research catalog record ${usage.researchId}`);
    const storedByCapability = new Map(
      (research.turnaroundPolicy.candidates || []).map((item) => [item.capabilityId, item]),
    );
    for (const expected of expectedTurnaroundCandidates(
      research.requires,
      usage.urgencyBandId,
      capabilityById,
      policy,
    )) {
      const stored = storedByCapability.get(expected.capabilityId);
      if (JSON.stringify(stored) === JSON.stringify(expected)) continue;
      const mismatch = {
        usageId: usage.usageId,
        researchId: usage.researchId,
        urgencyBandId: usage.urgencyBandId,
        capabilityId: expected.capabilityId,
        stored: stored || null,
        expected,
      };
      pairs.push(mismatch);
      researchIds.add(usage.researchId);
      usageIds.add(usage.usageId);
      if (usage.urgencyBandId === "emergency"
        && Number.isFinite(stored?.minutes)
        && Number.isFinite(expected.minutes)
        && stored.minutes > expected.minutes) {
        emergencySlowerPairs.push(mismatch);
      }
    }
  }

  return {
    researchIds: sorted(researchIds),
    usageIds: sorted(usageIds),
    pairs: pairs.sort(compareMismatch),
    emergencySlowerPairs: emergencySlowerPairs.sort(compareMismatch),
  };
}

function auditP4Facts(families, explicitCrosswalk, generatedCrosswalk) {
  const medicalFactIds = new Set();
  const criticalFactIds = new Set();
  const examFindingFactIds = new Set();
  let criticalFactReferences = 0;
  let examFindingReferences = 0;
  for (const { content: family } of families) {
    for (const variant of family.variants || []) {
      for (const presentation of variant.presentations || []) {
        for (const fact of presentation.criticalFacts || []) {
          criticalFactReferences += 1;
          if (typeof fact.factId === "string" && fact.factId) {
            criticalFactIds.add(fact.factId);
            medicalFactIds.add(fact.factId);
          }
        }
        for (const finding of presentation.examFindings || []) {
          examFindingReferences += 1;
          if (typeof finding.factId === "string" && finding.factId) {
            examFindingFactIds.add(finding.factId);
            medicalFactIds.add(finding.factId);
          }
        }
      }
    }
  }
  const explicitMissingFactIds = explicitCrosswalk.handlingAlternatives
    .filter((record) => typeof record.factId !== "string" || record.factId.length === 0)
    .map((record) => record.sourceTag);
  const explicitMissingMedicalResultOwners = explicitCrosswalk.handlingAlternatives
    .filter((record) => typeof record.medicalResultAuthority !== "string"
      || record.medicalResultAuthority.length === 0)
    .map((record) => record.sourceTag);
  const explicitMissingSafeRoutes = explicitCrosswalk.handlingAlternatives
    .filter((record) => !Array.isArray(record.safeRouteIds) || record.safeRouteIds.length === 0)
    .map((record) => record.sourceTag);
  const alternativeFactIds = new Set();
  for (const handling of generatedCrosswalk.handlingAlternatives) {
    for (const alternative of handling.runtimeActionTemplate?.safeAlternatives || []) {
      alternativeFactIds.add(alternative.factId);
    }
  }
  const intersection = [...alternativeFactIds].filter((factId) => medicalFactIds.has(factId));
  return {
    criticalFactReferences,
    criticalFactIds: sorted(criticalFactIds),
    examFindingReferences,
    examFindingFactIds: sorted(examFindingFactIds),
    medicalFactIds: sorted(medicalFactIds),
    explicitHandlingAlternatives: explicitCrosswalk.handlingAlternatives.length,
    explicitMissingFactIds: sorted(explicitMissingFactIds),
    explicitMissingMedicalResultOwners: sorted(explicitMissingMedicalResultOwners),
    explicitMissingSafeRoutes: sorted(explicitMissingSafeRoutes),
    alternativeFactIds: sorted(alternativeFactIds),
    intersection: sorted(intersection),
    runtimeApplicationAllowed: false,
    reason: "no authored presentationRef + handlingTag + existing medical factId crosswalk",
  };
}

function auditP6ExecutionAuthority(p3Explicit, crosswalk) {
  const executionShapeFields = [
    "requirementGroups",
    "anyOf",
    "units",
    "taskClass",
    "durationMinutes",
    "safeRouteId",
  ];
  const capabilityIdsWithoutExecutionShape = crosswalk.capabilities
    .filter((record) => executionShapeFields.every((field) => !Object.hasOwn(record, field)))
    .map((record) => record.capabilityId);
  const supplementalWithoutSchedulerCommand = crosswalk.supplementalCapabilities
    .filter((record) => !Object.hasOwn(record, "schedulerCommand"))
    .map((record) => record.capabilityId);
  return {
    p5PackageVersion: crosswalk.p5PackageVersion,
    resourceIds: sorted(crosswalk.resources.map((record) => record.resourceId)),
    capabilityIdsWithoutExecutionShape: sorted(capabilityIdsWithoutExecutionShape),
    supplementalWithoutSchedulerCommand: sorted(supplementalWithoutSchedulerCommand),
    scheduledRecheckSlot: crosswalk.supplementalCapabilities
      .find((record) => record.capabilityId === "scheduled_recheck_slot") || null,
    localRoutes: p3Explicit.researchRoutes.filter((record) => record.routeMode === "local").length,
    localRoutesWithEmptyPredicates: sorted(p3Explicit.researchRoutes
      .filter((record) => record.routeMode === "local" && record.lifecyclePredicates.length === 0)
      .map((record) => record.researchId)),
    emptyPredicatesMeanAvailable: false,
    executionAuthority: "p5-production-authoring@2026.07.16.2 capability-operations-map only",
  };
}

function auditP7Digest(campaign, dayCatalog, director, evidenceResolver) {
  const authorPayload = {
    campaign: campaign.campaign,
    axes: director.axes,
    catalogEnvelopes: director.catalogEnvelopes,
    recovery: director.recovery,
  };
  const hostPayload = {
    dayCatalog,
    axes: director.axes,
    catalogEnvelopes: director.catalogEnvelopes,
    recovery: director.recovery,
    evidenceResolver,
    adapterVersion: "unassigned_pending_safe_adapter",
  };
  const mutatedResolver = clone(evidenceResolver);
  mutatedResolver.eventEffects[0].authority = `${mutatedResolver.eventEffects[0].authority}_mutation_probe`;
  const mutatedAuthorPayload = clone(authorPayload);
  const mutatedHostPayload = { ...clone(hostPayload), evidenceResolver: mutatedResolver };
  const resolverRecords = [
    ...evidenceResolver.goalEvidence.map((record) => ({ kind: "goalEvidence", id: record.evidenceId })),
    ...evidenceResolver.eventTriggers.map((record) => ({ kind: "eventTriggers", id: record.evidenceId })),
    ...evidenceResolver.eventEffects.map((record) => ({ kind: "eventEffects", id: record.effectId })),
    ...evidenceResolver.milestoneAndRecoveryRequirements.map((record) => ({
      kind: "milestoneAndRecoveryRequirements",
      id: record.evidenceId,
    })),
    ...evidenceResolver.specializationCapabilities.map((record) => ({
      kind: "specializationCapabilities",
      id: record.evidenceId,
    })),
    ...evidenceResolver.endingPredicates.map((record) => ({ kind: "endingPredicates", id: record.evidenceId })),
  ];
  const authorDigest = sha256Json(authorPayload);
  const mutatedAuthorDigest = sha256Json(mutatedAuthorPayload);
  const hostCombinedDigest = sha256Json(hostPayload);
  const mutatedHostCombinedDigest = sha256Json(mutatedHostPayload);
  return {
    authorCatalogDigest: director.catalogDigest,
    recomputedAuthorCatalogDigest: authorDigest,
    authorDigestMatches: authorDigest === director.catalogDigest,
    hostCombinedDigest,
    mutationProbe: {
      mutatedRecord: resolverRecords.find((record) => record.kind === "eventEffects"),
      mutatedAuthorDigest,
      mutatedHostCombinedDigest,
    },
    authorDigestChangesAfterResolverMutation: authorDigest !== mutatedAuthorDigest,
    hostCombinedDigestChangesAfterResolverMutation: hostCombinedDigest !== mutatedHostCombinedDigest,
    resolverRecordCount: resolverRecords.length,
    resolverRecords: resolverRecords.sort((left, right) => (
      `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`, "en")
    )),
    runtimeEnvelopeApprovalAllowed: false,
  };
}

function expectedTurnaroundCandidates(requirements, urgencyBandId, capabilityById, policy) {
  return requirements
    .map((capabilityId) => capabilityById.get(capabilityId))
    .filter((capability) => capability?.type === "external_service")
    .map((capability) => {
      if (Array.isArray(capability.turnaroundDays)) {
        return {
          capabilityId: capability.id,
          kind: "working_day_range",
          minimumDays: capability.turnaroundDays[0],
          maximumDays: capability.turnaroundDays[1],
          deterministicRule: policy.clock.deterministicRangeRule,
        };
      }
      const category = capability.turnaround || "contextual";
      const rule = policy.turnaroundCategories[category];
      assert.ok(rule, `missing turnaround category ${category}`);
      return {
        capabilityId: capability.id,
        kind: "categorical_minutes",
        category,
        minutes: rule.minutes ?? rule.minutesByUrgencyBand[urgencyBandId],
      };
    });
}

function matchingRules(value, rules) {
  const normalized = String(value).toLowerCase();
  return rules.filter((rule) => rule.matchTokens.some((token) => normalized.includes(String(token).toLowerCase())));
}

function compareMismatch(left, right) {
  return `${left.usageId}:${left.capabilityId}`.localeCompare(`${right.usageId}:${right.capabilityId}`, "en");
}

function sorted(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right), "en"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
