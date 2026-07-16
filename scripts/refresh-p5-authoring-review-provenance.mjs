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
  "content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.1",
);
const sourceRoot = path.join(reviewInputRoot, "source");
const provenancePath = path.join(reviewInputRoot, "provenance.json");
const sourceArchivePath = path.join(projectRoot, "p5-production-authoring-2026.07.16.1.zip");
const sourceArchiveChecksumPath = `${sourceArchivePath}.sha256`;
const sourceDirectoryPath = path.join(projectRoot, "p5-production-authoring");
const write = process.argv.includes("--write");
const compareSource = process.argv.includes("--compare-source");
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => !["--write", "--compare-source"].includes(argument));

if (unknownArguments.length > 0) throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);

const archiveIdentity = Object.freeze({
  path: "p5-production-authoring-2026.07.16.1.zip",
  checksumPath: "p5-production-authoring-2026.07.16.1.zip.sha256",
  sha256: "cb5afacd1199ba38f72370013b7a2d569a78e80411720b04032627a1c1922389",
  zipEntryCount: 23,
  extractedFileCount: 17,
  extractedBytes: 2947725,
  keyFileHashes: Object.freeze({
    "MANIFEST.json": "855ab150afb1467a175f42403c091ecee3445aaefbbabc6fbbf491f0bcc9584c",
    "schemas/P5_AUTHORING_CONTRACT.md": "b1ef82b5ba2c3980eaaae9dc7e147a84b46e9941462a5fef10d09837f81e4f7b",
    "scripts/validate-p5-package.mjs": "8a0a8b9deab59ebfa337b40fe27012fc78a1b1e5a466c29401583eac04f4fb04",
    "generated/operational-policies.json": "5fd237f237eae0e69c93eacd434c5b43d96bc44d1f109e77a598a9642853e8f3",
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
  assert.deepEqual(JSON.parse(currentText), provenance, "P5 authoring review provenance is stale; run with --write");
  assert.equal(currentText, serializedProvenance, "P5 authoring provenance serialization is stale; run with --write");
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
  for (const file of files) aggregate.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`, "utf8");
  return {
    schemaVersion: 1,
    provenanceId: "vetgeme-p5-production-authoring-review-source",
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
  assert.equal(sha256(archive), archiveIdentity.sha256, "P5 authoring archive SHA-256 mismatch");
  const [checksum, checksumFile] = checksumText.trim().split(/\s+/u);
  assert.equal(checksum, archiveIdentity.sha256, "P5 authoring checksum sidecar digest mismatch");
  assert.equal(checksumFile, archiveIdentity.path, "P5 authoring checksum sidecar filename mismatch");

  const archiveInventory = await inspectArchiveEntries();
  assert.deepEqual(
    archiveInventory.files.map((entry) => entry.relativePath),
    files.map((file) => file.path),
    "tracked P5 review input and archive file sets differ",
  );
  assert.deepEqual(await listFiles(sourceDirectoryPath), files.map((file) => file.path), "tracked and extracted P5 file sets differ");

  let sourceBytes = 0;
  for (const [index, file] of files.entries()) {
    const archiveEntry = archiveInventory.files[index];
    const [tracked, original, archived] = await Promise.all([
      readFile(path.join(sourceRoot, ...file.path.split("/"))),
      readFile(path.join(sourceDirectoryPath, ...file.path.split("/"))),
      readArchiveEntry(archiveEntry.archivePath),
    ]);
    sourceBytes += original.length;
    assert.deepEqual(tracked, original, `${file.path}: tracked P5 review input differs from source`);
    assert.deepEqual(tracked, archived, `${file.path}: tracked P5 review input differs from archive entry`);
  }
  assert.equal(files.length, archiveIdentity.extractedFileCount, "P5 source file count mismatch");
  assert.equal(sourceBytes, archiveIdentity.extractedBytes, "P5 source byte count mismatch");
  for (const [relativeFile, expectedHash] of Object.entries(archiveIdentity.keyFileHashes)) {
    assert.equal(sha256(await readFile(path.join(sourceRoot, ...relativeFile.split("/")))), expectedHash, `${relativeFile}: key-file SHA-256 mismatch`);
  }
  return { entryCount: archiveInventory.entries.length, fileCount: archiveInventory.files.length };
}

async function inspectArchiveEntries() {
  const [{ stdout: namesOutput }, { stdout: modesOutput }] = await Promise.all([
    execFileAsync("unzip", ["-Z1", sourceArchivePath], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 }),
    execFileAsync("zipinfo", ["-l", sourceArchivePath], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 }),
  ]);
  const entries = Buffer.from(namesOutput).toString("utf8").split(/\r?\n/u).filter(Boolean);
  const modes = Buffer.from(modesOutput).toString("utf8").split(/\r?\n/u)
    .filter((line) => /^[bcdlps-][rwxstST-]{9}\s/u.test(line)).map((line) => line.slice(0, 10));
  assert.equal(entries.length, archiveIdentity.zipEntryCount, "P5 archive entry count mismatch");
  assert.equal(modes.length, entries.length, "P5 archive mode inventory count mismatch");
  assert.equal(new Set(entries).size, entries.length, "P5 archive contains duplicate paths");
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
  assert.equal(files.length, archiveIdentity.extractedFileCount, "P5 archive regular file count mismatch");
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
