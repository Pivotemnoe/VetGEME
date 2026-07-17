(function (root) {
  "use strict";

  const renderer = root.PET_CLINIC_VISUAL_V2;
  if (!renderer) return;

  const VERSION = "pet-clinic-resource-state-renderer-v11@2026.07.17.1";
  const manifestUrl = "art/runtime-v2/manifest.json?v=20260715d";
  const layoutUrl = "art/runtime-v2/scene-layout.json?v=20260715d";
  const overlayAssetIds = new Set([
    "progression.locked-door-overlay",
    "progression.delivery-pallet",
    "progression.stacked-boxes",
    "progression.opened-crates",
    "progression.covered-equipment"
  ]);
  const originalPrepare = renderer.prepare.bind(renderer);
  const originalDrawScene = renderer.drawScene.bind(renderer);
  const originalStatus = renderer.getStatus.bind(renderer);
  const images = new Map();
  const assets = new Map();
  let layout = null;
  let overlayReady = false;
  let overlayError = null;
  let overlayPromise = null;

  async function loadImage(asset) {
    const image = new Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(`Не удалось загрузить ${asset.file}`));
      image.src = `${asset.file}?v=20260717g`;
    });
    if (typeof image.decode === "function") await image.decode();
    images.set(asset.id, image);
  }

  function prepareOverlays() {
    if (overlayPromise) return overlayPromise;
    overlayPromise = (async () => {
      try {
        const [manifestResponse, layoutResponse] = await Promise.all([fetch(manifestUrl), fetch(layoutUrl)]);
        if (!manifestResponse.ok || !layoutResponse.ok) throw new Error("Не удалось загрузить схему визуальных состояний");
        const [manifest, loadedLayout] = await Promise.all([manifestResponse.json(), layoutResponse.json()]);
        layout = loadedLayout;
        manifest.assets
          .filter((asset) => overlayAssetIds.has(asset.id))
          .forEach((asset) => assets.set(asset.id, asset));
        if (assets.size !== overlayAssetIds.size) throw new Error("Не все служебные изображения состояний найдены");
        await Promise.all([...assets.values()].map(loadImage));
        overlayReady = true;
      } catch (error) {
        overlayError = error;
        overlayReady = false;
        console.warn("Визуальные отметки ресурсов не загрузились; текстовые статусы сохранены.", error);
      }
    })();
    return overlayPromise;
  }

  function drawAsset(context, assetId, x, y, scale) {
    const asset = assets.get(assetId);
    const image = images.get(assetId);
    if (!asset || !image) return;
    const width = asset.logical.width * scale;
    const height = asset.logical.height * scale;
    context.drawImage(
      image,
      Math.round(x - width * (asset.anchorX ?? 0.5)),
      Math.round(y - height * (asset.anchorY ?? 1)),
      Math.round(width),
      Math.round(height)
    );
  }

  function dimUnavailableRoom(context, room) {
    context.save();
    context.fillStyle = "rgba(15, 34, 48, 0.62)";
    context.fillRect(room.position.x + 7, room.position.y + 17, room.logicalBox.width - 14, room.logicalBox.height - 34);
    context.fillStyle = "#f4fbff";
    context.font = "700 14px Trebuchet MS, Arial, sans-serif";
    context.textAlign = "center";
    context.fillText("Помещение пока недоступно", room.position.x + room.logicalBox.width / 2, room.position.y + 92);
    context.restore();
  }

  function drawRoomProjection(context, roomsBySceneId) {
    layout.rooms.forEach((room) => {
      const record = roomsBySceneId?.[room.id];
      if (!record) return;
      if (record.showBase === false) dimUnavailableRoom(context, room);
      (record.overlayAssetIds || []).forEach((assetId) => {
        const anchor = record.overlayAnchorsByAssetId?.[assetId];
        if (anchor) drawAsset(context, assetId, anchor.x, anchor.y, anchor.scale);
      });
    });
  }

  function drawPlacementProjection(context, placementsById) {
    const placementById = new Map(layout.placements.map((placement) => [placement.id, placement]));
    Object.entries(placementsById || {}).forEach(([placementId, record]) => {
      const placement = placementById.get(placementId);
      if (!placement) return;
      if (record.showBase === false) {
        context.save();
        context.fillStyle = "rgba(15, 34, 48, 0.72)";
        context.fillRect(placement.x - 40, placement.y - 74, 80, 76);
        context.fillStyle = "#f4fbff";
        context.font = "700 11px Trebuchet MS, Arial, sans-serif";
        context.textAlign = "center";
        context.fillText("Недоступно", placement.x, placement.y - 28);
        context.restore();
      }
      (record.overlayAssetIds || []).forEach((assetId, index, all) => {
        drawAsset(context, assetId, placement.x + (index - (all.length - 1) / 2) * 34, placement.y, 0.34);
      });
    });
  }

  function drawRuntimeProjection(context, visualState) {
    if (!overlayReady || visualState?.runtimeEligible !== true || !layout) return;
    const scene = visualState.scene;
    if (!scene || typeof scene !== "object") return;
    context.save();
    context.imageSmoothingEnabled = false;
    drawRoomProjection(context, scene.roomsBySceneId);
    drawPlacementProjection(context, scene.placementsById);
    context.restore();
  }

  renderer.prepare = async function prepare() {
    const [status] = await Promise.all([originalPrepare(), prepareOverlays()]);
    return { ...status, resourceProjectionReady: overlayReady, resourceProjectionError: overlayError?.message || null };
  };
  renderer.drawScene = function drawScene(context, options = {}) {
    const drawn = originalDrawScene(context, options);
    if (drawn) drawRuntimeProjection(context, options.visualState);
    return drawn;
  };
  renderer.getStatus = function getStatus() {
    return {
      ...originalStatus(),
      resourceProjectionVersion: VERSION,
      resourceProjectionReady: overlayReady,
      resourceProjectionError: overlayError?.message || null
    };
  };
  renderer.resourceProjectionVersion = VERSION;
})(window);
