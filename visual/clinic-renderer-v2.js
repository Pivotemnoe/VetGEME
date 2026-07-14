(function () {
  "use strict";

  const MODE_ID = "modular-v2";
  const params = new URLSearchParams(window.location.search);
  const enabled = params.get("visualMode") === MODE_ID;
  const manifestUrl = "art/runtime-v2/manifest.json";
  const layoutUrl = "art/runtime-v2/scene-layout.json";
  const assets = new Map();
  const images = new Map();
  let manifest = null;
  let layout = null;
  let ready = false;
  let loadError = null;

  function imageFor(assetId) {
    return images.get(assetId) || null;
  }

  function assetFor(assetId) {
    return assets.get(assetId) || null;
  }

  function loadImage(asset) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        images.set(asset.id, image);
        resolve(image);
      };
      image.onerror = () => reject(new Error(`Не удалось загрузить ${asset.file}`));
      image.src = new URL(asset.file, document.baseURI).href;
    });
  }

  function collectRequiredAssetIds() {
    const required = new Set();
    layout.rooms.forEach((room) => required.add(room.assetId));
    layout.placements.forEach((placement) => required.add(placement.assetId));
    layout.staticActors.forEach((actor) => required.add(actor.animationId));
    [
      "animation.cat-gray",
      "animation.dog-brown",
      "animation.owner-female",
      "animation.owner-male",
      "animation.veterinarian-female",
      "animation.veterinarian-male"
    ].forEach((assetId) => required.add(assetId));
    return [...required];
  }

  async function boot() {
    if (!enabled) return;
    document.documentElement.dataset.visualMode = MODE_ID;
    try {
      const [manifestResponse, layoutResponse] = await Promise.all([
        fetch(manifestUrl),
        fetch(layoutUrl)
      ]);
      if (!manifestResponse.ok) throw new Error(`Manifest: HTTP ${manifestResponse.status}`);
      if (!layoutResponse.ok) throw new Error(`Layout: HTTP ${layoutResponse.status}`);
      [manifest, layout] = await Promise.all([manifestResponse.json(), layoutResponse.json()]);
      manifest.assets.forEach((asset) => assets.set(asset.id, asset));
      const required = collectRequiredAssetIds();
      const missing = required.filter((assetId) => !assets.has(assetId));
      if (missing.length) throw new Error(`Manifest не содержит: ${missing.join(", ")}`);
      await Promise.all(required.map((assetId) => loadImage(assetFor(assetId))));
      ready = true;
      window.dispatchEvent(new CustomEvent("pet-clinic-visual-v2-ready"));
    } catch (error) {
      loadError = error;
      console.error("Modular clinic visual mode failed to load.", error);
      window.dispatchEvent(new CustomEvent("pet-clinic-visual-v2-error", { detail: error }));
    }
  }

  function drawAsset(context, assetId, x, y, options = {}) {
    const asset = assetFor(assetId);
    const image = imageFor(assetId);
    if (!asset || !image) return false;
    const scale = options.scale || 1;
    const width = asset.logical.width * scale;
    const height = asset.logical.height * scale;
    const anchorX = options.anchorX ?? asset.anchorX ?? 0.5;
    const anchorY = options.anchorY ?? asset.anchorY ?? 1;
    context.drawImage(image, Math.round(x - width * anchorX), Math.round(y - height * anchorY), Math.round(width), Math.round(height));
    return true;
  }

  function animationFrame(asset, stateName, time) {
    const animation = asset.animation;
    const state = animation.states[stateName] || animation.states.idle;
    if (!state || !state.frames.length) return 0;
    if (!state.loop) return state.frames[Math.min(state.frames.length - 1, Math.floor(time / state.durationMs))];
    return state.frames[Math.floor(time / state.durationMs) % state.frames.length];
  }

  function drawAnimation(context, actor, time) {
    const asset = assetFor(actor.animationId);
    const image = imageFor(actor.animationId);
    if (!asset?.animation || !image) return false;
    const animation = asset.animation;
    const frame = animationFrame(asset, actor.state || "idle", time + (actor.timeOffset || 0));
    const scale = actor.scale || 1;
    const width = asset.logical.width * scale;
    const height = asset.logical.height * scale;
    const anchorX = actor.anchorX ?? asset.anchorX ?? 0.5;
    const anchorY = actor.anchorY ?? asset.anchorY ?? 1;
    context.save();
    if (actor.mirror) {
      context.translate(Math.round(actor.x), 0);
      context.scale(-1, 1);
      context.drawImage(
        image,
        frame * animation.frameWidth,
        0,
        animation.frameWidth,
        animation.frameHeight,
        Math.round(-width * (1 - anchorX)),
        Math.round(actor.y - height * anchorY),
        Math.round(width),
        Math.round(height)
      );
    } else {
      context.drawImage(
        image,
        frame * animation.frameWidth,
        0,
        animation.frameWidth,
        animation.frameHeight,
        Math.round(actor.x - width * anchorX),
        Math.round(actor.y - height * anchorY),
        Math.round(width),
        Math.round(height)
      );
    }
    context.restore();
    return true;
  }

  function drawRoom(context, room) {
    const asset = assetFor(room.assetId);
    const image = imageFor(room.assetId);
    if (!asset || !image) return;
    context.drawImage(image, room.position.x, room.position.y, room.logicalBox.width, room.logicalBox.height);
  }

  function drawRoomForeground(context, room) {
    const image = imageFor(room.assetId);
    if (!image || !room.foregroundSlice) return;
    const asset = assetFor(room.assetId);
    const sourceY = room.foregroundSlice.sourceY;
    const sourceHeight = room.foregroundSlice.height;
    const destinationScale = room.logicalBox.height / asset.source.height;
    context.drawImage(
      image,
      0,
      sourceY,
      asset.source.width,
      sourceHeight,
      room.position.x,
      room.position.y + sourceY * destinationScale,
      room.logicalBox.width,
      sourceHeight * destinationScale
    );
  }

  function drawCorridor(context) {
    context.fillStyle = "#b6c3c8";
    context.fillRect(70, 308, 1130, 64);
    context.strokeStyle = "rgba(72, 89, 101, 0.28)";
    context.lineWidth = 1;
    for (let x = 70; x <= 1200; x += 32) {
      context.beginPath();
      context.moveTo(x, 308);
      context.lineTo(x, 372);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(70, 340);
    context.lineTo(1200, 340);
    context.stroke();
  }

  function drawScene(context, options = {}) {
    if (!ready) return false;
    context.imageSmoothingEnabled = false;
    drawCorridor(context);
    layout.rooms.forEach((room) => drawRoom(context, room));
    layout.placements
      .filter((placement) => placement.layer === "wall")
      .forEach((placement) => drawAsset(context, placement.assetId, placement.x, placement.y));

    const drawables = [];
    layout.placements
      .filter((placement) => placement.layer === "floor")
      .forEach((placement) => drawables.push({
        id: placement.id,
        zFootY: placement.zFootY,
        draw: () => drawAsset(context, placement.assetId, placement.x, placement.y)
      }));
    layout.staticActors.forEach((actor) => drawables.push({
      id: actor.id,
      zFootY: actor.zFootY,
      draw: () => drawAnimation(context, actor, options.time || 0)
    }));
    (options.actors || []).forEach((actor) => drawables.push({
      id: actor.id,
      zFootY: actor.zFootY ?? actor.y,
      draw: () => {
        if (actor.animationId && drawAnimation(context, actor, options.time || 0)) return;
        options.fallbackActor?.(actor);
      }
    }));
    drawables.sort((a, b) => a.zFootY - b.zFootY || a.id.localeCompare(b.id));
    drawables.forEach((drawable) => drawable.draw());
    layout.rooms.forEach((room) => drawRoomForeground(context, room));
    return true;
  }

  function route(name) {
    return ready && Array.isArray(layout.routeHints[name])
      ? layout.routeHints[name].map((point) => [...point])
      : null;
  }

  window.PET_CLINIC_VISUAL_V2 = {
    modeId: MODE_ID,
    isEnabled: () => enabled,
    isReady: () => ready,
    getError: () => loadError,
    getStatus: () => ({ enabled, ready, error: loadError?.message || null }),
    drawScene,
    route
  };

  boot();
}());
