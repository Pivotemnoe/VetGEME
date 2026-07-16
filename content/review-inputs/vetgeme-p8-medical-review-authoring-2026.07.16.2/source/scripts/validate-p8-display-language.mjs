#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const repoRoot = path.resolve(packageRoot, '..');
const sourceRoot = path.resolve(
  repoRoot,
  process.env.MEDICAL_SOURCE_ROOT || 'content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source'
);
const outputFile = path.resolve(
  packageRoot,
  process.env.P8_DISPLAY_AUDIT_OUTPUT || 'generated/P8_DISPLAY_LANGUAGE_AUDIT_2026.07.16.40.json'
);

const allowedTerms = new Set(
  JSON.parse(fs.readFileSync(path.join(packageRoot, 'generated/P8_ALLOWED_LATIN_TERMS.json'), 'utf8'))
    .allowedLatin
    .map((value) => value.toLocaleLowerCase('en-US'))
);
const serviceOrCalque = /(?:авторск|авторизован|контрольно-пропуск|красн.{0,12}флаж|профсоюз|полноэкран|технико-эконом|задокумент|продемонстрируйте|дискриминатор|шаблон|паттерн|рутинн|инвентариз|инвентарь доступа|экспозиционный инвентарь|блокатор|блокировщик|ворота подтверждения|перебрасыва|клиническая истина|массовый ярлык|созвездие|драйвер|реферал|не придум|шаблон исправ|заданный сценарием|timeline fixed|result fixed|context fixed|placeholder|\btbd\b|(?<!\p{L})(?:код|генератор|игра|автор|двигатель|карточк\p{L}*|ветв\p{L}*|ветк\p{L}*|слот)(?!\p{L})|пользовательск.{0,12}интерфейс|логик.{0,16}генератора|не случаен|изобрет|не генерир|чрезвычайное положение|аварийн|исправл|сценическ|производственный вопрос|без претенз|системный контекст|органный контекст|билиарный контекст|маршрут специалиста)/iu;
const instructionStart = /^(?:объяснить|показать|попросить|дать(?:\s+владельцу)?|уточнить|предупредить|обсудить|продемонстрировать|сравнить|задокументировать|избегать|не обещать|сказать|подтвердить|использовать)(?:\s|[,!.])/iu;
const ownerStart = /^(?:Я|Мы|У нас|Мне|Нам|Меня|Нас|Мой|Моя|Наш|Наша|По нашим наблюдениям|Дома мы заметили|Насколько мы можем судить|Да[,!.]|Нет[,!.]|Не знаю|Точно не знаю)(?:\s|[,!.])/u;
const doctorStart = /^(?:Я|Мы|Давайте|Пожалуйста|Сначала|Сейчас|Сегодня|Если|Когда|После|Для|Важно|Это|Такой|Такая|Такое|Так|Повторный|Контрольный|Наша|Наш|Ваша|Ваш|Вместе)(?:\s|[,!.])/u;
const resultPrefix = /^(?:Клиническая оценка показала|На рентгенограммах|На электрокардиограмме|В лабораторных показателях крови|В анализе мочи|При микроскопии материала|При уточнении анамнеза|При динамическом наблюдении|Целевое исследование показало|Целевое лабораторное исследование показало|По итогам консультации специалиста|По результатам посева и определения чувствительности|При ультразвуковом исследовании|При томографическом исследовании|В заключении по гистологическому исследованию|Флуоресцеиновая проба показала|Тест Ширмера показал|При измерении давления|Пульсоксиметрия показала|При аускультации|Кардиологическая оценка показала|При эндоскопическом осмотре):/iu;

const issues = [];
const counts = {
  familyTitle: 0,
  terminology: 0,
  historyQuestion: 0,
  variantTitle: 0,
  diagnosticTruth: 0,
  complaint: 0,
  historyAnswer: 0,
  examFinding: 0,
  investigationResult: 0,
  outcome: 0,
  followUp: 0,
  doctorSpeech: 0
};

function add(code, severity, ref, field, value, message) {
  issues.push({ code, severity, ref, field, value, message });
}

function auditText(kind, ref, field, value, options = {}) {
  counts[kind] += 1;
  if (typeof value !== 'string' || !value.trim()) {
    add('EMPTY_PLAYER_TEXT', 'P0', ref, field, value, 'Игроку показан пустой текст.');
    return;
  }
  const text = value.trim();
  if (!/[А-Яа-яЁё]/u.test(text)) add('NO_CYRILLIC', 'P0', ref, field, value, 'В игровом тексте нет русской формулировки.');
  const calque = text.match(serviceOrCalque)?.[0];
  if (calque) add('SERVICE_OR_MACHINE_CALQUE', 'P0', ref, field, value, `Обнаружена служебная или машинная формулировка: ${calque}`);
  const latin = text.match(/[A-Za-z][A-Za-z-]*/gu) ?? [];
  for (const token of latin) {
    if (!allowedTerms.has(token.toLocaleLowerCase('en-US'))) {
      add('UNAPPROVED_LATIN_TOKEN', 'P0', ref, field, value, `Неутверждённый латинский или английский токен: ${token}`);
    }
  }
  if (/(?:^|\s)и\s+и(?:\s|$)/iu.test(text)) add('DUPLICATE_CONJUNCTION', 'P1', ref, field, value, 'Двойной союз выдаёт машинную склейку.');
  if (/(?<!\p{L})и\s+или(?:\s+или)?(?!\p{L})/iu.test(text)) add('DUPLICATE_OR', 'P1', ref, field, value, 'Сочетание «и или» выдаёт машинную замену косой черты.');
  if (/\p{L}\s*\/\s*\p{L}/u.test(text)) add('SLASH_SHORTHAND', 'P1', ref, field, value, 'Косая черта оставляет техническое сокращение вместо человеческой фразы.');
  if (/(?:зафиксировано|подтверждено)\s+(?:потеря|тенденция|значение|состояние|прогрессирование)/iu.test(text)) add('GRAMMAR_CALQUE', 'P1', ref, field, value, 'Нарушено согласование сказуемого.');
  if (options.owner && !ownerStart.test(text)) add('OWNER_TEXT_NOT_DIRECT_SPEECH', 'P1', ref, field, value, 'Жалоба или ответ владельца записаны не человеческой прямой речью.');
  if (options.doctor) {
    if (/^Я объясню вам:\s+я/iu.test(text)) add('NESTED_DOCTOR_SPEECH', 'P0', ref, field, value, 'Реплика врача содержит два вложенных начала фразы.');
    if (/^Я (?:объясню|поясню)(?: вам)?:\s*(?:сказать|объяснить|указать|предложить|предлагать|попросить|дать|направить|заявить|подтвердить)/iu.test(text)) add('DOCTOR_EDITOR_NOTE_AFTER_PREFIX', 'P0', ref, field, value, 'После обращения врача осталась редакторская команда.');
    if (instructionStart.test(text)) add('EDITOR_INSTRUCTION_INSTEAD_OF_SPEECH', 'P0', ref, field, value, 'В поле реплики врача осталась редакторская команда.');
    if (!doctorStart.test(text)) add('DOCTOR_TEXT_NOT_DIRECT_SPEECH', 'P1', ref, field, value, 'Фраза врача не оформлена как обращение к владельцу.');
  }
  if (options.result) {
    if (/мы обратились, потому что/iu.test(text)) add('OWNER_COMPLAINT_COPIED_TO_RESULT', 'P0', ref, field, value, 'Слова владельца ошибочно скопированы в результат исследования.');
    if (text.length < 30) add('RESULT_TOO_SHORT', 'P1', ref, field, value, 'Результат исследования слишком короткий для однозначного отображения.');
    if (!resultPrefix.test(text)) add('RESULT_WITHOUT_METHOD_CONTEXT', 'P1', ref, field, value, 'Результат не указывает контекст метода или клинической оценки.');
    if (/^(?:Результат исследования|После получения результата внешнего исследования):/iu.test(text)) add('GENERIC_RESULT_PREFIX', 'P0', ref, field, value, 'Осталась универсальная заглушка результата.');
    if (/^.+?:\s*(?:результат|значение(?:\s+и\s+качество)?|системный профиль|системные изменения|по системному статусу|по возрасту.*|при доступности|полученный результат(?:\s+после\s+ремонта)?|автор\b)[.!]?$/iu.test(text)) add('NONCONCRETE_RESULT_BODY', 'P0', ref, field, value, 'После названия метода осталась неконкретная заглушка вместо результата.');
    const prefix = text.match(resultPrefix)?.[0];
    if (prefix && new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s*${prefix.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'iu').test(text)) {
      add('DUPLICATE_RESULT_PREFIX', 'P0', ref, field, value, 'Префикс метода продублирован машинной обработкой.');
    }
  }
}

const familyRoot = path.join(sourceRoot, 'families');
const files = fs.readdirSync(familyRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(familyRoot, entry.name, 'family.production.json'))
  .filter(fs.existsSync)
  .sort();

let variants = 0;
let presentations = 0;
let investigations = 0;
let nullResults = 0;
let duplicateResultGroups = 0;

for (const file of files) {
  const family = JSON.parse(fs.readFileSync(file, 'utf8'));
  const familyRef = family.familyId;
  auditText('familyTitle', familyRef, 'title', family.title);
  for (const [key, value] of Object.entries(family.terminology ?? {})) auditText('terminology', familyRef, `terminology.${key}`, value);
  for (const item of family.commonHistoryQuestions ?? []) auditText('historyQuestion', familyRef, `commonHistoryQuestions.${item.id}`, item.text ?? item.prompt);
  for (const variant of family.variants ?? []) {
    variants += 1;
    const variantRef = `${familyRef}.${variant.id}`;
    auditText('variantTitle', variantRef, 'title', variant.title);
    auditText('diagnosticTruth', variantRef, 'diagnosticTruth', variant.diagnosticTruth);
    for (const presentation of variant.presentations ?? []) {
      presentations += 1;
      const ref = `${variantRef}.${presentation.id}`;
      auditText('complaint', ref, 'complaint', presentation.complaint, { owner: true });
      for (const [key, value] of Object.entries(presentation.historyAnswers ?? {})) auditText('historyAnswer', ref, `historyAnswers.${key}`, value, { owner: true });
      for (const item of presentation.examFindings ?? []) auditText('examFinding', ref, `examFindings.${item.factId}.finding`, item.finding);
      const seenResults = new Map();
      for (const item of presentation.investigations ?? []) {
        investigations += 1;
        if (item.result === null) {
          nullResults += 1;
          add('NULL_INVESTIGATION_RESULT', 'P0', ref, `investigations.${item.id}.result`, null, 'Для доступного исследования не задано состояние результата.');
          continue;
        }
        auditText('investigationResult', ref, `investigations.${item.id}.result`, item.result, { result: true });
        const normalized = item.result.trim().toLocaleLowerCase('ru-RU');
        if (!seenResults.has(normalized)) seenResults.set(normalized, []);
        seenResults.get(normalized).push(item.id);
      }
      for (const [value, ids] of seenResults) {
        if (ids.length < 2) continue;
        duplicateResultGroups += 1;
        add('DUPLICATE_RESULTS_IN_PRESENTATION', 'P0', ref, 'investigations', value, `Один и тот же результат скопирован для исследований: ${ids.join(', ')}`);
      }
      for (const [key, value] of Object.entries(presentation.outcomes ?? {})) auditText('outcome', ref, `outcomes.${key}`, value);
      auditText('followUp', ref, 'followUp.timing', presentation.followUp?.timing);
      for (let index = 0; index < (presentation.ownerCommunication ?? []).length; index += 1) auditText('doctorSpeech', ref, `ownerCommunication.${index}`, presentation.ownerCommunication[index], { doctor: true });
    }
  }
}

const byCode = Object.fromEntries([...new Set(issues.map((item) => item.code))].sort().map((code) => [code, issues.filter((item) => item.code === code).length]));
const report = {
  schemaVersion: 1,
  reportId: 'vetgeme-p8-display-language-audit',
  packageVersion: '2026.07.16.40',
  status: issues.length === 0 ? 'passed' : 'failed',
  sourceRoot: path.relative(repoRoot, sourceRoot),
  counts: {
    families: files.length,
    variants,
    presentations,
    investigations,
    nullResults,
    duplicateResultGroups,
    playerFacingFields: Object.values(counts).reduce((sum, value) => sum + value, 0),
    byFieldKind: counts,
    issues: issues.length,
    byCode
  },
  allowedLatinTerms: [...allowedTerms].sort(),
  issues
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, counts: report.counts }, null, 2));
if (report.status !== 'passed') process.exitCode = 1;
