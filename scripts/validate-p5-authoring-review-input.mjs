import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadP5AuthoringReviewInput } from "./lib/p5-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewInput = await loadP5AuthoringReviewInput(projectRoot, { context: "review" });

console.log(JSON.stringify({
  status: "passed_review_only_with_blockers",
  input: `${reviewInput.registration.reviewInputId}@${reviewInput.registration.reviewInputVersion}`,
  loadContext: reviewInput.loadContext,
  reviewOnly: reviewInput.reviewOnly,
  productionEligible: reviewInput.productionEligible,
  runtimeEligible: reviewInput.runtimeEligible,
  allowRuntimeActivation: reviewInput.registration.allowRuntimeActivation,
  allowAutomaticP6Crosswalk: reviewInput.registration.allowAutomaticP6Crosswalk,
  productionPool: reviewInput.productionPool.length,
  capabilityRegistry: reviewInput.capabilityRegistryIdentity,
  upstreamOperationalInput: reviewInput.upstreamOperationalIdentity,
  sourceIntegrity: reviewInput.sourceIntegrity,
  counts: reviewInput.audit.counts,
  startAvailability: {
    startsActiveCandidates: reviewInput.audit.gapAudit.startAvailability.startsActiveCandidates,
    p5RequirementFreeResources: reviewInput.audit.gapAudit.startAvailability.p5RequirementFreeResources,
    candidates: summarizeAvailability(reviewInput.audit.gapAudit.startAvailability.candidate),
    p5RequirementFree: summarizeAvailability(reviewInput.audit.gapAudit.startAvailability.p5RequirementFree),
  },
  blockers: reviewInput.blockers.map(({ id, status, summary }) => ({ id, status, summary })),
}, null, 2));

function summarizeAvailability(slice) {
  return Object.fromEntries(Object.entries(slice).filter(([, value]) => value?.templates !== undefined).map(([kind, value]) => [
    kind,
    {
      templates: value.templates,
      templatesSchedulableAtStart: value.templatesSchedulableAtStart,
      templatesBlockedAtStart: value.templatesBlockedAtStart,
      emptyGroups: value.emptyGroups,
    },
  ]));
}
