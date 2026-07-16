import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { loadMedicalAuthoringReviewInput } from "./lib/medical-authoring-review-input.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");

export async function runMedicalAuthoringBundledValidator(options = {}) {
  const loadOptions = { context: "review" };
  if (options.reviewInputVersion) loadOptions.reviewInputVersion = options.reviewInputVersion;
  const reviewInput = await loadMedicalAuthoringReviewInput(projectRoot, loadOptions);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vetgeme-medical-authoring-validator-"));
  const packageRoot = path.join(temporaryRoot, "medical-production-authoring");
  const sourceRoot = path.join(
    projectRoot,
    reviewInput.registration.root,
    reviewInput.registration.sourceRoot,
  );
  const capabilitySource = path.join(
    projectRoot,
    reviewInput.registration.capabilityRegistry.path,
  );
  const capabilityTarget = path.join(
    temporaryRoot,
    reviewInput.registration.capabilityRegistry.path,
  );

  try {
    await cp(sourceRoot, packageRoot, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
    });
    await mkdir(path.dirname(capabilityTarget), { recursive: true });
    await cp(capabilitySource, capabilityTarget, {
      dereference: false,
      errorOnExist: true,
      force: false,
    });

    const validatorPath = path.join(packageRoot, "scripts/validate-medical-authoring.mjs");
    const { stdout, stderr } = await execFileAsync(process.execPath, [validatorPath], {
      cwd: temporaryRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    return Object.freeze({
      status: "passed",
      packageId: reviewInput.registration.packageId,
      packageVersion: reviewInput.registration.packageVersion,
      validatorPath: "source/scripts/validate-medical-authoring.mjs",
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const versionArgument = process.argv.find((argument) => argument.startsWith("--version="));
  const unknownArguments = process.argv.slice(2).filter((argument) => !argument.startsWith("--version="));
  if (unknownArguments.length > 0) throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
  await runMedicalAuthoringBundledValidator({
    reviewInputVersion: versionArgument?.slice("--version=".length),
  });
}
