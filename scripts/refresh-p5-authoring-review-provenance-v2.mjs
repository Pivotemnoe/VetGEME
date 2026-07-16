import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = "p5-production-authoring-2026.07.16.2";
const reviewInputRoot = path.join(
  projectRoot,
  "content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.2",
);
const sourceRoot = path.join(reviewInputRoot, "source");
const provenancePath = path.join(reviewInputRoot, "provenance.json");
const sourceArchivePath = path.join(projectRoot, `${sourceDirectory}.zip`);
const sourceArchiveChecksumPath = `${sourceArchivePath}.sha256`;
const sourceDirectoryPath = path.join(projectRoot, sourceDirectory);
const write = process.argv.includes("--write");
const compareSource = process.argv.includes("--compare-archive");
const unknownArguments = process.argv
  .slice(2)
  .filter((argument) => !["--write", "--compare-archive"].includes(argument));

if (unknownArguments.length > 0) throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);

const archiveIdentity = Object.freeze({
  path: `${sourceDirectory}.zip`,
  checksumPath: `${sourceDirectory}.zip.sha256`,
  sha256: "665183acc97096477dd9366b8116a65a11862e4919d02170278f8e97e241a7ab",
  zipEntryCount: 29,
  extractedFileCount: 23,
  extractedBytes: 4007080,
  keyFileHashes: Object.freeze({
    "MANIFEST.json": "25730b20dcc3d0ac840082f353ccea14d11c35aa9c107bf2cb52ccd21e3e69c6",
    "schemas/P5_AUTHORING_CONTRACT.md": "1a6f01f4917500e18ed8afc3c1f72e6be7156a18a62c556fc1a9bf40b07f9a04",
    "scripts/validate-p5-package.mjs": "1d4f65b5dd7b4ad71d8b787c43f01efaadf91264f993ca203570be413a2998f5",
    "scripts/author-v2-lifecycle-contracts.mjs": "9ee80f682a31082e8a1d28769429fa0efe4beb52c235fc25a2e32427be00235f",
    "source/p5-exact-capability-resource-map.json": "728bf70ad0705df08b61bbdd442171e97706461f4965a75014deba849683b6de",
    "source/p5-resource-lifecycle.json": "687abd42f8995ed43fbb4bc481474a104e818efc6d3203bb4075c83c1b7a60ff",
    "source/p5-handoff-contract.json": "8c82819147f2a93b1d53f0586fb60462b2ca0cb687162af455bcc781b2a73679",
    "generated/capability-operations-map.json": "9ffeba51794180f10645b52a3410e0bcdb31afb737526cfc18e07f5e3e0eb129",
    "generated/resource-lifecycle-catalog.json": "62b49f14ddb213157c6a59879d33aa3fd65500078c05f3fdbc3b3ab4c491cbc6",
    "reports/P5_V2_AUTHOR_DECISION_MATRIX.json": "73960687fda5198c13ff7e8e23b9b612d25072a2502f37b3d91a835a3438ca27",
    "reports/VALIDATION_REPORT.json": "73c5d21e84aa969da949da4699178c4d716383bf23d16249377106b5e58ef5a7",
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
  assert.deepEqual(JSON.parse(currentText), provenance, "P5 .2 review provenance is stale; run with --write");
  assert.equal(currentText, serializedProvenance, "P5 .2 provenance serialization is stale; run with --write");
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
      originPath: `${sourceDirectory}/${relativeFile}`,
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
    sourceDirectory,
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
  assert.equal(sha256(archive), archiveIdentity.sha256, "P5 .2 archive SHA-256 mismatch");
  const [checksum, checksumFile] = checksumText.trim().split(/\s+/u);
  assert.equal(checksum, archiveIdentity.sha256, "P5 .2 checksum sidecar digest mismatch");
  assert.equal(checksumFile, archiveIdentity.path, "P5 .2 checksum sidecar filename mismatch");

  const archiveInventory = await inspectArchiveEntries();
  assert.deepEqual(
    archiveInventory.files.map((entry) => entry.relativePath),
    files.map((file) => file.path),
    "tracked P5 .2 review input and archive file sets differ",
  );
  assert.deepEqual(await listFiles(sourceDirectoryPath), files.map((file) => file.path), "tracked and extracted P5 .2 file sets differ");

  let sourceBytes = 0;
  for (const [index, file] of files.entries()) {
    const archiveEntry = archiveInventory.files[index];
    const [tracked, original, archived] = await Promise.all([
      readFile(path.join(sourceRoot, ...file.path.split("/"))),
      readFile(path.join(sourceDirectoryPath, ...file.path.split("/"))),
      readArchiveEntry(archiveEntry.archivePath),
    ]);
    sourceBytes += original.length;
    assert.deepEqual(tracked, original, `${file.path}: tracked P5 .2 review input differs from source`);
    assert.deepEqual(tracked, archived, `${file.path}: tracked P5 .2 review input differs from archive entry`);
  }
  assert.equal(files.length, archiveIdentity.extractedFileCount, "P5 .2 source file count mismatch");
  assert.equal(sourceBytes, archiveIdentity.extractedBytes, "P5 .2 source byte count mismatch");
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
  assert.equal(entries.length, archiveIdentity.zipEntryCount, "P5 .2 archive entry count mismatch");
  assert.equal(modes.length, entries.length, "P5 .2 archive mode inventory count mismatch");
  assert.equal(new Set(entries).size, entries.length, "P5 .2 archive contains duplicate paths");
  const rootPrefix = `${sourceDirectory}/`;
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
  assert.equal(files.length, archiveIdentity.extractedFileCount, "P5 .2 archive regular file count mismatch");
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
