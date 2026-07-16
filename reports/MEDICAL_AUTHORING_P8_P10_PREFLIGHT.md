# Medical authoring 2026.07.16.39 — повторный P8/P10 preflight

Дата: 16 июля 2026 года.

Вход: `vetgeme-medical-production-authoring@2026.07.16.39`.

Статус: `review_input_passed_activation_blocked_as_designed`.

## Итог

- Подключение как отдельного review-only input: **PASS**.
- P8 authoring/medical contract preflight: **PASS**.
- P8 production activation: **BLOCKED AS DESIGNED** до veterinary approval и
  отдельного activation manifest.
- P10 technical preflight для нового входа: **PASS**.
- Полная P10 production acceptance: **BLOCKED** до veterinary approval,
  activation и отдельных P3–P7 production-каталогов.

Ни одно из 39 семейств не активировано. Ветеринарный статус всех family,
variant и presentation остаётся
`external_veterinary_review_pending`, `generatorEligible` везде равен `false`,
а production pool равен 0/0/0. Действующий compatibility pool из 30 карточек не
изменён.

## Целостность нового источника

| Контроль | Результат |
|---|---|
| Архив | `medical-production-authoring-2026.07.16.39.zip` |
| SHA-256 архива | `54a6cec64406dd4e326aa5ff089cbd3878ef7cd17a4bb7ed01123c7a93da822c` |
| Sidecar checksum | совпадает |
| ZIP entries / распакованный объём | 129 / 3 194 211 bytes |
| Regular source files | 85 |
| Tracked source aggregate SHA-256 | `e3341e533e09a6f00d09180f7b78808cdf1867406492a27cd17f9dca11bc626c` |
| Path traversal / symlinks | не обнаружены |
| Точная копия archive extraction | 85/85 files, byte-for-byte |
| Authoring validator | 39 families, 215 variants, 645 presentations; activation blocked |

Пакет хранится в отдельной review-границе
`content/review-inputs/`. Его source-файлы и bundled validator сохранены без
изменений. Корневые пользовательские архив и распакованная папка остаются
untracked и не подменяются tracked-копией.

Review input намеренно не включён в `content/registry.json`, browser loader,
static runtime inventory, Docker build provenance или финальный Docker image.
Он доступен только через отдельный Node importer с явным `context: "review"`;
production context отклоняется.

## Проверенный состав

| Уровень | Всего | Versioned | Author complete | Source checked | Vet pending | Eligible | Approved |
|---|---:|---:|---:|---:|---:|---:|---:|
| Families | 39 | 39 | 39 | 39 | 39 | 0 | 0 |
| Variants | 215 | 215 | 215 | 215 | 215 | 0 | 0 |
| Presentations | 645 | 645 | 645 | 645 | 645 | 0 | 0 |

Дополнительно проверено:

- 361 уникальный research mapping, включая все 354 research ID прежнего
  master review index; старых непокрытых ID — 0;
- 1 864 investigation entries разрешаются через exact family research maps;
- 388 уникальных capability refs суммарно; 387 operational refs и 102
  `coreCapabilities` существуют в текущем registry из 447 capabilities;
- 337 family-scoped requirement groups;
- 645 equipment contracts и безопасный маршрут для каждой presentation;
- 645 contracts для campaign availability, urgency, workload, follow-up,
  outcomes, owner communication и compatibility;
- 215 variant refs и 645 composite presentation refs продолжают прежний
  39-family review namespace; это не сопоставление с 30 игровыми case ID.

## Прежние блокеры, снятые authoring package

| Прежний P8/P10 блокер | Новый результат |
|---|---|
| У 215 variants не было собственных version/status/eligibility | Снят: все 215 имеют version, три review-status и `generatorEligible: false`. |
| 645 presentations были только строковыми ID | Снят: все 645 являются полными versioned objects с собственным review gate. |
| Clinical truth находилась только в Markdown | Снят на authoring-уровне: JSON содержит diagnostic truth, discovery paths, investigations с authored result state, sufficiency, plans, equipment, follow-up и outcomes. |
| 352 из 354 research ID не имели exact mapping | Снят на medical-input уровне: все прежние 354 входят в 361 новый mapping. |
| 39 внутренних конфликтов `coreCapabilities` | Снят для нового input: `family.production.json` является единственной authoring truth, и все его capability ID валидны. Историческая review-копия не переписана и не merge-ится автоматически. |
| Source-расхождение FeLV в исторической копии | Снято для нового input его собственным versioned `sourceCatalog`; старые файлы задним числом не исправлены. |
| Не было structured equipment/safe-referral contract | Снят на medical-input уровне: 645 equipment contracts, 337 requirement groups и safe route для всех presentations. |
| Неоднозначность chapter availability 37–38 | Частично снята: family и presentation availability описаны; состав будущего activation batch всё ещё задаётся отдельным manifest. |

Эти пункты означают, что прежний **authoring structural gap** и medical-side
research/capability mapping gap закрыты. Они не означают veterinary correctness
или разрешение на production consumption.

## Блокеры до veterinary approval и activation

1. Все 39 families, 215 variants и 645 presentations остаются veterinary
   `pending`; approved элементов нет.
2. `MANIFEST.json` является authoring manifest со status blocked, а не
   activation manifest.
3. Production pool обязан оставаться 0 до отдельного activation manifest,
   перечисляющего точные approved versions.
4. Crosswalk с нынешними 30 case ID намеренно отсутствует. Importer отклоняет
   structured crosswalk fields/artifacts и ничего не выводит из похожих жалоб,
   диагнозов или ID; отдельный isolation test ищет все 30 case ID во всех 85
   source-файлах.
5. До activation нужно отдельное решение: approved новый namespace либо явно
   написанный reviewer-owned crosswalk. Для review-only preflight отсутствие
   crosswalk не является ошибкой.
6. Возможная save migration определяется только будущим activation contract;
   текущая задача не меняет save schema и не создаёт master refs в saves.

## Что ещё требуют отдельные P3–P7 production-каталоги

| Этап | Что новый medical input уже даёт | Что всё ещё требует отдельного approved production authority |
|---|---|---|
| P3 | Exact research/capability maps, authored investigation result states, equipment requirements и safe routes | Criticality/contact policy, exact due-time/turnaround, provider/outcome policy, external scheduling, cost и queue policy. Canonical activation flag поэтому остаётся false. |
| P4 | 645 compatibility и owner-communication contracts; 514 явных handling alternatives | Approved identity/behavior/temperament/low-stress/cue/source catalog и его runtime binding. |
| P5 | Equipment, 337 requirement groups и workload для 645 presentations | Production staff/room/task/duration/capacity/reservation/policy catalog. |
| P6 | Medical necessity и referral boundary без цены | Approved balance, reputation, cost, consumables, inventory, assets, maintenance и recovery catalogs/mappings. |
| P7 | Campaign availability, urgency и workload для каждой presentation | Approved goals, events, specializations, endings, recovery и campaign-axis catalogs/mappings. |

Следовательно, production 30-day economy/campaign simulation и полная P9 state
visualization всё ещё невозможны: pool равен 0, а соответствующие P6/P7 и
operational view-model inputs не утверждены и не подключены. Design freeze этой
задачей не снят.

## Обновление после operational authoring input 2026.07.16.1

Отдельный review-only operational input теперь предоставляет P3/P4/P6/P7
authoring candidates, перечисленные выше как отсутствовавшие. Это снимает
прежний блокер «каталогов вообще нет», но не меняет activation verdict:

- все operational catalogs имеют `runtimeEligible: false`;
- 32 P3 provider routes требуют авторской перепроверки;
- P4 содержит восемь неизвестных resource capability и теряет structured safe
  alternatives в 446 runtime templates;
- P4 first-match substring crosswalk имеет 5 owner и 183 handling ambiguities,
  две точные лексические ошибки и один отдельный contextual risk;
- P6 не содержит authoritative P5 resource IDs и не прошёл balance acceptance;
- P7 не содержит approved digest envelopes или evidence resolver;
- medical 39/215/645 по-прежнему veterinary pending.

Полный результат: `reports/OPERATIONAL_AUTHORING_P3_P7_PREFLIGHT.md`.

## Намеренно не изменено

- медицинские тексты и данные source package;
- ветеринарные статусы и eligibility;
- действующие 30 case ID, generator randomness и compatibility namespace;
- save schema и существующие snapshots;
- `current` и `legacy-v1`;
- clinical UI, renderer, clinic visual и пользовательский `art/`;
- пользовательские `handoff/`, исходный ZIP и распакованная source-папка;
- source operational authoring package P3–P7 (tracked только как неизменяемая
  review-копия, без runtime activation);
- автоматические medical mappings и crosswalk.

## Выполненные проверки

- `node --check` для importer, provenance, bundled-validator wrapper, validator
  и отрицательных тестов — **PASS**.
- `node scripts/refresh-medical-authoring-review-provenance.mjs --compare-source`
  — **PASS**: SHA архива и sidecar, 129 ZIP entries, безопасные типы/пути,
  85/85 прямых `unzip -p` сравнений, 3 194 211 bytes.
- `npm run validate:medical-authoring-review-provenance` — **PASS**.
- `npm run validate:medical-authoring-review` — **PASS**: immutable bundled
  validator запущен в воспроизводимом temp layout, затем пройден repo-level
  fail-closed contract.
- `npm run test:medical-authoring-review` — **PASS**: default/production context,
  digest/bytes/status/eligibility/pool/capability/count/path/file-set tampering,
  symlink ancestor, structured crosswalk и дополнительный review-input kind
  проверены отрицательными сценариями; все 85 файлов проверены против текущих
  30 case ID.
- `npm run validate:medical-source-v2`,
  `npm run validate:medical-catalog:v2`,
  `npm run test:medical-catalog:v2`,
  `npm run validate:content-registry`,
  `npm run validate:capability-registry:v3`,
  `npm run test:generator-mode-fail-closed` и
  `npm run test:generator:v2` — **PASS**; generator покрывает прежние 30 cases.
- `npm run test:docker:prebuild` — **PASS**: 101 syntax files, 42
  validation/test commands, 201 runtime files.
- `npm run build:static-dist -- --output /tmp/vetgeme-medical-review-dist` —
  **PASS**: 201 files/hashes; `content/review-inputs/` отсутствует.
- Изолированные `docker:build`, `test:docker:http` и `test:docker:image` —
  **PASS**: 201/201 runtime hashes, 63/63 asset hashes, оба review-only HTTP
  пути возвращают 404, non-root/read-only hardening сохранён. Пользовательские
  контейнеры на 5174/5176 не перезапускались.
- `test:docker:browser` на отдельном `127.0.0.1:5177` — **PASS** для current,
  legacy-v1, tier-01-v2 и modular: initial/reload ready, browser issues и CSP
  violations отсутствуют, review input requests = 0; tier modes сохраняют
  30 cases и pool 0/0/0 до и после reload.
- Четыре browser screenshots просмотрены. Новых ошибок, связанных с medical
  input, не найдено; существующая визуальная композиция и ранее замороженные
  P9-ограничения намеренно не исправлялись.
- Независимый adversarial re-review — **PASS**, существенных или блокирующих
  замечаний после усиления archive/symlink/crosswalk/registry gates нет.
- `git diff --check` — **PASS**.

## Вывод P8/P10

Новый authoring package теперь является проверяемым, versioned и fail-closed
review input. Он снимает структурные блокеры авторинга, но не меняет общий
production verdict: veterinary approval, activation manifest и отдельные P3–P7
production authorities всё ещё обязательны. До их появления безопасный и
ожидаемый результат — production pool 0 и неизменная работа нынешних 30 карточек.
