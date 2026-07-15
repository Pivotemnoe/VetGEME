"use strict";

const assert = require("node:assert/strict");
const atomic = require("../generator/atomic-save-migration.js");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  const api = {
    setCalls: [],
    failSet: null,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      api.setCalls.push({ key, value: String(value) });
      if (api.failSet?.(key, String(value))) {
        const error = new Error(`quota:${key}`);
        error.name = "QuotaExceededError";
        throw error;
      }
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); }
  };
  return api;
}

const primaryKey = "save";
const sourceRaw = '{\n  "version": 1, "payload": {"stable": true}\n}';
const backupKey = atomic.migrationBackupKey(primaryKey, 1);
const buildCandidate = (source) => ({ ...source, version: 2 });
const validateSource = (source) => {
  if (source.version !== 1 || source.payload?.stable !== true) throw new Error("invalid source");
};
const validateCandidate = (candidate) => {
  if (candidate.version !== 2 || candidate.payload?.stable !== true) throw new Error("invalid candidate");
};

assert.equal(backupKey, "save:migration-source:v1");

const invalidJson = memoryStorage({ [primaryKey]: "not-json" });
assert.throws(() => atomic.migrate({
  storage: invalidJson,
  primaryKey,
  backupKey,
  sourceRaw: invalidJson.getItem(primaryKey),
  buildCandidate
}), /JSON is invalid/);
assert.equal(invalidJson.setCalls.length, 0, "invalid source JSON caused a write");

const invalidCandidate = memoryStorage({ [primaryKey]: sourceRaw });
assert.throws(() => atomic.migrate({
  storage: invalidCandidate,
  primaryKey,
  backupKey,
  sourceRaw,
  validateSource,
  buildCandidate: () => ({ version: 999 }),
  validateCandidate
}), /invalid candidate/);
assert.equal(invalidCandidate.setCalls.length, 0, "candidate validation happened after a write");

const conflict = memoryStorage({ [primaryKey]: sourceRaw, [backupKey]: '{"version":1,"different":true}' });
assert.throws(() => atomic.migrate({
  storage: conflict,
  primaryKey,
  backupKey,
  sourceRaw,
  validateSource,
  buildCandidate,
  validateCandidate
}), /backup conflict/);
assert.equal(conflict.setCalls.length, 0, "backup conflict changed storage");
assert.equal(conflict.getItem(primaryKey), sourceRaw);

const backupQuota = memoryStorage({ [primaryKey]: sourceRaw });
backupQuota.failSet = (key) => key === backupKey;
assert.throws(() => atomic.migrate({
  storage: backupQuota,
  primaryKey,
  backupKey,
  sourceRaw,
  validateSource,
  buildCandidate,
  validateCandidate
}), /quota/);
assert.equal(backupQuota.getItem(primaryKey), sourceRaw, "backup quota failure changed the primary save");
assert.equal(backupQuota.getItem(backupKey), null);

const primaryQuota = memoryStorage({ [primaryKey]: sourceRaw });
primaryQuota.failSet = (key) => key === primaryKey;
assert.throws(() => atomic.migrate({
  storage: primaryQuota,
  primaryKey,
  backupKey,
  sourceRaw,
  validateSource,
  buildCandidate,
  validateCandidate
}), /quota/);
assert.equal(primaryQuota.getItem(primaryKey), sourceRaw, "primary quota failure overwrote the source");
assert.equal(primaryQuota.getItem(backupKey), sourceRaw, "primary quota failure lost the exact backup");
const backupWritesBeforeRetry = primaryQuota.setCalls.filter((call) => call.key === backupKey).length;
primaryQuota.failSet = null;
const retried = atomic.migrate({
  storage: primaryQuota,
  primaryKey,
  backupKey,
  sourceRaw,
  validateSource,
  buildCandidate,
  validateCandidate
});
assert.equal(retried.value.version, 2);
assert.equal(primaryQuota.setCalls.filter((call) => call.key === backupKey).length, backupWritesBeforeRetry, "retry rewrote an existing exact backup");
assert.equal(primaryQuota.getItem(backupKey), sourceRaw);

const migratedRaw = primaryQuota.getItem(primaryKey);
assert.notEqual(migratedRaw, sourceRaw);
const restored = atomic.restore({
  storage: primaryQuota,
  primaryKey,
  backupKey,
  validateBackup: validateSource
});
assert.equal(restored.raw, sourceRaw);
assert.equal(primaryQuota.getItem(primaryKey), sourceRaw, "rollback did not restore exact source bytes");

console.log("atomic save migration: ok");
