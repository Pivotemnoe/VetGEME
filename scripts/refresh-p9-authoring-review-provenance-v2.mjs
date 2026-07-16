import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = "p9-visual-state-authoring-2026.07.16.2";
const reviewInputRoot = path.join(
  projectRoot,
  "content/review-inputs/vetgeme-p9-visual-state-authoring-2026.07.16.2",
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
  sha256: "049f554c54dd10ba6c2b141af92f9a327b09d715dd93d6b7b98874e8b5ea2284",
  zipEntryCount: 17,
  extractedFileCount: 12,
  extractedBytes: 134143,
  keyFileHashes: Object.freeze({
    "MANIFEST.json": "7f940f8ba3df745670fc5b4c262a6f79caf5db9edd4f3068a379f18ec4327515",
    "source/visual-policy.json": "8f8cebd0860fae8d21f71583d7039163a1fede43817cb443584baba8ba437499",
    "scripts/build-p9-package.mjs": "b3c6f4acd8981b26c2af7c70cc2d739c636c8e5818614e9da70f9e2d2c43ca48",
    "scripts/validate-p9-package.mjs": "cfad54dd0daf6232ac2fb62a9c102c32d5a76d8a8dc7fd6947d73388bf5c4878",
    "generated/room-visual-state-catalog.json": "25241dc75767be5b767149ed0337318650babc3b7cb99b4382e2ac4e47675b94",
    "generated/equipment-visual-state-catalog.json": "a8e3214c165c7350d27eae08c756f7719f48a19fa77c87607abb568e5b415e8b",
    "generated/staff-visual-state-catalog.json": "f346037f8dfa2079c537bae818abf707521ba1d1881f11a71b13be566e36d1aa",
    "generated/hud-data-contract.json": "1be394e082c13dc4007fda01407f8db03b85cc39b22a13485ceb02f10035c751",
    "reports/ASSET_GAPS.json": "82dd66514b2170419c911c697974fcb6e9398bffea12ac7e21e6b94f246c18ff",
    "reports/VALIDATION_REPORT.json": "cac4c0a0730bd1c800fb2400113e15bb7090712a35da90f2f71376c36d934129",
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
  assert.deepEqual(JSON.parse(currentText), provenance, "P9 .2 review provenance is stale; run with --write");
  assert.equal(currentText, serializedProvenance, "P9 .2 provenance serialization is stale; run with --write");
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
    provenanceId: "vetgeme-p9-visual-state-authoring-review-source",
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
  assert.equal(sha256(archive), archiveIdentity.sha256, "P9 .2 archive SHA-256 mismatch");
  const checksumTokens = checksumText.trim().split(/\s+/u);
  assert.equal(checksumTokens[0], archiveIdentity.sha256, "P9 .2 sidecar digest mismatch");
  assert.equal(checksumTokens.at(-1), archiveIdentity.path, "P9 .2 sidecar archive name mismatch");
  const archiveInventory = await inspectArchiveEntries();
  assert.deepEqual(
    archiveInventory.files.map((file) => file.relativePath),
    files.map((file) => file.path),
    "tracked P9 .2 source file set differs from archive",
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
    assert.deepEqual(tracked, original, `${file.path}: tracked P9 .2 review input differs from source`);
    assert.deepEqual(tracked, archived, `${file.path}: tracked P9 .2 review input differs from archive entry`);
  }
  assert.equal(files.length, archiveIdentity.extractedFileCount, "P9 .2 source file count mismatch");
  assert.equal(sourceBytes, archiveIdentity.extractedBytes, "P9 .2 source byte count mismatch");
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
  const modes = Buffer.from(modesOutput).toString("utf8").split(/\r?\n/u)
    .filter((line) => /^[bcdlps-][rwxstST-]{9}\s/u.test(line)).map((line) => line.slice(0, 10));
  assert.equal(entries.length, archiveIdentity.zipEntryCount, "P9 .2 archive entry count mismatch");
  assert.equal(modes.length, entries.length, "P9 .2 archive mode inventory count mismatch");
  assert.equal(new Set(entries).size, entries.length, "P9 .2 archive contains duplicate paths");
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
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
  assert.equal(files.length, archiveIdentity.extractedFileCount, "P9 .2 archive regular file count mismatch");
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
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
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
