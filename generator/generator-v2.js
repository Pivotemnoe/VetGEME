(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_GENERATOR_V2 = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SAVE_KEY = "pet-clinic-generator-v2";
  const SAVE_VERSION = 2;
  const GENERATOR_VERSION = "tier-01-v2.0.0";
  const SUPPORTED_MODES = ["current", "legacy-v1", "tier-01-v2"];
  const DEFAULT_EQUIPMENT = ["otoscope", "microscope"];
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

  function createRandom(seed, scope) {
    return mulberry32(hashString(`${seed}|${GENERATOR_VERSION}|${scope}`));
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

  function migrateState(saved, seed) {
    if (saved && saved.saveVersion === SAVE_VERSION && saved.generatorVersion === GENERATOR_VERSION) return saved;
    if (saved) {
      return {
        ...saved,
        migrationRequired: true,
        expectedSaveVersion: SAVE_VERSION,
        expectedGeneratorVersion: GENERATOR_VERSION
      };
    }
    return {
      saveVersion: SAVE_VERSION,
      generatorVersion: GENERATOR_VERSION,
      campaignSeed: seed || randomSeed(),
      generatedDays: {},
      pendingFollowUps: [],
      completedCases: [],
      seenCaseCounts: {},
      nextVisitId: 1
    };
  }

  function loadState(storage, seed) {
    try {
      return migrateState(JSON.parse(storage.getItem(SAVE_KEY) || "null"), seed);
    } catch (error) {
      return migrateState(null, seed);
    }
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

  function ensureUrgentSelection(caseList, catalog, dayRule, random, seenCaseCounts) {
    if (caseList.some(caseIsUrgent) || dayRule.urgentSubset.max === 0) return caseList;
    if (dayRule.urgentSubset.min === 0 && random() >= 0.3) return caseList;
    const allowed = new Set(dayRule.urgentPool || []);
    const urgent = catalog.cases.filter((item) => (
      item.unlockDay <= dayRule.day && caseIsUrgent(item) && (!allowed.size || allowed.has(item.id))
    ));
    const replacement = weightedPick(urgent, random, (item) => 1 / (1 + (seenCaseCounts[item.id] || 0)));
    if (!replacement) throw new Error(`Day ${dayRule.day} requires an urgent case but none is compatible`);
    const index = caseList.findIndex((item) => !caseIsUrgent(item));
    caseList[index < 0 ? caseList.length - 1 : index] = replacement;
    return caseList;
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
    const missingEquipment = (caseData.requiredEquipment || []).filter((item) => !options.availableEquipment.includes(item));
    const safeReferralAvailable = Boolean(caseData.safeAlternatives?.length || caseData.planOptions.some((plan) => (
      /referral|urgent|transfer/i.test(plan.id) || plan.disabledWhenRedFlags === false
    )));
    return {
      visitId: `V2-${String(state.nextVisitId++).padStart(5, "0")}`,
      day: dayNumber,
      source,
      caseId: caseData.id,
      family: caseData.family,
      severity: caseData.severity,
      urgency: caseIsUrgent(caseData) ? "urgent" : caseData.severity,
      patient: identity,
      owner,
      complaint: clone(complaint),
      returnVisit: source === "follow_up",
      originalVisitId: options.originalVisitId || null,
      missingEquipment,
      requiresReferral: missingEquipment.length > 0,
      safeReferralAvailable,
      medicalContent: clone(caseData)
    };
  }

  function assignArrivals(visits, dayRule, random, includeUnplanned) {
    const start = minutesFromClock(dayRule.start);
    const end = minutesFromClock(dayRule.end);
    const visible = visits.filter((visit) => includeUnplanned || visit.source !== "unplanned");
    visible.forEach((visit, index) => {
      const segment = Math.max(25, Math.floor((end - start - 45) / Math.max(1, visible.length)));
      visit.arrivalMinute = Math.min(end - 30, start + 15 + index * segment + Math.floor(random() * Math.min(16, segment)));
    });
    return visits.sort((left, right) => (left.arrivalMinute || Infinity) - (right.arrivalMinute || Infinity));
  }

  function fingerprint(day) {
    const structure = {
      day: day.day,
      opened: day.opened,
      visits: day.visits.map((visit) => [
        visit.visitId,
        visit.caseId,
        visit.source,
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

  function validateGeneratedDay(day, catalog, equipment) {
    const errors = [];
    const rule = catalog.dayPlan.days.find((item) => item.day === day.day);
    if (!rule) return [`Unknown day ${day.day}`];
    if (day.visits.length + day.pendingUnplanned !== day.plannedVisitCount) errors.push("visit total does not match the persisted plan");
    if (day.plannedVisitCount < rule.visitsTotal.min || day.plannedVisitCount > rule.visitsTotal.max) errors.push("visit total outside day rules");
    const allowedSpecies = new Set(catalog.manifest.contentPolicy.allowedSpeciesTier01);
    const urgentCount = day.visits.filter((visit) => caseIsUrgent(visit.medicalContent)).length;
    if (day.opened && (urgentCount < rule.urgentSubset.min || urgentCount > rule.urgentSubset.max)) errors.push("urgent count outside day rules");
    day.visits.forEach((visit) => {
      if (!catalog.casesById[visit.caseId]) errors.push(`unknown case ${visit.caseId}`);
      if (!allowedSpecies.has(visit.patient.species)) errors.push(`unsupported species ${visit.patient.species}`);
      if (!caseSupportsOwner(visit.medicalContent, visit.owner.profileId)) errors.push(`owner ${visit.owner.profileId} incompatible with ${visit.caseId}`);
      if (visit.owner.homeAction && !visit.owner.homeAction.compatibleFamilies.includes(visit.family)) errors.push(`home action incompatible with ${visit.caseId}`);
      const missing = (visit.medicalContent.requiredEquipment || []).filter((item) => !equipment.includes(item));
      if (missing.length && !visit.safeReferralAvailable) errors.push(`missing safe referral for ${visit.caseId}`);
    });
    return errors;
  }

  function createGenerator(options = {}) {
    if (!options.catalog || options.catalog.schemaVersion !== 2) throw new Error("Tier 01 v2 catalog is required");
    const catalog = options.catalog;
    const storage = options.storage || (typeof localStorage !== "undefined" ? localStorage : createMemoryStorage());
    const equipment = options.availableEquipment || DEFAULT_EQUIPMENT;
    const state = loadState(storage, options.seed);
    if (state.migrationRequired) {
      throw new Error(`Generator save migration required: ${state.saveVersion || "unknown"}/${state.generatorVersion || "unknown"} -> ${SAVE_VERSION}/${GENERATOR_VERSION}`);
    }
    persist(storage, state);

    function getDayRule(dayNumber) {
      return catalog.dayPlan.days.find((item) => item.day === dayNumber) || null;
    }

    function getOrGenerateDay(dayNumber) {
      const key = String(dayNumber);
      if (state.generatedDays[key]) return clone(state.generatedDays[key]);
      const rule = getDayRule(dayNumber);
      if (!rule) return null;
      if (dayNumber > 1 && !state.generatedDays[String(dayNumber - 1)]?.closed) {
        throw new Error(`Day ${dayNumber - 1} must be closed before day ${dayNumber} is generated`);
      }
      const random = createRandom(state.campaignSeed, `day:${dayNumber}:plan`);
      const plannedVisitCount = integerBetween(rule.visitsTotal, random);
      const pendingUnplanned = integerBetween(rule.unplannedNew, random);
      const requestedFollowUps = integerBetween(rule.followUps, random);
      const availableFollowUps = state.pendingFollowUps.filter((item) => item.eligibleDay <= dayNumber);
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
      const hasUrgentFollowUp = selectedFollowUps.some((item) => caseIsUrgent(catalog.casesById[item.caseId]));
      const newCount = plannedVisitCount - pendingUnplanned - followUpCount;
      let selectedCases = selectNewCases(catalog, rule, newCount, random, {
        routineOnly: true,
        seenCaseCounts: state.seenCaseCounts
      });
      if (!hasUrgentFollowUp) {
        selectedCases = ensureUrgentSelection(selectedCases, catalog, rule, random, state.seenCaseCounts);
      }
      if (dayNumber === 1) {
        const tutorialIndex = selectedCases.findIndex((item) => item.tutorialEligible);
        if (tutorialIndex > 0) [selectedCases[0], selectedCases[tutorialIndex]] = [selectedCases[tutorialIndex], selectedCases[0]];
      }
      const visits = selectedCases.map((caseData, index) => createVisit(
        caseData,
        dayNumber,
        "booked",
        catalog,
        random,
        state,
        { tutorialActive: dayNumber === 1 && index === 0, availableEquipment: equipment }
      ));
      const followUpLines = catalog.owners["follow-up-lines"]?.lines || [];
      selectedFollowUps.forEach((followUp) => {
        const line = weightedPick(followUpLines, random, () => 1);
        visits.push(createVisit(catalog.casesById[followUp.caseId], dayNumber, "follow_up", catalog, random, state, {
          identity: followUp.patient,
          owner: followUp.owner,
          originalVisitId: followUp.originalVisitId,
          followUpLine: line,
          availableEquipment: equipment
        }));
      });
      const usedFollowUps = new Set(selectedFollowUps.map((item) => item.id));
      state.pendingFollowUps = state.pendingFollowUps.filter((item) => !usedFollowUps.has(item.id));
      assignArrivals(visits, rule, random, false);
      const day = {
        schemaVersion: SAVE_VERSION,
        generatorVersion: GENERATOR_VERSION,
        campaignSeed: state.campaignSeed,
        day: dayNumber,
        title: rule.title,
        start: rule.start,
        end: rule.end,
        tutorial: rule.tutorial,
        themeTags: clone(rule.themeTags),
        plannedVisitCount,
        pendingUnplanned,
        unplannedRange: clone(rule.unplannedNew),
        opened: false,
        closed: false,
        visits,
        fingerprint: null
      };
      day.fingerprint = fingerprint(day);
      const errors = validateGeneratedDay(day, catalog, equipment);
      if (errors.length) throw new Error(errors.join("; "));
      state.generatedDays[key] = clone(day);
      selectedCases.forEach((caseData) => {
        state.seenCaseCounts[caseData.id] = (state.seenCaseCounts[caseData.id] || 0) + 1;
      });
      persist(storage, state);
      return clone(day);
    }

    function openDay(dayNumber) {
      const day = getOrGenerateDay(dayNumber);
      if (day.opened) return day;
      const storedDay = state.generatedDays[String(dayNumber)];
      const rule = getDayRule(dayNumber);
      const random = createRandom(state.campaignSeed, `day:${dayNumber}:unplanned`);
      const selected = selectNewCases(catalog, rule, storedDay.pendingUnplanned, random, {
        routineOnly: true,
        seenCaseCounts: state.seenCaseCounts
      });
      selected.forEach((caseData) => {
        storedDay.visits.push(createVisit(caseData, dayNumber, "unplanned", catalog, random, state, { availableEquipment: equipment }));
        state.seenCaseCounts[caseData.id] = (state.seenCaseCounts[caseData.id] || 0) + 1;
      });
      storedDay.pendingUnplanned = 0;
      storedDay.opened = true;
      assignArrivals(storedDay.visits, rule, random, true);
      storedDay.fingerprint = fingerprint(storedDay);
      const errors = validateGeneratedDay(storedDay, catalog, equipment);
      if (errors.length) throw new Error(errors.join("; "));
      persist(storage, state);
      return clone(storedDay);
    }

    function closeDay(dayNumber, outcomes = []) {
      const day = state.generatedDays[String(dayNumber)];
      if (!day || !day.opened) throw new Error(`Day ${dayNumber} must be opened before it is closed`);
      if (day.closed) return clone(day);
      outcomes.filter((item) => item.completed).forEach((item) => {
        const visit = day.visits.find((candidate) => candidate.visitId === item.visitId);
        if (!visit) return;
        state.completedCases.push({ day: dayNumber, visitId: visit.visitId, caseId: visit.caseId, outcome: clone(item) });
        if (item.followUpRequested) {
          state.pendingFollowUps.push({
            id: `FU-${visit.visitId}`,
            caseId: visit.caseId,
            originalVisitId: visit.visitId,
            patient: clone(visit.patient),
            owner: clone(visit.owner),
            eligibleDay: Math.min(7, dayNumber + Math.max(1, Number(item.followUpAfterDays || 1)))
          });
        }
      });
      day.closed = true;
      day.outcomes = clone(outcomes);
      day.fingerprint = fingerprint(day);
      persist(storage, state);
      return clone(day);
    }

    function schedulePreview(dayNumber) {
      const day = getOrGenerateDay(dayNumber);
      return {
        day: day.day,
        booked: day.visits.filter((visit) => visit.source !== "unplanned").map((visit) => ({
          visitId: visit.visitId,
          animal: visit.patient.animal,
          species: visit.patient.species,
          bookedReason: visit.complaint.text,
          arrivalMinute: visit.arrivalMinute
        })),
        unplannedRange: clone(day.unplannedRange),
        trueDiagnosesHidden: true
      };
    }

    function metadata(dayNumber) {
      const day = state.generatedDays[String(dayNumber)];
      return {
        saveVersion: SAVE_VERSION,
        generatorVersion: GENERATOR_VERSION,
        campaignSeed: state.campaignSeed,
        generatedDays: Object.keys(state.generatedDays).map(Number).sort((a, b) => a - b),
        pendingFollowUps: state.pendingFollowUps.length,
        fingerprint: day?.fingerprint || null
      };
    }

    return { getOrGenerateDay, openDay, closeDay, schedulePreview, metadata };
  }

  return {
    SAVE_KEY,
    SAVE_VERSION,
    GENERATOR_VERSION,
    SUPPORTED_MODES,
    DEFAULT_EQUIPMENT,
    createGenerator,
    createMemoryStorage,
    validateGeneratedDay,
    fingerprint,
    hashString,
    migrateState
  };
});
