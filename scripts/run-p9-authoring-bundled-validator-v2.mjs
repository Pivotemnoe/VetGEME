import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  P9_REVIEW_INPUT_V2_ID,
  P9_REVIEW_INPUT_V2_VERSION,
  loadP9AuthoringReviewInputV2FromReader,
} from "./lib/p9-authoring-review-input-v2.mjs";
import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
} from "./lib/medical-authoring-review-input.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");

export async function runP9AuthoringBundledValidatorV2({ rebuild = false } = {}) {
  const reader = createFileSystemReviewInputReader(projectRoot);
  const registry = JSON.parse(Buffer.from(await reader.readBytes(REVIEW_INPUT_REGISTRY_PATH)).toString("utf8"));
  if (!registry.reviewInputs.some((entry) => (
    entry.reviewInputId === P9_REVIEW_INPUT_V2_ID
      && entry.reviewInputVersion === P9_REVIEW_INPUT_V2_VERSION
  ))) throw new Error("P9 .2 is not registered; synthetic intake registration is forbidden");
  const before = await loadP9AuthoringReviewInputV2FromReader(reader, registry, { context: "review" });
  const importedSource = path.join(projectRoot, before.registration.root, before.registration.sourceRoot);
  const importedBefore = await snapshotTree(importedSource);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "vetgeme-p9-authoring-v2-validator-"));
  const p9Root = path.join(temporaryRoot, "p9-visual-state-authoring-2026.07.16.2");
  const p5GeneratedRoot = path.join(
    temporaryRoot,
    "p5-production-authoring-2026.07.16.2/generated",
  );
  const artManifestPath = path.join(temporaryRoot, "art/ASSET_MANIFEST.json");

  try {
    await cp(importedSource, p9Root, copyOptions());
    await mkdir(p5GeneratedRoot, { recursive: true });
    for (const fileName of ["resource-catalog.json", "resource-lifecycle-catalog.json"]) {
      await cp(
        path.join(
          projectRoot,
          "content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.2/source/generated",
          fileName,
        ),
        path.join(p5GeneratedRoot, fileName),
        { dereference: false, errorOnExist: true, force: false },
      );
    }
    await mkdir(path.dirname(artManifestPath), { recursive: true });
    await writeFile(artManifestPath, `${JSON.stringify({
      schemaVersion: 1,
      packId: before.assetIndex.sourcePackId,
      assets: before.assetIndex.assetIds.map((id) => ({ id })),
    }, null, 2)}\n`);
    assert.deepEqual(await snapshotTree(p9Root), importedBefore, "temporary P9 .2 source differs before validation");

    const commands = [];
    if (rebuild) commands.push(await runAuthorCommand(p9Root, temporaryRoot, "scripts/build-p9-package.mjs"));
    commands.push(await runAuthorCommand(p9Root, temporaryRoot, "scripts/validate-p9-package.mjs"));
    const validationReport = JSON.parse(await readFile(path.join(p9Root, "reports/VALIDATION_REPORT.json"), "utf8"));
    assert.equal(validationReport.status, "pass");
    assert.equal(validationReport.checks.roomCoverage, 12);
    assert.equal(validationReport.checks.equipmentCoverage, 27);
    assert.equal(validationReport.checks.staffCoverage, 10);
    assert.equal(validationReport.checks.referencedAssets, 31);
    assert.equal(validationReport.checks.missingAssetReferences, 0);
    assert.equal(validationReport.checks.hudSurfaces, 9);
    assert.equal(validationReport.checks.redesignPerformed, false);
    assert.equal(validationReport.checks.runtimeChanged, false);

    const rebuilt = await snapshotTree(p9Root);
    assert.deepEqual(rebuilt, importedBefore, "bundled P9 .2 author commands must reproduce immutable review bytes exactly");
    assert.deepEqual(await snapshotTree(importedSource), importedBefore, "bundled P9 .2 validation mutated tracked review bytes");
    const after = await loadP9AuthoringReviewInputV2FromReader(reader, registry, { context: "review" });
    assert.equal(before.sourceIntegrity.aggregateSha256, after.sourceIntegrity.aggregateSha256);
    assert.deepEqual(before.audit.counts, after.audit.counts);
    return Object.freeze({
      status: "passed_author_validator_review_only",
      packageId: before.registration.packageId,
      packageVersion: before.registration.packageVersion,
      executionRoot: "temporary_copy",
      authorRebuildExecuted: rebuild,
      commands: commands.map((command) => command.relativePath),
      importedFilesImmutable: importedBefore.length,
      roomsValidated: validationReport.checks.roomCoverage,
      equipmentValidated: validationReport.checks.equipmentCoverage,
      staffValidated: validationReport.checks.staffCoverage,
      hudSurfacesValidated: validationReport.checks.hudSurfaces,
      referencedAssetsValidated: validationReport.checks.referencedAssets,
      exactP5ResourceMatches:
        after.audit.counts.exactP5RoomMatches
        + after.audit.counts.exactP5EquipmentMatches
        + after.audit.counts.exactP5StaffMatches,
      sourceAssetIdsValidated: after.assetIndex.assetIds.length,
      runtimeEligible: after.runtimeEligible,
      activationAllowed: after.activationAllowed,
      productionPool: after.productionPool.length,
      trackedSourceUnchanged: true,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function copyOptions() {
  return { recursive: true, dereference: false, errorOnExist: true, force: false };
}

async function runAuthorCommand(p9Root, temporaryRoot, relativePath) {
  const result = await execFileAsync(process.execPath, [path.join(p9Root, relativePath)], {
    cwd: temporaryRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return { relativePath };
}

async function snapshotTree(root, prefix = "") {
  const files = [];
  const directory = prefix ? path.join(root, ...prefix.split("/")) : root;
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.equal(entry.isSymbolicLink(), false, `${relativePath}: symbolic links are forbidden`);
    if (entry.isDirectory()) files.push(...await snapshotTree(root, relativePath));
    else if (entry.isFile()) {
      const bytes = await readFile(path.join(root, ...relativePath.split("/")));
      files.push({
        path: relativePath,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    } else throw new Error(`${relativePath}: unsupported filesystem entry`);
  }
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--rebuild");
  if (unknownArguments.length > 0) throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
  console.log(JSON.stringify(await runP9AuthoringBundledValidatorV2({
    rebuild: process.argv.includes("--rebuild"),
  }), null, 2));
}
