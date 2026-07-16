import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadP5AuthoringReviewInputV2 } from "./lib/p5-authoring-review-input-v2.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewInput = await loadP5AuthoringReviewInputV2(projectRoot, { context: "review" });

console.log(JSON.stringify({
  status: "passed_review_only_with_external_activation_gates",
  input: `${reviewInput.registration.reviewInputId}@${reviewInput.registration.reviewInputVersion}`,
  supersession: reviewInput.registration.authorSourceSupersession,
  reviewOnly: reviewInput.reviewOnly,
  productionEligible: reviewInput.productionEligible,
  runtimeEligible: reviewInput.runtimeEligible,
  productionPool: reviewInput.productionPool.length,
  sourceIntegrity: reviewInput.sourceIntegrity,
  operationalDependency: reviewInput.operationalReviewInputIdentity,
  capabilityRegistry: reviewInput.capabilityRegistryIdentity,
  medicalAuthorityBoundary: reviewInput.medicalAuthorityBoundary,
  counts: reviewInput.audit.counts,
  validationEvidence: reviewInput.audit.validationEvidence,
  blockers: reviewInput.blockers.map(({ id, status, summary }) => ({ id, status, summary })),
}, null, 2));
