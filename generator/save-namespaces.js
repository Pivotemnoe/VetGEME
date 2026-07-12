(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_SAVE_NAMESPACES = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const GAME_SAVE_KEYS = Object.freeze({
    current: "pet-clinic-game-current",
    "legacy-v1": "pet-clinic-game-legacy-v1",
    "tier-01-v2": "pet-clinic-game-tier-01-v2"
  });

  function gameSaveKey(mode) {
    if (!Object.prototype.hasOwnProperty.call(GAME_SAVE_KEYS, mode)) throw new Error(`Unsupported generator mode: ${mode}`);
    return GAME_SAVE_KEYS[mode];
  }

  return { GAME_SAVE_KEYS, gameSaveKey };
});
