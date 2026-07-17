(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_RESOURCE_STATE_SURFACE_V11 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STATE_ICONS = Object.freeze({
    not_owned: "🔒",
    pending_delivery: "📦",
    delivered_not_ready: "🧰",
    training_pending: "📘",
    maintenance_due: "⚠",
    maintenance_active: "🔧",
    stock_blocked: "!",
    ready: "✓",
    busy: "●",
    not_hired: "○",
    hired_unscheduled: "◷",
    scheduled: "✓",
    resting: "☕",
    absent: "—"
  });
  const SECTION_TITLES = Object.freeze({
    rooms: "Помещения",
    equipment: "Оборудование",
    staff: "Сотрудники"
  });

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function requireText(value, label) {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be human-readable text`);
    if (/(?:reasonCode|\b(?:room|equipment|staff)\.[a-z0-9_.-]+)/iu.test(value)) {
      throw new Error(`${label} contains a player-facing raw identifier`);
    }
    return value.trim();
  }

  function itemState(item) {
    return item.visualState || item.state || "unresolved";
  }

  function itemLabel(item) {
    return item.stateLabel || item.label || item.statusLabel || item.rosterLabel || "Статус требует проверки";
  }

  function makeElement(document, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function createReviewSurface(options = {}) {
    const document = options.document || globalThis.document;
    if (!document?.body) throw new Error("P9 review surface requires a document body");
    let mounted = false;
    let currentView = null;
    let controls;
    let chip;
    let summary;
    let drawer;
    let drawerBody;
    let closeButton;
    let toast;

    function mount() {
      if (mounted) return api;
      mounted = true;
      controls = makeElement(document, "div", "p9-review-controls");
      controls.dataset.resourceStateSurface = "controls";
      chip = makeElement(document, "button", "p9-review-chip", "Ресурсы клиники");
      chip.type = "button";
      chip.setAttribute("aria-expanded", "false");
      chip.setAttribute("aria-controls", "p9ReviewDrawer");
      summary = makeElement(document, "span", "p9-review-summary", "Проекция не загружена");
      controls.append(chip, summary);

      drawer = makeElement(document, "aside", "p9-review-drawer");
      drawer.id = "p9ReviewDrawer";
      drawer.hidden = true;
      drawer.setAttribute("aria-label", "Состояние ресурсов клиники");
      const header = makeElement(document, "header", "p9-review-drawer-header");
      const heading = makeElement(document, "div");
      heading.append(
        makeElement(document, "strong", null, "Ресурсы клиники"),
        makeElement(document, "span", null, "Помещения, оборудование и сотрудники")
      );
      closeButton = makeElement(document, "button", "p9-review-close", "×");
      closeButton.type = "button";
      closeButton.setAttribute("aria-label", "Закрыть список ресурсов");
      header.append(heading, closeButton);
      drawerBody = makeElement(document, "div", "p9-review-drawer-body");
      drawer.append(header, drawerBody);

      toast = makeElement(document, "section", "p9-review-toast");
      toast.hidden = true;
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");

      chip.addEventListener("click", open);
      closeButton.addEventListener("click", close);
      document.addEventListener("keydown", onKeyDown);
      document.body.append(controls, drawer, toast);
      return api;
    }

    function onKeyDown(event) {
      if (event.key === "Escape" && !drawer.hidden) close();
    }

    function open() {
      if (!mounted) mount();
      drawer.hidden = false;
      chip.setAttribute("aria-expanded", "true");
      closeButton.focus();
    }

    function close() {
      if (!mounted) return;
      drawer.hidden = true;
      chip.setAttribute("aria-expanded", "false");
      chip.focus();
    }

    function renderItem(item) {
      const title = requireText(item.title, "resource title");
      const state = itemState(item);
      const label = requireText(itemLabel(item), `${title} state label`);
      const row = makeElement(document, "li", "p9-review-resource");
      row.dataset.state = state;
      const icon = makeElement(document, "span", "p9-review-state-icon", STATE_ICONS[state] || "?");
      icon.setAttribute("aria-hidden", "true");
      const copy = makeElement(document, "span", "p9-review-resource-copy");
      copy.append(makeElement(document, "strong", null, title), makeElement(document, "span", null, label));
      const fallback = item.assetGapHumanText || item.fallbackLabel || item.missingAssetFallback?.label || null;
      if (fallback) copy.append(makeElement(document, "small", null, requireText(fallback, `${title} asset fallback`)));
      if (item.variantLabel || item.variantLabelRequired || item.sharedShellVariant || item.sharedAnalyzerShell) {
        copy.append(makeElement(document, "small", "p9-review-variant", `Вариант: ${requireText(item.variantLabel || title, `${title} variant`)}`));
      }
      const activationAsset = item.activationAsset;
      if (activationAsset?.file) {
        row.classList.add("has-preview");
        const preview = makeElement(document, "span", `p9-review-resource-preview ${activationAsset.presentation || ""}`);
        const image = makeElement(document, "img");
        image.src = activationAsset.file;
        image.alt = "";
        image.setAttribute("aria-hidden", "true");
        const imageFallback = makeElement(document, "small", "p9-review-image-fallback", "Изображение не загрузилось — текстовый статус сохранён.");
        imageFallback.hidden = true;
        image.addEventListener("error", () => {
          preview.classList.add("image-failed");
          image.hidden = true;
          imageFallback.hidden = false;
        }, { once: true });
        preview.append(image);
        copy.append(imageFallback);
        row.append(icon, preview, copy);
      } else {
        row.append(icon, copy);
      }
      return row;
    }

    function renderSection(key, items) {
      const section = makeElement(document, "section", "p9-review-section");
      const header = makeElement(document, "header");
      header.append(makeElement(document, "strong", null, SECTION_TITLES[key]), makeElement(document, "span", null, String(items.length)));
      const list = makeElement(document, "ul");
      items.forEach((item) => list.append(renderItem(item)));
      section.append(header, list);
      return section;
    }

    function render(view) {
      if (!mounted) mount();
      if (!isObject(view)) throw new TypeError("P9 review view must be an object");
      const resources = isObject(view.resources) ? view.resources : view;
      for (const [key, expected] of [["rooms", 12], ["equipment", 27], ["staff", 10]]) {
        if (!Array.isArray(resources[key]) || resources[key].length !== expected) {
          throw new Error(`P9 review view must contain exactly ${expected} ${key}`);
        }
      }
      currentView = view;
      const all = [...resources.rooms, ...resources.equipment, ...resources.staff];
      const ready = all.filter((item) => ["ready", "scheduled"].includes(itemState(item))).length;
      const unresolved = all.filter((item) => item.renderAllowed === false
        || ["unresolved", "unavailable"].includes(itemState(item))).length;
      summary.textContent = unresolved > 0
        ? `${ready} готовы · ${unresolved} требуют проверки`
        : `${ready} готовы · статусы синхронизированы`;
      chip.textContent = `Ресурсы · ${ready}/${all.length}`;
      const reducedMotion = view.reducedMotion === true || view.presentation?.reducedMotion === true;
      controls.classList.toggle("reduced-motion", reducedMotion);
      drawer.classList.toggle("reduced-motion", reducedMotion);
      drawerBody.textContent = "";
      drawerBody.append(
        renderSection("rooms", resources.rooms),
        renderSection("equipment", resources.equipment),
        renderSection("staff", resources.staff)
      );
      return api;
    }

    function showNotice(notice) {
      if (!mounted) mount();
      if (!isObject(notice)) throw new TypeError("P9 notice must be an object");
      toast.textContent = "";
      const happened = requireText(notice.whatHappened, "notice.whatHappened");
      const changed = requireText(notice.whatChanged, "notice.whatChanged");
      const action = requireText(notice.whatCanBeDone, "notice.whatCanBeDone");
      toast.append(
        makeElement(document, "strong", null, happened),
        makeElement(document, "span", null, changed),
        makeElement(document, "span", null, action)
      );
      toast.hidden = false;
      return api;
    }

    function hideNotice() {
      if (toast) toast.hidden = true;
      return api;
    }

    function metrics() {
      if (!mounted) return null;
      const rect = controls.getBoundingClientRect();
      return {
        mounted,
        drawerOpen: !drawer.hidden,
        controls: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        reducedMotion: controls.classList.contains("reduced-motion"),
        resourceCount: currentView
          ? ["rooms", "equipment", "staff"].reduce((total, key) => (
            total + (currentView.resources?.[key] || currentView[key] || []).length
          ), 0)
          : 0
      };
    }

    function destroy() {
      if (!mounted) return;
      document.removeEventListener("keydown", onKeyDown);
      controls.remove();
      drawer.remove();
      toast.remove();
      mounted = false;
      currentView = null;
    }

    const api = Object.freeze({ mount, render, open, close, showNotice, hideNotice, metrics, destroy });
    return api;
  }

  return Object.freeze({ createResourceSurface: createReviewSurface });
});
