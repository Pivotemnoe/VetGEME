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

  const mode = requestedMode();
  window.PET_CLINIC_GENERATOR_MODE = Object.freeze({
    mode,
    gameSaveKey: window.PET_CLINIC_SAVE_NAMESPACES.gameSaveKey(mode),
    modes: MODES.slice(),
    isCurrent: mode === "current",
    isLegacy: mode === "legacy-v1",
    isTier01V2: mode === "tier-01-v2",
    reset() {
      localStorage.removeItem(STORAGE_KEY);
    }
  });

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

  if (mode === "tier-01-v2") {
    window.PET_CLINIC_GENERATOR_READY = window.PET_CLINIC_CONTENT_V2
      .loadFromFetch()
      .then((catalog) => {
        try {
          return {
            mode: "tier-01-v2",
            catalog,
            generator: window.PET_CLINIC_GENERATOR_V2.createGenerator({ catalog })
          };
        } catch (error) {
          return { mode: "tier-01-v2", catalog, generator: null, initializationError: error };
        }
      });
  } else if (mode === "legacy-v1") {
    window.PET_CLINIC_GENERATOR_READY = loadLegacyV1();
  } else {
    window.PET_CLINIC_GENERATOR_READY = Promise.resolve({ mode: "current", catalog: null, generator: null });
  }
})();
