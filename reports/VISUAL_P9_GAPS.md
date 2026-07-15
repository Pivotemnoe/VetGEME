# P9 — состояние визуальной runtime-интеграции

Дата аудита: 15 июля 2026 года.

Статус: `p0v_v1_foundation_complete_full_state_integration_blocked`.

Этот этап не изменяет изображения, геометрию сцены или художественное направление.
После замечаний владельца проекта дальнейшая визуальная доработка заморожена; P9
фиксирует только уже доказанное поведение, автоматические проверки и точные пробелы.

## Что уже работает

- `modular-v2` остаётся opt-in feature flag; classic renderer доступен без
  миграции сохранения.
- Readiness veil снимается только после готовности renderer или явного fallback.
- Неизвестный/выключенный flag не загружает modular assets; HTTP 404 обязательного
  ресурса приводит к classic fallback.
- Schema 2 layout описывает четыре стартовые комнаты, нижние дверные проёмы,
  коридоры, 19 placements, восемь anchors и шесть route contracts.
- Микроскоп и пробирки имеют `supportId` и размещены на инструментальных тележках,
  а не непосредственно на полу.
- Врач, владельцы и животные используют анимационные полосы; receptionist в сцену
  не загружается и не размещается.
- Мебель, актёры и передние стены сортируются по глубине. Validator проверяет
  anchors, опоры, двери, проходимость маршрутов и габарит фигур в проходах.
- Canvas и DOM HUD остаются разными слоями. Canvas не выдаёт capabilities и не
  определяет клинические, финансовые или scheduler-состояния.
- Browser matrix 1920×1200, 1440×900 и 1280×720 при DPR 1/2 проходит без document
  overflow, наложения Canvas на rail/HUD и ошибок консоли.
- Один и тот же пациент сохраняется при modular → classic → modular и reload
  активного приёма; конечная consult-position совпадает с route anchor.
- В готовом состоянии shell снимает `inert`, имеет `aria-busy="false"`.
- Пять ключевых HUD-кнопок проходят точный Tab-маршрут на 1280×720, остаются
  видимыми и внутри viewport, получают `:focus-visible` и системный outline.
  Browser accessibility snapshot сохраняется как отдельное доказательство и не
  подменяется эвристикой по `title` или `textContent`.

## Что не подключено

### Runtime state view-model

Renderer сейчас получает время и актёров. Он не получает канонические P3/P5/P6
состояния комнат, оборудования, reservations, задач, assets или maintenance.
Placements остаются статической презентацией и не открывают игровые возможности.

Без утверждённых operational room IDs, resource/task mappings, capacity rules и
asset/maintenance catalog нельзя достоверно отобразить состояния:

- `locked`, `renovating`, `occupied`, `cleaning`, `offline` для комнат;
- `not_owned`, `delivered`, `busy`, `broken`, `maintenance_due`,
  `offline_no_staff` для оборудования;
- передачу задачи, очередь образцов и загрузку ресурсов.

Ordinary P5/P6 production state намеренно остаётся пустым, поэтому подставлять
демонстрационные состояния в renderer запрещено.

### Observable behavior V2

Нет утверждённого cue catalog с thresholds, приоритетами, текстом и animation IDs
для тревоги/раздражения владельца, стресса/handling животного и рабочих состояний
сотрудников. Существующий DOM показывает только уже authored owner cue; renderer
не должен самостоятельно переводить внутренние числа в медицинские или
поведенческие выводы.

### Asset aliases и будущие зоны

Manifest отделяет устойчивые asset IDs от путей, но явного alias/compatibility
mapping и validator для переименований нет. Пять будущих помещений из master plan
не размещены. Добавлять пустые aliases, фиктивные комнаты или placeholders без
утверждённых ресурсов нельзя.

### Accessibility

Для текущего статического Canvas есть общее текстовое имя, но нет текстовых
эквивалентов будущих `locked/busy/broken/offline` состояний, потому что сами
состояния ещё не подключены. Также отсутствует утверждённая reduced-motion policy:
в текущем CSS нет `prefers-reduced-motion` правила.

Keyboard smoke подтвердил маршрут `pause → speed → next patient → close shift →
settings` и видимый focus outline. При этом accessibility snapshot выявил реальный
пробел компактных HUD-кнопок: их вычисленные имена остаются символами `▶`, `1x`,
`▶`, `■`; pause и next patient могут иметь одинаковое имя `▶`. Только settings в
этом маршруте имеет однозначное имя `Открыть настройки`. Исправление не выполнялось
из-за заморозки UI; текущая проверка фиксирует ограничение и не называет его полной
доступностью. Полный screen-reader/keyboard аудит будущих динамических состояний
также остаётся отдельной работой.

### Производительность

У master package нет утверждённого performance budget, поэтому P9 не придумывает
pass/fail threshold. Последний headless Chromium audit на локальном runtime измерил:

- readiness: 707,4 мс;
- 22 modular resource entries;
- 3 600 371 байт transfer size;
- 120 frame intervals: mean 8,33 мс, p95 9,90 мс, max 10,30 мс;
- gaps больше 50 мс: 0;
- `longtask` observer поддерживается; наблюдавшиеся long tasks: 0.

Это сырые данные конкретного запуска, а не production SLA. Нужны утверждённые
границы ready-time, frame time, memory и asset budget, а также измерение на целевых
устройствах.

### Компактные размеры

Контрольный 1280×720 проходит. Дополнительный audit показал:

- 960×720: document overflow и clipping отсутствуют, но четыре HUD-кнопки имеют
  ширину 24 px;
- заявленный CSS-минимум 760×700: кнопка настроек частично обрезана справа, те же
  четыре HUD-кнопки имеют ширину 24 px;
- на 760×700 сцена формально помещается, но из-за rail и HUD становится слишком
  мелкой для уверенной читаемости.

Эти наблюдения не исправлялись, потому что владелец проекта остановил дальнейшие
изменения дизайна.

## Автоматические доказательства

Пройдены с явным browser assertion активного namespace
`pet-clinic-game-tier-01-v2` и save schema v10:

- `npm run validate:visual-assets-v2`;
- `npm run test:renderer-readiness:v2`;
- `npm run test:renderer-scene:v2`;
- `PLAYTEST_ARTIFACT_DIR=/tmp/vetgeme-p9-visual-matrix npm run test:visual-browser:v2`;
- `PLAYTEST_ARTIFACT_DIR=/tmp/vetgeme-p9-visual-audit npm run audit:visual:p9`.

Полная browser matrix сохранила доказательства во временный каталог и не
перезаписала утверждённые tracked screenshots. P9 audit дополнительно сохранил
кадры 1280×720, 960×720 и 760×700 и JSON с layout, browser accessibility tree,
точным Tab-маршрутом, save version, resource и frame measurements.

## Условия продолжения V2–V4

Нужны отдельные утверждённые входные данные:

1. operational room/resource/task mapping и capacity rules;
2. clinic asset, procurement и maintenance catalog;
3. observable cue catalog с текстовыми эквивалентами и animation mapping;
4. alias migration map для реальных переименований ресурсов;
5. performance и accessibility acceptance criteria;
6. утверждение возобновить художественные изменения сцены.

После этого full visual state integration должна выпускаться отдельно от
медицинского импорта и не менять clinical truth, generator randomness или save
schema без собственного versioned migration plan.
