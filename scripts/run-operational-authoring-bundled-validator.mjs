import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { loadOperationalAuthoringReviewInput } from "./lib/operational-authoring-review-input.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");

export async function runOperationalAuthoringBundledValidator() {
  const reviewInput = await loadOperationalAuthoringReviewInput(projectRoot, { context: "review" });
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vetgeme-operational-authoring-validator-"));
  const operationalRoot = path.join(temporaryRoot, "operational-production-authoring");
  const medicalRoot = path.join(temporaryRoot, "medical-production-authoring");
  const capabilityTarget = path.join(
    temporaryRoot,
    reviewInput.registration.capabilityRegistry.path,
  );
  const identityTarget = path.join(temporaryRoot, "systems/identity-behavior-v4.js");

  try {
    await cp(
      path.join(projectRoot, reviewInput.registration.root, reviewInput.registration.sourceRoot),
      operationalRoot,
      { recursive: true, dereference: false, errorOnExist: true, force: false },
    );
    await cp(
      path.join(
        projectRoot,
        "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.39/source",
      ),
      medicalRoot,
      { recursive: true, dereference: false, errorOnExist: true, force: false },
    );
    await mkdir(path.dirname(capabilityTarget), { recursive: true });
    await cp(path.join(projectRoot, reviewInput.registration.capabilityRegistry.path), capabilityTarget, {
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
      maxBuffer: 32 * 1024 * 1024,
    });
    const validation = await execFileAsync(process.execPath, [validatorPath], {
      cwd: temporaryRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    if (build.stdout) process.stdout.write(build.stdout);
    if (build.stderr) process.stderr.write(build.stderr);
    if (validation.stdout) process.stdout.write(validation.stdout);
    if (validation.stderr) process.stderr.write(validation.stderr);
    return Object.freeze({
      status: "passed",
      packageId: reviewInput.registration.packageId,
      packageVersion: reviewInput.registration.packageVersion,
      buildPath: "source/scripts/build-operational-package.mjs",
      validatorPath: "source/scripts/validate-operational-package.mjs",
      authoringChecks: 37,
      simulatedCampaigns: 10000,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await runOperationalAuthoringBundledValidator();
}
