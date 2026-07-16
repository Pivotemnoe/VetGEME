# Operational authoring 2026.07.16.3 — immutable review-only integration report

Дата: 16 июля 2026 года.

## Baseline и границы slice

- Ветка: `codex/tier-01-v2-integration`.
- P0 baseline: `2b00cd150dc47272bb3f2f5ece67c5c5d2fbd7db` (`feat: register operational v2 review input`); локальная ветка и `origin/codex/tier-01-v2-integration` совпадали.
- Operational `.3` зарегистрирован отдельной immutable versioned записью. Он supersede `.2` только как author source для P3/P4/P7 semantics и provenance; source `.2` и `reports/OPERATIONAL_AUTHORING_2026.07.16.2_MISMATCHES.json` сохранены byte-for-byte.
- Slice не меняет runtime-каталоги, генератор, медицинские тексты, save schema, economy, визуал или текущие 30 case ID.
- Production/runtime/generator eligibility выключены; activation manifest не создаётся. Production pool остаётся `0`.
- P5/P6 намеренно остаётся fail-closed: `reservationAuthority=false` до отдельного точного P5 `.2` join.
- Commit результата создаётся отдельно после финальных проверок; его точный SHA приводится в handoff после commit/push.

## Changed

- Точный source архива `operational-production-authoring-2026.07.16.3.zip` импортирован без авторских исправлений в `content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.3/source`.
- Добавлены versioned provenance, intake-сверка ZIP/source inventory и trusted archive/provenance/aggregate pins. Co-tamper registry + provenance + source отклоняется.
- Добавлен host validator P3/P4/P6/P7: exact source/generated projection, dependency pins, author-output reproducibility, outer P7 campaign/authority projection и fail-closed activation gates.
- P3 проверяется по 361 routes и 1 864 usage-level turnaround contracts, exact 206 urgency и 875 classification source values, включая два dynamic resolver ID без придуманного state-to-band policy.
- P4 проверяется по 514 presentation+handling bindings и 950 medical fact references в контексте конкретной presentation; generic synthetic fact references запрещены.
- P7 проверяется по 93 evidence resolver records, individual/aggregate/activation digests и semantic mutation. Host отдельно связывает outer `day-catalog.campaign` и `day-catalog.authority`.
- Добавлен review adapter exact lookup с persisted urgency/due-policy decisions, idempotent replay и fail-closed P5 reservation gate.
- Добавлен machine-readable host review report с закрытыми author P1, оставшимися blockers и намеренно неизменёнными runtime-границами.
- Docker prebuild включает provenance, host validation, adapter/contract tests и report verification `.3`; review-only source по-прежнему исключён из production build context.

## Exact source integrity

- Package: `vetgeme-operational-production-authoring@2026.07.16.3`.
- Archive SHA-256: `5abee5242467e703561e0de2eefbb5050345448c90b21b97761d7ee60540a1df`.
- Provenance SHA-256: `105b5c037652eac183a29af7e4afdb6f044ebce6811e69a48199b2e7a37eb986`.
- Source aggregate SHA-256: `20e2b8768b1be7cdacefb11fdb1b2dc1139d0f007097c99188e0706bab685284`.
- Inventory: 51 ZIP entries; 40 extracted source files; 12 860 948 bytes; CRC, path, symlink, duplicate и case-fold duplicate checks — PASS.
- Medical `.40` manifest pin: `87ded58e62ecf0b05d87af83e00570004cadafa9a0edd74768eda6e8cb9b3f49`.
- Capability registry pin: `16ff64c015a8edb302c15289540a4ed760cfc356d832bca31094f992b1da3c81`.
- Raw P5 `.2` manifest pin: `25730b20dcc3d0ac840082f353ccea14d11c35aa9c107bf2cb52ccd21e3e69c6`; archive pin: `665183acc97096477dd9366b8116a65a11862e4919d02170278f8e97e241a7ab`. Это dependency/provenance pin, не execution join.
- Operational `.2` provenance/aggregate/archive и mismatch-report digests после импорта `.3` остались неизменными.
- Автоматического смыслового crosswalk с нынешними 30 case ID нет.

## Закрытые author P1

1. P3 turnaround больше не схлопывается в representative usage: проверены 1 864 usage contracts и 46 multi-policy research IDs.
2. P3 exact source crosswalk закрывает 206/206 urgency и 875/875 classification values без default/fallback; два dynamic значения остаются fail-closed до внешнего medical resolver.
3. P4 содержит 514 presentation+handling bindings к реальным medical `.40` fact IDs и safe routes; проверены 950 scoped fact references.
4. P7 combined digest связывает все 93 resolver semantics; resolver digest `e5c756a3ccc158e509caa2a7e76654981b0ce7cb3f4951fa30c4eeec07123558`, activation digest `a588b27bbcffb6e44dc01e135dac2f0aff926124d66b8008578960ef6b25e371`.

## Оставшиеся blockers

1. `p3_medical_result_authority_projection_drift` — P1, 361 records. Source authority: `medical_family.presentation.investigations[].result_only`; generated projection: `family.presentation.investigations[].result_only`. Host validator не принимает shortened authority и не выдумывает исправление.
2. `p5_execution_join_unresolved` — P1. Flattened resource IDs не дают requirement groups, `anyOf`/AND, units, duration, lifecycle и scheduler commands; reservation authority остаётся выключенным до отдельного P5 `.2` slice.
3. `activation_requirements_unsatisfied` — общий fail-closed gate: external veterinary approval, programmer adapter/runtime validation и product-owner acceptance не получены.

## Checks

### Source, host и contract checks — PASS

- P0 audit HEAD/branch/status, overlap и preservation operational `.2`.
- Exact ZIP/source intake, 40 files / 12 860 948 bytes, archive/aggregate/provenance/dependency hashes.
- Host validation, immutable co-tamper rejection и exact three-blocker contract.
- P3/P4/P6/P7 positive/negative projection tests.
- Adapter exact lookup, missing dynamic resolver rejection, persisted decision/reload, idempotent replay и P5 reservation rejection.
- Bundled validator: 62 checks, 10 000 campaigns, 297 717 demand-days.
- Temporary author-v3/build/validate rebuild: 13 generated outputs reproduced byte-for-byte; registered source не изменён.
- JavaScript syntax checks, content/generator/save/operations/economy/campaign suites и `git diff --check`.

### Browser, save и Docker matrix — PASS

- Production image `vetgeme-web:local` собран из dirty review-slice context `f33fda94ffcbb8d60cbda2c5e54af5e336fe37c07a3283f130f133784f627466` и проверен отдельным read-only контейнером `vetgeme-op3-smoke-web-1` на `127.0.0.1:5177`.
- Browser smoke (`Playwright 1.61.1`) сохраняет `current`, `legacy-v1`, `tier-01-v2` и `tier-01-v2-modular`, persisted day и независимые save namespaces до/после reload; in-app browser дополнительно подтвердил корректный DOM и отсутствие визуального перекрытия planning modal в modular scene.
- Отдельный reset/cancel smoke подтвердил отсутствие изменений после отмены, удаление только активного namespace после подтверждения, новый день 1/новый seed для generator modes, сохранение foreign-mode saves и повторное восстановление после reload.
- Active clinical pool остаётся 30, production pool — 0; review-only `.3` не запрашивается runtime. Console/page/network errors в smoke-сценариях отсутствуют.
- Production build context не содержит `content/review-inputs`; HTTP contract возвращает `404` для review-only paths. Image parity/security: 201/201 runtime files, non-root `101:101`, read-only filesystem, dropped capabilities и healthy status — PASS.
- Временный container/network `vetgeme-op3-smoke` удалён после проверки; ранее работавшие `5174` и `5176` остались healthy и не изменялись.

## Независимый P0/P1 review

- Source-package P0 audit подтвердил безопасный архив, exact inventory, dependency pins и воспроизводимость author output.
- Contract review подтвердил четыре закрытых author P1 и обнаружил сохраняемый P1 authority drift во всех 361 P3 records; bundled validator имеет неточную `includes("family.presentation")` проверку, поэтому host выполняет strict equality.
- Первичный programmer review обнаружил рассинхрон adapter fixture/contract, обязательный resolver при восстановлении persisted external order, неверно обязательный `providerResolver` для 19 законных `providerId` routes, неполные exact-set/P7 outer projection checks и скопированный dead `.2` code. Финальный review дополнительно синхронизировал host/adapter XOR для `providerResolver`/`providerId` и запрет approximate/default authority keys. Все findings исправлены и закрыты отрицательными regression tests.
- Повторный независимый review полного diff после исправлений: `P0 = none`, `P1 = none`, `P2 = none`. Открытые source/approval blockers из предыдущего раздела намеренно сохранены и не являются дефектами immutable review-only integration.

## Intentionally unchanged

- Operational `.2` source, provenance, registry entry и mismatch-report.
- Нынешние 30 active clinical cases, IDs, medical truth и investigation results.
- Generator randomness, deterministic seeds и persisted generated day.
- Save schema, migrations, существующие saves и namespaces `current`/`legacy-v1`/`tier-01-v2`.
- Time, queue, runtime economy/reputation и safe-referral behavior.
- Renderer, дизайн клиники, комнаты, мебель, фигурки, UI и пользовательский `art/`.
- Medical `.39`/`.40`, P8 `.1`/`.2`, operational `.1`/`.2` и P5 `.1` остаются отдельными versioned inputs.
- Raw ZIP/sidecar, author working directories, `handoff/`, `PROGRAMMER_PACKAGE_QUEUE.md` и пользовательские отчёты не включаются в commit.

## Known risks и следующий gate

- Техническая целостность review-only импорта не является medical, product-owner или production approval.
- Два dynamic urgency resolver ID требуют внешнего утверждённого medical state resolver; таблица state-to-band не создавалась.
- Author scripts используют token matching при сборке frozen JSON; runtime authority ограничен exact lookup.
- P3 authority drift требует следующей author revision, но не должен блокировать безопасное хранение `.3` как review-only input.
- Следующий отдельный slice — P5 `.2` content-addressed join. Только он может предоставить requirement-group/lifecycle/scheduler authority; до его успешного review `reservationAuthority=false`.

Итог: operational `.3` безопасно зарегистрирован как immutable review-only author source для P3/P4/P7. Четыре заявленных author P1 закрыты и подтверждены host checks; activation остаётся заблокированной явными P1/external gates.
