"use strict";

const assert = require("node:assert/strict");
const decisions = require("../systems/clinical-decisions-v2.js");

assert.equal(decisions.COMMUNICATION_OPTIONS.length, 4);
const requiredFields = [
  "communicationGoal", "recommendedOwnerTraits", "riskyOwnerTraits", "timeCost",
  "comprehensionEffect", "trustEffect", "anxietyEffect", "irritationEffect",
  "adherenceEffect", "risk"
];
for (const option of decisions.COMMUNICATION_OPTIONS) {
  for (const field of requiredFields) assert.notEqual(option[field], undefined, `${option.id} lacks ${field}`);
}
assert.equal(new Set(decisions.COMMUNICATION_OPTIONS.map((item) => item.timeCost)).size > 1, true, "communication time costs are fake choices");

const anxiousOwner = { trust: 55, anxiety: 75, irritation: 20, comprehension: 40, adherence: 55, budget: 700, budgetDiscussed: false };
const calm = decisions.evaluateCommunication("calmDetailed", anxiousOwner, { complexPlan: true, doctorFatigue: 20 });
const risk = decisions.evaluateCommunication("riskFocus", anxiousOwner, { complexPlan: true, doctorFatigue: 20 });
assert.ok(calm.anxiety < anxiousOwner.anxiety, "calm explanation did not reduce anxiety");
assert.ok(risk.anxiety > anxiousOwner.anxiety, "risk-first explanation did not increase high anxiety");
assert.notEqual(calm.reactionId, risk.reactionId, "different communication strategies have the same consequence");

const plan = {
  id: "approved-plan",
  label: "Утверждённый план",
  steps: ["Утверждённый шаг один.", "Утверждённый шаг два."],
  disabledWhenRedFlags: false
};
const components = decisions.prescriptionComponentsFor(plan, ["CASE_A"]);
assert.equal(components.length, 1);
assert.equal(components[0].approvedTextId, plan.id);
assert.deepEqual(components[0].approvedSteps, plan.steps);
assert.equal(components[0].componentSchemaStatus, "pending_component_authoring");

const accepted = decisions.evaluateOwnerPlanDecision(components, { trust: 80, irritation: 10, comprehension: 85, budget: 1000 });
assert.equal(accepted.decision, "accepted");
assert.deepEqual(accepted.acceptedComponentIds, [plan.id]);
const budgetRequest = decisions.evaluateOwnerPlanDecision(components, { trust: 30, irritation: 10, comprehension: 70, budget: 10 });
assert.equal(budgetRequest.decision, "requests_cheaper_option");
assert.equal(budgetRequest.acceptedComponentIds.length, 0);

console.log(JSON.stringify({
  status: "passed",
  communicationStrategies: 4,
  distinctConsequences: true,
  prescriptionFallbackUsesApprovedText: true,
  ownerPlanDecision: true
}, null, 2));
