"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const game = fs.readFileSync(path.join(root, "game.js"), "utf8");
const tutorial = JSON.parse(fs.readFileSync(path.join(root, "tier-01-v2/content/ui/tutorial-texts.json"), "utf8"));

assert.equal((html.match(/class="case-stage-card"/g) || []).length, 7, "guided map must contain seven clinical stages");
for (const label of ["Жалоба владельца", "Анамнез", "Осмотр", "Исследования", "Предварительная оценка", "Назначения", "Выписка"]) {
  assert.ok(html.includes(label), `missing clinical stage: ${label}`);
}
for (const label of ["Уточнено в анамнезе", "Подтверждено осмотром", "Результаты исследований"]) {
  assert.ok(html.includes(label), `missing clinical source heading: ${label}`);
}
assert.equal(html.includes("class=\"clinical-record\""), false, "legacy clinical grid is still present");
assert.match(css, /\.clinical-column\s*\{[^}]*overflow-y:\s*auto/);
assert.match(css, /\.case-stage-card\s+\.stage-body\s*\{[^}]*display:\s*none/);
assert.match(css, /\.case-window\.guided-map\s+\.case-actions button\s*\{[^}]*display:\s*none/iu, "guided action visibility rule is missing");
assert.match(css, /\.case-window\.guided-map\s+\.case-actions button\.current-action\s*\{[^}]*display:\s*block/iu, "current guided action visibility rule is missing");
assert.match(game, /guidedActionButton\(guidedPosition\.action\)\?\.classList\.add\("current-action"\)/);
assert.match(css, /\.case-window\.free-clinical-flow\s+\.case-actions\s*\{[^}]*grid-template-columns:\s*repeat\(5/iu, "free clinical action grid is missing");
assert.match(game, /button\.disabled = Boolean\(patient\.v2Visit\) && !isFreeClinicalVisit\(patient\)/u, "day 2 stage navigation must remain available");
assert.match(game, /generalExamBtn\.addEventListener\("click", openGeneralExam\)/u);

for (const label of [
  "Собрать анамнез",
  "Провести общий осмотр",
  "Осмотреть уши",
  "Взять материал",
  "Предложить микроскопию",
  "Выбрать предварительный диагноз",
  "Объяснить результат",
  "Назначить лечение и контроль",
  "Завершить приём"
]) {
  assert.ok(`${html}\n${game}`.includes(label), `missing guided action label: ${label}`);
}

const activeRuntimeText = `${html}\n${game}\n${JSON.stringify(tutorial)}`;
assert.equal(activeRuntimeText.includes("Согласовать план помощи"), false, "obsolete care-plan action is still player-facing");
assert.equal(activeRuntimeText.includes("Что согласовать с владельцем?"), false, "obsolete agreement wording is still player-facing");
assert.ok(tutorial.steps.find((step) => step.id === "preliminary_diagnosis")?.text.startsWith("Сначала выберите состояние"));
assert.equal(game.includes("Исследование не требуется"), false, "obsolete diagnostic label is still player-facing");
assert.ok(game.includes("Продолжить без дополнительного исследования"));
assert.ok(game.includes("playerDescription"));
assert.ok(game.includes("playerTradeoff"));

console.log(JSON.stringify({
  status: "passed",
  clinicalStages: 7,
  singleClinicalScroll: true,
  oneGuidedPrimaryActionOnDayOne: true,
  freeClinicalActionsFromDayTwo: true,
  obsoletePlanWordingRemoved: true
}, null, 2));
