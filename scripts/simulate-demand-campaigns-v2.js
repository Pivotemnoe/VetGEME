"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const demandApi = require("../generator/demand-director-v2.js");
const generatorApi = require("../generator/generator-v2.js");
const loader = require("../generator/content-loader-v2.js");

const projectRoot = path.resolve(__dirname, "..");
const contentOptions = {
  packId: "tier-01-v2",
  packVersion: "2026.07.12.2",
  mode: "tier-01-v2",
  context: "review"
};
const runs = Math.max(1, Number.parseInt(process.argv[2] || "10000", 10));
const outputFlagIndex = process.argv.indexOf("--output");
const outputPath = outputFlagIndex >= 0 && process.argv[outputFlagIndex + 1]
  ? path.resolve(process.cwd(), process.argv[outputFlagIndex + 1])
  : null;

function equipmentSet(...operationalIds) {
  return Object.fromEntries(["microscope", "xray", "ultrasound"].map((id) => [id, {
    owned: operationalIds.includes(id),
    unlocked: operationalIds.includes(id),
    operational: operationalIds.includes(id),
    capacityPerDay: operationalIds.includes(id) ? (id === "microscope" ? 6 : 4) : 0,
    maintenanceCost: operationalIds.includes(id) ? (id === "microscope" ? 35 : id === "xray" ? 90 : 110) : 0
  }]));
}

const TRAJECTORIES = Object.freeze([
  { id: "low_trust", label: "Низкое доверие", state: (day) => ({ ownerTrust: 18 + day * 0.3, awareness: 22 }) },
  { id: "high_trust", label: "Высокое доверие", state: (day) => ({ ownerTrust: Math.min(100, 88 + day * 0.2), awareness: 75 }) },
  { id: "low_reliability", label: "Низкая клиническая надёжность", state: () => ({ clinicalReliability: 25 }) },
  { id: "high_reliability", label: "Высокая клиническая надёжность", state: () => ({ clinicalReliability: 96 }) },
  { id: "one_doctor", label: "Один врач", state: () => ({ doctorsOnShift: 1, rooms: 1 }) },
  { id: "two_doctors", label: "Два врача", state: () => ({ doctorsOnShift: 2, rooms: 2, staffSupport: 1.08 }) },
  { id: "no_equipment", label: "Без оборудования", state: () => ({ equipmentCapabilities: equipmentSet() }) },
  { id: "microscope", label: "Микроскоп", state: () => ({ equipmentCapabilities: equipmentSet("microscope") }) },
  { id: "xray", label: "Рентген", state: () => ({ equipmentCapabilities: equipmentSet("xray") }) },
  { id: "ultrasound", label: "УЗИ", state: () => ({ equipmentCapabilities: equipmentSet("ultrasound") }) },
  { id: "xray_ultrasound", label: "Рентген и УЗИ", state: () => ({ equipmentCapabilities: equipmentSet("xray", "ultrasound") }) },
  {
    id: "overload",
    label: "Перегрузка",
    state: (day, campaignIndex) => ({
      baseLocalDemand: 12 + (campaignIndex % 7),
      ownerTrust: 30 + (campaignIndex % 71),
      clinicalReliability: 20 + ((campaignIndex * 7) % 81),
      awareness: 60 + ((campaignIndex * 11) % 41),
      dueFollowUps: (campaignIndex + day) % 5,
      safeDailyCapacity: 2 + (campaignIndex % 4),
      fatigue: Math.min(100, 45 + day + (campaignIndex % 31))
    })
  },
  {
    id: "debt_risk",
    label: "Риск долга",
    state: (day) => ({
      ownerTrust: 42,
      clinicalReliability: 62,
      awareness: 45,
      doctorsOnShift: 1,
      rooms: 1,
      staffSupport: 0.65,
      shiftMinutes: 420,
      safeDailyCapacity: 4,
      fatigue: Math.min(96, 58 + day * 1.2),
      campaignFinance: { debtRisk: true }
    })
  }
]);

function emptySourceTotals() {
  return Object.fromEntries(demandApi.SOURCE_CATEGORIES.map((source) => [source, 0]));
}

function emptyAggregate() {
  return {
    campaigns: 0,
    days: 0,
    potentialDemand: 0,
    acceptedDemand: 0,
    excessDemand: 0,
    waitingList: 0,
    noCapacity: 0,
    incomingReferrals: 0,
    outgoingReferrals: 0,
    ownerLeft: 0,
    lostOpportunities: 0,
    deferredBookings: 0,
    safeCapacity: 0,
    sources: emptySourceTotals(),
    operationalEquipmentDays: { microscope: 0, xray: 0, ultrasound: 0 },
    maintenanceCostPotential: 0,
    structuralFingerprints: new Set()
  };
}

function addDecision(aggregate, decision) {
  aggregate.days += 1;
  aggregate.potentialDemand += decision.potentialDemand;
  aggregate.acceptedDemand += decision.acceptedDemand;
  aggregate.excessDemand += decision.excessDemand;
  aggregate.waitingList += decision.excessDisposition.waiting_list;
  aggregate.noCapacity += decision.excessDisposition.no_capacity;
  aggregate.incomingReferrals += decision.sourcePlan.clinic_referral;
  aggregate.outgoingReferrals += decision.excessDisposition.referral;
  aggregate.ownerLeft += decision.excessDisposition.owner_left;
  aggregate.lostOpportunities += decision.excessDisposition.no_capacity + decision.excessDisposition.owner_left;
  aggregate.deferredBookings += decision.excessDisposition.next_day_booking + decision.excessDisposition.waiting_list;
  aggregate.safeCapacity += decision.capacity.safeCapacity;
  demandApi.SOURCE_CATEGORIES.forEach((source) => {
    aggregate.sources[source] += decision.sourcePlan[source] || 0;
  });
  Object.entries(decision.capabilities).forEach(([id, capability]) => {
    if (!demandApi.operationalCapability(capability)) return;
    aggregate.operationalEquipmentDays[id] += 1;
    aggregate.maintenanceCostPotential += capability.maintenanceCost;
  });
}

function mergeAggregate(target, source) {
  [
    "campaigns", "days", "potentialDemand", "acceptedDemand", "excessDemand", "waitingList",
    "noCapacity", "incomingReferrals", "outgoingReferrals", "ownerLeft", "lostOpportunities",
    "deferredBookings", "safeCapacity", "maintenanceCostPotential"
  ].forEach((field) => { target[field] += source[field]; });
  demandApi.SOURCE_CATEGORIES.forEach((sourceId) => { target.sources[sourceId] += source.sources[sourceId]; });
  Object.keys(target.operationalEquipmentDays).forEach((id) => {
    target.operationalEquipmentDays[id] += source.operationalEquipmentDays[id];
  });
  source.structuralFingerprints.forEach((fingerprint) => target.structuralFingerprints.add(fingerprint));
}

function campaignState(trajectory, campaignIndex, day, previousDecision) {
  const baseline = {
    ownerTrust: 68 + Math.min(12, day * 0.3),
    clinicalReliability: 72 + Math.min(10, day * 0.25),
    awareness: 25 + Math.min(55, day * 1.4),
    doctorsOnShift: 1,
    rooms: 1,
    staffSupport: 1,
    fatigue: (day * 7 + campaignIndex) % 58,
    referralNetwork: true,
    equipmentCapabilities: equipmentSet("microscope"),
    dueFollowUps: previousDecision
      ? Math.min(demandApi.progressionRule(day).followUpMaximum, Math.floor(previousDecision.acceptedDemand * 0.25))
      : 0,
    deferredDemand: previousDecision?.deferredForNextDay || 0
  };
  return { ...baseline, ...trajectory.state(day, campaignIndex, previousDecision) };
}

function simulateCampaign(trajectory, campaignIndex, contentPackVersion) {
  const decisions = [];
  let previousDecision = null;
  for (let day = 1; day <= 30; day += 1) {
    const decision = demandApi.directDemand({
      ...campaignState(trajectory, campaignIndex, day, previousDecision),
      day,
      campaignSeed: `nightly-demand-${trajectory.id}-${campaignIndex}`,
      generatorVersion: generatorApi.GENERATOR_VERSION,
      contentPackVersion
    });
    assert.equal(
      Object.values(decision.excessDisposition).reduce((sum, value) => sum + value, 0),
      decision.excessDemand,
      `excess demand disappeared in ${trajectory.id}, day ${day}`
    );
    assert.equal(
      Object.values(decision.sourcePlan).reduce((sum, value) => sum + value, 0),
      decision.acceptedDemand,
      `source plan does not match accepted demand in ${trajectory.id}, day ${day}`
    );
    decisions.push(decision);
    previousDecision = decision;
  }
  const structural = decisions.map((decision) => ({
    day: decision.day,
    potential: decision.potentialDemand,
    accepted: decision.acceptedDemand,
    capacity: decision.capacity.safeCapacity,
    sources: decision.sourcePlan,
    excess: decision.excessDisposition
  }));
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(structural)).digest("hex");
  return { decisions, fingerprint };
}

function summarize(aggregate) {
  const divisor = Math.max(1, aggregate.days);
  return {
    campaigns: aggregate.campaigns,
    days: aggregate.days,
    averagesPerDay: {
      potentialDemand: Number((aggregate.potentialDemand / divisor).toFixed(3)),
      acceptedDemand: Number((aggregate.acceptedDemand / divisor).toFixed(3)),
      excessDemand: Number((aggregate.excessDemand / divisor).toFixed(3)),
      safeCapacity: Number((aggregate.safeCapacity / divisor).toFixed(3)),
      waitingList: Number((aggregate.waitingList / divisor).toFixed(3)),
      noCapacity: Number((aggregate.noCapacity / divisor).toFixed(3)),
      incomingReferrals: Number((aggregate.incomingReferrals / divisor).toFixed(3)),
      outgoingReferrals: Number((aggregate.outgoingReferrals / divisor).toFixed(3)),
      lostOpportunities: Number((aggregate.lostOpportunities / divisor).toFixed(3))
    },
    totals: {
      potentialDemand: aggregate.potentialDemand,
      acceptedDemand: aggregate.acceptedDemand,
      excessDemand: aggregate.excessDemand,
      waitingList: aggregate.waitingList,
      noCapacity: aggregate.noCapacity,
      incomingReferrals: aggregate.incomingReferrals,
      outgoingReferrals: aggregate.outgoingReferrals,
      ownerLeft: aggregate.ownerLeft,
      lostOpportunities: aggregate.lostOpportunities,
      deferredBookings: aggregate.deferredBookings,
      sources: { ...aggregate.sources },
      operationalEquipmentDays: { ...aggregate.operationalEquipmentDays },
      maintenanceCostPotential: aggregate.maintenanceCostPotential
    },
    structuralUniqueCampaigns: aggregate.structuralFingerprints.size,
    structuralUniquenessPercent: Number((aggregate.structuralFingerprints.size / Math.max(1, aggregate.campaigns) * 100).toFixed(2))
  };
}

function checkRoutingSafety(catalog) {
  const capabilitySets = {
    none: equipmentSet(),
    microscope: equipmentSet("microscope"),
    xray: equipmentSet("xray"),
    ultrasound: equipmentSet("ultrasound"),
    xray_ultrasound: equipmentSet("xray", "ultrasound")
  };
  let checks = 0;
  let safeMissingEquipmentArrivals = 0;
  let blockedUnsafeArrivals = 0;
  Object.values(capabilitySets).forEach((capabilities) => {
    catalog.cases.forEach((caseData) => {
      const routing = demandApi.routingForCase(caseData, capabilities);
      checks += 1;
      if (routing.missingEquipment.length && routing.arrivalAllowedWithoutEquipment) {
        assert.equal(routing.safeReferralAvailable, true, `unsafe arrival allowed for ${caseData.id}`);
        safeMissingEquipmentArrivals += 1;
      }
      if (routing.missingEquipment.length && !routing.safeReferralAvailable) {
        assert.equal(routing.arrivalAllowedWithoutEquipment, false, `unsafe equipment gap not blocked for ${caseData.id}`);
        blockedUnsafeArrivals += 1;
      }
    });
  });

  const unsafeTechnicalCase = demandApi.routingForCase({
    requiredForDefinitiveDiagnosis: ["xray"],
    safeAlternatives: [],
    planOptions: []
  }, equipmentSet());
  const safeTechnicalCase = demandApi.routingForCase({
    requiredForDefinitiveDiagnosis: ["xray"],
    safeAlternatives: ["referral"],
    planOptions: []
  }, equipmentSet());
  assert.equal(unsafeTechnicalCase.arrivalAllowedWithoutEquipment, false);
  assert.equal(safeTechnicalCase.arrivalAllowedWithoutEquipment, true);
  assert.equal(safeTechnicalCase.safeReferralAvailable, true);

  return { checks, safeMissingEquipmentArrivals, blockedUnsafeArrivals, syntheticBoundaryChecks: 2 };
}

async function main() {
  const catalog = await loader.loadFromDirectory(projectRoot, contentOptions);
  const overall = emptyAggregate();
  const byTrajectory = Object.fromEntries(TRAJECTORIES.map((trajectory) => [trajectory.id, emptyAggregate()]));

  for (let campaignIndex = 0; campaignIndex < runs; campaignIndex += 1) {
    const trajectory = TRAJECTORIES[campaignIndex % TRAJECTORIES.length];
    const campaign = simulateCampaign(trajectory, campaignIndex, catalog.manifest.contentPackVersion);
    const campaignAggregate = emptyAggregate();
    campaignAggregate.campaigns = 1;
    campaign.decisions.forEach((decision) => addDecision(campaignAggregate, decision));
    campaignAggregate.structuralFingerprints.add(campaign.fingerprint);
    mergeAggregate(byTrajectory[trajectory.id], campaignAggregate);
    mergeAggregate(overall, campaignAggregate);
  }

  const deterministicA = simulateCampaign(TRAJECTORIES[0], 0, catalog.manifest.contentPackVersion);
  const deterministicB = simulateCampaign(TRAJECTORIES[0], 0, catalog.manifest.contentPackVersion);
  assert.deepEqual(deterministicA, deterministicB, "same seed and trajectory changed demand campaign");
  const routingSafety = checkRoutingSafety(catalog);
  const summarizedTrajectories = Object.fromEntries(TRAJECTORIES.map((trajectory) => [trajectory.id, {
    label: trajectory.label,
    ...summarize(byTrajectory[trajectory.id])
  }]));
  const summary = {
    status: "passed",
    runs,
    campaignDays: 30,
    trajectories: TRAJECTORIES.map(({ id, label }) => ({ id, label })),
    deterministic: true,
    excessConserved: true,
    sourceTotalsConserved: true,
    routingSafety,
    overall: summarize(overall),
    byTrajectory: summarizedTrajectories,
    definitions: {
      lostOpportunities: "no_capacity + owner_left",
      incomingReferrals: "accepted source category clinic_referral",
      outgoingReferrals: "excess demand safely sent to another clinic",
      debtRiskBoundary: "Demand Director receives staffing, shift and fatigue effects; financial closure is tested by campaign mechanics."
    }
  };

  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
