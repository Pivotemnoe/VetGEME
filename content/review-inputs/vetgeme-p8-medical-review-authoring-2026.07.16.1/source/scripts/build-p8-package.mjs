import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const repoRoot = path.resolve(packageRoot, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
const write = (relativePath, value) => fs.writeFileSync(path.join(packageRoot, relativePath), value);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const policy = readJson('p8-medical-review-authoring/source/p8-review-policy.json');
const audit = readJson('p8-medical-review-authoring/generated/P8_SOURCE_AUDIT.json');
const dialogue = readJson('p8-medical-review-authoring/generated/P8_DIALOGUE_VALIDATION.json');

const priority = [...audit.families].sort((a, b) =>
  b.issueCounts.P0 - a.issueCounts.P0 || b.issueCounts.P1 - a.issueCounts.P1 || a.familyId.localeCompare(b.familyId)
);
const rows = priority.map((family, index) => {
  const title = family.title || 'НАЗВАНИЕ ОТСУТСТВУЕТ';
  return `| ${index + 1} | \`${family.familyId}\` | ${title} | ${family.variants} | ${family.presentations} | ${family.sources} | ${family.issueCounts.P0} | ${family.issueCounts.P1} | Исправление + внешний ветеринарный review |`;
}).join('\n');

const matrix = `# P8 — матрица медицинской и языковой проверки\n\nДата: 16 июля 2026 года.\n\n## Решение gate\n\nПакет 39/215/645 структурно полный, но **не готов к показу игроку и не готов к активации**. Автоматический аудит нашёл ${audit.counts.issues} дефектов: ${audit.counts.bySeverity.P0} P0 и ${audit.counts.bySeverity.P1} P1. Статус \`author_complete\` старого пакета не принимается как доказательство готового медицинского или разговорного текста.\n\nГлавные классы дефектов:\n\n- ${audit.counts.byCode.PLAYER_TEXT_NOT_RUSSIAN ?? 0} англоязычных или полностью нерусских полей;\n- ${audit.counts.byCode.SERVICE_TOKEN_IN_PLAYER_TEXT ?? 0} полей со служебными заглушками;\n- ${audit.counts.byCode.DOCTOR_INSTRUCTION_NOT_SPEECH ?? 0} редакторских инструкций вместо слов врача;\n- ${audit.counts.byCode.PLAYER_TEXT_EMPTY ?? 0} пустых заголовка/текста.\n\n## Очередь исправления\n\nСемейства отсортированы по числу критических, затем некритических дефектов. Одобрение возможно только для точной версии после исправления и повторного чистого аудита.\n\n| № | Family ID | Семейство | Вариантов | Представлений | Источников | P0 | P1 | Решение |\n|---:|---|---|---:|---:|---:|---:|---:|---|\n${rows}\n\n## Обязательная проверка каждого представления\n\n1. Жалоба, анамнез и объективные находки написаны естественным русским языком.\n2. Исследование содержит конкретный результат либо явный допустимый \`null\`, а не слова \`authored\`, \`fixed\` и не описание будущей работы редактора.\n3. Результат действительно поддерживает заявленные правильные и неправильные решения.\n4. Критический факт можно получить понятным действием игрока; юмор не является единственным путём.\n5. Указаны оборудование, срок результата и безопасный маршрут при недоступности.\n6. Реплики владельца соответствуют характеру, но не меняют клиническую истину.\n7. \`ownerCommunication\` содержит слова врача, которые можно произнести человеку, а не команду «объяснить» или «попросить».\n8. Врач честно отделяет известное от предположения, проверяет понимание и сохраняет безопасный маршрут при отказе.\n9. Источники поддерживают именно это утверждение и не выходят за заявленную область.\n10. Внешний ветеринар принимает решение по точному ID и версии; программист не присваивает \`approved\`.\n\n## Уже подготовленный разговорный слой\n\nОтдельная библиотека покрывает ${dialogue.counts.actualOwnerProfiles} характеров владельца по ${dialogue.counts.ownerFunctionsPerProfile} функциям, ${dialogue.counts.doctorFunctions} функций речи врача и ${dialogue.counts.rareAbsurdEvents} редких смешных события. Её validator имеет статус \`${dialogue.status}\`. Эта библиотека не заменяет индивидуальные медицинские реплики каждого случая.\n`;
write('P8_REVIEW_MATRIX.md', matrix);

const manifest = {
  schemaVersion: 1,
  packageId: 'vetgeme-p8-medical-review-authoring',
  packageVersion: policy.packageVersion,
  status: 'audit_complete_correction_required_activation_forbidden',
  activationAllowed: false,
  input: policy.input,
  counts: {
    families: audit.counts.families,
    variants: audit.counts.variants,
    presentations: audit.counts.presentations,
    auditIssues: audit.counts.issues,
    p0: audit.counts.bySeverity.P0,
    p1: audit.counts.bySeverity.P1,
    ownerProfiles: dialogue.counts.actualOwnerProfiles,
    doctorSpeechFunctions: dialogue.counts.doctorFunctions
  },
  gates: {
    sourceAudit: audit.status,
    humanDialogueLibrary: dialogue.status,
    correctionComplete: false,
    externalVeterinaryApproval: false,
    activationManifestPresent: false
  },
  authoritativeFiles: [
    'source/p8-review-policy.json',
    'source/human-dialogue-library.json',
    'source/reviewer-decision-template.json',
    'generated/P8_SOURCE_AUDIT.json',
    'generated/P8_DIALOGUE_VALIDATION.json',
    'P8_REVIEW_MATRIX.md',
    'SOURCE_REFRESH_NOTES.md',
    'REVIEWER_GUIDE.md',
    'PROGRAMMER_HANDOFF.md'
  ],
  fileSha256: {}
};
for (const relativePath of manifest.authoritativeFiles) {
  const file = path.join(packageRoot, relativePath);
  if (fs.existsSync(file)) manifest.fileSha256[relativePath] = sha256(file);
}
write('MANIFEST.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ status: manifest.status, counts: manifest.counts, gates: manifest.gates }, null, 2));
