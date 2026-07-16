#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const sourceRoot = path.resolve(
  repoRoot,
  process.env.MEDICAL_SOURCE_ROOT || 'content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source'
);

function clean(value) {
  let result = String(value || '')
    .replace(/^зафиксировано\s+/u, '')
    .replace(/^зафиксирована\s+/u, '')
    .replace(/^зафиксирован\s+/u, '')
    .replace(/^зафиксированы\s+/u, '')
    .replace(/^Фиксирована\s+/u, '')
    .replace(/^Фиксирован\s+/u, '')
    .replace(/^Фиксированы\s+/u, '')
    .replace(/^Исправлен\s+/u, '')
    .replace(/^Исправлена\s+/u, '')
    .replace(/^Исправлены\s+/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (result && !/[.!?]$/u.test(result)) result += '.';
  return result;
}

function lowerFirst(value) {
  if (!value) return value;
  return value[0].toLocaleLowerCase('ru-RU') + value.slice(1);
}

function directOwnerComplaint(value) {
  const text = clean(value);
  if (/^(?:Я|Мы|У нас|Мне|Нам|Меня|Нас|Мой|Моя|Наш|Наша)(?:\s|[,!.])/u.test(text)) return text;
  if (/^(?:Срочно|Помогите|Доктор|Пожалуйста)(?:\s|[,!.])/u.test(text)) return text;
  return `Мы обратились, потому что ${lowerFirst(text)}`;
}

function directOwnerAnswer(value, index) {
  const text = clean(value);
  if (/^(?:Я|Мы|У нас|Мне|Нам|Меня|Нас|Мой|Моя|Наш|Наша|По нашим наблюдениям|Дома мы заметили|Насколько мы можем судить|Да[,!.]|Нет[,!.]|Не знаю|Точно не знаю)(?:\s|[,!.])/u.test(text)) return text;
  if (/^(?:Результат|Анализ|Посев|ПЦР|Рентген|УЗИ|Цитология|В выписке|В анализах|По выписке)(?:\s|[,!.])/u.test(text)) {
    return `У нас есть выписка: ${lowerFirst(text)}`;
  }
  const starters = [
    'По нашим наблюдениям,',
    'Дома мы заметили, что',
    'Насколько мы можем судить,',
    'Мы записали, что'
  ];
  return `${starters[index % starters.length]} ${lowerFirst(text)}`;
}

function directDoctorSpeech(value) {
  let text = clean(value);
  text = text
    .replace(/^(?:Я объясню вам:\s*)+/iu, '')
    .replace(/^Важно понимать:\s*/iu, 'Я хочу отдельно пояснить: ')
    .replace(/^Объяснить\s+/iu, 'Я объясню ')
    .replace(/^Показать\s+/iu, 'Я покажу ')
    .replace(/^Попросить\s+/iu, 'Я попрошу ')
    .replace(/^Дать владельцу\s+/iu, 'Я дам вам ')
    .replace(/^Дать\s+/iu, 'Я дам вам ')
    .replace(/^Уточнить\s+/iu, 'Я уточню ')
    .replace(/^Предупредить\s+/iu, 'Я предупрежу ')
    .replace(/^Обсудить\s+/iu, 'Давайте обсудим ')
    .replace(/^Продемонстрировать\s+/iu, 'Я покажу ')
    .replace(/^Сравнить\s+/iu, 'Давайте сравним ')
    .replace(/^Не обещать\s+/iu, 'Я не буду обещать ');
  if (text) text = text[0].toLocaleUpperCase('ru-RU') + text.slice(1);
  text = text
    .replace(/^Я хочу отдельно пояснить:\s+почему\s+/iu, 'Я поясню, почему ')
    .replace(/^Я хочу отдельно пояснить:\s+/iu, 'Я поясню вам: ');
  if (/^(?:Я|Мы|Давайте|Пожалуйста|Сначала|Сейчас|Сегодня|Если|Когда|После|Для|Важно|Это|Такой|Такая|Такое|Так|Повторный|Контрольный|Наша|Наш|Ваша|Ваш|Вместе)(?:\s|[,!.])/iu.test(text)) return text;
  return `Я объясню вам: ${lowerFirst(text)}`;
}

const familyRoot = path.join(sourceRoot, 'families');
const files = fs.readdirSync(familyRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(familyRoot, entry.name, 'family.production.json'))
  .filter(fs.existsSync)
  .sort();

let complaints = 0;
let historyAnswers = 0;
let doctorLines = 0;
let changed = 0;

for (const file of files) {
  const family = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const variant of family.variants ?? []) {
    for (const presentation of variant.presentations ?? []) {
      const complaint = directOwnerComplaint(presentation.complaint);
      complaints += 1;
      if (complaint !== presentation.complaint) { presentation.complaint = complaint; changed += 1; }
      let answerIndex = 0;
      for (const key of Object.keys(presentation.historyAnswers ?? {})) {
        const answer = directOwnerAnswer(presentation.historyAnswers[key], answerIndex);
        historyAnswers += 1;
        answerIndex += 1;
        if (answer !== presentation.historyAnswers[key]) { presentation.historyAnswers[key] = answer; changed += 1; }
      }
      for (let index = 0; index < (presentation.ownerCommunication ?? []).length; index += 1) {
        const speech = directDoctorSpeech(presentation.ownerCommunication[index]);
        doctorLines += 1;
        if (speech !== presentation.ownerCommunication[index]) { presentation.ownerCommunication[index] = speech; changed += 1; }
      }
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(family, null, 2)}\n`);
}

console.log(JSON.stringify({
  families: files.length,
  complaints,
  historyAnswers,
  doctorLines,
  changedDialogues: changed
}, null, 2));
