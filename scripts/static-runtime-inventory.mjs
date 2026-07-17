import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const EXPECTED_RUNTIME_FILE_COUNT = 202;
export const EXPECTED_RUNTIME_GROUP_COUNTS = Object.freeze({
  base: 37,
  canonicalContent: 100,
  visual: 65,
});

const EXPECTED_BASE_RUNTIME_FILES = Object.freeze([
  "campaign.js",
  "game.js",
  "generator/atomic-save-migration.js",
  "generator/compact-visit-v2.js",
  "generator/content-loader-v2.js",
  "generator/demand-director-v2.js",
  "generator/game-adapter-v2.js",
  "generator/game-state-save.js",
  "generator/generator-mode.js",
  "generator/generator-v2.js",
  "generator/medical-catalog-v2.js",
  "generator/multi-diagnosis-engine-v2.js",
  "generator/save-namespaces.js",
  "index.html",
  "legacy/campaign-v1.js",
  "legacy/generator-v1.js",
  "styles.css",
  "systems/campaign-mechanics-v2.js",
  "systems/campaign-director-v7.js",
  "systems/capability-registry-v3.js",
  "systems/async-events-v3.js",
  "systems/clinical-decisions-v2.js",
  "systems/clinical-visit-state.js",
  "systems/device-queue-v3.js",
  "systems/diagnostic-decisions-v2.js",
  "systems/economy-runtime-v6.js",
  "systems/free-clinical-flow-v2.js",
  "systems/game-mode-v11.js",
  "systems/identity-behavior-v4.js",
  "systems/identity-runtime-v4.js",
  "systems/longitudinal-care-v2.js",
  "systems/operations-runtime-v5.js",
  "systems/referral-orders-v3.js",
  "systems/reputation-runtime-v6.js",
  "systems/resource-scheduler-v5.js",
  "systems/research-orders-v3.js",
  "visual/clinic-renderer-v2.js",
]);

const CONTENT_REGISTRY = "content/registry.json";
const TIER_CONTENT_ROOT = "content/packs/tier-01-v2";
const TIER_CONTENT_PACK_ID = "tier-01-v2";
const TIER_CONTENT_PACK_VERSION = "2026.07.12.2";
const EXPECTED_TIER_PACK_RUNTIME_JSON_COUNT = 55;
const MEDICAL_CONTENT_ROOT = "content/medical-packs/vetgeme-master-2026-07-14";
const EXPECTED_MEDICAL_PACK_RUNTIME_JSON_COUNT = 43;
const CAPABILITY_CONTENT_ROOT = "content/system-packs/vetgeme-master-2026-07-14";
const CAPABILITY_REGISTRY_FILE = `${CAPABILITY_CONTENT_ROOT}/capability-registry.json`;
const EXPECTED_CAPABILITY_PACK_RUNTIME_JSON_COUNT = 1;
const VISUAL_MANIFEST = "art/runtime-v2/manifest.json";
const VISUAL_LAYOUT = "art/runtime-v2/scene-layout.json";
const VISUAL_ASSET_ROOT = "art/runtime-v2/assets";

export async function collectStaticRuntimeInventory(root = PROJECT_ROOT) {
  const resolvedRoot = path.resolve(root);
  const base = await collectBaseRuntimeFiles(resolvedRoot);
  const canonicalContent = await collectCanonicalContentFiles(resolvedRoot);
  const { files: visual, assetHashes } = await collectVisualFiles(resolvedRoot);
  const files = [...base, ...canonicalContent, ...visual].sort();

  assertUniqueFiles(files, "runtime inventory");
  assertCount("base runtime", base, EXPECTED_RUNTIME_GROUP_COUNTS.base);
  assertCount(
    "canonical content runtime JSON",
    canonicalContent,
    EXPECTED_RUNTIME_GROUP_COUNTS.canonicalContent,
  );
  assertCount("visual runtime", visual, EXPECTED_RUNTIME_GROUP_COUNTS.visual);
  assertCount("complete runtime", files, EXPECTED_RUNTIME_FILE_COUNT);
  const fileHashes = await hashRuntimeFiles(resolvedRoot, files);

  const inventory = Object.freeze({
    files: Object.freeze(files),
    groups: Object.freeze({
      base: Object.freeze(base),
      canonicalContent: Object.freeze(canonicalContent),
      visual: Object.freeze(visual),
    }),
    assetHashes: Object.freeze(assetHashes),
    fileHashes: Object.freeze(fileHashes),
  });

  await verifyStaticRuntimeTree(resolvedRoot, inventory, {
    rejectUnexpected: false,
    verifyAssetHashes: true,
    verifyFileHashes: true,
  });
  return inventory;
}

export async function verifyStaticRuntimeTree(
  root,
  inventory,
  { rejectUnexpected = true, verifyAssetHashes = true, verifyFileHashes = true } = {},
) {
  const resolvedRoot = path.resolve(root);
  const expectedFiles = new Set(inventory?.files || []);
  const errors = [];

  if (expectedFiles.size !== EXPECTED_RUNTIME_FILE_COUNT) {
    errors.push(
      `inventory contains ${expectedFiles.size} unique files; expected ${EXPECTED_RUNTIME_FILE_COUNT}`,
    );
  }

  for (const relativeFile of expectedFiles) {
    try {
      await assertRegularFileWithoutSymlinks(resolvedRoot, relativeFile);
    } catch (error) {
      errors.push(error.message);
    }
  }

  const assetHashes = inventory?.assetHashes || {};
  if (verifyAssetHashes) {
    for (const [relativeFile, expectedHash] of Object.entries(assetHashes)) {
      try {
        const buffer = await readFile(path.join(resolvedRoot, ...relativeFile.split("/")));
        const actualHash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
        if (actualHash !== expectedHash) {
          errors.push(`${relativeFile}: SHA-256 ${actualHash}, manifest ${expectedHash}`);
        }
      } catch (error) {
        errors.push(`${relativeFile}: hash verification failed (${error.message})`);
      }
    }
  }

  const fileHashes = inventory?.fileHashes || {};
  if (verifyFileHashes) {
    if (Object.keys(fileHashes).length !== expectedFiles.size) {
      errors.push(
        `inventory contains ${Object.keys(fileHashes).length} file hashes; ` +
          `expected ${expectedFiles.size}`,
      );
    }
    for (const relativeFile of expectedFiles) {
      const expectedHash = fileHashes[relativeFile];
      if (!/^[a-f0-9]{64}$/u.test(expectedHash || "")) {
        errors.push(`${relativeFile}: missing full SHA-256 runtime hash`);
        continue;
      }
      try {
        const buffer = await readFile(path.join(resolvedRoot, ...relativeFile.split("/")));
        const actualHash = sha256(buffer);
        if (actualHash !== expectedHash) {
          errors.push(`${relativeFile}: SHA-256 ${actualHash}, expected ${expectedHash}`);
        }
      } catch (error) {
        errors.push(`${relativeFile}: runtime hash verification failed (${error.message})`);
      }
    }
  }

  let actualFiles = null;
  if (rejectUnexpected) {
    try {
      const actualTree = await listTreeEntries(resolvedRoot);
      actualFiles = actualTree.files;
      const actualSet = new Set(actualFiles);
      const expectedDirectories = expectedRuntimeDirectories(expectedFiles);
      for (const relativeFile of expectedFiles) {
        if (!actualSet.has(relativeFile)) errors.push(`${relativeFile}: missing from runtime tree`);
      }
      for (const relativeFile of actualFiles) {
        if (!expectedFiles.has(relativeFile)) errors.push(`${relativeFile}: unexpected runtime file`);
      }
      for (const relativeDirectory of actualTree.directories) {
        if (!expectedDirectories.has(relativeDirectory)) {
          errors.push(`${relativeDirectory}/: unexpected runtime directory`);
        }
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Static runtime verification failed:\n- ${errors.join("\n- ")}`);
  }

  return Object.freeze({
    fileCount: expectedFiles.size,
    actualFileCount: actualFiles?.length ?? expectedFiles.size,
    verifiedAssetHashes: verifyAssetHashes ? Object.keys(assetHashes).length : 0,
    verifiedFileHashes: verifyFileHashes ? Object.keys(fileHashes).length : 0,
  });
}

async function hashRuntimeFiles(root, files) {
  const hashes = {};
  for (const relativeFile of files) {
    const buffer = await readFile(path.join(root, ...relativeFile.split("/")));
    hashes[relativeFile] = sha256(buffer);
  }
  return hashes;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function collectBaseRuntimeFiles(root) {
  const indexText = await readFile(path.join(root, "index.html"), "utf8");
  const linkedFiles = new Set(["index.html"]);

  for (const match of indexText.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/giu)) {
    linkedFiles.add(runtimePathFromUrl(match[1], "index.html script"));
  }
  for (const match of indexText.matchAll(/<link\b[^>]*>/giu)) {
    const tag = match[0];
    if (!/\brel\s*=\s*["'][^"']*\bstylesheet\b[^"']*["']/iu.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1];
    if (!href) throw new Error("index.html stylesheet link has no href");
    linkedFiles.add(runtimePathFromUrl(href, "index.html stylesheet"));
  }

  const generatorModePath = path.join(root, "generator/generator-mode.js");
  const generatorModeText = await readFile(generatorModePath, "utf8");
  for (const match of generatorModeText.matchAll(/\bfetch\(\s*["'](legacy\/[^"']+)["']/gu)) {
    linkedFiles.add(runtimePathFromUrl(match[1], "legacy loader"));
  }

  const derived = [...linkedFiles].sort();
  assertExactSet("base runtime", derived, EXPECTED_BASE_RUNTIME_FILES);
  return derived;
}

async function collectCanonicalContentFiles(root) {
  await assertRegularFileWithoutSymlinks(root, CONTENT_REGISTRY);
  await readJson(path.join(root, CONTENT_REGISTRY), CONTENT_REGISTRY);

  const loaderPath = path.join(root, "generator/content-loader-v2.js");
  await assertRegularFileWithoutSymlinks(root, "generator/content-loader-v2.js");
  const require = createRequire(import.meta.url);
  const resolvedLoader = require.resolve(loaderPath);
  delete require.cache[resolvedLoader];
  const loader = require(resolvedLoader);
  if (typeof loader.loadRegisteredCatalog !== "function") {
    throw new Error("generator/content-loader-v2.js does not expose loadRegisteredCatalog()");
  }

  const referencedFiles = new Set();
  await loader.loadRegisteredCatalog(async (requestedPath) => {
    const relativeFile = normalizeRuntimePath(requestedPath, "canonical content loader");
    const isRegistry = relativeFile === CONTENT_REGISTRY;
    const isTierPackJson = (
      relativeFile.startsWith(`${TIER_CONTENT_ROOT}/`) && relativeFile.endsWith(".json")
    );
    const isMedicalPackJson = (
      relativeFile.startsWith(`${MEDICAL_CONTENT_ROOT}/`) && relativeFile.endsWith(".json")
    );
    const isCapabilityPackJson = relativeFile === CAPABILITY_REGISTRY_FILE;
    if (!isRegistry && !isTierPackJson && !isMedicalPackJson && !isCapabilityPackJson) {
      throw new Error(`Tier 01 v2 loader referenced an unexpected path: ${relativeFile}`);
    }
    referencedFiles.add(relativeFile);
    return readJson(path.join(root, ...relativeFile.split("/")), relativeFile);
  }, {
    packId: TIER_CONTENT_PACK_ID,
    packVersion: TIER_CONTENT_PACK_VERSION,
    mode: "tier-01-v2",
    context: "review",
  });

  if (!referencedFiles.has(CONTENT_REGISTRY)) {
    throw new Error("canonical content loader did not request content/registry.json");
  }

  assertCount(
    "Tier 01 v2 pack runtime JSON",
    [...referencedFiles].filter((relativeFile) => relativeFile.startsWith(`${TIER_CONTENT_ROOT}/`)),
    EXPECTED_TIER_PACK_RUNTIME_JSON_COUNT,
  );
  assertCount(
    "medical review pack runtime JSON",
    [...referencedFiles].filter((relativeFile) => relativeFile.startsWith(`${MEDICAL_CONTENT_ROOT}/`)),
    EXPECTED_MEDICAL_PACK_RUNTIME_JSON_COUNT,
  );
  assertCount(
    "capability pack runtime JSON",
    [...referencedFiles].filter((relativeFile) => relativeFile.startsWith(`${CAPABILITY_CONTENT_ROOT}/`)),
    EXPECTED_CAPABILITY_PACK_RUNTIME_JSON_COUNT,
  );
  return [...referencedFiles].sort();
}

async function collectVisualFiles(root) {
  const manifest = await readJson(path.join(root, VISUAL_MANIFEST), VISUAL_MANIFEST);
  await readJson(path.join(root, VISUAL_LAYOUT), VISUAL_LAYOUT);
  if (!Array.isArray(manifest.assets)) {
    throw new Error(`${VISUAL_MANIFEST}: assets must be an array`);
  }
  assertCount("visual manifest assets", manifest.assets, 63);

  const assetIds = new Set();
  const assetFiles = [];
  const assetHashes = {};
  for (const asset of manifest.assets) {
    if (typeof asset?.id !== "string" || asset.id.length === 0 || assetIds.has(asset.id)) {
      throw new Error(`${VISUAL_MANIFEST}: missing or duplicate asset id ${asset?.id || "<empty>"}`);
    }
    assetIds.add(asset.id);
    const relativeFile = normalizeRuntimePath(asset.file, `visual asset ${asset.id}`);
    if (!relativeFile.startsWith(`${VISUAL_ASSET_ROOT}/`) || !relativeFile.endsWith(".png")) {
      throw new Error(`${asset.id}: unexpected visual asset path ${relativeFile}`);
    }
    if (!/^[a-f0-9]{16}$/u.test(asset.hash || "")) {
      throw new Error(`${asset.id}: manifest hash must be the first 16 SHA-256 hex characters`);
    }
    assetFiles.push(relativeFile);
    assetHashes[relativeFile] = asset.hash;
  }
  assertUniqueFiles(assetFiles, "visual manifest assets");

  return {
    files: [VISUAL_MANIFEST, VISUAL_LAYOUT, ...assetFiles].sort(),
    assetHashes,
  };
}

async function assertRegularFileWithoutSymlinks(root, relativeFile) {
  const safeRelativeFile = normalizeRuntimePath(relativeFile, "runtime inventory");
  let current = root;
  for (const segment of safeRelativeFile.split("/")) {
    current = path.join(current, segment);
    let stats;
    try {
      stats = await lstat(current);
    } catch (error) {
      if (error.code === "ENOENT") throw new Error(`${safeRelativeFile}: missing runtime file`);
      throw new Error(`${safeRelativeFile}: cannot inspect path (${error.message})`);
    }
    if (stats.isSymbolicLink()) throw new Error(`${safeRelativeFile}: symbolic links are forbidden`);
  }
  const stats = await lstat(current);
  if (!stats.isFile()) throw new Error(`${safeRelativeFile}: expected a regular file`);
}

async function listTreeEntries(root, { prefix = "" } = {}) {
  const files = [];
  const directories = [];

  async function visit(directory, relativeDirectory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      throw new Error(`${prefix || root}: cannot read runtime tree (${error.message})`);
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativeEntry = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const absoluteEntry = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`${joinPrefix(prefix, relativeEntry)}: symbolic links are forbidden`);
      }
      if (entry.isDirectory()) {
        directories.push(joinPrefix(prefix, relativeEntry));
        await visit(absoluteEntry, relativeEntry);
      } else if (entry.isFile()) {
        files.push(joinPrefix(prefix, relativeEntry));
      } else {
        throw new Error(`${joinPrefix(prefix, relativeEntry)}: unsupported filesystem entry`);
      }
    }
  }

  await visit(root, "");
  return { files: files.sort(), directories: directories.sort() };
}

function expectedRuntimeDirectories(expectedFiles) {
  const directories = new Set();
  for (const relativeFile of expectedFiles) {
    let directory = path.posix.dirname(relativeFile);
    while (directory !== ".") {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  return directories;
}

function runtimePathFromUrl(value, context) {
  const withoutSuffix = String(value).split(/[?#]/u, 1)[0];
  return normalizeRuntimePath(withoutSuffix, context);
}

function normalizeRuntimePath(value, context) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context}: runtime path is empty`);
  }
  if (/^(?:[a-z]+:|\/|\\)/iu.test(value)) {
    throw new Error(`${context}: external or absolute runtime path is forbidden (${value})`);
  }
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`${context}: runtime path escapes the web root (${value})`);
  }
  return normalized.replace(/^\.\//u, "");
}

async function readJson(file, label = file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`${label}: invalid or unreadable JSON (${error.message})`);
  }
}

function assertExactSet(label, actualFiles, expectedFiles) {
  const actual = new Set(actualFiles);
  const expected = new Set(expectedFiles);
  const missing = [...expected].filter((file) => !actual.has(file));
  const unexpected = [...actual].filter((file) => !expected.has(file));
  if (missing.length || unexpected.length) {
    throw new Error(
      `${label}: runtime file set mismatch` +
        `${missing.length ? `; missing: ${missing.join(", ")}` : ""}` +
        `${unexpected.length ? `; unexpected: ${unexpected.join(", ")}` : ""}`,
    );
  }
}

function assertUniqueFiles(files, label) {
  if (new Set(files).size !== files.length) throw new Error(`${label}: duplicate file path`);
}

function assertCount(label, items, expected) {
  if (items.length !== expected) {
    throw new Error(`${label}: found ${items.length}, expected ${expected}`);
  }
}

function joinPrefix(prefix, relativeFile) {
  return prefix ? `${prefix}/${relativeFile}` : relativeFile;
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const inventory = await collectStaticRuntimeInventory();
    console.log(
      `Static runtime inventory: ${inventory.files.length} files ` +
        `(${inventory.groups.base.length} base/legacy, ` +
        `${inventory.groups.canonicalContent.length} canonical content JSON, ` +
        `${inventory.groups.visual.length} visual) — verified`,
    );
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
