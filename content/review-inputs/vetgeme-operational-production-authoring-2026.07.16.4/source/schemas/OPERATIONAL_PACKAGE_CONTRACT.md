# Operational package contract v4

## Общая граница

Каждый каталог имеет стабильный ID/version/status и `runtimeEligible`. ID не
выводятся из отображаемого текста. Unknown ID/source value всегда fail-closed.
Import, adapter validation, integration, acceptance и activation — разные
состояния.

## P3

Каждый medical `investigations[]` usage имеет собственный turnaround contract.
Уникальный `researchId` хранит capabilities/route и таблицу допустимых policies,
но не representative due time.

Алгоритм заказа:

1. exact source crosswalk возвращает fixed urgency или требует state resolver;
2. выбирается usage turnaround policy;
3. provider calendar/cutoff применяются к выбранной длительности;
4. due time и выбранный band сохраняются один раз;
5. reload использует сохранённые данные и ничего не пересчитывает.

Classification также разрешается только exact crosswalk. Default запрещён.
Medical result остаётся только в medical presentation.

Для всех 361 research records единственное допустимое значение authority —
`medical_family.presentation.investigations[].result_only`. Generated catalog
обязан точно повторять explicit route; сокращённый или альтернативный namespace
является блокирующим projection drift.

## P4

Generic behavior/handling template не владеет клиническими фактами. Факты
подключаются только через exact `presentationRef + handlingTag` binding.

Каждый binding сохраняет:

- существующий medical `.40 criticalFacts[].factId`;
- discovery paths;
- package/family/variant/presentation/source pointer владельца;
- безопасный route для того же fact ID.

Handling может менять время, состояние, ресурсную нагрузку и доступность пути,
но не диагноз и не medical result.

## P5/P6

Ledger остаётся источником денег, P5 — источником task requirements и
reservation lifecycle. Плоский P6 resource crosswalk не является reservation
authority. Требуется точный join requirement groups, AND/anyOf, units, duration,
commands, ownership, delivery, training, maintenance, stock и capacity.

До такого join `reservationAuthority` обязан быть `false`.

## P7

Каждый resolver record имеет canonical content digest. Resolver envelope имеет
aggregate digest. Goals связывают exact record digest; остальные envelopes —
aggregate digest и свои resolver bindings.

Activation digest охватывает adapter version, day catalog, axes, envelopes,
recovery и resolver envelope. Любое semantic изменение меняет digest. Once
events, schedule и ending state должны переживать reload.

## Activation

Успешная сборка author package не даёт runtime approval. Нужны точный P5 join,
programmer adapter validation, browser/save/Docker evidence, product-owner
balance acceptance и veterinary-approved medical production pool. До этого
старый 30-card pool остаётся рабочим, а новый pool — 0.
