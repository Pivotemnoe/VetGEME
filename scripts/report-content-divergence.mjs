import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const legacyRoot = path.join(projectRoot, "legacy/content/tier-01-v1-review");
const canonicalRoot = path.join(projectRoot, "content/packs/tier-01-v2");
const outputFlag = process.argv.indexOf("--write");
const summaryOnly = process.argv.includes("--summary");
const outputPath = outputFlag >= 0
  ? path.resolve(projectRoot, process.argv[outputFlag + 1] || "reports/content-divergence-p1.json")
  : null;

function jsonFiles(root) {
  function visit(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return visit(absolute);
      return entry.name.endsWith(".json") ? [absolute] : [];
    });
  }
  return visit(root).map((absolute) => path.relative(root, absolute).split(path.sep).join("/")).sort();
}

function digest(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const legacyFiles = jsonFiles(legacyRoot);
const canonicalFiles = jsonFiles(canonicalRoot);
const legacySet = new Set(legacyFiles);
const canonicalSet = new Set(canonicalFiles);
const sharedPaths = legacyFiles.filter((relative) => canonicalSet.has(relative));
const legacyOnlyPaths = legacyFiles.filter((relative) => !canonicalSet.has(relative));
const canonicalOnlyPaths = canonicalFiles.filter((relative) => !legacySet.has(relative));
const shared = sharedPaths.map((relative) => {
  const legacySha256 = digest(path.join(legacyRoot, relative));
  const canonicalSha256 = digest(path.join(canonicalRoot, relative));
  return {
    path: relative,
    identical: legacySha256 === canonicalSha256,
    legacySha256,
    canonicalSha256
  };
});
const identicalSharedPaths = shared.filter((entry) => entry.identical).map((entry) => entry.path);
const differingSharedFiles = shared.filter((entry) => !entry.identical);

const report = {
  schemaVersion: 1,
  reportId: "p1-canonical-content-divergence",
  comparedRoots: {
    frozenLegacy: "legacy/content/tier-01-v1-review",
    canonical: "content/packs/tier-01-v2"
  },
  summary: {
    legacyJsonFiles: legacyFiles.length,
    canonicalJsonFiles: canonicalFiles.length,
    sharedPaths: sharedPaths.length,
    differingSharedPaths: differingSharedFiles.length,
    identicalSharedPaths: identicalSharedPaths.length,
    legacyOnlyPaths: legacyOnlyPaths.length,
    canonicalOnlyPaths: canonicalOnlyPaths.length,
    shortForm: `${differingSharedFiles.length}/${identicalSharedPaths.length}/${canonicalOnlyPaths.length}`
  },
  interpretation: "shortForm = differing shared paths / identical shared paths / canonical-only paths",
  legacyOnlyPaths,
  canonicalOnlyPaths,
  identicalSharedPaths,
  differingSharedFiles
};

const expected = {
  legacyJsonFiles: 44,
  canonicalJsonFiles: 56,
  sharedPaths: 44,
  differingSharedPaths: 44,
  identicalSharedPaths: 0,
  legacyOnlyPaths: 0,
  canonicalOnlyPaths: 12,
  shortForm: "44/0/12"
};
for (const [key, value] of Object.entries(expected)) {
  if (report.summary[key] !== value) {
    throw new Error(`Unexpected content divergence ${key}: expected ${value}, got ${report.summary[key]}`);
  }
}

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`Content divergence report written: ${path.relative(projectRoot, outputPath)}`);
}
if (summaryOnly) {
  console.log(JSON.stringify({ status: "passed", ...report.summary }));
} else {
  console.log(serialized.trimEnd());
}
