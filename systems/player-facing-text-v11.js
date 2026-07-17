(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_PLAYER_TEXT_V11 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function rounded(value) {
    return Math.round(Number(value) || 0);
  }

  function formatNumber(value) {
    return rounded(value).toLocaleString("ru-RU");
  }

  function pluralForm(value, one, few, many) {
    const absolute = Math.abs(rounded(value));
    const lastTwo = absolute % 100;
    const last = absolute % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return many;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }

  function minutes(value) {
    const amount = rounded(value);
    return `${formatNumber(amount)} ${pluralForm(amount, "минута", "минуты", "минут")}`;
  }

  function waitingMinutes(value) {
    const amount = rounded(value);
    return `${formatNumber(amount)} ${pluralForm(amount, "минуту", "минуты", "минут")}`;
  }

  function waitingCount(value) {
    const amount = rounded(value);
    return `${formatNumber(amount)} ${pluralForm(amount, "ждёт", "ждут", "ждут")}`;
  }

  function arrivedCount(value) {
    const amount = rounded(value);
    return `${formatNumber(amount)} ${amount === 1 ? "пришёл" : "пришли"}`;
  }

  function hours(value) {
    const amount = rounded(value);
    return `${formatNumber(amount)} ${pluralForm(amount, "час", "часа", "часов")}`;
  }

  function days(value) {
    const amount = rounded(value);
    return `${formatNumber(amount)} ${pluralForm(amount, "день", "дня", "дней")}`;
  }

  function vetcoins(value, options = {}) {
    const amount = rounded(value);
    const sign = options.signed && amount > 0 ? "+" : "";
    return `${sign}${formatNumber(amount)} ${pluralForm(amount, "веткоин", "веткоина", "веткоинов")}`;
  }

  function sentence(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    return /[.!?…]$/u.test(text) ? text : `${text}.`;
  }

  function requiredHistorySummary(questions, asked) {
    const required = (questions || []).filter((question) => question.required === true);
    if (!required.length) return "Обязательных вопросов для этого приёма нет.";
    const completed = required.filter((question) => asked?.[question.id]);
    const answers = completed.map((question) => sentence(question.answer)).filter(Boolean);
    const status = completed.length === required.length
      ? "Все обязательные сведения уточнены."
      : completed.length
        ? `Уточнено ${completed.length} из ${required.length} обязательных сведений.`
        : "Обязательные сведения ещё не уточнены.";
    return [status, ...answers].join(" ");
  }

  function clinicalSafetySummary(safe, missingItems) {
    const missing = (missingItems || []).filter(Boolean);
    if (safe) {
      return Object.freeze({
        missingFallback: "Важные пропуски не выявлены.",
        safetyText: "По собранным данным решение безопасно."
      });
    }
    const incomplete = "Оценка важных признаков ещё не завершена.";
    return Object.freeze({
      missingFallback: incomplete,
      safetyText: missing.length ? `Нужно проверить пропущенные данные: ${missing.join(" ")}` : incomplete
    });
  }

  return Object.freeze({
    formatNumber,
    pluralForm,
    minutes,
    waitingMinutes,
    waitingCount,
    arrivedCount,
    hours,
    days,
    vetcoins,
    sentence,
    requiredHistorySummary,
    clinicalSafetySummary
  });
});
