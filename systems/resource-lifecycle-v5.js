(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_RESOURCE_LIFECYCLE_V5 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const CATALOG_VERSION = "2026.07.16.2";
  const DAY_LENGTH_MINUTES = 1440;
  const MAINTENANCE_DURATIONS_BY_EQUIPMENT_TYPE = Object.freeze({
    consumable_device: 60,
    imaging_equipment: 240,
    laboratory_equipment: 120,
    small_equipment: 60,
    treatment_equipment: 120
  });
  const STAFF_AVAILABILITY_STATES = Object.freeze([
    "not_hired",
    "hired_unscheduled",
    "available",
    "busy",
    "resting",
    "absent"
  ]);
  const SCHEDULER_STATE_REQUIRED_KEYS = Object.freeze([
    "schemaVersion", "resources", "tasks", "reservations", "appliedCommandIds"
  ]);
  const SCHEDULER_RESOURCE_KEYS = Object.freeze(["id", "capacity", "capabilities", "unavailableWindows"]);
  const SCHEDULER_RESERVATION_KEYS = Object.freeze([
    "taskId", "groupId", "resourceId", "capabilityId", "units", "startAt", "endAt"
  ]);
  const STAFF_AVAILABILITY_AUTHORITY_KEYS = Object.freeze(["schedulerState", "absenceWindows"]);
  const STAFF_ABSENCE_WINDOW_KEYS = Object.freeze([
    "staffId", "absenceTypeId", "triggerAuthority", "startAt", "endAt"
  ]);
  const COMMAND_CONTRACT = Object.freeze({
    hire_staff: ["commandId", "staffId", "hiredAt"],
    assign_shift: ["commandId", "staffId", "shiftId", "startAt", "endAt"],
    update_shift: ["commandId", "shiftId", "startAt", "endAt"],
    remove_shift: ["commandId", "shiftId"],
    purchase_asset: ["commandId", "assetCatalogId", "purchasedAt", "price"],
    mark_delivery_complete: ["commandId", "assetId", "deliveredAt"],
    complete_training: ["commandId", "assetId", "staffId", "completedAt"],
    mark_room_ready: ["commandId", "roomId", "readyAt"],
    start_maintenance: ["commandId", "assetId", "startAt", "endAt"],
    complete_maintenance: ["commandId", "assetId", "completedAt", "nextDueAt"],
    receive_stock: ["commandId", "categoryId", "units", "receivedAt"],
    consume_stock: ["commandId", "categoryId", "units", "reservationId"],
    retire_asset: ["commandId", "assetId", "retiredAt"]
  });
  const INITIAL_ACTIVE_PHYSICAL_IDS = Object.freeze([
    "equipment.microscope",
    "equipment.otoscope",
    "room.consult.1",
    "room.lab.basic",
    "room.reception.1",
    "room.storage.1",
    "room.waiting.1"
  ]);

  function fail(message) {
    throw new Error(`P5 lifecycle runtime rejected input: ${message}`);
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function requireObject(value, label) {
    if (!isObject(value)) fail(`${label} must be a plain object`);
    return value;
  }

  function requireArray(value, label) {
    if (!Array.isArray(value)) fail(`${label} must be an array`);
    return value;
  }

  function requireString(value, label) {
    if (typeof value !== "string" || !value.trim()) fail(`${label} must be a non-empty string`);
    return value;
  }

  function requireMinute(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a non-negative campaign minute`);
    return value;
  }

  function requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) fail(`${label} must be a positive integer`);
    return value;
  }

  function requireNonNegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a non-negative integer`);
    return value;
  }

  function requireNonNegativeNumber(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      fail(`${label} must be a finite non-negative number`);
    }
    return value;
  }

  function requireExactKeys(value, expected, label) {
    requireObject(value, label);
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      fail(`${label} fields must be exactly ${wanted.join(", ")}`);
    }
  }

  function uniqueMap(records, key, label) {
    const output = new Map();
    requireArray(records, label).forEach((record, index) => {
      requireObject(record, `${label}[${index}]`);
      const id = requireString(record[key], `${label}[${index}].${key}`);
      if (output.has(id)) fail(`${label} contains duplicate ${id}`);
      output.set(id, record);
    });
    return output;
  }

  function sortedStrings(values) {
    return [...values].sort((left, right) => left.localeCompare(right, "en"));
  }

  function sameStrings(left, right) {
    return JSON.stringify(sortedStrings(left)) === JSON.stringify(sortedStrings(right));
  }

  function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (isObject(value)) {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function fingerprint(value) {
    const text = canonicalJson(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `p5lifecycle:${hash.toString(16).padStart(8, "0")}`;
  }

  function intervalsOverlap(leftStart, leftEnd, rightStart, rightEnd) {
    return leftStart < rightEnd && rightStart < leftEnd;
  }

  function mergeWindows(windows) {
    const ordered = windows
      .filter((window) => window.endAt > window.startAt)
      .sort((left, right) => left.startAt - right.startAt || left.endAt - right.endAt);
    const merged = [];
    for (const window of ordered) {
      const previous = merged[merged.length - 1];
      if (!previous || previous.endAt < window.startAt) merged.push({ ...window });
      else previous.endAt = Math.max(previous.endAt, window.endAt);
    }
    return merged;
  }

  function createResourceLifecycleRuntime(rawConfig) {
    requireExactKeys(
      rawConfig,
      ["resourceCatalog", "lifecycleCatalog", "operationalPolicies", "resourceCrosswalk"],
      "runtime config"
    );
    const resourceCatalog = clone(requireObject(rawConfig.resourceCatalog, "resource catalog"));
    const lifecycleCatalog = clone(requireObject(rawConfig.lifecycleCatalog, "lifecycle catalog"));
    const operationalPolicies = clone(requireObject(rawConfig.operationalPolicies, "operational policies"));
    const resourceCrosswalk = clone(requireObject(rawConfig.resourceCrosswalk, "resource crosswalk"));
    validateCatalogHeaders();
    const dayLengthMinutes = requirePositiveInteger(
      operationalPolicies.clock?.dayLengthMinutes,
      "operational policies.clock.dayLengthMinutes"
    );
    if (dayLengthMinutes !== DAY_LENGTH_MINUTES) {
      fail(`operational policies.clock.dayLengthMinutes must be exactly ${DAY_LENGTH_MINUTES}`);
    }
    const maintenanceDurationsByEquipmentType = validateMaintenancePolicy();
    const schedulingPolicy = validateSchedulingPolicy();
    const absencePolicyById = validateStaffAvailabilityPolicies();

    const resourceById = uniqueMap(resourceCatalog.resources, "resourceId", "resource catalog resources");
    const seedById = uniqueMap(lifecycleCatalog.resourceLifecycleSeeds, "resourceId", "lifecycle seeds");
    const crosswalkById = uniqueMap(resourceCrosswalk.resources, "resourceId", "resource crosswalk resources");
    if (resourceById.size !== 49 || seedById.size !== 49 || crosswalkById.size !== 49) {
      fail("resource catalogs must contain the exact 49-resource set");
    }
    if (!sameStrings(resourceById.keys(), seedById.keys()) || !sameStrings(resourceById.keys(), crosswalkById.keys())) {
      fail("resource catalog, lifecycle seeds, and P6 crosswalk resource IDs differ");
    }

    const roomAssetById = uniqueMap(lifecycleCatalog.roomAssets, "roomId", "room assets");
    if (roomAssetById.size !== 12) fail("room asset catalog must contain 12 rooms");
    const assetToResource = new Map();
    for (const [resourceId, crosswalk] of crosswalkById) {
      const resource = resourceById.get(resourceId);
      if (resource.resourceKind !== crosswalk.resourceKind) fail(`${resourceId} resource kind differs from P6 crosswalk`);
      if (resource.resourceKind !== "staff") {
        const assetId = requireString(crosswalk.assetCatalogId, `${resourceId}.assetCatalogId`);
        if (assetToResource.has(assetId)) fail(`duplicate asset catalog ID ${assetId}`);
        assetToResource.set(assetId, resourceId);
      }
      validateResource(resource, seedById.get(resourceId), crosswalk);
    }
    if (assetToResource.size !== 39) fail("exactly 39 physical resources must have asset IDs");

    const inventoryCategories = uniqueMap(lifecycleCatalog.startingInventory, "categoryId", "starting inventory");
    if (inventoryCategories.size !== 10) fail("starting inventory must contain 10 categories");
    if (canonicalJson(lifecycleCatalog.startingInventory) !== canonicalJson(resourceCrosswalk.startingInventory)) {
      fail("P5 and P6 starting inventory differ");
    }
    validateCommandCatalog();
    validateInitialAuthority();

    function validateCatalogHeaders() {
      for (const [catalog, expectedId, label] of [
        [resourceCatalog, "vetgeme-p5-resource-catalog", "resource catalog"],
        [lifecycleCatalog, "vetgeme-p5-resource-lifecycle-runtime-contract", "lifecycle catalog"]
      ]) {
        if (catalog.schemaVersion !== 1 || catalog.catalogId !== expectedId
          || catalog.catalogVersion !== CATALOG_VERSION || catalog.runtimeEligible !== false) {
          fail(`${label} identity or review-only boundary mismatch`);
        }
      }
      if (resourceCrosswalk.schemaVersion !== 1
        || resourceCrosswalk.catalogId !== "vetgeme-p6-p5-exact-resource-crosswalk"
        || resourceCrosswalk.catalogVersion !== CATALOG_VERSION
        || resourceCrosswalk.p5PackageVersion !== CATALOG_VERSION
        || resourceCrosswalk.runtimeEligible !== false) {
        fail("P6/P5 exact crosswalk identity or review-only boundary mismatch");
      }
      if (operationalPolicies.schemaVersion !== 1
        || operationalPolicies.catalogId !== "vetgeme-p5-operational-policies"
        || operationalPolicies.catalogVersion !== CATALOG_VERSION
        || operationalPolicies.runtimeEligible !== false) {
        fail("operational policy identity or review-only boundary mismatch");
      }
    }

    function validateMaintenancePolicy() {
      const policy = requireObject(operationalPolicies.maintenancePolicy, "operational policies.maintenancePolicy");
      requireExactKeys(policy, [
        "authority",
        "schedulerEffect",
        "duplicateMaintenanceStateForbidden",
        "visualStateIsProjectionOnly",
        "defaultDurationsByEquipmentType"
      ], "operational policies.maintenancePolicy");
      if (policy.authority !== "p6_maintenance_command_only"
        || policy.schedulerEffect !== "append_exact_unavailable_window"
        || policy.duplicateMaintenanceStateForbidden !== true
        || policy.visualStateIsProjectionOnly !== true) {
        fail("operational maintenance policy authority or fail-closed defaults changed");
      }
      const durations = requireObject(
        policy.defaultDurationsByEquipmentType,
        "operational policies.maintenancePolicy.defaultDurationsByEquipmentType"
      );
      requireExactKeys(
        durations,
        Object.keys(MAINTENANCE_DURATIONS_BY_EQUIPMENT_TYPE),
        "operational policies.maintenancePolicy.defaultDurationsByEquipmentType"
      );
      for (const [equipmentType, expectedDuration] of Object.entries(MAINTENANCE_DURATIONS_BY_EQUIPMENT_TYPE)) {
        requirePositiveInteger(
          durations[equipmentType],
          `operational policies maintenance duration ${equipmentType}`
        );
        if (durations[equipmentType] !== expectedDuration) {
          fail(`operational maintenance duration for ${equipmentType} must be exactly ${expectedDuration}`);
        }
      }
      return clone(durations);
    }

    function validateSchedulingPolicy() {
      const policy = requireObject(operationalPolicies.scheduling, "operational policies.scheduling");
      if (policy.oneDoctorUntilSecondConsultOwned !== true) {
        fail("operational scheduling must keep one doctor until the second consult is owned");
      }
      if (policy.secondDoctorOverlapMaximumMinutes !== 360) {
        fail("operational scheduling second-doctor overlap must be exactly 360 minutes");
      }
      return {
        oneDoctorUntilSecondConsultOwned: true,
        secondDoctorOverlapMaximumMinutes: 360
      };
    }

    function validateStaffAvailabilityPolicies() {
      const clock = requireObject(operationalPolicies.clock, "operational policies.clock");
      if (clock.mandatoryRestMinutes !== 720
        || clock.breakAfterMinutes !== 300
        || clock.breakDurationMinutes !== 30) {
        fail("operational staff rest and break policy differs from exact P5 authority");
      }
      const policies = uniqueMap(
        operationalPolicies.absencePolicies,
        "absenceTypeId",
        "operational absence policies"
      );
      const expected = {
        planned_leave: {
          triggerAuthority: "p7_event_only",
          durationMinutes: [1440, 2880],
          maximumConcurrentStaff: 1,
          noticeMinutes: 2880,
          requiresReplacementOrReducedCapacity: true
        },
        unplanned_illness: {
          triggerAuthority: "p7_event_only",
          durationMinutes: [1440, 1440],
          maximumConcurrentStaff: 1,
          noticeMinutes: 0,
          requiresReplacementOrReducedCapacity: true
        },
        training_block: {
          triggerAuthority: "player_training_decision",
          durationMinutes: [120, 240],
          maximumConcurrentStaff: 2,
          noticeMinutes: 0,
          requiresReplacementOrReducedCapacity: false
        }
      };
      if (!sameStrings(policies.keys(), Object.keys(expected))) {
        fail("operational absence policy set differs from exact P5 authority");
      }
      for (const [absenceTypeId, exact] of Object.entries(expected)) {
        const policy = policies.get(absenceTypeId);
        if (policy.triggerAuthority !== exact.triggerAuthority
          || canonicalJson(policy.durationMinutes) !== canonicalJson(exact.durationMinutes)
          || policy.maximumConcurrentStaff !== exact.maximumConcurrentStaff
          || policy.noticeMinutes !== exact.noticeMinutes
          || policy.requiresReplacementOrReducedCapacity !== exact.requiresReplacementOrReducedCapacity) {
          fail(`${absenceTypeId} policy differs from exact P5 authority`);
        }
      }
      return policies;
    }

    function validateResource(resource, seed, crosswalk) {
      if (!["staff", "room", "equipment"].includes(resource.resourceKind)) {
        fail(`${resource.resourceId} has unsupported resource kind`);
      }
      if (resource.initialLifecycleState !== seed.state || resource.initialLifecycleState !== crosswalk.p5LifecycleState) {
        fail(`${resource.resourceId} lifecycle seed drift`);
      }
      if (!sameStrings(resource.initialEvidenceIds, seed.evidenceIds)
        || !sameStrings(resource.initialEvidenceIds, crosswalk.activationEvidenceIds)) {
        fail(`${resource.resourceId} activation evidence drift`);
      }
      if (!sameStrings(resource.activationRequirements, seed.activationRequires)) {
        fail(`${resource.resourceId} activation requirements drift`);
      }
      const template = requireObject(resource.runtimeResourceTemplate, `${resource.resourceId}.runtimeResourceTemplate`);
      if (template.id !== resource.resourceId || !Number.isSafeInteger(template.capacity) || template.capacity <= 0) {
        fail(`${resource.resourceId} runtime resource template is invalid`);
      }
      const capabilities = requireArray(template.capabilities, `${resource.resourceId}.capabilities`);
      if (capabilities.length === 0 || new Set(capabilities).size !== capabilities.length) {
        fail(`${resource.resourceId} runtime capabilities are empty or duplicated`);
      }
      requireArray(template.unavailableWindows, `${resource.resourceId}.unavailableWindows`);
      if (resource.resourceKind === "staff") {
        requireString(resource.role, `${resource.resourceId}.role`);
        const economics = requireObject(crosswalk.economicRecord, `${resource.resourceId}.economicRecord`);
        requirePositiveInteger(economics.maximumShiftMinutes, `${resource.resourceId}.maximumShiftMinutes`);
        if (economics.mandatoryRestMinutes !== operationalPolicies.clock.mandatoryRestMinutes) {
          fail(`${resource.resourceId} mandatory rest differs from exact P5 clock authority`);
        }
      } else {
        const economics = requireObject(crosswalk.economicRecord, `${resource.resourceId}.economicRecord`);
        if (crosswalk.assetCatalogId !== economics.assetCatalogId) {
          fail(`${resource.resourceId} asset ID differs inside P6 crosswalk`);
        }
        requireNonNegativeNumber(economics.purchasePrice, `${resource.resourceId}.purchasePrice`);
        requireNonNegativeInteger(economics.deliveryDays, `${resource.resourceId}.deliveryDays`);
        if (resource.resourceKind === "room") {
          requireNonNegativeInteger(economics.readyingDays, `${resource.resourceId}.readyingDays`);
        } else {
          const capabilityId = requireString(resource.capabilityId, `${resource.resourceId}.capabilityId`);
          if (capabilityId !== crosswalk.capabilityId) {
            fail(`${resource.resourceId} capability differs from P6 crosswalk`);
          }
          const equipmentType = requireString(resource.equipmentType, `${resource.resourceId}.equipmentType`);
          if (!hasOwn(maintenanceDurationsByEquipmentType, equipmentType)) {
            fail(`${resource.resourceId} equipment type has no authored maintenance duration`);
          }
          requireNonNegativeInteger(economics.trainingMinutes, `${resource.resourceId}.trainingMinutes`);
          requirePositiveInteger(economics.maintenanceIntervalDays, `${resource.resourceId}.maintenanceIntervalDays`);
        }
      }
    }

    function validateCommandCatalog() {
      const definitions = uniqueMap(lifecycleCatalog.commands, "command", "lifecycle commands");
      if (!sameStrings(definitions.keys(), Object.keys(COMMAND_CONTRACT))) {
        fail("lifecycle command set must contain the exact 13 commands");
      }
      for (const [command, fields] of Object.entries(COMMAND_CONTRACT)) {
        const definition = definitions.get(command);
        if (!sameStrings(definition.requiredFields, fields)) fail(`${command} required fields changed`);
        requireString(definition.authority, `${command}.authority`);
        requireString(definition.result, `${command}.result`);
      }
    }

    function validateInitialAuthority() {
      const initialPhysical = resourceCatalog.resources
        .filter((resource) => resource.resourceKind !== "staff" && resource.startsActive)
        .map((resource) => resource.resourceId);
      if (!sameStrings(initialPhysical, INITIAL_ACTIVE_PHYSICAL_IDS)) {
        fail("initial physical availability must be five rooms plus otoscope and microscope");
      }
      const activeStaff = resourceCatalog.resources.filter((resource) => resource.resourceKind === "staff" && resource.startsActive);
      if (activeStaff.length !== 0) fail("staff cannot start active without an assigned shift");
      for (const doctorId of ["staff.doctor.sokolova", "staff.doctor.morozov"]) {
        if (seedById.get(doctorId)?.state !== "hired_unscheduled") fail(`${doctorId} must start hired_unscheduled`);
      }
      if (lifecycleCatalog.invariants?.unlockIsNotOwnership !== true
        || lifecycleCatalog.invariants?.purchaseDoesNotActivate !== true
        || lifecycleCatalog.invariants?.visualPresenceDoesNotActivate !== true
        || lifecycleCatalog.invariants?.missingEvidenceFailsClosed !== true
        || lifecycleCatalog.invariants?.savePersistsCommandsAndDerivedResourceState !== true
        || lifecycleCatalog.invariants?.saveSchemaChangeAllowedWithoutMigration !== false) {
        fail("lifecycle fail-closed invariants changed");
      }
    }

    function createEmptyState() {
      return { schemaVersion: SCHEMA_VERSION, catalogVersion: CATALOG_VERSION, commands: [] };
    }

    function normalizePayload(command, payload) {
      const fields = COMMAND_CONTRACT[command];
      if (!fields) fail(`unknown lifecycle command ${command}`);
      requireExactKeys(payload, fields, `${command} payload`);
      requireString(payload.commandId, `${command}.commandId`);
      for (const [key, value] of Object.entries(payload)) {
        if (key === "price") requireNonNegativeNumber(value, `${command}.${key}`);
        else if (key === "units") requirePositiveInteger(value, `${command}.${key}`);
        else if (/(?:At|startAt|endAt|nextDueAt)$/u.test(key)) requireMinute(value, `${command}.${key}`);
        else requireString(value, `${command}.${key}`);
      }
      if (hasOwn(payload, "startAt") && hasOwn(payload, "endAt") && payload.endAt <= payload.startAt) {
        fail(`${command} interval must be non-empty`);
      }
      if (hasOwn(payload, "completedAt") && hasOwn(payload, "nextDueAt") && payload.nextDueAt <= payload.completedAt) {
        fail(`${command}.nextDueAt must be after completedAt`);
      }
      return clone(payload);
    }

    function normalizeState(value) {
      requireExactKeys(value, ["schemaVersion", "catalogVersion", "commands"], "lifecycle state");
      if (value.schemaVersion !== SCHEMA_VERSION || value.catalogVersion !== CATALOG_VERSION) {
        fail("lifecycle state version mismatch");
      }
      const seen = new Set();
      const commands = requireArray(value.commands, "lifecycle state.commands").map((entry, index) => {
        requireExactKeys(entry, ["command", "payload", "fingerprint"], `lifecycle state.commands[${index}]`);
        const command = requireString(entry.command, `lifecycle state.commands[${index}].command`);
        const payload = normalizePayload(command, entry.payload);
        const expected = fingerprint({ command, payload });
        if (entry.fingerprint !== expected) fail(`command ${payload.commandId} fingerprint mismatch`);
        if (seen.has(payload.commandId)) fail(`duplicate lifecycle command ID ${payload.commandId}`);
        seen.add(payload.commandId);
        return { command, payload, fingerprint: expected };
      });
      replay(commands, { historical: true, context: {} });
      return { schemaVersion: SCHEMA_VERSION, catalogVersion: CATALOG_VERSION, commands };
    }

    function initialProjection() {
      const resources = {};
      for (const [resourceId, resource] of resourceById) {
        const seed = seedById.get(resourceId);
        const crosswalk = crosswalkById.get(resourceId);
        if (resource.resourceKind === "staff") {
          resources[resourceId] = {
            resourceId,
            resourceKind: "staff",
            hired: seed.state === "hired_unscheduled",
            hiredAt: seed.state === "hired_unscheduled" ? 0 : null,
            shifts: [],
            retiredAt: null
          };
        } else {
          const assetId = crosswalk.assetCatalogId;
          const equipmentEvidence = lifecycleCatalog.startingEquipmentEvidence
            .find((record) => record.resourceId === resourceId);
          const roomAsset = roomAssetById.get(resourceId);
          resources[resourceId] = {
            resourceId,
            resourceKind: resource.resourceKind,
            assetId,
            owned: resource.resourceKind === "room" ? roomAsset.startsOwned : Boolean(equipmentEvidence?.owned),
            delivered: resource.resourceKind === "room" ? roomAsset.startsDelivered : Boolean(equipmentEvidence?.delivered),
            ready: resource.resourceKind === "room" ? roomAsset.startsReady : false,
            trainedStaffIds: sortedStrings(equipmentEvidence?.trainedStaffIds || []),
            trainingCompletedAtByStaff: Object.fromEntries(
              sortedStrings(equipmentEvidence?.trainedStaffIds || []).map((staffId) => [staffId, 0])
            ),
            maintenanceCurrent: Boolean(equipmentEvidence),
            maintenanceCurrentThroughCampaignDay: equipmentEvidence?.maintenanceCurrentThroughCampaignDay ?? null,
            nextDueAt: equipmentEvidence
              ? equipmentEvidence.maintenanceCurrentThroughCampaignDay * dayLengthMinutes
              : null,
            maintenanceRecords: equipmentEvidence ? [{
              completedAt: 0,
              nextDueAt: equipmentEvidence.maintenanceCurrentThroughCampaignDay * dayLengthMinutes,
              evidenceId: equipmentEvidence.evidenceId
            }] : [],
            maintenanceWindows: [],
            purchasedAt: (resource.resourceKind === "room" ? roomAsset.startsOwned : equipmentEvidence?.owned) ? 0 : null,
            deliveredAt: (resource.resourceKind === "room" ? roomAsset.startsDelivered : equipmentEvidence?.delivered) ? 0 : null,
            readyAt: resource.resourceKind === "room" && roomAsset.startsReady ? 0 : null,
            retiredAt: null
          };
        }
      }
      return {
        resources,
        inventory: Object.fromEntries(lifecycleCatalog.startingInventory.map((record) => [record.categoryId, record.units])),
        consumedReservationIds: []
      };
    }

    function replay(entries, options) {
      const projection = initialProjection();
      for (const entry of entries) applyEffect(projection, entry.command, entry.payload, options);
      return projection;
    }

    function staffEconomics(staffId) {
      const record = crosswalkById.get(staffId)?.economicRecord;
      requireObject(record, `${staffId} economic record`);
      requirePositiveInteger(record.maximumShiftMinutes, `${staffId}.maximumShiftMinutes`);
      requirePositiveInteger(record.mandatoryRestMinutes, `${staffId}.mandatoryRestMinutes`);
      return record;
    }

    function validateShiftSet(staff, shifts, label) {
      const economics = staffEconomics(staff.resourceId);
      const ordered = [...shifts].sort((left, right) => left.startAt - right.startAt || left.shiftId.localeCompare(right.shiftId));
      for (let index = 0; index < ordered.length; index += 1) {
        const shift = ordered[index];
        if (shift.endAt - shift.startAt > economics.maximumShiftMinutes) fail(`${label} exceeds maximum shift duration`);
        const previous = ordered[index - 1];
        if (previous && shift.startAt - previous.endAt < economics.mandatoryRestMinutes) {
          fail(`${label} violates mandatory rest between shifts`);
        }
      }
    }

    function validateDoctorScheduling(projection, owner, ownerShifts, label) {
      if (resourceById.get(owner.resourceId)?.role !== "doctor") return;
      const doctorShifts = [];
      for (const resource of Object.values(projection.resources)) {
        if (resource.resourceKind !== "staff" || resourceById.get(resource.resourceId)?.role !== "doctor") continue;
        const shifts = resource.resourceId === owner.resourceId ? ownerShifts : resource.shifts;
        shifts.forEach((shift) => doctorShifts.push({ staffId: resource.resourceId, ...shift }));
      }
      const secondConsult = projection.resources["room.consult.2"];
      const secondConsultOwned = secondConsult?.owned === true && secondConsult.retiredAt === null;
      for (let leftIndex = 0; leftIndex < doctorShifts.length; leftIndex += 1) {
        const left = doctorShifts[leftIndex];
        for (let rightIndex = leftIndex + 1; rightIndex < doctorShifts.length; rightIndex += 1) {
          const right = doctorShifts[rightIndex];
          if (left.staffId === right.staffId) continue;
          const overlap = Math.max(0, Math.min(left.endAt, right.endAt) - Math.max(left.startAt, right.startAt));
          if (overlap === 0) continue;
          if (schedulingPolicy.oneDoctorUntilSecondConsultOwned && !secondConsultOwned) {
            fail(`${label} cannot overlap doctor shifts until room.consult.2 is owned`);
          }
          if (overlap > schedulingPolicy.secondDoctorOverlapMaximumMinutes) {
            fail(`${label} exceeds the exact 360-minute second-doctor overlap limit`);
          }
        }
      }
      const events = doctorShifts.flatMap((shift) => [
        { at: shift.startAt, delta: 1 },
        { at: shift.endAt, delta: -1 }
      ]).sort((left, right) => left.at - right.at || left.delta - right.delta);
      let concurrentDoctors = 0;
      for (const event of events) {
        concurrentDoctors += event.delta;
        if (concurrentDoctors > 2) fail(`${label} cannot schedule more than two concurrent doctors`);
      }
    }

    function validateSecondConsultRetirement(projection, retiredAt, label) {
      if (!schedulingPolicy.oneDoctorUntilSecondConsultOwned) return;
      const doctorShifts = [];
      for (const resource of Object.values(projection.resources)) {
        if (resource.resourceKind !== "staff" || resourceById.get(resource.resourceId)?.role !== "doctor") continue;
        resource.shifts.forEach((shift) => doctorShifts.push({ staffId: resource.resourceId, ...shift }));
      }
      for (let leftIndex = 0; leftIndex < doctorShifts.length; leftIndex += 1) {
        const left = doctorShifts[leftIndex];
        for (let rightIndex = leftIndex + 1; rightIndex < doctorShifts.length; rightIndex += 1) {
          const right = doctorShifts[rightIndex];
          if (left.staffId === right.staffId) continue;
          const overlapStart = Math.max(left.startAt, right.startAt, retiredAt);
          const overlapEnd = Math.min(left.endAt, right.endAt);
          if (overlapStart < overlapEnd) {
            fail(`${label} cannot retire room.consult.2 while future doctor shift overlap exists`);
          }
        }
      }
    }

    function compareStrings(left, right) {
      return left.localeCompare(right, "en");
    }

    function schedulerReservationComparator(left, right) {
      return left.startAt - right.startAt
        || left.endAt - right.endAt
        || compareStrings(left.taskId, right.taskId)
        || compareStrings(left.groupId, right.groupId)
        || compareStrings(left.resourceId, right.resourceId)
        || compareStrings(left.capabilityId, right.capabilityId)
        || left.units - right.units;
    }

    function requireCanonicalSchedulerState(context, command) {
      if (!isObject(context?.schedulerState)) {
        fail(`${command} requires explicit canonical schedulerState reservation authority`);
      }
      const state = requireObject(context?.schedulerState, `${command} context.schedulerState`);
      const allowedKeys = [...SCHEDULER_STATE_REQUIRED_KEYS, "commandFingerprints"];
      const actualKeys = Object.keys(state);
      const missingKeys = SCHEDULER_STATE_REQUIRED_KEYS.filter((key) => !hasOwn(state, key));
      const extraKeys = actualKeys.filter((key) => !allowedKeys.includes(key));
      if (missingKeys.length || extraKeys.length) {
        fail(`${command} context.schedulerState must have canonical scheduler state fields`);
      }
      if (state.schemaVersion !== 1) fail(`${command} context.schedulerState has unsupported schemaVersion`);

      const resources = requireObject(state.resources, `${command} context.schedulerState.resources`);
      const resourceIds = Object.keys(resources);
      if (!sameStrings(resourceIds, resourceById.keys())) {
        fail(`${command} context.schedulerState must contain the exact lifecycle resource set`);
      }
      if (JSON.stringify(resourceIds) !== JSON.stringify(sortedStrings(resourceIds))) {
        fail(`${command} context.schedulerState resources are not canonical`);
      }
      for (const resourceId of resourceIds) {
        const label = `${command} scheduler resource ${resourceId}`;
        const resource = resources[resourceId];
        requireExactKeys(resource, SCHEDULER_RESOURCE_KEYS, label);
        if (resource.id !== resourceId) fail(`${label} ID differs from its state key`);
        const authored = resourceById.get(resourceId).runtimeResourceTemplate;
        if (resource.capacity !== authored.capacity) fail(`${label} capacity differs from P5 authority`);
        const capabilities = requireArray(resource.capabilities, `${label}.capabilities`);
        capabilities.forEach((capabilityId, index) => requireString(capabilityId, `${label}.capabilities[${index}]`));
        if (new Set(capabilities).size !== capabilities.length
          || JSON.stringify(capabilities) !== JSON.stringify(sortedStrings(capabilities))
          || !sameStrings(capabilities, authored.capabilities)) {
          fail(`${label} capabilities are not canonical P5 authority`);
        }
        const windows = requireArray(resource.unavailableWindows, `${label}.unavailableWindows`);
        let previous = null;
        windows.forEach((window, index) => {
          requireExactKeys(window, ["startAt", "endAt"], `${label}.unavailableWindows[${index}]`);
          requireMinute(window.startAt, `${label}.unavailableWindows[${index}].startAt`);
          requireMinute(window.endAt, `${label}.unavailableWindows[${index}].endAt`);
          if (window.endAt <= window.startAt) fail(`${label} has an empty unavailable window`);
          if (previous && (window.startAt < previous.startAt
            || (window.startAt === previous.startAt && window.endAt < previous.endAt)
            || intervalsOverlap(previous.startAt, previous.endAt, window.startAt, window.endAt))) {
            fail(`${label} unavailable windows are not canonical`);
          }
          previous = window;
        });
      }

      const tasks = requireArray(state.tasks, `${command} context.schedulerState.tasks`);
      const taskById = new Map();
      let previousTaskId = null;
      tasks.forEach((task, index) => {
        const label = `${command} scheduler task[${index}]`;
        requireObject(task, label);
        const taskId = requireString(task.id, `${label}.id`);
        if (taskById.has(taskId) || (previousTaskId !== null && compareStrings(previousTaskId, taskId) >= 0)) {
          fail(`${command} context.schedulerState tasks are not canonical`);
        }
        if (task.schemaVersion !== 1 || !["queued", "active", "completed", "cancelled"].includes(task.status)) {
          fail(`${label} has invalid schemaVersion or status`);
        }
        const groups = requireArray(task.requirementGroups, `${label}.requirementGroups`);
        const groupById = new Map();
        let previousGroupId = null;
        groups.forEach((group, groupIndex) => {
          requireExactKeys(group, ["id", "anyOf"], `${label}.requirementGroups[${groupIndex}]`);
          const groupId = requireString(group.id, `${label}.requirementGroups[${groupIndex}].id`);
          if (groupById.has(groupId) || (previousGroupId !== null && compareStrings(previousGroupId, groupId) >= 0)) {
            fail(`${label} requirement groups are not canonical`);
          }
          const alternatives = requireArray(group.anyOf, `${label}.requirementGroups[${groupIndex}].anyOf`);
          if (alternatives.length === 0) fail(`${label} requirement group ${groupId} must not be empty`);
          const alternativeKeys = alternatives.map((alternative, alternativeIndex) => {
            const alternativeLabel = `${label}.requirementGroups[${groupIndex}].anyOf[${alternativeIndex}]`;
            requireExactKeys(alternative, ["resourceId", "capabilityId", "units"], alternativeLabel);
            requireString(alternative.resourceId, `${alternativeLabel}.resourceId`);
            requireString(alternative.capabilityId, `${alternativeLabel}.capabilityId`);
            requirePositiveInteger(alternative.units, `${alternativeLabel}.units`);
            const resource = resources[alternative.resourceId];
            if (!resource || !resource.capabilities.includes(alternative.capabilityId)
              || alternative.units > resource.capacity) {
              fail(`${alternativeLabel} does not match canonical scheduler resources`);
            }
            return `${alternative.resourceId}\u0000${alternative.capabilityId}\u0000${alternative.units}`;
          });
          const sortedAlternatives = [...alternatives].sort((left, right) =>
            compareStrings(left.resourceId, right.resourceId)
            || compareStrings(left.capabilityId, right.capabilityId)
            || left.units - right.units);
          if (new Set(alternativeKeys).size !== alternativeKeys.length
            || JSON.stringify(alternatives) !== JSON.stringify(sortedAlternatives)) {
            fail(`${label} requirement alternatives are not canonical`);
          }
          groupById.set(groupId, group);
          previousGroupId = groupId;
        });
        taskById.set(taskId, { task, groupById });
        previousTaskId = taskId;
      });

      const appliedCommandIds = requireArray(
        state.appliedCommandIds,
        `${command} context.schedulerState.appliedCommandIds`
      );
      appliedCommandIds.forEach((commandId, index) =>
        requireString(commandId, `${command} scheduler appliedCommandIds[${index}]`));
      if (new Set(appliedCommandIds).size !== appliedCommandIds.length
        || JSON.stringify(appliedCommandIds) !== JSON.stringify(sortedStrings(appliedCommandIds))) {
        fail(`${command} context.schedulerState appliedCommandIds are not canonical`);
      }
      if (hasOwn(state, "commandFingerprints")) {
        const fingerprints = requireObject(
          state.commandFingerprints,
          `${command} context.schedulerState.commandFingerprints`
        );
        const fingerprintIds = Object.keys(fingerprints);
        if (JSON.stringify(fingerprintIds) !== JSON.stringify(sortedStrings(fingerprintIds))) {
          fail(`${command} context.schedulerState commandFingerprints are not canonical`);
        }
        for (const [commandId, value] of Object.entries(fingerprints)) {
          if (!appliedCommandIds.includes(commandId)
            || typeof value !== "string"
            || !/^(?:enqueue|schedule|cancel|complete|handoff):[0-9a-f]{16}$/u.test(value)) {
            fail(`${command} context.schedulerState has an invalid command fingerprint`);
          }
        }
      }

      const reservations = requireArray(state.reservations, `${command} context.schedulerState.reservations`);
      let previousReservation = null;
      reservations.forEach((reservation, index) => {
        const label = `${command} scheduler reservation[${index}]`;
        requireExactKeys(reservation, SCHEDULER_RESERVATION_KEYS, label);
        for (const field of ["taskId", "groupId", "resourceId", "capabilityId"]) {
          requireString(reservation[field], `${label}.${field}`);
        }
        requirePositiveInteger(reservation.units, `${label}.units`);
        requireMinute(reservation.startAt, `${label}.startAt`);
        requireMinute(reservation.endAt, `${label}.endAt`);
        if (reservation.endAt <= reservation.startAt) fail(`${label} must be non-empty`);
        if (previousReservation && schedulerReservationComparator(previousReservation, reservation) > 0) {
          fail(`${command} context.schedulerState reservations are not canonical`);
        }
        const resource = resources[reservation.resourceId];
        const taskRecord = taskById.get(reservation.taskId);
        const group = taskRecord?.groupById.get(reservation.groupId);
        const exactAlternative = group?.anyOf.some((alternative) =>
          alternative.resourceId === reservation.resourceId
          && alternative.capabilityId === reservation.capabilityId
          && alternative.units === reservation.units);
        if (!resource || !taskRecord || !exactAlternative
          || !resource.capabilities.includes(reservation.capabilityId)
          || reservation.units > resource.capacity) {
          fail(`${label} does not match its canonical task and resource`);
        }
        const task = taskRecord.task;
        if (!Number.isSafeInteger(task.startAt) || !Number.isSafeInteger(task.endAt)
          || reservation.startAt < task.startAt || reservation.endAt > task.endAt) {
          fail(`${label} lies outside its task interval`);
        }
        if (resource.unavailableWindows.some((window) => intervalsOverlap(
          reservation.startAt,
          reservation.endAt,
          window.startAt,
          window.endAt
        ))) fail(`${label} overlaps an unavailable window`);
        previousReservation = reservation;
      });

      for (const resourceId of resourceIds) {
        const resource = resources[resourceId];
        const events = [];
        reservations.filter((reservation) => reservation.resourceId === resourceId).forEach((reservation) => {
          events.push({ at: reservation.startAt, delta: reservation.units });
          events.push({ at: reservation.endAt, delta: -reservation.units });
        });
        events.sort((left, right) => left.at - right.at || left.delta - right.delta);
        let occupied = 0;
        for (const event of events) {
          occupied += event.delta;
          if (occupied < 0 || occupied > resource.capacity) {
            fail(`${command} context.schedulerState exceeds ${resourceId} capacity`);
          }
        }
      }
      return state;
    }

    function normalizeStaffAvailabilityProjectionAuthority(value) {
      if (value === undefined) return { schedulerState: null, absenceWindows: [] };
      requireExactKeys(value, STAFF_AVAILABILITY_AUTHORITY_KEYS, "staff availability projection authority");
      const schedulerState = requireCanonicalSchedulerState(
        { schedulerState: value.schedulerState },
        "staff availability projection"
      );
      const absenceWindows = requireArray(
        value.absenceWindows,
        "staff availability projection authority.absenceWindows"
      ).map((window, index) => {
        const label = `staff availability absenceWindows[${index}]`;
        requireExactKeys(window, STAFF_ABSENCE_WINDOW_KEYS, label);
        const staffId = requireString(window.staffId, `${label}.staffId`);
        if (resourceById.get(staffId)?.resourceKind !== "staff") fail(`${label} references unknown staff`);
        const absenceTypeId = requireString(window.absenceTypeId, `${label}.absenceTypeId`);
        const policy = absencePolicyById.get(absenceTypeId);
        if (!policy) fail(`${label} references an unknown P5 absence type`);
        const triggerAuthority = requireString(window.triggerAuthority, `${label}.triggerAuthority`);
        if (triggerAuthority !== policy.triggerAuthority) {
          fail(`${label} trigger authority differs from exact P5 policy`);
        }
        requireMinute(window.startAt, `${label}.startAt`);
        requireMinute(window.endAt, `${label}.endAt`);
        const duration = window.endAt - window.startAt;
        const [minimumDuration, maximumDuration] = policy.durationMinutes;
        if (duration < minimumDuration || duration > maximumDuration) {
          fail(`${label} duration differs from exact P5 absence policy`);
        }
        return clone(window);
      }).sort((left, right) => left.startAt - right.startAt
        || left.endAt - right.endAt
        || compareStrings(left.staffId, right.staffId)
        || compareStrings(left.absenceTypeId, right.absenceTypeId));

      for (let leftIndex = 0; leftIndex < absenceWindows.length; leftIndex += 1) {
        const left = absenceWindows[leftIndex];
        for (let rightIndex = leftIndex + 1; rightIndex < absenceWindows.length; rightIndex += 1) {
          const right = absenceWindows[rightIndex];
          if (right.startAt >= left.endAt) break;
          if (left.staffId === right.staffId
            && intervalsOverlap(left.startAt, left.endAt, right.startAt, right.endAt)) {
            fail(`staff availability absence windows overlap for ${left.staffId}`);
          }
        }
      }
      for (const [absenceTypeId, policy] of absencePolicyById) {
        const events = absenceWindows.filter((window) => window.absenceTypeId === absenceTypeId)
          .flatMap((window) => [
            { at: window.startAt, delta: 1 },
            { at: window.endAt, delta: -1 }
          ])
          .sort((left, right) => left.at - right.at || left.delta - right.delta);
        let concurrent = 0;
        for (const event of events) {
          concurrent += event.delta;
          if (concurrent > policy.maximumConcurrentStaff) {
            fail(`${absenceTypeId} exceeds exact P5 maximumConcurrentStaff`);
          }
        }
      }
      for (const window of absenceWindows) {
        if (schedulerState.reservations.some((reservation) =>
          reservation.resourceId === window.staffId
          && intervalsOverlap(
            reservation.startAt,
            reservation.endAt,
            window.startAt,
            window.endAt
          ))) {
          fail(`absence for ${window.staffId} overlaps already reserved work`);
        }
      }
      return { schedulerState: clone(schedulerState), absenceWindows };
    }

    function validateStaffAvailabilityAuthorityAgainstProjection(authority, projection) {
      for (const reservation of authority.schedulerState?.reservations || []) {
        const staff = projection.resources[reservation.resourceId];
        if (!staff || staff.resourceKind !== "staff") continue;
        const reservationInsideShift = staff.shifts.some((shift) =>
          shift.startAt <= reservation.startAt && reservation.endAt <= shift.endAt);
        if (!staff.hired || staff.hiredAt === null || reservation.startAt < staff.hiredAt
          || (staff.retiredAt !== null && reservation.endAt > staff.retiredAt)
          || !reservationInsideShift) {
          fail(`scheduler reservation for ${reservation.resourceId} is outside an authoritative lifecycle shift`);
        }
      }
      for (const window of authority.absenceWindows) {
        const staff = projection.resources[window.staffId];
        if (!staff?.hired || staff.hiredAt === null || window.startAt < staff.hiredAt
          || (staff.retiredAt !== null && window.endAt > staff.retiredAt)) {
          fail(`absence for ${window.staffId} is outside its hired lifecycle`);
        }
      }
      return authority;
    }

    function reservationsFor(context, resourceId, command) {
      const schedulerState = requireCanonicalSchedulerState(context, command);
      return schedulerState.reservations.filter((reservation) => reservation.resourceId === resourceId);
    }

    function requireCurrentMinute(context, command) {
      if (!Number.isSafeInteger(context?.currentMinute) || context.currentMinute < 0) {
        fail(`${command} requires context.currentMinute`);
      }
      return context.currentMinute;
    }

    function requireEventAtCurrentMinute(context, command, payload, field) {
      const currentMinute = requireCurrentMinute(context, command);
      if (payload[field] !== currentMinute) {
        fail(`${command}.${field} must equal context.currentMinute`);
      }
      return currentMinute;
    }

    function maintenanceDurationFor(resourceId) {
      const resource = resourceById.get(resourceId);
      const equipmentType = requireString(resource?.equipmentType, `${resourceId}.equipmentType`);
      const duration = maintenanceDurationsByEquipmentType[equipmentType];
      if (!Number.isSafeInteger(duration) || duration <= 0) {
        fail(`${resourceId} has no exact authored maintenance duration`);
      }
      return duration;
    }

    function resourceForAsset(projection, assetId, label) {
      const resourceId = assetToResource.get(assetId);
      if (!resourceId) fail(`${label} references unknown asset ${assetId}`);
      return projection.resources[resourceId];
    }

    function applyEffect(projection, command, payload, options) {
      const context = options?.context || {};
      const historical = options?.historical === true;
      if (command === "hire_staff") {
        const staff = projection.resources[payload.staffId];
        if (!staff || staff.resourceKind !== "staff") fail(`unknown staff ${payload.staffId}`);
        if (staff.hired || staff.retiredAt !== null) fail(`${payload.staffId} cannot be hired from its current state`);
        if (!historical) requireEventAtCurrentMinute(context, command, payload, "hiredAt");
        staff.hired = true;
        staff.hiredAt = payload.hiredAt;
        return;
      }
      if (command === "assign_shift") {
        const staff = projection.resources[payload.staffId];
        if (!staff || staff.resourceKind !== "staff" || !staff.hired || staff.retiredAt !== null) {
          fail(`${payload.staffId} must be hired before assigning a shift`);
        }
        if (Object.values(projection.resources).some((resource) => resource.resourceKind === "staff"
          && resource.shifts.some((shift) => shift.shiftId === payload.shiftId))) {
          fail(`duplicate shift ID ${payload.shiftId}`);
        }
        if (!historical && payload.startAt < requireCurrentMinute(context, command)) {
          fail(`${payload.shiftId} cannot start before context.currentMinute`);
        }
        if (payload.startAt < staff.hiredAt) fail(`${payload.shiftId} cannot start before the staff hire record`);
        const shifts = [...staff.shifts, clone(payload)];
        validateShiftSet(staff, shifts, payload.shiftId);
        validateDoctorScheduling(projection, staff, shifts, payload.shiftId);
        staff.shifts = shifts;
        return;
      }
      if (command === "update_shift" || command === "remove_shift") {
        let owner = null;
        let existing = null;
        for (const resource of Object.values(projection.resources)) {
          if (resource.resourceKind !== "staff") continue;
          const found = resource.shifts.find((shift) => shift.shiftId === payload.shiftId);
          if (found) { owner = resource; existing = found; break; }
        }
        if (!owner) fail(`unknown shift ${payload.shiftId}`);
        if (!historical) {
          const currentMinute = requireCurrentMinute(context, command);
          if (existing.startAt <= currentMinute || (command === "update_shift" && payload.startAt <= currentMinute)) {
            fail(`${command} may change only a future shift`);
          }
          if (reservationsFor(context, owner.resourceId, command).some((reservation) =>
            intervalsOverlap(reservation.startAt, reservation.endAt, existing.startAt, existing.endAt)
            || (command === "update_shift"
              && intervalsOverlap(reservation.startAt, reservation.endAt, payload.startAt, payload.endAt)))) {
            fail(`${command} cannot change reserved shift capacity`);
          }
        }
        const shifts = owner.shifts.filter((shift) => shift.shiftId !== payload.shiftId);
        if (command === "update_shift") shifts.push({ ...clone(payload), staffId: owner.resourceId });
        validateShiftSet(owner, shifts, payload.shiftId);
        validateDoctorScheduling(projection, owner, shifts, payload.shiftId);
        owner.shifts = shifts;
        return;
      }
      if (command === "purchase_asset") {
        const resource = resourceForAsset(projection, payload.assetCatalogId, command);
        const crosswalk = crosswalkById.get(resource.resourceId);
        if (resource.owned || resource.retiredAt !== null) fail(`${payload.assetCatalogId} cannot be purchased from its current state`);
        if (payload.price !== crosswalk.economicRecord.purchasePrice) fail(`${payload.assetCatalogId} purchase price differs from P6 authority`);
        if (!historical) {
          requireEventAtCurrentMinute(context, command, payload, "purchasedAt");
          const unlocked = requireArray(context.unlockedAssetCatalogIds, "purchase_asset context.unlockedAssetCatalogIds");
          if (!unlocked.includes(payload.assetCatalogId)) fail(`${payload.assetCatalogId} has no explicit unlock evidence`);
        }
        resource.owned = true;
        resource.purchasedAt = payload.purchasedAt;
        return;
      }
      if (command === "mark_delivery_complete") {
        const resource = resourceForAsset(projection, payload.assetId, command);
        const economics = crosswalkById.get(resource.resourceId).economicRecord;
        if (!resource.owned || resource.delivered || resource.retiredAt !== null) {
          fail(`${payload.assetId} cannot complete delivery from its current state`);
        }
        if (!historical) requireEventAtCurrentMinute(context, command, payload, "deliveredAt");
        const earliestDeliveryAt = resource.purchasedAt === null
          ? null
          : resource.purchasedAt + economics.deliveryDays * dayLengthMinutes;
        if (earliestDeliveryAt !== null && payload.deliveredAt < earliestDeliveryAt) {
          fail(`${payload.assetId} delivery cannot precede its authored delivery interval`);
        }
        resource.delivered = true;
        resource.deliveredAt = payload.deliveredAt;
        return;
      }
      if (command === "complete_training") {
        const resource = resourceForAsset(projection, payload.assetId, command);
        const economics = crosswalkById.get(resource.resourceId).economicRecord;
        const staff = projection.resources[payload.staffId];
        if (resource.resourceKind !== "equipment" || !resource.owned || !resource.delivered || resource.retiredAt !== null) {
          fail(`${payload.assetId} is not a delivered trainable equipment asset`);
        }
        if (!staff || staff.resourceKind !== "staff" || !staff.hired || staff.retiredAt !== null) {
          fail(`${payload.staffId} must be hired before training completion`);
        }
        if (!historical) requireEventAtCurrentMinute(context, command, payload, "completedAt");
        const earliestTrainingCompletion = resource.deliveredAt === null
          ? null
          : resource.deliveredAt + economics.trainingMinutes;
        if (earliestTrainingCompletion !== null && payload.completedAt < earliestTrainingCompletion) {
          fail(`${payload.assetId} training cannot precede its authored training interval`);
        }
        if (resource.trainedStaffIds.includes(payload.staffId)) fail(`${payload.staffId} already has training for ${payload.assetId}`);
        resource.trainedStaffIds = sortedStrings([...resource.trainedStaffIds, payload.staffId]);
        resource.trainingCompletedAtByStaff[payload.staffId] = payload.completedAt;
        return;
      }
      if (command === "mark_room_ready") {
        const resource = projection.resources[payload.roomId];
        const economics = crosswalkById.get(payload.roomId)?.economicRecord;
        if (!resource || resource.resourceKind !== "room" || !resource.owned || !resource.delivered
          || resource.ready || resource.retiredAt !== null) {
          fail(`${payload.roomId} cannot become ready from its current state`);
        }
        if (!historical) requireEventAtCurrentMinute(context, command, payload, "readyAt");
        const earliestReadyAt = resource.deliveredAt === null
          ? null
          : resource.deliveredAt + economics.readyingDays * dayLengthMinutes;
        if (earliestReadyAt !== null && payload.readyAt < earliestReadyAt) {
          fail(`${payload.roomId} readiness cannot precede its authored readying interval`);
        }
        resource.ready = true;
        resource.readyAt = payload.readyAt;
        return;
      }
      if (command === "start_maintenance") {
        const resource = resourceForAsset(projection, payload.assetId, command);
        if (resource.resourceKind !== "equipment" || !resource.owned || !resource.delivered || resource.retiredAt !== null) {
          fail(`${payload.assetId} is not maintainable equipment`);
        }
        if (resource.deliveredAt !== null && payload.startAt < resource.deliveredAt) {
          fail(`${payload.assetId} maintenance cannot precede delivery`);
        }
        if (!historical) {
          requireEventAtCurrentMinute(context, command, payload, "startAt");
          const expectedEndAt = payload.startAt + maintenanceDurationFor(resource.resourceId);
          if (payload.endAt !== expectedEndAt) {
            fail(`${payload.assetId} maintenance interval differs from the authored equipment-type duration`);
          }
        }
        if (resource.maintenanceWindows.some((window) => window.completedAt === null
          || intervalsOverlap(window.startAt, window.endAt, payload.startAt, payload.endAt))) {
          fail(`${payload.assetId} already has conflicting maintenance`);
        }
        if (!historical && reservationsFor(context, resource.resourceId, command).some((reservation) =>
          intervalsOverlap(reservation.startAt, reservation.endAt, payload.startAt, payload.endAt))) {
          fail(`${payload.assetId} maintenance overlaps a reservation`);
        }
        resource.maintenanceWindows.push({ startAt: payload.startAt, endAt: payload.endAt, completedAt: null });
        return;
      }
      if (command === "complete_maintenance") {
        const resource = resourceForAsset(projection, payload.assetId, command);
        const economics = crosswalkById.get(resource.resourceId).economicRecord;
        if (resource.resourceKind !== "equipment" || resource.retiredAt !== null) fail(`${payload.assetId} is not maintainable equipment`);
        const open = [...resource.maintenanceWindows].reverse().find((window) => window.completedAt === null);
        if (!open) fail(`${payload.assetId} has no matching active maintenance`);
        if (!historical) {
          requireEventAtCurrentMinute(context, command, payload, "completedAt");
          if (payload.completedAt !== open.endAt) {
            fail(`${payload.assetId} maintenance must complete at its exact authored end minute`);
          }
        } else if (payload.completedAt !== open.endAt) {
          fail(`${payload.assetId} historical maintenance completion differs from its scheduled end`);
        }
        if (!historical && reservationsFor(context, resource.resourceId, command).some((reservation) =>
          intervalsOverlap(reservation.startAt, reservation.endAt, open.startAt, open.endAt))) {
          fail(`${payload.assetId} completed maintenance overlaps a reservation`);
        }
        const expectedNextDueAt = payload.completedAt + economics.maintenanceIntervalDays * dayLengthMinutes;
        if (payload.nextDueAt !== expectedNextDueAt) {
          fail(`${payload.assetId} next maintenance due time differs from P6 authority`);
        }
        open.completedAt = payload.completedAt;
        resource.maintenanceCurrent = true;
        resource.nextDueAt = payload.nextDueAt;
        resource.maintenanceRecords.push({
          completedAt: payload.completedAt,
          nextDueAt: payload.nextDueAt,
          evidenceId: payload.commandId
        });
        return;
      }
      if (command === "receive_stock") {
        if (!hasOwn(projection.inventory, payload.categoryId)) fail(`unknown inventory category ${payload.categoryId}`);
        if (!historical) requireEventAtCurrentMinute(context, command, payload, "receivedAt");
        projection.inventory[payload.categoryId] += payload.units;
        return;
      }
      if (command === "consume_stock") {
        if (!hasOwn(projection.inventory, payload.categoryId)) fail(`unknown inventory category ${payload.categoryId}`);
        if (!historical) {
          requireExactKeys(
            context.stockReservation,
            ["reservationId", "taskId", "categoryId", "units"],
            "consume_stock context.stockReservation"
          );
          requireString(context.stockReservation.taskId, "consume_stock stockReservation.taskId");
          requireString(context.stockReservation.reservationId, "consume_stock stockReservation.reservationId");
          requireString(context.stockReservation.categoryId, "consume_stock stockReservation.categoryId");
          requirePositiveInteger(context.stockReservation.units, "consume_stock stockReservation.units");
          if (context.stockReservation.reservationId !== payload.reservationId
            || context.stockReservation.categoryId !== payload.categoryId
            || context.stockReservation.units !== payload.units) {
            fail("consume_stock reservation evidence differs from the command payload");
          }
        }
        if (projection.consumedReservationIds.includes(payload.reservationId)) fail(`reservation ${payload.reservationId} already consumed stock`);
        if (projection.inventory[payload.categoryId] < payload.units) fail(`insufficient ${payload.categoryId} inventory`);
        projection.inventory[payload.categoryId] -= payload.units;
        projection.consumedReservationIds.push(payload.reservationId);
        projection.consumedReservationIds.sort((left, right) => left.localeCompare(right, "en"));
        return;
      }
      if (command === "retire_asset") {
        const resource = resourceForAsset(projection, payload.assetId, command);
        if (!resource.owned || resource.retiredAt !== null) fail(`${payload.assetId} cannot be retired from its current state`);
        if (!historical) requireEventAtCurrentMinute(context, command, payload, "retiredAt");
        if (resource.purchasedAt !== null && payload.retiredAt < resource.purchasedAt) {
          fail(`${payload.assetId} retirement cannot precede purchase`);
        }
        if (!historical && reservationsFor(context, resource.resourceId, command)
          .some((reservation) => reservation.endAt > payload.retiredAt)) {
          fail(`${payload.assetId} cannot retire while future reservations exist`);
        }
        if (resource.resourceId === "room.consult.2") {
          validateSecondConsultRetirement(projection, payload.retiredAt, payload.assetId);
        }
        resource.retiredAt = payload.retiredAt;
        return;
      }
      fail(`unsupported lifecycle command ${command}`);
    }

    function createState() {
      return normalizeState(createEmptyState());
    }

    function validateState(state) {
      try {
        normalizeState(state);
        return { valid: true, errors: [] };
      } catch (error) {
        return { valid: false, errors: [error.message] };
      }
    }

    function serializeState(state) {
      return JSON.stringify(normalizeState(state));
    }

    function deserializeState(serialized) {
      if (typeof serialized !== "string" || !serialized.trim()) fail("serialized lifecycle state must be non-empty JSON");
      let parsed;
      try { parsed = JSON.parse(serialized); }
      catch (error) { fail(`cannot parse lifecycle state: ${error.message}`); }
      return normalizeState(parsed);
    }

    function execute(stateValue, command, rawPayload, context = {}) {
      const state = normalizeState(stateValue);
      const payload = normalizePayload(command, rawPayload);
      const commandFingerprint = fingerprint({ command, payload });
      const previous = state.commands.find((entry) => entry.payload.commandId === payload.commandId);
      if (previous) {
        if (previous.fingerprint !== commandFingerprint
          || canonicalJson({ command: previous.command, payload: previous.payload })
            !== canonicalJson({ command, payload })) {
          fail(`command ID ${payload.commandId} was already applied with different content`);
        }
        return {
          state: clone(state),
          command: clone(previous),
          snapshot: snapshot(state, context.currentMinute ?? 0),
          idempotent: true
        };
      }
      const projection = replay(state.commands, { historical: true, context: {} });
      applyEffect(projection, command, payload, { historical: false, context });
      const next = normalizeState({
        ...state,
        commands: [...state.commands, { command, payload, fingerprint: commandFingerprint }]
      });
      return {
        state: next,
        command: clone(next.commands[next.commands.length - 1]),
        snapshot: snapshot(next, context.currentMinute ?? 0),
        idempotent: false
      };
    }

    function maintenanceRecordAt(resource, at) {
      return [...(resource.maintenanceRecords || [])]
        .filter((record) => record.completedAt <= at)
        .sort((left, right) => right.completedAt - left.completedAt)
        .find((record) => at < record.nextDueAt) || null;
    }

    function materializeResource(resource, at) {
      const materialized = clone(resource);
      if (resource.resourceKind === "staff") {
        materialized.hired = resource.hired && resource.hiredAt !== null && resource.hiredAt <= at;
        return materialized;
      }
      materialized.owned = resource.owned && resource.purchasedAt !== null && resource.purchasedAt <= at;
      materialized.delivered = resource.delivered && resource.deliveredAt !== null && resource.deliveredAt <= at;
      if (resource.resourceKind === "room") {
        materialized.ready = resource.ready && resource.readyAt !== null && resource.readyAt <= at;
      } else {
        materialized.trainedStaffIds = sortedStrings(Object.entries(resource.trainingCompletedAtByStaff || {})
          .filter(([, completedAt]) => completedAt <= at)
          .map(([staffId]) => staffId));
        const maintenance = maintenanceRecordAt(resource, at);
        materialized.maintenanceCurrent = Boolean(maintenance);
        const latestMaintenance = [...(resource.maintenanceRecords || [])]
          .filter((record) => record.completedAt <= at)
          .sort((left, right) => right.completedAt - left.completedAt)[0] || null;
        materialized.nextDueAt = latestMaintenance?.nextDueAt ?? null;
      }
      return materialized;
    }

    function mandatoryRestWindows(resource, startAt, endAt) {
      if (resource.resourceKind !== "staff") return [];
      const restMinutes = staffEconomics(resource.resourceId).mandatoryRestMinutes;
      return mergeWindows(resource.shifts.map((shift) => ({
        startAt: Math.max(startAt, shift.endAt),
        endAt: Math.min(endAt, shift.endAt + restMinutes)
      })));
    }

    function staffAvailabilityStateAt(resourceValue, at, authority) {
      const resource = materializeResource(resourceValue, at);
      if (!resource.hired || (resource.retiredAt !== null && resource.retiredAt <= at)) return "not_hired";
      if (authority.absenceWindows.some((window) =>
        window.staffId === resource.resourceId && window.startAt <= at && at < window.endAt)) {
        return "absent";
      }
      const activeShift = resource.shifts.find((shift) => shift.startAt <= at && at < shift.endAt);
      if (activeShift) {
        const reserved = authority.schedulerState?.reservations.some((reservation) =>
          reservation.resourceId === resource.resourceId
          && reservation.startAt <= at
          && at < reservation.endAt);
        return reserved ? "busy" : "available";
      }
      if (mandatoryRestWindows(resource, 0, at + 1)
        .some((window) => window.startAt <= at && at < window.endAt)) {
        return "resting";
      }
      return "hired_unscheduled";
    }

    function isResourceActive(resourceValue, at, authority = { schedulerState: null, absenceWindows: [] }) {
      const resource = materializeResource(resourceValue, at);
      if (resource.retiredAt !== null && resource.retiredAt <= at) return false;
      if (resource.resourceKind === "staff") {
        return ["available", "busy"].includes(staffAvailabilityStateAt(resourceValue, at, authority));
      }
      if (!resource.owned || !resource.delivered) return false;
      if (resource.resourceKind === "room") return resource.ready;
      if (resource.trainedStaffIds.length === 0 || !resource.maintenanceCurrent) return false;
      if (resource.nextDueAt !== null && at >= resource.nextDueAt) return false;
      return !resource.maintenanceWindows.some((window) => window.startAt <= at && at < window.endAt);
    }

    function snapshot(stateValue, at = 0, rawAvailabilityAuthority) {
      requireMinute(at, "snapshot minute");
      const state = normalizeState(stateValue);
      const projection = replay(state.commands, { historical: true, context: {} });
      const availabilityAuthority = validateStaffAvailabilityAuthorityAgainstProjection(
        normalizeStaffAvailabilityProjectionAuthority(rawAvailabilityAuthority),
        projection
      );
      const resources = Object.fromEntries(Object.entries(projection.resources)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([resourceId, resource]) => {
          const materialized = materializeResource(resource, at);
          if (resource.resourceKind === "staff") {
            const staffAvailabilityState = staffAvailabilityStateAt(resource, at, availabilityAuthority);
            if (!STAFF_AVAILABILITY_STATES.includes(staffAvailabilityState)) {
              fail(`${resourceId} projected an unsupported staff availability state`);
            }
            return [resourceId, {
              ...materialized,
              staffAvailabilityState,
              active: ["available", "busy"].includes(staffAvailabilityState)
            }];
          }
          return [resourceId, { ...materialized, active: isResourceActive(resource, at) }];
        }));
      return {
        schemaVersion: SCHEMA_VERSION,
        catalogVersion: CATALOG_VERSION,
        at,
        resources,
        inventory: clone(projection.inventory),
        consumedReservationIds: clone(projection.consumedReservationIds),
        activeResourceIds: Object.values(resources).filter((resource) => resource.active).map((resource) => resource.resourceId),
        commandCount: state.commands.length
      };
    }

    function complementWindows(shifts, startAt, endAt) {
      const windows = [];
      let cursor = startAt;
      const clipped = shifts.map((shift) => ({
        startAt: Math.max(startAt, shift.startAt),
        endAt: Math.min(endAt, shift.endAt)
      })).filter((shift) => shift.endAt > shift.startAt)
        .sort((left, right) => left.startAt - right.startAt || left.endAt - right.endAt);
      for (const shift of clipped) {
        if (cursor < shift.startAt) windows.push({ startAt: cursor, endAt: shift.startAt });
        cursor = Math.max(cursor, shift.endAt);
      }
      if (cursor < endAt) windows.push({ startAt: cursor, endAt });
      return windows;
    }

    function evidenceActivationAt(resource) {
      if (resource.resourceKind === "room") {
        if (!resource.owned || !resource.delivered || !resource.ready) return null;
        return Math.max(resource.purchasedAt, resource.deliveredAt, resource.readyAt);
      }
      if (!resource.owned || !resource.delivered) return null;
      const trainingTimes = Object.values(resource.trainingCompletedAtByStaff || {});
      if (trainingTimes.length === 0) return null;
      return Math.max(resource.purchasedAt, resource.deliveredAt, Math.min(...trainingTimes));
    }

    function maintenanceUnavailableWindows(resource, startAt, endAt, activationAt) {
      const valid = mergeWindows((resource.maintenanceRecords || []).map((record) => ({
        startAt: Math.max(startAt, activationAt, record.completedAt),
        endAt: Math.min(endAt, record.nextDueAt)
      })));
      return complementWindows(valid, startAt, endAt);
    }

    function projectSchedulerResources(stateValue, horizon, rawAvailabilityAuthority) {
      requireExactKeys(horizon, ["startAt", "endAt"], "scheduler projection horizon");
      requireMinute(horizon.startAt, "scheduler horizon.startAt");
      requireMinute(horizon.endAt, "scheduler horizon.endAt");
      if (horizon.endAt <= horizon.startAt) fail("scheduler projection horizon must be non-empty");
      const state = normalizeState(stateValue);
      const projection = replay(state.commands, { historical: true, context: {} });
      const availabilityAuthority = validateStaffAvailabilityAuthorityAgainstProjection(
        normalizeStaffAvailabilityProjectionAuthority(rawAvailabilityAuthority),
        projection
      );
      return resourceCatalog.resources.map((catalogResource) => {
        const resource = projection.resources[catalogResource.resourceId];
        let unavailable = clone(catalogResource.runtimeResourceTemplate.unavailableWindows || []);
        if (resource.resourceKind === "staff") {
          unavailable.push(...(resource.hired && resource.retiredAt === null
            ? complementWindows(resource.shifts, horizon.startAt, horizon.endAt)
            : [{ ...horizon }]));
          unavailable.push(...availabilityAuthority.absenceWindows
            .filter((window) => window.staffId === resource.resourceId)
            .map((window) => ({
              startAt: Math.max(horizon.startAt, window.startAt),
              endAt: Math.min(horizon.endAt, window.endAt)
            })));
        } else {
          const activationAt = evidenceActivationAt(resource);
          if (activationAt === null) {
            unavailable.push({ ...horizon });
          } else {
            if (activationAt > horizon.startAt) {
              unavailable.push({ startAt: horizon.startAt, endAt: Math.min(horizon.endAt, activationAt) });
            }
            if (resource.resourceKind === "equipment") {
              unavailable.push(...maintenanceUnavailableWindows(
                resource,
                horizon.startAt,
                horizon.endAt,
                activationAt
              ));
              unavailable.push(...resource.maintenanceWindows.map((window) => ({
                startAt: window.startAt,
                endAt: window.endAt
              })));
            }
          }
        }
        if (resource.retiredAt !== null && resource.retiredAt < horizon.endAt) {
          unavailable.push({ startAt: Math.max(horizon.startAt, resource.retiredAt), endAt: horizon.endAt });
        }
        return {
          ...clone(catalogResource.runtimeResourceTemplate),
          unavailableWindows: mergeWindows(unavailable)
        };
      });
    }

    return Object.freeze({
      SCHEMA_VERSION,
      CATALOG_VERSION,
      commandNames: Object.freeze(Object.keys(COMMAND_CONTRACT)),
      staffAvailabilityStates: Object.freeze([...STAFF_AVAILABILITY_STATES]),
      createState,
      normalizeState,
      validateState,
      serializeState,
      deserializeState,
      execute,
      snapshot,
      normalizeStaffAvailabilityProjectionAuthority,
      projectSchedulerResources
    });
  }

  return Object.freeze({
    SCHEMA_VERSION,
    CATALOG_VERSION,
    COMMAND_CONTRACT,
    INITIAL_ACTIVE_PHYSICAL_IDS,
    createResourceLifecycleRuntime
  });
});
