import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const loader = require("../generator/content-loader-v2.js");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = {
  packId: "tier-01-v2",
  packVersion: "2026.07.12.2",
  mode: "tier-01-v2",
  context: "review"
};

const registry = JSON.parse(await fs.readFile(path.join(projectRoot, loader.CONTENT_REGISTRY_PATH), "utf8"));
loader.validateRegistry(registry);
const catalog = await loader.loadFromDirectory(projectRoot, options);

if (catalog.cases.length !== catalog.manifest.caseCount) {
  throw new Error(`Registered case count mismatch: manifest=${catalog.manifest.caseCount}, loaded=${catalog.cases.length}`);
}

console.log(JSON.stringify({
  status: "passed",
  registryPath: loader.CONTENT_REGISTRY_PATH,
  registryVersion: registry.registryVersion,
  packCount: registry.packs.length,
  selectedPack: {
    contentPackId: catalog.registryEntry.contentPackId,
    contentPackVersion: catalog.registryEntry.contentPackVersion,
    contentPackHash: catalog.registryEntry.contentPackHash,
    root: catalog.registryEntry.root,
    status: catalog.registryEntry.status,
    integrationStatus: catalog.registryEntry.integrationStatus,
    loadContext: catalog.loadContext,
    caseCount: catalog.cases.length
  }
}, null, 2));
