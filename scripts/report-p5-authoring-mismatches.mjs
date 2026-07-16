import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadP5AuthoringReviewInput } from "./lib/p5-authoring-review-input.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(projectRoot, "reports/P5_AUTHORING_MISMATCHES.json");
const write = process.argv.includes("--write");
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--write");
if (unknownArguments.length > 0) throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);

const reviewInput = await loadP5AuthoringReviewInput(projectRoot, { context: "review" });
const report = {
  schemaVersion: 1,
  reportId: "vetgeme-p5-authoring-mismatches",
  packageId: reviewInput.registration.packageId,
  packageVersion: reviewInput.registration.packageVersion,
  status: "programmer_adapter_and_external_authority_required",
  reviewOnly: true,
  productionEligible: false,
  runtimeEligible: false,
  allowRuntimeActivation: false,
  allowAutomaticP6Crosswalk: false,
  sourceIntegrity: reviewInput.sourceIntegrity,
  upstreamOperationalInput: reviewInput.upstreamOperationalIdentity,
  counts: reviewInput.audit.counts,
  startAvailability: reviewInput.audit.gapAudit.startAvailability,
  mismatchCount: reviewInput.blockers.length,
  mismatches: reviewInput.blockers,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (write) {
  await writeFile(reportPath, serialized);
} else {
  const currentText = await readFile(reportPath, "utf8");
  assert.deepEqual(JSON.parse(currentText), report, "P5 mismatch report is stale; run with --write");
  assert.equal(currentText, serialized, "P5 mismatch report serialization is stale; run with --write");
}

console.log(JSON.stringify({
  status: "passed",
  mode: write ? "write" : "verify",
  report: path.relative(projectRoot, reportPath),
  mismatchCount: report.mismatchCount,
  mismatchIds: report.mismatches.map((entry) => entry.id),
}, null, 2));
