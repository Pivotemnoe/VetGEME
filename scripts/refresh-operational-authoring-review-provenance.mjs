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
  "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.1",
);
const sourceRoot = path.join(reviewInputRoot, "source");
const provenancePath = path.join(reviewInputRoot, "provenance.json");
const sourceArchivePath = path.join(
  projectRoot,
  "operational-production-authoring-2026.07.16.1.zip",
);
const sourceArchiveChecksumPath = `${sourceArchivePath}.sha256`;
const sourceDirectoryPath = path.join(projectRoot, "operational-production-authoring");
const write = process.argv.includes("--write");
const compareSource = process.argv.includes("--compare-source");
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => !["--write", "--compare-source"].includes(argument));

if (unknownArguments.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
}

const archiveIdentity = Object.freeze({
  path: "operational-production-authoring-2026.07.16.1.zip",
  checksumPath: "operational-production-authoring-2026.07.16.1.zip.sha256",
  sha256: "5d396f3ec56369a56e0113ec66b262c2726ed0a13a80571cdca8fc2516bde807",
  zipEntryCount: 36,
  extractedFileCount: 25,
  extractedBytes: 3925919,
  keyFileHashes: Object.freeze({
    "MANIFEST.json": "725fad790cbaf3262a159af4b69e13404b43b2877f5e276cadc3526c7ed2f6ae",
    "schemas/OPERATIONAL_PACKAGE_CONTRACT.md": "647758580cfdefb44b4fea2d45af459f32dd9c25990eb8f55ff1a7a40dbcbaf6",
    "scripts/validate-operational-package.mjs": "3096b6df1315a4ae90e086e2654295ea5313ec1c1e0a25044ba93f3d90ab4de7",
    "generated/p7/director-catalog.json": "828520ef20eaffe8331947354e4b226bdcc792a2e7d7ac2740b757d7c026bbd9",
  }),
});

const provenance = await buildProvenance();
const serializedProvenance = `${JSON.stringify(provenance, null, 2)}\n`;
const provenanceSha256 = sha256(Buffer.from(serializedProvenance, "utf8"));
const archiveComparison = compareSource ? await assertExactSourceCopy(provenance.files) : null;

if (write) {
  await writeFile(provenancePath, serializedProvenance);
} else {
  const currentText = await readFile(provenancePath, "utf8");
  assert.deepEqual(
    JSON.parse(currentText),
    provenance,
    "operational authoring review provenance is stale; run with --write",
  );
  assert.equal(
    currentText,
    serializedProvenance,
    "operational authoring review provenance serialization is stale; run with --write",
  );
}

console.log(JSON.stringify({
  status: "passed",
  mode: write ? "write" : "verify",
  exactSourceCompared: compareSource,
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
      originPath: `${path.basename(sourceDirectoryPath)}/${relativeFile}`,
      bytes: buffer.length,
      sha256: sha256(buffer),
    });
  }

  const aggregate = createHash("sha256");
  for (const file of files) {
    aggregate.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`, "utf8");
  }

  return {
    schemaVersion: 1,
    provenanceId: "vetgeme-operational-production-authoring-review-source",
    packageId: manifest.packageId,
    packageVersion: manifest.packageVersion,
    sourceArchive: archiveIdentity.path,
    sourceDirectory: path.basename(sourceDirectoryPath),
    archive: archiveIdentity,
    sourceFileCount: files.length,
    sourceBytes: files.reduce((total, file) => total + file.bytes, 0),
    aggregateSha256: aggregate.digest("hex"),
    files,
  };
}

async function assertExactSourceCopy(files) {
  const [archive, checksumText] = await Promise.all([
    readFile(sourceArchivePath),
    readFile(sourceArchiveChecksumPath, "utf8"),
  ]);
  assert.equal(sha256(archive), archiveIdentity.sha256, "authoring archive SHA-256 mismatch");
  const [checksum, checksumFile] = checksumText.trim().split(/\s+/u);
  assert.equal(checksum, archiveIdentity.sha256, "authoring checksum sidecar digest mismatch");
  assert.equal(checksumFile, archiveIdentity.path, "authoring checksum sidecar filename mismatch");

  const archiveInventory = await inspectArchiveEntries();
  assert.deepEqual(
    archiveInventory.files.map((entry) => entry.relativePath),
    files.map((file) => file.path),
    "tracked review input and archive file sets differ",
  );
  const sourceFiles = await listFiles(sourceDirectoryPath);
  assert.deepEqual(sourceFiles, files.map((file) => file.path), "tracked and extracted file sets differ");

  let sourceBytes = 0;
  for (const [index, file] of files.entries()) {
    const archiveEntry = archiveInventory.files[index];
    const [tracked, original, archived] = await Promise.all([
      readFile(path.join(sourceRoot, ...file.path.split("/"))),
      readFile(path.join(sourceDirectoryPath, ...file.path.split("/"))),
      readArchiveEntry(archiveEntry.archivePath),
    ]);
    sourceBytes += original.length;
    assert.deepEqual(tracked, original, `${file.path}: tracked review input differs from source`);
    assert.deepEqual(tracked, archived, `${file.path}: tracked review input differs from archive entry`);
  }

  assert.equal(files.length, archiveIdentity.extractedFileCount, "source file count mismatch");
  assert.equal(sourceBytes, archiveIdentity.extractedBytes, "source byte count mismatch");
  for (const [relativeFile, expectedHash] of Object.entries(archiveIdentity.keyFileHashes)) {
    assert.equal(
      sha256(await readFile(path.join(sourceRoot, ...relativeFile.split("/")))),
      expectedHash,
      `${relativeFile}: key-file SHA-256 mismatch`,
    );
  }
  return { entryCount: archiveInventory.entries.length, fileCount: archiveInventory.files.length };
}

async function inspectArchiveEntries() {
  const [{ stdout: namesOutput }, { stdout: modesOutput }] = await Promise.all([
    execFileAsync("unzip", ["-Z1", sourceArchivePath], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 }),
    execFileAsync("zipinfo", ["-l", sourceArchivePath], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 }),
  ]);
  const entries = Buffer.from(namesOutput).toString("utf8").split(/\r?\n/u).filter(Boolean);
  const modes = Buffer.from(modesOutput)
    .toString("utf8")
    .split(/\r?\n/u)
    .filter((line) => /^[bcdlps-][rwxstST-]{9}\s/u.test(line))
    .map((line) => line.slice(0, 10));
  assert.equal(entries.length, archiveIdentity.zipEntryCount, "archive entry count mismatch");
  assert.equal(modes.length, entries.length, "archive mode inventory count mismatch");
  assert.equal(new Set(entries).size, entries.length, "archive contains duplicate paths");

  const rootPrefix = `${path.basename(sourceDirectoryPath)}/`;
  const files = [];
  entries.forEach((archivePath, index) => {
    assert.equal(archivePath.includes("\0"), false, `${archivePath}: archive path contains NUL`);
    assert.equal(archivePath.includes("\\"), false, `${archivePath}: archive path contains backslash`);
    assert.equal(archivePath.startsWith(rootPrefix), true, `${archivePath}: archive path escapes package root`);
    const relativePath = archivePath.slice(rootPrefix.length).replace(/\/$/u, "");
    const parts = relativePath ? relativePath.split("/") : [];
    assert.equal(parts.every((part) => part && part !== "." && part !== ".."), true, `${archivePath}: traversal is forbidden`);
    const isDirectory = archivePath.endsWith("/");
    assert.equal(modes[index][0], isDirectory ? "d" : "-", `${archivePath}: unsupported archive entry type`);
    if (!isDirectory) files.push({ archivePath, relativePath });
  });
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  assert.equal(files.length, archiveIdentity.extractedFileCount, "archive regular file count mismatch");
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
