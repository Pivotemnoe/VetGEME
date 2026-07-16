# Задание программисту — P8 review gate 2026.07.16.2

## Цель

Подключить исправленный medical package `2026.07.16.40` как
read-only review-input и импортировать P8-правила для будущих решений
внешнего ветеринара. Не включать 39 семейств в production generator.

Исходный авторский gate уже закрыт: 39/215/645, 1 864 результата
исследований, 9 847 проверенных player-facing полей, 0 P0/P1.
Открыт только external veterinary gate.

## Входы

- каталог:
  `content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source`;
- архив: `medical-production-authoring-2026.07.16.40.zip`;
- P8-пакет: `p8-medical-review-authoring`;
- матрица речи:
  `p8-medical-review-authoring/generated/P8_DIALOGUE_SAMPLE_MATRIX_2026.07.16.40.md`.

## Обязательное поведение

1. Перед импортом снять HEAD, ветку, `git status` и аудит уже
   подключённых P3–P8 слоёв, чтобы не создать дубли.
2. Сверить SHA-256 архивов, `MANIFEST.json`, версии и SHA-256
   авторитетных файлов.
3. Хранить P8 и 39 семейств отдельно от текущих 30 работающих
   case ID. Не создавать semantic crosswalk по смыслу.
4. В служебном отчёте показать 39 families, 215 variants, 645
   presentations, 1 864 results, source/display issues 0/0, production pool 0.
5. Reviewer decision принимать только при точном совпадении package
   digest, ID и version. Family-решение не одобряет детей молча.
6. Поддержать `approved`, `changes_required`, `rejected`, `not_reviewed`;
   только `approved` может участвовать в будущем activation manifest.
7. Разговорную библиотеку подключать только как форму речи. Она не
   меняет medical truth, результат, согласие, стоимость или исход.
8. В emergency отключать редкие абсурдные события и лёгкий юмор.
9. Показывать диагноз только после предусмотренного discovery path.
10. Сохранить текущую save schema и визуальную систему. Эта задача не даёт
    разрешения на миграцию или редизайн.

## Запрещено

- переводить или «улучшать» медицинский текст в runtime;
- выдумывать локальный результат при отсутствии оборудования;
- считать чистый авторский gate ветеринарным approval;
- активировать семейство до external decision и activation manifest;
- позволять характеру владельца раскрывать диагноз или менять факт;
- делать юмор единственным путём к критической информации.

## Проверки

```sh
node content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source/scripts/validate-medical-authoring.mjs
MEDICAL_SOURCE_ROOT=content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source MEDICAL_EXPECTED_VERSION=2026.07.16.40 node p8-medical-review-authoring/scripts/audit-p8-source.mjs --require-clean
node p8-medical-review-authoring/scripts/validate-p8-display-language.mjs
node p8-medical-review-authoring/scripts/validate-human-dialogues.mjs --require-clean
node p8-medical-review-authoring/scripts/build-p8-package.mjs
node p8-medical-review-authoring/scripts/validate-p8-package.mjs
git diff --check
```

Ожидаемый статус: source audit `reviewable`, display audit `passed`,
dialogue library `pass`, P8 package `pass`, activation `false`.

## Definition of done

- каталог читается как точная отдельная версия без semantic crosswalk;
- текущие 30 cases и все save modes не изменились;
- служебный отчёт показывает 39/215/645/1 864 и нулевые дефекты;
- речь отображается без ID, HTML, обрезки и технических слов;
- недоступное исследование уводит в safe referral с корректными time/economy последствиями;
- production pool остаётся 0 до external review и activation manifest;
- итоговый отчёт перечисляет changed, checked, intentionally unchanged и known risks.
