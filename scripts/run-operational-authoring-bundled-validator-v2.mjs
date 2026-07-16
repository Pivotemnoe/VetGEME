import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { loadOperationalAuthoringReviewInputV2 } from "./lib/operational-authoring-review-input-v2.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");

export async function runOperationalAuthoringBundledValidatorV2() {
  const before = await loadOperationalAuthoringReviewInputV2(projectRoot, { context: "review" });
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vetgeme-operational-authoring-v2-validator-"));
  const operationalRoot = path.join(temporaryRoot, "operational-production-authoring-2026.07.16.2");
  const medicalTarget = path.join(
    temporaryRoot,
    "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source",
  );
  const capabilityTarget = path.join(temporaryRoot, before.registration.capabilityRegistry.path);
  const identityTarget = path.join(temporaryRoot, "systems/identity-behavior-v4.js");

  try {
    await cp(
      path.join(projectRoot, before.registration.root, before.registration.sourceRoot),
      operationalRoot,
      { recursive: true, dereference: false, errorOnExist: true, force: false },
    );
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

    const buildPath = path.join(operationalRoot, "scripts/build-operational-package.mjs");
    const validatorPath = path.join(operationalRoot, "scripts/validate-operational-package.mjs");
    const build = await execFileAsync(process.execPath, [buildPath], {
      cwd: temporaryRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const validation = await execFileAsync(process.execPath, [validatorPath], {
      cwd: temporaryRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (build.stdout) process.stdout.write(build.stdout);
    if (build.stderr) process.stderr.write(build.stderr);
    if (validation.stdout) process.stdout.write(validation.stdout);
    if (validation.stderr) process.stderr.write(validation.stderr);

    const after = await loadOperationalAuthoringReviewInputV2(projectRoot, { context: "review" });
    if (before.sourceIntegrity.aggregateSha256 !== after.sourceIntegrity.aggregateSha256) {
      throw new Error("tracked operational .2 source changed while running the bundled validator");
    }
    return Object.freeze({
      status: "passed_author_validator_review_only",
      packageId: before.registration.packageId,
      packageVersion: before.registration.packageVersion,
      executionRoot: "temporary_copy",
      trackedSourceUnchanged: true,
      rawArchiveRequired: false,
      buildPath: "source/scripts/build-operational-package.mjs",
      validatorPath: "source/scripts/validate-operational-package.mjs",
      authoringChecks: after.audit.validationEvidence.authorChecks,
      simulatedCampaigns: after.audit.validationEvidence.simulatedCampaigns,
      simulatedDemandDays: after.audit.validationEvidence.simulatedDemandDays,
      runtimeEligible: false,
      unresolvedBlockers: after.blockers.map((blocker) => blocker.id),
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  console.log(JSON.stringify(await runOperationalAuthoringBundledValidatorV2(), null, 2));
}
