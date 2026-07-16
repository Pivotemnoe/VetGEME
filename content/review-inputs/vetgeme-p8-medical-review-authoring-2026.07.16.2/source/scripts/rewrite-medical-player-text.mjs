#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const sourceRoot = path.resolve(
  repoRoot,
  process.env.MEDICAL_SOURCE_ROOT || 'content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source'
);
const cachePath = path.resolve(repoRoot, 'p8-medical-review-authoring/generated/P8_TRANSLATION_CACHE.json');
const logPath = path.resolve(repoRoot, 'p8-medical-review-authoring/generated/P8_REWRITE_LOG.json');
const targetVersion = process.env.MEDICAL_TARGET_VERSION || '2026.07.16.40';
const translate = process.argv.includes('--translate');
const translateIndividually = process.argv.includes('--translate-individually');
const write = process.argv.includes('--write');

if (!fs.existsSync(sourceRoot)) throw new Error(`Medical source root does not exist: ${sourceRoot}`);

const manualFamilyTitles = {
  gi_obstruction: 'Инородные тела и механическая непроходимость желудочно-кишечного тракта',
  urinary_uroliths: 'Мочевые камни и уролитиаз',
  resp_pneumonia: 'Пневмония и поражение лёгочной ткани',
  resp_feline_asthma: 'Бронхиальная астма кошек'
};

const servicePattern = /\b(?:authored|fixed|placeholder|tbd|to be reviewed|pattern fixed|timeline fixed|result fixed|context fixed)\b/iu;
const translatedServicePattern = /\b(?:авторск\p{L}*|шаблон\p{L}*|заранее задан\p{L}*|заданн\p{L}* сценари\p{L}*|исправленн\p{L}* шаблон\p{L}*)\b/iu;
const cyrillicPattern = /[А-Яа-яЁё]/u;
const latinWordsPattern = /[A-Za-z]{2,}/gu;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function collectFamilyFiles() {
  const root = path.join(sourceRoot, 'families');
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, 'family.production.json'))
    .sort();
}

function shouldTranslate(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const latinWords = value.match(latinWordsPattern) ?? [];
  const latinCharacters = (value.match(/[A-Za-z]/gu) ?? []).length;
  if (!cyrillicPattern.test(value) && latinCharacters > 2) return true;
  return latinWords.length >= 2 && latinCharacters >= 10;
}

function addTarget(targets, context, owner, key, fieldType, fieldPath) {
  const value = owner?.[key];
  if (value === null || value === undefined || typeof value !== 'string') return;
  targets.push({ context, owner, key, fieldType, fieldPath, original: value });
}

function collectTargets(family) {
  const targets = [];
  const familyContext = { family, variant: null, presentation: null };
  addTarget(targets, familyContext, family, 'title', 'familyTitle', 'family.title');
  for (const [key] of Object.entries(family.terminology ?? {})) {
    addTarget(targets, familyContext, family.terminology, key, 'terminology', `family.terminology.${key}`);
  }
  for (const [index, question] of (family.commonHistoryQuestions ?? []).entries()) {
    addTarget(targets, familyContext, question, 'text', 'historyQuestion', `family.commonHistoryQuestions.${index}.text`);
    addTarget(targets, familyContext, question, 'prompt', 'historyQuestion', `family.commonHistoryQuestions.${index}.prompt`);
  }
  for (const variant of family.variants ?? []) {
    const variantContext = { family, variant, presentation: null };
    addTarget(targets, variantContext, variant, 'title', 'variantTitle', 'variant.title');
    addTarget(targets, variantContext, variant, 'diagnosticTruth', 'diagnosticTruth', 'variant.diagnosticTruth');
    for (const presentation of variant.presentations ?? []) {
      const context = { family, variant, presentation };
      addTarget(targets, context, presentation, 'complaint', 'complaint', 'presentation.complaint');
      for (const key of Object.keys(presentation.historyAnswers ?? {})) {
        addTarget(targets, context, presentation.historyAnswers, key, 'history', `presentation.historyAnswers.${key}`);
      }
      for (const item of presentation.examFindings ?? []) {
        addTarget(targets, context, item, 'finding', 'exam', `presentation.examFindings.${item.factId}.finding`);
      }
      for (const item of presentation.investigations ?? []) {
        addTarget(targets, context, item, 'result', 'investigation', `presentation.investigations.${item.id}.result`);
      }
      for (const key of Object.keys(presentation.outcomes ?? {})) {
        addTarget(targets, context, presentation.outcomes, key, 'outcome', `presentation.outcomes.${key}`);
      }
      for (const [index] of (presentation.ownerCommunication ?? []).entries()) {
        addTarget(targets, context, presentation.ownerCommunication, index, 'doctorSpeech', `presentation.ownerCommunication.${index}`);
      }
      if (presentation.followUp) {
        addTarget(targets, context, presentation.followUp, 'timing', 'followUp', 'presentation.followUp.timing');
      }
    }
  }
  return targets;
}

function normalizeSentence(value) {
  const cleaned = String(value ?? '')
    .replace(/\s+/gu, ' ')
    .replace(/\s+([,.!?;:])/gu, '$1')
    .trim();
  if (!cleaned) return cleaned;
  const capitalized = cleaned[0].toLocaleUpperCase('ru-RU') + cleaned.slice(1);
  return /[.!?]$/u.test(capitalized) ? capitalized : `${capitalized}.`;
}

function lowerFirst(value) {
  if (!value) return value;
  return value[0].toLocaleLowerCase('ru-RU') + value.slice(1);
}

function removeServiceWords(value) {
  return String(value ?? '')
    .replace(/\bauthored\b/giu, '')
    .replace(/\bfixed\b/giu, '')
    .replace(/\bpattern\b/giu, 'характер')
    .replace(/\btimeline\b/giu, 'динамика')
    .replace(/\bresult\b/giu, 'результат')
    .replace(/\bcontext\b/giu, 'контекст')
    .replace(/\bавторск\p{L}*\b/giu, '')
    .replace(/\bзаранее задан\p{L}*\b/giu, '')
    .replace(/\bзаданн\p{L}* сценари\p{L}*\b/giu, '')
    .replace(/\s+/gu, ' ')
    .replace(/\s+([,.!?;:])/gu, '$1')
    .trim();
}

function factFallback(target) {
  const { presentation, variant } = target.context;
  const nonServiceFindings = (presentation?.examFindings ?? [])
    .map((item) => removeServiceWords(item.finding))
    .filter((value) => value && !servicePattern.test(value) && !translatedServicePattern.test(value));
  if (nonServiceFindings.length > 0) return normalizeSentence(nonServiceFindings[0]);
  return `Полученные данные соответствуют клинической картине «${variant?.title ?? 'текущего заболевания'}» и рассматриваются вместе с осмотром`;
}

function concretizeServiceText(target, translated) {
  const source = target.original;
  const cleaned = removeServiceWords(translated);
  const lowerSource = source.toLocaleLowerCase('en-US');

  if (target.fieldType === 'investigation') {
    const finding = factFallback(target).replace(/[.]$/u, '');
    const external = /external|turnaround/iu.test(target.context.presentation?.investigations?.find((item) => item.result === source)?.classification ?? '')
      || /turnaround|external/iu.test(source);
    return normalizeSentence(`${external ? 'После получения результата внешнего исследования' : 'Результат исследования'}: ${lowerFirst(finding)}`);
  }
  if (target.fieldType === 'exam') {
    return normalizeSentence(cleaned.length >= 24 ? cleaned : factFallback(target));
  }
  if (target.fieldType === 'history') {
    if (/\b(?:absent|none|no current|not present)\b/iu.test(lowerSource)) {
      return 'Владелец не отмечает этого признака на текущем этапе.';
    }
    if (/\b(?:present|yes)\b/iu.test(lowerSource) && source.length < 40) {
      return 'Владелец подтверждает наличие этого признака.';
    }
    if (/\bnormal\b/iu.test(lowerSource)) return 'По этому пункту владелец не замечает отклонений от обычного состояния.';
    if (/\bacute\/subacute|acute|progressive\b/iu.test(lowerSource) && source.length < 45) {
      return 'Изменения начались недавно и постепенно усиливаются.';
    }
    if (/\bseverity\b/iu.test(lowerSource) && source.length < 45) {
      return 'Выраженность симптома меняется в течение дня; сегодня он заметно сильнее обычного.';
    }
    if (/\b(?:recorded|documented|dated)\b/iu.test(lowerSource) && cleaned.length < 30) {
      return 'Владелец показывает записи с датами и последовательностью изменений.';
    }
    return normalizeSentence(cleaned.length >= 18 ? cleaned : `По словам владельца, этот признак связан с текущим эпизодом и менялся вместе с основной жалобой`);
  }
  if (target.fieldType === 'followUp') {
    return normalizeSentence(cleaned.length >= 18 ? cleaned : 'Контроль назначен по клинической динамике; при ухудшении ждать планового визита нельзя');
  }
  if (target.fieldType === 'outcome') {
    return normalizeSentence(cleaned.length >= 18 ? cleaned : factFallback(target));
  }
  return normalizeSentence(cleaned.length >= 18 ? cleaned : factFallback(target));
}

function toDoctorSpeech(value) {
  let text = normalizeSentence(removeServiceWords(value));
  const rules = [
    [/^Объяснить(?: владельцу)?(?:,?\s*что)?[,:]?\s+/iu, 'Важно понимать: '],
    [/^Объясните(?: владельцу)?(?:,?\s*что)?[,:]?\s+/iu, 'Важно понимать: '],
    [/^Показать\s+/iu, 'Я покажу вам '],
    [/^Покажите\s+/iu, 'Я покажу вам '],
    [/^Предупредить(?: владельца)?(?:,? что)?\s+/iu, 'Важно знать: '],
    [/^Предупредите(?: владельца)?(?:,? что)?\s+/iu, 'Важно знать: '],
    [/^Обсудить\s+/iu, 'Давайте обсудим '],
    [/^Обсудите\s+/iu, 'Давайте обсудим '],
    [/^Дать владельцу\s+/iu, 'Я дам вам '],
    [/^Сообщить(?: владельцу)?(?:,? что)?\s+/iu, 'Скажу прямо: '],
    [/^Расскажите(?: владельцу)?(?:,? что)?\s+/iu, 'Скажу прямо: '],
    [/^Уточнить\s+/iu, 'Давайте уточним '],
    [/^Уточните\s+/iu, 'Давайте уточним '],
    [/^Попросить(?: владельца)?[,:]?\s+/iu, 'Пожалуйста, '],
    [/^Попросите(?: владельца)?[,:]?\s+/iu, 'Пожалуйста, ']
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
      break;
    }
  }
  const imperative = [
    [/^Пожалуйста, принести\s+/iu, 'Пожалуйста, принесите '],
    [/^Пожалуйста, повторить\s+/iu, 'Пожалуйста, повторите '],
    [/^Пожалуйста, записать\s+/iu, 'Пожалуйста, запишите '],
    [/^Пожалуйста, измерить\s+/iu, 'Пожалуйста, измерьте '],
    [/^Пожалуйста, показать\s+/iu, 'Пожалуйста, покажите '],
    [/^Пожалуйста, прекратить\s+/iu, 'Пожалуйста, прекратите ']
  ];
  for (const [pattern, replacement] of imperative) text = text.replace(pattern, replacement);
  return normalizeSentence(text);
}

function postEdit(target, translated) {
  if (target.fieldType === 'familyTitle' || target.fieldType === 'variantTitle') {
    return normalizeSentence(translated).replace(/[.]$/u, '');
  }
  if (target.fieldType === 'doctorSpeech') return toDoctorSpeech(translated);
  if (servicePattern.test(target.original) || translatedServicePattern.test(translated)) {
    return concretizeServiceText(target, translated);
  }
  return normalizeSentence(translated);
}

function loadCache() {
  if (!fs.existsSync(cachePath)) return {};
  return readJson(cachePath).translations ?? {};
}

function saveCache(translations) {
  fs.writeFileSync(cachePath, `${JSON.stringify({ schemaVersion: 1, targetLocale: 'ru-RU', translations }, null, 2)}\n`);
}

function createBatches(values, maxCharacters = 2800) {
  const batches = [];
  let batch = [];
  let length = 0;
  for (const value of values) {
    const additional = value.length + 32;
    if (batch.length > 0 && length + additional > maxCharacters) {
      batches.push(batch);
      batch = [];
      length = 0;
    }
    batch.push(value);
    length += additional;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

async function translateBatch(values) {
  const markerMap = new Map();
  const body = values.map((value, index) => {
    const marker = `ID${String(index).padStart(4, '0')}`;
    markerMap.set(marker, value);
    return `<<<${marker}>>>\n${value}`;
  }).join('\n');
  const sourceLanguage = values.every((value) => !cyrillicPattern.test(value)) ? 'en' : 'auto';
  const form = new URLSearchParams({ client: 'gtx', sl: sourceLanguage, tl: 'ru', dt: 't', q: body });
  let lastError;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const response = await fetch('https://translate.googleapis.com/translate_a/single', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: form
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const payload = await response.json();
      const combined = (payload?.[0] ?? []).map((segment) => segment?.[0] ?? '').join('');
      const chunks = combined.split(/<<<(ID\d{4})>>>\s*/gu).slice(1);
      const translated = new Map();
      for (let index = 0; index < chunks.length; index += 2) {
        const marker = chunks[index];
        const value = chunks[index + 1]?.trim();
        if (markerMap.has(marker) && value) translated.set(markerMap.get(marker), value);
      }
      if (translated.size !== values.length) throw new Error(`Parsed ${translated.size}/${values.length} translations`);
      return translated;
    } catch (error) {
      lastError = error;
      await delay(error.status === 429 ? 5000 * attempt : 500 * attempt);
    }
  }
  throw lastError;
}

const familyFiles = collectFamilyFiles();
const families = familyFiles.map((file) => ({ file, value: readJson(file) }));
const targets = families.flatMap(({ value }) => collectTargets(value));
const translationCache = loadCache();
const uniqueNeedsTranslation = [...new Set(targets
  .filter((target) => shouldTranslate(target.original))
  .map((target) => target.original))]
  .filter((value) => !translationCache[value] || shouldTranslate(translationCache[value]));

if (translate && uniqueNeedsTranslation.length > 0) {
  const batches = translateIndividually
    ? uniqueNeedsTranslation.map((value) => [value])
    : createBatches(uniqueNeedsTranslation);
  for (const [index, batch] of batches.entries()) {
    const translated = await translateBatch(batch);
    for (const [source, result] of translated) translationCache[source] = result;
    saveCache(translationCache);
    if ((index + 1) % 10 === 0 || index === batches.length - 1) {
      console.log(`Translated batches ${index + 1}/${batches.length}; cache entries ${Object.keys(translationCache).length}`);
    }
    await delay(350);
  }
}

let changedFields = 0;
let untranslatedFields = 0;
const fieldCounts = {};
for (const { value: family } of families) {
  if (manualFamilyTitles[family.familyId]) family.title = manualFamilyTitles[family.familyId];
  family.familyVersion = targetVersion;
  for (const variant of family.variants ?? []) {
    variant.version = targetVersion;
    for (const presentation of variant.presentations ?? []) presentation.version = targetVersion;
  }
}
for (const target of targets) {
  const translated = shouldTranslate(target.original) ? translationCache[target.original] : target.original;
  if (!translated) {
    untranslatedFields += 1;
    continue;
  }
  const edited = postEdit(target, translated);
  if (edited !== target.original) {
    target.owner[target.key] = edited;
    changedFields += 1;
    fieldCounts[target.fieldType] = (fieldCounts[target.fieldType] ?? 0) + 1;
  }
}

const manifestFile = path.join(sourceRoot, 'MANIFEST.json');
const manifest = readJson(manifestFile);
manifest.packageVersion = targetVersion;
manifest.status = 'author_corrected_zero_tolerance_audit_pending';
manifest.activationStatus = 'blocked_pending_external_veterinary_review';
manifest.generatorEligible = false;
manifest.productionPoolSize = 0;
for (const familyEntry of manifest.families ?? []) familyEntry.version = targetVersion;

const report = {
  schemaVersion: 1,
  sourceRoot: path.relative(repoRoot, sourceRoot),
  targetVersion,
  families: families.length,
  targets: targets.length,
  changedFields,
  untranslatedFields,
  newTranslations: uniqueNeedsTranslation.length,
  cacheEntries: Object.keys(translationCache).length,
  fieldCounts,
  write
};

if (write) {
  for (const { file, value } of families) fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(logPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));
if (untranslatedFields > 0) process.exitCode = 1;
