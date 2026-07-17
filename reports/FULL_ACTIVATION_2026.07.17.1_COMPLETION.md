# Pet Clinic full activation 2026.07.17.1 — отчёт программиста

Дата: 17 июля 2026 года.

Ветка: `codex/tier-01-v2-integration`.

Исходный HEAD перед activation-slice: `e6ee42fba381d52c80197eb134900d21fd6dce7d`.

Проверенный implementation HEAD перед последней редакцией этого отчёта:
`202e356bb705b4049a29faadff4246b387977ca5`.

## Что теперь работает

- До выбора режима симуляция не создаёт пациента. Стартовое меню предлагает
  кампанию, обучение, бесконечную игру и режим тестировщика.
- Схема сохранений v11 хранит четыре режима отдельно. Новая игра удаляет только
  активный режим; отмена подтверждения не меняет сохранения.
- В кампании, обучении и бесконечной игре используются только медицинские данные
  `.40`: 39 семейств, 215 вариантов и 645 представлений. Два представления с
  динамической срочностью не получают выдуманного значения и требуют сохранённого
  состояния либо явного выбора тестировщика.
- Старые 30 карточек исключены из обычной генерации и доступны только через
  отдельный переключатель «Архивные 30 карточек» в режиме тестировщика.
- Подключены exact operational `.4`, P8 `.2`, P5 `.2`, P6 и P9. Приближённого
  crosswalk между старыми 30 ID и новой медициной нет.
- Исправлены все 15 известных P5 room predicate gaps. Локальный рентген резервирует
  кабинет визуализации, аппарат и обученного сотрудника; направление не создаёт
  локальных резерваций; послеоперационный GDV атомарно переходит из процедурной в
  краткий стационар.
- Действующая экономика подключена без изменения чисел. Покупка, доставка,
  обучение, расходники, зарплаты, поломка и обслуживание используют утверждённые
  P6-контракты. Обучение защищено от необратимого финансового проигрыша, а
  тестировщик позволяет выбрать реальную или неограниченную экономику.
- Подключены 13 новых PNG оборудования и комната персонала. Визуальный слой только
  отображает simulation state и сам не открывает ресурсы или capability.
- Видимые сообщения приведены к нормальному русскому языку; технические ID не
  выводятся. Все обязательные ответы анамнеза попадают в сводку без противоречия
  «данные собраны / данных нет».

## Коммиты activation-slice

1. `d14844036ffa51ac1a5145dfa9806c005b513720` — стартовое меню и четыре режима;
2. `0ba36f764b3cd229c71c28ab69cfc28784d53b20` — save schema v11 и изоляция;
3. `eed6c53d81c867b98a87beda7ea1db42f5a3b64e` — медицинский пул `.40`;
4. `1ca08a95641cd9d875d20c5ef1f8944cdc29976c` — P3/P4/P7 `.4` и P8 `.2`;
5. `52be32a290d61979b0d3d5b0b79f78c365e862f5` — P5 `.2` и room corrections;
6. `94fb58afecb2ecbfc6d46bb3735bee179fcc467b` — P6-экономика;
7. `808ae2e9e68314be339d5adc70a9021d77993c9b` — P9 и runtime assets;
8. `16d2a7a8f31e429cbdb86557eb03fa39cca38032` — русский player-facing текст;
9. `59619a689181a926f191ccc80575e61387826c9f` — срочность, календарь и 10 000 генераций;
10. `f2b96680fe320f56574f60406b13eabd76a21574` — полный browser/visual gate v11;
11. `00543272318fcc38523092050055bc237447db72` — Docker browser gate переведён
    со старого v10-контракта на полный v11-сценарий с CSP и same-origin контролем;
12. `8e28d3e294c37ce3fdd57e3b58e7f0f988907160` — Docker shipping inventory
    дополнен всеми девятью новыми v11 runtime-модулями;
13. `202e356bb705b4049a29faadff4246b387977ca5` — в Docker shipping добавлены
    immutable activation JSON, P5/P6/P9 contracts, economy approval и 14 новых
    runtime art assets; nginx открывает только утверждённый versioned activation
    каталог, а точный inventory расширен до 311 файлов.

Каждый коммит отправлен в `origin/codex/tier-01-v2-integration`.

## Проверки

### Author packages и точность источников

- Full activation package validator: PASS — 39/215/645, 8 уроков, 15/15 P5
  corrections, четыре режима и 14 runtime art assets.
- Medical `.40`: host test, validator и bundled validator — PASS; 85 файлов,
  39/215/645, 1 864 результата, 0 пустых результатов.
- P8 `.2`: host test, validator и bundled validator — PASS; 9 847 видимых полей,
  12 owner profiles, 15 doctor functions, P0/P1 = 0/0.
- Operational `.4`: host, adapter, validator и bundled validator — PASS; 361
  research route, 1 864 usage, 361/361 exact result authority, 64 author checks.
- P5 `.2`: host, adapter, validator и bundled validator — PASS; 49 ресурсов,
  2 606 task configurations, 13 lifecycle commands, atomic handoff/reload.
- P9 `.2`: host, adapter, crosswalk, renderer, validator и bundled validator —
  PASS; 12 комнат, 27 единиц оборудования, 10 сотрудников и 9 HUD surfaces.

Review-only метаданные исходных пакетов не переписаны. Локальная активация разрешена
отдельным утверждённым владельцем manifest `pet-clinic-local-2026.07.17.1`; она не
выдаётся за внешнюю ветеринарную сертификацию.

### Генерация, сохранения и системы

- Activation validator: PASS — exact hashes, 39/215/645, 643 обычных статических
  представления, два fail-closed dynamic urgency, 0 старых ID в обычном пуле.
- 10 000 activation-дней: PASS — 70 902 визита, все 39 семейств, 0 несовместимых
  сущностей, пустых правильных ответов, неизвестной срочности и silent fallback.
  Детерминированная случайная выборка увидела 638/643 обычных представления; все
  645 отдельно успешно открыты тестировщиком.
- Старый архивный генератор: 10 000 недель — PASS, 30/30 карточек покрыты,
  детерминированность и reload сохранены.
- Demand Director: 10 000 кампаний / 300 000 дней — PASS.
- Game modes v11, save manager v11, save isolation, atomic migration, compact save,
  game-state save и mode-only reset — PASS.
- P3/P4/P5/P6/P7 runtime, capability, referral, identity, clinical decisions,
  follow-up, longitudinal care и campaign mechanics — PASS.
- Все отслеживаемые JavaScript-файлы: `node --check` — PASS.
- Content registry, medical catalog, capability registry, tier-01 и tier-01-v2
  validators — PASS.
- `git diff --check` — PASS.
- Docker prebuild: PASS — 191 JavaScript-файл, 43 validation/test-команды и 311
  точных runtime-файлов.

### Browser и visual matrix

`test:activation-browser:v11`: PASS в системном Chrome.

- меню, новая игра, продолжение и reload всех четырёх режимов;
- отменённый reset не меняет сохранение;
- подтверждённый reset создаёт новый seed только тестировщика и не меняет кампанию,
  обучение или бесконечную игру;
- UI тестировщика перечисляет 39/215/645 и архивные 30;
- локальный/внешний рентген, GDV handoff и reload, покупка-доставка-обучение-
  обслуживание, follow-up и P8 emergency boundaries;
- 1920×1080, 1440×900, 1280×720 и 960×720: горизонтальный и вертикальный overflow
  равны нулю, поле не перекрывает rail/HUD, кнопка ресурсов не обрезана;
- browser console/page/request errors: 0.

Снимки матрицы сохранены во временной папке
`/var/folders/wq/7dkqd4xd57g3lzrf1bkjdh4m0000gn/T/vetgeme-full-activation-v11-playtest`.

Исторический `test:p3-browser` намеренно относится к прежнему v10 namespace и
останавливается на ожидаемом различии ключа `pet-clinic-game-tier-01-v2` против
`pet-clinic-game-v11:tester`. Он не используется как gate v11; его P3-сценарии и
актуальная save/reload-граница проверены activation tests и новым объединённым
browser gate.

### Docker runtime

- Первая разрешённая сборка исходного HEAD `a5dd9dc6f823d713bb79b8655278f465de0e9fe8`
  fail-closed выявила shipping-дефект: меню загружалось, но запуск кампании получал
  HTTP 404 для `ACTIVATION_MANIFEST.json`. Этот образ не принят как запускаемый
  результат и заменён отдельным исправлением `202e356`.
- Исправленный образ собран из чистого `git archive`, без пользовательских
  untracked-файлов. Build-context SHA-256:
  `a54944e0627b595fc5e82248f93798666ba23242eae1a3c9e2812dc6a3b53ec3`.
- Image validator: PASS — OCI revision и context labels точны, `BUILD_DIRTY=false`,
  311/311 файлов и SHA-256 совпадают; контейнер работает от `101:101`, rootfs
  read-only, capabilities удалены, `no-new-privileges`, лимиты CPU/RAM/PID
  соблюдены и публикация ограничена `127.0.0.1:5185`.
- HTTP/security validator: PASS — activation/economy/P5/P9/art доступны только по
  разрешённым versioned путям; review-only inputs, handoff, scripts и авторские
  каталоги возвращают 404; небезопасные HTTP-методы отклоняются.
- Docker browser smoke: PASS — четыре режима, reload, mode-only reset,
  39/215/645 + архивные 30, room reservations, atomic GDV handoff, economy,
  follow-up, P8 emergency boundaries и четыре viewport; 3 765 same-origin
  запросов, 0 CSP violations и 0 browser issues.
- Независимая видимая проверка: новая кампания открывает день 1/30, runtime имеет
  `data-app-status=ready`, горизонтальный и вертикальный overflow равны нулю,
  новая вкладка консоли содержит 0 ошибок.
- Отчёт не входит в `DOCKER_BUILD_INPUT_PATHS`. После report-only коммита образ
  пересобирается с тем же runtime-context, но с OCI revision точного итогового
  HEAD, повторно проходит image/HTTP/browser checks и остаётся запущенным.

## Независимый P0/P1-review

- P0: 0 открытых замечаний.
- P1: 0 открытых замечаний.
- HEAD совпадал с origin перед отчётом.
- В activation-slice не добавлены и не изменены пользовательские `handoff/`, ZIP,
  авторские рабочие папки и незакоммиченные материалы `art/`.
- Медицинские тексты, результаты, диагнозы и правильные ответы не редактировались;
  runtime читает точные versioned `.40` sources.
- Схема v11 имеет отдельные ключи и fail-closed dependency contract; schema v10 и
  старые 30 остаются только совместимостью/архивом.

## Намеренно не менялось и риски

- Не менялся утверждённый числовой баланс экономики.
- Не выполнялся редизайн существующей клиники и не редактировался пользовательский
  каталог `art/`.
- Локальная активация не является внешним ветеринарным одобрением или публичным
  production-релизом.
- Четыре поздних срочных представления и один менее частый срочный случай не попали
  в фиксированную случайную выборку 10 000 дней, но прошли прямое открытие в
  тестировщике, exact urgency validation и полный author validation.
- Открытых Docker-блокеров после проверки запуска кампании нет. Контейнер
  предназначен только для локального ручного тестирования на loopback-интерфейсе.
