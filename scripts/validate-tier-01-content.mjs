import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clinicalRoot = path.join(root, "content/clinical/tier-01");
const manifestPath = path.join(clinicalRoot, "manifest.json");
const campaignPath = path.join(root, "content/campaign/tier-01/seven-day-plan.json");
const prohibitedPhrases = ["дрожжевой отит", "дрожжевой наружный отит", "рабочая версия", "простой дерматит"];
const allowedSources = new Set(["initial_complaint", "owner_history", "physical_exam", "diagnostic_test", "doctor_interpretation", "follow_up"]);
const errors = [];
const stats = {
  jsonParsed: 0,
  clinicalFiles: 0,
  duplicateIds: 0,
  sourceChecks: 0,
  urgentCases: 0,
  ownerProfiles: 0,
  ownerModifiers: 0,
  homeActions: 0,
  ownerLines: 0
};
const parsed = new Map();

function readJson(file) {
  if (parsed.has(file)) return parsed.get(file);
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    parsed.set(file, value);
    stats.jsonParsed += 1;
    return value;
  } catch (error) {
    errors.push(`${path.relative(root, file)}: JSON parse failed: ${error.message}`);
    return null;
  }
}

function assert(condition, file, message) {
  if (!condition) errors.push(`${path.relative(root, file)}: ${message}`);
}

function checkSource(item, expected, file, location) {
  stats.sourceChecks += 1;
  assert(item && allowedSources.has(item.source), file, `${location} has invalid or missing source`);
  if (expected) assert(item.source === expected, file, `${location} must use source ${expected}`);
}

function allJsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return allJsonFiles(target);
    return entry.name.endsWith(".json") ? [target] : [];
  });
}

const allContentFiles = allJsonFiles(path.join(root, "content"));
allContentFiles.forEach((file) => {
  readJson(file);
  const raw = fs.readFileSync(file, "utf8").toLowerCase();
  prohibitedPhrases.forEach((phrase) => assert(!raw.includes(phrase), file, `prohibited phrase: ${phrase}`));
});

const manifest = readJson(manifestPath);
const caseFiles = allJsonFiles(clinicalRoot).filter((file) => file !== manifestPath);
stats.clinicalFiles = caseFiles.length;
assert(manifest?.caseCount === caseFiles.length, manifestPath, "manifest caseCount does not match files");
assert(caseFiles.length === 30, manifestPath, "tier 01 must contain exactly 30 clinical files");

const ids = new Set();
for (const file of caseFiles) {
  const data = readJson(file);
  if (!data) continue;

  assert(data.schemaVersion === 1, file, "schemaVersion must be 1");
  assert(data.reviewStatus === "pending_medical_review", file, "new content must remain pending medical review");
  assert(typeof data.id === "string" && data.id.length > 3, file, "case id is required");
  if (ids.has(data.id)) {
    stats.duplicateIds += 1;
    errors.push(`${path.relative(root, file)}: duplicate id ${data.id}`);
  }
  ids.add(data.id);

  assert(Array.isArray(data.initialComplaintVariants) && data.initialComplaintVariants.length >= 3, file, "at least three complaints are required");
  data.initialComplaintVariants?.forEach((item, index) => checkSource(item, "initial_complaint", file, `initialComplaintVariants[${index}]`));

  const requiredQuestions = data.historyQuestions?.filter((question) => question.required) || [];
  const optionalQuestions = data.historyQuestions?.filter((question) => !question.required && !question.condition) || [];
  const conditionalQuestions = data.historyQuestions?.filter((question) => question.condition) || [];
  assert(requiredQuestions.length >= 4 && requiredQuestions.length <= 8, file, "required history questions must be 4-8");
  assert(optionalQuestions.length >= 2 && optionalQuestions.length <= 5, file, "additional history questions must be 2-5");
  assert(conditionalQuestions.length <= 3, file, "conditional history questions must be 0-3");
  data.historyQuestions?.forEach((question, questionIndex) => {
    checkSource(question, "owner_history", file, `historyQuestions[${questionIndex}]`);
    assert(Array.isArray(question.answers) && question.answers.length >= 2, file, `question ${question.id} needs at least two answers`);
    const tags = new Set();
    question.answers?.forEach((answer, answerIndex) => {
      checkSource(answer, "owner_history", file, `question ${question.id} answer[${answerIndex}]`);
      answer.ownerTags?.forEach((tag) => tags.add(tag));
    });
    assert(tags.has("inattentive"), file, `question ${question.id} lacks inattentive answer`);
    assert(tags.has("anxious"), file, `question ${question.id} lacks anxious answer`);
    assert(tags.has("hidden_home_treatment"), file, `question ${question.id} lacks hidden home-treatment answer`);
  });

  data.generalExam?.findings?.forEach((item, index) => checkSource(item, "physical_exam", file, `generalExam.findings[${index}]`));
  data.targetExam?.findings?.forEach((item, index) => checkSource(item, "physical_exam", file, `targetExam.findings[${index}]`));
  data.diagnosticTests?.forEach((item, index) => checkSource(item, "diagnostic_test", file, `diagnosticTests[${index}]`));
  data.preliminaryDiagnosisOptions?.forEach((item, index) => {
    checkSource(item, "doctor_interpretation", file, `preliminaryDiagnosisOptions[${index}]`);
    assert(Array.isArray(item.requires) && item.requires.length > 0, file, `diagnosis option ${item.id} must require actions`);
  });
  data.planOptions?.forEach((item, index) => {
    checkSource(item, "doctor_interpretation", file, `planOptions[${index}]`);
    checkSource(item.followUp, "follow_up", file, `planOptions[${index}].followUp`);
    assert(Array.isArray(item.worseningSigns) && item.worseningSigns.length > 0, file, `plan ${item.id} needs worsening signs`);
  });
  data.redFlags?.forEach((item, index) => checkSource(item, "doctor_interpretation", file, `redFlags[${index}]`));
  assert(Array.isArray(data.redFlags) && data.redFlags.length > 0, file, "red flags are required");
  assert(Array.isArray(data.criticalFacts) && data.criticalFacts.every((fact) => fact.discoveryPaths?.length), file, "every critical fact needs a discovery path");

  const urgent = ["urgent", "emergency"].includes(data.severity);
  if (urgent) {
    stats.urgentCases += 1;
    assert(data.safeAlternatives?.includes("urgent_referral"), file, "urgent case needs safe referral");
    assert(data.planOptions?.some((plan) => plan.id === "urgent_referral"), file, "urgent case needs urgent_referral plan");
    assert(!data.planOptions?.some((plan) => plan.allowsRoutineObservation), file, "urgent case cannot allow routine observation");
  }

  data.humor?.lines?.forEach((line, index) => checkSource(line, "owner_history", file, `humor.lines[${index}]`));
  assert(!data.forbiddenCombinations?.includes("humor_as_only_critical_path"), file, "humor cannot be the only critical path");
}

const campaign = readJson(campaignPath);
assert(campaign?.status === "not_connected", campaignPath, "campaign package must not be connected");
assert(campaign?.days?.length === 7, campaignPath, "seven campaign days are required");
campaign?.days?.forEach((day) => {
  assert(day.preliminaryScheduleRules?.showBookedOnly === true, campaignPath, `day ${day.day} must show booked visits only`);
  assert(day.preliminaryScheduleRules?.unplannedShownAsRangeOnly === true, campaignPath, `day ${day.day} must hide unplanned identities`);
  assert(!Object.hasOwn(day, "preliminaryUnplannedPatients"), campaignPath, `day ${day.day} exposes unplanned patients`);
});

const ownersRoot = path.join(root, "content/owners/tier-01");
const profiles = readJson(path.join(ownersRoot, "base-profiles.json"));
const modifiers = readJson(path.join(ownersRoot, "modifiers.json"));
const homeActions = readJson(path.join(ownersRoot, "home-treatment-actions.json"));
stats.ownerProfiles = profiles?.profiles?.length || 0;
stats.ownerModifiers = modifiers?.modifiers?.length || 0;
stats.homeActions = homeActions?.actions?.length || 0;
assert(stats.ownerProfiles === 8, path.join(ownersRoot, "base-profiles.json"), "eight owner profiles are required");
assert(stats.homeActions === 16, path.join(ownersRoot, "home-treatment-actions.json"), "sixteen home actions are required");
homeActions?.actions?.forEach((action, actionIndex) => {
  assert(action.discoveryQuestionId, path.join(ownersRoot, "home-treatment-actions.json"), `home action ${action.id} needs a discovery question`);
  action.ownerLines?.forEach((line, lineIndex) => checkSource(line, "owner_history", path.join(ownersRoot, "home-treatment-actions.json"), `actions[${actionIndex}].ownerLines[${lineIndex}]`));
});

for (const fileName of ["humorous-lines.json", "conflict-lines.json", "budget-lines.json", "anxiety-lines.json", "follow-up-lines.json"]) {
  const file = path.join(ownersRoot, fileName);
  const library = readJson(file);
  stats.ownerLines += library?.lines?.length || 0;
  library?.lines?.forEach((line, index) => checkSource(line, fileName === "follow-up-lines.json" ? "follow_up" : "owner_history", file, `lines[${index}]`));
}

const report = { status: errors.length ? "failed" : "passed", ...stats, errors };
const reportDirectory = path.join(root, "reports");
fs.mkdirSync(reportDirectory, { recursive: true });
fs.writeFileSync(path.join(reportDirectory, "tier-01-validation.json"), `${JSON.stringify(report, null, 2)}\n`);

if (errors.length) {
  console.error(`Tier 01 validation failed with ${errors.length} error(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(report, null, 2));
}
