# P9 visual-state authoring 2026.07.16.2 — completion report

Дата: 16 июля 2026 года.

Status: **explicit_review_harness_validated_activation_forbidden**. Это завершённый review-only slice, а не разрешение на live/runtime activation.

## Baseline и границы slice

- Ветка: `codex/tier-01-v2-integration`.
- P0 baseline: `2b26bcc18a9472057080a5f6a6112cdb6552b370`; локальная ветка и `origin/codex/tier-01-v2-integration` совпадали перед slice.
- P9 `.2` зарегистрирован отдельной immutable versioned записью и не перезаписывает P9 `.1`, medical, operational, P5 или P8 inputs.
- Обычный runtime не подключает P9 adapter/surface и не запрашивает review-only files. Для review harness одновременно нужны query `p9=review-v2` и явный marker `window.__VETGEME_P9_REVIEW_HARNESS__ = true`; одного query недостаточно.
- Production/runtime/generator eligibility и activation выключены. Production pool остаётся `0`; активный compatibility pool остаётся равен 30 случаям.
- P9 только проецирует каноническое P5 lifecycle/scheduler state. Renderer не меняет simulation state, а наличие визуала не выдаёт ownership, readiness, stock или capability.

## Changed

- Импортирован точный immutable source `vetgeme-p9-visual-state-authoring@2026.07.16.2` и добавлены отдельные provenance/source/host integrity gates.
- Source authority и programmer-owned host review harness разделены в registry: прохождение host browser QA не повышает author source до runtime authority.
- Добавлен exact projection adapter для 12 rooms, 27 equipment resources, 10 staff и 9 HUD surfaces. Он использует канонический P5 `.2` lifecycle/scheduler snapshot, half-open reservation segments и fail-closed обработку неизвестных состояний.
- Добавлена exact crosswalk-проекция на существующий runtime-v2 art: 31 asset alias, 4 canvas room bindings, 1 canvas equipment binding и 20 явных per-room overlay anchors. Координаты не выводятся эвристически.
- Добавлен изолированный DOM review surface для человекочитаемых названий, состояний, предупреждений и resource drawer. Raw resource IDs и `reasonCode` не выводятся игроку.
- Canvas остаётся владельцем scene/items/people/animals/short overlays; DOM — владельцем human text, cards, goals, money, clock, speed, trust, reputation, alerts и drawers.
- Для отсутствующего или неоднозначного art используется честный русский DOM fallback. Shared shells всегда сопровождаются понятной подписью.
- В `clinic-renderer-v2` добавлена только opt-in P9 projection path: room/equipment overlays принимаются по явным anchors, missing anchor/unknown binding отклоняются fail closed, locked-door overlay рисуется после front wall.
- Добавлен browser smoke для 1920×1080, 1440×900, 1280×720, 960×720 и 390×844, drawer и reduced motion, reload parity, сохранений и обычного runtime.
- Docker production boundary дополнен проверками, что P9 source, host artifacts, adapter и review surface не попадают в static runtime image и возвращают HTTP `404`.

## Exact source integrity и joins

- Archive SHA-256: `049f554c54dd10ba6c2b141af92f9a327b09d715dd93d6b7b98874e8b5ea2284`.
- Provenance SHA-256: `ab998c36bc8e0db55a2f0938ada9ab00b4de5fc81ea7a4960e319c9705597d97`.
- Source aggregate SHA-256: `99bf856f6ebb3fc1cdf4491c770fc330a26f63e5f450a1a9da12a03d9c65e907`.
- Source inventory: 12 files, 134,143 bytes; 12/27/10/9 catalog counts; 31 referenced asset IDs.
- Author asset index SHA-256: `d609cfdbb76dce9fd2d505fdc83d32e5ea478e1f44d8f0c3cf0a87e40cf7ae0e`.
- Runtime crosswalk SHA-256: `8114a14340690523843f6ca19dd0cc7d4e7a48b5261bcb504cb605b6febc9e4a`.
- P9 adapter SHA-256: `92f06aa646dad512359bca965d89ee1d1a8c456bfb1a0a07d838c831c54515f6`.
- P5 `.2` dependency pins: provenance `f5f54786a0a670d3c9fa1fc8c27b003dc76b2593772b61c21a07523121b829e5`, aggregate `db30b1feacd01fdab2cd6d750b59892c250d4e15eab01d1cd363c49b64dc6ad3`, resource catalog `67503f3c3c8257a5a5765abe85319fd343f82e7a3e3c36198a6d9a26f534f34b`, lifecycle catalog `62b49f14ddb213157c6a59879d33aa3fd65500078c05f3fdbc3b3ab4c491cbc6`.
- Existing runtime manifest SHA-256 `04679357ad52782466dd8d1747d341a52a651bc804d67c8fc2eb3e3570b4f719` and scene layout SHA-256 `de71c885b5f54b2a199b65228a0000106d8be02e6a0b61b8141ed533ee2eec90` are pinned by the host crosswalk and remain byte-unchanged.

## Browser evidence

- Explicit review harness: 49 P5 resources, 12 rooms, 27 equipment, 10 staff, 9 HUD surfaces; one active task and two reservations were projected from the canonical scheduler.
- Reload restored an exact projection from the serialized P5 lifecycle/scheduler shape.
- Save schema remained `10`; campaign day, campaign seed, persisted generated day and foreign-mode keys were unchanged.
- Five viewport checks, open drawer and reduced-motion pass produced 8 screenshots with 0 console/page/network issues and no protected-center overlap.
- The `room.waiting.1 → pending_delivery` transition drew `progression.delivery-pallet` and `progression.stacked-boxes` at explicit anchors. Pixel evidence: `rendererDrawCountDelta = 21`, `changedCanvasPixels = 1867`.
- Existing diploma, clock and bench placements were not duplicated: all four placement-overlay counters remained `0`.
- Secretary/receptionist Canvas requests: `0`. Staff remains roster-only in this P9 review surface.
- Ordinary boot requested no P9 review files, exposed no P9 adapter/surface globals, kept 30 compatibility cases and production pool `0`.

## Checks — PASS

- `npm run validate:p9-authoring-review-provenance:v2:intake`
- `npm run validate:p9-authoring-review:bundled:v2:intake`
- `npm run validate:p9-authoring-review:v2`
- `npm run test:p9-authoring-review:v2`
- `npm run test:p9-authoring-review:adapter:v2`
- `npm run test:p9-authoring-review:crosswalk:v2`
- `npm run test:p9-authoring-review:renderer:v2`
- `npm run test:p9-authoring-review:browser:v2`
- Core content/generator/save/renderer regressions, including Tier 01 validators, 1,000 deterministic generator runs, save isolation, game-state save, fail-closed generator mode and runtime-v2 renderer readiness/scene.
- `npm run test:docker:prebuild`: 170 syntax files, 96 validation/test commands, 201 runtime files.
- `npm run docker:build`: `vetgeme-web:local`, revision `2b26bcc18a9472057080a5f6a6112cdb6552b370`, build-context SHA-256 `21cbc98dcf7bb575e61fa67cbcfd47c8b07b63104a789ee2bf0703dcad4a4aad`, rollback tag `vetgeme-web:dirty-21cbc98dcf7b`.
- `npm run test:docker:image`: exact 201 runtime files/hashes and 63 assets; non-root/read-only/cap-drop/no-new-privileges/tmpfs/resource limits preserved.
- `npm run test:docker:http`: parity, health, cache, gzip, denied methods/paths and review-only P9 isolation passed on `127.0.0.1:5184`.
- `npm run test:docker:browser`: current, legacy-v1, tier-01-v2 and tier-01-v2-modular passed; no review-input requests, mode-local storage restored after reload, active cases 30, medical production pool 0.
- Temporary Docker container/network on port 5184 were removed after the matrix.
- `git diff --check` and staged-scope checks are completed before commit.

## Intentionally unchanged

- Immutable P9 `.2` author source and the raw ZIP/sidecar/author working directory.
- Medical `.39/.40`, P8 `.1/.2`, operational `.1/.2/.3/.4`, P5 `.1/.2` and their reports/provenance.
- Current 30 clinical cases, case IDs, medical truth, investigation results and generator pool.
- Generator randomness, deterministic seed contract and persisted generated day.
- Save schema, existing saves, migrations and namespaces `current`/`legacy-v1`/`tier-01-v2`.
- Runtime time, queue, economy, reputation, campaign rules and safe-referral behavior.
- Existing clinic layout/design and all files under tracked `art/runtime-v2`; user-owned untracked `art/` is neither edited nor staged.
- Secretary is not added to the live scene. No visual rule activates a resource.

## Risks and remaining gates

- Это explicit review harness, не ordinary runtime integration. Live activation требует отдельного P5 lifecycle/save migration plan и product-owner acceptance.
- 8 rooms, 26 equipment resources и 10 staff use DOM fallback/roster representation; отдельный base art отсутствует для 1 room и 13 equipment resources.
- Existing live scene keeps its prior minimum width of 760 px; at 390 px the page remains wider than the viewport even though the P9 controls collapse safely.
- External veterinary approval, P5/P6 production authority and all activation manifests remain outside this slice.
- Technical browser validation does not approve the visual direction for production.

## Branch and commit

- Branch: `codex/tier-01-v2-integration`.
- Parent before this slice: `2b26bcc18a9472057080a5f6a6112cdb6552b370`.
- Commit: the dedicated P9 commit containing this report; its exact resulting hash is reported by Git after creation because embedding a commit's own hash would change that hash.
