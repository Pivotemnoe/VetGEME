# VetGEME — медицинский каталог 2026.07.16.40

Это отдельный авторский медицинский пакет: 39 семейств, 215 вариантов и 645
клинических представлений. Он не меняет движок, интерфейс или схему сохранений
и не подменяет работающие 30 compatibility-case.

## Что завершено автором

- для каждого представления заданы жалоба, анамнез, осмотр, критические факты,
  исследования, правильные и опасные решения, оборудование, безопасное
  направление, исход и контроль;
- заполнены все 1 864 состояния результатов исследований: 1 680 исходных
  результатов сохранены и отредактированы, для 184 ранее пустых состояний
  явно указано, почему исследование не выполнялось на этом этапе;
- 9 847 видимых игроку полей проверены на русский язык, прямую речь,
  технические заглушки, редакторские команды, сокращения через косую черту,
  повторяющиеся результаты и несоответствие метода результату;
- разговорный слой содержит 12 характеров владельцев, 15 функций речи врача и
  четыре редких смешных события; юмор запрещён в неотложных сценариях и не
  может быть единственным путём к критическому факту;
- source-аудит каталога и языковой gate завершены без P0/P1.

## Что ещё не является одобрением

`author_complete` и чистый авторский аудит не равны независимому ветеринарному
решению. Во всех 39 семействах сохранены:

- `external_veterinary_review_pending`;
- `generatorEligible: false`;
- production pool `0`;
- отсутствие activation manifest.

Программист может подключить импорт, валидатор, служебный просмотр,
capability/economy binding и подготовить reviewer workflow. Включать эти записи
в генератор можно только после решения назначенного ветеринарного reviewer и
отдельного activation manifest.

## Авторитетные файлы

- `MANIFEST.json` — версии, объёмы, статусы и SHA-256 всех family-файлов;
- `families/*/family.production.json` — медицинские данные;
- `review/*-source-review.md` — область проверки источников;
- `schemas/clinical-family-production-contract.md` — контракт импорта;
- `scripts/validate-medical-authoring.mjs` — fail-closed валидатор;
- `PROGRAMMER_HANDOFF.md` — точная задача интеграции;
- `FINAL_COMPLETION_AUDIT.md` — итоговая матрица доказательств.

## Проверка из корня репозитория

```sh
node --check content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source/scripts/validate-medical-authoring.mjs
node content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source/scripts/validate-medical-authoring.mjs
MEDICAL_SOURCE_ROOT=content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source MEDICAL_EXPECTED_VERSION=2026.07.16.40 node p8-medical-review-authoring/scripts/audit-p8-source.mjs --require-clean
node p8-medical-review-authoring/scripts/validate-p8-display-language.mjs
node p8-medical-review-authoring/scripts/validate-human-dialogues.mjs --require-clean
```

Ожидаемый результат: 39/215/645, 1 864 результата, 0 пустых, 0 P0/P1;
активация остаётся заблокированной до внешнего ветеринарного решения.
