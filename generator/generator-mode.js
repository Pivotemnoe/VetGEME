(function () {
  "use strict";

  const STORAGE_KEY = "pet-clinic-generator-mode";
  const MODES = ["current", "legacy-v1", "tier-01-v2"];

  function requestedMode() {
    const fromQuery = new URLSearchParams(window.location.search).get("generatorMode");
    if (MODES.includes(fromQuery)) {
      localStorage.setItem(STORAGE_KEY, fromQuery);
      return fromQuery;
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    return MODES.includes(saved) ? saved : "current";
  }

  function exposeMode(mode, gameModeId = null) {
    window.PET_CLINIC_GENERATOR_MODE = Object.freeze({
      mode,
      gameSaveKey: gameModeId && window.PET_CLINIC_SAVE_MANAGER_V11
        ? window.PET_CLINIC_SAVE_MANAGER_V11.modeKey(gameModeId)
        : window.PET_CLINIC_SAVE_NAMESPACES.gameSaveKey(mode),
      gameModeId,
      modes: MODES.slice(),
      isCurrent: mode === "current",
      isLegacy: mode === "legacy-v1",
      isTier01V2: mode === "tier-01-v2",
      reset() {
        localStorage.removeItem(STORAGE_KEY);
      }
    });
  }

  async function loadLegacyV1() {
    const sandbox = {};
    const [campaignSource, generatorSource] = await Promise.all([
      fetch("legacy/campaign-v1.js").then((response) => response.text()),
      fetch("legacy/generator-v1.js").then((response) => response.text())
    ]);
    Function("window", campaignSource)(sandbox);
    Function("window", "globalThis", "module", generatorSource)(sandbox, sandbox, undefined);
    return {
      mode: "legacy-v1",
      catalog: null,
      generator: sandbox.PET_CLINIC_GENERATOR.createGenerator({ campaign: sandbox.PET_CLINIC_CAMPAIGN })
    };
  }

  function loadTier01V2(storage = window.localStorage) {
    return window.PET_CLINIC_CONTENT_V2
      .loadFromFetch({
        packId: "tier-01-v2",
        packVersion: "2026.07.12.2",
        mode: "tier-01-v2",
        context: "review"
      })
      .then((catalog) => {
        try {
          return {
            mode: "tier-01-v2",
            catalog,
            generator: window.PET_CLINIC_GENERATOR_V2.createGenerator({ catalog, storage })
          };
        } catch (error) {
          return { mode: "tier-01-v2", catalog, generator: null, initializationError: error };
        }
      })
      .catch((error) => ({
        mode: "tier-01-v2",
        catalog: null,
        generator: null,
        initializationError: error
      }));
  }

  const gameModeSelection = window.PET_CLINIC_GAME_MODE_V11?.selectionPromise;
  if (!gameModeSelection) {
    const mode = requestedMode();
    exposeMode(mode);
    window.PET_CLINIC_GENERATOR_READY = mode === "tier-01-v2"
      ? loadTier01V2()
      : mode === "legacy-v1" ? loadLegacyV1() : Promise.resolve({ mode: "current", catalog: null, generator: null });
    return;
  }

  window.PET_CLINIC_GENERATOR_READY = gameModeSelection.then((selection) => {
    const mode = MODES.includes(selection.runtimeGeneratorMode) ? selection.runtimeGeneratorMode : "tier-01-v2";
    const isV11Mode = selection.source !== "legacy-test-route";
    if (!isV11Mode) localStorage.setItem(STORAGE_KEY, mode);
    exposeMode(mode, isV11Mode ? selection.modeId : null);
    if (mode === "tier-01-v2") {
      const storage = isV11Mode
        ? window.PET_CLINIC_SAVE_MANAGER_V11.generatorStorage(localStorage, selection.modeId)
        : localStorage;
      return loadTier01V2(storage);
    }
    if (mode === "legacy-v1") return loadLegacyV1();
    return { mode: "current", catalog: null, generator: null };
  });
})();
