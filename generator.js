(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_GENERATOR = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SAVE_KEY = "pet-clinic-generator-v1";
  const GENERATOR_VERSION = "1.1.0";
  const SAVE_VERSION = 1;

  const animalNames = {
    dog: ["Бакс", "Рекс", "Лада", "Тайга", "Нора", "Ричи", "Сема", "Найда"],
    cat: ["Мурка", "Буся", "Тучка", "Ириска", "Рыжик", "Малыш", "Мята", "Клевер"],
    rabbit: ["Клевер", "Пончик", "Лаки", "Плюша", "Мята", "Рыжик"]
  };
  const ownerNames = ["Зайцева", "Орлова", "Иванова", "Петрова", "Лебедев", "Алиева", "Смирнов", "Ким", "Макаров"];
  const compatibleProfiles = ["calm", "anxious", "internet", "budget", "careless"];

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

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function pick(list, random) {
    return list[Math.floor(random() * list.length)];
  }

  function randomSeed() {
    const entropy = `${Date.now()}-${Math.random()}-${Math.random()}`;
    return `clinic-${hashString(entropy).toString(16).padStart(8, "0")}`;
  }

  function createMemoryStorage() {
    const values = new Map();
    return {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); }
    };
  }

  function loadState(storage, seed) {
    try {
      const saved = JSON.parse(storage.getItem(SAVE_KEY) || "null");
      if (saved && saved.saveVersion === SAVE_VERSION && saved.generatorVersion === GENERATOR_VERSION) {
        return saved;
      }
    } catch (error) {
      // A corrupt generator save must not prevent the clinic from opening.
    }
    return {
      saveVersion: SAVE_VERSION,
      generatorVersion: GENERATOR_VERSION,
      campaignSeed: seed || randomSeed(),
      difficulty: "standard",
      generatedDays: {},
      pendingFollowUps: [],
      seenCaseCounts: {}
    };
  }

  function persist(storage, state) {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function normalizeDayTwo(plan, context) {
    const completedDayOne = (context.caseJournal || []).filter((item) => item.day === 1);
    if (!completedDayOne.length) {
      const fallbackPatient = {
        ...plan.patients[0],
        source: "story",
        bookingLabel: "скрытые подробности",
        returnVisit: false,
        animal: "Рекс",
        owner: "Лебедев",
        profileId: "careless"
      };
      return {
        ...plan,
        title: plan.fallbackTitle,
        briefing: plan.fallbackBriefing,
        goals: [
          { id: "hiddenFact", label: "Выяснить скрытый факт", target: 1 },
          ...plan.goals.filter((goal) => goal.id !== "returns")
        ],
        patients: [fallbackPatient, ...plan.patients.slice(1)]
      };
    }

    const previous = completedDayOne[0];
    return {
      ...plan,
      patients: [{
        ...plan.patients[0],
        diseaseId: previous.diseaseId || plan.patients[0].diseaseId,
        animal: previous.animal,
        owner: previous.owner,
        species: previous.species,
        sex: previous.sex || plan.patients[0].sex,
        ageYears: previous.ageYears || plan.patients[0].ageYears
      }, ...plan.patients.slice(1)]
    };
  }

  function varyPatient(patient, random, index, day) {
    const result = clone(patient);
    if (result.source === "story" || result.source === "return" || result.urgency === "urgent") return result;

    const names = animalNames[result.species] || animalNames.dog;
    result.animal = pick(names, random);
    result.owner = result.owner.startsWith("приют") ? result.owner : pick(ownerNames, random);
    result.profileId = pick(compatibleProfiles, random);
    const jitter = Math.floor(random() * 5) * 5 - 10;
    result.arrivalMinute = Math.max(8 * 60 + 10, result.arrivalMinute + jitter);
    result.scenarioId = `D${day}-${String(index + 1).padStart(2, "0")}-${result.diseaseId}`;
    return result;
  }

  function validateDay(day) {
    const errors = [];
    const expectedVisits = { 1: 3, 2: 4, 3: 5, 4: 5, 5: 6 }[day.day];
    const expectedWaiting = { 1: 1, 2: 2, 3: 3, 4: 3, 5: 4 }[day.day];
    if (expectedVisits && day.patients.length !== expectedVisits) errors.push(`day ${day.day}: expected ${expectedVisits} visits`);
    if (expectedWaiting && day.maxWaiting !== expectedWaiting) errors.push(`day ${day.day}: maxWaiting must be ${expectedWaiting}`);
    const urgent = day.patients.filter((patient) => patient.urgency === "urgent").length;
    if (urgent > 1) errors.push(`day ${day.day}: more than one urgent visit`);
    if (day.day === 4 && urgent !== 1) errors.push("day 4: one urgent visit is required");
    const ids = new Set();
    day.patients.forEach((patient) => {
      const identity = `${patient.animal}|${patient.owner}|${patient.arrivalMinute}`;
      if (ids.has(identity)) errors.push(`day ${day.day}: duplicate visit identity`);
      ids.add(identity);
      if (!patient.diseaseId || !patient.bookingLabel) errors.push(`day ${day.day}: incomplete visit`);
    });
    return errors;
  }

  function fingerprint(day) {
    const structural = day.patients.map((patient) => [
      patient.diseaseId,
      patient.species,
      patient.source,
      patient.profileId,
      patient.arrivalMinute,
      Boolean(patient.returnVisit),
      patient.urgency || "routine"
    ]);
    return hashString(JSON.stringify(structural)).toString(16).padStart(8, "0");
  }

  function createGenerator(options = {}) {
    const storage = options.storage || (typeof localStorage !== "undefined" ? localStorage : createMemoryStorage());
    const campaign = options.campaign || { days: [] };
    const state = loadState(storage, options.seed);
    persist(storage, state);

    function getOrGenerateDay(dayNumber, context = {}) {
      const saved = state.generatedDays[String(dayNumber)];
      if (saved) return clone(saved);
      const source = campaign.days.find((day) => day.day === dayNumber);
      if (!source) return null;

      let day = clone(source);
      day.patients = day.patients.filter((patient) => !patient.disabledInStandard);
      if (dayNumber === 2) day = normalizeDayTwo(day, context);
      const random = mulberry32(hashString(`${state.campaignSeed}|${GENERATOR_VERSION}|day:${dayNumber}`));
      day.patients = day.patients.map((patient, index) => varyPatient(patient, random, index, dayNumber));
      day.generatorVersion = GENERATOR_VERSION;
      day.campaignSeed = state.campaignSeed;
      day.fingerprint = fingerprint(day);
      const errors = validateDay(day);
      if (errors.length) throw new Error(errors.join("; "));
      state.generatedDays[String(dayNumber)] = clone(day);
      persist(storage, state);
      return clone(day);
    }

    function metadata(dayNumber) {
      const day = state.generatedDays[String(dayNumber)];
      return {
        saveVersion: SAVE_VERSION,
        generatorVersion: GENERATOR_VERSION,
        campaignSeed: state.campaignSeed,
        generatedDays: Object.keys(state.generatedDays).map(Number).sort((left, right) => left - right),
        fingerprint: day ? day.fingerprint : null
      };
    }

    return { getOrGenerateDay, metadata };
  }

  return {
    SAVE_KEY,
    SAVE_VERSION,
    GENERATOR_VERSION,
    createGenerator,
    createMemoryStorage,
    validateDay,
    fingerprint,
    hashString
  };
});
