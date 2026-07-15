import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const medicalApi = require("../generator/medical-catalog-v2.js");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const medicalPackRoot = path.join(projectRoot, "content/medical-packs/vetgeme-master-2026-07-14");
const tierPackRoot = path.join(projectRoot, "content/packs/tier-01-v2");
const handoffRoot = path.join(projectRoot, "handoff/vetgeme-master-package");
const provenancePath = path.join(medicalPackRoot, "provenance.json");
const compatibilityPath = path.join(medicalPackRoot, "compatibility/tier-01-v2.json");
const archiveIdentity = Object.freeze({
  path: "handoff/VetGEME-master-package-2026-07-14.zip",
  sha256: "4ef2670be3e286b5a76c851389ebd3038f874c3fff0062a3e0d976a4d36d7e7c",
  extractedFileCount: 106,
  extractedBytes: 4511414,
  keyFileHashes: {
    "PACKAGE_MANIFEST.json": "7c6f33dfb994480e185f05e0063946df66ca44eefb322b02b51fdeda6754148f",
    "medical/catalog/family-registry.json": "e9716b1bd4f4417e20a6aae0d5b19b0e17e4177b16bcd0d2ebfd64bb789dd64c",
    "systems/catalog/capability-registry.json": "16ff64c015a8edb302c15289540a4ed760cfc356d832bca31094f992b1da3c81"
  }
});
const write = process.argv.includes("--write");
const compareHandoff = process.argv.includes("--compare-handoff");
const unknownArguments = process.argv.slice(2).filter((argument) => !["--write", "--compare-handoff"].includes(argument));
if (unknownArguments.length) throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);

const provenance = await buildProvenance();
const compatibility = await buildCompatibility();

if (compareHandoff) await assertExactHandoffCopy(provenance.files);

if (write) {
  await mkdir(path.dirname(compatibilityPath), { recursive: true });
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  await writeFile(compatibilityPath, `${JSON.stringify(compatibility, null, 2)}\n`);
} else {
  await assertJsonFile(provenancePath, provenance, "medical provenance");
  await assertJsonFile(compatibilityPath, compatibility, "Tier 01 compatibility namespace");
}

console.log(JSON.stringify({
  status: "passed",
  mode: write ? "write" : "verify",
  exactHandoffCompared: compareHandoff,
  sourceFileCount: provenance.sourceFileCount,
  aggregateSha256: provenance.aggregateSha256,
  compatibilityCases: compatibility.caseCount,
  compatibilityComplaints: compatibility.cases.reduce((sum, entry) => sum + entry.complaints.length, 0)
}, null, 2));

async function buildProvenance() {
  const manifest = await readJson(path.join(medicalPackRoot, "PACKAGE_MANIFEST.json"));
  const sourceFiles = [
    "PACKAGE_MANIFEST.json",
    ...await listFiles(path.join(medicalPackRoot, "medical"), "medical")
  ].sort();
  const files = [];
  for (const relativeFile of sourceFiles) {
    const buffer = await readFile(path.join(medicalPackRoot, ...relativeFile.split("/")));
    files.push({
      path: relativeFile,
      originPath: relativeFile,
      bytes: buffer.length,
      sha256: sha256(buffer)
    });
  }
  const aggregate = createHash("sha256");
  for (const file of files) {
    aggregate.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`, "utf8");
  }
  return {
    schemaVersion: 1,
    provenanceId: "vetgeme-master-medical-source",
    packageId: manifest.packageId,
    packageVersion: manifest.packageVersion,
    originRoot: "handoff/vetgeme-master-package",
    archive: archiveIdentity,
    sourceFileCount: files.length,
    aggregateSha256: aggregate.digest("hex"),
    files
  };
}

async function buildCompatibility() {
  const manifest = await readJson(path.join(tierPackRoot, "clinical/tier-01/manifest.json"));
  const cases = await Promise.all(manifest.cases.map((entry) => (
    readJson(path.join(tierPackRoot, "clinical/tier-01", ...entry.file.split("/")))
  )));
  return medicalApi.buildCompatibilityDocument(cases, {
    namespaceVersion: "2026.07.15.1",
    contentPackId: manifest.contentPackId,
    contentPackVersion: manifest.contentPackVersion
  });
}

async function assertExactHandoffCopy(files) {
  for (const file of files) {
    const [canonical, handoff] = await Promise.all([
      readFile(path.join(medicalPackRoot, ...file.path.split("/"))),
      readFile(path.join(handoffRoot, ...file.originPath.split("/")))
    ]);
    assert.deepEqual(canonical, handoff, `${file.path}: canonical copy differs from handoff source`);
  }
  const archive = await readFile(path.join(projectRoot, ...archiveIdentity.path.split("/")));
  assert.equal(sha256(archive), archiveIdentity.sha256, "master archive SHA-256 mismatch");
  const extractedFiles = await listFiles(handoffRoot, "");
  let extractedBytes = 0;
  for (const relativeFile of extractedFiles) {
    extractedBytes += (await readFile(path.join(handoffRoot, ...relativeFile.split("/")))).length;
  }
  assert.equal(extractedFiles.length, archiveIdentity.extractedFileCount, "master archive extracted file count mismatch");
  assert.equal(extractedBytes, archiveIdentity.extractedBytes, "master archive extracted byte count mismatch");
  for (const [relativeFile, expectedHash] of Object.entries(archiveIdentity.keyFileHashes)) {
    const buffer = await readFile(path.join(handoffRoot, ...relativeFile.split("/")));
    assert.equal(sha256(buffer), expectedHash, `${relativeFile}: audited key-file SHA-256 mismatch`);
  }
}

async function assertJsonFile(file, expected, label) {
  const actual = await readJson(file);
  assert.deepEqual(actual, expected, `${label} is stale; run node scripts/refresh-medical-metadata-v2.mjs --write`);
}

async function listFiles(directory, prefix) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`${relative}: symbolic links are forbidden`);
    if (entry.isDirectory()) files.push(...await listFiles(absolute, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`${relative}: unsupported filesystem entry`);
  }
  return files;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
