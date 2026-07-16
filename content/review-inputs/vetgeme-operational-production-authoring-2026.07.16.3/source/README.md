# VetGEME operational production authoring 2026.07.16.3

Корректирующий полный авторский пакет для P3, P4, P6 и P7. Он заменяет
operational `.2` как будущий author source, но **не изменяет и не уничтожает**
`.2`: предыдущая версия остаётся immutable evidence независимого P1-аудита.

Пакет подготовлен поверх медицинской базы `.40` и контракта P5 `.2`. Он не
меняет runtime, визуальный дизайн, сохранения, действующие 30 карточек или
production pool.

## Что исправлено после независимого P1-review

- P3: все 1 864 usage получили собственный turnaround contract. У 46 research
  ID сохранены разные сроки для разных urgency; единого
  `representativeUsage.turnaroundPolicy` больше нет.
- P3: 206 исходных urgency и 875 исходных classification имеют точный
  author-owned crosswalk. Silent default запрещён. Два действительно
  динамических urgency требуют состояния пациента до заказа и не получают
  выдуманный `priority`.
- P4: 514 сочетаний presentation + handling связывают действие со всеми
  `criticalFacts[].factId` именно этой презентации, их discovery paths,
  медицинским владельцем и безопасным маршрутом. 446 синтетических
  `handling.*.required_fact` удалены.
- P7: все 93 resolver-записи имеют индивидуальный digest. Общий activation
  digest связывает версию адаптера, дни, цели, axes, envelopes, recovery и
  полный resolver envelope. Mutation probe входит в валидатор.
- Provenance: manifest закрепляет SHA-256 medical `.40`, capability registry и
  P5 `.2` manifest.

## Что намеренно остаётся закрытым

P5/P6 crosswalk в этом пакете **не является reservation authority**. До
интеграции точного P5 `.2` join нельзя терять `requirementGroups`, `anyOf`/AND,
units, duration, lifecycle и scheduler commands. Поле
`reservationAuthority: false` является обязательным fail-closed gate, а не
недоделанной заглушкой.

Остальные внешние gates: программистский adapter/runtime review, browser и
save/reload smoke, product-owner acceptance баланса и внешнее ветеринарное
одобрение 39 медицинских семейств.

## Авторские источники `.3`

- `source/p3-exact-source-crosswalk.json`;
- `source/p4-presentation-medical-fact-crosswalk.json`;
- `source/p7-activation-digest-contract.json`;
- сохранённые точные `.2` sources для research routes, behavior mapping,
  economics и evidence semantics.

Generated-файлы не являются основанием для догадок: они воспроизводимо
собираются только из этих источников и medical `.40`.

## Сборка и проверка

```bash
node scripts/author-v3-exact-contracts.mjs
node scripts/build-operational-package.mjs
node scripts/validate-operational-package.mjs
```

Ожидаемый результат: 62 checks, 10 000 seeded campaigns, не менее 295 000
demand-days и `runtimeEligible: false` до прохождения внешних gates.
