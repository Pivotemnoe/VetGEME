(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_REFERRAL_ORDERS_V3 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PREFIX = "RF";
  const TERMINAL_STATUSES = Object.freeze(["owner_refused", "deferred", "closed"]);
  const TRANSITIONS = Object.freeze({
    proposed: Object.freeze(["owner_accepted", "owner_refused", "deferred"]),
    owner_accepted: Object.freeze(["sent"]),
    sent: Object.freeze(["response_received"]),
    response_received: Object.freeze(["reviewed"]),
    reviewed: Object.freeze(["communicated"]),
    communicated: Object.freeze(["closed"]),
    owner_refused: Object.freeze([]),
    deferred: Object.freeze([]),
    closed: Object.freeze([])
  });
  const STATUSES = Object.freeze(Object.keys(TRANSITIONS));

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

  function isReferralOrderId(value) {
    const match = typeof value === "string" && value.match(/^RF-(\d{6})$/);
    return Boolean(match && Number(match[1]) > 0);
  }

  function formatReferralOrderId(sequence) {
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) {
      throw new RangeError("Referral order sequence must be between 1 and 999999.");
    }
    return `${PREFIX}-${String(sequence).padStart(6, "0")}`;
  }

  function parseSequence(value) {
    const id = typeof value === "string" ? value : value && value.id;
    const match = typeof id === "string" && id.match(/^RF-(\d{6})$/);
    return match ? Number(match[1]) : 0;
  }

  function allocateReferralOrderId(existing) {
    if (!Array.isArray(existing)) throw new TypeError("Existing referral orders must be an array.");
    const used = new Set(existing.map((item) => (typeof item === "string" ? item : item && item.id)).filter(Boolean));
    let sequence = existing.reduce((maximum, item) => Math.max(maximum, parseSequence(item)), 0) + 1;
    while (used.has(formatReferralOrderId(sequence))) sequence += 1;
    return formatReferralOrderId(sequence);
  }

  function createReferralOrder(input) {
    if (!isObject(input)) throw new TypeError("Referral order input must be an object.");
    requireString(input.id, "id");
    if (!isReferralOrderId(input.id)) throw new TypeError("Referral order id must match RF-000001.");
    for (const field of ["caseId", "patientId", "reason", "urgency", "routeCapabilityId"]) requireString(input[field], field);
    requireMinute(input.createdAt, "createdAt");
    const order = {
      schemaVersion: 1,
      id: input.id,
      caseId: input.caseId,
      patientId: input.patientId,
      reason: input.reason,
      urgency: input.urgency,
      routeCapabilityId: input.routeCapabilityId,
      createdAt: input.createdAt,
      status: "proposed",
      history: [{ from: null, to: "proposed", at: input.createdAt }],
      appliedCommandIds: []
    };
    for (const field of ["encounterId", "createdBy", "destination"]) {
      if (input[field] !== undefined) {
        requireString(input[field], field);
        order[field] = input[field];
      }
    }
    if (input.preliminaryCost !== undefined) order.preliminaryCost = clone(input.preliminaryCost);
    if (input.sameDayAvailability !== undefined) order.sameDayAvailability = clone(input.sameDayAvailability);
    if (input.stabilization !== undefined) order.stabilization = clone(input.stabilization);
    return order;
  }

  function validateReferralOrder(order) {
    const errors = [];
    if (!isObject(order)) return { valid: false, errors: ["order_not_object"] };
    if (order.schemaVersion !== 1) errors.push("unexpected_schema_version");
    if (!isReferralOrderId(order.id)) errors.push("invalid_id");
    for (const field of ["caseId", "patientId", "reason", "urgency", "routeCapabilityId"]) {
      if (typeof order[field] !== "string" || !order[field]) errors.push(`invalid_${field}`);
    }
    if (!Number.isInteger(order.createdAt) || order.createdAt < 0) errors.push("invalid_created_at");
    if (!STATUSES.includes(order.status)) errors.push("invalid_status");
    if (!Array.isArray(order.history) || order.history.length === 0) errors.push("invalid_history");
    else {
      const first = order.history[0];
      if (!isObject(first) || first.from !== null || first.to !== "proposed" || first.at !== order.createdAt) errors.push("invalid_history_origin");
      let previousStatus = "proposed";
      let previousAt = order.createdAt;
      for (let index = 1; index < order.history.length; index += 1) {
        const entry = order.history[index];
        if (!isObject(entry) || entry.from !== previousStatus || !TRANSITIONS[previousStatus] || !TRANSITIONS[previousStatus].includes(entry.to)) {
          errors.push(`invalid_history_transition:${index}`);
          break;
        }
        if (!Number.isInteger(entry.at) || entry.at < previousAt || typeof entry.commandId !== "string" || !entry.commandId) {
          errors.push(`invalid_history_entry:${index}`);
        }
        previousStatus = entry.to;
        previousAt = entry.at;
      }
      if (previousStatus !== order.status) errors.push("history_status_mismatch");
    }
    if (!Array.isArray(order.appliedCommandIds) || new Set(order.appliedCommandIds).size !== order.appliedCommandIds.length) {
      errors.push("invalid_applied_command_ids");
    } else if (Array.isArray(order.history)) {
      const historyCommandIds = order.history.slice(1).map((entry) => entry && entry.commandId);
      if (JSON.stringify(historyCommandIds) !== JSON.stringify(order.appliedCommandIds)) errors.push("history_command_ids_mismatch");
    }
    const reached = (status) => Array.isArray(order.history) && order.history.some((entry) => entry && entry.to === status);
    const responseReached = reached("response_received");
    if (order.response !== undefined && !responseReached) errors.push("response_before_received");
    if (responseReached && order.response === undefined) errors.push("response_missing");
    if (reached("sent") && !isObject(order.transmission)) errors.push("transmission_missing");
    if (reached("reviewed") && (!isObject(order.review) || typeof order.review.reviewerId !== "string" || !order.review.reviewerId)) errors.push("review_missing");
    if (reached("communicated") && !isObject(order.communication)) errors.push("communication_missing");
    if (order.status === "owner_refused" || order.status === "deferred") {
      for (const field of ["transmission", "response", "outcome", "asyncEventIds", "review", "communication", "closure"]) {
        if (order[field] !== undefined) errors.push(`refusal_invariant:${field}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  function assertOnlyPayloadKeys(payload, allowed, status) {
    for (const key of Object.keys(payload)) {
      if (!allowed.includes(key)) throw new Error(`Payload field ${key} is not allowed for ${status}.`);
    }
  }

  function applyReferralTransition(currentOrder, command) {
    const validation = validateReferralOrder(currentOrder);
    if (!validation.valid) throw new Error(`Invalid referral order: ${validation.errors.join(", ")}`);
    if (!isObject(command)) throw new TypeError("Referral transition command must be an object.");
    requireString(command.commandId, "commandId");
    requireString(command.to, "to");
    requireMinute(command.at, "at");
    if (currentOrder.appliedCommandIds.includes(command.commandId)) {
      return { order: clone(currentOrder), effects: [], idempotent: true };
    }
    if (!STATUSES.includes(command.to) || !TRANSITIONS[currentOrder.status].includes(command.to)) {
      throw new Error(`Invalid referral transition: ${currentOrder.status} -> ${command.to}`);
    }
    const lastAt = currentOrder.history[currentOrder.history.length - 1].at;
    if (command.at < lastAt) throw new RangeError("Referral transition time cannot move backwards.");
    const payload = command.payload === undefined ? {} : command.payload;
    if (!isObject(payload)) throw new TypeError("Referral transition payload must be an object.");
    const order = clone(currentOrder);
    switch (command.to) {
      case "owner_accepted":
      case "owner_refused":
      case "deferred":
        assertOnlyPayloadKeys(payload, ["ownerDecision"], command.to);
        if (payload.ownerDecision !== undefined) order.ownerDecision = clone(payload.ownerDecision);
        break;
      case "sent":
        assertOnlyPayloadKeys(payload, ["transmission", "destination", "preliminaryCost", "sameDayAvailability", "stabilization", "asyncEventIds"], command.to);
        if (!isObject(payload.transmission)) throw new TypeError("transmission must be explicitly authored.");
        order.transmission = clone(payload.transmission);
        if (payload.destination !== undefined) {
          requireString(payload.destination, "destination");
          order.destination = payload.destination;
        }
        for (const field of ["preliminaryCost", "sameDayAvailability", "stabilization"]) {
          if (payload[field] !== undefined) order[field] = clone(payload[field]);
        }
        if (payload.asyncEventIds !== undefined) {
          if (!Array.isArray(payload.asyncEventIds) || payload.asyncEventIds.some((id) => typeof id !== "string" || !id)) {
            throw new TypeError("asyncEventIds must be an array of non-empty strings.");
          }
          order.asyncEventIds = clone(payload.asyncEventIds);
        }
        break;
      case "response_received":
        assertOnlyPayloadKeys(payload, ["response", "outcome"], command.to);
        if (!Object.prototype.hasOwnProperty.call(payload, "response") || payload.response === undefined) throw new TypeError("response must be explicitly authored.");
        order.response = clone(payload.response);
        if (payload.outcome !== undefined) order.outcome = clone(payload.outcome);
        break;
      case "reviewed":
        assertOnlyPayloadKeys(payload, ["review"], command.to);
        if (!isObject(payload.review)) throw new TypeError("review must be explicitly authored.");
        requireString(payload.review.reviewerId, "review.reviewerId");
        order.review = clone(payload.review);
        break;
      case "communicated":
        assertOnlyPayloadKeys(payload, ["communication"], command.to);
        if (!isObject(payload.communication)) throw new TypeError("communication must be explicitly authored.");
        order.communication = clone(payload.communication);
        break;
      case "closed":
        assertOnlyPayloadKeys(payload, ["closure"], command.to);
        if (payload.closure !== undefined) order.closure = clone(payload.closure);
        break;
      default:
        throw new Error(`Unsupported referral status: ${command.to}`);
    }
    order.status = command.to;
    order.history.push({ from: currentOrder.status, to: command.to, at: command.at, commandId: command.commandId });
    order.appliedCommandIds.push(command.commandId);
    const nextValidation = validateReferralOrder(order);
    if (!nextValidation.valid) throw new Error(`Invalid transitioned referral order: ${nextValidation.errors.join(", ")}`);
    return { order, effects: [], idempotent: false };
  }

  function createSupersedingReferralOrder(currentOrder, input) {
    if (!TERMINAL_STATUSES.includes(currentOrder.status)) throw new Error("Only a terminal referral order can be superseded.");
    const order = createReferralOrder(input);
    order.supersedesOrderId = currentOrder.id;
    return order;
  }

  return Object.freeze({
    PREFIX,
    STATUSES,
    TERMINAL_STATUSES,
    TRANSITIONS,
    formatReferralOrderId,
    allocateReferralOrderId,
    createReferralOrder,
    createSupersedingReferralOrder,
    validateReferralOrder,
    applyReferralTransition
  });
});
