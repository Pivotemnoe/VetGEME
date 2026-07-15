import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectStaticRuntimeInventory } from "./static-runtime-inventory.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const syntaxRoots = [
  "generator",
  "legacy",
  "scripts",
  "systems",
  "tier-01-v2/scripts",
  "visual",
];
const syntaxFiles = ["campaign.js", "game.js"];

for (const relativeDirectory of syntaxRoots) {
  syntaxFiles.push(...await listJavaScriptFiles(path.join(root, relativeDirectory), relativeDirectory));
}
syntaxFiles.sort();

for (const file of syntaxFiles) {
  runNode(`syntax ${file}`, ["--check", file]);
}

const checks = [
  ["Tier 01 content validator", "scripts/validate-tier-01-content.mjs"],
  ["Tier 01 v2 content validator", "tier-01-v2/scripts/validate-tier-01-content-v2.mjs"],
  ["visual asset validator", "scripts/validate-visual-assets-v2.mjs"],
  ["legacy generator simulation (1000)", "scripts/simulate-generator-v1.js", "1000"],
  ["generator v2 simulation (1000)", "scripts/simulate-generator-v2.js", "1000"],
  ["demand director", "scripts/test-demand-director-v2.js"],
  ["generator v2 adapter", "scripts/test-v2-adapter.js"],
  ["generator v2 follow-ups", "scripts/test-v2-followups.js"],
  ["save isolation", "scripts/test-save-isolation.js"],
  ["game state save", "scripts/test-game-state-save.js"],
  ["compact save v2", "scripts/test-compact-save-v2.js"],
  ["multi-diagnosis v2", "scripts/test-multi-diagnosis-v2.js"],
  ["clinical visit state", "scripts/test-clinical-visit-state.js"],
  ["clinical decisions v2", "scripts/test-clinical-decisions-v2.js"],
  ["free clinical flow v2", "scripts/test-free-clinical-flow-v2.js"],
  ["diagnostic decisions v2", "scripts/test-diagnostic-decisions-v2.js"],
  ["campaign mechanics v2", "scripts/test-campaign-mechanics-v2.js"],
  ["introductory cases v2", "scripts/test-introductory-cases-v2.js"],
  ["longitudinal care v2", "scripts/test-longitudinal-care-v2.js"],
  ["guided consultation UI contract", "scripts/test-guided-consultation-ui.js"],
  ["diagnostic feedback UI contract", "scripts/test-diagnostic-feedback-ui.js"],
  ["renderer readiness v2", "scripts/test-renderer-readiness-v2.js"],
  ["renderer scene v2", "scripts/test-renderer-scene-v2.js"],
];

if (commandExists("git")) {
  checks.splice(3, 0, ["Docker build context provenance", "scripts/test-docker-build-context.mjs"]);
} else {
  console.log("\n[prebuild] Docker build context provenance skipped: git is unavailable in the isolated verifier");
}

for (const [label, ...args] of checks) runNode(label, args);

const inventory = await collectStaticRuntimeInventory(root);
console.log(
  `Docker prebuild checks passed: ${syntaxFiles.length} syntax files, ` +
    `${checks.length} validation/test commands, ${inventory.files.length} runtime files`,
);

async function listJavaScriptFiles(directory, relativeDirectory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativeEntry = `${relativeDirectory}/${entry.name}`;
    const absoluteEntry = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`${relativeEntry}: symbolic links are forbidden`);
    if (entry.isDirectory()) {
      files.push(...await listJavaScriptFiles(absoluteEntry, relativeEntry));
    } else if (entry.isFile() && /\.(?:js|mjs)$/u.test(entry.name)) {
      files.push(relativeEntry);
    }
  }
  return files;
}

function runNode(label, args) {
  console.log(`\n[prebuild] ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}
