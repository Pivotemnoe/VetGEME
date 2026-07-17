import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DOCKER_BUILD_INPUT_PATHS = Object.freeze([
  ".dockerignore",
  "Dockerfile",
  "compose.yaml",
  "package.json",
  "package-lock.json",
  "index.html",
  "styles.css",
  "campaign.js",
  "game.js",
  "generator",
  "systems",
  "legacy",
  "visual",
  "content/registry.json",
  "content/packs/tier-01-v2",
  "content/medical-packs/vetgeme-master-2026-07-14",
  "content/system-packs/vetgeme-master-2026-07-14/capability-registry.json",
  "content/activation-packs/pet-clinic-local-2026.07.17.1",
  "tier-01-v2/scripts",
  "art/runtime-v2",
  "assets/pet-clinic-full-activation-2026.07.17.1",
  "scripts",
  "docker/nginx/default.conf",
]);

export async function collectDockerBuildProvenance(root = PROJECT_ROOT) {
  const resolvedRoot = path.resolve(root);
  const revision = git(resolvedRoot, ["rev-parse", "HEAD"]);
  const buildDate = git(resolvedRoot, ["show", "-s", "--format=%cI", "HEAD"]);
  const status = git(resolvedRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ...DOCKER_BUILD_INPUT_PATHS,
  ], { allowEmpty: true });
  const trackedFiles = git(resolvedRoot, [
    "ls-files",
    "--cached",
    "--",
    ...DOCKER_BUILD_INPUT_PATHS,
  ], { allowEmpty: true })
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean)
    .sort();
  const entries = await collectFilesystemEntries(resolvedRoot);
  const files = entries.filter((entry) => entry.type === "file").map((entry) => entry.path);

  if (files.length === 0) throw new Error("Docker build input inventory is empty");

  const digest = createHash("sha256");
  for (const entry of entries) {
    digest.update(`${entry.path}\0${entry.type}\0${entry.mode}\0`, "utf8");
    if (entry.type === "file") {
      const buffer = await readFile(path.join(resolvedRoot, ...entry.path.split("/")));
      digest.update(`${buffer.length}\0`, "utf8");
      digest.update(buffer);
      digest.update("\0", "utf8");
    }
  }

  const contextSha256 = digest.digest("hex");
  const dirty = status.length > 0 || !sameSet(files, trackedFiles);
  const rollbackTag = dirty ? `dirty-${contextSha256.slice(0, 12)}` : revision.slice(0, 12);

  return Object.freeze({
    revision,
    buildDate,
    contextSha256,
    dirty,
    rollbackTag,
    inputFileCount: files.length,
    inputEntryCount: entries.length,
  });
}

export function assertSameDockerBuildProvenance(before, after) {
  for (const field of ["revision", "contextSha256", "dirty", "inputFileCount", "inputEntryCount"]) {
    if (before[field] !== after[field]) {
      throw new Error(
        `Docker build inputs changed during the build (${field}: ${before[field]} -> ${after[field]})`,
      );
    }
  }
}

async function collectFilesystemEntries(root) {
  const entries = new Map();

  async function visit(relativePath) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink()) throw new Error(`${relativePath}: Docker build symlinks are forbidden`);
    const mode = (stats.mode & 0o777).toString(8).padStart(3, "0");
    if (stats.isFile()) {
      entries.set(relativePath, { path: relativePath, type: "file", mode });
      return;
    }
    if (!stats.isDirectory()) {
      throw new Error(`${relativePath}: unsupported Docker build filesystem entry`);
    }
    entries.set(relativePath, { path: relativePath, type: "directory", mode });
    const children = await readdir(absolutePath, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      await visit(`${relativePath}/${child.name}`);
    }
  }

  for (const relativePath of DOCKER_BUILD_INPUT_PATHS) await visit(relativePath);
  return [...entries.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function sameSet(left, right) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function git(root, args, { allowEmpty = false } = {}) {
  const value = execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!allowEmpty && value.length === 0) {
    throw new Error(`git ${args.join(" ")} returned no output`);
  }
  return value;
}
