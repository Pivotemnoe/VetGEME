# Задание программисту: operational `.3` P1 correction slice

## Место в очереди

Выполнять после завершения текущего immutable review-only импорта operational
`.2`. `.2` не редактировать и не удалять: его mismatch-report остаётся
доказательством найденных дефектов. Затем зарегистрировать `.3` как новый
author source, который supersedes `.2` только для P3/P4/P7 semantics и
provenance.

Не смешивать этот slice с визуальным P9 и не менять медицинские тексты `.40`.

## Цель

Подключить точные исправления четырёх авторских P1-дефектов и сохранить пятый
P5/P6 gate закрытым до отдельного точного P5 `.2` join. Успешный импорт не
активирует медицинский production pool.

## P0-аудит перед изменениями

1. Зафиксировать `HEAD`, ветку, status и список уже подключённых review inputs.
2. Подтвердить, что operational `.2` зарегистрирован byte-for-byte и его отчёт
   не переписан.
3. Сверить SHA-256 архива `.3` и pinned dependencies из `MANIFEST.json`.
4. Проверить, что `current`, `legacy-v1`, `tier-01-v2`, `art/` и `handoff/` не
   затрагиваются.

## P3 — точные source values и сроки

1. Runtime/adapter читает только `source/p3-exact-source-crosswalk.json`.
   `includes`, regex, first-match и default запрещены. Неизвестное значение
   блокирует запись.
2. Due policy брать из exact usage в
   `generated/p3/investigation-usage-policy.json`, а не из общего research
   record. После оформления заказа выбранный due time сохраняется один раз и
   не пересчитывается при reload.
3. Для `by_clinical_status` и `by_secondary_disease` сначала получить
   медицинское состояние через указанный resolver rule, затем выбрать один из
   разрешённых band/policy и сохранить выбор. До этого заказ fail-closed.
4. Общий research catalog используется для маршрута, capabilities и таблицы
   возможных policies, но не как single turnaround authority.

## P4 — реальные медицинские факты

1. Generic handling action из `handlingAlternatives[]` — библиотечный шаблон
   без clinical fact authority и без synthetic fact ID.
2. Перед оценкой действия выбрать exact `presentationRef + handlingTag` из
   `presentations[].handlingBindings`.
3. `factAccessContract` создаёт runtime fact access только для существующих
   medical `.40 criticalFacts[].factId`; availability приходит из discovery
   state, а не угадывается.
4. Safe alternative сохраняет тот же `factId`, `medicalOwner.sourcePointer` и
   route payload. Operational action не создаёт и не меняет медицинскую истину.
5. Не сворачивать несколько фактов презентации в один representative fact.

## P5/P6 — оставить gate закрытым до точного join

`generated/p6/p3-p5-resource-crosswalk.json` имеет
`reservationAuthority: false`. Этот slice не должен превращать его в true.

Следующий P5 `.2` join обязан сохранить:

- requirement groups и их AND/`anyOf` семантику;
- quantity/units и duration;
- ownership, delivery, training, maintenance, stock и capacity;
- точные scheduler commands и fallback route;
- ownership резервации до/после reload.

Только после отдельного validator + browser/save evidence можно выпустить новый
combined activation manifest. Плоский список resource ID резервировать не может.

## P7 — комбинированный digest

1. Проверить 93 individual `contentSha256` и `resolverDigest`.
2. Goals обязаны сверять exact resolver record digest; event/milestone/
   specialization/ending envelopes — resolver aggregate digest и свои bindings.
3. Activation использует `activationDigest`, который включает весь
   `activationDigestInput`, включая days и adapter version.
4. Обязательный negative test: изменить одно semantic поле любого resolver
   record; старый activation digest должен перестать совпадать.
5. Approved/runtime envelope не создаётся до programmer adapter validation,
   product-owner balance acceptance и медицинского production gate.

## Обязательные проверки

- три bundled-команды из `README.md`;
- отдельный host validator, повторяющий 5 строк
  `reports/P1_CORRECTION_MATRIX.json`;
- JS syntax, content validation и `git diff --check`;
- P3 order/save/reload для fixed и обоих dynamic urgency;
- P4 минимум: доступный fact, недоступный fact + safe route, неизвестный fact,
  два факта в одной презентации;
- P7 original digest + resolver mutation rejection;
- точный P5 `.2` join отдельным slice; до него reservation rejection;
- 10 000 campaigns, browser smoke трёх режимов, reset/cancel и Docker runtime в
  отдельном контейнере.

## Приёмочный отчёт и коммит

Отдельный безопасный коммит. В отчёте указать HEAD, digest `.2` evidence, digest
`.3`, pinned dependency digests, adapter changes, P5/P6 gate state, browser/
save/Docker evidence и намеренно неизменённые части. Не объявлять весь master
package завершённым, пока хотя бы один activation gate закрыт.
