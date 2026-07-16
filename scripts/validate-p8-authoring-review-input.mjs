import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadP8AuthoringReviewInput } from "./lib/p8-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewInput = await loadP8AuthoringReviewInput(projectRoot, { context: "review" });

console.log(JSON.stringify({
  status: "passed_review_only_with_blockers",
  input: `${reviewInput.registration.reviewInputId}@${reviewInput.registration.reviewInputVersion}`,
  loadContext: reviewInput.loadContext,
  reviewOnly: reviewInput.reviewOnly,
  productionEligible: reviewInput.productionEligible,
  runtimeEligible: reviewInput.runtimeEligible,
  generatorEligible: reviewInput.generatorEligible,
  activationAllowed: reviewInput.activationAllowed,
  playerFacingDialogueAllowed: reviewInput.registration.allowPlayerFacingDialogue,
  reviewerDecisionImportAllowed: reviewInput.registration.allowReviewerDecisionImport,
  activationManifestAllowed: reviewInput.registration.allowActivationManifest,
  productionPool: reviewInput.productionPool.length,
  sourceIntegrity: reviewInput.sourceIntegrity,
  medicalReviewInput: reviewInput.medicalReviewInputIdentity,
  operationalReviewInput: reviewInput.operationalReviewInputIdentity,
  counts: reviewInput.audit.counts,
  cleanGate: reviewInput.audit.cleanGate,
  dialogueAuthority: reviewInput.audit.dialogueAuthority,
  p4PresentationClosure: reviewInput.audit.p4PresentationClosure,
  unmappedResearchTasks: reviewInput.audit.unmappedResearchTasks,
  blockers: reviewInput.blockers.map(({ id, status, summary }) => ({ id, status, summary })),
}, null, 2));
