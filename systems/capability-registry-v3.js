(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_CAPABILITY_REGISTRY_V3 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EXPECTED_CAPABILITY_COUNT = 447;
  const REGISTRY_ID = "vetgeme-clinic-capabilities";
  const REGISTRY_VERSION = "2026.07.14.38";
  const REGISTRY_STATUS = "canonical_design_complete";
  const PHASES = Object.freeze([
    "start",
    "chapter_2",
    "chapter_3",
    "chapter_4",
    "chapter_5",
    "post_chapter_5",
    "post_campaign"
  ]);
  const KNOWN_TYPES = Object.freeze([
    "clinical_action",
    "clinical_procedure",
    "consumable_device",
    "consumable_set",
    "external_service",
    "imaging_equipment",
    "imaging_method",
    "laboratory_equipment",
    "longitudinal_action",
    "longitudinal_measurement",
    "measurement",
    "requirement_group",
    "research_method",
    "room",
    "room_capability",
    "room_protocol",
    "simulation_capability",
    "small_equipment",
    "staff_protocol",
    "staff_skill",
    "treatment_capability",
    "treatment_equipment"
  ]);
  const EXPECTED_RULES = Object.freeze({
    medicalResultsAreAuthored: true,
    missingCapabilityRequiresSafeRoute: true,
    visualPresenceDoesNotGrantCapability: true,
    localCapabilityRequiresAllDependencies: true
  });

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function buildIndex(registry) {
    if (!isObject(registry) || !Array.isArray(registry.capabilities)) {
      throw new TypeError("Capability registry must contain a capabilities array.");
    }
    const byId = Object.create(null);
    for (const capability of registry.capabilities) {
      if (!isObject(capability) || typeof capability.id !== "string" || !capability.id) continue;
      if (byId[capability.id]) throw new Error(`Duplicate capability id: ${capability.id}`);
      byId[capability.id] = capability;
    }
    return {
      registry,
      byId,
      ids: Object.freeze(Object.keys(byId))
    };
  }

  function validateRegistry(registry, options) {
    const settings = options || {};
    const expectedCount = Object.prototype.hasOwnProperty.call(settings, "expectedCount")
      ? settings.expectedCount
      : EXPECTED_CAPABILITY_COUNT;
    const errors = [];
    const warnings = [];
    const duplicateIds = [];
    const missingReferences = [];
    const selfReferences = [];
    const cycles = [];

    if (!isObject(registry)) {
      return { valid: false, errors: ["registry_not_object"], warnings, counts: { capabilities: 0 } };
    }
    if (registry.schemaVersion !== 1) errors.push("unexpected_schema_version");
    if (settings.requireCanonicalIdentity !== false) {
      if (registry.registryId !== REGISTRY_ID) errors.push("unexpected_registry_id");
      if (registry.registryVersion !== REGISTRY_VERSION) errors.push("unexpected_registry_version");
      if (registry.status !== REGISTRY_STATUS) errors.push("unexpected_registry_status");
    }
    for (const [rule, expected] of Object.entries(EXPECTED_RULES)) {
      if (!registry.rules || registry.rules[rule] !== expected) errors.push(`invalid_rule:${rule}`);
    }
    if (!Array.isArray(registry.capabilities)) {
      errors.push("capabilities_not_array");
      return { valid: false, errors, warnings, counts: { capabilities: 0 } };
    }
    if (expectedCount !== null && registry.capabilities.length !== expectedCount) {
      errors.push(`unexpected_capability_count:${registry.capabilities.length}`);
    }

    const byId = Object.create(null);
    for (let index = 0; index < registry.capabilities.length; index += 1) {
      const capability = registry.capabilities[index];
      const label = isObject(capability) && capability.id ? capability.id : `index_${index}`;
      if (!isObject(capability)) {
        errors.push(`capability_not_object:${label}`);
        continue;
      }
      if (typeof capability.id !== "string" || !/^[a-z0-9_]+$/.test(capability.id)) {
        errors.push(`invalid_capability_id:${label}`);
        continue;
      }
      if (byId[capability.id]) duplicateIds.push(capability.id);
      else byId[capability.id] = capability;
      if (!KNOWN_TYPES.includes(capability.type)) errors.push(`unknown_capability_type:${capability.id}`);
      if (!PHASES.includes(capability.unlock)) errors.push(`unknown_unlock_phase:${capability.id}`);
      for (const field of ["requires", "anyOf"]) {
        if (capability[field] !== undefined) {
          if (!Array.isArray(capability[field]) || capability[field].length === 0 || capability[field].some((id) => typeof id !== "string" || !id)) {
            errors.push(`invalid_${field}:${capability.id}`);
          } else if (new Set(capability[field]).size !== capability[field].length) {
            errors.push(`duplicate_${field}:${capability.id}`);
          }
        }
      }
      if (capability.capacityPerDay !== undefined && (!Number.isInteger(capability.capacityPerDay) || capability.capacityPerDay <= 0)) {
        errors.push(`invalid_capacity_per_day:${capability.id}`);
      }
      if (capability.turnaroundDays !== undefined) {
        const value = capability.turnaroundDays;
        if (!Array.isArray(value) || value.length !== 2 || !value.every((part) => Number.isInteger(part) && part >= 0) || value[0] > value[1]) {
          errors.push(`invalid_turnaround_days:${capability.id}`);
        }
      }
    }
    for (const id of duplicateIds) errors.push(`duplicate_capability_id:${id}`);

    for (const capability of Object.values(byId)) {
      for (const dependency of [...(capability.requires || []), ...(capability.anyOf || [])]) {
        if (dependency === capability.id) selfReferences.push(`${capability.id}->${dependency}`);
        if (!byId[dependency]) missingReferences.push(`${capability.id}->${dependency}`);
      }
    }
    for (const edge of selfReferences) errors.push(`self_reference:${edge}`);
    for (const edge of missingReferences) errors.push(`missing_reference:${edge}`);

    const color = Object.create(null);
    const stack = [];
    function visit(id) {
      color[id] = 1;
      stack.push(id);
      const capability = byId[id];
      for (const dependency of [...(capability.requires || []), ...(capability.anyOf || [])]) {
        if (!byId[dependency]) continue;
        if (!color[dependency]) visit(dependency);
        else if (color[dependency] === 1) {
          const start = stack.indexOf(dependency);
          const cycle = stack.slice(start).concat(dependency).join("->");
          if (!cycles.includes(cycle)) cycles.push(cycle);
        }
      }
      stack.pop();
      color[id] = 2;
    }
    for (const id of Object.keys(byId)) if (!color[id]) visit(id);
    for (const cycle of cycles) errors.push(`dependency_cycle:${cycle}`);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      counts: {
        capabilities: registry.capabilities.length,
        requiresEdges: Object.values(byId).reduce((sum, item) => sum + (item.requires || []).length, 0),
        anyOfEdges: Object.values(byId).reduce((sum, item) => sum + (item.anyOf || []).length, 0)
      },
      duplicateIds,
      missingReferences,
      selfReferences,
      cycles
    };
  }

  function capabilityPhaseForDay(day) {
    if (!Number.isInteger(day) || day < 1) throw new RangeError("Campaign day must be a positive integer.");
    if (day <= 5) return "start";
    if (day <= 10) return "chapter_2";
    if (day <= 15) return "chapter_3";
    if (day <= 20) return "chapter_4";
    if (day <= 25) return "chapter_5";
    if (day <= 30) return "post_chapter_5";
    return "post_campaign";
  }

  function unlockReached(unlock, dayOrPhase) {
    if (!PHASES.includes(unlock)) throw new RangeError(`Unknown unlock phase: ${unlock}`);
    const phase = typeof dayOrPhase === "number" ? capabilityPhaseForDay(dayOrPhase) : dayOrPhase;
    if (!PHASES.includes(phase)) throw new RangeError(`Unknown campaign phase: ${phase}`);
    return PHASES.indexOf(phase) >= PHASES.indexOf(unlock);
  }

  function normalizeEntries(state) {
    if (!state) return Object.create(null);
    if (isObject(state.entries)) return state.entries;
    return state;
  }

  function createSparseState(registry, entries) {
    const index = buildIndex(registry);
    const normalized = entries || {};
    if (!isObject(normalized)) throw new TypeError("Capability state entries must be an object.");
    for (const id of Object.keys(normalized)) {
      if (!index.byId[id]) throw new Error(`Unknown capability state id: ${id}`);
      if (!isObject(normalized[id])) throw new TypeError(`Capability state entry must be an object: ${id}`);
    }
    return {
      schemaVersion: 1,
      registryId: registry.registryId,
      registryVersion: registry.registryVersion,
      entries: clone(normalized)
    };
  }

  function validateSparseState(registry, state) {
    const errors = [];
    let index;
    try {
      index = buildIndex(registry);
    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
    if (!isObject(state) || !isObject(state.entries)) errors.push("invalid_sparse_state");
    else {
      if (state.schemaVersion !== 1) errors.push("unexpected_state_schema_version");
      if (state.registryId !== registry.registryId) errors.push("state_registry_id_mismatch");
      if (state.registryVersion !== registry.registryVersion) errors.push("state_registry_version_mismatch");
      for (const [id, entry] of Object.entries(state.entries)) {
        if (!index.byId[id]) errors.push(`unknown_state_capability:${id}`);
        if (!isObject(entry)) errors.push(`invalid_state_entry:${id}`);
        if (isObject(entry) && entry.quantity !== undefined && (!Number.isFinite(entry.quantity) || entry.quantity < 0)) {
          errors.push(`invalid_state_quantity:${id}`);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  function patchSparseState(registry, state, id, patch) {
    const index = buildIndex(registry);
    if (!index.byId[id]) throw new Error(`Unknown capability state id: ${id}`);
    if (!isObject(patch)) throw new TypeError("Capability state patch must be an object.");
    const next = createSparseState(registry, normalizeEntries(state));
    next.entries[id] = Object.assign({}, next.entries[id] || {}, clone(patch));
    return next;
  }

  function stateBlockReason(entry) {
    if (!entry) return null;
    if (entry.available === false) return "explicitly_unavailable";
    if (entry.operational === false) return "not_operational";
    if (entry.connected === false) return "not_connected";
    if (entry.qualified === false) return "not_qualified";
    if (entry.open === false) return "closed";
    if (entry.quantity !== undefined && entry.quantity <= 0) return "out_of_stock";
    return null;
  }

  function resolveCapability(indexOrRegistry, id, context) {
    const index = indexOrRegistry && indexOrRegistry.byId ? indexOrRegistry : buildIndex(indexOrRegistry);
    if (!index.byId[id]) throw new Error(`Unknown capability id: ${id}`);
    const settings = context || {};
    const day = settings.day;
    capabilityPhaseForDay(day);
    const entries = normalizeEntries(settings.state);
    const memo = Object.create(null);
    const resolving = new Set();

    function resolve(targetId) {
      if (memo[targetId]) return memo[targetId];
      if (resolving.has(targetId)) throw new Error(`Capability dependency cycle encountered at ${targetId}`);
      resolving.add(targetId);
      const capability = index.byId[targetId];
      const entry = entries[targetId];
      const result = {
        id: targetId,
        available: false,
        reasonCode: null,
        unlock: capability.unlock,
        unmetRequires: [],
        alternatives: [],
        availableAlternativeIds: []
      };
      if (!unlockReached(capability.unlock, day)) {
        result.reasonCode = "locked";
      } else {
        const blocked = stateBlockReason(entry);
        if (blocked) {
          result.reasonCode = blocked;
        } else {
          for (const dependencyId of capability.requires || []) {
            const dependency = resolve(dependencyId);
            if (!dependency.available) result.unmetRequires.push(dependencyId);
          }
          for (const alternativeId of capability.anyOf || []) {
            const alternative = resolve(alternativeId);
            result.alternatives.push({ id: alternativeId, available: alternative.available, reasonCode: alternative.reasonCode });
            if (alternative.available) result.availableAlternativeIds.push(alternativeId);
          }
          if (result.unmetRequires.length > 0) result.reasonCode = "requires_unavailable";
          else if ((capability.anyOf || []).length > 0 && result.availableAlternativeIds.length === 0) result.reasonCode = "no_available_alternative";
          else {
            const hasDependencies = (capability.requires || []).length > 0 || (capability.anyOf || []).length > 0;
            const activated = entry && entry.available === true;
            if (capability.unlock !== "start" && !hasDependencies && !activated) result.reasonCode = "not_activated";
            else {
              result.available = true;
              result.reasonCode = "available";
            }
          }
        }
      }
      resolving.delete(targetId);
      memo[targetId] = result;
      return result;
    }

    return clone(resolve(id));
  }

  function resolveRequirements(indexOrRegistry, id, context) {
    const resolved = resolveCapability(indexOrRegistry, id, context);
    return {
      id: resolved.id,
      available: resolved.available,
      unmetRequires: resolved.unmetRequires,
      alternatives: resolved.alternatives,
      availableAlternativeIds: resolved.availableAlternativeIds
    };
  }

  function availableAlternatives(indexOrRegistry, id, context) {
    return resolveCapability(indexOrRegistry, id, context).availableAlternativeIds;
  }

  function effectiveUnlockReport(registry) {
    const index = buildIndex(registry);
    const memo = Object.create(null);
    const visiting = new Set();
    function phaseIndex(id) {
      if (memo[id] !== undefined) return memo[id];
      if (visiting.has(id)) throw new Error(`Capability dependency cycle encountered at ${id}`);
      visiting.add(id);
      const capability = index.byId[id];
      let effective = PHASES.indexOf(capability.unlock);
      for (const dependency of capability.requires || []) effective = Math.max(effective, phaseIndex(dependency));
      if ((capability.anyOf || []).length > 0) {
        const earliestAlternative = Math.min(...capability.anyOf.map(phaseIndex));
        effective = Math.max(effective, earliestAlternative);
      }
      visiting.delete(id);
      memo[id] = effective;
      return effective;
    }
    const deferred = [];
    const dependencyWarnings = [];
    for (const capability of registry.capabilities) {
      const declaredIndex = PHASES.indexOf(capability.unlock);
      const effectiveIndex = phaseIndex(capability.id);
      const laterRequires = (capability.requires || []).filter((id) => phaseIndex(id) > declaredIndex);
      const laterAlternatives = (capability.anyOf || []).filter((id) => phaseIndex(id) > declaredIndex);
      if (laterRequires.length > 0 || laterAlternatives.length > 0) {
        dependencyWarnings.push({
          id: capability.id,
          declaredUnlock: capability.unlock,
          laterRequires,
          laterAlternatives
        });
      }
      if (effectiveIndex > declaredIndex) {
        deferred.push({
          id: capability.id,
          declaredUnlock: capability.unlock,
          effectiveUnlock: PHASES[effectiveIndex]
        });
      }
    }
    return {
      deferred,
      count: deferred.length,
      dependencyWarnings,
      warningCount: dependencyWarnings.length
    };
  }

  return Object.freeze({
    EXPECTED_CAPABILITY_COUNT,
    REGISTRY_ID,
    REGISTRY_VERSION,
    REGISTRY_STATUS,
    PHASES,
    KNOWN_TYPES,
    buildIndex,
    validateRegistry,
    capabilityPhaseForDay,
    unlockReached,
    createSparseState,
    validateSparseState,
    patchSparseState,
    resolveCapability,
    resolveRequirements,
    availableAlternatives,
    effectiveUnlockReport
  });
});
