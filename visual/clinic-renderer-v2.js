(function () {
  "use strict";

  const MODE_ID = "modular-v2";
  const LOAD_TIMEOUT_MS = 15000;
  const params = new URLSearchParams(window.location.search);
  const enabled = params.get("visualMode") === MODE_ID;
  const assetPackVersion = "20260715a";
  const manifestUrl = `art/runtime-v2/manifest.json?v=${assetPackVersion}`;
  const layoutUrl = `art/runtime-v2/scene-layout.json?v=${assetPackVersion}`;
  const assets = new Map();
  const images = new Map();
  let manifest = null;
  let layout = null;
  let ready = false;
  let settled = !enabled;
  let loadError = null;
  let preparationPromise = null;

  function imageFor(assetId) {
    return images.get(assetId) || null;
  }

  function assetFor(assetId) {
    return assets.get(assetId) || null;
  }

  function withTimeout(promise, label, onTimeout) {
    return new Promise((resolve, reject) => {
      let finished = false;
      const timer = window.setTimeout(() => {
        if (finished) return;
        finished = true;
        onTimeout?.();
        reject(new Error(`${label}: превышено время ожидания`));
      }, LOAD_TIMEOUT_MS);
      const finish = (callback, value) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        callback(value);
      };
      Promise.resolve(promise).then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error)
      );
    });
  }

  function loadImage(asset) {
    const image = new Image();
    let cancelled = false;
    const loading = new Promise((resolve, reject) => {
      image.decoding = "async";
      image.onload = async () => {
        try {
          if (typeof image.decode === "function") await image.decode();
          if (cancelled) return;
          images.set(asset.id, image);
          resolve(image);
        } catch (error) {
          reject(new Error(`Не удалось декодировать ${asset.file}: ${error.message}`));
        }
      };
      image.onerror = () => reject(new Error(`Не удалось загрузить ${asset.file}`));
      const imageUrl = new URL(asset.file, document.baseURI);
      imageUrl.searchParams.set("v", assetPackVersion);
      image.src = imageUrl.href;
    });
    return withTimeout(loading, `Ресурс ${asset.file}`, () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
      image.src = "";
    });
  }

  async function fetchJson(url, label) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const response = await withTimeout(
      fetch(url, controller ? { signal: controller.signal } : undefined),
      label,
      () => controller?.abort()
    );
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
    return withTimeout(response.json(), `${label}: JSON`);
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

  function status() {
    return {
      enabled,
      ready,
      settled,
      fallback: enabled && settled && !ready,
      error: loadError?.message || null
    };
  }

  function prepare() {
    if (preparationPromise) return preparationPromise;
    if (!enabled) {
      preparationPromise = Promise.resolve(status());
      return preparationPromise;
    }

    document.documentElement.dataset.visualMode = MODE_ID;
    settled = false;
    preparationPromise = (async () => {
      try {
        [manifest, layout] = await Promise.all([
          fetchJson(manifestUrl, "Manifest"),
          fetchJson(layoutUrl, "Layout")
        ]);
        manifest.assets.forEach((asset) => assets.set(asset.id, asset));
        const required = collectRequiredAssetIds();
        const missing = required.filter((assetId) => !assets.has(assetId));
        if (missing.length) throw new Error(`Manifest не содержит: ${missing.join(", ")}`);
        await Promise.all(required.map((assetId) => loadImage(assetFor(assetId))));
        ready = true;
        settled = true;
        window.dispatchEvent(new CustomEvent("pet-clinic-visual-v2-ready", { detail: status() }));
      } catch (error) {
        loadError = error;
        ready = false;
        settled = true;
        console.warn("Modular clinic visual mode failed to load; using the classic renderer.", error);
        window.dispatchEvent(new CustomEvent("pet-clinic-visual-v2-error", { detail: error }));
      }
      return status();
    })();
    return preparationPromise;
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

  function drawTiledSegment(context, segment) {
    const corridor = layout.corridor;
    const tileSize = corridor.tileSize || 32;
    context.fillStyle = corridor.base;
    context.fillRect(segment.x, segment.y, segment.width, segment.height);
    context.strokeStyle = corridor.grid;
    context.lineWidth = 1;
    for (let x = Math.ceil(segment.x / tileSize) * tileSize; x < segment.x + segment.width; x += tileSize) {
      context.beginPath();
      context.moveTo(x, segment.y);
      context.lineTo(x, segment.y + segment.height);
      context.stroke();
    }
    for (let y = Math.ceil(segment.y / tileSize) * tileSize; y < segment.y + segment.height; y += tileSize) {
      context.beginPath();
      context.moveTo(segment.x, y);
      context.lineTo(segment.x + segment.width, y);
      context.stroke();
    }
  }

  function drawCorridor(context, layer) {
    const key = layer === "overlay" ? "overlaySegments" : "underlaySegments";
    (layout.corridor?.[key] || []).forEach((segment) => drawTiledSegment(context, segment));
  }

  function drawScene(context, options = {}) {
    if (!ready) return false;
    context.imageSmoothingEnabled = false;
    drawCorridor(context, "underlay");
    layout.rooms.forEach((room) => drawRoom(context, room));
    layout.placements
      .filter((placement) => placement.layer === "wall")
      .forEach((placement) => drawAsset(context, placement.assetId, placement.x, placement.y, {
        scale: placement.scale || 1
      }));

    const floorDrawables = [];
    layout.placements
      .filter((placement) => placement.layer === "floor")
      .forEach((placement) => floorDrawables.push({
        id: placement.id,
        zFootY: placement.zFootY,
        draw: () => drawAsset(context, placement.assetId, placement.x, placement.y, {
          scale: placement.scale || 1
        })
      }));
    floorDrawables.sort((a, b) => a.zFootY - b.zFootY || a.id.localeCompare(b.id));
    floorDrawables.forEach((drawable) => drawable.draw());
    layout.rooms.forEach((room) => drawRoomForeground(context, room));
    drawCorridor(context, "overlay");

    const actorDrawables = [];
    layout.staticActors.forEach((actor) => actorDrawables.push({
      id: actor.id,
      zFootY: actor.zFootY,
      draw: () => drawAnimation(context, actor, options.time || 0)
    }));
    (options.actors || []).forEach((actor) => actorDrawables.push({
      id: actor.id,
      zFootY: actor.zFootY ?? actor.y,
      draw: () => {
        if (actor.animationId && drawAnimation(context, actor, options.time || 0)) return;
        options.fallbackActor?.(actor);
      }
    }));
    actorDrawables.sort((a, b) => a.zFootY - b.zFootY || a.id.localeCompare(b.id));
    actorDrawables.forEach((drawable) => drawable.draw());
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
    isSettled: () => settled,
    getError: () => loadError,
    getStatus: status,
    prepare,
    whenSettled: prepare,
    drawScene,
    route
  };
}());
