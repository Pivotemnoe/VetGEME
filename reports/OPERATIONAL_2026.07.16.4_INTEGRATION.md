# Operational authoring 2026.07.16.4 — immutable review-only integration report

Дата: 16 июля 2026 года.

## Baseline и границы slice

- Ветка: `codex/tier-01-v2-integration`.
- P0 baseline: `948b148567a7f30fc10bf7b21d07551dd368586e` (`feat: register operational v3 review input`); локальная ветка и `origin/codex/tier-01-v2-integration` совпадали.
- Operational `.4` зарегистрирован отдельной immutable versioned записью. Он supersede `.3` только как author source для P3/P4/P7 semantics и provenance; `.2`, `.3` и их отчёты сохранены byte-for-byte.
- Slice не меняет runtime-каталоги, генератор, медицинские тексты, save schema, economy, визуал или текущие 30 case ID.
- Production/runtime/generator eligibility выключены; activation manifest не создаётся. Production pool остаётся `0`.
- P5/P6 намеренно остаётся fail-closed: `reservationAuthority=false` до отдельного exact P5 `.2` join.
- Commit результата создаётся отдельно после финальных проверок; его точный SHA приводится в handoff после commit/push.

## Changed

- Точный source архива `operational-production-authoring-2026.07.16.4.zip` импортирован без авторских исправлений в `content/review-inputs/vetgeme-operational-production-authoring-2026.07.16.4/source`.
- Добавлены versioned provenance, exact ZIP/source intake и trusted archive/provenance/aggregate pins; совместная подмена registry, provenance и source отклоняется.
- Host validator проверяет P3/P4/P6/P7 version matrix, dependency pins, generated/explicit projections, author-output reproducibility и fail-closed activation gates.
- P3 authority проверяется strict equality для всех 361 research records: `medical_family.presentation.investigations[].result_only`; generated и explicit records совпадают 361/361, drift `0`, `operationalPolicyMayGenerateResult=false`.
- Negative tests отклоняют missing, shortened и unknown authority, включённую генерацию результата, missing/duplicate research ID и удалённый generated record со стабильным blocker ID `p3_medical_result_authority_projection_drift`.
- Review adapter сохраняет exact lookup, persisted urgency/due-policy decisions, reload/idempotent replay и fail-closed P5 reservation gate; evidence теперь явно говорит, что projection проверена, а не исправлена адаптером.
- Machine-readable host report фиксирует пять закрытых author findings, один открытый P5 join и неизменённые runtime/medical границы.
- Docker prebuild включает provenance, bundled validation, host validation, adapter/contract tests и deterministic report `.4`; review-only source исключён из production build context.

## Exact source integrity

- Package: `vetgeme-operational-production-authoring@2026.07.16.4`.
- Archive SHA-256: `0e2fed94349ddfd8b5ace8d19a3e2da723c13bf46ec894b067d56eff5c6854d5`.
- Provenance SHA-256: `e4e60e12f66b5c84166b530ec0ad8da20073be95533be06a0d3940db2ad5a92a`.
- Source aggregate SHA-256: `c7bb0bd0232ba765a5b3e8a8f0c093e7410e20a9aa435f1e3e3ece6c9f920764`.
- Inventory: 51 ZIP entries; 40 extracted source files; 12 864 215 bytes; CRC, path, symlink, duplicate и case-fold duplicate checks — PASS.
- Medical `.40` manifest pin: `87ded58e62ecf0b05d87af83e00570004cadafa9a0edd74768eda6e8cb9b3f49`.
- Capability registry pin: `16ff64c015a8edb302c15289540a4ed760cfc356d832bca31094f992b1da3c81`.
- Raw P5 `.2` manifest pin: `25730b20dcc3d0ac840082f353ccea14d11c35aa9c107bf2cb52ccd21e3e69c6`; archive pin: `665183acc97096477dd9366b8116a65a11862e4919d02170278f8e97e241a7ab`. Это dependency/provenance pin, не execution join.
- Operational `.2`/`.3` provenance, source и reports после импорта `.4` остались неизменными; P4/P6/P7 authority/generated artifacts `.3→.4` byte-identical.
- Автоматического смыслового crosswalk с нынешними 30 case ID нет.

## Закрытые author findings

1. P3 usage-level turnaround: 1 864 contracts и 46 multi-policy research IDs, representative fallback запрещён.
2. P3 exact source crosswalk: 206 urgency и 875 classification values без approximate/default fallback; два dynamic resolver ID остаются внешними и fail-closed.
3. P3 medical result authority: 361/361 exact explicit/generated matches, `0` mismatches, exact namespace и запрет operational result generation.
4. P4: 514 presentation+handling bindings и 950 scoped medical fact references, generic synthetic fact references `0`.
5. P7: 93 resolver semantics; resolver digest `e5c756a3ccc158e509caa2a7e76654981b0ce7cb3f4951fa30c4eeec07123558`, activation digest `a588b27bbcffb6e44dc01e135dac2f0aff926124d66b8008578960ef6b25e371`.

## Оставшиеся blockers

1. `p5_execution_join_unresolved` — P1. До exact P5 `.2` join отсутствует авторитетное объединение requirement groups, `anyOf`/AND, units, duration, lifecycle и scheduler commands; reservation authority выключена.
2. `activation_requirements_unsatisfied` — внешний fail-closed gate: external veterinary approval, programmer activation/runtime validation и product-owner acceptance не получены.

## Checks

### Source, host и contract checks — PASS

- P0 audit HEAD/branch/status, overlap и preservation operational `.2`/`.3`.
- Exact ZIP/source intake: 51 entries, 40 files, 12 864 215 bytes, archive/aggregate/provenance/dependency hashes.
- Host validation, immutable co-tamper rejection, strict P3 authority/identity-set mutations и exact two-blocker contract.
- P3/P4/P6/P7 positive/negative projection tests и adapter save/reload/idempotency tests.
- Bundled validator: 64 checks, 10 000 campaigns, 297 717 demand-days.
- Temporary author-v4/build/validate rebuild: 13 generated outputs reproduced byte-for-byte; registered source не изменён.
- Deterministic machine report verify, JavaScript syntax/content/generator/save/operations/economy/campaign suites и `git diff --check`.
- Full host Docker prebuild: 148 syntax files, 82 validation/test commands, 201 runtime files. Production-context prebuild: 148 syntax files, 41 shipping checks, 201 runtime files.

### Browser, save и Docker matrix — PASS

- Production image `vetgeme-web:local` собран из exact dirty review-slice context `64584692dc574f7d844cef91bcc59dc40d22de7475850f3316b362177a487234`; rollback tag `vetgeme-web:dirty-64584692dc57`.
- Отдельный read-only контейнер `vetgeme-op4-smoke-web-1` проверен на `127.0.0.1:5177`: healthy, user `101:101`, read-only root, `cap_drop: ALL`, `no-new-privileges`, bounded tmpfs, memory/CPU/PID limits.
- Image/HTTP parity: 201/201 runtime files и hashes, 63 asset hashes, CSP/cache/gzip/method/body-limit contracts; review-only paths возвращают `404`.
- Browser smoke (`Playwright 1.61.1`) прошёл для `current`, `legacy-v1`, `tier-01-v2` и `tier-01-v2-modular`: save namespaces и localStorage переживают reload, active compatibility pool `30`, medical production pool `0`, review-input requests `0`, console/page/network/CSP issues `0`.
- Reset/cancel smoke для трёх режимов подтвердил: cancel не меняет storage; confirm удаляет только active namespace и его migration backups; generator modes получают новый seed; открывается day `1`, phase `planning`; foreign-mode saves сохраняются; второй reload восстанавливает новую кампанию.
- Screenshot review modular planning modal и fresh tier day 1 на 1280×720: modal/HUD/scene overlap не обнаружен.
- Временный container/network `vetgeme-op4-smoke` удалён; ранее работавшие `5174` и `5176` остались healthy и не изменялись.

## Независимый P0/P1/P2 review

- Первый независимый review: `P0 = none`, `P1 = none`; найден P2 gap в regression coverage для missing/duplicate P3 identity-set. Добавлены три host negative tests без изменения immutable source.
- Второй независимый review: `P0 = none`, `P1 = none`; найден P2 wording defect, где adapter evidence могло выглядеть как автор исправления. Поле заменено на `medicalResultAuthorityProjectionVerified`.
- Финальный повторный review обоими проверяющими: `P0 = none`, `P1 = none`, `P2 = none`. Exact provenance/intake, `.2/.3` preservation, bundled rebuild, host/adapter/report/prebuild и fail-closed boundaries подтверждены повторно.
- Immutable bundled validator имеет более слабую coverage-проверку ID-set, но production authority ему не выдана; host validator строго проверяет length, uniqueness и exact set, а missing/duplicate/removed regressions закреплены тестами.

## Intentionally unchanged

- Operational `.2`/`.3` source, provenance, registry entries и reports.
- Нынешние 30 active clinical cases, IDs, medical truth и investigation results.
- Generator randomness, deterministic seeds и persisted generated day.
- Save schema, migrations, существующие saves и namespaces `current`/`legacy-v1`/`tier-01-v2`.
- Time, queue, runtime economy/reputation и safe-referral behavior.
- Renderer, дизайн клиники, комнаты, мебель, фигурки, UI и пользовательский `art/`.
- Medical `.39`/`.40`, P8 `.1`/`.2`, operational `.1`/`.2`/`.3` и P5 `.1` остаются отдельными versioned inputs.
- Raw ZIP/sidecar, author working directories, `handoff/`, `PROGRAMMER_PACKAGE_QUEUE.md` и пользовательские отчёты не включаются в commit.

## Known risks и следующий gate

- Техническая целостность review-only импорта не является medical, product-owner или production approval.
- Два dynamic urgency resolver ID требуют внешнего утверждённого medical state resolver; state-to-band policy не создавалась.
- Author scripts используют token matching при сборке frozen JSON; runtime authority ограничен exact host lookup.
- P5 `.2` content-addressed join остаётся следующим отдельным slice. Только после его успешного review можно рассматривать requirement-group/lifecycle/scheduler authority; до этого `reservationAuthority=false`.

Итог: operational `.4` безопасно зарегистрирован как отдельный immutable review-only author source. Ошибка P3 authority projection закрыта в авторском source и независимо подтверждена 361/361 exact matches; activation и production pool остаются fail-closed.
