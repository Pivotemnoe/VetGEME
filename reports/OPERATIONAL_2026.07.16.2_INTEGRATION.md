# Operational authoring 2026.07.16.2 — immutable review-only integration report

Дата: 16 июля 2026 года.

## Baseline и границы slice

- Ветка: `codex/tier-01-v2-integration`.
- P0 baseline: `dc98524ac760b8d87282d69a45703ac04fbb3e9b` (`feat: register medical v40 and p8 v2 review inputs`); локальная ветка и `origin/codex/tier-01-v2-integration` совпадали.
- До начала slice уже были подключены operational `.1`, P5 `.1`, medical `.39`/`.40` и P8 `.1`/`.2`. Operational `.2` добавлен рядом с ними отдельной versioned записью; `.1` сохранён и остаётся default для прежних команд без явного selector.
- Slice не меняет runtime-каталоги, генератор, медицинские тексты, save schema, economy, визуал или текущие 30 case ID.
- Production/runtime/generator eligibility для operational `.2` выключены. Production pool медицинского каталога остаётся `0`.
- Commit результата создаётся отдельно после финальных проверок; его точный SHA приводится в handoff после commit/push.

## Changed

- Точный source архива `operational-production-authoring-2026.07.16.2.zip` импортирован в `content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.2/source` без авторских исправлений и зарегистрирован как review-only input.
- Добавлены versioned provenance и intake-проверка точного ZIP/source inventory, aggregate SHA-256, key-file hashes и dependency pins.
- Trusted archive/provenance/aggregate digests закреплены в programmer-owned loader. Согласованная подмена registry + provenance + source отклоняется отдельным co-tamper negative test.
- Добавлены host validator и contract tests для P3/P4/P6/P7. Они проверяют точные source/generated projections, deterministic author output и fail-closed activation gates.
- P3 проверяется на уровне всех 361 research routes и 1 864 usages, включая точное равенство `requires` и `requiredCapabilityIds`, lifecycle predicates и medical-result authority paths.
- P4 проверяется по явным 463/128/446 crosswalk records, 645 presentations и safe-route payloads. Неутверждённые operational fact IDs не считаются медицинским authority.
- P6 проверяется по 49 resource references и exact 447 + 8 capability mapping, но намеренно не получает P5 execution authority без отдельного content-addressed join.
- P7 проверяется как точная projection campaign/day/axes/recovery/envelopes/resolvers и `goalType -> evidence/minimum`, включая все 93 evidence contracts.
- Bundled author build/validator запускается только во временной копии source и не переписывает зарегистрированный immutable input.
- Добавлен отдельный machine-readable mismatch-report. Он фиксирует обнаруженные расхождения без выдуманных исправлений и блокирует activation.
- Docker prebuild включает provenance, host validator и contract tests `.2`; review-only input по-прежнему исключён из production build context.

## Exact source integrity

- Package: `vetgeme-operational-production-authoring@2026.07.16.2`.
- Archive SHA-256: `0f271166547eb9dfa08f5bc195d6e5dba123f267353d2f09fbe7786b9bfb46f3`.
- Provenance SHA-256: `1134ba0ee80a6967b63764ff6e1466b5f5b97b3822bb36f577b391c3d65c6dbd`.
- Source aggregate SHA-256: `3a92755e321cb3151921f0d8f12b4f52ce3ea2fef136d15ba1014fce141bbd62`.
- Inventory: 46 ZIP entries; 35 extracted source files; 6 305 058 bytes.
- Medical dependency: exact medical `.40` package/version/digest.
- P5 dependency pin: archive SHA-256 `665183acc97096477dd9366b8116a65a11862e4919d02170278f8e97e241a7ab`; это только provenance pin, не execution join.
- Mismatch-report SHA-256: `85abd22977eec072dc756f9f7f15cb652909ff131fd3bca8425c3ab54c018b76`.
- Автоматического смыслового crosswalk с нынешними 30 case ID нет; эти IDs отсутствуют в operational `.2` source.

## Author-source mismatches и activation blockers

Отдельный отчёт `reports/OPERATIONAL_AUTHORING_2026.07.16.2_MISMATCHES.json` фиксирует `P0 = 0`, `P1 = 5`, `P2 = 2`:

1. P3 turnaround схлопнут по representative usage: неоднозначны 46 research IDs, 137 usages, 168 capability/urgency pairs, включая 57 emergency pairs.
2. P3 содержит default/fallback вместо exact author mapping: 49 usages / 36 classifications и 2 usages / 2 urgency bands.
3. P4 safe-alternative bindings используют 446 operational placeholder fact IDs; утверждённого crosswalk к medical `.40` нет.
4. P6 crosswalk не является P5 execution authority: нет точного join с requirement groups, lifecycle и scheduler commands.
5. P7 author digest не связывает полную day/resolver/envelope semantics.
6. Bundled validator имеет известные runtime false positives; host validator компенсирует их точными проверками.
7. Author manifest не content-addresses все dependency versions; host provenance закрепляет зависимости извне.

Независимый review дополнительно обнаружил drift medical-result authority во всех 361 generated P3 records (`family.presentation...` вместо полного `medical_family.presentation...`). После поступления `.3` этот факт не добавлялся задним числом в замороженный mismatch-report `.2`; loader сохраняет его отдельным fail-closed blocker `p3_medical_result_authority_projection_drift`.

Operational `.3` поставлен следующим отдельным slice и может supersede `.2` только как author source для P3/P4/P7 semantics/provenance. `.2` не переписывается. P5/P6 остаётся fail-closed до последующего точного P5 `.2` join.

## Checks

### Source и contract checks — PASS

- P0 audit HEAD/branch/status и overlap с уже зарегистрированными P3–P8 слоями.
- Exact archive/source compare, 35 files / 6 305 058 bytes, aggregate/provenance/key-file hashes.
- Host provenance validation и immutable co-tamper rejection.
- Host operational `.2` validator и positive/negative contract suite.
- Regression проверки default operational `.1` и ранее подключённых medical/P5/P8 inputs.
- Bundled build + validator на временной копии: 45/45 checks, 10 000 campaigns, 297 717 demand-days.
- Full generator simulation: 10 000 deterministic campaigns; generated-day/reload/migration invariants сохранены.
- Full demand simulation: 10 000 campaigns / 300 000 days; deterministic demand и safe routing сохранены.
- JavaScript syntax checks и content/save/operations/economy/campaign suites.
- Working-tree Docker prebuild: 132 syntax files, 70 validation/test commands, 201 runtime files.

### Browser и save matrix — PASS

- P3 runtime: critical result, review, reload, referral и reset.
- P4 runtime: identity, cues, reload и mode isolation.
- P5 runtime: active task restored; проверены фактические reservation owners/segments до handoff и после reload, а не только `handoffCount`.
- P6 runtime: economy/reputation audit, reload и idempotency.
- P7 runtime: fail closed, exact retry, atomic failure и reload.
- New game для `current`, `legacy-v1`, `tier-01-v2`: cancel не меняет save; confirm открывает день 1 с новым seed; saves двух неактивных режимов сохраняются.
- Console/page/network errors: 0 в затронутых smoke-сценариях.

### Docker matrix — PASS

- `vetgeme-web:local` собран с build-context SHA-256 `69e003dae2154d62ac4358f0f4aef178fadc935a0065fcbe227784c4bd42aa45`.
- Prebuild внутри production build context: 132 syntax files, 41 validation/test commands, 201 runtime files.
- Image contract: exact 201 files/hashes и 63 assets; non-root, read-only rootfs, cap-drop, no-new-privileges, bounded tmpfs/CPU/memory/PIDs.
- HTTP contract на изолированном `127.0.0.1:5177`: parity, cache/security/method/body-limit и `404` для `content/review-inputs`.
- Browser smoke на `5177`: `current`, `legacy-v1`, `tier-01-v2`, `tier-01-v2-modular`; initial/reload state, save namespaces, 30 active cases, production pool 0, review-input request count 0, CSP/console/network issues 0.
- Временный Compose project после проверки остановлен и удалён; существующие контейнеры на `5174` и `5176` не изменялись.

## Независимый P0/P1 review

Первичный review не нашёл P0, но обнаружил два P1 и один P2 в programmer integration:

- изменяемые registry/provenance digests могли совместно перебазировать immutable input;
- не проверялось точное равенство P3 `requires` и `requiredCapabilityIds`;
- P7 source/generated projection и goal evidence/minimum проверялись неполно.

После закрепления trusted digests, co-tamper test и точных P3/P7 projection checks выполнен повторный независимый review полного `.2` diff. Финальный результат: `P0 = none`, `P1 = none`, `P2 = none`. Перечисленные выше author-source/approval blockers остаются открытыми и не являются дефектами механизма immutable review-only импорта.

## Intentionally unchanged

- Нынешние 30 active clinical cases, их IDs и medical truth.
- Generator randomness, deterministic seeds и persisted generated day.
- Save schema, migrations, существующие saves и ключи `current`/`legacy-v1`/`tier-01-v2`.
- Time, queue, runtime economy/reputation и safe-referral behavior.
- Renderer, визуал клиники, комнаты, мебель, фигурки, UI и пользовательский `art/`.
- Operational `.1`, medical `.39`/`.40`, P5 `.1`, P8 `.1`/`.2` как отдельные versioned inputs.
- Veterinary approval не присваивался; activation manifest не создавался; production pool остаётся `0`.
- Raw ZIP/sidecar, extracted author working directories, `handoff/`, `PROGRAMMER_PACKAGE_QUEUE.md` и пользовательские файлы не включаются в commit.

## Known risks и следующий gate

- Техническая целостность review-only импорта не делает author semantics production-ready.
- `.2` нельзя активировать из-за зафиксированных P1/P2 author mismatches и отсутствия veterinary/product-owner approvals.
- Operational `.3` должен пройти собственный P0 audit, immutable versioned import, host validation, независимый review, отдельный report/commit/push. Он не имеет права редактировать `.2` или его mismatch-report.
- После `.3` требуется отдельный P5 `.2` join; до него `reservationAuthority` остаётся `false`.

Итог: operational `.2` безопасно интегрирован как immutable review-only input и технически готов к отдельному commit/push. Runtime activation намеренно заблокирована.
