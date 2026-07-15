"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const director = require("../systems/campaign-director-v7.js");

const CAMPAIGN_ID = "campaign-1";
const snapshot = (state) => JSON.stringify(state);
const expectNoMutation = (state, action, pattern) => {
  const before = snapshot(state);
  assert.throws(action, pattern);
  assert.equal(snapshot(state), before, "failed campaign command mutated caller state");
};

const catalogEnvelope = (kind, itemIds, overrides = {}) => ({
  schemaVersion: 1,
  catalogKind: kind,
  catalogId: `${kind}-catalog`,
  catalogVersion: "v1",
  status: "approved",
  digest: `digest-${kind}-0001`,
  itemIds,
  ...overrides
});

const catalogRef = (kind) => ({
  catalogKind: kind,
  catalogId: `${kind}-catalog`,
  catalogVersion: "v1",
  digest: `digest-${kind}-0001`
});

const catalogKey = (ref) => [
  ref.catalogKind, ref.catalogId, ref.catalogVersion, ref.digest
].join("|");

const catalogs = [
  catalogEnvelope("event", ["event-alpha", "event-beta"]),
  catalogEnvelope("milestone", ["milestone-alpha", "milestone-beta"]),
  catalogEnvelope("specialization", ["specialization-alpha", "specialization-beta"]),
  catalogEnvelope("ending", ["ending-alpha", "ending-beta"])
];
const catalogsByRef = new Map(catalogs.map((catalog) => [catalogKey(catalog), catalog]));
const resolverLookups = [];
const authorizedDirector = director.createRuntime({
  catalogResolver(exactCatalogRef) {
    resolverLookups.push(JSON.parse(JSON.stringify(exactCatalogRef)));
    return catalogsByRef.get(catalogKey(exactCatalogRef));
  }
});

const initializeCommand = (campaignId = CAMPAIGN_ID) => ({
  commandId: "cmd-campaign-initialize",
  campaignId,
  initializedAt: 0
});

const dayCommand = (dayNumber, recordedAt = dayNumber, campaignId = CAMPAIGN_ID) => ({
  commandId: `cmd-day-${dayNumber}`,
  campaignId,
  dayId: `day-${dayNumber}`,
  dayNumber,
  recordedAt,
  evidenceRefs: []
});

const closureCommand = (chapterNumber, closedAt, campaignId = CAMPAIGN_ID) => {
  const range = director.campaignDayRangeForChapter(chapterNumber);
  return {
    commandId: `cmd-chapter-${chapterNumber}-close`,
    campaignId,
    closureId: `chapter-${chapterNumber}-closure`,
    chapterNumber,
    closedAt,
    dayIds: Array.from(
      { length: director.DAYS_PER_CHAPTER },
      (_, index) => `day-${range.startDay + index}`
    )
  };
};

assert.equal(director.SCHEMA_VERSION, 1);
assert.equal(director.CAMPAIGN_DAY_COUNT, 30);
assert.equal(director.CHAPTER_COUNT, 6);
assert.equal(director.DAYS_PER_CHAPTER, 5);
assert.equal(typeof director.createRuntime, "function");
assert.throws(() => director.createRuntime({ catalogResolver: true }), /must be a function or null/);
assert.throws(() => director.createRuntime({ catalogResolver: null, unsupported: true }), /unsupported fields/);
assert.deepEqual(director.mapDay(1), {
  mode: "campaign",
  absoluteDayNumber: 1,
  campaignDayNumber: 1,
  chapterNumber: 1,
  chapterDayNumber: 1,
  endlessDayNumber: null
});
assert.deepEqual(director.mapDay(30), {
  mode: "campaign",
  absoluteDayNumber: 30,
  campaignDayNumber: 30,
  chapterNumber: 6,
  chapterDayNumber: 5,
  endlessDayNumber: null
});
assert.deepEqual(director.mapDay(31), {
  mode: "endless",
  absoluteDayNumber: 31,
  campaignDayNumber: null,
  chapterNumber: null,
  chapterDayNumber: null,
  endlessDayNumber: 1
});
assert.equal(director.chapterForCampaignDay(26), 6);
assert.deepEqual(director.campaignDayRangeForChapter(3), { chapterNumber: 3, startDay: 11, endDay: 15 });
assert.throws(() => director.mapDay(0), /positive safe integer/);
assert.throws(() => director.chapterForCampaignDay(31), /\[1, 30\]/);
assert.throws(() => director.campaignDayRangeForChapter(7), /\[1, 6\]/);

let state = director.createState();
assert.equal(director.validateState(state).valid, true);
assert.equal(state.initialized, false);
assert.equal(Object.isFrozen(state), true);
assert.equal(Object.isFrozen(state.auditHistory), true);
assert.deepEqual(director.summarizeState(state), {
  schemaVersion: 1,
  initialized: false,
  campaignDayCount: 0,
  closedChapterCount: 0,
  endlessDayCount: 0,
  eventCount: 0,
  milestoneCount: 0,
  specializationCount: 0,
  endingRecorded: false,
  auditEventCount: 0
});
expectNoMutation(state, () => director.recordCampaignDay(state, dayCommand(1)), /uninitialized/);

state = director.initializeCampaign(state, initializeCommand()).state;
assert.equal(state.campaignId, CAMPAIGN_ID);
assert.equal(director.initializeCampaign(state, initializeCommand()).idempotent, true);
expectNoMutation(state, () => director.initializeCampaign(state, {
  ...initializeCommand(),
  campaignId: "campaign-conflict"
}), /conflicting content/);
expectNoMutation(state, () => director.initializeCampaign(state, {
  commandId: "cmd-second-initialize",
  campaignId: "campaign-2",
  initializedAt: 0
}), /does not match active campaign/);
expectNoMutation(state, () => director.recordCampaignDay(state, dayCommand(1, 1, "campaign-stale")), /does not match active campaign/);
expectNoMutation(state, () => director.recordCampaignDay(state, dayCommand(2, 1)), /expected day 1/);

for (let day = 1; day <= 4; day += 1) {
  state = director.recordCampaignDay(state, dayCommand(day)).state;
}
expectNoMutation(state, () => director.closeChapter(state, closureCommand(1, 5)), /requires all five/);
expectNoMutation(state, () => director.recordCampaignDay(state, {
  ...dayCommand(5),
  dayId: "day-1",
  commandId: "cmd-day-duplicate-id"
}), /Duplicate record id/);
state = director.recordCampaignDay(state, dayCommand(5)).state;
expectNoMutation(state, () => director.recordCampaignDay(state, {
  ...dayCommand(5),
  campaignId: "campaign-stale"
}), /conflicting content/);
expectNoMutation(state, () => director.recordCampaignDay(state, dayCommand(6, 6)), /Chapter 1 must be closed/);
expectNoMutation(state, () => director.closeChapter(state, {
  ...closureCommand(1, 6),
  commandId: "cmd-chapter-close-wrong-days",
  closureId: "chapter-1-closure-wrong",
  dayIds: ["day-1", "day-2", "day-3", "day-4"]
}), /dayIds must exactly match/);
state = director.closeChapter(state, closureCommand(1, 6)).state;

const eventCommand = {
  commandId: "cmd-event-alpha",
  campaignId: CAMPAIGN_ID,
  eventRecordId: "event-record-alpha",
  catalogRef: catalogRef("event"),
  itemId: "event-alpha",
  dayRef: { mode: "campaign", dayNumber: 5 },
  recordedAt: 6,
  evidenceRefs: ["day-5"]
};
expectNoMutation(state, () => director.recordEvent(state, eventCommand), /approved catalog resolver/);
expectNoMutation(state, () => director.recordEvent(state, eventCommand, catalogs[0]), /approved catalog resolver/);
expectNoMutation(state, () => authorizedDirector.recordEvent(state, {
  ...eventCommand,
  commandId: "cmd-event-unrecorded-day",
  eventRecordId: "event-record-unrecorded-day",
  dayRef: { mode: "campaign", dayNumber: 30 }
}), /day that is not recorded/);

let resolverExactRef = null;
const exactLookupDirector = director.createRuntime({
  catalogResolver(exactCatalogRef) {
    resolverExactRef = exactCatalogRef;
    return catalogEnvelope("event", ["event-alpha"]);
  }
});
const exactLookupResult = exactLookupDirector.recordEvent(state, eventCommand);
assert.deepEqual(resolverExactRef, catalogRef("event"));
assert.equal(Object.isFrozen(resolverExactRef), true);
state = exactLookupResult.state;

const callsBeforeRetry = resolverLookups.length;
assert.equal(director.recordEvent(state, eventCommand).idempotent, true);
assert.equal(resolverLookups.length, callsBeforeRetry, "persisted retry unexpectedly consulted a resolver");
expectNoMutation(state, () => director.recordEvent(state, {
  ...eventCommand,
  recordedAt: 7
}), /conflicting content/);
const rejectingResolverDirector = director.createRuntime({ catalogResolver: () => undefined });
expectNoMutation(state, () => rejectingResolverDirector.recordEvent(state, {
  ...eventCommand,
  commandId: "cmd-event-envelope-cannot-override-resolver",
  eventRecordId: "event-record-envelope-cannot-override-resolver",
  itemId: "event-beta"
}, catalogs[0]), /catalog envelope must be JSON-serializable/);
expectNoMutation(state, () => authorizedDirector.recordEvent(state, {
  ...eventCommand,
  commandId: "cmd-event-alpha-duplicate-item",
  eventRecordId: "event-record-alpha-duplicate-item"
}), /Duplicate event itemId/);

const wrongCatalogDirector = director.createRuntime({
  catalogResolver: () => catalogEnvelope("event", ["event-alpha"], { digest: "digest-event-mismatch" })
});
expectNoMutation(state, () => wrongCatalogDirector.recordEvent(state, {
  ...eventCommand,
  commandId: "cmd-event-wrong-catalog",
  eventRecordId: "event-record-wrong-catalog",
  itemId: "event-beta"
}), /does not match the exact command catalogRef/);
const pendingCatalogDirector = director.createRuntime({
  catalogResolver: () => catalogEnvelope("event", ["event-beta"], { status: "pending" })
});
expectNoMutation(state, () => pendingCatalogDirector.recordEvent(state, {
  ...eventCommand,
  commandId: "cmd-event-pending-catalog",
  eventRecordId: "event-record-pending-catalog",
  itemId: "event-beta"
}), /status must be approved/);
const missingItemDirector = director.createRuntime({
  catalogResolver: () => catalogEnvelope("event", ["event-alpha"])
});
expectNoMutation(state, () => missingItemDirector.recordEvent(state, {
  ...eventCommand,
  commandId: "cmd-event-unknown-item",
  eventRecordId: "event-record-unknown-item",
  itemId: "event-beta"
}), /does not contain itemId/);
expectNoMutation(state, () => authorizedDirector.recordEvent(state, {
  ...eventCommand,
  commandId: "cmd-event-clinical-payload",
  eventRecordId: "event-record-clinical",
  clinical: { diagnosis: "forbidden" }
}), /forbidden free-text or clinical field/);

state = authorizedDirector.recordMilestone(state, {
  commandId: "cmd-milestone-alpha",
  campaignId: CAMPAIGN_ID,
  milestoneRecordId: "milestone-record-alpha",
  catalogRef: catalogRef("milestone"),
  itemId: "milestone-alpha",
  dayRef: { mode: "campaign", dayNumber: 5 },
  recordedAt: 6,
  evidenceRefs: ["day-5", "event-record-alpha"]
}).state;
state = authorizedDirector.recordSpecialization(state, {
  commandId: "cmd-specialization-alpha",
  campaignId: CAMPAIGN_ID,
  specializationRecordId: "specialization-record-alpha",
  catalogRef: catalogRef("specialization"),
  itemId: "specialization-alpha",
  dayRef: { mode: "campaign", dayNumber: 5 },
  recordedAt: 6,
  evidenceRefs: ["milestone-record-alpha"]
}).state;
expectNoMutation(state, () => authorizedDirector.recordSpecialization(state, {
  commandId: "cmd-specialization-beta",
  campaignId: CAMPAIGN_ID,
  specializationRecordId: "specialization-record-beta",
  catalogRef: catalogRef("specialization"),
  itemId: "specialization-beta",
  dayRef: { mode: "campaign", dayNumber: 5 },
  recordedAt: 6,
  evidenceRefs: ["milestone-record-alpha"]
}), /Only one specialization record/);

expectNoMutation(state, () => director.recordEndlessDay(state, {
  commandId: "cmd-endless-too-early",
  campaignId: CAMPAIGN_ID,
  endlessDayId: "endless-too-early",
  endlessDayNumber: 1,
  absoluteDayNumber: 31,
  recordedAt: 6,
  evidenceRefs: []
}), /requires all 30 campaign days and all 6 closed chapters/);

let time = 7;
for (let chapter = 2; chapter <= 6; chapter += 1) {
  const range = director.campaignDayRangeForChapter(chapter);
  for (let day = range.startDay; day <= range.endDay; day += 1) {
    state = director.recordCampaignDay(state, dayCommand(day, time)).state;
    time += 1;
  }
  state = director.closeChapter(state, closureCommand(chapter, time)).state;
  time += 1;
}
assert.equal(state.campaignDays.length, 30);
assert.equal(state.chapterClosures.length, 6);

const endlessOne = {
  commandId: "cmd-endless-1",
  campaignId: CAMPAIGN_ID,
  endlessDayId: "endless-day-1",
  endlessDayNumber: 1,
  absoluteDayNumber: 31,
  recordedAt: time + 1,
  evidenceRefs: ["ending-record-alpha"]
};
expectNoMutation(state, () => director.recordEndlessDay(state, endlessOne), /requires a recorded campaign ending/);

const actualDayIds = state.campaignDays.map((record) => record.dayId);
const actualClosureIds = state.chapterClosures.map((record) => record.closureId);
const endingCommand = {
  commandId: "cmd-ending-alpha",
  campaignId: CAMPAIGN_ID,
  endingRecordId: "ending-record-alpha",
  catalogRef: catalogRef("ending"),
  itemId: "ending-alpha",
  recordedAt: time,
  campaignDayIds: actualDayIds,
  chapterClosureIds: actualClosureIds,
  evidenceRefs: ["day-30", "milestone-record-alpha", "specialization-record-alpha"]
};
expectNoMutation(state, () => authorizedDirector.recordEnding(state, {
  ...endingCommand,
  commandId: "cmd-ending-unknown-evidence",
  endingRecordId: "ending-record-unknown-evidence",
  evidenceRefs: ["unknown-evidence"]
}), /unknown evidence/);
expectNoMutation(state, () => authorizedDirector.recordEnding(state, {
  ...endingCommand,
  commandId: "cmd-ending-missing-day",
  endingRecordId: "ending-record-missing-day",
  campaignDayIds: actualDayIds.slice(0, -1)
}), /must exactly match all 30/);

state = authorizedDirector.recordEnding(state, endingCommand).state;
const endingSequence = state.auditHistory.find((entry) => entry.commandId === endingCommand.commandId).sequence;
assert.equal(state.ending.finalAuditSequence, endingSequence);
assert.equal(state.ending.finalAuditSequence, state.auditHistory.length);

expectNoMutation(state, () => authorizedDirector.recordEvent(state, {
  commandId: "cmd-event-after-ending-campaign",
  campaignId: CAMPAIGN_ID,
  eventRecordId: "event-record-after-ending-campaign",
  catalogRef: catalogRef("event"),
  itemId: "event-beta",
  dayRef: { mode: "campaign", dayNumber: 30 },
  recordedAt: time,
  evidenceRefs: ["day-30"]
}), /must reference a recorded endless day/);
expectNoMutation(state, () => authorizedDirector.recordEvent(state, {
  commandId: "cmd-event-unrecorded-endless",
  campaignId: CAMPAIGN_ID,
  eventRecordId: "event-record-unrecorded-endless",
  catalogRef: catalogRef("event"),
  itemId: "event-beta",
  dayRef: { mode: "endless", endlessDayNumber: 1 },
  recordedAt: time,
  evidenceRefs: []
}), /day that is not recorded/);

state = director.recordEndlessDay(state, endlessOne).state;
state = authorizedDirector.recordEvent(state, {
  commandId: "cmd-event-beta-endless",
  campaignId: CAMPAIGN_ID,
  eventRecordId: "event-record-beta-endless",
  catalogRef: catalogRef("event"),
  itemId: "event-beta",
  dayRef: { mode: "endless", endlessDayNumber: 1 },
  recordedAt: time + 1,
  evidenceRefs: ["endless-day-1"]
}).state;
expectNoMutation(state, () => authorizedDirector.recordEvent(state, {
  commandId: "cmd-event-beta-repeat",
  campaignId: CAMPAIGN_ID,
  eventRecordId: "event-record-beta-repeat",
  catalogRef: catalogRef("event"),
  itemId: "event-beta",
  dayRef: { mode: "endless", endlessDayNumber: 1 },
  recordedAt: time + 1,
  evidenceRefs: ["endless-day-1"]
}), /Duplicate event itemId/);
expectNoMutation(state, () => authorizedDirector.recordEnding(state, {
  ...endingCommand,
  commandId: "cmd-ending-after-endless",
  endingRecordId: "ending-record-after-endless",
  itemId: "ending-beta",
  recordedAt: time + 1
}), /already recorded/);

const endlessTwo = {
  commandId: "cmd-endless-2",
  campaignId: CAMPAIGN_ID,
  endlessDayId: "endless-day-2",
  endlessDayNumber: 2,
  absoluteDayNumber: 32,
  recordedAt: time + 2,
  evidenceRefs: []
};
expectNoMutation(state, () => director.recordEndlessDay(state, {
  ...endlessTwo,
  commandId: "cmd-endless-gap",
  endlessDayId: "endless-day-gap",
  endlessDayNumber: 3,
  absoluteDayNumber: 33
}), /expected endless day 2/);
state = director.recordEndlessDay(state, endlessTwo).state;
assert.equal(state.ending.finalAuditSequence, endingSequence, "ending boundary changed after endless records");

const serialized = director.serializeState(state);
const reloaded = director.deserializeState(serialized);
assert.deepEqual(reloaded, state);
assert.equal(director.validateState(reloaded).valid, true);
assert.equal(director.initializeCampaign(reloaded, initializeCommand()).idempotent, true);
assert.equal(director.recordEvent(reloaded, eventCommand).idempotent, true);
expectNoMutation(reloaded, () => director.recordEvent(reloaded, {
  ...eventCommand,
  recordedAt: 8
}), /conflicting content/);
assert.equal(serialized.includes('"itemIds"'), false, "external catalog membership list was persisted wholesale");
assert.equal(serialized.includes("specialization-beta"), false, "unselected external catalog item leaked into state");
assert.equal(reloaded.auditHistory.every((entry) => entry.command.campaignId === CAMPAIGN_ID), true);

const alteredProjection = JSON.parse(serialized);
alteredProjection.campaignDays[0].dayNumber = 2;
assert.equal(director.validateState(alteredProjection).valid, false);
const alteredFingerprint = JSON.parse(serialized);
alteredFingerprint.auditHistory[1].fingerprint += "changed";
assert.equal(director.validateState(alteredFingerprint).valid, false);
const alteredCampaign = JSON.parse(serialized);
alteredCampaign.auditHistory[1].command.campaignId = "campaign-stale";
assert.equal(director.validateState(alteredCampaign).valid, false);
assert.equal(director.validateState({ ...JSON.parse(serialized), schemaVersion: 2 }).valid, false);
assert.throws(() => director.deserializeState("not json"), /Cannot parse/);

const campaignB = "atomic-campaign";
const atomicBase = director.initializeCampaign(director.createState(), {
  commandId: "cmd-atomic-initialize",
  campaignId: campaignB,
  initializedAt: 0
}).state;
expectNoMutation(atomicBase, () => director.recordCampaignDay(atomicBase, {
  ...dayCommand(1, 1, CAMPAIGN_ID),
  commandId: "cmd-stale-campaign-a-to-b",
  dayId: "stale-campaign-a-day"
}), /does not match active campaign/);
const atomicBefore = snapshot(atomicBase);
expectNoMutation(atomicBase, () => director.applyCommandsAtomically(atomicBase, [
  {
    command: {
      type: "day.record",
      ...dayCommand(1, 1, campaignB),
      commandId: "cmd-atomic-day-1",
      dayId: "atomic-day-1"
    }
  },
  {
    command: {
      type: "day.record",
      ...dayCommand(3, 2, campaignB),
      commandId: "cmd-atomic-day-gap",
      dayId: "atomic-day-gap"
    }
  }
]), /expected day 2/);
assert.equal(snapshot(atomicBase), atomicBefore);
expectNoMutation(atomicBase, () => director.applyCommandsAtomically(atomicBase, [{
  command: {
    type: "day.record",
    ...dayCommand(1, 1, campaignB),
    commandId: "cmd-atomic-envelope-day",
    dayId: "atomic-envelope-day"
  },
  catalogEnvelope: null
}]), /unsupported fields/);

const runtimeSource = fs.readFileSync(path.join(__dirname, "../systems/campaign-director-v7.js"), "utf8");
const browserContext = { globalThis: {} };
vm.runInNewContext(runtimeSource, browserContext, { filename: "campaign-director-v7.js" });
const browserApi = browserContext.globalThis.PET_CLINIC_CAMPAIGN_DIRECTOR_V7;
assert.equal(typeof browserApi.initializeCampaign, "function");
assert.equal(typeof browserApi.createRuntime, "function");
assert.equal(browserApi.validateState(browserApi.createState()).valid, true);

const summary = director.summarizeState(state);
assert.equal(summary.initialized, true);
assert.equal(summary.campaignDayCount, 30);
assert.equal(summary.closedChapterCount, 6);
assert.equal(summary.endlessDayCount, 2);
assert.equal(summary.eventCount, 2);
assert.equal(summary.milestoneCount, 1);
assert.equal(summary.specializationCount, 1);
assert.equal(summary.endingRecorded, true);
assert.equal(summary.auditEventCount, state.auditHistory.length);

console.log(JSON.stringify({
  schemaVersion: director.SCHEMA_VERSION,
  constants: {
    campaignDays: director.CAMPAIGN_DAY_COUNT,
    chapters: director.CHAPTER_COUNT,
    daysPerChapter: director.DAYS_PER_CHAPTER
  },
  auditEvents: state.auditHistory.length,
  commandTypes: [...new Set(state.auditHistory.map((event) => event.type))].sort(),
  summary,
  serializedBytes: Buffer.byteLength(serialized),
  externalCatalogsNotPersisted: true,
  defaultCatalogGateFailClosed: true,
  persistedRetryWithoutResolver: true,
  campaignIdentityBound: true,
  endingBoundarySequence: endingSequence,
  atomicFailureProtected: true,
  browserUmdVerified: true
}, null, 2));
