import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { loadP5AuthoringReviewInputV2 } from "./lib/p5-authoring-review-input-v2.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");

export async function runP5AuthoringBundledValidatorV2({ rebuild = false } = {}) {
  const before = await loadP5AuthoringReviewInputV2(projectRoot, { context: "review" });
  const importedSource = path.join(projectRoot, before.registration.root, before.registration.sourceRoot);
  const importedBefore = await hashTree(importedSource);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vetgeme-p5-authoring-v2-validator-"));
  const p5Root = path.join(temporaryRoot, "p5-production-authoring-2026.07.16.2");
  const operationalRoot = path.join(temporaryRoot, "operational-production-authoring-2026.07.16.2");
  const capabilityTarget = path.join(temporaryRoot, before.registration.capabilityRegistry.path);
  const schedulerTarget = path.join(temporaryRoot, "systems/resource-scheduler-v5.js");

  try {
    await cp(importedSource, p5Root, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
    });
    await cp(
      path.join(
        projectRoot,
        "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.2/source",
      ),
      operationalRoot,
      { recursive: true, dereference: false, errorOnExist: true, force: false },
    );
    await mkdir(path.dirname(capabilityTarget), { recursive: true });
    await cp(path.join(projectRoot, before.registration.capabilityRegistry.path), capabilityTarget, {
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

    const commands = [];
    if (rebuild) {
      commands.push(await runAuthorCommand(p5Root, temporaryRoot, "scripts/author-v2-lifecycle-contracts.mjs"));
      commands.push(await runAuthorCommand(p5Root, temporaryRoot, "scripts/build-p5-package.mjs"));
    }
    commands.push(await runAuthorCommand(p5Root, temporaryRoot, "scripts/validate-p5-package.mjs"));

    const rebuilt = await hashTree(p5Root);
    assert.deepEqual(rebuilt, importedBefore, "bundled P5 .2 author commands must reproduce immutable review bytes exactly");
    assert.deepEqual(await hashTree(importedSource), importedBefore, "bundled P5 .2 validation mutated tracked review bytes");
    const validationReport = JSON.parse(await readFile(path.join(p5Root, "reports/VALIDATION_REPORT.json"), "utf8"));
    assert.equal(validationReport.result, "pass");
    assert.equal(validationReport.runtimeContract.resourcesValidated, 49);
    assert.equal(validationReport.runtimeContract.runtimeTasksValidated, 2606);
    assert.equal(validationReport.runtimeContract.handoffSaveReload, "pass");
    assert.equal(validationReport.runtimeContract.urgentOvercapacitySafeRoute, "pass");
    assert.equal(validationReport.simulations.campaigns, 10000);
    assert.equal(validationReport.simulations.demandDays, 300000);

    const after = await loadP5AuthoringReviewInputV2(projectRoot, { context: "review" });
    assert.equal(before.sourceIntegrity.aggregateSha256, after.sourceIntegrity.aggregateSha256);
    assert.deepEqual(before.audit.counts, after.audit.counts);
    return Object.freeze({
      status: "passed_author_validator_review_only",
      packageId: before.registration.packageId,
      packageVersion: before.registration.packageVersion,
      executionRoot: "temporary_copy",
      authorRebuildExecuted: rebuild,
      commands: commands.map((command) => command.relativePath),
      importedFilesImmutable: importedBefore.files.length,
      resourcesValidated: validationReport.runtimeContract.resourcesValidated,
      runtimeTasksValidated: validationReport.runtimeContract.runtimeTasksValidated,
      handoffSaveReload: validationReport.runtimeContract.handoffSaveReload,
      urgentOvercapacitySafeRoute: validationReport.runtimeContract.urgentOvercapacitySafeRoute,
      simulatedCampaigns: validationReport.simulations.campaigns,
      simulatedDemandDays: validationReport.simulations.demandDays,
      operationalDependencyVersion: after.operationalReviewInputIdentity.reviewInputVersion,
      p5MedicalSentinelIsAuthoritative: after.medicalAuthorityBoundary.p5SentinelIsMedicalAuthority,
      medicalAuthorityNormalizationAllowed: after.medicalAuthorityBoundary.normalizationAllowed,
      runtimeEligible: after.runtimeEligible,
      productionPool: after.productionPool.length,
      trackedSourceUnchanged: true,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function runAuthorCommand(p5Root, temporaryRoot, relativePath) {
  const result = await execFileAsync(process.execPath, [path.join(p5Root, relativePath)], {
    cwd: temporaryRoot,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return { relativePath };
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
      files.push({
        path: relativePath,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    } else throw new Error(`${relativePath}: unsupported filesystem entry`);
  }
  return { files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--rebuild");
  if (unknownArguments.length > 0) throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
  console.log(JSON.stringify(await runP5AuthoringBundledValidatorV2({
    rebuild: process.argv.includes("--rebuild"),
  }), null, 2));
}
