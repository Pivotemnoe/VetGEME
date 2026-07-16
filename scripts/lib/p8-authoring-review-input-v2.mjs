import { createHash } from "node:crypto";

import {
  MEDICAL_REVIEW_INPUT_V40_VERSION,
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
  loadMedicalAuthoringReviewInputFromReader,
  validateReviewInputRegistry,
} from "./medical-authoring-review-input.mjs";
import { loadOperationalAuthoringReviewInputFromReader } from "./operational-authoring-review-input.mjs";
import {
  evaluateP8SourceCleanGate,
  validateP8ReviewerDecisionSet,
} from "./p8-authoring-review-input.mjs";

export const P8_REVIEW_INPUT_V2_ID = "vetgeme-p8-medical-review-authoring";
export const P8_REVIEW_INPUT_V2_VERSION = "2026.07.16.2";
export const P8_REVIEW_INPUT_V2_ROOT =
  "content/review-inputs/vetgeme-p8-medical-review-authoring-2026.07.16.2";
export const P8_REVIEW_INPUT_V2_CONTEXT = "review";
export const P8_REVIEW_INPUT_V2_STATUS =
  "author_correction_gate_passed_external_review_pending";
export const P8_V2_BASELINE_MANIFEST_PATH =
  "content/packs/tier-01-v2/clinical/tier-01/manifest.json";
export const P8_V2_HOST_REVIEW_TEMPLATE_PATH =
  `${P8_REVIEW_INPUT_V2_ROOT}/host/reviewer-decision-envelope-template.json`;
export const P8_V2_HOST_REVIEW_SCHEMA_PATH =
  `${P8_REVIEW_INPUT_V2_ROOT}/host/reviewer-decision-envelope.schema.json`;
export const P8_V2_HOST_REVIEW_README_PATH =
  `${P8_REVIEW_INPUT_V2_ROOT}/host/README.md`;

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const OPERATIONAL_VERSION = "2026.07.16.1";
const DIALOGUE_COMPONENT_VERSION = "2026.07.16.1";
const DISPLAY_AUDIT_PATH = "generated/P8_DISPLAY_LANGUAGE_AUDIT_2026.07.16.40.json";
const STALE_SOURCE_AUDIT_PATH = "generated/P8_SOURCE_AUDIT_2026.07.16.40.json";
const HOST_REVIEW_TEMPLATE_SHA256 = "cfd0cc68a21a05fa33249d4c86a256b61b250bc2131f99612377e58c405d4f31";
const HOST_REVIEW_SCHEMA_SHA256 = "7f18d44a975e86d810bfc584d7af81fd8de0d91b9f77d1ac1af34f8aa7fe8135";
const HOST_REVIEW_README_SHA256 = "8bffab04784f594b02669e7c82155162eedc35186e47aecec2a077c0a2283274";
const EXPECTED_COUNTS = Object.freeze({
  sourceFiles: 29,
  sourceBytes: 488589,
  families: 39,
  variants: 215,
  presentations: 645,
  sourceEntries: 221,
  investigations: 1864,
  playerFacingFields: 9847,
  auditIssues: 0,
  p0: 0,
  p1: 0,
  p2: 0,
  p3: 0,
  ownerProfiles: 12,
  doctorSpeechFunctions: 15,
  rareAbsurdEvents: 4,
  p4Presentations: 645,
  productionPool: 0,
});
const EXPECTED_UNMAPPED_RESEARCH_TASKS = Object.freeze([
  "gi_abdominal_palpation",
  "parasite_risk_and_prevention_history",
  "vestibular_owner_home_environment_and_emergency_red_flag_plan",
]);
const EXPECTED_BLOCKER_IDS = Object.freeze([
  "p8_external_veterinary_approval_missing",
  "p8_reviewer_decisions_missing",
  "p8_activation_manifest_missing",
  "p8_player_facing_dialogue_runtime_forbidden",
  "p8_upstream_catalogs_review_only",
  "p8_operational_semantics_not_audited",
  "p8_unmapped_research_tasks",
]);
const REQUIRED_OWNER_FUNCTIONS = Object.freeze([
  "arrival",
  "complaint",
  "uncertainty",
  "consent",
  "refusal",
  "teachBack",
  "followUp",
  "lightHumor",
]);
const REQUIRED_DOCTOR_FUNCTIONS = Object.freeze([
  "openVisit",
  "clarifyTimeline",
  "inviteHomeTreatmentDisclosure",
  "summarizeKnownUnknown",
  "explainInvestigation",
  "explainUncertainty",
  "proposeStagedPlan",
  "respondToRefusal",
  "urgentRoute",
  "giveHomePlan",
  "teachBack",
  "closeVisit",
  "deescalate",
  "plainLanguage",
  "evidenceResponse",
]);
const EXPECTED_AUTHORITATIVE_FILES = Object.freeze([
  "source/p8-review-policy.json",
  "source/human-dialogue-library.json",
  "source/reviewer-decision-template.json",
  "generated/P8_SOURCE_AUDIT.json",
  DISPLAY_AUDIT_PATH,
  "generated/P8_DIALOGUE_VALIDATION.json",
  "generated/P8_DIALOGUE_SAMPLE_MATRIX_2026.07.16.40.md",
  "P8_REVIEW_MATRIX.md",
  "SOURCE_REFRESH_NOTES.md",
  "REVIEWER_GUIDE.md",
  "PROGRAMMER_HANDOFF.md",
]);
export const P8_V2_DIALOGUE_AUTHORITY = Object.freeze({
  speechFormOnly: true,
  mayChangeMedicalTruth: false,
  mayChangeInvestigationResult: false,
  mayChangeConsentOrRefusal: false,
  mayChangeCost: false,
  mayChangeTime: false,
  mayChangeOutcome: false,
  emergencyHumorAllowed: false,
});

function fail(message) {
  throw new Error(`P8 v2 authoring review input validation failed: ${message}`);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeRelativePath(value) {
  if (!isNonEmptyString(value) || value.startsWith("/") || value.includes("\\")) return false;
  return value.split("/").every((part) => part && part !== "." && part !== "..");
}

function checkSafePath(value, label) {
  check(isSafeRelativePath(value), `${label} must be a safe relative path`);
}

function checkInteger(value, label) {
  check(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative safe integer`);
}

function checkArray(value, label) {
  check(Array.isArray(value), `${label} must be an array`);
  return value;
}

function checkUnique(values, label) {
  check(new Set(values).size === values.length, `${label} contain duplicates`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function joinPath(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && String(part).length > 0)
    .map((part, index) => {
      const value = String(part);
      return index === 0
        ? value.replace(/\/$/u, "")
        : value.replace(/^\//u, "").replace(/\/$/u, "");
    })
    .join("/");
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function sorted(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right), "en"));
}

function sameStrings(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function makeBlocker(id, summary, details) {
  return deepFreeze({ id, status: "blocked", summary, details: clone(details) });
}

export function validateP8V2ReviewInputRegistration(registration) {
  check(isObject(registration), "review input registration must be an object");
  check(registration.reviewInputId === P8_REVIEW_INPUT_V2_ID, "unexpected reviewInputId");
  check(registration.reviewInputVersion === P8_REVIEW_INPUT_V2_VERSION, "unexpected reviewInputVersion");
  check(registration.kind === "p8_medical_review_authoring", "review input kind mismatch");
  check(registration.packageId === P8_REVIEW_INPUT_V2_ID, "packageId mismatch");
  check(registration.packageVersion === P8_REVIEW_INPUT_V2_VERSION, "packageVersion mismatch");
  check(registration.root === P8_REVIEW_INPUT_V2_ROOT, "P8 v2 review root mismatch");
  checkSafePath(registration.root, "root");
  check(registration.sourceRoot === "source", "sourceRoot must be source");
  check(registration.manifestPath === "source/MANIFEST.json", "manifestPath mismatch");
  check(registration.provenancePath === "provenance.json", "provenancePath mismatch");
  check(registration.status === P8_REVIEW_INPUT_V2_STATUS, "P8 v2 status mismatch");
  check(registration.reviewOnly === true, "reviewOnly must be true");
  for (const field of [
    "productionEligible",
    "runtimeEligible",
    "generatorEligible",
    "activationAllowed",
    "allowCurrentCaseCrosswalk",
    "allowRuntimeActivation",
    "allowPlayerFacingDialogue",
    "allowReviewerDecisionImport",
    "allowActivationManifest",
  ]) check(registration[field] === false, `${field} must remain false`);

  check(isObject(registration.expectedCounts), "expectedCounts are required");
  for (const [field, expected] of Object.entries(EXPECTED_COUNTS)) {
    checkInteger(registration.expectedCounts[field], `expectedCounts.${field}`);
    check(registration.expectedCounts[field] === expected, `expectedCounts.${field} must be ${expected}`);
  }
  check(isObject(registration.sourceIntegrity), "sourceIntegrity is required");
  for (const field of ["provenanceSha256", "aggregateSha256", "archiveSha256"]) {
    check(SHA256_PATTERN.test(registration.sourceIntegrity[field] || ""), `sourceIntegrity.${field} is invalid`);
  }
  check(
    registration.sourceIntegrity.provenanceSha256
      === "97d4b8ad902afafe541f06dbd55cfbaa699b4816a5061a9ba217dc708bdae24d",
    "P8 v2 provenance digest mismatch",
  );
  check(
    registration.sourceIntegrity.aggregateSha256
      === "785bd77cfda14e5846e13de7d219c1635714d16fbbabb6c04c88221f9d449093",
    "P8 v2 aggregate digest mismatch",
  );
  check(
    registration.sourceIntegrity.archiveSha256
      === "2fb059e9a85c632d6f37b66f05ff8f93065aea7e92eda06e1fafb1dff55d5031",
    "P8 v2 archive digest mismatch",
  );

  check(isObject(registration.reviewerDecisionContract), "reviewerDecisionContract is required");
  const decisionContract = registration.reviewerDecisionContract;
  check(
    decisionContract.authorTemplatePath
      === `${P8_REVIEW_INPUT_V2_ROOT}/source/source/reviewer-decision-template.json`,
    "author reviewer template path mismatch",
  );
  check(decisionContract.hostTemplatePath === P8_V2_HOST_REVIEW_TEMPLATE_PATH, "host reviewer template path mismatch");
  check(decisionContract.hostTemplateSha256 === HOST_REVIEW_TEMPLATE_SHA256, "host reviewer template digest mismatch");
  check(decisionContract.schemaPath === P8_V2_HOST_REVIEW_SCHEMA_PATH, "host reviewer schema path mismatch");
  check(decisionContract.schemaSha256 === HOST_REVIEW_SCHEMA_SHA256, "host reviewer schema digest mismatch");
  check(decisionContract.readmePath === P8_V2_HOST_REVIEW_README_PATH, "host reviewer README path mismatch");
  check(decisionContract.readmeSha256 === HOST_REVIEW_README_SHA256, "host reviewer README digest mismatch");

  check(isObject(registration.medicalReviewInput), "medicalReviewInput pin is required");
  check(
    registration.medicalReviewInput.reviewInputId === "vetgeme-medical-production-authoring"
      && registration.medicalReviewInput.reviewInputVersion === MEDICAL_REVIEW_INPUT_V40_VERSION,
    "medical review input identity mismatch",
  );
  check(registration.medicalReviewInput.productionEligible === false, "medical dependency must remain review-only");
  check(registration.medicalReviewInput.generatorEligible === false, "medical dependency must remain generator-ineligible");
  check(
    registration.medicalReviewInput.sourceIntegrity?.archiveSha256
      === "171659e929f4b8a83cf921a8fa689cd3f5ac632466c4c328dd047199fced71c5",
    "medical dependency archive digest mismatch",
  );
  check(
    registration.medicalReviewInput.sourceIntegrity?.aggregateSha256
      === "3f3f89ab93e005a5100b39586328c38fa6b4fcf52887be63cabc41ac05c557c8",
    "medical dependency aggregate digest mismatch",
  );

  check(isObject(registration.operationalReviewInput), "operationalReviewInput pin is required");
  check(
    registration.operationalReviewInput.reviewInputId === "vetgeme-operational-production-authoring"
      && registration.operationalReviewInput.reviewInputVersion === OPERATIONAL_VERSION,
    "operational review input identity mismatch",
  );
  check(registration.operationalReviewInput.runtimeEligible === false, "operational dependency must remain review-only");
  check(
    registration.operationalReviewInput.sourceIntegrity?.aggregateSha256
      === "0a42bad7eccf70ba4eb3c18738c4b6653ab06d75056526ca828707b11e33f055",
    "operational dependency aggregate digest mismatch",
  );
  check(
    registration.operationalReviewInput.catalogSha256?.p4OwnerProfiles
      === "3e722abff5eb46e0161f714dd6fe2386e0f6f4c3997dc276bd0752930b682b9f",
    "P4 owner-profile catalog digest mismatch",
  );
  check(
    registration.operationalReviewInput.catalogSha256?.p4BehaviorCrosswalk
      === "0d211caf8b5af4ae64cda672a36836350411b82053c29cb6741252dbfcb65582",
    "P4 behavior-crosswalk digest mismatch",
  );
  return registration;
}

export function resolveP8V2AuthoringReviewInput(registry, options = {}) {
  const registrations = validateReviewInputRegistry(registry);
  check(Object.prototype.hasOwnProperty.call(options, "context"), "explicit review context is required");
  check(
    options.context === P8_REVIEW_INPUT_V2_CONTEXT,
    `${String(options.context)} context is forbidden; review is the only allowed context`,
  );
  if (options.reviewInputId !== undefined) {
    check(options.reviewInputId === P8_REVIEW_INPUT_V2_ID, "unexpected requested reviewInputId");
  }
  if (options.reviewInputVersion !== undefined) {
    check(options.reviewInputVersion === P8_REVIEW_INPUT_V2_VERSION, "unexpected requested reviewInputVersion");
  }
  const registration = registrations.find((entry) => (
    entry.reviewInputId === P8_REVIEW_INPUT_V2_ID
      && entry.reviewInputVersion === P8_REVIEW_INPUT_V2_VERSION
  ));
  check(registration, `unknown review input ${P8_REVIEW_INPUT_V2_ID}@${P8_REVIEW_INPUT_V2_VERSION}`);
  return validateP8V2ReviewInputRegistration(registration);
}

export function validateP8V2SourceProvenance(registration, provenance, sourceFiles, sourceBytesByPath) {
  validateP8V2ReviewInputRegistration(registration);
  const identity = `${registration.reviewInputId}@${registration.reviewInputVersion}`;
  check(isObject(provenance), `${identity}: provenance is missing`);
  check(provenance.schemaVersion === 1, `${identity}: provenance schemaVersion must be 1`);
  check(provenance.provenanceId === "vetgeme-p8-medical-review-authoring-review-source", `${identity}: provenanceId mismatch`);
  check(provenance.packageId === registration.packageId, `${identity}: provenance packageId mismatch`);
  check(provenance.packageVersion === registration.packageVersion, `${identity}: provenance packageVersion mismatch`);
  check(provenance.sourceArchive === "p8-medical-review-authoring-2026.07.16.2.zip", `${identity}: source archive identity mismatch`);
  check(provenance.sourceDirectory === "p8-medical-review-authoring", `${identity}: source directory identity mismatch`);
  check(isObject(provenance.archive), `${identity}: archive provenance is missing`);
  check(provenance.archive.path === provenance.sourceArchive, `${identity}: archive path mismatch`);
  check(provenance.archive.checksumPath === "p8-medical-review-authoring-2026.07.16.2.zip.sha256", `${identity}: archive checksum path mismatch`);
  check(provenance.archive.sha256 === registration.sourceIntegrity.archiveSha256, `${identity}: archive digest mismatch`);
  check(provenance.archive.zipEntryCount === 33, `${identity}: archive entry count mismatch`);
  check(provenance.archive.extractedFileCount === EXPECTED_COUNTS.sourceFiles, `${identity}: archive file count mismatch`);
  check(provenance.archive.extractedBytes === EXPECTED_COUNTS.sourceBytes, `${identity}: archive byte count mismatch`);
  check(provenance.sourceFileCount === EXPECTED_COUNTS.sourceFiles, `${identity}: provenance file count mismatch`);
  check(provenance.sourceBytes === EXPECTED_COUNTS.sourceBytes, `${identity}: provenance byte count mismatch`);
  check(provenance.aggregateSha256 === registration.sourceIntegrity.aggregateSha256, `${identity}: aggregate digest mismatch`);
  checkArray(provenance.files, `${identity}: provenance files`);
  check(provenance.files.length === EXPECTED_COUNTS.sourceFiles, `${identity}: provenance inventory count mismatch`);

  const listedPaths = provenance.files.map((file) => file.path);
  checkUnique(listedPaths, `${identity}: provenance paths`);
  check(sameStrings(sourceFiles, listedPaths), `${identity}: source file set differs from provenance`);
  check(listedPaths.filter((file) => /reviewer-decision/iu.test(file)).length === 1, `${identity}: only the reviewer decision template is allowed`);
  check(listedPaths.includes("source/reviewer-decision-template.json"), `${identity}: reviewer decision template is missing`);
  check(listedPaths.every((file) => !/activation.?manifest/iu.test(file)), `${identity}: activation manifest is forbidden`);
  check(listedPaths.every((file) => !/crosswalk/iu.test(file)), `${identity}: crosswalk artifact is forbidden`);

  let verifiedBytes = 0;
  const aggregate = createHash("sha256");
  for (const file of provenance.files) {
    check(isObject(file), `${identity}: invalid provenance entry`);
    checkSafePath(file.path, `${identity}: provenance path`);
    check(file.originPath === `${provenance.sourceDirectory}/${file.path}`, `${identity}: originPath mismatch for ${file.path}`);
    checkInteger(file.bytes, `${identity}: ${file.path} bytes`);
    check(SHA256_PATTERN.test(file.sha256 || ""), `${identity}: ${file.path} digest is invalid`);
    const bytes = sourceBytesByPath.get(file.path);
    check(bytes !== undefined, `${identity}: source file is missing: ${file.path}`);
    check(bytes.length === file.bytes, `${identity}: byte length mismatch for ${file.path}`);
    check(sha256(bytes) === file.sha256, `${identity}: SHA-256 mismatch for ${file.path}`);
    verifiedBytes += bytes.length;
    aggregate.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`, "utf8");
  }
  check(verifiedBytes === EXPECTED_COUNTS.sourceBytes, `${identity}: verified byte total mismatch`);
  check(aggregate.digest("hex") === provenance.aggregateSha256, `${identity}: inventory digest mismatch`);
  return deepFreeze({
    archiveSha256: provenance.archive.sha256,
    provenanceSha256: registration.sourceIntegrity.provenanceSha256,
    aggregateSha256: provenance.aggregateSha256,
    sourceFiles: provenance.sourceFileCount,
    sourceBytes: provenance.sourceBytes,
  });
}

function buildMedicalRecordIndex(medicalReviewInput) {
  const records = [];
  const presentationRefs = new Set();
  const investigationIds = new Set();
  for (const family of medicalReviewInput.families) {
    records.push({
      recordType: "family",
      familyId: family.familyId,
      variantId: null,
      presentationId: null,
      exactVersion: family.familyVersion,
    });
    for (const variant of family.variants) {
      records.push({
        recordType: "variant",
        familyId: family.familyId,
        variantId: variant.id,
        presentationId: null,
        exactVersion: variant.version,
      });
      for (const presentation of variant.presentations) {
        records.push({
          recordType: "presentation",
          familyId: family.familyId,
          variantId: variant.id,
          presentationId: presentation.id,
          exactVersion: presentation.version,
        });
        presentationRefs.add(`${family.familyId}.${variant.id}.${presentation.id}`);
        for (const investigation of presentation.investigations) investigationIds.add(investigation.id);
      }
    }
  }
  return { records, presentationRefs, investigationIds };
}

function validateReviewerDecisionTemplate(template, registration) {
  check(isObject(template), "reviewer decision template is missing");
  check(template.schemaVersion === 1, "reviewer decision template schemaVersion must be 1");
  check(template.decisionSetId === "replace-with-review-id", "reviewer decision template must remain a placeholder");
  check(template.inputPackage?.packageId === registration.medicalReviewInput.reviewInputId, "reviewer template packageId mismatch");
  check(template.inputPackage?.packageVersion === registration.medicalReviewInput.reviewInputVersion, "reviewer template packageVersion mismatch");
  check(
    template.inputPackage?.sourceAggregateSha256 === registration.medicalReviewInput.sourceIntegrity.aggregateSha256,
    "reviewer template medical digest mismatch",
  );
  check(template.reviewer?.reviewerId === null, "reviewer template must not claim a reviewer");
  check(template.reviewedAt === null, "reviewer template must not claim a review date");
  checkArray(template.decisions, "reviewer template decisions");
  check(template.decisions.length === 1, "reviewer template must contain one placeholder decision");
  check(template.decisions[0].familyId === "replace-with-family-id", "reviewer template contains an actual family decision");
  check(template.decisions[0].exactVersion === "replace-with-exact-version", "reviewer template contains an actual record version");
  check(template.decisions[0].reviewerSignature === null, "reviewer template contains a signature");
  check(
    template.activationRecommendation === "forbidden_until_all_target_records_approved_and_clean_audit_passes",
    "reviewer template activation recommendation must remain fail-closed",
  );
}

function validateHostReviewerDecisionContract({
  hostTemplate,
  schema,
  readme,
  authorTemplate,
  registration,
}) {
  check(isObject(hostTemplate), "host reviewer decision template is missing");
  const { reviewPackage, ...authorFields } = hostTemplate;
  check(
    JSON.stringify(authorFields) === JSON.stringify(authorTemplate),
    "host reviewer template diverges from the immutable author decision contract",
  );
  check(isObject(reviewPackage), "host reviewer template reviewPackage is missing");
  check(reviewPackage.packageId === registration.packageId, "host reviewer template P8 packageId mismatch");
  check(reviewPackage.packageVersion === registration.packageVersion, "host reviewer template P8 packageVersion mismatch");
  check(reviewPackage.archiveSha256 === registration.sourceIntegrity.archiveSha256, "host reviewer template P8 archive digest mismatch");
  check(reviewPackage.provenanceSha256 === registration.sourceIntegrity.provenanceSha256, "host reviewer template P8 provenance digest mismatch");
  check(reviewPackage.sourceAggregateSha256 === registration.sourceIntegrity.aggregateSha256, "host reviewer template P8 aggregate digest mismatch");

  check(isObject(schema), "host reviewer decision schema is missing");
  check(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "host reviewer schema dialect mismatch");
  check(
    schema.$id === "https://vetgeme.local/schemas/p8-reviewer-decision-envelope-2026.07.16.2.json",
    "host reviewer schema ID mismatch",
  );
  check(schema.properties?.reviewPackage?.properties?.packageId?.const === registration.packageId, "host reviewer schema P8 packageId mismatch");
  check(schema.properties?.reviewPackage?.properties?.packageVersion?.const === registration.packageVersion, "host reviewer schema P8 packageVersion mismatch");
  check(schema.properties?.reviewPackage?.properties?.archiveSha256?.const === registration.sourceIntegrity.archiveSha256, "host reviewer schema P8 archive digest mismatch");
  check(schema.properties?.inputPackage?.properties?.packageVersion?.const === registration.medicalReviewInput.reviewInputVersion, "host reviewer schema medical version mismatch");
  check(schema.properties?.inputPackage?.properties?.sourceAggregateSha256?.const === registration.medicalReviewInput.sourceIntegrity.aggregateSha256, "host reviewer schema medical digest mismatch");
  check(
    schema.properties?.activationRecommendation?.const
      === "forbidden_until_all_target_records_approved_and_clean_audit_passes",
    "host reviewer schema activation recommendation is not fail-closed",
  );

  check(typeof readme === "string" && readme.includes("programmer-owned host contracts"), "host reviewer README purpose is missing");
  check(readme.includes("does not grant veterinary approval"), "host reviewer README approval boundary is missing");
  return deepFreeze({
    templatePath: registration.reviewerDecisionContract.hostTemplatePath,
    schemaPath: registration.reviewerDecisionContract.schemaPath,
    readmePath: registration.reviewerDecisionContract.readmePath,
    templateSha256: registration.reviewerDecisionContract.hostTemplateSha256,
    schemaSha256: registration.reviewerDecisionContract.schemaSha256,
    readmeSha256: registration.reviewerDecisionContract.readmeSha256,
  });
}

function validateDialogueLayer(dialogue, dialogueValidation, policy, operationalReviewInput) {
  check(dialogue.schemaVersion === 1, "dialogue library schemaVersion must be 1");
  check(dialogue.catalogId === "vetgeme-p8-human-dialogue-library", "dialogue catalogId mismatch");
  check(dialogue.catalogVersion === DIALOGUE_COMPONENT_VERSION, "dialogue component version mismatch");
  check(dialogue.status === "author_complete_review_pending", "dialogue status mismatch");
  check(dialogue.runtimeEligible === false, "dialogue library must remain runtime-ineligible");
  check(
    dialogue.purpose
      === "Разговорный слой для владельцев и врача. Медицинские факты берутся только из подтверждённой клинической карточки; библиотека меняет подачу, но не диагноз и не результаты исследований.",
    "dialogue speech-form-only purpose changed",
  );
  checkArray(dialogue.ownerProfiles, "dialogue owner profiles");
  check(dialogue.ownerProfiles.length === EXPECTED_COUNTS.ownerProfiles, "dialogue owner profile count mismatch");
  checkUnique(dialogue.ownerProfiles.map((profile) => profile.profileId), "dialogue owner profile IDs");
  const p4OwnerIds = operationalReviewInput.catalogs["generated/p4/owner-profile-catalog.json"].profiles
    .map((profile) => profile.profileId);
  check(sameStrings(dialogue.ownerProfiles.map((profile) => profile.profileId), p4OwnerIds), "dialogue/P4 owner profile sets differ");
  for (const profile of dialogue.ownerProfiles) {
    check(isNonEmptyString(profile.voice), `${profile.profileId}: owner voice is missing`);
    for (const functionId of REQUIRED_OWNER_FUNCTIONS) {
      const lines = profile.utterances?.[functionId];
      check(Array.isArray(lines) && lines.length > 0, `${profile.profileId}: owner function ${functionId} is missing`);
      check(lines.every(isNonEmptyString), `${profile.profileId}: owner function ${functionId} contains empty text`);
    }
  }
  check(isObject(dialogue.doctorSpeech), "doctor speech map is missing");
  check(sameStrings(Object.keys(dialogue.doctorSpeech), REQUIRED_DOCTOR_FUNCTIONS), "doctor speech functions differ");
  for (const functionId of REQUIRED_DOCTOR_FUNCTIONS) {
    check(
      Array.isArray(dialogue.doctorSpeech[functionId]) && dialogue.doctorSpeech[functionId].every(isNonEmptyString),
      `doctor speech function ${functionId} is invalid`,
    );
  }
  checkArray(dialogue.rareAbsurdEvents, "rare absurd events");
  check(dialogue.rareAbsurdEvents.length === EXPECTED_COUNTS.rareAbsurdEvents, "rare absurd event count mismatch");
  for (const event of dialogue.rareAbsurdEvents) {
    checkArray(event.allowedUrgency, `${event.eventId}: allowedUrgency`);
    check(
      event.allowedUrgency.every((urgency) => !String(urgency).toLowerCase().includes("emergency")),
      `${event.eventId}: absurd event is allowed during an emergency urgency band`,
    );
  }
  check(
    sameStrings(
      policy.dialogue.rareAbsurdEventBlockedUrgencyBands,
      ["emergency", "emergency_priority", "emergency_suspicion"],
    ),
    "P8 emergency humor blocklist mismatch",
  );
  for (const [field, expected] of Object.entries({
    criticalFactMustExistOutsideHumor: true,
    ownerBehaviorCannotRevealClinicalTruth: true,
    refusalAlwaysKeepsSafeRoute: true,
    rareAbsurdityForbiddenDuringEmergency: true,
    maxRareAbsurdEventsPerDay: 1,
  })) check(dialogue.renderingRules?.[field] === expected, `dialogue rendering rule ${field} mismatch`);

  check(dialogueValidation.schemaVersion === 1, "dialogue validation schemaVersion must be 1");
  check(dialogueValidation.catalogVersion === DIALOGUE_COMPONENT_VERSION, "dialogue validation component version mismatch");
  check(dialogueValidation.status === "pass", "dialogue structural validation must pass");
  check(dialogueValidation.counts?.issues === 0, "dialogue structural validation contains issues");
  check(dialogueValidation.counts?.actualOwnerProfiles === EXPECTED_COUNTS.ownerProfiles, "dialogue validation owner count mismatch");
  check(dialogueValidation.counts?.doctorFunctions === EXPECTED_COUNTS.doctorSpeechFunctions, "dialogue validation doctor count mismatch");
  check(dialogueValidation.counts?.rareAbsurdEvents === EXPECTED_COUNTS.rareAbsurdEvents, "dialogue validation event count mismatch");
  checkArray(dialogueValidation.issues, "dialogue validation issues");
  check(dialogueValidation.issues.length === 0, "dialogue validation issue list must be empty");
}

export function validateP8V2AuthoringPackage({
  registration,
  manifest,
  sourceFiles,
  sourceBytesByPath,
  policy,
  sourceAudit,
  staleSourceAudit,
  displayAudit,
  dialogue,
  dialogueValidation,
  packageValidation,
  reviewerDecisionTemplate,
  medicalReviewInput,
  operationalReviewInput,
  p4OwnerProfileBytes,
  p4BehaviorCrosswalkBytes,
  baselineManifest,
}) {
  validateP8V2ReviewInputRegistration(registration);
  check(isObject(manifest), "P8 v2 manifest is missing");
  check(manifest.schemaVersion === 1, "P8 v2 manifest schemaVersion must be 1");
  check(manifest.packageId === registration.packageId, "P8 v2 manifest packageId mismatch");
  check(manifest.packageVersion === registration.packageVersion, "P8 v2 manifest packageVersion mismatch");
  check(manifest.status === registration.status, "P8 v2 manifest status mismatch");
  check(manifest.activationAllowed === false, "P8 v2 manifest activation must remain forbidden");
  check(manifest.input?.packageId === registration.medicalReviewInput.reviewInputId, "P8 v2 manifest medical packageId mismatch");
  check(manifest.input?.packageVersion === registration.medicalReviewInput.reviewInputVersion, "P8 v2 manifest medical version mismatch");
  check(manifest.input?.archiveSha256 === registration.medicalReviewInput.sourceIntegrity.archiveSha256, "P8 v2 manifest medical archive digest mismatch");
  check(manifest.input?.sourceAggregateSha256 === registration.medicalReviewInput.sourceIntegrity.aggregateSha256, "P8 v2 manifest medical aggregate digest mismatch");
  for (const field of [
    "families",
    "variants",
    "presentations",
    "investigations",
    "playerFacingFields",
    "auditIssues",
    "p0",
    "p1",
    "ownerProfiles",
    "doctorSpeechFunctions",
  ]) check(manifest.counts?.[field] === EXPECTED_COUNTS[field], `P8 v2 manifest count ${field} mismatch`);
  check(manifest.gates?.sourceAudit === "reviewable", "P8 v2 source audit gate must be reviewable");
  check(manifest.gates?.displayLanguageAudit === "passed", "P8 v2 display audit gate must pass");
  check(manifest.gates?.humanDialogueLibrary === "pass", "P8 v2 dialogue gate mismatch");
  check(manifest.gates?.correctionComplete === true, "P8 v2 correction gate must pass");
  check(manifest.gates?.externalVeterinaryApproval === false, "P8 v2 veterinary approval must remain false");
  check(manifest.gates?.activationManifestPresent === false, "P8 v2 activation manifest gate must remain false");
  checkArray(manifest.authoritativeFiles, "P8 v2 authoritative files");
  checkUnique(manifest.authoritativeFiles, "P8 v2 authoritative files");
  check(sameStrings(manifest.authoritativeFiles, EXPECTED_AUTHORITATIVE_FILES), "P8 v2 authoritative file set mismatch");
  for (const relativePath of manifest.authoritativeFiles) {
    const bytes = sourceBytesByPath.get(relativePath);
    check(bytes !== undefined, `P8 v2 authoritative file is missing: ${relativePath}`);
    check(manifest.fileSha256?.[relativePath] === sha256(bytes), `P8 v2 authoritative digest mismatch: ${relativePath}`);
  }
  check(!manifest.authoritativeFiles.includes(STALE_SOURCE_AUDIT_PATH), "stale source audit must remain non-authoritative");

  check(policy.schemaVersion === 1, "P8 v2 policy schemaVersion must be 1");
  check(policy.packageId === registration.packageId, "P8 v2 policy packageId mismatch");
  check(policy.packageVersion === registration.packageVersion, "P8 v2 policy packageVersion mismatch");
  check(policy.status === registration.status, "P8 v2 policy status mismatch");
  check(policy.input?.packageId === registration.medicalReviewInput.reviewInputId, "P8 v2 policy medical packageId mismatch");
  check(policy.input?.packageVersion === registration.medicalReviewInput.reviewInputVersion, "P8 v2 policy medical version mismatch");
  check(policy.input?.archiveSha256 === registration.medicalReviewInput.sourceIntegrity.archiveSha256, "P8 v2 policy medical archive digest mismatch");
  check(policy.input?.sourceAggregateSha256 === registration.medicalReviewInput.sourceIntegrity.aggregateSha256, "P8 v2 policy medical aggregate digest mismatch");
  check(policy.activation?.generatorEligible === false, "P8 v2 policy generator eligibility must remain false");
  check(policy.activation?.productionPoolSize === 0, "P8 v2 policy production pool must remain 0");
  check(policy.activation?.approvalMayBeGrantedByAutomation === false, "P8 v2 automation may not grant approval");
  check(policy.activation?.approvalAuthority === "designated_external_veterinary_reviewer", "P8 v2 approval authority mismatch");
  check(policy.activation?.activationManifestAllowedBeforeApproval === false, "P8 v2 activation manifest may not precede approval");
  check(policy.finalGate?.allowedP0 === 0 && policy.finalGate?.allowedP1 === 0, "P8 v2 clean gate must require P0=0 and P1=0");
  check(policy.finalGate?.families === 39 && policy.finalGate?.variants === 215 && policy.finalGate?.presentations === 645, "P8 v2 final gate record counts mismatch");
  check(policy.finalGate?.requiresVeterinaryDecisionForEveryActivatedVersion === true, "P8 v2 exact-version veterinary gate is missing");

  check(sourceAudit.schemaVersion === 1, "P8 v2 source audit schemaVersion must be 1");
  check(sourceAudit.reportId === "vetgeme-p8-source-audit", "P8 v2 source audit reportId mismatch");
  check(sourceAudit.reportVersion === registration.packageVersion, "P8 v2 source audit version mismatch");
  check(sourceAudit.status === "reviewable", "P8 v2 source audit must be reviewable");
  check(sourceAudit.activationAllowed === false, "P8 v2 source audit activation must remain false");
  check(sourceAudit.input?.sourceAggregateSha256 === registration.medicalReviewInput.sourceIntegrity.aggregateSha256, "P8 v2 source audit medical digest mismatch");
  for (const [field, expected] of Object.entries({
    families: 39,
    variants: 215,
    presentations: 645,
    sourceEntries: 221,
    uniquePresentationRefs: 645,
    p4PresentationRefs: 645,
    issues: 0,
  })) check(sourceAudit.counts?.[field] === expected, `P8 v2 source audit count ${field} mismatch`);
  for (const severity of ["P0", "P1", "P2", "P3"]) {
    check(sourceAudit.counts.bySeverity?.[severity] === 0, `P8 v2 ${severity} count must be 0`);
  }
  check(isObject(sourceAudit.counts.byCode) && Object.keys(sourceAudit.counts.byCode).length === 0, "P8 v2 source audit has issue codes");
  checkArray(sourceAudit.issues, "P8 v2 source audit issues");
  check(sourceAudit.issues.length === 0, "P8 v2 source audit issue list must be empty");
  const cleanGate = evaluateP8SourceCleanGate(sourceAudit.counts.bySeverity);
  check(cleanGate.passed === true, "P8 v2 host P0/P1 clean gate did not pass");

  check(displayAudit.schemaVersion === 1, "P8 v2 display audit schemaVersion must be 1");
  check(displayAudit.reportId === "vetgeme-p8-display-language-audit", "P8 v2 display audit reportId mismatch");
  check(displayAudit.packageVersion === MEDICAL_REVIEW_INPUT_V40_VERSION, "P8 v2 display audit medical version mismatch");
  check(displayAudit.status === "passed", "P8 v2 display audit must pass");
  for (const [field, expected] of Object.entries({
    families: 39,
    variants: 215,
    presentations: 645,
    investigations: 1864,
    nullResults: 0,
    playerFacingFields: 9847,
    issues: 0,
  })) check(displayAudit.counts?.[field] === expected, `P8 v2 display count ${field} mismatch`);
  checkArray(displayAudit.issues, "P8 v2 display issues");
  check(displayAudit.issues.length === 0, "P8 v2 display issue list must be empty");

  check(staleSourceAudit.reportVersion === DIALOGUE_COMPONENT_VERSION, "stale audit sentinel unexpectedly changed version");
  check(staleSourceAudit.input?.packageVersion === "2026.07.16.39", "stale audit sentinel unexpectedly changed medical pin");
  check(staleSourceAudit.input?.sourceAggregateSha256 === "e3341e533e09a6f00d09180f7b78808cdf1867406492a27cd17f9dca11bc626c", "stale audit sentinel unexpectedly changed aggregate");

  check(medicalReviewInput.reviewOnly === true, "medical .40 dependency must be review-only");
  check(medicalReviewInput.productionEligible === false, "medical .40 dependency must remain production-ineligible");
  check(medicalReviewInput.generatorEligible === false, "medical .40 dependency must remain generator-ineligible");
  check(medicalReviewInput.productionPool.length === 0, "medical .40 production pool must remain 0");
  check(medicalReviewInput.registration.reviewInputVersion === MEDICAL_REVIEW_INPUT_V40_VERSION, "medical .40 dependency version drifted");
  check(medicalReviewInput.audit.investigations === 1864, "medical .40 investigation count mismatch");
  check(medicalReviewInput.audit.nullInvestigationResults === 0, "medical .40 contains null investigation results");
  check(medicalReviewInput.sourceIntegrity.aggregateSha256 === registration.medicalReviewInput.sourceIntegrity.aggregateSha256, "loaded medical .40 digest mismatch");
  check(operationalReviewInput.reviewOnly === true && operationalReviewInput.runtimeEligible === false, "operational dependency must remain review-only");
  check(operationalReviewInput.registration.reviewInputVersion === OPERATIONAL_VERSION, "operational dependency version drifted");
  check(operationalReviewInput.sourceIntegrity.aggregateSha256 === registration.operationalReviewInput.sourceIntegrity.aggregateSha256, "loaded operational dependency digest mismatch");
  check(sha256(p4OwnerProfileBytes) === registration.operationalReviewInput.catalogSha256.p4OwnerProfiles, "loaded P4 owner-profile digest mismatch");
  check(sha256(p4BehaviorCrosswalkBytes) === registration.operationalReviewInput.catalogSha256.p4BehaviorCrosswalk, "loaded P4 behavior-crosswalk digest mismatch");

  const medicalIndex = buildMedicalRecordIndex(medicalReviewInput);
  check(medicalIndex.records.filter((record) => record.recordType === "family").length === 39, "medical family record count mismatch");
  check(medicalIndex.records.filter((record) => record.recordType === "variant").length === 215, "medical variant record count mismatch");
  check(medicalIndex.records.filter((record) => record.recordType === "presentation").length === 645, "medical presentation record count mismatch");
  const p4Crosswalk = operationalReviewInput.catalogs["generated/p4/behavior-crosswalk.json"];
  const p4Refs = p4Crosswalk.presentations.map((entry) => entry.presentationRef);
  checkUnique(p4Refs, "P4 presentation refs");
  check(sameStrings(p4Refs, medicalIndex.presentationRefs), "P4/medical .40 presentation closure mismatch");
  const p3Research = operationalReviewInput.catalogs["generated/p3/research-catalog.json"].research
    .map((entry) => entry.researchId);
  const p3Usages = operationalReviewInput.catalogs["generated/p3/investigation-usage-policy.json"].usages;
  const usedResearchIds = new Set(p3Usages.map((entry) => entry.researchId));
  const unmappedResearchTasks = p3Research.filter((researchId) => !usedResearchIds.has(researchId)).sort();
  check(sameStrings(unmappedResearchTasks, EXPECTED_UNMAPPED_RESEARCH_TASKS), "P8 v2 unmapped research inventory changed");

  validateDialogueLayer(dialogue, dialogueValidation, policy, operationalReviewInput);
  validateReviewerDecisionTemplate(reviewerDecisionTemplate, registration);
  check(packageValidation.schemaVersion === 1, "P8 v2 package validation schemaVersion must be 1");
  check(packageValidation.packageId === registration.packageId, "P8 v2 package validation ID mismatch");
  check(packageValidation.packageVersion === registration.packageVersion, "P8 v2 package validation version mismatch");
  check(packageValidation.status === "pass", "P8 v2 package structural validation must pass");
  check(packageValidation.sourceDefectsRemainOpen === 0, "P8 v2 source defects remain open");
  check(packageValidation.displayDefectsRemainOpen === 0, "P8 v2 display defects remain open");
  check(packageValidation.activationAllowed === false, "P8 v2 package validation must forbid activation");
  checkArray(packageValidation.issues, "P8 v2 package validation issues");
  check(packageValidation.issues.length === 0, "P8 v2 package validation contains issues");

  check(isObject(baselineManifest), "tier-01-v2 baseline manifest is missing");
  check(baselineManifest.caseCount === 30, "tier-01-v2 baseline must remain at 30 cases");
  checkArray(baselineManifest.cases, "tier-01-v2 baseline cases");
  check(baselineManifest.cases.length === 30, "tier-01-v2 case list must remain at 30 cases");
  const baselineCaseIds = baselineManifest.cases.map((entry) => entry.id);
  checkUnique(baselineCaseIds, "tier-01-v2 baseline case IDs");
  const baselineCrosswalkMatches = [];
  for (const caseId of baselineCaseIds) {
    for (const [relativePath, bytes] of sourceBytesByPath) {
      if (Buffer.from(bytes).includes(Buffer.from(caseId, "utf8"))) baselineCrosswalkMatches.push({ caseId, path: relativePath });
    }
  }
  check(baselineCrosswalkMatches.length === 0, "P8 v2 contains an unapproved current-case crosswalk");
  const actualDecisionFiles = sourceFiles.filter((file) => /reviewer-decision/iu.test(file)
    && file !== "source/reviewer-decision-template.json");
  const activationManifestFiles = sourceFiles.filter((file) => /activation.?manifest/iu.test(file));
  check(actualDecisionFiles.length === 0, "P8 v2 contains an actual reviewer decision set");
  check(activationManifestFiles.length === 0, "P8 v2 contains an activation manifest");

  const blockers = [
    makeBlocker("p8_external_veterinary_approval_missing", "No designated external veterinary reviewer has approved an exact record version.", { externalVeterinaryApproval: false }),
    makeBlocker("p8_reviewer_decisions_missing", "Only a fail-closed reviewer decision template is present.", { actualDecisionFiles }),
    makeBlocker("p8_activation_manifest_missing", "No activation manifest exists or may be generated before approval.", { activationManifestFiles }),
    makeBlocker("p8_player_facing_dialogue_runtime_forbidden", "The dialogue library remains runtime-ineligible.", { runtimeEligible: dialogue.runtimeEligible, authority: P8_V2_DIALOGUE_AUTHORITY }),
    makeBlocker("p8_upstream_catalogs_review_only", "Medical and operational dependencies remain review-only.", { medicalProductionEligible: false, operationalRuntimeEligible: false }),
    makeBlocker("p8_operational_semantics_not_audited", "P8 language review does not grant P3/P5/P6/P7 production authority.", { auditedOperationalLayers: ["p4_owner_profile_refs", "p4_behavior_crosswalk_refs"] }),
    makeBlocker("p8_unmapped_research_tasks", "Three P3 research tasks remain without presentation usage.", { researchIds: unmappedResearchTasks }),
  ];
  check(sameStrings(blockers.map((blocker) => blocker.id), EXPECTED_BLOCKER_IDS), "P8 v2 blocker inventory changed");

  return deepFreeze({
    counts: {
      sourceFiles: sourceFiles.length,
      sourceBytes: [...sourceBytesByPath.values()].reduce((total, bytes) => total + bytes.length, 0),
      families: 39,
      variants: 215,
      presentations: 645,
      investigations: 1864,
      playerFacingFields: 9847,
      auditIssues: 0,
      p0: 0,
      p1: 0,
      p2: 0,
      p3: 0,
      ownerProfiles: 12,
      doctorSpeechFunctions: 15,
      rareAbsurdEvents: 4,
      p4Presentations: p4Refs.length,
      p3ResearchTasks: p3Research.length,
      p3InvestigationUsages: p3Usages.length,
      baselineCases: baselineCaseIds.length,
      baselineCrosswalkMatches: baselineCrosswalkMatches.length,
      productionPool: 0,
    },
    cleanGate,
    p4PresentationClosure: { medical: medicalIndex.presentationRefs.size, operational: p4Refs.length, exact: true },
    unmappedResearchTasks,
    dialogueAuthority: P8_V2_DIALOGUE_AUTHORITY,
    reviewRecords: medicalIndex.records,
    baselineCaseIdCrosswalkMatches: baselineCrosswalkMatches,
    reviewerDecisionGate: {
      importAllowed: false,
      externalVeterinaryApproval: false,
      activationManifestAllowed: false,
      actualDecisionFiles,
    },
    nonAuthoritativeArtifacts: [{
      path: STALE_SOURCE_AUDIT_PATH,
      reason: "stale_v1_medical_v39_snapshot_not_listed_in_manifest_authoritative_files",
    }],
    hostRisks: [{
      id: "bundled_require_clean_checks_p0_status_only",
      mitigatedBy: "host_clean_gate_requires_p0_and_p1_zero",
    }, {
      id: "family_review_decision_labels_still_name_pending_correction",
      mitigatedBy: "record_status_remains_external_review_pending_and_no_approval_is_inferred",
    }],
    blockers,
  });
}

export async function loadP8V2AuthoringReviewInputFromReader(reader, registry, options = {}) {
  check(reader && typeof reader.readBytes === "function", "reader.readBytes is required");
  check(reader && typeof reader.listFiles === "function", "reader.listFiles is required");
  const registration = resolveP8V2AuthoringReviewInput(registry, options);
  const sourceRoot = joinPath(registration.root, registration.sourceRoot);
  const provenancePath = joinPath(registration.root, registration.provenancePath);
  const p4OwnerProfilePath =
    "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.1/source/generated/p4/owner-profile-catalog.json";
  const p4BehaviorCrosswalkPath =
    "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.1/source/generated/p4/behavior-crosswalk.json";
  const [
    provenanceBytes,
    sourceFiles,
    baselineManifestBytes,
    p4OwnerProfileBytes,
    p4BehaviorCrosswalkBytes,
    hostReviewerTemplateBytes,
    hostReviewerSchemaBytes,
    hostReviewerReadmeBytes,
    medicalReviewInput,
    operationalReviewInput,
  ] = await Promise.all([
    reader.readBytes(provenancePath),
    reader.listFiles(sourceRoot),
    reader.readBytes(P8_V2_BASELINE_MANIFEST_PATH),
    reader.readBytes(p4OwnerProfilePath),
    reader.readBytes(p4BehaviorCrosswalkPath),
    reader.readBytes(registration.reviewerDecisionContract.hostTemplatePath),
    reader.readBytes(registration.reviewerDecisionContract.schemaPath),
    reader.readBytes(registration.reviewerDecisionContract.readmePath),
    loadMedicalAuthoringReviewInputFromReader(reader, registry, {
      context: P8_REVIEW_INPUT_V2_CONTEXT,
      reviewInputId: registration.medicalReviewInput.reviewInputId,
      reviewInputVersion: registration.medicalReviewInput.reviewInputVersion,
    }),
    loadOperationalAuthoringReviewInputFromReader(reader, registry, {
      context: P8_REVIEW_INPUT_V2_CONTEXT,
      reviewInputId: registration.operationalReviewInput.reviewInputId,
      reviewInputVersion: registration.operationalReviewInput.reviewInputVersion,
    }),
  ]);
  check(sha256(provenanceBytes) === registration.sourceIntegrity.provenanceSha256, "P8 v2 provenance file SHA-256 mismatch");
  check(
    sha256(hostReviewerTemplateBytes) === registration.reviewerDecisionContract.hostTemplateSha256,
    "host reviewer template SHA-256 mismatch",
  );
  check(
    sha256(hostReviewerSchemaBytes) === registration.reviewerDecisionContract.schemaSha256,
    "host reviewer schema SHA-256 mismatch",
  );
  check(
    sha256(hostReviewerReadmeBytes) === registration.reviewerDecisionContract.readmeSha256,
    "host reviewer README SHA-256 mismatch",
  );
  const provenance = parseJson(provenanceBytes, provenancePath);
  const sourceBytesByPath = new Map();
  await Promise.all(sourceFiles.map(async (relativePath) => {
    sourceBytesByPath.set(relativePath, await reader.readBytes(joinPath(sourceRoot, relativePath)));
  }));
  const sourceIntegrity = validateP8V2SourceProvenance(
    registration,
    provenance,
    sourceFiles,
    sourceBytesByPath,
  );
  const json = (relativePath) => parseJson(sourceBytesByPath.get(relativePath), relativePath);
  const manifest = json("MANIFEST.json");
  const policy = json("source/p8-review-policy.json");
  const sourceAudit = json("generated/P8_SOURCE_AUDIT.json");
  const staleSourceAudit = json(STALE_SOURCE_AUDIT_PATH);
  const displayAudit = json(DISPLAY_AUDIT_PATH);
  const dialogue = json("source/human-dialogue-library.json");
  const dialogueValidation = json("generated/P8_DIALOGUE_VALIDATION.json");
  const packageValidation = json("generated/P8_PACKAGE_VALIDATION.json");
  const reviewerDecisionTemplate = json("source/reviewer-decision-template.json");
  const reviewerDecisionHostTemplate = parseJson(
    hostReviewerTemplateBytes,
    registration.reviewerDecisionContract.hostTemplatePath,
  );
  const reviewerDecisionHostSchema = parseJson(
    hostReviewerSchemaBytes,
    registration.reviewerDecisionContract.schemaPath,
  );
  const baselineManifest = parseJson(baselineManifestBytes, P8_V2_BASELINE_MANIFEST_PATH);
  const audit = validateP8V2AuthoringPackage({
    registration,
    manifest,
    sourceFiles,
    sourceBytesByPath,
    policy,
    sourceAudit,
    staleSourceAudit,
    displayAudit,
    dialogue,
    dialogueValidation,
    packageValidation,
    reviewerDecisionTemplate,
    medicalReviewInput,
    operationalReviewInput,
    p4OwnerProfileBytes,
    p4BehaviorCrosswalkBytes,
    baselineManifest,
  });
  const reviewerDecisionHostContract = validateHostReviewerDecisionContract({
    hostTemplate: reviewerDecisionHostTemplate,
    schema: reviewerDecisionHostSchema,
    readme: hostReviewerReadmeBytes.toString("utf8"),
    authorTemplate: reviewerDecisionTemplate,
    registration,
  });

  return deepFreeze({
    loadContext: P8_REVIEW_INPUT_V2_CONTEXT,
    reviewOnly: true,
    productionEligible: false,
    runtimeEligible: false,
    generatorEligible: false,
    activationAllowed: false,
    externalVeterinaryApproval: false,
    allowCurrentCaseCrosswalk: false,
    registration: clone(registration),
    manifest: clone(manifest),
    policy: clone(policy),
    sourceAudit: clone(sourceAudit),
    displayAudit: clone(displayAudit),
    dialogue: clone(dialogue),
    packageValidation: clone(packageValidation),
    reviewerDecisionTemplate: clone(reviewerDecisionTemplate),
    reviewerDecisionHostTemplate: clone(reviewerDecisionHostTemplate),
    reviewerDecisionHostSchema: clone(reviewerDecisionHostSchema),
    reviewerDecisionHostContract,
    sourceIntegrity,
    medicalReviewInput,
    medicalReviewInputIdentity: {
      reviewInputId: medicalReviewInput.registration.reviewInputId,
      reviewInputVersion: medicalReviewInput.registration.reviewInputVersion,
      aggregateSha256: medicalReviewInput.sourceIntegrity.aggregateSha256,
      archiveSha256: medicalReviewInput.sourceIntegrity.archiveSha256,
    },
    operationalReviewInputIdentity: {
      reviewInputId: operationalReviewInput.registration.reviewInputId,
      reviewInputVersion: operationalReviewInput.registration.reviewInputVersion,
      aggregateSha256: operationalReviewInput.sourceIntegrity.aggregateSha256,
      p4OwnerProfilesSha256: registration.operationalReviewInput.catalogSha256.p4OwnerProfiles,
      p4BehaviorCrosswalkSha256: registration.operationalReviewInput.catalogSha256.p4BehaviorCrosswalk,
    },
    productionPool: Object.freeze([]),
    reviewerDecisionSets: Object.freeze([]),
    activationManifests: Object.freeze([]),
    audit,
    blockers: clone(audit.blockers),
  });
}

export async function loadP8V2AuthoringReviewInput(projectRoot, options = {}) {
  const reader = createFileSystemReviewInputReader(projectRoot);
  const registry = parseJson(
    await reader.readBytes(REVIEW_INPUT_REGISTRY_PATH),
    REVIEW_INPUT_REGISTRY_PATH,
  );
  return loadP8V2AuthoringReviewInputFromReader(reader, registry, options);
}

export { validateP8ReviewerDecisionSet };
