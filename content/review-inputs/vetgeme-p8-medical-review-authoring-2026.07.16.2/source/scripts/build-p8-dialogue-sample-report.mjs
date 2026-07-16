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
  process.env.P8_DIALOGUE_SAMPLE_OUTPUT || 'generated/P8_DIALOGUE_SAMPLE_MATRIX_2026.07.16.40.md'
);

const suspicious = /(?:\b(?:точн|известн|датирован|отдельн|сохранен|сохранён|сохранил|связаны|связан|учтен|учтён|зафиксирован|подтвержден|подтверждён|перезапис|истин|разногласи|неопределен|неопределён|двусмыслен)\w*\b|\/|\bне меняет\b|\bне закрывает\b|\bне стирает\b|\bсам по себе\b)/iu;

function linesForPresentation(family, variant, presentation) {
  const rows = [];
  rows.push(`### ${family.title} — ${variant.title}`);
  rows.push('');
  rows.push(`- ID: \`${family.familyId}.${variant.id}.${presentation.id}\``);
  rows.push(`- Жалоба: ${presentation.complaint}`);
  for (const [key, value] of Object.entries(presentation.historyAnswers ?? {}).slice(0, 3)) {
    rows.push(`- Ответ владельца (\`${key}\`): ${value}`);
  }
  for (const item of (presentation.examFindings ?? []).slice(0, 2)) rows.push(`- Осмотр: ${item.finding}`);
  for (const item of (presentation.investigations ?? []).slice(0, 3)) rows.push(`- Исследование (\`${item.id}\`): ${item.result}`);
  rows.push(`- Безопасное решение: ${presentation.outcomes?.safe}`);
  rows.push(`- Опасное решение: ${presentation.outcomes?.unsafe}`);
  rows.push(`- Контроль: ${presentation.followUp?.timing}`);
  for (const line of (presentation.ownerCommunication ?? []).slice(0, 2)) rows.push(`- Реплика врача: ${line}`);
  rows.push('');
  return rows;
}

function riskScore(presentation) {
  const values = [
    presentation.complaint,
    ...Object.values(presentation.historyAnswers ?? {}),
    ...(presentation.examFindings ?? []).map((item) => item.finding),
    ...(presentation.investigations ?? []).map((item) => item.result),
    ...Object.values(presentation.outcomes ?? {}),
    presentation.followUp?.timing,
    ...(presentation.ownerCommunication ?? [])
  ].filter((value) => typeof value === 'string');
  return values.reduce((score, value) => score + (suspicious.test(value) ? 5 : 0) + (value.length < 38 ? 2 : 0) + (value.length > 220 ? 1 : 0), 0);
}

const familyRoot = path.join(sourceRoot, 'families');
const files = fs.readdirSync(familyRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(familyRoot, entry.name, 'family.production.json'))
  .filter(fs.existsSync)
  .sort();

const rows = [
  '# P8 — выборочная матрица человеческих диалогов',
  '',
  'Для каждого из 39 семейств выбран один наиболее рискованный по формальным признакам сценарий: короткие ответы, неоднозначные служебные слова, косая черта или чрезмерно длинная фраза. Матрица не заменяет полный машинный аудит 9 847 полей; она нужна для ручного чтения самых подозрительных мест.',
  ''
];

for (const file of files) {
  const family = JSON.parse(fs.readFileSync(file, 'utf8'));
  const candidates = [];
  for (const variant of family.variants ?? []) {
    for (const presentation of variant.presentations ?? []) candidates.push({ variant, presentation, score: riskScore(presentation) });
  }
  candidates.sort((a, b) => b.score - a.score || a.presentation.id.localeCompare(b.presentation.id));
  const selected = candidates[0];
  if (selected) rows.push(...linesForPresentation(family, selected.variant, selected.presentation));
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${rows.join('\n')}\n`);
console.log(JSON.stringify({ families: files.length, output: path.relative(repoRoot, outputFile) }, null, 2));
