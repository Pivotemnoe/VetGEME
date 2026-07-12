(function (root, factory) {
  "use strict";
  const namespaces = typeof module === "object" && module.exports
    ? require("./save-namespaces.js")
    : root.PET_CLINIC_SAVE_NAMESPACES;
  const api = factory(namespaces);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_GAME_STATE_SAVE = api;
})(typeof window !== "undefined" ? window : globalThis, function (namespaces) {
  "use strict";

  const GAME_STATE_SAVE_VERSION = 1;
  const SERIALIZED_FIELDS = Object.freeze([
    "phase", "day", "minute", "dayEnd", "money", "reputation", "queue", "activeId",
    "nextPatientId", "paused", "speed", "spawnMeter", "log", "treatedToday", "revenueToday",
    "expensesToday", "diagnosticRevenueToday", "microscopyToday", "arrivalsToday",
    "plannedArrivalsToday", "specialEventsToday", "handledSpecialEventsToday", "arrivalSchedule",
    "reputationStartToday", "reputationEvents", "returnsToday", "mistakesToday", "pendingReturns",
    "caseJournal", "dayStarted", "hoursMode", "selectedDoctorId", "doctors", "lostToday", "goalStats",
    "shiftExtended", "chapterComplete", "firstArrivalPaused", "tutorialVisitId", "tutorialStepIndex",
    "tutorialComplete", "summaryTitle", "summaryHtml"
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function snapshotState(state) {
    const snapshot = {};
    SERIALIZED_FIELDS.forEach((field) => {
      if (state[field] !== undefined) snapshot[field] = clone(state[field]);
    });
    return snapshot;
  }

  function createSnapshot(mode, state) {
    return {
      gameStateSaveVersion: GAME_STATE_SAVE_VERSION,
      generatorMode: mode,
      savedAt: new Date().toISOString(),
      state: snapshotState(state)
    };
  }

  function validateSnapshot(snapshot, expectedMode) {
    if (!snapshot || typeof snapshot !== "object") throw new Error("Game save is not an object");
    if (snapshot.gameStateSaveVersion !== GAME_STATE_SAVE_VERSION) {
      throw new Error(`Unsupported game save version: ${snapshot.gameStateSaveVersion ?? "missing"}`);
    }
    if (snapshot.generatorMode !== expectedMode) {
      throw new Error(`Game save mode mismatch: expected ${expectedMode}, got ${snapshot.generatorMode}`);
    }
    if (!snapshot.state || typeof snapshot.state !== "object") throw new Error("Game save state is missing");
    return snapshot;
  }

  function save(storage, mode, state) {
    const snapshot = createSnapshot(mode, state);
    storage.setItem(namespaces.gameSaveKey(mode), JSON.stringify(snapshot));
    return snapshot;
  }

  function load(storage, mode) {
    const raw = storage.getItem(namespaces.gameSaveKey(mode));
    if (!raw) return null;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Game save JSON is invalid: ${error.message}`);
    }
    return validateSnapshot(parsed, mode);
  }

  function clear(storage, mode) {
    storage.removeItem(namespaces.gameSaveKey(mode));
  }

  return {
    GAME_STATE_SAVE_VERSION,
    SERIALIZED_FIELDS,
    createSnapshot,
    validateSnapshot,
    save,
    load,
    clear
  };
});
