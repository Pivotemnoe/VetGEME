"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const {
  createP9VisualStateAdapter
} = require("../systems/p9-visual-state-adapter-v2.js");
const scheduler = require("../systems/resource-scheduler-v5.js");
const lifecycleFactory = require("../systems/resource-lifecycle-v5.js");

const ROOT = path.resolve(__dirname, "..");
const P9_ROOT = path.join(
  ROOT,
  "content/review-inputs/vetgeme-p9-visual-state-authoring-2026.07.16.2"
);
const P5_ROOT = path.join(
  ROOT,
  "content/review-inputs/vetgeme-p5-production-authoring-2026.07.16.2/source"
);

function readJson(relativePath) {
  return clone(require(path.join(ROOT, relativePath)));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createConfig() {
  return {
    roomCatalog: readJson(path.relative(ROOT, path.join(
      P9_ROOT,
      "source/generated/room-visual-state-catalog.json"
    ))),
    equipmentCatalog: readJson(path.relative(ROOT, path.join(
      P9_ROOT,
      "source/generated/equipment-visual-state-catalog.json"
    ))),
    staffCatalog: readJson(path.relative(ROOT, path.join(
      P9_ROOT,
      "source/generated/staff-visual-state-catalog.json"
    ))),
    hudContract: readJson(path.relative(ROOT, path.join(
      P9_ROOT,
      "source/generated/hud-data-contract.json"
    ))),
    resourceCatalog: readJson(path.relative(ROOT, path.join(P5_ROOT, "generated/resource-catalog.json"))),
    assetCrosswalk: readJson(path.relative(ROOT, path.join(P9_ROOT, "host/runtime-v2-crosswalk.json"))),
    schedulerAuthority: scheduler
  };
}

function createLifecycleRuntime() {
  const p5Root = path.relative(ROOT, P5_ROOT);
  const operationalRoot = "content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.4/source";
  return lifecycleFactory.createResourceLifecycleRuntime({
    resourceCatalog: readJson(`${p5Root}/generated/resource-catalog.json`),
    lifecycleCatalog: readJson(`${p5Root}/generated/resource-lifecycle-catalog.json`),
    operationalPolicies: readJson(`${p5Root}/generated/operational-policies.json`),
    resourceCrosswalk: readJson(`${operationalRoot}/source/p6-p5-exact-resource-crosswalk.json`)
  });
}

const lifecycle = createLifecycleRuntime();

function createSchedulerState(resourceCatalog) {
  return scheduler.createState(resourceCatalog.resources.map((resource) => resource.runtimeResourceTemplate));
}

function createHudAuthorities() {
  return [
    {
      surfaceId: "clinic_identity",
      authority: "p7.campaignState",
      data: { clinicLevel: 1, chapter: 1, day: 1, campaignDay: 1 }
    },
    {
      surfaceId: "next_patient",
      authority: "p5.queueState+p4.identityState",
      data: {
        patientName: "Тучка",
        species: "кошка",
        waitingMinutes: 4,
        ownerRequestHumanText: "Владелец просит спокойно осмотреть уши"
      }
    },
    {
      surfaceId: "queue",
      authority: "p5.queueState",
      data: {
        waitingCount: 1,
        inRoomCount: 0,
        patientCards: [{ patientName: "Тучка", species: "кошка", status: "Ожидает приёма" }]
      }
    },
    {
      surfaceId: "day_goals",
      authority: "p7.dayState",
      data: { goalHumanText: "Завершить первый приём", progress: 0, completed: false }
    },
    {
      surfaceId: "cash",
      authority: "p6.ledgerState",
      data: { cash: 1350, todayDelta: 0 }
    },
    {
      surfaceId: "clock_controls",
      authority: "simulation.clock",
      data: { day: 1, time: "08:20", minutesToClose: 340, speed: 1, paused: true }
    },
    {
      surfaceId: "trust_reputation",
      authority: "p4.ownerState+p6.reputationState",
      data: { ownerTrust: 74, clinicalReliability: 74, staffFatigue: 6 }
    },
    {
      surfaceId: "active_capacity",
      authority: "p5.scheduler",
      data: { activeVisits: 0, capacity: 1, blockedReasonHumanText: "Свободно для приёма" }
    },
    {
      surfaceId: "event_log",
      authority: "appendOnlyEventLog",
      data: { time: "08:20", humanText: "Клиника открыта", severity: "informational" }
    }
  ];
}

function createInput(config, overrides = {}) {
  return {
    schemaVersion: 1,
    at: 100,
    lifecycleSnapshot: lifecycle.snapshot(lifecycle.createState(), 100),
    schedulerState: createSchedulerState(config.resourceCatalog),
    preparationSignals: [],
    stockSignals: [],
    hudAuthorities: createHudAuthorities(),
    transitionNotice: {
      whatHappened: "Доставка прибыла в клинику",
      whatChanged: "Оборудование можно готовить к работе",
      whatCanBeDone: "Назначьте обучение сотрудника"
    },
    presentation: { reducedMotion: false },
    ...overrides
  };
}

function resource(view, kind, resourceId) {
  return view.resources[kind].find((record) => record.resourceId === resourceId);
}

function reserve(input, { taskId, resourceId, startAt, endAt, status = "active" }) {
  const resourceConfig = input.schedulerState.resources[resourceId];
  const enqueued = scheduler.enqueueTask(input.schedulerState, {
    commandId: `enqueue-${taskId}`,
    task: {
      id: taskId,
      queuedAt: startAt,
      priority: 0,
      authoredDurationMinutes: endAt - startAt,
      fatigue: { percent: 0, durationMultiplier: 1 },
      requirementGroups: [{
        id: "fixture-group",
        anyOf: [{
          resourceId,
          capabilityId: resourceConfig.capabilities[0],
          units: 1
        }]
      }],
      urgency: "routine",
      safeRouteRequired: false
    }
  });
  const scheduled = scheduler.scheduleTask(enqueued.state, {
    commandId: `schedule-${taskId}`,
    at: startAt
  });
  input.schedulerState = scheduled.state;
  if (status === "completed") {
    input.schedulerState = scheduler.completeTask(input.schedulerState, {
      commandId: `complete-${taskId}`,
      taskId,
      at: endAt
    }).state;
  } else if (status !== "active") {
    throw new Error(`unsupported reserve fixture status ${status}`);
  }
}

function assertReloadParity(input, label) {
  const before = clone(input);
  const projected = adapter.project(input);
  const reloaded = JSON.parse(JSON.stringify(input));
  assert.deepEqual(adapter.project(reloaded), projected, `${label} changed after JSON reload`);
  assert.deepEqual(input, before, `${label} projection mutated simulation state`);
  return projected;
}

const sourceConfig = createConfig();
const adapter = createP9VisualStateAdapter(sourceConfig);
assert.equal(adapter.reviewOnly, true);
assert.equal(adapter.runtimeEligible, false);
assert.deepEqual(adapter.audit, {
  rooms: 12,
  equipment: 27,
  staff: 10,
  hudSurfaces: 9,
  resources: 49,
  assetAliases: 31,
  canvasRooms: 4,
  canvasEquipment: 1,
  canvasStaff: 0
});

// The adapter owns cloned review catalogs. Later mutations cannot rewrite its joins.
const originalRoomTitle = sourceConfig.roomCatalog.rooms[0].title;
sourceConfig.roomCatalog.rooms[0].title = "Мутация после создания";
const baselineInput = createInput(createConfig());
const inputBefore = clone(baselineInput);
const baseline = adapter.project(baselineInput);
assert.deepEqual(baselineInput, inputBefore, "projection mutated its serializable input");
assert.equal(resource(baseline, "rooms", "room.reception.1").title, originalRoomTitle);
assert.equal(baseline.resources.rooms.length, 12);
assert.equal(baseline.resources.equipment.length, 27);
assert.equal(baseline.resources.staff.length, 10);
assert.equal(baseline.hud.surfaces.length, 9);
assert.equal(resource(baseline, "rooms", "room.consult.1").state, "ready");
assert.equal(resource(baseline, "rooms", "room.consult.2").state, "not_owned");
assert.equal(resource(baseline, "equipment", "equipment.microscope").state, "ready");
assert.equal(resource(baseline, "equipment", "equipment.tonometer").state, "not_owned");
assert.equal(resource(baseline, "staff", "staff.doctor.sokolova").state, "hired_unscheduled");
assert.equal(resource(baseline, "equipment", "equipment.tonometer").renderMode, "dom_fallback");
assert.match(
  resource(baseline, "equipment", "equipment.tonometer").fallbackLabel,
  /отдельная картинка ещё не подготовлена/u
);
assert.equal(
  resource(baseline, "equipment", "equipment.biochemistry_analyzer").variantLabel,
  "Биохимический анализатор"
);
assert.match(baseline.transitionNotice.humanText, / → .* → /u);
assert.equal(baseline.presentation.motionMode, "standard");
baselineInput.lifecycleSnapshot.resources["room.consult.1"].ready = false;
baselineInput.hudAuthorities[0].data.clinicLevel = 99;
assert.equal(resource(baseline, "rooms", "room.consult.1").state, "ready");
assert.equal(baseline.hud.surfaces[0].data.clinicLevel, 1);

// Only four existing room coordinates and the microscope placement reach Canvas.
assert.equal(Object.keys(baseline.scene.roomsBySceneId).length, 4);
assert.equal(Object.keys(baseline.scene.placementsById).length, 19);
assert.deepEqual(baseline.scene.placementsById["lab-microscope"], {
  showBase: true,
  overlayAssetIds: [],
  resourceId: "equipment.microscope"
});
assert.equal(
  baseline.scene.assetAliasBySourceId["equipment.diagnostic.microscope"],
  "equipment.microscope"
);
assert.equal(baseline.scene.unplacedPolicy, "dom_fallback_only_no_coordinate_inference");

// Projected output is a deeply immutable, JSON-serializable view model.
assert.ok(Object.isFrozen(baseline));
assert.ok(Object.isFrozen(baseline.resources));
assert.ok(Object.isFrozen(baseline.resources.rooms[0]));
assert.ok(Object.isFrozen(baseline.scene.placementsById["lab-microscope"]));
assert.throws(() => { baseline.resources.rooms[0].state = "busy"; }, TypeError);
assert.doesNotThrow(() => JSON.stringify(baseline));

// JSON save/reload preserves every projected visual state exactly.
const reloadedInput = JSON.parse(JSON.stringify(inputBefore));
assert.deepEqual(adapter.project(reloadedInput), adapter.project(inputBefore));

// Rooms derive only from lifecycle evidence; reservations are the busy authority.
const roomInput = createInput(createConfig());
Object.assign(roomInput.lifecycleSnapshot.resources["room.consult.2"], {
  owned: true,
  delivered: false,
  ready: false
});
reserve(roomInput, {
  taskId: "fixture-task",
  resourceId: "room.consult.1",
  startAt: 90,
  endAt: 120
});
const roomProjection = assertReloadParity(roomInput, "room pending-delivery and busy states");
assert.equal(resource(roomProjection, "rooms", "room.consult.2").state, "pending_delivery");
assert.equal(resource(roomProjection, "rooms", "room.consult.1").state, "busy");
Object.assign(roomInput.lifecycleSnapshot.resources["room.consult.2"], {
  delivered: true,
  ready: false
});
assert.equal(
  resource(assertReloadParity(roomInput, "room delivered-not-ready state"), "rooms", "room.consult.2").state,
  "delivered_not_ready"
);

// Room transition overlays are drawn once at room level; placements only follow base visibility.
const boundRoomTransitionInput = createInput(createConfig());
Object.assign(boundRoomTransitionInput.lifecycleSnapshot.resources["room.consult.1"], {
  owned: true,
  delivered: false,
  ready: false,
  active: false
});
const boundRoomTransition = assertReloadParity(
  boundRoomTransitionInput,
  "bound room pending-delivery scene projection"
);
assert.deepEqual(
  boundRoomTransition.scene.roomsBySceneId["doctor-office"].overlayAssetIds,
  ["progression.delivery-pallet", "progression.stacked-boxes"]
);
assert.deepEqual(
  boundRoomTransition.scene.roomsBySceneId["doctor-office"].overlayAnchorsByAssetId,
  {
    "progression.delivery-pallet": { x: 315, y: 220, zFootY: 220, scale: 0.42 },
    "progression.stacked-boxes": { x: 385, y: 220, zFootY: 220, scale: 0.42 }
  }
);
for (const placementId of [
  "doctor-clock",
  "doctor-diploma",
  "doctor-exam-table",
  "doctor-stool",
  "doctor-desk"
]) {
  assert.deepEqual(
    boundRoomTransition.scene.placementsById[placementId].overlayAssetIds,
    [],
    `${placementId}: room overlays must not be duplicated on placements`
  );
}

// Ambiguous equipment preparation fails closed until the simulation supplies an explicit signal.
const ambiguousInput = createInput(createConfig());
Object.assign(ambiguousInput.lifecycleSnapshot.resources["equipment.tonometer"], {
  owned: true,
  delivered: false,
  active: false
});
let ambiguousProjection = adapter.project(ambiguousInput);
assert.equal(resource(ambiguousProjection, "equipment", "equipment.tonometer").state, "unavailable");
assert.equal(resource(ambiguousProjection, "equipment", "equipment.tonometer").showBase, false);
ambiguousInput.preparationSignals.push({
  resourceId: "equipment.tonometer",
  state: "pending_delivery"
});
ambiguousProjection = assertReloadParity(ambiguousInput, "equipment pending-delivery state");
assert.equal(resource(ambiguousProjection, "equipment", "equipment.tonometer").state, "pending_delivery");
Object.assign(ambiguousInput.lifecycleSnapshot.resources["equipment.tonometer"], {
  delivered: true,
  active: false
});
ambiguousInput.preparationSignals[0].state = "delivered_not_ready";
ambiguousProjection = assertReloadParity(ambiguousInput, "equipment delivered-not-ready state");
assert.equal(
  resource(ambiguousProjection, "equipment", "equipment.tonometer").state,
  "delivered_not_ready"
);
Object.assign(ambiguousInput.lifecycleSnapshot.resources["equipment.tonometer"], {
  trainedStaffIds: [],
  maintenanceCurrent: false
});
ambiguousInput.preparationSignals[0].state = "training_pending";
ambiguousProjection = assertReloadParity(ambiguousInput, "equipment training-pending state");
assert.equal(resource(ambiguousProjection, "equipment", "equipment.tonometer").state, "training_pending");
const contradictoryPreparation = clone(ambiguousInput);
contradictoryPreparation.preparationSignals[0].state = "pending_delivery";
assert.throws(
  () => adapter.project(contradictoryPreparation),
  /pending-delivery signal after delivery/u
);
const forgedMaintenanceSignal = clone(ambiguousInput);
forgedMaintenanceSignal.preparationSignals[0].state = "maintenance_active";
assert.throws(
  () => adapter.project(forgedMaintenanceSignal),
  /not an authored preparation state/u
);
const prematureStockInput = clone(ambiguousInput);
prematureStockInput.preparationSignals = [];
prematureStockInput.stockSignals = [{ resourceId: "equipment.tonometer", blocked: true }];
assert.throws(() => adapter.project(prematureStockInput), /stock signal before activation/u);

// Stockout is never inferred from inventory or an ad-hoc lifecycle field.
const stockInput = createInput(createConfig());
stockInput.lifecycleSnapshot.inventory = { "consumable.microscope": 0 };
stockInput.lifecycleSnapshot.resources["equipment.microscope"].stockBlocked = true;
assert.equal(resource(adapter.project(stockInput), "equipment", "equipment.microscope").state, "ready");
stockInput.stockSignals.push({ resourceId: "equipment.microscope", blocked: true });
assert.equal(
  resource(assertReloadParity(stockInput, "equipment stock-blocked state"), "equipment", "equipment.microscope").state,
  "stock_blocked"
);

// Maintenance comes from explicit lifecycle timing; an active interval wins over due.
const maintenanceInput = createInput(createConfig());
maintenanceInput.lifecycleSnapshot.resources["equipment.microscope"].nextDueAt = 100;
assert.equal(
  resource(assertReloadParity(maintenanceInput, "equipment maintenance-due state"), "equipment", "equipment.microscope").state,
  "maintenance_due"
);
maintenanceInput.lifecycleSnapshot.resources["equipment.microscope"].maintenanceWindows = [{
  startAt: 95,
  endAt: 105
}];
assert.equal(
  resource(assertReloadParity(maintenanceInput, "equipment maintenance-active state"), "equipment", "equipment.microscope").state,
  "maintenance_active"
);
maintenanceInput.lifecycleSnapshot.resources["equipment.microscope"].maintenanceWindows = [];
maintenanceInput.lifecycleSnapshot.resources["equipment.microscope"].nextDueAt = 10000;
assert.equal(
  resource(assertReloadParity(maintenanceInput, "equipment return-to-ready state"), "equipment", "equipment.microscope").state,
  "ready"
);

// Unknown/missing and retired simulation records remain unavailable and cannot appear ready.
const unavailableInput = createInput(createConfig());
delete unavailableInput.lifecycleSnapshot.resources["equipment.tonometer"];
unavailableInput.lifecycleSnapshot.resources["equipment.microscope"].retiredAt = 100;
const unavailableProjection = adapter.project(unavailableInput);
assert.equal(resource(unavailableProjection, "equipment", "equipment.tonometer").state, "unavailable");
assert.equal(resource(unavailableProjection, "equipment", "equipment.microscope").state, "unavailable");
assert.equal(unavailableProjection.scene.placementsById["lab-microscope"].showBase, false);
const wrongLifecycleVersion = createInput(createConfig());
wrongLifecycleVersion.lifecycleSnapshot.catalogVersion = "2026.07.16.1";
assert.throws(() => adapter.project(wrongLifecycleVersion), /P5 \.2 serializable snapshot authority/u);
const wrongLifecycleIdentity = createInput(createConfig());
wrongLifecycleIdentity.lifecycleSnapshot.resources["room.consult.1"].resourceId = "room.consult.2";
assert.throws(() => adapter.project(wrongLifecycleIdentity), /identity differs/u);
const unknownLifecycleResource = createInput(createConfig());
unknownLifecycleResource.lifecycleSnapshot.resources["room.invented"] = {
  resourceId: "room.invented",
  resourceKind: "room"
};
assert.throws(() => adapter.project(unknownLifecycleResource), /not part of the P5 resource catalog/u);

// Every authored staff state is projected explicitly. P5 `available` becomes `scheduled`;
// only a live reservation makes staff busy, never the advisory lifecycle label alone.
const staffInput = createInput(createConfig());
staffInput.lifecycleSnapshot.resources["staff.doctor.sokolova"].staffAvailabilityState = "available";
staffInput.lifecycleSnapshot.resources["staff.doctor.morozov"].staffAvailabilityState = "busy";
staffInput.lifecycleSnapshot.resources["staff.assistant.volkova"].staffAvailabilityState = "not_hired";
staffInput.lifecycleSnapshot.resources["staff.administrator.lebedeva"].staffAvailabilityState = "hired_unscheduled";
staffInput.lifecycleSnapshot.resources["staff.lab.krylova"].staffAvailabilityState = "resting";
staffInput.lifecycleSnapshot.resources["staff.imaging.zhukova"].staffAvailabilityState = "absent";
let staffProjection = assertReloadParity(staffInput, "all non-busy staff states");
assert.equal(resource(staffProjection, "staff", "staff.doctor.sokolova").state, "scheduled");
assert.equal(resource(staffProjection, "staff", "staff.doctor.morozov").state, "scheduled");
assert.equal(resource(staffProjection, "staff", "staff.assistant.volkova").state, "not_hired");
assert.equal(resource(staffProjection, "staff", "staff.administrator.lebedeva").state, "hired_unscheduled");
assert.equal(resource(staffProjection, "staff", "staff.lab.krylova").state, "resting");
assert.equal(resource(staffProjection, "staff", "staff.imaging.zhukova").state, "absent");
reserve(staffInput, {
  taskId: "visit-fixture",
  resourceId: "staff.doctor.sokolova",
  startAt: 90,
  endAt: 110
});
staffProjection = assertReloadParity(staffInput, "staff busy reservation state");
assert.equal(resource(staffProjection, "staff", "staff.doctor.sokolova").state, "busy");
const impossibleScheduledInput = createInput(createConfig());
impossibleScheduledInput.lifecycleSnapshot.resources["staff.doctor.sokolova"].staffAvailabilityState = "scheduled";
assert.equal(
  resource(adapter.project(impossibleScheduledInput), "staff", "staff.doctor.sokolova").state,
  "unavailable"
);

// Equipment and room busy states use the same scheduler reservation authority.
const equipmentBusyInput = createInput(createConfig());
reserve(equipmentBusyInput, {
  taskId: "lab-fixture",
  resourceId: "equipment.microscope",
  startAt: 100,
  endAt: 101
});
assert.equal(
  resource(assertReloadParity(equipmentBusyInput, "equipment busy reservation state"), "equipment", "equipment.microscope").state,
  "busy"
);

// Stale, queued or otherwise unowned reservations cannot manufacture a busy visual state.
const completedReservationInput = createInput(createConfig());
reserve(completedReservationInput, {
  taskId: "completed-fixture",
  resourceId: "equipment.microscope",
  startAt: 90,
  endAt: 110,
  status: "completed"
});
assert.equal(
  resource(adapter.project(completedReservationInput), "equipment", "equipment.microscope").state,
  "ready"
);

// Canonical P5 handoff segments change visual ownership at the half-open boundary
// and survive serialization without making either doctor busy twice.
const handoffConfig = createConfig();
let handoffSchedulerState = createSchedulerState(handoffConfig.resourceCatalog);
handoffSchedulerState = scheduler.enqueueTask(handoffSchedulerState, {
  commandId: "enqueue-handoff-visual",
  task: {
    id: "handoff-visual-task",
    queuedAt: 90,
    priority: 0,
    authoredDurationMinutes: 30,
    fatigue: { percent: 0, durationMultiplier: 1 },
    requirementGroups: [{
      id: "doctor",
      anyOf: ["staff.doctor.morozov", "staff.doctor.sokolova"].map((resourceId) => ({
        resourceId,
        capabilityId: "role.doctor",
        units: 1
      }))
    }],
    urgency: "routine",
    safeRouteRequired: false
  }
}).state;
const handoffScheduled = scheduler.scheduleTask(handoffSchedulerState, {
  commandId: "schedule-handoff-visual",
  at: 90
});
const fromDoctorId = handoffScheduled.reservations[0].resourceId;
const toDoctorId = ["staff.doctor.morozov", "staff.doctor.sokolova"]
  .find((resourceId) => resourceId !== fromDoctorId);
const handedOff = scheduler.handoffTask(handoffScheduled.state, {
  commandId: "handoff-visual",
  taskId: "handoff-visual-task",
  at: 100,
  reassignments: [{
    groupId: "doctor",
    fromResourceId: fromDoctorId,
    toResourceId: toDoctorId,
    capabilityId: "role.doctor",
    units: 1
  }]
});
assert.deepEqual(
  handedOff.state.reservations.map(({ resourceId, startAt, endAt }) => ({ resourceId, startAt, endAt })),
  [
    { resourceId: fromDoctorId, startAt: 90, endAt: 100 },
    { resourceId: toDoctorId, startAt: 100, endAt: 120 }
  ]
);
function handoffProjectionInput(at, schedulerState) {
  const input = createInput(createConfig());
  input.at = at;
  input.lifecycleSnapshot = lifecycle.snapshot(lifecycle.createState(), at);
  input.lifecycleSnapshot.resources[fromDoctorId].staffAvailabilityState = "available";
  input.lifecycleSnapshot.resources[toDoctorId].staffAvailabilityState = "available";
  input.schedulerState = schedulerState;
  return input;
}
const beforeHandoffView = assertReloadParity(
  handoffProjectionInput(99, handoffScheduled.state),
  "pre-handoff reservation owner"
);
assert.equal(resource(beforeHandoffView, "staff", fromDoctorId).state, "busy");
assert.equal(resource(beforeHandoffView, "staff", toDoctorId).state, "scheduled");
const afterHandoffView = assertReloadParity(
  handoffProjectionInput(100, handedOff.state),
  "post-handoff reservation owner"
);
assert.equal(resource(afterHandoffView, "staff", fromDoctorId).state, "scheduled");
assert.equal(resource(afterHandoffView, "staff", toDoctorId).state, "busy");
const afterIntervalView = assertReloadParity(
  handoffProjectionInput(120, handedOff.state),
  "reservation half-open end boundary"
);
assert.equal(resource(afterIntervalView, "staff", fromDoctorId).state, "scheduled");
assert.equal(resource(afterIntervalView, "staff", toDoctorId).state, "scheduled");

const unknownTaskInput = createInput(createConfig());
reserve(unknownTaskInput, {
  taskId: "owned-task",
  resourceId: "equipment.microscope",
  startAt: 90,
  endAt: 110
});
unknownTaskInput.schedulerState.reservations[0].taskId = "missing-task";
assert.throws(() => adapter.project(unknownTaskInput), /not canonical P5 reservation authority/u);
const queuedReservationInput = createInput(createConfig());
reserve(queuedReservationInput, {
  taskId: "queued-fixture",
  resourceId: "equipment.microscope",
  startAt: 90,
  endAt: 110
});
queuedReservationInput.schedulerState.tasks[0].status = "queued";
assert.throws(() => adapter.project(queuedReservationInput), /not canonical P5 reservation authority/u);

// HUD envelopes are exact and cannot leak reasonCode or stable runtime IDs to player text.
const wrongAuthorityInput = createInput(createConfig());
wrongAuthorityInput.hudAuthorities[0].authority = "ui.localState";
assert.throws(() => adapter.project(wrongAuthorityInput), /authority must remain p7\.campaignState/u);
const rawReasonInput = createInput(createConfig());
rawReasonInput.hudAuthorities.find((surface) => surface.surfaceId === "queue")
  .data.patientCards[0].reasonCode = "capacity_exceeded";
assert.throws(() => adapter.project(rawReasonInput), /player-facing raw identifier field/u);
const rawIdInput = createInput(createConfig());
rawIdInput.hudAuthorities.find((surface) => surface.surfaceId === "queue")
  .data.patientCards[0].patientId = "patient.123";
assert.throws(() => adapter.project(rawIdInput), /player-facing raw identifier field/u);
const rawIdTextInput = createInput(createConfig());
rawIdTextInput.hudAuthorities.find((surface) => surface.surfaceId === "event_log")
  .data.humanText = "Заблокировано equipment.microscope";
assert.throws(() => adapter.project(rawIdTextInput), /exposes a raw identifier/u);
const investigationIdTextInput = createInput(createConfig());
investigationIdTextInput.hudAuthorities.find((surface) => surface.surfaceId === "event_log")
  .data.humanText = "Ошибка investigation.cbc";
assert.throws(() => adapter.project(investigationIdTextInput), /exposes a raw identifier/u);
const snakeReasonInput = createInput(createConfig());
snakeReasonInput.hudAuthorities.find((surface) => surface.surfaceId === "queue")
  .data.patientCards[0].reason_code = "capacity_exceeded";
assert.throws(() => adapter.project(snakeReasonInput), /player-facing raw identifier field/u);
const safeRouteIdInput = createInput(createConfig());
safeRouteIdInput.hudAuthorities.find((surface) => surface.surfaceId === "queue")
  .data.patientCards[0].safeRouteId = "external-referral";
assert.throws(() => adapter.project(safeRouteIdInput), /player-facing raw identifier field/u);

// Transition messages always contain the three human Russian parts in authored order.
const englishNoticeInput = createInput(createConfig());
englishNoticeInput.transitionNotice.whatCanBeDone = "Open management";
assert.throws(() => adapter.project(englishNoticeInput), /human Russian text/u);
const rawNoticeInput = createInput(createConfig());
rawNoticeInput.transitionNotice.whatChanged = "Недоступно room.lab.basic";
assert.throws(() => adapter.project(rawNoticeInput), /exposes a raw identifier/u);

// Reduced motion changes presentation only; it never changes simulation-derived content.
const standardProjection = adapter.project(createInput(createConfig()));
const reducedInput = createInput(createConfig());
reducedInput.presentation.reducedMotion = true;
const reducedProjection = adapter.project(reducedInput);
const standardComparable = clone(standardProjection);
const reducedComparable = clone(reducedProjection);
delete standardComparable.presentation;
delete reducedComparable.presentation;
assert.deepEqual(reducedComparable, standardComparable);
assert.deepEqual(reducedProjection.presentation, {
  reducedMotion: true,
  motionMode: "reduced",
  transitionsEnabled: false
});

// Catalog and crosswalk mutations fail before any projection can be produced.
const missingRoomConfig = createConfig();
missingRoomConfig.roomCatalog.rooms.pop();
assert.throws(
  () => createP9VisualStateAdapter(missingRoomConfig),
  /room catalog must contain exactly 12 records/u
);
const missingAliasConfig = createConfig();
missingAliasConfig.assetCrosswalk.assetAliases.pop();
assert.throws(
  () => createP9VisualStateAdapter(missingAliasConfig),
  /exact 31 P9 referenced asset IDs/u
);
const inferredStaffPlacementConfig = createConfig();
inferredStaffPlacementConfig.assetCrosswalk.sceneBindings.staff.push({
  resourceId: "staff.doctor.sokolova",
  placementIds: ["invented-doctor-coordinate"]
});
assert.throws(
  () => createP9VisualStateAdapter(inferredStaffPlacementConfig),
  /staff Canvas placement cannot be inferred/u
);
const wrongLayoutConfig = createConfig();
wrongLayoutConfig.assetCrosswalk.targetSceneLayoutSha256 = "0".repeat(64);
assert.throws(
  () => createP9VisualStateAdapter(wrongLayoutConfig),
  /asset crosswalk identity or fail-closed boundary changed/u
);
const missingRoomAnchorConfig = createConfig();
missingRoomAnchorConfig.assetCrosswalk.sceneBindings.rooms[0].overlayAnchors.pop();
assert.throws(
  () => createP9VisualStateAdapter(missingRoomAnchorConfig),
  /must provide explicit anchors for all five room overlay assets/u
);

console.log("P9 visual-state adapter v2: exact 12/27/10/9 joins, fail-closed projection, HUD safety, scene bindings and reload parity passed.");
