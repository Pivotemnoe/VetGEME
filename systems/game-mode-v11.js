(function (root, factory) {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_GAME_MODE_V11 = api;
})(typeof window !== "undefined" ? window : globalThis, function (window) {
  "use strict";

  const SCHEMA_VERSION = 11;
  const saveManager = window.PET_CLINIC_SAVE_MANAGER_V11
    || (typeof require === "function" ? require("./save-manager-v11.js") : null);
  const MODE_IDS = Object.freeze(["campaign", "training", "endless", "tester"]);
  const MODE_DEFINITIONS = Object.freeze({
    campaign: Object.freeze({
      id: "campaign",
      title: "Кампания",
      eyebrow: "30 дней",
      description: "Развивайте клинику, ведите пациентов и отвечайте за экономику, команду и последствия решений.",
      saveKey: "pet-clinic-game-v11:campaign"
    }),
    training: Object.freeze({
      id: "training",
      title: "Обучение",
      eyebrow: "8 уроков",
      description: "Пройдите клинические основы без необратимых финансовых и репутационных потерь.",
      saveKey: "pet-clinic-game-v11:training"
    }),
    endless: Object.freeze({
      id: "endless",
      title: "Бесконечная игра",
      eyebrow: "Без финального дня",
      description: "Продолжайте работу клиники с полной экономикой, очередью, персоналом и последствиями.",
      saveKey: "pet-clinic-game-v11:endless"
    }),
    tester: Object.freeze({
      id: "tester",
      title: "Режим тестировщика",
      eyebrow: "Ручной выбор",
      description: "Проверяйте конкретные семейства, варианты и представления в отдельном техническом сохранении.",
      saveKey: "pet-clinic-game-v11:tester"
    })
  });

  let resolveSelection;
  let selected = null;
  const selectionPromise = new Promise((resolve) => {
    resolveSelection = resolve;
  });

  function isModeId(value) {
    return MODE_IDS.includes(value);
  }

  function modeDefinition(modeId) {
    if (!isModeId(modeId)) throw new RangeError(`Unknown Pet Clinic mode: ${modeId}`);
    return MODE_DEFINITIONS[modeId];
  }

  function storageHasSave(modeId) {
    try {
      const key = saveManager?.modeKey(modeId) || modeDefinition(modeId).saveKey;
      return Boolean(window.localStorage?.getItem(key));
    } catch (error) {
      console.warn("Не удалось проверить сохранение режима.", error);
      return false;
    }
  }

  function legacyRouteSelection(params) {
    const legacyGeneratorMode = params.get("generatorMode");
    if (legacyGeneratorMode === "current") {
      return { modeId: "campaign", launchAction: "continue", runtimeGeneratorMode: "current", source: "legacy-test-route" };
    }
    if (legacyGeneratorMode === "legacy-v1" || legacyGeneratorMode === "tier-01-v2") {
      return { modeId: "tester", launchAction: "continue", runtimeGeneratorMode: legacyGeneratorMode, source: "legacy-test-route" };
    }
    return null;
  }

  function explicitRouteSelection() {
    if (!window.location?.href) return null;
    const url = new URL(window.location.href);
    const modeId = url.searchParams.get("gameMode");
    if (isModeId(modeId)) {
      return { modeId, launchAction: "continue", runtimeGeneratorMode: "tier-01-v2", source: "direct-mode-route" };
    }
    return legacyRouteSelection(url.searchParams);
  }

  function updateRoute(selection) {
    if (!window.location?.href || !window.history?.replaceState) return;
    const url = new URL(window.location.href);
    url.searchParams.set("gameMode", selection.modeId);
    if (selection.source !== "legacy-test-route") url.searchParams.delete("generatorMode");
    window.history.replaceState(null, "", url);
  }

  function updateLoadingCopy(selection) {
    const loadingMessage = window.document?.getElementById("appLoadingMessage");
    if (loadingMessage) loadingMessage.textContent = `Подготавливаем режим «${modeDefinition(selection.modeId).title}»…`;
  }

  function launch(modeId, launchAction, options = {}) {
    if (selected) return selected;
    if (!isModeId(modeId)) throw new RangeError(`Unknown Pet Clinic mode: ${modeId}`);
    if (!['new', 'continue'].includes(launchAction)) throw new RangeError(`Unknown launch action: ${launchAction}`);

    if (launchAction === "new" && storageHasSave(modeId)) {
      const confirmed = typeof window.confirm !== "function" || window.confirm(
        `Начать заново в режиме «${modeDefinition(modeId).title}»? Сохранение только этого режима будет удалено.`
      );
      if (!confirmed) return null;
      saveManager?.clearMode(window.localStorage, modeId);
    }

    selected = Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      modeId,
      launchAction,
      saveKey: modeDefinition(modeId).saveKey,
      runtimeGeneratorMode: options.runtimeGeneratorMode || "tier-01-v2",
      source: options.source || "start-menu"
    });

    updateRoute(selected);
    try {
      saveManager?.writeSettings(window.localStorage, { lastModeId: modeId });
    } catch (error) {
      console.warn("Не удалось сохранить выбранный режим.", error);
    }
    updateLoadingCopy(selected);
    if (window.document?.documentElement) {
      window.document.documentElement.dataset.gameMode = modeId;
      window.document.documentElement.dataset.appStatus = "loading";
    }
    const menu = window.document?.getElementById("startMenu");
    const loadingVeil = window.document?.getElementById("appLoadingVeil");
    if (menu) menu.hidden = true;
    if (loadingVeil) loadingVeil.hidden = false;
    resolveSelection(selected);
    return selected;
  }

  function setDialog(dialogId, visible) {
    const dialog = window.document?.getElementById(dialogId);
    if (!dialog) return;
    dialog.hidden = !visible;
    if (visible) dialog.querySelector("button")?.focus();
  }

  function refreshContinueButtons() {
    for (const modeId of MODE_IDS) {
      const button = window.document?.querySelector(`[data-mode-continue="${modeId}"]`);
      if (!button) continue;
      const hasSave = storageHasSave(modeId);
      button.disabled = !hasSave;
      button.textContent = hasSave ? "Продолжить" : "Нет сохранения";
    }
  }

  function bindMenu() {
    const menu = window.document?.getElementById("startMenu");
    if (!menu) return;
    menu.hidden = false;
    refreshContinueButtons();

    menu.addEventListener("click", (event) => {
      const launchButton = event.target.closest("[data-mode-launch]");
      if (launchButton && !launchButton.disabled) {
        launch(launchButton.dataset.modeLaunch, launchButton.dataset.launchAction || "new");
        return;
      }
      const openDialog = event.target.closest("[data-menu-dialog]");
      if (openDialog) setDialog(openDialog.dataset.menuDialog, true);
      const closeDialog = event.target.closest("[data-menu-dialog-close]");
      if (closeDialog) setDialog(closeDialog.dataset.menuDialogClose, false);
      if (event.target.closest("[data-legacy-clear]")) {
        try {
          saveManager?.clearLegacy(window.localStorage);
          setDialog("legacySaveNotice", false);
          refreshContinueButtons();
        } catch (error) {
          console.error("Не удалось удалить старые сохранения.", error);
        }
      }
      if (event.target.closest("[data-legacy-later]")) setDialog("legacySaveNotice", false);
    });

    window.document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      setDialog("startMenuSettings", false);
      setDialog("startMenuAbout", false);
      setDialog("legacySaveNotice", false);
    });

    if (saveManager?.legacyCleanupRequired(window.localStorage)) {
      setDialog("legacySaveNotice", true);
    } else {
      menu.querySelector("[data-mode-launch]")?.focus();
    }
  }

  function initialize() {
    const routeSelection = explicitRouteSelection();
    if (routeSelection) {
      launch(routeSelection.modeId, routeSelection.launchAction, routeSelection);
      return;
    }
    if (window.document?.documentElement) window.document.documentElement.dataset.appStatus = "menu";
    const loadingVeil = window.document?.getElementById("appLoadingVeil");
    if (loadingVeil) loadingVeil.hidden = true;
    bindMenu();
  }

  const api = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    modeIds: MODE_IDS,
    modes: MODE_DEFINITIONS,
    selectionPromise,
    requireSelection() {
      return selectionPromise;
    },
    launch,
    modeDefinition,
    saveKey(modeId) {
      return modeDefinition(modeId).saveKey;
    },
    selected() {
      return selected;
    }
  });

  if (window.document) initialize();
  return api;
});
