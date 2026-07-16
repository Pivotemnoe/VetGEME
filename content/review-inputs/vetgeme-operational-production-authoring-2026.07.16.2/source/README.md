# VetGEME operational production authoring 2026.07.16.2

Авторский пакет данных для P3, P4, P6 и P7. Он подготовлен поверх медицинского
пакета `2026.07.16.40` и P5-пакета `2026.07.16.2`, но сам не меняет runtime,
сохранения или дизайн игры.

## Что закрыто

- P3: 361 явный маршрут исследования и 1 864 применения; локальные и внешние
  маршруты, провайдеры, сроки, runtime-предикаты доступности и безопасный выход;
- P4: явные решения для 463 признаков владельца, 128 состояний животного и 446
  вариантов обращения; никакого поиска по кускам слов;
- P4/P5: восемь дополнительных операционных требований с точными владельцами
  состояния и ресурсами;
- P6: экономика всех 447 capabilities, 49 ресурсов P5, 12 помещений, расходники,
  обслуживание и восстановление;
- P7: 30 дней, 6 глав по 5 дней, 27 событий, 6 milestones, 3 специализации,
  6 концовок и 93 точных evidence-контракта;
- все P7 envelopes имеют SHA-256 и авторский статус.

## Главные источники

- `source/p3-explicit-research-routes.json`;
- `source/p4-explicit-behavior-crosswalk.json`;
- `source/p4-operational-requirements.json`;
- `source/p6-explicit-capability-economics.json`;
- `source/p6-p5-exact-resource-crosswalk.json`;
- `source/p7-evidence-resolver.json`.

Старые `matchTokens` в policy-файлах не являются runtime-правилами. Они нужны
только для воспроизводимой авторской сборки; в runtime разрешены исключительно
зафиксированные explicit-каталоги.

## Сборка и проверка

```bash
node scripts/author-v2-explicit-contracts.mjs
node scripts/build-operational-package.mjs
node scripts/author-v2-cross-system-contracts.mjs
node scripts/build-operational-package.mjs
node scripts/validate-operational-package.mjs
```

Пакет остаётся `runtimeEligible: false`, пока программист не реализует адаптеры,
не проверит save/reload и браузер, владелец продукта не примет баланс, а
медицинский production pool не будет активирован после внешней ветпроверки.
