# P8 medical review authoring 2026.07.16.1 — preflight

Дата: 16 июля 2026 года.

Вход: `vetgeme-p8-medical-review-authoring@2026.07.16.1` для exact medical
input `vetgeme-medical-production-authoring@2026.07.16.39`.

Статус:
`review_input_valid_source_correction_and_veterinary_approval_blocked_activation_forbidden`.

## Итог

- Импорт как отдельного immutable review-only input: **PASS**.
- Собственная package validation P8: **PASS**; это проверка целостности
  review-пакета, а не медицинское одобрение.
- Source/player-facing audit: **BLOCKED** — открыто 735 P0 и 5 241 P1.
- Dialogue-library structural validation: **PASS**, но библиотека остаётся
  `runtimeEligible: false` и не подключена к игре.
- External veterinary approval: **MISSING**.
- Activation manifest: **MISSING**.
- Runtime/production activation: **FORBIDDEN**; production pool остаётся 0.

Ни один family, variant или presentation не получил `approved`. Текущие 30
игровых case ID, генератор и сохранения не изменены.

## Целостность источника

| Контроль | Результат |
|---|---|
| Архив | `p8-medical-review-authoring-2026.07.16.1.zip` |
| SHA-256 | `1c7bd9da610cc03f08081023e613651b025bb677371a4ad3161e02960d6477eb` |
| Sidecar | совпадает |
| ZIP entries | 20: 16 regular files и 4 directories |
| Распакованный объём | 4 561 393 bytes |
| Unsafe paths / symlinks / duplicates | 0 / 0 / 0 |
| Exact tracked-to-ZIP comparison | 16/16 files, byte-for-byte |
| Medical input | `.39`, archive `54a6cec6…22c`, aggregate `e3341e53…26c` |
| Operational P4 input | `.1`, owner catalog `3e722abf…b9f`, crosswalk `0d211caf…582` |

Одноимённая пользовательская папка `p8-medical-review-authoring/` уже содержит
другую версию. Для `.1` она не читалась и не перезаписывалась: tracked source
сформирован только из exact ZIP `.1`, а provenance сравнивает его
непосредственно с архивом.

## Что P8 фактически проверил

| Показатель | Значение |
|---|---:|
| Families | 39 |
| Variants | 215 |
| Presentations | 645 |
| Source entries | 221 |
| P4 presentation refs | 645 |
| Все открытые issues | 5 976 |
| P0 | 735 |
| P1 | 5 241 |
| P2 / P3 | 0 / 0 |

Классы дефектов:

- `PLAYER_TEXT_NOT_RUSSIAN`: 4 720;
- `SERVICE_TOKEN_IN_PLAYER_TEXT`: 731;
- `DOCTOR_INSTRUCTION_NOT_SPEECH`: 521;
- `PLAYER_TEXT_EMPTY`: 4.

Все 39 families затронуты. У 36 есть P0; `hepatobiliary`, `oncology_mass` и
`neuro_vestibular` не имеют P0, но всё равно содержат P1. Presentation-scoped
issues есть у 617 из 645 presentations. Остальные 28 не считаются одобренными:
автоматический аудит не доказывает clinical truth, source scope или внешний
ветеринарный review.

Пустые family titles обнаружены у `gi_obstruction`, `urinary_uroliths`,
`resp_pneumonia` и `resp_feline_asthma`.

## Что появилось впервые

1. Полный machine-readable список P0/P1 для exact `.39` medical input.
2. Матрица исправления всех 39 families и fail-closed language policy.
3. Reviewer guide и decision template с четырьмя состояниями:
   `approved`, `changes_required`, `rejected`, `not_reviewed`.
4. Разговорная библиотека: 12 owner profiles × 8 функций, 15 функций речи
   врача и 4 редких события.
5. Explicit правила: owner behavior не меняет clinical truth; юмор не является
   единственным путём к критическому факту; редкое абсурдное событие запрещено
   при emergency и ограничено одним на день.
6. Exact P4 closure: 645/645 presentation refs, без missing/extra/duplicate refs
   и без неизвестных owner profile IDs.

Это закрывает отсутствие формального P8 review workflow и полного списка
языковых дефектов. Оно не исправляет сами медицинские данные и не заменяет
ветеринарное решение.

## Блокеры

1. `p8_source_correction_gate_blocked` — 5 976 P0/P1 остаются open; исходный
   текст нельзя показывать игроку.
2. `p8_bundled_p1_clean_gate_incomplete` — bundled `--require-clean` считает
   clean только отсутствие P0 и может пропустить оставшиеся P1, хотя policy
   требует P0=0 и P1=0. Host gate проверяет оба значения отдельно.
3. `p8_external_veterinary_approval_missing` — external reviewer не одобрил ни
   одну exact record version.
4. `p8_reviewer_decisions_missing` — в пакете есть только template; exact
   reviewer decision set, P8 digest envelope и проверяемая подпись отсутствуют.
5. `p8_activation_manifest_missing` — activation manifest не создан и не может
   быть выведен автоматически.
6. `p8_player_facing_dialogue_runtime_forbidden` — generic dialogue library
   прошла structural validation, но не имеет разрешения на runtime и не может
   заменять индивидуальные case texts.
7. `p8_upstream_catalogs_review_only` — medical, operational и P5 inputs
   остаются review-only; production authority не возникает из совпадения ID.
8. `p8_operational_semantics_not_audited` — собственный P8 audit проверяет
   language/P4 refs, но не утверждает P3/P5/P6/P7 provider, resource, cost,
   duration, stock, event или campaign semantics.
9. `p8_unmapped_research_tasks` — три P3/P5 research task не имеют ни одного
   presentation usage/result: `gi_abdominal_palpation`,
   `parasite_risk_and_prevention_history` и
   `vestibular_owner_home_environment_and_emergency_red_flag_plan`. Mapping
   требует author/veterinary решения; inference запрещён.

## Усиление host gate

P8 хранится только в `content/review-inputs/` и загружается с явным review
context. Production/default context отклоняется. Host validation дополнительно:

- проверяет SHA каждого из 16 файлов и exact ZIP identity;
- связывает P8 с tracked medical `.39` и точными P4 catalog hashes;
- требует P0=0 **и** P1=0 для будущего clean gate;
- сохраняет correction, veterinary review, dialogue runtime и activation gates
  раздельными;
- отклоняет изменение production/runtime/generator eligibility и pool > 0;
- отклоняет P8 source с exact ID любой из нынешних 30 карточек;
- не считает family decision решением для дочерних variant/presentation;
- не принимает placeholder template или решение с неверным package/version/
  digest/record ID/version;
- не разрешает `approved`, пока source audit заблокирован и external veterinary
  approval отсутствует.

Actual reviewer decision set не импортирован и не сохраняется в game save.

## Cross-system результат

- P3/P5 покрывают exact 1 864/1 864 investigation usage IDs; отдельно три
  перечисленных research tasks не входят в usage set и не имеют presentation
  result.
- P4 presentation-ref closure полная, но прежние resource/safe-alternative/
  precedence blockers operational package остаются.
- P5 lifecycle/ownership/readiness/stock/wage/transaction и 312 duration
  divergences остаются отдельными blockers.
- P6 balance/economy и P7 digest/evidence/runtime authority остаются
  review-only.
- Ни один из 30 текущих `tier-01-v2` case ID не встречается в 16 P8 source
  files; semantic crosswalk не создаётся.

## Намеренно не изменено

- medical `.39` source и все найденные P0/P1;
- veterinary statuses, eligibility и production pool;
- 30 действующих case ID и generator randomness;
- save schema, saves, reset и mode isolation;
- current/legacy-v1/tier-01-v2 gameplay;
- clinical UI, economy, campaign и clinic visuals;
- пользовательские `art/`, `handoff/`, ZIP и распакованные authoring folders;
- medical `.40` и P8 `.2`, которые являются отдельным следующим заданием.

## Выполненные проверки

- `node --check` для текущего static build и всех новых P8 host scripts: **PASS**.
- `node scripts/refresh-p8-authoring-review-provenance.mjs --compare-archive`:
  **PASS**, 20 ZIP entries, 16/16 regular files byte-for-byte, 4 561 393 bytes.
  Эта проверка использует исходный пользовательский ZIP как integration evidence;
  архив остаётся untracked, а повторяемая проверка tracked input опирается на
  pinned provenance и file hashes.
- `npm run validate:p8-authoring-review-provenance`,
  `validate:p8-authoring-review:bundled`, `validate:p8-authoring-review` и
  `test:p8-authoring-review`: **PASS** с ожидаемым source status `blocked`,
  bundled `--require-clean` exit `1`, девятью blockers и pool 0.
- Medical `.39`, operational `.1` и P5 `.1` provenance/validator/contract
  regressions: **PASS**; их review-only blockers сохранены.
- Content registry, Tier 01/Tier 01 v2, legacy/v2 generator smoke,
  deterministic generation/reload и save isolation: **PASS**.
- `npm run test:docker:prebuild`: **PASS**, 118 syntax files, 57 host
  validation/test commands и 201 runtime files.
- Docker build/image/HTTP smoke: **PASS** для exact context
  `d3ad79037e05540e49de7a3ecc3e073d51f4774b0727865f7119453e9481d4b8`;
  runtime inventory 201/201, P8 review source не попал в image и отдаёт 404.
- Browser smoke отдельного контейнера на `127.0.0.1:5177`: **PASS** для
  `current`, `legacy-v1`, `tier-01-v2` и `tier-01-v2 + modular-v2`; после reload
  mode/save-key сохраняются, у Tier 01 остаются 30 cases и medical pool 0/0/0,
  review-input requests — 0, console/page/request errors — 0. Тестовый контейнер
  удалён; существующие 5174/5176 остались healthy.
- Независимые adversarial code audit и report/data audit: **PASS** после
  усиления exact P8 decision envelope и explicit upstream version pins.
- `git diff --check`: **PASS**.

## Риски

1. Проверка кириллицы в bundled audit частичная: смешанный текст с одной
   кириллической буквой может пройти и требует human review.
2. Host проверяет все три emergency bands для `rareAbsurdEvents`, но
   `ownerProfiles.*.lightHumor` не содержит urgency metadata. Сейчас весь
   dialogue runtime запрещён; будущий adapter обязан отдельно подавлять и
   `lightHumor` при emergency.
3. Автоматический language audit не проверяет clinical truth, источники,
   differential/exclusion logic, investigation interpretation или unsafe
   decisions.
4. Status `package validation pass` нельзя отображать как medical approval:
   одновременно корректны `package pass`, `source audit blocked` и
   `activation false`.
5. `reviewerSignature` пока является только обязательным непустым структурным
   полем и криптографически не проверяется. Decision import остаётся `false`,
   поэтому это не открывает activation.
6. Immutable source template `.1` ещё не содержит host-поле `reviewPackage`.
   Host уже требует exact P8 ID/version/archive/provenance/aggregate envelope;
   будущий authoring handoff должен документировать это поле явно.

## Вывод

P8 `.1` даёт проверяемый список исправлений и будущий reviewer workflow, но
сам подтверждает, что medical `.39` нельзя активировать или показывать игроку.
Безопасный итог этого slice — immutable review input, 9 сохранённых blockers,
нулевой production pool и неизменные 30 текущих карточек.
