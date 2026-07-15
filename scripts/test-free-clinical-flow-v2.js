"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const flow = require("../systems/free-clinical-flow-v2.js");

const root = path.resolve(__dirname, "..");
function readCase(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

const wound = readCase("content/packs/tier-01-v2/clinical/tier-01/trauma/superficial-wound.json");
const ear = readCase("content/packs/tier-01-v2/clinical/tier-01/ear/ear-mites.json");
const skin = readCase("content/packs/tier-01-v2/clinical/tier-01/skin/flea-infestation.json");

for (const caseData of [wound, ear, skin]) {
  assert.ok(flow.actionsFor(caseData, "general").length >= 7, `${caseData.id}: general actions missing`);
  assert.ok(flow.actionsFor(caseData, "target").length >= 5, `${caseData.id}: target actions missing`);
  assert.equal(new Set(flow.actionsFor(caseData, "general").map((action) => action.id)).size, flow.actionsFor(caseData, "general").length);
  assert.equal(new Set(flow.actionsFor(caseData, "target").map((action) => action.id)).size, flow.actionsFor(caseData, "target").length);
}

const patient = {
  species: "cat",
  asked: {},
  clinicalActionState: {},
  v2Visit: { medicalContent: wound }
};
assert.deepEqual(flow.measurementPlaceholders(wound, patient), ["Температура не измерена."]);
assert.ok(flow.missingImportantQuestions(wound, patient).length > 0);

const temperature = flow.actionsFor(wound, "general").find((action) => action.measurementKind === "temperature");
const temperatureResult = flow.actionResult(temperature, patient);
assert.match(temperatureResult.text, /38,6 °C/);
assert.match(temperatureResult.text, /пределах нормы для кошки/);
assert.match(temperatureResult.text, /37,7–39,2 °C/);

assert.equal(flow.recordAction(patient, "general", temperature.id), true);
assert.equal(flow.recordAction(patient, "general", temperature.id), false, "completed IDs must not duplicate");
assert.deepEqual(flow.measurementPlaceholders(wound, patient), []);

const importantTarget = flow.actionsFor(wound, "target").find((action) => action.importantForSafety);
flow.recordAction(patient, "target", importantTarget.id);
assert.ok(flow.missingImportantActions(wound, patient).length > 0);

const legacyPatient = {
  species: "cat",
  generalExamDone: true,
  localUsed: 1,
  executedDiagnosticTestId: "mite_microscopy",
  microscopyDone: true,
  v2Visit: { medicalContent: ear }
};
flow.migratePatientActionState(legacyPatient);
assert.equal(legacyPatient.clinicalActionState.generalExamActionIds.length, ear.generalExam.actions.length);
assert.equal(legacyPatient.clinicalActionState.targetExamActionIds.length, ear.targetExam.actions.length);
assert.deepEqual(legacyPatient.clinicalActionState.diagnosticTestIds, ["mite_microscopy"]);

const skinPatient = {
  species: "dog",
  asked: {},
  clinicalActionState: {},
  v2Visit: { medicalContent: skin }
};
flow.recordAction(skinPatient, "diagnostic", "optional_repeat_flea_dirt_test");
assert.deepEqual(flow.performedIds(skinPatient, "diagnostic"), ["optional_repeat_flea_dirt_test"]);

console.log(JSON.stringify({
  status: "passed",
  cases: [wound.id, ear.id, skin.id],
  temperature: temperatureResult.text,
  skippedTemperature: "Температура не измерена.",
  stableActionIdsPersisted: true
}, null, 2));
