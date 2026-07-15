(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_RESOURCE_SCHEDULER_V5 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const TASK_STATUSES = Object.freeze(["queued", "active", "completed", "cancelled"]);
  const URGENCY_LEVELS = Object.freeze(["routine", "urgent"]);
  const STATE_KEYS = Object.freeze([
    "schemaVersion", "resources", "tasks", "reservations", "appliedCommandIds", "commandFingerprints"
  ]);
  const RESOURCE_KEYS = Object.freeze(["id", "capacity", "capabilities", "unavailableWindows"]);
  const WINDOW_KEYS = Object.freeze(["startAt", "endAt"]);
  const TASK_INPUT_KEYS = Object.freeze([
    "id", "queuedAt", "priority", "authoredDurationMinutes", "fatigue",
    "requirementGroups", "urgency", "safeRouteRequired", "sourceType", "sourceId",
    "patientId", "ownerId"
  ]);
  const TASK_KEYS = Object.freeze(TASK_INPUT_KEYS.concat([
    "schemaVersion", "scheduledDurationMinutes", "status", "history", "startAt", "endAt",
    "completedAt", "cancelledAt", "cancellation"
  ]));
  const FATIGUE_KEYS = Object.freeze(["percent", "durationMultiplier"]);
  const GROUP_KEYS = Object.freeze(["id", "anyOf"]);
  const ALTERNATIVE_KEYS = Object.freeze(["resourceId", "capabilityId", "units"]);
  const RESERVATION_KEYS = Object.freeze([
    "taskId", "groupId", "resourceId", "capabilityId", "units", "startAt", "endAt"
  ]);
  const REASSIGNMENT_KEYS = Object.freeze([
    "groupId", "fromResourceId", "toResourceId", "capabilityId", "units"
  ]);

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function requireExactKeys(value, allowed, label) {
    if (!isObject(value)) throw new TypeError(`${label} must be an object.`);
    const extra = Object.keys(value).filter((key) => !allowed.includes(key));
    if (extra.length) throw new Error(`${label} contains unsupported fields: ${extra.join(", ")}.`);
  }

  function requireString(value, label) {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  }

  function requireIdentifier(value, label) {
    requireString(value, label);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
      throw new TypeError(`${label} must be a stable identifier, not display text.`);
    }
  }

  function requireMinute(value, label) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${label} must be a non-negative absolute campaign minute.`);
    }
  }

  function requirePositiveInteger(value, label) {
    if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer.`);
  }

  function compareStrings(left, right) {
    return left.localeCompare(right, "en");
  }

  function serializeFingerprintValue(value, ancestors = new Set()) {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "string") return `string:${JSON.stringify(value)}`;
    if (typeof value === "boolean") return value ? "boolean:true" : "boolean:false";
    if (typeof value === "number") {
      if (Number.isNaN(value)) return "number:NaN";
      if (value === Infinity) return "number:Infinity";
      if (value === -Infinity) return "number:-Infinity";
      if (Object.is(value, -0)) return "number:-0";
      return `number:${value}`;
    }
    if (typeof value === "bigint") return `bigint:${value}`;
    if (typeof value === "symbol") return `symbol:${String(value)}`;
    if (typeof value === "function") return `function:${String(value)}`;
    if (ancestors.has(value)) throw new TypeError("Command content must not contain cycles.");
    ancestors.add(value);
    let serialized;
    if (Array.isArray(value)) {
      serialized = `array:[${value.map((item) => serializeFingerprintValue(item, ancestors)).join(",")}]`;
    } else {
      const tag = Object.prototype.toString.call(value);
      const entries = Object.keys(value).sort(compareStrings).map((key) =>
        `${JSON.stringify(key)}=${serializeFingerprintValue(value[key], ancestors)}`
      );
      serialized = `object:${tag}:{${entries.join(",")}}`;
    }
    ancestors.delete(value);
    return serialized;
  }

  function fingerprintCommand(type, command) {
    requireIdentifier(type, "command type");
    const content = Object.fromEntries(
      Object.entries(command).filter(([key]) => key !== "commandId")
    );
    const serialized = serializeFingerprintValue(content);
    let hash = 14695981039346656037n;
    const prime = 1099511628211n;
    for (let index = 0; index < serialized.length; index += 1) {
      const code = serialized.charCodeAt(index);
      hash ^= BigInt(code & 0xff);
      hash = BigInt.asUintN(64, hash * prime);
      hash ^= BigInt(code >>> 8);
      hash = BigInt.asUintN(64, hash * prime);
    }
    return `${type}:${hash.toString(16).padStart(16, "0")}`;
  }

  function intervalsOverlap(leftStart, leftEnd, rightStart, rightEnd) {
    return leftStart < rightEnd && rightStart < leftEnd;
  }

  function validateWindow(window, label) {
    requireExactKeys(window, WINDOW_KEYS, label);
    requireMinute(window.startAt, `${label}.startAt`);
    requireMinute(window.endAt, `${label}.endAt`);
    if (window.endAt <= window.startAt) throw new RangeError(`${label} must be a non-empty half-open interval.`);
  }

  function normalizeWindows(windows) {
    if (!Array.isArray(windows)) throw new TypeError("unavailableWindows must be an explicit array.");
    const normalized = windows.map((window, index) => {
      validateWindow(window, `unavailableWindows[${index}]`);
      return { startAt: window.startAt, endAt: window.endAt };
    }).sort((left, right) => left.startAt - right.startAt || left.endAt - right.endAt);
    for (let index = 1; index < normalized.length; index += 1) {
      if (intervalsOverlap(
        normalized[index - 1].startAt,
        normalized[index - 1].endAt,
        normalized[index].startAt,
        normalized[index].endAt
      )) throw new Error("unavailableWindows must not overlap.");
    }
    return normalized;
  }

  function normalizeResource(config, index) {
    requireExactKeys(config, RESOURCE_KEYS, `resourceConfigs[${index}]`);
    requireIdentifier(config.id, `resourceConfigs[${index}].id`);
    requirePositiveInteger(config.capacity, `resourceConfigs[${index}].capacity`);
    if (!Array.isArray(config.capabilities) || config.capabilities.length === 0) {
      throw new TypeError(`resourceConfigs[${index}].capabilities must be an explicit non-empty array.`);
    }
    const capabilities = config.capabilities.map((capabilityId, capabilityIndex) => {
      requireIdentifier(capabilityId, `resourceConfigs[${index}].capabilities[${capabilityIndex}]`);
      return capabilityId;
    }).sort(compareStrings);
    if (new Set(capabilities).size !== capabilities.length) {
      throw new Error(`resourceConfigs[${index}].capabilities contains duplicates.`);
    }
    return {
      id: config.id,
      capacity: config.capacity,
      capabilities,
      unavailableWindows: normalizeWindows(config.unavailableWindows)
    };
  }

  function createState(resourceConfigs) {
    if (!Array.isArray(resourceConfigs)) throw new TypeError("Resource configs must be an array.");
    const normalized = resourceConfigs.map(normalizeResource).sort((left, right) => compareStrings(left.id, right.id));
    const resources = {};
    for (const resource of normalized) {
      if (own(resources, resource.id)) throw new Error(`Duplicate resource id: ${resource.id}.`);
      resources[resource.id] = resource;
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      resources,
      tasks: [],
      reservations: [],
      appliedCommandIds: []
    };
  }

  function adjustDurationForFatigue(authoredDurationMinutes, fatigue) {
    requirePositiveInteger(authoredDurationMinutes, "authoredDurationMinutes");
    requireExactKeys(fatigue, FATIGUE_KEYS, "fatigue");
    if (!Number.isFinite(fatigue.percent) || fatigue.percent < 0 || fatigue.percent > 100) {
      throw new RangeError("fatigue.percent must be an explicit number in [0, 100].");
    }
    if (!Number.isFinite(fatigue.durationMultiplier) || fatigue.durationMultiplier < 1) {
      throw new RangeError("fatigue.durationMultiplier must be an explicit number greater than or equal to 1.");
    }
    return Math.max(1, Math.ceil(authoredDurationMinutes * fatigue.durationMultiplier));
  }

  function normalizeRequirementGroups(requirementGroups, resources) {
    if (!Array.isArray(requirementGroups) || requirementGroups.length === 0) {
      throw new TypeError("requirementGroups must be an explicit non-empty array.");
    }
    const groups = requirementGroups.map((group, groupIndex) => {
      requireExactKeys(group, GROUP_KEYS, `requirementGroups[${groupIndex}]`);
      requireIdentifier(group.id, `requirementGroups[${groupIndex}].id`);
      if (!Array.isArray(group.anyOf) || group.anyOf.length === 0) {
        throw new TypeError(`requirementGroups[${groupIndex}].anyOf must be an explicit non-empty array.`);
      }
      const anyOf = group.anyOf.map((alternative, alternativeIndex) => {
        const label = `requirementGroups[${groupIndex}].anyOf[${alternativeIndex}]`;
        requireExactKeys(alternative, ALTERNATIVE_KEYS, label);
        requireIdentifier(alternative.resourceId, `${label}.resourceId`);
        requireIdentifier(alternative.capabilityId, `${label}.capabilityId`);
        requirePositiveInteger(alternative.units, `${label}.units`);
        const resource = resources[alternative.resourceId];
        if (!resource) throw new Error(`Unknown resource: ${alternative.resourceId}.`);
        if (!resource.capabilities.includes(alternative.capabilityId)) {
          throw new Error(`Unknown capability ${alternative.capabilityId} for resource ${alternative.resourceId}.`);
        }
        if (alternative.units > resource.capacity) {
          throw new Error(`Requirement exceeds capacity of resource ${alternative.resourceId}.`);
        }
        return {
          resourceId: alternative.resourceId,
          capabilityId: alternative.capabilityId,
          units: alternative.units
        };
      }).sort((left, right) =>
        compareStrings(left.resourceId, right.resourceId)
        || compareStrings(left.capabilityId, right.capabilityId)
        || left.units - right.units
      );
      const alternativeKeys = anyOf.map((item) => `${item.resourceId}\u0000${item.capabilityId}\u0000${item.units}`);
      if (new Set(alternativeKeys).size !== alternativeKeys.length) {
        throw new Error(`requirementGroups[${groupIndex}].anyOf contains duplicate alternatives.`);
      }
      return { id: group.id, anyOf };
    }).sort((left, right) => compareStrings(left.id, right.id));
    if (new Set(groups.map((group) => group.id)).size !== groups.length) {
      throw new Error("requirementGroups contains duplicate group ids.");
    }
    return groups;
  }

  function normalizeTaskInput(input, resources) {
    requireExactKeys(input, TASK_INPUT_KEYS, "task");
    requireIdentifier(input.id, "task.id");
    requireMinute(input.queuedAt, "task.queuedAt");
    if (!Number.isInteger(input.priority)) throw new TypeError("task.priority must be an explicit integer.");
    requirePositiveInteger(input.authoredDurationMinutes, "task.authoredDurationMinutes");
    if (!URGENCY_LEVELS.includes(input.urgency)) throw new TypeError("task.urgency must be routine or urgent.");
    if (typeof input.safeRouteRequired !== "boolean") {
      throw new TypeError("task.safeRouteRequired must be an explicit boolean.");
    }
    if (input.urgency === "urgent" && input.safeRouteRequired !== true) {
      throw new Error("Urgent tasks must explicitly require a safe route when local capacity is unavailable.");
    }
    const identifiers = ["sourceType", "sourceId", "patientId", "ownerId"];
    for (const field of identifiers) if (own(input, field)) requireIdentifier(input[field], `task.${field}`);
    if (own(input, "sourceType") !== own(input, "sourceId")) {
      throw new Error("task.sourceType and task.sourceId must be provided together.");
    }
    const fatigue = clone(input.fatigue);
    const scheduledDurationMinutes = adjustDurationForFatigue(input.authoredDurationMinutes, fatigue);
    const task = {
      schemaVersion: SCHEMA_VERSION,
      id: input.id,
      queuedAt: input.queuedAt,
      priority: input.priority,
      authoredDurationMinutes: input.authoredDurationMinutes,
      scheduledDurationMinutes,
      fatigue,
      requirementGroups: normalizeRequirementGroups(input.requirementGroups, resources),
      urgency: input.urgency,
      safeRouteRequired: input.safeRouteRequired,
      status: "queued"
    };
    for (const field of identifiers) if (own(input, field)) task[field] = input[field];
    return task;
  }

  function queuedTaskComparator(left, right) {
    return right.priority - left.priority || left.queuedAt - right.queuedAt || compareStrings(left.id, right.id);
  }

  function reservationComparator(left, right) {
    return left.startAt - right.startAt
      || left.endAt - right.endAt
      || compareStrings(left.taskId, right.taskId)
      || compareStrings(left.groupId, right.groupId)
      || compareStrings(left.resourceId, right.resourceId)
      || compareStrings(left.capabilityId, right.capabilityId)
      || left.units - right.units;
  }

  function allocationKey(allocation) {
    return allocation.map((item) => `${item.groupId}\u0000${item.resourceId}\u0000${item.capabilityId}\u0000${item.units}`).join("\u0001");
  }

  function enumerateAllocations(task) {
    const allocations = [];
    function visit(index, current) {
      if (index === task.requirementGroups.length) {
        allocations.push(current.map(clone));
        return;
      }
      const group = task.requirementGroups[index];
      for (const alternative of group.anyOf) {
        current.push({ groupId: group.id, ...alternative });
        visit(index + 1, current);
        current.pop();
      }
    }
    visit(0, []);
    return allocations.sort((left, right) => compareStrings(allocationKey(left), allocationKey(right)));
  }

  function allocationFitsStaticCapacity(state, allocation) {
    const unitsByResource = {};
    for (const item of allocation) {
      unitsByResource[item.resourceId] = (unitsByResource[item.resourceId] || 0) + item.units;
    }
    return Object.entries(unitsByResource).every(([resourceId, units]) => units <= state.resources[resourceId].capacity);
  }

  function allocationAvailable(state, allocation, startAt, endAt) {
    if (!allocationFitsStaticCapacity(state, allocation)) return false;
    const requestedByResource = {};
    for (const item of allocation) {
      requestedByResource[item.resourceId] = (requestedByResource[item.resourceId] || 0) + item.units;
    }
    for (const [resourceId, requestedUnits] of Object.entries(requestedByResource)) {
      const resource = state.resources[resourceId];
      if (resource.unavailableWindows.some((window) => intervalsOverlap(startAt, endAt, window.startAt, window.endAt))) {
        return false;
      }
      const relevant = state.reservations.filter((reservation) =>
        reservation.resourceId === resourceId
        && intervalsOverlap(startAt, endAt, reservation.startAt, reservation.endAt)
      );
      const boundaries = new Set([startAt, endAt]);
      for (const reservation of relevant) {
        boundaries.add(Math.max(startAt, reservation.startAt));
        boundaries.add(Math.min(endAt, reservation.endAt));
      }
      const points = Array.from(boundaries).sort((left, right) => left - right);
      for (let index = 0; index < points.length - 1; index += 1) {
        const segmentStart = points[index];
        const segmentEnd = points[index + 1];
        if (segmentEnd <= segmentStart) continue;
        const occupied = relevant
          .filter((reservation) => intervalsOverlap(segmentStart, segmentEnd, reservation.startAt, reservation.endAt))
          .reduce((sum, reservation) => sum + reservation.units, 0);
        if (occupied + requestedUnits > resource.capacity) return false;
      }
    }
    return true;
  }

  function allocationAt(state, task, startAt) {
    const endAt = startAt + task.scheduledDurationMinutes;
    const allocation = enumerateAllocations(task).find((candidate) =>
      allocationAvailable(state, candidate, startAt, endAt)
    );
    return allocation ? { allocation, startAt, endAt } : null;
  }

  function validateTask(task, resources) {
    try {
      requireExactKeys(task, TASK_KEYS, "task");
      if (task.schemaVersion !== SCHEMA_VERSION) throw new Error("task has an unsupported schemaVersion.");
      const input = {};
      for (const key of TASK_INPUT_KEYS) if (own(task, key)) input[key] = clone(task[key]);
      const normalized = normalizeTaskInput(input, resources);
      if (task.scheduledDurationMinutes !== normalized.scheduledDurationMinutes) {
        throw new Error("task.scheduledDurationMinutes does not match authored duration and fatigue.");
      }
      if (JSON.stringify(task.requirementGroups) !== JSON.stringify(normalized.requirementGroups)) {
        throw new Error("task.requirementGroups are not canonical.");
      }
      if (!TASK_STATUSES.includes(task.status)) throw new Error("task has an invalid status.");
      if (!Array.isArray(task.history) || task.history.length < 1 || task.history.length > 3) {
        throw new Error("task.history is invalid.");
      }
      const first = task.history[0];
      requireExactKeys(first, ["from", "to", "at", "commandId"], "task.history[0]");
      if (!isObject(first) || first.from !== null || first.to !== "queued" || first.at !== task.queuedAt) {
        throw new Error("task.history origin is invalid.");
      }
      requireIdentifier(first.commandId, "task.history[0].commandId");
      let status = "queued";
      let lastAt = task.queuedAt;
      for (let index = 1; index < task.history.length; index += 1) {
        const entry = task.history[index];
        requireExactKeys(entry, ["from", "to", "at", "commandId"], `task.history[${index}]`);
        requireMinute(entry.at, `task.history[${index}].at`);
        requireIdentifier(entry.commandId, `task.history[${index}].commandId`);
        const allowed = status === "queued" ? ["active", "cancelled"] : status === "active" ? ["completed", "cancelled"] : [];
        if (entry.from !== status || !allowed.includes(entry.to) || entry.at < lastAt) {
          throw new Error(`task.history transition ${index} is invalid.`);
        }
        status = entry.to;
        lastAt = entry.at;
      }
      if (status !== task.status) throw new Error("task.history does not match task.status.");
      const reachedActive = task.history.some((entry) => entry.to === "active");
      if (reachedActive) {
        requireMinute(task.startAt, "task.startAt");
        requireMinute(task.endAt, "task.endAt");
        const activeEntry = task.history.find((entry) => entry.to === "active");
        if (!activeEntry || activeEntry.at !== task.startAt) throw new Error("task.startAt does not match active history.");
        if (task.endAt !== task.startAt + task.scheduledDurationMinutes) {
          throw new Error("task active interval does not match scheduled duration.");
        }
      } else if (own(task, "startAt") || own(task, "endAt")) {
        throw new Error("queued task cannot contain an active interval.");
      }
      if (task.status === "completed") {
        requireMinute(task.completedAt, "task.completedAt");
        if (task.completedAt < task.endAt) throw new Error("task cannot complete before endAt.");
        const completedEntry = task.history.find((entry) => entry.to === "completed");
        if (!completedEntry || completedEntry.at !== task.completedAt) {
          throw new Error("task.completedAt does not match completed history.");
        }
      } else if (own(task, "completedAt")) throw new Error("non-completed task cannot contain completedAt.");
      if (task.status === "cancelled") {
        requireMinute(task.cancelledAt, "task.cancelledAt");
        const cancelledEntry = task.history.find((entry) => entry.to === "cancelled");
        if (!cancelledEntry || cancelledEntry.at !== task.cancelledAt) {
          throw new Error("task.cancelledAt does not match cancelled history.");
        }
        requireExactKeys(task.cancellation, ["reasonCode", "safeRouteId"], "task.cancellation");
        requireIdentifier(task.cancellation.reasonCode, "task.cancellation.reasonCode");
        if (task.urgency === "urgent" && task.safeRouteRequired) {
          requireIdentifier(task.cancellation.safeRouteId, "task.cancellation.safeRouteId");
        } else if (own(task.cancellation, "safeRouteId")) {
          requireIdentifier(task.cancellation.safeRouteId, "task.cancellation.safeRouteId");
        }
      } else if (own(task, "cancelledAt") || own(task, "cancellation")) {
        throw new Error("non-cancelled task cannot contain cancellation fields.");
      }
      return { valid: true, errors: [] };
    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
  }

  function validateReservation(reservation, state, taskById) {
    requireExactKeys(reservation, RESERVATION_KEYS, "reservation");
    for (const field of ["taskId", "groupId", "resourceId", "capabilityId"]) {
      requireIdentifier(reservation[field], `reservation.${field}`);
    }
    requirePositiveInteger(reservation.units, "reservation.units");
    requireMinute(reservation.startAt, "reservation.startAt");
    requireMinute(reservation.endAt, "reservation.endAt");
    if (reservation.endAt <= reservation.startAt) throw new Error("reservation must be a non-empty half-open interval.");
    const task = taskById[reservation.taskId];
    if (!task) throw new Error(`reservation references unknown task ${reservation.taskId}.`);
    if (task.status === "queued") throw new Error("queued task cannot have reservations.");
    const resource = state.resources[reservation.resourceId];
    if (!resource) throw new Error(`reservation references unknown resource ${reservation.resourceId}.`);
    if (!resource.capabilities.includes(reservation.capabilityId)) {
      throw new Error("reservation capability is not available on its resource.");
    }
    const group = task.requirementGroups.find((item) => item.id === reservation.groupId);
    if (!group || !group.anyOf.some((alternative) =>
      alternative.resourceId === reservation.resourceId
      && alternative.capabilityId === reservation.capabilityId
      && alternative.units === reservation.units
    )) throw new Error("reservation does not satisfy its task requirement group.");
    const effectiveEnd = task.status === "cancelled" ? Math.min(task.endAt, task.cancelledAt) : task.endAt;
    if (reservation.startAt < task.startAt || reservation.endAt > effectiveEnd) {
      throw new Error("reservation segment falls outside its task active interval.");
    }
  }

  function validateTaskReservationSegments(task, reservations) {
    const reachedActive = task.history.some((entry) => entry.to === "active");
    if (!reachedActive) {
      if (reservations.length !== 0) throw new Error(`Task ${task.id} has reservations before activation.`);
      return;
    }
    const effectiveEnd = task.status === "cancelled" ? Math.min(task.endAt, task.cancelledAt) : task.endAt;
    for (const group of task.requirementGroups) {
      const segments = reservations
        .filter((reservation) => reservation.groupId === group.id)
        .slice()
        .sort((left, right) => left.startAt - right.startAt || left.endAt - right.endAt
          || compareStrings(left.resourceId, right.resourceId)
          || compareStrings(left.capabilityId, right.capabilityId));
      if (effectiveEnd === task.startAt) {
        if (segments.length !== 0) throw new Error(`Task ${task.id} has reservation segments for an empty active interval.`);
        continue;
      }
      if (segments.length === 0) throw new Error(`Task ${task.id} has no reservation segments for group ${group.id}.`);
      let cursor = task.startAt;
      for (const segment of segments) {
        if (segment.startAt < cursor) {
          throw new Error(`Task ${task.id} has overlapping reservation segments for group ${group.id}.`);
        }
        if (segment.startAt > cursor) {
          throw new Error(`Task ${task.id} has a gap in reservation segments for group ${group.id}.`);
        }
        cursor = segment.endAt;
      }
      if (cursor !== effectiveEnd) {
        throw new Error(`Task ${task.id} reservation segments do not cover group ${group.id} through effectiveEnd.`);
      }
    }
    const knownGroups = new Set(task.requirementGroups.map((group) => group.id));
    const unknown = reservations.find((reservation) => !knownGroups.has(reservation.groupId));
    if (unknown) throw new Error(`Task ${task.id} has reservation segment for unknown group ${unknown.groupId}.`);
  }

  function validateCapacity(state) {
    for (const resource of Object.values(state.resources)) {
      const reservations = state.reservations.filter((reservation) => reservation.resourceId === resource.id);
      for (const reservation of reservations) {
        if (resource.unavailableWindows.some((window) => intervalsOverlap(
          reservation.startAt, reservation.endAt, window.startAt, window.endAt
        ))) throw new Error(`resource ${resource.id} is reserved during an unavailable window.`);
      }
      const events = [];
      for (const reservation of reservations) {
        events.push({ at: reservation.startAt, delta: reservation.units });
        events.push({ at: reservation.endAt, delta: -reservation.units });
      }
      events.sort((left, right) => left.at - right.at || left.delta - right.delta);
      let occupied = 0;
      for (const event of events) {
        occupied += event.delta;
        if (occupied < 0 || occupied > resource.capacity) {
          throw new Error(`resource ${resource.id} capacity is exceeded.`);
        }
      }
    }
  }

  function assertValidState(state) {
    requireExactKeys(state, STATE_KEYS, "scheduler state");
    if (state.schemaVersion !== SCHEMA_VERSION) throw new Error("Unsupported scheduler schemaVersion.");
    if (!isObject(state.resources)) throw new TypeError("scheduler state.resources must be an object.");
    const normalizedResources = createState(Object.values(state.resources)).resources;
    if (Object.keys(normalizedResources).length !== Object.keys(state.resources).length) {
      throw new Error("scheduler resources are invalid.");
    }
    for (const [resourceId, normalized] of Object.entries(normalizedResources)) {
      const resource = state.resources[resourceId];
      if (!resource || resource.id !== normalized.id || resource.capacity !== normalized.capacity
        || JSON.stringify(resource.capabilities) !== JSON.stringify(normalized.capabilities)
        || JSON.stringify(resource.unavailableWindows) !== JSON.stringify(normalized.unavailableWindows)) {
        throw new Error(`scheduler resource ${resourceId} is not canonical.`);
      }
    }
    if (!Array.isArray(state.tasks)) throw new TypeError("scheduler state.tasks must be an array.");
    if (!Array.isArray(state.reservations)) throw new TypeError("scheduler state.reservations must be an array.");
    if (!Array.isArray(state.appliedCommandIds)) throw new TypeError("scheduler state.appliedCommandIds must be an array.");
    if (new Set(state.appliedCommandIds).size !== state.appliedCommandIds.length) {
      throw new Error("scheduler state.appliedCommandIds contains duplicates.");
    }
    state.appliedCommandIds.forEach((id, index) => requireIdentifier(id, `appliedCommandIds[${index}]`));
    if (own(state, "commandFingerprints")) {
      if (!isObject(state.commandFingerprints)) throw new TypeError("scheduler state.commandFingerprints must be an object.");
      for (const [commandId, fingerprint] of Object.entries(state.commandFingerprints)) {
        requireIdentifier(commandId, `commandFingerprints key ${commandId}`);
        if (!state.appliedCommandIds.includes(commandId)) {
          throw new Error(`commandFingerprints contains unapplied command ${commandId}.`);
        }
        if (typeof fingerprint !== "string" || !/^(enqueue|schedule|cancel|complete|handoff):[0-9a-f]{16}$/.test(fingerprint)) {
          throw new Error(`commandFingerprints contains invalid fingerprint for ${commandId}.`);
        }
      }
    }
    const taskById = {};
    const historyCommandIds = new Set();
    for (const task of state.tasks) {
      const validation = validateTask(task, state.resources);
      if (!validation.valid) throw new Error(`Invalid task ${task && task.id ? task.id : "<unknown>"}: ${validation.errors.join(", ")}`);
      if (own(taskById, task.id)) throw new Error(`Duplicate task id: ${task.id}.`);
      taskById[task.id] = task;
      for (const entry of task.history) {
        if (historyCommandIds.has(entry.commandId)) throw new Error(`Command id ${entry.commandId} appears in multiple task events.`);
        historyCommandIds.add(entry.commandId);
        if (!state.appliedCommandIds.includes(entry.commandId)) {
          throw new Error(`Task history command ${entry.commandId} is missing from appliedCommandIds.`);
        }
      }
    }
    for (const reservation of state.reservations) validateReservation(reservation, state, taskById);
    for (const task of state.tasks) {
      const taskReservations = state.reservations.filter((reservation) => reservation.taskId === task.id);
      validateTaskReservationSegments(task, taskReservations);
    }
    validateCapacity(state);
    return state;
  }

  function validateState(state) {
    try {
      assertValidState(state);
      return { valid: true, errors: [] };
    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
  }

  function normalizeState(state) {
    assertValidState(state);
    const normalized = clone(state);
    normalized.resources = Object.fromEntries(
      Object.entries(normalized.resources).sort(([left], [right]) => compareStrings(left, right))
    );
    normalized.tasks.sort((left, right) => compareStrings(left.id, right.id));
    normalized.reservations.sort(reservationComparator);
    normalized.appliedCommandIds.sort(compareStrings);
    if (own(normalized, "commandFingerprints")) {
      normalized.commandFingerprints = Object.fromEntries(
        Object.entries(normalized.commandFingerprints).sort(([left], [right]) => compareStrings(left, right))
      );
    }
    return normalized;
  }

  function existingCommandTask(state, commandId) {
    return state.tasks.find((task) => task.history.some((entry) => entry.commandId === commandId)) || null;
  }

  function alreadyApplied(state, commandId, fingerprint, taskId) {
    if (!state.appliedCommandIds.includes(commandId)) return null;
    if (!own(state, "commandFingerprints") || !own(state.commandFingerprints, commandId)) {
      throw new Error(`Command id collision: ${commandId} was imported without an exact fingerprint.`);
    }
    if (state.commandFingerprints[commandId] !== fingerprint) {
      throw new Error(`Command id conflict: ${commandId} was already applied with different content.`);
    }
    const task = taskId
      ? state.tasks.find((item) => item.id === taskId) || null
      : existingCommandTask(state, commandId);
    return {
      state: clone(state),
      task: task ? clone(task) : null,
      reasonCode: "already_applied",
      idempotent: true
    };
  }

  function withAppliedCommand(state, commandId, fingerprint) {
    const next = clone(state);
    next.appliedCommandIds.push(commandId);
    if (!own(next, "commandFingerprints")) next.commandFingerprints = {};
    next.commandFingerprints[commandId] = fingerprint;
    return next;
  }

  function enqueueTask(currentState, command) {
    assertValidState(currentState);
    requireExactKeys(command, ["commandId", "task"], "enqueue command");
    requireIdentifier(command.commandId, "enqueue command.commandId");
    const fingerprint = fingerprintCommand("enqueue", command);
    const repeated = alreadyApplied(currentState, command.commandId, fingerprint);
    if (repeated) return repeated;
    const task = normalizeTaskInput(command.task, currentState.resources);
    if (currentState.tasks.some((item) => item.id === task.id)) throw new Error(`Duplicate task id: ${task.id}.`);
    task.history = [{ from: null, to: "queued", at: task.queuedAt, commandId: command.commandId }];
    const state = withAppliedCommand(currentState, command.commandId, fingerprint);
    state.tasks.push(task);
    assertValidState(normalizeState(state));
    return { state: normalizeState(state), task: clone(task), reasonCode: "enqueued", idempotent: false };
  }

  function findEarliestSlot(currentState, taskId, notBefore) {
    assertValidState(currentState);
    requireIdentifier(taskId, "taskId");
    requireMinute(notBefore, "notBefore");
    const task = currentState.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error(`Unknown task: ${taskId}.`);
    if (task.status !== "queued") return { found: false, taskId, reasonCode: "task_not_queued" };
    if (task.urgency === "routine" && task.fatigue.percent === 100) {
      return { found: false, taskId, reasonCode: "routine_blocked_by_fatigue" };
    }
    const earliest = Math.max(notBefore, task.queuedAt);
    const candidates = new Set([earliest]);
    for (const resource of Object.values(currentState.resources)) {
      for (const window of resource.unavailableWindows) if (window.endAt >= earliest) candidates.add(window.endAt);
    }
    for (const reservation of currentState.reservations) if (reservation.endAt >= earliest) candidates.add(reservation.endAt);
    const starts = Array.from(candidates).sort((left, right) => left - right);
    let selected = null;
    for (const startAt of starts) {
      const slot = allocationAt(currentState, task, startAt);
      if (!slot) continue;
      if (!selected || slot.startAt < selected.startAt || (
        slot.startAt === selected.startAt
        && compareStrings(allocationKey(slot.allocation), allocationKey(selected.allocation)) < 0
      )) selected = slot;
      if (selected && selected.startAt === earliest) break;
    }
    if (!selected) {
      const allocation = enumerateAllocations(task).find((candidate) => allocationFitsStaticCapacity(currentState, candidate));
      if (!allocation) return { found: false, taskId, reasonCode: "requirements_exceed_capacity" };
      throw new Error("Unable to derive an earliest slot from finite scheduler intervals.");
    }
    return {
      found: true,
      taskId,
      startAt: selected.startAt,
      endAt: selected.endAt,
      durationMinutes: task.scheduledDurationMinutes,
      assignments: clone(selected.allocation),
      reasonCode: "slot_found"
    };
  }

  function scheduleTask(currentState, command) {
    assertValidState(currentState);
    requireExactKeys(command, ["commandId", "at"], "schedule command");
    requireIdentifier(command.commandId, "schedule command.commandId");
    requireMinute(command.at, "schedule command.at");
    const fingerprint = fingerprintCommand("schedule", command);
    const repeated = alreadyApplied(currentState, command.commandId, fingerprint);
    if (repeated) return repeated;
    const ready = currentState.tasks
      .filter((task) => task.status === "queued" && task.queuedAt <= command.at)
      .slice()
      .sort(queuedTaskComparator);
    if (ready.length === 0) {
      const state = withAppliedCommand(currentState, command.commandId, fingerprint);
      return { state: normalizeState(state), task: null, reasonCode: "no_ready_task", idempotent: false };
    }
    const blocked = [];
    for (const candidate of ready) {
      if (candidate.urgency === "routine" && candidate.fatigue.percent === 100) {
        blocked.push({ task: candidate, reasonCode: "routine_blocked_by_fatigue" });
        continue;
      }
      const slot = allocationAt(currentState, candidate, command.at);
      if (!slot) {
        const reasonCode = candidate.urgency === "urgent"
          ? "urgent_capacity_unavailable_safe_route_required"
          : "capacity_unavailable";
        blocked.push({
          task: candidate,
          reasonCode
        });
        if (candidate.urgency === "urgent") {
          const state = withAppliedCommand(currentState, command.commandId, fingerprint);
          return {
            state: normalizeState(state),
            task: null,
            blockedTaskId: candidate.id,
            safeRouteRequired: true,
            reasonCode,
            idempotent: false
          };
        }
        continue;
      }
      const state = withAppliedCommand(currentState, command.commandId, fingerprint);
      const task = state.tasks.find((item) => item.id === candidate.id);
      task.status = "active";
      task.startAt = slot.startAt;
      task.endAt = slot.endAt;
      task.history.push({ from: "queued", to: "active", at: command.at, commandId: command.commandId });
      for (const assignment of slot.allocation) {
        state.reservations.push({
          taskId: task.id,
          groupId: assignment.groupId,
          resourceId: assignment.resourceId,
          capabilityId: assignment.capabilityId,
          units: assignment.units,
          startAt: slot.startAt,
          endAt: slot.endAt
        });
      }
      const normalized = normalizeState(state);
      return {
        state: normalized,
        task: clone(normalized.tasks.find((item) => item.id === task.id)),
        reservations: normalized.reservations.filter((item) => item.taskId === task.id).map(clone),
        reasonCode: "scheduled",
        idempotent: false
      };
    }
    const urgentBlocked = blocked.find((item) => item.task.urgency === "urgent");
    const firstBlocked = urgentBlocked || blocked[0];
    const state = withAppliedCommand(currentState, command.commandId, fingerprint);
    return {
      state: normalizeState(state),
      task: null,
      blockedTaskId: firstBlocked.task.id,
      safeRouteRequired: firstBlocked.task.urgency === "urgent" && firstBlocked.task.safeRouteRequired,
      reasonCode: firstBlocked.reasonCode,
      idempotent: false
    };
  }

  function normalizeReassignments(reassignments) {
    if (!Array.isArray(reassignments) || reassignments.length === 0) {
      throw new TypeError("handoff command.reassignments must be an explicit non-empty array.");
    }
    const normalized = reassignments.map((reassignment, index) => {
      const label = `handoff command.reassignments[${index}]`;
      requireExactKeys(reassignment, REASSIGNMENT_KEYS, label);
      for (const field of ["groupId", "fromResourceId", "toResourceId", "capabilityId"]) {
        requireIdentifier(reassignment[field], `${label}.${field}`);
      }
      requirePositiveInteger(reassignment.units, `${label}.units`);
      if (reassignment.fromResourceId === reassignment.toResourceId) {
        throw new Error(`${label} must change resource ownership.`);
      }
      return clone(reassignment);
    }).sort((left, right) => compareStrings(left.groupId, right.groupId));
    if (new Set(normalized.map((item) => item.groupId)).size !== normalized.length) {
      throw new Error("handoff command contains duplicate requirement groups.");
    }
    return normalized;
  }

  function handoffTask(currentState, command) {
    assertValidState(currentState);
    requireExactKeys(command, ["commandId", "taskId", "at", "reassignments"], "handoff command");
    requireIdentifier(command.commandId, "handoff command.commandId");
    requireIdentifier(command.taskId, "handoff command.taskId");
    requireMinute(command.at, "handoff command.at");
    const fingerprint = fingerprintCommand("handoff", command);
    const repeated = alreadyApplied(currentState, command.commandId, fingerprint, command.taskId);
    if (repeated) return repeated;
    const task = currentState.tasks.find((item) => item.id === command.taskId);
    if (!task) throw new Error(`Unknown task: ${command.taskId}.`);
    if (task.status !== "active") throw new Error("Only an active task can be handed off.");
    if (command.at < task.startAt || command.at >= task.endAt) {
      throw new Error("Handoff time must be inside the active task interval.");
    }
    const reassignments = normalizeReassignments(command.reassignments);
    for (const reassignment of reassignments) {
      const group = task.requirementGroups.find((item) => item.id === reassignment.groupId);
      if (!group) throw new Error(`Unknown task requirement group: ${reassignment.groupId}.`);
      const currentSegments = currentState.reservations.filter((reservation) =>
        reservation.taskId === task.id
        && reservation.groupId === reassignment.groupId
        && reservation.startAt <= command.at
        && command.at < reservation.endAt
      );
      if (currentSegments.length !== 1) {
        throw new Error(`Task group ${reassignment.groupId} has no unambiguous current owner at handoff time.`);
      }
      const current = currentSegments[0];
      if (current.endAt !== task.endAt) {
        throw new Error(`Handoff cannot supersede a later reservation segment for task group ${reassignment.groupId}.`);
      }
      if (current.resourceId !== reassignment.fromResourceId
        || current.capabilityId !== reassignment.capabilityId
        || current.units !== reassignment.units) {
        throw new Error(`Handoff source does not own task group ${reassignment.groupId} at the requested minute.`);
      }
      const target = currentState.resources[reassignment.toResourceId];
      if (!target) throw new Error(`Unknown handoff target resource: ${reassignment.toResourceId}.`);
      if (!target.capabilities.includes(reassignment.capabilityId)) {
        throw new Error(`Handoff target ${reassignment.toResourceId} lacks capability ${reassignment.capabilityId}.`);
      }
      if (!group.anyOf.some((alternative) =>
        alternative.resourceId === reassignment.toResourceId
        && alternative.capabilityId === reassignment.capabilityId
        && alternative.units === reassignment.units
      )) {
        throw new Error(`Handoff target is not an allowed alternative for task group ${reassignment.groupId}.`);
      }
    }
    let state = clone(currentState);
    for (const reassignment of reassignments) {
      state.reservations = state.reservations.flatMap((reservation) => {
        if (reservation.taskId !== task.id || reservation.groupId !== reassignment.groupId) return [reservation];
        if (reservation.endAt <= command.at) return [reservation];
        if (reservation.startAt < command.at) return [{ ...reservation, endAt: command.at }];
        return [];
      });
      state.reservations.push({
        taskId: task.id,
        groupId: reassignment.groupId,
        resourceId: reassignment.toResourceId,
        capabilityId: reassignment.capabilityId,
        units: reassignment.units,
        startAt: command.at,
        endAt: task.endAt
      });
    }
    state = withAppliedCommand(state, command.commandId, fingerprint);
    let normalized;
    try {
      normalized = normalizeState(state);
    } catch (error) {
      throw new Error(`Handoff cannot reserve all target resources atomically: ${error.message}`);
    }
    return {
      state: normalized,
      task: clone(normalized.tasks.find((item) => item.id === task.id)),
      reservations: normalized.reservations.filter((item) => item.taskId === task.id).map(clone),
      reasonCode: "handed_off",
      idempotent: false
    };
  }

  function cancelTask(currentState, command) {
    assertValidState(currentState);
    requireExactKeys(command, ["commandId", "taskId", "at", "reasonCode", "safeRouteId"], "cancel command");
    requireIdentifier(command.commandId, "cancel command.commandId");
    requireIdentifier(command.taskId, "cancel command.taskId");
    requireMinute(command.at, "cancel command.at");
    requireIdentifier(command.reasonCode, "cancel command.reasonCode");
    if (own(command, "safeRouteId")) requireIdentifier(command.safeRouteId, "cancel command.safeRouteId");
    const fingerprint = fingerprintCommand("cancel", command);
    const repeated = alreadyApplied(currentState, command.commandId, fingerprint);
    if (repeated) return repeated;
    const existing = currentState.tasks.find((task) => task.id === command.taskId);
    if (!existing) throw new Error(`Unknown task: ${command.taskId}.`);
    if (!["queued", "active"].includes(existing.status)) throw new Error(`Cannot cancel task from ${existing.status}.`);
    if (command.at < existing.queuedAt || (existing.status === "active" && command.at < existing.startAt)) {
      throw new Error("Task cancellation time cannot move backwards.");
    }
    if (existing.urgency === "urgent" && existing.safeRouteRequired && !own(command, "safeRouteId")) {
      throw new Error("Cancelling an urgent task requires an explicit safeRouteId.");
    }
    const state = withAppliedCommand(currentState, command.commandId, fingerprint);
    const task = state.tasks.find((item) => item.id === command.taskId);
    const from = task.status;
    task.status = "cancelled";
    task.cancelledAt = command.at;
    task.cancellation = { reasonCode: command.reasonCode };
    if (own(command, "safeRouteId")) task.cancellation.safeRouteId = command.safeRouteId;
    task.history.push({ from, to: "cancelled", at: command.at, commandId: command.commandId });
    if (from === "active") {
      state.reservations = state.reservations.flatMap((reservation) => {
        if (reservation.taskId !== task.id || reservation.endAt <= command.at) return [reservation];
        if (command.at <= reservation.startAt) return [];
        return [{ ...reservation, endAt: command.at }];
      });
    }
    const normalized = normalizeState(state);
    return {
      state: normalized,
      task: clone(normalized.tasks.find((item) => item.id === task.id)),
      reasonCode: "cancelled",
      idempotent: false
    };
  }

  function completeTask(currentState, command) {
    assertValidState(currentState);
    requireExactKeys(command, ["commandId", "taskId", "at"], "complete command");
    requireIdentifier(command.commandId, "complete command.commandId");
    requireIdentifier(command.taskId, "complete command.taskId");
    requireMinute(command.at, "complete command.at");
    const fingerprint = fingerprintCommand("complete", command);
    const repeated = alreadyApplied(currentState, command.commandId, fingerprint);
    if (repeated) return repeated;
    const existing = currentState.tasks.find((task) => task.id === command.taskId);
    if (!existing) throw new Error(`Unknown task: ${command.taskId}.`);
    if (existing.status !== "active") throw new Error(`Cannot complete task from ${existing.status}.`);
    if (command.at < existing.endAt) throw new Error("Task cannot complete before its reserved interval ends.");
    const state = withAppliedCommand(currentState, command.commandId, fingerprint);
    const task = state.tasks.find((item) => item.id === command.taskId);
    task.status = "completed";
    task.completedAt = command.at;
    task.history.push({ from: "active", to: "completed", at: command.at, commandId: command.commandId });
    const normalized = normalizeState(state);
    return {
      state: normalized,
      task: clone(normalized.tasks.find((item) => item.id === task.id)),
      reasonCode: "completed",
      idempotent: false
    };
  }

  function summarizeState(currentState) {
    assertValidState(currentState);
    const statusCounts = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0]));
    for (const task of currentState.tasks) statusCounts[task.status] += 1;
    const queued = currentState.tasks.filter((task) => task.status === "queued").slice().sort(queuedTaskComparator);
    return {
      schemaVersion: SCHEMA_VERSION,
      resourceCount: Object.keys(currentState.resources).length,
      taskCount: currentState.tasks.length,
      reservationCount: currentState.reservations.length,
      statusCounts,
      queuedTaskIds: queued.map((task) => task.id),
      activeTaskIds: currentState.tasks.filter((task) => task.status === "active").map((task) => task.id).sort(compareStrings),
      urgentSafeRouteTaskIds: queued
        .filter((task) => task.urgency === "urgent" && task.safeRouteRequired)
        .map((task) => task.id)
    };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    TASK_STATUSES,
    URGENCY_LEVELS,
    intervalsOverlap,
    adjustDurationForFatigue,
    createState,
    normalizeState,
    validateState,
    enqueueTask,
    findEarliestSlot,
    scheduleTask,
    handoffTask,
    cancelTask,
    completeTask,
    summarizeState
  });
});
