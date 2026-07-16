(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_P9_VISUAL_STATE_ADAPTER_V2 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const CATALOG_VERSION = "2026.07.16.2";
  const ADAPTER_ID = "vetgeme-p9-visual-state-adapter-v2";
  const ADAPTER_VERSION = "2026.07.16.2";
  const CONFIG_KEYS = Object.freeze([
    "roomCatalog",
    "equipmentCatalog",
    "staffCatalog",
    "hudContract",
    "resourceCatalog",
    "assetCrosswalk",
    "schedulerAuthority"
  ]);
  const INPUT_KEYS = Object.freeze([
    "schemaVersion",
    "at",
    "lifecycleSnapshot",
    "schedulerState",
    "preparationSignals",
    "stockSignals",
    "hudAuthorities",
    "transitionNotice",
    "presentation"
  ]);
  const PREPARATION_STATES = Object.freeze([
    "pending_delivery",
    "delivered_not_ready",
    "training_pending"
  ]);
  const REQUIRED_ROOM_STATES = Object.freeze([
    "not_owned", "pending_delivery", "delivered_not_ready", "ready", "busy"
  ]);
  const REQUIRED_EQUIPMENT_STATES = Object.freeze([
    "not_owned", "pending_delivery", "delivered_not_ready", "training_pending",
    "maintenance_due", "maintenance_active", "stock_blocked", "ready", "busy"
  ]);
  const REQUIRED_STAFF_STATES = Object.freeze([
    "not_hired", "hired_unscheduled", "scheduled", "busy", "resting", "absent"
  ]);
  const EXPECTED_SCENE_ROOM_IDS = Object.freeze([
    "room.consult.1", "room.lab.basic", "room.reception.1", "room.waiting.1"
  ]);
  const TARGET_SCENE_LAYOUT_SHA256 =
    "de71c885b5f54b2a199b65228a0000106d8be02e6a0b61b8141ed533ee2eec90";
  const REQUIRED_ROOM_OVERLAY_ASSET_IDS = Object.freeze([
    "progression.locked-door-overlay",
    "progression.delivery-pallet",
    "progression.stacked-boxes",
    "progression.opened-crates",
    "progression.covered-equipment"
  ]);
  const RAW_NAMESPACE_PATTERN = /\b(?:asset|capability|case|equipment|event|family|investigation|owner|patient|presentation|resource|room|staff|task|variant)\.[A-Za-z0-9._:-]+\b/u;
  const RAW_SNAKE_CASE_PATTERN = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/u;
  const FORBIDDEN_PLAYER_KEY_PATTERN = /(?:^reasonCode$|^reason_code$|(?:Id|Ids)$|(?:_id|_ids)$)/u;

  function fail(message) {
    throw new Error(`P9 visual-state adapter rejected input: ${message}`);
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function own(value, key) {
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

  function requireBoolean(value, label) {
    if (typeof value !== "boolean") fail(`${label} must be a boolean`);
    return value;
  }

  function requireMinute(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a non-negative campaign minute`);
    return value;
  }

  function requireNonNegativeNumber(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      fail(`${label} must be a finite non-negative number`);
    }
    return value;
  }

  function requirePositiveNumber(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      fail(`${label} must be a finite positive number`);
    }
    return value;
  }

  function requireExactKeys(value, expectedKeys, label) {
    requireObject(value, label);
    const actual = Object.keys(value).sort();
    const expected = [...expectedKeys].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(`${label} fields must be exactly ${expected.join(", ")}`);
    }
  }

  function validateJsonValue(value, label, ancestors = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail(`${label} must not contain a non-finite number`);
      return;
    }
    if (typeof value !== "object") fail(`${label} must contain JSON-serializable values only`);
    if (ancestors.has(value)) fail(`${label} must not contain cycles`);
    ancestors.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => validateJsonValue(item, `${label}[${index}]`, ancestors));
    } else {
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
        fail(`${label} must contain plain JSON objects only`);
      }
      Object.entries(value).forEach(([key, item]) => validateJsonValue(item, `${label}.${key}`, ancestors));
    }
    ancestors.delete(value);
  }

  function cloneJson(value, label) {
    validateJsonValue(value, label);
    return JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function sorted(values) {
    return [...values].sort((left, right) => left.localeCompare(right, "en"));
  }

  function sameStrings(left, right) {
    return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
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

  function validateCatalog(catalog, expectedId, arrayKey, expectedCount, label) {
    requireObject(catalog, label);
    if (catalog.schemaVersion !== SCHEMA_VERSION
      || catalog.catalogId !== expectedId
      || catalog.catalogVersion !== CATALOG_VERSION
      || catalog.runtimeEligible !== false) {
      fail(`${label} identity or review-only boundary changed`);
    }
    const records = requireArray(catalog[arrayKey], `${label}.${arrayKey}`);
    if (records.length !== expectedCount) fail(`${label} must contain exactly ${expectedCount} records`);
    return records;
  }

  function validateVisualStates(record, requiredStates, label) {
    const states = requireObject(record.visualStates, `${label}.visualStates`);
    if (!sameStrings(Object.keys(states), requiredStates)) {
      fail(`${label}.visualStates must contain the exact authored state set`);
    }
    requiredStates.forEach((state) => requireObject(states[state], `${label}.visualStates.${state}`));
  }

  function collectReferencedAssetIds(roomRecords, equipmentRecords, staffRecords) {
    const referenced = new Set();
    function collectRecord(record) {
      (record.baseAssetIds || []).forEach((assetId) => referenced.add(requireString(assetId, "base asset ID")));
      Object.values(record.visualStates || {}).forEach((state) => {
        (state.overlayAssetIds || []).forEach((assetId) => referenced.add(requireString(assetId, "overlay asset ID")));
      });
    }
    roomRecords.forEach(collectRecord);
    equipmentRecords.forEach(collectRecord);
    staffRecords.forEach((record) => {
      (record.candidateAssetIds || []).forEach((assetId) => referenced.add(requireString(assetId, "staff asset ID")));
    });
    return referenced;
  }

  function validatePlayerFacingValue(value, label) {
    if (typeof value === "string") {
      if (/reasonCode|reason_code/u.test(value)
        || RAW_NAMESPACE_PATTERN.test(value)
        || RAW_SNAKE_CASE_PATTERN.test(value)) {
        fail(`${label} exposes a raw identifier or reasonCode`);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => validatePlayerFacingValue(item, `${label}[${index}]`));
      return;
    }
    if (!isObject(value)) return;
    Object.entries(value).forEach(([key, item]) => {
      if (FORBIDDEN_PLAYER_KEY_PATTERN.test(key)) fail(`${label}.${key} is a player-facing raw identifier field`);
      validatePlayerFacingValue(item, `${label}.${key}`);
    });
  }

  function createP9VisualStateAdapter(rawConfig) {
    requireExactKeys(rawConfig, CONFIG_KEYS, "adapter config");
    const schedulerAuthority = requireObject(rawConfig.schedulerAuthority, "schedulerAuthority");
    if (schedulerAuthority.SCHEMA_VERSION !== SCHEMA_VERSION
      || typeof schedulerAuthority.validateState !== "function"
      || typeof schedulerAuthority.normalizeState !== "function") {
      fail("schedulerAuthority must be the P5 resource scheduler v1 validation authority");
    }
    const config = cloneJson({
      roomCatalog: rawConfig.roomCatalog,
      equipmentCatalog: rawConfig.equipmentCatalog,
      staffCatalog: rawConfig.staffCatalog,
      hudContract: rawConfig.hudContract,
      resourceCatalog: rawConfig.resourceCatalog,
      assetCrosswalk: rawConfig.assetCrosswalk
    }, "adapter config catalogs");

    const roomRecords = validateCatalog(
      config.roomCatalog,
      "vetgeme-p9-room-visual-states",
      "rooms",
      12,
      "room catalog"
    );
    const equipmentRecords = validateCatalog(
      config.equipmentCatalog,
      "vetgeme-p9-equipment-visual-states",
      "equipment",
      27,
      "equipment catalog"
    );
    const staffRecords = validateCatalog(
      config.staffCatalog,
      "vetgeme-p9-staff-visual-states",
      "staff",
      10,
      "staff catalog"
    );
    const hudRecords = validateCatalog(
      config.hudContract,
      "vetgeme-p9-hud-data-contract",
      "persistentSurfaces",
      9,
      "HUD contract"
    );
    const resourceRecords = validateCatalog(
      config.resourceCatalog,
      "vetgeme-p5-resource-catalog",
      "resources",
      49,
      "P5 resource catalog"
    );

    const roomById = uniqueMap(roomRecords, "resourceId", "room catalog rooms");
    const equipmentById = uniqueMap(equipmentRecords, "resourceId", "equipment catalog equipment");
    const staffById = uniqueMap(staffRecords, "resourceId", "staff catalog staff");
    const hudById = uniqueMap(hudRecords, "surfaceId", "HUD contract surfaces");
    const resourceById = uniqueMap(resourceRecords, "resourceId", "P5 resource catalog resources");

    roomRecords.forEach((record) => validateVisualStates(record, REQUIRED_ROOM_STATES, record.resourceId));
    equipmentRecords.forEach((record) => validateVisualStates(record, REQUIRED_EQUIPMENT_STATES, record.resourceId));
    staffRecords.forEach((record) => validateVisualStates(record, REQUIRED_STAFF_STATES, record.resourceId));

    const resourcesByKind = {
      room: resourceRecords.filter((record) => record.resourceKind === "room").map((record) => record.resourceId),
      equipment: resourceRecords.filter((record) => record.resourceKind === "equipment").map((record) => record.resourceId),
      staff: resourceRecords.filter((record) => record.resourceKind === "staff").map((record) => record.resourceId)
    };
    if (!sameStrings(roomById.keys(), resourcesByKind.room)
      || !sameStrings(equipmentById.keys(), resourcesByKind.equipment)
      || !sameStrings(staffById.keys(), resourcesByKind.staff)) {
      fail("P9 room/equipment/staff IDs do not exactly join the 49-resource P5 catalog");
    }

    const crosswalk = requireObject(config.assetCrosswalk, "asset crosswalk");
    if (crosswalk.schemaVersion !== 1
      || crosswalk.crosswalkId !== "vetgeme-p9-runtime-v2-asset-crosswalk"
      || crosswalk.crosswalkVersion !== CATALOG_VERSION
      || crosswalk.runtimeEligible !== false
      || crosswalk.targetSceneLayoutSha256 !== TARGET_SCENE_LAYOUT_SHA256
      || crosswalk.unplacedPolicy !== "dom_fallback_only_no_coordinate_inference") {
      fail("asset crosswalk identity or fail-closed boundary changed");
    }
    const aliasBySource = uniqueMap(crosswalk.assetAliases, "sourceAssetId", "asset crosswalk aliases");
    const referencedAssetIds = collectReferencedAssetIds(roomRecords, equipmentRecords, staffRecords);
    if (aliasBySource.size !== 31 || !sameStrings(aliasBySource.keys(), referencedAssetIds)) {
      fail("asset crosswalk must join the exact 31 P9 referenced asset IDs");
    }
    aliasBySource.forEach((record, sourceAssetId) => {
      requireString(record.targetAssetId, `${sourceAssetId}.targetAssetId`);
      requireString(record.evidence, `${sourceAssetId}.evidence`);
    });
    REQUIRED_ROOM_OVERLAY_ASSET_IDS.forEach((assetId) => {
      if (aliasBySource.get(assetId)?.targetAssetId !== assetId) {
        fail(`${assetId} room overlay anchor target must remain exact`);
      }
    });

    const sceneBindings = requireObject(crosswalk.sceneBindings, "asset crosswalk.sceneBindings");
    const roomBindings = requireArray(sceneBindings.rooms, "sceneBindings.rooms");
    const equipmentBindings = requireArray(sceneBindings.equipment, "sceneBindings.equipment");
    const staffBindings = requireArray(sceneBindings.staff, "sceneBindings.staff");
    if (roomBindings.length !== 4
      || !sameStrings(roomBindings.map((record) => record.resourceId), EXPECTED_SCENE_ROOM_IDS)) {
      fail("Canvas room bindings must be exactly the four already placed runtime-v2 rooms");
    }
    if (equipmentBindings.length !== 1
      || equipmentBindings[0].resourceId !== "equipment.microscope"
      || !sameStrings(equipmentBindings[0].placementIds, ["lab-microscope"])) {
      fail("Canvas equipment binding must be exactly the existing microscope placement");
    }
    if (staffBindings.length !== 0) fail("staff Canvas placement cannot be inferred without an explicit binding");
    const sceneRoomIds = new Set();
    roomBindings.forEach((binding, index) => {
      requireExactKeys(
        binding,
        ["resourceId", "sceneRoomId", "placementIds", "overlayAnchors"],
        `sceneBindings.rooms[${index}]`
      );
      if (!roomById.has(binding.resourceId)) fail(`scene binding references unknown room ${binding.resourceId}`);
      const sceneRoomId = requireString(binding.sceneRoomId, `sceneBindings.rooms[${index}].sceneRoomId`);
      if (sceneRoomIds.has(sceneRoomId)) fail(`duplicate sceneRoomId ${sceneRoomId}`);
      sceneRoomIds.add(sceneRoomId);
      requireArray(binding.placementIds, `sceneBindings.rooms[${index}].placementIds`)
        .forEach((placementId) => requireString(placementId, "room placement ID"));
      const anchors = uniqueMap(
        binding.overlayAnchors,
        "assetId",
        `sceneBindings.rooms[${index}].overlayAnchors`
      );
      if (!sameStrings(anchors.keys(), REQUIRED_ROOM_OVERLAY_ASSET_IDS)) {
        fail(`${binding.resourceId} must provide explicit anchors for all five room overlay assets`);
      }
      anchors.forEach((anchor, assetId) => {
        requireExactKeys(anchor, ["assetId", "x", "y", "zFootY", "scale"], `${binding.resourceId}.${assetId}`);
        requireNonNegativeNumber(anchor.x, `${binding.resourceId}.${assetId}.x`);
        requireNonNegativeNumber(anchor.y, `${binding.resourceId}.${assetId}.y`);
        requireNonNegativeNumber(anchor.zFootY, `${binding.resourceId}.${assetId}.zFootY`);
        requirePositiveNumber(anchor.scale, `${binding.resourceId}.${assetId}.scale`);
      });
    });

    const targetAssetId = (sourceAssetId) => aliasBySource.get(sourceAssetId).targetAssetId;
    const roomBindingByResourceId = new Map(roomBindings.map((record) => [record.resourceId, record]));
    const equipmentBindingByResourceId = new Map(equipmentBindings.map((record) => [record.resourceId, record]));
    const equipmentPlacementIds = new Set(equipmentBindings.flatMap((record) => record.placementIds));

    function activeReservationResourceIds(schedulerState, at) {
      const state = requireObject(schedulerState, "schedulerState");
      const validation = schedulerAuthority.validateState(state);
      if (!validation || validation.valid !== true) {
        const detail = Array.isArray(validation?.errors) && validation.errors[0]
          ? `: ${validation.errors[0]}`
          : "";
        fail(`schedulerState is not canonical P5 reservation authority${detail}`);
      }
      const normalized = schedulerAuthority.normalizeState(state);
      const taskById = new Map(normalized.tasks.map((task) => [task.id, task]));
      const active = new Set();
      normalized.reservations.forEach((reservation) => {
        const task = taskById.get(reservation.taskId);
        if (task.status === "active"
          && task.startAt <= at && at < task.endAt
          && reservation.startAt <= at && at < reservation.endAt) {
          active.add(reservation.resourceId);
        }
      });
      return active;
    }

    function signalMap(records, allowedIds, label, validator) {
      const output = new Map();
      requireArray(records, label).forEach((record, index) => {
        requireObject(record, `${label}[${index}]`);
        const resourceId = requireString(record.resourceId, `${label}[${index}].resourceId`);
        if (!allowedIds.has(resourceId)) fail(`${label} references non-equipment resource ${resourceId}`);
        if (output.has(resourceId)) fail(`${label} contains duplicate ${resourceId}`);
        validator(record, `${label}[${index}]`);
        output.set(resourceId, record);
      });
      return output;
    }

    function unavailableProjection(record, kind, reason) {
      return {
        resourceId: record.resourceId,
        resourceKind: kind,
        title: record.title || record.name || resourceById.get(record.resourceId)?.title || "Ресурс",
        state: "unavailable",
        stateLabel: reason,
        visibleInClinic: false,
        showBase: false,
        overlayAssetIds: [],
        baseAssetIds: (record.baseAssetIds || record.candidateAssetIds || []).map(targetAssetId),
        renderMode: roomBindingByResourceId.has(record.resourceId)
          || equipmentBindingByResourceId.has(record.resourceId) ? "canvas" : "dom_fallback",
        fallbackLabel: reason,
        variantLabel: record.variantLabelRequired === true || record.sharedShellVariant === true
          ? record.title : null
      };
    }

    function visualProjection(record, kind, state) {
      const authored = record.visualStates[state];
      if (!authored) return unavailableProjection(record, kind, "Состояние недоступно — нужна проверка");
      const fallback = record.missingAssetFallback?.label || null;
      const visibleInClinic = own(authored, "visibleInClinic")
        ? authored.visibleInClinic
        : authored.showBase !== false;
      return {
        resourceId: record.resourceId,
        resourceKind: kind,
        title: record.title || record.name || resourceById.get(record.resourceId)?.title || "Ресурс",
        state,
        stateLabel: authored.label || authored.statusLabel || authored.rosterLabel || "Статус не указан",
        visibleInClinic,
        showBase: authored.showBase === true || (kind === "staff" && authored.visibleInClinic === true),
        overlayAssetIds: (authored.overlayAssetIds || []).map(targetAssetId),
        baseAssetIds: (record.baseAssetIds || record.candidateAssetIds || []).map(targetAssetId),
        renderMode: roomBindingByResourceId.has(record.resourceId)
          || equipmentBindingByResourceId.has(record.resourceId) ? "canvas" : "dom_fallback",
        fallbackLabel: fallback,
        variantLabel: record.variantLabelRequired === true || record.sharedShellVariant === true
          ? record.title : null
      };
    }

    function roomState(record, lifecycle, busyResourceIds, at) {
      if (!isObject(lifecycle) || lifecycle.resourceKind !== "room") {
        return unavailableProjection(record, "room", "Состояние помещения недоступно — нужна проверка");
      }
      if (lifecycle.retiredAt !== null && lifecycle.retiredAt !== undefined) {
        requireMinute(lifecycle.retiredAt, `${record.resourceId}.retiredAt`);
        if (lifecycle.retiredAt <= at) {
          return unavailableProjection(record, "room", "Помещение выведено из эксплуатации");
        }
      }
      if (typeof lifecycle.owned !== "boolean"
        || typeof lifecycle.delivered !== "boolean"
        || typeof lifecycle.ready !== "boolean") {
        return unavailableProjection(record, "room", "Состояние помещения неполное — нужна проверка");
      }
      if (!lifecycle.owned) return visualProjection(record, "room", "not_owned");
      if (!lifecycle.delivered) return visualProjection(record, "room", "pending_delivery");
      if (!lifecycle.ready) return visualProjection(record, "room", "delivered_not_ready");
      return visualProjection(record, "room", busyResourceIds.has(record.resourceId) ? "busy" : "ready");
    }

    function maintenanceActive(lifecycle, at) {
      if (!Array.isArray(lifecycle.maintenanceWindows)) {
        fail(`${lifecycle.resourceId} maintenanceWindows must be an explicit array`);
      }
      let previousEnd = null;
      lifecycle.maintenanceWindows.forEach((window, index) => {
        requireObject(window, `${lifecycle.resourceId}.maintenanceWindows[${index}]`);
        requireMinute(window.startAt, `${lifecycle.resourceId}.maintenanceWindows[${index}].startAt`);
        requireMinute(window.endAt, `${lifecycle.resourceId}.maintenanceWindows[${index}].endAt`);
        if (window.endAt <= window.startAt || (previousEnd !== null && window.startAt < previousEnd)) {
          fail(`${lifecycle.resourceId} maintenanceWindows must be ordered, non-empty and non-overlapping`);
        }
        previousEnd = window.endAt;
      });
      return lifecycle.maintenanceWindows.some((window) => window.startAt <= at && at < window.endAt);
    }

    function equipmentState(record, lifecycle, busyResourceIds, preparationById, stockById, at) {
      if (!isObject(lifecycle) || lifecycle.resourceKind !== "equipment") {
        return unavailableProjection(record, "equipment", "Состояние оборудования недоступно — нужна проверка");
      }
      if (lifecycle.retiredAt !== null && lifecycle.retiredAt !== undefined) {
        requireMinute(lifecycle.retiredAt, `${record.resourceId}.retiredAt`);
        if (lifecycle.retiredAt <= at) {
          return unavailableProjection(record, "equipment", "Оборудование выведено из эксплуатации");
        }
      }
      if (typeof lifecycle.owned !== "boolean" || typeof lifecycle.delivered !== "boolean") {
        return unavailableProjection(record, "equipment", "Состояние оборудования неполное — нужна проверка");
      }
      const explicitPreparation = preparationById.get(record.resourceId)?.state || null;
      const stockBlocked = stockById.get(record.resourceId)?.blocked === true;
      if (!lifecycle.owned) {
        if (explicitPreparation || stockBlocked) fail(`${record.resourceId} has signals before ownership`);
        return visualProjection(record, "equipment", "not_owned");
      }
      if (!lifecycle.delivered) {
        if (stockBlocked) fail(`${record.resourceId} has a stock signal before delivery`);
        if (explicitPreparation && explicitPreparation !== "pending_delivery") {
          fail(`${record.resourceId} has a preparation signal incompatible with delivery state`);
        }
        return explicitPreparation === "pending_delivery"
          ? visualProjection(record, "equipment", "pending_delivery")
          : unavailableProjection(record, "equipment", "Статус доставки не подтверждён — нужна проверка");
      }
      if (typeof lifecycle.active !== "boolean") {
        return unavailableProjection(record, "equipment", "Готовность оборудования не подтверждена — нужна проверка");
      }
      if (maintenanceActive(lifecycle, at)) {
        if (explicitPreparation || stockBlocked) fail(`${record.resourceId} has signals during maintenance`);
        return visualProjection(record, "equipment", "maintenance_active");
      }
      if (Number.isSafeInteger(lifecycle.nextDueAt) && lifecycle.nextDueAt <= at) {
        if (explicitPreparation || stockBlocked) fail(`${record.resourceId} has signals while maintenance is due`);
        return visualProjection(record, "equipment", "maintenance_due");
      }
      if (lifecycle.active === true) {
        if (explicitPreparation) fail(`${record.resourceId} has a preparation signal after activation`);
        if (stockBlocked) {
          return visualProjection(record, "equipment", "stock_blocked");
        }
        return visualProjection(
          record,
          "equipment",
          busyResourceIds.has(record.resourceId) ? "busy" : "ready"
        );
      }
      if (stockBlocked) fail(`${record.resourceId} has a stock signal before activation`);
      if (explicitPreparation === "pending_delivery") {
        fail(`${record.resourceId} has a pending-delivery signal after delivery`);
      }
      if (explicitPreparation) return visualProjection(record, "equipment", explicitPreparation);
      return unavailableProjection(
        record,
        "equipment",
        "Подготовка оборудования не подтверждена — нужна проверка"
      );
    }

    function staffState(record, lifecycle, busyResourceIds, at) {
      if (!isObject(lifecycle) || lifecycle.resourceKind !== "staff") {
        return unavailableProjection(record, "staff", "Состояние сотрудника недоступно — нужна проверка");
      }
      if (lifecycle.retiredAt !== null && lifecycle.retiredAt !== undefined) {
        requireMinute(lifecycle.retiredAt, `${record.resourceId}.retiredAt`);
        if (lifecycle.retiredAt <= at) {
          return unavailableProjection(record, "staff", "Сотрудник больше не работает в клинике");
        }
      }
      const availability = lifecycle.staffAvailabilityState;
      if (["available", "busy"].includes(availability)) {
        return visualProjection(
          record,
          "staff",
          busyResourceIds.has(record.resourceId) ? "busy" : "scheduled"
        );
      }
      if (["not_hired", "hired_unscheduled", "resting", "absent"].includes(availability)) {
        return visualProjection(record, "staff", availability);
      }
      return unavailableProjection(record, "staff", "Статус сотрудника не подтверждён — нужна проверка");
    }

    function projectHud(rawAuthorities) {
      const authorityRecords = requireArray(rawAuthorities, "hudAuthorities");
      if (authorityRecords.length !== 9) fail("hudAuthorities must contain the exact nine HUD surfaces");
      const authorityById = uniqueMap(authorityRecords, "surfaceId", "hudAuthorities");
      if (!sameStrings(authorityById.keys(), hudById.keys())) {
        fail("hudAuthorities must join the exact nine authored HUD surfaces");
      }
      return hudRecords.map((contract) => {
        const authority = authorityById.get(contract.surfaceId);
        requireExactKeys(authority, ["surfaceId", "authority", "data"], `hudAuthorities.${contract.surfaceId}`);
        if (authority.authority !== contract.authority) {
          fail(`${contract.surfaceId} authority must remain ${contract.authority}`);
        }
        requireExactKeys(authority.data, contract.fields, `hudAuthorities.${contract.surfaceId}.data`);
        validatePlayerFacingValue(authority.data, `hudAuthorities.${contract.surfaceId}.data`);
        return {
          surfaceId: contract.surfaceId,
          zone: contract.zone,
          authority: contract.authority,
          data: cloneJson(authority.data, `hudAuthorities.${contract.surfaceId}.data`)
        };
      });
    }

    function projectNotice(rawNotice) {
      if (rawNotice === null) return null;
      requireExactKeys(
        rawNotice,
        ["whatHappened", "whatChanged", "whatCanBeDone"],
        "transitionNotice"
      );
      const parts = [rawNotice.whatHappened, rawNotice.whatChanged, rawNotice.whatCanBeDone];
      parts.forEach((part, index) => {
        requireString(part, `transitionNotice part ${index + 1}`);
        if (!/[А-Яа-яЁё]/u.test(part)) fail("transitionNotice must use human Russian text");
        validatePlayerFacingValue(part, `transitionNotice part ${index + 1}`);
      });
      return {
        whatHappened: parts[0],
        whatChanged: parts[1],
        whatCanBeDone: parts[2],
        humanText: parts.join(" → ")
      };
    }

    function buildScene(roomViews, equipmentViews) {
      const roomViewById = new Map(roomViews.map((record) => [record.resourceId, record]));
      const equipmentViewById = new Map(equipmentViews.map((record) => [record.resourceId, record]));
      const roomsBySceneId = {};
      const placementsById = {};
      roomBindings.forEach((binding) => {
        const view = roomViewById.get(binding.resourceId);
        const anchorByAssetId = new Map(binding.overlayAnchors.map((anchor) => [anchor.assetId, anchor]));
        roomsBySceneId[binding.sceneRoomId] = {
          showBase: view.showBase,
          overlayAssetIds: [...view.overlayAssetIds],
          overlayAnchorsByAssetId: Object.fromEntries(view.overlayAssetIds.map((assetId) => {
            const anchor = anchorByAssetId.get(assetId);
            return [assetId, {
              x: anchor.x,
              y: anchor.y,
              zFootY: anchor.zFootY,
              scale: anchor.scale
            }];
          })),
          resourceId: view.resourceId
        };
        binding.placementIds.forEach((placementId) => {
          if (equipmentPlacementIds.has(placementId)) return;
          placementsById[placementId] = {
            showBase: view.showBase,
            overlayAssetIds: [],
            resourceId: view.resourceId
          };
        });
      });
      equipmentBindings.forEach((binding) => {
        const view = equipmentViewById.get(binding.resourceId);
        binding.placementIds.forEach((placementId) => {
          placementsById[placementId] = {
            showBase: view.showBase,
            overlayAssetIds: [...view.overlayAssetIds],
            resourceId: view.resourceId
          };
        });
      });
      return {
        assetAliasBySourceId: Object.fromEntries(sorted(aliasBySource.keys()).map((sourceAssetId) => [
          sourceAssetId,
          aliasBySource.get(sourceAssetId).targetAssetId
        ])),
        roomsBySceneId,
        placementsById,
        unplacedPolicy: crosswalk.unplacedPolicy
      };
    }

    function project(rawInput) {
      requireExactKeys(rawInput, INPUT_KEYS, "projection input");
      const input = cloneJson(rawInput, "projection input");
      if (input.schemaVersion !== SCHEMA_VERSION) fail("projection input schemaVersion must be 1");
      const at = requireMinute(input.at, "projection input.at");
      const lifecycleSnapshot = requireObject(input.lifecycleSnapshot, "lifecycleSnapshot");
      if (lifecycleSnapshot.schemaVersion !== SCHEMA_VERSION
        || lifecycleSnapshot.catalogVersion !== CATALOG_VERSION) {
        fail("lifecycleSnapshot must be the P5 .2 serializable snapshot authority");
      }
      if (lifecycleSnapshot.at !== at) {
        fail("lifecycleSnapshot.at must equal projection input.at");
      }
      const lifecycleResources = requireObject(lifecycleSnapshot.resources, "lifecycleSnapshot.resources");
      Object.entries(lifecycleResources).forEach(([resourceId, lifecycle]) => {
        if (!resourceById.has(resourceId)) {
          fail(`${resourceId} is not part of the P5 resource catalog`);
        }
        if (!isObject(lifecycle)
          || lifecycle.resourceId !== resourceId
          || lifecycle.resourceKind !== resourceById.get(resourceId).resourceKind) {
          fail(`${resourceId} lifecycle snapshot identity differs from the P5 resource catalog`);
        }
      });
      const busyResourceIds = activeReservationResourceIds(input.schedulerState, at);
      const preparationById = signalMap(
        input.preparationSignals,
        new Set(equipmentById.keys()),
        "preparationSignals",
        (record, label) => {
          requireExactKeys(record, ["resourceId", "state"], label);
          if (!PREPARATION_STATES.includes(record.state)) fail(`${label}.state is not an authored preparation state`);
        }
      );
      const stockById = signalMap(
        input.stockSignals,
        new Set(equipmentById.keys()),
        "stockSignals",
        (record, label) => {
          requireExactKeys(record, ["resourceId", "blocked"], label);
          requireBoolean(record.blocked, `${label}.blocked`);
        }
      );

      const rooms = roomRecords.map((record) => roomState(
        record,
        lifecycleResources[record.resourceId],
        busyResourceIds,
        at
      ));
      const equipment = equipmentRecords.map((record) => equipmentState(
        record,
        lifecycleResources[record.resourceId],
        busyResourceIds,
        preparationById,
        stockById,
        at
      ));
      const staff = staffRecords.map((record) => staffState(
        record,
        lifecycleResources[record.resourceId],
        busyResourceIds,
        at
      ));
      const hudSurfaces = projectHud(input.hudAuthorities);
      const notice = projectNotice(input.transitionNotice);
      requireExactKeys(input.presentation, ["reducedMotion"], "presentation");
      const reducedMotion = requireBoolean(input.presentation.reducedMotion, "presentation.reducedMotion");

      return deepFreeze({
        schemaVersion: SCHEMA_VERSION,
        adapterId: ADAPTER_ID,
        adapterVersion: ADAPTER_VERSION,
        reviewOnly: true,
        runtimeEligible: false,
        at,
        resources: { rooms, equipment, staff },
        hud: {
          surfaces: hudSurfaces,
          disclosure: cloneJson(config.hudContract.disclosure, "HUD disclosure")
        },
        scene: buildScene(rooms, equipment),
        transitionNotice: notice,
        presentation: {
          reducedMotion,
          motionMode: reducedMotion ? "reduced" : "standard",
          transitionsEnabled: !reducedMotion
        }
      });
    }

    return deepFreeze({
      SCHEMA_VERSION,
      ADAPTER_ID,
      ADAPTER_VERSION,
      reviewOnly: true,
      runtimeEligible: false,
      audit: {
        rooms: roomById.size,
        equipment: equipmentById.size,
        staff: staffById.size,
        hudSurfaces: hudById.size,
        resources: resourceById.size,
        assetAliases: aliasBySource.size,
        canvasRooms: roomBindings.length,
        canvasEquipment: equipmentBindings.length,
        canvasStaff: staffBindings.length
      },
      project
    });
  }

  return Object.freeze({
    SCHEMA_VERSION,
    CATALOG_VERSION,
    ADAPTER_ID,
    ADAPTER_VERSION,
    PREPARATION_STATES,
    createP9VisualStateAdapter
  });
});
