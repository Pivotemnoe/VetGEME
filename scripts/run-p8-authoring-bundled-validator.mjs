import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { loadP8AuthoringReviewInput } from "./lib/p8-authoring-review-input.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const MEDICAL_V39_SOURCE =
  "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.39/source";
const OPERATIONAL_V1_SOURCE =
  "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.1/source";

export async function runP8AuthoringBundledValidator() {
  const reviewInput = await loadP8AuthoringReviewInput(projectRoot, { context: "review" });
  const importedSource = path.join(
    projectRoot,
    reviewInput.registration.root,
    reviewInput.registration.sourceRoot,
  );
  const importedBefore = await snapshotTree(importedSource);
  assert.equal(
    importedBefore.length,
    reviewInput.registration.expectedCounts.sourceFiles,
    "tracked P8 review source file count mismatch",
  );

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vetgeme-p8-authoring-validator-"));
  const p8Root = path.join(temporaryRoot, "p8-medical-review-authoring");
  const medicalRoot = path.join(temporaryRoot, "medical-production-authoring");
  const operationalRoot = path.join(temporaryRoot, "operational-production-authoring");

  try {
    await cp(importedSource, p8Root, copyOptions());
    await cp(path.join(projectRoot, MEDICAL_V39_SOURCE), medicalRoot, copyOptions());
    await cp(path.join(projectRoot, OPERATIONAL_V1_SOURCE), operationalRoot, copyOptions());
    assert.deepEqual(
      await snapshotTree(p8Root),
      importedBefore,
      "temporary P8 package differs from the tracked review input before validation",
    );

    const auditPath = path.join(p8Root, "scripts/audit-p8-source.mjs");
    const dialoguePath = path.join(p8Root, "scripts/validate-human-dialogues.mjs");
    const buildPath = path.join(p8Root, "scripts/build-p8-package.mjs");
    const validatorPath = path.join(p8Root, "scripts/validate-p8-package.mjs");

    await runSuccessful(auditPath, [], temporaryRoot);
    const audit = await readJson(path.join(p8Root, "generated/P8_SOURCE_AUDIT.json"));
    assert.equal(audit.status, "blocked", "bundled P8 source audit must remain fail-closed");
    assert.equal(audit.activationAllowed, false, "bundled P8 source audit must forbid activation");

    const cleanGateExitCode = await runExpectedFailure(
      auditPath,
      ["--require-clean"],
      temporaryRoot,
    );

    await runSuccessful(dialoguePath, ["--require-clean"], temporaryRoot);
    const dialogue = await readJson(path.join(p8Root, "generated/P8_DIALOGUE_VALIDATION.json"));
    assert.equal(dialogue.status, "pass", "bundled P8 dialogue clean gate must pass");

    await runSuccessful(buildPath, [], temporaryRoot);
    await runSuccessful(validatorPath, [], temporaryRoot);
    const validation = await readJson(path.join(p8Root, "generated/P8_PACKAGE_VALIDATION.json"));
    assert.equal(validation.status, "pass", "bundled P8 package validation must pass");
    assert.equal(validation.activationAllowed, false, "bundled P8 package must forbid activation");

    assert.deepEqual(
      await snapshotTree(p8Root),
      importedBefore,
      "bundled P8 regeneration must reproduce all imported review bytes exactly",
    );
    assert.deepEqual(
      await snapshotTree(importedSource),
      importedBefore,
      "bundled validation mutated tracked P8 review bytes",
    );

    return Object.freeze({
      status: "passed",
      packageId: reviewInput.registration.packageId,
      packageVersion: reviewInput.registration.packageVersion,
      auditPath: "source/scripts/audit-p8-source.mjs",
      sourceAuditStatus: audit.status,
      sourceAuditRequireCleanExitCode: cleanGateExitCode,
      dialoguePath: "source/scripts/validate-human-dialogues.mjs",
      dialogueStatus: dialogue.status,
      buildPath: "source/scripts/build-p8-package.mjs",
      validatorPath: "source/scripts/validate-p8-package.mjs",
      importedFilesImmutable: importedBefore.length,
      familiesValidated: audit.counts.families,
      variantsValidated: audit.counts.variants,
      presentationsValidated: audit.counts.presentations,
      sourceIssuesOpen: audit.counts.issues,
      activationAllowed: false,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function copyOptions() {
  return { recursive: true, dereference: false, errorOnExist: true, force: false };
}

async function runSuccessful(executablePath, argumentsList, cwd) {
  const result = await execFileAsync(process.execPath, [executablePath, ...argumentsList], {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  writeCommandOutput(result);
  return result;
}

async function runExpectedFailure(executablePath, argumentsList, cwd) {
  try {
    const result = await execFileAsync(process.execPath, [executablePath, ...argumentsList], {
      cwd,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    writeCommandOutput(result);
  } catch (error) {
    writeCommandOutput(error);
    assert.equal(error?.code, 1, "P8 source clean gate must exit with status 1");
    return error.code;
  }
  assert.fail("P8 source clean gate unexpectedly passed");
}

function writeCommandOutput(result) {
  if (result?.stdout) process.stdout.write(result.stdout);
  if (result?.stderr) process.stderr.write(result.stderr);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function snapshotTree(root, prefix = "") {
  const files = [];
  const directory = prefix ? path.join(root, ...prefix.split("/")) : root;
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.equal(entry.isSymbolicLink(), false, `${relativePath}: symbolic links are forbidden`);
    if (entry.isDirectory()) {
      files.push(...await snapshotTree(root, relativePath));
    } else if (entry.isFile()) {
      files.push({
        path: relativePath,
        bytes: await readFile(path.join(root, ...relativePath.split("/"))),
      });
    } else {
      throw new Error(`${relativePath}: unsupported filesystem entry`);
    }
  }
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  console.log(JSON.stringify(await runP8AuthoringBundledValidator(), null, 2));
}
