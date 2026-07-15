#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const runtime = require("../systems/reputation-runtime-v6.js");

const runtimePath = path.join(__dirname, "../systems/reputation-runtime-v6.js");
const browserSandbox = {};
vm.runInNewContext(fs.readFileSync(runtimePath, "utf8"), browserSandbox, { filename: runtimePath });
assert.ok(browserSandbox.PET_CLINIC_REPUTATION_RUNTIME_V6, "UMD runtime must expose a browser global");
assert.equal(
  JSON.stringify(browserSandbox.PET_CLINIC_REPUTATION_RUNTIME_V6.AXES),
  JSON.stringify(["clinical", "communication", "accessibility", "organization"])
);

assert.equal(runtime.SCHEMA_VERSION, 1);
assert.deepEqual(runtime.AXES, ["clinical", "communication", "accessibility", "organization"]);
assert.equal(Object.isFrozen(runtime.AXES), true);

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

const baselineCommand = {
  commandId: "synthetic-baseline-command-1",
  catalogId: "synthetic-reputation-catalog",
  catalogVersion: "fixture-1",
  status: "approved",
  scores: {
    clinical: 12.5,
    communication: -3,
    accessibility: 0,
    organization: 1000.125
  }
};

const clinicalEventCommand = {
  commandId: "synthetic-event-command-clinical-1",
  eventId: "synthetic-event-clinical-1",
  sourceType: "synthetic-outcome",
  sourceId: "synthetic-outcome-1",
  axis: "clinical",
  delta: 4.25
};

const organizationEventCommand = {
  commandId: "synthetic-event-command-organization-1",
  eventId: "synthetic-event-organization-1",
  sourceType: "synthetic-operation",
  sourceId: "synthetic-operation-1",
  axis: "organization",
  delta: -1.5
};

const reversalCommand = {
  commandId: "synthetic-reversal-command-1",
  reversalId: "synthetic-reversal-1",
  targetEventId: clinicalEventCommand.eventId,
  sourceType: "synthetic-correction",
  sourceId: "synthetic-correction-1"
};

const empty = runtime.createState();
assert.deepEqual(empty, {
  schemaVersion: 1,
  catalog: null,
  scores: null,
  auditHistory: [],
  appliedCommandIds: [],
  commandFingerprints: {}
});
assert.deepEqual(runtime.summarizeState(empty), {
  schemaVersion: 1,
  initialized: false,
  catalogId: null,
  catalogVersion: null,
  catalogStatus: null,
  scores: null,
  auditEntryCount: 0,
  eventCount: 0,
  reversalCount: 0,
  activeEventCount: 0,
  appliedCommandCount: 0
});
assert.deepEqual(runtime.deserializeState(runtime.serializeState(empty)), empty);
assert.equal(runtime.validateState(empty).valid, true);

assert.throws(() => runtime.recordEvent(empty, clinicalEventCommand), /uninitialized.*baseline/i);
assert.throws(() => runtime.reverseEvent(empty, reversalCommand), /uninitialized/i);
assert.throws(() => runtime.createState({ ownerTrust: 74 }), /legacy metric.*ownerTrust|unsupported field ownerTrust/i);
assert.throws(() => runtime.createState({ clinicalReliability: 80 }), /legacy metric.*clinicalReliability|unsupported field clinicalReliability/i);
assert.throws(() => runtime.createState({
  catalog: { catalogId: "synthetic", catalogVersion: "1", status: "approved" }
}), /initialized together/i);
assert.equal(runtime.validateState({ ...empty, auditHistory: [{ any: "entry" }] }).valid, false);

const emptyBeforeInitialization = copy(empty);
const baselineCommandBefore = copy(baselineCommand);
const initializedResult = runtime.initializeBaseline(empty, baselineCommand);
assert.deepEqual(empty, emptyBeforeInitialization, "baseline initialization must not mutate caller state");
assert.deepEqual(baselineCommand, baselineCommandBefore, "baseline initialization must not mutate caller command");
assert.equal(initializedResult.idempotent, false);
const initialized = initializedResult.state;
assert.deepEqual(initialized.catalog, {
  catalogId: "synthetic-reputation-catalog",
  catalogVersion: "fixture-1",
  status: "approved"
});
assert.deepEqual(initialized.scores, baselineCommand.scores, "scores are explicit and are not clamped or remapped");
assert.equal(initialized.auditHistory.length, 1);
assert.equal(initialized.auditHistory[0].type, "baseline_initialized");
assert.deepEqual(initialized.auditHistory[0].scores, baselineCommand.scores);
assert.deepEqual(initialized.appliedCommandIds, [baselineCommand.commandId]);
assert.match(initialized.commandFingerprints[baselineCommand.commandId], /^initialize_baseline:[0-9a-f]{16}$/);
assert.equal(runtime.validateState(initialized).valid, true);
assert.deepEqual(runtime.summarizeState(initialized), {
  schemaVersion: 1,
  initialized: true,
  catalogId: "synthetic-reputation-catalog",
  catalogVersion: "fixture-1",
  catalogStatus: "approved",
  scores: baselineCommand.scores,
  auditEntryCount: 1,
  eventCount: 0,
  reversalCount: 0,
  activeEventCount: 0,
  appliedCommandCount: 1
});

const baselineReplay = runtime.initializeBaseline(copy(initialized), copy(baselineCommand));
assert.equal(baselineReplay.idempotent, true);
assert.deepEqual(baselineReplay.state, initialized);
assert.throws(() => runtime.initializeBaseline(initialized, {
  ...baselineCommand,
  scores: { ...baselineCommand.scores, clinical: 13 }
}), /command id conflict.*different content/i);
assert.throws(() => runtime.initializeBaseline(initialized, {
  ...baselineCommand,
  commandId: "synthetic-baseline-command-2"
}), /already initialized/i);
assert.throws(() => runtime.initializeBaseline(empty, {
  ...baselineCommand,
  status: "pending_review"
}), /status must be exactly approved/i);
assert.throws(() => runtime.initializeBaseline(empty, {
  ...baselineCommand,
  scores: {
    clinical: 1,
    communication: 2,
    accessibility: 3
  }
}), /missing required field organization/i);
assert.throws(() => runtime.initializeBaseline(empty, {
  ...baselineCommand,
  scores: { ...baselineCommand.scores, ownerTrust: 74 }
}), /legacy metric.*ownerTrust|unsupported field ownerTrust/i);
assert.throws(() => runtime.initializeBaseline(empty, {
  ...baselineCommand,
  diagnosis: "synthetic diagnosis must still be rejected"
}), /clinical truth.*diagnosis/i);

const initializedBeforeEvent = copy(initialized);
const clinicalEventBefore = copy(clinicalEventCommand);
const clinicalResult = runtime.recordEvent(initialized, clinicalEventCommand);
assert.deepEqual(initialized, initializedBeforeEvent, "recordEvent must not mutate caller state");
assert.deepEqual(clinicalEventCommand, clinicalEventBefore, "recordEvent must not mutate caller command");
assert.equal(clinicalResult.idempotent, false);
const afterClinical = clinicalResult.state;
assert.deepEqual(afterClinical.scores, {
  clinical: 16.75,
  communication: -3,
  accessibility: 0,
  organization: 1000.125
}, "one event must change exactly one explicit axis");
assert.deepEqual(afterClinical.auditHistory[0], initialized.auditHistory[0], "prior audit entries remain unchanged");
assert.equal(afterClinical.auditHistory[1].type, "axis_delta_recorded");
assert.match(afterClinical.commandFingerprints[clinicalEventCommand.commandId], /^record_event:[0-9a-f]{16}$/);

const exactClinicalReplay = runtime.recordEvent(copy(afterClinical), copy(clinicalEventCommand));
assert.equal(exactClinicalReplay.idempotent, true);
assert.deepEqual(exactClinicalReplay.state, afterClinical);
assert.throws(() => runtime.recordEvent(afterClinical, {
  ...clinicalEventCommand,
  delta: 4.5
}), /command id conflict.*different content/i);
assert.throws(() => runtime.recordEvent(afterClinical, {
  ...clinicalEventCommand,
  commandId: "synthetic-event-command-duplicate-id",
  sourceId: "synthetic-outcome-new-source"
}), /duplicate audit artifact id/i);
assert.throws(() => runtime.recordEvent(afterClinical, {
  ...clinicalEventCommand,
  commandId: "synthetic-event-command-double-source",
  eventId: "synthetic-event-double-source"
}), /source synthetic-outcome\/synthetic-outcome-1 is already owned/i);

const missingDelta = { ...clinicalEventCommand, commandId: "missing-delta", eventId: "missing-delta-event", sourceId: "missing-delta-source" };
delete missingDelta.delta;
assert.throws(() => runtime.recordEvent(initialized, missingDelta), /missing required field delta/i);
assert.throws(() => runtime.recordEvent(initialized, {
  ...clinicalEventCommand,
  commandId: "zero-delta",
  eventId: "zero-delta-event",
  sourceId: "zero-delta-source",
  delta: 0
}), /non-zero.*no-op/i);
assert.throws(() => runtime.recordEvent(initialized, {
  ...clinicalEventCommand,
  commandId: "negative-zero-delta",
  eventId: "negative-zero-delta-event",
  sourceId: "negative-zero-delta-source",
  delta: -0
}), /non-zero.*no-op/i);
assert.throws(() => runtime.recordEvent(initialized, {
  ...clinicalEventCommand,
  commandId: "multi-axis-command",
  eventId: "multi-axis-event",
  sourceId: "multi-axis-source",
  deltas: { clinical: 1, communication: 1 }
}), /unsupported field deltas/i);
assert.throws(() => runtime.recordEvent(initialized, {
  ...clinicalEventCommand,
  commandId: "wrong-axis-command",
  eventId: "wrong-axis-event",
  sourceId: "wrong-axis-source",
  axis: "trust"
}), /axis must be exactly one of/i);
assert.throws(() => runtime.recordEvent(initialized, {
  ...clinicalEventCommand,
  commandId: "reason-command",
  eventId: "reason-event",
  sourceId: "reason-source",
  reason: "arbitrary free text"
}), /free-text field reason/i);
assert.throws(() => runtime.recordEvent(initialized, {
  ...clinicalEventCommand,
  commandId: "clinical-truth-command",
  eventId: "clinical-truth-event",
  sourceId: "clinical-truth-source",
  clinicalTruth: { diagnosisId: "anything" }
}), /clinical truth.*clinicalTruth/i);

const maxBaseline = runtime.initializeBaseline(runtime.createState(), {
  ...baselineCommand,
  commandId: "max-baseline-command",
  catalogId: "synthetic-max-catalog",
  scores: { clinical: Number.MAX_VALUE, communication: 0, accessibility: 0, organization: 0 }
}).state;
const maxBaselineBefore = copy(maxBaseline);
assert.throws(() => runtime.recordEvent(maxBaseline, {
  commandId: "overflow-command",
  eventId: "overflow-event",
  sourceType: "synthetic-overflow",
  sourceId: "synthetic-overflow-1",
  axis: "clinical",
  delta: Number.MAX_VALUE
}), /non-finite clinical score.*not clamped/i);
assert.deepEqual(maxBaseline, maxBaselineBefore, "rejected overflow must not mutate state");

const afterOrganization = runtime.recordEvent(afterClinical, organizationEventCommand).state;
assert.deepEqual(afterOrganization.scores, {
  clinical: 16.75,
  communication: -3,
  accessibility: 0,
  organization: 998.625
});
assert.deepEqual(afterOrganization.auditHistory.slice(0, 2), afterClinical.auditHistory,
  "append-only recording must preserve the existing audit prefix");

const beforeReversal = copy(afterOrganization);
const reversalCommandBefore = copy(reversalCommand);
const reversalResult = runtime.reverseEvent(afterOrganization, reversalCommand);
assert.deepEqual(afterOrganization, beforeReversal, "reverseEvent must not mutate caller state");
assert.deepEqual(reversalCommand, reversalCommandBefore, "reverseEvent must not mutate caller command");
assert.equal(reversalResult.idempotent, false);
const reversed = reversalResult.state;
assert.deepEqual(reversed.scores, {
  clinical: 12.5,
  communication: -3,
  accessibility: 0,
  organization: 998.625
});
assert.deepEqual(reversed.auditHistory.slice(0, 3), afterOrganization.auditHistory,
  "a reversal must append an inverse entry without rewriting its target");
assert.deepEqual(reversed.auditHistory.map((entry) => entry.sequence), [0, 1, 2, 3],
  "append-only audit sequence must be contiguous");
assert.deepEqual(reversalResult.reversal, {
  schemaVersion: 1,
  sequence: 3,
  type: "axis_delta_reversed",
  commandId: reversalCommand.commandId,
  reversalId: reversalCommand.reversalId,
  targetEventId: reversalCommand.targetEventId,
  sourceType: reversalCommand.sourceType,
  sourceId: reversalCommand.sourceId,
  axis: "clinical",
  delta: -4.25
});
assert.match(reversed.commandFingerprints[reversalCommand.commandId], /^reverse_event:[0-9a-f]{16}$/);
assert.deepEqual(runtime.summarizeState(reversed), {
  schemaVersion: 1,
  initialized: true,
  catalogId: "synthetic-reputation-catalog",
  catalogVersion: "fixture-1",
  catalogStatus: "approved",
  scores: reversed.scores,
  auditEntryCount: 4,
  eventCount: 2,
  reversalCount: 1,
  activeEventCount: 1,
  appliedCommandCount: 4
});

const reloaded = runtime.deserializeState(runtime.serializeState(reversed));
assert.deepEqual(reloaded, reversed, "scores, sources, fingerprints and audit history must survive reload");
assert.equal(runtime.recordEvent(reloaded, organizationEventCommand).idempotent, true,
  "an exact event replay must remain idempotent after reload");
assert.throws(() => runtime.recordEvent(reloaded, {
  ...organizationEventCommand,
  delta: -2
}), /command id conflict.*different content/i,
  "a conflicting event command reuse must remain rejected after reload");
assert.equal(runtime.reverseEvent(reloaded, reversalCommand).idempotent, true,
  "an exact reversal replay must remain idempotent after reload");
assert.throws(() => runtime.reverseEvent(reloaded, {
  ...reversalCommand,
  targetEventId: organizationEventCommand.eventId
}), /command id conflict.*different content/i);
assert.throws(() => runtime.reverseEvent(reloaded, {
  commandId: "synthetic-reversal-command-2",
  reversalId: "synthetic-reversal-2",
  targetEventId: clinicalEventCommand.eventId,
  sourceType: "synthetic-correction",
  sourceId: "synthetic-correction-2"
}), /already been reversed/i);
assert.throws(() => runtime.reverseEvent(reloaded, {
  commandId: "synthetic-reversal-unknown-command",
  reversalId: "synthetic-reversal-unknown",
  targetEventId: "synthetic-event-unknown",
  sourceType: "synthetic-correction",
  sourceId: "synthetic-correction-unknown"
}), /unknown reputation event/i);
assert.throws(() => runtime.reverseEvent(afterOrganization, {
  ...reversalCommand,
  commandId: "synthetic-reversal-duplicate-source-command",
  reversalId: "synthetic-reversal-duplicate-source",
  sourceType: clinicalEventCommand.sourceType,
  sourceId: clinicalEventCommand.sourceId
}), /source synthetic-outcome\/synthetic-outcome-1 is already owned/i);
assert.throws(() => runtime.reverseEvent(afterOrganization, {
  ...reversalCommand,
  commandId: "synthetic-reversal-with-delta-command",
  reversalId: "synthetic-reversal-with-delta",
  sourceId: "synthetic-correction-with-delta",
  delta: -4.25
}), /unsupported field delta/i);

const reorderedPersisted = copy(reversed);
reorderedPersisted.catalog = {
  status: reorderedPersisted.catalog.status,
  catalogVersion: reorderedPersisted.catalog.catalogVersion,
  catalogId: reorderedPersisted.catalog.catalogId
};
reorderedPersisted.scores = {
  organization: reorderedPersisted.scores.organization,
  accessibility: reorderedPersisted.scores.accessibility,
  communication: reorderedPersisted.scores.communication,
  clinical: reorderedPersisted.scores.clinical
};
reorderedPersisted.appliedCommandIds.reverse();
reorderedPersisted.commandFingerprints = Object.fromEntries(
  Object.entries(reorderedPersisted.commandFingerprints).reverse()
);
const reorderedPersistedBefore = copy(reorderedPersisted);
assert.deepEqual(runtime.normalizeState(reorderedPersisted), reversed);
assert.deepEqual(reorderedPersisted, reorderedPersistedBefore, "normalizeState must not mutate caller state");
assert.equal(runtime.serializeState(reorderedPersisted), runtime.serializeState(reversed),
  "normalization must make persistence deterministic without reordering audit history");

const createStateInput = copy(reversed);
const createStateInputBefore = copy(createStateInput);
assert.deepEqual(runtime.createState(createStateInput), reversed);
assert.deepEqual(createStateInput, createStateInputBefore, "createState must not mutate imported caller state");

const corruptScore = copy(reversed);
corruptScore.scores.communication += 1;
assert.match(runtime.validateState(corruptScore).errors[0], /scores do not match.*audit history/i);

const corruptDelta = copy(reversed);
corruptDelta.auditHistory[1].delta += 1;
assert.match(runtime.validateState(corruptDelta).errors[0], /fingerprint has different content/i);

const corruptFingerprint = copy(reversed);
delete corruptFingerprint.commandFingerprints[organizationEventCommand.commandId];
assert.match(runtime.validateState(corruptFingerprint).errors[0], /has no exact fingerprint/i);

const corruptSource = copy(reversed);
corruptSource.auditHistory[2].sourceType = corruptSource.auditHistory[1].sourceType;
corruptSource.auditHistory[2].sourceId = corruptSource.auditHistory[1].sourceId;
assert.match(runtime.validateState(corruptSource).errors[0], /source .* is already owned/i);

const corruptSecondReversal = copy(reversed);
corruptSecondReversal.auditHistory.push({
  ...copy(corruptSecondReversal.auditHistory[3]),
  sequence: corruptSecondReversal.auditHistory.length,
  commandId: "corrupt-second-reversal-command",
  reversalId: "corrupt-second-reversal",
  sourceType: "corrupt-source",
  sourceId: "corrupt-source-2"
});
assert.match(runtime.validateState(corruptSecondReversal).errors[0], /more than one reversal/i);

const corruptCatalog = copy(reversed);
corruptCatalog.catalog.catalogVersion = "fixture-2";
assert.match(runtime.validateState(corruptCatalog).errors[0], /catalog does not match.*baseline/i);

const corruptSequence = copy(reversed);
corruptSequence.auditHistory[2].sequence = 9;
assert.match(runtime.validateState(corruptSequence).errors[0], /non-contiguous sequence/i);

const reorderedAudit = copy(reversed);
[reorderedAudit.auditHistory[1], reorderedAudit.auditHistory[2]] = [
  reorderedAudit.auditHistory[2],
  reorderedAudit.auditHistory[1]
];
assert.match(runtime.validateState(reorderedAudit).errors[0], /non-contiguous sequence/i,
  "persisted audit order cannot be silently normalized or rewritten");

const dirtyUninitialized = copy(empty);
dirtyUninitialized.appliedCommandIds.push("orphan-command");
assert.match(runtime.validateState(dirtyUninitialized).errors[0], /uninitialized.*cannot contain/i);

const unsupportedHistoryField = copy(reversed);
unsupportedHistoryField.auditHistory[1].reason = "free text";
assert.match(runtime.validateState(unsupportedHistoryField).errors[0], /free-text field reason/i);

assert.equal(runtime.validateState({ ...empty, schemaVersion: 2 }).valid, false);
assert.equal(runtime.validateState({ ...empty, unsupported: true }).valid, false);
assert.throws(() => runtime.deserializeState("{"), /Cannot parse reputation state/);
assert.throws(() => runtime.deserializeState(" "), /non-empty JSON string/);

const cyclic = {};
cyclic.self = cyclic;
assert.throws(() => runtime.createState({ commandFingerprints: cyclic }), /contains a cycle/);

const normalizedCopy = runtime.normalizeState(reversed);
normalizedCopy.scores.clinical = -999;
assert.notDeepEqual(normalizedCopy, reversed, "normalization must return a caller-owned copy");
assert.equal(runtime.validateState(reversed).valid, true, "mutating a normalized copy must not affect its input");

console.log("reputation-runtime-v6 tests passed");
