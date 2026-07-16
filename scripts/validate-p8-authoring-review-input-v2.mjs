import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  P8_REVIEW_INPUT_V2_ID,
  P8_REVIEW_INPUT_V2_VERSION,
  loadP8V2AuthoringReviewInput,
} from "./lib/p8-authoring-review-input-v2.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewInput = await loadP8V2AuthoringReviewInput(projectRoot, {
  context: "review",
  reviewInputId: P8_REVIEW_INPUT_V2_ID,
  reviewInputVersion: P8_REVIEW_INPUT_V2_VERSION,
});

console.log(JSON.stringify({
  status: "passed_review_only_external_veterinary_review_pending",
  input: `${reviewInput.registration.reviewInputId}@${reviewInput.registration.reviewInputVersion}`,
  loadContext: reviewInput.loadContext,
  reviewOnly: reviewInput.reviewOnly,
  productionEligible: reviewInput.productionEligible,
  runtimeEligible: reviewInput.runtimeEligible,
  generatorEligible: reviewInput.generatorEligible,
  activationAllowed: reviewInput.activationAllowed,
  externalVeterinaryApproval: reviewInput.externalVeterinaryApproval,
  playerFacingDialogueAllowed: reviewInput.registration.allowPlayerFacingDialogue,
  reviewerDecisionImportAllowed: reviewInput.registration.allowReviewerDecisionImport,
  activationManifestAllowed: reviewInput.registration.allowActivationManifest,
  productionPool: reviewInput.productionPool.length,
  sourceIntegrity: reviewInput.sourceIntegrity,
  reviewerDecisionHostContract: reviewInput.reviewerDecisionHostContract,
  medicalReviewInput: reviewInput.medicalReviewInputIdentity,
  operationalReviewInput: reviewInput.operationalReviewInputIdentity,
  counts: reviewInput.audit.counts,
  cleanGate: reviewInput.audit.cleanGate,
  dialogueAuthority: reviewInput.audit.dialogueAuthority,
  p4PresentationClosure: reviewInput.audit.p4PresentationClosure,
  unmappedResearchTasks: reviewInput.audit.unmappedResearchTasks,
  nonAuthoritativeArtifacts: reviewInput.audit.nonAuthoritativeArtifacts,
  hostRisks: reviewInput.audit.hostRisks,
  blockers: reviewInput.blockers.map(({ id, status, summary }) => ({ id, status, summary })),
}, null, 2));
