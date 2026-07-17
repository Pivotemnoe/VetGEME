"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const text = require("../systems/player-facing-text-v11.js");

assert.equal(text.minutes(1), "1 минута");
assert.equal(text.minutes(2), "2 минуты");
assert.equal(text.minutes(7), "7 минут");
assert.equal(text.minutes(11), "11 минут");
assert.equal(text.waitingMinutes(1), "1 минуту");
assert.equal(text.waitingMinutes(7), "7 минут");
assert.equal(text.waitingCount(1), "1 ждёт");
assert.equal(text.waitingCount(2), "2 ждут");
assert.equal(text.arrivedCount(1), "1 пришёл");
assert.equal(text.arrivedCount(4), "4 пришли");
assert.equal(text.vetcoins(1), "1 веткоин");
assert.equal(text.vetcoins(2), "2 веткоина");
assert.equal(text.vetcoins(190), "190 веткоинов");
assert.equal(text.vetcoins(190, { signed: true }), "+190 веткоинов");
assert.equal(text.days(21), "21 день");
assert.equal(text.sentence("Текст уже завершён."), "Текст уже завершён.");

const questions = [
  { id: "onset", required: true, answer: "Началось сегодня" },
  { id: "appetite", required: true, answer: "Аппетит сохранён." },
  { id: "optional", required: false, answer: "Необязательная деталь" }
];
const partial = text.requiredHistorySummary(questions, { onset: true });
assert.match(partial, /^Уточнено 1 из 2 обязательных сведений\./);
assert.match(partial, /Началось сегодня\./);
assert.doesNotMatch(partial, /Аппетит сохранён/);

const complete = text.requiredHistorySummary(questions, { onset: true, appetite: true, optional: true });
assert.match(complete, /^Все обязательные сведения уточнены\./);
assert.match(complete, /Началось сегодня\./);
assert.match(complete, /Аппетит сохранён\./);
assert.doesNotMatch(complete, /Необязательная деталь/);
assert.doesNotMatch(complete, /не полностью|пробелов нет/iu);

const safeSummary = text.clinicalSafetySummary(true, []);
assert.match(safeSummary.missingFallback, /не выявлены/);
assert.match(safeSummary.safetyText, /безопасно/);
const incompleteSummary = text.clinicalSafetySummary(false, []);
assert.doesNotMatch(incompleteSummary.missingFallback, /не выявлены|пробелов нет/iu);
assert.equal(incompleteSummary.missingFallback, incompleteSummary.safetyText);
const missingSummary = text.clinicalSafetySummary(false, ["Не выполнен общий осмотр."]);
assert.match(missingSummary.safetyText, /Не выполнен общий осмотр/);

const projectRoot = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const playerRuntimeText = [
  fs.readFileSync(path.join(projectRoot, "game.js"), "utf8"),
  indexHtml,
  fs.readFileSync(path.join(projectRoot, "systems", "longitudinal-care-v2.js"), "utf8")
].join("\n");
for (const buttonId of ["pauseBtn", "speedBtn", "nextPatientBtn", "closeShiftBtn"]) {
  assert.match(indexHtml, new RegExp(`<button id="${buttonId}"[^>]+aria-label="[^"]+"`), `${buttonId} needs a Russian accessible name`);
}
assert.doesNotMatch(playerRuntimeText, /предусмотренн(?:ый|ое|ая) (?:карточкой|случаем)/iu);
assert.doesNotMatch(playerRuntimeText, /игровых дней|\d+ мин\.\.|\+\d+ вет\.|\d+ V\b/iu);

console.log("Player-facing Russian text v11: plurals, punctuation and complete required-history summary passed.");
