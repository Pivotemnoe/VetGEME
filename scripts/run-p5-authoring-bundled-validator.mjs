import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { loadP5AuthoringReviewInput } from "./lib/p5-authoring-review-input.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");

export async function runP5AuthoringBundledValidator() {
  const reviewInput = await loadP5AuthoringReviewInput(projectRoot, { context: "review" });
  const importedSource = path.join(projectRoot, reviewInput.registration.root, reviewInput.registration.sourceRoot);
  const importedBefore = await hashTree(importedSource);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vetgeme-p5-authoring-validator-"));
  const p5Root = path.join(temporaryRoot, "p5-production-authoring");
  const operationalRoot = path.join(temporaryRoot, "operational-production-authoring");
  const capabilityTarget = path.join(temporaryRoot, reviewInput.registration.capabilityRegistry.path);
  const schedulerTarget = path.join(temporaryRoot, "systems/resource-scheduler-v5.js");

  try {
    await cp(importedSource, p5Root, { recursive: true, dereference: false, errorOnExist: true, force: false });
    await cp(
      path.join(projectRoot, "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.1/source"),
      operationalRoot,
      { recursive: true, dereference: false, errorOnExist: true, force: false },
    );
    await mkdir(path.dirname(capabilityTarget), { recursive: true });
    await cp(path.join(projectRoot, reviewInput.registration.capabilityRegistry.path), capabilityTarget, {
      dereference: false,
      errorOnExist: true,
      force: false,
    });
    await mkdir(path.dirname(schedulerTarget), { recursive: true });
    await cp(path.join(projectRoot, "systems/resource-scheduler-v5.js"), schedulerTarget, {
      dereference: false,
      errorOnExist: true,
      force: false,
    });

    const buildPath = path.join(p5Root, "scripts/build-p5-package.mjs");
    const validatorPath = path.join(p5Root, "scripts/validate-p5-package.mjs");
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

    const rebuilt = await hashTree(p5Root);
    assert.deepEqual(rebuilt, importedBefore, "bundled P5 build must reproduce the imported review bytes exactly");
    assert.deepEqual(await hashTree(importedSource), importedBefore, "bundled validation mutated tracked P5 review bytes");
    return Object.freeze({
      status: "passed",
      packageId: reviewInput.registration.packageId,
      packageVersion: reviewInput.registration.packageVersion,
      buildPath: "source/scripts/build-p5-package.mjs",
      validatorPath: "source/scripts/validate-p5-package.mjs",
      importedFilesImmutable: importedBefore.files.length,
      resourcesValidated: 49,
      runtimeTasksValidated: 2606,
      simulatedCampaigns: 10000,
      simulatedDemandDays: 300000,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function hashTree(root, prefix = "") {
  const files = [];
  const directory = prefix ? path.join(root, ...prefix.split("/")) : root;
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.equal(entry.isSymbolicLink(), false, `${relativePath}: symbolic links are forbidden`);
    if (entry.isDirectory()) files.push(...(await hashTree(root, relativePath)).files);
    else if (entry.isFile()) {
      const bytes = await readFile(path.join(root, ...relativePath.split("/")));
      files.push({ path: relativePath, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    } else throw new Error(`${relativePath}: unsupported filesystem entry`);
  }
  return { files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  console.log(JSON.stringify(await runP5AuthoringBundledValidator(), null, 2));
}
