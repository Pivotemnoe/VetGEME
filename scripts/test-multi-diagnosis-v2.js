"use strict";

const assert = require("node:assert/strict");
const engine = require("../generator/multi-diagnosis-engine-v2.js");

const visit = {
  caseId: "PRIMARY",
  caseIds: ["PRIMARY", "COMPLICATION"],
  bundleId: "TEST_APPROVED_BUNDLE",
  diagnosisMode: "multiple",
  maximumDiagnosisSelections: 2,
  trueDiagnosisIds: ["PRIMARY", "COMPLICATION"],
  diagnosisRoles: [
    { caseId: "PRIMARY", role: "primary", coverageWeight: 0.6 },
    { caseId: "COMPLICATION", role: "secondary_complication", coverageWeight: 0.4, missPolicy: "unsafe" }
  ]
};

const plans = [
  { id: "primary-plan", coversDiagnosisIds: ["PRIMARY"] },
  { id: "complication-plan", coversDiagnosisIds: ["COMPLICATION"] },
  { id: "irrelevant-plan", coversDiagnosisIds: ["OTHER"] }
];

assert.deepEqual(engine.normalizeVisitSchema({ caseId: "SINGLE" }), {
  caseId: "SINGLE",
  caseIds: ["SINGLE"],
  bundleId: null,
  diagnosisMode: "single",
  maximumDiagnosisSelections: 1,
  trueDiagnosisIds: ["SINGLE"],
  diagnosisRoles: [],
  selectedDiagnosisIds: []
});

const fullDiagnosis = engine.evaluateDiagnosticCoverage(visit, ["PRIMARY", "COMPLICATION"]);
assert.equal(fullDiagnosis.status, "full");
assert.equal(fullDiagnosis.coverage, 1);

const partialDiagnosis = engine.evaluateDiagnosticCoverage(visit, ["PRIMARY"]);
assert.equal(partialDiagnosis.status, "unsafe");
assert.equal(partialDiagnosis.coverage, 0.6);
assert.deepEqual(partialDiagnosis.unsafeMissedDiagnosisIds, ["COMPLICATION"]);

const wrongExtra = engine.evaluateDiagnosticCoverage(visit, ["PRIMARY", "OTHER"]);
assert.equal(wrongExtra.status, "unsafe");
assert.equal(wrongExtra.unnecessaryTreatment, true);
assert.deepEqual(wrongExtra.incorrectDiagnosisIds, ["OTHER"]);

const correctWithWrong = engine.evaluateDiagnosticCoverage(
  { ...visit, diagnosisRoles: visit.diagnosisRoles.map((role) => ({ ...role, missPolicy: undefined })) },
  ["PRIMARY", "OTHER"]
);
assert.equal(correctWithWrong.status, "partial");
assert.equal(correctWithWrong.unnecessaryTreatment, true);

const duplicateSelection = engine.evaluateDiagnosticCoverage(visit, ["PRIMARY", "PRIMARY"]);
assert.deepEqual(duplicateSelection.correctDiagnosisIds, ["PRIMARY"]);

assert.throws(
  () => engine.evaluateDiagnosticCoverage(visit, ["PRIMARY", "COMPLICATION", "OTHER"]),
  /At most 2 diagnoses/
);

const full = engine.evaluateCombinedOutcome(
  visit,
  ["PRIMARY", "COMPLICATION"],
  ["primary-plan", "complication-plan"],
  plans
);
assert.equal(full.status, "full");
assert.equal(full.diagnosticCoverage, 1);
assert.equal(full.treatmentCoverage, 1);

const partialTreatment = engine.evaluateCombinedOutcome(
  { ...visit, diagnosisRoles: visit.diagnosisRoles.map((role) => ({ ...role, missPolicy: undefined })) },
  ["PRIMARY", "COMPLICATION"],
  ["primary-plan"],
  plans
);
assert.equal(partialTreatment.status, "partial");
assert.equal(partialTreatment.treatmentCoverage, 0.6);

const unnecessary = engine.evaluateCombinedOutcome(
  visit,
  ["PRIMARY", "COMPLICATION"],
  ["primary-plan", "complication-plan", "irrelevant-plan"],
  plans
);
assert.equal(unnecessary.status, "partial");
assert.equal(unnecessary.unnecessaryTreatment, true);

console.log("multi diagnosis v2 engine: ok");
