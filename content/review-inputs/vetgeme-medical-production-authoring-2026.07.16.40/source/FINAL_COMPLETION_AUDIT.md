# P10 — итоговый completion и gate-аудит

Дата: 16 июля 2026 года.

Пакет: `vetgeme-medical-production-authoring`.

Версия: `2026.07.16.40`.

## Результат

| Контроль | Требование | Факт | Статус |
|---|---:|---:|---|
| Families | 39 | 39 | PASS |
| Variants | 215 | 215 | PASS |
| Presentations | 645 | 645 | PASS |
| Presentations на variant | 3 | 3 для каждого из 215 | PASS |
| Результаты исследований | 1 864 | 1 864 | PASS |
| Пустые результаты | 0 | 0 | PASS |
| Видимые игроку поля | 9 847 | 9 847 проверено | PASS |
| P0/P1 авторского и языкового gate | 0/0 | 0/0 | PASS |
| Source-review файлы | 39 | 39 | PASS |
| Manifest ↔ disk family files | точное совпадение | точное совпадение | PASS |
| Generator-eligible records | 0 до review | 0 | PASS |
| Production pool | 0 до activation manifest | 0 | PASS |
| External veterinary approval | обязательно | pending для всех уровней | BLOCKED AS DESIGNED |

Полная построчная матрица 39 семейств находится в `PROGRESS.md`, а точные
пути, версии и числа — в machine-readable `MANIFEST.json`.

## Что проверяет итоговый валидатор

- manifest содержит ровно 39 уникальных family ID и 39 уникальных путей;
- на диске нет неописанных family-файлов и отсутствующих manifest-файлов;
- 39 source-review файлов точно соответствуют 39 manifest families;
- каждый family, variant и presentation имеет версию, author/source/reviewer
  statuses и `generatorEligible: false`;
- каждый family содержит plans, sources, research mapping, history questions,
  exam actions, validation rules и безопасный referral capability;
- каждый variant содержит diagnostic truth, species, sources, plan и один из
  двух полных truth contracts;
- каждый presentation содержит species/age/campaign, urgency/workload,
  жалобу от лица владельца, анамнез, объективные находки,
  критические факты и пути их раскрытия, исследования с
  конкретным результатом, sufficiency criteria,
  equipment, safe route, care plan, follow-up, outcomes, owner communication и
  temperament compatibility;
- все capability, research, plan, source, discovery-path и requirement-group ID
  существуют и согласованы;
- каждый source имеет HTTPS URL и scope/support mapping;
- запрещены поля, позволяющие генератору создавать drug/dose/fluid/transfusion
  или treatment protocol;
- итоговые target counts равны 39/215/645 и production pool равен 0.
- ни одно из 9 847 видимых игроку полей не содержит техническую
  заглушку, редакторскую команду, английский player-facing текст,
  пустой или повторяющийся результат.

## Где находятся правильные решения

Medical truth не хранится в UI и не должна вычисляться программистом:

- `diagnosticTruth`, `primaryDiagnosisId`/`differentials` либо `exclusions` —
  диагностическая граница variant;
- `criticalFacts`, `investigations`, `dataSufficiency` — необходимые факты,
  исследования и критерии достаточности конкретной presentation;
- `planBundles.fullPlan`, `stagedPlan`, `minimumSafePlan`,
  `stabilizeAndRefer`, `unsafeOrInadequate` — допустимые и неправильные решения;
- `equipment` и `requirementGroups` — локальное оборудование, внешние маршруты
  и безопасный fallback;
- `outcomes` и `followUp` — немедленный результат и продолжение того же случая;
- `familyValidationRules` — запреты медицинских противоречий.

## Activation gate

Содержимое полностью написано и source-checked, но ещё не является независимо
ветеринарно одобренным. Поэтому:

1. reviewer проверяет family/variant/presentation без изменения устойчивых ID;
2. решение reviewer фиксируется отдельно и версионируется;
3. только approved записи могут попасть в отдельный activation manifest;
4. только после activation manifest выполняются generator smoke и save/reload;
5. текущий пакет сам по себе никогда не активирует заболевание.

Программист не является медицинским reviewer и не должен переводить `pending`
в `approved`.

## Намеренно не изменено

- engine, generator, renderer и UI;
- текущие 30 compatibility-case ID и их работающая игровая ветка;
- схема сохранений и существующие save snapshots;
- визуальная система и кабинет;
- runtime economy values;
- препараты, дозы, инфузии, переливания, анестезия, оперативные техники,
  профилактические схемы и регулируемые public-health protocols.

## Известные риски до активации

- все 39 семейств требуют независимого ветеринарного review;
- нельзя автоматически сопоставлять нынешние 30 case ID с 215 variants;
- exact cost/turnaround должны назначаться capability/economy layer без
  изменения medical truth;
- activation может потребовать versioned save migration, но текущий авторский
  этап не даёт разрешения менять save schema;
- региональные disease priors должны иметь собственную версию и не менять уже
  сохранённого пациента.

## Воспроизводимая проверка

```sh
node --check content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source/scripts/validate-medical-authoring.mjs
node content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source/scripts/validate-medical-authoring.mjs
MEDICAL_SOURCE_ROOT=content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source MEDICAL_EXPECTED_VERSION=2026.07.16.40 node p8-medical-review-authoring/scripts/audit-p8-source.mjs --require-clean
node p8-medical-review-authoring/scripts/validate-p8-display-language.mjs
node p8-medical-review-authoring/scripts/validate-human-dialogues.mjs --require-clean
git diff --check
```

Ожидаемый медицинский результат:

```text
Medical authoring validation passed: 39 family, 215 variants, 645 presentations; activation remains blocked.
```
