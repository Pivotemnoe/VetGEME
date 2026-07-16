# P3/P4/P6/P7 authoring completion audit

Дата: 2026-07-16
Пакет: `vetgeme-operational-production-authoring@2026.07.16.1`

## Матрица

| Область | Требование | Доказательство | Статус |
|---|---|---|---|
| Boundary | Не менять runtime/design/save | `MANIFEST.json.boundaries` + git scope | PASS |
| Medical boundary | Не создавать клиническую истину | P3 `medicalResultAuthority`, 0 generated results | PASS |
| P3 | 39 семейств / 361 research ID | `generated/p3/research-catalog.json` | PASS |
| P3 | Каждое применение исследования | 1 864/1 864 usage records | PASS |
| P3 | Известные capability | 0 unknown из 447 registry IDs | PASS |
| P3 | Срочность/review/contact/close | policy на каждом usage | PASS |
| P3 | Referral/turnaround/activation | 6 providers + explicit rules | PASS |
| P4 | Все temperament tags | 128/128 | PASS |
| P4 | Все owner modifier tags | 463/463 | PASS |
| P4 | Все handling alternatives | 446/446 | PASS |
| P4 | Все презентации | 645/645 explicit crosswalk | PASS |
| P4 | Профили/cues/appearance | 12 owners, 8 temperaments, 10 cues, independent pools | PASS |
| P4 | Текущий runtime contract | 10 cue rules + 446 action templates accepted | PASS |
| P4 | История и игровое время | 12 event types, append-only campaignMinute, stable reload identity | PASS |
| P6 | Все capability имеют экономическую запись | 447/447 | PASS |
| P6 | Экономика/склад/активы | prices, costs, 10 stock groups, delivery/training/maintenance | PASS |
| P6 | Репутация и восстановление | 4 axes; two-day closure gate | PASS |
| P7 | Кампания | 30 consecutive days, 6x5 chapters, 60 goals | PASS |
| P7 | Meta content | 27 events, 6 milestones, 3 specializations, 6 endings | PASS |
| P7 | Generic generation | 0 goals tied to patient/family/diagnosis | PASS |
| Simulation | 10 000 authoring campaigns | 297 717 demand-days | PASS |
| Reachability | 3 specializations / 6 endings | all observed in simulation | PASS |

Полные машинные доказательства: `reports/VALIDATION_REPORT.json`.

## Результат симуляции

- 10 000 кампаний;
- 297 717 demand-days;
- diagnostic center: 2 300;
- neighborhood access: 2 400;
- low-stress communication: 2 400;
- endings: balanced 2 401, diagnostic 2 300, neighborhood 2 400,
  low-stress 2 400, recovery 387, closure review 112;
- recovery использован в 580 сценариях;
- closure требует двух последовательных critical days.

Это проверка модели данных, а не доказательство runtime-баланса. После adapter
программист повторяет её на реальном движке.

## Намеренно не изменено

- игровые файлы и UI;
- save schema и миграции;
- P5 production catalog;
- существующий 30-card pool;
- статусы внешнего ветеринарного review 39 семейств;
- `generatorEligible` медицинских семей.

## Оставшиеся внешние gates

1. Программист создаёт точные adapters к уже существующим runtime P3/P4/P6/P7.
2. Программист подставляет реальные P5 resource IDs из текущего каталога.
3. Выполняются browser/save/reload/runtime simulation проверки.
4. Владелец продукта принимает баланс.
5. Ветеринарный reviewer принимает клинические семейства отдельно.

Авторская подготовка P3/P4/P6/P7 завершена; runtime-активация остаётся fail-closed.
