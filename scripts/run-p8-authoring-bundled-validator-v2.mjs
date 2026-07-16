import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  P8_REVIEW_INPUT_V2_ID,
  P8_REVIEW_INPUT_V2_VERSION,
  loadP8V2AuthoringReviewInput,
} from "./lib/p8-authoring-review-input-v2.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const MEDICAL_V40_SOURCE =
  "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source";
const OPERATIONAL_V1_SOURCE =
  "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.1/source";

export async function runP8V2AuthoringBundledValidator() {
  const reviewInput = await loadP8V2AuthoringReviewInput(projectRoot, {
    context: "review",
    reviewInputId: P8_REVIEW_INPUT_V2_ID,
    reviewInputVersion: P8_REVIEW_INPUT_V2_VERSION,
  });
  const importedP8Source = path.join(
    projectRoot,
    reviewInput.registration.root,
    reviewInput.registration.sourceRoot,
  );
  const importedMedicalSource = path.join(projectRoot, MEDICAL_V40_SOURCE);
  const importedOperationalSource = path.join(projectRoot, OPERATIONAL_V1_SOURCE);
  const [p8Before, medicalBefore, operationalBefore] = await Promise.all([
    snapshotTree(importedP8Source),
    snapshotTree(importedMedicalSource),
    snapshotTree(importedOperationalSource),
  ]);
  assert.equal(p8Before.length, 29, "tracked P8 v2 review source file count mismatch");
  assert.equal(
    medicalBefore.length,
    reviewInput.medicalReviewInput.sourceIntegrity.sourceFilesVerified,
    "tracked medical .40 source file count mismatch",
  );
  assert.equal(operationalBefore.length, 25, "tracked operational .1 source file count mismatch");

  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vetgeme-p8-v2-authoring-validator-"));
  const p8Root = path.join(temporaryRoot, "p8-medical-review-authoring");
  const medicalRoot = path.join(temporaryRoot, ...MEDICAL_V40_SOURCE.split("/"));
  const operationalRoot = path.join(temporaryRoot, "operational-production-authoring");

  try {
    await cp(importedP8Source, p8Root, copyOptions());
    await cp(importedMedicalSource, medicalRoot, copyOptions());
    await cp(importedOperationalSource, operationalRoot, copyOptions());
    assert.deepEqual(await snapshotTree(p8Root), p8Before, "temporary P8 v2 package differs before validation");
    assert.deepEqual(await snapshotTree(medicalRoot), medicalBefore, "temporary medical .40 package differs before validation");
    assert.deepEqual(await snapshotTree(operationalRoot), operationalBefore, "temporary operational package differs before validation");

    const medicalValidatorPath = path.join(medicalRoot, "scripts/validate-medical-authoring.mjs");
    const auditPath = path.join(p8Root, "scripts/audit-p8-source.mjs");
    const displayPath = path.join(p8Root, "scripts/validate-p8-display-language.mjs");
    const dialoguePath = path.join(p8Root, "scripts/validate-human-dialogues.mjs");
    const buildPath = path.join(p8Root, "scripts/build-p8-package.mjs");
    const validatorPath = path.join(p8Root, "scripts/validate-p8-package.mjs");
    const p8Environment = {
      MEDICAL_SOURCE_ROOT: MEDICAL_V40_SOURCE,
      MEDICAL_EXPECTED_VERSION: "2026.07.16.40",
    };

    await runSuccessful(medicalValidatorPath, [], temporaryRoot, {
      VETGEME_REPO_ROOT: projectRoot,
    });
    await runSuccessful(auditPath, ["--require-clean"], temporaryRoot, p8Environment);
    const audit = await readJson(path.join(p8Root, "generated/P8_SOURCE_AUDIT.json"));
    assert.equal(audit.status, "reviewable", "bundled P8 v2 source audit must be reviewable");
    assert.equal(audit.activationAllowed, false, "bundled P8 v2 source audit must forbid activation");
    assert.equal(audit.counts.bySeverity.P0, 0, "bundled P8 v2 source audit contains P0 defects");
    assert.equal(audit.counts.bySeverity.P1, 0, "bundled P8 v2 source audit contains P1 defects");

    await runSuccessful(displayPath, [], temporaryRoot, p8Environment);
    const display = await readJson(path.join(
      p8Root,
      "generated/P8_DISPLAY_LANGUAGE_AUDIT_2026.07.16.40.json",
    ));
    assert.equal(display.status, "passed", "bundled P8 v2 display-language audit must pass");
    assert.equal(display.counts.issues, 0, "bundled P8 v2 display-language audit contains issues");
    assert.equal(display.counts.nullResults, 0, "bundled P8 v2 display audit contains null results");

    await runSuccessful(dialoguePath, ["--require-clean"], temporaryRoot);
    const dialogue = await readJson(path.join(p8Root, "generated/P8_DIALOGUE_VALIDATION.json"));
    assert.equal(dialogue.status, "pass", "bundled P8 v2 dialogue clean gate must pass");

    await runSuccessful(buildPath, [], temporaryRoot);
    await runSuccessful(validatorPath, [], temporaryRoot);
    const validation = await readJson(path.join(p8Root, "generated/P8_PACKAGE_VALIDATION.json"));
    assert.equal(validation.status, "pass", "bundled P8 v2 package validation must pass");
    assert.equal(validation.activationAllowed, false, "bundled P8 v2 package must forbid activation");

    assert.deepEqual(
      await snapshotTree(p8Root),
      p8Before,
      "bundled P8 v2 regeneration must reproduce all imported review bytes exactly",
    );
    assert.deepEqual(
      await snapshotTree(medicalRoot),
      medicalBefore,
      "bundled validation mutated the temporary medical .40 source",
    );
    assert.deepEqual(
      await snapshotTree(operationalRoot),
      operationalBefore,
      "bundled validation mutated the temporary operational source",
    );
    assert.deepEqual(await snapshotTree(importedP8Source), p8Before, "validation mutated tracked P8 v2 bytes");
    assert.deepEqual(await snapshotTree(importedMedicalSource), medicalBefore, "validation mutated tracked medical .40 bytes");
    assert.deepEqual(await snapshotTree(importedOperationalSource), operationalBefore, "validation mutated tracked operational bytes");

    return Object.freeze({
      status: "passed",
      packageId: reviewInput.registration.packageId,
      packageVersion: reviewInput.registration.packageVersion,
      medicalVersion: reviewInput.medicalReviewInputIdentity.reviewInputVersion,
      operationalVersion: reviewInput.operationalReviewInputIdentity.reviewInputVersion,
      authorCommandsRunInTemporaryCopy: 6,
      medicalValidationStatus: "passed",
      sourceAuditStatus: audit.status,
      displayAuditStatus: display.status,
      dialogueStatus: dialogue.status,
      packageValidationStatus: validation.status,
      importedP8FilesImmutable: p8Before.length,
      importedMedicalFilesImmutable: medicalBefore.length,
      importedOperationalFilesImmutable: operationalBefore.length,
      familiesValidated: audit.counts.families,
      variantsValidated: audit.counts.variants,
      presentationsValidated: audit.counts.presentations,
      investigationsValidated: display.counts.investigations,
      playerFacingFieldsValidated: display.counts.playerFacingFields,
      p0: audit.counts.bySeverity.P0,
      p1: audit.counts.bySeverity.P1,
      sourceIssuesOpen: audit.counts.issues,
      displayIssuesOpen: display.counts.issues,
      activationAllowed: false,
      trackedSourcesImmutable: true,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function copyOptions() {
  return { recursive: true, dereference: false, errorOnExist: true, force: false };
}

async function runSuccessful(executablePath, argumentsList, cwd, environment = {}) {
  const result = await execFileAsync(process.execPath, [executablePath, ...argumentsList], {
    cwd,
    env: { ...process.env, ...environment },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  writeCommandOutput(result);
  return result;
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
  console.log(JSON.stringify(await runP8V2AuthoringBundledValidator(), null, 2));
}
