# Campaign Director V7 — техническая реализация P7

Статус: `technical_primitive_implemented_production_campaign_blocked`.

## 1. Граница этапа

P7 из master package описывает полную 30-дневную кампанию: шесть глав,
дневные цели, события, milestones, выбор развития, четыре направления успеха,
эпилоги, восстановление после плохого результата и бесконечный режим.

В утверждённом виде пакет задаёт только структурные числа:

- 30 последовательных дней кампании;
- 6 глав по 5 дней;
- после дня 30 существует отдельная нумерация бесконечного режима.

Другие числа, пороги, названия исходов и примеры из дизайн-документов не являются
машиночитаемым утверждённым каталогом. Поэтому P7 реализован как fail-closed
технический примитив. Он принимает только явно переданные стабильные ID и
проверяемые ссылки, сохраняет историю и не выбирает содержание кампании сам.

## 2. Реализованные файлы и runtime

Чистый модуль `systems/campaign-director-v7.js` экспортируется одновременно как
CommonJS API и браузерный `PET_CLINIC_CAMPAIGN_DIRECTOR_V7`.

Техническая версия состояния модуля — `schemaVersion: 1`. Это номер схемы, а не
балансовое или продуктовое значение.

Публичные структурные константы:

| Константа | Значение | Назначение |
|---|---:|---|
| `CAMPAIGN_DAY_COUNT` | 30 | последний день основной кампании |
| `CHAPTER_COUNT` | 6 | число глав основной кампании |
| `DAYS_PER_CHAPTER` | 5 | точный размер одной главы |

`mapDay()` / `mapAbsoluteDay()` возвращает только структурную позицию:

- дни 1–30: `mode: campaign`, номер главы и день внутри главы;
- дни 31 и далее: `mode: endless` и `endlessDayNumber = absoluteDayNumber - 30`.

Функция не выбирает пациента, цель, событие, сложность, награду или исход.

## 3. Состояние Campaign Director

Начальное состояние создаётся `createState()` и намеренно остаётся пустым и
неинициализированным:

- `initialized: false`;
- `campaignId: null`;
- пустые `campaignDays`, `chapterClosures` и `endlessDays`;
- пустые `events`, `milestones` и `specializations`;
- `ending: null`;
- пустая append-only replay history и индексы idempotency.

Это единственный разрешённый production default. Пустое состояние не означает,
что существуют нулевые цели, скрытая специализация, базовая концовка или
автоматически разрешённый свободный режим.

Состояние является проекцией последовательности команд. `normalizeState()`
полностью переигрывает `auditHistory` и отклоняет snapshot, если сохранённые
проекции отличаются от результата replay.

## 4. Явные команды

Campaign Director ничего не создаёт по таймеру и не выводит решения из `game.js`,
дневного ledger, спроса, репутации или медицинского случая. Изменение состояния
возможно только явной командой.

| Команда | Что фиксирует | Основные проверки |
|---|---|---|
| `campaign.initialize` | ID кампании и момент инициализации | только один раз, стабильный `campaignId` |
| `day.record` | фактически завершённый день 1–30 | строгая последовательность, предыдущая глава закрыта |
| `chapter.close` | завершение очередной главы | ровно пять уже записанных дней и точное совпадение `dayIds` |
| `endless_day.record` | очередной день после основной кампании | все 30 дней, 6 глав и ending уже записаны, нумерация без разрывов |
| `event.record` | явное событие из каталога | записанный день, trusted catalog authorization, без повтора item до approved repeat policy |
| `milestone.record` | явный milestone из каталога | записанный день, точная catalog authorization, item не повторяется |
| `specialization.record` | явный выбор/этап развития из каталога | записанный день, trusted catalog authorization, fail-closed максимум один record |
| `ending.record` | один итог кампании из каталога | вся фактическая история 30 дней/6 глав, существующие evidence refs, до endless |

Команды не могут двигаться назад по campaign time. Все record ID уникальны во
всех коллекциях одного состояния. Каждая команда содержит `campaignId`, который
сверяется с активной кампанией и входит в fingerprint; отложенная команда старой
кампании после reset отклоняется.

Ending сохраняет `finalAuditSequence`. После него новый catalog record с
`dayRef.mode: campaign` запрещён; post-campaign record должен ссылаться на уже
записанный endless day. Ending нельзя записать после начала endless history.

API также предоставляет типизированные методы `initializeCampaign()`,
`recordCampaignDay()`, `closeChapter()`, `recordEndlessDay()`, `recordEvent()`,
`recordMilestone()`, `recordSpecialization()` и `recordEnding()`.

Default runtime не имеет права авторизовать catalog-команды. Для теста или
будущего production registry отдельно создаётся
`createRuntime({ catalogResolver })`.

## 5. Идемпотентность, атомарность и reload

Каждая команда имеет `commandId`. Fingerprint строится из типа и полного
нормализованного содержимого команды без `commandId`, включая `campaignId`.

- повтор той же команды с тем же `commandId` и fingerprint идемпотентен;
- точный persisted retry распознаётся до обращения к catalog resolver и поэтому
  работает после reload без повторной внешней авторизации;
- тот же `commandId` с другим содержимым отклоняется;
- `applyCommandsAtomically()` возвращает новое состояние только после успешной
  проверки всей последовательности;
- ошибка любой операции не изменяет переданное исходное состояние;
- serialized state принимается после reload только при успешном полном audit
  replay.

Это техническая атомарность в памяти. Она не заменяет атомарную миграцию или
единственную итоговую запись браузерного save.

Audit replay обеспечивает внутреннюю согласованность projection и командной
истории. Он не является криптографической защитой от согласованной ручной
перезаписи всего localStorage; для такой угрозы потребовалась бы внешняя подпись
или HMAC.

## 6. Catalog gate

Новые команды событий, milestones, специализаций и концовки разрешены только в
runtime с настроенным trusted `catalogResolver`. Default export не содержит
resolver и fail closed отклоняет любую новую catalog-команду.

Resolver получает замороженный точный `catalogRef` команды и должен вернуть
envelope:

```text
schemaVersion
catalogKind
catalogId
catalogVersion
status = approved
digest
itemIds[]
```

Envelope должен точно совпасть с `catalogRef` команды, а `itemId` обязан
присутствовать в `itemIds`. В состоянии сохраняются только точная ссылка на
каталог, item ID, привязка к записанному дню, время и evidence refs. Полный каталог
и display/medical text в save не копируются.

Envelope не передаётся вызывающим кодом непосредственно в `applyCommand()`: его
возвращает настроенный resolver по exact ref. `status: approved` внутри
синтетического resolver не делает каталог production-утверждённым. Production
resolver обязан читать только отдельно утверждённый versioned registry и
проверять его digest. До появления такого registry production resolver
отсутствует.

Тестам разрешены только явно помеченные fixture-catalogs. Fixture подтверждает
механику gate, idempotency и reload, но не становится игровым контентом или
production default.

## 7. Запрет свободного и медицинского payload

Модуль рекурсивно отклоняет произвольные текстовые и клинические поля, включая
`payload`, `content`, `text`, `title`, `description`, `narrative`, `diagnosis`,
`symptoms`, `complaint`, `anamnesis`, `treatment`, `medication`, `dose` и
`patient`.

Campaign Director не может:

- создавать диагнозы, исследования, результаты, лечение или дозы;
- активировать медицинские семейства;
- подменять medical review статус;
- выбирать пациента для цели, события или milestone;
- создавать отсутствующий authored текст.

Все 39 семейств master package остаются за отдельным P8 review gate.

## 8. Save v10

Tier save v10 добавляет отдельное поле `campaignDirectorState`.

Интеграционный контракт:

- поле существует только внутри изолированного save режима `tier-01-v2`;
- свежая и мигрированная кампания получает валидное пустое
  `campaignDirectorState`;
- миграция v9→v10 атомарна, сохраняет backup/rollback и не меняет существующие
  P3–P6, generated day, active visit или legacy-поля;
- pre-v10 snapshot с самовольно внедрённым `campaignDirectorState` отклоняется до
  записи backup или нового save;
- неизвестная версия или повреждённое P7-состояние блокируется без перезаписи;
- в инициализированном P7-состоянии `campaignId` обязан совпадать с сохранённым
  `campaignIdentity`;
- `current` и `legacy-v1` не мигрируются и не получают это поле.

Runtime readiness может показывать только версию схемы и структурную сводку. Он
не инициализирует кампанию и не публикует каталожные команды автоматически.

## 9. Совместимость с существующей игрой

Существующий Visitor Demand Director и старый day-30 outcome используют legacy
четырёхглавую модель. Она сохраняется как совместимость работающей петли и не
считается P7 truth. Нельзя переиндексировать её balance arrays или менять
генераторную случайность под видом подключения шести глав.

Campaign Director хранит отдельную структурную 6×5 историю. Переход legacy
demand/outcome на P7 возможен только после появления утверждённых каталогов и
правил миграции.

P6 reputation содержит оси `clinical`, `communication`, `accessibility` и
`organization`. Это reputation primitive, а не автоматически четыре направления
успеха кампании. Campaign Director не копирует и не агрегирует эти значения, не
выводит из них milestones или ending и не создаёт скрытый crosswalk.

## 10. Production-поведение до утверждения каталогов

До устранения gaps из `reports/CAMPAIGN_DIRECTOR_V7_GAPS.md`:

- production state остаётся empty/uninitialized;
- нет автоматических day/event/milestone/specialization/ending/recovery команд;
- нет автоматического открытия free play;
- нет default или fallback catalog;
- нет порогов победы, поражения или восстановления;
- нет связи с медицинскими семействами, P6 reputation, demand или экономикой;
- дизайн-примеры не превращаются в machine truth.

Технический примитив готов безопасно сохранить явно утверждённые решения позже,
но полный продуктовый P7 остаётся заблокирован.

## 11. Обязательная проверка P7

Перед приёмкой P7 требуются:

1. pure-core тесты mapping 30/6×5, последовательности, закрытия глав и endless;
2. отрицательные тесты пропуска дня/главы, неверных ссылок и времени назад;
3. stale `campaignId`, reset кампании и конфликтующий persisted command;
4. отсутствие resolver, catalog mismatch, не-approved envelope, отсутствующий
   item и forbidden payload;
5. exact catalog retry после reload без resolver;
6. запрет endless до ending, ending после endless и campaign-record после ending;
7. fail-closed repeat event и вторая specialization до approved policy;
8. idempotent replay, конфликтующий `commandId` и атомарный rollback batch;
9. полный serialize/deserialize audit replay;
10. save v9→v10, rollback, повреждённого/future save и изоляции режимов;
11. browser smoke свежего empty/uninitialized production state;
12. browser fixture 30 дней, 6 глав, catalog-gated ending и один endless day;
13. reload с точным восстановлением P7 state и повторной проверкой idempotency;
14. доказательство, что generated day, active visit, P3–P6 и foreign-mode saves не
    изменились;
15. отсутствие console/network errors и обязательный screenshot affected flow;
16. `git diff --check`.

Browser fixture не подтверждает готовность production кампании. Он проверяет
только безопасное хранение и восстановление технического примитива.
Этот раздел задаёт acceptance contract и не является заявлением, что browser
smoke уже пройден.
