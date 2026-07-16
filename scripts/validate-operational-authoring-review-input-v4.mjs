import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadOperationalAuthoringReviewInputV4 } from "./lib/operational-authoring-review-input-v4.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewInput = await loadOperationalAuthoringReviewInputV4(projectRoot, { context: "review" });

console.log(JSON.stringify({
  status: "passed_review_only_with_unresolved_blockers",
  input: `${reviewInput.registration.reviewInputId}@${reviewInput.registration.reviewInputVersion}`,
  supersedesAsAuthorSource: reviewInput.registration.authorSourceSupersession,
  loadContext: reviewInput.loadContext,
  reviewOnly: reviewInput.reviewOnly,
  productionEligible: reviewInput.productionEligible,
  runtimeEligible: reviewInput.runtimeEligible,
  generatorEligible: reviewInput.generatorEligible,
  productionPool: reviewInput.productionPool.length,
  sourceIntegrity: reviewInput.sourceIntegrity,
  medicalDependency: reviewInput.medicalReviewInputIdentity,
  p5Dependency: reviewInput.p5ReviewInputIdentity,
  capabilityRegistry: reviewInput.capabilityRegistryIdentity,
  counts: reviewInput.audit.counts,
  validationEvidence: reviewInput.audit.validationEvidence,
  blockers: reviewInput.blockers.map(({ id, status, summary }) => ({ id, status, summary })),
}, null, 2));
