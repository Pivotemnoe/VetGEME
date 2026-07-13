"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const loader = require("../generator/content-loader-v2.js");
const generatorApi = require("../generator/generator-v2.js");
const compactApi = require("../generator/compact-visit-v2.js");
const adapter = require("../generator/game-adapter-v2.js");
const gameSaveApi = require("../generator/game-state-save.js");
const namespaces = require("../generator/save-namespaces.js");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    key(index) { return [...values.keys()][index] || null; },
    get length() { return values.size; }
  };
}

function quotaStorage(initial = {}) {
  const storage = memoryStorage(initial);
  const originalSet = storage.setItem.bind(storage);
  let blocked = false;
  storage.blockWrites = () => { blocked = true; };
  storage.setItem = (key, value) => {
    if (blocked) throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    originalSet(key, value);
  };
  return storage;
}

function utf16BytesForEntries(entries) {
  return [...entries].reduce((total, [key, value]) => total + (String(key).length + String(value).length) * 2, 0);
}

function utf16Bytes(storage) {
  return utf16BytesForEntries(storage.values.entries());
}

function outcomesFor(day) {
  return day.visits.map((visit, index) => ({
    visitId: visit.visitId,
    completed: true,
    quality: "correct",
    followUpRequested: day.day < 7 && index === 0,
    followUpAfterDays: 1,
    selectedPlanId: visit.medicalContent.planOptions[0]?.id || null
  }));
}

function extendCatalogToThirtyDays(source) {
  const catalog = compactApi.clone(source);
  catalog.casesById = Object.fromEntries(catalog.cases.map((item) => [item.id, item]));
  const template = catalog.dayPlan.days[catalog.dayPlan.days.length - 1];
  for (let day = 8; day <= 30; day += 1) {
    catalog.dayPlan.days.push({
      ...compactApi.clone(template),
      day,
      title: `Размер сохранения: день ${day}`,
      tutorial: null
    });
  }
  return catalog;
}

function makeJournalEntry(dayNumber, visit) {
  return {
    day: dayNumber,
    visitId: visit.visitId,
    animal: visit.patient.animal,
    species: visit.patient.species,
    sex: visit.patient.sex,
    ageYears: visit.patient.ageYears,
    diseaseId: visit.caseId,
    owner: visit.owner.name,
    doctor: "Алексей Морозов",
    ownerType: visit.owner.profile.label,
    complaint: visit.complaint.text,
    trueDiagnosis: visit.medicalContent.preliminaryDiagnosisLabel,
    selectedDiagnosis: visit.medicalContent.preliminaryDiagnosisLabel,
    treatment: visit.medicalContent.planOptions[0]?.label || "План не выбран",
    planType: "evidence",
    communication: "спокойно и подробно",
    visitTime: 28,
    trust: 72,
    quality: "correct",
    risk: 4,
    followUpRequested: Boolean(visit.medicalContent.planOptions[0]?.followUp)
  };
}

function saveGameSummary(storage, catalog, day, journal) {
  gameSaveApi.save(storage, "tier-01-v2", {
    phase: "summary",
    day,
    minute: 1080,
    dayEnd: 1080,
    money: 1350 + journal.length * 80,
    reputation: 74,
    queue: [],
    arrivalSchedule: [],
    caseJournal: journal,
    pendingReturns: [],
    doctors: [{ id: "doctor-a", fatigue: 40 }, { id: "doctor-b", fatigue: 12 }],
    summaryTitle: `День ${day} завершен`,
    summaryHtml: "Смена завершена."
  }, { catalog });
  storage.setItem("pet-clinic-generator-mode", "tier-01-v2");
}

function expandGeneratorSaveToVersion3(raw, catalog) {
  const state = JSON.parse(raw);
  state.saveVersion = 3;
  state.generatedDays = Object.fromEntries(Object.entries(state.generatedDays).map(([key, day]) => {
    const hydrated = compactApi.hydrateDay(day, catalog);
    hydrated.schemaVersion = 3;
    return [key, hydrated];
  }));
  state.pendingFollowUps = state.pendingFollowUps.map((item) => ({
    ...item,
    owner: compactApi.hydrateOwner(item.owner, catalog)
  }));
  return state;
}

function exactVisitSnapshot(visit) {
  return {
    visitId: visit.visitId,
    patient: visit.patient,
    owner: {
      name: visit.owner.name,
      profileId: visit.owner.profileId,
      modifierId: visit.owner.modifierId,
      homeActionId: visit.owner.homeActionId
    },
    complaint: visit.complaint,
    historyAnswerSelections: visit.historyAnswerSelections,
    generalExam: visit.medicalContent.generalExam,
    targetExam: visit.medicalContent.targetExam,
    diagnosticTests: visit.medicalContent.diagnosticTests,
    diagnosisOptions: visit.medicalContent.preliminaryDiagnosisOptions
  };
}

async function simulateCampaign(catalog, days, seed) {
  const storage = memoryStorage();
  const generator = generatorApi.createGenerator({ catalog, seed, storage });
  const journal = [];
  for (let dayNumber = 1; dayNumber <= days; dayNumber += 1) {
    const planned = generator.getOrGenerateDay(dayNumber);
    const reloadedBeforeOpen = generatorApi.createGenerator({ catalog, storage }).getOrGenerateDay(dayNumber);
    assert.deepEqual(exactVisitSnapshot(reloadedBeforeOpen.visits[0]), exactVisitSnapshot(planned.visits[0]));
    const opened = generator.openDay(dayNumber);
    const reloadedOpened = generatorApi.createGenerator({ catalog, storage }).openDay(dayNumber);
    assert.deepEqual(reloadedOpened.visits.map(exactVisitSnapshot), opened.visits.map(exactVisitSnapshot));
    journal.push(...opened.visits.map((visit) => makeJournalEntry(dayNumber, visit)));
    generator.closeDay(dayNumber, outcomesFor(opened));
  }
  saveGameSummary(storage, catalog, days, journal);
  return { storage, journal, generator };
}

function createFirstDaySnapshot(catalog, seed) {
  const storage = memoryStorage();
  const generator = generatorApi.createGenerator({ catalog, seed, storage });
  generator.getOrGenerateDay(1);
  gameSaveApi.save(storage, "tier-01-v2", {
    phase: "planning",
    day: 1,
    minute: 480,
    queue: [],
    arrivalSchedule: [],
    caseJournal: []
  }, { catalog });
  storage.setItem("pet-clinic-generator-mode", "tier-01-v2");
  return storage;
}

async function main() {
  const catalog = await loader.loadFromDirectory(path.resolve(__dirname, "../tier-01-v2/content"));

  const firstA = await simulateCampaign(catalog, 1, "compact-determinism");
  const firstB = await simulateCampaign(catalog, 1, "compact-determinism");
  const firstC = await simulateCampaign(catalog, 1, "compact-different-seed");
  const firstDayA = generatorApi.createGenerator({ catalog, storage: firstA.storage }).getOrGenerateDay(1);
  const firstDayB = generatorApi.createGenerator({ catalog, storage: firstB.storage }).getOrGenerateDay(1);
  const firstDayC = generatorApi.createGenerator({ catalog, storage: firstC.storage }).getOrGenerateDay(1);
  assert.deepEqual(firstDayA.visits.map(exactVisitSnapshot), firstDayB.visits.map(exactVisitSnapshot));
  assert.notDeepEqual(firstDayA.visits.map(exactVisitSnapshot), firstDayC.visits.map(exactVisitSnapshot));

  const migrationSource = await simulateCampaign(catalog, 2, "compact-v3-migration");
  const compactRaw = migrationSource.storage.getItem(generatorApi.SAVE_KEY);
  const version3 = expandGeneratorSaveToVersion3(compactRaw, catalog);
  const migrationStorage = memoryStorage({ [generatorApi.SAVE_KEY]: JSON.stringify(version3) });
  const beforeMigration = exactVisitSnapshot(version3.generatedDays["1"].visits[0]);
  const migrated = generatorApi.createGenerator({ catalog, storage: migrationStorage });
  assert.deepEqual(exactVisitSnapshot(migrated.getOrGenerateDay(1).visits[0]), beforeMigration);
  const migratedRaw = migrationStorage.getItem(generatorApi.SAVE_KEY);
  assert.equal(JSON.parse(migratedRaw).saveVersion, 4);
  assert.equal(migratedRaw.includes("medicalContent"), false);
  assert.equal(JSON.parse(migratedRaw).campaignSeed, version3.campaignSeed);
  assert.deepEqual(Object.keys(JSON.parse(migratedRaw).generatedDays), Object.keys(version3.generatedDays));
  assert.deepEqual(JSON.parse(migratedRaw).completedCases, version3.completedCases);
  assert.deepEqual(JSON.parse(migratedRaw).pendingFollowUps, version3.pendingFollowUps.map((item) => ({
    ...item,
    owner: compactApi.compactOwner(item.owner)
  })));
  assert.deepEqual(JSON.parse(migratedRaw).generatedDays["1"].outcomes, version3.generatedDays["1"].outcomes);
  assert.equal(JSON.parse(migratedRaw).generatedDays["1"].visits[0].selectedPlanId, version3.generatedDays["1"].outcomes[0].selectedPlanId);
  assert.deepEqual(JSON.parse(migratedRaw).generatedDays["1"].visits[0].outcome, version3.generatedDays["1"].outcomes[0]);

  const repeatStorage = memoryStorage();
  const repeatGenerator = generatorApi.createGenerator({ catalog, seed: "compact-follow-up", storage: repeatStorage });
  const repeatDayOne = repeatGenerator.openDay(1);
  const original = repeatDayOne.visits[0];
  repeatGenerator.closeDay(1, [{
    visitId: original.visitId,
    completed: true,
    followUpRequested: true,
    followUpAfterDays: 1,
    followUpReason: "planned_control"
  }]);
  const repeatDayTwo = repeatGenerator.openDay(2);
  repeatGenerator.closeDay(2, outcomesFor(repeatDayTwo));
  const repeatDayThree = repeatGenerator.openDay(3);
  const followUp = [...repeatDayTwo.visits, ...repeatDayThree.visits].find((visit) => visit.originalVisitId === original.visitId);
  assert.ok(followUp, "follow-up visit was not restored");
  assert.equal(followUp.patient.animal, original.patient.animal);
  assert.equal(followUp.owner.name, original.owner.name);
  const repeatReloadGenerator = generatorApi.createGenerator({ catalog, storage: repeatStorage });
  const repeatReload = followUp.day === 2 ? repeatReloadGenerator.openDay(2) : repeatReloadGenerator.openDay(3);
  assert.deepEqual(exactVisitSnapshot(repeatReload.visits.find((visit) => visit.visitId === followUp.visitId)), exactVisitSnapshot(followUp));

  const partialStorage = memoryStorage();
  const partialGenerator = generatorApi.createGenerator({ catalog, seed: "compact-partial-visit", storage: partialStorage });
  const partialDay = partialGenerator.openDay(1);
  const partialPatient = adapter.patientFromVisit(partialDay.visits[0]);
  Object.assign(partialPatient, {
    id: 17,
    asked: { question_onset: true },
    findings: ["Собран анамнез", "Температура в норме"],
    generalExamDone: true,
    localUsed: 1,
    sampleTaken: true,
    microscopyDone: false,
    selectedDiagnosisIds: [],
    clinicalRecord: { history: ["Точный ответ владельца"], physicalExam: ["Осмотр выполнен"], investigations: [] }
  });
  const futureTemplate = adapter.patientFromVisit(partialDay.visits[1]);
  gameSaveApi.save(partialStorage, "tier-01-v2", {
    phase: "running",
    day: 1,
    queue: [partialPatient],
    arrivalSchedule: [{ minute: futureTemplate.arrivalMinute, template: futureTemplate }],
    activeId: 17,
    caseJournal: []
  }, { catalog });
  const compactGameRaw = partialStorage.getItem(namespaces.gameSaveKey("tier-01-v2"));
  assert.equal(compactGameRaw.includes("medicalContent"), false);
  const partialReload = gameSaveApi.load(partialStorage, "tier-01-v2", { catalog });
  assert.deepEqual(partialReload.state.queue[0].asked, partialPatient.asked);
  assert.deepEqual(partialReload.state.queue[0].clinicalRecord, partialPatient.clinicalRecord);
  assert.equal(partialReload.state.queue[0].v2Visit.complaint.text, partialPatient.v2Visit.complaint.text);
  assert.ok(partialReload.state.arrivalSchedule[0].template.v2Visit.medicalContent);

  const oldGameSnapshot = {
    gameStateSaveVersion: 1,
    generatorMode: "tier-01-v2",
    savedAt: "2026-07-13T00:00:00.000Z",
    state: { phase: "running", day: 1, queue: [partialPatient], arrivalSchedule: [{ minute: 600, template: futureTemplate }] }
  };
  const oldGameRaw = JSON.stringify(oldGameSnapshot);
  const gameMigrationStorage = memoryStorage({ [namespaces.gameSaveKey("tier-01-v2")]: oldGameRaw });
  const migratedGame = gameSaveApi.load(gameMigrationStorage, "tier-01-v2", { catalog });
  assert.equal(migratedGame.gameStateSaveVersion, 2);
  assert.ok(migratedGame.state.queue[0].v2Visit.medicalContent);
  assert.equal(gameMigrationStorage.getItem(namespaces.gameSaveKey("tier-01-v2")).includes("medicalContent"), false);

  for (const mode of ["current", "legacy-v1"]) {
    const isolated = memoryStorage();
    gameSaveApi.save(isolated, mode, { day: 3, queue: [{ id: 1, animal: "Бакс" }] });
    const raw = JSON.parse(isolated.getItem(namespaces.gameSaveKey(mode)));
    assert.equal(raw.gameStateSaveVersion, 1);
    assert.deepEqual(raw.state.queue, [{ id: 1, animal: "Бакс" }]);
  }

  const incompatibleGenerator = JSON.parse(migratedRaw);
  incompatibleGenerator.contentPackHash = "incompatible-hash";
  const incompatibleGeneratorRaw = JSON.stringify(incompatibleGenerator);
  const incompatibleGeneratorStorage = memoryStorage({ [generatorApi.SAVE_KEY]: incompatibleGeneratorRaw });
  assert.throws(() => generatorApi.createGenerator({ catalog, storage: incompatibleGeneratorStorage }), /migration required/);
  assert.equal(incompatibleGeneratorStorage.getItem(generatorApi.SAVE_KEY), incompatibleGeneratorRaw);

  const impossibleV3 = expandGeneratorSaveToVersion3(compactRaw, catalog);
  impossibleV3.generatedDays["1"].visits[0].owner.profileId = "missing-owner-profile";
  const impossibleV3Raw = JSON.stringify(impossibleV3);
  const impossibleStorage = memoryStorage({ [generatorApi.SAVE_KEY]: impossibleV3Raw });
  assert.throws(() => generatorApi.createGenerator({ catalog, storage: impossibleStorage }), /Unknown owner profile/);
  assert.equal(impossibleStorage.getItem(generatorApi.SAVE_KEY), impossibleV3Raw);

  const quotaGeneratorStorage = quotaStorage({ [generatorApi.SAVE_KEY]: JSON.stringify(version3) });
  quotaGeneratorStorage.blockWrites();
  assert.throws(() => generatorApi.createGenerator({ catalog, storage: quotaGeneratorStorage }), { name: "QuotaExceededError" });
  assert.equal(quotaGeneratorStorage.getItem(generatorApi.SAVE_KEY), JSON.stringify(version3));

  const impossibleGameSnapshot = compactApi.clone(oldGameSnapshot);
  impossibleGameSnapshot.state.queue[0].v2Visit.owner.profileId = "missing-owner-profile";
  const impossibleGameRaw = JSON.stringify(impossibleGameSnapshot);
  const impossibleGameStorage = memoryStorage({ [namespaces.gameSaveKey("tier-01-v2")]: impossibleGameRaw });
  assert.throws(() => gameSaveApi.load(impossibleGameStorage, "tier-01-v2", { catalog }), /Unknown owner profile/);
  assert.equal(impossibleGameStorage.getItem(namespaces.gameSaveKey("tier-01-v2")), impossibleGameRaw);

  const incompatibleGame = JSON.parse(compactGameRaw);
  incompatibleGame.state.queue[0].v2Visit.contentPackHash = "incompatible-hash";
  const incompatibleGameRaw = JSON.stringify(incompatibleGame);
  const incompatibleGameStorage = memoryStorage({ [namespaces.gameSaveKey("tier-01-v2")]: incompatibleGameRaw });
  assert.throws(() => gameSaveApi.load(incompatibleGameStorage, "tier-01-v2", { catalog }), /content pack mismatch/);
  assert.equal(incompatibleGameStorage.getItem(namespaces.gameSaveKey("tier-01-v2")), incompatibleGameRaw);

  const quotaGameMigrationStorage = quotaStorage({ [namespaces.gameSaveKey("tier-01-v2")]: oldGameRaw });
  quotaGameMigrationStorage.blockWrites();
  assert.throws(() => gameSaveApi.load(quotaGameMigrationStorage, "tier-01-v2", { catalog }), { name: "QuotaExceededError" });
  assert.equal(quotaGameMigrationStorage.getItem(namespaces.gameSaveKey("tier-01-v2")), oldGameRaw);

  const previousGameRaw = partialStorage.getItem(namespaces.gameSaveKey("tier-01-v2"));
  const quotaGameStorage = quotaStorage({ [namespaces.gameSaveKey("tier-01-v2")]: previousGameRaw });
  quotaGameStorage.blockWrites();
  assert.throws(() => gameSaveApi.save(quotaGameStorage, "tier-01-v2", { day: 2, queue: [partialPatient] }, { catalog }), { name: "QuotaExceededError" });
  assert.equal(quotaGameStorage.getItem(namespaces.gameSaveKey("tier-01-v2")), previousGameRaw);

  const week = await simulateCampaign(catalog, 7, "compact-size-week");
  const thirtyCatalog = extendCatalogToThirtyDays(catalog);
  const month = await simulateCampaign(thirtyCatalog, 30, "compact-size-month");
  const createdDayOneStorage = createFirstDaySnapshot(catalog, "compact-size-created-day");
  const compactSizes = {
    day1: utf16Bytes(createdDayOneStorage),
    day7: utf16Bytes(week.storage),
    day30: utf16Bytes(month.storage)
  };
  const legacySizes = {
    day1: utf16BytesForEntries([
      [generatorApi.SAVE_KEY, JSON.stringify(expandGeneratorSaveToVersion3(createdDayOneStorage.getItem(generatorApi.SAVE_KEY), catalog))],
      [namespaces.gameSaveKey("tier-01-v2"), createdDayOneStorage.getItem(namespaces.gameSaveKey("tier-01-v2"))],
      ["pet-clinic-generator-mode", "tier-01-v2"]
    ]),
    day7: utf16BytesForEntries([
      [generatorApi.SAVE_KEY, JSON.stringify(expandGeneratorSaveToVersion3(week.storage.getItem(generatorApi.SAVE_KEY), catalog))],
      [namespaces.gameSaveKey("tier-01-v2"), week.storage.getItem(namespaces.gameSaveKey("tier-01-v2"))],
      ["pet-clinic-generator-mode", "tier-01-v2"]
    ]),
    day30: utf16BytesForEntries([
      [generatorApi.SAVE_KEY, JSON.stringify(expandGeneratorSaveToVersion3(month.storage.getItem(generatorApi.SAVE_KEY), thirtyCatalog))],
      [namespaces.gameSaveKey("tier-01-v2"), month.storage.getItem(namespaces.gameSaveKey("tier-01-v2"))],
      ["pet-clinic-generator-mode", "tier-01-v2"]
    ])
  };
  assert.ok(compactSizes.day30 <= 2 * 1024 * 1024, `30-day save exceeds 2 MiB: ${compactSizes.day30}`);
  assert.ok(compactSizes.day30 <= 1.5 * 1024 * 1024, `30-day save exceeds preferred 1.5 MiB: ${compactSizes.day30}`);

  const monthState = JSON.parse(month.storage.getItem(generatorApi.SAVE_KEY));
  const missingStableIds = Object.values(monthState.generatedDays).flatMap(compactApi.missingStableIdReport);
  assert.equal(JSON.stringify(monthState).includes("medicalContent"), false);

  console.log(JSON.stringify({
    status: "passed",
    generatorSaveVersion: generatorApi.SAVE_VERSION,
    tierGameSaveVersion: gameSaveApi.TIER_01_V2_GAME_STATE_SAVE_VERSION,
    sameSeedStable: true,
    differentSeedDifferent: true,
    reloadEveryDayStable: true,
    version3Migration: true,
    followUpPreserved: true,
    partialVisitPreserved: true,
    incompatibleContentPackBlocked: true,
    impossibleMigrationPreservedSource: true,
    quotaPreservedPreviousSave: true,
    currentAndLegacyUnchanged: true,
    compactSizesUtf16Bytes: compactSizes,
    legacyEquivalentSizesUtf16Bytes: legacySizes,
    reductionPercent: Object.fromEntries(Object.keys(compactSizes).map((key) => [
      key,
      Number(((1 - compactSizes[key] / legacySizes[key]) * 100).toFixed(1))
    ])),
    missingStableIds,
    exactTextFieldsWithoutCatalogIds: ["bookingReason", "followUpReason", "outcome fields supplied by gameplay"]
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
