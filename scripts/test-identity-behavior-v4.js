#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const api = require(path.join(root, "systems/identity-behavior-v4.js"));

function ownerInput(sourceIdentity, profileId, traits, appearance) {
  return {
    campaignIdentity: "authored-campaign-fixture",
    sourceIdentity,
    persistentProfile: {
      profileId,
      name: `authored-${sourceIdentity}`,
      traits,
      visibleCues: [`authored-visible-cue-${profileId}`]
    },
    currentState: {
      irritation: 10,
      anxiety: 30,
      trust: 60,
      understanding: 55
    },
    appearance
  };
}

function emptyEffects() {
  return { stateSet: {}, stateDeltas: {}, factAvailability: [] };
}

function actionFixture(overrides = {}) {
  return {
    actionId: "authored-low-stress-action",
    label: "Authored fixture label",
    timeMinutes: 4,
    resourceRequirements: [],
    effects: {
      stateSet: {},
      stateDeltas: { fear: -5 },
      factAvailability: []
    },
    safeAlternatives: [],
    temperamentRules: [{
      ruleId: "authored-low-restraint-rule",
      when: { field: "restraintTolerance", operator: "lte", value: 30 },
      timeDeltaMinutes: 3,
      resourceRequirements: [{ capabilityId: "authored-assistant-capability", quantity: 1 }],
      effects: {
        stateSet: {},
        stateDeltas: { handlingTolerance: 10, sampleQuality: -15 },
        factAvailability: [{ factId: "required-observation", available: false }]
      },
      safeAlternatives: [{
        factId: "required-observation",
        alternativeId: "authored-safe-route",
        kind: "referral",
        payload: { capabilityId: "authored-referral-capability" }
      }]
    }],
    ...overrides
  };
}

// Appearance and behavior are many-to-many. Identity derivation does not inspect either.
const sharedAppearance = { spriteId: "authored-shared-sprite", paletteId: "authored-palette-a" };
const calmTraits = { patience: 80, baselineAnxiety: 20, clinicTrust: 70 };
const differentTraits = { patience: 35, baselineAnxiety: 78, clinicTrust: 42 };
const ownerA = api.createOwnerIdentity(ownerInput("owner-source-a", "authored-profile-a", calmTraits, sharedAppearance));
const ownerB = api.createOwnerIdentity(ownerInput("owner-source-b", "authored-profile-b", differentTraits, sharedAppearance));
const ownerC = api.createOwnerIdentity(ownerInput(
  "owner-source-c",
  "authored-profile-a",
  calmTraits,
  { spriteId: "authored-different-sprite", paletteId: "authored-palette-b" }
));
assert.deepEqual(ownerA.appearance, ownerB.appearance);
assert.notDeepEqual(ownerA.persistentProfile.traits, ownerB.persistentProfile.traits);
assert.deepEqual(ownerA.persistentProfile.traits, ownerC.persistentProfile.traits);
assert.notDeepEqual(ownerA.appearance, ownerC.appearance);

const ownerAWithAnotherPresentation = api.createOwnerIdentity(ownerInput(
  "owner-source-a",
  "authored-profile-b",
  differentTraits,
  { spriteId: "authored-recast-sprite" }
));
assert.equal(ownerAWithAnotherPresentation.ownerId, ownerA.ownerId);
assert.equal(
  ownerA.ownerId,
  api.stableIdentityId("owner", "authored-campaign-fixture", "owner-source-a")
);
assert.notEqual(
  api.stableIdentityId("owner", "campaign|segment", "source"),
  api.stableIdentityId("owner", "campaign", "segment|source")
);
assert.equal(api.validateOwnerIdentity(ownerA).valid, true);
assert.deepEqual(ownerA.persistentProfile.visibleCues, ["authored-visible-cue-authored-profile-a"]);

// Explicit temperament affects only process state, time and fact access.
const patient = api.createPatientIdentity({
  campaignIdentity: "authored-campaign-fixture",
  sourceIdentity: "patient-source-a",
  persistentProfile: {
    name: "authored-patient",
    species: "dog",
    ageYears: 7.5,
    ownerIds: [ownerA.ownerId],
    temperament: {
      boldness: 25,
      restraintTolerance: 20,
      touchSensitivity: 75
    }
  },
  currentState: {
    fear: 70,
    pain: 20,
    arousal: 65,
    handlingTolerance: 25,
    sampleQuality: 75
  },
  appearance: { spriteId: "authored-patient-sprite" }
});
const processResult = api.applyLowStressAction({
  patient,
  factAccess: [{ factId: "required-observation", required: true, available: true }],
  action: actionFixture()
});
assert.equal(patient.currentState.fear, 70);
assert.equal(patient.currentState.sampleQuality, 75);
assert.equal(processResult.patient.patientId, patient.patientId);
assert.deepEqual(processResult.patient.persistentProfile, patient.persistentProfile);
assert.equal(processResult.patient.persistentProfile.ageYears, 7.5);
assert.equal(processResult.timeMinutes, 7);
assert.equal(processResult.patient.currentState.fear, 65);
assert.equal(processResult.patient.currentState.handlingTolerance, 35);
assert.equal(processResult.patient.currentState.sampleQuality, 60);
assert.equal(processResult.factAccess[0].available, false);
assert.deepEqual(processResult.factAccess[0].safeAlternative, {
  factId: "required-observation",
  alternativeId: "authored-safe-route",
  kind: "referral",
  payload: { capabilityId: "authored-referral-capability" }
});
assert.deepEqual(processResult.appliedTemperamentRuleIds, ["authored-low-restraint-rule"]);
assert.deepEqual(processResult.resourceRequirements, [
  { capabilityId: "authored-assistant-capability", quantity: 1 }
]);
assert.equal(JSON.stringify(processResult).toLowerCase().includes("diagnosis"), false);

const actionWithTruthChannel = { ...actionFixture(), diagnosisTruth: "not-allowed" };
assert.equal(api.validateLowStressAction(actionWithTruthChannel).valid, false);
assert.match(api.validateLowStressAction(actionWithTruthChannel).errors[0], /unsupported field diagnosisTruth/);
assert.equal(api.validateLowStressAction({
  ...actionFixture(),
  effects: { ...emptyEffects(), stateSet: { diagnosis: 10 } }
}).valid, false);

// A required inaccessible fact is rejected until an authored safe alternative exists.
const blockedAction = actionFixture({
  temperamentRules: [{
    ...actionFixture().temperamentRules[0],
    safeAlternatives: []
  }]
});
assert.throws(() => api.applyLowStressAction({
  patient,
  factAccess: [{ factId: "required-observation", required: true, available: true }],
  action: blockedAction
}), /without an explicitly authored safe alternative/);
assert.deepEqual(api.validateRequiredFactPaths([
  { factId: "required-observation", required: true, available: false }
]), {
  valid: false,
  errors: ["required_fact_without_safe_alternative:required-observation"]
});
assert.equal(api.validateRequiredFactPaths(processResult.factAccess).valid, true);

// Repeat visits preserve the stable identity and append, rather than replace, history.
const withFirstVisit = api.appendHistory(patient, {
  eventId: "authored-history-1",
  at: 100,
  type: "visit_completed",
  sourceVisitId: "authored-visit-1",
  payload: { observation: "authored fixture observation" }
});
const withRepeat = api.updateCurrentState(withFirstVisit, { fear: 45 }, {
  eventId: "authored-history-2",
  at: 1540,
  type: "repeat_visit_opened",
  sourceVisitId: "authored-visit-2"
});
assert.equal(withRepeat.patientId, patient.patientId);
assert.equal(withRepeat.history.length, 2);
assert.equal(withRepeat.history[0].eventId, "authored-history-1");
assert.equal(withRepeat.history[1].eventId, "authored-history-2");
assert.equal(withRepeat.currentState.fear, 45);
assert.deepEqual(api.appendHistory(withRepeat, withRepeat.history[1]), withRepeat);
assert.throws(() => api.appendHistory(withRepeat, {
  ...withRepeat.history[1],
  type: "conflicting-event"
}), /conflicts with the persisted event/);
const restored = JSON.parse(JSON.stringify(withRepeat));
assert.equal(api.validatePatientIdentity(restored).valid, true);
assert.equal(restored.patientId, api.createPatientIdentity({
  campaignIdentity: "authored-campaign-fixture",
  sourceIdentity: "patient-source-a",
  persistentProfile: { name: "authored-patient" }
}).patientId);

// The registry owns entities once and requires exact, reciprocal links.
const linkedOwnerId = api.stableIdentityId(
  "owner",
  "authored-campaign-fixture",
  "linked-owner-source"
);
const linkedPatientId = api.stableIdentityId(
  "patient",
  "authored-campaign-fixture",
  "linked-patient-source"
);
const linkedOwner = api.createOwnerIdentity({
  campaignIdentity: "authored-campaign-fixture",
  sourceIdentity: "linked-owner-source",
  persistentProfile: {
    profileId: "authored-linked-owner-profile",
    relatedPatientIds: [linkedPatientId],
    traits: { responsibility: 72 },
    visibleCues: ["authored-linked-owner-cue"]
  }
});
const linkedPatient = api.createPatientIdentity({
  campaignIdentity: "authored-campaign-fixture",
  sourceIdentity: "linked-patient-source",
  persistentProfile: {
    name: "authored-linked-patient",
    species: "cat",
    ageYears: 4,
    ownerIds: [linkedOwnerId]
  }
});
const registry = api.createIdentityRegistry({
  campaignIdentity: "authored-campaign-fixture",
  owners: { [linkedOwnerId]: linkedOwner },
  patients: { [linkedPatientId]: linkedPatient }
});
assert.equal(api.validateIdentityRegistry(registry).valid, true);
assert.deepEqual(JSON.parse(JSON.stringify(registry)), registry);
assert.deepEqual(api.createIdentityRegistry({
  campaignIdentity: "authored-empty-campaign"
}), {
  schemaVersion: 1,
  campaignIdentity: "authored-empty-campaign",
  owners: {},
  patients: {}
});
assert.equal(api.validateIdentityRegistry({
  ...registry,
  owners: { "wrong-owner-key": linkedOwner }
}).valid, false);
assert.match(api.validateIdentityRegistry({
  ...registry,
  owners: {
    [linkedOwnerId]: {
      ...linkedOwner,
      persistentProfile: { ...linkedOwner.persistentProfile, relatedPatientIds: [] }
    }
  }
}).errors[0], /not reciprocal/);
assert.match(api.validateIdentityRegistry({
  ...registry,
  campaignIdentity: "different-campaign"
}).errors[0], /different campaign/);

// Renderer cues are passed through only from authored rules and never from appearance.
const cueResult = api.evaluateObservableCues({
  ownerState: ownerB.currentState,
  patientState: processResult.patient.currentState,
  rules: [{
    ruleId: "authored-owner-anxiety-cue-rule",
    entity: "owner",
    when: { field: "anxiety", operator: "gte", value: 30 },
    cue: {
      cueId: "authored-owner-anxiety-cue",
      text: "Authored fixture cue",
      animationId: "authored-owner-animation"
    }
  }, {
    ruleId: "authored-unmatched-patient-cue-rule",
    entity: "patient",
    when: { field: "fear", operator: "gt", value: 99 },
    cue: { cueId: "authored-unmatched-cue", text: "Must remain hidden" }
  }]
});
assert.deepEqual(cueResult, [{
  ruleId: "authored-owner-anxiety-cue-rule",
  entity: "owner",
  cue: {
    cueId: "authored-owner-anxiety-cue",
    text: "Authored fixture cue",
    animationId: "authored-owner-animation"
  }
}]);
assert.throws(() => api.evaluateObservableCues({
  ownerState: ownerA.currentState,
  rules: [{
    ruleId: "truth-cue",
    entity: "owner",
    when: { field: "anxiety", operator: "gte", value: 0 },
    cue: { cueId: "bad-cue", diagnosisId: "not-allowed" }
  }]
}), /cannot carry clinical truth field diagnosisId/);

// No authored temperament, actions or cue rules means no generated values or defaults.
const sparsePatient = api.createPatientIdentity({
  campaignIdentity: "authored-campaign-fixture",
  sourceIdentity: "patient-source-without-behavior",
  persistentProfile: { name: "authored-sparse-patient", species: "cat" }
});
assert.equal(Object.prototype.hasOwnProperty.call(sparsePatient.persistentProfile, "temperament"), false);
assert.deepEqual(sparsePatient.currentState, {});
assert.equal(Object.prototype.hasOwnProperty.call(sparsePatient, "appearance"), false);
assert.deepEqual(api.evaluateObservableCues({ rules: [] }), []);
assert.deepEqual(api.evaluateLowStressActions({ patient: sparsePatient, factAccess: [], actions: [] }), []);
assert.equal(Object.prototype.hasOwnProperty.call(api, "DEFAULT_ACTIONS"), false);

assert.throws(() => api.createPatientIdentity({
  campaignIdentity: "authored-campaign-fixture",
  sourceIdentity: "non-serializable-patient",
  persistentProfile: { name: "authored-name" },
  appearance: { rendererHook() {} }
}), /JSON-serializable/);
assert.throws(() => api.createPatientIdentity({
  campaignIdentity: "authored-campaign-fixture",
  sourceIdentity: "negative-age-patient",
  persistentProfile: { name: "authored-name", ageYears: -1 }
}), /ageYears cannot be negative/);

console.log("identity-behavior-v4: deterministic identity, behavior, safe-path and no-invention checks passed");
