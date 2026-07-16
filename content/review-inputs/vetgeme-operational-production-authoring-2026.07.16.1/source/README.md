# VetGEME operational production authoring package

Это отдельный авторский пакет входных данных P3, P4, P6 и P7. Он подготовлен
параллельно с интеграцией 39 медицинских семейств и не меняет игровой код.

## Что внутри

- P3: 361 исследование, 1 864 точных использования в презентациях, срочность,
  review/contact/shift-close, turnaround, шесть маршрутов направления и правила
  активации capability;
- P4: 12 профилей владельцев, 8 темпераментов пациентов, 10 наблюдаемых cues,
  независимые пулы внешности и явный crosswalk всех 128 temperament, 463 owner и
  446 handling тегов из 645 презентаций, плюс append-only история по игровому времени;
- P6: цены, расходы, зарплаты, четыре оси репутации, десять групп запасов,
  закупка, доставка, обучение, обслуживание, восстановление и экономика всех
  447 capability;
- P7: 30 дней, 6 глав, 60 общих целей, 27 событий, 6 milestones, 3 специализации,
  6 финалов, восстановление и свободная игра.

## Важная граница

Пакет не содержит и не создаёт диагнозы, результаты исследований, назначения или
другую клиническую истину. Она остаётся только в
`medical-production-authoring/families/*/family.production.json` и активируется
только после внешнего ветеринарного review.

`runtimeEligible: false` означает не «данных нет», а «данные готовы как авторский
кандидат и должны пройти адаптер, runtime smoke и принятие баланса». Существующий
30-card compatibility pool не менялся.

## Структура

- `source/` — авторские решения и числовые правила;
- `generated/` — полностью развёрнутые machine-readable каталоги;
- `scripts/build-operational-package.mjs` — только компиляция авторских данных;
- `scripts/validate-operational-package.mjs` — покрытие и authoring simulation;
- `reports/VALIDATION_REPORT.json` — доказательства проверки;
- `PROGRAMMER_HANDOFF.md` — порядок интеграции без домысливания;
- `FINAL_COMPLETION_AUDIT.md` — матрица фактической готовности.

## Воспроизводимая проверка

```bash
node operational-production-authoring/scripts/build-operational-package.mjs
node operational-production-authoring/scripts/validate-operational-package.mjs
```

Сборщик и валидатор обслуживают только этот пакет. Они не импортируются игрой и
не являются изменением движка.
