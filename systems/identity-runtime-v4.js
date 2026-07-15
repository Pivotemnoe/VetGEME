(function (root, factory) {
  "use strict";

  const identityApi = typeof module === "object" && module.exports
    ? require("./identity-behavior-v4.js")
    : root.PET_CLINIC_IDENTITY_BEHAVIOR_V4;
  const api = factory(identityApi);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_IDENTITY_RUNTIME_V4 = api;
})(typeof window !== "undefined" ? window : globalThis, function (identityApi) {
  "use strict";

  if (!identityApi) throw new Error("Identity behavior v4 is required");

  const OWNER_TRAIT_KEYS_WITH_EXACT_LEGACY_NAMES = Object.freeze(["patience", "observation"]);
  const OWNER_STATE_KEYS_WITH_EXACT_RUNTIME_NAMES = Object.freeze(["irritation", "anxiety", "trust"]);
  const PATIENT_STATE_KEYS = new Set(identityApi.ANIMAL_STATE_KEYS);
  const TEMPERAMENT_KEYS = new Set(identityApi.TEMPERAMENT_AXIS_KEYS);
  const COMPACT_STORAGE_FORMAT = "identity-v4-delta-2";

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function nonEmptyString(value) {
    return typeof value === "string" && value.trim() ? value : null;
  }

  function finiteNonNegative(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function canonicalPatientSex(value) {
    const sex = nonEmptyString(value);
    if (sex === "самка") return "female";
    if (sex === "самец") return "male";
    return sex;
  }

  function sourceVisitIdFor(value, options = {}) {
    const candidate = options.sourceIdentity
      || value?.identitySourceVisitId
      || value?.v2Visit?.originalVisitId
      || value?.originalVisitId
      || value?.sourceVisitId
      || value?.v2Visit?.visitId
      || value?.visitId;
    const source = nonEmptyString(candidate);
    return source ? source.replace(/^visit:/u, "") : null;
  }

  function sourceVisitIdWithoutDerivedReference(value) {
    const candidate = value?.v2Visit?.originalVisitId
      || value?.originalVisitId
      || value?.sourceVisitId
      || value?.v2Visit?.visitId
      || value?.visitId;
    const source = nonEmptyString(candidate);
    return source ? source.replace(/^visit:/u, "") : null;
  }

  function sourceIdentityFor(value, options = {}) {
    const sourceVisitId = sourceVisitIdFor(value, options);
    return sourceVisitId ? `visit:${sourceVisitId}` : null;
  }

  function ownerSourceFor(value) {
    if (isRecord(value?.v2Visit?.owner)) return value.v2Visit.owner;
    if (isRecord(value?.owner)) return value.owner;
    return null;
  }

  function patientSourceFor(value) {
    if (isRecord(value?.v2Visit?.patient)) return value.v2Visit.patient;
    if (isRecord(value?.patient)) return value.patient;
    return isRecord(value) ? value : null;
  }

  function ownerNameFor(value, source) {
    return nonEmptyString(source?.name)
      || nonEmptyString(typeof value?.owner === "string" ? value.owner : null)
      || null;
  }

  function patientNameFor(value, source) {
    return nonEmptyString(source?.animal)
      || nonEmptyString(source?.name)
      || nonEmptyString(value?.animal)
      || null;
  }

  function exactOwnerTraits(source) {
    const authored = isRecord(source?.profile?.traits) ? source.profile.traits : null;
    if (!authored) return null;
    const traits = {};
    OWNER_TRAIT_KEYS_WITH_EXACT_LEGACY_NAMES.forEach((key) => {
      if (Number.isFinite(authored[key])) traits[key] = authored[key];
    });
    return Object.keys(traits).length ? traits : null;
  }

  function exactOwnerState(value) {
    const state = {};
    const explicit = isRecord(value?.ownerStateSnapshot) ? value.ownerStateSnapshot : null;
    if (explicit) {
      identityApi.OWNER_STATE_KEYS.forEach((key) => {
        if (Number.isFinite(explicit[key])) state[key] = explicit[key];
      });
    }
    OWNER_STATE_KEYS_WITH_EXACT_RUNTIME_NAMES.forEach((key) => {
      if (Number.isFinite(value?.[key])) state[key] = value[key];
    });
    return state;
  }

  function exactPatientState(value, source) {
    const state = {};
    const candidates = [value?.patientStateSnapshot, source?.currentState];
    candidates.filter(isRecord).forEach((candidate) => {
      Object.entries(candidate).forEach(([key, score]) => {
        if (PATIENT_STATE_KEYS.has(key) && Number.isFinite(score)) state[key] = score;
      });
    });
    return state;
  }

  function exactTemperament(source) {
    if (!isRecord(source?.temperament)) return null;
    const temperament = {};
    Object.entries(source.temperament).forEach(([key, score]) => {
      if (TEMPERAMENT_KEYS.has(key) && Number.isFinite(score)) temperament[key] = score;
    });
    return Object.keys(temperament).length ? temperament : null;
  }

  function ownerAppearanceFor(value, source) {
    if (isRecord(value?.ownerAppearance)) return value.ownerAppearance;
    return isRecord(source?.appearance) ? source.appearance : null;
  }

  function patientAppearanceFor(value, source) {
    if (isRecord(value?.patientAppearance)) return value.patientAppearance;
    return isRecord(source?.appearance) ? source.appearance : null;
  }

  function profileConflict(left, right) {
    return JSON.stringify(left) !== JSON.stringify(right);
  }

  function mergePersistentProfile(existing, incoming, relationKey) {
    const merged = clone(existing);
    Object.entries(incoming).forEach(([key, value]) => {
      if (key === relationKey) {
        merged[key] = [...new Set([...(merged[key] || []), ...value])];
        return;
      }
      if (merged[key] === undefined) {
        merged[key] = clone(value);
        return;
      }
      if (profileConflict(merged[key], value)) {
        throw new Error(`Persistent identity conflict in ${key}`);
      }
    });
    return merged;
  }

  function mergeIdentityRecord(existing, incoming, options = {}) {
    if (!existing) return clone(incoming);
    if (existing.entityType !== incoming.entityType) throw new Error("Identity entity type conflict");
    const idField = existing.entityType === "owner" ? "ownerId" : "patientId";
    if (existing[idField] !== incoming[idField]) throw new Error(`Identity id conflict for ${idField}`);
    if (JSON.stringify(existing.identity) !== JSON.stringify(incoming.identity)) {
      throw new Error(`Identity source conflict for ${existing[idField]}`);
    }
    if (existing.appearance !== undefined && incoming.appearance !== undefined
      && profileConflict(existing.appearance, incoming.appearance)) {
      throw new Error(`Appearance conflict for ${existing[idField]}`);
    }
    const relationKey = existing.entityType === "owner" ? "relatedPatientIds" : "ownerIds";
    const next = {
      ...clone(existing),
      persistentProfile: options.mergePersistentProfile === false
        ? clone(existing.persistentProfile)
        : mergePersistentProfile(existing.persistentProfile, incoming.persistentProfile, relationKey),
      currentState: options.mergeCurrentState === false
        ? clone(existing.currentState)
        : { ...clone(existing.currentState), ...clone(incoming.currentState) }
    };
    if (next.appearance === undefined && incoming.appearance !== undefined) next.appearance = clone(incoming.appearance);
    const events = new Map((existing.history || []).map((event) => [event.eventId, clone(event)]));
    (incoming.history || []).forEach((event) => {
      const previous = events.get(event.eventId);
      if (previous && JSON.stringify(previous) !== JSON.stringify(event)) {
        throw new Error(`History event conflict for ${event.eventId}`);
      }
      events.set(event.eventId, clone(event));
    });
    next.history = [...events.values()].sort((left, right) => left.at - right.at || left.eventId.localeCompare(right.eventId));
    const validation = identityApi.validateIdentityRecord(next);
    if (!validation.valid) throw new Error(`Merged identity is invalid: ${validation.errors.join(", ")}`);
    return next;
  }

  function identityInputForPair(registry, value, options = {}) {
    const sourceIdentity = sourceIdentityFor(value, options);
    if (!sourceIdentity) throw new Error("Stable source visit identity is required");
    const ownerId = identityApi.stableIdentityId("owner", registry.campaignIdentity, sourceIdentity);
    const patientId = identityApi.stableIdentityId("patient", registry.campaignIdentity, sourceIdentity);
    const ownerSource = ownerSourceFor(value);
    const patientSource = patientSourceFor(value);

    const ownerProfile = { relatedPatientIds: [patientId] };
    const ownerName = ownerNameFor(value, ownerSource);
    const ownerProfileId = nonEmptyString(ownerSource?.profileId) || nonEmptyString(value?.profileId);
    const traits = exactOwnerTraits(ownerSource);
    const visibleCues = Array.isArray(ownerSource?.profile?.visibleCues)
      ? ownerSource.profile.visibleCues.filter(nonEmptyString)
      : null;
    if (ownerName) ownerProfile.name = ownerName;
    if (ownerProfileId) ownerProfile.profileId = ownerProfileId;
    if (traits) ownerProfile.traits = traits;
    if (visibleCues?.length) ownerProfile.visibleCues = [...visibleCues];

    const patientProfile = { ownerIds: [ownerId] };
    const patientName = patientNameFor(value, patientSource);
    const species = nonEmptyString(patientSource?.species) || nonEmptyString(value?.species);
    const sex = canonicalPatientSex(patientSource?.sex) || canonicalPatientSex(value?.sex);
    const ageYears = finiteNonNegative(patientSource?.ageYears ?? value?.ageYears);
    const temperament = exactTemperament(patientSource);
    if (patientName) patientProfile.name = patientName;
    if (species) patientProfile.species = species;
    if (sex) patientProfile.sex = sex;
    if (ageYears !== null) patientProfile.ageYears = ageYears;
    if (temperament) patientProfile.temperament = temperament;

    const ownerInput = {
      campaignIdentity: registry.campaignIdentity,
      sourceIdentity,
      persistentProfile: ownerProfile,
      currentState: exactOwnerState(value)
    };
    const patientInput = {
      campaignIdentity: registry.campaignIdentity,
      sourceIdentity,
      persistentProfile: patientProfile,
      currentState: exactPatientState(value, patientSource)
    };
    const ownerAppearance = ownerAppearanceFor(value, ownerSource);
    const patientAppearance = patientAppearanceFor(value, patientSource);
    if (ownerAppearance) ownerInput.appearance = clone(ownerAppearance);
    if (patientAppearance) patientInput.appearance = clone(patientAppearance);
    return { sourceIdentity, ownerId, patientId, ownerInput, patientInput };
  }

  function ensureIdentityPair(registry, value, options = {}) {
    const validation = identityApi.validateIdentityRegistry(registry);
    if (!validation.valid) throw new Error(`Identity registry is invalid: ${validation.errors.join(", ")}`);
    const input = identityInputForPair(registry, value, options);
    const owner = identityApi.createOwnerIdentity(input.ownerInput);
    const patient = identityApi.createPatientIdentity(input.patientInput);
    registry.owners[input.ownerId] = mergeIdentityRecord(registry.owners[input.ownerId], owner, {
      ...options,
      mergeCurrentState: options.mergeOwnerCurrentState ?? options.mergeCurrentState
    });
    registry.patients[input.patientId] = mergeIdentityRecord(registry.patients[input.patientId], patient, {
      ...options,
      mergeCurrentState: options.mergePatientCurrentState ?? options.mergeCurrentState
    });
    const updated = identityApi.validateIdentityRegistry(registry);
    if (!updated.valid) throw new Error(`Identity registry update failed: ${updated.errors.join(", ")}`);
    return {
      sourceIdentity: input.sourceIdentity,
      sourceVisitId: input.sourceIdentity.slice("visit:".length),
      ownerId: input.ownerId,
      patientId: input.patientId
    };
  }

  function attachIdentityReferences(value, pair, registry, options = {}) {
    if (!isRecord(value)) return value;
    value.identitySourceVisitId = pair.sourceVisitId;
    value.persistentOwnerId = pair.ownerId;
    value.persistentPatientId = pair.patientId;
    if (value.ownerId === undefined || value.ownerId === null) value.ownerId = pair.ownerId;
    if (value.patientId === undefined || value.patientId === null) value.patientId = pair.patientId;
    if (options.overwriteSnapshots !== false || !isRecord(value.ownerStateSnapshot)) {
      value.ownerStateSnapshot = clone(registry.owners[pair.ownerId].currentState);
    }
    if (options.overwriteSnapshots !== false || !isRecord(value.patientStateSnapshot)) {
      value.patientStateSnapshot = clone(registry.patients[pair.patientId].currentState);
    }
    return value;
  }

  function stateIdentitySources(state) {
    const appointmentRootById = new Map((state.appointments || []).map((appointment) => [
      appointment.appointmentId,
      appointment.sourceVisitId || appointment.originalVisitId || null
    ]));
    const sources = [];
    (state.appointments || []).forEach((appointment) => sources.push({
      value: appointment,
      overwriteSnapshots: false
    }));
    Object.values(state.longitudinalPatients || {}).forEach((patient) => sources.push({ value: patient }));
    (state.arrivalSchedule || []).forEach((arrival) => {
      if (arrival?.template) sources.push({ value: arrival.template });
    });
    (state.queue || []).forEach((patient) => sources.push({ value: patient }));
    (state.caseJournal || []).forEach((entry) => sources.push({
      value: entry,
      sourceIdentity: entry.identitySourceVisitId
        || entry.sourceVisitId
        || appointmentRootById.get(entry.appointmentId)
        || entry.visitId,
      historical: true,
      mergePersistentProfile: false,
      overwriteSnapshots: false,
    }));
    return sources.filter(({ value, sourceIdentity }) => sourceIdentityFor(value, { sourceIdentity }));
  }

  function stripDerivedReferences(value, options = {}) {
    if (!isRecord(value)) return;
    const sourceIdentity = sourceIdentityFor(value);
    const fallbackSourceVisitId = sourceVisitIdWithoutDerivedReference(value);
    if (value.identitySourceVisitId === fallbackSourceVisitId) delete value.identitySourceVisitId;
    if (value.ownerId === value.persistentOwnerId) delete value.ownerId;
    if (value.patientId === value.persistentPatientId) delete value.patientId;
    delete value.persistentOwnerId;
    delete value.persistentPatientId;
    if (options.preserveSnapshots !== true) {
      delete value.ownerStateSnapshot;
      delete value.patientStateSnapshot;
    } else if (sourceIdentity && options.registry) {
      const ownerId = identityApi.stableIdentityId("owner", options.registry.campaignIdentity, sourceIdentity);
      const patientId = identityApi.stableIdentityId("patient", options.registry.campaignIdentity, sourceIdentity);
      if (JSON.stringify(value.ownerStateSnapshot) === JSON.stringify(options.registry.owners[ownerId]?.currentState)) {
        delete value.ownerStateSnapshot;
      }
      if (JSON.stringify(value.patientStateSnapshot) === JSON.stringify(options.registry.patients[patientId]?.currentState)) {
        delete value.patientStateSnapshot;
      }
    }
  }

  function stripStateIdentityReferences(state, registry) {
    (state.appointments || []).forEach((value) => stripDerivedReferences(value, {
      preserveSnapshots: true,
      registry
    }));
    Object.values(state.longitudinalPatients || {}).forEach(stripDerivedReferences);
    (state.arrivalSchedule || []).forEach((arrival) => stripDerivedReferences(arrival?.template));
    (state.queue || []).forEach(stripDerivedReferences);
    (state.caseJournal || []).forEach((value) => stripDerivedReferences(value, {
      preserveSnapshots: true,
      registry
    }));
    return state;
  }

  function compactObjectPatch(value, baseValue) {
    const next = isRecord(value) ? value : {};
    const base = isRecord(baseValue) ? baseValue : {};
    const patch = {};
    new Set([...Object.keys(base), ...Object.keys(next)]).forEach((key) => {
      if (JSON.stringify(next[key]) === JSON.stringify(base[key])) return;
      patch[key] = next[key] === undefined ? null : clone(next[key]);
    });
    return Object.keys(patch).length ? patch : null;
  }

  function compactHistory(history) {
    return history.map((event) => {
      const tuple = [event.eventId, event.at, event.type];
      if (event.sourceVisitId !== undefined || event.payload !== undefined) {
        tuple.push(event.sourceVisitId === undefined ? null : event.sourceVisitId);
      }
      if (event.payload !== undefined) tuple.push(event.payload);
      return tuple;
    });
  }

  function hydrateHistory(history, label) {
    return history.map((tuple, index) => {
      if (!Array.isArray(tuple) || tuple.length < 3 || tuple.length > 5) {
        throw new Error(`${label} event ${index} is invalid`);
      }
      const event = { eventId: tuple[0], at: tuple[1], type: tuple[2] };
      if (tuple.length >= 4 && tuple[3] !== null) event.sourceVisitId = tuple[3];
      if (tuple.length === 5) event.payload = clone(tuple[4]);
      return event;
    });
  }

  function compactRecordDelta(record, baseRecord) {
    const profilePatch = compactObjectPatch(record?.persistentProfile, baseRecord?.persistentProfile);
    const statePatch = compactObjectPatch(record?.currentState, baseRecord?.currentState);
    let appearancePatch = null;
    if (JSON.stringify(record?.appearance) !== JSON.stringify(baseRecord?.appearance)) {
      appearancePatch = record?.appearance === undefined ? false : clone(record.appearance);
    }
    const historyPatch = JSON.stringify(record?.history) === JSON.stringify(baseRecord?.history)
      ? null
      : compactHistory(record?.history || []);
    const delta = [profilePatch, statePatch, appearancePatch, historyPatch];
    return delta.some((value) => value !== null) ? delta : null;
  }

  function validateCompactRecordDelta(delta, label) {
    if (delta === null) return;
    if (!Array.isArray(delta) || delta.length !== 4) {
      throw new Error(`${label} must be null or an exact four-slot array`);
    }
    if (!delta.some((value) => value !== null)) throw new Error(`${label} cannot be empty`);
    if (delta[0] !== null && (!isRecord(delta[0]) || !Object.keys(delta[0]).length)) {
      throw new Error(`${label} profile is invalid`);
    }
    if (delta[1] !== null && (!isRecord(delta[1]) || !Object.keys(delta[1]).length)) {
      throw new Error(`${label} current state is invalid`);
    }
    if (delta[2] !== null && delta[2] !== false && !isRecord(delta[2])) throw new Error(`${label} appearance is invalid`);
    if (delta[3] !== null && !Array.isArray(delta[3])) throw new Error(`${label} history is invalid`);
    if (Array.isArray(delta[3])) hydrateHistory(delta[3], `${label} history`);
  }

  function applyObjectPatch(baseValue, patch) {
    const next = isRecord(baseValue) ? clone(baseValue) : {};
    if (!patch) return next;
    Object.entries(patch).forEach(([key, value]) => {
      if (value === null) delete next[key];
      else next[key] = clone(value);
    });
    return next;
  }

  function applyRecordDelta(record, delta, entityType, campaignIdentity, sourceIdentity) {
    validateCompactRecordDelta(delta, `Compact ${entityType} identity delta`);
    if (record && !delta) return record;
    const persistentProfile = applyObjectPatch(record?.persistentProfile, delta?.[0]);
    const currentState = applyObjectPatch(record?.currentState, delta?.[1]);
    const history = delta?.[3] === null || delta?.[3] === undefined
      ? clone(record?.history || [])
      : hydrateHistory(delta[3], `Compact ${entityType} identity history`);
    const appearance = delta?.[2] === null || delta?.[2] === undefined
      ? clone(record?.appearance)
      : delta[2] === false ? undefined : clone(delta[2]);
    if (!record) {
      if (!Object.keys(persistentProfile).length) throw new Error(`Compact ${entityType} identity has no persistent profile`);
      const input = {
        campaignIdentity,
        sourceIdentity,
        persistentProfile,
        currentState,
        history
      };
      if (appearance !== undefined) input.appearance = appearance;
      return entityType === "owner"
        ? identityApi.createOwnerIdentity(input)
        : identityApi.createPatientIdentity(input);
    }
    const next = clone(record);
    next.persistentProfile = persistentProfile;
    next.currentState = currentState;
    next.history = history;
    if (appearance === undefined) delete next.appearance;
    else next.appearance = appearance;
    const validation = identityApi.validateIdentityRecord(next);
    if (!validation.valid) throw new Error(`Compact ${entityType} identity is invalid: ${validation.errors.join(", ")}`);
    return next;
  }

  function compactStateIdentityRegistry(state) {
    if (!isRecord(state?.identityRegistry)) return state;
    const fullRegistry = clone(state.identityRegistry);
    const validation = identityApi.validateIdentityRegistry(fullRegistry);
    if (!validation.valid) throw new Error(`Identity registry is invalid: ${validation.errors.join(", ")}`);
    stripStateIdentityReferences(state, fullRegistry);
    const baseState = clone(state);
    delete baseState.identityRegistry;
    const baseRegistry = syncStateIdentityReferences(baseState, {
      campaignIdentity: fullRegistry.campaignIdentity
    });
    const sourceIdentities = new Set([
      ...Object.values(fullRegistry.owners).map((record) => record.identity.sourceIdentity),
      ...Object.values(fullRegistry.patients).map((record) => record.identity.sourceIdentity)
    ]);
    const overrides = [...sourceIdentities].sort().flatMap((sourceIdentity) => {
      const ownerId = identityApi.stableIdentityId("owner", fullRegistry.campaignIdentity, sourceIdentity);
      const patientId = identityApi.stableIdentityId("patient", fullRegistry.campaignIdentity, sourceIdentity);
      const owner = fullRegistry.owners[ownerId];
      const patient = fullRegistry.patients[patientId];
      if (!owner || !patient) throw new Error(`Identity pair is incomplete for ${sourceIdentity}`);
      const ownerDelta = compactRecordDelta(owner, baseRegistry.owners[ownerId]);
      const patientDelta = compactRecordDelta(patient, baseRegistry.patients[patientId]);
      return ownerDelta || patientDelta
        ? [[sourceIdentity.slice("visit:".length), ownerDelta, patientDelta]]
        : [];
    });
    state.identityRegistry = {
      schemaVersion: fullRegistry.schemaVersion,
      storageFormat: COMPACT_STORAGE_FORMAT,
      campaignIdentity: fullRegistry.campaignIdentity,
      overrides
    };
    return state;
  }

  function hydrateStateIdentityRegistry(state) {
    const compactRegistry = state?.identityRegistry;
    if (!isRecord(compactRegistry) || compactRegistry.storageFormat !== COMPACT_STORAGE_FORMAT) return state;
    if (compactRegistry.schemaVersion !== identityApi.SCHEMA_VERSION) {
      throw new Error(`Unsupported compact identity schema version: ${compactRegistry.schemaVersion}`);
    }
    if (!Array.isArray(compactRegistry.overrides)) throw new Error("Compact identity overrides must be an array");
    const campaignIdentity = nonEmptyString(compactRegistry.campaignIdentity);
    if (!campaignIdentity) throw new Error("Compact identity campaign is missing");
    const seen = new Set();
    compactRegistry.overrides.forEach((entry, index) => {
      if (!Array.isArray(entry) || entry.length !== 3) throw new Error(`Compact identity override ${index} is invalid`);
      const sourceVisitId = nonEmptyString(entry[0]);
      if (!sourceVisitId) throw new Error(`Compact identity override ${index} has no source visit`);
      if (sourceVisitId.startsWith("visit:")) throw new Error(`Compact identity override ${index} has a prefixed source visit`);
      const sourceIdentity = `visit:${sourceVisitId}`;
      if (seen.has(sourceIdentity)) throw new Error(`Compact identity override ${index} is duplicated`);
      seen.add(sourceIdentity);
      validateCompactRecordDelta(entry[1], `Compact owner identity override ${index}`);
      validateCompactRecordDelta(entry[2], `Compact patient identity override ${index}`);
      if (entry[1] === null && entry[2] === null) throw new Error(`Compact identity override ${index} is empty`);
    });
    delete state.identityRegistry;
    const registry = syncStateIdentityReferences(state, { campaignIdentity });
    compactRegistry.overrides.forEach((entry) => {
      const sourceVisitId = entry[0];
      const sourceIdentity = `visit:${sourceVisitId}`;
      const ownerId = identityApi.stableIdentityId("owner", campaignIdentity, sourceIdentity);
      const patientId = identityApi.stableIdentityId("patient", campaignIdentity, sourceIdentity);
      registry.owners[ownerId] = applyRecordDelta(
        registry.owners[ownerId], entry[1], "owner", campaignIdentity, sourceIdentity
      );
      registry.patients[patientId] = applyRecordDelta(
        registry.patients[patientId], entry[2], "patient", campaignIdentity, sourceIdentity
      );
    });
    const validation = identityApi.validateIdentityRegistry(registry);
    if (!validation.valid) throw new Error(`Hydrated identity registry is invalid: ${validation.errors.join(", ")}`);
    state.identityRegistry = registry;
    stateIdentitySources(state).forEach(({ value, sourceIdentity, overwriteSnapshots }) => {
      const normalizedSourceIdentity = sourceIdentityFor(value, { sourceIdentity });
      const pair = {
        sourceIdentity: normalizedSourceIdentity,
        sourceVisitId: normalizedSourceIdentity.slice("visit:".length),
        ownerId: identityApi.stableIdentityId("owner", campaignIdentity, normalizedSourceIdentity),
        patientId: identityApi.stableIdentityId("patient", campaignIdentity, normalizedSourceIdentity)
      };
      attachIdentityReferences(value, pair, registry, { overwriteSnapshots });
    });
    return state;
  }

  function prepareHistoricalSnapshots(state) {
    (state.caseJournal || []).forEach((entry) => {
      if (!isRecord(entry)) return;
      if (!isRecord(entry.ownerStateSnapshot)) entry.ownerStateSnapshot = exactOwnerState(entry);
      if (!isRecord(entry.patientStateSnapshot)) {
        entry.patientStateSnapshot = exactPatientState(entry, patientSourceFor(entry));
      }
    });
  }

  function syncStateIdentityReferences(state, options = {}) {
    if (!isRecord(state)) throw new TypeError("Game state must be an object");
    const campaignIdentity = nonEmptyString(options.campaignIdentity)
      || nonEmptyString(state.identityRegistry?.campaignIdentity);
    if (!campaignIdentity) throw new Error("Campaign identity is required for identity runtime");
    const hadRegistry = isRecord(state.identityRegistry);
    prepareHistoricalSnapshots(state);
    const registry = hadRegistry
      ? clone(state.identityRegistry)
      : identityApi.createIdentityRegistry({ campaignIdentity });
    if (registry.campaignIdentity !== campaignIdentity) throw new Error("Identity registry campaign mismatch");
    const sources = stateIdentitySources(state);
    const liveOwnerSources = new Set();
    const livePatientSources = new Set();
    sources.filter((source) => !source.historical).forEach(({ value, sourceIdentity }) => {
      const normalizedSourceIdentity = sourceIdentityFor(value, { sourceIdentity });
      if (Object.keys(exactOwnerState(value)).length) liveOwnerSources.add(normalizedSourceIdentity);
      if (Object.keys(exactPatientState(value, patientSourceFor(value))).length) {
        livePatientSources.add(normalizedSourceIdentity);
      }
    });
    const linked = sources.map(({
      value,
      sourceIdentity,
      preferExisting,
      historical,
      mergePersistentProfile,
      overwriteSnapshots
    }) => {
      const normalizedSourceIdentity = sourceIdentityFor(value, { sourceIdentity });
      const existingPair = normalizedSourceIdentity ? {
        sourceIdentity: normalizedSourceIdentity,
        sourceVisitId: normalizedSourceIdentity.slice("visit:".length),
        ownerId: identityApi.stableIdentityId("owner", campaignIdentity, normalizedSourceIdentity),
        patientId: identityApi.stableIdentityId("patient", campaignIdentity, normalizedSourceIdentity)
      } : null;
      const pair = preferExisting
        && existingPair
        && registry.owners[existingPair.ownerId]
        && registry.patients[existingPair.patientId]
        ? existingPair
        : ensureIdentityPair(registry, value, {
          sourceIdentity,
          mergePersistentProfile,
          mergeOwnerCurrentState: historical
            ? !hadRegistry && !liveOwnerSources.has(normalizedSourceIdentity)
            : true,
          mergePatientCurrentState: historical
            ? !hadRegistry && !livePatientSources.has(normalizedSourceIdentity)
            : true
        });
      return { value, pair, overwriteSnapshots };
    });
    linked.forEach(({ value, pair, overwriteSnapshots }) => attachIdentityReferences(
      value,
      pair,
      registry,
      { overwriteSnapshots }
    ));
    const validation = identityApi.validateIdentityRegistry(registry);
    if (!validation.valid) throw new Error(`Identity registry is invalid: ${validation.errors.join(", ")}`);
    state.identityRegistry = registry;
    return registry;
  }

  function appendVisitEvent(registry, value, event) {
    const pair = ensureIdentityPair(registry, value);
    const baseEvent = {
      eventId: event.eventId,
      at: event.at,
      type: event.type,
      sourceVisitId: nonEmptyString(event.sourceVisitId) || value?.v2Visit?.visitId || value?.visitId || pair.sourceVisitId
    };
    registry.owners[pair.ownerId] = identityApi.appendHistory(registry.owners[pair.ownerId], {
      ...baseEvent,
      eventId: `${baseEvent.eventId}:owner`
    });
    registry.patients[pair.patientId] = identityApi.appendHistory(registry.patients[pair.patientId], {
      ...baseEvent,
      eventId: `${baseEvent.eventId}:patient`
    });
    attachIdentityReferences(value, pair, registry);
    return pair;
  }

  function authoredOwnerCues(registry, value) {
    const ownerId = value?.persistentOwnerId || value?.ownerId;
    return ownerId && registry?.owners?.[ownerId]?.persistentProfile?.visibleCues
      ? clone(registry.owners[ownerId].persistentProfile.visibleCues)
      : [];
  }

  return Object.freeze({
    COMPACT_STORAGE_FORMAT,
    OWNER_TRAIT_KEYS_WITH_EXACT_LEGACY_NAMES,
    sourceVisitIdFor,
    sourceIdentityFor,
    ensureIdentityPair,
    attachIdentityReferences,
    compactStateIdentityRegistry,
    hydrateStateIdentityRegistry,
    syncStateIdentityReferences,
    appendVisitEvent,
    authoredOwnerCues
  });
});
