"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");

for (const label of [
  "Разбор решения",
  "Вы выбрали",
  "Непосредственно подтверждено",
  "Остаётся неопределённым",
  "Выбор поддерживали",
  "Не хватало данных",
  "Оценка решения",
  "Клинический результат появится позднее."
]) {
  assert.ok(html.includes(label), `missing decision review label: ${label}`);
}

for (const label of ["Поддерживает", "Не хватает данных", "Противоречит"]) {
  assert.ok(game.includes(label), `missing structured diagnosis section: ${label}`);
}

for (const status of [
  "владелец отказался",
  "принял назначения частично",
  "назначения выданы",
  "результат объяснён",
  "согласие на исследование получено",
  "требуется уточнить"
]) {
  assert.ok(game.includes(status), `missing owner status: ${status}`);
}

assert.match(game, /function ownerStatusFor\(patient\)/);
assert.match(game, /diagnosisOptionsFor\(patient, generatorRuntime\.catalog\)[\s\S]*?\.find\(\(item\) => item\.id === id\)/);
assert.match(game, /template\?\.source !== "walkIn"/);
assert.ok(game.includes("Следующий приём в"));
assert.ok(game.includes("Причина записи:"));
assert.ok(game.includes("Записей больше нет"));
assert.match(css, /\.decision-review\s*\{/);
assert.match(css, /\.choice-evidence\s*\{/);
assert.match(css, /\.next-booking-card\s*\{/);

console.log(JSON.stringify({
  status: "passed",
  decisionReview: true,
  structuredDiagnosisEvidence: true,
  dynamicOwnerStatus: true,
  safeNextBookingCard: true
}, null, 2));
