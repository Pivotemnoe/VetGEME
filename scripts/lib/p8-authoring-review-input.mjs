import { createHash } from "node:crypto";

import {
  REVIEW_INPUT_REGISTRY_PATH,
  createFileSystemReviewInputReader,
  loadMedicalAuthoringReviewInputFromReader,
  validateReviewInputRegistry,
} from "./medical-authoring-review-input.mjs";
import { loadOperationalAuthoringReviewInputFromReader } from "./operational-authoring-review-input.mjs";

export const P8_REVIEW_INPUT_ID = "vetgeme-p8-medical-review-authoring";
export const P8_REVIEW_INPUT_VERSION = "2026.07.16.1";
export const P8_REVIEW_INPUT_ROOT =
  "content/review-inputs/vetgeme-p8-medical-review-authoring-2026.07.16.1";
export const P8_REVIEW_CONTEXT = "review";
export const P8_REVIEW_STATUS = "audit_complete_correction_required_activation_forbidden";
export const P8_BASELINE_MANIFEST_PATH =
  "content/packs/tier-01-v2/clinical/tier-01/manifest.json";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const EXPECTED_COUNTS = Object.freeze({
  sourceFiles: 16,
  sourceBytes: 4561393,
  families: 39,
  variants: 215,
  presentations: 645,
  sourceEntries: 221,
  auditIssues: 5976,
  p0: 735,
  p1: 5241,
  p2: 0,
  p3: 0,
  ownerProfiles: 12,
  doctorSpeechFunctions: 15,
  rareAbsurdEvents: 4,
  p4Presentations: 645,
  productionPool: 0,
});
const EXPECTED_AUDIT_CODES = Object.freeze({
  DOCTOR_INSTRUCTION_NOT_SPEECH: 521,
  PLAYER_TEXT_EMPTY: 4,
  PLAYER_TEXT_NOT_RUSSIAN: 4720,
  SERVICE_TOKEN_IN_PLAYER_TEXT: 731,
});
const EXPECTED_UNMAPPED_RESEARCH_TASKS = Object.freeze([
  "gi_abdominal_palpation",
  "parasite_risk_and_prevention_history",
  "vestibular_owner_home_environment_and_emergency_red_flag_plan",
]);
const EXPECTED_BLOCKER_IDS = Object.freeze([
  "p8_source_correction_gate_blocked",
  "p8_bundled_p1_clean_gate_incomplete",
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
const BLOCKED_HUMOR_URGENCY_BANDS = Object.freeze([
  "emergency",
  "emergency_priority",
  "emergency_suspicion",
]);
const DECISION_VALUES = new Set(["approved", "changes_required", "rejected", "not_reviewed"]);
const REVIEW_SEVERITIES = new Set(["P0", "P1", "P2", "P3"]);
const DECISION_DOMAIN_KEYS = Object.freeze([
  "clinicalTruth",
  "differentialsAndExclusions",
  "investigationsAndInterpretation",
  "safeAndUnsafeDecisions",
  "equipmentAndReferral",
  "followUpAndOutcomes",
  "ownerAndDoctorLanguage",
  "sourcesAndScope",
]);
const DIALOGUE_AUTHORITY = Object.freeze({
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
  throw new Error(`P8 authoring review input validation failed: ${message}`);
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

export function evaluateP8SourceCleanGate(bySeverity) {
  check(isObject(bySeverity), "source severity counts are required");
  for (const severity of ["P0", "P1"]) checkInteger(bySeverity[severity], `source severity ${severity}`);
  return deepFreeze({
    allowedP0: 0,
    allowedP1: 0,
    actualP0: bySeverity.P0,
    actualP1: bySeverity.P1,
    p0Clean: bySeverity.P0 === 0,
    p1Clean: bySeverity.P1 === 0,
    passed: bySeverity.P0 === 0 && bySeverity.P1 === 0,
  });
}

export function validateP8ReviewInputRegistration(registration) {
  check(isObject(registration), "review input registration must be an object");
  check(registration.reviewInputId === P8_REVIEW_INPUT_ID, "unexpected reviewInputId");
  check(registration.reviewInputVersion === P8_REVIEW_INPUT_VERSION, "unexpected reviewInputVersion");
  check(registration.kind === "p8_medical_review_authoring", "review input kind must be p8_medical_review_authoring");
  check(registration.packageId === P8_REVIEW_INPUT_ID, "packageId mismatch");
  check(registration.packageVersion === P8_REVIEW_INPUT_VERSION, "packageVersion mismatch");
  check(registration.root === P8_REVIEW_INPUT_ROOT, "P8 review root mismatch");
  checkSafePath(registration.root, "root");
  check(registration.sourceRoot === "source", "sourceRoot must be source");
  check(registration.manifestPath === "source/MANIFEST.json", "manifestPath must target source/MANIFEST.json");
  check(registration.provenancePath === "provenance.json", "provenancePath must be provenance.json");
  check(registration.status === P8_REVIEW_STATUS, `status must remain ${P8_REVIEW_STATUS}`);
  for (const field of ["reviewOnly"]) check(registration[field] === true, `${field} must be true`);
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
      === "3fd8cc0f563674ecdee7a8c1327f3739426788ef41091d227d24f73e88067ba5",
    "P8 provenance digest mismatch",
  );
  check(
    registration.sourceIntegrity.aggregateSha256
      === "5047a9c35b07836603c3ef740610a76924cb9fc25e917f725f6cef2a9f27b6fe",
    "P8 aggregate digest mismatch",
  );
  check(
    registration.sourceIntegrity.archiveSha256
      === "1c7bd9da610cc03f08081023e613651b025bb677371a4ad3161e02960d6477eb",
    "P8 archive digest mismatch",
  );

  check(isObject(registration.medicalReviewInput), "medicalReviewInput pin is required");
  check(
    registration.medicalReviewInput.reviewInputId === "vetgeme-medical-production-authoring"
      && registration.medicalReviewInput.reviewInputVersion === "2026.07.16.39",
    "medical review input identity mismatch",
  );
  check(registration.medicalReviewInput.productionEligible === false, "medical dependency must remain review-only");
  check(registration.medicalReviewInput.generatorEligible === false, "medical dependency must remain generator-ineligible");
  check(
    registration.medicalReviewInput.sourceIntegrity?.archiveSha256
      === "54a6cec64406dd4e326aa5ff089cbd3878ef7cd17a4bb7ed01123c7a93da822c",
    "medical dependency archive digest mismatch",
  );
  check(
    registration.medicalReviewInput.sourceIntegrity?.aggregateSha256
      === "e3341e533e09a6f00d09180f7b78808cdf1867406492a27cd17f9dca11bc626c",
    "medical dependency aggregate digest mismatch",
  );

  check(isObject(registration.operationalReviewInput), "operationalReviewInput pin is required");
  check(
    registration.operationalReviewInput.reviewInputId === "vetgeme-operational-production-authoring"
      && registration.operationalReviewInput.reviewInputVersion === "2026.07.16.1",
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

export function resolveP8AuthoringReviewInput(registry, options = {}) {
  const registrations = validateReviewInputRegistry(registry);
  check(Object.prototype.hasOwnProperty.call(options, "context"), "explicit review context is required");
  check(options.context === P8_REVIEW_CONTEXT, `${String(options.context)} context is forbidden; review is the only allowed context`);
  const reviewInputId = options.reviewInputId || P8_REVIEW_INPUT_ID;
  const reviewInputVersion = options.reviewInputVersion || P8_REVIEW_INPUT_VERSION;
  const registration = registrations.find((entry) => (
    entry.reviewInputId === reviewInputId && entry.reviewInputVersion === reviewInputVersion
  ));
  check(registration, `unknown review input ${reviewInputId}@${reviewInputVersion}`);
  return validateP8ReviewInputRegistration(registration);
}

export function validateP8SourceProvenance(registration, provenance, sourceFiles, sourceBytesByPath) {
  validateP8ReviewInputRegistration(registration);
  const identity = `${registration.reviewInputId}@${registration.reviewInputVersion}`;
  check(isObject(provenance), `${identity}: provenance is missing`);
  check(provenance.schemaVersion === 1, `${identity}: provenance schemaVersion must be 1`);
  check(
    provenance.provenanceId === "vetgeme-p8-medical-review-authoring-review-source",
    `${identity}: provenanceId mismatch`,
  );
  check(provenance.packageId === registration.packageId, `${identity}: provenance packageId mismatch`);
  check(provenance.packageVersion === registration.packageVersion, `${identity}: provenance packageVersion mismatch`);
  check(
    provenance.sourceArchive === "p8-medical-review-authoring-2026.07.16.1.zip",
    `${identity}: source archive identity mismatch`,
  );
  check(provenance.sourceDirectory === "p8-medical-review-authoring", `${identity}: source directory identity mismatch`);
  check(isObject(provenance.archive), `${identity}: archive provenance is missing`);
  check(provenance.archive.path === provenance.sourceArchive, `${identity}: archive path mismatch`);
  check(
    provenance.archive.checksumPath === "p8-medical-review-authoring-2026.07.16.1.zip.sha256",
    `${identity}: archive checksum path mismatch`,
  );
  check(provenance.archive.sha256 === registration.sourceIntegrity.archiveSha256, `${identity}: archive digest mismatch`);
  check(provenance.archive.zipEntryCount === 20, `${identity}: archive entry count mismatch`);
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

function recordKey(record) {
  return [record.recordType, record.familyId, record.variantId || "", record.presentationId || ""].join(":");
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
  check(template.decisions.length === 1, "reviewer template must contain exactly one placeholder decision");
  const decision = template.decisions[0];
  check(decision.familyId === "replace-with-family-id", "reviewer template must not contain an actual family decision");
  check(decision.exactVersion === "replace-with-exact-version", "reviewer template must not contain an actual record version");
  check(decision.decision === "changes_required", "reviewer template placeholder decision mismatch");
  check(decision.reviewerSignature === null, "reviewer template must not contain a signature");
  check(
    template.activationRecommendation === "forbidden_until_all_target_records_approved_and_clean_audit_passes",
    "reviewer template activation recommendation must remain fail-closed",
  );
}

function validateDialogueLayer(dialogue, dialogueValidation, policy, operationalReviewInput) {
  check(dialogue.schemaVersion === 1, "dialogue library schemaVersion must be 1");
  check(dialogue.catalogId === "vetgeme-p8-human-dialogue-library", "dialogue catalogId mismatch");
  check(dialogue.catalogVersion === P8_REVIEW_INPUT_VERSION, "dialogue catalogVersion mismatch");
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
      event.allowedUrgency.every((urgency) => !BLOCKED_HUMOR_URGENCY_BANDS.includes(urgency)),
      `${event.eventId}: absurd event is allowed during an emergency urgency band`,
    );
  }
  check(
    sameStrings(policy.dialogue.rareAbsurdEventBlockedUrgencyBands, BLOCKED_HUMOR_URGENCY_BANDS),
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
  check(dialogueValidation.catalogVersion === P8_REVIEW_INPUT_VERSION, "dialogue validation version mismatch");
  check(dialogueValidation.status === "pass", "dialogue structural validation must pass");
  check(dialogueValidation.counts?.issues === 0, "dialogue structural validation contains issues");
  check(dialogueValidation.counts?.actualOwnerProfiles === EXPECTED_COUNTS.ownerProfiles, "dialogue validation owner count mismatch");
  check(dialogueValidation.counts?.doctorFunctions === EXPECTED_COUNTS.doctorSpeechFunctions, "dialogue validation doctor count mismatch");
  check(dialogueValidation.counts?.rareAbsurdEvents === EXPECTED_COUNTS.rareAbsurdEvents, "dialogue validation event count mismatch");
  checkArray(dialogueValidation.issues, "dialogue validation issues");
  check(dialogueValidation.issues.length === 0, "dialogue validation issue list must be empty");
}

export function validateP8AuthoringPackage({
  registration,
  manifest,
  sourceFiles,
  sourceBytesByPath,
  policy,
  sourceAudit,
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
  validateP8ReviewInputRegistration(registration);
  check(isObject(manifest), "P8 manifest is missing");
  check(manifest.schemaVersion === 1, "P8 manifest schemaVersion must be 1");
  check(manifest.packageId === registration.packageId, "P8 manifest packageId mismatch");
  check(manifest.packageVersion === registration.packageVersion, "P8 manifest packageVersion mismatch");
  check(manifest.status === registration.status, "P8 manifest status mismatch");
  check(manifest.activationAllowed === false, "P8 manifest activation must remain forbidden");
  check(manifest.input?.packageId === registration.medicalReviewInput.reviewInputId, "P8 manifest medical packageId mismatch");
  check(manifest.input?.packageVersion === registration.medicalReviewInput.reviewInputVersion, "P8 manifest medical version mismatch");
  check(manifest.input?.archiveSha256 === registration.medicalReviewInput.sourceIntegrity.archiveSha256, "P8 manifest medical archive digest mismatch");
  check(manifest.input?.sourceAggregateSha256 === registration.medicalReviewInput.sourceIntegrity.aggregateSha256, "P8 manifest medical aggregate digest mismatch");
  for (const field of ["families", "variants", "presentations", "auditIssues", "p0", "p1", "ownerProfiles", "doctorSpeechFunctions"]) {
    check(manifest.counts?.[field] === EXPECTED_COUNTS[field], `P8 manifest count ${field} mismatch`);
  }
  check(manifest.gates?.sourceAudit === "blocked", "P8 source audit gate must remain blocked");
  check(manifest.gates?.humanDialogueLibrary === "pass", "P8 dialogue structural gate mismatch");
  check(manifest.gates?.correctionComplete === false, "P8 correction gate must remain false");
  check(manifest.gates?.externalVeterinaryApproval === false, "P8 veterinary approval must remain false");
  check(manifest.gates?.activationManifestPresent === false, "P8 activation manifest gate must remain false");
  checkArray(manifest.authoritativeFiles, "P8 authoritative files");
  checkUnique(manifest.authoritativeFiles, "P8 authoritative files");
  for (const relativePath of manifest.authoritativeFiles) {
    checkSafePath(relativePath, `P8 authoritative file ${relativePath}`);
    const bytes = sourceBytesByPath.get(relativePath);
    check(bytes !== undefined, `P8 authoritative file is missing: ${relativePath}`);
    check(manifest.fileSha256?.[relativePath] === sha256(bytes), `P8 authoritative digest mismatch: ${relativePath}`);
  }

  check(policy.schemaVersion === 1, "P8 policy schemaVersion must be 1");
  check(policy.packageId === registration.packageId, "P8 policy packageId mismatch");
  check(policy.packageVersion === registration.packageVersion, "P8 policy packageVersion mismatch");
  check(policy.status === "audit_in_progress_activation_forbidden", "P8 policy status mismatch");
  check(policy.input?.packageId === registration.medicalReviewInput.reviewInputId, "P8 policy medical packageId mismatch");
  check(policy.input?.packageVersion === registration.medicalReviewInput.reviewInputVersion, "P8 policy medical version mismatch");
  check(policy.input?.archiveSha256 === registration.medicalReviewInput.sourceIntegrity.archiveSha256, "P8 policy medical archive digest mismatch");
  check(policy.input?.sourceAggregateSha256 === registration.medicalReviewInput.sourceIntegrity.aggregateSha256, "P8 policy medical aggregate digest mismatch");
  check(policy.activation?.generatorEligible === false, "P8 policy generator eligibility must remain false");
  check(policy.activation?.productionPoolSize === 0, "P8 policy production pool must remain 0");
  check(policy.activation?.approvalMayBeGrantedByAutomation === false, "P8 automation may not grant approval");
  check(policy.activation?.approvalAuthority === "designated_external_veterinary_reviewer", "P8 approval authority mismatch");
  check(policy.activation?.activationManifestAllowedBeforeApproval === false, "P8 activation manifest may not precede approval");
  check(policy.finalGate?.allowedP0 === 0 && policy.finalGate?.allowedP1 === 0, "P8 clean gate must require both P0=0 and P1=0");
  check(policy.finalGate?.families === 39 && policy.finalGate?.variants === 215 && policy.finalGate?.presentations === 645, "P8 final gate record counts mismatch");
  check(policy.finalGate?.requiresVeterinaryDecisionForEveryActivatedVersion === true, "P8 exact-version veterinary decision gate is missing");

  check(sourceAudit.schemaVersion === 1, "P8 source audit schemaVersion must be 1");
  check(sourceAudit.reportId === "vetgeme-p8-source-audit", "P8 source audit reportId mismatch");
  check(sourceAudit.reportVersion === registration.packageVersion, "P8 source audit version mismatch");
  check(sourceAudit.status === "blocked", "P8 source audit must remain blocked");
  check(sourceAudit.activationAllowed === false, "P8 source audit activation must remain false");
  check(sourceAudit.input?.sourceAggregateSha256 === registration.medicalReviewInput.sourceIntegrity.aggregateSha256, "P8 source audit medical digest mismatch");
  for (const [field, expected] of Object.entries({
    families: 39,
    variants: 215,
    presentations: 645,
    sourceEntries: 221,
    uniquePresentationRefs: 645,
    p4PresentationRefs: 645,
    issues: 5976,
  })) check(sourceAudit.counts?.[field] === expected, `P8 source audit count ${field} mismatch`);
  for (const severity of ["P0", "P1", "P2", "P3"]) {
    check(sourceAudit.counts.bySeverity?.[severity] === EXPECTED_COUNTS[severity.toLowerCase()], `P8 ${severity} count mismatch`);
  }
  for (const [code, count] of Object.entries(EXPECTED_AUDIT_CODES)) {
    check(sourceAudit.counts.byCode?.[code] === count, `P8 issue-code count ${code} mismatch`);
  }
  const cleanGate = evaluateP8SourceCleanGate(sourceAudit.counts.bySeverity);
  check(cleanGate.passed === false, "P8 source clean gate unexpectedly passed");
  checkArray(sourceAudit.issues, "P8 source audit issues");
  check(sourceAudit.issues.length === EXPECTED_COUNTS.auditIssues, "P8 source audit issue list count mismatch");
  checkUnique(sourceAudit.issues.map((issue) => issue.issueId), "P8 source audit issue IDs");
  check(sourceAudit.issues.every((issue) => issue.status === "open"), "P8 source audit contains a non-open issue");

  check(medicalReviewInput.reviewOnly === true, "medical dependency must be review-only");
  check(medicalReviewInput.productionEligible === false, "medical dependency must remain production-ineligible");
  check(medicalReviewInput.generatorEligible === false, "medical dependency must remain generator-ineligible");
  check(medicalReviewInput.productionPool.length === 0, "medical dependency production pool must remain 0");
  check(medicalReviewInput.registration.reviewInputVersion === "2026.07.16.39", "medical dependency version drifted");
  check(medicalReviewInput.sourceIntegrity.aggregateSha256 === registration.medicalReviewInput.sourceIntegrity.aggregateSha256, "loaded medical dependency digest mismatch");
  check(operationalReviewInput.reviewOnly === true && operationalReviewInput.runtimeEligible === false, "operational dependency must remain review-only");
  check(operationalReviewInput.registration.reviewInputVersion === "2026.07.16.1", "operational dependency version drifted");
  check(operationalReviewInput.sourceIntegrity.aggregateSha256 === registration.operationalReviewInput.sourceIntegrity.aggregateSha256, "loaded operational dependency digest mismatch");
  check(sha256(p4OwnerProfileBytes) === registration.operationalReviewInput.catalogSha256.p4OwnerProfiles, "loaded P4 owner-profile digest mismatch");
  check(sha256(p4BehaviorCrosswalkBytes) === registration.operationalReviewInput.catalogSha256.p4BehaviorCrosswalk, "loaded P4 behavior-crosswalk digest mismatch");

  const medicalIndex = buildMedicalRecordIndex(medicalReviewInput);
  const recordByKey = new Map(medicalIndex.records.map((record) => [recordKey(record), record]));
  check(medicalIndex.records.filter((record) => record.recordType === "family").length === 39, "medical family record count mismatch");
  check(medicalIndex.records.filter((record) => record.recordType === "variant").length === 215, "medical variant record count mismatch");
  check(medicalIndex.records.filter((record) => record.recordType === "presentation").length === 645, "medical presentation record count mismatch");
  for (const issue of sourceAudit.issues) {
    const familyKey = recordKey({ recordType: "family", familyId: issue.familyId });
    check(recordByKey.has(familyKey), `${issue.issueId}: unknown medical family`);
    if (issue.variantId) {
      const variantKey = recordKey({ recordType: "variant", familyId: issue.familyId, variantId: issue.variantId });
      check(recordByKey.has(variantKey), `${issue.issueId}: unknown medical variant`);
    }
    if (issue.presentationId) {
      const presentationKey = recordKey({
        recordType: "presentation",
        familyId: issue.familyId,
        variantId: issue.variantId,
        presentationId: issue.presentationId,
      });
      check(recordByKey.has(presentationKey), `${issue.issueId}: unknown medical presentation`);
      check(issue.presentationRef === `${issue.familyId}.${issue.variantId}.${issue.presentationId}`, `${issue.issueId}: presentationRef mismatch`);
    }
  }

  const p4Crosswalk = operationalReviewInput.catalogs["generated/p4/behavior-crosswalk.json"];
  const p4Refs = p4Crosswalk.presentations.map((entry) => entry.presentationRef);
  checkUnique(p4Refs, "P4 presentation refs");
  check(sameStrings(p4Refs, medicalIndex.presentationRefs), "P4/medical presentation closure mismatch");
  const p3Research = operationalReviewInput.catalogs["generated/p3/research-catalog.json"].research
    .map((entry) => entry.researchId);
  const p3Usages = operationalReviewInput.catalogs["generated/p3/investigation-usage-policy.json"].usages;
  const usedResearchIds = new Set(p3Usages.map((entry) => entry.researchId));
  const unmappedResearchTasks = p3Research.filter((researchId) => !usedResearchIds.has(researchId)).sort();
  check(
    sameStrings(unmappedResearchTasks, EXPECTED_UNMAPPED_RESEARCH_TASKS),
    "P8 unmapped research-task inventory changed",
  );

  validateDialogueLayer(dialogue, dialogueValidation, policy, operationalReviewInput);
  validateReviewerDecisionTemplate(reviewerDecisionTemplate, registration);
  check(packageValidation.schemaVersion === 1, "P8 package validation schemaVersion must be 1");
  check(packageValidation.packageId === registration.packageId, "P8 package validation packageId mismatch");
  check(packageValidation.packageVersion === registration.packageVersion, "P8 package validation version mismatch");
  check(packageValidation.status === "pass", "P8 package structural validation must pass");
  check(packageValidation.sourceDefectsRemainOpen === EXPECTED_COUNTS.auditIssues, "P8 open-defect count mismatch");
  check(packageValidation.activationAllowed === false, "P8 package validation must not allow activation");
  checkArray(packageValidation.issues, "P8 package validation issues");
  check(packageValidation.issues.length === 0, "P8 package validation contains structural issues");

  const auditScript = Buffer.from(sourceBytesByPath.get("scripts/audit-p8-source.mjs")).toString("utf8");
  check(
    auditScript.includes('issues.some((item) => item.severity === "P0") ? "blocked" : "reviewable"'),
    "bundled source-audit clean-gate evidence changed",
  );
  check(
    !auditScript.includes('item.severity === "P1") ? "blocked"'),
    "bundled source-audit P1-only gap evidence changed",
  );

  check(isObject(baselineManifest), "tier-01-v2 baseline manifest is missing");
  check(baselineManifest.caseCount === 30, "tier-01-v2 baseline must remain at 30 cases");
  checkArray(baselineManifest.cases, "tier-01-v2 baseline cases");
  check(baselineManifest.cases.length === 30, "tier-01-v2 baseline case list must remain at 30 cases");
  const baselineCaseIds = baselineManifest.cases.map((entry) => entry.id);
  checkUnique(baselineCaseIds, "tier-01-v2 baseline case IDs");
  const baselineCrosswalkMatches = [];
  for (const caseId of baselineCaseIds) {
    for (const [relativePath, bytes] of sourceBytesByPath) {
      if (Buffer.from(bytes).includes(Buffer.from(caseId, "utf8"))) baselineCrosswalkMatches.push({ caseId, path: relativePath });
    }
  }
  check(baselineCrosswalkMatches.length === 0, "P8 review input contains an unapproved current 30-card crosswalk");

  const actualDecisionFiles = sourceFiles.filter((file) => /reviewer-decision/iu.test(file)
    && file !== "source/reviewer-decision-template.json");
  const activationManifestFiles = sourceFiles.filter((file) => /activation.?manifest/iu.test(file));
  check(actualDecisionFiles.length === 0, "P8 review input contains an actual reviewer decision set");
  check(activationManifestFiles.length === 0, "P8 review input contains an activation manifest");

  const blockers = [
    makeBlocker("p8_source_correction_gate_blocked", "Open P0/P1 defects keep source correction and activation blocked.", cleanGate),
    makeBlocker("p8_bundled_p1_clean_gate_incomplete", "The bundled --require-clean gate only keys off P0; the host requires both P0=0 and P1=0.", { hostGate: cleanGate, bundledChecksP1: false }),
    makeBlocker("p8_external_veterinary_approval_missing", "No designated external veterinary reviewer has approved an exact record version.", { externalVeterinaryApproval: false }),
    makeBlocker("p8_reviewer_decisions_missing", "Only a fail-closed reviewer decision template is present.", { actualDecisionFiles }),
    makeBlocker("p8_activation_manifest_missing", "No activation manifest exists or may be generated before approval.", { activationManifestFiles }),
    makeBlocker("p8_player_facing_dialogue_runtime_forbidden", "The dialogue library is structurally valid but remains runtime-ineligible.", { runtimeEligible: dialogue.runtimeEligible, allowPlayerFacingDialogue: registration.allowPlayerFacingDialogue, authority: DIALOGUE_AUTHORITY }),
    makeBlocker("p8_upstream_catalogs_review_only", "Medical and operational dependencies remain review-only and grant no runtime authority.", { medicalProductionEligible: medicalReviewInput.productionEligible, medicalGeneratorEligible: medicalReviewInput.generatorEligible, operationalRuntimeEligible: operationalReviewInput.runtimeEligible }),
    makeBlocker("p8_operational_semantics_not_audited", "P8 audits language and P4 references, not P3/P5/P6/P7 operational semantics.", { auditedOperationalLayers: ["p4_owner_profile_refs", "p4_behavior_crosswalk_refs"] }),
    makeBlocker("p8_unmapped_research_tasks", "Three P3 research tasks have no presentation usage/result and require author/veterinary mapping.", { researchIds: unmappedResearchTasks }),
  ];
  check(sameStrings(blockers.map((blocker) => blocker.id), EXPECTED_BLOCKER_IDS), "P8 blocker inventory must remain complete");

  return deepFreeze({
    counts: {
      sourceFiles: sourceFiles.length,
      sourceBytes: [...sourceBytesByPath.values()].reduce((total, bytes) => total + bytes.length, 0),
      families: EXPECTED_COUNTS.families,
      variants: EXPECTED_COUNTS.variants,
      presentations: EXPECTED_COUNTS.presentations,
      auditIssues: EXPECTED_COUNTS.auditIssues,
      p0: EXPECTED_COUNTS.p0,
      p1: EXPECTED_COUNTS.p1,
      p2: EXPECTED_COUNTS.p2,
      p3: EXPECTED_COUNTS.p3,
      ownerProfiles: EXPECTED_COUNTS.ownerProfiles,
      doctorSpeechFunctions: EXPECTED_COUNTS.doctorSpeechFunctions,
      rareAbsurdEvents: EXPECTED_COUNTS.rareAbsurdEvents,
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
    dialogueAuthority: DIALOGUE_AUTHORITY,
    reviewRecords: medicalIndex.records,
    baselineCaseIdCrosswalkMatches: baselineCrosswalkMatches,
    reviewerDecisionGate: {
      importAllowed: false,
      externalVeterinaryApproval: false,
      activationManifestAllowed: false,
      actualDecisionFiles,
    },
    blockers,
  });
}

export function validateP8ReviewerDecisionSet(decisionSet, reviewInput) {
  check(isObject(reviewInput), "loaded P8 review input is required");
  check(reviewInput.loadContext === P8_REVIEW_CONTEXT, "reviewer decisions require explicit review context");
  check(isObject(decisionSet), "reviewer decision set must be an object");
  check(decisionSet.schemaVersion === 1, "reviewer decision set schemaVersion must be 1");
  check(isNonEmptyString(decisionSet.decisionSetId), "reviewer decisionSetId is required");
  check(decisionSet.decisionSetId !== "replace-with-review-id", "reviewer decision template cannot be imported");
  check(isNonEmptyString(decisionSet.decisionSetVersion), "reviewer decisionSetVersion is required");
  check(
    decisionSet.reviewPackage?.packageId === reviewInput.registration.packageId,
    "reviewer decision P8 packageId mismatch",
  );
  check(
    decisionSet.reviewPackage?.packageVersion === reviewInput.registration.packageVersion,
    "reviewer decision P8 packageVersion mismatch",
  );
  check(
    decisionSet.reviewPackage?.archiveSha256 === reviewInput.sourceIntegrity.archiveSha256,
    "reviewer decision P8 archive digest mismatch",
  );
  check(
    decisionSet.reviewPackage?.provenanceSha256 === reviewInput.sourceIntegrity.provenanceSha256,
    "reviewer decision P8 provenance digest mismatch",
  );
  check(
    decisionSet.reviewPackage?.sourceAggregateSha256 === reviewInput.sourceIntegrity.aggregateSha256,
    "reviewer decision P8 aggregate digest mismatch",
  );
  check(decisionSet.inputPackage?.packageId === reviewInput.medicalReviewInputIdentity.reviewInputId, "reviewer decision packageId mismatch");
  check(decisionSet.inputPackage?.packageVersion === reviewInput.medicalReviewInputIdentity.reviewInputVersion, "reviewer decision packageVersion mismatch");
  check(
    decisionSet.inputPackage?.sourceAggregateSha256 === reviewInput.medicalReviewInputIdentity.aggregateSha256,
    "reviewer decision medical digest mismatch",
  );
  for (const field of ["reviewerId", "fullName", "qualification", "jurisdiction"]) {
    check(isNonEmptyString(decisionSet.reviewer?.[field]), `reviewer ${field} is required`);
  }
  check(decisionSet.reviewer.conflictOfInterestDeclared === true, "reviewer conflict-of-interest declaration is required");
  check(isNonEmptyString(decisionSet.reviewedAt) && !Number.isNaN(Date.parse(decisionSet.reviewedAt)), "reviewedAt must be an ISO-compatible date");
  checkArray(decisionSet.decisions, "reviewer decisions");
  check(decisionSet.decisions.length > 0, "reviewer decisions must not be empty");

  const records = new Map(reviewInput.audit.reviewRecords.map((record) => [recordKey(record), record]));
  const decisionKeys = [];
  for (const decision of decisionSet.decisions) {
    check(["family", "variant", "presentation"].includes(decision.recordType), "reviewer decision recordType is invalid");
    check(isNonEmptyString(decision.familyId), "reviewer decision familyId is required");
    if (decision.recordType === "family") {
      check(decision.variantId === null && decision.presentationId === null, "family decision may not imply variant or presentation scope");
    } else if (decision.recordType === "variant") {
      check(isNonEmptyString(decision.variantId) && decision.presentationId === null, "variant decision identity is invalid");
    } else {
      check(isNonEmptyString(decision.variantId) && isNonEmptyString(decision.presentationId), "presentation decision identity is invalid");
    }
    const key = recordKey(decision);
    const record = records.get(key);
    check(record, `unknown reviewer decision record ${key}`);
    check(decision.exactVersion === record.exactVersion, `reviewer decision exact version mismatch for ${key}`);
    check(DECISION_VALUES.has(decision.decision), `reviewer decision value is invalid for ${key}`);
    check(REVIEW_SEVERITIES.has(decision.medicalSeverity), `medical severity is invalid for ${key}`);
    check(REVIEW_SEVERITIES.has(decision.languageSeverity), `language severity is invalid for ${key}`);
    check(isObject(decision.decisionDomains), `decision domains are required for ${key}`);
    check(sameStrings(Object.keys(decision.decisionDomains), DECISION_DOMAIN_KEYS), `decision domains differ for ${key}`);
    for (const domain of DECISION_DOMAIN_KEYS) {
      check(DECISION_VALUES.has(decision.decisionDomains[domain]), `decision domain ${domain} is invalid for ${key}`);
    }
    const domainValues = DECISION_DOMAIN_KEYS.map((domain) => decision.decisionDomains[domain]);
    if (decision.decision === "approved") {
      check(
        domainValues.every((value) => value === "approved"),
        `approved record ${key} must be approved in every decision domain`,
      );
    } else {
      check(
        domainValues.includes(decision.decision),
        `${decision.decision} record ${key} must have at least one matching decision domain`,
      );
    }
    checkArray(decision.issueIds, `reviewer issue IDs for ${key}`);
    check(decision.issueIds.every(isNonEmptyString), `reviewer issue IDs are invalid for ${key}`);
    if (decision.decision === "changes_required") {
      check(decision.issueIds.length > 0, `changes_required record ${key} must reference at least one issue ID`);
    }
    check(isNonEmptyString(decision.comment), `reviewer comment is required for ${key}`);
    check(isNonEmptyString(decision.reviewerSignature), `reviewer signature is required for ${key}`);
    decisionKeys.push(key);
  }
  checkUnique(decisionKeys, "reviewer decision record keys");
  check(
    decisionSet.activationRecommendation === "forbidden_until_all_target_records_approved_and_clean_audit_passes",
    "reviewer decision activation recommendation is not fail-closed",
  );

  check(reviewInput.audit.cleanGate.passed === true, "reviewer decision import is forbidden while the P0/P1 clean gate is blocked");
  check(reviewInput.externalVeterinaryApproval === true, "reviewer decision import is forbidden without external veterinary approval");
  check(reviewInput.registration.allowReviewerDecisionImport === true, "reviewer decision import is forbidden by registration");
  return deepFreeze({ decisionSetId: decisionSet.decisionSetId, exactRecordKeys: decisionKeys });
}

export async function loadP8AuthoringReviewInputFromReader(reader, registry, options = {}) {
  check(reader && typeof reader.readBytes === "function", "reader.readBytes is required");
  check(reader && typeof reader.listFiles === "function", "reader.listFiles is required");
  const registration = resolveP8AuthoringReviewInput(registry, options);
  const sourceRoot = joinPath(registration.root, registration.sourceRoot);
  const provenancePath = joinPath(registration.root, registration.provenancePath);
  const p4OwnerProfilePath = joinPath(
    "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.1/source",
    "generated/p4/owner-profile-catalog.json",
  );
  const p4BehaviorCrosswalkPath = joinPath(
    "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.1/source",
    "generated/p4/behavior-crosswalk.json",
  );
  const [
    provenanceBytes,
    sourceFiles,
    baselineManifestBytes,
    p4OwnerProfileBytes,
    p4BehaviorCrosswalkBytes,
    medicalReviewInput,
    operationalReviewInput,
  ] = await Promise.all([
    reader.readBytes(provenancePath),
    reader.listFiles(sourceRoot),
    reader.readBytes(P8_BASELINE_MANIFEST_PATH),
    reader.readBytes(p4OwnerProfilePath),
    reader.readBytes(p4BehaviorCrosswalkPath),
    loadMedicalAuthoringReviewInputFromReader(reader, registry, {
      context: P8_REVIEW_CONTEXT,
      reviewInputId: registration.medicalReviewInput.reviewInputId,
      reviewInputVersion: registration.medicalReviewInput.reviewInputVersion,
    }),
    loadOperationalAuthoringReviewInputFromReader(reader, registry, {
      context: P8_REVIEW_CONTEXT,
      reviewInputId: registration.operationalReviewInput.reviewInputId,
      reviewInputVersion: registration.operationalReviewInput.reviewInputVersion,
    }),
  ]);
  check(sha256(provenanceBytes) === registration.sourceIntegrity.provenanceSha256, "provenance file SHA-256 mismatch");
  const provenance = parseJson(provenanceBytes, provenancePath);
  const sourceBytesByPath = new Map();
  await Promise.all(sourceFiles.map(async (relativePath) => {
    sourceBytesByPath.set(relativePath, await reader.readBytes(joinPath(sourceRoot, relativePath)));
  }));
  const sourceIntegrity = validateP8SourceProvenance(
    registration,
    provenance,
    sourceFiles,
    sourceBytesByPath,
  );
  const json = (relativePath) => parseJson(sourceBytesByPath.get(relativePath), relativePath);
  const manifest = json("MANIFEST.json");
  const policy = json("source/p8-review-policy.json");
  const sourceAudit = json("generated/P8_SOURCE_AUDIT.json");
  const dialogue = json("source/human-dialogue-library.json");
  const dialogueValidation = json("generated/P8_DIALOGUE_VALIDATION.json");
  const packageValidation = json("generated/P8_PACKAGE_VALIDATION.json");
  const reviewerDecisionTemplate = json("source/reviewer-decision-template.json");
  const baselineManifest = parseJson(baselineManifestBytes, P8_BASELINE_MANIFEST_PATH);
  const audit = validateP8AuthoringPackage({
    registration,
    manifest,
    sourceFiles,
    sourceBytesByPath,
    policy,
    sourceAudit,
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

  return deepFreeze({
    loadContext: P8_REVIEW_CONTEXT,
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
    dialogue: clone(dialogue),
    packageValidation: clone(packageValidation),
    reviewerDecisionTemplate: clone(reviewerDecisionTemplate),
    sourceIntegrity,
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

export async function loadP8AuthoringReviewInput(projectRoot, options = {}) {
  const reader = createFileSystemReviewInputReader(projectRoot);
  const registry = parseJson(
    await reader.readBytes(REVIEW_INPUT_REGISTRY_PATH),
    REVIEW_INPUT_REGISTRY_PATH,
  );
  return loadP8AuthoringReviewInputFromReader(reader, registry, options);
}
