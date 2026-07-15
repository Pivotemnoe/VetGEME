import { copyFile, mkdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import {
  PROJECT_ROOT,
  collectStaticRuntimeInventory,
  verifyStaticRuntimeTree,
} from "./static-runtime-inventory.mjs";

try {
  const requestedOutput = parseOutputArgument(process.argv.slice(2));
  const outputRoot = await resolveSafeOutput(requestedOutput);
  const inventory = await collectStaticRuntimeInventory(PROJECT_ROOT);

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  for (const relativeFile of inventory.files) {
    const source = path.join(PROJECT_ROOT, ...relativeFile.split("/"));
    const destination = path.join(outputRoot, ...relativeFile.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }

  const result = await verifyStaticRuntimeTree(outputRoot, inventory, {
    rejectUnexpected: true,
    verifyAssetHashes: true,
    verifyFileHashes: true,
  });
  console.log(
    `Static distribution built: ${outputRoot} ` +
      `(${result.fileCount} files and ${result.verifiedFileHashes} SHA-256 hashes verified)`,
  );
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}

function parseOutputArgument(args) {
  let output = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--output") {
      output = args[index + 1];
      index += 1;
    } else if (argument.startsWith("--output=")) {
      output = argument.slice("--output=".length);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!output) throw new Error("Usage: node scripts/build-static-dist.mjs --output <directory>");
  return output;
}

async function resolveSafeOutput(requestedOutput) {
  const resolved = path.resolve(PROJECT_ROOT, requestedOutput);
  assertSafeResolvedOutput(resolved);

  await mkdir(path.dirname(resolved), { recursive: true });
  const canonicalParent = await realpath(path.dirname(resolved));
  const canonicalOutput = path.join(canonicalParent, path.basename(resolved));
  assertSafeResolvedOutput(canonicalOutput);
  return canonicalOutput;
}

function assertSafeResolvedOutput(resolved) {
  if (resolved === path.parse(resolved).root) throw new Error("Refusing to clean a filesystem root");
  if (resolved === PROJECT_ROOT || isInside(resolved, PROJECT_ROOT)) {
    throw new Error("Refusing to clean the project root or one of its parents");
  }

  const relativeToProject = path.relative(PROJECT_ROOT, resolved);
  if (!relativeToProject.startsWith(`..${path.sep}`) && relativeToProject !== "..") {
    const firstSegment = relativeToProject.split(path.sep)[0];
    const protectedRoots = new Set([
      ".git",
      "art",
      "artifacts",
      "content",
      "docs",
      "generator",
      "handoff",
      "legacy",
      "reports",
      "scripts",
      "systems",
      "tier-01-v2",
      "visual",
    ]);
    if (protectedRoots.has(firstSegment)) {
      throw new Error(`Refusing to clean protected project path: ${relativeToProject}`);
    }
  }
}

function isInside(candidate, parent) {
  const relative = path.relative(candidate, parent);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== "..";
}
