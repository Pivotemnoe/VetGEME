(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_RESEARCH_ORDERS_V3 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PREFIX = "RO";
  const TERMINAL_STATUSES = Object.freeze(["owner_refused", "deferred", "follow_up_closed"]);
  const TRANSITIONS = Object.freeze({
    proposed: Object.freeze(["owner_accepted", "owner_refused", "deferred"]),
    owner_accepted: Object.freeze(["sample_planned"]),
    sample_planned: Object.freeze(["sample_collected"]),
    sample_collected: Object.freeze(["sent_or_queued"]),
    sent_or_queued: Object.freeze(["processing"]),
    processing: Object.freeze(["resulted"]),
    resulted: Object.freeze(["reviewed_by_doctor"]),
    reviewed_by_doctor: Object.freeze(["communicated_to_owner"]),
    communicated_to_owner: Object.freeze(["follow_up_closed"]),
    owner_refused: Object.freeze([]),
    deferred: Object.freeze([]),
    follow_up_closed: Object.freeze([])
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

  function isResearchOrderId(value) {
    const match = typeof value === "string" && value.match(/^RO-(\d{6})$/);
    return Boolean(match && Number(match[1]) > 0);
  }

  function formatResearchOrderId(sequence) {
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) {
      throw new RangeError("Research order sequence must be between 1 and 999999.");
    }
    return `${PREFIX}-${String(sequence).padStart(6, "0")}`;
  }

  function parseSequence(value) {
    const id = typeof value === "string" ? value : value && value.id;
    const match = typeof id === "string" && id.match(/^RO-(\d{6})$/);
    return match ? Number(match[1]) : 0;
  }

  function allocateResearchOrderId(existing) {
    if (!Array.isArray(existing)) throw new TypeError("Existing research orders must be an array.");
    const used = new Set(existing.map((item) => (typeof item === "string" ? item : item && item.id)).filter(Boolean));
    let sequence = existing.reduce((maximum, item) => Math.max(maximum, parseSequence(item)), 0) + 1;
    while (used.has(formatResearchOrderId(sequence))) sequence += 1;
    return formatResearchOrderId(sequence);
  }

  function createResearchOrder(input) {
    if (!isObject(input)) throw new TypeError("Research order input must be an object.");
    requireString(input.id, "id");
    if (!isResearchOrderId(input.id)) throw new TypeError("Research order id must match RO-000001.");
    for (const field of ["caseId", "patientId", "researchId", "route"]) requireString(input[field], field);
    requireMinute(input.createdAt, "createdAt");
    if (typeof input.sampleRequired !== "boolean") throw new TypeError("sampleRequired must be explicit boolean.");
    const order = {
      schemaVersion: 1,
      id: input.id,
      caseId: input.caseId,
      patientId: input.patientId,
      researchId: input.researchId,
      route: input.route,
      sampleRequired: input.sampleRequired,
      createdAt: input.createdAt,
      status: "proposed",
      history: [{ from: null, to: "proposed", at: input.createdAt }],
      appliedCommandIds: []
    };
    if (input.encounterId !== undefined) {
      requireString(input.encounterId, "encounterId");
      order.encounterId = input.encounterId;
    }
    if (input.createdBy !== undefined) {
      requireString(input.createdBy, "createdBy");
      order.createdBy = input.createdBy;
    }
    return order;
  }

  function validateResearchOrder(order) {
    const errors = [];
    if (!isObject(order)) return { valid: false, errors: ["order_not_object"] };
    if (order.schemaVersion !== 1) errors.push("unexpected_schema_version");
    if (!isResearchOrderId(order.id)) errors.push("invalid_id");
    for (const field of ["caseId", "patientId", "researchId", "route"]) {
      if (typeof order[field] !== "string" || !order[field]) errors.push(`invalid_${field}`);
    }
    if (typeof order.sampleRequired !== "boolean") errors.push("sample_required_not_boolean");
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
    const resultIndex = Array.isArray(order.history) ? order.history.findIndex((entry) => entry && entry.to === "resulted") : -1;
    if (order.authoredResult !== undefined && resultIndex < 0) errors.push("result_before_resulted");
    if (reached("sample_planned") && !isObject(order.samplePlan)) errors.push("sample_plan_missing");
    if (reached("sample_collected") && !isObject(order.sampleCollection)) errors.push("sample_collection_missing");
    if (reached("sent_or_queued") && !isObject(order.dispatch)) errors.push("dispatch_missing");
    if (reached("processing") && !isObject(order.processing)) errors.push("processing_record_missing");
    if (reached("resulted") && order.authoredResult === undefined) errors.push("resulted_without_authored_result");
    if (reached("reviewed_by_doctor") && (!isObject(order.review) || typeof order.review.reviewerId !== "string" || !order.review.reviewerId)) errors.push("review_missing");
    if (reached("communicated_to_owner") && !isObject(order.communication)) errors.push("communication_missing");
    if (order.status === "owner_refused" || order.status === "deferred") {
      for (const field of [
        "samplePlan", "sampleCollection", "authoredResult", "charges", "consumptions", "queueTaskId",
        "asyncEventIds", "processing", "dispatch", "review", "communication", "closure"
      ]) {
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

  function validateConsumptions(value, label) {
    if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} must be a non-empty array.`);
    for (const item of value) {
      if (!isObject(item)) throw new TypeError(`${label} entries must be objects.`);
      requireString(item.capabilityId, `${label}.capabilityId`);
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new RangeError(`${label}.quantity must be positive.`);
    }
  }

  function applyResearchTransition(currentOrder, command) {
    const validation = validateResearchOrder(currentOrder);
    if (!validation.valid) throw new Error(`Invalid research order: ${validation.errors.join(", ")}`);
    if (!isObject(command)) throw new TypeError("Research transition command must be an object.");
    requireString(command.commandId, "commandId");
    requireString(command.to, "to");
    requireMinute(command.at, "at");
    if (currentOrder.appliedCommandIds.includes(command.commandId)) {
      return { order: clone(currentOrder), effects: [], idempotent: true };
    }
    if (!STATUSES.includes(command.to) || !TRANSITIONS[currentOrder.status].includes(command.to)) {
      throw new Error(`Invalid research transition: ${currentOrder.status} -> ${command.to}`);
    }
    const lastAt = currentOrder.history[currentOrder.history.length - 1].at;
    if (command.at < lastAt) throw new RangeError("Research transition time cannot move backwards.");
    const payload = command.payload === undefined ? {} : command.payload;
    if (!isObject(payload)) throw new TypeError("Research transition payload must be an object.");

    const order = clone(currentOrder);
    const effects = [];
    switch (command.to) {
      case "owner_accepted":
        assertOnlyPayloadKeys(payload, ["ownerDecision"], command.to);
        if (payload.ownerDecision !== undefined) order.ownerDecision = clone(payload.ownerDecision);
        break;
      case "owner_refused":
      case "deferred":
        assertOnlyPayloadKeys(payload, ["ownerDecision"], command.to);
        if (payload.ownerDecision !== undefined) order.ownerDecision = clone(payload.ownerDecision);
        break;
      case "sample_planned":
        assertOnlyPayloadKeys(payload, ["samplePlan"], command.to);
        if (!isObject(payload.samplePlan)) throw new TypeError("samplePlan must be explicitly authored.");
        order.samplePlan = clone(payload.samplePlan);
        break;
      case "sample_collected":
        assertOnlyPayloadKeys(payload, ["sampleCollection", "sampleConsumptions"], command.to);
        if (!isObject(payload.sampleCollection)) throw new TypeError("sampleCollection must be explicitly authored.");
        order.sampleCollection = clone(payload.sampleCollection);
        if (payload.sampleConsumptions !== undefined) {
          validateConsumptions(payload.sampleConsumptions, "sampleConsumptions");
          order.consumptions = (order.consumptions || []).concat(clone(payload.sampleConsumptions));
          effects.push({ type: "consume", stage: "sample_collected", items: clone(payload.sampleConsumptions) });
        }
        break;
      case "sent_or_queued":
        assertOnlyPayloadKeys(payload, ["dispatch", "processingConsumptions", "charge", "queueTaskId", "asyncEventIds"], command.to);
        if (!isObject(payload.dispatch)) throw new TypeError("dispatch must be explicitly authored.");
        order.dispatch = clone(payload.dispatch);
        if (payload.processingConsumptions !== undefined) {
          validateConsumptions(payload.processingConsumptions, "processingConsumptions");
          order.consumptions = (order.consumptions || []).concat(clone(payload.processingConsumptions));
          effects.push({ type: "consume", stage: "sent_or_queued", items: clone(payload.processingConsumptions) });
        }
        if (payload.charge !== undefined) {
          if (!isObject(payload.charge) || !Number.isFinite(payload.charge.amount) || payload.charge.amount < 0) {
            throw new TypeError("charge must contain an explicit non-negative amount.");
          }
          requireString(payload.charge.currency, "charge.currency");
          order.charges = (order.charges || []).concat(clone(payload.charge));
          effects.push({ type: "charge", stage: "sent_or_queued", charge: clone(payload.charge) });
        }
        if (payload.queueTaskId !== undefined) {
          requireString(payload.queueTaskId, "queueTaskId");
          order.queueTaskId = payload.queueTaskId;
        }
        if (payload.asyncEventIds !== undefined) {
          if (!Array.isArray(payload.asyncEventIds) || payload.asyncEventIds.some((id) => typeof id !== "string" || !id)) {
            throw new TypeError("asyncEventIds must be an array of non-empty strings.");
          }
          order.asyncEventIds = clone(payload.asyncEventIds);
        }
        break;
      case "processing":
        assertOnlyPayloadKeys(payload, ["processing"], command.to);
        if (!isObject(payload.processing)) throw new TypeError("processing must be explicitly authored.");
        order.processing = clone(payload.processing);
        break;
      case "resulted":
        assertOnlyPayloadKeys(payload, ["authoredResult"], command.to);
        if (!Object.prototype.hasOwnProperty.call(payload, "authoredResult") || payload.authoredResult === undefined) {
          throw new TypeError("authoredResult is required.");
        }
        order.authoredResult = clone(payload.authoredResult);
        break;
      case "reviewed_by_doctor":
        assertOnlyPayloadKeys(payload, ["review"], command.to);
        if (!isObject(payload.review)) throw new TypeError("review must be explicitly authored.");
        requireString(payload.review.reviewerId, "review.reviewerId");
        order.review = clone(payload.review);
        break;
      case "communicated_to_owner":
        assertOnlyPayloadKeys(payload, ["communication"], command.to);
        if (!isObject(payload.communication)) throw new TypeError("communication must be explicitly authored.");
        order.communication = clone(payload.communication);
        break;
      case "follow_up_closed":
        assertOnlyPayloadKeys(payload, ["closure"], command.to);
        if (payload.closure !== undefined) order.closure = clone(payload.closure);
        break;
      default:
        throw new Error(`Unsupported research status: ${command.to}`);
    }
    order.status = command.to;
    order.history.push({ from: currentOrder.status, to: command.to, at: command.at, commandId: command.commandId });
    order.appliedCommandIds.push(command.commandId);
    const nextValidation = validateResearchOrder(order);
    if (!nextValidation.valid) throw new Error(`Invalid transitioned research order: ${nextValidation.errors.join(", ")}`);
    return { order, effects, idempotent: false };
  }

  function createSupersedingResearchOrder(currentOrder, input) {
    if (!TERMINAL_STATUSES.includes(currentOrder.status)) throw new Error("Only a terminal research order can be superseded.");
    const order = createResearchOrder(input);
    order.supersedesOrderId = currentOrder.id;
    return order;
  }

  return Object.freeze({
    PREFIX,
    STATUSES,
    TERMINAL_STATUSES,
    TRANSITIONS,
    formatResearchOrderId,
    allocateResearchOrderId,
    createResearchOrder,
    createSupersedingResearchOrder,
    validateResearchOrder,
    applyResearchTransition
  });
});
