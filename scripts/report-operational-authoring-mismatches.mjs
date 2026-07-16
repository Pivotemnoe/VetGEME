import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadOperationalAuthoringReviewInput } from "./lib/operational-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(projectRoot, "reports/OPERATIONAL_AUTHORING_P3_P7_MISMATCHES.json");
const write = process.argv.includes("--write");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--write");
if (unknownArguments.length > 0) throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);

const reviewInput = await loadOperationalAuthoringReviewInput(projectRoot, { context: "review" });
const report = {
  schemaVersion: 1,
  reportId: "vetgeme-operational-authoring-p3-p7-mismatches",
  packageId: reviewInput.registration.packageId,
  packageVersion: reviewInput.registration.packageVersion,
  status: "author_revision_and_runtime_authority_required",
  reviewOnly: true,
  productionEligible: false,
  runtimeEligible: false,
  sourceIntegrity: reviewInput.sourceIntegrity,
  counts: reviewInput.audit.counts,
  mismatchCount: reviewInput.blockers.length,
  mismatches: reviewInput.blockers,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (write) {
  await writeFile(reportPath, serialized);
} else {
  const currentText = await readFile(reportPath, "utf8");
  assert.deepEqual(JSON.parse(currentText), report, "operational mismatch report is stale; run with --write");
  assert.equal(currentText, serialized, "operational mismatch report serialization is stale; run with --write");
}

console.log(JSON.stringify({
  status: "passed",
  mode: write ? "write" : "verify",
  report: path.relative(projectRoot, reportPath),
  mismatchCount: report.mismatchCount,
  mismatchIds: report.mismatches.map((entry) => entry.id),
}, null, 2));
