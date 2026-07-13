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
```

Аудит генератора: `docs/GENERATOR_AUDIT_2026-07-12.md`. Версия и границы игрового сохранения: `docs/GAME_STATE_SAVE.md`.
