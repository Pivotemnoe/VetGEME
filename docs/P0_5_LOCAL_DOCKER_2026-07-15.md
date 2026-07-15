# P0.5 — локальный read-only Docker runtime

Дата проверки: 2026-07-15
Ветка: `codex/tier-01-v2-integration`

## Результат

Игра упакована в локальный статический Docker image и остаётся доступна на прежнем
origin `http://127.0.0.1:5174/`. Это сохраняет границу browser `localStorage`: Docker
не переносит, не мигрирует и не очищает сохранения.

Финальный nginx image:

- основан на закреплённом digest `nginxinc/nginx-unprivileged:1.28.1-alpine-slim`;
- работает как `101:101`, без дополнительных Linux capabilities и без privilege escalation;
- имеет read-only root filesystem и единственный bounded `tmpfs` `/tmp` размером 16 MiB;
- публикует только `127.0.0.1:5174 -> 8080`;
- ограничен 64 процессами, 128 MiB памяти и 0,5 CPU;
- имеет встроенный healthcheck `/healthz`;
- не выполняет directory listing и не имеет SPA fallback.

Сборка выполняется на закреплённом digest `node:22.22.0-alpine3.23`, сначала запускает
полный prebuild на хосте, затем повторяет его в изолированной build-stage. Финальный
web-root после P1 canonical-content integration состоит ровно из 143 runtime-файлов:

- 22 base/current/legacy/runtime файла;
- 56 canonical content JSON-файлов: `content/registry.json` и 55 файлов активного
  `content/packs/tier-01-v2`, реально запрашиваемых registry-aware loader;
- 65 visual runtime-файлов: manifest, layout и 63 PNG.

Для всех 143 файлов проверяется полный SHA-256 после извлечения из image; для 63 PNG
дополнительно проверяются короткие хэши production manifest. В image отсутствуют
`.git`, `node_modules`, тесты, документы, отчёты, `handoff/`, исходные art-файлы,
секреты и validator-only content. Замороженный schema-1 review root
`legacy/content/tier-01-v1-review/`, прежний `tier-01-v2/content/` и неиспользуемый
`content/packs/tier-01-v2/future/` в web-root не попадают.

## Provenance и rollback

Сборочный wrapper хэширует фактические allowlisted build-входы, включая untracked и
Git-ignored файлы, их типы и режимы. Сборка идёт во временный candidate tag; только
после повторной проверки неизменности входов candidate получает `vetgeme-web:local`
и rollback tag.

- clean tree: `vetgeme-web:<commit-SHA12>`;
- dirty build inputs: `vetgeme-web:dirty-<context-SHA12>`.

OCI labels содержат полный Git revision, полный context SHA-256 и dirty flag. Поэтому
незакоммиченная сборка не может перезаписать tag, обозначающий чистый commit. Rollback
не требует миграции: нужно остановить текущий container и запустить предыдущий
проверенный image на том же origin.

## HTTP и CSP

- `/healthz`: `200`, `no-store`;
- `index.html` и неверсированные runtime-файлы: `no-cache`;
- runtime-файлы с `?v=...`: `public, max-age=31536000, immutable`;
- gzip включён для JS/CSS/JSON;
- разрешены только `GET` и `HEAD`, остальные методы получают `405` и `Allow`;
- raw GET с телом больше 16 KiB получает `413`;
- неизвестные и чувствительные пути получают `404`, а не `index.html`;
- security headers и CSP присутствуют также на ошибочных ответах.

CSP оставляет два минимальных compatibility allowance существующего runtime:

- `script-src 'unsafe-eval'` — только из-за frozen loader `legacy-v1`, использующего
  `Function(...)`; script elements остаются `self`, script attributes запрещены;
- `style-src-attr 'unsafe-inline'` — для существующих присваиваний `element.style`;
  style elements и внешние styles ограничены `self`.

## Автоматическая проверка

Выполнены:

1. `npm ci --ignore-scripts` — установлен pinned Playwright `1.61.1`.
2. `npm run test:docker:prebuild`:
   - 61 JavaScript syntax checks;
   - 28 host registry/content/generator/save/system/renderer/provenance checks;
   - 27 тех же изолированных проверок в минимальном Node image; host-provenance test
     явно пропускается там, поскольку verifier намеренно не содержит Git;
   - 143 runtime-файла.
3. `npm run docker:build -- --no-cache --progress=plain` — host и isolated prebuild,
   затем exact static packaging.
4. `npm run docker:up` — container перешёл в `healthy`.
5. `npm run test:docker:http` — source parity всех 56 canonical content JSON,
   cache, gzip, methods, body limit, CSP, security headers и denied paths.
6. `npm run test:docker:image` — provenance, non-root, healthcheck, exact 143/143
   SHA-256, 63 manifest hashes, read-only/caps/tmpfs/resources/loopback.
7. `npm run test:docker:browser` в headless Chromium:
   - `current`;
   - `legacy-v1`;
   - `tier-01-v2`;
   - `tier-01-v2 + modular-v2`.

Во всех четырёх browser-сценариях приложение достигло readiness, reload сохранил
mode-local `localStorage`, запросы остались same-origin и только `GET`, CSP/console/
page/request errors отсутствовали. Для modular renderer подтверждены manifest, layout,
PNG requests и состояние `ready=true`, `settled=true`, `fallback=false`.

Контрольная no-cache сборка выполняется после P0.5-коммита перед push, чтобы подтвердить
чистый commit tag и повторяемость тех же HTTP/image/browser контрактов.

## Намеренно не изменено

- save schema, migration code и ключи `current` / `legacy-v1` / `tier-01-v2`;
- генераторная случайность, уже созданные дни и medical content;
- backend, API, база данных, домен, TLS и любой внешний deploy;
- production-default visual mode;
- пользовательские `art/` и `handoff/`.

Staging reverse-proxy оставлен отдельным выключенным Compose profile с placeholder
доменом и без сертификатов. Он не является deploy-конфигурацией и не запускался.

## Известные риски

- legacy compatibility пока требует `unsafe-eval`; убрать его можно только отдельной
  заменой frozen loader с повторной проверкой режима `legacy-v1`;
- runtime продолжает задавать часть style attributes из JavaScript;
- image локальный и одноузловой: здесь намеренно нет TLS, persistence volume,
  backend или server orchestration;
- при дальнейшем изменении content/runtime allowlist и счётчик 143 должны обновляться
  атомарно вместе с Docker HTTP/image/browser тестами.
