# Задание программисту — подключение медицинского каталога 2026.07.16.40

## Цель

Подключить исправленный каталог 39/215/645 как версионированный review-input,
не сочиняя медицинские данные в коде и не активируя его до внешнего
ветеринарного решения.

Авторитетный каталог в рабочей копии:

`content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source`

Архив для переноса:

`medical-production-authoring-2026.07.16.40.zip`

Контрольная сумма находится рядом в файле
`medical-production-authoring-2026.07.16.40.zip.sha256`.

## Жёсткие границы

- не сопоставлять автоматически нынешние 30 case ID с 215 variants;
- сохранить старые 30 карточек работающими до отдельного утверждённого
  migration/crosswalk;
- не менять дизайн кабинета и save schema в этой задаче;
- не присваивать `approved`, не менять `generatorEligible: false` и не создавать
  activation manifest;
- не переводить и не переписывать медицинские строки в runtime;
- не заменять недоступное исследование выдуманным локальным результатом;
- не скрывать необязательное исследование: цену, время, отказ владельца и
  последствия обрабатывают economy/time/trust layers;
- характер и внешность владельца не меняют medical truth; юмор не раскрывает
  единственный критический факт и выключен в emergency.

## Этапы

### P0 — защита от наслоений

1. Снять `git status`, текущий HEAD, ветку и список незакоммиченных файлов.
2. Проверить, какие P3–P7/P8 изменения уже присутствуют, и не дублировать их.
3. Зафиксировать нынешний 30-case namespace и существующие save modes.
4. Проверить ZIP и SHA-256, затем запустить валидаторы пакета.

### P1 — read-only importer

1. Импортировать `MANIFEST.json` и family contracts без изменения ID/version.
2. Fail closed на неизвестном ID, версии, capability, status или digest.
3. Вывести в служебном отчёте 39 families, 215 variants, 645 presentations,
   1 864 investigation results, production pool 0.
4. Старый gameplay после этого этапа не меняется.

### P2 — capability, time и economy binding

1. Связывать только точные capability/research IDs с утверждёнными реестрами.
2. Medical data определяет необходимость, результат и safe fallback;
   capability/economy layer — наличие кабинета, оборудование, расходники,
   стоимость, очередь и turnaround.
3. Отсутствующая возможность ведёт в указанный `safe_referral`, а не в
   выдуманный результат.
4. Внешний результат не появляется мгновенно.

### P3 — review tooling и разговорный слой

1. Показать family → variant → presentation и все review statuses.
2. Решение reviewer привязывать к точным ID, version и digest; family approval
   не одобряет детей молча.
3. Разговорную библиотеку подключать только как форму речи. Она не меняет
   жалобу, клинический факт, согласие, результат или правильное решение.
4. Не выводить диагноз до открытия предусмотренного discovery path.

### P4 — подготовка staged activation

1. После внешних решений сформировать отдельный activation manifest только из
   точных approved versions.
2. Подключать маленькими batch и после каждого проверять deterministic seed,
   persist generated day, save/reload, очередь, время, economy и safe referral.
3. Если потребуется новая save schema, сначала представить отдельную версию,
   migration plan и тесты; текущий пакет не даёт разрешения на её изменение.

## Обязательные проверки

```sh
node --check content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source/scripts/validate-medical-authoring.mjs
node content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source/scripts/validate-medical-authoring.mjs
MEDICAL_SOURCE_ROOT=content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source MEDICAL_EXPECTED_VERSION=2026.07.16.40 node p8-medical-review-authoring/scripts/audit-p8-source.mjs --require-clean
node p8-medical-review-authoring/scripts/validate-p8-display-language.mjs
node p8-medical-review-authoring/scripts/validate-human-dialogues.mjs --require-clean
git diff --check
```

После импорта также обязательны content validation, generator smoke, браузерный
проход complaint → anamnesis/exam → investigation/turnaround → decision →
follow-up, deterministic seed и save/reload того же медицинского snapshot.

## Definition of done

- каталог подключён как отдельная точная версия без semantic crosswalk;
- 39/215/645 и 1 864 результата читаются importer-ом;
- текущие 30 случаев и существующие сохранения не изменились;
- player-facing текст берётся из данных и отображается без HTML/обрезки/ID;
- owner/doctor speech остаётся человеческой, а emergency отключает юмор;
- activation pool остаётся 0 до внешнего review;
- отчёт перечисляет changed, checked, intentionally unchanged и known risks.
