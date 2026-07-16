import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(packageRoot, relativePath), 'utf8'));
const write = (relativePath, value) => fs.writeFileSync(path.join(packageRoot, relativePath), value);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const policy = readJson('source/p8-review-policy.json');
const audit = readJson('generated/P8_SOURCE_AUDIT.json');
const display = readJson('generated/P8_DISPLAY_LANGUAGE_AUDIT_2026.07.16.40.json');
const dialogue = readJson('generated/P8_DIALOGUE_VALIDATION.json');

const rows = [...audit.families]
  .sort((a, b) => a.familyId.localeCompare(b.familyId))
  .map((family, index) =>
    `| ${index + 1} | \`${family.familyId}\` | ${family.title} | ${family.variants} | ${family.presentations} | ${family.sources} | ${family.issueCounts.P0} | ${family.issueCounts.P1} | Внешний ветеринарный review |`
  )
  .join('\n');

const matrix = `# P8 — матрица медицинской и языковой проверки

Дата: 16 июля 2026 года.

## Решение gate

Авторская версия пакета 39/215/645 прошла повторный source audit:
${audit.counts.issues} дефектов, ${audit.counts.bySeverity.P0} P0 и ${audit.counts.bySeverity.P1} P1.
Расширенный display gate проверил ${display.counts.playerFacingFields}
видимых игроку полей, ${display.counts.investigations} результата исследований,
${display.counts.nullResults} пустых результатов и ${display.counts.duplicateResultGroups} групп дублей.

Это разрешает read-only импорт и внешний review, но не активацию:
все 39 семейств остаются на \`external_veterinary_review_pending\`,
\`generatorEligible: false\`, production pool 0.

## Посемейная матрица

| № | Family ID | Семейство | Вариантов | Представлений | Источников | P0 | P1 | Следующий gate |
|---:|---|---|---:|---:|---:|---:|---:|---|
${rows}

## Обязательная проверка reviewer

1. Жалоба, анамнез и объективные находки согласуются между собой.
2. Каждое исследование содержит конкретный результат и срок.
3. Результат поддерживает заявленные правильные и опасные решения.
4. Критический факт открывается понятным действием; юмор не является единственным путём.
5. Оборудование, срок и безопасное направление указаны без выдуманного локального результата.
6. Реплики владельца и врача звучат естественно, но не меняют medical truth.
7. Источник поддерживает именно данное утверждение и не выходит за свою область.
8. Решение привязано к точным ID, version и digest; программист не присваивает \`approved\`.

## Разговорный слой

Библиотека покрывает ${dialogue.counts.actualOwnerProfiles} характеров владельца по
${dialogue.counts.ownerFunctionsPerProfile} функциям, ${dialogue.counts.doctorFunctions} функций речи врача и
${dialogue.counts.rareAbsurdEvents} редких смешных события. Статус валидации: \`${dialogue.status}\`.
`;
write('P8_REVIEW_MATRIX.md', matrix);

const authoritativeFiles = [
  'source/p8-review-policy.json',
  'source/human-dialogue-library.json',
  'source/reviewer-decision-template.json',
  'generated/P8_SOURCE_AUDIT.json',
  'generated/P8_DISPLAY_LANGUAGE_AUDIT_2026.07.16.40.json',
  'generated/P8_DIALOGUE_VALIDATION.json',
  'generated/P8_DIALOGUE_SAMPLE_MATRIX_2026.07.16.40.md',
  'P8_REVIEW_MATRIX.md',
  'SOURCE_REFRESH_NOTES.md',
  'REVIEWER_GUIDE.md',
  'PROGRAMMER_HANDOFF.md'
];

const manifest = {
  schemaVersion: 1,
  packageId: 'vetgeme-p8-medical-review-authoring',
  packageVersion: policy.packageVersion,
  status: 'author_correction_gate_passed_external_review_pending',
  activationAllowed: false,
  input: policy.input,
  counts: {
    families: audit.counts.families,
    variants: audit.counts.variants,
    presentations: audit.counts.presentations,
    investigations: display.counts.investigations,
    playerFacingFields: display.counts.playerFacingFields,
    auditIssues: audit.counts.issues + display.counts.issues,
    p0: audit.counts.bySeverity.P0,
    p1: audit.counts.bySeverity.P1,
    ownerProfiles: dialogue.counts.actualOwnerProfiles,
    doctorSpeechFunctions: dialogue.counts.doctorFunctions
  },
  gates: {
    sourceAudit: audit.status,
    displayLanguageAudit: display.status,
    humanDialogueLibrary: dialogue.status,
    correctionComplete: audit.counts.issues === 0 && display.counts.issues === 0,
    externalVeterinaryApproval: false,
    activationManifestPresent: false
  },
  authoritativeFiles,
  fileSha256: {}
};

for (const relativePath of authoritativeFiles) {
  const file = path.join(packageRoot, relativePath);
  if (fs.existsSync(file)) manifest.fileSha256[relativePath] = sha256(file);
}

write('MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: manifest.status, counts: manifest.counts, gates: manifest.gates }, null, 2));
