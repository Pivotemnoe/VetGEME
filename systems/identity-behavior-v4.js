(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_IDENTITY_BEHAVIOR_V4 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const ENTITY_TYPES = Object.freeze(["owner", "patient"]);
  const OWNER_TRAIT_KEYS = Object.freeze([
    "patience",
    "baselineAnxiety",
    "observation",
    "clinicTrust",
    "conflictTendency",
    "medicalComprehension",
    "honesty",
    "responsibility",
    "financialFlexibility",
    "uncertaintySensitivity",
    "secondOpinionTendency",
    "complexPlanAdherence"
  ]);
  const OWNER_STATE_KEYS = Object.freeze([
    "irritation",
    "anxiety",
    "trust",
    "understanding",
    "costConsent",
    "homeTreatmentDisclosure",
    "satisfaction",
    "adherenceIntent",
    "leaveRisk",
    "noShowRisk"
  ]);
  const TEMPERAMENT_AXIS_KEYS = Object.freeze([
    "boldness",
    "excitability",
    "sociability",
    "touchSensitivity",
    "defensiveBehavior",
    "restraintTolerance",
    "stressRecovery",
    "familiarStaffTrust",
    "otherAnimalReactivity"
  ]);
  const ANIMAL_STATE_KEYS = Object.freeze([
    "fear",
    "pain",
    "arousal",
    "defensiveAggression",
    "handlingTolerance",
    "staffTrust",
    "fatigue",
    "physiologicalStability",
    "sampleQuality"
  ]);
  const COMPARISON_OPERATORS = Object.freeze(["lt", "lte", "eq", "gte", "gt"]);
  const FORBIDDEN_CLINICAL_KEYS = Object.freeze(new Set([
    "diagnosis",
    "diagnosisid",
    "diagnosistruth",
    "truediagnosis",
    "truediagnosisid",
    "medicaltruth",
    "clinicaltruth",
    "disease",
    "diseaseid"
  ]));

  function isObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function requireObject(value, label) {
    if (!isObject(value)) throw new TypeError(`${label} must be an object.`);
  }

  function requireString(value, label) {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  }

  function requireBoolean(value, label) {
    if (typeof value !== "boolean") throw new TypeError(`${label} must be an explicit boolean.`);
  }

  function requireFinite(value, label) {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
  }

  function requireScore(value, label) {
    requireFinite(value, label);
    if (value < 0 || value > 100) throw new RangeError(`${label} must be between 0 and 100.`);
  }

  function requireCampaignMinute(value, label) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${label} must be a non-negative campaign minute.`);
    }
  }

  function assertAllowedKeys(value, allowed, label) {
    requireObject(value, label);
    const allowedSet = new Set(allowed);
    for (const key of Object.keys(value)) {
      if (!allowedSet.has(key)) throw new Error(`${label} contains unsupported field ${key}.`);
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
      if (!isObject(value)) throw new TypeError(`${label} must use plain JSON objects.`);
      for (const [key, item] of Object.entries(value)) {
        if (item === undefined) throw new TypeError(`${label}.${key} is undefined.`);
        assertSerializable(item, `${label}.${key}`, stack);
      }
    }
    stack.delete(value);
  }

  function assertNoClinicalTruthKeys(value, label) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoClinicalTruthKeys(item, `${label}[${index}]`));
      return;
    }
    if (!isObject(value)) return;
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_CLINICAL_KEYS.has(key.toLowerCase())) {
        throw new Error(`${label} cannot carry clinical truth field ${key}.`);
      }
      assertNoClinicalTruthKeys(item, `${label}.${key}`);
    }
  }

  function normalizeStringArray(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    const result = value.map((item, index) => {
      requireString(item, `${label}[${index}]`);
      return item;
    });
    if (new Set(result).size !== result.length) throw new Error(`${label} contains duplicate values.`);
    return result;
  }

  function normalizeScoreMap(value, allowedKeys, label) {
    requireObject(value, label);
    assertAllowedKeys(value, allowedKeys, label);
    const result = {};
    for (const [key, score] of Object.entries(value)) {
      requireScore(score, `${label}.${key}`);
      result[key] = score;
    }
    return result;
  }

  function normalizeDeltaMap(value, allowedKeys, label) {
    requireObject(value, label);
    assertAllowedKeys(value, allowedKeys, label);
    const result = {};
    for (const [key, delta] of Object.entries(value)) {
      requireFinite(delta, `${label}.${key}`);
      result[key] = delta;
    }
    return result;
  }

  function hash32(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function stableIdentityId(entityType, campaignIdentity, sourceIdentity) {
    if (!ENTITY_TYPES.includes(entityType)) throw new RangeError(`Unsupported entity type: ${entityType}`);
    requireString(campaignIdentity, "campaignIdentity");
    requireString(sourceIdentity, "sourceIdentity");
    const source = JSON.stringify([entityType, campaignIdentity, sourceIdentity]);
    const first = hash32(`identity-v4:a|${source}`).toString(16).padStart(8, "0");
    const second = hash32(`identity-v4:b|${source}`).toString(16).padStart(8, "0");
    return `${entityType === "owner" ? "OWN" : "PAT"}-${first}${second}`;
  }

  function normalizeOwnerProfile(value) {
    const label = "persistentProfile";
    assertAllowedKeys(value, [
      "profileId", "name", "formsOfAddress", "relatedPatientIds", "preferredContactChannel",
      "availability", "financialContext", "traits", "visibleCues"
    ], label);
    const profile = {};
    for (const key of ["profileId", "name", "preferredContactChannel"]) {
      if (hasOwn(value, key)) {
        requireString(value[key], `${label}.${key}`);
        profile[key] = value[key];
      }
    }
    for (const key of ["formsOfAddress", "relatedPatientIds", "visibleCues"]) {
      if (hasOwn(value, key)) profile[key] = normalizeStringArray(value[key], `${label}.${key}`);
    }
    for (const key of ["availability", "financialContext"]) {
      if (hasOwn(value, key)) {
        assertSerializable(value[key], `${label}.${key}`);
        profile[key] = clone(value[key]);
      }
    }
    if (hasOwn(value, "traits")) {
      profile.traits = normalizeScoreMap(value.traits, OWNER_TRAIT_KEYS, `${label}.traits`);
    }
    return profile;
  }

  function normalizePatientProfile(value) {
    const label = "persistentProfile";
    assertAllowedKeys(value, [
      "name", "species", "breedOrType", "sex", "reproductiveStatus", "birthDate", "ageGroup",
      "ageYears", "weight", "weightHistory", "ownerIds", "temperament", "clinicExperience"
    ], label);
    const profile = {};
    for (const key of ["name", "species", "breedOrType", "sex", "reproductiveStatus", "birthDate", "ageGroup"]) {
      if (hasOwn(value, key)) {
        requireString(value[key], `${label}.${key}`);
        profile[key] = value[key];
      }
    }
    if (hasOwn(value, "weight")) {
      requireFinite(value.weight, `${label}.weight`);
      if (value.weight < 0) throw new RangeError(`${label}.weight cannot be negative.`);
      profile.weight = value.weight;
    }
    if (hasOwn(value, "ageYears")) {
      requireFinite(value.ageYears, `${label}.ageYears`);
      if (value.ageYears < 0) throw new RangeError(`${label}.ageYears cannot be negative.`);
      profile.ageYears = value.ageYears;
    }
    if (hasOwn(value, "weightHistory")) {
      if (!Array.isArray(value.weightHistory)) throw new TypeError(`${label}.weightHistory must be an array.`);
      assertSerializable(value.weightHistory, `${label}.weightHistory`);
      profile.weightHistory = clone(value.weightHistory);
    }
    if (hasOwn(value, "ownerIds")) profile.ownerIds = normalizeStringArray(value.ownerIds, `${label}.ownerIds`);
    if (hasOwn(value, "temperament")) {
      profile.temperament = normalizeScoreMap(value.temperament, TEMPERAMENT_AXIS_KEYS, `${label}.temperament`);
    }
    if (hasOwn(value, "clinicExperience")) {
      assertSerializable(value.clinicExperience, `${label}.clinicExperience`);
      profile.clinicExperience = clone(value.clinicExperience);
    }
    return profile;
  }

  function normalizeAppearance(value, label) {
    requireObject(value, label);
    assertSerializable(value, label);
    return clone(value);
  }

  function normalizeHistoryEvent(value, label) {
    assertAllowedKeys(value, ["eventId", "at", "type", "sourceVisitId", "payload"], label);
    requireString(value.eventId, `${label}.eventId`);
    requireCampaignMinute(value.at, `${label}.at`);
    requireString(value.type, `${label}.type`);
    const event = { eventId: value.eventId, at: value.at, type: value.type };
    if (hasOwn(value, "sourceVisitId")) {
      requireString(value.sourceVisitId, `${label}.sourceVisitId`);
      event.sourceVisitId = value.sourceVisitId;
    }
    if (hasOwn(value, "payload")) {
      requireObject(value.payload, `${label}.payload`);
      assertSerializable(value.payload, `${label}.payload`);
      event.payload = clone(value.payload);
    }
    return event;
  }

  function normalizeHistory(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    const history = value.map((event, index) => normalizeHistoryEvent(event, `${label}[${index}]`));
    const ids = new Set();
    let previousAt = -1;
    for (const event of history) {
      if (ids.has(event.eventId)) throw new Error(`${label} contains duplicate eventId ${event.eventId}.`);
      if (event.at < previousAt) throw new Error(`${label} campaign time moves backwards.`);
      ids.add(event.eventId);
      previousAt = event.at;
    }
    return history;
  }

  function createIdentity(entityType, input) {
    requireObject(input, `${entityType} identity input`);
    assertAllowedKeys(input, [
      "campaignIdentity", "sourceIdentity", "persistentProfile", "currentState", "appearance", "history"
    ], `${entityType} identity input`);
    requireString(input.campaignIdentity, "campaignIdentity");
    requireString(input.sourceIdentity, "sourceIdentity");
    requireObject(input.persistentProfile, "persistentProfile");
    const profile = entityType === "owner"
      ? normalizeOwnerProfile(input.persistentProfile)
      : normalizePatientProfile(input.persistentProfile);
    const state = input.currentState === undefined
      ? {}
      : normalizeScoreMap(
        input.currentState,
        entityType === "owner" ? OWNER_STATE_KEYS : ANIMAL_STATE_KEYS,
        "currentState"
      );
    const idField = entityType === "owner" ? "ownerId" : "patientId";
    const record = {
      schemaVersion: SCHEMA_VERSION,
      entityType,
      [idField]: stableIdentityId(entityType, input.campaignIdentity, input.sourceIdentity),
      identity: {
        campaignIdentity: input.campaignIdentity,
        sourceIdentity: input.sourceIdentity
      },
      persistentProfile: profile,
      currentState: state,
      history: hasOwn(input, "history") ? normalizeHistory(input.history, "history") : []
    };
    if (hasOwn(input, "appearance")) record.appearance = normalizeAppearance(input.appearance, "appearance");
    assertSerializable(record, `${entityType} identity`);
    return record;
  }

  function createOwnerIdentity(input) {
    return createIdentity("owner", input);
  }

  function createPatientIdentity(input) {
    return createIdentity("patient", input);
  }

  function assertIdentityRecord(record, expectedType) {
    requireObject(record, "identity record");
    const entityType = expectedType || record.entityType;
    if (!ENTITY_TYPES.includes(entityType)) throw new Error(`Unsupported identity entity type: ${entityType}`);
    if (record.entityType !== entityType) throw new Error(`Identity entity type mismatch: ${record.entityType}`);
    const idField = entityType === "owner" ? "ownerId" : "patientId";
    assertAllowedKeys(record, [
      "schemaVersion", "entityType", idField, "identity", "persistentProfile", "currentState", "appearance", "history"
    ], "identity record");
    if (record.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported identity schema version: ${record.schemaVersion}`);
    requireString(record[idField], idField);
    assertAllowedKeys(record.identity, ["campaignIdentity", "sourceIdentity"], "identity");
    requireString(record.identity.campaignIdentity, "identity.campaignIdentity");
    requireString(record.identity.sourceIdentity, "identity.sourceIdentity");
    const expectedId = stableIdentityId(entityType, record.identity.campaignIdentity, record.identity.sourceIdentity);
    if (record[idField] !== expectedId) throw new Error(`${idField} does not match campaign/source identity.`);
    if (entityType === "owner") normalizeOwnerProfile(record.persistentProfile);
    else normalizePatientProfile(record.persistentProfile);
    normalizeScoreMap(
      record.currentState,
      entityType === "owner" ? OWNER_STATE_KEYS : ANIMAL_STATE_KEYS,
      "currentState"
    );
    if (hasOwn(record, "appearance")) normalizeAppearance(record.appearance, "appearance");
    normalizeHistory(record.history, "history");
    assertSerializable(record, "identity record");
    return record;
  }

  function validationResult(record, expectedType) {
    try {
      assertIdentityRecord(record, expectedType);
      return { valid: true, errors: [] };
    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
  }

  function validateIdentityRecord(record) {
    return validationResult(record);
  }

  function validateOwnerIdentity(record) {
    return validationResult(record, "owner");
  }

  function validatePatientIdentity(record) {
    return validationResult(record, "patient");
  }

  function assertIdentityRegistry(registry) {
    assertAllowedKeys(registry, ["schemaVersion", "campaignIdentity", "owners", "patients"], "identity registry");
    if (registry.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Unsupported identity registry schema version: ${registry.schemaVersion}`);
    }
    requireString(registry.campaignIdentity, "identity registry.campaignIdentity");
    requireObject(registry.owners, "identity registry.owners");
    requireObject(registry.patients, "identity registry.patients");

    for (const [ownerId, owner] of Object.entries(registry.owners)) {
      requireString(ownerId, "identity registry owner key");
      assertIdentityRecord(owner, "owner");
      if (owner.ownerId !== ownerId) throw new Error(`Identity registry owner key does not match ${owner.ownerId}.`);
      if (owner.identity.campaignIdentity !== registry.campaignIdentity) {
        throw new Error(`Owner ${ownerId} belongs to a different campaign.`);
      }
    }
    for (const [patientId, patient] of Object.entries(registry.patients)) {
      requireString(patientId, "identity registry patient key");
      assertIdentityRecord(patient, "patient");
      if (patient.patientId !== patientId) throw new Error(`Identity registry patient key does not match ${patient.patientId}.`);
      if (patient.identity.campaignIdentity !== registry.campaignIdentity) {
        throw new Error(`Patient ${patientId} belongs to a different campaign.`);
      }
    }

    for (const [ownerId, owner] of Object.entries(registry.owners)) {
      for (const patientId of owner.persistentProfile.relatedPatientIds || []) {
        const patient = registry.patients[patientId];
        if (!patient) throw new Error(`Owner ${ownerId} references missing patient ${patientId}.`);
        if (!(patient.persistentProfile.ownerIds || []).includes(ownerId)) {
          throw new Error(`Owner/patient link is not reciprocal: ${ownerId} -> ${patientId}.`);
        }
      }
    }
    for (const [patientId, patient] of Object.entries(registry.patients)) {
      for (const ownerId of patient.persistentProfile.ownerIds || []) {
        const owner = registry.owners[ownerId];
        if (!owner) throw new Error(`Patient ${patientId} references missing owner ${ownerId}.`);
        if (!(owner.persistentProfile.relatedPatientIds || []).includes(patientId)) {
          throw new Error(`Patient/owner link is not reciprocal: ${patientId} -> ${ownerId}.`);
        }
      }
    }
    assertSerializable(registry, "identity registry");
    return registry;
  }

  function createIdentityRegistry(input) {
    assertAllowedKeys(input, ["campaignIdentity", "owners", "patients"], "identity registry input");
    requireString(input.campaignIdentity, "identity registry input.campaignIdentity");
    if (input.owners !== undefined) requireObject(input.owners, "identity registry input.owners");
    if (input.patients !== undefined) requireObject(input.patients, "identity registry input.patients");
    const registry = {
      schemaVersion: SCHEMA_VERSION,
      campaignIdentity: input.campaignIdentity,
      owners: clone(input.owners || {}),
      patients: clone(input.patients || {})
    };
    assertIdentityRegistry(registry);
    return registry;
  }

  function validateIdentityRegistry(registry) {
    try {
      assertIdentityRegistry(registry);
      return { valid: true, errors: [] };
    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
  }

  function appendHistory(record, event) {
    assertIdentityRecord(record);
    const normalized = normalizeHistoryEvent(event, "history event");
    const existing = record.history.find((item) => item.eventId === normalized.eventId);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(normalized)) {
        throw new Error(`History event ${normalized.eventId} conflicts with the persisted event.`);
      }
      return clone(record);
    }
    const last = record.history[record.history.length - 1];
    if (last && normalized.at < last.at) throw new Error("History campaign time cannot move backwards.");
    const next = clone(record);
    next.history.push(normalized);
    assertIdentityRecord(next);
    return next;
  }

  function updateCurrentState(record, patch, historyEvent) {
    assertIdentityRecord(record);
    const keys = record.entityType === "owner" ? OWNER_STATE_KEYS : ANIMAL_STATE_KEYS;
    const normalizedPatch = normalizeScoreMap(patch, keys, "current state patch");
    const next = clone(record);
    next.currentState = { ...next.currentState, ...normalizedPatch };
    assertIdentityRecord(next);
    return historyEvent === undefined ? next : appendHistory(next, historyEvent);
  }

  function normalizeCondition(value, allowedFields, label) {
    assertAllowedKeys(value, ["field", "operator", "value"], label);
    requireString(value.field, `${label}.field`);
    if (!allowedFields.includes(value.field)) throw new Error(`${label}.field is unsupported: ${value.field}`);
    if (!COMPARISON_OPERATORS.includes(value.operator)) throw new Error(`${label}.operator is unsupported: ${value.operator}`);
    requireScore(value.value, `${label}.value`);
    return { field: value.field, operator: value.operator, value: value.value };
  }

  function conditionMatches(state, condition) {
    if (!hasOwn(state, condition.field)) return false;
    const actual = state[condition.field];
    if (condition.operator === "lt") return actual < condition.value;
    if (condition.operator === "lte") return actual <= condition.value;
    if (condition.operator === "eq") return actual === condition.value;
    if (condition.operator === "gte") return actual >= condition.value;
    return actual > condition.value;
  }

  function normalizeCueRule(value, label) {
    assertAllowedKeys(value, ["ruleId", "entity", "when", "cue"], label);
    requireString(value.ruleId, `${label}.ruleId`);
    if (!ENTITY_TYPES.includes(value.entity)) throw new Error(`${label}.entity is unsupported: ${value.entity}`);
    const fields = value.entity === "owner" ? OWNER_STATE_KEYS : ANIMAL_STATE_KEYS;
    const when = normalizeCondition(value.when, fields, `${label}.when`);
    requireObject(value.cue, `${label}.cue`);
    requireString(value.cue.cueId, `${label}.cue.cueId`);
    assertSerializable(value.cue, `${label}.cue`);
    assertNoClinicalTruthKeys(value.cue, `${label}.cue`);
    return { ruleId: value.ruleId, entity: value.entity, when, cue: clone(value.cue) };
  }

  function evaluateObservableCues(input) {
    requireObject(input, "observable cue input");
    assertAllowedKeys(input, ["ownerState", "patientState", "rules"], "observable cue input");
    if (!Array.isArray(input.rules)) throw new TypeError("observable cue input.rules must be an authored array.");
    const ownerState = input.ownerState === undefined
      ? {}
      : normalizeScoreMap(input.ownerState, OWNER_STATE_KEYS, "ownerState");
    const patientState = input.patientState === undefined
      ? {}
      : normalizeScoreMap(input.patientState, ANIMAL_STATE_KEYS, "patientState");
    const seen = new Set();
    const output = [];
    input.rules.forEach((source, index) => {
      const rule = normalizeCueRule(source, `rules[${index}]`);
      if (seen.has(rule.ruleId)) throw new Error(`Duplicate observable cue rule ${rule.ruleId}.`);
      seen.add(rule.ruleId);
      const state = rule.entity === "owner" ? ownerState : patientState;
      if (conditionMatches(state, rule.when)) {
        output.push({ ruleId: rule.ruleId, entity: rule.entity, cue: clone(rule.cue) });
      }
    });
    return output;
  }

  function normalizeResourceRequirements(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an explicitly authored array.`);
    return value.map((item, index) => {
      const itemLabel = `${label}[${index}]`;
      assertAllowedKeys(item, ["capabilityId", "quantity"], itemLabel);
      requireString(item.capabilityId, `${itemLabel}.capabilityId`);
      requireFinite(item.quantity, `${itemLabel}.quantity`);
      if (item.quantity <= 0) throw new RangeError(`${itemLabel}.quantity must be positive.`);
      return { capabilityId: item.capabilityId, quantity: item.quantity };
    });
  }

  function normalizeFactAvailability(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an explicitly authored array.`);
    const seen = new Set();
    return value.map((item, index) => {
      const itemLabel = `${label}[${index}]`;
      assertAllowedKeys(item, ["factId", "available"], itemLabel);
      requireString(item.factId, `${itemLabel}.factId`);
      requireBoolean(item.available, `${itemLabel}.available`);
      if (seen.has(item.factId)) throw new Error(`${label} contains duplicate factId ${item.factId}.`);
      seen.add(item.factId);
      return { factId: item.factId, available: item.available };
    });
  }

  function normalizeAlternative(value, label, expectedFactId) {
    assertAllowedKeys(value, ["factId", "alternativeId", "kind", "payload"], label);
    requireString(value.factId, `${label}.factId`);
    requireString(value.alternativeId, `${label}.alternativeId`);
    requireString(value.kind, `${label}.kind`);
    if (expectedFactId !== undefined && value.factId !== expectedFactId) {
      throw new Error(`${label}.factId must match ${expectedFactId}.`);
    }
    const alternative = {
      factId: value.factId,
      alternativeId: value.alternativeId,
      kind: value.kind
    };
    if (hasOwn(value, "payload")) {
      requireObject(value.payload, `${label}.payload`);
      assertSerializable(value.payload, `${label}.payload`);
      assertNoClinicalTruthKeys(value.payload, `${label}.payload`);
      alternative.payload = clone(value.payload);
    }
    return alternative;
  }

  function normalizeAlternatives(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an explicitly authored array.`);
    const seen = new Set();
    return value.map((item, index) => {
      const alternative = normalizeAlternative(item, `${label}[${index}]`);
      const key = `${alternative.factId}|${alternative.alternativeId}|${alternative.kind}`;
      if (seen.has(key)) throw new Error(`${label} contains duplicate alternative ${key}.`);
      seen.add(key);
      return alternative;
    });
  }

  function normalizeProcessEffects(value, label) {
    assertAllowedKeys(value, ["stateSet", "stateDeltas", "factAvailability"], label);
    for (const required of ["stateSet", "stateDeltas", "factAvailability"]) {
      if (!hasOwn(value, required)) throw new Error(`${label}.${required} must be explicitly authored.`);
    }
    return {
      stateSet: normalizeScoreMap(value.stateSet, ANIMAL_STATE_KEYS, `${label}.stateSet`),
      stateDeltas: normalizeDeltaMap(value.stateDeltas, ANIMAL_STATE_KEYS, `${label}.stateDeltas`),
      factAvailability: normalizeFactAvailability(value.factAvailability, `${label}.factAvailability`)
    };
  }

  function normalizeTemperamentRule(value, label) {
    assertAllowedKeys(value, [
      "ruleId", "when", "timeDeltaMinutes", "resourceRequirements", "effects", "safeAlternatives"
    ], label);
    for (const required of [
      "ruleId", "when", "timeDeltaMinutes", "resourceRequirements", "effects", "safeAlternatives"
    ]) {
      if (!hasOwn(value, required)) throw new Error(`${label}.${required} must be explicitly authored.`);
    }
    requireString(value.ruleId, `${label}.ruleId`);
    const when = normalizeCondition(value.when, TEMPERAMENT_AXIS_KEYS, `${label}.when`);
    requireFinite(value.timeDeltaMinutes, `${label}.timeDeltaMinutes`);
    return {
      ruleId: value.ruleId,
      when,
      timeDeltaMinutes: value.timeDeltaMinutes,
      resourceRequirements: normalizeResourceRequirements(value.resourceRequirements, `${label}.resourceRequirements`),
      effects: normalizeProcessEffects(value.effects, `${label}.effects`),
      safeAlternatives: normalizeAlternatives(value.safeAlternatives, `${label}.safeAlternatives`)
    };
  }

  function normalizeLowStressAction(value) {
    const label = "low-stress action";
    assertAllowedKeys(value, [
      "actionId", "label", "timeMinutes", "resourceRequirements", "effects", "safeAlternatives", "temperamentRules"
    ], label);
    for (const required of [
      "actionId", "timeMinutes", "resourceRequirements", "effects", "safeAlternatives", "temperamentRules"
    ]) {
      if (!hasOwn(value, required)) throw new Error(`${label}.${required} must be explicitly authored.`);
    }
    requireString(value.actionId, `${label}.actionId`);
    requireFinite(value.timeMinutes, `${label}.timeMinutes`);
    if (value.timeMinutes < 0) throw new RangeError(`${label}.timeMinutes cannot be negative.`);
    const action = {
      actionId: value.actionId,
      timeMinutes: value.timeMinutes,
      resourceRequirements: normalizeResourceRequirements(value.resourceRequirements, `${label}.resourceRequirements`),
      effects: normalizeProcessEffects(value.effects, `${label}.effects`),
      safeAlternatives: normalizeAlternatives(value.safeAlternatives, `${label}.safeAlternatives`),
      temperamentRules: []
    };
    if (hasOwn(value, "label")) {
      requireString(value.label, `${label}.label`);
      action.label = value.label;
    }
    if (!Array.isArray(value.temperamentRules)) {
      throw new TypeError(`${label}.temperamentRules must be an explicitly authored array.`);
    }
    const ruleIds = new Set();
    action.temperamentRules = value.temperamentRules.map((rule, index) => {
      const normalized = normalizeTemperamentRule(rule, `${label}.temperamentRules[${index}]`);
      if (ruleIds.has(normalized.ruleId)) throw new Error(`${label} contains duplicate temperament rule ${normalized.ruleId}.`);
      ruleIds.add(normalized.ruleId);
      return normalized;
    });
    assertNoClinicalTruthKeys(action, label);
    assertSerializable(action, label);
    return action;
  }

  function validateLowStressAction(value) {
    try {
      normalizeLowStressAction(value);
      return { valid: true, errors: [] };
    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
  }

  function normalizeFactAccess(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
    const seen = new Set();
    return value.map((item, index) => {
      const itemLabel = `${label}[${index}]`;
      assertAllowedKeys(item, ["factId", "required", "available", "safeAlternative"], itemLabel);
      requireString(item.factId, `${itemLabel}.factId`);
      requireBoolean(item.required, `${itemLabel}.required`);
      requireBoolean(item.available, `${itemLabel}.available`);
      if (seen.has(item.factId)) throw new Error(`${label} contains duplicate factId ${item.factId}.`);
      seen.add(item.factId);
      const fact = { factId: item.factId, required: item.required, available: item.available };
      if (hasOwn(item, "safeAlternative")) {
        fact.safeAlternative = normalizeAlternative(item.safeAlternative, `${itemLabel}.safeAlternative`, item.factId);
      }
      return fact;
    });
  }

  function validateRequiredFactPaths(value) {
    try {
      const facts = normalizeFactAccess(value, "factAccess");
      const blocked = facts.filter((fact) => fact.required && !fact.available && !fact.safeAlternative);
      return {
        valid: blocked.length === 0,
        errors: blocked.map((fact) => `required_fact_without_safe_alternative:${fact.factId}`)
      };
    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
  }

  function applyEffects(patient, facts, effects, label) {
    for (const [field, value] of Object.entries(effects.stateSet)) patient.currentState[field] = value;
    for (const [field, delta] of Object.entries(effects.stateDeltas)) {
      if (!hasOwn(patient.currentState, field)) {
        throw new Error(`${label} cannot change missing authored runtime state ${field}.`);
      }
      patient.currentState[field] = Math.max(0, Math.min(100, patient.currentState[field] + delta));
    }
    for (const change of effects.factAvailability) {
      const fact = facts.find((item) => item.factId === change.factId);
      if (!fact) throw new Error(`${label} references unknown fact ${change.factId}.`);
      fact.available = change.available;
    }
  }

  function applyLowStressAction(input) {
    requireObject(input, "low-stress action input");
    assertAllowedKeys(input, ["patient", "factAccess", "action"], "low-stress action input");
    assertIdentityRecord(input.patient, "patient");
    const patient = clone(input.patient);
    const facts = normalizeFactAccess(input.factAccess, "factAccess");
    const action = normalizeLowStressAction(input.action);
    const temperament = patient.persistentProfile.temperament || {};
    const matchedRules = action.temperamentRules.filter((rule) => conditionMatches(temperament, rule.when));
    let timeMinutes = action.timeMinutes;
    const resources = clone(action.resourceRequirements);
    const alternatives = clone(action.safeAlternatives);

    applyEffects(patient, facts, action.effects, `Action ${action.actionId}`);
    for (const rule of matchedRules) {
      timeMinutes += rule.timeDeltaMinutes;
      resources.push(...clone(rule.resourceRequirements));
      alternatives.push(...clone(rule.safeAlternatives));
      applyEffects(patient, facts, rule.effects, `Temperament rule ${rule.ruleId}`);
    }
    if (timeMinutes < 0) throw new RangeError(`Action ${action.actionId} produced negative time.`);

    const alternativesByFact = new Map();
    const allAlternatives = [];
    const alternativeKeys = new Set();
    function registerAlternative(alternative) {
      const key = `${alternative.factId}|${alternative.alternativeId}|${alternative.kind}`;
      if (alternativeKeys.has(key)) return;
      alternativeKeys.add(key);
      const persisted = clone(alternative);
      allAlternatives.push(persisted);
      if (!alternativesByFact.has(alternative.factId)) alternativesByFact.set(alternative.factId, []);
      alternativesByFact.get(alternative.factId).push(persisted);
    }
    for (const fact of facts) {
      if (fact.safeAlternative) registerAlternative(fact.safeAlternative);
    }
    for (const alternative of alternatives) {
      if (!facts.some((fact) => fact.factId === alternative.factId)) {
        throw new Error(`Action ${action.actionId} provides an alternative for unknown fact ${alternative.factId}.`);
      }
      registerAlternative(alternative);
    }
    for (const fact of facts) {
      const factAlternatives = alternativesByFact.get(fact.factId) || [];
      if (!fact.safeAlternative && factAlternatives[0]) fact.safeAlternative = clone(factAlternatives[0]);
      if (fact.required && !fact.available && !fact.safeAlternative) {
        throw new Error(`Required fact ${fact.factId} is unavailable without an explicitly authored safe alternative.`);
      }
    }

    assertIdentityRecord(patient, "patient");
    const result = {
      actionId: action.actionId,
      patient,
      factAccess: facts,
      timeMinutes,
      resourceRequirements: resources,
      safeAlternatives: allAlternatives,
      appliedTemperamentRuleIds: matchedRules.map((rule) => rule.ruleId)
    };
    assertNoClinicalTruthKeys(result, "low-stress action result");
    assertSerializable(result, "low-stress action result");
    return result;
  }

  function evaluateLowStressActions(input) {
    requireObject(input, "low-stress action list input");
    assertAllowedKeys(input, ["patient", "factAccess", "actions"], "low-stress action list input");
    assertIdentityRecord(input.patient, "patient");
    normalizeFactAccess(input.factAccess, "factAccess");
    if (!Array.isArray(input.actions)) throw new TypeError("actions must be an explicitly authored array.");
    return input.actions.map((action) => applyLowStressAction({
      patient: input.patient,
      factAccess: input.factAccess,
      action
    }));
  }

  return Object.freeze({
    SCHEMA_VERSION,
    ENTITY_TYPES,
    OWNER_TRAIT_KEYS,
    OWNER_STATE_KEYS,
    TEMPERAMENT_AXIS_KEYS,
    ANIMAL_STATE_KEYS,
    stableIdentityId,
    createOwnerIdentity,
    createPatientIdentity,
    createIdentityRegistry,
    validateIdentityRecord,
    validateOwnerIdentity,
    validatePatientIdentity,
    validateIdentityRegistry,
    appendHistory,
    updateCurrentState,
    evaluateObservableCues,
    validateLowStressAction,
    validateRequiredFactPaths,
    applyLowStressAction,
    evaluateLowStressActions
  });
});
