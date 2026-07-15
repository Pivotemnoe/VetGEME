(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_ASYNC_EVENTS_V3 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PREFIX = "EV";
  const STATUSES = Object.freeze(["scheduled", "handled", "cancelled"]);

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function requireString(value, label) {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  }

  function requireMinute(value, label) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative campaign minute.`);
  }

  function isAsyncEventId(value) {
    const match = typeof value === "string" && value.match(/^EV-(\d{6})$/);
    return Boolean(match && Number(match[1]) > 0);
  }

  function toCampaignMinute(day, minute) {
    if (!Number.isInteger(day) || day < 1) throw new RangeError("day must be a positive integer.");
    if (!Number.isFinite(minute) || minute < 0 || minute >= 1440) throw new RangeError("minute must be in [0, 1440).");
    return (day - 1) * 1440 + Math.floor(minute);
  }

  function fromCampaignMinute(value) {
    requireMinute(value, "campaignMinute");
    return { day: Math.floor(value / 1440) + 1, minute: value % 1440 };
  }

  function formatAsyncEventId(sequence) {
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) {
      throw new RangeError("Async event sequence must be between 1 and 999999.");
    }
    return `${PREFIX}-${String(sequence).padStart(6, "0")}`;
  }

  function parseSequence(value) {
    const id = typeof value === "string" ? value : value && value.id;
    const match = typeof id === "string" && id.match(/^EV-(\d{6})$/);
    return match ? Number(match[1]) : 0;
  }

  function allocateAsyncEventId(existing) {
    if (!Array.isArray(existing)) throw new TypeError("Existing async events must be an array.");
    const used = new Set(existing.map((item) => (typeof item === "string" ? item : item && item.id)).filter(Boolean));
    let sequence = existing.reduce((maximum, item) => Math.max(maximum, parseSequence(item)), 0) + 1;
    while (used.has(formatAsyncEventId(sequence))) sequence += 1;
    return formatAsyncEventId(sequence);
  }

  function createAsyncEvent(input) {
    if (!isObject(input)) throw new TypeError("Async event input must be an object.");
    requireString(input.id, "id");
    if (!isAsyncEventId(input.id)) throw new TypeError("Async event id must match EV-000001.");
    for (const field of ["kind", "overduePolicy"]) requireString(input[field], field);
    requireMinute(input.createdAt, "createdAt");
    requireMinute(input.dueAt, "dueAt");
    if (!Number.isInteger(input.priority)) throw new TypeError("priority must be an explicit integer.");
    const event = {
      schemaVersion: 1,
      id: input.id,
      kind: input.kind,
      createdAt: input.createdAt,
      dueAt: input.dueAt,
      priority: input.priority,
      overduePolicy: input.overduePolicy,
      status: "scheduled",
      history: [{ from: null, to: "scheduled", at: input.createdAt }],
      appliedCommandIds: []
    };
    for (const field of ["sourceType", "sourceId"]) {
      if (input[field] !== undefined) {
        requireString(input[field], field);
        event[field] = input[field];
      }
    }
    if (input.payload !== undefined) event.payload = clone(input.payload);
    return event;
  }

  function validateAsyncEvent(event) {
    const errors = [];
    if (!isObject(event)) return { valid: false, errors: ["event_not_object"] };
    if (event.schemaVersion !== 1) errors.push("unexpected_schema_version");
    if (!isAsyncEventId(event.id)) errors.push("invalid_id");
    if (typeof event.kind !== "string" || !event.kind) errors.push("invalid_kind");
    if (typeof event.overduePolicy !== "string" || !event.overduePolicy) errors.push("invalid_overdue_policy");
    if (!Number.isInteger(event.createdAt) || event.createdAt < 0) errors.push("invalid_created_at");
    if (!Number.isInteger(event.dueAt) || event.dueAt < 0) errors.push("invalid_due_at");
    if (!Number.isInteger(event.priority)) errors.push("invalid_priority");
    if (!STATUSES.includes(event.status)) errors.push("invalid_status");
    if (!Array.isArray(event.history) || event.history.length === 0) errors.push("invalid_history");
    else {
      const first = event.history[0];
      if (!isObject(first) || first.from !== null || first.to !== "scheduled" || first.at !== event.createdAt) errors.push("invalid_history_origin");
      if (event.history.length > 2) errors.push("invalid_history_length");
      if (event.history.length === 2) {
        const terminal = event.history[1];
        if (!isObject(terminal) || terminal.from !== "scheduled" || !["handled", "cancelled"].includes(terminal.to) ||
            terminal.to !== event.status || !Number.isInteger(terminal.at) || terminal.at < event.createdAt ||
            typeof terminal.commandId !== "string" || !terminal.commandId) errors.push("invalid_terminal_history");
      } else if (event.status !== "scheduled") errors.push("history_status_mismatch");
    }
    if (!Array.isArray(event.appliedCommandIds) || new Set(event.appliedCommandIds).size !== event.appliedCommandIds.length) {
      errors.push("invalid_applied_command_ids");
    } else if (Array.isArray(event.history)) {
      const historyCommandIds = event.history.slice(1).map((entry) => entry && entry.commandId);
      if (JSON.stringify(historyCommandIds) !== JSON.stringify(event.appliedCommandIds)) errors.push("history_command_ids_mismatch");
    }
    return { valid: errors.length === 0, errors };
  }

  function sortEvents(events) {
    if (!Array.isArray(events)) throw new TypeError("Async events must be an array.");
    return events.map(clone).sort((left, right) =>
      left.dueAt - right.dueAt || left.priority - right.priority || left.id.localeCompare(right.id)
    );
  }

  function enqueueAsyncEvent(events, event) {
    if (!Array.isArray(events)) throw new TypeError("Async events must be an array.");
    const validation = validateAsyncEvent(event);
    if (!validation.valid) throw new Error(`Invalid async event: ${validation.errors.join(", ")}`);
    if (events.some((item) => item.id === event.id)) throw new Error(`Duplicate async event id: ${event.id}`);
    return sortEvents(events.concat(clone(event)));
  }

  function dueEvents(events, now) {
    requireMinute(now, "now");
    return sortEvents(events.filter((event) => event.status === "scheduled" && event.dueAt <= now));
  }

  function transitionEvent(currentEvent, command, targetStatus, recordField) {
    const validation = validateAsyncEvent(currentEvent);
    if (!validation.valid) throw new Error(`Invalid async event: ${validation.errors.join(", ")}`);
    if (!isObject(command)) throw new TypeError("Async event command must be an object.");
    requireString(command.commandId, "commandId");
    requireMinute(command.at, "at");
    if (currentEvent.appliedCommandIds.includes(command.commandId)) return { event: clone(currentEvent), idempotent: true };
    if (currentEvent.status !== "scheduled") throw new Error(`Cannot transition async event from ${currentEvent.status}.`);
    const lastAt = currentEvent.history[currentEvent.history.length - 1].at;
    if (command.at < lastAt) throw new RangeError("Async event transition time cannot move backwards.");
    const event = clone(currentEvent);
    event.status = targetStatus;
    if (command.record !== undefined) event[recordField] = clone(command.record);
    event.history.push({ from: "scheduled", to: targetStatus, at: command.at, commandId: command.commandId });
    event.appliedCommandIds.push(command.commandId);
    return { event, idempotent: false };
  }

  function markAsyncEventHandled(event, command) {
    return transitionEvent(event, command, "handled", "handlingRecord");
  }

  function cancelAsyncEvent(event, command) {
    return transitionEvent(event, command, "cancelled", "cancellationRecord");
  }

  function turnaroundWindow(submittedAt, turnaroundDays) {
    requireMinute(submittedAt, "submittedAt");
    if (!Array.isArray(turnaroundDays) || turnaroundDays.length !== 2 ||
        !turnaroundDays.every((day) => Number.isInteger(day) && day >= 0) || turnaroundDays[0] > turnaroundDays[1]) {
      throw new TypeError("turnaroundDays must be an ordered [minDays, maxDays] pair.");
    }
    return {
      earliestAt: submittedAt + turnaroundDays[0] * 1440,
      latestAt: submittedAt + turnaroundDays[1] * 1440
    };
  }

  return Object.freeze({
    PREFIX,
    STATUSES,
    toCampaignMinute,
    fromCampaignMinute,
    formatAsyncEventId,
    allocateAsyncEventId,
    createAsyncEvent,
    validateAsyncEvent,
    enqueueAsyncEvent,
    sortEvents,
    dueEvents,
    markAsyncEventHandled,
    cancelAsyncEvent,
    turnaroundWindow
  });
});
