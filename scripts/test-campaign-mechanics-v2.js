"use strict";

const assert = require("node:assert/strict");
const mechanics = require("../systems/campaign-mechanics-v2.js");

const thresholds = [
  [0, 1, true, true],
  [39, 1, true, true],
  [40, 1.1, true, true],
  [59, 1.1, true, true],
  [60, 1.2, true, true],
  [79, 1.2, true, true],
  [80, 1.35, false, true],
  [99, 1.35, false, true],
  [100, 1.35, false, false]
];
thresholds.forEach(([fatigue, multiplier, canExtendShift, canStartRoutineVisit]) => {
  const effect = mechanics.fatigueEffect(fatigue);
  assert.equal(effect.multiplier, multiplier, `wrong multiplier at ${fatigue}%`);
  assert.equal(effect.canExtendShift, canExtendShift, `wrong extension rule at ${fatigue}%`);
  assert.equal(effect.canStartRoutineVisit, canStartRoutineVisit, `wrong consultation rule at ${fatigue}%`);
});
assert.equal(mechanics.adjustedActionMinutes(10, 39), 10);
assert.equal(mechanics.adjustedActionMinutes(10, 40), 11);
assert.equal(mechanics.adjustedActionMinutes(10, 60), 12);
assert.equal(mechanics.adjustedActionMinutes(10, 80), 14);

const forecast = mechanics.forecastFatigue({ fatigue: 50, remainingShiftMinutes: 120, expectedActiveWorkMinutes: 30, closingLoad: 12 });
assert.ok(forecast.projected > forecast.current);
assert.equal(mechanics.expectedRecovery(50, 1).afterRest, 34);

const ledger = mechanics.createDailyLedger({ day: 7, ownerTrust: 72, clinicalReliability: 80, doctorId: "doctor-a", fatigue: 44 });
Object.assign(ledger, { consultationRevenue: 700, diagnosticRevenue: 90, procedureCost: 105, payroll: 360, maintenance: 110 });
assert.equal(mechanics.calculateLedgerNet(ledger), 215);

const stableReview = mechanics.weeklyFinancialReview({ day: 7, money: 500, mandatoryExpenses: 470, creditLimit: 2500 });
assert.equal(stableReview.closureRisk, "stable");
const highReview = mechanics.weeklyFinancialReview({ day: 14, money: -2300, mandatoryExpenses: 470, creditLimit: 2500 });
assert.equal(highReview.closureRisk, "high");

const success = mechanics.evaluateCampaignOutcome({ day: 30, money: -500, creditLimit: 2500, clinicalReliability: 70, mandatoryTrainingComplete: true });
assert.equal(success.success, true);
assert.equal(success.freePlayAvailable, true);
const failure = mechanics.evaluateCampaignOutcome({ day: 30, money: -2600, creditLimit: 2500, clinicalReliability: 44, mandatoryTrainingComplete: false });
assert.equal(failure.success, false);

console.log(JSON.stringify({
  status: "passed",
  fatigueThresholds: thresholds.length,
  ledgerNet: mechanics.calculateLedgerNet(ledger),
  weeklyReview: true,
  campaignOutcome: true
}, null, 2));
