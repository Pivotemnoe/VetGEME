import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const findRepoRoot = (start) => {
  let current = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(current, "content/system-packs/vetgeme-master-2026-07-14/capability-registry.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error("VetGEME repository root with capability registry was not found");
    current = parent;
  }
};
const repoRoot = process.env.VETGEME_REPO_ROOT
  ? path.resolve(process.env.VETGEME_REPO_ROOT)
  : findRepoRoot(packageRoot);
const manifestPath = path.join(packageRoot, "MANIFEST.json");
const capabilityRegistryPath = path.join(
  repoRoot,
  "content/system-packs/vetgeme-master-2026-07-14/capability-registry.json"
);

const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const unique = (items) => new Set(items).size === items.length;
const relativePosix = (filePath) =>
  path.relative(packageRoot, filePath).split(path.sep).join("/");
const collectFiles = (directory, predicate) => {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(entryPath, predicate));
    else if (predicate(entryPath)) files.push(entryPath);
  }
  return files.sort();
};
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
const nonEmptyObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
const forbiddenGeneratedMedicalKeys = new Set([
  "drug",
  "dose",
  "dosage",
  "doseMgKg",
  "fluidRate",
  "prescription",
  "treatmentProtocol",
  "transfusionRate",
]);
const findForbiddenKeys = (value, location, found = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${location}[${index}]`, found));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenGeneratedMedicalKeys.has(key)) found.push(`${location}.${key}`);
      findForbiddenKeys(child, `${location}.${key}`, found);
    }
  }
  return found;
};

const manifest = readJson(manifestPath);
const capabilities = new Set(
  readJson(capabilityRegistryPath).capabilities.map((entry) => entry.id)
);

assert(manifest.generatorEligible === false, "authoring manifest must be fail-closed");
assert(
  manifest.activationStatus === "blocked_pending_external_veterinary_review",
  "authoring manifest activationStatus must remain blocked"
);
assert(manifest.familyTargetCount === 39, "family target must remain 39");
assert(manifest.variantTargetCount === 215, "variant target must remain 215");
assert(manifest.presentationTargetCount === 645, "presentation target must remain 645");
assert(manifest.productionPoolSize === 0, "production pool must remain empty before approval");
assert(Array.isArray(manifest.families), "manifest families must be an array");

const manifestFamilyIds = manifest.families.map((family) => family.familyId);
const manifestFamilyPaths = manifest.families.map((family) => family.path).sort();
assert(unique(manifestFamilyIds), "manifest contains duplicate family IDs");
assert(unique(manifestFamilyPaths), "manifest contains duplicate family paths");

const diskFamilyPaths = collectFiles(
  path.join(packageRoot, "families"),
  (filePath) => path.basename(filePath) === "family.production.json"
).map(relativePosix);
assert(
  JSON.stringify(diskFamilyPaths) === JSON.stringify(manifestFamilyPaths),
  "manifest family paths and on-disk family files must match exactly"
);

const expectedReviewNames = manifest.families
  .map((family) => `${path.basename(path.dirname(family.path))}-source-review.md`)
  .sort();
const reviewDirectory = path.join(packageRoot, "review");
const diskReviewNames = fs
  .readdirSync(reviewDirectory)
  .filter((name) => name.endsWith("-source-review.md"))
  .sort();
assert(
  JSON.stringify(diskReviewNames) === JSON.stringify(expectedReviewNames),
  "source-review files must match manifest families exactly"
);

let authoredFamilies = 0;
let variantCount = 0;
let presentationCount = 0;
let generatorEligibleCount = 0;

for (const manifestFamily of manifest.families) {
  const familyPath = path.join(packageRoot, manifestFamily.path);
  assert(fs.existsSync(familyPath), `${manifestFamily.familyId}: family file missing`);
  if (!fs.existsSync(familyPath)) continue;

  const family = readJson(familyPath);
  authoredFamilies += 1;
  assert(family.familyId === manifestFamily.familyId, `${family.familyId}: manifest ID mismatch`);
  assert(family.familyVersion === manifestFamily.familyVersion, `${family.familyId}: manifest version mismatch`);
  assert(manifestFamily.authorStatus === family.review?.authorStatus, `${family.familyId}: manifest author status mismatch`);
  assert(manifestFamily.sourceStatus === family.review?.sourceStatus, `${family.familyId}: manifest source status mismatch`);
  assert(manifestFamily.veterinaryReviewStatus === family.review?.veterinaryReviewStatus, `${family.familyId}: manifest veterinary status mismatch`);
  assert(manifestFamily.generatorEligible === false, `${family.familyId}: manifest family must remain ineligible`);
  assert(family.generatorEligible === false, `${family.familyId}: family must remain ineligible before approval`);
  if (family.generatorEligible) generatorEligibleCount += 1;
  assert(family.review?.authorStatus === "author_complete", `${family.familyId}: author review incomplete`);
  assert(family.review?.sourceStatus === "source_checked", `${family.familyId}: source review incomplete`);
  assert(
    family.review?.veterinaryReviewStatus === "external_veterinary_review_pending",
    `${family.familyId}: unexpected veterinary review state`
  );

  assert(nonEmptyArray(family.planBundles), `${family.familyId}: plan bundles missing`);
  assert(nonEmptyArray(family.sourceCatalog), `${family.familyId}: source catalog missing`);
  assert(nonEmptyArray(family.researchCapabilityMap), `${family.familyId}: research map missing`);
  assert(nonEmptyArray(family.commonHistoryQuestions), `${family.familyId}: history questions missing`);
  assert(nonEmptyArray(family.commonExamActions), `${family.familyId}: exam actions missing`);
  assert(nonEmptyArray(family.familyValidationRules), `${family.familyId}: validation rules missing`);
  assert(nonEmptyArray(family.variants), `${family.familyId}: variants missing`);
  assert(
    capabilities.has(family.safeRouteCapability),
    `${family.familyId}: family safe-route capability missing or unknown`
  );

  const planIds = (family.planBundles || []).map((plan) => plan.id);
  const sourceIds = (family.sourceCatalog || []).map((source) => source.id);
  const sourceUrls = (family.sourceCatalog || []).map((source) => source.url);
  const researchIds = (family.researchCapabilityMap || []).map((research) => research.researchId);
  const requirementGroups = new Map(
    (family.requirementGroups || []).map((group) => [group.id, group])
  );
  const discoveryIds = new Set([
    ...(family.commonHistoryQuestions || []).map((question) => question.id),
    ...(family.commonExamActions || []).map((action) => action.id)
  ]);

  assert(unique(planIds), `${family.familyId}: duplicate plan bundle ID`);
  assert(unique(sourceIds), `${family.familyId}: duplicate source ID`);
  assert(unique(sourceUrls), `${family.familyId}: duplicate source URL`);
  assert(unique(researchIds), `${family.familyId}: duplicate research ID`);
  for (const source of family.sourceCatalog || []) {
    assert(Boolean(source.title), `${family.familyId}/${source.id}: source title missing`);
    assert(/^https:\/\//.test(source.url || ""), `${family.familyId}/${source.id}: source URL must be HTTPS`);
    assert(
      Boolean(source.scope) || nonEmptyArray(source.supports),
      `${family.familyId}/${source.id}: source scope/support mapping missing`
    );
  }
  for (const group of requirementGroups.values()) {
    assert(Array.isArray(group.anyOf) && group.anyOf.length > 0, `${family.familyId}/${group.id}: empty requirement group`);
    for (const capabilityId of group.anyOf || []) {
      assert(capabilities.has(capabilityId), `${family.familyId}/${group.id}: unknown capability ${capabilityId}`);
    }
  }
  for (const plan of family.planBundles) {
    for (const field of ["fullPlan", "stagedPlan", "minimumSafePlan", "stabilizeAndRefer", "unsafeOrInadequate"]) {
      assert(Array.isArray(plan[field]) && plan[field].length > 0, `${family.familyId}/${plan.id}: missing ${field}`);
    }
  }
  for (const research of family.researchCapabilityMap) {
    for (const capabilityId of research.requires) {
      assert(capabilities.has(capabilityId), `${family.familyId}/${research.researchId}: unknown capability ${capabilityId}`);
    }
    if (research.fallback) {
      assert(capabilities.has(research.fallback), `${family.familyId}/${research.researchId}: unknown fallback ${research.fallback}`);
    }
  }
  for (const action of family.commonExamActions) {
    for (const capabilityId of action.requires) {
      assert(capabilities.has(capabilityId), `${family.familyId}/${action.id}: unknown action capability ${capabilityId}`);
    }
  }

  const familyVariantIds = family.variants.map((variant) => variant.id);
  assert(unique(familyVariantIds), `${family.familyId}: duplicate variant ID`);
  variantCount += family.variants.length;

  for (const variant of family.variants) {
    const prefix = `${family.familyId}/${variant.id}`;
    assert(Boolean(variant.version), `${prefix}: version missing`);
    assert(Boolean(variant.diagnosticTruth), `${prefix}: diagnostic truth missing`);
    assert(nonEmptyArray(variant.allowedSpecies), `${prefix}: allowed species missing`);
    assert(nonEmptyArray(variant.sourceIds), `${prefix}: source IDs missing`);
    const hasCatalogTruth = Boolean(variant.primaryDiagnosisId) && nonEmptyArray(variant.differentials);
    const hasDecisionTruth = nonEmptyArray(variant.exclusions);
    assert(
      hasCatalogTruth || hasDecisionTruth,
      `${prefix}: requires primaryDiagnosisId+differentials or explicit exclusions`
    );
    assert(variant.generatorEligible === false, `${prefix}: variant must remain ineligible before approval`);
    if (variant.generatorEligible) generatorEligibleCount += 1;
    assert(variant.review?.authorStatus === "author_complete", `${prefix}: author review incomplete`);
    assert(variant.review?.sourceStatus === "source_checked", `${prefix}: source review incomplete`);
    assert(
      variant.review?.veterinaryReviewStatus === "external_veterinary_review_pending",
      `${prefix}: unexpected veterinary review state`
    );
    assert(planIds.includes(variant.planBundleId), `${prefix}: unknown variant plan ${variant.planBundleId}`);
    for (const sourceId of variant.sourceIds) {
      assert(sourceIds.includes(sourceId), `${prefix}: unknown source ${sourceId}`);
    }

    const presentationIds = variant.presentations.map((presentation) => presentation.id);
    assert(unique(presentationIds), `${prefix}: duplicate presentation ID`);
    assert(variant.presentations.length === 3, `${prefix}: exactly three authored presentations required`);
    presentationCount += variant.presentations.length;

    for (const presentation of variant.presentations) {
      const pfx = `${prefix}/${presentation.id}`;
      for (const field of [
        "version", "species", "ageBands", "campaignAvailability", "urgency", "workload",
        "complaint", "historyAnswers", "examFindings", "criticalFacts", "investigations",
        "dataSufficiency", "equipment", "carePlanId", "followUp", "outcomes",
        "ownerCommunication", "compatibility"
      ]) {
        assert(presentation[field] !== undefined && presentation[field] !== null, `${pfx}: missing ${field}`);
      }
      assert(presentation.generatorEligible === false, `${pfx}: presentation must remain ineligible before approval`);
      if (presentation.generatorEligible) generatorEligibleCount += 1;
      assert(presentation.review?.authorStatus === "author_complete", `${pfx}: author review incomplete`);
      assert(presentation.review?.sourceStatus === "source_checked", `${pfx}: source review incomplete`);
      assert(
        presentation.review?.veterinaryReviewStatus === "external_veterinary_review_pending",
        `${pfx}: unexpected veterinary review state`
      );
      assert(planIds.includes(presentation.carePlanId), `${pfx}: unknown care plan ${presentation.carePlanId}`);
      assert(nonEmptyArray(presentation.species), `${pfx}: species missing`);
      assert(nonEmptyArray(presentation.ageBands), `${pfx}: age bands missing`);
      assert(nonEmptyObject(presentation.campaignAvailability), `${pfx}: campaign availability missing`);
      assert(typeof presentation.workload === "number" && presentation.workload > 0, `${pfx}: workload must be positive`);
      assert(Boolean(presentation.complaint), `${pfx}: complaint missing`);
      assert(nonEmptyObject(presentation.historyAnswers), `${pfx}: history answers missing`);
      assert(nonEmptyArray(presentation.examFindings), `${pfx}: exam findings missing`);
      assert(nonEmptyArray(presentation.criticalFacts), `${pfx}: critical facts missing`);
      assert(nonEmptyArray(presentation.investigations), `${pfx}: investigations missing`);
      assert(nonEmptyArray(presentation.ownerCommunication), `${pfx}: owner communication missing`);
      assert(nonEmptyObject(presentation.followUp), `${pfx}: follow-up missing`);
      assert(nonEmptyObject(presentation.outcomes), `${pfx}: outcomes missing`);
      assert(nonEmptyObject(presentation.compatibility), `${pfx}: compatibility missing`);
      assert(nonEmptyArray(presentation.dataSufficiency?.safePlanRequires), `${pfx}: safe-plan criteria missing`);
      assert(nonEmptyArray(presentation.dataSufficiency?.confirmedDiagnosisRequires), `${pfx}: confirmation criteria missing`);

      for (const finding of presentation.examFindings) {
        assert(Boolean(finding.factId), `${pfx}: exam finding fact ID missing`);
        assert(Boolean(finding.source), `${pfx}/${finding.factId}: exam finding source missing`);
        assert(Boolean(finding.finding), `${pfx}/${finding.factId}: exam finding text missing`);
      }

      const factIds = presentation.criticalFacts.map((fact) => fact.factId);
      assert(unique(factIds), `${pfx}: duplicate critical fact ID`);
      for (const fact of presentation.criticalFacts) {
        assert(
          Array.isArray(fact.discoveryPaths) && fact.discoveryPaths.length > 0,
          `${pfx}/${fact.factId}: no discovery path`
        );
        for (const discoveryPath of fact.discoveryPaths) {
          assert(discoveryIds.has(discoveryPath), `${pfx}/${fact.factId}: unknown discovery path ${discoveryPath}`);
        }
      }
      for (const investigation of presentation.investigations) {
        assert(researchIds.includes(investigation.id), `${pfx}: unmapped investigation ${investigation.id}`);
        assert(Boolean(investigation.classification), `${pfx}/${investigation.id}: classification missing`);
        assert(
          Object.prototype.hasOwnProperty.call(investigation, "result"),
          `${pfx}/${investigation.id}: authored result state missing`
        );
      }

      const equipment = presentation.equipment;
      for (const field of ["requiredLocal", "external", "missingLocalRoute"]) {
        for (const capabilityId of equipment[field] || []) {
          assert(capabilities.has(capabilityId), `${pfx}: unknown equipment capability ${capabilityId}`);
        }
      }
      if (equipment.referralFallback) {
        assert(capabilities.has(equipment.referralFallback), `${pfx}: unknown referral fallback ${equipment.referralFallback}`);
      }
      assert(
        Boolean(equipment.referralFallback) ||
          nonEmptyArray(equipment.missingLocalRoute) ||
          Boolean(family.safeRouteCapability),
        `${pfx}: presentation or family safe route required`
      );
      for (const groupId of equipment.conditional || []) {
        assert(requirementGroups.has(groupId), `${pfx}: unknown conditional requirement group ${groupId}`);
      }
    }
  }

  assert(family.variants.length === manifestFamily.variantCount, `${family.familyId}: manifest variant count mismatch`);
  assert(
    family.variants.reduce((total, variant) => total + variant.presentations.length, 0) === manifestFamily.presentationCount,
    `${family.familyId}: manifest presentation count mismatch`
  );

  for (const forbiddenPath of findForbiddenKeys(family, family.familyId)) {
    errors.push(`${forbiddenPath}: generated medical instruction key is forbidden`);
  }
}

assert(authoredFamilies === manifest.familiesAuthored, "manifest familiesAuthored mismatch");
assert(authoredFamilies === manifest.familyTargetCount, "authored family total does not meet target");
assert(variantCount === manifest.variantTargetCount, "authored variant total does not meet target");
assert(presentationCount === manifest.presentationTargetCount, "authored presentation total does not meet target");
assert(generatorEligibleCount === 0, "production pool must contain zero eligible family/variant/presentation records");

if (errors.length) {
  console.error(`Medical authoring validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Medical authoring validation passed: ${authoredFamilies} family, ${variantCount} variants, ${presentationCount} presentations; activation remains blocked.`
);
