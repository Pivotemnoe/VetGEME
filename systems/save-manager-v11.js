(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_SAVE_MANAGER_V11 = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SCHEMA_VERSION = 11;
  const ROOT_KEY = "pet-clinic-game-v11";
  const MODE_IDS = Object.freeze(["campaign", "training", "endless", "tester"]);
  const SETTINGS_KEY = `${ROOT_KEY}:settings`;
  const LEGACY_CLEARED_KEY = `${ROOT_KEY}:legacy-cleared`;
  const GENERATOR_SAVE_KEY = "pet-clinic-generator-v2";
  const DEPENDENCIES = Object.freeze({
    activationId: "pet-clinic-local-full-activation-2026.07.17.1",
    medical: Object.freeze({
      version: "2026.07.16.40",
      manifestSha256: "87ded58e62ecf0b05d87af83e00570004cadafa9a0edd74768eda6e8cb9b3f49"
    }),
    operational: Object.freeze({
      version: "2026.07.16.4",
      manifestSha256: "5fc89dc34234d0626846fef797ba247ea0154068eeeb6b0953a990b3745f146d"
    }),
    resources: Object.freeze({
      version: "2026.07.16.2",
      manifestSha256: "25730b20dcc3d0ac840082f353ccea14d11c35aa9c107bf2cb52ccd21e3e69c6"
    }),
    visual: Object.freeze({
      version: "2026.07.16.2",
      manifestSha256: "7f940f8ba3df745670fc5b4c262a6f79caf5db9edd4f3068a379f18ec4327515"
    })
  });
  const LEGACY_EXACT_KEYS = Object.freeze([
    "pet-clinic-game-current",
    "pet-clinic-game-legacy-v1",
    "pet-clinic-game-tier-01-v2",
    "pet-clinic-generator-v1",
    "pet-clinic-generator-v2",
    "pet-clinic-generator-mode"
  ]);

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function modeKey(modeId) {
    if (!MODE_IDS.includes(modeId)) throw new RangeError(`Unknown Pet Clinic save mode: ${modeId}`);
    return `${ROOT_KEY}:${modeId}`;
  }

  function pendingKey(modeId) {
    return `${modeKey(modeId)}:pending`;
  }

  function sameDependencies(candidate) {
    return JSON.stringify(candidate) === JSON.stringify(DEPENDENCIES);
  }

  function validateEnvelope(envelope, expectedModeId) {
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
      throw new Error("Сохранение v11 повреждено: корневой объект отсутствует.");
    }
    if (envelope.saveSchemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Несовместимая версия сохранения: ${envelope.saveSchemaVersion ?? "не указана"}.`);
    }
    if (envelope.modeId !== expectedModeId) {
      throw new Error(`Сохранение относится к другому режиму: ${envelope.modeId ?? "не указан"}.`);
    }
    if (!sameDependencies(envelope.dependencies)) {
      throw new Error("Версии медицинской базы или систем сохранения не совпадают с текущей сборкой.");
    }
    if (!envelope.generatorStorage || typeof envelope.generatorStorage !== "object"
      || Array.isArray(envelope.generatorStorage)) {
      throw new Error("Сохранение v11 повреждено: состояние генератора отсутствует.");
    }
    for (const [key, raw] of Object.entries(envelope.generatorStorage)) {
      if (!key || typeof raw !== "string") {
        throw new Error("Сохранение v11 повреждено: данные генератора имеют неверный формат.");
      }
    }
    if (envelope.gameSnapshot !== null
      && (!envelope.gameSnapshot || typeof envelope.gameSnapshot !== "object" || Array.isArray(envelope.gameSnapshot))) {
      throw new Error("Сохранение v11 повреждено: игровой снимок имеет неверный формат.");
    }
    return envelope;
  }

  function createEnvelope(modeId) {
    return {
      saveSchemaVersion: SCHEMA_VERSION,
      modeId,
      dependencies: clone(DEPENDENCIES),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generatorStorage: {},
      gameSnapshot: null
    };
  }

  function parseEnvelope(raw, modeId, label) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`${label} содержит повреждённый JSON: ${error.message}`);
    }
    return validateEnvelope(parsed, modeId);
  }

  function readEnvelope(storage, modeId) {
    const primaryKey = modeKey(modeId);
    const recoveryKey = pendingKey(modeId);
    const primaryRaw = storage.getItem(primaryKey);
    const pendingRaw = storage.getItem(recoveryKey);

    if (primaryRaw !== null) {
      try {
        const primary = parseEnvelope(primaryRaw, modeId, "Основное сохранение v11");
        if (pendingRaw !== null) storage.removeItem(recoveryKey);
        return primary;
      } catch (primaryError) {
        if (pendingRaw === null) throw primaryError;
        const recovered = parseEnvelope(pendingRaw, modeId, "Резервное сохранение v11");
        storage.setItem(primaryKey, pendingRaw);
        if (storage.getItem(primaryKey) !== pendingRaw) throw new Error("Не удалось восстановить сохранение v11.");
        storage.removeItem(recoveryKey);
        return recovered;
      }
    }

    if (pendingRaw === null) return null;
    const recovered = parseEnvelope(pendingRaw, modeId, "Резервное сохранение v11");
    storage.setItem(primaryKey, pendingRaw);
    if (storage.getItem(primaryKey) !== pendingRaw) throw new Error("Не удалось восстановить сохранение v11.");
    storage.removeItem(recoveryKey);
    return recovered;
  }

  function atomicWrite(storage, modeId, envelope) {
    const candidate = clone(envelope);
    candidate.updatedAt = new Date().toISOString();
    validateEnvelope(candidate, modeId);
    const raw = JSON.stringify(candidate);
    const primaryKey = modeKey(modeId);
    const recoveryKey = pendingKey(modeId);

    storage.setItem(recoveryKey, raw);
    if (storage.getItem(recoveryKey) !== raw) throw new Error("Не удалось проверить резервную запись v11.");
    parseEnvelope(storage.getItem(recoveryKey), modeId, "Резервная запись v11");
    storage.setItem(primaryKey, raw);
    if (storage.getItem(primaryKey) !== raw) throw new Error("Не удалось проверить основную запись v11.");
    parseEnvelope(storage.getItem(primaryKey), modeId, "Основная запись v11");
    storage.removeItem(recoveryKey);
    return candidate;
  }

  function updateEnvelope(storage, modeId, updater) {
    const current = readEnvelope(storage, modeId) || createEnvelope(modeId);
    const candidate = updater(clone(current)) || current;
    return atomicWrite(storage, modeId, candidate);
  }

  function generatorStorage(storage, modeId) {
    modeKey(modeId);
    return Object.freeze({
      getItem(key) {
        const envelope = readEnvelope(storage, modeId);
        return envelope && Object.prototype.hasOwnProperty.call(envelope.generatorStorage, key)
          ? envelope.generatorStorage[key]
          : null;
      },
      setItem(key, value) {
        if (typeof key !== "string" || !key) throw new TypeError("Generator storage key is required");
        if (typeof value !== "string") throw new TypeError("Generator storage value must be a string");
        updateEnvelope(storage, modeId, (envelope) => {
          envelope.generatorStorage[key] = value;
          return envelope;
        });
      },
      removeItem(key) {
        const envelope = readEnvelope(storage, modeId);
        if (!envelope || !Object.prototype.hasOwnProperty.call(envelope.generatorStorage, key)) return;
        updateEnvelope(storage, modeId, (candidate) => {
          delete candidate.generatorStorage[key];
          return candidate;
        });
      }
    });
  }

  function saveGame(storage, modeId, generatorMode, state, options = {}) {
    const snapshotApi = options.snapshotApi;
    if (!snapshotApi?.createSnapshot) throw new Error("Модуль игрового снимка недоступен.");
    const snapshot = snapshotApi.createSnapshot(generatorMode, state, options);
    updateEnvelope(storage, modeId, (envelope) => {
      envelope.gameSnapshot = snapshot;
      return envelope;
    });
    return snapshot;
  }

  function loadGame(storage, modeId, generatorMode, options = {}) {
    const envelope = readEnvelope(storage, modeId);
    if (!envelope || envelope.gameSnapshot === null) return null;
    const snapshotApi = options.snapshotApi;
    if (!snapshotApi?.validateSnapshot) throw new Error("Модуль игрового снимка недоступен.");
    snapshotApi.validateSnapshot(envelope.gameSnapshot, generatorMode, options);
    if (generatorMode !== "tier-01-v2" || options.hydrate === false) return clone(envelope.gameSnapshot);
    return {
      ...clone(envelope.gameSnapshot),
      state: snapshotApi.hydrateTierState(envelope.gameSnapshot.state, options.catalog)
    };
  }

  function clearMode(storage, modeId) {
    storage.removeItem(modeKey(modeId));
    storage.removeItem(pendingKey(modeId));
  }

  function legacyKeys(storage) {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) continue;
      const isExact = LEGACY_EXACT_KEYS.includes(key);
      const isMigrationBackup = LEGACY_EXACT_KEYS.some((legacyKey) => key.startsWith(`${legacyKey}:migration-source:v`));
      if (isExact || isMigrationBackup) keys.push(key);
    }
    return keys;
  }

  function clearLegacy(storage) {
    if (storage.getItem(LEGACY_CLEARED_KEY) !== null) {
      return Object.freeze({ alreadyCleared: true, removedKeys: [] });
    }
    const removedKeys = legacyKeys(storage);
    removedKeys.forEach((key) => storage.removeItem(key));
    storage.setItem(LEGACY_CLEARED_KEY, JSON.stringify({
      saveSchemaVersion: SCHEMA_VERSION,
      clearedAt: new Date().toISOString()
    }));
    return Object.freeze({ alreadyCleared: false, removedKeys: Object.freeze(removedKeys.slice()) });
  }

  function legacyCleanupRequired(storage) {
    return storage.getItem(LEGACY_CLEARED_KEY) === null;
  }

  function readSettings(storage) {
    const raw = storage.getItem(SETTINGS_KEY);
    if (raw === null) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  function writeSettings(storage, patch) {
    const settings = { ...readSettings(storage), ...clone(patch), saveSchemaVersion: SCHEMA_VERSION };
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  }

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    rootKey: ROOT_KEY,
    modeIds: MODE_IDS,
    settingsKey: SETTINGS_KEY,
    legacyClearedKey: LEGACY_CLEARED_KEY,
    generatorSaveKey: GENERATOR_SAVE_KEY,
    dependencies: DEPENDENCIES,
    legacyExactKeys: LEGACY_EXACT_KEYS,
    modeKey,
    pendingKey,
    validateEnvelope,
    readEnvelope,
    atomicWrite,
    updateEnvelope,
    generatorStorage,
    saveGame,
    loadGame,
    clearMode,
    legacyKeys,
    clearLegacy,
    legacyCleanupRequired,
    readSettings,
    writeSettings
  });
});
