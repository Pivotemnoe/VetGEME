# Задание программисту: operational `.4` P3 authority correction

## Место в очереди

Выполнять после полного завершения, отдельного отчёта, commit и push текущего
operational `.3` slice, но **перед P5 `.2` join**. Текущую `.3` не прерывать и
не смешивать. `.2`/`.3`, их provenance и mismatch/review reports не изменять.

## Причина новой версии

Независимый host-review `.3` подтвердил четыре прежних author corrections, но
нашёл ещё один точный P1:

- explicit P3 у всех 361 research records:
  `medical_family.presentation.investigations[].result_only`;
- generated `.3`:
  `family.presentation.investigations[].result_only`;
- mismatch: 361/361.

Это author build-projection defect, а не отсутствие медицинских данных. `.4`
исправляет только эту проекцию и сохраняет все остальные контракты `.3`.

## P0-аудит

1. Зафиксировать фактические HEAD/branch/status после коммита `.3`.
2. Проверить SHA/ZIP `.4`, безопасный inventory и точное отличие от `.3`.
3. Зарегистрировать `.4` отдельным immutable review input с собственным
   provenance; `.3` не перезаписывать.
4. Проверить pinned medical `.40`, capability registry и P5 `.2` digests.
5. Не добавлять в коммит raw ZIP/sidecar, `art/`, `handoff/` и другие пакеты.

## Обязательная проекция P3

1. `source/p3-explicit-research-routes.json` остаётся authority source.
2. Для каждого из 361 records generated
   `medicalResultAuthority === explicit.medicalResultAuthority`.
3. Допустимое значение ровно одно:
   `medical_family.presentation.investigations[].result_only`.
4. `operationalPolicyMayGenerateResult` всегда `false`.
5. Unknown/missing/different authority блокирует record; alias, substring,
   сокращение namespace и programmer mapping запрещены.
6. Host-validator прежний blocker
   `p3_medical_result_authority_projection_drift` должен ожидать 0, а negative
   test обязан вернуть его при изменении хотя бы одной записи.

## Сохранить без изменений

- 1 864 usage-level turnaround contracts и два dynamic urgency fail-closed;
- P4: 514 presentation handling bindings и реальные medical fact IDs;
- P7: 93 resolver digests и combined activation digest;
- P5/P6: `reservationAuthority: false` до точного P5 `.2` join;
- 30 текущих карточек, production pool 0, save schema и namespaces;
- runtime economy, renderer, визуал и пользовательские файлы.

## Проверки

- bundled author/build/validator из `.4` — ожидается 64 checks, 10 000
  campaigns, 297 717 demand-days;
- exact 361/361 explicit/generated comparison;
- negative mutations: missing authority, сокращённый namespace, unknown
  namespace, `operationalPolicyMayGenerateResult: true`;
- регрессия полного `.3` P3/P4/P7 набора;
- JS/content validation и `git diff --check`;
- browser/save/Docker smoke можно выполнять как отдельный изолированный gate,
  не затрагивая контейнеры 5174/5176;
- независимый P0/P1 review перед коммитом.

## Итог

Отдельный безопасный commit и push. В отчёте разделить: `.4` imported,
authority projection verified, P5 join pending, medical approval pending,
runtime activation blocked. Успешный импорт `.4` не создаёт activation manifest
и не включает 39 семейств в генератор.
