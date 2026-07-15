(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_REPUTATION_RUNTIME_V6 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const AXES = Object.freeze([
    "clinical",
    "communication",
    "accessibility",
    "organization"
  ]);
  const TOP_LEVEL_FIELDS = Object.freeze([
    "schemaVersion",
    "catalog",
    "scores",
    "auditHistory",
    "appliedCommandIds",
    "commandFingerprints"
  ]);
  const CATALOG_FIELDS = Object.freeze(["catalogId", "catalogVersion", "status"]);
  const BASELINE_ENTRY_FIELDS = Object.freeze([
    "schemaVersion",
    "sequence",
    "type",
    "commandId",
    "catalogId",
    "catalogVersion",
    "status",
    "scores"
  ]);
  const EVENT_ENTRY_FIELDS = Object.freeze([
    "schemaVersion",
    "sequence",
    "type",
    "commandId",
    "eventId",
    "sourceType",
    "sourceId",
    "axis",
    "delta"
  ]);
  const REVERSAL_ENTRY_FIELDS = Object.freeze([
    "schemaVersion",
    "sequence",
    "type",
    "commandId",
    "reversalId",
    "targetEventId",
    "sourceType",
    "sourceId",
    "axis",
    "delta"
  ]);
  const ENTRY_TYPES = Object.freeze({
    BASELINE: "baseline_initialized",
    EVENT: "axis_delta_recorded",
    REVERSAL: "axis_delta_reversed"
  });
  const COMMAND_TYPES = Object.freeze({
    [ENTRY_TYPES.BASELINE]: "initialize_baseline",
    [ENTRY_TYPES.EVENT]: "record_event",
    [ENTRY_TYPES.REVERSAL]: "reverse_event"
  });
  const FORBIDDEN_REPUTATION_FIELDS = Object.freeze(new Set([
    "reason",
    "reasons",
    "note",
    "notes",
    "text",
    "label",
    "description",
    "summary",
    "payload",
    "comment",
    "comments",
    "diagnosis",
    "diagnoses",
    "diagnosisid",
    "diagnosistruth",
    "truediagnosis",
    "truediagnosisid",
    "medicaltruth",
    "clinicaltruth",
    "medicaltext",
    "clinicaltext",
    "complaint",
    "complaints",
    "symptom",
    "symptoms",
    "finding",
    "findings",
    "treatment",
    "treatments",
    "prescription",
    "outcome",
    "ownertrust",
    "clinicalreliability"
  ]));

  function isObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function compareStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function requireObject(value, label) {
    if (!isObject(value)) throw new TypeError(`${label} must be a plain object.`);
  }

  function requireIdentifier(value, label) {
    if (typeof value !== "string" || !value.trim()) {
      throw new TypeError(`${label} must be a non-empty stable identifier.`);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) {
      throw new TypeError(`${label} must be a stable identifier, not display or free text.`);
    }
  }

  function requireFiniteNumber(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`${label} must be an explicit finite number.`);
    }
  }

  function requireSequence(value, label) {
    if (!Number.isInteger(value) || value < 0) {
      throw new TypeError(`${label} must be a non-negative audit sequence.`);
    }
  }

  function normalizedNumber(value) {
    return value === 0 ? 0 : value;
  }

  function assertAllowedKeys(value, allowed, label) {
    requireObject(value, label);
    const allowedSet = new Set(allowed);
    for (const key of Object.keys(value)) {
      if (!allowedSet.has(key)) throw new Error(`${label} contains unsupported field ${key}.`);
    }
  }

  function assertExactKeys(value, expected, label) {
    assertAllowedKeys(value, expected, label);
    for (const key of expected) {
      if (!hasOwn(value, key)) throw new Error(`${label} is missing required field ${key}.`);
    }
  }

  function assertSerializable(value, label, ancestors) {
    const stack = ancestors || new Set();
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError(`${label} contains a non-finite number.`);
      return;
    }
    if (typeof value !== "object") throw new TypeError(`${label} must be JSON-serializable.`);
    if (stack.has(value)) throw new TypeError(`${label} contains a cycle.`);
    stack.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertSerializable(item, `${label}[${index}]`, stack));
    } else {
      requireObject(value, label);
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string") throw new TypeError(`${label} contains a non-string key.`);
        const item = value[key];
        if (item === undefined) throw new TypeError(`${label}.${key} is undefined.`);
        assertSerializable(item, `${label}.${key}`, stack);
      }
    }
    stack.delete(value);
  }

  function forbiddenKey(key) {
    return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function assertNoClinicalOrFreeText(value, label) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoClinicalOrFreeText(item, `${label}[${index}]`));
      return;
    }
    if (!isObject(value)) return;
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_REPUTATION_FIELDS.has(forbiddenKey(key))) {
        throw new Error(`${label} cannot carry clinical truth, diagnosis, legacy metric, or free-text field ${key}.`);
      }
      assertNoClinicalOrFreeText(item, `${label}.${key}`);
    }
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function normalizeScores(value, label) {
    assertExactKeys(value, AXES, label);
    const scores = {};
    for (const axis of AXES) {
      requireFiniteNumber(value[axis], `${label}.${axis}`);
      scores[axis] = normalizedNumber(value[axis]);
    }
    return scores;
  }

  function normalizeCatalog(value, label) {
    assertExactKeys(value, CATALOG_FIELDS, label);
    requireIdentifier(value.catalogId, `${label}.catalogId`);
    requireIdentifier(value.catalogVersion, `${label}.catalogVersion`);
    if (value.status !== "approved") throw new Error(`${label}.status must be exactly approved.`);
    return {
      catalogId: value.catalogId,
      catalogVersion: value.catalogVersion,
      status: "approved"
    };
  }

  function normalizeStringArray(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an explicit array.`);
    const result = value.map((item, index) => {
      requireIdentifier(item, `${label}[${index}]`);
      return item;
    });
    if (new Set(result).size !== result.length) throw new Error(`${label} contains duplicate command ids.`);
    return result.sort(compareStrings);
  }

  function normalizeFingerprintMap(value, label) {
    requireObject(value, label);
    const entries = Object.entries(value).map(([commandId, fingerprint]) => {
      requireIdentifier(commandId, `${label} command id ${commandId}`);
      if (typeof fingerprint !== "string" || !/^(initialize_baseline|record_event|reverse_event):[0-9a-f]{16}$/.test(fingerprint)) {
        throw new Error(`${label}.${commandId} is not an exact reputation command fingerprint.`);
      }
      return [commandId, fingerprint];
    }).sort(([left], [right]) => compareStrings(left, right));
    return Object.fromEntries(entries);
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
      const entries = Object.keys(value).sort(compareStrings).map((key) =>
        `${JSON.stringify(key)}=${serializeFingerprintValue(value[key], ancestors)}`
      );
      serialized = `object:${Object.prototype.toString.call(value)}:{${entries.join(",")}}`;
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

  function normalizeBaselineEntry(value, label) {
    assertExactKeys(value, BASELINE_ENTRY_FIELDS, label);
    if (value.schemaVersion !== SCHEMA_VERSION) throw new Error(`${label}.schemaVersion must be ${SCHEMA_VERSION}.`);
    requireSequence(value.sequence, `${label}.sequence`);
    if (value.type !== ENTRY_TYPES.BASELINE) throw new Error(`${label}.type must be ${ENTRY_TYPES.BASELINE}.`);
    requireIdentifier(value.commandId, `${label}.commandId`);
    const catalog = normalizeCatalog({
      catalogId: value.catalogId,
      catalogVersion: value.catalogVersion,
      status: value.status
    }, label);
    return {
      schemaVersion: SCHEMA_VERSION,
      sequence: value.sequence,
      type: ENTRY_TYPES.BASELINE,
      commandId: value.commandId,
      catalogId: catalog.catalogId,
      catalogVersion: catalog.catalogVersion,
      status: catalog.status,
      scores: normalizeScores(value.scores, `${label}.scores`)
    };
  }

  function normalizeEventEntry(value, label) {
    assertExactKeys(value, EVENT_ENTRY_FIELDS, label);
    if (value.schemaVersion !== SCHEMA_VERSION) throw new Error(`${label}.schemaVersion must be ${SCHEMA_VERSION}.`);
    requireSequence(value.sequence, `${label}.sequence`);
    if (value.type !== ENTRY_TYPES.EVENT) throw new Error(`${label}.type must be ${ENTRY_TYPES.EVENT}.`);
    for (const field of ["commandId", "eventId", "sourceType", "sourceId"]) {
      requireIdentifier(value[field], `${label}.${field}`);
    }
    if (!AXES.includes(value.axis)) throw new Error(`${label}.axis must be exactly one of ${AXES.join(", ")}.`);
    requireFiniteNumber(value.delta, `${label}.delta`);
    if (value.delta === 0) throw new RangeError(`${label}.delta must be non-zero; no-op events are not persisted.`);
    return {
      schemaVersion: SCHEMA_VERSION,
      sequence: value.sequence,
      type: ENTRY_TYPES.EVENT,
      commandId: value.commandId,
      eventId: value.eventId,
      sourceType: value.sourceType,
      sourceId: value.sourceId,
      axis: value.axis,
      delta: value.delta
    };
  }

  function normalizeReversalEntry(value, label) {
    assertExactKeys(value, REVERSAL_ENTRY_FIELDS, label);
    if (value.schemaVersion !== SCHEMA_VERSION) throw new Error(`${label}.schemaVersion must be ${SCHEMA_VERSION}.`);
    requireSequence(value.sequence, `${label}.sequence`);
    if (value.type !== ENTRY_TYPES.REVERSAL) throw new Error(`${label}.type must be ${ENTRY_TYPES.REVERSAL}.`);
    for (const field of ["commandId", "reversalId", "targetEventId", "sourceType", "sourceId"]) {
      requireIdentifier(value[field], `${label}.${field}`);
    }
    if (!AXES.includes(value.axis)) throw new Error(`${label}.axis must be exactly one of ${AXES.join(", ")}.`);
    requireFiniteNumber(value.delta, `${label}.delta`);
    if (value.delta === 0) throw new RangeError(`${label}.delta must be non-zero.`);
    return {
      schemaVersion: SCHEMA_VERSION,
      sequence: value.sequence,
      type: ENTRY_TYPES.REVERSAL,
      commandId: value.commandId,
      reversalId: value.reversalId,
      targetEventId: value.targetEventId,
      sourceType: value.sourceType,
      sourceId: value.sourceId,
      axis: value.axis,
      delta: value.delta
    };
  }

  function normalizeAuditHistory(value) {
    if (!Array.isArray(value)) throw new TypeError("reputationState.auditHistory must be an explicit array.");
    return value.map((entry, index) => {
      const label = `reputationState.auditHistory[${index}]`;
      requireObject(entry, label);
      assertNoClinicalOrFreeText(entry, label);
      if (entry.type === ENTRY_TYPES.BASELINE) return normalizeBaselineEntry(entry, label);
      if (entry.type === ENTRY_TYPES.EVENT) return normalizeEventEntry(entry, label);
      if (entry.type === ENTRY_TYPES.REVERSAL) return normalizeReversalEntry(entry, label);
      throw new Error(`${label}.type is unsupported.`);
    });
  }

  function baselineCommandFromEntry(entry) {
    return {
      commandId: entry.commandId,
      catalogId: entry.catalogId,
      catalogVersion: entry.catalogVersion,
      status: entry.status,
      scores: clone(entry.scores)
    };
  }

  function eventCommandFromEntry(entry) {
    return {
      commandId: entry.commandId,
      eventId: entry.eventId,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      axis: entry.axis,
      delta: entry.delta
    };
  }

  function reversalCommandFromEntry(entry) {
    return {
      commandId: entry.commandId,
      reversalId: entry.reversalId,
      targetEventId: entry.targetEventId,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId
    };
  }

  function commandFromEntry(entry) {
    if (entry.type === ENTRY_TYPES.BASELINE) return baselineCommandFromEntry(entry);
    if (entry.type === ENTRY_TYPES.EVENT) return eventCommandFromEntry(entry);
    return reversalCommandFromEntry(entry);
  }

  function sourceKey(entry) {
    return `${entry.sourceType}\u0000${entry.sourceId}`;
  }

  function addDelta(scores, axis, delta, label) {
    const value = scores[axis] + delta;
    if (!Number.isFinite(value)) {
      throw new RangeError(`${label} would produce a non-finite ${axis} score; values are not clamped.`);
    }
    scores[axis] = normalizedNumber(value);
  }

  function sameScores(left, right) {
    return AXES.every((axis) => Object.is(normalizedNumber(left[axis]), normalizedNumber(right[axis])));
  }

  function assertSemanticState(state) {
    const initialized = state.catalog !== null || state.scores !== null;
    if ((state.catalog === null) !== (state.scores === null)) {
      throw new Error("reputationState.catalog and reputationState.scores must be initialized together.");
    }
    if (!initialized) {
      if (state.auditHistory.length || state.appliedCommandIds.length || Object.keys(state.commandFingerprints).length) {
        throw new Error("Uninitialized reputation state cannot contain audit history or applied commands.");
      }
      return;
    }
    if (state.auditHistory.length === 0 || state.auditHistory[0].type !== ENTRY_TYPES.BASELINE) {
      throw new Error("Initialized reputation state must begin with one explicit baseline audit entry.");
    }

    const baseline = state.auditHistory[0];
    if (baseline.catalogId !== state.catalog.catalogId
      || baseline.catalogVersion !== state.catalog.catalogVersion
      || baseline.status !== state.catalog.status) {
      throw new Error("Persisted catalog does not match the immutable baseline audit entry.");
    }

    const reconstructed = clone(baseline.scores);
    const commandIds = new Set();
    const artifactIds = new Set();
    const sources = new Set();
    const events = new Map();
    const reversedEventIds = new Set();
    let baselineCount = 0;

    state.auditHistory.forEach((entry, index) => {
      if (entry.sequence !== index) {
        throw new Error(`Audit entry at index ${index} has non-contiguous sequence ${entry.sequence}.`);
      }
      if (commandIds.has(entry.commandId)) throw new Error(`Duplicate audit commandId ${entry.commandId}.`);
      commandIds.add(entry.commandId);
      if (entry.type === ENTRY_TYPES.BASELINE) {
        baselineCount += 1;
        if (index !== 0) throw new Error("Baseline initialization must be the first and only baseline audit entry.");
      } else {
        const artifactId = entry.type === ENTRY_TYPES.EVENT ? entry.eventId : entry.reversalId;
        if (artifactIds.has(artifactId)) throw new Error(`Duplicate audit artifact id ${artifactId}.`);
        artifactIds.add(artifactId);
        const key = sourceKey(entry);
        if (sources.has(key)) {
          throw new Error(`Reputation source ${entry.sourceType}/${entry.sourceId} is already owned by another audit entry.`);
        }
        sources.add(key);
      }

      if (entry.type === ENTRY_TYPES.EVENT) {
        events.set(entry.eventId, entry);
        addDelta(reconstructed, entry.axis, entry.delta, `Audit event ${entry.eventId}`);
      }
      if (entry.type === ENTRY_TYPES.REVERSAL) {
        const target = events.get(entry.targetEventId);
        if (!target) throw new Error(`Reversal ${entry.reversalId} targets an unknown or later event ${entry.targetEventId}.`);
        if (reversedEventIds.has(entry.targetEventId)) {
          throw new Error(`Event ${entry.targetEventId} has more than one reversal.`);
        }
        if (entry.axis !== target.axis || !Object.is(entry.delta, normalizedNumber(-target.delta))) {
          throw new Error(`Reversal ${entry.reversalId} does not exactly negate event ${entry.targetEventId}.`);
        }
        reversedEventIds.add(entry.targetEventId);
        addDelta(reconstructed, entry.axis, entry.delta, `Audit reversal ${entry.reversalId}`);
      }

      if (!state.appliedCommandIds.includes(entry.commandId)) {
        throw new Error(`Audit command ${entry.commandId} is not recorded as applied.`);
      }
      if (!hasOwn(state.commandFingerprints, entry.commandId)) {
        throw new Error(`Audit command ${entry.commandId} has no exact fingerprint.`);
      }
      const expectedFingerprint = fingerprintCommand(COMMAND_TYPES[entry.type], commandFromEntry(entry));
      if (state.commandFingerprints[entry.commandId] !== expectedFingerprint) {
        throw new Error(`Audit command ${entry.commandId} fingerprint has different content.`);
      }
    });

    if (baselineCount !== 1) throw new Error("Initialized reputation state must contain exactly one baseline entry.");
    if (state.appliedCommandIds.length !== commandIds.size) {
      throw new Error("Applied reputation commands must match audit history exactly.");
    }
    for (const commandId of state.appliedCommandIds) {
      if (!commandIds.has(commandId)) throw new Error(`Applied command ${commandId} has no audit entry.`);
    }
    const fingerprintIds = Object.keys(state.commandFingerprints);
    if (fingerprintIds.length !== commandIds.size) {
      throw new Error("Reputation command fingerprints must match audit history exactly.");
    }
    for (const commandId of fingerprintIds) {
      if (!commandIds.has(commandId)) throw new Error(`Command fingerprint ${commandId} has no audit entry.`);
    }
    if (!sameScores(state.scores, reconstructed)) {
      throw new Error("Persisted reputation scores do not match the immutable audit history.");
    }
  }

  function normalizeStateInternal(value) {
    assertSerializable(value, "reputationState");
    assertNoClinicalOrFreeText(value, "reputationState");
    assertExactKeys(value, TOP_LEVEL_FIELDS, "reputationState");
    if (value.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Unsupported reputation state schema version: ${value.schemaVersion}`);
    }
    const state = {
      schemaVersion: SCHEMA_VERSION,
      catalog: value.catalog === null ? null : normalizeCatalog(value.catalog, "reputationState.catalog"),
      scores: value.scores === null ? null : normalizeScores(value.scores, "reputationState.scores"),
      auditHistory: normalizeAuditHistory(value.auditHistory),
      appliedCommandIds: normalizeStringArray(value.appliedCommandIds, "reputationState.appliedCommandIds"),
      commandFingerprints: normalizeFingerprintMap(value.commandFingerprints, "reputationState.commandFingerprints")
    };
    assertSemanticState(state);
    return state;
  }

  function createState(input = {}) {
    assertSerializable(input, "reputation state input");
    assertNoClinicalOrFreeText(input, "reputation state input");
    assertAllowedKeys(input, TOP_LEVEL_FIELDS, "reputation state input");
    if (hasOwn(input, "schemaVersion") && input.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Unsupported reputation state input schema version: ${input.schemaVersion}`);
    }
    return normalizeStateInternal({
      schemaVersion: SCHEMA_VERSION,
      catalog: hasOwn(input, "catalog") ? clone(input.catalog) : null,
      scores: hasOwn(input, "scores") ? clone(input.scores) : null,
      auditHistory: hasOwn(input, "auditHistory") ? clone(input.auditHistory) : [],
      appliedCommandIds: hasOwn(input, "appliedCommandIds") ? clone(input.appliedCommandIds) : [],
      commandFingerprints: hasOwn(input, "commandFingerprints") ? clone(input.commandFingerprints) : {}
    });
  }

  function normalizeState(value) {
    return normalizeStateInternal(value);
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
      throw new TypeError("Serialized reputation state must be a non-empty JSON string.");
    }
    let parsed;
    try {
      parsed = JSON.parse(serialized);
    } catch (error) {
      throw new Error(`Cannot parse reputation state: ${error.message}`);
    }
    return normalizeState(parsed);
  }

  function normalizeInitializeCommand(command) {
    assertSerializable(command, "initialize baseline command");
    assertNoClinicalOrFreeText(command, "initialize baseline command");
    assertExactKeys(command, ["commandId", "catalogId", "catalogVersion", "status", "scores"], "initialize baseline command");
    requireIdentifier(command.commandId, "initialize baseline command.commandId");
    const catalog = normalizeCatalog({
      catalogId: command.catalogId,
      catalogVersion: command.catalogVersion,
      status: command.status
    }, "initialize baseline command catalog");
    return {
      commandId: command.commandId,
      catalogId: catalog.catalogId,
      catalogVersion: catalog.catalogVersion,
      status: catalog.status,
      scores: normalizeScores(command.scores, "initialize baseline command.scores")
    };
  }

  function normalizeRecordCommand(command) {
    assertSerializable(command, "record reputation event command");
    assertNoClinicalOrFreeText(command, "record reputation event command");
    assertExactKeys(command, ["commandId", "eventId", "sourceType", "sourceId", "axis", "delta"], "record reputation event command");
    for (const field of ["commandId", "eventId", "sourceType", "sourceId"]) {
      requireIdentifier(command[field], `record reputation event command.${field}`);
    }
    if (!AXES.includes(command.axis)) {
      throw new Error(`record reputation event command.axis must be exactly one of ${AXES.join(", ")}.`);
    }
    requireFiniteNumber(command.delta, "record reputation event command.delta");
    if (command.delta === 0) {
      throw new RangeError("record reputation event command.delta must be non-zero; zero-value no-op events are rejected.");
    }
    return {
      commandId: command.commandId,
      eventId: command.eventId,
      sourceType: command.sourceType,
      sourceId: command.sourceId,
      axis: command.axis,
      delta: command.delta
    };
  }

  function normalizeReverseCommand(command) {
    assertSerializable(command, "reverse reputation event command");
    assertNoClinicalOrFreeText(command, "reverse reputation event command");
    assertExactKeys(command, ["commandId", "reversalId", "targetEventId", "sourceType", "sourceId"], "reverse reputation event command");
    for (const field of ["commandId", "reversalId", "targetEventId", "sourceType", "sourceId"]) {
      requireIdentifier(command[field], `reverse reputation event command.${field}`);
    }
    return {
      commandId: command.commandId,
      reversalId: command.reversalId,
      targetEventId: command.targetEventId,
      sourceType: command.sourceType,
      sourceId: command.sourceId
    };
  }

  function existingAppliedEntry(state, commandId, fingerprint, expectedType) {
    if (!state.appliedCommandIds.includes(commandId)) return null;
    if (!hasOwn(state.commandFingerprints, commandId)) {
      throw new Error(`Command id collision: ${commandId} has no exact fingerprint.`);
    }
    if (state.commandFingerprints[commandId] !== fingerprint) {
      throw new Error(`Command id conflict: ${commandId} was already applied with different content.`);
    }
    const entry = state.auditHistory.find((item) => item.commandId === commandId);
    if (!entry || entry.type !== expectedType) {
      throw new Error(`Command id collision: ${commandId} has no matching audit entry.`);
    }
    return entry;
  }

  function appendAppliedCommand(state, commandId, fingerprint) {
    state.appliedCommandIds.push(commandId);
    state.commandFingerprints[commandId] = fingerprint;
  }

  function initializeBaseline(currentState, command) {
    const state = normalizeState(currentState);
    const normalizedCommand = normalizeInitializeCommand(command);
    const fingerprint = fingerprintCommand(COMMAND_TYPES[ENTRY_TYPES.BASELINE], normalizedCommand);
    const repeated = existingAppliedEntry(
      state,
      normalizedCommand.commandId,
      fingerprint,
      ENTRY_TYPES.BASELINE
    );
    if (repeated) {
      return { state: clone(state), baseline: clone(repeated), idempotent: true };
    }
    if (state.catalog !== null) throw new Error("Reputation baseline is already initialized and cannot be replaced.");

    const baseline = {
      schemaVersion: SCHEMA_VERSION,
      sequence: 0,
      type: ENTRY_TYPES.BASELINE,
      commandId: normalizedCommand.commandId,
      catalogId: normalizedCommand.catalogId,
      catalogVersion: normalizedCommand.catalogVersion,
      status: normalizedCommand.status,
      scores: clone(normalizedCommand.scores)
    };
    const next = clone(state);
    next.catalog = {
      catalogId: normalizedCommand.catalogId,
      catalogVersion: normalizedCommand.catalogVersion,
      status: normalizedCommand.status
    };
    next.scores = clone(normalizedCommand.scores);
    next.auditHistory.push(baseline);
    appendAppliedCommand(next, normalizedCommand.commandId, fingerprint);
    const normalized = normalizeState(next);
    return { state: normalized, baseline: clone(normalized.auditHistory[0]), idempotent: false };
  }

  function recordEvent(currentState, command) {
    const state = normalizeState(currentState);
    const normalizedCommand = normalizeRecordCommand(command);
    const fingerprint = fingerprintCommand(COMMAND_TYPES[ENTRY_TYPES.EVENT], normalizedCommand);
    const repeated = existingAppliedEntry(state, normalizedCommand.commandId, fingerprint, ENTRY_TYPES.EVENT);
    if (repeated) return { state: clone(state), event: clone(repeated), idempotent: true };
    if (state.catalog === null) {
      throw new Error("Reputation state is uninitialized; an approved explicit baseline is required before events.");
    }
    if (state.auditHistory.some((entry) => entry.eventId === normalizedCommand.eventId
      || entry.reversalId === normalizedCommand.eventId)) {
      throw new Error(`Duplicate audit artifact id ${normalizedCommand.eventId}.`);
    }
    if (state.auditHistory.some((entry) => entry.sourceType === normalizedCommand.sourceType
      && entry.sourceId === normalizedCommand.sourceId)) {
      throw new Error(`Reputation source ${normalizedCommand.sourceType}/${normalizedCommand.sourceId} is already owned.`);
    }

    const event = {
      schemaVersion: SCHEMA_VERSION,
      sequence: state.auditHistory.length,
      type: ENTRY_TYPES.EVENT,
      ...normalizedCommand
    };
    const next = clone(state);
    addDelta(next.scores, event.axis, event.delta, `Reputation event ${event.eventId}`);
    next.auditHistory.push(event);
    appendAppliedCommand(next, event.commandId, fingerprint);
    const normalized = normalizeState(next);
    return {
      state: normalized,
      event: clone(normalized.auditHistory.find((entry) => entry.eventId === event.eventId)),
      idempotent: false
    };
  }

  function reverseEvent(currentState, command) {
    const state = normalizeState(currentState);
    const normalizedCommand = normalizeReverseCommand(command);
    const fingerprint = fingerprintCommand(COMMAND_TYPES[ENTRY_TYPES.REVERSAL], normalizedCommand);
    const repeated = existingAppliedEntry(state, normalizedCommand.commandId, fingerprint, ENTRY_TYPES.REVERSAL);
    if (repeated) return { state: clone(state), reversal: clone(repeated), idempotent: true };
    if (state.catalog === null) {
      throw new Error("Reputation state is uninitialized; there is no event to reverse.");
    }
    if (state.auditHistory.some((entry) => entry.eventId === normalizedCommand.reversalId
      || entry.reversalId === normalizedCommand.reversalId)) {
      throw new Error(`Duplicate audit artifact id ${normalizedCommand.reversalId}.`);
    }
    if (state.auditHistory.some((entry) => entry.sourceType === normalizedCommand.sourceType
      && entry.sourceId === normalizedCommand.sourceId)) {
      throw new Error(`Reputation source ${normalizedCommand.sourceType}/${normalizedCommand.sourceId} is already owned.`);
    }
    const target = state.auditHistory.find((entry) =>
      entry.type === ENTRY_TYPES.EVENT && entry.eventId === normalizedCommand.targetEventId
    );
    if (!target) throw new Error(`Unknown reputation event ${normalizedCommand.targetEventId}.`);
    if (state.auditHistory.some((entry) =>
      entry.type === ENTRY_TYPES.REVERSAL && entry.targetEventId === normalizedCommand.targetEventId
    )) {
      throw new Error(`Reputation event ${normalizedCommand.targetEventId} has already been reversed.`);
    }

    const reversal = {
      schemaVersion: SCHEMA_VERSION,
      sequence: state.auditHistory.length,
      type: ENTRY_TYPES.REVERSAL,
      ...normalizedCommand,
      axis: target.axis,
      delta: normalizedNumber(-target.delta)
    };
    const next = clone(state);
    addDelta(next.scores, reversal.axis, reversal.delta, `Reputation reversal ${reversal.reversalId}`);
    next.auditHistory.push(reversal);
    appendAppliedCommand(next, reversal.commandId, fingerprint);
    const normalized = normalizeState(next);
    return {
      state: normalized,
      reversal: clone(normalized.auditHistory.find((entry) => entry.reversalId === reversal.reversalId)),
      idempotent: false
    };
  }

  function summarizeState(value) {
    const state = normalizeState(value);
    const events = state.auditHistory.filter((entry) => entry.type === ENTRY_TYPES.EVENT);
    const reversals = state.auditHistory.filter((entry) => entry.type === ENTRY_TYPES.REVERSAL);
    const reversed = new Set(reversals.map((entry) => entry.targetEventId));
    return {
      schemaVersion: SCHEMA_VERSION,
      initialized: state.catalog !== null,
      catalogId: state.catalog ? state.catalog.catalogId : null,
      catalogVersion: state.catalog ? state.catalog.catalogVersion : null,
      catalogStatus: state.catalog ? state.catalog.status : null,
      scores: clone(state.scores),
      auditEntryCount: state.auditHistory.length,
      eventCount: events.length,
      reversalCount: reversals.length,
      activeEventCount: events.filter((entry) => !reversed.has(entry.eventId)).length,
      appliedCommandCount: state.appliedCommandIds.length
    };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    AXES,
    createState,
    initializeBaseline,
    recordEvent,
    reverseEvent,
    normalizeState,
    validateState,
    serializeState,
    deserializeState,
    summarizeState
  });
});
