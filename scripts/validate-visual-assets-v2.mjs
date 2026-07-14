import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "art/runtime-v2/manifest.json");
const layoutPath = path.join(root, "art/runtime-v2/scene-layout.json");

const [manifest, layout] = await Promise.all([
  readJson(manifestPath),
  readJson(layoutPath),
]);

const errors = [];
const assetById = new Map();
const placementIds = new Set();

if (manifest.schemaVersion !== 2) {
  errors.push(`manifest.schemaVersion: ожидалось 2, получено ${manifest.schemaVersion}`);
}
if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
  errors.push("manifest.assets: список ресурсов пуст");
}
if (layout.schemaVersion !== 1) {
  errors.push(`layout.schemaVersion: ожидалось 1, получено ${layout.schemaVersion}`);
}

for (const asset of manifest.assets || []) {
  if (!asset.id) {
    errors.push("manifest.assets: найден ресурс без id");
    continue;
  }
  if (assetById.has(asset.id)) {
    errors.push(`manifest.assets: повторяющийся id ${asset.id}`);
    continue;
  }
  assetById.set(asset.id, asset);

  if (!asset.file?.startsWith("art/runtime-v2/assets/")) {
    errors.push(`${asset.id}: файл должен находиться в art/runtime-v2/assets`);
    continue;
  }

  try {
    const buffer = await readFile(path.join(root, asset.file));
    const dimensions = readPngDimensions(buffer);
    if (dimensions.width !== asset.source?.width || dimensions.height !== asset.source?.height) {
      errors.push(
        `${asset.id}: PNG ${dimensions.width}x${dimensions.height}, ` +
          `манифест ${asset.source?.width}x${asset.source?.height}`,
      );
    }
  } catch (error) {
    errors.push(`${asset.id}: файл недоступен (${error.message})`);
  }

  if (asset.animation) {
    const animation = asset.animation;
    if (animation.frameWidth * animation.frameCount !== asset.source?.width) {
      errors.push(`${asset.id}: ширина кадров не совпадает с шириной полосы`);
    }
    if (animation.frameHeight !== asset.source?.height) {
      errors.push(`${asset.id}: высота кадра не совпадает с высотой полосы`);
    }
    for (const [stateName, state] of Object.entries(animation.states || {})) {
      for (const frame of state.frames || []) {
        if (!Number.isInteger(frame) || frame < 0 || frame >= animation.frameCount) {
          errors.push(`${asset.id}.${stateName}: недопустимый кадр ${frame}`);
        }
      }
    }
  }
}

for (const room of layout.rooms || []) {
  requireAsset(room.assetId, `комната ${room.id}`);
  const asset = assetById.get(room.assetId);
  if (
    asset &&
    (room.logicalBox?.width !== asset.logical?.width ||
      room.logicalBox?.height !== asset.logical?.height)
  ) {
    errors.push(`${room.id}: logicalBox не совпадает с логическим размером ${room.assetId}`);
  }
  validatePoints(room.walkablePolygon, `${room.id}.walkablePolygon`);
}

for (const room of layout.futureRooms || []) {
  requireAsset(room.assetId, `будущая комната ${room.id}`);
}

for (const placement of layout.placements || []) {
  if (!placement.id || placementIds.has(placement.id)) {
    errors.push(`layout.placements: повторяющийся или пустой id ${placement.id || "<empty>"}`);
  }
  placementIds.add(placement.id);
  requireAsset(placement.assetId, `размещение ${placement.id}`);
}

for (const actor of layout.staticActors || []) {
  requireAsset(actor.animationId, `статичный персонаж ${actor.id}`);
}

for (const [routeName, points] of Object.entries(layout.routeHints || {})) {
  validatePoints(points, `routeHints.${routeName}`);
}

const roomAssets = (manifest.assets || []).filter((asset) => asset.category === "room");
const readyRooms = roomAssets.filter((asset) => asset.layoutStatus === "ready").length;
if (manifest.coverage?.rooms?.total !== roomAssets.length) {
  errors.push("coverage.rooms.total не совпадает с количеством комнат в манифесте");
}
if (manifest.coverage?.rooms?.ready !== roomAssets.length) {
  errors.push("coverage.rooms.ready должно отражать готовность всех PNG комнат");
}
if (layout.rooms?.length !== readyRooms) {
  errors.push("число размещённых комнат не совпадает с комнатами layoutStatus=ready");
}

if (errors.length > 0) {
  console.error(`Проверка визуальных ресурсов v2: ${errors.length} ошибок`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const animations = (manifest.assets || []).filter((asset) => asset.animation).length;
  console.log(
    `Проверка визуальных ресурсов v2: ${manifest.assets.length} ресурсов, ` +
      `${layout.rooms.length} комнаты в сцене, ${animations} полос анимации — ошибок нет`,
  );
}

function requireAsset(assetId, context) {
  if (!assetById.has(assetId)) errors.push(`${context}: неизвестный assetId ${assetId}`);
}

function validatePoints(points, context) {
  if (!Array.isArray(points) || points.length < 2) {
    errors.push(`${context}: требуется минимум две точки`);
    return;
  }
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
      errors.push(`${context}: недопустимая точка ${JSON.stringify(point)}`);
      continue;
    }
    if (
      point[0] < 0 ||
      point[0] > layout.logicalSize.width ||
      point[1] < 0 ||
      point[1] > layout.logicalSize.height
    ) {
      errors.push(`${context}: точка ${point.join(",")} вне сцены`);
    }
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function readPngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("файл не является PNG");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}
