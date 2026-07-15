"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const economy = require("../systems/economy-runtime-v6.js");

const source = (suffix) => ({ sourceType: "test_event", sourceId: `source-${suffix}` });
const snapshot = (state) => JSON.stringify(state);
const expectNoMutation = (state, action, pattern) => {
  const before = snapshot(state);
  assert.throws(action, pattern);
  assert.equal(snapshot(state), before, "failed command mutated its input state");
};

const ledgerPost = (overrides = {}) => ({
  commandId: "cmd-ledger-1",
  ...source("ledger-1"),
  postingId: "posting-1",
  postedAt: 10,
  currencyId: "vetcoin",
  lines: [
    { lineId: "line-1-debit", accountId: "cash", side: "debit", amount: 125 },
    { lineId: "line-1-credit", accountId: "revenue", side: "credit", amount: 125 }
  ],
  ...overrides
});

assert.equal(economy.SCHEMA_VERSION, 1);
let state = economy.createState();
assert.equal(economy.validateState(state).valid, true);
assert.deepEqual(Object.keys(state), [
  "schemaVersion", "ledgerPostings", "obligations", "inventoryLots", "inventoryMovements",
  "procurements", "assets", "maintenanceRecords", "ownerPlanDecisions", "budgetDecisions",
  "recoveries", "auditHistory", "appliedCommandIds", "commandFingerprints"
]);
assert.equal(Object.isFrozen(state), true);
assert.equal(Object.isFrozen(state.auditHistory), true);
assert.deepEqual(economy.summarizeState(state), {
  schemaVersion: 1,
  ledgerPostingCount: 0,
  obligationCount: 0,
  openObligationCount: 0,
  inventoryLotCount: 0,
  inventoryMovementCount: 0,
  procurementCount: 0,
  openProcurementCount: 0,
  assetCount: 0,
  activeAssetCount: 0,
  maintenanceCount: 0,
  openMaintenanceCount: 0,
  ownerPlanDecisionCount: 0,
  budgetDecisionCount: 0,
  recoveryCount: 0,
  auditEventCount: 0
});
assert.throws(() => state.auditHistory.push({}), TypeError, "audit history must be immutable in memory");

const firstPost = economy.postLedger(state, ledgerPost());
state = firstPost.state;
assert.equal(firstPost.idempotent, false);
assert.equal(firstPost.posting.postingId, "posting-1");
assert.equal(state.auditHistory.length, 1);
assert.equal(state.auditHistory[0].sequence, 1);
assert.match(state.commandFingerprints["cmd-ledger-1"], /^ledger\.post:/);

const replayPost = economy.postLedger(state, ledgerPost());
assert.equal(replayPost.idempotent, true);
assert.equal(snapshot(replayPost.state), snapshot(state));
expectNoMutation(state, () => economy.postLedger(state, ledgerPost({
  lines: [
    { lineId: "line-1-debit", accountId: "cash", side: "debit", amount: 126 },
    { lineId: "line-1-credit", accountId: "revenue", side: "credit", amount: 126 }
  ]
})), /conflicting content/);
expectNoMutation(state, () => economy.postLedger(state, ledgerPost({
  commandId: "cmd-ledger-duplicate-source", postingId: "posting-duplicate-source"
})), /already owns command/);
expectNoMutation(state, () => economy.postLedger(state, ledgerPost({
  commandId: "cmd-ledger-unbalanced", ...source("ledger-unbalanced"), postingId: "posting-unbalanced",
  lines: [
    { lineId: "debit", accountId: "cash", side: "debit", amount: 10 },
    { lineId: "credit", accountId: "revenue", side: "credit", amount: 9 }
  ]
})), /balance exactly/);

const missingLedgerAmount = ledgerPost({
  commandId: "cmd-ledger-missing", ...source("ledger-missing"), postingId: "posting-missing",
  lines: [
    { lineId: "debit", accountId: "cash", side: "debit" },
    { lineId: "credit", accountId: "revenue", side: "credit", amount: 1 }
  ]
});
expectNoMutation(state, () => economy.postLedger(state, missingLedgerAmount), /missing required fields: amount/);
expectNoMutation(state, () => economy.postLedger(state, ledgerPost({
  commandId: "cmd-ledger-zero", ...source("ledger-zero"), postingId: "posting-zero",
  lines: [
    { lineId: "debit", accountId: "cash", side: "debit", amount: 0 },
    { lineId: "credit", accountId: "revenue", side: "credit", amount: 0 }
  ]
})), /positive safe integer/);

const reversalCommand = {
  commandId: "cmd-ledger-reverse-1",
  ...source("ledger-reverse-1"),
  reversalPostingId: "posting-reversal-1",
  originalPostingId: "posting-1",
  postedAt: 11,
  currencyId: "vetcoin",
  lines: [
    { lineId: "reverse-credit", accountId: "cash", side: "credit", amount: 125 },
    { lineId: "reverse-debit", accountId: "revenue", side: "debit", amount: 125 }
  ]
};
state = economy.reverseLedger(state, reversalCommand).state;
assert.equal(state.ledgerPostings.find((item) => item.postingId === "posting-1").reversedBy, "posting-reversal-1");
expectNoMutation(state, () => economy.reverseLedger(state, {
  ...reversalCommand,
  commandId: "cmd-ledger-reverse-2",
  ...source("ledger-reverse-2"),
  reversalPostingId: "posting-reversal-2"
}), /already reversed/);

state = economy.accrueObligation(state, {
  commandId: "cmd-obligation-accrue",
  ...source("obligation-accrue"),
  obligationId: "obligation-1",
  counterpartyId: "supplier-1",
  currencyId: "vetcoin",
  amount: 300,
  accruedAt: 20,
  dueAt: 40
}).state;
state = economy.settleObligation(state, {
  commandId: "cmd-obligation-settle-1",
  ...source("obligation-settle-1"),
  settlementId: "settlement-1",
  obligationId: "obligation-1",
  amount: 120,
  settledAt: 30
}).state;
assert.equal(state.obligations[0].amountSettled, 120);
assert.equal(state.obligations[0].status, "open");
expectNoMutation(state, () => economy.settleObligation(state, {
  commandId: "cmd-obligation-backdated-settle",
  ...source("obligation-backdated-settle"),
  settlementId: "settlement-backdated",
  obligationId: "obligation-1",
  amount: 1,
  settledAt: 29
}), /must not move backwards in time/);
expectNoMutation(state, () => economy.settleObligation(state, {
  commandId: "cmd-obligation-over-settle",
  ...source("obligation-over-settle"),
  settlementId: "settlement-over",
  obligationId: "obligation-1",
  amount: 181,
  settledAt: 31
}), /exceed obligation/);
state = economy.settleObligation(state, {
  commandId: "cmd-obligation-settle-2",
  ...source("obligation-settle-2"),
  settlementId: "settlement-2",
  obligationId: "obligation-1",
  amount: 180,
  settledAt: 32
}).state;
assert.equal(state.obligations[0].status, "settled");

state = economy.receiveInventory(state, {
  commandId: "cmd-inventory-receive-1",
  ...source("inventory-receive-1"),
  receiptId: "inventory-receipt-1",
  lotId: "lot-1",
  itemId: "supply-1",
  unitId: "piece",
  quantity: 10,
  receivedAt: 50,
  expiresAt: 80
}).state;
state = economy.receiveInventory(state, {
  commandId: "cmd-inventory-receive-2",
  ...source("inventory-receive-2"),
  receiptId: "inventory-receipt-2",
  lotId: "lot-2",
  itemId: "supply-1",
  unitId: "piece",
  quantity: 5,
  receivedAt: 51,
  expiresAt: null
}).state;
expectNoMutation(state, () => economy.consumeInventory(state, {
  commandId: "cmd-inventory-before-receipt",
  ...source("inventory-before-receipt"),
  consumptionId: "inventory-consumption-before-receipt",
  itemId: "supply-1",
  unitId: "piece",
  quantity: 1,
  consumedAt: 50,
  allocations: [{ lotId: "lot-2", quantity: 1 }]
}), /cannot precede lot receipt/);
state = economy.consumeInventory(state, {
  commandId: "cmd-inventory-consume-1",
  ...source("inventory-consume-1"),
  consumptionId: "inventory-consumption-1",
  itemId: "supply-1",
  unitId: "piece",
  quantity: 6,
  consumedAt: 60,
  allocations: [{ lotId: "lot-1", quantity: 6 }]
}).state;
assert.equal(state.inventoryLots.find((lot) => lot.lotId === "lot-1").quantityAvailable, 4);
expectNoMutation(state, () => economy.consumeInventory(state, {
  commandId: "cmd-inventory-backdated-consume",
  ...source("inventory-backdated-consume"),
  consumptionId: "inventory-consumption-backdated",
  itemId: "supply-1",
  unitId: "piece",
  quantity: 1,
  consumedAt: 59,
  allocations: [{ lotId: "lot-1", quantity: 1 }]
}), /must not move backwards in time/);
expectNoMutation(state, () => economy.consumeInventory(state, {
  commandId: "cmd-inventory-over-consume",
  ...source("inventory-over-consume"),
  consumptionId: "inventory-consumption-over",
  itemId: "supply-1",
  unitId: "piece",
  quantity: 5,
  consumedAt: 61,
  allocations: [{ lotId: "lot-1", quantity: 5 }]
}), /insufficient available quantity/);
expectNoMutation(state, () => economy.consumeInventory(state, {
  commandId: "cmd-inventory-after-expiry",
  ...source("inventory-after-expiry"),
  consumptionId: "inventory-consumption-after-expiry",
  itemId: "supply-1",
  unitId: "piece",
  quantity: 1,
  consumedAt: 80,
  allocations: [{ lotId: "lot-1", quantity: 1 }]
}), /cannot be consumed/);
expectNoMutation(state, () => economy.expireInventory(state, {
  commandId: "cmd-inventory-expire-too-early",
  ...source("inventory-expire-too-early"),
  expirationId: "inventory-expiration-too-early",
  itemId: "supply-1",
  unitId: "piece",
  quantity: 4,
  expiredAt: 79,
  allocations: [{ lotId: "lot-1", quantity: 4 }]
}), /not eligible for expiration/);
state = economy.expireInventory(state, {
  commandId: "cmd-inventory-expire-1",
  ...source("inventory-expire-1"),
  expirationId: "inventory-expiration-1",
  itemId: "supply-1",
  unitId: "piece",
  quantity: 4,
  expiredAt: 80,
  allocations: [{ lotId: "lot-1", quantity: 4 }]
}).state;
assert.equal(state.inventoryLots.find((lot) => lot.lotId === "lot-1").quantityAvailable, 0);
assert.equal(state.inventoryLots.find((lot) => lot.lotId === "lot-1").quantityExpired, 4);

const procurementCreate = {
  commandId: "cmd-procurement-create-1",
  ...source("procurement-create-1"),
  procurementId: "procurement-1",
  supplierId: "supplier-1",
  currencyId: "vetcoin",
  createdAt: 100,
  lines: [
    { procurementLineId: "proc-line-1", itemId: "supply-2", unitId: "box", quantity: 3, unitAmount: 40 },
    { procurementLineId: "proc-line-2", itemId: "supply-3", unitId: "piece", quantity: 2, unitAmount: 15 }
  ]
};
state = economy.createProcurement(state, procurementCreate).state;
const beforePartialReceipt = snapshot(state);
assert.throws(() => economy.receiveProcurement(state, {
  commandId: "cmd-procurement-invalid-multi-receipt",
  ...source("procurement-invalid-multi-receipt"),
  procurementReceiptId: "proc-receipt-invalid",
  procurementId: "procurement-1",
  receivedAt: 110,
  lines: [
    { procurementLineId: "proc-line-1", inventoryReceiptId: "proc-inventory-invalid-1", lotId: "proc-lot-invalid-1", quantity: 1, expiresAt: null },
    { procurementLineId: "proc-line-2", inventoryReceiptId: "proc-inventory-invalid-2", lotId: "proc-lot-invalid-2", quantity: 3, expiresAt: null }
  ]
}), /exceed procurement line/);
assert.equal(snapshot(state), beforePartialReceipt, "failed multi-line receipt partially changed procurement or stock");
assert.equal(state.inventoryLots.some((lot) => lot.lotId === "proc-lot-invalid-1"), false);

state = economy.receiveProcurement(state, {
  commandId: "cmd-procurement-receive-1",
  ...source("procurement-receive-1"),
  procurementReceiptId: "proc-receipt-1",
  procurementId: "procurement-1",
  receivedAt: 111,
  lines: [
    { procurementLineId: "proc-line-1", inventoryReceiptId: "proc-inventory-receipt-1", lotId: "proc-lot-1", quantity: 3, expiresAt: null },
    { procurementLineId: "proc-line-2", inventoryReceiptId: "proc-inventory-receipt-2", lotId: "proc-lot-2", quantity: 2, expiresAt: 160 }
  ]
}).state;
assert.equal(state.procurements.find((item) => item.procurementId === "procurement-1").status, "received");
assert.equal(state.inventoryLots.find((lot) => lot.lotId === "proc-lot-1").quantityAvailable, 3);
expectNoMutation(state, () => economy.receiveProcurement(state, {
  commandId: "cmd-procurement-double-receive",
  ...source("procurement-double-receive"),
  procurementReceiptId: "proc-receipt-2",
  procurementId: "procurement-1",
  receivedAt: 112,
  lines: [{ procurementLineId: "proc-line-1", inventoryReceiptId: "proc-inventory-receipt-3", lotId: "proc-lot-3", quantity: 1, expiresAt: null }]
}), /not open for receipt/);

state = economy.createProcurement(state, {
  ...procurementCreate,
  commandId: "cmd-procurement-create-2",
  ...source("procurement-create-2"),
  procurementId: "procurement-2",
  lines: [{ procurementLineId: "proc-line-3", itemId: "supply-4", unitId: "piece", quantity: 4, unitAmount: 20 }]
}).state;
state = economy.cancelProcurement(state, {
  commandId: "cmd-procurement-cancel-2",
  ...source("procurement-cancel-2"),
  cancellationId: "proc-cancellation-2",
  procurementId: "procurement-2",
  cancelledAt: 105
}).state;
expectNoMutation(state, () => economy.cancelProcurement(state, {
  commandId: "cmd-procurement-double-cancel",
  ...source("procurement-double-cancel"),
  cancellationId: "proc-cancellation-3",
  procurementId: "procurement-2",
  cancelledAt: 106
}), /cannot be cancelled/);

state = economy.acquireAsset(state, {
  commandId: "cmd-asset-acquire-1",
  ...source("asset-acquire-1"),
  acquisitionId: "asset-acquisition-1",
  assetId: "asset-1",
  assetTypeId: "equipment-type-1",
  currencyId: "vetcoin",
  amount: 900,
  acquiredAt: 200
}).state;
expectNoMutation(state, () => economy.disposeAsset(state, {
  commandId: "cmd-asset-dispose-before-acquisition",
  ...source("asset-dispose-before-acquisition"),
  disposalId: "asset-disposal-before-acquisition",
  assetId: "asset-1",
  disposedAt: 199
}), /cannot precede acquisition/);
expectNoMutation(state, () => economy.scheduleMaintenance(state, {
  commandId: "cmd-maintenance-backdated-schedule",
  ...source("maintenance-backdated-schedule"),
  maintenanceId: "maintenance-backdated",
  assetId: "asset-1",
  scheduledAt: 199,
  startAt: 210,
  endAt: 220
}), /cannot be scheduled before asset acquisition|must not move backwards/);
state = economy.scheduleMaintenance(state, {
  commandId: "cmd-maintenance-schedule-1",
  ...source("maintenance-schedule-1"),
  maintenanceId: "maintenance-1",
  assetId: "asset-1",
  scheduledAt: 201,
  startAt: 210,
  endAt: 220
}).state;
expectNoMutation(state, () => economy.disposeAsset(state, {
  commandId: "cmd-asset-dispose-too-early",
  ...source("asset-dispose-too-early"),
  disposalId: "asset-disposal-too-early",
  assetId: "asset-1",
  disposedAt: 215
}), /unfinished scheduled maintenance/);
expectNoMutation(state, () => economy.completeMaintenance(state, {
  commandId: "cmd-maintenance-backdated-complete",
  ...source("maintenance-backdated-complete"),
  completionId: "maintenance-completion-backdated",
  maintenanceId: "maintenance-1",
  completedAt: 219
}), /cannot precede its scheduled end/);
state = economy.completeMaintenance(state, {
  commandId: "cmd-maintenance-complete-1",
  ...source("maintenance-complete-1"),
  completionId: "maintenance-completion-1",
  maintenanceId: "maintenance-1",
  completedAt: 220
}).state;
expectNoMutation(state, () => economy.disposeAsset(state, {
  commandId: "cmd-asset-backdated-dispose",
  ...source("asset-backdated-dispose"),
  disposalId: "asset-disposal-backdated",
  assetId: "asset-1",
  disposedAt: 219
}), /must not move backwards across maintenance history/);
expectNoMutation(state, () => economy.scheduleMaintenance(state, {
  commandId: "cmd-maintenance-second-backdated-schedule",
  ...source("maintenance-second-backdated-schedule"),
  maintenanceId: "maintenance-second-backdated",
  assetId: "asset-1",
  scheduledAt: 219,
  startAt: 230,
  endAt: 240
}), /must not move backwards in asset history/);
expectNoMutation(state, () => economy.completeMaintenance(state, {
  commandId: "cmd-maintenance-double-complete",
  ...source("maintenance-double-complete"),
  completionId: "maintenance-completion-2",
  maintenanceId: "maintenance-1",
  completedAt: 220
}), /already complete/);
state = economy.disposeAsset(state, {
  commandId: "cmd-asset-dispose-1",
  ...source("asset-dispose-1"),
  disposalId: "asset-disposal-1",
  assetId: "asset-1",
  disposedAt: 230
}).state;
expectNoMutation(state, () => economy.disposeAsset(state, {
  commandId: "cmd-asset-double-dispose",
  ...source("asset-double-dispose"),
  disposalId: "asset-disposal-2",
  assetId: "asset-1",
  disposedAt: 231
}), /already disposed/);

state = economy.recordOwnerPlanDecision(state, {
  commandId: "cmd-owner-plan-accepted",
  ...source("owner-plan-accepted"),
  ownerPlanDecisionId: "owner-plan-decision-1",
  ownerId: "owner-1",
  planId: "plan-1",
  outcomeId: "accepted",
  decidedAt: 240,
  ledgerPostingIds: ["posting-1"],
  inventoryConsumptionIds: ["inventory-consumption-1"]
}).state;
state = economy.recordOwnerPlanDecision(state, {
  commandId: "cmd-owner-plan-refused",
  ...source("owner-plan-refused"),
  ownerPlanDecisionId: "owner-plan-decision-2",
  ownerId: "owner-2",
  planId: "plan-2",
  outcomeId: "refused",
  decidedAt: 241,
  ledgerPostingIds: [],
  inventoryConsumptionIds: []
}).state;
assert.deepEqual(state.ownerPlanDecisions[1].ledgerPostingIds, [], "refusal must be representable without payment");
assert.deepEqual(state.ownerPlanDecisions[1].inventoryConsumptionIds, [], "refusal must be representable without consumption");
state = economy.recordBudgetDecision(state, {
  commandId: "cmd-budget-approved",
  ...source("budget-approved"),
  budgetDecisionId: "budget-decision-1",
  ownerId: "owner-1",
  budgetId: "budget-1",
  outcomeId: "approved",
  decidedAt: 242,
  currencyId: "vetcoin",
  amount: 75
}).state;
state = economy.recordBudgetDecision(state, {
  commandId: "cmd-budget-refused",
  ...source("budget-refused"),
  budgetDecisionId: "budget-decision-2",
  ownerId: "owner-2",
  budgetId: "budget-2",
  outcomeId: "refused",
  decidedAt: 243,
  currencyId: null,
  amount: null
}).state;
assert.equal(state.budgetDecisions[1].amount, null, "no-payment decision must not use numeric zero");
const missingBudgetAmount = {
  commandId: "cmd-budget-missing",
  ...source("budget-missing"),
  budgetDecisionId: "budget-decision-missing",
  ownerId: "owner-3",
  budgetId: "budget-3",
  outcomeId: "approved",
  decidedAt: 244,
  currencyId: "vetcoin"
};
expectNoMutation(state, () => economy.recordBudgetDecision(state, missingBudgetAmount), /missing required fields: amount/);
expectNoMutation(state, () => economy.recordBudgetDecision(state, {
  ...missingBudgetAmount,
  commandId: "cmd-budget-zero",
  ...source("budget-zero"),
  budgetDecisionId: "budget-decision-zero",
  amount: 0
}), /positive safe integer/);
expectNoMutation(state, () => economy.recordOwnerPlanDecision(state, {
  commandId: "cmd-owner-clinical",
  ...source("owner-clinical"),
  ownerPlanDecisionId: "owner-plan-decision-clinical",
  ownerId: "owner-4",
  planId: "plan-4",
  outcomeId: "refused",
  decidedAt: 245,
  ledgerPostingIds: [],
  inventoryConsumptionIds: [],
  diagnosis: "forbidden narrative"
}), /forbidden clinical or narrative field diagnosis/);

state = economy.transitionRecovery(state, {
  commandId: "cmd-recovery-open",
  ...source("recovery-open"),
  transitionId: "recovery-transition-open",
  recoveryId: "recovery-1",
  fromStatus: null,
  toStatus: "open",
  transitionedAt: 300
}).state;
expectNoMutation(state, () => economy.transitionRecovery(state, {
  commandId: "cmd-recovery-direct-close",
  ...source("recovery-direct-close"),
  transitionId: "recovery-transition-direct-close",
  recoveryId: "recovery-1",
  fromStatus: "open",
  toStatus: "closed",
  transitionedAt: 301
}), /can close only after stabilized or closure_review/);
state = economy.recordRecoveryAttempt(state, {
  commandId: "cmd-recovery-attempt-1",
  ...source("recovery-attempt-1"),
  attemptId: "recovery-attempt-1",
  recoveryId: "recovery-1",
  actionId: "explicit-action-1",
  result: "failed",
  attemptedAt: 301
}).state;
expectNoMutation(state, () => economy.transitionRecovery(state, {
  commandId: "cmd-recovery-premature-closure",
  ...source("recovery-premature-closure"),
  transitionId: "recovery-transition-premature-closure",
  recoveryId: "recovery-1",
  fromStatus: "open",
  toStatus: "closure_review",
  transitionedAt: 302
}), /at least two explicit failed attempts/);
state = economy.transitionRecovery(state, {
  commandId: "cmd-recovery-active",
  ...source("recovery-active"),
  transitionId: "recovery-transition-active",
  recoveryId: "recovery-1",
  fromStatus: "open",
  toStatus: "active",
  transitionedAt: 302
}).state;
expectNoMutation(state, () => economy.recordRecoveryAttempt(state, {
  commandId: "cmd-recovery-backdated-attempt",
  ...source("recovery-backdated-attempt"),
  attemptId: "recovery-attempt-backdated",
  recoveryId: "recovery-1",
  actionId: "explicit-action-backdated",
  result: "failed",
  attemptedAt: 301
}), /must not move backwards in time/);
state = economy.recordRecoveryAttempt(state, {
  commandId: "cmd-recovery-attempt-2",
  ...source("recovery-attempt-2"),
  attemptId: "recovery-attempt-2",
  recoveryId: "recovery-1",
  actionId: "explicit-action-2",
  result: "failed",
  attemptedAt: 303
}).state;
expectNoMutation(state, () => economy.transitionRecovery(state, {
  commandId: "cmd-recovery-backdated-transition",
  ...source("recovery-backdated-transition"),
  transitionId: "recovery-transition-backdated",
  recoveryId: "recovery-1",
  fromStatus: "active",
  toStatus: "stabilized",
  transitionedAt: 302
}), /must not move backwards in time/);
state = economy.transitionRecovery(state, {
  commandId: "cmd-recovery-closure-review",
  ...source("recovery-closure-review"),
  transitionId: "recovery-transition-closure-review",
  recoveryId: "recovery-1",
  fromStatus: "active",
  toStatus: "closure_review",
  transitionedAt: 304
}).state;
assert.equal(state.recoveries[0].status, "closure_review");
state = economy.transitionRecovery(state, {
  commandId: "cmd-recovery-close-reviewed",
  ...source("recovery-close-reviewed"),
  transitionId: "recovery-transition-close-reviewed",
  recoveryId: "recovery-1",
  fromStatus: "closure_review",
  toStatus: "closed",
  transitionedAt: 305
}).state;
assert.equal(state.recoveries[0].status, "closed");
expectNoMutation(state, () => economy.recordRecoveryAttempt(state, {
  commandId: "cmd-recovery-attempt-after-close",
  ...source("recovery-attempt-after-close"),
  attemptId: "recovery-attempt-after-close",
  recoveryId: "recovery-1",
  actionId: "explicit-action-after-close",
  result: "succeeded",
  attemptedAt: 306
}), /cannot accept attempts/);

for (const [index, event] of state.auditHistory.entries()) {
  expectNoMutation(state, () => economy.applyCommand(state, {
    type: event.type,
    ...event.command,
    commandId: `semantic-retry-${index + 1}`
  }), /already owns command/);
}

const serialized = economy.serializeState(state);
const reloaded = economy.deserializeState(serialized);
assert.deepEqual(reloaded, state, "serialization/reload changed deterministic economy state");
assert.equal(economy.validateState(reloaded).valid, true);
assert.equal(economy.normalizeState(reloaded).auditHistory.length, state.auditHistory.length);
const replayAfterReload = economy.reverseLedger(reloaded, reversalCommand);
assert.equal(replayAfterReload.idempotent, true, "exact command replay was lost after reload");
assert.equal(snapshot(replayAfterReload.state), serialized);
const persistedSourceOwner = reloaded.auditHistory.find((event) => event.type === "obligation.accrue");
expectNoMutation(reloaded, () => economy.applyCommand(reloaded, {
  type: persistedSourceOwner.type,
  ...persistedSourceOwner.command,
  commandId: "semantic-retry-after-reload"
}), /already owns command/);
expectNoMutation(reloaded, () => economy.reverseLedger(reloaded, {
  ...reversalCommand,
  postedAt: reversalCommand.postedAt + 1
}), /conflicting content/);

const corruptProjection = JSON.parse(serialized);
corruptProjection.inventoryLots[0].quantityAvailable += 1;
assert.equal(economy.validateState(corruptProjection).valid, false);
assert.match(economy.validateState(corruptProjection).errors[0], /projections do not match/);
const corruptFingerprint = JSON.parse(serialized);
corruptFingerprint.auditHistory[0].fingerprint += "tampered";
assert.equal(economy.validateState(corruptFingerprint).valid, false);
assert.match(economy.validateState(corruptFingerprint).errors[0], /fingerprint does not match/);
const corruptAuditCommand = JSON.parse(serialized);
corruptAuditCommand.auditHistory[0].command.lines[0].amount = 126;
assert.equal(economy.validateState(corruptAuditCommand).valid, false);
const corruptSequence = JSON.parse(serialized);
corruptSequence.auditHistory[1].sequence = 99;
assert.equal(economy.validateState(corruptSequence).valid, false);
assert.equal(economy.validateState({ ...JSON.parse(serialized), schemaVersion: 2 }).valid, false);
assert.throws(() => economy.deserializeState("not json"), /Cannot parse economy state/);

const atomicBase = economy.createState();
const atomicFailureCommands = [
  {
    type: "inventory.receive",
    commandId: "cmd-atomic-receive",
    ...source("atomic-receive"),
    receiptId: "atomic-receipt",
    lotId: "atomic-lot",
    itemId: "atomic-item",
    unitId: "piece",
    quantity: 2,
    receivedAt: 1,
    expiresAt: null
  },
  {
    type: "inventory.consume",
    commandId: "cmd-atomic-consume-invalid",
    ...source("atomic-consume-invalid"),
    consumptionId: "atomic-consumption-invalid",
    itemId: "atomic-item",
    unitId: "piece",
    quantity: 3,
    consumedAt: 2,
    allocations: [{ lotId: "atomic-lot", quantity: 3 }]
  }
];
expectNoMutation(atomicBase, () => economy.applyCommandsAtomically(atomicBase, atomicFailureCommands), /insufficient available quantity/);
assert.equal(atomicBase.inventoryLots.length, 0, "failed atomic batch leaked its first effect");
const sharedSourceAtomicBase = economy.createState();
const sharedSourceAtomicSnapshot = snapshot(sharedSourceAtomicBase);
expectNoMutation(sharedSourceAtomicBase, () => economy.applyCommandsAtomically(sharedSourceAtomicBase, [
  {
    type: "ledger.post",
    commandId: "cmd-atomic-shared-source-ledger",
    sourceType: "atomic_shared_source",
    sourceId: "shared-source-1",
    postingId: "atomic-shared-source-posting",
    postedAt: 1,
    currencyId: "vetcoin",
    lines: [
      { lineId: "atomic-shared-debit", accountId: "cash", side: "debit", amount: 1 },
      { lineId: "atomic-shared-credit", accountId: "revenue", side: "credit", amount: 1 }
    ]
  },
  {
    type: "budget_decision.record",
    commandId: "cmd-atomic-shared-source-budget",
    sourceType: "atomic_shared_source",
    sourceId: "shared-source-1",
    budgetDecisionId: "atomic-shared-source-budget-decision",
    ownerId: "atomic-owner",
    budgetId: "atomic-budget",
    outcomeId: "refused",
    decidedAt: 1,
    currencyId: null,
    amount: null
  }
]), /already owns command/);
assert.equal(
  snapshot(sharedSourceAtomicBase),
  sharedSourceAtomicSnapshot,
  "cross-type shared-source atomic rejection changed the original state"
);
assert.equal(sharedSourceAtomicBase.auditHistory.length, 0);
assert.equal(sharedSourceAtomicBase.ledgerPostings.length, 0);
assert.equal(sharedSourceAtomicBase.budgetDecisions.length, 0);
const atomicSuccess = economy.applyCommandsAtomically(atomicBase, [
  atomicFailureCommands[0],
  {
    ...atomicFailureCommands[1],
    commandId: "cmd-atomic-consume-valid",
    ...source("atomic-consume-valid"),
    consumptionId: "atomic-consumption-valid",
    quantity: 2,
    allocations: [{ lotId: "atomic-lot", quantity: 2 }]
  }
]);
assert.equal(atomicSuccess.state.inventoryLots[0].quantityAvailable, 0);
assert.equal(atomicSuccess.results.length, 2);
assert.equal(atomicSuccess.state.auditHistory.length, 2);

let procurementChronology = economy.createProcurement(economy.createState(), {
  commandId: "cmd-procurement-chronology-create",
  ...source("procurement-chronology-create"),
  procurementId: "procurement-chronology",
  supplierId: "supplier-chronology",
  currencyId: "vetcoin",
  createdAt: 100,
  lines: [{
    procurementLineId: "procurement-chronology-line",
    itemId: "chronology-item",
    unitId: "piece",
    quantity: 2,
    unitAmount: 10
  }]
}).state;
procurementChronology = economy.receiveProcurement(procurementChronology, {
  commandId: "cmd-procurement-chronology-receive",
  ...source("procurement-chronology-receive"),
  procurementReceiptId: "procurement-chronology-receipt",
  procurementId: "procurement-chronology",
  receivedAt: 150,
  lines: [{
    procurementLineId: "procurement-chronology-line",
    inventoryReceiptId: "procurement-chronology-inventory-receipt",
    lotId: "procurement-chronology-lot",
    quantity: 1,
    expiresAt: null
  }]
}).state;
expectNoMutation(procurementChronology, () => economy.receiveProcurement(procurementChronology, {
  commandId: "cmd-procurement-backdated-receive",
  ...source("procurement-backdated-receive"),
  procurementReceiptId: "procurement-backdated-receipt",
  procurementId: "procurement-chronology",
  receivedAt: 149,
  lines: [{
    procurementLineId: "procurement-chronology-line",
    inventoryReceiptId: "procurement-backdated-inventory-receipt",
    lotId: "procurement-backdated-lot",
    quantity: 1,
    expiresAt: null
  }]
}), /receipts must not move backwards in time/);
expectNoMutation(procurementChronology, () => economy.cancelProcurement(procurementChronology, {
  commandId: "cmd-procurement-backdated-cancel",
  ...source("procurement-backdated-cancel"),
  cancellationId: "procurement-backdated-cancellation",
  procurementId: "procurement-chronology",
  cancelledAt: 110
}), /must not precede an existing receipt/);
procurementChronology = economy.cancelProcurement(procurementChronology, {
  commandId: "cmd-procurement-chronology-cancel",
  ...source("procurement-chronology-cancel"),
  cancellationId: "procurement-chronology-cancellation",
  procurementId: "procurement-chronology",
  cancelledAt: 151
}).state;
assert.equal(procurementChronology.procurements[0].status, "cancelled");

const genericResult = economy.applyCommand(economy.createState(), {
  type: "budget_decision.record",
  commandId: "cmd-generic-budget-refused",
  ...source("generic-budget-refused"),
  budgetDecisionId: "generic-budget-decision",
  ownerId: "owner-generic",
  budgetId: "budget-generic",
  outcomeId: "refused",
  decidedAt: 1,
  currencyId: null,
  amount: null
});
assert.equal(genericResult.state.budgetDecisions.length, 1);
assert.equal(genericResult.event.type, "budget_decision.record");

const runtimeSource = fs.readFileSync(path.join(__dirname, "../systems/economy-runtime-v6.js"), "utf8");
const browserContext = { globalThis: {} };
vm.runInNewContext(runtimeSource, browserContext, { filename: "economy-runtime-v6.js" });
assert.equal(typeof browserContext.globalThis.PET_CLINIC_ECONOMY_RUNTIME_V6.createState, "function");
assert.equal(browserContext.globalThis.PET_CLINIC_ECONOMY_RUNTIME_V6.validateState(
  browserContext.globalThis.PET_CLINIC_ECONOMY_RUNTIME_V6.createState()
).valid, true);

const summary = economy.summarizeState(state);
assert.equal(summary.ledgerPostingCount, 2);
assert.equal(summary.obligationCount, 1);
assert.equal(summary.inventoryLotCount, 4);
assert.equal(summary.procurementCount, 2);
assert.equal(summary.assetCount, 1);
assert.equal(summary.maintenanceCount, 1);
assert.equal(summary.recoveryCount, 1);
assert.equal(summary.auditEventCount, state.auditHistory.length);

console.log(JSON.stringify({
  schemaVersion: economy.SCHEMA_VERSION,
  auditEvents: state.auditHistory.length,
  commandTypes: [...new Set(state.auditHistory.map((event) => event.type))].sort(),
  summary,
  serializationBytes: Buffer.byteLength(serialized),
  atomicFailureProtected: true,
  browserUmdVerified: true
}, null, 2));
