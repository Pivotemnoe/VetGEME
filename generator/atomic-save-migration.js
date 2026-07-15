(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_ATOMIC_SAVE_MIGRATION = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function assertStorage(storage) {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new Error("A Web Storage compatible object is required");
    }
  }

  function parseRaw(raw, label) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`${label} JSON is invalid: ${error.message}`);
    }
  }

  function migrationBackupKey(primaryKey, sourceVersion) {
    if (!primaryKey || typeof primaryKey !== "string") throw new Error("Migration primary key is required");
    if (!Number.isInteger(sourceVersion) || sourceVersion < 1) {
      throw new Error(`Migration source version is invalid: ${sourceVersion ?? "missing"}`);
    }
    return `${primaryKey}:migration-source:v${sourceVersion}`;
  }

  function migrate(options = {}) {
    const {
      storage,
      primaryKey,
      backupKey,
      sourceRaw = storage?.getItem?.(primaryKey),
      label = "Save migration",
      validateSource = () => {},
      buildCandidate,
      validateCandidate = () => {}
    } = options;

    assertStorage(storage);
    if (!primaryKey || typeof primaryKey !== "string") throw new Error(`${label}: primary key is required`);
    if (!backupKey || typeof backupKey !== "string") throw new Error(`${label}: backup key is required`);
    if (typeof sourceRaw !== "string") throw new Error(`${label}: source snapshot is missing`);
    if (typeof buildCandidate !== "function") throw new Error(`${label}: candidate builder is required`);

    const source = parseRaw(sourceRaw, `${label} source`);
    validateSource(source);
    const candidate = buildCandidate(source);
    validateCandidate(candidate);
    const candidateRaw = JSON.stringify(candidate);
    const serializedCandidate = parseRaw(candidateRaw, `${label} candidate`);
    validateCandidate(serializedCandidate);

    const existingBackup = storage.getItem(backupKey);
    if (existingBackup !== null && existingBackup !== sourceRaw) {
      throw new Error(`${label}: migration backup conflict at ${backupKey}`);
    }

    if (existingBackup === null) {
      storage.setItem(backupKey, sourceRaw);
      if (storage.getItem(backupKey) !== sourceRaw) {
        throw new Error(`${label}: migration backup verification failed at ${backupKey}`);
      }
    }

    storage.setItem(primaryKey, candidateRaw);
    if (storage.getItem(primaryKey) !== candidateRaw) {
      throw new Error(`${label}: migrated snapshot verification failed at ${primaryKey}`);
    }

    return {
      value: serializedCandidate,
      raw: candidateRaw,
      backupKey,
      sourceRaw
    };
  }

  function restore(options = {}) {
    const {
      storage,
      primaryKey,
      backupKey,
      label = "Save migration rollback",
      validateBackup = () => {}
    } = options;

    assertStorage(storage);
    if (!primaryKey || typeof primaryKey !== "string") throw new Error(`${label}: primary key is required`);
    if (!backupKey || typeof backupKey !== "string") throw new Error(`${label}: backup key is required`);
    const backupRaw = storage.getItem(backupKey);
    if (typeof backupRaw !== "string") throw new Error(`${label}: backup snapshot is missing at ${backupKey}`);
    const backup = parseRaw(backupRaw, `${label} backup`);
    validateBackup(backup);

    storage.setItem(primaryKey, backupRaw);
    if (storage.getItem(primaryKey) !== backupRaw) {
      throw new Error(`${label}: restored snapshot verification failed at ${primaryKey}`);
    }
    return { value: backup, raw: backupRaw, backupKey };
  }

  return {
    migrationBackupKey,
    migrate,
    restore
  };
});
