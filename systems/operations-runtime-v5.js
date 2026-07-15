(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_OPERATIONS_RUNTIME_V5 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const TOP_LEVEL_FIELDS = Object.freeze([
    "schemaVersion",
    "resources",
    "tasks",
    "reservations",
    "handoffs",
    "appliedCommandIds",
    "commandFingerprints"
  ]);
  const HANDOFF_FIELDS = Object.freeze([
    "schemaVersion",
    "handoffId",
    "commandId",
    "taskId",
    "at",
    "reassignments"
  ]);
  const REASSIGNMENT_FIELDS = Object.freeze([
    "groupId",
    "fromResourceId",
    "toResourceId",
    "capabilityId",
    "units"
  ]);
  const FORBIDDEN_OPERATION_FIELDS = Object.freeze(new Set([
    "result",
    "results",
    "authoredresult",
    "resulttext",
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
    "notes",
    "note",
    "summary",
    "description",
    "payload"
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
    if (!isObject(value)) throw new TypeError(`${label} must be a plain object.`);
  }

  function requireString(value, label) {
    if (typeof value !== "string" || !value.trim()) {
      throw new TypeError(`${label} must be a non-empty string.`);
    }
  }

  function requireCampaignMinute(value, label) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${label} must be a non-negative campaign minute.`);
    }
  }

  function requirePositiveInteger(value, label) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${label} must be a positive integer.`);
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
      requireObject(value, label);
      for (const [key, item] of Object.entries(value)) {
        if (item === undefined) throw new TypeError(`${label}.${key} is undefined.`);
        assertSerializable(item, `${label}.${key}`, stack);
      }
    }
    stack.delete(value);
  }

  function assertNoClinicalContent(value, label) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoClinicalContent(item, `${label}[${index}]`));
      return;
    }
    if (!isObject(value)) return;
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_OPERATION_FIELDS.has(key.toLowerCase())) {
        throw new Error(`${label} cannot carry medical or clinical field ${key}.`);
      }
      assertNoClinicalContent(item, `${label}.${key}`);
    }
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    const output = {};
    Object.keys(value).sort().forEach((key) => {
      output[key] = canonicalize(value[key]);
    });
    return output;
  }

  function normalizeStringArray(value, label, options = {}) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an explicit array.`);
    const normalized = value.map((item, index) => {
      requireString(item, `${label}[${index}]`);
      return item;
    });
    if (new Set(normalized).size !== normalized.length) {
      throw new Error(`${label} contains duplicate values.`);
    }
    if (options.allowEmpty === false && normalized.length === 0) {
      throw new Error(`${label} cannot be empty.`);
    }
    return options.preserveOrder ? normalized : normalized.sort((left, right) => left.localeCompare(right));
  }

  function recordId(record, kind) {
    if (!isObject(record)) return null;
    if (kind === "task") {
      return [record.taskId, record.id].find((value) => typeof value === "string" && value.trim()) || null;
    }
    const explicit = [record.reservationId, record.id]
      .find((value) => typeof value === "string" && value.trim());
    if (explicit) return explicit;
    const required = ["taskId", "groupId", "resourceId", "capabilityId", "units", "startAt", "endAt"];
    if (!required.every((field) => hasOwn(record, field))) return null;
    return JSON.stringify(required.map((field) => record[field]));
  }

  function taskIdOfReservation(record) {
    if (!isObject(record)) return null;
    return typeof record.taskId === "string" && record.taskId.trim() ? record.taskId : null;
  }

  function compareRecords(kind) {
    return (left, right) => {
      const leftId = recordId(left, kind) || "";
      const rightId = recordId(right, kind) || "";
      return leftId.localeCompare(rightId) || JSON.stringify(left).localeCompare(JSON.stringify(right));
    };
  }

  function schedulerSlice(state) {
    return {
      schemaVersion: SCHEMA_VERSION,
      resources: clone(state.resources),
      tasks: clone(state.tasks),
      reservations: clone(state.reservations),
      appliedCommandIds: clone(state.appliedCommandIds),
      commandFingerprints: clone(hasOwn(state, "commandFingerprints") ? state.commandFingerprints : {})
    };
  }

  function schedulerValidatorFor(schedulerApi) {
    if (!isObject(schedulerApi)) throw new TypeError("schedulerApi must be an injected object.");
    const validator = schedulerApi.validateSchedulerState || schedulerApi.validateState;
    if (typeof validator !== "function") {
      throw new TypeError("schedulerApi must expose validateSchedulerState(state) or validateState(state).");
    }
    return validator.bind(schedulerApi);
  }

  function normalizeSchedulerProjection(state, schedulerApi) {
    const projection = schedulerSlice(state);
    const normalizer = schedulerApi.normalizeSchedulerState || schedulerApi.normalizeState;
    if (typeof normalizer !== "function") {
      return {
        schemaVersion: SCHEMA_VERSION,
        resources: canonicalize(projection.resources),
        tasks: projection.tasks.map(canonicalize).sort(compareRecords("task")),
        reservations: projection.reservations.map(canonicalize).sort(compareRecords("reservation")),
        appliedCommandIds: normalizeStringArray(projection.appliedCommandIds, "operationsState.appliedCommandIds"),
        commandFingerprints: canonicalize(projection.commandFingerprints)
      };
    }
    let normalized;
    try {
      normalized = normalizer.call(schedulerApi, projection);
    } catch (error) {
      throw new Error(`Injected scheduler rejected operations state: ${error.message}`);
    }
    requireObject(normalized, "normalized scheduler state");
    return clone(normalized);
  }

  function assertSchedulerState(state, schedulerApi) {
    const validator = schedulerValidatorFor(schedulerApi);
    let result;
    try {
      result = validator(schedulerSlice(state));
    } catch (error) {
      throw new Error(`Injected scheduler rejected operations state: ${error.message}`);
    }
    if (!isObject(result) || typeof result.valid !== "boolean" || !Array.isArray(result.errors)) {
      throw new Error("Injected scheduler validator returned an invalid validation result.");
    }
    if (!result.valid) {
      throw new Error(`Injected scheduler rejected operations state: ${result.errors.join(", ")}`);
    }
  }

  function normalizeHandoff(value, label) {
    assertAllowedKeys(value, HANDOFF_FIELDS, label);
    if (value.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`${label}.schemaVersion must be ${SCHEMA_VERSION}.`);
    }
    for (const field of ["handoffId", "commandId", "taskId"]) requireString(value[field], `${label}.${field}`);
    requireCampaignMinute(value.at, `${label}.at`);
    if (!Array.isArray(value.reassignments) || value.reassignments.length === 0) {
      throw new TypeError(`${label}.reassignments must be an explicit non-empty array.`);
    }
    const reassignments = value.reassignments.map((reassignment, index) => {
      const reassignmentLabel = `${label}.reassignments[${index}]`;
      assertAllowedKeys(reassignment, REASSIGNMENT_FIELDS, reassignmentLabel);
      for (const field of ["groupId", "fromResourceId", "toResourceId", "capabilityId"]) {
        requireString(reassignment[field], `${reassignmentLabel}.${field}`);
      }
      requirePositiveInteger(reassignment.units, `${reassignmentLabel}.units`);
      if (reassignment.fromResourceId === reassignment.toResourceId) {
        throw new Error(`${reassignmentLabel} must change its explicit resource.`);
      }
      return {
        groupId: reassignment.groupId,
        fromResourceId: reassignment.fromResourceId,
        toResourceId: reassignment.toResourceId,
        capabilityId: reassignment.capabilityId,
        units: reassignment.units
      };
    }).sort((left, right) => left.groupId.localeCompare(right.groupId)
      || left.fromResourceId.localeCompare(right.fromResourceId)
      || left.toResourceId.localeCompare(right.toResourceId)
      || left.capabilityId.localeCompare(right.capabilityId)
      || left.units - right.units);
    if (new Set(reassignments.map((reassignment) => reassignment.groupId)).size !== reassignments.length) {
      throw new Error(`${label}.reassignments contains duplicate requirement groups.`);
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      handoffId: value.handoffId,
      commandId: value.commandId,
      taskId: value.taskId,
      at: value.at,
      reassignments
    };
  }

  function normalizeHandoffs(value) {
    if (!Array.isArray(value)) throw new TypeError("operationsState.handoffs must be an array.");
    const handoffs = value.map((item, index) => normalizeHandoff(item, `operationsState.handoffs[${index}]`));
    const ids = new Set();
    const commandIds = new Set();
    handoffs.forEach((handoff) => {
      if (ids.has(handoff.handoffId)) throw new Error(`Duplicate handoffId ${handoff.handoffId}.`);
      if (commandIds.has(handoff.commandId)) throw new Error(`Duplicate handoff commandId ${handoff.commandId}.`);
      ids.add(handoff.handoffId);
      commandIds.add(handoff.commandId);
    });
    return handoffs.sort((left, right) =>
      left.at - right.at || left.handoffId.localeCompare(right.handoffId)
    );
  }

  function schedulerHandoffCommand(handoff) {
    return {
      commandId: handoff.commandId,
      taskId: handoff.taskId,
      at: handoff.at,
      reassignments: clone(handoff.reassignments)
    };
  }

  function normalizeStateInternal(value, schedulerApi) {
    assertAllowedKeys(value, TOP_LEVEL_FIELDS, "operationsState");
    if (value.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Unsupported operations state schema version: ${value.schemaVersion}`);
    }
    requireObject(value.resources, "operationsState.resources");
    if (!Array.isArray(value.tasks)) throw new TypeError("operationsState.tasks must be an array.");
    if (!Array.isArray(value.reservations)) throw new TypeError("operationsState.reservations must be an array.");
    assertSerializable(value, "operationsState");
    assertNoClinicalContent(value, "operationsState");

    const projection = normalizeSchedulerProjection(value, schedulerApi);
    const state = {
      schemaVersion: SCHEMA_VERSION,
      resources: projection.resources,
      tasks: projection.tasks,
      reservations: projection.reservations,
      handoffs: normalizeHandoffs(value.handoffs),
      appliedCommandIds: normalizeStringArray(projection.appliedCommandIds, "operationsState.appliedCommandIds"),
      commandFingerprints: canonicalize(projection.commandFingerprints)
    };
    assertSerializable(state, "operationsState");
    assertNoClinicalContent(state, "operationsState");
    assertSchedulerState(state, schedulerApi);

    const taskById = new Map();
    const taskIds = new Set(state.tasks.map((task, index) => {
      const id = recordId(task, "task");
      if (!id) throw new Error(`operationsState.tasks[${index}] has no taskId or id.`);
      if (state.tasks.some((candidate, candidateIndex) => candidateIndex < index && recordId(candidate, "task") === id)) {
        throw new Error(`Duplicate task id ${id}.`);
      }
      taskById.set(id, task);
      return id;
    }));
    const reservationIds = new Set();
    state.reservations.forEach((reservation, index) => {
      const id = recordId(reservation, "reservation");
      if (!id) throw new Error(`operationsState.reservations[${index}] has no reservationId or id.`);
      if (reservationIds.has(id)) throw new Error(`Duplicate reservation id ${id}.`);
      reservationIds.add(id);
      const taskId = taskIdOfReservation(reservation);
      if (!taskId || !taskIds.has(taskId)) {
        throw new Error(`Reservation ${id} references an unknown task.`);
      }
    });
    const latestHandoffAt = new Map();
    const supportsAtomicHandoff = typeof schedulerApi.handoffTask === "function";
    state.handoffs.forEach((handoff) => {
      if (!taskIds.has(handoff.taskId)) throw new Error(`Handoff ${handoff.handoffId} references unknown task ${handoff.taskId}.`);
      const task = taskById.get(handoff.taskId);
      if (supportsAtomicHandoff && (!Number.isInteger(task.startAt) || !Number.isInteger(task.endAt)
        || handoff.at < task.startAt || handoff.at >= task.endAt)) {
        throw new Error(`Handoff ${handoff.handoffId} is outside its task active interval.`);
      }
      for (const reassignment of handoff.reassignments) {
        for (const resourceId of [reassignment.fromResourceId, reassignment.toResourceId]) {
          if (!hasOwn(state.resources, resourceId)) {
            throw new Error(`Handoff ${handoff.handoffId} references unknown resource ${resourceId}.`);
          }
        }
        if (supportsAtomicHandoff) {
          const chronologyKey = `${handoff.taskId}\u0000${reassignment.groupId}`;
          const previousAt = latestHandoffAt.get(chronologyKey);
          if (previousAt !== undefined && handoff.at <= previousAt) {
            throw new Error(`Handoff ${handoff.handoffId} is not later than the previous transfer for group ${reassignment.groupId}.`);
          }
          latestHandoffAt.set(chronologyKey, handoff.at);

          const exactSegment = (reservation, resourceField, boundaryField) =>
            reservation.taskId === handoff.taskId
            && reservation.groupId === reassignment.groupId
            && reservation.resourceId === reassignment[resourceField]
            && reservation.capabilityId === reassignment.capabilityId
            && reservation.units === reassignment.units
            && reservation[boundaryField] === handoff.at;
          const fromSegments = state.reservations.filter((reservation) =>
            exactSegment(reservation, "fromResourceId", "endAt")
          );
          const toSegments = state.reservations.filter((reservation) =>
            exactSegment(reservation, "toResourceId", "startAt")
          );
          if (handoff.at === task.startAt ? fromSegments.length !== 0 : fromSegments.length !== 1) {
            throw new Error(`Handoff ${handoff.handoffId} does not match its previous-owner reservation boundary.`);
          }
          if (toSegments.length !== 1) {
            throw new Error(`Handoff ${handoff.handoffId} does not match its new-owner reservation boundary.`);
          }
        }
      }
      if (!state.appliedCommandIds.includes(handoff.commandId)) {
        throw new Error(`Handoff ${handoff.handoffId} command is not recorded as applied.`);
      }
      if (supportsAtomicHandoff) {
        let replay;
        try {
          replay = schedulerApi.handoffTask(schedulerSlice(state), schedulerHandoffCommand(handoff));
        } catch (error) {
          throw new Error(`Handoff ${handoff.handoffId} fingerprint does not match persisted state: ${error.message}`);
        }
        if (!replay || replay.idempotent !== true) {
          throw new Error(`Handoff ${handoff.handoffId} is not an exact persisted scheduler command.`);
        }
      }
    });
    if (supportsAtomicHandoff) {
      for (const [commandId, fingerprint] of Object.entries(state.commandFingerprints)) {
        if (fingerprint.startsWith("handoff:")
          && !state.handoffs.some((handoff) => handoff.commandId === commandId)) {
          throw new Error(`Handoff scheduler command ${commandId} has no persisted handoff event.`);
        }
      }
    }
    return state;
  }

  function createOperationsRuntime(schedulerApi) {
    schedulerValidatorFor(schedulerApi);

    function normalizeState(value) {
      return normalizeStateInternal(value, schedulerApi);
    }

    function createState(input = {}) {
      assertAllowedKeys(input, [
        "schemaVersion", "resources", "tasks", "reservations", "handoffs", "appliedCommandIds", "commandFingerprints"
      ], "operations state input");
      assertSerializable(input, "operations state input");
      if (hasOwn(input, "schemaVersion") && input.schemaVersion !== SCHEMA_VERSION) {
        throw new Error(`Unsupported operations state input schema version: ${input.schemaVersion}`);
      }
      const state = {
        schemaVersion: SCHEMA_VERSION,
        resources: clone(hasOwn(input, "resources") ? input.resources : {}),
        tasks: clone(hasOwn(input, "tasks") ? input.tasks : []),
        reservations: clone(hasOwn(input, "reservations") ? input.reservations : []),
        handoffs: clone(hasOwn(input, "handoffs") ? input.handoffs : []),
        appliedCommandIds: clone(hasOwn(input, "appliedCommandIds") ? input.appliedCommandIds : []),
        commandFingerprints: clone(hasOwn(input, "commandFingerprints") ? input.commandFingerprints : {})
      };
      return normalizeState(state);
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
        throw new TypeError("Serialized operations state must be a non-empty JSON string.");
      }
      let parsed;
      try {
        parsed = JSON.parse(serialized);
      } catch (error) {
        throw new Error(`Cannot parse operations state: ${error.message}`);
      }
      return normalizeState(parsed);
    }

    function importedRecordMatches(state, command) {
      const taskId = recordId(command.task, "task");
      const existingTask = state.tasks.find((task) => recordId(task, "task") === taskId);
      if (!existingTask || JSON.stringify(canonicalize(existingTask)) !== JSON.stringify(canonicalize(command.task))) return false;
      if (command.reservations.some((reservation) => taskIdOfReservation(reservation) !== taskId)) return false;
      const persistedReservations = state.reservations
        .filter((reservation) => taskIdOfReservation(reservation) === taskId)
        .map(canonicalize)
        .sort(compareRecords("reservation"));
      const suppliedReservations = command.reservations
        .map(canonicalize)
        .sort(compareRecords("reservation"));
      return JSON.stringify(persistedReservations) === JSON.stringify(suppliedReservations);
    }

    function importExactTask(currentState, command) {
      const state = normalizeState(currentState);
      assertAllowedKeys(command, ["commandId", "task", "reservations", "sourceAppliedCommandIds"], "import task command");
      requireString(command.commandId, "import task command.commandId");
      requireObject(command.task, "import task command.task");
      if (!Array.isArray(command.reservations)) {
        throw new TypeError("import task command.reservations must be an explicit array.");
      }
      const sourceAppliedCommandIds = normalizeStringArray(
        command.sourceAppliedCommandIds,
        "import task command.sourceAppliedCommandIds"
      );
      assertSerializable(command, "import task command");
      assertNoClinicalContent(command, "import task command");
      const taskId = recordId(command.task, "task");
      if (!taskId) throw new Error("Imported task must carry its exact taskId or id.");
      const taskHistoryCommandIds = Array.isArray(command.task.history)
        ? command.task.history
          .map((entry) => isObject(entry) ? entry.commandId : null)
          .filter((commandId) => typeof commandId === "string" && commandId)
          .sort((left, right) => left.localeCompare(right))
        : [];
      if (JSON.stringify(taskHistoryCommandIds) !== JSON.stringify(sourceAppliedCommandIds)) {
        throw new Error(`Imported task ${taskId} sourceAppliedCommandIds must exactly match its task history.`);
      }

      if (state.appliedCommandIds.includes(command.commandId)) {
        if (!sourceAppliedCommandIds.every((id) => state.appliedCommandIds.includes(id)) || !importedRecordMatches(state, command)) {
          throw new Error(`Applied import command ${command.commandId} conflicts with persisted task ${taskId}.`);
        }
        return { state: clone(state), task: clone(command.task), idempotent: true };
      }
      if (state.tasks.some((task) => recordId(task, "task") === taskId)) {
        throw new Error(`Cannot import duplicate task ${taskId}.`);
      }
      const reusedSourceCommand = sourceAppliedCommandIds.find((id) =>
        state.appliedCommandIds.includes(id) && id !== command.commandId
      );
      if (reusedSourceCommand) {
        throw new Error(`Cannot import task ${taskId}: source command ${reusedSourceCommand} is already owned.`);
      }
      const next = clone(state);
      next.tasks.push(clone(command.task));
      next.reservations.push(...clone(command.reservations));
      next.appliedCommandIds.push(...sourceAppliedCommandIds, command.commandId);
      next.appliedCommandIds = [...new Set(next.appliedCommandIds)];
      const normalized = normalizeState(next);
      return {
        state: normalized,
        task: clone(normalized.tasks.find((task) => recordId(task, "task") === taskId)),
        idempotent: false
      };
    }

    function recordHandoff(currentState, command) {
      const state = normalizeState(currentState);
      assertAllowedKeys(command, [
        "commandId", "handoffId", "taskId", "at", "reassignments"
      ], "handoff command");
      const handoff = normalizeHandoff({ schemaVersion: SCHEMA_VERSION, ...command }, "handoff command");
      if (typeof schedulerApi.handoffTask !== "function") {
        throw new TypeError("schedulerApi must expose handoffTask(state, command) for atomic transfers.");
      }
      const existingByCommand = state.handoffs.find((item) => item.commandId === handoff.commandId);
      if (state.appliedCommandIds.includes(handoff.commandId)) {
        if (!existingByCommand || JSON.stringify(existingByCommand) !== JSON.stringify(handoff)) {
          throw new Error(`Applied handoff command ${handoff.commandId} conflicts with persisted state.`);
        }
        const replay = schedulerApi.handoffTask(schedulerSlice(state), schedulerHandoffCommand(handoff));
        if (!replay || replay.idempotent !== true) {
          throw new Error(`Applied handoff command ${handoff.commandId} is not an exact scheduler replay.`);
        }
        return { state: clone(state), handoff: clone(existingByCommand), idempotent: true };
      }
      if (state.handoffs.some((item) => item.handoffId === handoff.handoffId)) {
        throw new Error(`Duplicate handoffId ${handoff.handoffId}.`);
      }
      for (const reassignment of handoff.reassignments) {
        const laterTransfer = state.handoffs.find((item) =>
          item.taskId === handoff.taskId
          && item.at >= handoff.at
          && item.reassignments.some((existing) => existing.groupId === reassignment.groupId)
        );
        if (laterTransfer) {
          throw new Error(`Handoff cannot supersede transfer ${laterTransfer.handoffId} for group ${reassignment.groupId}.`);
        }
      }
      const transfer = schedulerApi.handoffTask(schedulerSlice(state), schedulerHandoffCommand(handoff));
      requireObject(transfer, "scheduler handoff result");
      requireObject(transfer.state, "scheduler handoff result.state");
      const next = {
        ...clone(transfer.state),
        handoffs: [...clone(state.handoffs), handoff]
      };
      const normalized = normalizeState(next);
      return {
        state: normalized,
        handoff: clone(normalized.handoffs.find((item) => item.handoffId === handoff.handoffId)),
        idempotent: false
      };
    }

    function summarizeState(value) {
      const state = normalizeState(value);
      const taskStatusCounts = {};
      state.tasks.forEach((task) => {
        const status = typeof task.status === "string" && task.status ? task.status : "unspecified";
        taskStatusCounts[status] = (taskStatusCounts[status] || 0) + 1;
      });
      return {
        schemaVersion: SCHEMA_VERSION,
        resourceCount: Object.keys(state.resources).length,
        taskCount: state.tasks.length,
        queuedTaskCount: taskStatusCounts.queued || 0,
        activeTaskCount: taskStatusCounts.active || 0,
        reservationCount: state.reservations.length,
        handoffCount: state.handoffs.length,
        appliedCommandCount: state.appliedCommandIds.length,
        taskStatusCounts: canonicalize(taskStatusCounts)
      };
    }

    return Object.freeze({
      createState,
      normalizeState,
      validateState,
      serializeState,
      deserializeState,
      importExactTask,
      recordHandoff,
      summarizeState
    });
  }

  return Object.freeze({
    SCHEMA_VERSION,
    FORBIDDEN_OPERATION_FIELDS,
    createOperationsRuntime
  });
});
