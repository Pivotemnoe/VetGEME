"use strict";

const assert = require("assert");
const visitState = require("../systems/clinical-visit-state.js");

const first = visitState.normalizePatient({ id: 1, flowState: "waiting" });
const second = visitState.normalizePatient({ id: 2, flowState: "waiting" });
assert.deepStrictEqual(visitState.waitingPatients([first, second]).map((patient) => patient.id), [1, 2]);

visitState.markInConsultation(first);
assert.deepStrictEqual(visitState.waitingPatients([first, second]).map((patient) => patient.id), [2]);

const restored = JSON.parse(JSON.stringify(first));
visitState.normalizePatient(restored);
assert.strictEqual(restored.flowState, "in_consultation");
assert.deepStrictEqual(visitState.waitingPatients([restored, second]).map((patient) => patient.id), [2]);

visitState.record(first, "history", "Зуд начался три дня назад.");
visitState.record(first, "physicalExam", ["Температура в норме.", "Состояние стабильное."]);
visitState.record(first, "clinicalInterpretation", "Предварительный диагноз: блошиная инвазия.");
assert.deepStrictEqual(first.clinicalRecord.history, ["Зуд начался три дня назад."]);
assert.strictEqual(first.clinicalRecord.physicalExam.length, 2);
assert.strictEqual(first.clinicalRecord.diagnosticTests.length, 0);

assert.strictEqual(visitState.assessUrgency(first, "routine"), "routine");
assert.strictEqual(first.patientState, "stable");
assert.strictEqual(visitState.assessUrgency(first, "urgent"), "urgent");
assert.strictEqual(visitState.assessUrgency(first, "routine"), "urgent");

const goals = {};
visitState.incrementCompatibleGoals(goals, ["treated", "finish_guided_visit", "complete_two_full_visits"]);
assert.deepStrictEqual(goals, {
  treated: 1,
  finish_guided_visit: 1,
  complete_two_full_visits: 1
});

visitState.markCompleted(first);
assert.strictEqual(first.flowState, "completed");
console.log("Clinical visit state test passed.");
