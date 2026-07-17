#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const medicalLoader = require(path.join(root, "generator/activation-medical-v11.js"));
const economyRuntime = require(path.join(root, "systems/economy-runtime-v6.js"));
const reputationRuntime = require(path.join(root, "systems/reputation-runtime-v6.js"));
const scheduler = require(path.join(root, "systems/resource-scheduler-v5.js"));
const operationsFactory = require(path.join(root, "systems/operations-runtime-v5.js"));
const operations = operationsFactory.createOperationsRuntime(scheduler);

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function schedulerState(operationsState) {
  return {
    schemaVersion: operationsState.schemaVersion,
    resources: plain(operationsState.resources),
    tasks: plain(operationsState.tasks),
    reservations: plain(operationsState.reservations),
    appliedCommandIds: plain(operationsState.appliedCommandIds),
    commandFingerprints: plain(operationsState.commandFingerprints)
  };
}

(async () => {
  const catalog = await medicalLoader.loadFromDirectory(root, { modeId: "campaign" });
  const p5 = catalog.p5Activation;
  const p6 = catalog.economyActivation;
  assert.equal(p6.approval.status, "approved_without_numeric_changes");
  assert.equal(p6.audit.mustAffectRuntime, 9);
  assert.equal(p6.audit.resourceCount, 49);
  assert.equal(p6.wageFor("staff.doctor.sokolova"), 720);
  assert.equal(p6.resource("room.procedure.1").economicRecord.purchasePrice, 16000);
  assert.equal(p6.resource("equipment.xray_system").economicRecord.maintenanceCost, 420);

  const campaignPolicy = p6.modePolicy("campaign", new URLSearchParams());
  const trainingPolicy = p6.modePolicy("training", new URLSearchParams());
  const endlessPolicy = p6.modePolicy("endless", new URLSearchParams());
  const testerUnlimited = p6.modePolicy("tester", new URLSearchParams());
  const testerReal = p6.modePolicy("tester", new URLSearchParams("testerEconomy=real"));
  assert.deepEqual(plain([campaignPolicy.kind, trainingPolicy.kind, endlessPolicy.kind, testerUnlimited.kind, testerReal.kind]),
    ["real", "sandboxed", "real", "unlimited", "real"]);

  let economyState = p6.initializeEconomyState(economyRuntime.createState());
  assert.equal(economyState.inventoryLots.length, 10);
  assert.equal(economyState.assets.length, 2);
  const initializedAgain = p6.initializeEconomyState(economyState);
  assert.deepEqual(plain(initializedAgain), plain(economyState), "P6 baseline must be idempotent");

  const income = p6.recordCashFlow(economyState, {
    flowId: "test.patient.1",
    sourceType: "patient_income",
    at: 480,
    amount: 150,
    direction: "income",
    accountId: "revenue.patient"
  }, campaignPolicy);
  economyState = income.state;
  assert.equal(income.cashDelta, 150);
  assert.equal(p6.recordCashFlow(economyState, {
    flowId: "test.patient.1",
    sourceType: "patient_income",
    at: 480,
    amount: 150,
    direction: "income",
    accountId: "revenue.patient"
  }, campaignPolicy).cashDelta, 0, "replayed income must not change cash twice");
  assert.equal(p6.recordCashFlow(economyState, {
    flowId: "test.training.expense",
    sourceType: "staff_wage",
    at: 481,
    amount: 720,
    direction: "expense",
    accountId: "expense.staff_wage"
  }, trainingPolicy).cashDelta, 0, "training expenses must not create irreversible loss");
  assert.equal(p6.recordCashFlow(economyState, {
    flowId: "test.unlimited.income",
    sourceType: "patient_income",
    at: 482,
    amount: 150,
    direction: "income",
    accountId: "revenue.patient"
  }, testerUnlimited).cashDelta, 0, "unlimited tester economy must not change funds");

  let lifecycleState = p5.createLifecycleState();
  let operationsState = p5.reconcileOperationsState(lifecycleState, operations.createState());
  const lockedBefore = plain(lifecycleState);
  assert.throws(() => p6.purchaseAsset({
    lifecycleState,
    economyState,
    assetCatalogId: "asset_tonometer",
    at: 500,
    unlockedAssetCatalogIds: [],
    policy: campaignPolicy
  }), /unlock evidence/);
  assert.deepEqual(plain(lifecycleState), lockedBefore, "failed purchase must not mutate lifecycle state");

  const purchase = p6.purchaseAsset({
    lifecycleState,
    economyState,
    assetCatalogId: "asset_tonometer",
    at: 500,
    unlockedAssetCatalogIds: ["asset_tonometer"],
    policy: campaignPolicy
  });
  lifecycleState = purchase.lifecycleState;
  economyState = purchase.economyState;
  assert.equal(purchase.price, 900);
  assert.equal(purchase.cashDelta, -900);
  assert.equal(economyState.assets.find((asset) => asset.assetId === "asset_tonometer").amount, 900);

  const delivery = p6.completeDelivery({
    lifecycleState,
    economyState,
    assetId: "asset_tonometer",
    at: 500 + 1440
  });
  lifecycleState = delivery.lifecycleState;
  economyState = delivery.economyState;
  const training = p6.completeTraining({
    lifecycleState,
    economyState,
    assetId: "asset_tonometer",
    staffId: "staff.doctor.sokolova",
    at: 500 + 1440 + 60
  });
  lifecycleState = training.lifecycleState;
  economyState = training.economyState;
  operationsState = p5.reconcileOperationsState(lifecycleState, operationsState);

  const maintenance = p6.scheduleMaintenance({
    lifecycleState,
    economyState,
    assetId: "asset_tonometer",
    at: 2100,
    schedulerState: schedulerState(operationsState),
    breakdown: true
  });
  lifecycleState = maintenance.lifecycleState;
  economyState = maintenance.economyState;
  assert.equal(maintenance.endAt, 2160);
  operationsState = p5.reconcileOperationsState(lifecycleState, operationsState);
  const maintenanceComplete = p6.completeMaintenance({
    lifecycleState,
    economyState,
    assetId: "asset_tonometer",
    maintenanceId: maintenance.maintenanceId,
    at: maintenance.endAt,
    schedulerState: schedulerState(operationsState),
    policy: campaignPolicy
  });
  lifecycleState = maintenanceComplete.lifecycleState;
  economyState = maintenanceComplete.economyState;
  assert.equal(maintenanceComplete.cost, 90);
  assert.equal(maintenanceComplete.cashDelta, -90);
  assert.equal(maintenanceComplete.nextDueAt, 2160 + 20 * 1440);

  const cytologyTask = p5.documents.researchTasks.researchTasks
    .find((task) => task.researchId === "acetate_tape_prep");
  const stock = p6.consumeResearchStock({
    lifecycleState,
    economyState,
    researchTask: cytologyTask,
    sourceId: "test.research.cytology",
    at: 2200
  });
  lifecycleState = stock.lifecycleState;
  economyState = stock.economyState;
  assert.deepEqual(stock.categories, ["cytology"]);
  assert.equal(economyState.inventoryLots.find((lot) => lot.itemId === "stock.cytology").quantityAvailable, 29);

  const urineTask = { inventoryCapabilityIds: ["urine_consumables"] };
  for (let index = 0; index < 15; index += 1) {
    const consumed = p6.consumeResearchStock({
      lifecycleState,
      economyState,
      researchTask: urineTask,
      sourceId: `test.urine.${index}`,
      at: 2300 + index
    });
    lifecycleState = consumed.lifecycleState;
    economyState = consumed.economyState;
  }
  const beforeAtomicFailure = { lifecycleState: plain(lifecycleState), economyState: plain(economyState) };
  assert.throws(() => p6.consumeResearchStock({
    lifecycleState,
    economyState,
    researchTask: { inventoryCapabilityIds: ["cytology_consumables", "urine_consumables"] },
    sourceId: "test.atomic.stock.failure",
    at: 2400
  }), /insufficient urine inventory/);
  assert.deepEqual(plain(lifecycleState), beforeAtomicFailure.lifecycleState);
  assert.deepEqual(plain(economyState), beforeAtomicFailure.economyState);

  const referral = p6.recordBudgetDecision(economyState, {
    decisionId: "referral.test.1",
    sourceType: "safe_referral",
    sourceId: "referral.1",
    ownerId: "owner.1",
    budgetId: "local_income",
    outcomeId: "not_authored_no_charge",
    at: 2500,
    amount: null
  });
  economyState = referral.state;
  assert.equal(referral.decision.amount, null, "unpriced referral must not invent a cost");

  let reputationState = p6.initializeReputationState(reputationRuntime.createState(), {
    clinical: 74,
    communication: 74,
    accessibility: 74,
    organization: 74
  });
  reputationState = p6.recordReputationEvent(reputationState, {
    eventId: "test.communication.1",
    sourceType: "owner_trust_change",
    sourceId: "visit.1",
    axis: "communication",
    delta: -2
  }).state;
  assert.equal(reputationRuntime.summarizeState(reputationState).scores.communication, 72);

  const reloadedEconomy = economyRuntime.deserializeState(economyRuntime.serializeState(economyState));
  const reloadedReputation = reputationRuntime.deserializeState(reputationRuntime.serializeState(reputationState));
  assert.deepEqual(plain(reloadedEconomy), plain(economyState));
  assert.deepEqual(plain(reloadedReputation), plain(reputationState));
  assert.equal(p5.lifecycle.validateState(lifecycleState).valid, true);

  console.log(JSON.stringify({
    activation: p6.version,
    approvalSha256: p6.approvalSha256,
    resourceCount: p6.audit.resourceCount,
    startingInventoryCategories: p6.audit.startingInventoryCategories,
    explicitInventoryCapabilityMappings: p6.audit.explicitInventoryCapabilityMappings,
    exactDoctorWage: p6.wageFor("staff.doctor.sokolova"),
    ledgerPostings: reloadedEconomy.ledgerPostings.length,
    inventoryMovements: reloadedEconomy.inventoryMovements.length,
    assets: reloadedEconomy.assets.length,
    maintenanceRecords: reloadedEconomy.maintenanceRecords.length,
    referralDecisions: reloadedEconomy.budgetDecisions.length,
    reputationEvents: reputationRuntime.summarizeState(reloadedReputation).eventCount,
    fourModePolicies: true,
    trainingLossProtected: true,
    testerUnlimitedProtected: true,
    atomicStockFailureProtected: true,
    reloadVerified: true
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
