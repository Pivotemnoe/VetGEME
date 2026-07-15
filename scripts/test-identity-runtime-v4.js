#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const identityApi = require("../systems/identity-behavior-v4.js");
const runtime = require("../systems/identity-runtime-v4.js");

const campaignIdentity = "clinic-v2-authored-seed";
const authoredOwner = {
  name: "Орлова",
  profileId: "observant",
  profile: {
    traits: {
      patience: 70,
      anxiety: 38,
      observation: 92,
      trust: 62,
      conflict: 8,
      comprehension: 78,
      adherence: 85
    },
    visibleCues: ["называет время и частоту", "показывает фото или записи"]
  },
  appearance: { spriteId: "authored-owner-sprite" }
};

function visitPatient(visitId, originalVisitId = null) {
  return {
    id: visitId === "V2-00001" ? 1 : 9,
    owner: "Орлова",
    animal: "Тайга",
    species: "dog",
    sex: "самка",
    ageYears: 4,
    anxiety: 44,
    irritation: 12,
    trust: 67,
    stress: 91,
    v2Visit: {
      visitId,
      originalVisitId,
      owner: authoredOwner,
      patient: {
        animal: "Тайга",
        species: "dog",
        sex: "female",
        ageYears: 4,
        appearance: { spriteId: "authored-patient-sprite" }
      }
    }
  };
}

const initial = visitPatient("V2-00001");
const repeat = visitPatient("V2-00019", "V2-00001");
const appointment = {
  appointmentId: "AP-V2-00001-1",
  sourceVisitId: "V2-00001",
  patientId: "LP-V2-00001",
  patient: { animal: "Тайга", species: "dog", sex: "female", ageYears: 4 },
  owner: { name: "Орлова", profileId: "observant" }
};
const journal = {
  visitId: "V2-00001",
  appointmentId: "AP-V2-00001-1",
  animal: "Тайга",
  species: "dog",
  sex: "самка",
  ageYears: 4,
  owner: "Орлова"
};
const state = {
  queue: [repeat],
  arrivalSchedule: [{ minute: 600, template: initial }],
  appointments: [appointment],
  longitudinalPatients: {
    "LP-V2-00001": {
      sourceVisitId: "V2-00001",
      patient: { animal: "Тайга", species: "dog", sex: "female", ageYears: 4 },
      owner: { name: "Орлова", profileId: "observant" }
    }
  },
  caseJournal: [journal]
};

const registry = runtime.syncStateIdentityReferences(state, { campaignIdentity });
assert.equal(identityApi.validateIdentityRegistry(registry).valid, true);
assert.equal(Object.keys(registry.owners).length, 1);
assert.equal(Object.keys(registry.patients).length, 1);
assert.equal(initial.ownerId, repeat.ownerId);
assert.equal(initial.patientId, repeat.patientId);
assert.equal(appointment.ownerId, initial.ownerId);
assert.equal(appointment.patientId, "LP-V2-00001");
assert.equal(appointment.persistentPatientId, initial.patientId);
assert.equal(journal.patientId, initial.patientId);
assert.equal(initial.identitySourceVisitId, "V2-00001");
assert.deepEqual(initial.ownerStateSnapshot, { irritation: 12, anxiety: 44, trust: 67 });
assert.deepEqual(initial.patientStateSnapshot, {});

const ownerRecord = registry.owners[initial.ownerId];
const patientRecord = registry.patients[initial.patientId];
assert.deepEqual(ownerRecord.persistentProfile.traits, { patience: 70, observation: 92 });
assert.equal(Object.prototype.hasOwnProperty.call(ownerRecord.persistentProfile.traits, "baselineAnxiety"), false);
assert.deepEqual(ownerRecord.persistentProfile.visibleCues, authoredOwner.profile.visibleCues);
assert.deepEqual(ownerRecord.appearance, authoredOwner.appearance);
assert.equal(Object.prototype.hasOwnProperty.call(patientRecord.persistentProfile, "temperament"), false);
assert.deepEqual(patientRecord.appearance, { spriteId: "authored-patient-sprite" });
assert.equal(Object.prototype.hasOwnProperty.call(patientRecord.currentState, "fear"), false);
assert.deepEqual(runtime.authoredOwnerCues(registry, repeat), authoredOwner.profile.visibleCues);

const pair = runtime.appendVisitEvent(registry, repeat, {
  eventId: "visit:V2-00019:opened",
  at: 1530,
  type: "repeat_visit_opened",
  sourceVisitId: "V2-00019"
});
runtime.appendVisitEvent(registry, repeat, {
  eventId: "visit:V2-00019:opened",
  at: 1530,
  type: "repeat_visit_opened",
  sourceVisitId: "V2-00019"
});
assert.equal(pair.ownerId, initial.ownerId);
assert.equal(registry.owners[pair.ownerId].history.length, 1);
assert.equal(registry.patients[pair.patientId].history.length, 1);

const compactState = JSON.parse(JSON.stringify(state));
const expectedRegistry = JSON.parse(JSON.stringify(compactState.identityRegistry));
runtime.compactStateIdentityRegistry(compactState);
assert.equal(compactState.identityRegistry.storageFormat, runtime.COMPACT_STORAGE_FORMAT);
assert.equal(compactState.identityRegistry.overrides.length, 1, "authored visit history must survive as a compact delta");
assert.equal(compactState.queue[0].persistentOwnerId, undefined);
assert.equal(compactState.caseJournal[0].identitySourceVisitId, undefined);
runtime.hydrateStateIdentityRegistry(compactState);
assert.deepEqual(compactState.identityRegistry, expectedRegistry);
assert.equal(compactState.queue[0].persistentPatientId, repeat.patientId);
assert.deepEqual(compactState.queue[0].ownerStateSnapshot, { irritation: 12, anxiety: 44, trust: 67 });

const corruptCompactState = JSON.parse(JSON.stringify(compactState));
runtime.compactStateIdentityRegistry(corruptCompactState);
corruptCompactState.identityRegistry.overrides.push(corruptCompactState.identityRegistry.overrides[0]);
assert.throws(() => runtime.hydrateStateIdentityRegistry(corruptCompactState), /duplicated/);

const historicalVisit = visitPatient("V2-00001");
historicalVisit.ownerStateSnapshot = { irritation: 5, anxiety: 20, trust: 70 };
const currentRepeat = visitPatient("V2-00019", "V2-00001");
Object.assign(currentRepeat, { irritation: 30, anxiety: 80, trust: 40 });
const historicalState = {
  queue: [currentRepeat],
  arrivalSchedule: [],
  appointments: [],
  longitudinalPatients: {},
  caseJournal: [{
    visitId: "V2-00001",
    identitySourceVisitId: "V2-00001",
    owner: "Орлова",
    animal: "Тайга",
    species: "dog",
    sex: "female",
    ageYears: 4,
    ownerStateSnapshot: historicalVisit.ownerStateSnapshot,
    patientStateSnapshot: {}
  }]
};
const historicalRegistry = runtime.syncStateIdentityReferences(historicalState, { campaignIdentity });
const historicalOwnerId = historicalState.queue[0].persistentOwnerId;
assert.deepEqual(historicalRegistry.owners[historicalOwnerId].currentState, {
  irritation: 30,
  anxiety: 80,
  trust: 40
});
assert.deepEqual(historicalState.caseJournal[0].ownerStateSnapshot, {
  irritation: 5,
  anxiety: 20,
  trust: 70
});
runtime.compactStateIdentityRegistry(historicalState);
runtime.hydrateStateIdentityRegistry(historicalState);
assert.deepEqual(historicalState.caseJournal[0].ownerStateSnapshot, {
  irritation: 5,
  anxiety: 20,
  trust: 70
});
assert.deepEqual(historicalState.identityRegistry.owners[historicalOwnerId].currentState, {
  irritation: 30,
  anxiety: 80,
  trust: 40
});

const legacyJournalState = {
  queue: [],
  arrivalSchedule: [],
  appointments: [],
  longitudinalPatients: {},
  caseJournal: [{
    visitId: "LEGACY-1",
    owner: "Орлова",
    animal: "Тайга",
    species: "dog",
    sex: "самка",
    ageYears: 4,
    trust: 70
  }, {
    visitId: "LEGACY-2",
    identitySourceVisitId: "LEGACY-1",
    owner: "Орлова",
    animal: "Тайга",
    species: "dog",
    sex: "самка",
    ageYears: 4,
    trust: 40
  }]
};
const legacyRegistry = runtime.syncStateIdentityReferences(legacyJournalState, { campaignIdentity });
const legacyOwnerId = legacyJournalState.caseJournal[0].persistentOwnerId;
const legacyPatientId = legacyJournalState.caseJournal[0].persistentPatientId;
assert.deepEqual(legacyJournalState.caseJournal.map((entry) => entry.ownerStateSnapshot), [
  { trust: 70 },
  { trust: 40 }
]);
assert.deepEqual(legacyRegistry.owners[legacyOwnerId].currentState, { trust: 40 });
assert.equal(legacyRegistry.patients[legacyPatientId].persistentProfile.sex, "female");
const futureLegacyRepeat = visitPatient("LEGACY-3", "LEGACY-1");
assert.doesNotThrow(() => runtime.ensureIdentityPair(legacyRegistry, futureLegacyRepeat));
assert.equal(futureLegacyRepeat.v2Visit.patient.sex, "female");
assert.equal(runtime.ensureIdentityPair(legacyRegistry, futureLegacyRepeat).patientId, legacyPatientId);

const restored = JSON.parse(JSON.stringify(state));
const restoredRegistry = runtime.syncStateIdentityReferences(restored, { campaignIdentity });
assert.deepEqual(restoredRegistry, state.identityRegistry);
assert.equal(restored.queue[0].patientId, repeat.patientId);

const sparseState = { queue: [], arrivalSchedule: [], appointments: [], longitudinalPatients: {}, caseJournal: [] };
assert.deepEqual(runtime.syncStateIdentityReferences(sparseState, { campaignIdentity }), {
  schemaVersion: 1,
  campaignIdentity,
  owners: {},
  patients: {}
});
assert.throws(() => runtime.ensureIdentityPair(sparseState.identityRegistry, {
  owner: "Без стабильного источника",
  animal: "Пациент"
}), /Stable source visit identity is required/);

console.log("identity-runtime-v4: stable source policy, exact legacy mapping, compact storage and reload passed");
