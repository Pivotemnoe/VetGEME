# VetGEME medical production authoring

Эта папка — отдельный авторский медицинский пакет. Она не подключена к
production-генератору и не меняет engine, renderer или save schema.

Авторский объём завершён: 39 семейств, 215 вариантов и 645 клинических
presentations. Production pool намеренно равен 0 до независимого ветеринарного
review и выпуска отдельного activation manifest.

## Статусы

- `author_complete` — клиническая ветка полностью описана автором контента;
- `source_checked` — ключевые решения сопоставлены с перечисленными источниками;
- `external_veterinary_review_pending` — независимый ветеринарный review ещё не
  зафиксирован;
- `approved` — может выставить только назначенный ветеринарный reviewer;
- `generatorEligible` остаётся `false`, пока все три уровня — family, variant и
  presentation — не имеют `approved` и не выпущен activation manifest.

## Формат

Один клинический случай собирается только из явно описанных данных:

```text
family defaults
+ variant contract
+ presentation contract
+ совместимый пациент
+ совместимый владелец/темперамент
```

Массивы не объединяются молча. По контракту presentation наследует от своего
непосредственного variant только `primaryDiagnosisId`, `differentials` и
`sourceIds`; `carePlanId` всегда указывается в presentation явно. Все остальные
клинические факты, результаты исследований, требования к оборудованию и исходы
принадлежат самой presentation и не генерируются кодом.

В пакете сохранены два явно валидируемых варианта truth contract:

- семейства 01–12: `diagnosticTruth` + `primaryDiagnosisId` + `differentials`;
- семейства 13–39: `diagnosticTruth` + explicit `exclusions`.

Это не неполнота и не разрешение программисту сопоставлять поля по смыслу.
Валидатор требует один из этих двух полных контрактов для каждого variant.

## Порядок работы

1. Семейство получает полный authoring contract.
2. Валидатор проверяет ID, версии, discovery paths, исследования, безопасный
   маршрут, планы, контроль и исходы.
3. Ветеринарный reviewer вносит решение без изменения авторских ID.
4. Для одобренного набора создаётся отдельный activation manifest.
5. Программист подключает только перечисленные в manifest версии.

## Итоговые артефакты

- `MANIFEST.json` — точные версии, объёмы и machine-readable family matrix;
- `PROGRESS.md` — человекочитаемая матрица всех 39 семейств;
- `FINAL_COMPLETION_AUDIT.md` — итоговый P10 gate-аудит;
- `PROGRAMMER_HANDOFF.md` — правила поэтапного импорта без медицинского
  домысливания;
- `review/*-source-review.md` — 39 независимых source-review записей;
- `scripts/validate-medical-authoring.mjs` — fail-closed package validator.

Проверка выполняется из корня репозитория:

```sh
node --check medical-production-authoring/scripts/validate-medical-authoring.mjs
node medical-production-authoring/scripts/validate-medical-authoring.mjs
```
