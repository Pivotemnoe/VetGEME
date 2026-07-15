(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_ECONOMY_RUNTIME_V6 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const STATE_FIELDS = Object.freeze([
    "schemaVersion", "ledgerPostings", "obligations", "inventoryLots", "inventoryMovements",
    "procurements", "assets", "maintenanceRecords", "ownerPlanDecisions", "budgetDecisions",
    "recoveries", "auditHistory", "appliedCommandIds", "commandFingerprints"
  ]);
  const AUDIT_FIELDS = Object.freeze(["sequence", "commandId", "type", "fingerprint", "command"]);
  const SOURCE_FIELDS = Object.freeze(["sourceType", "sourceId"]);
  const RECOVERY_STATUSES = Object.freeze(["open", "active", "stabilized", "closure_review", "closed"]);
  const RECOVERY_RESULTS = Object.freeze(["succeeded", "failed"]);
  const FORBIDDEN_OPERATION_FIELDS = Object.freeze([
    "anamnesis", "complaint", "diagnosis", "diagnoses", "diagnosticNarrative", "clinical",
    "clinicalNarrative", "medical", "medicalNarrative", "symptom", "symptoms", "examination",
    "prognosis", "treatment", "medication", "prescription", "dose", "patientNarrative",
    "description", "displayText", "label", "narrative", "notes", "text"
  ]);
  const forbiddenFields = new Set(FORBIDDEN_OPERATION_FIELDS.map((field) => field.toLowerCase()));

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return value;
  }

  function compareStrings(left, right) {
    return left.localeCompare(right, "en");
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    return `{${Object.keys(value).sort(compareStrings).map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(",")}}`;
  }

  function assertSerializable(value, label, ancestors = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") {
      if (!Number.isFinite(value) || Object.is(value, -0)) {
        throw new TypeError(`${label} must contain only finite JSON numbers and must not contain -0.`);
      }
      return;
    }
    if (typeof value !== "object") throw new TypeError(`${label} must be JSON-serializable.`);
    if (ancestors.has(value)) throw new TypeError(`${label} must not contain cycles.`);
    if (!Array.isArray(value) && !isObject(value)) throw new TypeError(`${label} must contain only plain objects.`);
    ancestors.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertSerializable(item, `${label}[${index}]`, ancestors));
    } else {
      Object.keys(value).forEach((key) => assertSerializable(value[key], `${label}.${key}`, ancestors));
    }
    ancestors.delete(value);
  }

  function assertNoClinicalFields(value, label) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoClinicalFields(item, `${label}[${index}]`));
      return;
    }
    Object.keys(value).forEach((key) => {
      if (forbiddenFields.has(key.toLowerCase())) {
        throw new Error(`${label} contains forbidden clinical or narrative field ${key}.`);
      }
      assertNoClinicalFields(value[key], `${label}.${key}`);
    });
  }

  function assertExactKeys(value, allowed, label) {
    if (!isObject(value)) throw new TypeError(`${label} must be an object.`);
    const actual = Object.keys(value);
    const missing = allowed.filter((key) => !own(value, key));
    const extra = actual.filter((key) => !allowed.includes(key));
    if (missing.length) throw new Error(`${label} is missing required fields: ${missing.join(", ")}.`);
    if (extra.length) throw new Error(`${label} contains unsupported fields: ${extra.join(", ")}.`);
  }

  function requireIdentifier(value, label) {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
      throw new TypeError(`${label} must be a non-empty stable identifier.`);
    }
    return value;
  }

  function requireTime(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${label} must be a non-negative safe integer campaign time.`);
    }
    return value;
  }

  function requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${label} must be a positive safe integer.`);
    }
    return value;
  }

  function safeAdd(left, right, label) {
    const result = left + right;
    if (!Number.isSafeInteger(result)) throw new RangeError(`${label} exceeds the safe integer range.`);
    return result;
  }

  function normalizeSource(command, label) {
    return {
      sourceType: requireIdentifier(command.sourceType, `${label}.sourceType`),
      sourceId: requireIdentifier(command.sourceId, `${label}.sourceId`)
    };
  }

  function sourceKey(value) {
    return `${value.sourceType}\u0000${value.sourceId}`;
  }

  function normalizeIdArray(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an explicit array.`);
    const normalized = value.map((item, index) => requireIdentifier(item, `${label}[${index}]`));
    if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contains duplicates.`);
    return normalized;
  }

  function normalizeLedgerLines(value, label) {
    if (!Array.isArray(value) || value.length < 2) {
      throw new TypeError(`${label} must be an explicit array with at least two lines.`);
    }
    const ids = new Set();
    let debit = 0;
    let credit = 0;
    const lines = value.map((line, index) => {
      const lineLabel = `${label}[${index}]`;
      assertExactKeys(line, ["lineId", "accountId", "side", "amount"], lineLabel);
      const lineId = requireIdentifier(line.lineId, `${lineLabel}.lineId`);
      if (ids.has(lineId)) throw new Error(`${label} contains duplicate lineId ${lineId}.`);
      ids.add(lineId);
      const accountId = requireIdentifier(line.accountId, `${lineLabel}.accountId`);
      if (line.side !== "debit" && line.side !== "credit") {
        throw new TypeError(`${lineLabel}.side must be debit or credit.`);
      }
      const amount = requirePositiveInteger(line.amount, `${lineLabel}.amount`);
      if (line.side === "debit") debit = safeAdd(debit, amount, `${label} debit total`);
      else credit = safeAdd(credit, amount, `${label} credit total`);
      return { lineId, accountId, side: line.side, amount };
    });
    if (debit !== credit) throw new Error(`${label} must balance exactly in integer currency units.`);
    return lines;
  }

  function normalizeAllocations(value, label) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new TypeError(`${label} must be an explicit non-empty array.`);
    }
    const lotIds = new Set();
    return value.map((allocation, index) => {
      const itemLabel = `${label}[${index}]`;
      assertExactKeys(allocation, ["lotId", "quantity"], itemLabel);
      const lotId = requireIdentifier(allocation.lotId, `${itemLabel}.lotId`);
      if (lotIds.has(lotId)) throw new Error(`${label} contains duplicate lotId ${lotId}.`);
      lotIds.add(lotId);
      return { lotId, quantity: requirePositiveInteger(allocation.quantity, `${itemLabel}.quantity`) };
    });
  }

  function normalizeExpiresAt(value, receivedAt, label) {
    if (value === null) return null;
    requireTime(value, label);
    if (value <= receivedAt) throw new RangeError(`${label} must be later than receivedAt or explicit null.`);
    return value;
  }

  function prepareCommand(command, fields, label) {
    assertSerializable(command, label);
    assertNoClinicalFields(command, label);
    assertExactKeys(command, fields, label);
    return {
      commandId: requireIdentifier(command.commandId, `${label}.commandId`),
      ...normalizeSource(command, label)
    };
  }

  function normalizeLedgerPost(command) {
    const label = "ledger post command";
    const base = prepareCommand(command, [
      "commandId", ...SOURCE_FIELDS, "postingId", "postedAt", "currencyId", "lines"
    ], label);
    return {
      commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId,
      postingId: requireIdentifier(command.postingId, `${label}.postingId`),
      postedAt: requireTime(command.postedAt, `${label}.postedAt`),
      currencyId: requireIdentifier(command.currencyId, `${label}.currencyId`),
      lines: normalizeLedgerLines(command.lines, `${label}.lines`)
    };
  }

  function normalizeLedgerReverse(command) {
    const label = "ledger reversal command";
    const base = prepareCommand(command, [
      "commandId", ...SOURCE_FIELDS, "reversalPostingId", "originalPostingId", "postedAt", "currencyId", "lines"
    ], label);
    return {
      commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId,
      reversalPostingId: requireIdentifier(command.reversalPostingId, `${label}.reversalPostingId`),
      originalPostingId: requireIdentifier(command.originalPostingId, `${label}.originalPostingId`),
      postedAt: requireTime(command.postedAt, `${label}.postedAt`),
      currencyId: requireIdentifier(command.currencyId, `${label}.currencyId`),
      lines: normalizeLedgerLines(command.lines, `${label}.lines`)
    };
  }

  function normalizeObligationAccrue(command) {
    const label = "obligation accrue command";
    const base = prepareCommand(command, [
      "commandId", ...SOURCE_FIELDS, "obligationId", "counterpartyId", "currencyId", "amount", "accruedAt", "dueAt"
    ], label);
    const accruedAt = requireTime(command.accruedAt, `${label}.accruedAt`);
    const dueAt = requireTime(command.dueAt, `${label}.dueAt`);
    if (dueAt < accruedAt) throw new RangeError(`${label}.dueAt must not precede accruedAt.`);
    return {
      commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId,
      obligationId: requireIdentifier(command.obligationId, `${label}.obligationId`),
      counterpartyId: requireIdentifier(command.counterpartyId, `${label}.counterpartyId`),
      currencyId: requireIdentifier(command.currencyId, `${label}.currencyId`),
      amount: requirePositiveInteger(command.amount, `${label}.amount`), accruedAt, dueAt
    };
  }

  function normalizeObligationSettle(command) {
    const label = "obligation settle command";
    const base = prepareCommand(command, [
      "commandId", ...SOURCE_FIELDS, "settlementId", "obligationId", "amount", "settledAt"
    ], label);
    return {
      commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId,
      settlementId: requireIdentifier(command.settlementId, `${label}.settlementId`),
      obligationId: requireIdentifier(command.obligationId, `${label}.obligationId`),
      amount: requirePositiveInteger(command.amount, `${label}.amount`),
      settledAt: requireTime(command.settledAt, `${label}.settledAt`)
    };
  }

  function normalizeInventoryReceive(command) {
    const label = "inventory receive command";
    const base = prepareCommand(command, [
      "commandId", ...SOURCE_FIELDS, "receiptId", "lotId", "itemId", "unitId", "quantity", "receivedAt", "expiresAt"
    ], label);
    const receivedAt = requireTime(command.receivedAt, `${label}.receivedAt`);
    return {
      commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId,
      receiptId: requireIdentifier(command.receiptId, `${label}.receiptId`),
      lotId: requireIdentifier(command.lotId, `${label}.lotId`),
      itemId: requireIdentifier(command.itemId, `${label}.itemId`),
      unitId: requireIdentifier(command.unitId, `${label}.unitId`),
      quantity: requirePositiveInteger(command.quantity, `${label}.quantity`), receivedAt,
      expiresAt: normalizeExpiresAt(command.expiresAt, receivedAt, `${label}.expiresAt`)
    };
  }

  function normalizeInventoryOut(command, type) {
    const word = type === "consume" ? "consume" : "expire";
    const timeField = type === "consume" ? "consumedAt" : "expiredAt";
    const idField = type === "consume" ? "consumptionId" : "expirationId";
    const label = `inventory ${word} command`;
    const base = prepareCommand(command, [
      "commandId", ...SOURCE_FIELDS, idField, "itemId", "unitId", "quantity", timeField, "allocations"
    ], label);
    const allocations = normalizeAllocations(command.allocations, `${label}.allocations`);
    const allocationTotal = allocations.reduce((total, allocation) => safeAdd(total, allocation.quantity, `${label} allocation total`), 0);
    const quantity = requirePositiveInteger(command.quantity, `${label}.quantity`);
    if (quantity !== allocationTotal) throw new Error(`${label}.quantity must equal its explicit allocation total.`);
    return {
      commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId,
      [idField]: requireIdentifier(command[idField], `${label}.${idField}`),
      itemId: requireIdentifier(command.itemId, `${label}.itemId`),
      unitId: requireIdentifier(command.unitId, `${label}.unitId`), quantity,
      [timeField]: requireTime(command[timeField], `${label}.${timeField}`), allocations
    };
  }

  function normalizeProcurementLines(value, label) {
    if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} must be an explicit non-empty array.`);
    const ids = new Set();
    return value.map((line, index) => {
      const lineLabel = `${label}[${index}]`;
      assertExactKeys(line, ["procurementLineId", "itemId", "unitId", "quantity", "unitAmount"], lineLabel);
      const procurementLineId = requireIdentifier(line.procurementLineId, `${lineLabel}.procurementLineId`);
      if (ids.has(procurementLineId)) throw new Error(`${label} contains duplicate procurementLineId ${procurementLineId}.`);
      ids.add(procurementLineId);
      return {
        procurementLineId,
        itemId: requireIdentifier(line.itemId, `${lineLabel}.itemId`),
        unitId: requireIdentifier(line.unitId, `${lineLabel}.unitId`),
        quantity: requirePositiveInteger(line.quantity, `${lineLabel}.quantity`),
        unitAmount: requirePositiveInteger(line.unitAmount, `${lineLabel}.unitAmount`)
      };
    });
  }

  function normalizeProcurementCreate(command) {
    const label = "procurement create command";
    const base = prepareCommand(command, [
      "commandId", ...SOURCE_FIELDS, "procurementId", "supplierId", "currencyId", "createdAt", "lines"
    ], label);
    return {
      commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId,
      procurementId: requireIdentifier(command.procurementId, `${label}.procurementId`),
      supplierId: requireIdentifier(command.supplierId, `${label}.supplierId`),
      currencyId: requireIdentifier(command.currencyId, `${label}.currencyId`),
      createdAt: requireTime(command.createdAt, `${label}.createdAt`),
      lines: normalizeProcurementLines(command.lines, `${label}.lines`)
    };
  }

  function normalizeProcurementReceiptLines(value, receivedAt, label) {
    if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} must be an explicit non-empty array.`);
    const procurementLineIds = new Set();
    const receiptIds = new Set();
    const lotIds = new Set();
    return value.map((line, index) => {
      const lineLabel = `${label}[${index}]`;
      assertExactKeys(line, ["procurementLineId", "inventoryReceiptId", "lotId", "quantity", "expiresAt"], lineLabel);
      const procurementLineId = requireIdentifier(line.procurementLineId, `${lineLabel}.procurementLineId`);
      const inventoryReceiptId = requireIdentifier(line.inventoryReceiptId, `${lineLabel}.inventoryReceiptId`);
      const lotId = requireIdentifier(line.lotId, `${lineLabel}.lotId`);
      if (procurementLineIds.has(procurementLineId)) throw new Error(`${label} contains duplicate procurementLineId ${procurementLineId}.`);
      if (receiptIds.has(inventoryReceiptId)) throw new Error(`${label} contains duplicate inventoryReceiptId ${inventoryReceiptId}.`);
      if (lotIds.has(lotId)) throw new Error(`${label} contains duplicate lotId ${lotId}.`);
      procurementLineIds.add(procurementLineId);
      receiptIds.add(inventoryReceiptId);
      lotIds.add(lotId);
      return {
        procurementLineId, inventoryReceiptId, lotId,
        quantity: requirePositiveInteger(line.quantity, `${lineLabel}.quantity`),
        expiresAt: normalizeExpiresAt(line.expiresAt, receivedAt, `${lineLabel}.expiresAt`)
      };
    });
  }

  function normalizeProcurementReceive(command) {
    const label = "procurement receive command";
    const base = prepareCommand(command, [
      "commandId", ...SOURCE_FIELDS, "procurementReceiptId", "procurementId", "receivedAt", "lines"
    ], label);
    const receivedAt = requireTime(command.receivedAt, `${label}.receivedAt`);
    return {
      commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId,
      procurementReceiptId: requireIdentifier(command.procurementReceiptId, `${label}.procurementReceiptId`),
      procurementId: requireIdentifier(command.procurementId, `${label}.procurementId`), receivedAt,
      lines: normalizeProcurementReceiptLines(command.lines, receivedAt, `${label}.lines`)
    };
  }

  function normalizeSimpleRecord(command, config) {
    const base = prepareCommand(command, config.fields, config.label);
    const result = { commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId };
    config.identifiers.forEach((field) => { result[field] = requireIdentifier(command[field], `${config.label}.${field}`); });
    config.times.forEach((field) => { result[field] = requireTime(command[field], `${config.label}.${field}`); });
    return result;
  }

  function normalizeProcurementCancel(command) {
    return normalizeSimpleRecord(command, {
      label: "procurement cancel command",
      fields: ["commandId", ...SOURCE_FIELDS, "cancellationId", "procurementId", "cancelledAt"],
      identifiers: ["cancellationId", "procurementId"], times: ["cancelledAt"]
    });
  }

  function normalizeAssetAcquire(command) {
    const label = "asset acquire command";
    const base = prepareCommand(command, [
      "commandId", ...SOURCE_FIELDS, "acquisitionId", "assetId", "assetTypeId", "currencyId", "amount", "acquiredAt"
    ], label);
    return {
      commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId,
      acquisitionId: requireIdentifier(command.acquisitionId, `${label}.acquisitionId`),
      assetId: requireIdentifier(command.assetId, `${label}.assetId`),
      assetTypeId: requireIdentifier(command.assetTypeId, `${label}.assetTypeId`),
      currencyId: requireIdentifier(command.currencyId, `${label}.currencyId`),
      amount: requirePositiveInteger(command.amount, `${label}.amount`),
      acquiredAt: requireTime(command.acquiredAt, `${label}.acquiredAt`)
    };
  }

  function normalizeAssetDispose(command) {
    return normalizeSimpleRecord(command, {
      label: "asset dispose command",
      fields: ["commandId", ...SOURCE_FIELDS, "disposalId", "assetId", "disposedAt"],
      identifiers: ["disposalId", "assetId"], times: ["disposedAt"]
    });
  }

  function normalizeMaintenanceSchedule(command) {
    const label = "maintenance schedule command";
    const base = prepareCommand(command, [
      "commandId", ...SOURCE_FIELDS, "maintenanceId", "assetId", "scheduledAt", "startAt", "endAt"
    ], label);
    const scheduledAt = requireTime(command.scheduledAt, `${label}.scheduledAt`);
    const startAt = requireTime(command.startAt, `${label}.startAt`);
    const endAt = requireTime(command.endAt, `${label}.endAt`);
    if (startAt < scheduledAt) throw new RangeError(`${label}.startAt must not precede scheduledAt.`);
    if (endAt <= startAt) throw new RangeError(`${label} interval must be non-empty.`);
    return {
      commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId,
      maintenanceId: requireIdentifier(command.maintenanceId, `${label}.maintenanceId`),
      assetId: requireIdentifier(command.assetId, `${label}.assetId`), scheduledAt, startAt, endAt
    };
  }

  function normalizeMaintenanceComplete(command) {
    return normalizeSimpleRecord(command, {
      label: "maintenance complete command",
      fields: ["commandId", ...SOURCE_FIELDS, "completionId", "maintenanceId", "completedAt"],
      identifiers: ["completionId", "maintenanceId"], times: ["completedAt"]
    });
  }

  function normalizeOwnerPlanDecision(command) {
    const label = "owner plan decision command";
    const base = prepareCommand(command, [
      "commandId", ...SOURCE_FIELDS, "ownerPlanDecisionId", "ownerId", "planId", "outcomeId", "decidedAt",
      "ledgerPostingIds", "inventoryConsumptionIds"
    ], label);
    return {
      commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId,
      ownerPlanDecisionId: requireIdentifier(command.ownerPlanDecisionId, `${label}.ownerPlanDecisionId`),
      ownerId: requireIdentifier(command.ownerId, `${label}.ownerId`),
      planId: requireIdentifier(command.planId, `${label}.planId`),
      outcomeId: requireIdentifier(command.outcomeId, `${label}.outcomeId`),
      decidedAt: requireTime(command.decidedAt, `${label}.decidedAt`),
      ledgerPostingIds: normalizeIdArray(command.ledgerPostingIds, `${label}.ledgerPostingIds`),
      inventoryConsumptionIds: normalizeIdArray(command.inventoryConsumptionIds, `${label}.inventoryConsumptionIds`)
    };
  }

  function normalizeBudgetDecision(command) {
    const label = "budget decision command";
    const base = prepareCommand(command, [
      "commandId", ...SOURCE_FIELDS, "budgetDecisionId", "ownerId", "budgetId", "outcomeId", "decidedAt",
      "currencyId", "amount"
    ], label);
    let currencyId = null;
    let amount = null;
    if (command.currencyId === null && command.amount === null) {
      currencyId = null;
      amount = null;
    } else {
      currencyId = requireIdentifier(command.currencyId, `${label}.currencyId`);
      amount = requirePositiveInteger(command.amount, `${label}.amount`);
    }
    return {
      commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId,
      budgetDecisionId: requireIdentifier(command.budgetDecisionId, `${label}.budgetDecisionId`),
      ownerId: requireIdentifier(command.ownerId, `${label}.ownerId`),
      budgetId: requireIdentifier(command.budgetId, `${label}.budgetId`),
      outcomeId: requireIdentifier(command.outcomeId, `${label}.outcomeId`),
      decidedAt: requireTime(command.decidedAt, `${label}.decidedAt`), currencyId, amount
    };
  }

  function normalizeRecoveryAttempt(command) {
    const label = "recovery attempt command";
    const base = prepareCommand(command, [
      "commandId", ...SOURCE_FIELDS, "attemptId", "recoveryId", "actionId", "result", "attemptedAt"
    ], label);
    if (!RECOVERY_RESULTS.includes(command.result)) {
      throw new TypeError(`${label}.result must be succeeded or failed.`);
    }
    return {
      commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId,
      attemptId: requireIdentifier(command.attemptId, `${label}.attemptId`),
      recoveryId: requireIdentifier(command.recoveryId, `${label}.recoveryId`),
      actionId: requireIdentifier(command.actionId, `${label}.actionId`), result: command.result,
      attemptedAt: requireTime(command.attemptedAt, `${label}.attemptedAt`)
    };
  }

  function normalizeRecoveryTransition(command) {
    const label = "recovery transition command";
    const base = prepareCommand(command, [
      "commandId", ...SOURCE_FIELDS, "transitionId", "recoveryId", "fromStatus", "toStatus", "transitionedAt"
    ], label);
    if (command.fromStatus !== null && !RECOVERY_STATUSES.includes(command.fromStatus)) {
      throw new TypeError(`${label}.fromStatus is unsupported.`);
    }
    if (!RECOVERY_STATUSES.includes(command.toStatus)) throw new TypeError(`${label}.toStatus is unsupported.`);
    if (command.fromStatus === command.toStatus) throw new Error(`${label} must change status.`);
    return {
      commandId: base.commandId, sourceType: base.sourceType, sourceId: base.sourceId,
      transitionId: requireIdentifier(command.transitionId, `${label}.transitionId`),
      recoveryId: requireIdentifier(command.recoveryId, `${label}.recoveryId`),
      fromStatus: command.fromStatus, toStatus: command.toStatus,
      transitionedAt: requireTime(command.transitionedAt, `${label}.transitionedAt`)
    };
  }

  const COMMAND_NORMALIZERS = Object.freeze({
    "ledger.post": normalizeLedgerPost,
    "ledger.reverse": normalizeLedgerReverse,
    "obligation.accrue": normalizeObligationAccrue,
    "obligation.settle": normalizeObligationSettle,
    "inventory.receive": normalizeInventoryReceive,
    "inventory.consume": (command) => normalizeInventoryOut(command, "consume"),
    "inventory.expire": (command) => normalizeInventoryOut(command, "expire"),
    "procurement.create": normalizeProcurementCreate,
    "procurement.receive": normalizeProcurementReceive,
    "procurement.cancel": normalizeProcurementCancel,
    "asset.acquire": normalizeAssetAcquire,
    "asset.dispose": normalizeAssetDispose,
    "maintenance.schedule": normalizeMaintenanceSchedule,
    "maintenance.complete": normalizeMaintenanceComplete,
    "owner_plan.record": normalizeOwnerPlanDecision,
    "budget_decision.record": normalizeBudgetDecision,
    "recovery.attempt": normalizeRecoveryAttempt,
    "recovery.transition": normalizeRecoveryTransition
  });

  function mutableEmptyState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      ledgerPostings: [], obligations: [], inventoryLots: [], inventoryMovements: [],
      procurements: [], assets: [], maintenanceRecords: [], ownerPlanDecisions: [],
      budgetDecisions: [], recoveries: [], auditHistory: [], appliedCommandIds: [],
      commandFingerprints: {}
    };
  }

  function fingerprintCommand(type, command) {
    const content = {};
    Object.keys(command).forEach((key) => { if (key !== "commandId") content[key] = command[key]; });
    return `${type}:${stableStringify(content)}`;
  }

  function findUnique(state, collection, field, id, label) {
    const matches = state[collection].filter((record) => record[field] === id);
    if (matches.length > 1) throw new Error(`Corrupt ${label}: duplicate ${field} ${id}.`);
    return matches[0] || null;
  }

  function requireNewId(state, collection, field, id, label) {
    if (findUnique(state, collection, field, id, label)) throw new Error(`Duplicate ${label} ${id}.`);
  }

  function requireNewMovementId(state, id) {
    requireNewId(state, "inventoryMovements", "movementId", id, "inventory movement id");
  }

  function ledgerShape(lines) {
    const totals = {};
    lines.forEach((line) => {
      const key = `${line.accountId}\u0000${line.side}`;
      totals[key] = safeAdd(totals[key] || 0, line.amount, "ledger account total");
    });
    return totals;
  }

  function oppositeLedgerShape(lines) {
    const totals = {};
    lines.forEach((line) => {
      const side = line.side === "debit" ? "credit" : "debit";
      const key = `${line.accountId}\u0000${side}`;
      totals[key] = safeAdd(totals[key] || 0, line.amount, "ledger account total");
    });
    return totals;
  }

  function intervalsOverlap(leftStart, leftEnd, rightStart, rightEnd) {
    return leftStart < rightEnd && rightStart < leftEnd;
  }

  function maximumTime(values, fallback = 0) {
    return values.length ? Math.max(...values) : fallback;
  }

  function inventoryLotLatestAt(state, lotId, receivedAt) {
    const movementTimes = state.inventoryMovements
      .filter((movement) => movement.allocations.some((allocation) => allocation.lotId === lotId))
      .map((movement) => movement.occurredAt);
    return maximumTime(movementTimes, receivedAt);
  }

  function procurementLatestAt(procurement) {
    return maximumTime([
      procurement.createdAt,
      ...procurement.receipts.map((receipt) => receipt.receivedAt),
      ...(procurement.cancellation ? [procurement.cancellation.cancelledAt] : [])
    ], procurement.createdAt);
  }

  function assetRecordedLatestAt(state, asset) {
    const records = state.maintenanceRecords.filter((record) => record.assetId === asset.assetId);
    return maximumTime([
      asset.acquiredAt,
      ...records.map((record) => record.scheduledAt),
      ...records.filter((record) => record.completion).map((record) => record.completion.completedAt),
      ...(asset.disposal ? [asset.disposal.disposedAt] : [])
    ], asset.acquiredAt);
  }

  function assetEffectiveThrough(state, asset) {
    const records = state.maintenanceRecords.filter((record) => record.assetId === asset.assetId);
    return maximumTime([
      asset.acquiredAt,
      ...records.map((record) => record.endAt),
      ...records.filter((record) => record.completion).map((record) => record.completion.completedAt)
    ], asset.acquiredAt);
  }

  function recoveryLatestAt(recovery) {
    return maximumTime([
      recovery.createdAt,
      ...recovery.transitions.map((item) => item.transitionedAt),
      ...recovery.attempts.map((item) => item.attemptedAt)
    ], recovery.createdAt);
  }

  function addInventoryReceipt(state, input) {
    requireNewId(state, "inventoryLots", "lotId", input.lotId, "inventory lot");
    requireNewMovementId(state, input.receiptId);
    const lot = {
      lotId: input.lotId, itemId: input.itemId, unitId: input.unitId,
      quantityReceived: input.quantity, quantityConsumed: 0, quantityExpired: 0,
      quantityAvailable: input.quantity, receivedAt: input.receivedAt, expiresAt: input.expiresAt,
      sourceType: input.sourceType, sourceId: input.sourceId, receiptId: input.receiptId,
      procurementId: input.procurementId || null
    };
    state.inventoryLots.push(lot);
    state.inventoryMovements.push({
      movementId: input.receiptId, movementType: "receive", sourceType: input.sourceType,
      sourceId: input.sourceId, itemId: input.itemId, unitId: input.unitId,
      quantity: input.quantity, occurredAt: input.receivedAt,
      allocations: [{ lotId: input.lotId, quantity: input.quantity }],
      procurementId: input.procurementId || null
    });
  }

  function mutateLedgerPost(state, command) {
    requireNewId(state, "ledgerPostings", "postingId", command.postingId, "ledger posting");
    if (state.ledgerPostings.some((posting) => sourceKey(posting) === sourceKey(command))) {
      throw new Error(`Duplicate ledger source posting ${command.sourceType}:${command.sourceId}.`);
    }
    state.ledgerPostings.push({
      postingId: command.postingId, sourceType: command.sourceType, sourceId: command.sourceId,
      postedAt: command.postedAt, currencyId: command.currencyId, lines: clone(command.lines),
      reversalOf: null, reversedBy: null
    });
  }

  function mutateLedgerReverse(state, command) {
    requireNewId(state, "ledgerPostings", "postingId", command.reversalPostingId, "ledger posting");
    if (state.ledgerPostings.some((posting) => sourceKey(posting) === sourceKey(command))) {
      throw new Error(`Duplicate ledger source posting ${command.sourceType}:${command.sourceId}.`);
    }
    const original = findUnique(state, "ledgerPostings", "postingId", command.originalPostingId, "ledger posting");
    if (!original) throw new Error(`Unknown original ledger posting ${command.originalPostingId}.`);
    if (original.reversalOf !== null) throw new Error("A reversal posting cannot itself be reversed.");
    if (original.reversedBy !== null) throw new Error(`Ledger posting ${original.postingId} is already reversed.`);
    if (command.postedAt < original.postedAt) throw new Error("Ledger reversal cannot precede its original posting.");
    if (command.currencyId !== original.currencyId) throw new Error("Ledger reversal currency must match its original posting.");
    if (stableStringify(ledgerShape(command.lines)) !== stableStringify(oppositeLedgerShape(original.lines))) {
      throw new Error("Ledger reversal lines must exactly invert the original account amounts.");
    }
    original.reversedBy = command.reversalPostingId;
    state.ledgerPostings.push({
      postingId: command.reversalPostingId, sourceType: command.sourceType, sourceId: command.sourceId,
      postedAt: command.postedAt, currencyId: command.currencyId, lines: clone(command.lines),
      reversalOf: original.postingId, reversedBy: null
    });
  }

  function mutateObligationAccrue(state, command) {
    requireNewId(state, "obligations", "obligationId", command.obligationId, "obligation");
    state.obligations.push({
      obligationId: command.obligationId, sourceType: command.sourceType, sourceId: command.sourceId,
      counterpartyId: command.counterpartyId, currencyId: command.currencyId,
      amountAccrued: command.amount, amountSettled: 0, accruedAt: command.accruedAt,
      dueAt: command.dueAt, status: "open", settlements: []
    });
  }

  function mutateObligationSettle(state, command) {
    if (state.obligations.some((obligation) => obligation.settlements.some((item) => item.settlementId === command.settlementId))) {
      throw new Error(`Duplicate settlementId ${command.settlementId}.`);
    }
    const obligation = findUnique(state, "obligations", "obligationId", command.obligationId, "obligation");
    if (!obligation) throw new Error(`Unknown obligation ${command.obligationId}.`);
    if (command.settledAt < obligation.accruedAt) throw new Error("Settlement cannot precede obligation accrual.");
    const latestSettlementAt = maximumTime(
      obligation.settlements.map((settlement) => settlement.settledAt),
      obligation.accruedAt
    );
    if (command.settledAt < latestSettlementAt) {
      throw new Error("Obligation settlements must not move backwards in time.");
    }
    const nextSettled = safeAdd(obligation.amountSettled, command.amount, "obligation settlement total");
    if (nextSettled > obligation.amountAccrued) throw new Error(`Settlement would exceed obligation ${obligation.obligationId}.`);
    obligation.amountSettled = nextSettled;
    obligation.status = nextSettled === obligation.amountAccrued ? "settled" : "open";
    obligation.settlements.push({
      settlementId: command.settlementId, sourceType: command.sourceType, sourceId: command.sourceId,
      amount: command.amount, settledAt: command.settledAt
    });
  }

  function mutateInventoryReceive(state, command) {
    addInventoryReceipt(state, { ...command, procurementId: null });
  }

  function mutateInventoryOut(state, command, type) {
    const idField = type === "consume" ? "consumptionId" : "expirationId";
    const timeField = type === "consume" ? "consumedAt" : "expiredAt";
    requireNewMovementId(state, command[idField]);
    const lots = command.allocations.map((allocation) => {
      const lot = findUnique(state, "inventoryLots", "lotId", allocation.lotId, "inventory lot");
      if (!lot) throw new Error(`Unknown inventory lot ${allocation.lotId}.`);
      if (lot.itemId !== command.itemId || lot.unitId !== command.unitId) {
        throw new Error(`Inventory lot ${lot.lotId} does not match the explicit itemId and unitId.`);
      }
      if (command[timeField] < lot.receivedAt) throw new Error(`${type} cannot precede lot receipt.`);
      const latestLotAt = inventoryLotLatestAt(state, lot.lotId, lot.receivedAt);
      if (command[timeField] < latestLotAt) {
        throw new Error(`Inventory movements for lot ${lot.lotId} must not move backwards in time.`);
      }
      if (type === "consume" && lot.expiresAt !== null && command.consumedAt >= lot.expiresAt) {
        throw new Error(`Expired inventory lot ${lot.lotId} cannot be consumed.`);
      }
      if (type === "expire" && (lot.expiresAt === null || command.expiredAt < lot.expiresAt)) {
        throw new Error(`Inventory lot ${lot.lotId} is not eligible for expiration at this time.`);
      }
      if (allocation.quantity > lot.quantityAvailable) {
        throw new Error(`Inventory lot ${lot.lotId} has insufficient available quantity.`);
      }
      return { lot, quantity: allocation.quantity };
    });
    lots.forEach(({ lot, quantity }) => {
      lot.quantityAvailable -= quantity;
      if (type === "consume") lot.quantityConsumed += quantity;
      else lot.quantityExpired += quantity;
    });
    state.inventoryMovements.push({
      movementId: command[idField], movementType: type, sourceType: command.sourceType,
      sourceId: command.sourceId, itemId: command.itemId, unitId: command.unitId,
      quantity: command.quantity, occurredAt: command[timeField], allocations: clone(command.allocations),
      procurementId: null
    });
  }

  function mutateProcurementCreate(state, command) {
    requireNewId(state, "procurements", "procurementId", command.procurementId, "procurement");
    state.procurements.push({
      procurementId: command.procurementId, sourceType: command.sourceType, sourceId: command.sourceId,
      supplierId: command.supplierId, currencyId: command.currencyId, createdAt: command.createdAt,
      status: "open", lines: command.lines.map((line) => ({ ...clone(line), receivedQuantity: 0 })),
      receipts: [], cancellation: null
    });
  }

  function mutateProcurementReceive(state, command) {
    const procurement = findUnique(state, "procurements", "procurementId", command.procurementId, "procurement");
    if (!procurement) throw new Error(`Unknown procurement ${command.procurementId}.`);
    if (procurement.status !== "open") throw new Error(`Procurement ${procurement.procurementId} is not open for receipt.`);
    if (command.receivedAt < procurement.createdAt) throw new Error("Procurement receipt cannot precede creation.");
    if (command.receivedAt < procurementLatestAt(procurement)) {
      throw new Error("Procurement receipts must not move backwards in time.");
    }
    if (state.procurements.some((record) => record.receipts.some((receipt) => receipt.procurementReceiptId === command.procurementReceiptId))) {
      throw new Error(`Duplicate procurementReceiptId ${command.procurementReceiptId}.`);
    }
    const validated = command.lines.map((receivedLine) => {
      const line = procurement.lines.find((candidate) => candidate.procurementLineId === receivedLine.procurementLineId);
      if (!line) throw new Error(`Unknown procurement line ${receivedLine.procurementLineId}.`);
      const nextQuantity = safeAdd(line.receivedQuantity, receivedLine.quantity, "procurement received quantity");
      if (nextQuantity > line.quantity) throw new Error(`Receipt would exceed procurement line ${line.procurementLineId}.`);
      requireNewId(state, "inventoryLots", "lotId", receivedLine.lotId, "inventory lot");
      requireNewMovementId(state, receivedLine.inventoryReceiptId);
      return { line, receivedLine, nextQuantity };
    });
    validated.forEach(({ line, receivedLine, nextQuantity }) => {
      line.receivedQuantity = nextQuantity;
      addInventoryReceipt(state, {
        sourceType: command.sourceType, sourceId: command.sourceId,
        receiptId: receivedLine.inventoryReceiptId, lotId: receivedLine.lotId,
        itemId: line.itemId, unitId: line.unitId, quantity: receivedLine.quantity,
        receivedAt: command.receivedAt, expiresAt: receivedLine.expiresAt,
        procurementId: procurement.procurementId
      });
    });
    procurement.receipts.push({
      procurementReceiptId: command.procurementReceiptId, sourceType: command.sourceType,
      sourceId: command.sourceId, receivedAt: command.receivedAt, lines: clone(command.lines)
    });
    if (procurement.lines.every((line) => line.receivedQuantity === line.quantity)) procurement.status = "received";
  }

  function mutateProcurementCancel(state, command) {
    const procurement = findUnique(state, "procurements", "procurementId", command.procurementId, "procurement");
    if (!procurement) throw new Error(`Unknown procurement ${command.procurementId}.`);
    if (state.procurements.some((record) => record.cancellation && record.cancellation.cancellationId === command.cancellationId)) {
      throw new Error(`Duplicate cancellationId ${command.cancellationId}.`);
    }
    if (procurement.status !== "open") throw new Error(`Procurement ${procurement.procurementId} cannot be cancelled from ${procurement.status}.`);
    if (command.cancelledAt < procurement.createdAt) throw new Error("Procurement cancellation cannot precede creation.");
    if (command.cancelledAt < procurementLatestAt(procurement)) {
      throw new Error("Procurement cancellation must not precede an existing receipt.");
    }
    procurement.status = "cancelled";
    procurement.cancellation = {
      cancellationId: command.cancellationId, sourceType: command.sourceType,
      sourceId: command.sourceId, cancelledAt: command.cancelledAt
    };
  }

  function mutateAssetAcquire(state, command) {
    requireNewId(state, "assets", "assetId", command.assetId, "asset");
    if (state.assets.some((asset) => asset.acquisitionId === command.acquisitionId)) {
      throw new Error(`Duplicate acquisitionId ${command.acquisitionId}.`);
    }
    state.assets.push({
      assetId: command.assetId, assetTypeId: command.assetTypeId,
      acquisitionId: command.acquisitionId, sourceType: command.sourceType, sourceId: command.sourceId,
      currencyId: command.currencyId, amount: command.amount, acquiredAt: command.acquiredAt,
      status: "active", disposal: null
    });
  }

  function mutateAssetDispose(state, command) {
    const asset = findUnique(state, "assets", "assetId", command.assetId, "asset");
    if (!asset) throw new Error(`Unknown asset ${command.assetId}.`);
    if (state.assets.some((record) => record.disposal && record.disposal.disposalId === command.disposalId)) {
      throw new Error(`Duplicate disposalId ${command.disposalId}.`);
    }
    if (asset.status !== "active") throw new Error(`Asset ${asset.assetId} is already disposed.`);
    if (command.disposedAt < asset.acquiredAt) throw new Error("Asset disposal cannot precede acquisition.");
    if (state.maintenanceRecords.some((record) => record.assetId === asset.assetId && record.status === "scheduled")) {
      throw new Error(`Asset ${asset.assetId} has unfinished scheduled maintenance.`);
    }
    if (command.disposedAt < assetEffectiveThrough(state, asset)) {
      throw new Error("Asset disposal must not move backwards across maintenance history.");
    }
    asset.status = "disposed";
    asset.disposal = {
      disposalId: command.disposalId, sourceType: command.sourceType,
      sourceId: command.sourceId, disposedAt: command.disposedAt
    };
  }

  function mutateMaintenanceSchedule(state, command) {
    requireNewId(state, "maintenanceRecords", "maintenanceId", command.maintenanceId, "maintenance record");
    const asset = findUnique(state, "assets", "assetId", command.assetId, "asset");
    if (!asset) throw new Error(`Unknown asset ${command.assetId}.`);
    if (asset.status !== "active") throw new Error(`Disposed asset ${asset.assetId} cannot receive maintenance.`);
    if (command.scheduledAt < assetRecordedLatestAt(state, asset)) {
      throw new Error("Maintenance scheduling must not move backwards in asset history.");
    }
    if (command.scheduledAt < asset.acquiredAt) throw new Error("Maintenance cannot be scheduled before asset acquisition.");
    if (command.startAt < asset.acquiredAt) throw new Error("Maintenance cannot start before asset acquisition.");
    if (state.maintenanceRecords.some((record) => record.assetId === command.assetId
      && intervalsOverlap(record.startAt, record.endAt, command.startAt, command.endAt))) {
      throw new Error(`Maintenance interval overlaps another record for asset ${command.assetId}.`);
    }
    state.maintenanceRecords.push({
      maintenanceId: command.maintenanceId, sourceType: command.sourceType, sourceId: command.sourceId,
      assetId: command.assetId, scheduledAt: command.scheduledAt, startAt: command.startAt,
      endAt: command.endAt, status: "scheduled", completion: null
    });
  }

  function mutateMaintenanceComplete(state, command) {
    const record = findUnique(state, "maintenanceRecords", "maintenanceId", command.maintenanceId, "maintenance record");
    if (!record) throw new Error(`Unknown maintenance record ${command.maintenanceId}.`);
    if (state.maintenanceRecords.some((item) => item.completion && item.completion.completionId === command.completionId)) {
      throw new Error(`Duplicate completionId ${command.completionId}.`);
    }
    if (record.status !== "scheduled") throw new Error(`Maintenance ${record.maintenanceId} is already complete.`);
    if (command.completedAt < record.startAt) throw new Error("Maintenance completion cannot precede its start.");
    if (command.completedAt < record.endAt) throw new Error("Maintenance completion cannot precede its scheduled end.");
    const asset = findUnique(state, "assets", "assetId", record.assetId, "asset");
    if (!asset) throw new Error(`Unknown asset ${record.assetId}.`);
    if (command.completedAt < assetRecordedLatestAt(state, asset)) {
      throw new Error("Maintenance completion must not move backwards in asset history.");
    }
    record.status = "completed";
    record.completion = {
      completionId: command.completionId, sourceType: command.sourceType,
      sourceId: command.sourceId, completedAt: command.completedAt
    };
  }

  function mutateOwnerPlanDecision(state, command) {
    requireNewId(state, "ownerPlanDecisions", "ownerPlanDecisionId", command.ownerPlanDecisionId, "owner plan decision");
    command.ledgerPostingIds.forEach((postingId) => {
      if (!findUnique(state, "ledgerPostings", "postingId", postingId, "ledger posting")) {
        throw new Error(`Owner plan decision references unknown ledger posting ${postingId}.`);
      }
    });
    command.inventoryConsumptionIds.forEach((movementId) => {
      const movement = findUnique(state, "inventoryMovements", "movementId", movementId, "inventory movement");
      if (!movement || movement.movementType !== "consume") {
        throw new Error(`Owner plan decision references unknown inventory consumption ${movementId}.`);
      }
    });
    state.ownerPlanDecisions.push({ ...clone(command) });
  }

  function mutateBudgetDecision(state, command) {
    requireNewId(state, "budgetDecisions", "budgetDecisionId", command.budgetDecisionId, "budget decision");
    state.budgetDecisions.push({ ...clone(command) });
  }

  function allRecoveryEventIds(state) {
    const ids = new Set();
    state.recoveries.forEach((recovery) => {
      recovery.transitions.forEach((item) => ids.add(item.transitionId));
      recovery.attempts.forEach((item) => ids.add(item.attemptId));
    });
    return ids;
  }

  function mutateRecoveryAttempt(state, command) {
    if (allRecoveryEventIds(state).has(command.attemptId)) throw new Error(`Duplicate recovery event id ${command.attemptId}.`);
    const recovery = findUnique(state, "recoveries", "recoveryId", command.recoveryId, "recovery");
    if (!recovery) throw new Error(`Unknown recovery ${command.recoveryId}.`);
    if (recovery.status === "closed") throw new Error(`Closed recovery ${recovery.recoveryId} cannot accept attempts.`);
    if (command.attemptedAt < recoveryLatestAt(recovery)) {
      throw new Error("Recovery attempts must not move backwards in time.");
    }
    recovery.attempts.push({
      attemptId: command.attemptId, sourceType: command.sourceType, sourceId: command.sourceId,
      actionId: command.actionId, result: command.result, attemptedAt: command.attemptedAt
    });
  }

  function mutateRecoveryTransition(state, command) {
    if (allRecoveryEventIds(state).has(command.transitionId)) throw new Error(`Duplicate recovery event id ${command.transitionId}.`);
    let recovery = findUnique(state, "recoveries", "recoveryId", command.recoveryId, "recovery");
    if (!recovery) {
      if (command.fromStatus !== null || command.toStatus !== "open") {
        throw new Error("A recovery must be created by an explicit null -> open transition.");
      }
      recovery = { recoveryId: command.recoveryId, status: "open", createdAt: command.transitionedAt, transitions: [], attempts: [] };
      state.recoveries.push(recovery);
    } else {
      if (command.fromStatus !== recovery.status) {
        throw new Error(`Recovery ${recovery.recoveryId} current status is ${recovery.status}, not ${command.fromStatus}.`);
      }
      if (recovery.status === "closed") throw new Error(`Closed recovery ${recovery.recoveryId} is terminal.`);
      if (command.toStatus === "open") throw new Error("An existing recovery cannot transition back to open.");
      if (command.transitionedAt < recoveryLatestAt(recovery)) {
        throw new Error("Recovery transition must not move backwards in time.");
      }
      if (command.toStatus === "closed"
        && recovery.status !== "stabilized"
        && recovery.status !== "closure_review") {
        throw new Error("Recovery can close only after stabilized or closure_review status.");
      }
      if (command.toStatus === "closure_review") {
        const failures = recovery.attempts.filter((attempt) => attempt.result === "failed").length;
        if (failures < 2) {
          throw new Error("Recovery closure_review requires at least two explicit failed attempts.");
        }
      }
      recovery.status = command.toStatus;
    }
    recovery.transitions.push({
      transitionId: command.transitionId, sourceType: command.sourceType, sourceId: command.sourceId,
      fromStatus: command.fromStatus, toStatus: command.toStatus, transitionedAt: command.transitionedAt
    });
  }

  const COMMAND_MUTATORS = Object.freeze({
    "ledger.post": mutateLedgerPost,
    "ledger.reverse": mutateLedgerReverse,
    "obligation.accrue": mutateObligationAccrue,
    "obligation.settle": mutateObligationSettle,
    "inventory.receive": mutateInventoryReceive,
    "inventory.consume": (state, command) => mutateInventoryOut(state, command, "consume"),
    "inventory.expire": (state, command) => mutateInventoryOut(state, command, "expire"),
    "procurement.create": mutateProcurementCreate,
    "procurement.receive": mutateProcurementReceive,
    "procurement.cancel": mutateProcurementCancel,
    "asset.acquire": mutateAssetAcquire,
    "asset.dispose": mutateAssetDispose,
    "maintenance.schedule": mutateMaintenanceSchedule,
    "maintenance.complete": mutateMaintenanceComplete,
    "owner_plan.record": mutateOwnerPlanDecision,
    "budget_decision.record": mutateBudgetDecision,
    "recovery.attempt": mutateRecoveryAttempt,
    "recovery.transition": mutateRecoveryTransition
  });

  function appendCommand(state, type, command, fingerprint) {
    if (own(state.commandFingerprints, command.commandId)) throw new Error(`Duplicate audit commandId ${command.commandId}.`);
    const existingSourceOwner = state.auditHistory.find((event) => sourceKey(event.command) === sourceKey(command));
    if (existingSourceOwner) {
      throw new Error(
        `Source ${command.sourceType}:${command.sourceId} already owns command ${existingSourceOwner.commandId}.`
      );
    }
    COMMAND_MUTATORS[type](state, command);
    state.appliedCommandIds.push(command.commandId);
    state.commandFingerprints[command.commandId] = fingerprint;
    state.auditHistory.push({
      sequence: state.auditHistory.length + 1, commandId: command.commandId,
      type, fingerprint, command: clone(command)
    });
  }

  function assertStateEnvelope(value) {
    assertSerializable(value, "economy state");
    assertNoClinicalFields(value, "economy state");
    assertExactKeys(value, STATE_FIELDS, "economy state");
    if (value.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported economy schemaVersion ${value.schemaVersion}.`);
    STATE_FIELDS.filter((field) => !["schemaVersion", "commandFingerprints"].includes(field)).forEach((field) => {
      if (!Array.isArray(value[field])) throw new TypeError(`economy state.${field} must be an array.`);
    });
    if (!isObject(value.commandFingerprints)) throw new TypeError("economy state.commandFingerprints must be an object.");
  }

  function normalizeState(value) {
    assertStateEnvelope(value);
    const replay = mutableEmptyState();
    value.auditHistory.forEach((event, index) => {
      const label = `economy state.auditHistory[${index}]`;
      assertExactKeys(event, AUDIT_FIELDS, label);
      if (event.sequence !== index + 1) throw new Error(`${label}.sequence must be ${index + 1}.`);
      requireIdentifier(event.commandId, `${label}.commandId`);
      requireIdentifier(event.type, `${label}.type`);
      if (typeof event.fingerprint !== "string" || !event.fingerprint) throw new TypeError(`${label}.fingerprint must be non-empty.`);
      const normalizer = COMMAND_NORMALIZERS[event.type];
      if (!normalizer) throw new Error(`${label}.type is unsupported.`);
      const command = normalizer(event.command);
      if (command.commandId !== event.commandId) throw new Error(`${label}.commandId does not match its command.`);
      const fingerprint = fingerprintCommand(event.type, command);
      if (fingerprint !== event.fingerprint) throw new Error(`${label}.fingerprint does not match exact command content.`);
      appendCommand(replay, event.type, command, fingerprint);
    });
    if (stableStringify(replay) !== stableStringify(value)) {
      throw new Error("Economy state projections do not match immutable audit replay.");
    }
    return deepFreeze(clone(replay));
  }

  function createState() {
    return deepFreeze(mutableEmptyState());
  }

  function validateState(value) {
    try {
      normalizeState(value);
      return { valid: true, errors: [] };
    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
  }

  function serializeState(value) {
    return JSON.stringify(normalizeState(value));
  }

  function deserializeState(serialized) {
    if (typeof serialized !== "string" || !serialized.trim()) {
      throw new TypeError("Serialized economy state must be a non-empty JSON string.");
    }
    let parsed;
    try {
      parsed = JSON.parse(serialized);
    } catch (error) {
      throw new Error(`Cannot parse economy state: ${error.message}`);
    }
    return normalizeState(parsed);
  }

  function applyTyped(currentState, type, rawCommand) {
    const state = normalizeState(currentState);
    const normalizer = COMMAND_NORMALIZERS[type];
    if (!normalizer) throw new Error(`Unsupported economy command type ${type}.`);
    const command = normalizer(rawCommand);
    const fingerprint = fingerprintCommand(type, command);
    if (own(state.commandFingerprints, command.commandId)) {
      if (state.commandFingerprints[command.commandId] !== fingerprint) {
        throw new Error(`CommandId ${command.commandId} was already used with conflicting content.`);
      }
      const event = state.auditHistory.find((item) => item.commandId === command.commandId);
      if (!event || event.type !== type) throw new Error(`CommandId ${command.commandId} has inconsistent persisted audit history.`);
      return { state, event: clone(event), idempotent: true };
    }
    const next = clone(state);
    appendCommand(next, type, command, fingerprint);
    const normalized = normalizeState(next);
    return {
      state: normalized,
      event: clone(normalized.auditHistory[normalized.auditHistory.length - 1]),
      idempotent: false
    };
  }

  function applyCommand(currentState, command) {
    assertSerializable(command, "economy command");
    assertNoClinicalFields(command, "economy command");
    if (!isObject(command) || !own(command, "type")) throw new TypeError("economy command.type is required.");
    requireIdentifier(command.type, "economy command.type");
    const raw = {};
    Object.keys(command).forEach((key) => { if (key !== "type") raw[key] = command[key]; });
    return applyTyped(currentState, command.type, raw);
  }

  function applyCommandsAtomically(currentState, commands) {
    const original = normalizeState(currentState);
    if (!Array.isArray(commands) || commands.length === 0) {
      throw new TypeError("Atomic economy commands must be an explicit non-empty array.");
    }
    let next = original;
    const results = [];
    commands.forEach((command) => {
      const result = applyCommand(next, command);
      next = result.state;
      results.push({ event: result.event, idempotent: result.idempotent });
    });
    return deepFreeze({ state: next, results });
  }

  function named(type, key, locator) {
    return function namedCommand(currentState, command) {
      const result = applyTyped(currentState, type, command);
      const record = locator(result.state, command);
      return deepFreeze({ state: result.state, [key]: clone(record), idempotent: result.idempotent });
    };
  }

  const postLedger = named("ledger.post", "posting", (state, command) =>
    state.ledgerPostings.find((item) => item.postingId === command.postingId));
  const reverseLedger = named("ledger.reverse", "posting", (state, command) =>
    state.ledgerPostings.find((item) => item.postingId === command.reversalPostingId));
  const accrueObligation = named("obligation.accrue", "obligation", (state, command) =>
    state.obligations.find((item) => item.obligationId === command.obligationId));
  const settleObligation = named("obligation.settle", "obligation", (state, command) =>
    state.obligations.find((item) => item.obligationId === command.obligationId));
  const receiveInventory = named("inventory.receive", "movement", (state, command) =>
    state.inventoryMovements.find((item) => item.movementId === command.receiptId));
  const consumeInventory = named("inventory.consume", "movement", (state, command) =>
    state.inventoryMovements.find((item) => item.movementId === command.consumptionId));
  const expireInventory = named("inventory.expire", "movement", (state, command) =>
    state.inventoryMovements.find((item) => item.movementId === command.expirationId));
  const createProcurement = named("procurement.create", "procurement", (state, command) =>
    state.procurements.find((item) => item.procurementId === command.procurementId));
  const receiveProcurement = named("procurement.receive", "procurement", (state, command) =>
    state.procurements.find((item) => item.procurementId === command.procurementId));
  const cancelProcurement = named("procurement.cancel", "procurement", (state, command) =>
    state.procurements.find((item) => item.procurementId === command.procurementId));
  const acquireAsset = named("asset.acquire", "asset", (state, command) =>
    state.assets.find((item) => item.assetId === command.assetId));
  const disposeAsset = named("asset.dispose", "asset", (state, command) =>
    state.assets.find((item) => item.assetId === command.assetId));
  const scheduleMaintenance = named("maintenance.schedule", "maintenance", (state, command) =>
    state.maintenanceRecords.find((item) => item.maintenanceId === command.maintenanceId));
  const completeMaintenance = named("maintenance.complete", "maintenance", (state, command) =>
    state.maintenanceRecords.find((item) => item.maintenanceId === command.maintenanceId));
  const recordOwnerPlanDecision = named("owner_plan.record", "decision", (state, command) =>
    state.ownerPlanDecisions.find((item) => item.ownerPlanDecisionId === command.ownerPlanDecisionId));
  const recordBudgetDecision = named("budget_decision.record", "decision", (state, command) =>
    state.budgetDecisions.find((item) => item.budgetDecisionId === command.budgetDecisionId));
  const recordRecoveryAttempt = named("recovery.attempt", "recovery", (state, command) =>
    state.recoveries.find((item) => item.recoveryId === command.recoveryId));
  const transitionRecovery = named("recovery.transition", "recovery", (state, command) =>
    state.recoveries.find((item) => item.recoveryId === command.recoveryId));

  function summarizeState(value) {
    const state = normalizeState(value);
    return deepFreeze({
      schemaVersion: SCHEMA_VERSION,
      ledgerPostingCount: state.ledgerPostings.length,
      obligationCount: state.obligations.length,
      openObligationCount: state.obligations.filter((item) => item.status === "open").length,
      inventoryLotCount: state.inventoryLots.length,
      inventoryMovementCount: state.inventoryMovements.length,
      procurementCount: state.procurements.length,
      openProcurementCount: state.procurements.filter((item) => item.status === "open").length,
      assetCount: state.assets.length,
      activeAssetCount: state.assets.filter((item) => item.status === "active").length,
      maintenanceCount: state.maintenanceRecords.length,
      openMaintenanceCount: state.maintenanceRecords.filter((item) => item.status === "scheduled").length,
      ownerPlanDecisionCount: state.ownerPlanDecisions.length,
      budgetDecisionCount: state.budgetDecisions.length,
      recoveryCount: state.recoveries.length,
      auditEventCount: state.auditHistory.length
    });
  }

  return Object.freeze({
    SCHEMA_VERSION,
    FORBIDDEN_OPERATION_FIELDS,
    RECOVERY_STATUSES,
    createState,
    createEmptyState: createState,
    normalizeState,
    validateState,
    serializeState,
    deserializeState,
    summarizeState,
    applyCommand,
    applyCommandsAtomically,
    postLedger,
    postLedgerPosting: postLedger,
    postLedgerTransaction: postLedger,
    reverseLedger,
    reverseLedgerPosting: reverseLedger,
    accrueObligation,
    settleObligation,
    receiveInventory,
    consumeInventory,
    expireInventory,
    createProcurement,
    receiveProcurement,
    cancelProcurement,
    acquireAsset,
    disposeAsset,
    scheduleMaintenance,
    completeMaintenance,
    recordOwnerPlanDecision,
    recordBudgetDecision,
    recordRecoveryAttempt,
    transitionRecovery,
    recordRecoveryTransition: transitionRecovery
  });
});
