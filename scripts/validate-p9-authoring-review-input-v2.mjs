import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  P9_REVIEW_INPUT_V2_ID,
  P9_REVIEW_INPUT_V2_VERSION,
  loadP9AuthoringReviewInputV2FromReader,
} from "./lib/p9-authoring-review-input-v2.mjs";
import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
} from "./lib/medical-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reader = createFileSystemReviewInputReader(projectRoot);
const registry = JSON.parse(Buffer.from(await reader.readBytes(REVIEW_INPUT_REGISTRY_PATH)).toString("utf8"));
const registered = registry.reviewInputs.some((entry) => (
  entry.reviewInputId === P9_REVIEW_INPUT_V2_ID
    && entry.reviewInputVersion === P9_REVIEW_INPUT_V2_VERSION
));
if (!registered) throw new Error("P9 .2 is not registered; synthetic intake registration is forbidden");
const reviewInput = await loadP9AuthoringReviewInputV2FromReader(reader, registry, {
  context: "review",
  reviewInputId: P9_REVIEW_INPUT_V2_ID,
  reviewInputVersion: P9_REVIEW_INPUT_V2_VERSION,
});

console.log(JSON.stringify({
  status: "passed_review_only_host_harness_activation_forbidden",
  input: `${reviewInput.registration.reviewInputId}@${reviewInput.registration.reviewInputVersion}`,
  registryMode: "registered",
  loadContext: reviewInput.loadContext,
  reviewOnly: reviewInput.reviewOnly,
  productionEligible: reviewInput.productionEligible,
  runtimeEligible: reviewInput.runtimeEligible,
  activationAllowed: reviewInput.activationAllowed,
  productionPool: reviewInput.productionPool.length,
  authorSource: reviewInput.authorSource,
  hostReviewHarness: {
    status: reviewInput.hostReviewHarness.status,
    integrationStatus: reviewInput.hostReviewHarness.integrationStatus,
    browserAcceptanceStatus: reviewInput.hostReviewHarness.browserAcceptanceStatus,
    ordinaryRuntimeConnected: reviewInput.hostReviewHarness.ordinaryRuntimeConnected,
    ordinaryRuntimeLoads: reviewInput.hostReviewHarness.ordinaryRuntimeLoads,
    artifactsVerified: reviewInput.hostReviewHarness.artifactsVerified,
    bindings: reviewInput.hostReviewHarness.bindings,
  },
  sourceIntegrity: reviewInput.sourceIntegrity,
  p5ReviewInput: reviewInput.p5ReviewInputIdentity,
  counts: reviewInput.audit.counts,
  sourceBoundaries: reviewInput.audit.sourceBoundaries,
  renderBoundaries: reviewInput.audit.renderBoundaries,
  activationRequires: reviewInput.audit.activationRequires,
  blockers: reviewInput.blockers,
}, null, 2));
