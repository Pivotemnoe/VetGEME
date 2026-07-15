# P1: канонический реестр контента

Дата фиксации: 2026-07-15.

## Результат

У проекта теперь один активный корень медицинского пакета:

- реестр: `content/registry.json`;
- канонический пакет: `content/packs/tier-01-v2`;
- замороженная предыдущая редакция: `legacy/content/tier-01-v1-review`.

Каталог `tier-01-v2/content` больше не является источником загрузки. Файлы были
перемещены побайтово, без редактирования медицинских JSON. Старый корень
`content` также перемещён побайтово в `legacy` и остаётся только материалом для
сравнения.

Архивный `scripts/scaffold-tier-01-content.mjs` больше не может случайно создать
параллельный `content/clinical`: он пишет только в frozen legacy и требует
явного флага `--rebuild-frozen-legacy`.

## Зарегистрированная идентичность

Единственная запись реестра фиксирует:

- `contentPackId`: `tier-01-v2`;
- `contentPackVersion`: `2026.07.12.2`;
- `contentPackHash`: `b411ccf92a72f29058adda40e3a7146a00aa9fca155501da7934a4ad4b62afbd`;
- `root`: `content/packs/tier-01-v2`;
- `manifestPath`: `clinical/tier-01/manifest.json`;
- `status`: `editorial_complete_pending_medical_review`;
- `integrationStatus`: `not_connected`;
- `reviewModeAllowed`: `true`;
- `productionEligible`: `false`.

ID, версия, hash, статус и integration status должны точно совпадать с manifest.
Неизвестное значение, дублирующий ID, версия или root, несовпадение manifest и
реестра, альтернативный путь реестра или прямой root-load приводят к ошибке до
создания каталога. ID каждой загруженной карточки и каждого multi-diagnosis
bundle также обязан совпасть с записью соответствующего manifest; дубли не
превращаются в тихую перезапись через `Object.fromEntries`.

## Контракт загрузки

Браузерный и Node.js-загрузчики сначала читают `content/registry.json`, выбирают
точную пару ID/версии и только затем читают manifest и перечисленные им файлы.
Рабочий review-вызов:

```js
loader.loadFromDirectory(projectRoot, {
  packId: "tier-01-v2",
  packVersion: "2026.07.12.2",
  mode: "tier-01-v2",
  context: "review"
});
```

`context: "production"` сейчас намеренно блокируется. Для будущего снятия
блокировки одновременно нужны `productionEligible: true`, `status: "approved"`
и `integrationStatus: "connected"`, после чего manifest всё равно обязан точно
совпасть с реестром. Медицинское одобрение этим P1 не выдаётся.

Если registry или manifest отклонён, bootstrap не откатывает режим на `current`:
runtime остаётся `tier-01-v2` с `initializationError`, клиника открывается в
заблокированном состоянии, а игровые и генераторные save-ключи не записываются.

## Отчёт расхождений

Проверяемый отчёт находится в `reports/content-divergence-p1.json`. Краткий итог
`44/0/12` означает:

- 44 общих относительных пути имеют разные байты;
- 0 общих путей побайтово совпадают;
- 12 путей присутствуют только в каноническом v2;
- 0 путей присутствуют только в замороженном v1-review.

Отчёт содержит SHA-256 обеих версий каждого из 44 общих файлов и полный список
12 дополнительных файлов. Он воспроизводится командой:

```bash
npm run report:content-divergence
```

Для перезаписи зафиксированного JSON используется:

```bash
node scripts/report-content-divergence.mjs --write reports/content-divergence-p1.json
```

## Проверки

```bash
npm run validate:content-registry
npm run test:content-registry
npm run validate:tier-01-content
npm run validate:tier-01-v2
```

Первая команда проверяет реальный реестр и загрузку 30 карточек. Вторая покрывает
дубли ID/версии/root, неизвестные ID/версию/hash/status, несовпадение hash с
manifest, подмену ID карточки или bundle, альтернативный registry path, прямой
root-load и production gate. Fail-closed bootstrap отдельно проверяется командой
`npm run test:generator-mode-fail-closed` с sentinel-значениями всех пяти
game/generator save-ключей.

## Намеренно не изменено

- медицинские формулировки и JSON-байты обоих перенесённых деревьев;
- генераторная случайность и правила кампании;
- схема сохранения: tier game v5, generator save v6, compact visit schema v1;
- `generatorVersion`: `tier-01-v2.2.0`;
- выбор режима и изоляция ключей сохранения;
- пользовательские `art/` и `handoff/`.

Изменение любой схемы сохранения по-прежнему требует отдельной версии и плана
миграции.
