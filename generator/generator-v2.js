(function (root, factory) {
  "use strict";

  const compactApi = typeof module === "object" && module.exports
    ? require("./compact-visit-v2.js")
    : root.PET_CLINIC_COMPACT_VISIT_V2;
  const demandApi = typeof module === "object" && module.exports
    ? require("./demand-director-v2.js")
    : root.PET_CLINIC_DEMAND_DIRECTOR_V2;
  const atomicSaveMigration = typeof module === "object" && module.exports
    ? require("./atomic-save-migration.js")
    : root.PET_CLINIC_ATOMIC_SAVE_MIGRATION;
  const api = factory(compactApi, demandApi, atomicSaveMigration);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_GENERATOR_V2 = api;
})(typeof window !== "undefined" ? window : globalThis, function (compactApi, demandApi, atomicSaveMigration) {
  "use strict";

  const SAVE_KEY = "pet-clinic-generator-v2";
  const SAVE_VERSION = 7;
  const GENERATOR_VERSION = "tier-01-v2.3.0";
  const PREVIOUS_SAVE_VERSION = 6;
  const PREVIOUS_GENERATOR_VERSION = "tier-01-v2.2.0";
  const LEGACY_GENERATOR_VERSION = "tier-01-v2.1.0";
  const CAPABILITY_REGISTRY_ID = "vetgeme-clinic-capabilities";
  const CAPABILITY_REGISTRY_VERSION = "2026.07.14.38";
  const V6_LONGITUDINAL_VISIT_FIELDS = Object.freeze([
    "appointmentId",
    "treatmentCourseId",
    "appointmentReason",
    "attendanceDecision",
    "adherenceState",
    "longitudinalState"
  ]);
  const V6_LONGITUDINAL_FOLLOW_UP_FIELDS = Object.freeze([
    "scheduledTime",
    "appointmentId",
    "treatmentCourseId",
    "attendanceDecision",
    "adherenceState",
    "longitudinalState"
  ]);
  const SUPPORTED_MODES = ["current", "legacy-v1", "tier-01-v2"];
  const DEFAULT_EQUIPMENT = ["otoscope", "microscope"];
  const FIRST_TUTORIAL_CASE_IDS = ["EAR_FUNGAL_OTITIS", "EAR_MITES"];
  const BOOKING_REASONS = {
    ear: "Проблема с ухом",
    skin: "Зуд или изменение кожи",
    gastrointestinal: "Проблема с пищеварением",
    urinary: "Проблема с мочеиспусканием",
    eyes: "Проблема с глазом",
    respiratory: "Кашель или выделения",
    trauma: "Травма или хромота",
    perianal: "Дискомфорт под хвостом"
  };
  const animalNames = {
    dog: ["Бакс", "Рекс", "Лада", "Тайга", "Нора", "Ричи", "Сёма", "Найда"],
    cat: ["Мурка", "Буся", "Тучка", "Ириска", "Рыжик", "Малыш", "Мята", "Клевер"]
  };
  const ownerNames = ["Зайцева", "Орлова", "Иванова", "Петрова", "Лебедев", "Алиева", "Смирнов", "Ким", "Макаров"];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function random() {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createRandom(seed, scope, namespace = GENERATOR_VERSION) {
    return mulberry32(hashString(`${seed}|${namespace}|${scope}`));
  }

  function randomSeed() {
    return `clinic-v2-${hashString(`${Date.now()}-${Math.random()}-${Math.random()}`).toString(16).padStart(8, "0")}`;
  }

  function createMemoryStorage() {
    const values = new Map();
    return {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    };
  }

  function integerBetween(range, random) {
    const min = Number(range.min);
    const max = Number(range.max);
    return min + Math.floor(random() * (max - min + 1));
  }

  function unplannedCountForRule(rule, random) {
    if (rule.unplannedNew.min === rule.unplannedNew.max) return rule.unplannedNew.min;
    if (Number.isFinite(rule.unplannedProbability)) {
      return random() < rule.unplannedProbability ? rule.unplannedNew.max : rule.unplannedNew.min;
    }
    return integerBetween(rule.unplannedNew, random);
  }

  function weightedPick(items, random, weightFor = (item) => item.weight || 1) {
    if (!items.length) return null;
    const total = items.reduce((sum, item) => sum + Math.max(0, weightFor(item)), 0);
    if (total <= 0) return items[Math.floor(random() * items.length)];
    let cursor = random() * total;
    for (const item of items) {
      cursor -= Math.max(0, weightFor(item));
      if (cursor <= 0) return item;
    }
    return items[items.length - 1];
  }

  function minutesFromClock(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function contentPackMetadata(catalog) {
    return {
      contentPackId: catalog.manifest.contentPackId,
      contentPackVersion: catalog.manifest.contentPackVersion,
      contentPackHash: catalog.manifest.contentPackHash
    };
  }

  function contentPackMatches(saved, contentPack) {
    return saved.contentPackId === contentPack.contentPackId
      && saved.contentPackVersion === contentPack.contentPackVersion
      && saved.contentPackHash === contentPack.contentPackHash;
  }

  function freshState(seed, contentPack) {
    return {
      saveVersion: SAVE_VERSION,
      generatorVersion: GENERATOR_VERSION,
      capabilityRegistryId: CAPABILITY_REGISTRY_ID,
      capabilityRegistryVersion: CAPABILITY_REGISTRY_VERSION,
      ...contentPack,
      campaignSeed: seed || randomSeed(),
      generatedDays: {},
      pendingFollowUps: [],
      completedCases: [],
      seenCaseCounts: {},
      demandDirectorVersion: demandApi.DEMAND_DIRECTOR_VERSION,
      demandState: demandApi.initialDemandState(),
      nextVisitId: 1
    };
  }

  function addDemandState(saved, catalog, contentPack) {
    const migrated = clone(saved);
    Object.assign(migrated, contentPack, {
      saveVersion: PREVIOUS_SAVE_VERSION,
      generatorVersion: PREVIOUS_GENERATOR_VERSION,
      demandDirectorVersion: demandApi.DEMAND_DIRECTOR_VERSION,
      demandState: { ...demandApi.initialDemandState(), ...(migrated.demandState || {}) }
    });
    migrated.generatedDays = Object.fromEntries(Object.entries(migrated.generatedDays || {}).map(([key, compactDay]) => {
      const hydrated = compactApi.hydrateDay(compactDay, catalog);
      hydrated.schemaVersion = PREVIOUS_SAVE_VERSION;
      hydrated.visits.forEach((visit) => {
        visit.sourceCategory = demandApi.sourceCategoryForLegacySource(visit.source, visit);
        Object.assign(visit, demandApi.routingForCase(visit.medicalContent, migrated.demandState?.lastDecision?.capabilities || {}));
      });
      return [key, compactApi.compactDay(hydrated, catalog)];
    }));
    migrated.pendingFollowUps = (migrated.pendingFollowUps || []).map((item) => compactPendingFollowUp(item, catalog));
    return migrated;
  }

  function compactPendingFollowUp(followUp, catalog) {
    return {
      id: followUp.id,
      caseId: followUp.caseId,
      originalVisitId: followUp.originalVisitId,
      patient: clone(followUp.patient),
      owner: compactApi.compactOwner(followUp.owner?.profile ? followUp.owner : compactApi.hydrateOwner(followUp.owner, catalog)),
      reason: followUp.reason,
      eligibleDay: followUp.eligibleDay,
      scheduledTime: followUp.scheduledTime || 660,
      appointmentId: followUp.appointmentId || null,
      treatmentCourseId: followUp.treatmentCourseId || null,
      attendanceDecision: followUp.attendanceDecision || "attended",
      adherenceState: followUp.adherenceState || null,
      longitudinalState: clone(followUp.longitudinalState || null)
    };
  }

  function addVersion6PendingFollowUpDefaults(followUp, catalog) {
    const migrated = clone(followUp);
    compactApi.hydrateOwner(followUp.owner, catalog);
    migrated.scheduledTime ??= 660;
    migrated.appointmentId ??= null;
    migrated.treatmentCourseId ??= null;
    migrated.attendanceDecision ??= "attended";
    migrated.adherenceState ??= null;
    migrated.longitudinalState = clone(migrated.longitudinalState || null);
    return migrated;
  }

  function compactState(saved, catalog, contentPack) {
    const migrated = clone(saved);
    Object.assign(migrated, contentPack, {
      saveVersion: PREVIOUS_SAVE_VERSION,
      generatorVersion: PREVIOUS_GENERATOR_VERSION
    });
    migrated.generatedDays = Object.fromEntries(Object.entries(saved.generatedDays || {}).map(([key, day]) => {
      const dayWithMetadata = {
        ...clone(day),
        ...contentPack,
        schemaVersion: PREVIOUS_SAVE_VERSION,
        generatorVersion: PREVIOUS_GENERATOR_VERSION
      };
      const compactDay = compactApi.compactDay(dayWithMetadata, catalog);
      compactApi.hydrateDay(compactDay, catalog);
      return [key, compactDay];
    }));
    migrated.pendingFollowUps = (saved.pendingFollowUps || []).map((item) => compactPendingFollowUp(item, catalog));
    return addDemandState(migrated, catalog, contentPack);
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function assertGeneratorCollections(saved, catalog, label) {
    if (typeof saved.campaignSeed !== "string" || !saved.campaignSeed.trim()) {
      throw new Error(`${label} campaignSeed is missing`);
    }
    if (!isRecord(saved.generatedDays)) throw new Error(`${label} generatedDays must be an object`);
    if (!Array.isArray(saved.pendingFollowUps)) throw new Error(`${label} pendingFollowUps must be an array`);
    if (!Array.isArray(saved.completedCases)) throw new Error(`${label} completedCases must be an array`);
    if (!isRecord(saved.seenCaseCounts)) throw new Error(`${label} seenCaseCounts must be an object`);
    if (!Number.isInteger(saved.nextVisitId) || saved.nextVisitId < 1) {
      throw new Error(`${label} nextVisitId is invalid`);
    }
    if (catalog) {
      Object.entries(saved.generatedDays).forEach(([dayNumber, day]) => {
        if (!/^\d+$/.test(dayNumber) || !isRecord(day)) throw new Error(`${label} generated day ${dayNumber} is invalid`);
        compactApi.hydrateDay(day, catalog);
      });
      saved.pendingFollowUps.forEach((item, index) => {
        if (!isRecord(item)) throw new Error(`${label} pending follow-up ${index} is invalid`);
        compactApi.hydrateOwner(item.owner, catalog);
      });
    }
  }

  function validateVersion5State(saved, catalogOrPack = {}) {
    if (!isRecord(saved)) throw new Error("Generator save is not an object");
    const catalog = catalogOrPack?.manifest ? catalogOrPack : null;
    const contentPack = catalog ? contentPackMetadata(catalog) : catalogOrPack;
    if (saved.saveVersion !== 5 || saved.generatorVersion !== PREVIOUS_GENERATOR_VERSION) {
      throw new Error(`Unsupported generator save version: ${saved.saveVersion ?? "missing"}/${saved.generatorVersion ?? "missing"}`);
    }
    if (!contentPackMatches(saved, contentPack)) throw new Error("Generator save content pack mismatch");
    if (saved.capabilityRegistryId !== undefined || saved.capabilityRegistryVersion !== undefined) {
      throw new Error("Generator save v5 contains future capability registry identity");
    }
    if (saved.demandDirectorVersion !== demandApi.DEMAND_DIRECTOR_VERSION
      || !isRecord(saved.demandState)
      || saved.demandState.demandDirectorVersion !== demandApi.DEMAND_DIRECTOR_VERSION) {
      throw new Error("Generator save v5 demand state is invalid");
    }
    assertGeneratorCollections(saved, catalog, "Generator save v5");
    Object.entries(saved.generatedDays).forEach(([dayNumber, day]) => {
      if (day.schemaVersion !== 5) throw new Error(`Generator save v5 day ${dayNumber} schema is invalid`);
      const carriedFromVersion4 = day.generatorVersion === LEGACY_GENERATOR_VERSION;
      const nativeVersion5 = day.generatorVersion === PREVIOUS_GENERATOR_VERSION;
      if (!carriedFromVersion4 && !nativeVersion5) {
        throw new Error(`Generator save v5 day ${dayNumber} generator version is invalid`);
      }
      if (carriedFromVersion4 && day.demandSnapshot !== undefined) {
        throw new Error(`Generator save v5 day ${dayNumber} carried from version 4 has an unexpected demand snapshot`);
      }
      if (nativeVersion5 && (
        !isRecord(day.demandSnapshot)
        || day.demandSnapshot.demandDirectorVersion !== demandApi.DEMAND_DIRECTOR_VERSION
        || day.demandSnapshot.day !== day.day
        || !isRecord(day.demandSnapshot.capabilities)
      )) {
        throw new Error(`Generator save v5 day ${dayNumber} demand snapshot is invalid`);
      }
      (day.visits || []).forEach((visit) => {
        if (!demandApi.SOURCE_CATEGORIES.includes(visit.sourceCategory)) {
          throw new Error(`Generator save v5 visit ${visit.visitId || "unknown"} source category is invalid`);
        }
        if (!Array.isArray(visit.missingEquipment)
          || typeof visit.requiresReferral !== "boolean"
          || typeof visit.safeReferralAvailable !== "boolean") {
          throw new Error(`Generator save v5 visit ${visit.visitId || "unknown"} routing is invalid`);
        }
        const futureField = V6_LONGITUDINAL_VISIT_FIELDS.find((field) => (
          Object.prototype.hasOwnProperty.call(visit, field)
        ));
        if (futureField) {
          throw new Error(`Generator save v5 visit ${visit.visitId || "unknown"} contains future field ${futureField}`);
        }
      });
    });
    saved.pendingFollowUps.forEach((item, index) => {
      const canonicalOwner = compactApi.compactOwner(item.owner);
      const sourceOwnerKeys = Object.keys(item.owner || {}).sort();
      const canonicalOwnerKeys = Object.keys(canonicalOwner).sort();
      if (JSON.stringify(sourceOwnerKeys) !== JSON.stringify(canonicalOwnerKeys)
        || sourceOwnerKeys.some((key) => JSON.stringify(item.owner[key]) !== JSON.stringify(canonicalOwner[key]))) {
        throw new Error(`Generator save v5 pending follow-up ${index} owner is not compact`);
      }
      const futureField = V6_LONGITUDINAL_FOLLOW_UP_FIELDS.find((field) => (
        Object.prototype.hasOwnProperty.call(item, field)
      ));
      if (futureField) throw new Error(`Generator save v5 pending follow-up ${index} contains future field ${futureField}`);
    });
    return saved;
  }

  function validatePersistedState(saved, catalogOrPack = {}) {
    if (!isRecord(saved)) throw new Error("Generator save is not an object");
    const catalog = catalogOrPack?.manifest ? catalogOrPack : null;
    const contentPack = catalog ? contentPackMetadata(catalog) : catalogOrPack;
    if (saved.saveVersion !== SAVE_VERSION || saved.generatorVersion !== GENERATOR_VERSION) {
      throw new Error(`Unsupported generator save version: ${saved.saveVersion ?? "missing"}/${saved.generatorVersion ?? "missing"}`);
    }
    if (!contentPackMatches(saved, contentPack)) throw new Error("Generator save content pack mismatch");
    if (saved.capabilityRegistryId !== CAPABILITY_REGISTRY_ID
      || saved.capabilityRegistryVersion !== CAPABILITY_REGISTRY_VERSION) {
      throw new Error(`Generator save capability registry mismatch: ${saved.capabilityRegistryId || "missing"}/${saved.capabilityRegistryVersion || "missing"}`);
    }
    assertGeneratorCollections(saved, catalog, "Generator save");
    return saved;
  }

  function validateVersion6State(saved, catalogOrPack = {}) {
    if (!isRecord(saved)) throw new Error("Generator save is not an object");
    const catalog = catalogOrPack?.manifest ? catalogOrPack : null;
    const contentPack = catalog ? contentPackMetadata(catalog) : catalogOrPack;
    if (saved.saveVersion !== PREVIOUS_SAVE_VERSION || saved.generatorVersion !== PREVIOUS_GENERATOR_VERSION) {
      throw new Error(`Unsupported generator save version: ${saved.saveVersion ?? "missing"}/${saved.generatorVersion ?? "missing"}`);
    }
    if (!contentPackMatches(saved, contentPack)) throw new Error("Generator save content pack mismatch");
    assertGeneratorCollections(saved, catalog, "Generator save v6");
    return saved;
  }

  function migrateVersion5State(saved, catalog) {
    if (!catalog?.manifest) throw new Error("Tier 01 v2 catalog is required to migrate generator save version 5");
    validateVersion5State(saved, catalog);
    const migrated = clone(saved);
    migrated.saveVersion = PREVIOUS_SAVE_VERSION;
    migrated.generatorVersion = PREVIOUS_GENERATOR_VERSION;
    migrated.generatedDays = Object.fromEntries(Object.entries(saved.generatedDays).map(([key, day]) => {
      const migratedDay = clone(day);
      migratedDay.schemaVersion = PREVIOUS_SAVE_VERSION;
      const sourceFields = Object.keys(day).filter((field) => field !== "schemaVersion").sort();
      const migratedFields = Object.keys(migratedDay).filter((field) => field !== "schemaVersion").sort();
      if (JSON.stringify(migratedFields) !== JSON.stringify(sourceFields)) {
        throw new Error(`Generator v5 migration changed persisted day ${key} fields`);
      }
      sourceFields.forEach((field) => {
        if (JSON.stringify(migratedDay[field]) !== JSON.stringify(day[field])) {
          throw new Error(`Generator v5 migration changed persisted day ${key}.${field}`);
        }
      });
      compactApi.hydrateDay(migratedDay, catalog);
      return [key, migratedDay];
    }));
    migrated.pendingFollowUps = saved.pendingFollowUps.map((item) => (
      addVersion6PendingFollowUpDefaults(item, catalog)
    ));
    Object.keys(saved).forEach((key) => {
      if (["saveVersion", "generatorVersion", "generatedDays", "pendingFollowUps"].includes(key)) return;
      if (JSON.stringify(migrated[key]) !== JSON.stringify(saved[key])) {
        throw new Error(`Generator v5 migration changed persisted ${key}`);
      }
    });
    validateVersion6State(migrated, catalog);
    return migrated;
  }

  function migrateVersion6State(saved, catalogOrPack = {}) {
    validateVersion6State(saved, catalogOrPack);
    const migrated = clone(saved);
    migrated.saveVersion = SAVE_VERSION;
    migrated.generatorVersion = GENERATOR_VERSION;
    migrated.capabilityRegistryId = CAPABILITY_REGISTRY_ID;
    migrated.capabilityRegistryVersion = CAPABILITY_REGISTRY_VERSION;
    Object.keys(saved).forEach((key) => {
      if (["saveVersion", "generatorVersion", "capabilityRegistryId", "capabilityRegistryVersion"].includes(key)) return;
      if (JSON.stringify(migrated[key]) !== JSON.stringify(saved[key])) {
        throw new Error(`Generator v6 migration changed persisted ${key}`);
      }
    });
    if (JSON.stringify(migrated.generatedDays) !== JSON.stringify(saved.generatedDays)) {
      throw new Error("Generator v6 migration changed generatedDays");
    }
    validatePersistedState(migrated, catalogOrPack);
    return migrated;
  }

  function migrateState(saved, seed, catalogOrPack = {}) {
    const catalog = catalogOrPack?.manifest ? catalogOrPack : null;
    const contentPack = catalog ? contentPackMetadata(catalog) : catalogOrPack;
    if (!saved) return freshState(seed, contentPack);
    if (saved.saveVersion === SAVE_VERSION && saved.generatorVersion === GENERATOR_VERSION && contentPackMatches(saved, contentPack)) {
      return validatePersistedState(saved, catalogOrPack);
    }
    if (saved.saveVersion === PREVIOUS_SAVE_VERSION
      && saved.generatorVersion === PREVIOUS_GENERATOR_VERSION
      && contentPackMatches(saved, contentPack)) {
      return migrateVersion6State(saved, catalogOrPack);
    }
    if (saved.saveVersion === 5
      && saved.generatorVersion === PREVIOUS_GENERATOR_VERSION
      && contentPackMatches(saved, contentPack)) {
      if (!catalog) throw new Error("Tier 01 v2 catalog is required to migrate generator save version 5");
      return migrateVersion6State(migrateVersion5State(saved, catalog), catalog);
    }
    if (saved.saveVersion === 4
      && [LEGACY_GENERATOR_VERSION, PREVIOUS_GENERATOR_VERSION].includes(saved.generatorVersion)
      && contentPackMatches(saved, contentPack)) {
      if (!catalog) throw new Error("Tier 01 v2 catalog is required to migrate generator save version 4");
      return migrateVersion6State(addDemandState(saved, catalog, contentPack), catalog);
    }
    if (saved.saveVersion === 3
      && [LEGACY_GENERATOR_VERSION, PREVIOUS_GENERATOR_VERSION].includes(saved.generatorVersion)
      && contentPackMatches(saved, contentPack)) {
      if (!catalog) throw new Error("Tier 01 v2 catalog is required to migrate generator save version 3");
      return migrateVersion6State(compactState(saved, catalog, contentPack), catalog);
    }
    if (saved.saveVersion === 2 && saved.generatorVersion === "tier-01-v2.0.0") {
      const migrated = clone(saved);
      Object.assign(migrated, contentPack, { saveVersion: 3, generatorVersion: LEGACY_GENERATOR_VERSION });
      Object.values(migrated.generatedDays || {}).forEach((day) => {
        Object.assign(day, contentPack, { schemaVersion: 3, generatorVersion: LEGACY_GENERATOR_VERSION });
        if (day.visits?.some((visit) => !visit.medicalContent)) {
          const hydrated = compactApi.hydrateDay(day, catalog);
          Object.keys(day).forEach((key) => { delete day[key]; });
          Object.assign(day, hydrated);
        }
        const occupied = new Set();
        (day.visits || []).forEach((visit) => {
          visit.bookingReason ||= BOOKING_REASONS[visit.family] || "Причина обращения";
          visit.caseIds ||= [visit.caseId];
          visit.bundleId ??= null;
          visit.diagnosisMode ||= "single";
          visit.maximumDiagnosisSelections ||= 1;
          visit.trueDiagnosisIds ||= [visit.caseId];
          visit.diagnosisRoles ||= [{ caseId: visit.caseId, role: "primary", coverageWeight: 1 }];
          visit.selectedDiagnosisIds ||= [];
          visit.diagnosticCoverage ??= 0;
          visit.treatmentCoverage ??= 0;
          if (visit.source !== "unplanned" && Number.isFinite(visit.arrivalMinute)) {
            let rounded = Math.round(visit.arrivalMinute / 5) * 5;
            while (occupied.has(rounded)) rounded += 5;
            visit.arrivalMinute = rounded;
            occupied.add(rounded);
          }
        });
        day.fullFingerprint = fullFingerprint(day, contentPack);
        day.structuralFingerprint = structuralFingerprint(day, contentPack);
        day.fingerprint = day.fullFingerprint;
      });
      if (!catalog) throw new Error("Tier 01 v2 catalog is required to migrate generator save version 2");
      return migrateVersion6State(compactState(migrated, catalog, contentPack), catalog);
    }
    return {
      ...saved,
      migrationRequired: true,
      expectedSaveVersion: SAVE_VERSION,
      expectedGeneratorVersion: GENERATOR_VERSION
    };
  }

  function migrationRequiredError(saved, contentPack) {
    return new Error(`Generator save migration required: ${saved?.saveVersion || "unknown"}/${saved?.generatorVersion || "unknown"}/${saved?.contentPackVersion || "unknown"} -> ${SAVE_VERSION}/${GENERATOR_VERSION}/${contentPack.contentPackVersion}`);
  }

  function validateMigrationSource(saved, catalog) {
    if (!isRecord(saved)) throw new Error("Generator save is not an object");
    if (saved.saveVersion === PREVIOUS_SAVE_VERSION) return validateVersion6State(saved, catalog);
    if (saved.saveVersion === 5) return validateVersion5State(saved, catalog);
    const contentPack = contentPackMetadata(catalog);
    const compatibleLegacy = (
      [3, 4].includes(saved.saveVersion)
      && [LEGACY_GENERATOR_VERSION, PREVIOUS_GENERATOR_VERSION].includes(saved.generatorVersion)
      && contentPackMatches(saved, contentPack)
    ) || (saved.saveVersion === 2 && saved.generatorVersion === "tier-01-v2.0.0");
    if (!compatibleLegacy) throw migrationRequiredError(saved, contentPack);
    if (!isRecord(saved.generatedDays)) throw new Error("Generator migration source generatedDays must be an object");
    if (!Array.isArray(saved.pendingFollowUps || [])) throw new Error("Generator migration source pendingFollowUps must be an array");
    return saved;
  }

  function migrationBackupKeyForVersion(sourceVersion) {
    return atomicSaveMigration.migrationBackupKey(SAVE_KEY, sourceVersion);
  }

  function loadState(storage, seed, catalog) {
    const raw = storage.getItem(SAVE_KEY);
    if (raw === null) return { state: migrateState(null, seed, catalog), isFresh: true };
    let saved;
    try {
      saved = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Generator save JSON is invalid: ${error.message}`);
    }
    if (saved.saveVersion === SAVE_VERSION) {
      return { state: validatePersistedState(saved, catalog), isFresh: false };
    }
    validateMigrationSource(saved, catalog);
    const migrated = atomicSaveMigration.migrate({
      storage,
      primaryKey: SAVE_KEY,
      backupKey: migrationBackupKeyForVersion(saved.saveVersion),
      sourceRaw: raw,
      label: "Generator save migration",
      validateSource: (source) => validateMigrationSource(source, catalog),
      buildCandidate: (source) => {
        const candidate = migrateState(source, seed, catalog);
        if (candidate.migrationRequired) throw migrationRequiredError(source, contentPackMetadata(catalog));
        return candidate;
      },
      validateCandidate: (candidate) => validatePersistedState(candidate, catalog)
    });
    return { state: migrated.value, isFresh: false };
  }

  function restoreMigrationBackup(storage, sourceVersion, catalog) {
    return atomicSaveMigration.restore({
      storage,
      primaryKey: SAVE_KEY,
      backupKey: migrationBackupKeyForVersion(sourceVersion),
      label: "Generator save migration rollback",
      validateBackup: (backup) => {
        if (backup.saveVersion !== sourceVersion) {
          throw new Error(`Generator migration backup version mismatch: expected ${sourceVersion}, got ${backup.saveVersion ?? "missing"}`);
        }
        validateMigrationSource(backup, catalog);
      }
    });
  }

  function persist(storage, state) {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function caseSupportsOwner(caseData, profileId) {
    return !caseData.compatibleOwnerProfiles?.length || caseData.compatibleOwnerProfiles.includes(profileId);
  }

  function compatibleHomeActions(caseData, catalog, tutorialActive) {
    const allowedIds = new Set(caseData.historyQuestions
      .filter((question) => question.allowsHiddenHomeTreatment)
      .flatMap((question) => question.homeActionIds || []));
    return (catalog.owners["home-treatment-actions"]?.actions || []).filter((action) => (
      allowedIds.has(action.id)
      && action.compatibleFamilies.includes(caseData.family)
      && !action.incompatibleFamilies.includes(caseData.family)
      && !(tutorialActive && action.forbiddenInFirstTutorial)
    ));
  }

  function buildOwner(caseData, dayNumber, catalog, random, tutorialActive) {
    const profiles = (catalog.owners["base-profiles"]?.profiles || []).filter((profile) => (
      profile.unlockDay <= dayNumber && caseSupportsOwner(caseData, profile.id)
    ));
    const profile = weightedPick(profiles, random);
    if (!profile) throw new Error(`No compatible owner profile for ${caseData.id} on day ${dayNumber}`);
    const compatibleModifierIds = new Set(caseData.compatibleOwnerModifiers || []);
    const modifiers = (catalog.owners.modifiers?.modifiers || []).filter((modifier) => (
      modifier.unlockDay <= dayNumber
      && (compatibleModifierIds.size === 0 || compatibleModifierIds.has(modifier.id))
    ));
    let modifier = random() < 0.42 ? weightedPick(modifiers, random) : null;
    let homeAction = null;
    const homeActions = compatibleHomeActions(caseData, catalog, tutorialActive);
    if (homeActions.length && (modifier?.id === "hidden_home_treatment" || (dayNumber >= 5 && random() < 0.38))) {
      homeAction = weightedPick(homeActions, random, (action) => ({ common: 5, uncommon: 2, rare: 1 }[action.rarity] || 1));
      if (!modifier) modifier = modifiers.find((item) => item.id === "hidden_home_treatment") || null;
    }
    return {
      name: weightedPick(ownerNames, random, () => 1),
      profileId: profile.id,
      profile: clone(profile),
      modifierId: modifier?.id || null,
      modifier: modifier ? clone(modifier) : null,
      homeActionId: homeAction?.id || null,
      homeAction: homeAction ? clone(homeAction) : null
    };
  }

  function caseIsUrgent(caseData) {
    return caseData.severity === "urgent" || caseData.severity === "emergency";
  }

  function selectNewCases(catalog, dayRule, count, random, options = {}) {
    const allowedSpecies = new Set(catalog.manifest.contentPolicy.allowedSpeciesTier01);
    const urgentPool = new Set(dayRule.urgentPool || []);
    const eligible = catalog.cases.filter((caseData) => (
      caseData.unlockDay <= dayRule.day
      && caseData.species.every((species) => allowedSpecies.has(species))
      && (!options.routineOnly || !caseIsUrgent(caseData))
      && (!options.capabilities || demandApi.routingForCase(caseData, options.capabilities).arrivalAllowedWithoutEquipment)
    ));
    const selected = [];
    const familyTargets = [...new Set(eligible.map((item) => item.family))];
    while (selected.length < Math.min(dayRule.minimumFamilies || 1, count) && familyTargets.length) {
      const familyIndex = Math.floor(random() * familyTargets.length);
      const family = familyTargets.splice(familyIndex, 1)[0];
      const choices = eligible.filter((item) => item.family === family && !selected.includes(item));
      const choice = weightedPick(choices, random, (item) => 1 / (1 + (options.seenCaseCounts?.[item.id] || 0)));
      if (choice) selected.push(choice);
    }
    while (selected.length < count) {
      const choices = eligible.filter((item) => !selected.includes(item) || eligible.length < count);
      const choice = weightedPick(choices, random, (item) => {
        const urgentBoost = urgentPool.has(item.id) ? 1.5 : 1;
        return urgentBoost / (1 + (options.seenCaseCounts?.[item.id] || 0));
      });
      if (!choice) throw new Error(`Not enough compatible cases for day ${dayRule.day}`);
      selected.push(choice);
    }
    return selected;
  }

  function ensureUrgentCount(caseList, catalog, dayRule, desiredCount, random, seenCaseCounts) {
    const result = caseList.slice();
    const allowed = new Set(dayRule.urgentPool || []);
    const candidates = catalog.cases.filter((item) => (
      item.unlockDay <= dayRule.day
      && caseIsUrgent(item)
      && (!allowed.size || allowed.has(item.id))
    ));
    let urgentCount = result.filter(caseIsUrgent).length;
    while (urgentCount < desiredCount && candidates.length) {
      const replacement = weightedPick(candidates, random, (item) => 1 / (1 + (seenCaseCounts[item.id] || 0)));
      candidates.splice(candidates.indexOf(replacement), 1);
      let replaceIndex = -1;
      for (let index = result.length - 1; index >= 0; index -= 1) {
        if (!caseIsUrgent(result[index])) {
          replaceIndex = index;
          break;
        }
      }
      if (replaceIndex < 0) break;
      result[replaceIndex] = replacement;
      urgentCount += 1;
    }
    return result;
  }

  function caseMatchesEquipmentAttraction(caseData, capabilities) {
    const registry = demandApi.capabilityRegistry(capabilities);
    const operational = Object.values(registry).filter(demandApi.operationalCapability);
    const equipment = new Set([
      ...(caseData.requiredEquipment || []),
      ...(caseData.preferredEquipment || []),
      ...(caseData.equipmentAttractionTags || [])
    ]);
    return operational.some((capability) => (
      equipment.has(capability.id)
      || capability.relevantCaseTags.some((tag) => equipment.has(tag))
    ));
  }

  function ensureEquipmentReferralSelection(caseList, catalog, dayRule, count, random, capabilities, seenCaseCounts) {
    if (count <= 0) return caseList;
    let relevantCount = caseList.filter((item) => caseMatchesEquipmentAttraction(item, capabilities)).length;
    if (relevantCount >= count) return caseList;
    const allowedSpecies = new Set(catalog.manifest.contentPolicy.allowedSpeciesTier01);
    const candidates = catalog.cases.filter((caseData) => (
      caseData.unlockDay <= dayRule.day
      && !caseIsUrgent(caseData)
      && caseData.species.every((species) => allowedSpecies.has(species))
      && demandApi.routingForCase(caseData, capabilities).arrivalAllowedWithoutEquipment
      && caseMatchesEquipmentAttraction(caseData, capabilities)
      && !caseList.includes(caseData)
    ));
    const result = caseList.slice();
    while (relevantCount < count && candidates.length) {
      const replacement = weightedPick(candidates, random, (item) => 1 / (1 + (seenCaseCounts[item.id] || 0)));
      candidates.splice(candidates.indexOf(replacement), 1);
      let replaceIndex = result.length - 1;
      const minimumReplaceIndex = dayRule.day === 1 ? 1 : 0;
      while (replaceIndex >= minimumReplaceIndex && (caseIsUrgent(result[replaceIndex]) || caseMatchesEquipmentAttraction(result[replaceIndex], capabilities))) {
        replaceIndex -= 1;
      }
      if (replaceIndex < minimumReplaceIndex || caseIsUrgent(result[replaceIndex])) break;
      result[replaceIndex] = replacement;
      relevantCount += 1;
    }
    return result;
  }

  function makeIdentity(caseData, random) {
    const species = weightedPick(caseData.species, random, () => 1);
    return {
      species,
      animal: weightedPick(animalNames[species], random, () => 1),
      sex: weightedPick(caseData.allowedSex, random, () => 1),
      ageYears: species === "cat" ? integerBetween({ min: 1, max: 12 }, random) : integerBetween({ min: 1, max: 11 }, random)
    };
  }

  function createVisit(caseData, dayNumber, source, catalog, random, state, options = {}) {
    const tutorialActive = dayNumber === 1 && options.tutorialActive;
    const identity = options.identity ? clone(options.identity) : makeIdentity(caseData, random);
    const owner = options.owner ? clone(options.owner) : buildOwner(caseData, dayNumber, catalog, random, tutorialActive);
    const complaint = options.followUpLine || weightedPick(caseData.initialComplaintVariants, random, () => 1);
    const routing = demandApi.routingForCase(caseData, options.equipmentCapabilities || {});
    const visit = {
      visitId: `V2-${String(state.nextVisitId++).padStart(5, "0")}`,
      day: dayNumber,
      source,
      sourceCategory: options.sourceCategory || demandApi.sourceCategoryForLegacySource(source, { urgency: caseData.severity }),
      caseId: caseData.id,
      caseIds: [caseData.id],
      bundleId: null,
      diagnosisMode: "single",
      maximumDiagnosisSelections: 1,
      trueDiagnosisIds: [caseData.id],
      diagnosisRoles: [{ caseId: caseData.id, role: "primary", coverageWeight: 1 }],
      selectedDiagnosisIds: [],
      diagnosticCoverage: 0,
      treatmentCoverage: 0,
      family: caseData.family,
      severity: caseData.severity,
      urgency: caseIsUrgent(caseData) ? "urgent" : caseData.severity,
      patient: identity,
      owner,
      complaint: clone(complaint),
      bookingReason: BOOKING_REASONS[caseData.family] || caseData.family,
      returnVisit: source === "follow_up",
      originalVisitId: options.originalVisitId || null,
      followUpReason: options.followUpReason || null,
      appointmentId: options.appointmentId || null,
      treatmentCourseId: options.treatmentCourseId || null,
      appointmentReason: options.appointmentReason || options.followUpReason || null,
      attendanceDecision: options.attendanceDecision || null,
      adherenceState: options.adherenceState || null,
      longitudinalState: clone(options.longitudinalState || null),
      scheduledTime: options.scheduledTime || null,
      ...routing,
      medicalContent: clone(caseData)
    };
    visit.historyAnswerSelections = compactApi.deriveHistoryAnswerSelections(caseData, owner);
    return visit;
  }

  function assignArrivals(visits, dayRule, random, includeUnplanned) {
    const start = minutesFromClock(dayRule.start);
    const end = minutesFromClock(dayRule.end);
    const visible = visits.filter((visit) => includeUnplanned || visit.source !== "unplanned");
    const occupiedBookedMinutes = new Set();
    visible.forEach((visit, index) => {
      const segment = Math.max(25, Math.floor((end - start - 45) / Math.max(1, visible.length)));
      const rawMinute = visit.scheduledTime
        ? Math.min(end - 30, Math.max(start, visit.scheduledTime + (visit.attendanceDecision === "late" ? 25 : 0)))
        : Math.min(end - 30, start + 15 + index * segment + Math.floor(random() * Math.min(16, segment)));
      if (visit.source === "unplanned") {
        visit.arrivalMinute = rawMinute;
        return;
      }
      let roundedMinute = Math.round(rawMinute / 5) * 5;
      while (occupiedBookedMinutes.has(roundedMinute) && roundedMinute < end - 30) roundedMinute += 5;
      visit.arrivalMinute = roundedMinute;
      occupiedBookedMinutes.add(roundedMinute);
    });
    return visits.sort((left, right) => (left.arrivalMinute || Infinity) - (right.arrivalMinute || Infinity));
  }

  function fullFingerprint(day, contentPack = {}) {
    const structure = {
      contentPack,
      day: day.day,
      opened: day.opened,
      visits: day.visits.map((visit) => [
        visit.visitId,
        visit.caseId,
        visit.source,
        visit.sourceCategory || null,
        visit.patient.species,
        visit.patient.animal,
        visit.owner.profileId,
        visit.owner.modifierId,
        visit.owner.homeActionId,
        visit.arrivalMinute || null
      ]),
      pendingUnplanned: day.pendingUnplanned
    };
    return hashString(JSON.stringify(structure)).toString(16).padStart(8, "0");
  }

  function structuralFingerprint(day, contentPack = {}) {
    const structure = {
      contentPack,
      day: day.day,
      visits: day.visits.map((visit) => ({
        caseId: visit.caseId,
        family: visit.family,
        source: visit.source,
        sourceCategory: visit.sourceCategory || null,
        urgency: visit.urgency,
        ownerProfileId: visit.owner.profileId,
        ownerModifierId: visit.owner.modifierId,
        homeActionId: visit.owner.homeActionId,
        complaintVariantId: visit.complaint.id,
        followUpReason: visit.followUpReason || null
      })),
      pendingUnplanned: day.pendingUnplanned
    };
    return hashString(JSON.stringify(structure)).toString(16).padStart(8, "0");
  }

  function fingerprint(day, contentPack = {}) {
    return fullFingerprint(day, contentPack);
  }

  function validateGeneratedDay(day, catalog, equipment) {
    const errors = [];
    const rule = demandApi.progressionRule(day.day, catalog.dayPlan.days.find((item) => item.day === day.day) || null);
    if (!rule) return [`Unknown day ${day.day}`];
    if (day.visits.length + day.pendingUnplanned !== day.plannedVisitCount) errors.push("visit total does not match the persisted plan");
    if (day.plannedVisitCount < rule.visitsTotal.min || day.plannedVisitCount > rule.visitsTotal.max) errors.push("visit total outside day rules");
    if (!contentPackMatches(day, contentPackMetadata(catalog))) errors.push("generated day content pack metadata mismatch");
    const allowedSpecies = new Set(catalog.manifest.contentPolicy.allowedSpeciesTier01);
    const urgentCount = day.visits.filter((visit) => caseIsUrgent(visit.medicalContent)).length;
    if (day.opened && (urgentCount < rule.urgentSubset.min || urgentCount > rule.urgentSubset.max)) errors.push("urgent count outside day rules");
    day.visits.forEach((visit) => {
      if (!catalog.casesById[visit.caseId]) errors.push(`unknown case ${visit.caseId}`);
      if (visit.diagnosisMode !== "single" || visit.maximumDiagnosisSelections !== 1) errors.push(`single visit schema mismatch for ${visit.caseId}`);
      if (visit.caseIds.length !== 1 || visit.trueDiagnosisIds.length !== 1 || visit.caseIds[0] !== visit.caseId) errors.push(`single visit diagnosis ids mismatch for ${visit.caseId}`);
      if (!allowedSpecies.has(visit.patient.species)) errors.push(`unsupported species ${visit.patient.species}`);
      if (!caseSupportsOwner(visit.medicalContent, visit.owner.profileId)) errors.push(`owner ${visit.owner.profileId} incompatible with ${visit.caseId}`);
      if (visit.owner.homeAction && !visit.owner.homeAction.compatibleFamilies.includes(visit.family)) errors.push(`home action incompatible with ${visit.caseId}`);
      if (!demandApi.SOURCE_CATEGORIES.includes(visit.sourceCategory)) errors.push(`unknown source category ${visit.sourceCategory || "missing"}`);
      if (visit.missingEquipment.length && !visit.safeReferralAvailable) errors.push(`missing safe referral for ${visit.caseId}`);
      if (!visit.arrivalAllowedWithoutEquipment) errors.push(`case cannot arrive safely without equipment ${visit.caseId}`);
    });
    return errors;
  }

  function createGenerator(options = {}) {
    if (!options.catalog || options.catalog.schemaVersion !== 2) throw new Error("Tier 01 v2 catalog is required");
    const catalog = options.catalog;
    const contentPack = contentPackMetadata(catalog);
    const seedNamespace = `${GENERATOR_VERSION}|${contentPack.contentPackId}|${contentPack.contentPackVersion}|${contentPack.contentPackHash}`;
    const storage = options.storage || (typeof localStorage !== "undefined" ? localStorage : createMemoryStorage());
    const initialCapabilities = demandApi.capabilityRegistry(options.equipmentCapabilities || Object.fromEntries(
      ["microscope", "xray", "ultrasound"].map((id) => [id, options.availableEquipment
        ? {
            owned: options.availableEquipment.includes(id),
            unlocked: options.availableEquipment.includes(id),
            operational: options.availableEquipment.includes(id),
            capacityPerDay: options.availableEquipment.includes(id) ? (id === "microscope" ? 6 : 4) : 0
          }
        : {}])
    ));
    const loaded = loadState(storage, options.seed, catalog);
    const state = loaded.state;
    if (state.migrationRequired) {
      throw new Error(`Generator save migration required: ${state.saveVersion || "unknown"}/${state.generatorVersion || "unknown"}/${state.contentPackVersion || "unknown"} -> ${SAVE_VERSION}/${GENERATOR_VERSION}/${contentPack.contentPackVersion}`);
    }
    if (loaded.isFresh) persist(storage, state);

    function getDayRule(dayNumber) {
      if (dayNumber < 1 || dayNumber > 30) return null;
      return demandApi.progressionRule(dayNumber, catalog.dayPlan.days.find((item) => item.day === dayNumber) || null);
    }

    function getOrGenerateDay(dayNumber, campaignState = {}) {
      const key = String(dayNumber);
      if (state.generatedDays[key]) return compactApi.hydrateDay(state.generatedDays[key], catalog);
      const rule = getDayRule(dayNumber);
      if (!rule) return null;
      if (dayNumber > 1 && !state.generatedDays[String(dayNumber - 1)]?.closed) {
        throw new Error(`Day ${dayNumber - 1} must be closed before day ${dayNumber} is generated`);
      }
      const random = createRandom(state.campaignSeed, `day:${dayNumber}:plan`, seedNamespace);
      const followUpPriority = { scheduled_procedure: 0, course_visit: 0, planned_recheck: 1, rescheduled_visit: 2 };
      const availableFollowUps = state.pendingFollowUps
        .filter((item) => item.eligibleDay <= dayNumber)
        .sort((left, right) => (followUpPriority[left.reason] ?? 3) - (followUpPriority[right.reason] ?? 3)
          || left.eligibleDay - right.eligibleDay
          || String(left.id).localeCompare(String(right.id)));
      const baseLocalDemand = campaignState.baseLocalDemand
        ?? ((Number(rule.visitsTotal.min) + Number(rule.visitsTotal.max)) / 2);
      const decision = demandApi.directDemand({
        ...campaignState,
        day: dayNumber,
        chapter: demandApi.chapterForDay(dayNumber),
        dayRule: rule,
        baseLocalDemand,
        dueFollowUps: availableFollowUps.length,
        deferredDemand: state.demandState?.deferredDemand || 0,
        previousOutcomes: state.demandState?.outcomes || {},
        equipmentCapabilities: {
          ...initialCapabilities,
          ...(campaignState.equipmentCapabilities || {})
        },
        campaignSeed: state.campaignSeed,
        generatorVersion: GENERATOR_VERSION,
        contentPackVersion: contentPack.contentPackVersion
      });
      const plannedVisitCount = decision.acceptedDemand;
      const pendingUnplanned = decision.sourcePlan.walk_in;
      const followUpRange = {
        min: Math.min(rule.followUpTarget ?? rule.followUps.min, rule.followUpMaximum ?? rule.followUps.max),
        max: rule.followUpMaximum ?? rule.followUps.max
      };
      const followUpCapacity = Math.max(0, plannedVisitCount - pendingUnplanned);
      const requestedFollowUps = Math.min(followUpRange.max, followUpCapacity, Math.max(
        Math.min(followUpRange.max, Math.max(followUpRange.min, decision.sourcePlan.follow_up)),
        Math.min(followUpRange.max, availableFollowUps.length)
      ));
      const selectedFollowUps = [];
      let selectedUrgentFollowUps = 0;
      for (const item of availableFollowUps) {
        if (selectedFollowUps.length >= requestedFollowUps) break;
        const urgent = caseIsUrgent(catalog.casesById[item.caseId]);
        if (urgent && selectedUrgentFollowUps >= rule.urgentSubset.max) continue;
        selectedFollowUps.push(item);
        if (urgent) selectedUrgentFollowUps += 1;
      }
      const followUpCount = selectedFollowUps.length;
      const newCount = plannedVisitCount - pendingUnplanned - followUpCount;
      let selectedCases = selectNewCases(catalog, rule, newCount, random, {
        routineOnly: true,
        seenCaseCounts: state.seenCaseCounts,
        capabilities: decision.capabilities
      });
      const desiredNewUrgent = Math.min(
        decision.sourcePlan.emergency,
        Math.max(0, rule.urgentSubset.max - selectedUrgentFollowUps)
      );
      selectedCases = ensureUrgentCount(selectedCases, catalog, rule, desiredNewUrgent, random, state.seenCaseCounts);
      if (dayNumber === 1) {
        const tutorialIds = new Set(FIRST_TUTORIAL_CASE_IDS);
        const tutorialIndex = selectedCases.findIndex((item) => tutorialIds.has(item.id));
        if (tutorialIndex >= 0) {
          [selectedCases[0], selectedCases[tutorialIndex]] = [selectedCases[tutorialIndex], selectedCases[0]];
        } else {
          const tutorialPool = FIRST_TUTORIAL_CASE_IDS.map((id) => catalog.casesById[id]).filter(Boolean);
          const tutorialCase = weightedPick(tutorialPool, random, (item) => 1 / (1 + (state.seenCaseCounts[item.id] || 0)));
          const earIndex = selectedCases.findIndex((item) => item.family === "ear");
          selectedCases[earIndex >= 0 ? earIndex : 0] = tutorialCase;
          const insertedIndex = selectedCases.indexOf(tutorialCase);
          [selectedCases[0], selectedCases[insertedIndex]] = [selectedCases[insertedIndex], selectedCases[0]];
        }
      }
      selectedCases = ensureEquipmentReferralSelection(
        selectedCases,
        catalog,
        rule,
        decision.sourcePlan.clinic_referral,
        random,
        decision.capabilities,
        state.seenCaseCounts
      );
      const categoryPool = [];
      ["campaign_teaching", "campaign_story", "clinic_referral", "word_of_mouth", "local_regular"].forEach((sourceCategory) => {
        for (let count = 0; count < (decision.sourcePlan[sourceCategory] || 0); count += 1) categoryPool.push(sourceCategory);
      });
      function consumeCategory(category) {
        const index = categoryPool.indexOf(category);
        if (index >= 0) categoryPool.splice(index, 1);
        return category;
      }
      const visits = selectedCases.map((caseData, index) => {
        let sourceCategory;
        if (dayNumber === 1 && index === 0) sourceCategory = consumeCategory("campaign_teaching");
        else if (caseIsUrgent(caseData)) sourceCategory = "emergency";
        else if (caseMatchesEquipmentAttraction(caseData, decision.capabilities) && categoryPool.includes("clinic_referral")) {
          sourceCategory = consumeCategory("clinic_referral");
        } else {
          const nextIndex = categoryPool.findIndex((category) => category !== "clinic_referral");
          sourceCategory = nextIndex >= 0 ? categoryPool.splice(nextIndex, 1)[0] : "local_regular";
        }
        return createVisit(caseData, dayNumber, "booked", catalog, random, state, {
          tutorialActive: dayNumber === 1 && index === 0,
          sourceCategory,
          equipmentCapabilities: decision.capabilities
        });
      });
      const followUpLines = catalog.owners["follow-up-lines"]?.lines || [];
      selectedFollowUps.forEach((followUp) => {
        const line = weightedPick(followUpLines, random, () => 1);
        visits.push(createVisit(catalog.casesById[followUp.caseId], dayNumber, "follow_up", catalog, random, state, {
          identity: followUp.patient,
          owner: compactApi.hydrateOwner(followUp.owner, catalog),
          originalVisitId: followUp.originalVisitId,
          followUpLine: line,
          followUpReason: followUp.reason,
          appointmentId: followUp.appointmentId,
          treatmentCourseId: followUp.treatmentCourseId,
          appointmentReason: followUp.reason,
          attendanceDecision: followUp.attendanceDecision,
          adherenceState: followUp.adherenceState,
          longitudinalState: followUp.longitudinalState,
          scheduledTime: followUp.scheduledTime,
          sourceCategory: "follow_up",
          equipmentCapabilities: decision.capabilities
        }));
      });
      const actualSourcePlan = Object.fromEntries(demandApi.SOURCE_CATEGORIES.map((sourceCategory) => [sourceCategory, 0]));
      visits.forEach((visit) => {
        actualSourcePlan[visit.sourceCategory] += 1;
      });
      actualSourcePlan.walk_in = pendingUnplanned;
      decision.sourcePlan = actualSourcePlan;
      const usedFollowUps = new Set(selectedFollowUps.map((item) => item.id));
      state.pendingFollowUps = state.pendingFollowUps.filter((item) => !usedFollowUps.has(item.id));
      assignArrivals(visits, rule, random, false);
      const day = {
        schemaVersion: SAVE_VERSION,
        generatorVersion: GENERATOR_VERSION,
        ...contentPack,
        campaignSeed: state.campaignSeed,
        day: dayNumber,
        title: rule.title,
        start: rule.start,
        end: rule.end,
        tutorial: rule.tutorial,
        themeTags: clone(rule.themeTags),
        plannedVisitCount,
        followUpTarget: rule.followUpTarget ?? rule.followUps.min,
        followUpMaximum: rule.followUpMaximum ?? rule.followUps.max,
        followUpFallbackCount: Math.max(0, requestedFollowUps - followUpCount),
        pendingUnplanned,
        unplannedRange: clone(rule.unplannedNew),
        demandSnapshot: demandApi.compactDemandDecision(decision),
        opened: false,
        closed: false,
        visits,
        fingerprint: null,
        fullFingerprint: null,
        structuralFingerprint: null
      };
      day.fullFingerprint = fullFingerprint(day, contentPack);
      day.structuralFingerprint = structuralFingerprint(day, contentPack);
      day.fingerprint = day.fullFingerprint;
      const errors = validateGeneratedDay(day, catalog, demandApi.availableEquipment(decision.capabilities));
      if (errors.length) throw new Error(errors.join("; "));
      const compactDay = compactApi.compactDay(day, catalog);
      // The top-level save already owns generator compatibility and the seed.
      // Repeating both on every newly generated day costs several KiB by day 30.
      delete compactDay.generatorVersion;
      delete compactDay.campaignSeed;
      if (compactDay.tutorial === null) delete compactDay.tutorial;
      state.generatedDays[key] = compactDay;
      selectedCases.forEach((caseData) => {
        state.seenCaseCounts[caseData.id] = (state.seenCaseCounts[caseData.id] || 0) + 1;
      });
      state.demandState = demandApi.applyDemandDecision(state.demandState, decision);
      persist(storage, state);
      return compactApi.hydrateDay(state.generatedDays[key], catalog);
    }

    function openDay(dayNumber, campaignState = {}) {
      const day = getOrGenerateDay(dayNumber, campaignState);
      if (day.opened) return day;
      const storedDay = compactApi.hydrateDay(state.generatedDays[String(dayNumber)], catalog);
      const rule = getDayRule(dayNumber);
      const random = createRandom(state.campaignSeed, `day:${dayNumber}:unplanned`, seedNamespace);
      const capabilities = storedDay.demandSnapshot?.capabilities || initialCapabilities;
      const selected = selectNewCases(catalog, rule, storedDay.pendingUnplanned, random, {
        routineOnly: true,
        seenCaseCounts: state.seenCaseCounts,
        capabilities
      });
      selected.forEach((caseData) => {
        storedDay.visits.push(createVisit(caseData, dayNumber, "unplanned", catalog, random, state, {
          sourceCategory: "walk_in",
          equipmentCapabilities: capabilities
        }));
        state.seenCaseCounts[caseData.id] = (state.seenCaseCounts[caseData.id] || 0) + 1;
      });
      storedDay.pendingUnplanned = 0;
      storedDay.opened = true;
      assignArrivals(storedDay.visits, rule, random, true);
      storedDay.fullFingerprint = fullFingerprint(storedDay, contentPack);
      storedDay.structuralFingerprint = structuralFingerprint(storedDay, contentPack);
      storedDay.fingerprint = storedDay.fullFingerprint;
      const errors = validateGeneratedDay(storedDay, catalog, demandApi.availableEquipment(capabilities));
      if (errors.length) throw new Error(errors.join("; "));
      state.generatedDays[String(dayNumber)] = compactApi.compactDay(storedDay, catalog);
      persist(storage, state);
      return clone(storedDay);
    }

    function closeDay(dayNumber, outcomes = []) {
      const compactDay = state.generatedDays[String(dayNumber)];
      const day = compactDay ? compactApi.hydrateDay(compactDay, catalog) : null;
      if (!day || !day.opened) throw new Error(`Day ${dayNumber} must be opened before it is closed`);
      if (day.closed) return clone(day);
      outcomes.filter((item) => item.completed).forEach((item) => {
        const visit = day.visits.find((candidate) => candidate.visitId === item.visitId);
        if (!visit) return;
        visit.selectedPlanId = item.selectedPlanId ?? visit.selectedPlanId ?? null;
        visit.outcome = clone(item);
        state.completedCases.push({ day: dayNumber, visitId: visit.visitId, caseId: visit.caseId, outcome: clone(item) });
        const explicitAppointments = (item.appointments || []).filter((appointment) => ["confirmed", "rescheduled"].includes(appointment.status));
        explicitAppointments.forEach((appointment) => {
          state.pendingFollowUps.push({
            id: appointment.appointmentId,
            appointmentId: appointment.appointmentId,
            treatmentCourseId: appointment.treatmentCourseId,
            caseId: visit.caseId,
            originalVisitId: visit.visitId,
            patient: clone(visit.patient),
            owner: compactApi.compactOwner(visit.owner),
            reason: appointment.reason,
            eligibleDay: appointment.scheduledDay,
            scheduledTime: appointment.scheduledTime,
            attendanceDecision: appointment.attendanceDecision,
            adherenceState: appointment.adherenceState,
            longitudinalState: clone(appointment.longitudinalState || null)
          });
        });
        const clinicalFollowUp = !explicitAppointments.length && (item.followUpRequested || item.deteriorated);
        const declinedRoutineFollowUp = item.ownerDeclinedFollowUp && !item.deteriorated;
        const referralWithoutLocalControl = item.referred && !item.localFollowUpRequired && !item.deteriorated;
        if (clinicalFollowUp && !declinedRoutineFollowUp && !referralWithoutLocalControl) {
          state.pendingFollowUps.push({
            id: `FU-${visit.visitId}`,
            caseId: visit.caseId,
            originalVisitId: visit.visitId,
            patient: clone(visit.patient),
            owner: compactApi.compactOwner(visit.owner),
            reason: item.followUpReason || (item.deteriorated ? "deterioration" : "planned_control"),
            eligibleDay: Math.min(30, dayNumber + Math.max(1, Number(item.followUpAfterDays || 1)))
          });
        }
      });
      day.closed = true;
      day.outcomes = clone(outcomes);
      state.demandState = demandApi.applyDayOutcomes(state.demandState, outcomes);
      day.fullFingerprint = fullFingerprint(day, contentPack);
      day.structuralFingerprint = structuralFingerprint(day, contentPack);
      day.fingerprint = day.fullFingerprint;
      state.generatedDays[String(dayNumber)] = compactApi.compactDay(day, catalog);
      persist(storage, state);
      return clone(day);
    }

    function schedulePreview(dayNumber, campaignState = {}) {
      const day = getOrGenerateDay(dayNumber, campaignState);
      return {
        day: day.day,
        booked: day.visits.filter((visit) => visit.source !== "unplanned").map((visit) => ({
          visitId: visit.visitId,
          animal: visit.patient.animal,
          species: visit.patient.species,
          bookingReason: visit.bookingReason,
          arrivalMinute: visit.arrivalMinute
        })),
        unplannedRange: clone(day.unplannedRange),
        demandSnapshot: clone(day.demandSnapshot || null),
        trueDiagnosesHidden: true
      };
    }

    function metadata(dayNumber) {
      const day = state.generatedDays[String(dayNumber)];
      return {
        saveVersion: SAVE_VERSION,
        generatorVersion: GENERATOR_VERSION,
        ...contentPack,
        campaignSeed: state.campaignSeed,
        generatedDays: Object.keys(state.generatedDays).map(Number).sort((a, b) => a - b),
        pendingFollowUps: state.pendingFollowUps.length,
        demandDirectorVersion: state.demandDirectorVersion,
        demandState: clone(state.demandState),
        fingerprint: day?.fingerprint || null,
        fullFingerprint: day?.fullFingerprint || null,
        structuralFingerprint: day?.structuralFingerprint || null
      };
    }

    function updatePendingAppointment(appointmentId, updates = {}) {
      const pending = state.pendingFollowUps.find((item) => item.appointmentId === appointmentId);
      if (!pending) return null;
      if (updates.attendanceDecision) pending.attendanceDecision = updates.attendanceDecision;
      if (updates.scheduledTime) pending.scheduledTime = updates.scheduledTime;
      if (updates.scheduledDay) pending.eligibleDay = updates.scheduledDay;
      if (updates.reason) pending.reason = updates.reason;
      persist(storage, state);
      return clone(pending);
    }

    return { getOrGenerateDay, openDay, closeDay, schedulePreview, metadata, updatePendingAppointment };
  }

  return {
    SAVE_KEY,
    SAVE_VERSION,
    GENERATOR_VERSION,
    PREVIOUS_SAVE_VERSION,
    PREVIOUS_GENERATOR_VERSION,
    LEGACY_GENERATOR_VERSION,
    CAPABILITY_REGISTRY_ID,
    CAPABILITY_REGISTRY_VERSION,
    SUPPORTED_MODES,
    DEFAULT_EQUIPMENT,
    DEMAND_DIRECTOR_VERSION: demandApi.DEMAND_DIRECTOR_VERSION,
    createGenerator,
    createMemoryStorage,
    validateGeneratedDay,
    fingerprint,
    fullFingerprint,
    structuralFingerprint,
    hashString,
    migrateState,
    migrateVersion5State,
    migrateVersion6State,
    validatePersistedState,
    validateVersion5State,
    validateVersion6State,
    migrationBackupKeyForVersion,
    restoreMigrationBackup
  };
});
