#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(root, "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const policy = readJson(path.join(root, "source/visual-policy.json"));
const art = readJson(path.join(repoRoot, "art/ASSET_MANIFEST.json"));
const resources = readJson(path.join(repoRoot, "p5-production-authoring-2026.07.16.2/generated/resource-catalog.json"));
const lifecycle = readJson(path.join(repoRoot, "p5-production-authoring-2026.07.16.2/generated/resource-lifecycle-catalog.json"));
const assetById = new Map(art.assets.map((item) => [item.id, item]));

const roomAssetIds = {
  "room.reception.1": ["room-reception-empty"],
  "room.waiting.1": ["room-waiting-empty"],
  "room.consult.1": ["room-doctor-office-empty"],
  "room.lab.basic": ["room-laboratory-empty"],
  "room.storage.1": ["room-pharmacy-empty"],
  "room.isolation.1": ["room-isolation-empty"],
  "room.consult.2": ["room-exam-02-empty"],
  "room.staff.1": [],
  "room.procedure.1": ["room-procedure-empty"],
  "room.imaging.1": ["room-imaging-empty"],
  "room.short_stay.1": ["room-procedure-empty"],
  "room.dental.1": ["room-procedure-empty"]
};

const equipmentTitles = {
  otoscope: "Отоскоп",
  microscope: "Микроскоп",
  tonometer: "Тонометр для глаз",
  ophthalmoscope: "Офтальмоскоп",
  fecal_centrifuge: "Центрифуга для анализа кала",
  wood_lamp: "Лампа Вуда",
  nebulizer: "Небулайзер",
  pulse_oximeter: "Пульсоксиметр",
  glucometer: "Глюкометр",
  blood_ketone_meter: "Измеритель кетонов",
  cgm_sensor: "Система непрерывного контроля глюкозы",
  centrifuge: "Лабораторная центрифуга",
  refractometer: "Рефрактометр",
  hematology_analyzer: "Гематологический анализатор",
  biochemistry_analyzer: "Биохимический анализатор",
  electrolyte_analyzer: "Анализатор электролитов",
  blood_pressure_monitor: "Монитор артериального давления",
  oxygen_device: "Кислородное оборудование",
  infusion_pump: "Инфузионный насос",
  vital_monitor: "Монитор жизненных показателей",
  feline_inhaler_spacer: "Спейсер для кошек",
  lactate_meter: "Измеритель лактата",
  xray_system: "Рентгеновская система",
  ultrasound_system: "УЗИ-аппарат",
  anesthesia_machine: "Наркозный аппарат",
  dental_xray_system: "Стоматологический рентген",
  coagulation_analyzer: "Коагулометр"
};

const equipmentAssetIds = {
  otoscope: ["equipment.diagnostic.otoscope-station"],
  microscope: ["equipment.diagnostic.microscope"],
  fecal_centrifuge: ["equipment.diagnostic.centrifuge"],
  centrifuge: ["equipment.diagnostic.centrifuge"],
  hematology_analyzer: ["equipment.diagnostic.hematology-analyzer"],
  biochemistry_analyzer: ["equipment.diagnostic.hematology-analyzer"],
  electrolyte_analyzer: ["equipment.diagnostic.hematology-analyzer"],
  coagulation_analyzer: ["equipment.diagnostic.hematology-analyzer"],
  oxygen_device: ["equipment.procedural.oxygen-cage"],
  infusion_pump: ["equipment.procedural.infusion-pumps"],
  vital_monitor: ["equipment.diagnostic.vital-sign-monitor"],
  xray_system: ["equipment.procedural.xray-table", "equipment.procedural.xray-console"],
  ultrasound_system: ["equipment.diagnostic.ultrasound-machine"],
  dental_xray_system: ["equipment.procedural.dental-station", "equipment.procedural.xray-console"]
};

const progression = {
  not_owned: ["progression.locked-door-overlay"],
  pending_delivery: ["progression.delivery-pallet", "progression.stacked-boxes"],
  delivered_not_ready: ["progression.opened-crates", "progression.covered-equipment"],
  training_pending: ["progression.covered-equipment"],
  maintenance_due: ["progression.safety-barrier"],
  maintenance_active: ["progression.renovation-cart", "progression.safety-barrier"]
};

const roomResources = resources.resources.filter((item) => item.resourceKind === "room");
const roomVisuals = roomResources.map((room) => {
  const baseAssetIds = roomAssetIds[room.resourceId];
  if (!baseAssetIds) throw new Error(`Missing authored room visual decision ${room.resourceId}.`);
  return {
    resourceId: room.resourceId,
    title: room.title,
    baseAssetIds,
    baseAssetStatus: baseAssetIds.length ? "available" : "missing_requires_art_or_dom_fallback",
    sharedShellVariant: ["room.short_stay.1", "room.dental.1"].includes(room.resourceId),
    missingAssetFallback: baseAssetIds.length ? null : {
      renderMode: "locked_or_dom_label_until_room_art_exists",
      label: "Помещение запланировано, но для него ещё нет отдельной картинки",
      capabilityMustRemainStateDriven: true
    },
    visualStates: {
      not_owned: { showBase: false, overlayAssetIds: progression.not_owned, label: policy.stateLabels.not_owned },
      pending_delivery: { showBase: true, overlayAssetIds: progression.pending_delivery, label: policy.stateLabels.pending_delivery },
      delivered_not_ready: { showBase: true, overlayAssetIds: progression.delivered_not_ready, label: policy.stateLabels.delivered_not_ready },
      ready: { showBase: true, overlayAssetIds: [], label: policy.stateLabels.ready },
      busy: { showBase: true, overlayAssetIds: [], domStatus: true, label: policy.stateLabels.busy }
    }
  };
});

const equipmentResources = resources.resources.filter((item) => item.resourceKind === "equipment");
const equipmentVisuals = equipmentResources.map((equipment) => {
  const capabilityId = equipment.capabilityId;
  const baseAssetIds = equipmentAssetIds[capabilityId] || [];
  const sharedAnalyzerShell = ["biochemistry_analyzer", "electrolyte_analyzer", "coagulation_analyzer"].includes(capabilityId);
  return {
    resourceId: equipment.resourceId,
    capabilityId,
    title: equipmentTitles[capabilityId],
    baseAssetIds,
    baseAssetStatus: baseAssetIds.length ? "available" : "missing_dom_label_required",
    sharedAnalyzerShell,
    variantLabelRequired: sharedAnalyzerShell,
    missingAssetFallback: baseAssetIds.length ? null : {
      renderMode: "dom_interaction_label_no_fake_sprite",
      label: `${equipmentTitles[capabilityId]}: отдельная картинка ещё не подготовлена`,
      capabilityMustRemainStateDriven: true
    },
    visualStates: {
      not_owned: { visibleInClinic: false, visibleInShop: true, label: policy.stateLabels.not_owned },
      pending_delivery: { showBase: false, overlayAssetIds: progression.pending_delivery, label: policy.stateLabels.pending_delivery },
      delivered_not_ready: { showBase: false, overlayAssetIds: progression.delivered_not_ready, label: policy.stateLabels.delivered_not_ready },
      training_pending: { showBase: false, overlayAssetIds: progression.training_pending, label: policy.stateLabels.training_pending },
      maintenance_due: { showBase: true, overlayAssetIds: progression.maintenance_due, label: policy.stateLabels.maintenance_due },
      maintenance_active: { showBase: true, overlayAssetIds: progression.maintenance_active, label: policy.stateLabels.maintenance_active },
      stock_blocked: { showBase: true, overlayAssetIds: [], domStatus: true, label: policy.stateLabels.stock_blocked },
      ready: { showBase: true, overlayAssetIds: [], label: policy.stateLabels.ready },
      busy: { showBase: true, overlayAssetIds: [], domStatus: true, label: policy.stateLabels.busy }
    }
  };
});

const staffResources = resources.resources.filter((item) => item.resourceKind === "staff");
const staffSpriteByRole = {
  doctor: ["characters.room-scale.veterinarian-female", "characters.room-scale.veterinarian-male"],
  assistant: ["characters.room-scale.veterinary-assistant"],
  administrator: ["characters.room-scale.receptionist"],
  lab_staff: ["characters.room-scale.veterinary-assistant"],
  imaging_staff: ["characters.room-scale.veterinary-assistant"],
  care_staff: ["characters.room-scale.veterinary-assistant"],
  manager: ["characters.room-scale.receptionist"]
};
const staffVisuals = staffResources.map((staff) => ({
  resourceId: staff.resourceId,
  name: staff.title,
  role: staff.role,
  candidateAssetIds: staffSpriteByRole[staff.role] || [],
  appearanceSelectionAuthority: "p4_identity_appearance_seed",
  behaviorSelectionAuthority: "p4_owner_patient_state_not_sprite",
  visualStates: {
    not_hired: { visibleInClinic: false, rosterLabel: "Пока не работает в клинике" },
    hired_unscheduled: { visibleInClinic: false, rosterLabel: "Нужно поставить смену" },
    scheduled: { visibleInClinic: true, rosterLabel: "Сегодня на смене" },
    busy: { visibleInClinic: true, statusLabel: "Сейчас занят" },
    resting: { visibleInClinic: true, statusLabel: "Отдыхает" },
    absent: { visibleInClinic: false, statusLabel: "Сегодня отсутствует" }
  }
}));

const hudContract = {
  schemaVersion: 1,
  catalogId: "vetgeme-p9-hud-data-contract",
  catalogVersion: policy.policyVersion,
  status: policy.status,
  runtimeEligible: false,
  persistentSurfaces: [
    { surfaceId: "clinic_identity", zone: "top_left", authority: "p7.campaignState", fields: ["clinicLevel", "chapter", "day", "campaignDay"] },
    { surfaceId: "next_patient", zone: "right_rail_top", authority: "p5.queueState+p4.identityState", fields: ["patientName", "species", "waitingMinutes", "ownerRequestHumanText"] },
    { surfaceId: "queue", zone: "right_rail", authority: "p5.queueState", fields: ["waitingCount", "inRoomCount", "patientCards"] },
    { surfaceId: "day_goals", zone: "right_rail_bottom", authority: "p7.dayState", fields: ["goalHumanText", "progress", "completed"] },
    { surfaceId: "cash", zone: "bottom_left", authority: "p6.ledgerState", fields: ["cash", "todayDelta"] },
    { surfaceId: "clock_controls", zone: "bottom", authority: "simulation.clock", fields: ["day", "time", "minutesToClose", "speed", "paused"] },
    { surfaceId: "trust_reputation", zone: "bottom", authority: "p4.ownerState+p6.reputationState", fields: ["ownerTrust", "clinicalReliability", "staffFatigue"] },
    { surfaceId: "active_capacity", zone: "bottom", authority: "p5.scheduler", fields: ["activeVisits", "capacity", "blockedReasonHumanText"] },
    { surfaceId: "event_log", zone: "bottom_right", authority: "appendOnlyEventLog", fields: ["time", "humanText", "severity"] }
  ],
  disclosure: {
    longPatientDetails: "drawer",
    fullGoals: "drawer_on_mobile",
    inventoryAndAssets: "management_drawer",
    medicalResultDetails: "visit_or_results_panel",
    criticalAlert: "edge_toast_with_action",
    normalPlayCenterOverlay: false
  },
  priorityOrder: ["clinical_danger", "missing_safe_route", "result_due", "resource_blocked", "queue_pressure", "economy_warning", "informational"]
};

for (const id of [...new Set([
  ...roomVisuals.flatMap((item) => item.baseAssetIds),
  ...equipmentVisuals.flatMap((item) => item.baseAssetIds),
  ...staffVisuals.flatMap((item) => item.candidateAssetIds),
  ...Object.values(progression).flat()
])]) {
  if (!assetById.has(id)) throw new Error(`P9 references missing art asset ${id}.`);
}

writeJson("generated/room-visual-state-catalog.json", { schemaVersion: 1, catalogId: "vetgeme-p9-room-visual-states", catalogVersion: policy.policyVersion, status: policy.status, runtimeEligible: false, rooms: roomVisuals });
writeJson("generated/equipment-visual-state-catalog.json", { schemaVersion: 1, catalogId: "vetgeme-p9-equipment-visual-states", catalogVersion: policy.policyVersion, status: policy.status, runtimeEligible: false, equipment: equipmentVisuals });
writeJson("generated/staff-visual-state-catalog.json", { schemaVersion: 1, catalogId: "vetgeme-p9-staff-visual-states", catalogVersion: policy.policyVersion, status: policy.status, runtimeEligible: false, staff: staffVisuals });
writeJson("generated/hud-data-contract.json", hudContract);
writeJson("reports/ASSET_GAPS.json", {
  schemaVersion: 1,
  reportId: "vetgeme-p9-asset-gaps",
  reportVersion: policy.policyVersion,
  status: "non_blocking_dom_fallback_authored",
  missingRoomAssets: roomVisuals.filter((item) => item.baseAssetIds.length === 0).map((item) => ({ resourceId: item.resourceId, title: item.title, fallback: item.missingAssetFallback })),
  missingEquipmentAssets: equipmentVisuals.filter((item) => item.baseAssetIds.length === 0).map((item) => ({ resourceId: item.resourceId, capabilityId: item.capabilityId, title: item.title, fallback: item.missingAssetFallback })),
  sharedShellVariants: [
    ...roomVisuals.filter((item) => item.sharedShellVariant).map((item) => ({ kind: "room", resourceId: item.resourceId, title: item.title })),
    ...equipmentVisuals.filter((item) => item.sharedAnalyzerShell).map((item) => ({ kind: "equipment", resourceId: item.resourceId, title: item.title }))
  ],
  rule: "Missing art never changes simulation availability and never permits a misleading substitute without a human label."
});

const manifest = {
  schemaVersion: 1,
  packageId: "vetgeme-p9-visual-state-authoring",
  packageVersion: policy.policyVersion,
  createdAt: "2026-07-16",
  status: "author_complete_validation_pending",
  runtimeEligible: false,
  activationRequires: ["programmer_projection_adapter", "1280x720_browser_smoke", "mobile_collapse_smoke", "save_reload_visual_parity"],
  boundaries: { runtimeChanged: false, designChanged: false, saveSchemaChanged: false, simulationAuthorityChanged: false, artFilesChanged: false },
  sources: { artPackId: art.packId, p5ResourceCatalogVersion: resources.catalogVersion, p5LifecycleCatalogVersion: lifecycle.catalogVersion },
  counts: {
    artAssetsAvailable: art.assets.length,
    rooms: roomVisuals.length,
    roomsWithBaseAsset: roomVisuals.filter((item) => item.baseAssetIds.length).length,
    equipment: equipmentVisuals.length,
    equipmentWithBaseAsset: equipmentVisuals.filter((item) => item.baseAssetIds.length).length,
    equipmentMissingBaseAsset: equipmentVisuals.filter((item) => !item.baseAssetIds.length).length,
    staff: staffVisuals.length,
    hudSurfaces: hudContract.persistentSurfaces.length
  },
  files: [
    "MANIFEST.json", "README.md", "PROGRAMMER_TASK.md", "source/visual-policy.json",
    "scripts/build-p9-package.mjs", "scripts/validate-p9-package.mjs",
    "generated/room-visual-state-catalog.json", "generated/equipment-visual-state-catalog.json",
    "generated/staff-visual-state-catalog.json", "generated/hud-data-contract.json",
    "reports/ASSET_GAPS.json", "reports/VALIDATION_REPORT.json"
  ]
};
writeJson("MANIFEST.json", manifest);
console.log(JSON.stringify(manifest.counts, null, 2));
