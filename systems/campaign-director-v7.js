(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_CAMPAIGN_DIRECTOR_V7 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const CAMPAIGN_DAY_COUNT = 30;
  const CHAPTER_COUNT = 6;
  const DAYS_PER_CHAPTER = 5;
  const CATALOG_KINDS = Object.freeze(["event", "milestone", "specialization", "ending"]);
  const CATALOG_COMMAND_TYPES = new Set([
    "event.record", "milestone.record", "specialization.record", "ending.record"
  ]);
  const STATE_FIELDS = Object.freeze([
    "schemaVersion", "initialized", "campaignId", "initializedAt", "campaignDays",
    "chapterClosures", "endlessDays", "events", "milestones", "specializations",
    "ending", "auditHistory", "appliedCommandIds", "commandFingerprints"
  ]);
  const AUDIT_FIELDS = Object.freeze(["sequence", "commandId", "type", "fingerprint", "command"]);
  const CATALOG_REF_FIELDS = Object.freeze(["catalogKind", "catalogId", "catalogVersion", "digest"]);
  const CATALOG_ENVELOPE_FIELDS = Object.freeze([
    "schemaVersion", "catalogKind", "catalogId", "catalogVersion", "status", "digest", "itemIds"
  ]);
  const FORBIDDEN_FIELDS = Object.freeze([
    "payload", "content", "text", "title", "name", "label", "description", "summary",
    "narrative", "notes", "clinical", "clinicalNarrative", "medical", "medicalNarrative",
    "diagnosis", "diagnoses", "diagnostic", "symptom", "symptoms", "complaint", "anamnesis",
    "examination", "treatment", "medication", "prescription", "dose", "patient", "prognosis"
  ]);
  const forbiddenFields = new Set(FORBIDDEN_FIELDS.map((field) => field.toLowerCase()));

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function own(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
    return value;
  }

  function compareStrings(left, right) {
    return left.localeCompare(right, "en");
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    return `{${Object.keys(value).sort(compareStrings).map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(",")}}`;
  }

  function assertSerializable(value, label, ancestors = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") {
      if (!Number.isFinite(value) || Object.is(value, -0)) {
        throw new TypeError(`${label} must contain only finite JSON numbers and must not contain -0.`);
      }
      return;
    }
    if (typeof value !== "object") throw new TypeError(`${label} must be JSON-serializable.`);
    if (ancestors.has(value)) throw new TypeError(`${label} must not contain cycles.`);
    ancestors.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertSerializable(item, `${label}[${index}]`, ancestors));
    } else {
      Object.keys(value).forEach((key) => assertSerializable(value[key], `${label}.${key}`, ancestors));
    }
    ancestors.delete(value);
  }

  function assertNoForbiddenFields(value, label) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoForbiddenFields(item, `${label}[${index}]`));
      return;
    }
    Object.keys(value).forEach((key) => {
      if (forbiddenFields.has(key.toLowerCase())) {
        throw new Error(`${label} contains forbidden free-text or clinical field ${key}.`);
      }
      assertNoForbiddenFields(value[key], `${label}.${key}`);
    });
  }

  function assertExactKeys(value, allowed, label) {
    if (!isObject(value)) throw new TypeError(`${label} must be an object.`);
    const missing = allowed.filter((key) => !own(value, key));
    const extra = Object.keys(value).filter((key) => !allowed.includes(key));
    if (missing.length) throw new Error(`${label} is missing required fields: ${missing.join(", ")}.`);
    if (extra.length) throw new Error(`${label} contains unsupported fields: ${extra.join(", ")}.`);
  }

  function requireIdentifier(value, label) {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
      throw new TypeError(`${label} must be a non-empty stable identifier.`);
    }
    return value;
  }

  function requireDigest(value, label) {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)) {
      throw new TypeError(`${label} must be an explicit stable digest.`);
    }
    return value;
  }

  function requireTime(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${label} must be a non-negative safe integer campaign time.`);
    }
    return value;
  }

  function requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer.`);
    return value;
  }

  function normalizeIdArray(value, label, options = {}) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an explicit array.`);
    if (options.nonEmpty && value.length === 0) throw new TypeError(`${label} must be non-empty.`);
    const result = value.map((item, index) => requireIdentifier(item, `${label}[${index}]`));
    if (new Set(result).size !== result.length) throw new Error(`${label} contains duplicates.`);
    return result;
  }

  function mapDay(dayNumber) {
    requirePositiveInteger(dayNumber, "dayNumber");
    if (dayNumber <= CAMPAIGN_DAY_COUNT) {
      return deepFreeze({
        mode: "campaign",
        absoluteDayNumber: dayNumber,
        campaignDayNumber: dayNumber,
        chapterNumber: Math.ceil(dayNumber / DAYS_PER_CHAPTER),
        chapterDayNumber: ((dayNumber - 1) % DAYS_PER_CHAPTER) + 1,
        endlessDayNumber: null
      });
    }
    return deepFreeze({
      mode: "endless",
      absoluteDayNumber: dayNumber,
      campaignDayNumber: null,
      chapterNumber: null,
      chapterDayNumber: null,
      endlessDayNumber: dayNumber - CAMPAIGN_DAY_COUNT
    });
  }

  function chapterForCampaignDay(dayNumber) {
    requirePositiveInteger(dayNumber, "campaign dayNumber");
    if (dayNumber > CAMPAIGN_DAY_COUNT) throw new RangeError("campaign dayNumber must be in [1, 30].");
    return Math.ceil(dayNumber / DAYS_PER_CHAPTER);
  }

  function campaignDayRangeForChapter(chapterNumber) {
    requirePositiveInteger(chapterNumber, "chapterNumber");
    if (chapterNumber > CHAPTER_COUNT) throw new RangeError("chapterNumber must be in [1, 6].");
    const startDay = ((chapterNumber - 1) * DAYS_PER_CHAPTER) + 1;
    return deepFreeze({ chapterNumber, startDay, endDay: startDay + DAYS_PER_CHAPTER - 1 });
  }

  function normalizeCatalogRef(value, expectedKind, label) {
    assertExactKeys(value, CATALOG_REF_FIELDS, label);
    const catalogKind = requireIdentifier(value.catalogKind, `${label}.catalogKind`);
    if (catalogKind !== expectedKind) throw new Error(`${label}.catalogKind must be ${expectedKind}.`);
    return {
      catalogKind,
      catalogId: requireIdentifier(value.catalogId, `${label}.catalogId`),
      catalogVersion: requireIdentifier(value.catalogVersion, `${label}.catalogVersion`),
      digest: requireDigest(value.digest, `${label}.digest`)
    };
  }

  function normalizeCatalogEnvelope(value, expectedKind, label = "catalog envelope") {
    assertSerializable(value, label);
    assertNoForbiddenFields(value, label);
    assertExactKeys(value, CATALOG_ENVELOPE_FIELDS, label);
    if (value.schemaVersion !== SCHEMA_VERSION) throw new Error(`${label}.schemaVersion must be ${SCHEMA_VERSION}.`);
    const catalogKind = requireIdentifier(value.catalogKind, `${label}.catalogKind`);
    if (catalogKind !== expectedKind) throw new Error(`${label}.catalogKind must be ${expectedKind}.`);
    if (value.status !== "approved") throw new Error(`${label}.status must be approved.`);
    return {
      schemaVersion: SCHEMA_VERSION,
      catalogKind,
      catalogId: requireIdentifier(value.catalogId, `${label}.catalogId`),
      catalogVersion: requireIdentifier(value.catalogVersion, `${label}.catalogVersion`),
      status: "approved",
      digest: requireDigest(value.digest, `${label}.digest`),
      itemIds: normalizeIdArray(value.itemIds, `${label}.itemIds`, { nonEmpty: true })
    };
  }

  function assertCatalogAuthorization(command, envelope, kind) {
    const approved = normalizeCatalogEnvelope(envelope, kind, `${kind} catalog envelope`);
    const ref = command.catalogRef;
    if (approved.catalogId !== ref.catalogId
      || approved.catalogVersion !== ref.catalogVersion
      || approved.digest !== ref.digest) {
      throw new Error(`${kind} catalog envelope does not match the exact command catalogRef.`);
    }
    if (!approved.itemIds.includes(command.itemId)) {
      throw new Error(`${kind} catalog does not contain itemId ${command.itemId}.`);
    }
  }

  function resolveCatalogAuthorization(catalogResolver, command, kind) {
    if (typeof catalogResolver !== "function") {
      throw new Error(`New ${kind} commands require a configured approved catalog resolver.`);
    }
    const exactRef = deepFreeze(clone(command.catalogRef));
    const envelope = catalogResolver(exactRef);
    assertCatalogAuthorization(command, envelope, kind);
  }

  function prepareCommand(command, fields, label) {
    assertSerializable(command, label);
    assertNoForbiddenFields(command, label);
    assertExactKeys(command, fields, label);
    return requireIdentifier(command.commandId, `${label}.commandId`);
  }

  function normalizeInitialize(command) {
    const label = "initialize campaign command";
    const commandId = prepareCommand(command, ["commandId", "campaignId", "initializedAt"], label);
    return {
      commandId,
      campaignId: requireIdentifier(command.campaignId, `${label}.campaignId`),
      initializedAt: requireTime(command.initializedAt, `${label}.initializedAt`)
    };
  }

  function normalizeCampaignDay(command) {
    const label = "record campaign day command";
    const commandId = prepareCommand(command, [
      "commandId", "campaignId", "dayId", "dayNumber", "recordedAt", "evidenceRefs"
    ], label);
    const dayNumber = requirePositiveInteger(command.dayNumber, `${label}.dayNumber`);
    if (dayNumber > CAMPAIGN_DAY_COUNT) throw new RangeError(`${label}.dayNumber must be in [1, 30].`);
    return {
      commandId,
      campaignId: requireIdentifier(command.campaignId, `${label}.campaignId`),
      dayId: requireIdentifier(command.dayId, `${label}.dayId`),
      dayNumber,
      recordedAt: requireTime(command.recordedAt, `${label}.recordedAt`),
      evidenceRefs: normalizeIdArray(command.evidenceRefs, `${label}.evidenceRefs`)
    };
  }

  function normalizeChapterClosure(command) {
    const label = "close chapter command";
    const commandId = prepareCommand(command, [
      "commandId", "campaignId", "closureId", "chapterNumber", "closedAt", "dayIds"
    ], label);
    const chapterNumber = requirePositiveInteger(command.chapterNumber, `${label}.chapterNumber`);
    if (chapterNumber > CHAPTER_COUNT) throw new RangeError(`${label}.chapterNumber must be in [1, 6].`);
    return {
      commandId,
      campaignId: requireIdentifier(command.campaignId, `${label}.campaignId`),
      closureId: requireIdentifier(command.closureId, `${label}.closureId`),
      chapterNumber,
      closedAt: requireTime(command.closedAt, `${label}.closedAt`),
      dayIds: normalizeIdArray(command.dayIds, `${label}.dayIds`, { nonEmpty: true })
    };
  }

  function normalizeEndlessDay(command) {
    const label = "record endless day command";
    const commandId = prepareCommand(command, [
      "commandId", "campaignId", "endlessDayId", "endlessDayNumber", "absoluteDayNumber", "recordedAt", "evidenceRefs"
    ], label);
    const endlessDayNumber = requirePositiveInteger(command.endlessDayNumber, `${label}.endlessDayNumber`);
    const absoluteDayNumber = requirePositiveInteger(command.absoluteDayNumber, `${label}.absoluteDayNumber`);
    if (absoluteDayNumber !== CAMPAIGN_DAY_COUNT + endlessDayNumber) {
      throw new Error(`${label}.absoluteDayNumber must map exactly to campaign day 30 plus endlessDayNumber.`);
    }
    return {
      commandId,
      campaignId: requireIdentifier(command.campaignId, `${label}.campaignId`),
      endlessDayId: requireIdentifier(command.endlessDayId, `${label}.endlessDayId`),
      endlessDayNumber,
      absoluteDayNumber,
      recordedAt: requireTime(command.recordedAt, `${label}.recordedAt`),
      evidenceRefs: normalizeIdArray(command.evidenceRefs, `${label}.evidenceRefs`)
    };
  }

  function normalizeDayRef(value, label) {
    if (!isObject(value)) throw new TypeError(`${label} must be an object.`);
    if (value.mode === "campaign") {
      assertExactKeys(value, ["mode", "dayNumber"], label);
      const dayNumber = requirePositiveInteger(value.dayNumber, `${label}.dayNumber`);
      if (dayNumber > CAMPAIGN_DAY_COUNT) throw new RangeError(`${label}.dayNumber must be in [1, 30].`);
      return { mode: "campaign", dayNumber };
    }
    if (value.mode === "endless") {
      assertExactKeys(value, ["mode", "endlessDayNumber"], label);
      return {
        mode: "endless",
        endlessDayNumber: requirePositiveInteger(value.endlessDayNumber, `${label}.endlessDayNumber`)
      };
    }
    throw new Error(`${label}.mode must be campaign or endless.`);
  }

  function normalizeCatalogRecord(command, config) {
    const fields = [
      "commandId", "campaignId", config.recordIdField, "catalogRef", "itemId", "dayRef", "recordedAt", "evidenceRefs"
    ];
    const commandId = prepareCommand(command, fields, config.label);
    return {
      commandId,
      campaignId: requireIdentifier(command.campaignId, `${config.label}.campaignId`),
      [config.recordIdField]: requireIdentifier(command[config.recordIdField], `${config.label}.${config.recordIdField}`),
      catalogRef: normalizeCatalogRef(command.catalogRef, config.kind, `${config.label}.catalogRef`),
      itemId: requireIdentifier(command.itemId, `${config.label}.itemId`),
      dayRef: normalizeDayRef(command.dayRef, `${config.label}.dayRef`),
      recordedAt: requireTime(command.recordedAt, `${config.label}.recordedAt`),
      evidenceRefs: normalizeIdArray(command.evidenceRefs, `${config.label}.evidenceRefs`)
    };
  }

  function normalizeEnding(command) {
    const label = "record ending command";
    const commandId = prepareCommand(command, [
      "commandId", "campaignId", "endingRecordId", "catalogRef", "itemId", "recordedAt",
      "campaignDayIds", "chapterClosureIds", "evidenceRefs"
    ], label);
    return {
      commandId,
      campaignId: requireIdentifier(command.campaignId, `${label}.campaignId`),
      endingRecordId: requireIdentifier(command.endingRecordId, `${label}.endingRecordId`),
      catalogRef: normalizeCatalogRef(command.catalogRef, "ending", `${label}.catalogRef`),
      itemId: requireIdentifier(command.itemId, `${label}.itemId`),
      recordedAt: requireTime(command.recordedAt, `${label}.recordedAt`),
      campaignDayIds: normalizeIdArray(command.campaignDayIds, `${label}.campaignDayIds`, { nonEmpty: true }),
      chapterClosureIds: normalizeIdArray(command.chapterClosureIds, `${label}.chapterClosureIds`, { nonEmpty: true }),
      evidenceRefs: normalizeIdArray(command.evidenceRefs, `${label}.evidenceRefs`, { nonEmpty: true })
    };
  }

  const COMMAND_NORMALIZERS = Object.freeze({
    "campaign.initialize": normalizeInitialize,
    "day.record": normalizeCampaignDay,
    "chapter.close": normalizeChapterClosure,
    "endless_day.record": normalizeEndlessDay,
    "event.record": (command) => normalizeCatalogRecord(command, {
      kind: "event", label: "record event command", recordIdField: "eventRecordId"
    }),
    "milestone.record": (command) => normalizeCatalogRecord(command, {
      kind: "milestone", label: "record milestone command", recordIdField: "milestoneRecordId"
    }),
    "specialization.record": (command) => normalizeCatalogRecord(command, {
      kind: "specialization", label: "record specialization command", recordIdField: "specializationRecordId"
    }),
    "ending.record": normalizeEnding
  });

  function mutableEmptyState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      initialized: false,
      campaignId: null,
      initializedAt: null,
      campaignDays: [],
      chapterClosures: [],
      endlessDays: [],
      events: [],
      milestones: [],
      specializations: [],
      ending: null,
      auditHistory: [],
      appliedCommandIds: [],
      commandFingerprints: {}
    };
  }

  function fingerprintCommand(type, command) {
    const content = {};
    Object.keys(command).forEach((key) => { if (key !== "commandId") content[key] = command[key]; });
    return `${type}:${stableStringify(content)}`;
  }

  function commandTime(type, command) {
    if (type === "campaign.initialize") return command.initializedAt;
    if (type === "chapter.close") return command.closedAt;
    return command.recordedAt;
  }

  function requireInitialized(state) {
    if (!state.initialized) throw new Error("Campaign director is uninitialized.");
  }

  function assertActiveCampaign(state, command) {
    requireInitialized(state);
    if (command.campaignId !== state.campaignId) {
      throw new Error(`Command campaignId ${command.campaignId} does not match active campaign ${state.campaignId}.`);
    }
  }

  function assertCommandCampaign(state, type, command) {
    if (type === "campaign.initialize") {
      if (state.initialized && command.campaignId !== state.campaignId) {
        throw new Error(`Command campaignId ${command.campaignId} does not match active campaign ${state.campaignId}.`);
      }
      return;
    }
    assertActiveCampaign(state, command);
  }

  function requireUniqueRecordId(state, id, label) {
    const ids = new Set([
      ...state.campaignDays.map((record) => record.dayId),
      ...state.chapterClosures.map((record) => record.closureId),
      ...state.endlessDays.map((record) => record.endlessDayId),
      ...state.events.map((record) => record.eventRecordId),
      ...state.milestones.map((record) => record.milestoneRecordId),
      ...state.specializations.map((record) => record.specializationRecordId),
      ...(state.ending ? [state.ending.endingRecordId] : [])
    ]);
    if (ids.has(id)) throw new Error(`Duplicate ${label} ${id}.`);
  }

  function resolveDayRef(state, dayRef) {
    if (dayRef.mode === "campaign") {
      return state.campaignDays.find((record) => record.dayNumber === dayRef.dayNumber) || null;
    }
    return state.endlessDays.find((record) => record.endlessDayNumber === dayRef.endlessDayNumber) || null;
  }

  function mutateInitialize(state, command) {
    if (state.initialized) throw new Error(`Campaign ${state.campaignId} is already initialized.`);
    state.initialized = true;
    state.campaignId = command.campaignId;
    state.initializedAt = command.initializedAt;
  }

  function mutateCampaignDay(state, command) {
    requireInitialized(state);
    requireUniqueRecordId(state, command.dayId, "record id");
    const expectedDay = state.campaignDays.length + 1;
    if (command.dayNumber !== expectedDay) {
      throw new Error(`Campaign days must be sequential: expected day ${expectedDay}, got ${command.dayNumber}.`);
    }
    if (expectedDay > CAMPAIGN_DAY_COUNT) throw new Error("All 30 campaign days are already recorded.");
    const chapterNumber = chapterForCampaignDay(command.dayNumber);
    if (chapterNumber > 1 && state.chapterClosures.length < chapterNumber - 1) {
      throw new Error(`Chapter ${chapterNumber - 1} must be closed before campaign day ${command.dayNumber}.`);
    }
    state.campaignDays.push({
      dayId: command.dayId,
      dayNumber: command.dayNumber,
      chapterNumber,
      chapterDayNumber: ((command.dayNumber - 1) % DAYS_PER_CHAPTER) + 1,
      recordedAt: command.recordedAt,
      evidenceRefs: clone(command.evidenceRefs)
    });
  }

  function mutateChapterClosure(state, command) {
    requireInitialized(state);
    requireUniqueRecordId(state, command.closureId, "record id");
    const expectedChapter = state.chapterClosures.length + 1;
    if (command.chapterNumber !== expectedChapter) {
      throw new Error(`Chapter closures must be sequential: expected chapter ${expectedChapter}.`);
    }
    const range = campaignDayRangeForChapter(command.chapterNumber);
    const days = state.campaignDays.filter((record) =>
      record.dayNumber >= range.startDay && record.dayNumber <= range.endDay
    );
    if (days.length !== DAYS_PER_CHAPTER) {
      throw new Error(`Chapter ${command.chapterNumber} requires all five recorded campaign days.`);
    }
    const exactDayIds = days.map((record) => record.dayId);
    if (stableStringify(command.dayIds) !== stableStringify(exactDayIds)) {
      throw new Error(`Chapter ${command.chapterNumber} dayIds must exactly match its five recorded days.`);
    }
    state.chapterClosures.push({
      closureId: command.closureId,
      chapterNumber: command.chapterNumber,
      startDay: range.startDay,
      endDay: range.endDay,
      closedAt: command.closedAt,
      dayIds: clone(command.dayIds)
    });
  }

  function mutateEndlessDay(state, command) {
    requireInitialized(state);
    requireUniqueRecordId(state, command.endlessDayId, "record id");
    if (state.campaignDays.length !== CAMPAIGN_DAY_COUNT || state.chapterClosures.length !== CHAPTER_COUNT) {
      throw new Error("Endless history requires all 30 campaign days and all 6 closed chapters.");
    }
    if (!state.ending) throw new Error("Endless history requires a recorded campaign ending.");
    const expected = state.endlessDays.length + 1;
    if (command.endlessDayNumber !== expected) {
      throw new Error(`Endless days must be sequential: expected endless day ${expected}.`);
    }
    state.endlessDays.push({
      endlessDayId: command.endlessDayId,
      endlessDayNumber: command.endlessDayNumber,
      absoluteDayNumber: command.absoluteDayNumber,
      recordedAt: command.recordedAt,
      evidenceRefs: clone(command.evidenceRefs)
    });
  }

  function mutateCatalogRecord(state, command, config) {
    requireInitialized(state);
    requireUniqueRecordId(state, command[config.recordIdField], "record id");
    if (state.ending && command.dayRef.mode !== "endless") {
      throw new Error(`New ${config.kind} records after ending must reference a recorded endless day.`);
    }
    const day = resolveDayRef(state, command.dayRef);
    if (!day) throw new Error(`${config.kind} references a day that is not recorded.`);
    if (command.recordedAt < day.recordedAt) throw new Error(`${config.kind} cannot precede its referenced day.`);
    if (config.singleTotal && state[config.collection].length > 0) {
      throw new Error(`Only one ${config.kind} record is allowed before an approved catalog policy exists.`);
    }
    if (config.uniqueItem && state[config.collection].some((record) => record.itemId === command.itemId)) {
      throw new Error(`Duplicate ${config.kind} itemId ${command.itemId}.`);
    }
    state[config.collection].push({
      [config.recordIdField]: command[config.recordIdField],
      catalogRef: clone(command.catalogRef),
      itemId: command.itemId,
      dayRef: clone(command.dayRef),
      recordedAt: command.recordedAt,
      evidenceRefs: clone(command.evidenceRefs)
    });
  }

  function evidenceRecordIds(state) {
    return new Set([
      ...state.campaignDays.map((record) => record.dayId),
      ...state.chapterClosures.map((record) => record.closureId),
      ...state.endlessDays.map((record) => record.endlessDayId),
      ...state.events.map((record) => record.eventRecordId),
      ...state.milestones.map((record) => record.milestoneRecordId),
      ...state.specializations.map((record) => record.specializationRecordId)
    ]);
  }

  function mutateEnding(state, command) {
    requireInitialized(state);
    requireUniqueRecordId(state, command.endingRecordId, "record id");
    if (state.ending) throw new Error("Campaign ending is already recorded.");
    if (state.endlessDays.length) throw new Error("Campaign ending cannot be recorded after endless history has started.");
    if (state.campaignDays.length !== CAMPAIGN_DAY_COUNT || state.chapterClosures.length !== CHAPTER_COUNT) {
      throw new Error("Ending requires complete actual 30-day and 6-chapter history.");
    }
    const actualDayIds = state.campaignDays.map((record) => record.dayId);
    const actualClosureIds = state.chapterClosures.map((record) => record.closureId);
    if (stableStringify(command.campaignDayIds) !== stableStringify(actualDayIds)) {
      throw new Error("Ending campaignDayIds must exactly match all 30 recorded campaign days.");
    }
    if (stableStringify(command.chapterClosureIds) !== stableStringify(actualClosureIds)) {
      throw new Error("Ending chapterClosureIds must exactly match all 6 chapter closures.");
    }
    const availableEvidence = evidenceRecordIds(state);
    const unknownEvidence = command.evidenceRefs.find((ref) => !availableEvidence.has(ref));
    if (unknownEvidence) throw new Error(`Ending references unknown evidence ${unknownEvidence}.`);
    state.ending = {
      endingRecordId: command.endingRecordId,
      catalogRef: clone(command.catalogRef),
      itemId: command.itemId,
      recordedAt: command.recordedAt,
      campaignDayIds: clone(command.campaignDayIds),
      chapterClosureIds: clone(command.chapterClosureIds),
      evidenceRefs: clone(command.evidenceRefs),
      finalAuditSequence: state.auditHistory.length + 1
    };
  }

  const COMMAND_MUTATORS = Object.freeze({
    "campaign.initialize": mutateInitialize,
    "day.record": mutateCampaignDay,
    "chapter.close": mutateChapterClosure,
    "endless_day.record": mutateEndlessDay,
    "event.record": (state, command) => mutateCatalogRecord(state, command, {
      kind: "event", collection: "events", recordIdField: "eventRecordId", uniqueItem: true
    }),
    "milestone.record": (state, command) => mutateCatalogRecord(state, command, {
      kind: "milestone", collection: "milestones", recordIdField: "milestoneRecordId", uniqueItem: true
    }),
    "specialization.record": (state, command) => mutateCatalogRecord(state, command, {
      kind: "specialization", collection: "specializations", recordIdField: "specializationRecordId",
      uniqueItem: true, singleTotal: true
    }),
    "ending.record": mutateEnding
  });

  function appendCommand(state, type, command, fingerprint) {
    if (own(state.commandFingerprints, command.commandId)) throw new Error(`Duplicate audit commandId ${command.commandId}.`);
    assertCommandCampaign(state, type, command);
    const at = commandTime(type, command);
    if (state.auditHistory.length) {
      const previous = state.auditHistory[state.auditHistory.length - 1];
      if (at < commandTime(previous.type, previous.command)) {
        throw new Error("Campaign director commands must not move backwards in time.");
      }
    }
    COMMAND_MUTATORS[type](state, command);
    state.appliedCommandIds.push(command.commandId);
    state.commandFingerprints[command.commandId] = fingerprint;
    state.auditHistory.push({
      sequence: state.auditHistory.length + 1,
      commandId: command.commandId,
      type,
      fingerprint,
      command: clone(command)
    });
  }

  function assertStateEnvelope(value) {
    assertSerializable(value, "campaign director state");
    assertNoForbiddenFields(value, "campaign director state");
    assertExactKeys(value, STATE_FIELDS, "campaign director state");
    if (value.schemaVersion !== SCHEMA_VERSION) throw new Error(`Unsupported campaign director schemaVersion ${value.schemaVersion}.`);
    for (const field of [
      "campaignDays", "chapterClosures", "endlessDays", "events", "milestones",
      "specializations", "auditHistory", "appliedCommandIds"
    ]) {
      if (!Array.isArray(value[field])) throw new TypeError(`campaign director state.${field} must be an array.`);
    }
    if (typeof value.initialized !== "boolean") throw new TypeError("campaign director state.initialized must be boolean.");
    if (value.ending !== null && !isObject(value.ending)) throw new TypeError("campaign director state.ending must be null or an object.");
    if (!isObject(value.commandFingerprints)) throw new TypeError("campaign director state.commandFingerprints must be an object.");
  }

  function normalizeState(value) {
    assertStateEnvelope(value);
    const replay = mutableEmptyState();
    value.auditHistory.forEach((event, index) => {
      const label = `campaign director state.auditHistory[${index}]`;
      assertExactKeys(event, AUDIT_FIELDS, label);
      if (event.sequence !== index + 1) throw new Error(`${label}.sequence must be ${index + 1}.`);
      requireIdentifier(event.commandId, `${label}.commandId`);
      requireIdentifier(event.type, `${label}.type`);
      if (typeof event.fingerprint !== "string" || !event.fingerprint) throw new TypeError(`${label}.fingerprint must be non-empty.`);
      const normalizer = COMMAND_NORMALIZERS[event.type];
      if (!normalizer) throw new Error(`${label}.type is unsupported.`);
      const command = normalizer(event.command);
      if (command.commandId !== event.commandId) throw new Error(`${label}.commandId does not match its command.`);
      const fingerprint = fingerprintCommand(event.type, command);
      if (fingerprint !== event.fingerprint) throw new Error(`${label}.fingerprint does not match exact command content.`);
      appendCommand(replay, event.type, command, fingerprint);
    });
    if (stableStringify(replay) !== stableStringify(value)) {
      throw new Error("Campaign director projections do not match immutable audit replay.");
    }
    return deepFreeze(clone(replay));
  }

  function createState() {
    return deepFreeze(mutableEmptyState());
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
      throw new TypeError("Serialized campaign director state must be a non-empty JSON string.");
    }
    let parsed;
    try {
      parsed = JSON.parse(serialized);
    } catch (error) {
      throw new Error(`Cannot parse campaign director state: ${error.message}`);
    }
    return normalizeState(parsed);
  }

  function applyTyped(currentState, type, rawCommand, catalogResolver) {
    const state = normalizeState(currentState);
    const normalizer = COMMAND_NORMALIZERS[type];
    if (!normalizer) throw new Error(`Unsupported campaign director command type ${type}.`);
    const command = normalizer(rawCommand);
    const fingerprint = fingerprintCommand(type, command);
    if (own(state.commandFingerprints, command.commandId)) {
      if (state.commandFingerprints[command.commandId] !== fingerprint) {
        throw new Error(`CommandId ${command.commandId} was already used with conflicting content.`);
      }
      const event = state.auditHistory.find((item) => item.commandId === command.commandId);
      if (!event || event.type !== type) throw new Error(`CommandId ${command.commandId} has inconsistent audit history.`);
      return { state, event: clone(event), idempotent: true };
    }
    assertCommandCampaign(state, type, command);
    if (CATALOG_COMMAND_TYPES.has(type)) {
      const kind = command.catalogRef.catalogKind;
      resolveCatalogAuthorization(catalogResolver, command, kind);
    }
    const next = clone(state);
    appendCommand(next, type, command, fingerprint);
    const normalized = normalizeState(next);
    return {
      state: normalized,
      event: clone(normalized.auditHistory[normalized.auditHistory.length - 1]),
      idempotent: false
    };
  }

  function applyCommandWithResolver(currentState, command, catalogResolver) {
    assertSerializable(command, "campaign director command");
    assertNoForbiddenFields(command, "campaign director command");
    if (!isObject(command) || !own(command, "type")) throw new TypeError("campaign director command.type is required.");
    requireIdentifier(command.type, "campaign director command.type");
    const raw = {};
    Object.keys(command).forEach((key) => { if (key !== "type") raw[key] = command[key]; });
    return applyTyped(currentState, command.type, raw, catalogResolver);
  }

  function applyCommandsAtomicallyWithResolver(currentState, operations, catalogResolver) {
    const original = normalizeState(currentState);
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new TypeError("Atomic campaign operations must be an explicit non-empty array.");
    }
    let next = original;
    const results = [];
    operations.forEach((operation, index) => {
      assertExactKeys(operation, ["command"], `atomic operations[${index}]`);
      const result = applyCommandWithResolver(next, operation.command, catalogResolver);
      next = result.state;
      results.push({ event: result.event, idempotent: result.idempotent });
    });
    return deepFreeze({ state: next, results });
  }

  function named(type, key, locator, catalogResolver) {
    return function namedCommand(currentState, command) {
      const result = applyTyped(currentState, type, command, catalogResolver);
      return deepFreeze({
        state: result.state,
        [key]: clone(locator(result.state, command)),
        idempotent: result.idempotent
      });
    };
  }

  function summarizeState(value) {
    const state = normalizeState(value);
    return deepFreeze({
      schemaVersion: SCHEMA_VERSION,
      initialized: state.initialized,
      campaignDayCount: state.campaignDays.length,
      closedChapterCount: state.chapterClosures.length,
      endlessDayCount: state.endlessDays.length,
      eventCount: state.events.length,
      milestoneCount: state.milestones.length,
      specializationCount: state.specializations.length,
      endingRecorded: state.ending !== null,
      auditEventCount: state.auditHistory.length
    });
  }

  function createRuntime(options = {}) {
    if (!isObject(options)) throw new TypeError("Campaign director runtime options must be an object.");
    const extra = Object.keys(options).filter((key) => key !== "catalogResolver");
    if (extra.length) throw new Error(`Campaign director runtime options contain unsupported fields: ${extra.join(", ")}.`);
    const catalogResolver = own(options, "catalogResolver") ? options.catalogResolver : null;
    if (catalogResolver !== null && typeof catalogResolver !== "function") {
      throw new TypeError("Campaign director catalogResolver must be a function or null.");
    }

    const applyCommand = (currentState, command) =>
      applyCommandWithResolver(currentState, command, catalogResolver);
    const applyCommandsAtomically = (currentState, operations) =>
      applyCommandsAtomicallyWithResolver(currentState, operations, catalogResolver);
    const initializeCampaign = named("campaign.initialize", "campaign", (state) => ({
      campaignId: state.campaignId, initializedAt: state.initializedAt
    }), catalogResolver);
    const recordCampaignDay = named("day.record", "day", (state, command) =>
      state.campaignDays.find((record) => record.dayId === command.dayId), catalogResolver);
    const closeChapter = named("chapter.close", "chapterClosure", (state, command) =>
      state.chapterClosures.find((record) => record.closureId === command.closureId), catalogResolver);
    const recordEndlessDay = named("endless_day.record", "day", (state, command) =>
      state.endlessDays.find((record) => record.endlessDayId === command.endlessDayId), catalogResolver);
    const recordEvent = named("event.record", "record", (state, command) =>
      state.events.find((record) => record.eventRecordId === command.eventRecordId), catalogResolver);
    const recordMilestone = named("milestone.record", "record", (state, command) =>
      state.milestones.find((record) => record.milestoneRecordId === command.milestoneRecordId), catalogResolver);
    const recordSpecialization = named("specialization.record", "record", (state, command) =>
      state.specializations.find((record) => record.specializationRecordId === command.specializationRecordId), catalogResolver);
    const recordEnding = named("ending.record", "record", (state) => state.ending, catalogResolver);

    return Object.freeze({
      SCHEMA_VERSION,
      CAMPAIGN_DAY_COUNT,
      CHAPTER_COUNT,
      DAYS_PER_CHAPTER,
      CATALOG_KINDS,
      FORBIDDEN_FIELDS,
      mapDay,
      mapAbsoluteDay: mapDay,
      chapterForCampaignDay,
      campaignDayRangeForChapter,
      createState,
      createEmptyState: createState,
      normalizeState,
      validateState,
      serializeState,
      deserializeState,
      summarizeState,
      createRuntime,
      applyCommand,
      applyCommandsAtomically,
      initializeCampaign,
      recordCampaignDay,
      closeChapter,
      recordEndlessDay,
      recordEvent,
      recordMilestone,
      recordSpecialization,
      recordEnding
    });
  }

  return createRuntime();
});
