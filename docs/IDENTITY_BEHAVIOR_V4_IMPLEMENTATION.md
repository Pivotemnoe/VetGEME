# Identity and Behavior V4 — core and Tier runtime

Статус: `runtime_integrated_authored_catalogs_gated`.

Источник контракта: пакет `vetgeme-master-package-2026-07-14`, раздел
`systems/02_OWNERS_ANIMALS_AND_STAFF.md`, цель P4. Модуль не добавляет
медицинский контент и не подключает отсутствующие каталоги данных.

## Граница реализации

`systems/identity-behavior-v4.js` — чистый UMD/CommonJS-модуль, а
`systems/identity-runtime-v4.js` — адаптер текущего Tier-runtime. Вместе они:

- создаёт стабильные `ownerId` и `patientId` только из явно переданных
  `campaignIdentity` и `sourceIdentity`;
- хранит постоянный профиль, текущее состояние, внешность и историю в разных
  полях;
- не использует внешность при расчёте идентичности, поведения или сигналов;
- принимает черты владельца и темперамент животного только как authored data;
- применяет только полностью описанные низкострессовые действия;
- позволяет темпераменту менять время, доступность факта и процессные состояния,
  включая качество образца;
- не принимает и не возвращает канал клинической истины;
- запрещает оставить обязательный недоступный факт без явно описанного
  безопасного альтернативного пути;
- возвращает новые JSON-совместимые структуры и не мутирует входные значения.

Адаптер загружается браузером до `game-state-save.js` и `game.js`, но активен
только в `tier-01-v2`. Он не меняет Generator save и уже созданные дни.
Низкострессовые действия, temperament и threshold-cues остаются fail-closed,
пока нет утверждённых машиночитаемых каталогов.

## Схема идентичности

Вход создания владельца или пациента обязан содержать:

```js
{
  campaignIdentity: "явный стабильный ключ кампании",
  sourceIdentity: "явный стабильный ключ персонажа в источнике",
  persistentProfile: {}
}
```

Опционально передаются `currentState`, `appearance` и `history`. Отсутствующие
поведенческие значения не рассчитываются. Технические пустые контейнеры
`currentState` и `history` создаются как `{}` и `[]`; профиль темперамента,
внешность и конкретные шкалы не появляются без authored input.

Результат владельца:

```js
{
  schemaVersion: 1,
  entityType: "owner",
  ownerId: "OWN-...",
  identity: { campaignIdentity, sourceIdentity },
  persistentProfile: { /* authored owner profile */ },
  currentState: { /* authored runtime values */ },
  appearance: { /* optional authored renderer data */ },
  history: []
}
```

Для пациента структура аналогична и использует `entityType: "patient"` и
`patientId`. Точный authored возраст текущего пациента переносится отдельным
optional `persistentProfile.ageYears`; значение должно быть конечным и
неотрицательным, дефолт не создаётся.

ID — детерминированный 64-битный технический fingerprint с разными namespace для
владельца и пациента. Профиль, внешность, имя и текущее состояние не участвуют
в вычислении ID. Повтор с той же парой `campaignIdentity/sourceIdentity` получает
тот же ID. Интегратор обязан обеспечить уникальность `sourceIdentity` внутри
кампании и проверять конфликт двух разных source identity в реестре сущностей.

## Постоянные и текущие данные

Все процессные шкалы нормализованы в диапазоне `0..100`, совместимом с текущими
owner profiles. Значение должно быть передано явно.

Канонические ключи постоянных черт владельца:

- `patience`;
- `baselineAnxiety`;
- `observation`;
- `clinicTrust`;
- `conflictTendency`;
- `medicalComprehension`;
- `honesty`;
- `responsibility`;
- `financialFlexibility`;
- `uncertaintySensitivity`;
- `secondOpinionTendency`;
- `complexPlanAdherence`.

Текущие состояния владельца:

- `irritation`, `anxiety`, `trust`, `understanding`;
- `costConsent`, `homeTreatmentDisclosure`, `satisfaction`;
- `adherenceIntent`, `leaveRisk`, `noShowRisk`.

Канонические оси темперамента:

- `boldness`, `excitability`, `sociability`, `touchSensitivity`;
- `defensiveBehavior`, `restraintTolerance`, `stressRecovery`;
- `familiarStaffTrust`, `otherAnimalReactivity`.

Текущие состояния животного:

- `fear`, `pain`, `arousal`, `defensiveAggression`;
- `handlingTolerance`, `staffTrust`, `fatigue`;
- `physiologicalStability`, `sampleQuality`.

Короткие поля действующего Tier 01 (`anxiety`, `trust`, `conflict`,
`comprehension`, `adherence`) не преобразуются автоматически в новые постоянные
оси. Для этого нужен утверждённый data crosswalk, иначе переименование создало бы
неподтверждённую семантику.

`persistentProfile.visibleCues` владельца — optional массив authored строк. Он
копируется дословно, не выводится из traits и не заменяет runtime cue rules.

## Реестр кампании

`createIdentityRegistry` создаёт минимальную сериализуемую структуру:

```js
{
  schemaVersion: 1,
  campaignIdentity: "authored-campaign-key",
  owners: { "OWN-...": ownerRecord },
  patients: { "PAT-...": patientRecord }
}
```

Пустые `owners`/`patients` допустимы, но helper не создаёт профили или персонажей.
`validateIdentityRegistry` проверяет:

- ключ каждого элемента равен его `ownerId`/`patientId`;
- identity record валиден и относится к той же `campaignIdentity`;
- каждый `relatedPatientIds` у владельца указывает на существующего пациента;
- каждый `ownerIds` у пациента указывает на существующего владельца;
- обе стороны каждой связи содержат друг друга.

## История и повторный визит

`appendHistory(record, event)` принимает только явное событие:

```js
{
  eventId: "стабильный idempotency key",
  at: 1540,
  type: "authored_event_type",
  sourceVisitId: "optional-authored-visit-id",
  payload: { /* optional authored JSON */ }
}
```

`at` — абсолютная неотрицательная минута кампании. Время не может идти назад.
Повторное применение идентичного `eventId` идемпотентно; другой payload под тем
же ID отклоняется. `updateCurrentState` сохраняет ID, постоянный профиль,
внешность и предшествующую историю, меняя только явно переданные runtime-поля.

В Tier runtime корнем личности считается точный
`originalVisitId || sourceVisitId || visitId`. Повтор с таким корнем получает те же
постоянные ID. Объединение по имени запрещено. Старые journal-строки без
любой корневой ссылки безопасно объединить нельзя.

Исторический визит хранит свой snapshot. Новое состояние повтора не переписывает
его. В registry отдельно хранится актуальное current state.

## Runtime и сохранение

P4 ввёл Tier game save версии 7 (текущая версия после P5 — 8). Миграция `v6 -> v7`:

- делает побайтовый atomic backup до записи candidate;
- не меняет ни одно существовавшее поле активного state;
- создаёт registry и ссылки из точных legacy-данных;
- валидирует campaign identity, reciprocal links, snapshots и cross-references;
- на любой ошибке оставляет primary save побайтово прежним.

В localStorage registry хранится в формате `identity-v4-delta-2`: стабильные ID и
деривативные snapshots восстанавливаются, а точные profile/state/appearance/history
отличия сохраняются компактными delta. Развёрнутый registry в raw save не дублируется.
Малформация или future version компактного registry отклоняется fail-closed.

Браузерный runtime пишет идемпотентную историю arrival/open/completion, отдаёт стабильные
ID в DOM `data-*` и показывает первую точную authored `visibleCue`. Новые фразы,
temperament или анимации не выводятся.

## Наблюдаемые сигналы

`evaluateObservableCues` получает только runtime-state и массив authored rules.
Встроенных фраз, анимаций и порогов нет.

```js
{
  ownerState: { anxiety: 80 },
  patientState: { fear: 65 },
  rules: [{
    ruleId: "catalog-rule-id",
    entity: "owner",
    when: { field: "anxiety", operator: "gte", value: 70 },
    cue: {
      cueId: "catalog-cue-id",
      text: "authored text",
      animationId: "authored-animation-id"
    }
  }]
}
```

Поддержаны `lt`, `lte`, `eq`, `gte`, `gt`. Renderer получает только совпавшие
authored cues вместе с их `ruleId`; внешность и профиль в функцию не передаются.

## Низкострессовые действия

Действие считается полным только при явном указании:

- `actionId`;
- `timeMinutes`, включая явный `0`;
- `resourceRequirements`, включая явный пустой массив;
- `effects.stateSet`, `effects.stateDeltas`, `effects.factAvailability`;
- `safeAlternatives`, включая явный пустой массив;
- `temperamentRules`, включая явный пустой массив.

Это не позволяет runtime подставить «1 минуту», нулевую цену, ассистента,
направление или изменение поведения по умолчанию.

`stateSet` задаёт явно authored абсолютное состояние. `stateDeltas` применимы
только к уже существующему authored runtime-значению; отсутствующая база не
принимается за ноль. Результат ограничивается диапазоном `0..100`.

Каждое правило темперамента содержит собственные:

- условие по одной authored оси;
- `timeDeltaMinutes`;
- `resourceRequirements`;
- process effects;
- `safeAlternatives`.

Правило не срабатывает, если ось темперамента отсутствует. Случайного выбора и
скрытого preset нет.

`factAccess` имеет форму:

```js
[
  {
    factId: "authored-fact-id",
    required: true,
    available: false,
    safeAlternative: {
      factId: "authored-fact-id",
      alternativeId: "authored-alternative-id",
      kind: "authored-kind",
      payload: { /* authored route data */ }
    }
  }
]
```

Действие может менять доступность только уже переданного факта. Если после всех
явных эффектов обязательный факт недоступен, безопасная альтернатива должна быть
передана в самом факте, действии или сработавшем temperament rule. Иначе операция
завершается ошибкой без частичного результата.

Поля `diagnosis`, `diagnosisId`, `diagnosisTruth`, `trueDiagnosis`,
`medicalTruth`, `clinicalTruth`, `disease` и их ID-варианты запрещены в action,
cue и process-result contract. Модуль не знает клинический диагноз и не может его
изменить.

## Публичный API

- `stableIdentityId`;
- `createOwnerIdentity`, `createPatientIdentity`;
- `createIdentityRegistry`, `validateIdentityRegistry`;
- `validateIdentityRecord`, `validateOwnerIdentity`, `validatePatientIdentity`;
- `appendHistory`, `updateCurrentState`;
- `evaluateObservableCues`;
- `validateLowStressAction`, `validateRequiredFactPaths`;
- `applyLowStressAction`, `evaluateLowStressActions`.

## Проверка

```bash
node --check systems/identity-behavior-v4.js
node --check systems/identity-runtime-v4.js
node --check scripts/test-identity-behavior-v4.js
node scripts/test-identity-behavior-v4.js
node scripts/test-identity-runtime-v4.js
node scripts/test-game-state-save.js
node scripts/test-compact-save-v2.js
npm run test:p4-browser
```

Тест фиксирует many-to-many связь внешности и профиля, отсутствие diagnosis
channel, обязательность safe alternative, сохранение ID/истории на повторе,
детермированный process effect, миграцию/rollback, исторические snapshots,
компактный 30-дневный save, browser reload и отсутствие любых
действий/темперамента/cues без authored input. Реалистичный 30-дневный fixture со всеми
профилями и тремя visit events на приём занимает 1 860 960 UTF-16 bytes:
ниже жёсткого лимита 2 MiB, но выше предпочтительных 1.5 MiB.
