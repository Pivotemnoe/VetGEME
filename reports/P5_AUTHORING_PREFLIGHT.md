# P5 authoring 2026.07.16.1 — resource scheduler preflight

Дата: 16 июля 2026 года.

Вход: `vetgeme-p5-production-authoring@2026.07.16.1`.

Статус: `review_input_passed_activation_blocked`.

## Итог

- Побайтовое подключение как отдельного review-only input: **PASS**.
- Штатная authoring-сборка и validator на изолированной временной копии:
  **PASS, 49 resources / 2 606 task configurations**.
- Дополнительный activation-aware и cross-system preflight: **PASS, blockers
  detected**.
- Production-активация P5: **BLOCKED**.

Пакет не включён в browser loader, static runtime, Docker image или действующий
30-card pool. Его `runtimeEligible` и eligibility всех семи generated catalogs
остаются `false`; production pool равен 0. Обычный `operationsState` остаётся
пустым. Сохранения, generator randomness и режимы `current`, `legacy-v1` и
`tier-01-v2` не изменены.

## Целостность источника

| Контроль | Результат |
|---|---|
| Архив | `p5-production-authoring-2026.07.16.1.zip` |
| SHA-256 | `cb5afacd1199ba38f72370013b7a2d569a78e80411720b04032627a1c1922389` |
| Sidecar | совпадает |
| ZIP entries / regular files | 23 / 17 |
| Распакованный объём | 2 947 725 bytes |
| Tracked aggregate SHA-256 | `28184d5a34a82ed1694f44b44842b2bc519a09e6e576206603dfc0d3a0427a1f` |
| Path traversal / symlink / duplicate / encrypted entries | не обнаружены |
| Archive / extracted / tracked comparison | 17/17 byte-for-byte |

Tracked-копия находится только под `content/review-inputs/`. Корневые ZIP,
sidecar и распакованная пользовательская папка не меняются и не входят в
коммит. Bundled builder/validator запускаются только на временной копии, потому
что validator записывает собственный report.

## Полученный authoring contract

| Область | Проверенный состав |
|---|---|
| Ресурсы | 10 staff, 12 rooms, 27 equipment; всего 49 potential resources |
| Стартовые флаги | 2 staff, 5 rooms, 2 equipment; всего 9 starts-active candidates |
| P5 requirement-free срез | 2 staff, 5 rooms; 7 records; это не доказательство P6 ownership |
| Mappings / задачи | 447 capability mappings, из них 367 task-bearing; 14 visit, 361 research, 1 864 usage; всего 2 606 task configurations |
| Кампания | 30 recommended staffing days, 24/24 staff skills |
| Policy | fatigue, delegation, handoff, absence, maintenance, activation, urgent overcapacity |

Package boundary сохраняется буквально: P3 владеет research results, P6 —
inventory/assets/maintenance ledger, P7 — event triggering. Renderer не даёт
ownership, fatigue не меняет clinical result, save schema не меняется, а
activation относится только к новым кампаниям.

## Прежние блокеры, снятые на authoring-уровне

1. Появились стабильные ID для 10 сотрудников, 12 помещений и 27 единиц
   оборудования с capacities, capabilities и unlock/activation requirements.
2. Появились 14 visit templates, mappings для 447 canonical capabilities
   (367 task-bearing), а также 361 research и 1 864 usage templates.
3. Появились explicit fatigue bands, delegation boundaries, handoff breakpoints,
   absence и maintenance policies, urgent full-load safe-route contract.
4. Появились recommended 30-day shifts и skill coverage для всех 24 staff
   skills.
5. Handoff command contract совпадает с уже реализованным атомарным primitive
   `reassignments[groupId, fromResourceId, toResourceId, capabilityId, units]`.

Это закрывает отсутствие P5 authoring data. Это не подтверждает ownership,
staffing balance, lifecycle projection или runtime policy enforcement.

## Блокеры production activation

Полный машиночитаемый перечень exact ID и counts хранится в
`reports/P5_AUTHORING_MISMATCHES.json`.

### 1. Не выполнены четыре package gate

Manifest требует `programmer_adapter`, `runtime_browser_smoke`,
`save_reload_replay` и `product_owner_staffing_acceptance`. Review importer
намеренно не превращает эти строки в пройденные approvals.

### 2. Resource lifecycle не представлен безопасными командами

Scheduler создаёт immutable resource map и unavailable windows. Runtime не
имеет add/update/remove resource, hire, shift assignment, delivery, training и
room-ready commands. P6 `asset.acquire` сразу делает asset active и не
представляет delivery/training/readiness/broken lifecycle; P7 event evidence не
создаёт absence windows. Поэтому все 49 ресурсов нельзя preload как доступные,
а поздние unlock, dispose, maintenance и absence нельзя честно спроецировать.

### 3. Штатный validator не моделирует activation gate

Bundled validator проверяет все 2 606 configurations на всех 49 potential
resources. Девять records имеют start-active flags, но otoscope и microscope
не проходят собственные `maintenance_current`/`required_stock_available`
requirements без внешнего evidence. Поэтому строгий P5-local срез без
неудовлетворённых activation requirements содержит семь records. На девяти
flag-candidates исполнимы 13/14 visit и
144/361 research templates (217/361 с пустой group); на строгих семи — 13/14
visit, 124/361 research (237/361 с пустой group) и 125/367 task-bearing
capability templates (242/367 с пустой group). `visit.checkin` требует
`staff.administrator.lebedeva`, который доступен только с chapter 2, и не имеет
doctor fallback. Все 11 authored referral-route capabilities на первом дне
также требуют неактивного администратора и не имеют doctor fallback, поэтому
даже urgent safe route пока нельзя поставить в расписание.

### 4. P5/P6 ownership crosswalk неполон и не author-owned

По canonical capability можно однозначно найти 30 candidate mappings: все 27
equipment и помещения procedure, imaging и short stay. Но P5 не хранит
authoritative `assetCatalogId`, а automatic inference запрещён. Четыре locked
room требуют `p6_asset_owned`, но соответствующего P6 asset нет:

- `room.isolation.1`;
- `room.consult.2`;
- `room.staff.1`;
- `room.dental.1`.

Стартовые otoscope и microscope дополнительно требуют
`maintenance_current` и `required_stock_available`, но P6 new-campaign state
не содержит initial evidence или exact stock-category/unit mapping.
Пять стартовых room имеют пустые P5 activation requirements, однако P6 объявлен
единственной asset/ownership authority, его new-campaign assets пусты, а
reception, waiting, consult.1, lab.basic и storage не имеют P6 `assetCatalogId`.
До explicit initial-room seed/exception contract эти семь records нельзя
называть cross-system evidence-backed production resources.

### 5. Staffing contract требует product-owner решения

Recommended schedule не является production authority. Оба врача отмечены
start-active, хотя policy одновременно требует одного врача до покупки второго
consult room. P6 wage roles не содержат `imaging_staff`. Generated resource
catalog также не сохраняет два source `legacyId`; выводить их заново нельзя.

### 6. Requirement alternatives нельзя активировать без lifecycle filter

Generated templates содержат potential inactive resources внутри `anyOf`, а
scheduler отклоняет unknown resource. Adapter должен фильтровать альтернативы
по фактически active state и fail closed при пустой группе; preload всех 49
нарушил бы ownership boundary.

Отдельная structural проблема: 33 research tasks представляют `skill.*` как
отдельные resource groups. В пяти multi-skill tasks выбранный base staff уже
имеет часть qualification, но capacity 1 вынуждает резервировать лишних людей:

- `chf_ecg_blood_pressure_and_oxygenation`;
- `dental_anesthetized_tooth_by_tooth_charting`;
- `dental_periodontal_probe_mobility_and_furcation_assessment`;
- `feline_asthma_respiratory_triage_and_minimal_handling`;
- `pneumonia_respiratory_triage_and_oxygenation`.

Skill не активируется как отдельный сотрудник без явного изменения contract.

### 7. Handoff primitive существует, policy gate — нет

Atomic reservation transfer, idempotency и reload persistence реализованы.
Однако runtime не проверяет `not_allowed`, midpoint и urgent-quarter policies.
Bundled validator передаёт `visit.history`, хотя для него authored policy —
`not_allowed`, поэтому он доказывает только технический primitive. Из 1 074
`urgent_quarter` usages у 476 дробная authored quarter-point; из 190 midpoint
usages у 51 дробная midpoint. Правило округления до целой campaign minute, в
том числе после fatigue multiplier, не задано. Ни один из 447 capability
mappings, включая 367 task-bearing, не содержит `handoffPolicyId`; если такие
tasks enqueue отдельно, adapter вообще не имеет authored eligibility policy.
Автоматическая policy выбора участника или момента передачи не добавляется.

### 8. Operational policies не связаны с authoritative state

Fatigue multiplier сейчас приходит как command input и не сверяется с band.
Source policy P5 задаёт thresholds/multipliers/start flags и `baseFatigue` для
10 staff (Соколова — 10, Морозов — 6, остальные восемь — 0), но generated
resource catalog теряет все 10 authored `baseFatigue` значений. Explicit
contract не определяет, должны ли и каким образом они seed runtime fatigue;
accumulation и recovery rules также не заданы. Current campaign mechanics
изменяет усталость только двух legacy doctors и не имеет approved staff
crosswalk.
Shift/rest/break/extension, second-doctor overlap, delegation, maintenance,
absence и safe-route authority не исполняются. Ни один из трёх P5 absence type
не имеет exact P7 event mapping. Одиннадцать safe-route IDs не подтверждены
approved runtime catalog; при этом generic urgent policy всегда называет
`safe_referral`, но base research выбирает один из 11 маршрутов, и приоритет не
определён. `explicit_stabilization_task` присутствует в urgent attempt order,
но не имеет `taskTemplateId` или command contract.

### 9. P3/P5 route semantics требуют исправления автора

Двенадцать P3 records имели `fallback: null`; P5 builder подставил им
`safe_referral`. Из 135 external research tasks 27 одновременно сохраняют
local physical resource requirements, но явного route branching нет. Adapter
не решает, требуется ли local equipment для внешнего маршрута.

P5 reservation и P6 stock/asset mutation остаются двумя независимыми state
machines без атомарной cross-state команды. Все 21 используемые inventory
capability имеют P6 policy, но starting lots отсутствуют. P3 device queue нельзя
дублировать в operationsState, а package не даёт migration/ownership-transfer
mapping для queued или in-flight work. Exact конфликт виден у `cgm_sensor`:
canonical type — `consumable_device`, тогда как P5 представляет его повторно
используемым equipment resource, а P6 — asset. Наконец, game clock и visit queue пока не запускают
P5 enqueue/schedule/complete: простое подключение дало бы либо inert audit
state, либо двойное списание времени.

### 10. Scheduler и economy duration — разные authority

У 312/447 capabilities P5 execution duration не совпадает с P6
service/economy duration. Это разные семантики; значения не merge-ятся и не
перезаписывают друг друга без отдельного contract.

### 11. Upstream gates остаются закрыты

Operational P3/P6 candidates всё ещё review-only и `runtimeEligible: false`.
Current 30-card case IDs отсутствуют в P5 package; crosswalk не создаётся по
сходству. Veterinary approval 39/215/645 и P7 approved authority также не
появляются от P5 preflight.

## Намеренно не изменено

- source P5 package и его generated records;
- runtime scheduler, operations commands, handoff policy и save schema;
- P3/P6/P7 ownership boundaries и review-only statuses;
- текущие 30 cards, medical truth, generator randomness и campaign saves;
- обычный browser UI, renderer и визуал клиники;
- режимы `current`, `legacy-v1` и пользовательские `art/`/`handoff/`;
- корневые ZIP, sidecar и распакованная authoring-папка;
- автоматические P5/P6/current crosswalk и недостающие policy defaults.

## Проверки

- archive checksum, entry type/path audit и 17/17 direct comparisons — **PASS**;
- package build + bundled validator в isolated temp layout — **PASS**;
- repo-level integrity/count/lifecycle/activation/cross-system validator —
  **PASS, blockers retained**;
- negative context, status, eligibility, provenance, source-byte, file-set,
  upstream-drift, start-active, mapping, wage, absence, route, handoff-policy,
  skill-reservation, baseFatigue projection/startup-contract и crosswalk tests —
  **PASS**;
- existing P3/P5/P6/P7 unit и browser smoke — **PASS**;
- static/Docker isolation — **PASS**: review input отсутствует в shipped files,
  не запрашивается browser и возвращает 404;
- production pool до и после reload — **0**;
- `git diff --check` — **PASS**.

## Решение

P5 package подключён как воспроизводимый review-only input и снимает прежнее
отсутствие resource/task/policy authoring catalogs. Он не активирован. До
исправления exact mismatches, появления lifecycle/cross-system adapters,
product-owner staffing acceptance и production smoke безопасное состояние —
`runtimeEligible: false`, production pool 0 и неизменный текущий gameplay.
