import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadOperationalAuthoringReviewInput } from "./lib/operational-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewInput = await loadOperationalAuthoringReviewInput(projectRoot, { context: "review" });

console.log(JSON.stringify({
  status: "passed_review_only_with_blockers",
  input: `${reviewInput.registration.reviewInputId}@${reviewInput.registration.reviewInputVersion}`,
  loadContext: reviewInput.loadContext,
  reviewOnly: reviewInput.reviewOnly,
  productionEligible: reviewInput.productionEligible,
  runtimeEligible: reviewInput.runtimeEligible,
  productionPool: reviewInput.productionPool.length,
  capabilityRegistry: reviewInput.capabilityRegistryIdentity,
  sourceIntegrity: reviewInput.sourceIntegrity,
  counts: reviewInput.audit.counts,
  blockers: reviewInput.blockers.map(({ id, status, summary }) => ({ id, status, summary })),
}, null, 2));
