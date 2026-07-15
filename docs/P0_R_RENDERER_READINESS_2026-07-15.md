# P0-R: готовность renderer после reload

Дата: 15 июля 2026 года.

Статус: `completed`.

## Реализованное поведение

Приложение начинает запуск в состоянии `data-app-status="loading"` и показывает
непрозрачный loading veil. Игровой интерфейс остаётся `inert` для клавиатуры,
указателя и assistive technology, пока не выполнена последовательность:

1. готов generator/catalog;
2. прочитано и восстановлено mode-scoped сохранение, включая активный визит;
3. modular renderer по явному `prepare()` загружает manifest/layout и декодирует все
   обязательные изображения через `Image.decode()`;
4. выполняется полный render восстановленного состояния;
5. проходит первый paint, снимается veil, затем после следующего paint публикуются
   `data-app-status="ready"` и событие `pet-clinic-app-ready`.

Фиксированная задержка не используется. Сетевые запросы, загрузка PNG и decode имеют
15-секундную верхнюю границу. Если manifest, layout, PNG или decode
завершаются ошибкой, подготовка считается завершённой с `fallback: true`, приложение
открывается на классическом renderer и не зависает в loading state. URL всех ресурсов
art pack получает общую версию, поэтому обновление пакета не смешивает старые PNG с
новыми manifest/layout.

## Файлы и границы

- `index.html` — начальный readiness state и loading veil;
- `styles.css` — непрозрачный доступный loading state;
- `game.js` — единый bootstrap и app-level readiness signal;
- `visual/clinic-renderer-v2.js` — идемпотентный `prepare()`, decode и fallback;
- `scripts/test-renderer-readiness-v2.js` — детерминированный unit/contract test;
- `package.json` — команда `test:renderer-readiness:v2`.

Renderer остаётся read-only потребителем simulation state. Медицинские данные,
генераторная случайность, campaign seed, patient/visit IDs, layout сцены и визуальные
позиции не менялись.

## Сохранения и миграции

Save schema не менялась:

- `current` game save: v1;
- `legacy-v1` game save: v1, generator save: v1;
- `tier-01-v2` game save: v5, generator save: v6.

Новых полей в localStorage нет, миграция и backup/rollback данных не требуются.
Неизвестная версия по-прежнему блокируется без перезаписи.

## Автоматические проверки

Пройдены:

- syntax check всех tracked `*.js` и `*.mjs`;
- `validate:tier-01-content` — 44 JSON, 30 клинических файлов;
- `validate:tier-01-v2` — 56 JSON, 30 карточек, 210 вопросов, 840 ответов;
- `validate:visual-assets-v2` — 63 ресурса, 4 комнаты, 8 полос анимации;
- `test:renderer-readiness:v2` — deferred prepare, обязательный decode,
  идемпотентность, decode/load/HTTP/timeout fallback, `inert` и выключенный feature flag;
- `test:save-isolation`, `test:game-state-save`, `test:compact-save:v2`;
- `test:clinical-visit`, все clinical/diagnostic decision tests;
- adapter, follow-ups, introductory cases, campaign mechanics, longitudinal care;
- guided UI и diagnostic feedback UI;
- `git diff --check`.

## Браузерный маршрут и доказательства

Основной URL:

`http://127.0.0.1:5174/?generatorMode=tier-01-v2&visualMode=modular-v2`

Проверено во встроенном браузере:

- до reload активен `Лада · собака · самец · 2 г.`, день 1/30, 11:52;
- непосредственно после reload видны `loading`, `aria-busy="true"` и veil;
- после readiness восстановлены тот же пациент, день и время, окно приёма открыто;
- console warnings/errors отсутствуют;
- `current`, `legacy-v1` и `tier-01-v2` достигают readiness;
- выключенный `visualMode` сохраняет классический renderer;
- искусственный HTTP 404 обязательного PNG завершает bootstrap, показывает
  классическую сцену и один ожидаемый warning без page error;
- document overflow отсутствует при 1280×720, DPR 2.

Дополнительно системным Chrome получены визуальные кадры после readiness при DPR 1:

- `/tmp/vetgeme-p0r-dpr1-1440x900.png`;
- `/tmp/vetgeme-p0r-dpr1-960x720.png`.

Оба кадра показывают полный интерфейс без loading veil и без чёрных областей. Эти
временные evidence-файлы не добавляются в репозиторий.

## Rollback

Без отката кода игрок может удалить `visualMode=modular-v2` из URL и использовать
классический renderer. Полный rollback выполняется revert отдельного P0-R-коммита;
данные пользователя откатывать не требуется, потому что схема и содержимое save не
изменялись.

## Известные риски и следующий этап

P0-R закрывает только гонку reload/readiness. В P0-V остаются ранее зафиксированные
визуальные проблемы: согласование дверей и маршрутов, масштаб и z-order актёров,
дублирование пациента в правом HUD и читаемость сцены на компактном экране. Они
намеренно не смешаны с этим изменением.
