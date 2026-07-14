import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clinicalRoot = path.join(root, "content/clinical/tier-01");
const manifestPath = path.join(clinicalRoot, "manifest.json");
const campaignPath = path.join(root, "content/campaign/tier-01/seven-day-plan.json");
const tutorialPath = path.join(root, "content/ui/tutorial-texts.json");
const ownersRoot = path.join(root, "content/owners/tier-01");
const multiDiagnosisRoot = path.join(root, "content/multi-diagnosis");
const errors = [];
const warnings = [];
const stats = { jsonParsed: 0, clinicalFiles: 0, questions: 0, answers: 0, uniqueAnswerTexts: 0, homeActions: 0, urgentCases: 0 };
const prohibitedPhrases = [
  "дрожжевой отит", "дрожжевой наружный отит", "рабочая версия", "простой дерматит",
  "владелец называет точное наблюдение", "владелец не уверен в деталях",
  "владелец описывает наблюдение точно", "после спокойного уточнения владелец сообщает",
  "общее состояние оценено до локального решения", "требует оценки срочности",
  "использует бытовую формулировку, не заменяющую медицинский факт",
  "requires_case_specific_review"
];
const allowedSources = new Set(["initial_complaint", "owner_history", "physical_exam", "diagnostic_test", "doctor_interpretation", "follow_up"]);
const allowedSpecies = new Set(["dog", "cat"]);
const fixedSpeciesTerms = {
  dog: /(?:^|[^\p{L}])(?:собак\p{L}*|пёс\p{L}*|пса|щен\p{L}*)(?=$|[^\p{L}])/iu,
  cat: /(?:^|[^\p{L}])(?:кошк\p{L}*|кота|коту|котён\p{L}*|котен\p{L}*)(?=$|[^\p{L}])/iu
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
function assert(condition, file, message) { if (!condition) errors.push(`${path.relative(root, file)}: ${message}`); }
function allJsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return allJsonFiles(target);
    return entry.name.endsWith(".json") ? [target] : [];
  });
}
function checkSource(item, expected, file, location) {
  assert(item && allowedSources.has(item.source), file, `${location} has invalid or missing source`);
  if (expected) assert(item?.source === expected, file, `${location} must use source ${expected}`);
}

for (const file of allJsonFiles(path.join(root, "content"))) {
  readJson(file);
  const raw = fs.readFileSync(file, "utf8").toLowerCase();
  for (const phrase of prohibitedPhrases) assert(!raw.includes(phrase), file, `prohibited or placeholder phrase: ${phrase}`);
}

const manifest = readJson(manifestPath);
assert(manifest?.schemaVersion === 2, manifestPath, "manifest schemaVersion must be 2");
assert(manifest?.contentPackId === "tier-01-v2", manifestPath, "contentPackId must identify tier-01-v2");
assert(typeof manifest?.contentPackVersion === "string" && manifest.contentPackVersion.length > 0, manifestPath, "contentPackVersion is required");
assert(/^[a-f0-9]{64}$/.test(manifest?.contentPackHash || ""), manifestPath, "contentPackHash must be a SHA-256 string");
assert(manifest?.integrationStatus === "not_connected", manifestPath, "review package must stay not_connected by default");
assert(manifest?.contentPolicy?.runtimeGenerationOfMedicalText === false, manifestPath, "runtime medical text generation must be disabled");
const caseFiles = allJsonFiles(clinicalRoot).filter((file) => file !== manifestPath);
stats.clinicalFiles = caseFiles.length;
assert(caseFiles.length === 30, manifestPath, "tier 01 must contain exactly 30 cases");
assert(manifest?.caseCount === 30, manifestPath, "manifest caseCount must be 30");

const ids = new Set();
const answerTexts = new Set();
const homeActionFile = path.join(ownersRoot, "home-treatment-actions.json");
const homeActionLibrary = readJson(homeActionFile);
const homeActionIds = new Set(homeActionLibrary?.actions?.map((x) => x.id) ?? []);
stats.homeActions = homeActionIds.size;
assert(stats.homeActions >= 25, homeActionFile, "expanded tier needs at least 25 exact home actions");

for (const file of caseFiles) {
  const data = readJson(file);
  if (!data) continue;
  assert(data.schemaVersion === 2, file, "case schemaVersion must be 2");
  assert(data.editorialStatus === "complete_ru_v1", file, "case must be editorially complete");
  assert(data.validation?.noGeneratedMedicalText === true, file, "case must forbid generated medical text");
  assert(!ids.has(data.id), file, `duplicate id ${data.id}`);
  ids.add(data.id);
  for (const species of data.species ?? []) assert(allowedSpecies.has(species), file, `unsupported tier-01 species: ${species}`);
  assert(Array.isArray(data.initialComplaintVariants) && data.initialComplaintVariants.length >= 3, file, "at least three complaints are required");
  for (const [i, item] of (data.initialComplaintVariants ?? []).entries()) {
    checkSource(item, "initial_complaint", file, `initialComplaintVariants[${i}]`);
    assert(item.text?.length >= 25, file, `complaint ${item.id} is too short`);
    const compatibleSpecies = Array.isArray(item.species) ? item.species : data.species;
    assert(Array.isArray(compatibleSpecies) && compatibleSpecies.length > 0, file, `complaint ${item.id} needs species compatibility`);
    for (const species of compatibleSpecies ?? []) {
      assert(data.species?.includes(species), file, `complaint ${item.id} uses species outside the case: ${species}`);
    }
    const fixedSpecies = Object.entries(fixedSpeciesTerms)
      .filter(([, pattern]) => pattern.test(item.text || ""))
      .map(([species]) => species);
    if (fixedSpecies.length) {
      if ((data.species ?? []).length > 1) {
        assert(Array.isArray(item.species), file, `complaint ${item.id} with fixed species wording needs an explicit species list`);
      }
      for (const species of compatibleSpecies ?? []) {
        assert(fixedSpecies.includes(species), file, `complaint ${item.id} wording is incompatible with ${species}`);
      }
    }
  }
  for (const species of data.species ?? []) {
    assert(data.initialComplaintVariants?.some((item) => !Array.isArray(item.species) || item.species.includes(species)), file, `no complaint variant is compatible with ${species}`);
  }
  const questions = data.historyQuestions ?? [];
  stats.questions += questions.length;
  const required = questions.filter((x) => x.required);
  const optional = questions.filter((x) => !x.required && !x.condition);
  const conditional = questions.filter((x) => x.condition);
  assert(required.length >= 4 && required.length <= 8, file, "required questions must be 4-8");
  assert(optional.length >= 2 && optional.length <= 5, file, "optional questions must be 2-5");
  assert(conditional.length <= 3, file, "conditional questions must be 0-3");
  const questionIds = new Set(questions.map((x) => x.id));
  for (const question of questions) {
    checkSource(question, "owner_history", file, `question ${question.id}`);
    assert(Array.isArray(question.revealsFactIds) && question.revealsFactIds.length > 0, file, `question ${question.id} needs revealsFactIds`);
    assert(Array.isArray(question.answers) && question.answers.length >= 4, file, `question ${question.id} needs four exact style answers`);
    const tags = new Set();
    for (const answer of question.answers ?? []) {
      stats.answers += 1;
      checkSource(answer, "owner_history", file, `answer ${answer.id}`);
      assert(answer.text?.length >= 18, file, `answer ${answer.id} is too short`);
      answerTexts.add(answer.text);
      for (const tag of answer.ownerTags ?? []) tags.add(tag);
    }
    for (const requiredTag of ["calm", "observant", "inattentive", "anxious"]) {
      assert(tags.has(requiredTag), file, `question ${question.id} lacks ${requiredTag} answer`);
    }
    if (question.allowsHiddenHomeTreatment) {
      assert(question.category === "home_treatment", file, `only home_treatment question may load home actions`);
      assert(Array.isArray(question.homeActionIds) && question.homeActionIds.length > 0, file, `question ${question.id} needs homeActionIds`);
      for (const actionId of question.homeActionIds ?? []) assert(homeActionIds.has(actionId), file, `unknown home action ${actionId}`);
    }
  }
  const actionIds = new Set([...(data.requiredActions ?? []), ...questionIds]);
  for (const item of data.diagnosticTests ?? []) actionIds.add(item.id);
  for (const [i, item] of (data.generalExam?.findings ?? []).entries()) checkSource(item, "physical_exam", file, `generalExam[${i}]`);
  for (const [i, item] of (data.targetExam?.findings ?? []).entries()) checkSource(item, "physical_exam", file, `targetExam[${i}]`);
  for (const group of ["generalExam", "targetExam"]) {
    const actionIdsInGroup = new Set();
    for (const [i, action] of (data[group]?.actions ?? []).entries()) {
      checkSource(action, "physical_exam", file, `${group}.actions[${i}]`);
      assert(typeof action.id === "string" && action.id.length > 0, file, `${group}.actions[${i}] needs a stable id`);
      assert(!actionIdsInGroup.has(action.id), file, `${group} has duplicate action id ${action.id}`);
      actionIdsInGroup.add(action.id);
      actionIds.add(action.id);
      assert(typeof action.label === "string" && action.label.length >= 12, file, `${group} action ${action.id} needs a player label`);
      assert(Number.isFinite(action.timeMinutes) && action.timeMinutes > 0, file, `${group} action ${action.id} needs timeMinutes`);
      assert(Number.isFinite(action.stressDelta) && action.stressDelta >= 0, file, `${group} action ${action.id} needs stressDelta`);
      const results = action.resultsBySpecies ? Object.entries(action.resultsBySpecies) : [["default", action.result]];
      assert(results.length > 0, file, `${group} action ${action.id} needs an authored result`);
      for (const [species, result] of results) {
        if (species !== "default") assert(data.species.includes(species), file, `${group} action ${action.id} has unsupported result species ${species}`);
        checkSource(result, "physical_exam", file, `${group} action ${action.id} result ${species}`);
        if (result.measurement) {
          assert(result.measurement.displayValue, file, `${group} action ${action.id} measurement needs displayValue`);
          assert(result.measurement.unit, file, `${group} action ${action.id} measurement needs a unit`);
          assert(result.measurement.referenceLabel, file, `${group} action ${action.id} measurement needs a content reference`);
          assert(result.measurement.interpretation, file, `${group} action ${action.id} measurement needs an interpretation`);
        } else {
          assert(result.text?.length >= 20, file, `${group} action ${action.id} needs exact result text`);
        }
      }
    }
  }
  assert((data.generalExam?.findings ?? []).length >= 4, file, "general exam needs concrete findings");
  assert((data.targetExam?.findings ?? []).length >= 3, file, "target exam needs concrete findings");
  for (const [i, item] of (data.diagnosticTests ?? []).entries()) {
    checkSource(item, "diagnostic_test", file, `diagnosticTests[${i}]`);
    assert(item.label?.length >= 12, file, `diagnosticTests[${i}] needs the actual procedure name`);
    assert(item.text?.length >= 25, file, `diagnosticTests[${i}] needs a concrete result`);
    assert(!/не изменил клиническое решение/iu.test(item.text), file, `diagnosticTests[${i}] uses a generic result`);
  }
  const diagnoses = data.preliminaryDiagnosisOptions ?? [];
  const excludedDiagnoses = data.excludedPreliminaryDiagnosisOptions ?? [];
  assert(diagnoses.length >= 3, file, "at least three active diagnostic options are required");
  assert(diagnoses.length + excludedDiagnoses.length >= 4, file, "four diagnostic slots are required, including medically pending exclusions");
  assert(diagnoses.some((x) => x.isCorrectForTemplate), file, "one diagnostic option must be marked correct for template testing");
  for (const item of diagnoses) {
    checkSource(item, "doctor_interpretation", file, `diagnosis ${item.id}`);
    assert(Array.isArray(item.requires) && item.requires.length > 0, file, `diagnosis ${item.id} needs requires`);
    assert(item.feedback?.length >= 25, file, `diagnosis ${item.id} needs exact feedback`);
    assert(!/оставить\s+.*без\s+обработ/iu.test(item.label || ""), file, `diagnosis ${item.id} is a management action, not a diagnosis`);
  }
  const activeDiagnosisIds = new Set(diagnoses.map((item) => item.id));
  for (const item of excludedDiagnoses) {
    assert(typeof item.id === "string" && item.id.length > 0, file, "excluded diagnosis slot needs an id");
    assert(item.status === "pending_medical_review", file, `excluded diagnosis ${item.id} must remain pending_medical_review`);
    assert(item.reason === "management_action_not_diagnosis", file, `excluded diagnosis ${item.id} needs the management-action reason`);
    assert(!Object.hasOwn(item, "label") && !Object.hasOwn(item, "feedback"), file, `excluded diagnosis ${item.id} must not contain unapproved medical text`);
    assert(!activeDiagnosisIds.has(item.id), file, `excluded diagnosis ${item.id} is still active`);
  }
  if (data.id === "SKIN_FLEA_INFESTATION") {
    for (const item of diagnoses) {
      assert(["justified", "acceptable", "insufficient", "contradictory", "unsafe"].includes(item.decisionAssessment), file, `diagnosis ${item.id} needs a decision assessment`);
      const evidenceCount = (item.supportingEvidence?.length || 0) + (item.contradictingEvidence?.length || 0);
      assert(evidenceCount > 0, file, `diagnosis ${item.id} needs supporting or contradicting evidence`);
      assert(!/(в этом варианте|в данном случае преобладает)/iu.test(item.feedback || ""), file, `diagnosis ${item.id} exposes author meta text`);
    }
  }
  assert((data.planOptions ?? []).length >= 1, file, "at least one plan is required");
  for (const item of data.planOptions ?? []) {
    checkSource(item, "doctor_interpretation", file, `plan ${item.id}`);
    checkSource(item.followUp, "follow_up", file, `plan ${item.id}.followUp`);
    assert(Array.isArray(item.steps) && item.steps.length > 0, file, `plan ${item.id} needs exact steps`);
    assert(Array.isArray(item.worseningSigns) && item.worseningSigns.length > 0, file, `plan ${item.id} needs worsening signs`);
    if (item.longitudinalCare) {
      const care = item.longitudinalCare;
      assert(care.schemaVersion === 1, file, `plan ${item.id} longitudinalCare schemaVersion must be 1`);
      assert(["home_care", "outpatient", "scheduled_course", "inpatient", "referral"].includes(care.setting), file, `plan ${item.id} has invalid care setting`);
      assert(Number.isInteger(care.durationDays) && care.durationDays > 0, file, `plan ${item.id} needs a positive durationDays`);
      assert(Array.isArray(care.homeActionIds), file, `plan ${item.id} needs homeActionIds`);
      assert(Array.isArray(care.clinicActionIds), file, `plan ${item.id} needs clinicActionIds`);
      assert(Array.isArray(care.conditionalClinicActionIds), file, `plan ${item.id} needs conditionalClinicActionIds`);
      assert(care.homeFrequency && ["daily", "per_approved_plan"].includes(care.homeFrequency.cadence), file, `plan ${item.id} needs an approved home frequency`);
      const optionIds = new Set();
      for (const followUp of care.followUpOptions ?? []) {
        assert(typeof followUp.id === "string" && followUp.id.length > 0 && !optionIds.has(followUp.id), file, `plan ${item.id} follow-up needs a unique id`);
        optionIds.add(followUp.id);
        assert(Number.isInteger(followUp.offsetDays) && followUp.offsetDays > 0, file, `plan ${item.id} follow-up ${followUp.id} needs offsetDays`);
        assert(["planned_recheck", "scheduled_procedure", "course_visit", "test_result_review", "deterioration", "complication", "relapse", "owner_concern", "error_return", "rescheduled_visit"].includes(followUp.reason), file, `plan ${item.id} follow-up ${followUp.id} has invalid reason`);
      }
      const worseningIds = new Set(item.worseningSigns.map((sign) => sign.id));
      for (const signId of care.earlyReturnSignIds ?? []) {
        assert(worseningIds.has(signId), file, `plan ${item.id} longitudinal care references unknown worsening sign ${signId}`);
      }
    }
  }
  assert(data.ownerExplanation?.known?.length >= 25, file, "ownerExplanation.known is incomplete");
  assert(data.ownerExplanation?.uncertain?.length >= 25, file, "ownerExplanation.uncertain is incomplete");
  assert(data.ownerExplanation?.plan?.length >= 25, file, "ownerExplanation.plan is incomplete");
  assert(data.ownerExplanation?.checkUnderstanding?.length >= 25, file, "ownerExplanation.checkUnderstanding is incomplete");
  assert(Array.isArray(data.redFlags) && data.redFlags.length >= 3, file, "at least three red flags are required");
  for (const fact of data.criticalFacts ?? []) {
    assert(Array.isArray(fact.discoveryPaths) && fact.discoveryPaths.length > 0, file, `critical fact ${fact.id} needs discovery paths`);
    for (const discovery of fact.discoveryPaths) assert(actionIds.has(discovery), file, `critical fact ${fact.id} references unavailable discovery path ${discovery}`);
  }
  const urgent = ["urgent", "emergency"].includes(data.severity);
  if (urgent) {
    stats.urgentCases += 1;
    assert(data.safeAlternatives?.includes("urgent_referral"), file, "urgent case needs urgent_referral alternative");
    assert((data.planOptions ?? []).some((x) => x.id === "urgent_referral"), file, "urgent case needs urgent_referral plan");
    assert(!(data.planOptions ?? []).some((x) => x.allowsRoutineObservation), file, "urgent case cannot allow routine observation");
  }
}

stats.uniqueAnswerTexts = answerTexts.size;
assert(stats.uniqueAnswerTexts >= 450, manifestPath, `answer diversity too low: ${stats.uniqueAnswerTexts}`);

const multiManifestPath = path.join(multiDiagnosisRoot, "manifest.json");
const multiManifest = readJson(multiManifestPath);
assert(multiManifest?.automaticPairingAllowed === false, multiManifestPath, "automatic diagnosis pairing must stay disabled");
assert(multiManifest?.bundles?.length === 10, multiManifestPath, "exactly ten approved bundle shells are required");
const bundleIds = new Set();
for (const entry of multiManifest?.bundles ?? []) {
  const file = path.join(multiDiagnosisRoot, entry.file);
  const bundle = readJson(file);
  assert(bundle?.bundleId === entry.bundleId, file, "bundleId must match manifest");
  assert(!bundleIds.has(bundle?.bundleId), file, `duplicate bundleId ${bundle?.bundleId}`);
  bundleIds.add(bundle?.bundleId);
  assert(bundle?.status === "pending_content", file, "bundle must stay pending_content until medical text is approved");
  assert(bundle?.diagnosisMode === "multiple" && bundle?.maximumDiagnosisSelections === 2, file, "bundle must use two-slot diagnosis mode");
  assert(bundle?.trueDiagnosisIds?.length === 2 && new Set(bundle.trueDiagnosisIds).size === 2, file, "bundle needs two different diagnoses");
  for (const diagnosisId of bundle?.trueDiagnosisIds ?? []) assert(ids.has(diagnosisId), file, `unknown diagnosis ${diagnosisId}`);
  assert(bundle?.approvedClinicalContent === null, file, "pending bundle cannot contain unapproved clinical text");
}

const campaign = readJson(campaignPath);
assert(campaign?.schemaVersion === 2, campaignPath, "campaign schemaVersion must be 2");
assert(campaign?.status === "not_connected", campaignPath, "review campaign must remain not_connected");
assert(campaign?.days?.length === 7, campaignPath, "seven days are required");
for (const day of campaign?.days ?? []) {
  const minSum = day.bookedNew.min + day.followUps.min + day.unplannedNew.min;
  const maxSum = day.bookedNew.max + day.followUps.max + day.unplannedNew.max;
  assert(minSum <= day.visitsTotal.max && maxSum >= day.visitsTotal.min, campaignPath, `day ${day.day} component ranges cannot reach total`);
  assert(day.urgentSubset.max <= day.visitsTotal.max, campaignPath, `day ${day.day} urgent subset exceeds total`);
  assert(Number.isInteger(day.followUpTarget) && day.followUpTarget >= 0, campaignPath, `day ${day.day} followUpTarget is required`);
  assert(Number.isInteger(day.followUpMaximum) && day.followUpMaximum >= day.followUpTarget, campaignPath, `day ${day.day} followUpMaximum is invalid`);
  assert(day.fillMissingWithNewBookedVisits === true, campaignPath, `day ${day.day} must fill unavailable follow-ups with booked visits`);
}
const expectedUnplannedProbability = { 4: 0.45, 5: 0.6, 6: 0.65, 7: 0.5 };
const dayThree = campaign?.days?.find((day) => day.day === 3);
assert(dayThree?.unplannedNew?.min === 1 && dayThree?.unplannedNew?.max === 1, campaignPath, "day 3 must guarantee one tutorial walk-in");
for (const [dayNumber, probability] of Object.entries(expectedUnplannedProbability)) {
  const day = campaign?.days?.find((item) => item.day === Number(dayNumber));
  assert(day?.unplannedNew?.min === 0 && day?.unplannedNew?.max === 1, campaignPath, `day ${dayNumber} walk-in range must be 0-1`);
  assert(day?.unplannedProbability === probability, campaignPath, `day ${dayNumber} walk-in probability must be ${probability}`);
}
assert(campaign?.preliminaryScheduleRules?.showBookedOnly === true, campaignPath, "only booked visits may be shown before opening");
assert(campaign?.preliminaryScheduleRules?.generateUnplannedAfterOpening === true, campaignPath, "unplanned visits must be generated after opening");

const tutorial = readJson(tutorialPath);
assert(tutorial?.schemaVersion === 2, tutorialPath, "tutorial schemaVersion must be 2");
assert(tutorial?.pauseGameTime === true, tutorialPath, "tutorial must pause game time");
assert(tutorial?.steps?.length >= 9, tutorialPath, "tutorial needs full guided sequence");
for (const step of tutorial?.steps ?? []) {
  assert(step.enabledActions?.length > 0, tutorialPath, `tutorial step ${step.id} needs enabledActions`);
  assert(step.blockedActions, tutorialPath, `tutorial step ${step.id} needs blockedActions`);
  assert(step.completeWhen, tutorialPath, `tutorial step ${step.id} needs completion condition`);
}

const report = { status: errors.length ? "failed" : "passed", ...stats, warnings, errors };
const reportDirectory = path.join(root, "reports");
fs.mkdirSync(reportDirectory, { recursive: true });
fs.writeFileSync(path.join(reportDirectory, "tier-01-validation-v2.json"), `${JSON.stringify(report, null, 2)}\n`);
if (errors.length) {
  console.error(`Tier 01 v2 validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(report, null, 2));
}
