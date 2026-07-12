(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_CONTENT_V2 = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const CONTENT_ROOT = "tier-01-v2/content";
  const OWNER_FILES = [
    "base-profiles.json",
    "modifiers.json",
    "home-treatment-actions.json",
    "conflict-lines.json",
    "budget-lines.json",
    "anxiety-lines.json",
    "humorous-lines.json",
    "follow-up-lines.json"
  ];

  function joinPath(...parts) {
    return parts.map((part, index) => {
      const value = String(part);
      if (index === 0) return value.replace(/\/$/, "");
      return value.replace(/^\//, "").replace(/\/$/, "");
    }).filter(Boolean).join("/");
  }

  async function loadCatalog(readJson, rootPath = CONTENT_ROOT) {
    const clinicalRoot = joinPath(rootPath, "clinical/tier-01");
    const ownerRoot = joinPath(rootPath, "owners/tier-01");
    const campaignRoot = joinPath(rootPath, "campaign/tier-01");
    const multiDiagnosisRoot = joinPath(rootPath, "multi-diagnosis");
    const manifest = await readJson(joinPath(clinicalRoot, "manifest.json"));
    const cases = await Promise.all(manifest.cases.map(async (entry) => {
      const caseData = await readJson(joinPath(clinicalRoot, entry.file));
      return { ...caseData, manifestEntry: { ...entry } };
    }));
    const ownerEntries = await Promise.all(OWNER_FILES.map(async (file) => [
      file.replace(/\.json$/, ""),
      await readJson(joinPath(ownerRoot, file))
    ]));
    const [dayPlan, dayGoals, doctorShifts, labels, tutorial, multiDiagnosisManifest] = await Promise.all([
      readJson(joinPath(campaignRoot, "seven-day-plan.json")),
      readJson(joinPath(campaignRoot, "day-goals.json")),
      readJson(joinPath(campaignRoot, "doctor-shifts.json")),
      readJson(joinPath(rootPath, "ui/clinical-labels.json")),
      readJson(joinPath(rootPath, "ui/tutorial-texts.json")),
      readJson(joinPath(multiDiagnosisRoot, "manifest.json"))
    ]);
    const multiDiagnosisBundles = await Promise.all(multiDiagnosisManifest.bundles.map((entry) => (
      readJson(joinPath(multiDiagnosisRoot, entry.file))
    )));

    return {
      schemaVersion: 2,
      contentRoot: rootPath,
      manifest,
      cases,
      casesById: Object.fromEntries(cases.map((item) => [item.id, item])),
      owners: Object.fromEntries(ownerEntries),
      dayPlan,
      dayGoals,
      doctorShifts,
      labels,
      tutorial,
      multiDiagnosis: {
        manifest: multiDiagnosisManifest,
        bundles: multiDiagnosisBundles,
        bundlesById: Object.fromEntries(multiDiagnosisBundles.map((item) => [item.bundleId, item]))
      }
    };
  }

  async function loadFromFetch(rootPath = CONTENT_ROOT, fetchImpl = fetch) {
    return loadCatalog(async (path) => {
      const response = await fetchImpl(path);
      if (!response.ok) throw new Error(`Tier 01 v2 content request failed: ${path} (${response.status})`);
      return response.json();
    }, rootPath);
  }

  async function loadFromDirectory(rootPath) {
    if (typeof require !== "function") throw new Error("Directory loading is available only in Node.js");
    const fs = require("node:fs/promises");
    const pathModule = require("node:path");
    return loadCatalog(async (path) => JSON.parse(await fs.readFile(pathModule.resolve(path), "utf8")), rootPath);
  }

  return { CONTENT_ROOT, OWNER_FILES, loadCatalog, loadFromFetch, loadFromDirectory };
});
