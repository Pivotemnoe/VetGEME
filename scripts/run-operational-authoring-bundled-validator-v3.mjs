import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { loadOperationalAuthoringReviewInputV3 } from "./lib/operational-authoring-review-input-v3.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const P5_MANIFEST_SHA256 = "25730b20dcc3d0ac840082f353ccea14d11c35aa9c107bf2cb52ccd21e3e69c6";
const REPRODUCIBLE_GENERATED_PATHS = Object.freeze([
  "generated/p3/investigation-usage-policy.json",
  "generated/p3/provider-catalog.json",
  "generated/p3/research-catalog.json",
  "generated/p4/appearance-pools.json",
  "generated/p4/behavior-crosswalk.json",
  "generated/p4/history-policy.json",
  "generated/p4/observable-cues.json",
  "generated/p4/owner-profile-catalog.json",
  "generated/p4/temperament-catalog.json",
  "generated/p6/economy-catalog.json",
  "generated/p6/p3-p5-resource-crosswalk.json",
  "generated/p7/day-catalog.json",
  "generated/p7/director-catalog.json",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function runOperationalAuthoringBundledValidatorV3({ rebuild = false } = {}) {
  const before = await loadOperationalAuthoringReviewInputV3(projectRoot, { context: "review" });
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vetgeme-operational-authoring-v3-validator-"));
  const operationalRoot = path.join(temporaryRoot, "operational-production-authoring-2026.07.16.3");
  const medicalTarget = path.join(
    temporaryRoot,
    "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source",
  );
  const capabilityTarget = path.join(temporaryRoot, before.registration.capabilityRegistry.path);
  const identityTarget = path.join(temporaryRoot, "systems/identity-behavior-v4.js");
  const p5ManifestTarget = path.join(
    temporaryRoot,
    "p5-production-authoring-2026.07.16.2/MANIFEST.json",
  );

  try {
    const trackedSource = path.join(projectRoot, before.registration.root, before.registration.sourceRoot);
    await cp(trackedSource, operationalRoot, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
    });
    await mkdir(path.dirname(medicalTarget), { recursive: true });
    await cp(
      path.join(
        projectRoot,
        "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source",
      ),
      medicalTarget,
      { recursive: true, dereference: false, errorOnExist: true, force: false },
    );
    await mkdir(path.dirname(capabilityTarget), { recursive: true });
    await cp(path.join(projectRoot, before.registration.capabilityRegistry.path), capabilityTarget, {
      dereference: false,
      errorOnExist: true,
      force: false,
    });
    await mkdir(path.dirname(identityTarget), { recursive: true });
    await cp(path.join(projectRoot, "systems/identity-behavior-v4.js"), identityTarget, {
      dereference: false,
      errorOnExist: true,
      force: false,
    });

    const commandResults = [];
    if (rebuild) {
      const rawP5Manifest = path.join(projectRoot, "p5-production-authoring-2026.07.16.2/MANIFEST.json");
      const rawP5Bytes = await readFile(rawP5Manifest);
      assert.equal(sha256(rawP5Bytes), P5_MANIFEST_SHA256, "raw P5 .2 manifest digest mismatch");
      await mkdir(path.dirname(p5ManifestTarget), { recursive: true });
      await cp(rawP5Manifest, p5ManifestTarget, { dereference: false, errorOnExist: true, force: false });
      commandResults.push(await runAuthorCommand(operationalRoot, temporaryRoot, "scripts/author-v3-exact-contracts.mjs"));
      commandResults.push(await runAuthorCommand(operationalRoot, temporaryRoot, "scripts/build-operational-package.mjs"));
    }
    commandResults.push(await runAuthorCommand(operationalRoot, temporaryRoot, "scripts/validate-operational-package.mjs"));

    const [validationReport, correctionMatrix] = await Promise.all([
      readJson(path.join(operationalRoot, "reports/VALIDATION_REPORT.json")),
      readJson(path.join(operationalRoot, "reports/P1_CORRECTION_MATRIX.json")),
    ]);
    assert.equal(validationReport.status, "pass");
    assert.equal(validationReport.checks.length, 62);
    assert.equal(validationReport.simulation.campaigns, 10000);
    assert.equal(validationReport.simulation.demandDays, 297717);
    assert.equal(correctionMatrix.status, "author_corrections_complete_exact_p5_join_pending");
    assert.equal(correctionMatrix.activationGate.exactP5V2JoinComplete, false);
    assert.equal(correctionMatrix.activationGate.runtimeActivationAllowed, false);

    if (rebuild) {
      for (const relativePath of REPRODUCIBLE_GENERATED_PATHS) {
        const [tracked, rebuilt] = await Promise.all([
          readFile(path.join(trackedSource, relativePath)),
          readFile(path.join(operationalRoot, relativePath)),
        ]);
        assert.deepEqual(rebuilt, tracked, `${relativePath}: author rebuild differs from immutable review input`);
      }
    }

    const after = await loadOperationalAuthoringReviewInputV3(projectRoot, { context: "review" });
    assert.equal(
      before.sourceIntegrity.aggregateSha256,
      after.sourceIntegrity.aggregateSha256,
      "tracked operational .3 source changed while running the bundled validator",
    );
    return Object.freeze({
      status: "passed_author_validator_review_only",
      packageId: before.registration.packageId,
      packageVersion: before.registration.packageVersion,
      executionRoot: "temporary_copy",
      authorRebuildExecuted: rebuild,
      generatedFilesReproduced: rebuild ? REPRODUCIBLE_GENERATED_PATHS.length : 0,
      trackedSourceUnchanged: true,
      authoringChecks: validationReport.checks.length,
      simulatedCampaigns: validationReport.simulation.campaigns,
      simulatedDemandDays: validationReport.simulation.demandDays,
      runtimeEligible: false,
      reservationAuthority: false,
      unresolvedBlockers: after.blockers.map((blocker) => blocker.id),
      commands: commandResults.map((result) => result.relativePath),
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function runAuthorCommand(operationalRoot, temporaryRoot, relativePath) {
  const result = await execFileAsync(process.execPath, [path.join(operationalRoot, relativePath)], {
    cwd: temporaryRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return { relativePath };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--rebuild");
  if (unknownArguments.length > 0) throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
  console.log(JSON.stringify(await runOperationalAuthoringBundledValidatorV3({
    rebuild: process.argv.includes("--rebuild"),
  }), null, 2));
}
