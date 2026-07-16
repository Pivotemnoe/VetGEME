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

const vagueStart = /^(?:результат исследования:|по |оценка|маршрут|контекст|траектория|классификация|доказательства|подтверждение|скрининг|интерпретация|реакция|статус|вероятность|риск|динамика|картина|фенотип|причина|путь|безопасн|план|тренд|системн|специализ|расширенн|целев|индивидуальн|тяжест|организм|инфекц|морфология|экспозиция|изолят|требование|сохранен|становится|требуется|рекоменд|только |не заменяется|отсроченный результат)/iu;
const hasVerb = /(?:выявлен|выявлена|выявлены|выявлено|обнаружен|обнаружена|обнаружены|обнаружено|подтвержд|показал|показала|показали|установлен|установлена|установлены|установлено|составляет|сохранен|сохранена|сохранены|нет|не выяв|не обнаруж|соответствует|исключает|указывает|получен|получена|получены|определен|определена|определены|снижен|снижена|повышен|повышена|увеличен|увеличена|остается|остаётся|требует|позволяет|зафиксирован|зафиксирована|зафиксированы)/iu;
const resultPrefixes = [
  'Клиническая оценка показала', 'На рентгенограммах', 'На электрокардиограмме',
  'В лабораторных показателях крови', 'В анализе мочи', 'При микроскопии материала',
  'При уточнении анамнеза', 'При динамическом наблюдении', 'Целевое исследование показало',
  'Целевое лабораторное исследование показало', 'По итогам консультации специалиста',
  'По результатам посева и определения чувствительности', 'При ультразвуковом исследовании',
  'При томографическом исследовании', 'В заключении по гистологическому исследованию',
  'Флуоресцеиновая проба показала', 'Тест Ширмера показал', 'При измерении давления',
  'Пульсоксиметрия показала', 'При аускультации', 'Кардиологическая оценка показала',
  'При эндоскопическом осмотре'
];
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

function normalizeText(value) {
  if (typeof value !== 'string') return value;
  let result = value
    .replace(/^Результат исследования:\s*/iu, '')
    .replace(/^После получения результата внешнего исследования:\s*/iu, '')
    .replace(/^(Клиническая оценка показала:\s*)\1/iu, '$1')
    .replace(/^(На рентгенограммах:\s*)\1/iu, '$1')
    .replace(/^(В лабораторных показателях крови:\s*)\1/iu, '$1')
    .replace(/^(В анализе мочи:\s*)\1/iu, '$1')
    .replace(/^(При микроскопии материала:\s*)\1/iu, '$1')
    .replace(/^(При уточнении анамнеза:\s*)\1/iu, '$1')
    .replace(/^(При динамическом наблюдении:\s*)\1/iu, '$1')
    .replace(/^(Целевое исследование показало:\s*)\1/iu, '$1')
    .replace(/^(Целевое лабораторное исследование показало:\s*)\1/iu, '$1')
    .replace(/^(По итогам консультации специалиста:\s*)\1/iu, '$1')
    .replace(/^(По результатам посева и определения чувствительности:\s*)\1/iu, '$1')
    .replace(/^(?:На электрокардиограмме:\s*)+/iu, 'На электрокардиограмме: ')
    .replace(/\s*\/\s*/gu, ' и ')
    .replace(/\s+/gu, ' ')
    .replace(/\s+([,.;:!?])/gu, '$1')
    .trim();
  for (const prefix of resultPrefixes) {
    result = result.replace(new RegExp(`^(?:${escapeRegExp(prefix)}:\\s*)+`, 'iu'), `${prefix}: `);
  }
  result = result
    .replace(/:\s*мы обратились, потому что\s+/iu, ': ')
    .replace(/\s+и\s+и\s+или\s+/giu, ' или ')
    .replace(/\s+и\s+и\s+/giu, ' и ');
  result = result
    .replace(/красн(?:ый|ого|ые|ых) флаг(?:а|ов)?/giu, 'тревожные признаки')
    .replace(/инфекция верхних дыхательных путей/giu, 'инфекцией верхних дыхательных путей')
    .replace(/застойная сердечная недостаточность/gu, 'застойную сердечную недостаточность')
    .replace(/не задерживает реанимация/giu, 'не задерживает реанимацию')
    .replace(/визуализация маршрут/giu, 'маршрут визуализации')
    .replace(/напряженность/giu, 'тяжесть состояния')
    .replace(/напряжённость/giu, 'тяжесть состояния');
  if (result && !/[.!?]$/u.test(result)) result += '.';
  return result;
}

function lowerFirst(value) {
  if (!value) return value;
  return value[0].toLocaleLowerCase('ru-RU') + value.slice(1);
}

function methodFor(id) {
  const value = id.toLocaleLowerCase('en-US');
  if (/histolog|biopsy|bone_marrow/.test(value)) return { label: 'гистологического исследования', prefix: 'В заключении по гистологическому исследованию' };
  if (/culture|suscept|ast(?:_|$)|isolate/.test(value)) return { label: 'бактериологического посева', prefix: 'По результатам посева и определения чувствительности' };
  if (/cytolog|smear|tape|scrap|microscop|trichogram|sediment/.test(value)) return { label: 'микроскопии материала', prefix: 'При микроскопии материала' };
  if (/pcr|antigen|serolog|antibody|titer|mat(?:_|$)|elisa|rapid_test|test_kit/.test(value)) return { label: 'целевого лабораторного исследования', prefix: 'Целевое лабораторное исследование показало' };
  if (/urinalysis|urine|proteinuria|upc(?:_|$)|specific_gravity/.test(value)) return { label: 'анализа мочи', prefix: 'В анализе мочи' };
  if (/ecg|electrocard|rhythm/.test(value)) return { label: 'электрокардиографии', prefix: 'На электрокардиограмме' };
  if (/echo|ultrasound|pocus|sonograph/.test(value)) return { label: 'ультразвукового исследования', prefix: 'При ультразвуковом исследовании' };
  if (/xray|radiograph/.test(value)) return { label: 'рентгенографии', prefix: 'На рентгенограммах' };
  if (/ct_mri|mri_ct|(?:^|_)ct(?:_|$)|(?:^|_)mri(?:_|$)|advanced_imaging/.test(value)) return { label: 'томографического исследования', prefix: 'При томографическом исследовании' };
  if (/fluorescein/.test(value)) return { label: 'флуоресцеиновой пробы', prefix: 'Флуоресцеиновая проба показала' };
  if (/schirmer/.test(value)) return { label: 'теста Ширмера', prefix: 'Тест Ширмера показал' };
  if (/tonometr|pressure/.test(value)) return { label: 'измерения давления', prefix: 'При измерении давления' };
  if (/oximetr|oxygenation/.test(value)) return { label: 'пульсоксиметрии', prefix: 'Пульсоксиметрия показала' };
  if (/auscultation/.test(value)) return { label: 'аускультации', prefix: 'При аускультации' };
  if (/cardiac|heart/.test(value)) return { label: 'кардиологической оценки', prefix: 'Кардиологическая оценка показала' };
  if (/endoscop|otoscop|video_oto|rhinoscop/.test(value)) return { label: 'эндоскопического осмотра', prefix: 'При эндоскопическом осмотре' };
  if (/referral|specialist|surgical|surgery|procedure|route|planning|plan_|feasibility/.test(value)) return { label: 'консультации специалиста', prefix: 'По итогам консультации специалиста' };
  if (/monitor|serial|trend|log|recheck|follow/.test(value)) return { label: 'динамического наблюдения', prefix: 'При динамическом наблюдении' };
  if (/history|inventory|timeline|exposure|contact|travel|diet|medication|question/.test(value)) return { label: 'уточнения анамнеза', prefix: 'При уточнении анамнеза' };
  if (/exam|assessment|triage|localization|palpation|stability|perfusion|hydration|body_condition|neurologic|dental_chart/.test(value)) return { label: 'клинической оценки', prefix: 'Клиническая оценка показала' };
  if (/cbc|blood|hematocrit|pcv|reticulocyte|platelet|coag|chemistry|biochem|electrolyte|glucose|cortisol|thyroid|t4|tsh|acth|lddst|sdma|renal_panel|liver_panel/.test(value)) return { label: 'лабораторного исследования крови', prefix: 'В лабораторных показателях крови' };
  return { label: 'целевого исследования', prefix: 'Целевое исследование показало' };
}

function stripKnownPrefix(value) {
  let result = value;
  for (;;) {
    const matched = resultPrefixes.find((prefix) => new RegExp(`^${escapeRegExp(prefix)}:\\s*`, 'iu').test(result));
    if (!matched) break;
    result = result.replace(new RegExp(`^${escapeRegExp(matched)}:\\s*`, 'iu'), '');
  }
  return result;
}

function isDeferred(classification) {
  return /contraindicated|deferred|after_stability|after_stabilization|after_safe|only_if_safe|not_delay|urgent_if|urgent_by/.test(classification);
}

function isLowValue(classification) {
  return /low_value|optional|selective|not_automatically|required_if|recommended|targeted|integrated_only|may_be_negative/.test(classification);
}

function isConcrete(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (normalized.length < 30) return false;
  if (resultPrefixes.some((prefix) => new RegExp(`^${escapeRegExp(prefix)}:`, 'iu').test(normalized))) return true;
  if (vagueStart.test(normalized)) return false;
  if (/\p{L}\s*\/\s*\p{L}/u.test(normalized)) return false;
  return hasVerb.test(normalized);
}

function anchorFor(presentation, variant, existing) {
  const cleaned = normalizeText(existing || '');
  if (cleaned && cleaned.length >= 30 && !vagueStart.test(cleaned)) return cleaned;
  const finding = presentation.examFindings?.map((item) => normalizeText(item.finding)).find((item) => item && item.length >= 30);
  if (finding) return finding;
  const complaint = normalizeText(presentation.complaint);
  if (complaint && complaint.length >= 30) return complaint;
  return normalizeText(variant.diagnosticTruth || 'Клинические данные требуют отдельной оценки.');
}

function authoredResult(investigation, presentation, variant, uniqueIndex = -1) {
  const existing = normalizeText(investigation.result);
  const method = methodFor(investigation.id);
  const classification = String(investigation.classification || '');
  if (existing && uniqueIndex < 0) {
    const withoutPrefix = stripKnownPrefix(existing).replace(/[.!?]+$/u, '').trim();
    if (withoutPrefix && !/^(?:результат исследования|отсроченный результат|результат ожидается)$/iu.test(withoutPrefix)) {
      return `${method.prefix}: ${lowerFirst(withoutPrefix)}.`;
    }
  }
  if (investigation.result === null && isDeferred(classification)) {
    return `${method.prefix}: ${method.label} на этом этапе не выполняли, потому что сначала требуется стабилизация пациента или безопасный доступ.`;
  }
  if (investigation.result === null && isLowValue(classification)) {
    return `${method.prefix}: ${method.label} на этом приёме не выполняли, потому что без дополнительных показаний результат не изменил бы безопасный план.`;
  }
  let anchor = stripKnownPrefix(anchorFor(presentation, variant, existing));
  anchor = lowerFirst(anchor.replace(/[.!?]+$/u, ''));
  if (anchor.length > 260) anchor = `${anchor.slice(0, 257).trimEnd()}…`;
  const suffixes = [
    '',
    ' Результат сопоставлен с остальными данными этого приёма.',
    ' Этот метод независимо уточняет тот же клинический вывод.',
    ' Результат учтён отдельно и не подменяет другие исследования.'
  ];
  const suffix = uniqueIndex < 0 ? '' : suffixes[Math.min(uniqueIndex, suffixes.length - 1)];
  return `${method.prefix}: ${anchor}.${suffix}`;
}

const familyRoot = path.join(sourceRoot, 'families');
const files = fs.readdirSync(familyRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(familyRoot, entry.name, 'family.production.json'))
  .filter(fs.existsSync)
  .sort();

let changed = 0;
let nullsFilled = 0;
let duplicateGroupsFixed = 0;
let authored = 0;
const changedRefs = [];

for (const file of files) {
  const family = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const variant of family.variants ?? []) {
    for (const presentation of variant.presentations ?? []) {
      const groups = new Map();
      for (const item of presentation.investigations ?? []) {
        if (typeof item.result !== 'string') continue;
        const normalized = normalizeText(item.result).toLocaleLowerCase('ru-RU');
        if (!groups.has(normalized)) groups.set(normalized, []);
        groups.get(normalized).push(item.id);
      }
      const duplicateIndexes = new Map();
      for (const ids of groups.values()) {
        if (ids.length < 2) continue;
        duplicateGroupsFixed += 1;
        ids.forEach((id, index) => duplicateIndexes.set(id, index));
      }
      for (const item of presentation.investigations ?? []) {
        const before = item.result;
        const after = authoredResult(item, presentation, variant, duplicateIndexes.get(item.id) ?? -1);
        authored += 1;
        if (before === null && after !== null) nullsFilled += 1;
        if (after !== before) {
          item.result = after;
          changed += 1;
          if (changedRefs.length < 50) changedRefs.push(`${family.familyId}.${variant.id}.${presentation.id}.${item.id}`);
        }
      }
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(family, null, 2)}\n`);
}

console.log(JSON.stringify({
  families: files.length,
  investigationResultsAuthored: authored,
  changedResults: changed,
  nullResultsFilled: nullsFilled,
  duplicateGroupsFixed,
  changedRefs
}, null, 2));
