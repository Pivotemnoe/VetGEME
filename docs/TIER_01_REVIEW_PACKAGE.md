# Tier 01 Review Package

Этот список предназначен для передачи пакета в отдельный ChatGPT-чат или ветеринарному редактору. Ничего из перечисленного пока не подключено к работающей игре.

## 1. Сначала передать основные документы

1. `TIER_01_EXPANDED_CONTENT_TASK.md` — исходное задание без сокращений.
2. `TIER_01_CONTENT_RULES.md` — правила источников и безопасности.
3. `TIER_01_CASE_CATALOG.md` — полный список 30 карточек.
4. `TIER_01_SEVEN_DAY_PLAN.md` — план семи дней.
5. `TIER_01_IMPLEMENTATION_STATUS.md` — что сделано и что намеренно не подключено.
6. `reports/tier-01-validation.json` — результат автоматической проверки.

## 2. Передать manifest и общие справочники

- `content/clinical/tier-01/manifest.json`;
- `content/owners/tier-01/base-profiles.json`;
- `content/owners/tier-01/modifiers.json`;
- `content/owners/tier-01/home-treatment-actions.json`;
- `content/ui/clinical-labels.json`;
- `content/ui/tutorial-texts.json`;
- `content/campaign/tier-01/seven-day-plan.json`;
- `content/campaign/tier-01/day-goals.json`;
- `content/campaign/tier-01/doctor-shifts.json`.

## 3. Минимум по одному клиническому файлу каждого семейства

- ухо: `content/clinical/tier-01/ear/fungal-otitis.json`;
- кожа: `content/clinical/tier-01/skin/grooming-irritation.json`;
- ЖКТ: `content/clinical/tier-01/gastrointestinal/dietary-indiscretion.json`;
- мочеиспускание: `content/clinical/tier-01/urinary/feline-urethral-obstruction.json`;
- глаза: `content/clinical/tier-01/eyes/corneal-ulcer.json`;
- дыхание: `content/clinical/tier-01/respiratory/canine-infectious-cough.json`;
- параанальные железы: `content/clinical/tier-01/perianal/anal-gland-impaction.json`;
- травмы: `content/clinical/tier-01/trauma/suspected-fracture.json`.

В этих файлах проверяются жалобы, вопросы, четыре типа ответов, данные осмотра, исследование, предварительные варианты, планы, красные флаги и источники каждой строки.

## 4. Для полной проверки

Передать всю папку `content/clinical/tier-01/`. Полный перечень и относительные пути находятся в `manifest.json`; загрузка всех 30 файлов нужна для проверки повторов, терминологии, совместимости и различий между похожими состояниями.

Также передать все файлы из `content/owners/tier-01/`, чтобы проверить юмор, отказы, бюджет, тревогу, домашние действия и повторные обращения.

## 5. Вопросы проверяющему

1. Не раскрывает ли анамнез данные, которые можно получить только осмотром или исследованием?
2. Не появляется ли готовый диагноз до обязательных действий?
3. Корректны ли красные флаги и безопасная маршрутизация срочных случаев?
4. Достаточно ли конкретны жалобы, вопросы и ответы владельца?
5. Нет ли неутвержденных или устаревших медицинских формулировок?
6. Не является ли юмористическая реплика единственным источником важного факта?
7. Имеет ли каждый план срок контроля и признаки досрочного обращения?

## 6. Команда повторной проверки

```bash
npm run validate:tier-01-content
```
