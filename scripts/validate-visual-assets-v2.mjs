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
const placementById = new Map();
const corridorSegments = [
  ...(layout.corridor?.underlaySegments || []),
  ...(layout.corridor?.overlaySegments || []),
];
const corridorById = new Map(corridorSegments.map((segment) => [segment.id, segment]));

if (manifest.schemaVersion !== 2) {
  errors.push(`manifest.schemaVersion: ожидалось 2, получено ${manifest.schemaVersion}`);
}
if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
  errors.push("manifest.assets: список ресурсов пуст");
}
if (layout.schemaVersion !== 2) {
  errors.push(`layout.schemaVersion: ожидалось 2, получено ${layout.schemaVersion}`);
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
  if (!Number.isFinite(room.foregroundSlice?.zFootY)) {
    errors.push(`${room.id}: foregroundSlice.zFootY должен задавать глубину передней стены`);
  }
  for (const door of room.doors || []) validateDoor(room, door);
}

for (const room of layout.futureRooms || []) {
  requireAsset(room.assetId, `будущая комната ${room.id}`);
}

for (const placement of layout.placements || []) {
  if (!placement.id || placementIds.has(placement.id)) {
    errors.push(`layout.placements: повторяющийся или пустой id ${placement.id || "<empty>"}`);
  }
  placementIds.add(placement.id);
  placementById.set(placement.id, placement);
  requireAsset(placement.assetId, `размещение ${placement.id}`);
  if (placement.scale !== undefined && (!Number.isFinite(placement.scale) || placement.scale <= 0)) {
    errors.push(`размещение ${placement.id}: scale должен быть положительным числом`);
  }
}

for (const placement of layout.placements || []) {
  if (!placement.supportId) continue;
  const support = placementById.get(placement.supportId);
  if (!support) {
    errors.push(`размещение ${placement.id}: неизвестная опора ${placement.supportId}`);
    continue;
  }
  if (support.layer !== "floor" || placement.layer !== "floor") {
    errors.push(`размещение ${placement.id}: оборудование и опора должны находиться в floor-слое`);
  }
  if (placement.zFootY < support.zFootY) {
    errors.push(`размещение ${placement.id}: должно рисоваться не раньше опоры ${support.id}`);
  }
  const supportAsset = assetById.get(support.assetId);
  const halfSupportWidth = (supportAsset?.logical?.width || 0) * (support.scale || 1) / 2;
  if (Math.abs(placement.x - support.x) > halfSupportWidth) {
    errors.push(`размещение ${placement.id}: центр находится за пределами опоры ${support.id}`);
  }
}

for (const [layerName, segments] of Object.entries({
  underlaySegments: layout.corridor?.underlaySegments,
  overlaySegments: layout.corridor?.overlaySegments,
})) {
  for (const segment of segments || []) validateRect(segment, `corridor.${layerName}.${segment.id}`);
}
validateConnectedRects(layout.corridor?.underlaySegments || [], "corridor.underlaySegments");

for (const actor of layout.staticActors || []) {
  requireAsset(actor.animationId, `статичный персонаж ${actor.id}`);
}

for (const [routeName, points] of Object.entries(layout.routeHints || {})) {
  validatePoints(points, `routeHints.${routeName}`);
  validateNavigableRoute(routeName, points, routeFootprint(routeName));
}

if (layout.actorPresentation?.anchor !== "bottom_center"
  || layout.actorPresentation?.routeCoordinate !== "bottom_center") {
  errors.push("actorPresentation: runtime должен использовать единый anchor bottom_center");
}
if (!Number.isFinite(layout.actorPresentation?.runtimeFootOffset?.x)
  || !Number.isFinite(layout.actorPresentation?.runtimeFootOffset?.y)) {
  errors.push("actorPresentation.runtimeFootOffset: требуются числовые x/y");
}
if (!Number.isFinite(layout.actorPresentation?.travelScale)
  || layout.actorPresentation.travelScale <= 0
  || layout.actorPresentation.travelScale > 1) {
  errors.push("actorPresentation.travelScale: требуется число больше 0 и не больше 1");
}
if (!Number.isFinite(layout.actorPresentation?.animalOffset?.x)
  || !Number.isFinite(layout.actorPresentation?.animalOffset?.y)
  || !Number.isFinite(layout.actorPresentation?.travelAnimalOffset?.x)
  || !Number.isFinite(layout.actorPresentation?.travelAnimalOffset?.y)) {
  errors.push("actorPresentation: animalOffset и travelAnimalOffset должны содержать числовые x/y");
}
for (const asset of (manifest.assets || []).filter((item) => item.animation)) {
  if (asset.anchorX !== 0.5 || asset.anchorY !== 1) {
    errors.push(`${asset.id}: анимация должна иметь anchor bottom_center (0.5, 1)`);
  }
  const roleScale = layout.actorPresentation?.scaleByRole?.[asset.role];
  if (!Number.isFinite(roleScale) || roleScale <= 0) {
    errors.push(`${asset.id}: для роли ${asset.role} не задан положительный scene scale`);
  }
}
for (const routeName of Object.keys(layout.routeHints || {})) {
  const occupants = layout.actorPresentation?.routeOccupants?.[routeName];
  if (!Array.isArray(occupants) || occupants.length === 0) {
    errors.push(`actorPresentation.routeOccupants.${routeName}: требуется хотя бы одна роль`);
  }
}

for (const [anchorName, anchor] of Object.entries(layout.routeAnchors || {})) {
  validatePoint(anchor.point, `routeAnchors.${anchorName}.point`);
  if (!pointInNamedZone(anchor.point, anchor.zone)) {
    errors.push(`routeAnchors.${anchorName}: точка не принадлежит зоне ${anchor.zone}`);
  }
}

for (const [routeName, anchorNames] of Object.entries(layout.routeContracts || {})) {
  const points = layout.routeHints?.[routeName];
  if (!Array.isArray(points)) {
    errors.push(`routeContracts.${routeName}: маршрут отсутствует`);
    continue;
  }
  let cursor = -1;
  for (const anchorName of anchorNames) {
    const anchorPoint = layout.routeAnchors?.[anchorName]?.point;
    if (!anchorPoint) {
      errors.push(`routeContracts.${routeName}: неизвестный anchor ${anchorName}`);
      continue;
    }
    const nextIndex = points.findIndex((point, index) => index > cursor && samePoint(point, anchorPoint));
    if (nextIndex < 0) {
      errors.push(`routeContracts.${routeName}: маршрут не проходит anchor ${anchorName} в заданном порядке`);
      continue;
    }
    cursor = nextIndex;
  }
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

function validatePoint(point, context) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
    errors.push(`${context}: недопустимая точка ${JSON.stringify(point)}`);
    return;
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

function validateDoor(room, door) {
  if (door.side !== "bottom") {
    errors.push(`${room.id}.${door.id}: room shell поддерживает только видимый нижний проём`);
    return;
  }
  const expectedY = room.position.y + room.logicalBox.height - 1;
  if (door.y !== expectedY) {
    errors.push(`${room.id}.${door.id}: y=${door.y}, ожидается нижняя граница ${expectedY}`);
  }
  const left = door.x - door.width / 2;
  const right = door.x + door.width / 2;
  if (left < room.position.x || right > room.position.x + room.logicalBox.width) {
    errors.push(`${room.id}.${door.id}: проём выходит за ширину комнаты`);
  }
  const corridor = corridorById.get(door.corridorId);
  if (!corridor) {
    errors.push(`${room.id}.${door.id}: неизвестный corridorId ${door.corridorId}`);
    return;
  }
  const portalPoint = [door.x, door.y];
  if (!rectContains(corridor, portalPoint)) {
    errors.push(`${room.id}.${door.id}: проём не касается коридора ${door.corridorId}`);
  }
  if (!pointInPolygonInclusive(portalPoint, room.walkablePolygon)) {
    errors.push(`${room.id}.${door.id}: проём не связан с walkablePolygon комнаты`);
  }
}

function validateNavigableRoute(routeName, points, footprint) {
  if (!Array.isArray(points) || points.length < 2) return;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (!Array.isArray(from) || !Array.isArray(to) || !from.every(Number.isFinite) || !to.every(Number.isFinite)) continue;
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const steps = Math.max(1, Math.ceil(distance / 3));
    for (let step = 0; step <= steps; step += 1) {
      const progress = step / steps;
      const point = [
        from[0] + (to[0] - from[0]) * progress,
        from[1] + (to[1] - from[1]) * progress,
      ];
      if (horizontalFootprintIsNavigable(point, footprint)) continue;
      errors.push(
        `routeHints.${routeName}: габарит ${footprint.left.toFixed(1)}+${footprint.right.toFixed(1)} ` +
          `на сегменте ${index - 1}→${index} пересекает стену у ` +
          `${point[0].toFixed(1)},${point[1].toFixed(1)}`,
      );
      return;
    }
  }
}

function routeFootprint(routeName) {
  const occupants = layout.actorPresentation?.routeOccupants?.[routeName] || [];
  const stationary = routeName === "waitingSpots";
  const movementScale = stationary ? 1 : layout.actorPresentation?.travelScale || 1;
  let minimumX = 0;
  let maximumX = 0;
  for (const role of occupants) {
    const roleAssets = (manifest.assets || []).filter((asset) => asset.animation && asset.role === role);
    if (!roleAssets.length) {
      errors.push(`actorPresentation.routeOccupants.${routeName}: неизвестная роль ${role}`);
      continue;
    }
    const roleWidth = Math.max(...roleAssets.map((asset) => asset.logical?.width || 0));
    const roleScale = layout.actorPresentation?.scaleByRole?.[role] || 1;
    const width = roleWidth * roleScale * movementScale;
    const offset = role === "patient_animation"
      ? stationary
        ? layout.actorPresentation?.animalOffset?.x || 0
        : layout.actorPresentation?.travelAnimalOffset?.x || 0
      : 0;
    minimumX = Math.min(minimumX, offset - width / 2);
    maximumX = Math.max(maximumX, offset + width / 2);
  }
  return { left: -minimumX, right: maximumX };
}

function horizontalFootprintIsNavigable(point, footprint) {
  const width = footprint.left + footprint.right;
  const steps = Math.max(1, Math.ceil(width / 2));
  for (let step = 0; step <= steps; step += 1) {
    const x = point[0] - footprint.left + width * (step / steps);
    if (!pointIsNavigable([x, point[1]])) return false;
  }
  return true;
}

function pointIsNavigable(point) {
  return corridorSegments.some((segment) => rectContains(segment, point))
    || (layout.rooms || []).some((room) => pointInPolygonInclusive(point, room.walkablePolygon));
}

function pointInNamedZone(point, zoneName) {
  if (!Array.isArray(point)) return false;
  const room = (layout.rooms || []).find((item) => item.id === zoneName);
  if (room) return pointInPolygonInclusive(point, room.walkablePolygon);
  const corridor = corridorById.get(zoneName);
  return corridor ? rectContains(corridor, point) : false;
}

function rectContains(rect, point) {
  return point[0] >= rect.x && point[0] <= rect.x + rect.width
    && point[1] >= rect.y && point[1] <= rect.y + rect.height;
}

function pointInPolygonInclusive(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (pointOnSegment(point, start, end)) return true;
  }
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [x, y] = polygon[index];
    const [previousX, previousY] = polygon[previous];
    const intersects = y > point[1] !== previousY > point[1]
      && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointOnSegment(point, start, end) {
  const cross = (point[1] - start[1]) * (end[0] - start[0])
    - (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > 0.001) return false;
  return point[0] >= Math.min(start[0], end[0]) - 0.001
    && point[0] <= Math.max(start[0], end[0]) + 0.001
    && point[1] >= Math.min(start[1], end[1]) - 0.001
    && point[1] <= Math.max(start[1], end[1]) + 0.001;
}

function samePoint(first, second) {
  return Array.isArray(first) && Array.isArray(second)
    && first[0] === second[0] && first[1] === second[1];
}

function validateRect(rect, context) {
  const values = [rect?.x, rect?.y, rect?.width, rect?.height];
  if (!values.every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) {
    errors.push(`${context}: координаты и размеры должны быть положительными числами`);
    return;
  }
  if (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > layout.logicalSize.width ||
    rect.y + rect.height > layout.logicalSize.height
  ) {
    errors.push(`${context}: прямоугольник выходит за границы сцены`);
  }
}

function validateConnectedRects(rects, context) {
  if (rects.length < 2) return;
  const visited = new Set([0]);
  const pending = [0];
  while (pending.length) {
    const currentIndex = pending.shift();
    for (let candidateIndex = 0; candidateIndex < rects.length; candidateIndex += 1) {
      if (visited.has(candidateIndex)) continue;
      if (!rectsTouch(rects[currentIndex], rects[candidateIndex])) continue;
      visited.add(candidateIndex);
      pending.push(candidateIndex);
    }
  }
  if (visited.size !== rects.length) {
    const disconnected = rects
      .filter((_, index) => !visited.has(index))
      .map((rect) => rect.id || "<без id>");
    errors.push(`${context}: несвязанные секции ${disconnected.join(", ")}`);
  }
}

function rectsTouch(first, second) {
  return first.x <= second.x + second.width &&
    first.x + first.width >= second.x &&
    first.y <= second.y + second.height &&
    first.y + first.height >= second.y;
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
