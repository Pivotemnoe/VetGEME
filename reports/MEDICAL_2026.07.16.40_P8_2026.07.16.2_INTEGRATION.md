# Medical 2026.07.16.40 + P8 2026.07.16.2 — programmer integration report

Дата: 16 июля 2026 года.

## Baseline и ветка

- Рабочая ветка: `codex/tier-01-v2-integration`.
- P0 baseline перед этим slice: `b4e3ae4 feat: add review-only P8 medical review input`; локальная ветка и `origin/codex/tier-01-v2-integration` совпадали.
- До импорта уже были подключены отдельные review-only версии medical `.39`, operational P3/P4/P6/P7 `.1`, P5 `.1` и P8 `.1`. Новые версии добавляются рядом с ними и не перезаписывают прежние входы.
- Активный runtime baseline остаётся равен 30 случаям `tier-01-v2`; production pool нового медицинского каталога остаётся `0`.
- Commit результата: отдельный integration commit этого slice. Его точный SHA фиксируется в финальном handoff после создания commit; заранее записать собственный SHA внутрь ещё не созданного commit невозможно.

## Changed

- Зарегистрирован новый точный review-only input `vetgeme-medical-production-authoring@2026.07.16.40`; `.39` сохранён отдельной неизменённой версией и остаётся default для прежних команд без явного version selector.
- Зарегистрирован новый точный review-only input `vetgeme-p8-medical-review-authoring@2026.07.16.2`; P8 `.1` сохранён отдельно.
- Импортированы только файлы точных архивов, добавлены versioned provenance и проверки archive, aggregate, key-file и всех 39 family SHA-256.
- Medical loader и bundled-validator получили явный выбор `.39`/`.40`. Production/default context для `.40` отклоняется fail closed.
- Добавлен отдельный P8 `.2` loader/validator. Он проверяет точные ID, версии и digests medical `.40`, operational `.1`, P4 owner/behavior crosswalk, reviewer-decision contract и запреты runtime/activation.
- Host clean gate требует одновременно `P0 = 0` и `P1 = 0`. Автоматизация не может присвоить veterinary approval или создать activation manifest.
- Вне неизменяемого авторского source добавлен programmer-owned host reviewer envelope. Он жёстко связывает решение с P8 `.2`, medical `.40`, operational `.1` и точными digest; проверяет согласованность общего решения с решениями по доменам, требует issue IDs для `changes_required` и запрещает неявное наследование approval от family к variant/presentation.
- Контракт речи ограничен формой реплики: она не может менять medical truth, результат исследования, согласие/отказ, стоимость, время или исход; в emergency юмор запрещён.
- Подготовлен служебный review-only view family → variant → presentation с review status, capabilities, investigations/results, correct/unsafe decisions и safe referral. Он не добавлен в player runtime и предназначен только для browser QA.
- Production Docker boundary дополнен проверками, что medical `.40`, P8 `.2`, registry и служебные review-input файлы не попадают в runtime image и не отдаются по HTTP.

## Exact source integrity и versions

### Medical authoring

- Input: `vetgeme-medical-production-authoring@2026.07.16.40`.
- Archive SHA-256: `171659e929f4b8a83cf921a8fa689cd3f5ac632466c4c328dd047199fced71c5`.
- Provenance SHA-256: `8dda49a530366c3b42f0d0c94bb5e7adf322e87b36df6e7d2d321a434012ecab`.
- Source aggregate SHA-256: `3f3f89ab93e005a5100b39586328c38fa6b4fcf52887be63cabc41ac05c557c8`.
- Archive/source inventory: 129 ZIP entries; 85 extracted source files; 5,250,732 bytes.
- Catalog counts: 39 families, 215 variants, 645 presentations, 447 capabilities, 1,864 investigation results, 0 null/empty results.
- Все 39 family hashes из manifest сверяются с фактическими source bytes.

### P8 medical review

- Input: `vetgeme-p8-medical-review-authoring@2026.07.16.2`.
- Archive SHA-256: `2fb059e9a85c632d6f37b66f05ff8f93065aea7e92eda06e1fafb1dff55d5031`.
- Provenance SHA-256: `97d4b8ad902afafe541f06dbd55cfbaa699b4816a5061a9ba217dc708bdae24d`.
- Source aggregate SHA-256: `785bd77cfda14e5846e13de7d219c1635714d16fbbabb6c04c88221f9d449093`.
- Archive/source inventory: 33 ZIP entries; 29 extracted source files; 488,589 bytes.
- P8 `.2` точно закреплён за medical `.40` и operational `.1`. Dialogue library сохраняет собственную авторскую component version `.1`; это не означает откат всего P8 input до `.1`.
- Operational dependency aggregate: `0a42bad7eccf70ba4eb3c18738c4b6653ab06d75056526ca828707b11e33f055`.
- P4 owner profiles SHA-256: `3e722abff5eb46e0161f714dd6fe2386e0f6f4c3997dc276bd0752930b682b9f`.
- P4 behavior crosswalk SHA-256: `0d211caf8b5af4ae64cda672a36836350411b82053c29cb6741252dbfcb65582`.
- Programmer-owned host reviewer README SHA-256: `8bffab04784f594b02669e7c82155162eedc35186e47aecec2a077c0a2283274`.
- Host reviewer envelope template SHA-256: `cfd0cc68a21a05fa33249d4c86a256b61b250bc2131f99612377e58c405d4f31`.
- Host reviewer envelope schema SHA-256: `7f18d44a975e86d810bfc584d7af81fd8de0d91b9f77d1ac1af34f8aa7fe8135`.
- Тест будущего импорта открывает внешние review flags только в изолированной копии данных. Зарегистрированные review-only inputs и runtime gates остаются закрытыми.

## Какие прежние authoring blockers сняты

Сняты дефекты авторского пакета, которые блокировали повторный P8/P10 preflight `.39`:

- source gate теперь имеет `P0 = 0`, `P1 = 0` и 0 audit issues;
- все 1,864 результата исследований содержат конкретное авторское состояние, пустых результатов нет;
- display-language audit проверил 9,847 player-facing полей: 0 issues;
- dialogue validation проходит с 0 issues;
- P8 package validation проходит при `activationAllowed: false`;
- medical/P4 presentation closure совпадает точно: 645/645.

Это снимает author-correction gate, но не является независимой ветеринарной приёмкой и не даёт production authority.

## Оставшиеся external-vet и P3–P7 blockers

- Нет решения назначенного внешнего ветеринарного reviewer для каждой точной активируемой версии family/variant/presentation.
- Reviewer decision template присутствует, но подписанный полный decision set отсутствует. Family approval не может неявно одобрить вложенные variants или presentations.
- Activation manifest отсутствует и не может быть создан до полной внешней приёмки; `externalVeterinaryApproval`, `generatorEligible`, `runtimeEligible` и `activationAllowed` остаются `false`.
- Medical `.40`, operational `.1`, P5 `.1` и P8 `.2` остаются review-only; P8 language review не присваивает P3/P5/P6/P7 production authority.
- P3: три research task пока не используются ни одной presentation: `gi_abdominal_palpation`, `parasite_risk_and_prevention_history`, `vestibular_owner_home_environment_and_emergency_red_flag_plan`.
- P3/P5/P6/P7: capability, scheduling/resource, inventory/asset/maintenance и event-trigger semantics требуют собственных утверждённых production-каталогов и cross-system gates. P8 проверяет ссылки и границы, но не подменяет эту приёмку.
- Player-facing dialogue library остаётся runtime-ineligible до внешнего review и отдельной activation-процедуры.

## Checks

### PASS на момент составления отчёта

- P0 audit branch/HEAD/status и уже подключённых P3–P8 review-only слоёв.
- Оба archive SHA-256 совпадают с sidecar checksum; ZIP inventory безопасен, medical `.40/source` соответствует точному архиву.
- Medical `.39` provenance compare и прежние `.39` host tests — без регрессии.
- Medical `.40` provenance compare — exact match.
- Medical `.40` bundled validator — PASS, 39/215/645.
- Medical `.40` host validator — PASS, 1,864 результатов, 0 null/empty, production pool 0.
- P8 `.1` provenance compare — без регрессии.
- P8 `.2` provenance compare — exact match.
- P8 `.2` author source audit — `reviewable`, P0/P1 `0/0`.
- P8 `.2` display-language audit — `passed`, 9,847 полей, 0 issues.
- P8 `.2` dialogue validation — `pass`, 0 issues.
- P8 `.2` reproducible build и package validation — `pass`, activation false.
- P8 `.2` host validator — `passed_review_only_external_veterinary_review_pending`; 30 baseline cases, 0 crosswalk matches, production pool 0.
- Host reviewer decision contract: positive и negative rollup cases, точные dependency bindings и запрет family-to-child approval — PASS.
- Service review structural test — PASS: 39 families, 215 variants, 645 presentations, 1,864 результатов и 645 точных safe-referral checks; 121 emergency presentations с выключенным юмором.
- Browser review matrix — PASS, 234/234: все 39 families на ширинах 1920/1440/1280 при DPR 1/2. Проверены длинные тексты и реплики, overflow/overlap/truncation, hierarchy, capabilities, investigations/results, decisions и точный safe referral.
- Browser reset всех трёх режимов — PASS: cancel не меняет save; confirm открывает день 1 с новым campaign seed; saves двух неактивных режимов сохраняются.
- Runtime browser regression P3/P4/P5/P6/P7 — PASS: generated day не меняется, save/reload и mode isolation сохраняются; для P5 проверено фактическое владение reservation segments до handoff и после reload.
- Generator v2 — PASS на 1,000 deterministic/persisted/reload сценариях при неизменных 30 active cases.
- Content, demand, save-isolation, game-state, migration, compact-save, scheduling, operations, economy, referral и campaign suites — PASS.
- JavaScript syntax checks — PASS.
- Clean staged-snapshot prebuild без ZIP, raw handoff, user `art/` и авторского completion report — PASS: 126 syntax checks, 65 validation/test commands и 201 runtime files.
- Docker build — PASS: `vetgeme-web:local`, build-context SHA-256 `7722e6772231e9f3405208ad5d8079520627f330e0d79e1773870ea35404cfd2`, 201 files в static dist.
- Docker image test — PASS: точные 201 files/hashes и 63 assets; non-root/read-only/cap-drop/security/tmpfs/limits сохранены.
- Docker HTTP test — PASS: parity, security/cache/method/body-limit; review-only medical `.40` и P8 `.2` URL возвращают 404; все три mode query обслуживаются.
- Docker browser smoke в отдельном compose project на `127.0.0.1:5177` — PASS для `current`, `legacy-v1`, `tier-01-v2` и `tier-01-v2-modular`: initial/reload state, 30 active cases, medical production pool 0, отсутствие review-input requests, сохранение localStorage sentinels и готовность modular visual.
- Независимый code review после исправления host reviewer contract и clean-snapshot gate — P0/P1/P2 замечаний нет.
- `git diff --check` и `git diff --cached --check` — PASS после финальных правок отчёта.

Итог: slice технически готов как review-only интеграция. Это не является внешним veterinary approval и не разрешает production activation.

## Intentionally unchanged

- Нынешние 30 активных clinical cases и их IDs.
- Generator randomness, deterministic seed contract и generated-day persistence.
- Save schema, существующие saves и ключи current/legacy-v1/tier-01-v2.
- Режимы current, legacy-v1 и tier-01-v2.
- Renderer, визуал клиники, кабинеты, мебель, фигурки и UI-дизайн.
- Runtime economy, time, queue и referral rules.
- Medical `.39`, operational `.1`, P5 `.1` и P8 `.1` как отдельные versioned inputs.
- Смысловой crosswalk между 30 текущими case ID и 215 variants не создавался.
- Veterinary approval не присваивался; activation manifest не создавался; 39 families не включались в generator; production pool остаётся 0.

## Known risks

- В точном P8 `.2` архиве есть `generated/P8_SOURCE_AUDIT_2026.07.16.40.json`, содержащий устаревший snapshot P8 `.1` / medical `.39`. Он отсутствует в `manifest.authoritativeFiles`, отклонён как authority и учитывается только как non-authoritative artifact. Авторитетным является `generated/P8_SOURCE_AUDIT.json`.
- Bundled `--require-clean` определяет clean status только по P0. Host integration компенсирует это отдельным fail-closed gate, который требует одновременно P0 = 0 и P1 = 0.
- Family review decision labels всё ещё содержат формулировку о pending correction, хотя author source audit чист. Host не выводит из этих labels approval и сохраняет статус external review pending.
- Три перечисленных P3 research task остаются без presentation usage. Их нельзя автоматически удалить, сопоставить или считать избыточными без решения владельца P3 каталога.
- Техническая целостность и чистый язык не доказывают клиническую правильность. До внешнего veterinary review любая production activation остаётся запрещённой.
