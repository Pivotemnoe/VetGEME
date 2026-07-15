(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_DEVICE_QUEUE_V3 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PREFIX = "DT";
  const TASK_STATUSES = Object.freeze(["queued", "processing", "completed", "cancelled"]);

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

  function isDeviceTaskId(value) {
    const match = typeof value === "string" && value.match(/^DT-(\d{6})$/);
    return Boolean(match && Number(match[1]) > 0);
  }

  function formatDeviceTaskId(sequence) {
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) {
      throw new RangeError("Device task sequence must be between 1 and 999999.");
    }
    return `${PREFIX}-${String(sequence).padStart(6, "0")}`;
  }

  function allTasks(state) {
    if (!state || !isObject(state.resources)) return [];
    return Object.values(state.resources).flatMap((resource) => Array.isArray(resource.tasks) ? resource.tasks : []);
  }

  function parseSequence(value) {
    const id = typeof value === "string" ? value : value && value.id;
    const match = typeof id === "string" && id.match(/^DT-(\d{6})$/);
    return match ? Number(match[1]) : 0;
  }

  function allocateDeviceTaskId(stateOrTasks) {
    const tasks = Array.isArray(stateOrTasks) ? stateOrTasks : allTasks(stateOrTasks);
    const used = new Set(tasks.map((item) => (typeof item === "string" ? item : item && item.id)).filter(Boolean));
    let sequence = tasks.reduce((maximum, item) => Math.max(maximum, parseSequence(item)), 0) + 1;
    while (used.has(formatDeviceTaskId(sequence))) sequence += 1;
    return formatDeviceTaskId(sequence);
  }

  function createDeviceQueueState(resourceConfigs) {
    if (!Array.isArray(resourceConfigs)) throw new TypeError("Resource configs must be an array.");
    const state = { schemaVersion: 1, resources: {} };
    for (const config of resourceConfigs) {
      if (!isObject(config)) throw new TypeError("Resource config must be an object.");
      requireString(config.resourceId, "resourceId");
      if (!Number.isInteger(config.capacityPerDay) || config.capacityPerDay <= 0) {
        throw new RangeError("capacityPerDay must be an explicit positive integer.");
      }
      if (state.resources[config.resourceId]) throw new Error(`Duplicate device resource: ${config.resourceId}`);
      state.resources[config.resourceId] = {
        capacityPerDay: config.capacityPerDay,
        tasks: []
      };
    }
    return state;
  }

  function validateDeviceTask(task, resourceId) {
    const errors = [];
    if (!isObject(task)) return { valid: false, errors: ["task_not_object"] };
    if (task.schemaVersion !== 1) errors.push("unexpected_task_schema_version");
    if (!isDeviceTaskId(task.id)) errors.push("invalid_task_id");
    if (task.resourceId !== resourceId) errors.push("task_resource_mismatch");
    for (const field of ["orderType", "orderId"]) if (typeof task[field] !== "string" || !task[field]) errors.push(`invalid_${field}`);
    if (!Number.isInteger(task.queuedAt) || task.queuedAt < 0) errors.push("invalid_queued_at");
    if (!Number.isInteger(task.authoredDurationMinutes) || task.authoredDurationMinutes <= 0) errors.push("invalid_authored_duration");
    if (!TASK_STATUSES.includes(task.status)) errors.push("invalid_task_status");
    if (!Array.isArray(task.history) || task.history.length === 0) errors.push("invalid_task_history");
    else {
      const allowed = {
        queued: ["processing", "cancelled"],
        processing: ["completed", "cancelled"],
        completed: [],
        cancelled: []
      };
      const first = task.history[0];
      if (!isObject(first) || first.from !== null || first.to !== "queued" || first.at !== task.queuedAt) errors.push("invalid_task_history_origin");
      let previousStatus = "queued";
      let previousAt = task.queuedAt;
      for (let index = 1; index < task.history.length; index += 1) {
        const entry = task.history[index];
        if (!isObject(entry) || entry.from !== previousStatus || !allowed[previousStatus].includes(entry.to)) {
          errors.push(`invalid_task_history_transition:${index}`);
          break;
        }
        if (!Number.isInteger(entry.at) || entry.at < previousAt || typeof entry.commandId !== "string" || !entry.commandId) {
          errors.push(`invalid_task_history_entry:${index}`);
        }
        previousStatus = entry.to;
        previousAt = entry.at;
      }
      if (previousStatus !== task.status) errors.push("task_history_status_mismatch");
    }
    if (!Array.isArray(task.appliedCommandIds) || new Set(task.appliedCommandIds).size !== task.appliedCommandIds.length) {
      errors.push("invalid_task_command_ids");
    } else if (Array.isArray(task.history)) {
      const historyCommandIds = task.history.slice(1).map((entry) => entry && entry.commandId);
      if (JSON.stringify(historyCommandIds) !== JSON.stringify(task.appliedCommandIds)) errors.push("task_history_command_ids_mismatch");
    }
    const reachedProcessing = Array.isArray(task.history) && task.history.some((entry) => entry && entry.to === "processing");
    if (reachedProcessing) {
      if (!Number.isInteger(task.startedAt) || !Number.isInteger(task.startedDay) || !Number.isInteger(task.dueAt)) errors.push("missing_start_fields");
      else {
        if (task.dueAt !== task.startedAt + task.authoredDurationMinutes) errors.push("invalid_due_at");
        if (Math.floor(task.startedAt / 1440) + 1 !== task.startedDay) errors.push("invalid_started_day");
        const processingEntry = task.history.find((entry) => entry && entry.to === "processing");
        if (!processingEntry || processingEntry.at !== task.startedAt) errors.push("start_history_mismatch");
      }
    }
    if (task.status === "completed") {
      const completionEntry = task.history.find((entry) => entry && entry.to === "completed");
      if (!Number.isInteger(task.completedAt) || task.completedAt < task.dueAt || !completionEntry || completionEntry.at !== task.completedAt) {
        errors.push("invalid_completed_at");
      }
    }
    if (task.status === "cancelled") {
      const cancellationEntry = task.history.find((entry) => entry && entry.to === "cancelled");
      if (!Number.isInteger(task.cancelledAt) || !cancellationEntry || cancellationEntry.at !== task.cancelledAt) errors.push("invalid_cancelled_at");
    }
    if (Object.prototype.hasOwnProperty.call(task, "result") || Object.prototype.hasOwnProperty.call(task, "authoredResult")) {
      errors.push("result_not_allowed_in_device_queue");
    }
    return { valid: errors.length === 0, errors };
  }

  function validateDeviceQueueState(state) {
    const errors = [];
    if (!isObject(state) || state.schemaVersion !== 1 || !isObject(state.resources)) {
      return { valid: false, errors: ["invalid_device_queue_state"] };
    }
    const ids = new Set();
    for (const [resourceId, resource] of Object.entries(state.resources)) {
      if (!isObject(resource) || !Number.isInteger(resource.capacityPerDay) || resource.capacityPerDay <= 0 || !Array.isArray(resource.tasks)) {
        errors.push(`invalid_resource:${resourceId}`);
        continue;
      }
      for (const task of resource.tasks) {
        const validation = validateDeviceTask(task, resourceId);
        errors.push(...validation.errors.map((error) => `${resourceId}:${error}`));
        if (task && ids.has(task.id)) errors.push(`duplicate_task_id:${task.id}`);
        if (task) ids.add(task.id);
      }
      const startsByDay = Object.create(null);
      for (const task of resource.tasks) {
        if (Number.isInteger(task.startedDay)) startsByDay[task.startedDay] = (startsByDay[task.startedDay] || 0) + 1;
      }
      for (const [day, count] of Object.entries(startsByDay)) {
        if (count > resource.capacityPerDay) errors.push(`capacity_exceeded:${resourceId}:day_${day}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  function enqueueDeviceTask(currentState, input) {
    const validation = validateDeviceQueueState(currentState);
    if (!validation.valid) throw new Error(`Invalid device queue state: ${validation.errors.join(", ")}`);
    if (!isObject(input)) throw new TypeError("Device task input must be an object.");
    for (const field of ["id", "resourceId", "orderType", "orderId"]) requireString(input[field], field);
    if (!isDeviceTaskId(input.id)) throw new TypeError("Device task id must match DT-000001.");
    requireMinute(input.queuedAt, "queuedAt");
    if (!Number.isInteger(input.authoredDurationMinutes) || input.authoredDurationMinutes <= 0) {
      throw new RangeError("authoredDurationMinutes must be an explicit positive integer.");
    }
    if (!currentState.resources[input.resourceId]) throw new Error(`Unknown device resource: ${input.resourceId}`);
    if (allTasks(currentState).some((task) => task.id === input.id)) throw new Error(`Duplicate device task id: ${input.id}`);
    const state = clone(currentState);
    const task = {
      schemaVersion: 1,
      id: input.id,
      resourceId: input.resourceId,
      orderType: input.orderType,
      orderId: input.orderId,
      queuedAt: input.queuedAt,
      authoredDurationMinutes: input.authoredDurationMinutes,
      status: "queued",
      history: [{ from: null, to: "queued", at: input.queuedAt }],
      appliedCommandIds: []
    };
    state.resources[input.resourceId].tasks.push(task);
    return { state, task: clone(task) };
  }

  function findCommandTask(state, commandId) {
    return allTasks(state).find((task) => task.appliedCommandIds.includes(commandId));
  }

  function startNextDeviceTask(currentState, command) {
    const validation = validateDeviceQueueState(currentState);
    if (!validation.valid) throw new Error(`Invalid device queue state: ${validation.errors.join(", ")}`);
    if (!isObject(command)) throw new TypeError("Start-device command must be an object.");
    requireString(command.commandId, "commandId");
    requireString(command.resourceId, "resourceId");
    requireMinute(command.startedAt, "startedAt");
    if (!Number.isInteger(command.day) || command.day < 1) throw new RangeError("day must be a positive integer.");
    if (Math.floor(command.startedAt / 1440) + 1 !== command.day) throw new Error("startedAt does not belong to command day.");
    const previous = findCommandTask(currentState, command.commandId);
    if (previous) return { state: clone(currentState), task: clone(previous), reasonCode: "already_applied", idempotent: true };
    const resource = currentState.resources[command.resourceId];
    if (!resource) throw new Error(`Unknown device resource: ${command.resourceId}`);
    const startedToday = resource.tasks.filter((task) => task.startedDay === command.day).length;
    if (startedToday >= resource.capacityPerDay) {
      return { state: clone(currentState), task: null, reasonCode: "daily_capacity_reached", idempotent: false };
    }
    const candidate = resource.tasks
      .filter((task) => task.status === "queued" && task.queuedAt <= command.startedAt)
      .sort((left, right) => left.queuedAt - right.queuedAt || left.id.localeCompare(right.id))[0];
    if (!candidate) return { state: clone(currentState), task: null, reasonCode: "no_queued_task", idempotent: false };
    const state = clone(currentState);
    const task = state.resources[command.resourceId].tasks.find((item) => item.id === candidate.id);
    task.status = "processing";
    task.startedAt = command.startedAt;
    task.startedDay = command.day;
    task.dueAt = command.startedAt + task.authoredDurationMinutes;
    task.history.push({ from: "queued", to: "processing", at: command.startedAt, commandId: command.commandId });
    task.appliedCommandIds.push(command.commandId);
    return { state, task: clone(task), reasonCode: "started", idempotent: false };
  }

  function transitionTask(currentState, command, targetStatus) {
    const validation = validateDeviceQueueState(currentState);
    if (!validation.valid) throw new Error(`Invalid device queue state: ${validation.errors.join(", ")}`);
    if (!isObject(command)) throw new TypeError("Device task command must be an object.");
    for (const field of ["commandId", "taskId"]) requireString(command[field], field);
    requireMinute(command.at, "at");
    const previous = findCommandTask(currentState, command.commandId);
    if (previous) return { state: clone(currentState), task: clone(previous), idempotent: true };
    const existing = allTasks(currentState).find((task) => task.id === command.taskId);
    if (!existing) throw new Error(`Unknown device task: ${command.taskId}`);
    if (targetStatus === "completed") {
      if (existing.status !== "processing") throw new Error(`Cannot complete device task from ${existing.status}.`);
      if (command.at < existing.dueAt) throw new Error("Device task cannot complete before dueAt.");
    } else if (targetStatus === "cancelled") {
      if (existing.status !== "queued" && existing.status !== "processing") throw new Error(`Cannot cancel device task from ${existing.status}.`);
    }
    const state = clone(currentState);
    let task;
    for (const resource of Object.values(state.resources)) {
      task = resource.tasks.find((item) => item.id === command.taskId);
      if (task) break;
    }
    const from = task.status;
    task.status = targetStatus;
    if (targetStatus === "completed") task.completedAt = command.at;
    if (targetStatus === "cancelled") {
      task.cancelledAt = command.at;
      if (command.cancellationRecord !== undefined) task.cancellationRecord = clone(command.cancellationRecord);
    }
    task.history.push({ from, to: targetStatus, at: command.at, commandId: command.commandId });
    task.appliedCommandIds.push(command.commandId);
    return { state, task: clone(task), idempotent: false };
  }

  function completeDeviceTask(state, command) {
    return transitionTask(state, command, "completed");
  }

  function cancelDeviceTask(state, command) {
    return transitionTask(state, command, "cancelled");
  }

  function listDeviceTasks(state, filters) {
    const settings = filters || {};
    return allTasks(state)
      .filter((task) => settings.resourceId === undefined || task.resourceId === settings.resourceId)
      .filter((task) => settings.status === undefined || task.status === settings.status)
      .map(clone)
      .sort((left, right) => left.queuedAt - right.queuedAt || left.id.localeCompare(right.id));
  }

  return Object.freeze({
    PREFIX,
    TASK_STATUSES,
    formatDeviceTaskId,
    allocateDeviceTaskId,
    createDeviceQueueState,
    validateDeviceTask,
    validateDeviceQueueState,
    enqueueDeviceTask,
    startNextDeviceTask,
    completeDeviceTask,
    cancelDeviceTask,
    listDeviceTasks
  });
});
