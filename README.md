# VetGEME / Pet Clinic

Браузерный прототип экономической ветеринарной стратегии с ручным приемом, очередью, владельцами, диагностикой, лечением и отложенными последствиями.

## Текущий статус

- рабочая стабильная пятидневная петля в режиме `current`;
- изолированная семидневная первая неделя и 30 одиночных клинических карточек в тестовом режиме `tier-01-v2`;
- два врача и смены;
- очередь, время, усталость, экономика и репутация;
- механическая ревизия и переход к детерминированному генератору клинических сценариев;
- финальная графическая детализация временно отложена.

## Запуск

```bash
python3 -m http.server 5174
```

Открыть: `http://127.0.0.1:5174/`.

## Локальный Docker

Docker-вариант отдаёт ту же статическую игру на том же origin
`http://127.0.0.1:5174/`. Это важно: `localStorage` привязан к схеме, адресу и порту;
`localhost`, другой порт или HTTPS будут отдельным хранилищем.

Собрать проверенный read-only image и запустить его:

```bash
npm run docker:build -- --no-cache
npm run docker:up
```

Проверить контейнер:

```bash
curl -fsS http://127.0.0.1:5174/healthz
npm run test:docker:http
npm run test:docker:image
PLAYWRIGHT_CHROMIUM_PATH=/absolute/path/to/chromium npm run test:docker:browser
```

Остановить локальный контейнер:

```bash
npm run docker:down
```

Сборка выполняет syntax/content/generator/system проверки до упаковки и повторяет их
в изолированной Node-стадии. Финальный непривилегированный nginx image содержит только
точный браузерный runtime; тесты, документы, `.git`, `handoff/`, отчёты, исходные
art-файлы и секреты в него не копируются. Файловая система контейнера read-only,
временная запись разрешена только в ограниченный `/tmp`.

Для browser smoke в чистом clone сначала установите ровно зафиксированные зависимости:

```bash
npm ci --ignore-scripts
```

Чистая успешная сборка получает тег `vetgeme-web:<12-символьный commit SHA>` вместе с
`vetgeme-web:local`. Сборка с незакоммиченными build-входами получает отдельный тег
`vetgeme-web:dirty-<12-символьный context SHA>` и не маскируется под commit. Для локального rollback нужно остановить контейнер и запустить
`compose.yaml` с `VETGEME_IMAGE_TAG` предыдущего проверенного тега; миграция данных не
нужна, потому что Docker не меняет browser localStorage или save schema.

Cache policy: `index.html` и неверсированные JS/JSON/PNG всегда ревалидируются;
ресурсы с `?v=...` получают immutable cache; `/healthz` не кэшируется. CSP оставляет
два узких compatibility allowance: `script-src 'unsafe-eval'` нужен замороженному
loader режима `legacy-v1` с `Function(...)`, а `style-src-attr 'unsafe-inline'` —
существующим runtime-обновлениям отдельных DOM style attributes. Inline script и
inline style elements при этом запрещены.

Будущий TLS reverse-proxy описан в `docker/staging/`, но профиль `staging` выключен,
не содержит домена или сертификатов и не является разрешением на deploy. Сервер,
домен, backend и база данных в локальный Docker-этап не входят.

## Главные документы

- `docs/GAME_DESIGN.md` — основной GDD;
- `docs/CONTENT_GENERATOR.md` — исполнимая архитектура генератора;
- `docs/OWNER_BEHAVIOR.md` — владельцы, тревога, раздражение, доверие и юмор;
- `docs/MECHANICS_BACKLOG.md` — активный порядок работы;
- `docs/DEVELOPMENT_JOURNAL.md` — журнал решений;
- `docs/MVP1_MEDICAL_SPEC.md` — текущая медицинская спецификация.

## Проверка текущей статической версии

```bash
node --check game.js
node --check campaign.js
```

## Режимы генератора

По умолчанию запускается текущий стабильный режим. Контрольные режимы доступны отдельными URL:

- `http://127.0.0.1:5174/?generatorMode=current`
- `http://127.0.0.1:5174/?generatorMode=legacy-v1`
- `http://127.0.0.1:5174/?generatorMode=tier-01-v2`

Проверки генераторов и утвержденного пакета:

```bash
npm run test:generator:legacy
npm run validate:tier-01-v2
npm run test:generator:v2
npm run test:adapter:v2
npm run test:multi-diagnosis-v2
npm run test:game-state-save
npm run test:save-isolation
npm run test:clinical-visit
npm run test:longitudinal-care:v2
```

Аудит генератора: `docs/GENERATOR_AUDIT_2026-07-12.md`. Версия и границы игрового сохранения: `docs/GAME_STATE_SAVE.md`.
