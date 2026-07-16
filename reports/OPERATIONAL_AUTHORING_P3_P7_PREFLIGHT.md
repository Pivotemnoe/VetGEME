# Operational authoring 2026.07.16.1 — P3/P4/P6/P7 preflight

Дата: 16 июля 2026 года.

Вход: `vetgeme-operational-production-authoring@2026.07.16.1`.

Статус: `review_input_passed_activation_blocked`.

## Итог

- Побайтовое подключение как отдельного review-only input: **PASS**.
- Штатная authoring-сборка и проверка: **PASS, 37 checks / 10 000 simulations**.
- Дополнительный repo-level adversarial preflight: **PASS, activation blockers detected**.
- Production-активация P3/P4/P6/P7: **BLOCKED**.

Пакет не включён в browser loader, static runtime, Docker image или действующий
30-card pool. Его собственный `runtimeEligible` и eligibility всех 13 generated
catalogs остаются `false`. Сохранения и режимы `current`, `legacy-v1` и
`tier-01-v2` не изменены.

## Целостность источника

| Контроль | Результат |
|---|---|
| Архив | `operational-production-authoring-2026.07.16.1.zip` |
| SHA-256 | `5d396f3ec56369a56e0113ec66b262c2726ed0a13a80571cdca8fc2516bde807` |
| Sidecar | совпадает |
| ZIP entries | 36 |
| Regular files | 25 |
| Распакованный объём | 3 925 919 bytes |
| Tracked aggregate SHA-256 | `0a42bad7eccf70ba4eb3c18738c4b6653ab06d75056526ca828707b11e33f055` |
| Path traversal / symlink / duplicate entries | не обнаружены |
| Archive / extracted / tracked comparison | 25/25 byte-for-byte |

Tracked-копия находится только под `content/review-inputs/`. Корневой ZIP,
sidecar и распакованная пользовательская папка не меняются и не входят в
коммит.

## Полученные authoring-каталоги

| Этап | Проверенный состав |
|---|---|
| P3 | 361 research IDs, 1 864 usage IDs, 6 providers, review/contact/shift-close policy |
| P4 | 12 owner profiles, 8 temperaments, 10 cues, 128 temperament tags, 463 owner tags, 446 handling tags, 645 presentation refs |
| P6 | 447 capability economics records, 13 services, 10 inventory categories, 4 reputation axes, recovery policy |
| P7 | 30 days, 6 chapters, 60 goals, 27 events, 6 milestones, 3 specializations, 6 endings |

Все ссылки относятся к новому 39-family / 645-presentation namespace. Ни один
из нынешних 30 `caseId` в operational package не обнаружен; автоматический
crosswalk не создан.

## Прежние блокеры, которые пакет снимает на authoring-уровне

1. Для 361 исследований появился явный capability contract и для 1 864
   применений — criticality/review/contact/shift-close policy.
2. Появились exact turnaround policy и шесть referral-provider records.
3. P4 получил versioned profiles, temperaments, cues, history policy и explicit
   presentation compatibility records.
4. P6 получил полный количественный balance candidate для 447 capabilities,
   inventory, четырёх reputation axes и recovery.
5. P7 получил полный 30-дневный authoring candidate: дни, цели, события,
   milestones, specializations и endings.

Это закрывает отсутствие данных, но не превращает authoring candidate в
approved runtime authority.

## Блокеры, которые штатный validator не обнаруживает

Полный машиночитаемый перечень затронутых ID хранится в
`reports/OPERATIONAL_AUTHORING_P3_P7_MISMATCHES.json`.

### 1. P3: подозрительная маршрутизация во внешний imaging provider

Сборщик использует substring-проверку `includes("ct")`. Из 64 исследований,
направленных в `ref_imaging_center`, 32 не содержат отдельного imaging-маркера;
например, `addison_acth_stimulation_confirmation` сработал из-за `acth`.

Это audit heuristic, а не медицинское исправление. Все 32 маршрута должен
повторно утвердить автор; adapter не переназначает их самостоятельно.

### 2. P3: local ownership, fallback authority и activation state неоднозначны

- 230 local records имеют `providerId: null` намеренно, потому что не являются
  внешними услугами, но ещё не привязаны к P5 resource ownership/availability;
- 12 source records имеют `fallback: null`; сборщик подставляет им
  `activationGate.fallback = safe_referral`, однако этот default не является
  явно записанным и утверждённым authoring-решением;
- все 361 records содержат `delivered`, `trainingComplete`,
  `maintenanceCurrent` и `stockAvailable` равными `true`.

Эти boolean можно трактовать только как требования policy, но не как
фактическое владение/готовность runtime. До явного P5/P6 state resolver они не
дают capability и не активируют исследование. Для local route нужен точный P5
ownership resolver; для 12 defaulted fallback — явное author/veterinary
подтверждение безопасного маршрута.

### 3. P4: восемь resource requirement ID отсутствуют в canonical registry

Все 448 resource references у 446 handling records используют восемь ID,
которых нет среди 447 canonical capabilities:

| ID | Ссылок |
|---|---:|
| `quiet_route` | 287 |
| `scheduled_recheck_slot` | 67 |
| `referral_coordination` | 60 |
| `sampling_plan` | 17 |
| `comfort_surface` | 8 |
| `infection_control_capacity` | 5 |
| `reviewed_sedation_protocol` | 2 |
| `monitoring_capacity` | 2 |

До explicit P5 mapping эти действия не исполняются.

### 4. P4: safe alternatives потеряны при генерации runtime template

У всех 446 handling records top-level `safeAlternatives` заполнен строковыми
ID, но `runtimeActionTemplate.safeAlternatives` пуст. P4 runtime требует
структурированные alternative objects с fact ownership; adapter не может
додумать их безопасно.

### 5. P4: fallback crosswalk требует авторского просмотра

- 341 из 463 owner tags выбраны default-rule;
- 82 из 128 temperament tags выбраны default-rule;
- 46 из 446 handling tags выбраны default-rule.

Это допустимо для review, но не считается human-approved semantic mapping.

### 6. P4: first-match precedence и substring создают неверные/неоднозначные mappings

Сборщик выбирает первое правило, для которого `sourceTag.includes(matchToken)`.
Отдельного author-owned crosswalk или разрешения конфликтов нет. Аудит нашёл:

- 5 owner tags, совпадающих сразу с двумя правилами;
- 183 handling tags, совпадающих с несколькими action classes (до четырёх);
- 10 owner, 15 temperament и 2 handling mappings, где token выбранного правила
  не ограничен границами snake-case сегмента; exhaustive проверка всех
  совпавших candidate rules находит 10 / 15 / 5 таких tags соответственно;
- две бесспорные лексические ошибки:
  `clinic_inhibited -> temp_pain_defensive` только из-за `bite` внутри
  `inhibited` и `exercise_intolerant -> temp_calm` только из-за `tolerant`
  внутри `intolerant`;
- отдельный контекстный риск
  `respiratory_distress -> temp_fearful` из-за `stress` внутри `distress`.

Для handling особенно опасен порядок правил: например,
`anesthesia_or_referral` выбирает `minimal_handling` раньше
`sedation_or_anesthesia`, а `barrier_cohort_or_referral` — `minimal_handling`
раньше `barrier_isolation`. Полные 5 + 183 конфликтных записи и все
non-boundary matches сохранены в mismatch JSON. Adapter не исправляет их
эвристически: нужен explicit author crosswalk.

### 7. P6: реального P5 resource mapping в этом ZIP нет

`p3-p5-resource-crosswalk.json` прямо задаёт
`p5CatalogAuthority = runtime_p5_catalog_or_explicit_programmer_mapping_required`
и `inferredP5Ids: false`. ID персонала, помещений и оборудования не выводятся
из названий. Отдельный P5 ZIP обрабатывается следующим изолированным срезом.

### 8. P7: catalog records несовместимы с trust boundary runtime

Package `catalogRef` содержит только `catalogKind`, `catalogId` и
`catalogVersion`. `campaign-director-v7` дополнительно требует точный `digest`,
а resolver обязан вернуть envelope со status `approved`, тем же digest и
authoritative `itemIds`.

Пакет не содержит approved envelope или digest. Его объект
`catalogEnvelopes` — набор authoring item records, а не runtime authorization
envelope. Создавать approved digest в programmer adapter до отдельного
activation manifest запрещено.

### 9. P7: нет exact evidence resolver к P3–P6 audit IDs

Цели и события используют policy identifiers вроде `completed_visit_ids`,
`schedule_or_refer` и `p3.result_review_on_time`. Нет versioned crosswalk к
фактическим audit record IDs текущих P3–P6 cores. Поэтому goals, axes, events и
ending selection не активируются.

## Внешние gate, которые остаются обязательными

1. Veterinary approval medical families: 39/215/645 всё ещё pending.
2. Исправленный и повторно выпущенный P3 provider mapping.
3. P4 explicit rule crosswalk, structured safe alternatives и exact P5
   resource mapping.
4. P5 production package, resource lifecycle и ownership bridge.
5. Approved P6 balance/product-owner acceptance.
6. P7 activation manifest с approved digests и evidence resolver.
7. Runtime 10 000-campaign simulation, browser/save/reload/reset smoke.

## Намеренно не изменено

- source package и его authoring records;
- medical statuses, eligibility и production pool;
- существующие 30 cards и generator randomness;
- save schema и уже сохранённые P3–P7 states;
- обычный browser runtime, UI, renderer и визуал клиники;
- `current`, `legacy-v1`, пользовательские `art/` и `handoff/`;
- policy выбора участника или момента handoff;
- корневые ZIP и распакованные authoring-папки.

## Проверки

- archive checksum, entry type/path audit и 25/25 direct comparisons — **PASS**;
- package build + bundled validator in isolated temp layout — **PASS**;
- repo-level lifecycle/count/capability/preflight validator — **PASS**;
- negative context/integrity/status/version/file-set/crosswalk tests — **PASS**;
- P3/P4/P6/P7 existing unit и static browser smoke — **PASS**,
  `browserIssues: []`;
- host Docker prebuild — **PASS**, 107 syntax files / 49 validation commands /
  201 runtime files;
- static distribution — **PASS**, 201/201 hashes; `content/review-inputs`
  отсутствует;
- final Docker context
  `8976abebd9b26d2cc97f84e6a1fc22d82a62f2410c4f9281514dba67a15996c0`:
  isolated verifier — **PASS**, 107 / 41 / 201; HTTP и image smoke — **PASS**;
- Docker browser smoke `current`, `legacy-v1`, `tier-01-v2`, `modular-v2` —
  **PASS**: review requests 0, 30 действующих cards, production pool 0/0/0 до
  и после reload, console/page/network/CSP issues отсутствуют;
- первичный headless GPU screenshot legacy/modular дал compositor-артефакт;
  повторная software-compositor проверка отрисовала обе сцены нормально, без
  DOM overlays или runtime fallback;
- `git diff --check` — **PASS**.

## Решение

Пакет подключён как воспроизводимый review input и снимает прежнее отсутствие
authoring-каталогов. Production verdict не меняется: до исправления конкретных
несоответствий и прохождения внешних approvals/runtime gate безопасным состоянием
остаётся `runtimeEligible: false`, production pool 0 и неизменные 30 текущих
карточек.
