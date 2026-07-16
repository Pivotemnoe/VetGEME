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
  "content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.39",
);
const sourceRoot = path.join(reviewInputRoot, "source");
const provenancePath = path.join(reviewInputRoot, "provenance.json");
const sourceArchivePath = path.join(
  projectRoot,
  "medical-production-authoring-2026.07.16.39.zip",
);
const sourceArchiveChecksumPath = `${sourceArchivePath}.sha256`;
const sourceDirectoryPath = path.join(projectRoot, "medical-production-authoring");
const write = process.argv.includes("--write");
const compareSource = process.argv.includes("--compare-source");
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => !["--write", "--compare-source"].includes(argument));

if (unknownArguments.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
}

const archiveIdentity = Object.freeze({
  path: "medical-production-authoring-2026.07.16.39.zip",
  checksumPath: "medical-production-authoring-2026.07.16.39.zip.sha256",
  sha256: "54a6cec64406dd4e326aa5ff089cbd3878ef7cd17a4bb7ed01123c7a93da822c",
  zipEntryCount: 129,
  extractedFileCount: 85,
  extractedBytes: 3194211,
  keyFileHashes: Object.freeze({
    "MANIFEST.json": "f7e987c3750277141dd256864ad024f2d88b43c9a1d0d2c019868171bffca220",
    "schemas/clinical-family-production-contract.md": "bf9ba02731d917390e92de4976772faad4e8114f2f74a8c662499c00f354619a",
    "scripts/validate-medical-authoring.mjs": "5c76783c31ccc21e2e05d1082c1f32cf9d5e44e7ea20d250d16f54e8acc8b443",
  }),
});

const provenance = await buildProvenance();
const serializedProvenance = `${JSON.stringify(provenance, null, 2)}\n`;
const provenanceSha256 = sha256(Buffer.from(serializedProvenance, "utf8"));

const archiveComparison = compareSource
  ? await assertExactSourceCopy(provenance.files)
  : null;

if (write) {
  await writeFile(provenancePath, serializedProvenance);
} else {
  const currentText = await readFile(provenancePath, "utf8");
  const current = JSON.parse(currentText);
  assert.deepEqual(
    current,
    provenance,
    "medical authoring review provenance is stale; run with --write",
  );
  assert.equal(
    currentText,
    serializedProvenance,
    "medical authoring review provenance serialization is stale; run with --write",
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
    provenanceId: "vetgeme-medical-production-authoring-review-source",
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
  assert.deepEqual(
    sourceFiles,
    files.map((file) => file.path),
    "tracked review input and extracted source file sets differ",
  );

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
    const buffer = await readFile(path.join(sourceRoot, ...relativeFile.split("/")));
    assert.equal(sha256(buffer), expectedHash, `${relativeFile}: key-file SHA-256 mismatch`);
  }

  return {
    entryCount: archiveInventory.entries.length,
    fileCount: archiveInventory.files.length,
  };
}

async function inspectArchiveEntries() {
  const [{ stdout: namesOutput }, { stdout: modesOutput }] = await Promise.all([
    execFileAsync("unzip", ["-Z1", sourceArchivePath], {
      encoding: "buffer",
      maxBuffer: 16 * 1024 * 1024,
    }),
    execFileAsync("zipinfo", ["-l", sourceArchivePath], {
      encoding: "buffer",
      maxBuffer: 16 * 1024 * 1024,
    }),
  ]);
  const entries = Buffer.from(namesOutput)
    .toString("utf8")
    .split(/\r?\n/u)
    .filter(Boolean);
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
    const pathParts = relativePath ? relativePath.split("/") : [];
    assert.equal(
      pathParts.every((part) => part && part !== "." && part !== ".."),
      true,
      `${archivePath}: archive path traversal is forbidden`,
    );
    const isDirectory = archivePath.endsWith("/");
    assert.equal(
      modes[index][0],
      isDirectory ? "d" : "-",
      `${archivePath}: symbolic links and unsupported archive entry types are forbidden`,
    );
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
  const directory = prefix
    ? path.join(root, ...prefix.split("/"))
    : root;
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
