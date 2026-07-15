"use strict";

const assert = require("node:assert/strict");
const decisions = require("../systems/diagnostic-decisions-v2.js");

const requiredCase = {
  diagnosticTests: [{ id: "fluorescein_test", label: "Approved test", costVetcoins: 50, durationMinutes: 3 }],
  preliminaryDiagnosisOptions: [{ id: "diagnosis", isCorrectForTemplate: true, requires: ["fluorescein_test"] }]
};
const required = decisions.diagnosticOptionsFor(requiredCase);
assert.equal(required[0].classification, "required");

const optionalCase = {
  diagnosticTests: [{ id: "optional_skin_cytology", label: "Approved optional test", costVetcoins: 60 }],
  preliminaryDiagnosisOptions: [{ id: "diagnosis", isCorrectForTemplate: true, requires: ["skin_exam"] }]
};
const optional = decisions.diagnosticOptionsFor(optionalCase);
assert.equal(optional[0].classification, "low_value");

const noTestCase = { diagnosticTests: [], preliminaryDiagnosisOptions: [] };
assert.deepEqual(decisions.diagnosticOptionsFor(noTestCase), [], "the engine must not invent a generic test");

const lowValue = decisions.diagnosticOptionsFor({
  diagnosticTests: [{
    id: "optional_repeat_test",
    label: "Repeat bedside test",
    classification: "low_value",
    text: "The repeated procedure confirms the same visible finding and adds no new data.",
    costVetcoins: 20
  }],
  preliminaryDiagnosisOptions: []
});
assert.equal(lowValue[0].classification, "low_value");
assert.match(lowValue[0].resultText, /same visible finding/);

const unavailable = decisions.diagnosticOptionsFor(requiredCase, {
  unavailableReasons: { fluorescein_test: "Оснащение временно недоступно." }
});
assert.equal(unavailable[0].classification, "unavailable");
assert.equal(unavailable[0].reason, "Оснащение временно недоступно.");

const accepted = decisions.evaluateDiagnosticProposal(required, {
  trust: 70, anxiety: 30, irritation: 10, budget: 500, budgetDiscussed: true
});
assert.equal(accepted.decision, "accepted");
assert.deepEqual(accepted.acceptedTestIds, ["fluorescein_test"]);

const asksCost = decisions.evaluateDiagnosticProposal(required, {
  trust: 70, anxiety: 30, irritation: 10, budget: 200, budgetLimited: true, budgetDiscussed: false
});
assert.equal(asksCost.decision, "asks_cost");
assert.equal(asksCost.noResult, true);
assert.equal(asksCost.noPayment, true);

const insufficientBudget = decisions.evaluateDiagnosticProposal(required, {
  trust: 70, anxiety: 30, irritation: 10, budget: 20, budgetDiscussed: true
});
assert.equal(insufficientBudget.decision, "requests_cheaper_option");
assert.equal(insufficientBudget.diagnosticUncertainty, true);

const priceNotAuthored = decisions.evaluateDiagnosticProposal([{
  id: "owner_video_review",
  label: "Owner video review",
  classification: "recommended"
}], {
  trust: 70, anxiety: 30, irritation: 10, budget: 20, budgetLimited: true, budgetDiscussed: false
});
assert.equal(priceNotAuthored.totalCost, null, "missing price must not become zero");
assert.equal(priceNotAuthored.priceStatus, "not_authored");
assert.equal(priceNotAuthored.decision, "accepted", "unknown price must not drive invented budget logic");

const refused = decisions.evaluateDiagnosticProposal(lowValue, {
  trust: 35, anxiety: 30, irritation: 10, budget: 500, budgetDiscussed: true
});
assert.equal(refused.decision, "refused");
assert.equal(refused.acceptedTestIds.length, 0);

const partial = decisions.evaluateDiagnosticProposal([
  required[0],
  { ...lowValue[0], costVetcoins: 300 }
], {
  trust: 70, anxiety: 30, irritation: 10, budget: 500, budgetDiscussed: true
});
assert.equal(partial.decision, "partially_accepted");
assert.deepEqual(partial.acceptedTestIds, ["fluorescein_test"]);
assert.deepEqual(partial.declinedTestIds, ["optional_repeat_test"]);

const reloaded = JSON.parse(JSON.stringify({ diagnosticDecisions: [refused], diagnosticUncertainty: refused.diagnosticUncertainty }));
assert.equal(reloaded.diagnosticDecisions[0].noResult, true);
assert.equal(reloaded.diagnosticDecisions[0].noPayment, true);

console.log(JSON.stringify({
  status: "passed",
  classifications: Object.keys(decisions.CLASSIFICATIONS),
  ownerResponses: [accepted.decision, asksCost.decision, insufficientBudget.decision, refused.decision, partial.decision],
  refusalCreatesNoResultOrPayment: true,
  reloadPreservesDecision: true
}, null, 2));
