# Задание программисту: интеграция P3/P4/P6/P7 authoring package

## Цель

Подключить готовые operational-каталоги к существующим P3/P4/P6/P7 runtime,
не меняя их медицинский смысл, визуальный дизайн и схему сохранений. Ничего из
медицины или поведения по названию ID не придумывать.

## Перед началом

1. Зафиксировать текущие HEAD, ветку, dirty files и отдельно сохранить пользовательские
   `art/`, `handoff/`, `medical-production-authoring/` и этот пакет.
2. Сравнить пакет с текущей интеграцией 39 семейств; не заменять более новую
   подтверждённую запись более старой.
3. Запустить сборку и валидатор пакета. Ожидается `PASS 37 checks`.
4. Не менять save schema. Если runtime требует новое сохранённое поле — остановить
   этап и сначала предложить versioned migration plan.

## P3 — исследования и направления

Импортировать:

- `generated/p3/research-catalog.json`;
- `generated/p3/investigation-usage-policy.json`;
- `generated/p3/provider-catalog.json`.

Требования:

- создать adapter к существующим `research-orders-v3` и `referral-orders-v3`;
- due time вычислять один раз при заказе и сохранять;
- привязать review/contact/shift-close к точному `usageId`;
- результат брать только из утверждённой presentation;
- неизвестный capability блокирует local route и сохраняет safe referral;
- визуальный предмет не активирует capability;
- после reload проверить ownership заказа, due time и handoff.

## P4 — владельцы, пациенты и handling

Импортировать все файлы `generated/p4/`.

Требования:

- appearance seed отделить от profile/behavior seed;
- generated presentation связывать с готовой записью `presentations[]`;
- применять explicit archetype/action IDs из crosswalk, не token matching;
- cues показывать только по threshold mutable state;
- импортировать history policy: стабильный identity, append-only campaignMinute,
  запрет движения времени назад и повторной генерации identity после reload;
- clinical truth не переносить в P4 state;
- low-stress action возвращает time/resource/effects/process result;
- при нехватке ресурса использовать `safeAlternatives`.

## P6 — экономика и репутация

Импортировать:

- `generated/p6/economy-catalog.json`;
- `generated/p6/p3-p5-resource-crosswalk.json`.

Требования:

- запускать только для новой кампании;
- все деньги проводить через ledger/obligation команды существующего P6;
- расходники списывать по фактической услуге, без отрицательного склада;
- покупка создаёт pending asset; затем delivery, training и activation;
- overdue maintenance и stockout приостанавливают capability;
- P5 IDs взять из текущего P5 каталога и записать явным adapter mapping;
- четыре reputation axes не сворачивать в один управляющий score;
- одна ошибка не закрывает клинику; closure только после recovery policy.

## P7 — кампания

Импортировать все файлы `generated/p7/` через точные catalog envelopes.

Требования:

- создать 30 дней ровно один раз, сохранить и не регенерировать после reload;
- две цели дня выбирать после сохранённого расписания;
- цели проверять только по перечисленным evidence IDs;
- не требовать появления конкретного пациента/семейства;
- соблюдать окна и repeatability 27 событий;
- на 25-й день разрешить максимум одну специализацию;
- на 30-й день записать один достижимый ending;
- endless включать только после ending;
- recovery/closure брать из явной state machine.

## Обязательные проверки интеграции

1. Авторский валидатор: 37/37.
2. Все существующие unit/syntax/content/generator проверки репозитория.
3. Browser smoke: новый старт, P3 order/result/reload, P4 low-stress, P6
   purchase-delivery-training-maintenance-stockout, P7 days 1/5/6/25/30/endless.
4. Save/reload каждого затронутого потока и reset только активного режима.
5. Seed reproducibility: один seed даёт те же day schedule, IDs и due time.
6. 10 000 runtime campaigns после adapter; отдельно сообщить распределение
   специализаций, финалов, recovery/closure и денежные percentiles.
7. Visual regression: дизайн не менялся, новые данные не ломают HUD/кабинеты.
8. `git diff --check`, список коммитов и отдельный final integration report.

## Нельзя делать

- объявлять медицинские семейства approved;
- включать generator family при `generatorEligible: false`;
- сочинять отсутствующий P5 resource ID;
- переносить token rules из сборщика в runtime;
- менять старые сохранения «по похожести»;
- скрывать доступное исследование только потому, что оно необязательно;
- превращать усталость во случайный неверный диагноз;
- менять дизайн в этом этапе.

## Критерий завершения программиста

Интеграция завершена только когда готовые records проходят runtime schema,
сохраняются/восстанавливаются, не повторяются после reload, не ломают старый режим
и имеют browser evidence. До этого `runtimeEligible` остаётся false.
