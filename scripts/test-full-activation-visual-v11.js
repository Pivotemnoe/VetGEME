#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const medicalLoader = require(path.join(root, "generator/activation-medical-v11.js"));
const operationsFactory = require(path.join(root, "systems/operations-runtime-v5.js"));
const scheduler = require(path.join(root, "systems/resource-scheduler-v5.js"));

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function schedulerState(operationsState) {
  return {
    schemaVersion: operationsState.schemaVersion,
    resources: plain(operationsState.resources),
    tasks: plain(operationsState.tasks),
    reservations: plain(operationsState.reservations),
    appliedCommandIds: plain(operationsState.appliedCommandIds),
    commandFingerprints: plain(operationsState.commandFingerprints)
  };
}

function hudAuthorities() {
  return [
    { surfaceId: "clinic_identity", authority: "p7.campaignState", data: { clinicLevel: 1, chapter: 1, day: 1, campaignDay: 1 } },
    { surfaceId: "next_patient", authority: "p5.queueState+p4.identityState", data: { patientName: "Нора", species: "собака", waitingMinutes: 2, ownerRequestHumanText: "Владелец спокойно описывает жалобу" } },
    { surfaceId: "queue", authority: "p5.queueState", data: { waitingCount: 1, inRoomCount: 0, patientCards: ["Нора, собака — ожидает 2 минуты"] } },
    { surfaceId: "day_goals", authority: "p7.dayState", data: { goalHumanText: ["Завершить приём"], progress: ["0 из 1"], completed: 0 } },
    { surfaceId: "cash", authority: "p6.ledgerState", data: { cash: 1350, todayDelta: 0 } },
    { surfaceId: "clock_controls", authority: "simulation.clock", data: { day: 1, time: "08:00", minutesToClose: 300, speed: 1, paused: true } },
    { surfaceId: "trust_reputation", authority: "p4.ownerState+p6.reputationState", data: { ownerTrust: 74, clinicalReliability: 74, staffFatigue: 6 } },
    { surfaceId: "active_capacity", authority: "p5.scheduler", data: { activeVisits: 0, capacity: 12, blockedReasonHumanText: "Свободные места есть" } },
    { surfaceId: "event_log", authority: "appendOnlyEventLog", data: { time: "08:00", humanText: "Клиника готова к открытию", severity: "обычно" } }
  ];
}

function preparationSignals(snapshot, at) {
  return Object.values(snapshot.resources)
    .filter((resource) => resource.resourceKind === "equipment" && resource.owned && !resource.active)
    .flatMap((resource) => {
      if (!resource.delivered) return [{ resourceId: resource.resourceId, state: "pending_delivery" }];
      const maintenanceActive = resource.maintenanceWindows.some((window) => window.startAt <= at && at < window.endAt);
      if (maintenanceActive || (Number.isSafeInteger(resource.nextDueAt) && resource.nextDueAt <= at)) return [];
      return [{ resourceId: resource.resourceId, state: resource.trainedStaffIds.length ? "delivered_not_ready" : "training_pending" }];
    });
}

function project(visual, p5, lifecycleState, operationsState, at, stockSignals = []) {
  const schedule = schedulerState(operationsState);
  const lifecycleSnapshot = p5.lifecycle.snapshot(lifecycleState, at, {
    schedulerState: schedule,
    absenceWindows: []
  });
  return visual.project({
    schemaVersion: 1,
    at,
    lifecycleSnapshot,
    schedulerState: schedule,
    preparationSignals: preparationSignals(lifecycleSnapshot, at),
    stockSignals,
    hudAuthorities: hudAuthorities(),
    transitionNotice: null,
    presentation: { reducedMotion: false }
  });
}

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString("ascii"), "PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

(async () => {
  const catalog = await medicalLoader.loadFromDirectory(root, { modeId: "campaign" });
  const visual = catalog.visualActivation;
  const p5 = catalog.p5Activation;
  const operations = operationsFactory.createOperationsRuntime(scheduler);
  assert.equal(visual.runtimeEligible, true);
  assert.equal(visual.reviewOnly, false);
  assert.deepEqual(plain(visual.audit), {
    rooms: 12,
    equipment: 27,
    staff: 10,
    hudSurfaces: 9,
    resources: 49,
    assetAliases: 31,
    canvasRooms: 4,
    canvasEquipment: 1,
    canvasStaff: 0,
    runtimeAssets: 14
  });

  const approvedManifest = JSON.parse(fs.readFileSync(path.join(
    root,
    "content/activation-packs/pet-clinic-local-2026.07.17.1/visual/ART_ASSET_MANIFEST.json"
  ), "utf8"));
  for (const approved of approvedManifest.assets) {
    const runtime = visual.assetForResource(approved.resourceId);
    assert.ok(runtime, `runtime asset missing for ${approved.resourceId}`);
    const bytes = fs.readFileSync(path.join(root, runtime.file));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), approved.sha256);
    assert.deepEqual(pngDimensions(bytes), { width: approved.width, height: approved.height });
  }

  let lifecycleState = p5.createLifecycleState();
  let operationsState = p5.reconcileOperationsState(lifecycleState, operations.createState());
  const baseline = project(visual, p5, lifecycleState, operationsState, 0);
  assert.equal(baseline.reviewOnly, false);
  assert.equal(baseline.runtimeEligible, true);
  assert.equal(baseline.resources.rooms.length, 12);
  assert.equal(baseline.resources.equipment.length, 27);
  assert.equal(baseline.resources.staff.length, 10);
  assert.equal(baseline.hud.surfaces.length, 9);
  assert.equal(baseline.resources.rooms.find((item) => item.resourceId === "room.staff.1").state, "not_owned");
  assert.equal(baseline.resources.rooms.find((item) => item.resourceId === "room.staff.1").activationAsset.presentation, "empty_room_shell");
  assert.equal(baseline.resources.equipment.find((item) => item.resourceId === "equipment.microscope").state, "ready");
  assert.equal(baseline.resources.staff.find((item) => item.resourceId === "staff.doctor.sokolova").state, "hired_unscheduled");

  const stockout = project(visual, p5, lifecycleState, operationsState, 0, [{
    resourceId: "equipment.microscope",
    blocked: true
  }]);
  assert.equal(stockout.resources.equipment.find((item) => item.resourceId === "equipment.microscope").state, "stock_blocked");

  const restoredLifecycle = p5.lifecycle.deserializeState(p5.lifecycle.serializeState(lifecycleState));
  const restoredOperations = operations.deserializeState(operations.serializeState(operationsState));
  assert.deepEqual(
    plain(project(visual, p5, restoredLifecycle, restoredOperations, 0)),
    plain(baseline),
    "P9 projection changed after lifecycle/scheduler reload"
  );

  console.log(JSON.stringify({
    activation: visual.version,
    p9Source: visual.sourceVersion,
    resources: 49,
    hudSurfaces: 9,
    runtimeAssets: approvedManifest.assets.length,
    exactAssetHashesAndDimensions: true,
    baselineLifecycleProjection: true,
    stockoutProjection: true,
    reloadParity: true,
    capabilityAuthority: "simulation_state_only"
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
