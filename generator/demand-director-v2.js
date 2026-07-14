(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_DEMAND_DIRECTOR_V2 = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const DEMAND_DIRECTOR_VERSION = "visitor-demand-v2.0.0";
  const SOURCE_CATEGORIES = Object.freeze([
    "local_regular",
    "word_of_mouth",
    "clinic_referral",
    "follow_up",
    "walk_in",
    "emergency",
    "campaign_teaching",
    "campaign_story"
  ]);

  const DEFAULT_CONFIG = Object.freeze({
    maximumPotentialDemand: 18,
    maximumDeferredCarry: 4,
    minimumPlayableDemand: 2,
    averageVisitMinutes: 55,
    capacityByChapter: [8, 9, 10, 11],
    baseDemandByChapter: [4.2, 5.4, 6.3, 7.1],
    chapterMultipliers: [0.88, 1, 1.08, 1.16],
    trustCurve: [
      { at: 0, value: 0.7 },
      { at: 40, value: 0.86 },
      { at: 60, value: 1 },
      { at: 80, value: 1.12 },
      { at: 100, value: 1.2 }
    ],
    awarenessCurve: [
      { at: 0, value: 0.78 },
      { at: 30, value: 1 },
      { at: 60, value: 1.14 },
      { at: 100, value: 1.28 }
    ],
    fatigueCapacityCurve: [
      { at: 0, value: 1 },
      { at: 40, value: 0.96 },
      { at: 60, value: 0.88 },
      { at: 80, value: 0.74 },
      { at: 100, value: 0.58 }
    ],
    urgencyByChapter: [0.08, 0.28, 0.45, 0.62],
    wordOfMouthMaximum: 2.4,
    clinicReferralMaximum: 2.2,
    walkInMaximum: 2,
    sourcePriority: [
      "follow_up",
      "campaign_teaching",
      "campaign_story",
      "emergency",
      "walk_in",
      "clinic_referral",
      "word_of_mouth",
      "local_regular"
    ]
  });

  const CAPABILITY_DEFINITIONS = Object.freeze({
    microscope: Object.freeze({
      id: "microscope",
      owned: true,
      unlocked: true,
      operational: true,
      capacityPerDay: 6,
      maintenanceCost: 35,
      relevantCaseTags: ["microscopy"],
      referralAttractionWeight: 0.35
    }),
    xray: Object.freeze({
      id: "xray",
      owned: false,
      unlocked: false,
      operational: false,
      capacityPerDay: 0,
      maintenanceCost: 0,
      relevantCaseTags: ["xray", "radiography"],
      referralAttractionWeight: 0.8
    }),
    ultrasound: Object.freeze({
      id: "ultrasound",
      owned: false,
      unlocked: false,
      operational: false,
      capacityPerDay: 0,
      maintenanceCost: 0,
      relevantCaseTags: ["ultrasound"],
      referralAttractionWeight: 0.7
    })
  });

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
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

  function randomFor(input, scope) {
    const identity = [
      input.campaignSeed,
      input.generatorVersion,
      input.contentPackVersion,
      DEMAND_DIRECTOR_VERSION,
      input.day,
      scope
    ].join("|");
    return mulberry32(hashString(identity));
  }

  function interpolateCurve(curve, rawValue) {
    const value = clamp(rawValue, curve[0].at, curve[curve.length - 1].at);
    for (let index = 1; index < curve.length; index += 1) {
      const right = curve[index];
      const left = curve[index - 1];
      if (value <= right.at) {
        const distance = right.at - left.at || 1;
        const progress = (value - left.at) / distance;
        return left.value + (right.value - left.value) * progress;
      }
    }
    return curve[curve.length - 1].value;
  }

  function stochasticRound(value, random) {
    const floor = Math.floor(Math.max(0, value));
    return floor + (random() < value - floor ? 1 : 0);
  }

  function chapterForDay(day) {
    const value = Math.max(1, Math.min(30, Math.floor(Number(day) || 1)));
    if (value <= 7) return 1;
    if (value <= 14) return 2;
    if (value <= 21) return 3;
    return 4;
  }

  function progressionRule(day, sourceRule = null) {
    if (sourceRule) return clone(sourceRule);
    const chapter = chapterForDay(day);
    const ranges = [
      { visits: { min: 3, max: 8 }, followUps: { min: 0, max: 3 }, urgent: { min: 0, max: 1 } },
      { visits: { min: 3, max: 9 }, followUps: { min: 0, max: 3 }, urgent: { min: 0, max: 1 } },
      { visits: { min: 3, max: 10 }, followUps: { min: 0, max: 3 }, urgent: { min: 0, max: 2 } },
      { visits: { min: 3, max: 11 }, followUps: { min: 0, max: 4 }, urgent: { min: 0, max: 2 } }
    ][chapter - 1];
    return {
      day,
      title: `Кампания · день ${day}`,
      start: "08:00",
      end: "18:00",
      visitsTotal: ranges.visits,
      bookedNew: { min: 1, max: ranges.visits.max },
      followUps: ranges.followUps,
      followUpTarget: 0,
      followUpMaximum: ranges.followUps.max,
      fillMissingWithNewBookedVisits: true,
      unplannedNew: { min: 0, max: chapter >= 3 ? 2 : 1 },
      urgentSubset: ranges.urgent,
      minimumFamilies: Math.min(5, chapter + 2),
      tutorial: "off",
      themeTags: [`campaign_chapter_${chapter}`],
      fallbackRules: ["preserve_safe_capacity_and_defer_excess_demand"]
    };
  }

  function capabilityRegistry(overrides = {}) {
    return Object.fromEntries(Object.entries(CAPABILITY_DEFINITIONS).map(([id, definition]) => {
      const override = overrides[id] || {};
      const merged = { ...clone(definition), ...clone(override), id };
      merged.capacityPerDay = Math.max(0, Number(merged.capacityPerDay) || 0);
      merged.maintenanceCost = Math.max(0, Number(merged.maintenanceCost) || 0);
      merged.referralAttractionWeight = Math.max(0, Number(merged.referralAttractionWeight) || 0);
      merged.relevantCaseTags = Array.isArray(merged.relevantCaseTags) ? merged.relevantCaseTags.slice() : [];
      return [id, merged];
    }));
  }

  function operationalCapability(capability) {
    return Boolean(capability?.owned && capability?.unlocked && capability?.operational && capability.capacityPerDay > 0);
  }

  function availableEquipment(capabilities = {}) {
    const equipment = new Set(["otoscope"]);
    Object.values(capabilityRegistry(capabilities)).forEach((capability) => {
      if (operationalCapability(capability)) equipment.add(capability.id);
    });
    return [...equipment];
  }

  function requiredTeachingAndStory(day) {
    if (day === 1) return { campaign_teaching: 1, campaign_story: 0 };
    if ([7, 14, 21, 30].includes(day)) return { campaign_teaching: 0, campaign_story: 1 };
    return { campaign_teaching: 0, campaign_story: 0 };
  }

  function safeInteger(value, fallback = 0) {
    return Math.max(0, Math.floor(Number.isFinite(Number(value)) ? Number(value) : fallback));
  }

  function normalizeCampaignState(input, rule, config) {
    const chapter = chapterForDay(input.day);
    const shiftMinutes = Math.max(60, Number(input.shiftMinutes)
      || ((Number(rule.end.split(":")[0]) * 60 + Number(rule.end.split(":")[1]))
        - (Number(rule.start.split(":")[0]) * 60 + Number(rule.start.split(":")[1]))));
    return {
      day: Math.max(1, Math.min(30, safeInteger(input.day, 1))),
      chapter,
      baseLocalDemand: Math.max(0, Number(input.baseLocalDemand) || config.baseDemandByChapter[chapter - 1]),
      ownerTrust: clamp(input.ownerTrust ?? 74, 0, 100),
      clinicalReliability: clamp(input.clinicalReliability ?? 74, 0, 100),
      awareness: clamp(input.awareness ?? 30, 0, 100),
      doctorsOnShift: Math.max(1, safeInteger(input.doctorsOnShift, 1)),
      rooms: Math.max(1, safeInteger(input.rooms, 1)),
      staffSupport: clamp(input.staffSupport ?? 1, 0.55, 1.35),
      shiftMinutes,
      fatigue: clamp(input.fatigue ?? 0, 0, 100),
      safeDailyCapacity: Number.isFinite(Number(input.safeDailyCapacity)) ? Math.max(1, safeInteger(input.safeDailyCapacity)) : null,
      dueFollowUps: safeInteger(input.dueFollowUps),
      deferredDemand: Math.min(config.maximumDeferredCarry, safeInteger(input.deferredDemand)),
      referralNetwork: input.referralNetwork !== false,
      capabilities: capabilityRegistry(input.equipmentCapabilities || {}),
      campaignSeed: input.campaignSeed || "visitor-demand-default",
      generatorVersion: input.generatorVersion || "unknown-generator",
      contentPackVersion: input.contentPackVersion || "unknown-content",
      previousOutcomes: clone(input.previousOutcomes || {})
    };
  }

  function calculateCapacity(state, config) {
    const parallel = Math.max(1, Math.min(state.doctorsOnShift, state.rooms));
    const timeCapacity = Math.floor((state.shiftMinutes / config.averageVisitMinutes) * parallel);
    const fatigueMultiplier = interpolateCurve(config.fatigueCapacityCurve, state.fatigue);
    const chapterLimit = config.capacityByChapter[state.chapter - 1] * parallel;
    const equipmentSupport = Object.values(state.capabilities).filter(operationalCapability).length * 0.2;
    const calculated = Math.floor(Math.min(chapterLimit, timeCapacity) * fatigueMultiplier * state.staffSupport + equipmentSupport);
    const safeCapacity = state.safeDailyCapacity === null ? calculated : Math.min(calculated, state.safeDailyCapacity);
    return {
      doctorsOnShift: state.doctorsOnShift,
      rooms: state.rooms,
      shiftMinutes: state.shiftMinutes,
      fatigue: state.fatigue,
      staffSupport: state.staffSupport,
      timeCapacity,
      chapterLimit,
      safeCapacity: Math.max(config.minimumPlayableDemand, safeCapacity)
    };
  }

  function allocateSourcePlan(total, desired, priority) {
    let remaining = Math.max(0, total);
    const plan = Object.fromEntries(SOURCE_CATEGORIES.map((source) => [source, 0]));
    priority.forEach((source) => {
      const amount = Math.min(remaining, safeInteger(desired[source]));
      plan[source] = amount;
      remaining -= amount;
    });
    plan.local_regular += remaining;
    return plan;
  }

  function dispositionForExcess(excess, state, random) {
    const result = { next_day_booking: 0, waiting_list: 0, no_capacity: 0, referral: 0, owner_left: 0 };
    for (let index = 0; index < excess; index += 1) {
      const roll = random();
      const bookingThreshold = 0.2 + state.ownerTrust / 250;
      const waitingThreshold = bookingThreshold + 0.18;
      const referralThreshold = waitingThreshold + (state.referralNetwork ? 0.18 + state.clinicalReliability / 500 : 0.05);
      if (roll < bookingThreshold && result.next_day_booking < 3) result.next_day_booking += 1;
      else if (roll < waitingThreshold && result.waiting_list < 2) result.waiting_list += 1;
      else if (roll < referralThreshold) result.referral += 1;
      else if (roll < 0.92) result.no_capacity += 1;
      else result.owner_left += 1;
    }
    return result;
  }

  function directDemand(input = {}, config = DEFAULT_CONFIG) {
    const sourceRule = input.dayRule || null;
    const rule = progressionRule(input.day, sourceRule);
    const state = normalizeCampaignState(input, rule, config);
    const random = randomFor(state, "demand");
    const trustMultiplier = interpolateCurve(config.trustCurve, state.ownerTrust);
    const awarenessMultiplier = interpolateCurve(config.awarenessCurve, state.awareness);
    const chapterMultiplier = config.chapterMultipliers[state.chapter - 1];
    const equippedAttraction = Object.values(state.capabilities)
      .filter(operationalCapability)
      .reduce((sum, capability) => sum + capability.referralAttractionWeight, 0);
    const wordOfMouthDemand = stochasticRound(
      config.wordOfMouthMaximum * clamp((state.ownerTrust - 45) / 55, 0, 1) * clamp(state.awareness / 100, 0.2, 1),
      random
    );
    const clinicReferrals = state.referralNetwork
      ? stochasticRound(config.clinicReferralMaximum * clamp((state.clinicalReliability - 45) / 55, 0, 1) * Math.min(1.4, 0.4 + equippedAttraction), random)
      : 0;
    const urgentDemand = stochasticRound(config.urgencyByChapter[state.chapter - 1], random);
    const required = requiredTeachingAndStory(state.day);
    const requiredCount = required.campaign_teaching + required.campaign_story;
    const localDemand = state.baseLocalDemand * trustMultiplier * awarenessMultiplier * chapterMultiplier;
    const uncappedPotential = localDemand
      + state.dueFollowUps
      + wordOfMouthDemand
      + clinicReferrals
      + urgentDemand
      + requiredCount
      + state.deferredDemand;
    const potentialDemand = clamp(stochasticRound(uncappedPotential, random), config.minimumPlayableDemand, config.maximumPotentialDemand);
    const capacity = calculateCapacity(state, config);
    const protectedMinimum = state.day <= 7 ? rule.visitsTotal.min : config.minimumPlayableDemand;
    const ruleMaximum = rule.visitsTotal.max;
    const acceptedDemand = Math.min(
      potentialDemand,
      ruleMaximum,
      Math.max(protectedMinimum, capacity.safeCapacity)
    );
    const desiredWalkIns = Math.min(
      rule.unplannedNew.max,
      state.day <= 3 ? rule.unplannedNew.min : stochasticRound(Math.min(config.walkInMaximum, 0.25 + state.chapter * 0.28), random)
    );
    const desired = {
      ...required,
      follow_up: Math.min(state.dueFollowUps, rule.followUpMaximum ?? rule.followUps.max),
      emergency: Math.min(Math.max(rule.urgentSubset.min, urgentDemand), rule.urgentSubset.max),
      walk_in: desiredWalkIns,
      clinic_referral: clinicReferrals,
      word_of_mouth: wordOfMouthDemand,
      local_regular: acceptedDemand
    };
    const sourcePlan = allocateSourcePlan(acceptedDemand, desired, config.sourcePriority);
    const excessDemand = Math.max(0, potentialDemand - acceptedDemand);
    const excessDisposition = dispositionForExcess(excessDemand, state, random);
    const deferredForNextDay = Math.min(
      config.maximumDeferredCarry,
      excessDisposition.next_day_booking + excessDisposition.waiting_list
    );
    return {
      demandDirectorVersion: DEMAND_DIRECTOR_VERSION,
      day: state.day,
      chapter: state.chapter,
      inputs: {
        baseLocalDemand: state.baseLocalDemand,
        ownerTrust: state.ownerTrust,
        clinicalReliability: state.clinicalReliability,
        awareness: state.awareness,
        dueFollowUps: state.dueFollowUps,
        deferredDemand: state.deferredDemand,
        referralNetwork: state.referralNetwork
      },
      multipliers: { trust: trustMultiplier, awareness: awarenessMultiplier, chapter: chapterMultiplier },
      terms: {
        localDemand,
        dueFollowUps: state.dueFollowUps,
        wordOfMouthDemand,
        clinicReferrals,
        urgentDemand,
        requiredTeachingAndStoryVisits: requiredCount,
        deferredDemand: state.deferredDemand
      },
      potentialDemand,
      acceptedDemand,
      excessDemand,
      sourcePlan,
      excessDisposition,
      deferredForNextDay,
      capacity,
      capabilities: clone(state.capabilities)
    };
  }

  function initialDemandState() {
    return {
      demandDirectorVersion: DEMAND_DIRECTOR_VERSION,
      deferredDemand: 0,
      waitingList: 0,
      incomingReferrals: 0,
      outgoingReferrals: 0,
      noCapacity: 0,
      ownerLeft: 0,
      sourceTotals: Object.fromEntries(SOURCE_CATEGORIES.map((source) => [source, 0])),
      outcomes: { completed: 0, referred: 0, unsafe: 0 },
      lastDecision: null
    };
  }

  function compactDemandDecision(decision) {
    const rounded = (value) => Number(Number(value || 0).toFixed(4));
    return {
      demandDirectorVersion: decision.demandDirectorVersion,
      day: decision.day,
      chapter: decision.chapter,
      inputs: clone(decision.inputs),
      multipliers: Object.fromEntries(Object.entries(decision.multipliers || {}).map(([key, value]) => [key, rounded(value)])),
      terms: Object.fromEntries(Object.entries(decision.terms || {}).map(([key, value]) => [key, rounded(value)])),
      potentialDemand: decision.potentialDemand,
      acceptedDemand: decision.acceptedDemand,
      excessDemand: decision.excessDemand,
      sourcePlan: clone(decision.sourcePlan),
      excessDisposition: clone(decision.excessDisposition),
      deferredForNextDay: decision.deferredForNextDay,
      capacity: {
        doctorsOnShift: decision.capacity.doctorsOnShift,
        rooms: decision.capacity.rooms,
        shiftMinutes: decision.capacity.shiftMinutes,
        fatigue: decision.capacity.fatigue,
        staffSupport: decision.capacity.staffSupport,
        safeCapacity: decision.capacity.safeCapacity
      },
      capabilities: Object.fromEntries(Object.entries(decision.capabilities || {}).map(([id, capability]) => [id, {
        owned: Boolean(capability.owned),
        unlocked: Boolean(capability.unlocked),
        operational: Boolean(capability.operational),
        capacityPerDay: capability.capacityPerDay,
        maintenanceCost: capability.maintenanceCost
      }]))
    };
  }

  function applyDemandDecision(previous, decision) {
    const next = { ...initialDemandState(), ...clone(previous || {}) };
    next.sourceTotals = { ...initialDemandState().sourceTotals, ...(next.sourceTotals || {}) };
    SOURCE_CATEGORIES.forEach((source) => {
      next.sourceTotals[source] += decision.sourcePlan[source] || 0;
    });
    next.deferredDemand = decision.deferredForNextDay;
    next.waitingList = decision.excessDisposition.waiting_list;
    next.incomingReferrals += decision.sourcePlan.clinic_referral || 0;
    next.outgoingReferrals += decision.excessDisposition.referral || 0;
    next.noCapacity += decision.excessDisposition.no_capacity || 0;
    next.ownerLeft += decision.excessDisposition.owner_left || 0;
    next.lastDecision = compactDemandDecision(decision);
    return next;
  }

  function applyDayOutcomes(previous, outcomes = []) {
    const next = { ...initialDemandState(), ...clone(previous || {}) };
    next.outcomes = { ...initialDemandState().outcomes, ...(next.outcomes || {}) };
    outcomes.forEach((outcome) => {
      if (outcome.completed) next.outcomes.completed += 1;
      if (outcome.referred) next.outcomes.referred += 1;
      if (outcome.quality === "wrong" || outcome.unsafe) next.outcomes.unsafe += 1;
    });
    return next;
  }

  function sourceCategoryForLegacySource(source, visit = {}) {
    if (SOURCE_CATEGORIES.includes(visit.sourceCategory)) return visit.sourceCategory;
    if (source === "follow_up") return "follow_up";
    if (source === "unplanned") return "walk_in";
    if (visit.urgency === "urgent" || visit.urgency === "emergency") return "emergency";
    return "local_regular";
  }

  function routingForCase(caseData, capabilities = {}) {
    const registry = capabilityRegistry(capabilities);
    const available = new Set(availableEquipment(registry));
    const requiredForDefinitiveDiagnosis = clone(caseData.requiredForDefinitiveDiagnosis || []);
    const requiredForTreatment = clone(caseData.requiredForTreatment || []);
    const preferredEquipment = clone(caseData.preferredEquipment || []);
    const structuredRequired = [...new Set([
      ...(caseData.requiredEquipment || []),
      ...requiredForDefinitiveDiagnosis,
      ...requiredForTreatment
    ])];
    const missingEquipment = structuredRequired.filter((id) => !available.has(id));
    const safeWithoutEquipmentActions = clone(caseData.safeWithoutEquipmentActions || caseData.safeAlternatives || []);
    const safeReferralPath = caseData.safeReferralPath || safeWithoutEquipmentActions.find((id) => /referral|transfer/i.test(id)) || null;
    const safeReferralAvailable = Boolean(safeReferralPath || safeWithoutEquipmentActions.length || caseData.planOptions?.some((plan) => /referral|transfer/i.test(plan.id)));
    const arrivalAllowedWithoutEquipment = caseData.arrivalAllowedWithoutEquipment !== undefined
      ? Boolean(caseData.arrivalAllowedWithoutEquipment)
      : missingEquipment.length === 0 || safeReferralAvailable;
    return {
      requiredForDefinitiveDiagnosis,
      requiredForTreatment,
      preferredEquipment,
      safeWithoutEquipmentActions,
      safeReferralPath,
      referralDestination: caseData.referralDestination || null,
      arrivalAllowedWithoutEquipment,
      equipmentAttractionTags: clone(caseData.equipmentAttractionTags || []),
      specialistReferralTags: clone(caseData.specialistReferralTags || []),
      missingEquipment,
      requiresReferral: missingEquipment.length > 0,
      safeReferralAvailable
    };
  }

  return {
    DEMAND_DIRECTOR_VERSION,
    SOURCE_CATEGORIES,
    DEFAULT_CONFIG,
    CAPABILITY_DEFINITIONS,
    chapterForDay,
    progressionRule,
    capabilityRegistry,
    operationalCapability,
    availableEquipment,
    directDemand,
    compactDemandDecision,
    initialDemandState,
    applyDemandDecision,
    applyDayOutcomes,
    sourceCategoryForLegacySource,
    routingForCase
  };
});
