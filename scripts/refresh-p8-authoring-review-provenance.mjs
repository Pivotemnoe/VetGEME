import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewInputRoot = path.join(
  projectRoot,
  "content/review-inputs/vetgeme-p8-medical-review-authoring-2026.07.16.1",
);
const sourceRoot = path.join(reviewInputRoot, "source");
const provenancePath = path.join(reviewInputRoot, "provenance.json");
const sourceArchivePath = path.join(projectRoot, "p8-medical-review-authoring-2026.07.16.1.zip");
const sourceArchiveChecksumPath = `${sourceArchivePath}.sha256`;
const write = process.argv.includes("--write");
const compareSource = process.argv.includes("--compare-source") || process.argv.includes("--compare-archive");
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => !["--write", "--compare-source", "--compare-archive"].includes(argument));

if (unknownArguments.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
}

const archiveIdentity = Object.freeze({
  path: "p8-medical-review-authoring-2026.07.16.1.zip",
  checksumPath: "p8-medical-review-authoring-2026.07.16.1.zip.sha256",
  sourceDirectory: "p8-medical-review-authoring",
  sha256: "1c7bd9da610cc03f08081023e613651b025bb677371a4ad3161e02960d6477eb",
  zipEntryCount: 20,
  extractedFileCount: 16,
  extractedBytes: 4561393,
  keyFileHashes: Object.freeze({
    "MANIFEST.json": "cdba8797106767b12b4af0da632f66d3b3fc7eeedc889716372dce4ee4931133",
    "generated/P8_SOURCE_AUDIT.json": "68140eae1fb5fe67fce95aab4e236b0c490b98ab8dd01265a65504aab1407900",
    "source/p8-review-policy.json": "68a2faa475f058c2e3396c44418aef6cb4c3f794056f3866a1360088bb3218b1",
    "source/reviewer-decision-template.json": "228204f848c32e99c3beb6731739fbdd3e804b7f69b3c1a564d9de03b8767b78",
    "scripts/validate-p8-package.mjs": "2fcb3d4aabd54b296b651336c6827249ec279db49c998e467483252f08895c58",
  }),
});

const provenance = await buildProvenance();
const serializedProvenance = `${JSON.stringify(provenance, null, 2)}\n`;
const provenanceSha256 = sha256(Buffer.from(serializedProvenance, "utf8"));
const archiveComparison = compareSource ? await assertExactArchiveCopy(provenance.files) : null;

if (write) {
  await writeFile(provenancePath, serializedProvenance);
} else {
  const currentText = await readFile(provenancePath, "utf8");
  assert.deepEqual(JSON.parse(currentText), provenance, "P8 review provenance is stale; run with --write");
  assert.equal(currentText, serializedProvenance, "P8 review provenance serialization is stale; run with --write");
}

console.log(JSON.stringify({
  status: "passed",
  mode: write ? "write" : "verify",
  exactArchiveCompared: compareSource,
  archiveEntryCountVerified: archiveComparison?.entryCount || 0,
  archiveFilesCompared: archiveComparison?.fileCount || 0,
  sourceFileCount: provenance.sourceFileCount,
  sourceBytes: provenance.sourceBytes,
  provenanceSha256,
  aggregateSha256: provenance.aggregateSha256,
  archiveSha256: provenance.archive.sha256,
}, null, 2));

async function buildProvenance() {
  const manifest = JSON.parse(await readFile(path.join(sourceRoot, "MANIFEST.json"), "utf8"));
  const sourceFiles = await listFiles(sourceRoot);
  const files = [];
  for (const relativeFile of sourceFiles) {
    const buffer = await readFile(path.join(sourceRoot, ...relativeFile.split("/")));
    files.push({
      path: relativeFile,
      originPath: `${archiveIdentity.sourceDirectory}/${relativeFile}`,
      bytes: buffer.length,
      sha256: sha256(buffer),
    });
  }
  const aggregate = createHash("sha256");
  for (const file of files) aggregate.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`, "utf8");
  return {
    schemaVersion: 1,
    provenanceId: "vetgeme-p8-medical-review-authoring-review-source",
    packageId: manifest.packageId,
    packageVersion: manifest.packageVersion,
    sourceArchive: archiveIdentity.path,
    sourceDirectory: archiveIdentity.sourceDirectory,
    archive: {
      path: archiveIdentity.path,
      checksumPath: archiveIdentity.checksumPath,
      sha256: archiveIdentity.sha256,
      zipEntryCount: archiveIdentity.zipEntryCount,
      extractedFileCount: archiveIdentity.extractedFileCount,
      extractedBytes: archiveIdentity.extractedBytes,
      keyFileHashes: archiveIdentity.keyFileHashes,
    },
    sourceFileCount: files.length,
    sourceBytes: files.reduce((total, file) => total + file.bytes, 0),
    aggregateSha256: aggregate.digest("hex"),
    files,
  };
}

async function assertExactArchiveCopy(files) {
  const checksumText = await readFile(sourceArchiveChecksumPath, "utf8");
  assert.equal(
    checksumText.trim(),
    `${archiveIdentity.sha256}  ${archiveIdentity.path}`,
    "P8 archive sidecar checksum mismatch",
  );
  assert.equal(sha256(await readFile(sourceArchivePath)), archiveIdentity.sha256, "P8 archive SHA-256 mismatch");
  const inventory = await inspectArchiveEntries();
  const archiveByRelativePath = new Map(inventory.files.map((entry) => [entry.relativePath, entry]));
  assert.deepEqual(
    [...archiveByRelativePath.keys()].sort(),
    files.map((file) => file.path).sort(),
    "tracked P8 source file set differs from the v1 archive",
  );
  for (const file of files) {
    const tracked = await readFile(path.join(sourceRoot, ...file.path.split("/")));
    const archived = await readArchiveEntry(archiveByRelativePath.get(file.path).archivePath);
    assert.deepEqual(tracked, archived, `${file.path}: tracked P8 review input differs from v1 archive`);
  }
  return { entryCount: inventory.entries.length, fileCount: inventory.files.length };
}

async function inspectArchiveEntries() {
  const [{ stdout: namesOutput }, { stdout: modesOutput }] = await Promise.all([
    execFileAsync("unzip", ["-Z1", sourceArchivePath], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 }),
    execFileAsync("zipinfo", ["-l", sourceArchivePath], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 }),
  ]);
  const entries = Buffer.from(namesOutput).toString("utf8").split(/\r?\n/u).filter(Boolean);
  const modes = Buffer.from(modesOutput).toString("utf8").split(/\r?\n/u)
    .filter((line) => /^[bcdlps-][rwxstST-]{9}\s/u.test(line)).map((line) => line.slice(0, 10));
  assert.equal(entries.length, archiveIdentity.zipEntryCount, "P8 archive entry count mismatch");
  assert.equal(modes.length, entries.length, "P8 archive mode inventory count mismatch");
  assert.equal(new Set(entries).size, entries.length, "P8 archive contains duplicate paths");
  const rootPrefix = `${archiveIdentity.sourceDirectory}/`;
  const files = [];
  entries.forEach((archivePath, index) => {
    assert.equal(archivePath.startsWith(rootPrefix), true, `${archivePath}: archive path escapes package root`);
    assert.equal(archivePath.includes("\\"), false, `${archivePath}: archive path contains backslash`);
    const relativePath = archivePath.slice(rootPrefix.length).replace(/\/$/u, "");
    assert.equal(
      relativePath.split("/").filter(Boolean).every((part) => part !== "." && part !== ".."),
      true,
      `${archivePath}: archive path traversal is forbidden`,
    );
    const isDirectory = archivePath.endsWith("/");
    assert.equal(modes[index][0], isDirectory ? "d" : "-", `${archivePath}: unsupported archive entry type`);
    if (!isDirectory) files.push({ archivePath, relativePath });
  });
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  assert.equal(files.length, archiveIdentity.extractedFileCount, "P8 archive regular-file count mismatch");
  return { entries, files };
}

async function readArchiveEntry(archivePath) {
  const { stdout } = await execFileAsync("unzip", ["-p", sourceArchivePath, archivePath], {
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024,
  });
  return Buffer.from(stdout);
}

async function listFiles(root, prefix = "") {
  const files = [];
  const directory = prefix ? path.join(root, ...prefix.split("/")) : root;
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`${relative}: symbolic links are forbidden`);
    if (entry.isDirectory()) files.push(...await listFiles(root, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`${relative}: unsupported filesystem entry`);
  }
  return files;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
