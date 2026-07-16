# Campaign Director V7 — блокирующие gaps полного P7

> Обновление 2026-07-16: получен полный 30-day authoring candidate с 60 goals,
> 27 events, 6 milestones, 3 specializations и 6 endings. Direct runtime import
> остаётся закрыт: package refs не имеют обязательного digest/approved envelope,
> а exact evidence resolver к P3–P6 audit IDs не предоставлен. См.
> `reports/OPERATIONAL_AUTHORING_P3_P7_PREFLIGHT.md`.

Статус: `production_p7_blocked_catalogs_and_policies_missing`.

## 1. Результат аудита

Master package задаёт продуктовую цель P7, но не содержит утверждённого
машиночитаемого набора правил, достаточного для production-кампании.

Единственные утверждённые продуктовые числа для Campaign Director:

- 30 дней основной кампании;
- 6 глав;
- 5 дней в каждой главе.

`schemaVersion: 1` технического модуля не является campaign balance. Все другие
числа, пороги, названия, награды и примеры в `docs/CAMPAIGN_META_GOALS.md`,
handoff-аудите и system design остаются проектными предложениями. Их нельзя
переносить в runtime без отдельного утверждённого versioned catalog.

Поэтому реализован только структурный fail-closed слой. Полный production P7 не
активирован.

## 2. Отсутствующие утверждённые каталоги

| Область | Что есть | Чего нет для production |
|---|---|---|
| Структура | канон 30 дней / 6×5 | gap отсутствует только для нумерации |
| Day content/progression | структурная запись фактически пройденного дня | approved day catalog, unlocks, teaching/story policy и связи с сохранённым расписанием |
| Дневные цели | дизайн-примеры | ID, требования, источники расписания, награды, последствия, repeatability |
| События | описанные типы и примеры | approved event catalog, обязательность, окно, trigger, resolution, failure/reload policy |
| Milestones | намерение закрывать главы | approved milestone IDs, evidence rules, rewards, пропуски и повторная оценка |
| Специализация | несколько описанных направлений | approved IDs, число выборов, unlock, prerequisites, эффекты, стоимость, обратимость |
| Концовки/эпилоги | design prose и названия | approved ending catalog, точные критерии, priority, reason codes, эпилоги и локализация |
| Loss/recovery | концепция восстановления | approved триггеры, длительность, действия, выход, повторный провал и rollback policy |
| Free play | канон «после финала» | approved unlock rule, события, прогрессия, специализации и post-campaign policy |
| Оси кампании | четыре смысловых направления в GDD | отдельная campaign-axis schema, baselines, события, формулы, пороги и evidence crosswalk |

Нет production-authority и resolver, который получает из доверенного registry
catalog envelope с проверенным `catalogId`, `catalogVersion`, `digest` и approved
item IDs для этих областей. Default runtime поэтому fail closed для новых
catalog-команд.

## 3. Дневные цели и расписание

P7 требует «дневные цели из расписания», но отсутствуют:

- формальная schema цели;
- правила выбора только после создания и немедленного сохранения расписания;
- разрешённые ссылки на visit/task/resource без копирования clinical truth;
- поведение при замене, отмене, переносе или отсутствии нужного случая;
- разделение обязательной безопасности, плана клиники и необязательной
  возможности;
- стабильные reason/result IDs;
- правила начисления или отсутствия награды;
- политика повторения цели.

Без этого runtime может сослаться на отсутствующий случай или превратить
дизайн-пример в обязательную медицинскую задачу. Поэтому Campaign Director не
генерирует цели и не читает медицинский текст.

## 4. События

Master package различает обязательные, необязательные и срочные события, но
approved event catalog отсутствует. Не определены:

- trigger, доступное окно и момент persistence;
- приоритет относительно очереди и активного визита;
- repeatability и cooldown;
- обязательные capabilities/resources и безопасный fallback;
- обработка просрочки, отказа, reload и закрытия дня;
- effects на ledger, scheduler, reputation и campaign axes;
- граница между story event и клиническим случаем;
- author/review owner и локализация.

Технический core до появления repeat policy fail closed отклоняет повтор одного
`event.itemId`. Это безопасный временный предел, а не утверждённая политика
неповторяемости. До появления каталога production resolver/caller для
`event.record` отсутствует.

## 5. Milestones и главы

Core умеет закрыть главу только после точных пяти записанных дней и сохраняет
явный `milestone.record`. Он не знает:

- какие milestones обязательны для главы;
- может ли глава закрыться при невыполненном milestone;
- какой evidence считается достаточным;
- какие последствия, награды или recovery создаются;
- как объяснить игроку конкретную причину результата;
- что делать при недоступном clinical/content reference.

Структурное закрытие главы не равно продуктовому прохождению главы.

## 6. Специализация

Core до появления catalog policy fail closed разрешает не более одного
specialization record. Это не утверждённая продуктовая кардинальность. По-прежнему
не определено, разрешены ли:

- ровно одна основная специализация;
- несколько последовательных специализаций;
- изменение или отмена выбора;
- независимые улучшения внутри одной специализации;
- специализация без нужной capability, staff или room;
- последствия для demand, economics, content и ending.

Временное ограничение «не более одного» предотвращает самовольное множество
выборов, но не активирует специализацию и не доказывает, что production-модель
должна навсегда иметь ровно один выбор.

## 7. Четыре направления успеха не равны P6 reputation

Campaign design описывает:

- клиническую безопасность;
- доверие владельцев;
- финансовую устойчивость;
- состояние команды.

P6 reputation primitive хранит другие оси:

- `clinical`;
- `communication`;
- `accessibility`;
- `organization`.

Это разные домены. Нет approved crosswalk, который связывает P6 reputation,
legacy `ownerTrust`/`clinicalReliability`, economy ledger, fatigue/staff state и
четыре направления кампании.

Запрещено:

- считать P6 axes готовыми campaign axes;
- копировать значения 1:1;
- усреднять их;
- выводить финансовую устойчивость из остатка денег без каталога;
- выводить состояние команды только из fatigue;
- использовать legacy day-30 thresholds как P7 thresholds.

До отдельного campaign-axis catalog core сохраняет evidence refs, но не вычисляет
успех.

## 8. Концовки, достижимость и причины

Технический `ending.record` требует фактические ID всех 30 дней, шести закрытий
глав и существующие evidence refs. Это защищает от концовки по фиктивной истории,
но не определяет сам исход.

Отсутствуют:

- approved ending item IDs и эпилоги;
- точные требования и priority при нескольких подходящих исходах;
- минимальные/максимальные значения campaign axes;
- правила связи специализации с концовкой;
- явные reason codes хорошего, условного и плохого исхода;
- политика повторной оценки после recovery;
- reachability proof каждой концовки;
- правило, что для успеха не требуется купить всё оборудование.

Fixture ending в тесте подтверждает только gate и reload. Он не доказывает
достижимость, баланс или корректность production ending.

## 9. Loss/recovery

Package требует explicit loss/recovery rules, но ни один approved catalog их не
задаёт. Нельзя переносить в код примерные суммы, сроки или пороги из GDD.

Не утверждены:

- что именно создаёт состояние риска, loss или recovery;
- может ли клиническая небезопасность быть компенсирована деньгами;
- сколько длится recovery и что обязательно выполнить;
- какие задачи доступны и какие события временно запрещены;
- взаимодействие с долгом, зарплатами, безопасным referral route и staff;
- повторный провал и точка необратимого исхода;
- объяснимые reason IDs для игрока;
- продолжение active visit, tasks и reservations при переходе состояния.

P6 также оставил recovery-политику закрытой. Campaign Director не добавляет
автоматическое банкротство, скрытый rescue bonus или fallback recovery.

## 10. Endless/free-play

Core поддерживает последовательную запись endless day только после всех 30 дней,
6 закрытых глав и явно записанного catalog-gated ending. Ending нельзя записать
после начала endless, а post-ending catalog records должны ссылаться на уже
записанный endless day. Это технический lifecycle, не product unlock policy.

Default runtime без trusted resolver не может создать новый ending, поэтому
production остаётся заблокирован. Даже с технически записанным ending нельзя
вызывать `endless_day.record`, пока отдельно не утверждены:

- какие endings открывают free play;
- разрешён ли free play после условного или плохого исхода;
- сохраняются ли recovery restrictions;
- какие события, milestones и специализации продолжаются;
- как ведётся абсолютная дата и повторяемость контента;
- как объясняется переход игроку.

Структурная возможность хранить endless history не является активацией режима.

## 11. Legacy 4-chapter demand и outcome

Существующие demand progression и простая проверка дня 30 используют
четырёхглавую compatibility-модель. Она не соответствует канону 6×5 и не может
использоваться как P7 truth.

На P7 она остаётся неизменной, потому что её переписывание без утверждённого
balance catalog изменило бы:

- генераторную случайность;
- уже сохранённые demand snapshots;
- нагрузку и disposition избыточного спроса;
- совместимость текущей игровой петли;
- legacy outcome.

Campaign Director ведёт отдельную шестиглавую структуру. Миграция demand/outcome
в P7 требует самостоятельного утверждённого контракта и детерминированных
регрессионных тестов.

## 12. Медицинский gate и другие запрещённые политики

P7 не даёт права активировать медицинский контент. Все 39 семейств master package
остаются `source_checked_pending_veterinary_review` и
`generatorEligible: false` до P8 review.

Campaign catalogs не должны:

- содержать самодельную clinical truth;
- требовать отсутствующий или не-approved случай;
- открывать заболевание только из-за номера главы;
- считать PNG доказательством наличия capability/resource;
- выбирать, кто и когда передаёт задачу между ресурсами;
- создавать автоматические экономические или reputation события;
- менять существующую генераторную случайность.

## 13. Известные технические риски текущего примитива

1. Default runtime fail closed, но настроенный `catalogResolver` является внешней
   границей доверия. Самосозданный resolver со `status: approved` нельзя подключать
   в production.
2. Repeatability event item, product-кардинальность specialization и обязательность
   milestone не определены каталогом. Текущие запрет повтора event и максимум
   один specialization — временные fail-closed limits, не игровая политика.
3. Ending проверяет полноту структурной истории, но без campaign-axis/ending
   catalog не может проверить смысл, приоритет или достижимость.
4. Требование технического ending перед endless не равно утверждённому unlock
   после конкретного допустимого финала.
5. Evidence refs являются стабильными ID, но их типы, владение, срок жизни и
   admissibility должны быть утверждены каталогами и валидаторами интеграции.
6. Любой автоматический caller до утверждения каталогов превратит безопасный
   примитив в скрытую production-политику.
7. Design prose содержит конкретные примеры и числа, которые легко ошибочно
   принять за defaults. В код их переносить запрещено.
8. Audit replay проверяет согласованность projection/history, но не защищает от
   согласованной ручной перезаписи всего localStorage без внешней подписи.

## 14. Предпосылки для разблокировки production P7

Нужны отдельные утверждённые versioned artifacts:

1. day-goal schema и catalog, связанный только с уже сохранённым расписанием;
2. event catalog с trigger/window/repeatability/resolution/reload policy;
3. chapter milestone catalog и правила закрытия/восстановления;
4. specialization catalog с кардинальностью, prerequisites и эффектами;
5. отдельная campaign-axis schema и явный crosswalk с P6/legacy состояниями либо
   формальное решение об отсутствии такого crosswalk;
6. ending/epilogue catalog с priority, reason codes и точными критериями;
7. loss/recovery state machine без мгновенно выдуманного банкротства;
8. free-play catalog и unlock policy;
9. authority/review workflow, выпускающий digest и approved item IDs;
10. ветеринарное утверждение каждого семейства до любой campaign-ссылки на него;
11. детерминированные 30-дневные симуляции и негативные сценарии;
12. reachability proof каждой концовки и подтверждение, что ни одна не требует
    покупки всего оборудования;
13. browser/save/reload regression с active visit, generated day, P3–P6 и
    изоляцией `current`/`legacy-v1`.

Каждый artifact должен иметь владельца review, version, immutable digest,
миграционный контракт и отрицательные тесты.

## 15. Разрешённое состояние до разблокировки

До выполнения prerequisites разрешены только:

- пустой `campaignDirectorState` schema 1 в Tier save v10;
- структурные функции 30/6×5;
- явная fixture-история в pure/browser tests;
- fixture-only approved envelopes для проверки gate;
- audit replay, idempotency, atomic batch, save migration и reload;
- readiness summary без product decisions.

Не разрешены production initialization, автоматические записи, fallback catalogs,
пороговые правила, сюжетные эффекты, specialization/ending selection, recovery,
free-play activation и медицинский импорт.
