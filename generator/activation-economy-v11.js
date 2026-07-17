(function (root, factory) {
  "use strict";

  const economyApi = typeof module === "object" && module.exports
    ? require("../systems/economy-runtime-v6.js")
    : root.PET_CLINIC_ECONOMY_RUNTIME_V6;
  const reputationApi = typeof module === "object" && module.exports
    ? require("../systems/reputation-runtime-v6.js")
    : root.PET_CLINIC_REPUTATION_RUNTIME_V6;
  const api = factory(economyApi, reputationApi);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_ACTIVATION_ECONOMY_V11 = api;
})(typeof window !== "undefined" ? window : globalThis, function (economyApi, reputationApi) {
  "use strict";

  const VERSION = "pet-clinic-p6-live-adapter-v11@2026.07.17.1";
  const APPROVAL_PATH = "content/activation-packs/pet-clinic-local-2026.07.17.1/decisions/ECONOMY_TEST_APPROVAL.json";
  const APPROVAL_SHA256 = "f9b882e877ce622da606c4828aadb95aaf09bb40c52714369bafbfb254988408";
  const CURRENCY_ID = "vetcoin";
  const MODE_IDS = Object.freeze(["campaign", "training", "endless", "tester"]);
  const MUST_AFFECT_RUNTIME = Object.freeze([
    "patient_income",
    "investigation_costs",
    "consumables_and_stock",
    "staff_wages",
    "room_and_equipment_purchase",
    "delivery_and_training",
    "maintenance_and_breakdown",
    "referral_cost_or_lost_income",
    "reputation_and_trust_consequences"
  ]);
  const INVENTORY_CATEGORY_BY_CAPABILITY = Object.freeze({
    blood_ketone_strips: "rapid_tests",
    blood_tubes: "blood",
    blood_typing_kit: "blood",
    crossmatch_kit: "blood",
    cytology_consumables: "cytology",
    fecal_test_kit: "rapid_tests",
    fluorescein_strips: "general_exam",
    fracture_support_kit: "wound_procedure",
    fungal_sampling_kit: "infection_control",
    glucose_strips: "rapid_tests",
    infectious_test_kits: "rapid_tests",
    ketone_strips: "rapid_tests",
    lactate_strips: "rapid_tests",
    nutrition_consumables: "infusion",
    pancreatic_test_kit: "rapid_tests",
    respiratory_sampling_kit: "infection_control",
    reticulocyte_stain: "blood",
    schirmer_strips: "general_exam",
    skin_sampling_kit: "cytology",
    urine_consumables: "urine",
    wound_procedure_kit: "wound_procedure"
  });

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function assert(condition, message) {
    if (!condition) throw new Error(`Pet Clinic P6 activation rejected input: ${message}`);
  }

  function requireId(value, label) {
    assert(typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value), `${label} is invalid`);
    return value;
  }

  function requireMinute(value, label) {
    assert(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative campaign minute`);
    return value;
  }

  function requirePositiveAmount(value, label) {
    assert(Number.isSafeInteger(value) && value > 0, `${label} must be a positive integer`);
    return value;
  }

  function validateApproval(approval) {
    assert(approval?.schemaVersion === 1, "economy approval schema changed");
    assert(approval.decisionId === "pet-clinic-economy-local-test-approval-2026.07.17.1", "economy approval identity changed");
    assert(approval.scope === "local_manual_testing", "economy approval escaped local testing");
    assert(approval.status === "approved_without_numeric_changes", "economy approval status changed");
    assert(approval.sourcePackage === "vetgeme-operational-production-authoring@2026.07.16.4", "economy source package changed");
    assert(approval.sourceManifestSha256 === "5fc89dc34234d0626846fef797ba247ea0154068eeeb6b0953a990b3745f146d", "economy source manifest changed");
    assert(JSON.stringify(approval.mustAffectRuntime) === JSON.stringify(MUST_AFFECT_RUNTIME), "economy runtime scope changed");
    assert(approval.programmerMayRebalance === false, "economy approval unexpectedly permits rebalancing");
    assert(approval.modes?.campaign === "enabled"
      && approval.modes?.training === "sandboxed_no_irreversible_failure"
      && approval.modes?.endless === "enabled"
      && approval.modes?.tester === "toggle_real_or_unlimited", "economy mode policy changed");
    return clone(approval);
  }

  function modePolicy(modeId, searchParams = new URLSearchParams()) {
    assert(MODE_IDS.includes(modeId), `unknown game mode ${modeId}`);
    const requested = modeId === "tester" ? searchParams.get("testerEconomy") : null;
    const kind = modeId === "training"
      ? "sandboxed"
      : modeId === "tester" && requested !== "real" ? "unlimited" : "real";
    return Object.freeze({
      modeId,
      kind,
      appliesIncome: kind !== "unlimited",
      appliesExpense: kind === "real",
      irreversibleFailureAllowed: kind === "real"
    });
  }

  function cashDelta(policy, direction, amount) {
    assert(policy && MODE_IDS.includes(policy.modeId), "economy mode policy is missing");
    assert(direction === "income" || direction === "expense", "cash direction is invalid");
    requirePositiveAmount(amount, "cash amount");
    if (direction === "income") return policy.appliesIncome ? amount : 0;
    return policy.appliesExpense ? -amount : 0;
  }

  function ledgerCommand(input) {
    const flowId = requireId(input.flowId, "cash flow ID");
    const sourceType = requireId(input.sourceType, "cash source type");
    const at = requireMinute(input.at, "cash flow time");
    const amount = requirePositiveAmount(input.amount, "cash flow amount");
    const accountId = requireId(input.accountId, "cash flow account");
    const income = input.direction === "income";
    assert(income || input.direction === "expense", "cash flow direction is invalid");
    return {
      type: "ledger.post",
      commandId: `p6.cash.${flowId}`,
      sourceType,
      sourceId: flowId,
      postingId: `posting.${flowId}`,
      postedAt: at,
      currencyId: CURRENCY_ID,
      lines: income ? [
        { lineId: `${flowId}.cash`, accountId: "cash", side: "debit", amount },
        { lineId: `${flowId}.counterpart`, accountId, side: "credit", amount }
      ] : [
        { lineId: `${flowId}.counterpart`, accountId, side: "debit", amount },
        { lineId: `${flowId}.cash`, accountId: "cash", side: "credit", amount }
      ]
    };
  }

  function recordCashFlow(economyState, input, policy) {
    const command = ledgerCommand(input);
    const result = economyApi.applyCommand(economyState, command);
    return Object.freeze({
      state: result.state,
      posting: clone(result.event),
      idempotent: result.idempotent,
      cashDelta: result.idempotent ? 0 : cashDelta(policy, input.direction, input.amount)
    });
  }

  function recordBudgetDecision(economyState, input) {
    const decisionId = requireId(input.decisionId, "budget decision ID");
    return economyApi.recordBudgetDecision(economyState, {
      commandId: `p6.budget.${decisionId}`,
      sourceType: requireId(input.sourceType, "budget source type"),
      sourceId: requireId(input.sourceId, "budget source ID"),
      budgetDecisionId: decisionId,
      ownerId: requireId(input.ownerId, "budget owner ID"),
      budgetId: requireId(input.budgetId, "budget ID"),
      outcomeId: requireId(input.outcomeId, "budget outcome ID"),
      decidedAt: requireMinute(input.at, "budget decision time"),
      currencyId: input.amount === null ? null : CURRENCY_ID,
      amount: input.amount === null ? null : requirePositiveAmount(input.amount, "budget amount")
    });
  }

  function baselineInventoryCommands(crosswalk) {
    assert(Array.isArray(crosswalk?.startingInventory) && crosswalk.startingInventory.length === 10,
      "P6 exact starting inventory must contain 10 categories");
    return crosswalk.startingInventory.map(({ categoryId, units }) => ({
      type: "inventory.receive",
      commandId: `p6.baseline.inventory.${categoryId}`,
      sourceType: "campaign_baseline",
      sourceId: `inventory.${categoryId}`,
      receiptId: `receipt.baseline.${categoryId}`,
      lotId: `lot.baseline.${categoryId}`,
      itemId: `stock.${categoryId}`,
      unitId: "unit",
      quantity: units,
      receivedAt: 0,
      expiresAt: null
    }));
  }

  function baselineEquipmentCommands(crosswalk) {
    return crosswalk.resources
      .filter((record) => record.resourceKind === "equipment" && record.economicRecord?.startsOwned)
      .map((record) => ({
        type: "asset.acquire",
        commandId: `p6.baseline.asset.${record.resourceId}`,
        sourceType: "campaign_baseline",
        sourceId: `asset.${record.resourceId}`,
        acquisitionId: `acquisition.baseline.${record.resourceId}`,
        assetId: record.assetCatalogId,
        assetTypeId: record.resourceId,
        currencyId: CURRENCY_ID,
        amount: record.economicRecord.purchasePrice,
        acquiredAt: 0
      }));
  }

  function initializeEconomyState(economyState, crosswalk) {
    const commands = [...baselineInventoryCommands(crosswalk), ...baselineEquipmentCommands(crosswalk)];
    return economyApi.applyCommandsAtomically(economyState, commands).state;
  }

  function initializeReputationState(reputationState, scores) {
    return reputationApi.initializeBaseline(reputationState, {
      commandId: "p6.reputation.baseline",
      catalogId: "pet-clinic-reputation-local-test",
      catalogVersion: "2026.07.17.1",
      status: "approved",
      scores: {
        clinical: scores.clinical,
        communication: scores.communication,
        accessibility: scores.accessibility,
        organization: scores.organization
      }
    }).state;
  }

  function recordReputationEvent(reputationState, input) {
    const eventId = requireId(input.eventId, "reputation event ID");
    return reputationApi.recordEvent(reputationState, {
      commandId: `p6.reputation.${eventId}`,
      eventId,
      sourceType: requireId(input.sourceType, "reputation source type"),
      sourceId: requireId(input.sourceId, "reputation source ID"),
      axis: input.axis,
      delta: input.delta
    });
  }

  function inventoryAllocations(economyState, categoryId, units) {
    let remaining = units;
    const allocations = [];
    economyState.inventoryLots
      .filter((lot) => lot.itemId === `stock.${categoryId}` && lot.unitId === "unit" && lot.quantityAvailable > 0)
      .sort((left, right) => left.receivedAt - right.receivedAt || left.lotId.localeCompare(right.lotId, "en"))
      .forEach((lot) => {
        if (!remaining) return;
        const quantity = Math.min(remaining, lot.quantityAvailable);
        allocations.push({ lotId: lot.lotId, quantity });
        remaining -= quantity;
      });
    assert(remaining === 0, `insufficient ${categoryId} inventory`);
    return allocations;
  }

  function stockCategoriesForResearch(researchTask) {
    assert(Array.isArray(researchTask?.inventoryCapabilityIds), "research inventory capability list is missing");
    return [...new Set(researchTask.inventoryCapabilityIds.map((capabilityId) => {
      const categoryId = INVENTORY_CATEGORY_BY_CAPABILITY[capabilityId];
      assert(categoryId, `no explicit stock category for ${capabilityId}`);
      return categoryId;
    }))].sort((left, right) => left.localeCompare(right, "en"));
  }

  function researchStockAvailable(economyState, researchTask) {
    const categories = stockCategoriesForResearch(researchTask);
    return categories.every((categoryId) => economyState.inventoryLots
      .filter((lot) => lot.itemId === `stock.${categoryId}` && lot.unitId === "unit")
      .reduce((total, lot) => total + lot.quantityAvailable, 0) > 0);
  }

  function consumeResearchStock(runtime, input) {
    const sourceId = requireId(input.sourceId, "stock source ID");
    const at = requireMinute(input.at, "stock time");
    const categories = stockCategoriesForResearch(input.researchTask);
    let lifecycleState = input.lifecycleState;
    const economyCommands = [];
    categories.forEach((categoryId) => {
      const reservationId = `stock.${sourceId}.${categoryId}`;
      const lifecycleResult = runtime.p5.lifecycle.execute(lifecycleState, "consume_stock", {
        commandId: `p5.consume.${reservationId}`,
        categoryId,
        units: 1,
        reservationId
      }, {
        currentMinute: at,
        stockReservation: { reservationId, taskId: sourceId, categoryId, units: 1 }
      });
      lifecycleState = lifecycleResult.state;
      economyCommands.push({
        type: "inventory.consume",
        commandId: `p6.consume.${reservationId}`,
        sourceType: "research_task",
        sourceId: reservationId,
        consumptionId: `consumption.${reservationId}`,
        itemId: `stock.${categoryId}`,
        unitId: "unit",
        quantity: 1,
        consumedAt: at,
        allocations: inventoryAllocations(input.economyState, categoryId, 1)
      });
    });
    const economyState = economyCommands.length
      ? economyApi.applyCommandsAtomically(input.economyState, economyCommands).state
      : economyApi.normalizeState(input.economyState);
    return Object.freeze({ lifecycleState, economyState, categories });
  }

  function purchaseAsset(runtime, input) {
    const at = requireMinute(input.at, "purchase time");
    const assetCatalogId = requireId(input.assetCatalogId, "asset catalog ID");
    const record = runtime.resourceForAsset(assetCatalogId);
    assert(record && record.resourceKind !== "staff", `unknown purchasable asset ${assetCatalogId}`);
    const price = requirePositiveAmount(record.economicRecord.purchasePrice, `${assetCatalogId} purchase price`);
    const lifecycle = runtime.p5.lifecycle.execute(input.lifecycleState, "purchase_asset", {
      commandId: `p5.purchase.${assetCatalogId}`,
      assetCatalogId,
      purchasedAt: at,
      price
    }, {
      currentMinute: at,
      unlockedAssetCatalogIds: [...new Set(input.unlockedAssetCatalogIds || [])]
    });
    const flowId = `purchase.${assetCatalogId}`;
    const economy = economyApi.applyCommandsAtomically(input.economyState, [{
      type: "asset.acquire",
      commandId: `p6.asset.${flowId}`,
      sourceType: "asset_acquisition",
      sourceId: `${flowId}.asset`,
      acquisitionId: `acquisition.${assetCatalogId}`,
      assetId: assetCatalogId,
      assetTypeId: record.resourceId,
      currencyId: CURRENCY_ID,
      amount: price,
      acquiredAt: at
    }, ledgerCommand({
      flowId,
      sourceType: "asset_purchase",
      at,
      amount: price,
      direction: "expense",
      accountId: "expense.asset"
    })]);
    const idempotent = economy.results.every((result) => result.idempotent);
    return Object.freeze({
      lifecycleState: lifecycle.state,
      economyState: economy.state,
      resourceId: record.resourceId,
      assetCatalogId,
      price,
      idempotent,
      cashDelta: idempotent ? 0 : cashDelta(input.policy, "expense", price)
    });
  }

  function completeDelivery(runtime, input) {
    const at = requireMinute(input.at, "delivery time");
    const assetId = requireId(input.assetId, "delivered asset ID");
    const lifecycle = runtime.p5.lifecycle.execute(input.lifecycleState, "mark_delivery_complete", {
      commandId: `p5.delivery.${assetId}`,
      assetId,
      deliveredAt: at
    }, { currentMinute: at });
    const economy = recordBudgetDecision(input.economyState, {
      decisionId: `delivery.${assetId}`,
      sourceType: "asset_delivery",
      sourceId: assetId,
      ownerId: "clinic",
      budgetId: assetId,
      outcomeId: "delivered",
      at,
      amount: null
    });
    return Object.freeze({ lifecycleState: lifecycle.state, economyState: economy.state, idempotent: economy.idempotent });
  }

  function completeTraining(runtime, input) {
    const at = requireMinute(input.at, "training completion time");
    const assetId = requireId(input.assetId, "trained asset ID");
    const staffId = requireId(input.staffId, "trained staff ID");
    const lifecycle = runtime.p5.lifecycle.execute(input.lifecycleState, "complete_training", {
      commandId: `p5.training.${assetId}.${staffId}`,
      assetId,
      staffId,
      completedAt: at
    }, { currentMinute: at });
    const economy = recordBudgetDecision(input.economyState, {
      decisionId: `training.${assetId}.${staffId}`,
      sourceType: "equipment_training",
      sourceId: `${assetId}.${staffId}`,
      ownerId: staffId,
      budgetId: assetId,
      outcomeId: "completed",
      at,
      amount: null
    });
    return Object.freeze({ lifecycleState: lifecycle.state, economyState: economy.state, idempotent: economy.idempotent });
  }

  function maintenanceDuration(runtime, record) {
    const resource = runtime.p5.documents.resourceCatalog.resources
      .find((candidate) => candidate.resourceId === record.resourceId);
    const duration = runtime.p5.documents.operationalPolicies.maintenancePolicy
      .defaultDurationsByEquipmentType[resource?.equipmentType];
    assert(Number.isSafeInteger(duration) && duration > 0, `missing authored maintenance duration for ${record.resourceId}`);
    return duration;
  }

  function scheduleMaintenance(runtime, input) {
    const at = requireMinute(input.at, "maintenance start time");
    const assetId = requireId(input.assetId, "maintenance asset ID");
    const record = runtime.resourceForAsset(assetId);
    assert(record?.resourceKind === "equipment", `${assetId} is not maintainable equipment`);
    const endAt = at + maintenanceDuration(runtime, record);
    const maintenanceId = `maintenance.${assetId}.${at}`;
    const lifecycle = runtime.p5.lifecycle.execute(input.lifecycleState, "start_maintenance", {
      commandId: `p5.${maintenanceId}.start`,
      assetId,
      startAt: at,
      endAt
    }, {
      currentMinute: at,
      schedulerState: input.schedulerState
    });
    const economy = economyApi.scheduleMaintenance(input.economyState, {
      commandId: `p6.${maintenanceId}.start`,
      sourceType: input.breakdown ? "equipment_breakdown" : "scheduled_maintenance",
      sourceId: maintenanceId,
      maintenanceId,
      assetId,
      scheduledAt: at,
      startAt: at,
      endAt
    });
    return Object.freeze({ lifecycleState: lifecycle.state, economyState: economy.state, maintenanceId, endAt });
  }

  function completeMaintenance(runtime, input) {
    const at = requireMinute(input.at, "maintenance completion time");
    const assetId = requireId(input.assetId, "maintenance asset ID");
    const maintenanceId = requireId(input.maintenanceId, "maintenance ID");
    const record = runtime.resourceForAsset(assetId);
    assert(record?.resourceKind === "equipment", `${assetId} is not maintainable equipment`);
    const cost = requirePositiveAmount(record.economicRecord.maintenanceCost, `${assetId} maintenance cost`);
    const nextDueAt = at + record.economicRecord.maintenanceIntervalDays * 1440;
    const lifecycle = runtime.p5.lifecycle.execute(input.lifecycleState, "complete_maintenance", {
      commandId: `p5.${maintenanceId}.complete`,
      assetId,
      completedAt: at,
      nextDueAt
    }, {
      currentMinute: at,
      schedulerState: input.schedulerState
    });
    const flowId = `${maintenanceId}.cost`;
    const economy = economyApi.applyCommandsAtomically(input.economyState, [{
      type: "maintenance.complete",
      commandId: `p6.${maintenanceId}.complete`,
      sourceType: "maintenance_record",
      sourceId: `${maintenanceId}.record`,
      completionId: `completion.${maintenanceId}`,
      maintenanceId,
      completedAt: at
    }, ledgerCommand({
      flowId,
      sourceType: "maintenance_completion",
      at,
      amount: cost,
      direction: "expense",
      accountId: "expense.maintenance"
    })]);
    const idempotent = economy.results.every((result) => result.idempotent);
    return Object.freeze({
      lifecycleState: lifecycle.state,
      economyState: economy.state,
      cost,
      nextDueAt,
      idempotent,
      cashDelta: idempotent ? 0 : cashDelta(input.policy, "expense", cost)
    });
  }

  function buildRuntime(p5Bundle, approvalDocument) {
    assert(economyApi?.applyCommand && reputationApi?.recordEvent, "P6 runtimes are unavailable");
    assert(p5Bundle?.lifecycle && p5Bundle?.documents?.resourceCrosswalk, "P5 exact lifecycle/crosswalk is unavailable");
    const approval = validateApproval(approvalDocument);
    const crosswalk = p5Bundle.documents.resourceCrosswalk;
    assert(crosswalk.catalogId === "vetgeme-p6-p5-exact-resource-crosswalk"
      && crosswalk.catalogVersion === "2026.07.16.2" && crosswalk.resources.length === 49,
    "P6 exact crosswalk identity changed");
    const resourceById = new Map(crosswalk.resources.map((record) => [record.resourceId, record]));
    const resourceByAssetId = new Map(crosswalk.resources
      .filter((record) => record.assetCatalogId)
      .map((record) => [record.assetCatalogId, record]));
    const runtime = {
      version: VERSION,
      approvalPath: APPROVAL_PATH,
      approvalSha256: APPROVAL_SHA256,
      approval: Object.freeze(approval),
      p5: p5Bundle,
      crosswalk,
      modePolicy,
      initializeEconomyState(state) { return initializeEconomyState(state, crosswalk); },
      initializeReputationState,
      recordCashFlow,
      recordBudgetDecision,
      recordReputationEvent,
      stockCategoriesForResearch,
      researchStockAvailable,
      consumeResearchStock(input) { return consumeResearchStock(runtime, input); },
      purchaseAsset(input) { return purchaseAsset(runtime, input); },
      completeDelivery(input) { return completeDelivery(runtime, input); },
      completeTraining(input) { return completeTraining(runtime, input); },
      scheduleMaintenance(input) { return scheduleMaintenance(runtime, input); },
      completeMaintenance(input) { return completeMaintenance(runtime, input); },
      resource(resourceId) { return clone(resourceById.get(resourceId) || null); },
      resourceForAsset(assetId) { return clone(resourceByAssetId.get(assetId) || null); },
      wageFor(staffId) {
        const record = resourceById.get(staffId);
        assert(record?.p6EconomicAuthority === "staffWagesPerWorkedDay", `missing exact wage for ${staffId}`);
        return record.economicRecord.amount;
      },
      audit: Object.freeze({
        resourceCount: crosswalk.resources.length,
        startingInventoryCategories: crosswalk.startingInventory.length,
        explicitInventoryCapabilityMappings: Object.keys(INVENTORY_CATEGORY_BY_CAPABILITY).length,
        mustAffectRuntime: approval.mustAffectRuntime.length,
        programmerMayRebalance: approval.programmerMayRebalance
      })
    };
    return Object.freeze(runtime);
  }

  function applyCatalog(runtime, catalog) {
    return { ...catalog, economyActivation: runtime };
  }

  return Object.freeze({
    VERSION,
    APPROVAL_PATH,
    APPROVAL_SHA256,
    CURRENCY_ID,
    MODE_IDS,
    MUST_AFFECT_RUNTIME,
    INVENTORY_CATEGORY_BY_CAPABILITY,
    validateApproval,
    modePolicy,
    buildRuntime,
    applyCatalog
  });
});
