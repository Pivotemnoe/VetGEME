#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(packageRoot, "..");
const sourceRoot = path.resolve(
  repoRoot,
  process.env.MEDICAL_SOURCE_ROOT || "medical-production-authoring"
);
const expectedPackageVersion = process.env.MEDICAL_EXPECTED_VERSION || null;
const outputRelativePath = process.env.P8_AUDIT_OUTPUT || "generated/P8_SOURCE_AUDIT.json";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(relativePath, value) {
  const file = path.join(packageRoot, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function hasCyrillic(value) {
  return /[А-Яа-яЁё]/u.test(value);
}

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("ru-RU");
}

const policy = readJson(path.join(packageRoot, "source/p8-review-policy.json"));
const manifest = readJson(path.join(sourceRoot, "MANIFEST.json"));
const p4Owners = readJson(path.join(repoRoot, "operational-production-authoring/generated/p4/owner-profile-catalog.json"));
const p4Crosswalk = readJson(path.join(repoRoot, "operational-production-authoring/generated/p4/behavior-crosswalk.json"));

const familyDirs = fs.readdirSync(path.join(sourceRoot, "families"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const issues = [];
const familyRows = [];
const presentationRefs = new Set();
const p4PresentationRefs = new Set(p4Crosswalk.presentations.map((item) => item.presentationRef));
const ownerProfileIds = new Set(p4Owners.profiles.map((item) => item.profileId));

function addIssue(severity, code, familyId, variantId, presentationId, field, value, message) {
  issues.push({
    issueId: `p8.${String(issues.length + 1).padStart(5, "0")}`,
    severity,
    code,
    familyId,
    variantId: variantId || null,
    presentationId: presentationId || null,
    presentationRef: presentationId ? `${familyId}.${variantId}.${presentationId}` : null,
    field,
    value,
    message,
    status: "open"
  });
}

function auditPlayerText(context, field, value, options = {}) {
  const { familyId, variantId, presentationId } = context;
  if (value === null && options.nullAllowed) return;
  if (typeof value !== "string" || !value.trim()) {
    addIssue("P0", "PLAYER_TEXT_EMPTY", familyId, variantId, presentationId, field, value, "Игроку показан пустой текст.");
    return;
  }
  if (!hasCyrillic(value)) {
    addIssue("P1", "PLAYER_TEXT_NOT_RUSSIAN", familyId, variantId, presentationId, field, value, "Игроку показан английский или служебный текст вместо русской человеческой реплики.");
  }
  const normalized = normalize(value);
  if (/авторск\p{L}*/iu.test(normalized)) {
    addIssue("P0", "SERVICE_TOKEN_IN_PLAYER_TEXT", familyId, variantId, presentationId, field, value, "Служебная авторская пометка не является клиническим результатом или человеческой репликой.");
  }
  for (const token of policy.playerFacingLanguage.forbiddenServiceTokens) {
    if (normalized.includes(token)) {
      addIssue("P0", "SERVICE_TOKEN_IN_PLAYER_TEXT", familyId, variantId, presentationId, field, value, `Служебный токен '${token}' не является клиническим результатом или человеческой репликой.`);
    }
  }
  if (options.doctorSpeech) {
    const prefixes = [
      ...policy.playerFacingLanguage.instructionPrefixesNotAcceptedAsDoctorSpeech,
      "продемонстрируйте", "сравните", "дайте", "обсудите", "назовите", "покажите",
      "попросите", "предупредите", "объясните", "задокументируйте", "избегайте",
      "не обещайте", "скажите", "подтвердите", "используйте"
    ];
    const prefix = prefixes
      .find((candidate) => normalized.startsWith(candidate));
    if (prefix) {
      addIssue("P1", "DOCTOR_INSTRUCTION_NOT_SPEECH", familyId, variantId, presentationId, field, value, "Вместо слов врача записана редакторская инструкция.");
    }
  }
}

let variantCount = 0;
let presentationCount = 0;
let sourceCount = 0;

for (const directory of familyDirs) {
  const familyFile = path.join(sourceRoot, "families", directory, "family.production.json");
  const family = readJson(familyFile);
  const before = issues.length;
  auditPlayerText({ familyId: family.familyId }, "family.title", family.title);
  for (const [key, text] of Object.entries(family.terminology || {})) {
    auditPlayerText({ familyId: family.familyId }, `family.terminology.${key}`, text);
  }
  for (const item of family.commonHistoryQuestions || []) {
    auditPlayerText(
      { familyId: family.familyId },
      `family.commonHistoryQuestions.${item.id}.${Object.hasOwn(item, "text") ? "text" : "prompt"}`,
      item.text ?? item.prompt
    );
  }
  sourceCount += family.sourceCatalog.length;

  for (const variant of family.variants) {
    variantCount += 1;
    auditPlayerText({ familyId: family.familyId, variantId: variant.id }, "variant.title", variant.title);
    auditPlayerText({ familyId: family.familyId, variantId: variant.id }, "variant.diagnosticTruth", variant.diagnosticTruth);
    for (const presentation of variant.presentations) {
      presentationCount += 1;
      const context = { familyId: family.familyId, variantId: variant.id, presentationId: presentation.id };
      const ref = `${family.familyId}.${variant.id}.${presentation.id}`;
      presentationRefs.add(ref);
      auditPlayerText(context, "presentation.complaint", presentation.complaint);
      for (const [key, text] of Object.entries(presentation.historyAnswers || {})) {
        auditPlayerText(context, `presentation.historyAnswers.${key}`, text);
      }
      for (const item of presentation.examFindings || []) {
        auditPlayerText(context, `presentation.examFindings.${item.factId}.finding`, item.finding);
      }
      for (const item of presentation.investigations || []) {
        auditPlayerText(context, `presentation.investigations.${item.id}.result`, item.result, { nullAllowed: true });
      }
      for (const [key, text] of Object.entries(presentation.outcomes || {})) {
        auditPlayerText(context, `presentation.outcomes.${key}`, text);
      }
      auditPlayerText(context, "presentation.followUp.timing", presentation.followUp?.timing);
      const communication = presentation.ownerCommunication || [];
      if (communication.length === 0) {
        addIssue("P0", "OWNER_COMMUNICATION_MISSING", family.familyId, variant.id, presentation.id, "presentation.ownerCommunication", [], "Для случая нет ни одной написанной коммуникации врача.");
      }
      communication.forEach((text, index) => auditPlayerText(
        context,
        `presentation.ownerCommunication.${index}`,
        text,
        { doctorSpeech: true }
      ));
      if (!p4PresentationRefs.has(ref)) {
        addIssue("P0", "P4_PRESENTATION_CROSSWALK_MISSING", family.familyId, variant.id, presentation.id, "p4.presentationRef", ref, "Нет точной P4-связи характеров владельца и пациента.");
      }
    }
  }

  const familyIssues = issues.slice(before);
  familyRows.push({
    familyId: family.familyId,
    familyVersion: family.familyVersion,
    title: family.title,
    variants: family.variants.length,
    presentations: family.variants.reduce((sum, item) => sum + item.presentations.length, 0),
    sources: family.sourceCatalog.length,
    issueCounts: Object.fromEntries(["P0", "P1", "P2", "P3"].map((severity) => [severity, familyIssues.filter((issue) => issue.severity === severity).length])),
    reviewDecision: "pending_correction_and_external_veterinary_review"
  });
}

for (const item of p4Crosswalk.presentations) {
  for (const ownerProfileId of item.ownerArchetypeIds) {
    if (!ownerProfileIds.has(ownerProfileId)) {
      addIssue("P0", "P4_OWNER_PROFILE_UNKNOWN", item.familyId, item.variantId, item.presentationId, "p4.ownerArchetypeIds", ownerProfileId, "P4 crosswalk ссылается на неизвестный профиль владельца.");
    }
  }
}

const report = {
  schemaVersion: 1,
  reportId: "vetgeme-p8-source-audit",
  reportVersion: policy.packageVersion,
  status: issues.some((item) => item.severity === "P0") ? "blocked" : "reviewable",
  activationAllowed: false,
  input: policy.input,
  counts: {
    families: familyDirs.length,
    variants: variantCount,
    presentations: presentationCount,
    sourceEntries: sourceCount,
    uniquePresentationRefs: presentationRefs.size,
    p4PresentationRefs: p4PresentationRefs.size,
    issues: issues.length,
    bySeverity: Object.fromEntries(["P0", "P1", "P2", "P3"].map((severity) => [severity, issues.filter((issue) => issue.severity === severity).length])),
    byCode: Object.fromEntries([...new Set(issues.map((item) => item.code))].sort().map((code) => [code, issues.filter((item) => item.code === code).length]))
  },
  manifestConsistency: {
    packageVersionMatches: manifest.packageVersion === (expectedPackageVersion || policy.input.packageVersion),
    familiesMatch: manifest.familiesAuthored === familyDirs.length,
    variantsMatch: manifest.variantTargetCount === variantCount,
    presentationsMatch: manifest.presentationTargetCount === presentationCount,
    productionPoolRemainsZero: manifest.productionPoolSize === 0,
    generatorEligibleRemainsFalse: manifest.generatorEligible === false
  },
  families: familyRows,
  issues
};

writeJson(outputRelativePath, report);
console.log(JSON.stringify({ status: report.status, counts: report.counts, manifestConsistency: report.manifestConsistency }, null, 2));
if (process.argv.includes("--require-clean") && report.status !== "reviewable") process.exitCode = 1;
