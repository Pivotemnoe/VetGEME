import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageVersion = "2026.07.16.2";
const reviewInputRoot = path.join(
  projectRoot,
  "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.2",
);
const sourceRoot = path.join(reviewInputRoot, "source");
const provenancePath = path.join(reviewInputRoot, "provenance.json");
const sourceDirectory = "operational-production-authoring-2026.07.16.2";
const extractedSourceRoot = path.join(projectRoot, sourceDirectory);
const sourceArchivePath = path.join(projectRoot, `${sourceDirectory}.zip`);
const sourceArchiveChecksumPath = `${sourceArchivePath}.sha256`;
const write = process.argv.includes("--write");
const compareArchive = process.argv.includes("--compare-archive");
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => !["--write", "--compare-archive"].includes(argument));

if (unknownArguments.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
}

const archiveIdentity = Object.freeze({
  path: `${sourceDirectory}.zip`,
  checksumPath: `${sourceDirectory}.zip.sha256`,
  sha256: "0f271166547eb9dfa08f5bc195d6e5dba123f267353d2f09fbe7786b9bfb46f3",
  zipEntryCount: 46,
  extractedFileCount: 35,
  extractedBytes: 6305058,
  keyFileHashes: Object.freeze({
    "MANIFEST.json": "7dc95772aaef38f9c29ae76a14857d9ac81958c4fd791f0d4653c8c76eb0fe5b",
    "schemas/OPERATIONAL_PACKAGE_CONTRACT.md": "14b9fcc6b7f0ffb81c72e28dc2c555269c3c5a2cae6f1ca483bb91bc609e73df",
    "scripts/validate-operational-package.mjs": "7d6d260128fc89ef53a661fd76fa8025fc8a54c9bcdf6d498feef82c9eba5c9d",
    "source/p3-explicit-research-routes.json": "fbda3ed7817aa93bf3f73274b53dbb3acf554ab58b29139617d0bc3535923552",
    "source/p4-explicit-behavior-crosswalk.json": "6869cd265bcfd699810388558f77aeed86c7dfcd5cb188db640c99f74e4ea818",
    "source/p4-operational-requirements.json": "a47b9216f03fa481643d0561abc615fceb1ed85a228a1078d8fecc4406931c34",
    "source/p6-explicit-capability-economics.json": "778ba92a5e4df1535974ca5385f17af15b8ab6cca6a5a5169ff0ac226ac0359f",
    "source/p6-p5-exact-resource-crosswalk.json": "61a44ff5096c2077635e26b9785a7cbeea0a525b4d6e0f9d395bc12d9f837598",
    "source/p7-evidence-resolver.json": "ddeeba9a7bbe73770b051cfaf21e9dc2231c664ded2247c8da5fb0f8eac6bce5",
    "generated/p7/director-catalog.json": "c0ca543cf0d4f86074dbf6e2f1cb18497af0e6d593cae706061ae028fb479887",
  }),
});

const provenance = await buildProvenance();
const serializedProvenance = `${JSON.stringify(provenance, null, 2)}\n`;
const provenanceSha256 = sha256(Buffer.from(serializedProvenance, "utf8"));
const archiveComparison = compareArchive
  ? await assertExactArchiveAndExtractedCopy(provenance.files)
  : null;

if (write) {
  await writeFile(provenancePath, serializedProvenance);
} else {
  const currentText = await readFile(provenancePath, "utf8");
  assert.deepEqual(
    JSON.parse(currentText),
    provenance,
    "operational authoring .2 review provenance is stale; run with --write",
  );
  assert.equal(
    currentText,
    serializedProvenance,
    "operational authoring .2 review provenance serialization is stale; run with --write",
  );
}

console.log(JSON.stringify({
  status: "passed",
  mode: write ? "write" : "verify",
  exactArchiveCompared: compareArchive,
  archiveEntryCountVerified: archiveComparison?.entryCount || 0,
  archiveFilesCompared: archiveComparison?.fileCount || 0,
  extractedFilesCompared: archiveComparison?.extractedFileCount || 0,
  sourceFileCount: provenance.sourceFileCount,
  sourceBytes: provenance.sourceBytes,
  provenanceSha256,
  aggregateSha256: provenance.aggregateSha256,
  archiveSha256: provenance.archive.sha256,
}, null, 2));

async function buildProvenance() {
  const manifest = JSON.parse(await readFile(path.join(sourceRoot, "MANIFEST.json"), "utf8"));
  assert.equal(manifest.packageId, "vetgeme-operational-production-authoring", "package ID mismatch");
  assert.equal(manifest.packageVersion, packageVersion, "package version mismatch");

  const sourceFiles = await listFiles(sourceRoot);
  const files = [];
  for (const relativeFile of sourceFiles) {
    const buffer = await readFile(path.join(sourceRoot, ...relativeFile.split("/")));
    files.push({
      path: relativeFile,
      originPath: `${sourceDirectory}/${relativeFile}`,
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
    sourceDirectory,
    archive: archiveIdentity,
    sourceFileCount: files.length,
    sourceBytes: files.reduce((total, file) => total + file.bytes, 0),
    aggregateSha256: aggregate.digest("hex"),
    files,
  };
}

async function assertExactArchiveAndExtractedCopy(files) {
  const [archive, checksumText] = await Promise.all([
    readFile(sourceArchivePath),
    readFile(sourceArchiveChecksumPath, "utf8"),
  ]);
  assert.equal(sha256(archive), archiveIdentity.sha256, "operational .2 archive SHA-256 mismatch");
  assert.equal(
    checksumText.trim(),
    `${archiveIdentity.sha256}  ${archiveIdentity.path}`,
    "operational .2 archive sidecar checksum mismatch",
  );

  const archiveInventory = await inspectArchiveEntries();
  const trackedPaths = files.map((file) => file.path);
  const extractedPaths = await listFiles(extractedSourceRoot);
  assert.deepEqual(
    archiveInventory.files.map((entry) => entry.relativePath),
    trackedPaths,
    "tracked operational .2 source file set differs from archive",
  );
  assert.deepEqual(
    extractedPaths,
    trackedPaths,
    "tracked operational .2 source file set differs from extracted source",
  );

  let extractedBytes = 0;
  for (const [index, file] of files.entries()) {
    const archiveEntry = archiveInventory.files[index];
    const [tracked, extracted, archived] = await Promise.all([
      readFile(path.join(sourceRoot, ...file.path.split("/"))),
      readFile(path.join(extractedSourceRoot, ...file.path.split("/"))),
      readArchiveEntry(archiveEntry.archivePath),
    ]);
    extractedBytes += extracted.length;
    assert.deepEqual(tracked, extracted, `${file.path}: tracked source differs from extracted source`);
    assert.deepEqual(tracked, archived, `${file.path}: tracked source differs from archive entry`);
  }

  assert.equal(files.length, archiveIdentity.extractedFileCount, "operational .2 source file count mismatch");
  assert.equal(extractedBytes, archiveIdentity.extractedBytes, "operational .2 source byte count mismatch");
  for (const [relativeFile, expectedHash] of Object.entries(archiveIdentity.keyFileHashes)) {
    assert.equal(
      sha256(await readFile(path.join(sourceRoot, ...relativeFile.split("/")))),
      expectedHash,
      `${relativeFile}: operational .2 key-file SHA-256 mismatch`,
    );
  }

  return {
    entryCount: archiveInventory.entries.length,
    fileCount: archiveInventory.files.length,
    extractedFileCount: extractedPaths.length,
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
  const entries = Buffer.from(namesOutput).toString("utf8").split(/\r?\n/u).filter(Boolean);
  const modes = Buffer.from(modesOutput)
    .toString("utf8")
    .split(/\r?\n/u)
    .filter((line) => /^[bcdlps-][rwxstST-]{9}\s/u.test(line))
    .map((line) => line.slice(0, 10));
  assert.equal(entries.length, archiveIdentity.zipEntryCount, "operational .2 archive entry count mismatch");
  assert.equal(modes.length, entries.length, "operational .2 archive mode inventory count mismatch");
  assert.equal(new Set(entries).size, entries.length, "operational .2 archive contains duplicate paths");

  const rootPrefix = `${sourceDirectory}/`;
  const files = [];
  entries.forEach((archivePath, index) => {
    assert.equal(archivePath.includes("\0"), false, `${archivePath}: archive path contains NUL`);
    assert.equal(archivePath.includes("\\"), false, `${archivePath}: archive path contains backslash`);
    assert.equal(archivePath.startsWith(rootPrefix), true, `${archivePath}: archive path escapes package root`);
    const relativePath = archivePath.slice(rootPrefix.length).replace(/\/$/u, "");
    const parts = relativePath ? relativePath.split("/") : [];
    assert.equal(
      parts.every((part) => part && part !== "." && part !== ".."),
      true,
      `${archivePath}: archive path traversal is forbidden`,
    );
    const isDirectory = archivePath.endsWith("/");
    assert.equal(modes[index][0], isDirectory ? "d" : "-", `${archivePath}: unsupported archive entry type`);
    if (!isDirectory) files.push({ archivePath, relativePath });
  });
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  assert.equal(files.length, archiveIdentity.extractedFileCount, "operational .2 archive file count mismatch");
  return { entries, files };
}

async function readArchiveEntry(archivePath) {
  const { stdout } = await execFileAsync("unzip", ["-p", sourceArchivePath, archivePath], {
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
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
