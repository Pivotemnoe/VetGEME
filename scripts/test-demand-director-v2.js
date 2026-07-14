"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const demandApi = require("../generator/demand-director-v2.js");
const generatorApi = require("../generator/generator-v2.js");
const loader = require("../generator/content-loader-v2.js");

const contentRoot = path.resolve(__dirname, "../tier-01-v2/content");

function completedOutcomes(day, followUp = false) {
  return day.visits.map((visit, index) => ({
    visitId: visit.visitId,
    completed: true,
    quality: "correct",
    followUpRequested: followUp && index === 0,
    followUpAfterDays: 1
  }));
}

function visitIdentity(day) {
  return day.visits.map((visit) => ({
    visitId: visit.visitId,
    caseId: visit.caseId,
    source: visit.source,
    sourceCategory: visit.sourceCategory,
    patient: visit.patient,
    owner: {
      name: visit.owner.name,
      profileId: visit.owner.profileId,
      modifierId: visit.owner.modifierId,
      homeActionId: visit.owner.homeActionId
    },
    complaintId: visit.complaint.id,
    historyAnswerSelections: visit.historyAnswerSelections,
    arrivalMinute: visit.arrivalMinute
  }));
}

function campaignState(overrides = {}) {
  return {
    ownerTrust: 74,
    clinicalReliability: 74,
    awareness: 30,
    doctorsOnShift: 1,
    rooms: 1,
    staffSupport: 1,
    fatigue: 20,
    referralNetwork: true,
    ...overrides
  };
}

async function main() {
  const catalog = await loader.loadFromDirectory(contentRoot);
  const commonDemand = {
    day: 20,
    campaignSeed: "demand-determinism",
    generatorVersion: generatorApi.GENERATOR_VERSION,
    contentPackVersion: catalog.manifest.contentPackVersion
  };
  const sameA = demandApi.directDemand({ ...commonDemand, ...campaignState() });
  const sameB = demandApi.directDemand({ ...commonDemand, ...campaignState() });
  assert.deepEqual(sameA, sameB, "same seed and Campaign State changed demand");

  const lowTrust = demandApi.directDemand({
    ...commonDemand,
    campaignSeed: "low-trust",
    ...campaignState({ ownerTrust: 0, awareness: 0, clinicalReliability: 25 })
  });
  const highTrust = demandApi.directDemand({
    ...commonDemand,
    campaignSeed: "high-trust",
    ...campaignState({ ownerTrust: 100, awareness: 100, clinicalReliability: 100 })
  });
  assert.ok(lowTrust.potentialDemand >= demandApi.DEFAULT_CONFIG.minimumPlayableDemand, "low trust stopped demand completely");
  assert.ok(highTrust.potentialDemand <= demandApi.DEFAULT_CONFIG.maximumPotentialDemand, "high trust created unbounded demand");
  assert.ok(highTrust.potentialDemand > lowTrust.potentialDemand, "trust and awareness did not affect demand");

  const rested = demandApi.directDemand({ ...commonDemand, campaignSeed: "capacity", ...campaignState({ fatigue: 0 }) });
  const exhausted = demandApi.directDemand({ ...commonDemand, campaignSeed: "capacity", ...campaignState({ fatigue: 100 }) });
  const expanded = demandApi.directDemand({
    ...commonDemand,
    campaignSeed: "capacity",
    ...campaignState({ doctorsOnShift: 2, rooms: 2, fatigue: 0 })
  });
  assert.ok(exhausted.capacity.safeCapacity < rested.capacity.safeCapacity, "fatigue did not reduce capacity");
  assert.ok(expanded.capacity.safeCapacity > rested.capacity.safeCapacity, "second doctor and room did not increase capacity");

  const withoutImaging = demandApi.directDemand({
    ...commonDemand,
    campaignSeed: "equipment-attraction",
    ...campaignState({ clinicalReliability: 100 })
  });
  const withImaging = demandApi.directDemand({
    ...commonDemand,
    campaignSeed: "equipment-attraction",
    ...campaignState({
      clinicalReliability: 100,
      equipmentCapabilities: {
        xray: { owned: true, unlocked: true, operational: true, capacityPerDay: 4, maintenanceCost: 90 },
        ultrasound: { owned: true, unlocked: true, operational: true, capacityPerDay: 3, maintenanceCost: 110 }
      }
    })
  });
  assert.ok(withImaging.terms.clinicReferrals >= withoutImaging.terms.clinicReferrals, "equipment reduced incoming referrals");
  assert.equal(demandApi.availableEquipment(withImaging.capabilities).includes("xray"), true);
  assert.equal(demandApi.availableEquipment(withImaging.capabilities).includes("ultrasound"), true);

  const unsafeWithoutEquipment = demandApi.routingForCase({
    requiredEquipment: [],
    requiredForDefinitiveDiagnosis: ["xray"],
    requiredForTreatment: [],
    preferredEquipment: ["xray"],
    safeAlternatives: [],
    planOptions: []
  }, {});
  const safeWithoutEquipment = demandApi.routingForCase({
    requiredEquipment: [],
    requiredForDefinitiveDiagnosis: ["xray"],
    requiredForTreatment: [],
    preferredEquipment: ["xray"],
    safeAlternatives: ["urgent_referral"],
    planOptions: [{ id: "urgent_referral" }]
  }, {});
  assert.equal(unsafeWithoutEquipment.arrivalAllowedWithoutEquipment, false, "unsafe equipment gap remained eligible");
  assert.equal(safeWithoutEquipment.arrivalAllowedWithoutEquipment, true, "safe referral path was rejected");
  assert.equal(safeWithoutEquipment.safeReferralAvailable, true);

  const overflow = demandApi.directDemand({
    ...commonDemand,
    campaignSeed: "overflow",
    ...campaignState({ ownerTrust: 100, awareness: 100, safeDailyCapacity: 3, fatigue: 100 })
  });
  assert.equal(
    Object.values(overflow.excessDisposition).reduce((sum, value) => sum + value, 0),
    overflow.excessDemand,
    "excess demand disappeared"
  );

  const storage = generatorApi.createMemoryStorage();
  const generator = generatorApi.createGenerator({ catalog, seed: "generator-demand", storage });
  const plannedOne = generator.getOrGenerateDay(1, campaignState({ ownerTrust: 20 }));
  const regeneratedAttempt = generator.getOrGenerateDay(1, campaignState({ ownerTrust: 100, doctorsOnShift: 2, rooms: 2 }));
  assert.deepEqual(visitIdentity(regeneratedAttempt), visitIdentity(plannedOne), "created day changed after Campaign State changed");
  assert.deepEqual(regeneratedAttempt.demandSnapshot, plannedOne.demandSnapshot, "created demand snapshot changed");
  const reloaded = generatorApi.createGenerator({ catalog, seed: "ignored", storage });
  assert.deepEqual(visitIdentity(reloaded.getOrGenerateDay(1)), visitIdentity(plannedOne), "reload changed generated patients");
  const openedOne = generator.openDay(1);
  assert.ok(openedOne.visits.every((visit) => demandApi.SOURCE_CATEGORIES.includes(visit.sourceCategory)), "source category was not saved");
  generator.closeDay(1, completedOutcomes(openedOne, true));
  const dayTwo = generator.getOrGenerateDay(2, campaignState({ ownerTrust: 100, awareness: 100 }));
  assert.equal(dayTwo.demandSnapshot.inputs.ownerTrust, 100, "future day ignored changed Campaign State");

  const fullStorage = generatorApi.createMemoryStorage();
  const full = generatorApi.createGenerator({ catalog, seed: "thirty-day-demand", storage: fullStorage });
  const observedSources = new Set();
  for (let day = 1; day <= 30; day += 1) {
    const planned = full.getOrGenerateDay(day, campaignState({ fatigue: (day % 5) * 15 }));
    assert.equal(planned.visits.some((visit) => visit.source === "unplanned"), false, `day ${day} exposed walk-in before opening`);
    const opened = full.openDay(day);
    opened.visits.forEach((visit) => {
      observedSources.add(visit.sourceCategory);
      if (visit.sourceCategory === "clinic_referral") {
        assert.ok(
          visit.medicalContent.requiredEquipment.includes("microscope")
            || visit.medicalContent.equipmentAttractionTags?.length,
          `day ${day} clinic referral was not equipment-relevant`
        );
      }
    });
    full.closeDay(day, completedOutcomes(opened, day < 30));
  }
  const metadata = full.metadata(30);
  assert.equal(metadata.generatedDays.length, 30);
  assert.deepEqual(metadata.generatedDays, Array.from({ length: 30 }, (_, index) => index + 1));
  assert.ok(observedSources.has("campaign_teaching"));
  assert.ok(observedSources.has("campaign_story"));
  assert.ok(observedSources.has("follow_up"));
  assert.ok(observedSources.has("walk_in"));
  assert.ok(observedSources.has("emergency"));
  assert.ok(metadata.demandState.outgoingReferrals + metadata.demandState.noCapacity + metadata.demandState.ownerLeft >= 0);

  const version4State = JSON.parse(fullStorage.getItem(generatorApi.SAVE_KEY));
  const preservedDay = generatorApi.createGenerator({ catalog, storage: fullStorage }).getOrGenerateDay(1);
  const preservedFingerprint = version4State.generatedDays["1"].fingerprint;
  version4State.saveVersion = 4;
  version4State.generatorVersion = "tier-01-v2.1.0";
  delete version4State.demandDirectorVersion;
  delete version4State.demandState;
  Object.values(version4State.generatedDays).forEach((day) => {
    day.schemaVersion = 4;
    day.generatorVersion = "tier-01-v2.1.0";
    delete day.demandSnapshot;
    day.visits.forEach((visit) => { delete visit.sourceCategory; });
  });
  const migrationStorage = generatorApi.createMemoryStorage();
  migrationStorage.setItem(generatorApi.SAVE_KEY, JSON.stringify(version4State));
  const migrated = generatorApi.createGenerator({ catalog, storage: migrationStorage });
  const migratedDay = migrated.getOrGenerateDay(1);
  assert.deepEqual(
    visitIdentity(migratedDay).map(({ sourceCategory, ...visit }) => visit),
    visitIdentity(preservedDay).map(({ sourceCategory, ...visit }) => visit),
    "save 4 migration changed generated patients"
  );
  assert.equal(migratedDay.fingerprint, preservedFingerprint, "save 4 migration recalculated an existing day");
  assert.ok(migratedDay.visits.every((visit) => demandApi.SOURCE_CATEGORIES.includes(visit.sourceCategory)));

  console.log(JSON.stringify({
    status: "passed",
    demandDirectorVersion: demandApi.DEMAND_DIRECTOR_VERSION,
    deterministicDemand: true,
    boundedTrustDemand: true,
    capacityUsesStaffRoomsShiftAndFatigue: true,
    equipmentRegistry: Object.keys(demandApi.CAPABILITY_DEFINITIONS),
    safeEquipmentRouting: true,
    excessDemandPreserved: true,
    generatedDaysImmutable: true,
    reloadStable: true,
    thirtyDayCampaign: true,
    sourceCategoriesObserved: [...observedSources].sort(),
    saveVersion4Migration: true,
    day30Demand: metadata.demandState.lastDecision
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
