import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const defaultLifecycleApi = require("../../systems/resource-lifecycle-v5.js");
const defaultSchedulerApi = require("../../systems/resource-scheduler-v5.js");

export const P5_AUTHORING_REVIEW_ADAPTER_V2_VERSION = "2026.07.16.2-review.1";
export const P5_AUTHORING_ATOMIC_STATE_SCHEMA_VERSION = 1;
export const P5_NON_AUTHORITATIVE_RESULT_SENTINEL =
  "medical_family_presentation_investigation_result";
export const OPERATIONAL_MEDICAL_RESULT_AUTHORITY =
  "medical_family.presentation.investigations[].result_only";

const TASK_BEARING_MODES = new Set([
  "schedulable_task",
  "external_coordination",
  "explicit_alternative_resolution",
]);

const BLOCKED_SCHEDULE_REASON_CODES = new Set([
  "routine_blocked_by_fatigue",
  "capacity_unavailable",
  "urgent_capacity_unavailable_safe_route_required",
  "inventory_unavailable_safe_route_required",
  "protocol_authority_unavailable_safe_route_required",
  "state_predicate_reservation_unavailable_safe_route_required",
]);

const ADAPTER_ONLY_BLOCKED_REASON_CODES = new Set([
  "routine_blocked_by_fatigue",
  "capacity_unavailable",
  "urgent_capacity_unavailable_safe_route_required",
  "inventory_unavailable_safe_route_required",
  "protocol_authority_unavailable_safe_route_required",
  "state_predicate_reservation_unavailable_safe_route_required",
]);

function fail(message) {
  throw new Error(`P5 authoring review adapter v2 rejected input: ${message}`);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function checkObject(value, label) {
  check(isObject(value), `${label} must be a plain object`);
  return value;
}

function checkArray(value, label) {
  check(Array.isArray(value), `${label} must be an array`);
  return value;
}

function checkString(value, label) {
  check(typeof value === "string" && value.trim(), `${label} must be a non-empty string`);
  return value;
}

function checkMinute(value, label) {
  check(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative campaign minute`);
  return value;
}

function checkPositiveInteger(value, label) {
  check(Number.isSafeInteger(value) && value > 0, `${label} must be a positive integer`);
  return value;
}

function checkPercentage(value, label) {
  check(Number.isSafeInteger(value) && value >= 0 && value <= 100,
    `${label} must be an integer from 0 through 100`);
  return value;
}

function checkPositiveNumber(value, label) {
  check(Number.isFinite(value) && value > 0, `${label} must be a positive finite number`);
  return value;
}

function checkExactKeys(value, expected, label) {
  checkObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  check(sameCanonical(actual, wanted), `${label} fields must be exactly ${wanted.join(", ")}`);
  return value;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((child) => deepFreeze(child, seen));
  return Object.freeze(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function adapterFingerprint(value) {
  const text = canonicalJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `p5adapter:${hash.toString(16).padStart(8, "0")}`;
}

function sameCanonical(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function sortedStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

function sameStrings(left, right) {
  return JSON.stringify(sortedStrings(left)) === JSON.stringify(sortedStrings(right));
}

function sortedRequirementGroups(groups) {
  return clone(groups).map((group) => ({
    ...group,
    anyOf: [...group.anyOf].sort((left, right) =>
      left.resourceId.localeCompare(right.resourceId, "en")
      || left.capabilityId.localeCompare(right.capabilityId, "en")
      || left.units - right.units),
  })).sort((left, right) => left.id.localeCompare(right.id, "en"));
}

function uniqueMap(records, key, label) {
  const output = new Map();
  checkArray(records, label).forEach((record, index) => {
    checkObject(record, `${label}[${index}]`);
    const id = checkString(record[key], `${label}[${index}].${key}`);
    check(!output.has(id), `${label} contains duplicate ${id}`);
    output.set(id, record);
  });
  return output;
}

function document(reviewInput, relativePath, label) {
  const documents = checkObject(reviewInput.documents, `${label}.documents`);
  const value = documents[relativePath];
  check(value !== undefined, `${label} is missing ${relativePath}`);
  return value;
}

function unionResourceIds(record) {
  return sortedStrings([
    ...(record.eligibleStaffIds || []),
    ...(record.eligibleRoomIds || []),
    ...(record.physicalResourceIds || []),
    ...(record.eligibleEquipmentIds || []),
  ].filter(Boolean));
}

function validateFatigueBands(records) {
  checkArray(records, "fatigue bands");
  check(records.length > 0, "fatigue bands must not be empty");
  const normalized = records.map((record, index) => {
    const label = `fatigue bands[${index}]`;
    checkExactKeys(record, [
      "minimum",
      "maximum",
      "durationMultiplier",
      "routineStartAllowed",
      "urgentStartAllowed",
      "extensionAllowed",
    ], label);
    const minimum = checkPercentage(record.minimum, `${label}.minimum`);
    const maximum = checkPercentage(record.maximum, `${label}.maximum`);
    check(maximum >= minimum, `${label} maximum precedes minimum`);
    const durationMultiplier = checkPositiveNumber(
      record.durationMultiplier,
      `${label}.durationMultiplier`,
    );
    for (const field of ["routineStartAllowed", "urgentStartAllowed", "extensionAllowed"]) {
      check(typeof record[field] === "boolean", `${label}.${field} must be boolean`);
    }
    return {
      minimum,
      maximum,
      durationMultiplier,
      routineStartAllowed: record.routineStartAllowed,
      urgentStartAllowed: record.urgentStartAllowed,
      extensionAllowed: record.extensionAllowed,
    };
  }).sort((left, right) => left.minimum - right.minimum);
  check(normalized[0].minimum === 0, "fatigue bands must start at zero");
  for (let index = 1; index < normalized.length; index += 1) {
    check(normalized[index].minimum === normalized[index - 1].maximum + 1,
      "fatigue bands must be contiguous and non-overlapping");
  }
  check(normalized[normalized.length - 1].maximum === 100,
    "fatigue bands must end at 100");
  return deepFreeze(normalized);
}

function buildJoinContext(p5ReviewInput, operationalReviewInput) {
  checkObject(p5ReviewInput, "P5 review input");
  checkObject(operationalReviewInput, "operational review input");
  check(p5ReviewInput.registration?.reviewInputId === "vetgeme-p5-production-authoring",
    "P5 review input ID mismatch");
  check(p5ReviewInput.registration?.reviewInputVersion === "2026.07.16.2",
    "P5 review input must be immutable version .2");
  check(operationalReviewInput.registration?.reviewInputId === "vetgeme-operational-production-authoring",
    "operational review input ID mismatch");
  check(operationalReviewInput.registration?.reviewInputVersion === "2026.07.16.4",
    "operational review input must be immutable version .4");
  for (const [input, label] of [[p5ReviewInput, "P5"], [operationalReviewInput, "operational"]]) {
    check(input.reviewOnly === true, `${label} input must remain review-only`);
    check(input.runtimeEligible === false, `${label} input must remain runtime-ineligible`);
    check(input.productionEligible === false, `${label} input must remain production-ineligible`);
    checkArray(input.productionPool, `${label}.productionPool`);
    check(input.productionPool.length === 0, `${label} production pool must remain empty`);
  }

  const p5Manifest = p5ReviewInput.manifest || document(p5ReviewInput, "MANIFEST.json", "P5 input");
  check(p5Manifest.boundaries?.medicalTruthAllowed === false,
    "P5 manifest must forbid medical truth authority");
  check(p5Manifest.boundaries?.p3OwnsResearchResults === true,
    "P5 manifest must keep research-result authority in P3");
  check(p5Manifest.boundaries?.saveSchemaChange === false,
    "P5 package must not change the save schema");

  const resourceCatalog = document(p5ReviewInput, "generated/resource-catalog.json", "P5 input");
  const lifecycleCatalog = document(p5ReviewInput, "generated/resource-lifecycle-catalog.json", "P5 input");
  const exactCapabilities = document(p5ReviewInput, "source/p5-exact-capability-resource-map.json", "P5 input");
  const capabilityCatalog = document(p5ReviewInput, "generated/capability-operations-map.json", "P5 input");
  const visits = document(p5ReviewInput, "generated/visit-task-catalog.json", "P5 input");
  const research = document(p5ReviewInput, "generated/research-task-catalog.json", "P5 input");
  const usages = document(p5ReviewInput, "generated/investigation-usage-task-map.json", "P5 input");
  const policies = document(p5ReviewInput, "generated/operational-policies.json", "P5 input");
  const handoffContract = document(p5ReviewInput, "source/p5-handoff-contract.json", "P5 input");
  const operationalCrosswalk = document(
    operationalReviewInput,
    "source/p6-p5-exact-resource-crosswalk.json",
    "operational input",
  );
  const operationalGeneratedCrosswalk = document(
    operationalReviewInput,
    "generated/p6/p3-p5-resource-crosswalk.json",
    "operational input",
  );
  const operationalResearch = document(
    operationalReviewInput,
    "generated/p3/research-catalog.json",
    "operational input",
  );
  const operationalUsages = document(
    operationalReviewInput,
    "generated/p3/investigation-usage-policy.json",
    "operational input",
  );

  check(resourceCatalog.resources.length === 49, "P5 resource catalog must contain 49 resources");
  check(resourceCatalog.resources.filter((record) => record.resourceKind === "staff").length === 10,
    "P5 resource catalog must contain 10 staff");
  check(resourceCatalog.resources.filter((record) => record.resourceKind === "room").length === 12,
    "P5 resource catalog must contain 12 rooms");
  check(resourceCatalog.resources.filter((record) => record.resourceKind === "equipment").length === 27,
    "P5 resource catalog must contain 27 equipment resources");
  check(lifecycleCatalog.commands.length === 13, "P5 lifecycle catalog must contain 13 commands");
  check(exactCapabilities.capabilities.length === 447, "P5 exact map must contain 447 capabilities");
  check(exactCapabilities.supplementalCapabilities.length === 8,
    "P5 exact map must contain 8 supplemental capabilities");
  check(sameCanonical(exactCapabilities.capabilities, capabilityCatalog.capabilities)
    && sameCanonical(exactCapabilities.supplementalCapabilities, capabilityCatalog.supplementalCapabilities),
  "P5 generated capability map differs from exact source authority");

  check(operationalCrosswalk.catalogId === "vetgeme-p6-p5-exact-resource-crosswalk"
    && operationalCrosswalk.catalogVersion === "2026.07.16.2"
    && operationalCrosswalk.p5PackageVersion === "2026.07.16.2",
  "operational .4 must preserve the exact P5 .2 resource crosswalk");
  check(operationalCrosswalk.runtimeEligible === false,
    "operational source crosswalk must remain review-only");
  check(operationalGeneratedCrosswalk.reservationAuthority === false,
    "flattened operational crosswalk must never become reservation authority");
  check(operationalGeneratedCrosswalk.tokenMatchingAllowed === false,
    "token matching must remain forbidden");

  const resourcesById = uniqueMap(resourceCatalog.resources, "resourceId", "P5 resources");
  const operationalResourcesById = uniqueMap(operationalCrosswalk.resources, "resourceId", "operational resources");
  check(sameStrings(resourcesById.keys(), operationalResourcesById.keys()),
    "P5 and operational resource IDs differ");
  for (const [resourceId, resource] of resourcesById) {
    const crosswalk = operationalResourcesById.get(resourceId);
    check(resource.resourceKind === crosswalk.resourceKind, `${resourceId} resource kind differs`);
    check(resource.initialLifecycleState === crosswalk.p5LifecycleState,
      `${resourceId} lifecycle state differs`);
    check(sameStrings(resource.initialEvidenceIds, crosswalk.activationEvidenceIds),
      `${resourceId} activation evidence differs`);
  }

  validateCapabilityJoin(exactCapabilities.capabilities, operationalCrosswalk.capabilities, "canonical");
  validateCapabilityJoin(
    exactCapabilities.supplementalCapabilities,
    operationalCrosswalk.supplementalCapabilities,
    "supplemental",
  );

  const p5ResearchById = uniqueMap(research.researchTasks, "researchId", "P5 research tasks");
  const opResearchById = uniqueMap(operationalResearch.research, "researchId", "operational research routes");
  check(p5ResearchById.size === 361 && opResearchById.size === 361
    && sameStrings(p5ResearchById.keys(), opResearchById.keys()),
  "P5 and operational research IDs differ");
  for (const record of p5ResearchById.values()) {
    check(record.medicalResultAuthority === P5_NON_AUTHORITATIVE_RESULT_SENTINEL,
      `${record.researchId} P5 non-authoritative result sentinel changed`);
    check(opResearchById.get(record.researchId).medicalResultAuthority === OPERATIONAL_MEDICAL_RESULT_AUTHORITY,
      `${record.researchId} exact operational medical result authority changed`);
  }
  const p5UsageIds = usages.usageTasks.map((record) => record.usageId);
  const opUsageIds = operationalUsages.usages.map((record) => record.usageId);
  check(p5UsageIds.length === 1864 && opUsageIds.length === 1864 && sameStrings(p5UsageIds, opUsageIds),
    "P5 and operational investigation usage IDs differ");

  const policyById = uniqueMap(policies.handoffPolicies, "policyId", "handoff policies");
  check(sameStrings(policyById.keys(), ["not_allowed", "midpoint", "urgent_quarter_breakpoints"]),
    "handoff policy set changed");
  check(sameCanonical(policies.handoffRuntimeContract, handoffContract),
    "generated and source handoff contracts differ");
  const absencePolicyById = uniqueMap(
    policies.absencePolicies,
    "absenceTypeId",
    "staff absence policies",
  );
  check(sameStrings(
    absencePolicyById.keys(),
    ["planned_leave", "training_block", "unplanned_illness"],
  ), "staff absence policy set changed");
  const fatigueBands = validateFatigueBands(policies.fatigueBands);

  const visitById = uniqueMap(visits.tasks, "taskTemplateId", "visit task templates");
  const researchById = p5ResearchById;
  const usageById = uniqueMap(usages.usageTasks, "usageId", "investigation usage templates");
  const capabilityById = uniqueMap(capabilityCatalog.capabilities, "capabilityId", "capability templates");
  const inventoryRequirementByCapabilityId = validateInventoryAuthority(
    lifecycleCatalog,
    operationalCrosswalk,
    capabilityById,
    researchById,
  );
  const statePredicateCount = validateTaskExecutionAuthority(
    capabilityById,
    researchById,
    resourcesById,
    policies,
    visitById,
  );
  const taskBearingCapabilities = [...capabilityById.values()]
    .filter((record) => TASK_BEARING_MODES.has(record.executionMode));
  const taskTemplateCount = visitById.size + researchById.size + usageById.size + taskBearingCapabilities.length;
  check(taskTemplateCount === 2606, "exact runtime task template count must be 2606");

  return {
    resourceCatalog,
    resourcesById,
    lifecycleCatalog,
    resourceCrosswalk: operationalCrosswalk,
    policies,
    fatigueBands,
    policyById,
    absencePolicyById,
    visitById,
    researchById,
    usageById,
    capabilityById,
    inventoryRequirementByCapabilityId,
    taskTemplateCount,
    audit: deepFreeze({
      p5Version: "2026.07.16.2",
      operationalVersion: "2026.07.16.4",
      resources: resourcesById.size,
      staff: 10,
      rooms: 12,
      equipment: 27,
      lifecycleCommands: lifecycleCatalog.commands.length,
      canonicalCapabilities: exactCapabilities.capabilities.length,
      supplementalCapabilities: exactCapabilities.supplementalCapabilities.length,
      researchTasks: researchById.size,
      investigationUsages: usageById.size,
      runtimeTaskTemplates: taskTemplateCount,
      inventoryCapabilities: inventoryRequirementByCapabilityId.size,
      statePredicates: statePredicateCount,
      fatigueBands: fatigueBands.length,
      absencePolicies: absencePolicyById.size,
      exactRequirementGroupsAreReservationAuthority: true,
      reservationAuthorityScope: "review_adapter_only",
      liveRuntimeReservationAuthorityEnabled: false,
      flattenedOperationalResourceIdsAreReservationAuthority: false,
      liveSaveSchemaChanged: false,
      p5ResultMarkerRole: "non_authoritative_ownership_sentinel",
      operationalMedicalResultAuthority: OPERATIONAL_MEDICAL_RESULT_AUTHORITY,
      productionPool: 0,
    }),
  };
}

function validateCapabilityJoin(p5Records, operationalRecords, label) {
  const operationalById = uniqueMap(operationalRecords, "capabilityId", `operational ${label} capabilities`);
  check(p5Records.length === operationalRecords.length, `${label} capability counts differ`);
  for (const record of p5Records) {
    const operational = operationalById.get(record.capabilityId);
    check(operational, `${label} capability ${record.capabilityId} is missing from operational crosswalk`);
    check(sameStrings(unionResourceIds(record), operational.p5ResourceIds),
      `${label} capability ${record.capabilityId} exact resource IDs differ`);
    if (label === "canonical") {
      check(record.mappingAuthority === "author_frozen_exact_capability_resource_map_v2",
        `${record.capabilityId} exact mapping authority changed`);
      check(record.tokenOrSubstringResolutionForbidden === true,
        `${record.capabilityId} token matching must remain forbidden`);
    } else {
      check(record.resolutionMode === "exact_authored_resource_ids"
        && record.unknownOrUnavailableFailsClosed === true,
      `${record.capabilityId} supplemental exact/fail-closed policy changed`);
    }
  }
}

function validateInventoryAuthority(lifecycleCatalog, resourceCrosswalk, capabilityById, researchById) {
  const lifecycleInventory = uniqueMap(
    lifecycleCatalog.startingInventory,
    "categoryId",
    "P5 lifecycle starting inventory",
  );
  const crosswalkInventory = uniqueMap(
    resourceCrosswalk.startingInventory,
    "categoryId",
    "P6/P5 crosswalk starting inventory",
  );
  check(lifecycleInventory.size === 10 && crosswalkInventory.size === 10,
    "starting inventory must contain the exact 10-category set");
  check(sameStrings(lifecycleInventory.keys(), crosswalkInventory.keys()),
    "P5 and P6 starting inventory category IDs differ");
  for (const [categoryId, record] of lifecycleInventory) {
    checkPositiveInteger(record.units, `${categoryId} starting units`);
    check(record.units === crosswalkInventory.get(categoryId).units,
      `${categoryId} P5/P6 starting units differ`);
  }

  const inventoryRequirementByCapabilityId = new Map();
  for (const record of capabilityById.values()) {
    checkArray(record.inventoryCapabilityIds, `${record.capabilityId}.inventoryCapabilityIds`);
    check(new Set(record.inventoryCapabilityIds).size === record.inventoryCapabilityIds.length,
      `${record.capabilityId}.inventoryCapabilityIds contains duplicates`);
    if (record.executionMode !== "inventory_only") continue;
    check(record.capabilityType === "consumable_set",
      `${record.capabilityId} inventory-only capability must be a consumable_set`);
    check(record.inventoryCapabilityIds.length === 0,
      `${record.capabilityId} inventory-only capability cannot depend on another inventory capability`);
    checkArray(record.requirementGroups, `${record.capabilityId}.requirementGroups`);
    check(record.requirementGroups.length === 0,
      `${record.capabilityId} inventory-only capability cannot create a scheduler resource group`);
    checkArray(record.statePredicates, `${record.capabilityId}.statePredicates`);
    check(record.statePredicates.length === 1,
      `${record.capabilityId} must have exactly one inventory authority predicate`);
    const predicate = checkExactKeys(
      record.statePredicates[0],
      ["predicate", "inventoryCategoryId", "minimumUnits", "authority"],
      `${record.capabilityId}.statePredicates[0]`,
    );
    check(predicate.predicate === "inventory_units_gte",
      `${record.capabilityId} inventory predicate must be inventory_units_gte`);
    const categoryId = checkString(
      predicate.inventoryCategoryId,
      `${record.capabilityId} inventory category`,
    );
    check(lifecycleInventory.has(categoryId),
      `${record.capabilityId} references unknown inventory category ${categoryId}`);
    checkPositiveInteger(predicate.minimumUnits, `${record.capabilityId}.minimumUnits`);
    check(predicate.authority === "p6.inventoryState",
      `${record.capabilityId} inventory authority must remain p6.inventoryState`);
    inventoryRequirementByCapabilityId.set(record.capabilityId, deepFreeze({
      inventoryCapabilityId: record.capabilityId,
      categoryId,
      units: predicate.minimumUnits,
    }));
  }
  check(inventoryRequirementByCapabilityId.size === 26,
    "exact inventory authority must contain 26 consumable capabilities");

  const validateReferences = (record, label) => {
    checkArray(record.inventoryCapabilityIds, `${label}.inventoryCapabilityIds`);
    check(new Set(record.inventoryCapabilityIds).size === record.inventoryCapabilityIds.length,
      `${label}.inventoryCapabilityIds contains duplicates`);
    for (const capabilityId of record.inventoryCapabilityIds) {
      checkString(capabilityId, `${label}.inventoryCapabilityIds entry`);
      check(inventoryRequirementByCapabilityId.has(capabilityId),
        `${label} references non-authoritative inventory capability ${capabilityId}`);
    }
  };
  for (const record of capabilityById.values()) validateReferences(record, record.capabilityId);
  for (const record of researchById.values()) validateReferences(record, record.researchId);
  return inventoryRequirementByCapabilityId;
}

function validateTaskExecutionAuthority(capabilityById, researchById, resourcesById, policies, visitById) {
  const staffIds = new Set([...resourcesById.values()]
    .filter((record) => record.resourceKind === "staff")
    .map((record) => record.resourceId));
  const roomIds = new Set([...resourcesById.values()]
    .filter((record) => record.resourceKind === "room")
    .map((record) => record.resourceId));
  let statePredicateCount = 0;

  const validateResourceIds = (ids, allowed, label) => {
    checkArray(ids, label);
    check(new Set(ids).size === ids.length, `${label} contains duplicates`);
    for (const id of ids) check(allowed.has(id), `${label} references unknown resource ${id}`);
  };
  const validateSafeRoute = (safeRouteId, label) => {
    if (safeRouteId === null || safeRouteId === undefined) return;
    const route = capabilityById.get(checkString(safeRouteId, `${label}.safeRouteId`));
    check(route?.capabilityType === "external_service" && route.executionMode === "external_coordination",
      `${label}.safeRouteId must reference an exact external-service capability`);
  };
  const validateMetadata = (record, label) => {
    checkArray(record.dependencyClosure, `${label}.dependencyClosure`);
    check(new Set(record.dependencyClosure).size === record.dependencyClosure.length,
      `${label}.dependencyClosure contains duplicates`);
    for (const capabilityId of record.dependencyClosure) {
      check(capabilityById.has(capabilityId),
        `${label}.dependencyClosure references unknown capability ${capabilityId}`);
    }
    checkArray(record.protocolCapabilityIds, `${label}.protocolCapabilityIds`);
    check(new Set(record.protocolCapabilityIds).size === record.protocolCapabilityIds.length,
      `${label}.protocolCapabilityIds contains duplicates`);
    for (const capabilityId of record.protocolCapabilityIds) {
      const protocol = capabilityById.get(capabilityId);
      check(record.dependencyClosure.includes(capabilityId),
        `${label} protocol ${capabilityId} is outside its exact dependency closure`);
      check(["staff_protocol", "room_protocol"].includes(protocol?.capabilityType),
        `${label} protocol ${capabilityId} has an unsupported capability type`);
    }
    validateSafeRoute(record.safeRouteId, label);
  };

  for (const record of capabilityById.values()) {
    validateMetadata(record, record.capabilityId);
    checkArray(record.statePredicates, `${record.capabilityId}.statePredicates`);
    for (let index = 0; index < record.statePredicates.length; index += 1) {
      const predicate = record.statePredicates[index];
      const label = `${record.capabilityId}.statePredicates[${index}]`;
      statePredicateCount += 1;
      if (["resource_owned", "delivery_complete", "training_complete", "maintenance_current"]
        .includes(predicate.predicate)) {
        checkExactKeys(predicate, ["predicate", "resourceId", "authority"], label);
        const resourceId = checkString(predicate.resourceId, `${label}.resourceId`);
        check(resourcesById.get(resourceId)?.resourceKind === "equipment",
          `${label} must reference exact equipment`);
        const expectedAuthority = predicate.predicate === "training_complete"
          ? "p5.trainingState"
          : predicate.predicate === "resource_owned" || predicate.predicate === "delivery_complete"
            ? "p6.assetState"
            : "p6.maintenanceState";
        check(predicate.authority === expectedAuthority, `${label} authority changed`);
      } else if (predicate.predicate === "inventory_units_gte") {
        checkExactKeys(
          predicate,
          ["predicate", "inventoryCategoryId", "minimumUnits", "authority"],
          label,
        );
        check(predicate.authority === "p6.inventoryState", `${label} authority changed`);
      } else if (predicate.predicate === "qualified_staff_scheduled") {
        checkExactKeys(
          predicate,
          ["predicate", "capabilityId", "eligibleStaffIds", "authority"],
          label,
        );
        check(predicate.capabilityId === record.capabilityId,
          `${label}.capabilityId differs from its exact owner`);
        validateResourceIds(predicate.eligibleStaffIds, staffIds, `${label}.eligibleStaffIds`);
        check(predicate.authority === "p5.staffAndShiftState", `${label} authority changed`);
      } else if (predicate.predicate === "ready_room_available") {
        checkExactKeys(
          predicate,
          ["predicate", "capabilityId", "eligibleRoomIds", "authority"],
          label,
        );
        check(predicate.capabilityId === record.capabilityId,
          `${label}.capabilityId differs from its exact owner`);
        validateResourceIds(predicate.eligibleRoomIds, roomIds, `${label}.eligibleRoomIds`);
        check(predicate.authority === "p5.roomState", `${label} authority changed`);
      } else if (predicate.predicate === "referral_coordination_slot_available") {
        checkExactKeys(
          predicate,
          ["predicate", "capabilityId", "eligibleStaffIds", "eligibleRoomIds", "authority"],
          label,
        );
        check(predicate.capabilityId === record.capabilityId,
          `${label}.capabilityId differs from its exact owner`);
        validateResourceIds(predicate.eligibleStaffIds, staffIds, `${label}.eligibleStaffIds`);
        validateResourceIds(predicate.eligibleRoomIds, roomIds, `${label}.eligibleRoomIds`);
        check(predicate.authority === "p5.scheduler", `${label} authority changed`);
      } else {
        fail(`${label} has unsupported predicate ${predicate.predicate}`);
      }
    }
  }
  check(statePredicateCount === 293, "exact capability map must contain 293 state predicates");
  for (const record of researchById.values()) validateMetadata(record, record.researchId);

  const urgentSafeRouteId = checkString(
    policies.urgentOvercapacity?.safeRouteId,
    "urgent overcapacity safeRouteId",
  );
  validateSafeRoute(urgentSafeRouteId, "urgent overcapacity policy");
  for (const visit of visitById.values()) {
    if (visit.runtimeTemplate.safeRouteRequired) {
      check(visit.runtimeTemplate.urgency === "urgent",
        `${visit.taskTemplateId} safe route may only be required by an urgent visit`);
    }
  }
  return statePredicateCount;
}

function statePredicatesForDependencies(context, dependencyClosure) {
  return dependencyClosure.flatMap((capabilityId) => {
    const capability = context.capabilityById.get(capabilityId);
    check(capability, `dependency closure references unknown capability ${capabilityId}`);
    return capability.statePredicates.map((predicate) => ({
      capabilityId,
      predicate: clone(predicate),
    }));
  });
}

function taskTemplate(context, kind, sourceId) {
  checkString(kind, "task kind");
  checkString(sourceId, "task source ID");
  if (kind === "visit") {
    const record = context.visitById.get(sourceId);
    check(record, `unknown visit task ${sourceId}`);
    return {
      sourceType: "visit_stage",
      sourceId,
      runtimeTemplate: record.runtimeTemplate,
      dependencyClosure: [],
      inventoryCapabilityIds: [],
      protocolCapabilityIds: [],
      statePredicates: [],
      safeRouteId: record.runtimeTemplate.safeRouteRequired
        ? context.policies.urgentOvercapacity.safeRouteId
        : null,
      handoffPolicyId: record.handoff,
    };
  }
  if (kind === "research") {
    const record = context.researchById.get(sourceId);
    check(record, `unknown research task ${sourceId}`);
    return {
      sourceType: "research",
      sourceId,
      runtimeTemplate: record.runtimeTemplate,
      dependencyClosure: clone(record.dependencyClosure),
      inventoryCapabilityIds: clone(record.inventoryCapabilityIds),
      protocolCapabilityIds: clone(record.protocolCapabilityIds),
      statePredicates: statePredicatesForDependencies(context, record.dependencyClosure),
      safeRouteId: record.safeRouteId,
      handoffPolicyId: null,
    };
  }
  if (kind === "usage") {
    const usage = context.usageById.get(sourceId);
    check(usage, `unknown investigation usage task ${sourceId}`);
    const base = context.researchById.get(usage.researchId);
    check(base, `${sourceId} references unknown research ${usage.researchId}`);
    return {
      sourceType: "research_usage",
      sourceId,
      runtimeTemplate: { ...clone(base.runtimeTemplate), ...clone(usage.runtimeOverrides) },
      dependencyClosure: clone(base.dependencyClosure),
      inventoryCapabilityIds: clone(base.inventoryCapabilityIds),
      protocolCapabilityIds: clone(base.protocolCapabilityIds),
      statePredicates: statePredicatesForDependencies(context, base.dependencyClosure),
      safeRouteId: base.safeRouteId,
      handoffPolicyId: usage.handoffPolicyId,
    };
  }
  if (kind === "capability") {
    const capability = context.capabilityById.get(sourceId);
    check(capability, `unknown capability task ${sourceId}`);
    check(TASK_BEARING_MODES.has(capability.executionMode), `${sourceId} is not a task-bearing capability`);
    return {
      sourceType: "capability",
      sourceId,
      runtimeTemplate: {
        priority: 200,
        authoredDurationMinutes: capability.durationMinutes,
        requirementGroups: clone(capability.requirementGroups),
        urgency: "routine",
        safeRouteRequired: false,
      },
      dependencyClosure: clone(capability.dependencyClosure),
      inventoryCapabilityIds: clone(capability.inventoryCapabilityIds),
      protocolCapabilityIds: clone(capability.protocolCapabilityIds),
      statePredicates: statePredicatesForDependencies(context, capability.dependencyClosure),
      safeRouteId: capability.safeRouteId,
      handoffPolicyId: null,
    };
  }
  fail(`unsupported task kind ${kind}`);
}

export function createP5AuthoringReviewAdapterV2(
  p5ReviewInput,
  operationalReviewInput,
  options = {},
) {
  const context = buildJoinContext(p5ReviewInput, operationalReviewInput);
  const lifecycleApi = options.lifecycleApi || defaultLifecycleApi;
  const schedulerApi = options.schedulerApi || defaultSchedulerApi;
  check(typeof lifecycleApi.createResourceLifecycleRuntime === "function",
    "lifecycleApi must expose createResourceLifecycleRuntime");
  for (const method of ["createState", "enqueueTask", "scheduleTask", "handoffTask", "normalizeState"]) {
    check(typeof schedulerApi[method] === "function", `schedulerApi must expose ${method}`);
  }
  const lifecycle = lifecycleApi.createResourceLifecycleRuntime({
    resourceCatalog: context.resourceCatalog,
    lifecycleCatalog: context.lifecycleCatalog,
    operationalPolicies: context.policies,
    resourceCrosswalk: context.resourceCrosswalk,
  });
  for (const method of ["normalizeState", "snapshot", "execute"]) {
    check(typeof lifecycle[method] === "function", `lifecycle runtime must expose ${method}`);
  }

  function getTaskTemplate(kind, sourceId) {
    return deepFreeze(clone(taskTemplate(context, kind, sourceId)));
  }

  function createTask(input) {
    checkObject(input, "task input");
    const allowed = new Set(["kind", "sourceId", "taskId", "queuedAt", "fatigue", "patientId", "ownerId"]);
    for (const key of Object.keys(input)) check(allowed.has(key), `task input contains forbidden field ${key}`);
    const template = taskTemplate(context, input.kind, input.sourceId);
    checkString(input.taskId, "taskId");
    checkMinute(input.queuedAt, "queuedAt");
    checkExactKeys(input.fatigue, ["percent", "durationMultiplier"], "fatigue");
    const fatiguePercent = checkPercentage(input.fatigue.percent, "fatigue.percent");
    const fatigueBand = context.fatigueBands.find((band) =>
      band.minimum <= fatiguePercent && fatiguePercent <= band.maximum);
    check(fatigueBand, `fatigue.percent ${fatiguePercent} has no exact authored band`);
    const fatigueMultiplier = checkPositiveNumber(
      input.fatigue.durationMultiplier,
      "fatigue.durationMultiplier",
    );
    check(fatigueMultiplier === fatigueBand.durationMultiplier,
      `fatigue duration multiplier ${fatigueMultiplier} differs from authored band `
        + `${fatigueBand.minimum}-${fatigueBand.maximum}`);
    const task = {
      id: input.taskId,
      queuedAt: input.queuedAt,
      priority: template.runtimeTemplate.priority,
      authoredDurationMinutes: template.runtimeTemplate.authoredDurationMinutes,
      fatigue: {
        percent: fatiguePercent,
        durationMultiplier: fatigueBand.durationMultiplier,
      },
      requirementGroups: clone(template.runtimeTemplate.requirementGroups),
      urgency: template.runtimeTemplate.urgency,
      safeRouteRequired: template.runtimeTemplate.safeRouteRequired,
      sourceType: template.sourceType,
      sourceId: template.sourceId,
    };
    if (input.patientId !== undefined) task.patientId = checkString(input.patientId, "patientId");
    if (input.ownerId !== undefined) task.ownerId = checkString(input.ownerId, "ownerId");
    return deepFreeze(task);
  }

  function createSchedulerState(lifecycleState, horizon) {
    return schedulerApi.createState(lifecycle.projectSchedulerResources(lifecycleState, horizon));
  }

  function normalizeAtomicHorizon(value) {
    checkExactKeys(value, ["startAt", "endAt"], "atomic state horizon");
    const startAt = checkMinute(value.startAt, "atomic state horizon.startAt");
    const endAt = checkMinute(value.endAt, "atomic state horizon.endAt");
    check(endAt > startAt, "atomic state horizon must be non-empty");
    return { startAt, endAt };
  }

  function normalizeStaffAbsenceCommandPayload(value, label) {
    checkExactKeys(value, [
      "authorityId",
      "staffId",
      "absenceTypeId",
      "triggerAuthority",
      "recordedAt",
      "startAt",
      "endAt",
    ], label);
    const authorityId = checkString(value.authorityId, `${label}.authorityId`);
    const staffId = checkString(value.staffId, `${label}.staffId`);
    check(context.resourcesById.get(staffId)?.resourceKind === "staff",
      `${label}.staffId must reference exact P5 staff`);
    const absenceTypeId = checkString(value.absenceTypeId, `${label}.absenceTypeId`);
    const policy = context.absencePolicyById.get(absenceTypeId);
    check(policy, `${label}.absenceTypeId references unknown P5 absence policy`);
    const triggerAuthority = checkString(value.triggerAuthority, `${label}.triggerAuthority`);
    check(triggerAuthority === policy.triggerAuthority,
      `${label}.triggerAuthority differs from exact P5 policy`);
    const recordedAt = checkMinute(value.recordedAt, `${label}.recordedAt`);
    const startAt = checkMinute(value.startAt, `${label}.startAt`);
    const endAt = checkMinute(value.endAt, `${label}.endAt`);
    check(endAt > startAt, `${label} interval must be non-empty`);
    check(startAt - recordedAt >= policy.noticeMinutes,
      `${label} violates exact P5 absence notice`);
    const duration = endAt - startAt;
    check(duration >= policy.durationMinutes[0] && duration <= policy.durationMinutes[1],
      `${label} duration differs from exact P5 absence policy`);
    return {
      authorityId,
      staffId,
      absenceTypeId,
      triggerAuthority,
      recordedAt,
      startAt,
      endAt,
    };
  }

  function absenceWindowFromCommand(entry) {
    return {
      staffId: entry.payload.staffId,
      absenceTypeId: entry.payload.absenceTypeId,
      triggerAuthority: entry.payload.triggerAuthority,
      startAt: entry.payload.startAt,
      endAt: entry.payload.endAt,
    };
  }

  function absenceWindowsFromAdapterCommands(entries) {
    return entries.filter((entry) => entry.type === "record_staff_absence")
      .map(absenceWindowFromCommand)
      .sort((left, right) => left.startAt - right.startAt
        || left.endAt - right.endAt
        || left.staffId.localeCompare(right.staffId, "en")
      || left.absenceTypeId.localeCompare(right.absenceTypeId, "en"));
  }

  function normalizeAtomicHandoffPayload(value, label) {
    checkExactKeys(value, ["taskId", "at", "reassignments"], label);
    checkArray(value.reassignments, `${label}.reassignments`);
    check(value.reassignments.length > 0, `${label}.reassignments must not be empty`);
    const reassignments = value.reassignments.map((entry, index) => {
      const itemLabel = `${label}.reassignments[${index}]`;
      checkExactKeys(entry, [
        "groupId",
        "fromResourceId",
        "toResourceId",
        "capabilityId",
        "units",
      ], itemLabel);
      const normalized = {
        groupId: checkString(entry.groupId, `${itemLabel}.groupId`),
        fromResourceId: checkString(entry.fromResourceId, `${itemLabel}.fromResourceId`),
        toResourceId: checkString(entry.toResourceId, `${itemLabel}.toResourceId`),
        capabilityId: checkString(entry.capabilityId, `${itemLabel}.capabilityId`),
        units: checkPositiveInteger(entry.units, `${itemLabel}.units`),
      };
      check(normalized.fromResourceId !== normalized.toResourceId,
        `${itemLabel} must change resource ownership`);
      return normalized;
    }).sort((left, right) => left.groupId.localeCompare(right.groupId, "en"));
    check(new Set(reassignments.map((entry) => entry.groupId)).size === reassignments.length,
      `${label}.reassignments contains duplicate requirement groups`);
    return {
      taskId: checkString(value.taskId, `${label}.taskId`),
      at: checkMinute(value.at, `${label}.at`),
      reassignments,
    };
  }

  function normalizeAdapterCommands(value) {
    checkArray(value, "atomic state adapterCommands");
    const seen = new Set();
    const normalized = value.map((entry, index) => {
      checkExactKeys(
        entry,
        ["commandId", "type", "payload", "fingerprint"],
        `atomic state adapterCommands[${index}]`,
      );
      const commandId = checkString(entry.commandId, `atomic state adapterCommands[${index}].commandId`);
      check(!seen.has(commandId), `atomic state contains duplicate adapter command ${commandId}`);
      seen.add(commandId);
      check([
        "extend_horizon",
        "blocked_schedule",
        "no_ready_schedule",
        "handoff_receipt",
        "record_staff_absence",
      ].includes(entry.type),
        `atomic state adapterCommands[${index}] has unsupported type ${entry.type}`);
      let payload;
      if (entry.type === "extend_horizon") {
        checkExactKeys(entry.payload, ["horizon"], `atomic state adapterCommands[${index}].payload`);
        payload = { horizon: normalizeAtomicHorizon(entry.payload.horizon) };
      } else if (entry.type === "blocked_schedule") {
        checkExactKeys(entry.payload, [
          "at",
          "taskId",
          "reasonCode",
          "safeRouteRequired",
          "safeRouteId",
          "schedulerCommandApplied",
        ], `atomic state adapterCommands[${index}].payload`);
        payload = {
          at: checkMinute(entry.payload.at, `atomic state adapterCommands[${index}].payload.at`),
          taskId: checkString(
            entry.payload.taskId,
            `atomic state adapterCommands[${index}].payload.taskId`,
          ),
          reasonCode: checkString(
            entry.payload.reasonCode,
            `atomic state adapterCommands[${index}].payload.reasonCode`,
          ),
          safeRouteRequired: entry.payload.safeRouteRequired,
          safeRouteId: entry.payload.safeRouteId,
          schedulerCommandApplied: entry.payload.schedulerCommandApplied,
        };
        check(typeof payload.safeRouteRequired === "boolean",
          `atomic state adapterCommands[${index}].payload.safeRouteRequired must be boolean`);
        check(BLOCKED_SCHEDULE_REASON_CODES.has(payload.reasonCode),
          `atomic state adapterCommands[${index}].payload.reasonCode is not an exact blocked outcome`);
        check(payload.safeRouteId === null || (typeof payload.safeRouteId === "string"
          && payload.safeRouteId.trim()),
        `atomic state adapterCommands[${index}].payload.safeRouteId must be null or a non-empty string`);
        check(typeof payload.schedulerCommandApplied === "boolean",
          `atomic state adapterCommands[${index}].payload.schedulerCommandApplied must be boolean`);
      } else if (entry.type === "no_ready_schedule") {
        checkExactKeys(
          entry.payload,
          ["at", "reasonCode"],
          `atomic state adapterCommands[${index}].payload`,
        );
        payload = {
          at: checkMinute(entry.payload.at, `atomic state adapterCommands[${index}].payload.at`),
          reasonCode: entry.payload.reasonCode,
        };
        check(payload.reasonCode === "no_ready_task",
          `atomic state adapterCommands[${index}].payload.reasonCode must be no_ready_task`);
      } else if (entry.type === "handoff_receipt") {
        payload = normalizeAtomicHandoffPayload(
          entry.payload,
          `atomic state adapterCommands[${index}].payload`,
        );
      } else {
        payload = normalizeStaffAbsenceCommandPayload(
          entry.payload,
          `atomic state adapterCommands[${index}].payload`,
        );
      }
      const fingerprint = adapterFingerprint({ type: entry.type, payload });
      check(entry.fingerprint === fingerprint,
        `atomic state adapter command ${commandId} fingerprint mismatch`);
      return { commandId, type: entry.type, payload, fingerprint };
    });
    const authorityIds = new Set();
    for (const entry of normalized.filter((record) => record.type === "record_staff_absence")) {
      check(!authorityIds.has(entry.payload.authorityId),
        `atomic state contains duplicate staff absence authority ${entry.payload.authorityId}`);
      authorityIds.add(entry.payload.authorityId);
    }
    return normalized;
  }

  function projectedSchedulerResources(lifecycleState, horizon, schedulerState = null, adapterCommands = []) {
    const absenceWindows = absenceWindowsFromAdapterCommands(adapterCommands);
    const availabilityAuthority = schedulerState === null && absenceWindows.length === 0
      ? undefined
      : {
        schedulerState,
        absenceWindows,
      };
    return schedulerApi.createState(
      lifecycle.projectSchedulerResources(lifecycleState, horizon, availabilityAuthority),
    ).resources;
  }

  function normalizeAtomicState(value) {
    checkExactKeys(
      value,
      [
        "schemaVersion",
        "adapterVersion",
        "horizon",
        "lifecycleState",
        "schedulerState",
        "adapterCommands",
      ],
      "P5 atomic state",
    );
    check(value.schemaVersion === P5_AUTHORING_ATOMIC_STATE_SCHEMA_VERSION,
      "P5 atomic state schemaVersion mismatch");
    check(value.adapterVersion === P5_AUTHORING_REVIEW_ADAPTER_V2_VERSION,
      "P5 atomic state adapterVersion mismatch");
    const horizon = normalizeAtomicHorizon(value.horizon);
    const lifecycleState = lifecycle.normalizeState(value.lifecycleState);
    const schedulerState = schedulerApi.normalizeState(value.schedulerState);
    for (const task of schedulerState.tasks) {
      check(horizon.startAt <= task.queuedAt && task.queuedAt < horizon.endAt,
        `atomic task ${task.id} queuedAt is outside the persisted horizon`);
      if (task.startAt !== undefined || task.endAt !== undefined) {
        check(horizon.startAt <= task.startAt && task.endAt <= horizon.endAt,
          `atomic task ${task.id} active interval is outside the persisted horizon`);
      }
    }
    for (const reservation of schedulerState.reservations) {
      check(horizon.startAt <= reservation.startAt && reservation.endAt <= horizon.endAt,
        `atomic reservation for ${reservation.taskId} is outside the persisted horizon`);
    }
    const adapterCommands = normalizeAdapterCommands(value.adapterCommands);
    const lifecycleCommandIds = new Set(
      lifecycleState.commands.map((entry) => entry.payload.commandId),
    );
    const schedulerCommandIds = new Set(schedulerState.appliedCommandIds);
    const schedulerFingerprintIds = Object.keys(schedulerState.commandFingerprints || {});
    check(sameStrings(schedulerFingerprintIds, schedulerState.appliedCommandIds),
      "atomic scheduler command fingerprints must cover every applied command exactly");
    for (const [commandId, fingerprint] of Object.entries(
      schedulerState.commandFingerprints || {},
    )) {
      const commandType = fingerprint.slice(0, fingerprint.indexOf(":"));
      const transitions = schedulerState.tasks.flatMap((task) => task.history.filter((history) =>
        history.commandId === commandId));
      const matchingTransitions = transitions.filter((history) => {
        if (commandType === "enqueue") return history.from === null && history.to === "queued";
        if (commandType === "schedule") return history.from === "queued" && history.to === "active";
        if (commandType === "cancel") {
          return ["queued", "active"].includes(history.from) && history.to === "cancelled";
        }
        if (commandType === "complete") {
          return history.from === "active" && history.to === "completed";
        }
        return false;
      });
      check(["enqueue", "schedule", "cancel", "complete"].includes(commandType),
        `atomic scheduler command ${commandId} has unsupported durable type ${commandType}`);
      check(transitions.length === 1 && matchingTransitions.length === 1,
        `atomic scheduler ${commandType} ${commandId} must own exactly one matching task transition`);
    }
    for (const commandId of lifecycleCommandIds) {
      check(!schedulerCommandIds.has(commandId),
        `atomic command ${commandId} is bound to both lifecycle and scheduler ledgers`);
    }
    for (const entry of adapterCommands) {
      check(!lifecycleCommandIds.has(entry.commandId),
        `atomic command ${entry.commandId} is bound to both lifecycle and adapter ledgers`);
      const schedulerAlsoApplied = schedulerCommandIds.has(entry.commandId);
      check(!schedulerAlsoApplied,
      `atomic command ${entry.commandId} is bound to incompatible scheduler and adapter effects`);
    }
    const expectedResources = projectedSchedulerResources(
      lifecycleState,
      horizon,
      schedulerState,
      adapterCommands,
    );
    check(sameCanonical(schedulerState.resources, expectedResources),
      "atomic scheduler resources differ from the exact lifecycle projection");
    for (const task of schedulerState.tasks) exactTemplateForSchedulerTask(task);
    for (const task of schedulerState.tasks.filter((record) =>
      record.history.some((entry) => entry.to === "active"))) {
      validateTaskExecutionEvidence(
        lifecycleState,
        schedulerState,
        task.id,
        adapterCommands,
      );
    }
    validateAtomicInventoryAndProtocolLedger(lifecycleState, schedulerState);
    const horizonCommands = adapterCommands.filter((entry) => entry.type === "extend_horizon");
    for (let index = 1; index < horizonCommands.length; index += 1) {
      const previous = horizonCommands[index - 1].payload.horizon;
      const current = horizonCommands[index].payload.horizon;
      check(current.startAt === previous.startAt && current.endAt > previous.endAt,
        "atomic horizon command history is not a strict extension chain");
    }
    if (horizonCommands.length > 0) {
      check(sameCanonical(
        horizonCommands[horizonCommands.length - 1].payload.horizon,
        horizon,
      ), "atomic state horizon differs from its last extension command");
    }
    for (const entry of adapterCommands.filter((record) => record.type === "blocked_schedule")) {
      check(horizon.startAt <= entry.payload.at && entry.payload.at < horizon.endAt,
        `blocked schedule ${entry.commandId} is outside the persisted horizon`);
      const task = schedulerState.tasks.find((record) => record.id === entry.payload.taskId);
      check(task,
        `blocked schedule ${entry.commandId} must reference a persisted task`);
      const safeRouteId = safeRouteIdForBlockedTask(task);
      check(entry.payload.safeRouteId === safeRouteId,
        `blocked schedule ${entry.commandId} safe route differs from exact task authority`);
      check(entry.payload.safeRouteRequired === true,
        `blocked schedule ${entry.commandId} safe-route requirement differs from exact task authority`);
      check(schedulerState.appliedCommandIds.includes(entry.commandId)
        === entry.payload.schedulerCommandApplied,
      `blocked schedule ${entry.commandId} scheduler receipt mismatch`);
      check(entry.payload.schedulerCommandApplied === false,
        `blocked schedule ${entry.commandId} must be owned only by the adapter ledger`);
      check(ADAPTER_ONLY_BLOCKED_REASON_CODES.has(entry.payload.reasonCode),
        `blocked schedule ${entry.commandId} reason is incompatible with adapter-only ownership`);
    }
    for (const entry of adapterCommands.filter((record) => record.type === "no_ready_schedule")) {
      check(horizon.startAt <= entry.payload.at && entry.payload.at < horizon.endAt,
        `no-ready schedule ${entry.commandId} is outside the persisted horizon`);
    }
    const claimedHandoffSegments = new Set();
    for (const entry of adapterCommands.filter((record) => record.type === "handoff_receipt")) {
      const task = schedulerState.tasks.find((record) => record.id === entry.payload.taskId);
      check(task, `handoff receipt ${entry.commandId} references an unknown task`);
      check(task.history.some((history) => history.to === "active"),
        `handoff receipt ${entry.commandId} references a task that never became active`);
      check(task.startAt < entry.payload.at && entry.payload.at < task.endAt,
        `handoff receipt ${entry.commandId} minute is outside the task interior`);
      validateHandoffPoint(task, resolveTaskPolicy(task), entry.payload.at);
      for (const reassignment of entry.payload.reassignments) {
        const segmentKey = `${task.id}\u0000${reassignment.groupId}\u0000${entry.payload.at}`;
        check(!claimedHandoffSegments.has(segmentKey),
          `handoff receipt ${entry.commandId} duplicates a persisted ownership cut`);
        claimedHandoffSegments.add(segmentKey);
        const fromSegments = schedulerState.reservations.filter((reservation) =>
          reservation.taskId === task.id
          && reservation.groupId === reassignment.groupId
          && reservation.resourceId === reassignment.fromResourceId
          && reservation.capabilityId === reassignment.capabilityId
          && reservation.units === reassignment.units
          && reservation.endAt === entry.payload.at);
        const toSegments = schedulerState.reservations.filter((reservation) =>
          reservation.taskId === task.id
          && reservation.groupId === reassignment.groupId
          && reservation.resourceId === reassignment.toResourceId
          && reservation.capabilityId === reassignment.capabilityId
          && reservation.units === reassignment.units
          && reservation.startAt === entry.payload.at);
        check(fromSegments.length === 1 && toSegments.length === 1,
          `handoff receipt ${entry.commandId} differs from persisted reservation ownership`);
      }
    }
    const persistedHandoffSegments = new Set();
    for (const task of schedulerState.tasks) {
      for (const group of task.requirementGroups) {
        const segments = schedulerState.reservations.filter((reservation) =>
          reservation.taskId === task.id && reservation.groupId === group.id)
          .slice()
          .sort((left, right) => left.startAt - right.startAt || left.endAt - right.endAt);
        for (let index = 1; index < segments.length; index += 1) {
          const previous = segments[index - 1];
          const current = segments[index];
          if (previous.resourceId === current.resourceId
            && previous.capabilityId === current.capabilityId
            && previous.units === current.units) continue;
          persistedHandoffSegments.add(`${task.id}\u0000${group.id}\u0000${current.startAt}`);
        }
      }
    }
    check(sameStrings([...claimedHandoffSegments], [...persistedHandoffSegments]),
      "atomic reservation ownership cuts differ from exact handoff receipts");
    for (const entry of adapterCommands.filter((record) => record.type === "record_staff_absence")) {
      check(horizon.startAt <= entry.payload.recordedAt
        && entry.payload.recordedAt <= entry.payload.startAt
        && entry.payload.endAt <= horizon.endAt,
      `staff absence ${entry.commandId} is outside the persisted horizon`);
    }
    return {
      schemaVersion: P5_AUTHORING_ATOMIC_STATE_SCHEMA_VERSION,
      adapterVersion: P5_AUTHORING_REVIEW_ADAPTER_V2_VERSION,
      horizon,
      lifecycleState,
      schedulerState,
      adapterCommands,
    };
  }

  function createAtomicState(lifecycleState, horizon) {
    const normalizedLifecycle = lifecycle.normalizeState(lifecycleState);
    const normalizedHorizon = normalizeAtomicHorizon(horizon);
    return normalizeAtomicState({
      schemaVersion: P5_AUTHORING_ATOMIC_STATE_SCHEMA_VERSION,
      adapterVersion: P5_AUTHORING_REVIEW_ADAPTER_V2_VERSION,
      horizon: normalizedHorizon,
      lifecycleState: normalizedLifecycle,
      schedulerState: schedulerApi.createState(
        lifecycle.projectSchedulerResources(normalizedLifecycle, normalizedHorizon),
      ),
      adapterCommands: [],
    });
  }

  function serializeAtomicState(state) {
    return JSON.stringify(normalizeAtomicState(state));
  }

  function deserializeAtomicState(serialized) {
    check(typeof serialized === "string" && serialized.trim(),
      "serialized P5 atomic state must be non-empty JSON");
    let parsed;
    try {
      parsed = JSON.parse(serialized);
    } catch (error) {
      fail(`cannot parse serialized P5 atomic state: ${error.message}`);
    }
    return normalizeAtomicState(parsed);
  }

  function reconcileSchedulerState(lifecycleState, schedulerState, horizon, adapterCommands = []) {
    const normalizedLifecycle = lifecycle.normalizeState(lifecycleState);
    const normalizedScheduler = schedulerApi.normalizeState(schedulerState);
    const normalizedHorizon = normalizeAtomicHorizon(horizon);
    const candidate = {
      ...clone(normalizedScheduler),
      resources: projectedSchedulerResources(
        normalizedLifecycle,
        normalizedHorizon,
        normalizedScheduler,
        adapterCommands,
      ),
    };
    try {
      return schedulerApi.normalizeState(candidate);
    } catch (error) {
      fail(`lifecycle and scheduler cannot reconcile atomically: ${error.message}`);
    }
  }

  function assertAtomicCommandNamespace(state, commandId, targetLedger) {
    const inLifecycle = state.lifecycleState.commands.some((entry) =>
      entry.payload.commandId === commandId);
    const inScheduler = state.schedulerState.appliedCommandIds.includes(commandId);
    const adapterEntry = state.adapterCommands.find((entry) => entry.commandId === commandId);
    if (targetLedger !== "lifecycle") {
      check(!inLifecycle,
        `atomic command ${commandId} is already bound to the lifecycle ledger`);
    }
    if (targetLedger !== "scheduler") {
      check(!inScheduler,
        `atomic command ${commandId} is already bound to the scheduler ledger`);
    }
    if (targetLedger !== "adapter") {
      check(!adapterEntry,
        `atomic command ${commandId} is already bound to the adapter ledger`);
    }
  }

  function applyLifecycleCommandAtomic(stateValue, transaction) {
    const state = normalizeAtomicState(stateValue);
    checkExactKeys(
      transaction,
      ["command", "payload", "currentMinute", "authorityContext"],
      "atomic lifecycle transaction",
    );
    const command = checkString(transaction.command, "atomic lifecycle transaction.command");
    check(command !== "consume_stock",
      "consume_stock is task-derived authority and cannot use the generic atomic lifecycle path");
    const currentMinute = checkMinute(
      transaction.currentMinute,
      "atomic lifecycle transaction.currentMinute",
    );
    check(state.horizon.startAt <= currentMinute && currentMinute < state.horizon.endAt,
      "atomic lifecycle transaction currentMinute is outside its persisted horizon");
    const commandId = checkString(
      transaction.payload?.commandId,
      "atomic lifecycle transaction.payload.commandId",
    );
    assertAtomicCommandNamespace(state, commandId, "lifecycle");
    const authorityContext = clone(checkObject(
      transaction.authorityContext,
      "atomic lifecycle transaction.authorityContext",
    ));
    for (const forbidden of ["currentMinute", "schedulerState", "reservations", "stockReservation"]) {
      check(!(forbidden in authorityContext),
        `atomic lifecycle authorityContext cannot override ${forbidden}`);
    }
    const lifecycleResult = lifecycle.execute(
      state.lifecycleState,
      command,
      transaction.payload,
      {
        ...authorityContext,
        currentMinute,
        schedulerState: state.schedulerState,
      },
    );
    const schedulerState = reconcileSchedulerState(
      lifecycleResult.state,
      state.schedulerState,
      state.horizon,
      state.adapterCommands,
    );
    const next = normalizeAtomicState({
      ...state,
      lifecycleState: lifecycleResult.state,
      schedulerState,
    });
    return {
      state: next,
      command: clone(lifecycleResult.command),
      snapshot: clone(lifecycleResult.snapshot),
      idempotent: lifecycleResult.idempotent,
    };
  }

  function extendAtomicHorizon(stateValue, command) {
    const state = normalizeAtomicState(stateValue);
    checkExactKeys(command, ["commandId", "horizon"], "extend atomic horizon command");
    const commandId = checkString(command.commandId, "extend atomic horizon command.commandId");
    const horizon = normalizeAtomicHorizon(command.horizon);
    const payload = { horizon };
    const fingerprint = adapterFingerprint({ type: "extend_horizon", payload });
    const previous = state.adapterCommands.find((entry) => entry.commandId === commandId);
    if (previous) {
      check(previous.type === "extend_horizon" && previous.fingerprint === fingerprint
        && sameCanonical(previous.payload, payload),
      `adapter command ${commandId} was already applied with different content`);
      return { state: clone(state), idempotent: true };
    }
    assertAtomicCommandNamespace(state, commandId, "adapter");
    check(horizon.startAt === state.horizon.startAt && horizon.endAt > state.horizon.endAt,
      "atomic horizon extension must preserve startAt and increase endAt");
    const schedulerState = reconcileSchedulerState(
      state.lifecycleState,
      state.schedulerState,
      horizon,
      state.adapterCommands,
    );
    const next = normalizeAtomicState({
      ...state,
      horizon,
      schedulerState,
      adapterCommands: [...state.adapterCommands, {
        commandId,
        type: "extend_horizon",
        payload,
        fingerprint,
      }],
    });
    return { state: next, idempotent: false };
  }

  function recordStaffAbsenceAtomic(stateValue, command) {
    const state = normalizeAtomicState(stateValue);
    checkObject(command, "record staff absence command");
    const commandId = checkString(command.commandId, "record staff absence command.commandId");
    const payloadInput = clone(command);
    delete payloadInput.commandId;
    const payload = normalizeStaffAbsenceCommandPayload(
      payloadInput,
      "record staff absence command",
    );
    const fingerprint = adapterFingerprint({ type: "record_staff_absence", payload });
    const previous = state.adapterCommands.find((entry) => entry.commandId === commandId);
    if (previous) {
      check(previous.type === "record_staff_absence"
        && previous.fingerprint === fingerprint
        && sameCanonical(previous.payload, payload),
      `adapter command ${commandId} was already applied with different content`);
      return {
        state: clone(state),
        absenceWindow: absenceWindowFromCommand(previous),
        idempotent: true,
      };
    }
    check(!state.adapterCommands.some((entry) =>
      entry.type === "record_staff_absence"
      && entry.payload.authorityId === payload.authorityId),
    `staff absence authority ${payload.authorityId} is already bound to another command`);
    assertAtomicCommandNamespace(state, commandId, "adapter");
    const adapterCommands = [...state.adapterCommands, {
      commandId,
      type: "record_staff_absence",
      payload,
      fingerprint,
    }];
    const schedulerState = reconcileSchedulerState(
      state.lifecycleState,
      state.schedulerState,
      state.horizon,
      adapterCommands,
    );
    const next = normalizeAtomicState({
      ...state,
      schedulerState,
      adapterCommands,
    });
    return {
      state: next,
      absenceWindow: absenceWindowFromCommand(adapterCommands[adapterCommands.length - 1]),
      idempotent: false,
    };
  }

  function getAtomicStaffSnapshot(stateValue, at) {
    const state = normalizeAtomicState(stateValue);
    const minute = checkMinute(at, "atomic staff snapshot minute");
    check(state.horizon.startAt <= minute && minute < state.horizon.endAt,
      "atomic staff snapshot minute is outside its persisted horizon");
    return deepFreeze(lifecycle.snapshot(state.lifecycleState, minute, {
      schedulerState: state.schedulerState,
      absenceWindows: absenceWindowsFromAdapterCommands(state.adapterCommands),
    }));
  }

  function enqueueExactTask(schedulerState, command) {
    checkObject(command, "enqueue exact task command");
    checkString(command.commandId, "enqueue commandId");
    return schedulerApi.enqueueTask(schedulerState, {
      commandId: command.commandId,
      task: createTask(command.task),
    });
  }

  function exactTemplateForSchedulerTask(task) {
    let kind;
    if (task.sourceType === "visit_stage") kind = "visit";
    else if (task.sourceType === "research_usage") kind = "usage";
    else if (task.sourceType === "research") kind = "research";
    else if (task.sourceType === "capability") kind = "capability";
    else fail(`task ${task.id} has unsupported sourceType ${task.sourceType}`);
    const template = taskTemplate(context, kind, task.sourceId);
    check(task.priority === template.runtimeTemplate.priority,
      `task ${task.id} priority differs from exact P5 template`);
    check(task.authoredDurationMinutes === template.runtimeTemplate.authoredDurationMinutes,
      `task ${task.id} duration differs from exact P5 template`);
    const fatiguePercent = checkPercentage(task.fatigue?.percent, `task ${task.id} fatigue.percent`);
    const fatigueBand = context.fatigueBands.find((band) =>
      band.minimum <= fatiguePercent && fatiguePercent <= band.maximum);
    check(fatigueBand, `task ${task.id} fatigue.percent ${fatiguePercent} has no exact authored band`);
    check(task.fatigue.durationMultiplier === fatigueBand.durationMultiplier,
      `task ${task.id} fatigue multiplier differs from exact authored band`);
    const expectedScheduledDuration = Math.max(
      1,
      Math.ceil(task.authoredDurationMinutes * fatigueBand.durationMultiplier),
    );
    check(task.scheduledDurationMinutes === expectedScheduledDuration,
      `task ${task.id} scheduled duration differs from exact authored fatigue band`);
    check(sameCanonical(
      sortedRequirementGroups(task.requirementGroups),
      sortedRequirementGroups(template.runtimeTemplate.requirementGroups),
    ),
      `task ${task.id} resource requirements differ from exact P5 template`);
    check(task.urgency === template.runtimeTemplate.urgency,
      `task ${task.id} urgency differs from exact P5 template`);
    check(task.safeRouteRequired === template.runtimeTemplate.safeRouteRequired,
      `task ${task.id} safe-route contract differs from exact P5 template`);
    return template;
  }

  function executionContractForTask(task) {
    const template = exactTemplateForSchedulerTask(task);
    return deepFreeze({
      safeRouteId: template.safeRouteId,
      protocolCapabilityIds: clone(template.protocolCapabilityIds),
      statePredicates: clone(template.statePredicates),
      reservationPredicateGaps: reservationPredicateGapsForTemplate(template),
    });
  }

  function reservationPredicateGapsForTemplate(template) {
    const groups = template.runtimeTemplate.requirementGroups;
    const gaps = [];
    const recordGap = (entry, resourceKind, eligibleResourceIds) => {
      const eligible = new Set(eligibleResourceIds);
      const guaranteedByGroup = groups.some((group) => group.anyOf.length > 0
        && group.anyOf.every((alternative) => eligible.has(alternative.resourceId)));
      if (!guaranteedByGroup) {
        gaps.push({
          capabilityId: entry.capabilityId,
          predicate: entry.predicate.predicate,
          resourceKind,
          eligibleResourceIds: sortedStrings(eligibleResourceIds),
        });
      }
    };
    for (const entry of template.statePredicates) {
      const predicate = entry.predicate;
      if (["resource_owned", "delivery_complete", "training_complete", "maintenance_current"]
        .includes(predicate.predicate)) {
        recordGap(entry, "equipment", [predicate.resourceId]);
      } else if (predicate.predicate === "qualified_staff_scheduled") {
        recordGap(entry, "staff", predicate.eligibleStaffIds);
      } else if (predicate.predicate === "ready_room_available") {
        recordGap(entry, "room", predicate.eligibleRoomIds);
      } else if (predicate.predicate === "referral_coordination_slot_available") {
        recordGap(entry, "staff", predicate.eligibleStaffIds);
        recordGap(entry, "room", predicate.eligibleRoomIds);
      }
    }
    return clone(gaps);
  }

  function auditReservationPredicateAuthority() {
    const specifications = [
      ...[...context.visitById.keys()].map((sourceId) => ({ kind: "visit", sourceId })),
      ...[...context.researchById.keys()].map((sourceId) => ({ kind: "research", sourceId })),
      ...[...context.usageById.keys()].map((sourceId) => ({ kind: "usage", sourceId })),
      ...[...context.capabilityById.values()]
        .filter((record) => TASK_BEARING_MODES.has(record.executionMode))
        .map((record) => ({ kind: "capability", sourceId: record.capabilityId })),
    ];
    const findings = specifications.flatMap(({ kind, sourceId }) => {
      const template = taskTemplate(context, kind, sourceId);
      return reservationPredicateGapsForTemplate(template).map((gap) => ({
        kind,
        sourceId,
        ...gap,
      }));
    }).sort((left, right) => left.kind.localeCompare(right.kind, "en")
      || left.sourceId.localeCompare(right.sourceId, "en")
      || left.capabilityId.localeCompare(right.capabilityId, "en")
      || left.resourceKind.localeCompare(right.resourceKind, "en"));
    return deepFreeze({
      taskTemplatesAudited: specifications.length,
      affectedTaskTemplates: new Set(findings.map((finding) =>
        `${finding.kind}:${finding.sourceId}`)).size,
      gapCount: findings.length,
      findings,
    });
  }

  function missingReservationPredicateEvidence(schedulerState, taskId) {
    const normalized = schedulerApi.normalizeState(schedulerState);
    const task = normalized.tasks.find((record) => record.id === taskId);
    check(task, `unknown reservation-predicate task ${taskId}`);
    const template = exactTemplateForSchedulerTask(task);
    const reservations = normalized.reservations.filter((record) => record.taskId === taskId);
    return reservationPredicateGapsForTemplate(template).filter((gap) =>
      !reservations.some((reservation) => gap.eligibleResourceIds.includes(reservation.resourceId)));
  }

  function unresolvedProtocolCapabilityIds(task, template = exactTemplateForSchedulerTask(task)) {
    return template.protocolCapabilityIds.filter((capabilityId) =>
      !(task.sourceType === "capability" && capabilityId === task.sourceId));
  }

  function safeRouteIdForBlockedTask(task) {
    const contract = executionContractForTask(task);
    return contract.safeRouteId || checkString(
      context.policies.urgentOvercapacity?.safeRouteId,
      "global fail-safe referral route",
    );
  }

  function getTaskExecutionContract(schedulerState, taskId) {
    checkString(taskId, "execution-contract taskId");
    const normalized = schedulerApi.normalizeState(schedulerState);
    const task = normalized.tasks.find((record) => record.id === taskId);
    check(task, `unknown execution-contract task ${taskId}`);
    return executionContractForTask(task);
  }

  function validateSchedulerResourceProjection(
    lifecycleState,
    schedulerState,
    startAt,
    endAt,
    adapterCommands = [],
  ) {
    const normalized = schedulerApi.normalizeState(schedulerState);
    const expectedResources = projectedSchedulerResources(
      lifecycleState,
      { startAt, endAt },
      normalized,
      adapterCommands,
    );
    const clippedWindows = (windows) => {
      const clipped = windows.map((window) => ({
        startAt: Math.max(startAt, window.startAt),
        endAt: Math.min(endAt, window.endAt),
      })).filter((window) => window.endAt > window.startAt)
        .sort((left, right) => left.startAt - right.startAt || left.endAt - right.endAt);
      const merged = [];
      for (const window of clipped) {
        const previous = merged[merged.length - 1];
        if (!previous || previous.endAt < window.startAt) merged.push({ ...window });
        else previous.endAt = Math.max(previous.endAt, window.endAt);
      }
      return merged;
    };
    for (const [resourceId, expected] of Object.entries(expectedResources)) {
      const actual = normalized.resources[resourceId];
      check(actual, `scheduler is missing lifecycle resource ${resourceId}`);
      check(actual.capacity === expected.capacity && sameStrings(actual.capabilities, expected.capabilities),
        `scheduler resource ${resourceId} differs from exact P5 catalog`);
      check(sameCanonical(
        clippedWindows(actual.unavailableWindows),
        clippedWindows(expected.unavailableWindows),
      ), `scheduler resource ${resourceId} is stale relative to lifecycle unavailability`);
    }
    return normalized;
  }

  function validateTaskExecutionEvidence(
    lifecycleState,
    schedulerState,
    taskId,
    adapterCommands = [],
  ) {
    checkString(taskId, "execution-evidence taskId");
    const normalized = schedulerApi.normalizeState(schedulerState);
    const task = normalized.tasks.find((record) => record.id === taskId);
    check(task, `unknown execution-evidence task ${taskId}`);
    check(task.history.some((entry) => entry.to === "active"),
      `task ${taskId} has no active scheduler reservation`);
    validateSchedulerResourceProjection(
      lifecycleState,
      normalized,
      task.startAt,
      task.endAt,
      adapterCommands,
    );
    const template = exactTemplateForSchedulerTask(task);
    const snapshot = lifecycle.snapshot(lifecycleState, task.startAt);
    const reservations = normalized.reservations.filter((reservation) => reservation.taskId === taskId);
    for (const entry of template.statePredicates) {
      const predicate = entry.predicate;
      if (predicate.predicate === "inventory_units_gte") continue;
      if (["resource_owned", "delivery_complete", "training_complete", "maintenance_current"]
        .includes(predicate.predicate)) {
        const resource = snapshot.resources[predicate.resourceId];
        check(resource, `${taskId} predicate references unknown resource ${predicate.resourceId}`);
        if (predicate.predicate === "resource_owned") check(resource.owned === true,
          `${taskId} lacks resource_owned evidence for ${predicate.resourceId}`);
        if (predicate.predicate === "delivery_complete") check(resource.delivered === true,
          `${taskId} lacks delivery_complete evidence for ${predicate.resourceId}`);
        if (predicate.predicate === "training_complete") check(resource.trainedStaffIds.length > 0,
          `${taskId} lacks training_complete evidence for ${predicate.resourceId}`);
        if (predicate.predicate === "maintenance_current") check(resource.maintenanceCurrent === true,
          `${taskId} lacks maintenance_current evidence for ${predicate.resourceId}`);
        check(reservations.some((reservation) => reservation.resourceId === predicate.resourceId),
          `${taskId} has no exact scheduler reservation for ${predicate.resourceId}`);
      } else if (predicate.predicate === "qualified_staff_scheduled") {
        check(reservations.some((reservation) =>
          predicate.eligibleStaffIds.includes(reservation.resourceId)
          && snapshot.resources[reservation.resourceId]?.active === true),
        `${taskId} lacks qualified_staff_scheduled evidence for ${entry.capabilityId}`);
      } else if (predicate.predicate === "ready_room_available") {
        check(reservations.some((reservation) =>
          predicate.eligibleRoomIds.includes(reservation.resourceId)
          && snapshot.resources[reservation.resourceId]?.active === true),
        `${taskId} lacks ready_room_available evidence for ${entry.capabilityId}`);
      } else if (predicate.predicate === "referral_coordination_slot_available") {
        check(reservations.some((reservation) =>
          predicate.eligibleStaffIds.includes(reservation.resourceId)
          && snapshot.resources[reservation.resourceId]?.active === true),
        `${taskId} lacks referral staff evidence for ${entry.capabilityId}`);
        check(reservations.some((reservation) =>
          predicate.eligibleRoomIds.includes(reservation.resourceId)
          && snapshot.resources[reservation.resourceId]?.active === true),
        `${taskId} lacks referral room evidence for ${entry.capabilityId}`);
      } else {
        fail(`task ${taskId} has unsupported state predicate ${predicate.predicate}`);
      }
    }
    return deepFreeze({
      safeRouteId: template.safeRouteId,
      protocolCapabilityIds: clone(template.protocolCapabilityIds),
      statePredicates: clone(template.statePredicates),
      validatedAt: task.startAt,
    });
  }

  function inventoryRequirementsForTask(task) {
    const template = exactTemplateForSchedulerTask(task);
    const byCategory = new Map();
    for (const capabilityId of template.inventoryCapabilityIds) {
      const exact = context.inventoryRequirementByCapabilityId.get(capabilityId);
      check(exact, `task ${task.id} references unknown inventory capability ${capabilityId}`);
      const current = byCategory.get(exact.categoryId) || {
        categoryId: exact.categoryId,
        units: 0,
        inventoryCapabilityIds: [],
      };
      current.units += exact.units;
      current.inventoryCapabilityIds.push(capabilityId);
      byCategory.set(exact.categoryId, current);
    }
    return [...byCategory.values()]
      .map((record) => ({
        ...record,
        inventoryCapabilityIds: sortedStrings(record.inventoryCapabilityIds),
      }))
      .sort((left, right) => left.categoryId.localeCompare(right.categoryId, "en"));
  }

  function inventoryConsumptionsForTask(schedulerState, taskId) {
    checkString(taskId, "inventory taskId");
    const normalized = schedulerApi.normalizeState(schedulerState);
    const task = normalized.tasks.find((record) => record.id === taskId);
    check(task, `unknown inventory task ${taskId}`);
    const activation = task.history.find((entry) => entry.to === "active");
    check(activation, `task ${taskId} has no active scheduler reservation`);
    const consumptions = inventoryRequirementsForTask(task).map((requirement) => ({
      commandId: `${activation.commandId}:stock:${requirement.categoryId}`,
      reservationId: `inventory:${task.id}:${requirement.categoryId}`,
      taskId: task.id,
      categoryId: requirement.categoryId,
      units: requirement.units,
    }));
    return deepFreeze(consumptions);
  }

  function validateAtomicInventoryAndProtocolLedger(lifecycleState, schedulerState) {
    const normalizedLifecycle = lifecycle.normalizeState(lifecycleState);
    const normalizedScheduler = schedulerApi.normalizeState(schedulerState);
    const expectedConsumptions = [];
    for (const task of normalizedScheduler.tasks) {
      if (!task.history.some((entry) => entry.to === "active")) continue;
      const template = exactTemplateForSchedulerTask(task);
      check(unresolvedProtocolCapabilityIds(task, template).length === 0,
        `atomic task ${task.id} depends on protocol authority that has no authored execution semantics`);
      for (const consumption of inventoryConsumptionsForTask(normalizedScheduler, task.id)) {
        expectedConsumptions.push({
          commandId: consumption.commandId,
          categoryId: consumption.categoryId,
          units: consumption.units,
          reservationId: consumption.reservationId,
        });
      }
    }
    const actualConsumptions = normalizedLifecycle.commands
      .filter((entry) => entry.command === "consume_stock")
      .map((entry) => ({
        commandId: entry.payload.commandId,
        categoryId: entry.payload.categoryId,
        units: entry.payload.units,
        reservationId: entry.payload.reservationId,
      }));
    const sortConsumptions = (records) => records.slice().sort((left, right) =>
      left.reservationId.localeCompare(right.reservationId, "en")
      || left.commandId.localeCompare(right.commandId, "en")
      || left.categoryId.localeCompare(right.categoryId, "en")
      || left.units - right.units);
    check(sameCanonical(
      sortConsumptions(actualConsumptions),
      sortConsumptions(expectedConsumptions),
    ), "atomic lifecycle inventory consumption ledger differs from active scheduler tasks");
  }

  function consumeTaskInventory(lifecycleState, schedulerState, command) {
    checkExactKeys(command, ["taskId", "consumptions"], "consume task inventory command");
    const taskId = checkString(command.taskId, "consume task inventory command.taskId");
    checkArray(command.consumptions, "consume task inventory command.consumptions");
    const normalizedConsumptions = command.consumptions.map((consumption, index) => {
      checkExactKeys(
        consumption,
        ["commandId", "reservationId", "taskId", "categoryId", "units"],
        `consume task inventory command.consumptions[${index}]`,
      );
      return {
        commandId: checkString(consumption.commandId, `inventory consumption[${index}].commandId`),
        reservationId: checkString(consumption.reservationId, `inventory consumption[${index}].reservationId`),
        taskId: checkString(consumption.taskId, `inventory consumption[${index}].taskId`),
        categoryId: checkString(consumption.categoryId, `inventory consumption[${index}].categoryId`),
        units: checkPositiveInteger(consumption.units, `inventory consumption[${index}].units`),
      };
    }).sort((left, right) => left.categoryId.localeCompare(right.categoryId, "en"));
    const expected = clone(inventoryConsumptionsForTask(schedulerState, taskId));
    check(sameCanonical(normalizedConsumptions, expected),
      `task ${taskId} inventory consumption evidence differs from exact P5 requirements`);

    const normalizedLifecycle = lifecycle.normalizeState(lifecycleState);
    const task = schedulerApi.normalizeState(schedulerState).tasks.find((record) => record.id === taskId);
    const inventorySnapshot = lifecycle.snapshot(normalizedLifecycle, task.startAt);
    const consumedIds = new Set(inventorySnapshot.consumedReservationIds);
    for (const consumption of expected) {
      if (consumedIds.has(consumption.reservationId)) continue;
      check(inventorySnapshot.inventory[consumption.categoryId] >= consumption.units,
        `task ${taskId} requires ${consumption.units} ${consumption.categoryId} inventory units, `
          + `but only ${inventorySnapshot.inventory[consumption.categoryId] ?? 0} remain`);
    }

    let nextLifecycleState = normalizedLifecycle;
    let allIdempotent = true;
    for (const consumption of expected) {
      const stockReservation = {
        reservationId: consumption.reservationId,
        taskId: consumption.taskId,
        categoryId: consumption.categoryId,
        units: consumption.units,
      };
      const result = lifecycle.execute(nextLifecycleState, "consume_stock", {
        commandId: consumption.commandId,
        categoryId: consumption.categoryId,
        units: consumption.units,
        reservationId: consumption.reservationId,
      }, { stockReservation });
      nextLifecycleState = result.state;
      allIdempotent = allIdempotent && result.idempotent;
    }
    return {
      state: nextLifecycleState,
      consumptions: clone(expected),
      idempotent: allIdempotent,
    };
  }

  function withBlockedExecutionContract(result) {
    if (!result.blockedTaskId) return { ...result, safeRouteId: null };
    const normalized = schedulerApi.normalizeState(result.state);
    const task = normalized.tasks.find((record) => record.id === result.blockedTaskId);
    check(task, `scheduler returned unknown blocked task ${result.blockedTaskId}`);
    const safeRouteId = safeRouteIdForBlockedTask(task);
    return {
      ...result,
      safeRouteRequired: true,
      safeRouteId,
    };
  }

  function blockedExecutionResult(lifecycleState, schedulerState, task, reasonCode) {
    const safeRouteId = safeRouteIdForBlockedTask(task);
    return {
      state: schedulerApi.normalizeState(schedulerState),
      task: null,
      blockedTaskId: task.id,
      safeRouteRequired: true,
      safeRouteId,
      reasonCode,
      idempotent: false,
      lifecycleState: lifecycle.normalizeState(lifecycleState),
      inventoryConsumptions: [],
      inventoryIdempotent: true,
      executionEvidence: null,
    };
  }

  function missingInventoryForTask(lifecycleState, schedulerState, taskId) {
    const consumptions = clone(inventoryConsumptionsForTask(schedulerState, taskId));
    if (consumptions.length === 0) return [];
    const task = schedulerApi.normalizeState(schedulerState).tasks
      .find((record) => record.id === taskId);
    const snapshot = lifecycle.snapshot(lifecycleState, task.startAt);
    const consumedIds = new Set(snapshot.consumedReservationIds);
    return consumptions.filter((consumption) =>
      !consumedIds.has(consumption.reservationId)
      && (snapshot.inventory[consumption.categoryId] ?? 0) < consumption.units);
  }

  function scheduleExactTask(lifecycleState, schedulerState, command, adapterCommands = []) {
    const normalizedLifecycle = lifecycle.normalizeState(lifecycleState);
    const normalizedScheduler = schedulerApi.normalizeState(schedulerState);
    const result = withBlockedExecutionContract(schedulerApi.scheduleTask(normalizedScheduler, command));
    if (!result.task) {
      return {
        ...result,
        state: normalizedScheduler,
        lifecycleState: normalizedLifecycle,
        inventoryConsumptions: [],
        inventoryIdempotent: true,
        executionEvidence: null,
      };
    }
    const template = exactTemplateForSchedulerTask(result.task);
    const missingReservationPredicates = missingReservationPredicateEvidence(
      result.state,
      result.task.id,
    );
    if (missingReservationPredicates.length > 0) {
      return {
        ...blockedExecutionResult(
          normalizedLifecycle,
          normalizedScheduler,
          result.task,
          "state_predicate_reservation_unavailable_safe_route_required",
        ),
        missingReservationPredicates: clone(missingReservationPredicates),
      };
    }
    if (unresolvedProtocolCapabilityIds(result.task, template).length > 0) {
      return blockedExecutionResult(
        normalizedLifecycle,
        normalizedScheduler,
        result.task,
        "protocol_authority_unavailable_safe_route_required",
      );
    }
    const missingInventory = missingInventoryForTask(
      normalizedLifecycle,
      result.state,
      result.task.id,
    );
    if (missingInventory.length > 0) {
      return {
        ...blockedExecutionResult(
          normalizedLifecycle,
          normalizedScheduler,
          result.task,
          "inventory_unavailable_safe_route_required",
        ),
        missingInventory: clone(missingInventory),
      };
    }
    const executionEvidence = validateTaskExecutionEvidence(
      normalizedLifecycle,
      result.state,
      result.task.id,
      adapterCommands,
    );
    const consumptions = clone(inventoryConsumptionsForTask(result.state, result.task.id));
    if (consumptions.length === 0) {
      return {
        ...result,
        lifecycleState: normalizedLifecycle,
        inventoryConsumptions: [],
        inventoryIdempotent: true,
        executionEvidence,
        safeRouteId: executionEvidence.safeRouteId,
      };
    }
    const consumed = consumeTaskInventory(normalizedLifecycle, result.state, {
      taskId: result.task.id,
      consumptions,
    });
    return {
      ...result,
      lifecycleState: consumed.state,
      inventoryConsumptions: consumed.consumptions,
      inventoryIdempotent: consumed.idempotent,
      executionEvidence,
      safeRouteId: executionEvidence.safeRouteId,
    };
  }

  function scheduleWithoutInventory(state, command) {
    const normalizedScheduler = schedulerApi.normalizeState(state);
    const result = withBlockedExecutionContract(
      schedulerApi.scheduleTask(normalizedScheduler, command),
    );
    if (result.task) {
      const template = exactTemplateForSchedulerTask(result.task);
      if (template.inventoryCapabilityIds.length > 0
        || template.protocolCapabilityIds.length > 0
        || template.statePredicates.length > 0) {
        fail(`task ${result.task.id} requires exact lifecycle evidence; use scheduleExactTask`);
      }
      return { ...result, safeRouteId: template.safeRouteId };
    }
    return { ...result, state: normalizedScheduler };
  }

  function resolveTaskPolicy(task) {
    const template = exactTemplateForSchedulerTask(task);
    check(template.handoffPolicyId, `task ${task.id} has no exact authored handoff policy; transfer fails closed`);
    const policy = context.policyById.get(template.handoffPolicyId);
    check(policy, `task ${task.id} references unknown handoff policy ${template.handoffPolicyId}`);
    return policy;
  }

  function validateHandoffPoint(task, policy, at) {
    check(policy.policyId !== "not_allowed", `handoff is forbidden by policy ${policy.policyId}`);
    const elapsed = at - task.startAt;
    check(elapsed >= policy.minimumElapsedMinutes,
      `handoff requires at least ${policy.minimumElapsedMinutes} elapsed minutes`);
    const duration = task.endAt - task.startAt;
    const authoredPoints = policy.allowedFractions.map((fraction) => duration * fraction);
    const nonIntegral = authoredPoints.filter((point) => !Number.isSafeInteger(point));
    check(nonIntegral.length === 0,
      `handoff breakpoints are fractional for duration ${duration}; no author rounding rule exists`);
    check(authoredPoints.includes(elapsed),
      `handoff minute ${at} is not an exact authored breakpoint for ${policy.policyId}`);
  }

  function handoffExactTask(lifecycleState, schedulerState, command, adapterCommands = []) {
    checkObject(command, "handoff command");
    const normalized = schedulerApi.normalizeState(schedulerState);
    const task = normalized.tasks.find((record) => record.id === command.taskId);
    check(task, `unknown handoff task ${command.taskId}`);
    const policy = resolveTaskPolicy(task);
    validateHandoffPoint(task, policy, command.at);
    validateSchedulerResourceProjection(
      lifecycleState,
      normalized,
      task.startAt,
      task.endAt,
      adapterCommands,
    );
    const result = schedulerApi.handoffTask(normalized, command);
    if (result.task) {
      validateTaskExecutionEvidence(
        lifecycleState,
        result.state,
        result.task.id,
        adapterCommands,
      );
    }
    return result;
  }

  function enqueueAtomicTask(stateValue, command) {
    const state = normalizeAtomicState(stateValue);
    checkObject(command, "atomic enqueue command");
    const commandId = checkString(command.commandId, "atomic enqueue command.commandId");
    assertAtomicCommandNamespace(state, commandId, "scheduler");
    const queuedAt = checkMinute(command.task?.queuedAt, "atomic enqueue command.task.queuedAt");
    check(state.horizon.startAt <= queuedAt && queuedAt < state.horizon.endAt,
      "atomic task queuedAt is outside its persisted horizon");
    const result = enqueueExactTask(state.schedulerState, command);
    const next = normalizeAtomicState({
      ...state,
      schedulerState: result.state,
    });
    const { state: ignoredSchedulerState, ...details } = result;
    return { ...details, state: next };
  }

  function scheduleAtomicTask(stateValue, command) {
    const state = normalizeAtomicState(stateValue);
    checkExactKeys(command, ["commandId", "at"], "atomic schedule command");
    const commandId = checkString(command.commandId, "atomic schedule command.commandId");
    const at = checkMinute(command.at, "atomic schedule command.at");
    check(state.horizon.startAt <= at && at < state.horizon.endAt,
      "atomic schedule minute is outside its persisted horizon");
    const previous = state.adapterCommands.find((entry) => entry.commandId === commandId);
    if (previous) {
      check(["blocked_schedule", "no_ready_schedule"].includes(previous.type)
        && previous.payload.at === at,
        `adapter command ${commandId} was already applied with different content`);
      if (previous.type === "no_ready_schedule") {
        return {
          state: clone(state),
          task: null,
          blockedTaskId: null,
          safeRouteRequired: false,
          safeRouteId: null,
          reasonCode: "no_ready_task",
          idempotent: true,
          inventoryConsumptions: [],
          inventoryIdempotent: true,
          executionEvidence: null,
        };
      }
      return {
        state: clone(state),
        task: null,
        blockedTaskId: previous.payload.taskId,
        safeRouteRequired: previous.payload.safeRouteRequired,
        safeRouteId: previous.payload.safeRouteId,
        reasonCode: previous.payload.reasonCode,
        idempotent: true,
        inventoryConsumptions: [],
        inventoryIdempotent: true,
        executionEvidence: null,
      };
    }
    assertAtomicCommandNamespace(state, commandId, "scheduler");
    const result = scheduleExactTask(
      state.lifecycleState,
      state.schedulerState,
      command,
      state.adapterCommands,
    );
    if (result.task) {
      check(result.task.startAt >= state.horizon.startAt && result.task.endAt <= state.horizon.endAt,
        `scheduled task ${result.task.id} falls outside its persisted atomic horizon`);
    }
    let adapterCommands = state.adapterCommands;
    let schedulerState = result.state;
    if (!result.task) {
      // Every non-transition attempt has one durable idempotency owner.
      // Roll back the scheduler receipt and persist the exact outcome in the
      // adapter ledger so reload can never reinterpret no-ready, capacity or
      // lifecycle failures as another scheduler command with the same ID.
      schedulerState = state.schedulerState;
      if (result.blockedTaskId) {
        const payload = {
          at,
          taskId: result.blockedTaskId,
          reasonCode: result.reasonCode,
          safeRouteRequired: result.safeRouteRequired,
          safeRouteId: result.safeRouteId,
          schedulerCommandApplied: false,
        };
        adapterCommands = [...adapterCommands, {
          commandId,
          type: "blocked_schedule",
          payload,
          fingerprint: adapterFingerprint({ type: "blocked_schedule", payload }),
        }];
      } else {
        check(result.reasonCode === "no_ready_task",
          `non-transition schedule ${commandId} has no exact adapter outcome contract`);
        const payload = { at, reasonCode: "no_ready_task" };
        adapterCommands = [...adapterCommands, {
          commandId,
          type: "no_ready_schedule",
          payload,
          fingerprint: adapterFingerprint({ type: "no_ready_schedule", payload }),
        }];
      }
    }
    const next = normalizeAtomicState({
      ...state,
      lifecycleState: result.lifecycleState,
      schedulerState,
      adapterCommands,
    });
    const {
      state: ignoredSchedulerState,
      lifecycleState: ignoredLifecycleState,
      ...details
    } = result;
    return { ...details, state: next };
  }

  function handoffAtomicTask(stateValue, command) {
    const state = normalizeAtomicState(stateValue);
    checkExactKeys(
      command,
      ["commandId", "taskId", "at", "reassignments"],
      "atomic handoff command",
    );
    const commandId = checkString(command.commandId, "atomic handoff command.commandId");
    const payload = normalizeAtomicHandoffPayload({
      taskId: command.taskId,
      at: command.at,
      reassignments: command.reassignments,
    }, "atomic handoff command");
    const fingerprint = adapterFingerprint({ type: "handoff_receipt", payload });
    const previous = state.adapterCommands.find((entry) => entry.commandId === commandId);
    if (previous) {
      check(previous.type === "handoff_receipt"
        && previous.fingerprint === fingerprint
        && sameCanonical(previous.payload, payload),
        `adapter command ${commandId} was already applied with different content`);
      const task = state.schedulerState.tasks.find((entry) => entry.id === payload.taskId);
      return {
        state: clone(state),
        task: clone(task),
        reservations: state.schedulerState.reservations
          .filter((entry) => entry.taskId === payload.taskId)
          .map(clone),
        reasonCode: "handed_off",
        idempotent: true,
      };
    }
    assertAtomicCommandNamespace(state, commandId, "adapter");
    const at = payload.at;
    check(state.horizon.startAt <= at && at < state.horizon.endAt,
      "atomic handoff minute is outside its persisted horizon");
    const result = handoffExactTask(
      state.lifecycleState,
      state.schedulerState,
      { commandId, ...payload },
      state.adapterCommands,
    );
    const commandFingerprints = clone(result.state.commandFingerprints);
    delete commandFingerprints[commandId];
    const schedulerState = schedulerApi.normalizeState({
      ...clone(result.state),
      appliedCommandIds: result.state.appliedCommandIds.filter((id) => id !== commandId),
      commandFingerprints,
    });
    const adapterCommands = [...state.adapterCommands, {
      commandId,
      type: "handoff_receipt",
      payload,
      fingerprint,
    }];
    const next = normalizeAtomicState({
      ...state,
      schedulerState,
      adapterCommands,
    });
    const { state: ignoredSchedulerState, ...details } = result;
    return { ...details, state: next };
  }

  return deepFreeze({
    adapterVersion: P5_AUTHORING_REVIEW_ADAPTER_V2_VERSION,
    reviewOnly: true,
    runtimeEligible: false,
    productionEligible: false,
    generatorEligible: false,
    productionPool: [],
    audit: context.audit,
    lifecycle,
    atomicStateSchemaVersion: P5_AUTHORING_ATOMIC_STATE_SCHEMA_VERSION,
    getTaskTemplate,
    auditReservationPredicateAuthority,
    createTask,
    createSchedulerState,
    createAtomicState,
    normalizeAtomicState,
    serializeAtomicState,
    deserializeAtomicState,
    applyLifecycleCommandAtomic,
    extendAtomicHorizon,
    recordStaffAbsenceAtomic,
    getAtomicStaffSnapshot,
    enqueueExactTask,
    enqueueAtomicTask,
    scheduleTask: scheduleWithoutInventory,
    scheduleExactTask,
    scheduleAtomicTask,
    getTaskExecutionContract,
    validateTaskExecutionEvidence,
    getTaskInventoryConsumptions: inventoryConsumptionsForTask,
    consumeTaskInventory,
    handoffExactTask,
    handoffAtomicTask,
    normalizeSchedulerState: (state) => schedulerApi.normalizeState(state),
  });
}

export function validateP5AuthoringReviewJoinV2(p5ReviewInput, operationalReviewInput) {
  return buildJoinContext(p5ReviewInput, operationalReviewInput).audit;
}
