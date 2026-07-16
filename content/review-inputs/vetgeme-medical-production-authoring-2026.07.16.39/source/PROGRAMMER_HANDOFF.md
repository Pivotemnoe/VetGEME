# Handoff программисту — medical production package 2026.07.16.39

## Цель интеграции

Подключить готовую медицинскую базу поэтапно, не создавая медицинских связей,
решений или текстов в коде. Пакет пока review-only: его можно импортировать,
валидировать и показывать в служебном tooling, но нельзя включать в production
generator до внешнего ветеринарного approval и отдельного activation manifest.

## Авторитетные файлы

1. `MANIFEST.json` — точный состав, версии, статусы и counts.
2. `families/*/family.production.json` — единственная медицинская истина.
3. `review/*-source-review.md` — границы source-check и неутверждённые области.
4. `schemas/clinical-family-production-contract.md` — общий контракт.
5. `scripts/validate-medical-authoring.mjs` — обязательный fail-closed gate.

Если код, старые 30 карточек или UI-текст противоречат family-файлу, нельзя
решать противоречие «по смыслу»: остановить импорт конкретной записи и оформить
точный mismatch.

## Жёсткие запреты

- не сопоставлять автоматически 30 нынешних case ID с 215 variants;
- не объединять разные variants/presentations из-за похожих жалоб;
- не создавать диагноз, результат исследования, правильное решение,
  оборудование, противопоказание или outcome в коде;
- не переводить review status в `approved`;
- не включать запись при `generatorEligible: false`;
- не превращать optional test в скрытый/недоступный: последствия несут cost,
  time, owner refusal и trust, а не удаление действия;
- не выдавать внешний результат мгновенно;
- не заменять отсутствующее оборудование ложным локальным результатом;
- не менять save schema без новой версии и migration plan;
- не генерировать drugs, doses, fluids, transfusions, anesthesia, surgery,
  prevention или regulated public-health protocols.

## Контракт импорта

- ID и version сохраняются без переименования.
- Generated visit немедленно получает immutable medical snapshot.
- Уже созданный день не регенерируется после обновления family или region data.
- Arrays не merge-ятся молча; presentation data остаются presentation data.
- Variant truth contract допускает две явно валидируемые формы:
  `primaryDiagnosisId+differentials` либо `exclusions`; программист их не
  конвертирует друг в друга.
- `carePlanId`, research IDs, capabilities, discovery paths и requirement-group
  IDs разрешаются только по точному совпадению.
- `result: null` означает authored state «исследование в этой presentation не
  выполнено/не даёт результата», а не разрешение сгенерировать значение.
- `safeRouteCapability` family является общим безопасным fallback; более узкие
  `missingLocalRoute`/`referralFallback` presentation имеют приоритет.
- Owner appearance не влияет на medical truth; temperament влияет только на
  доступный способ выполнения уже разрешённого действия.

## Поэтапное внедрение

### P0 — preflight без runtime-изменений

1. Распаковать архив в отдельную ветку.
2. Проверить checksum и `MANIFEST.json`.
3. Запустить authoring validator.
4. Зафиксировать текущую ветку, commits, незакоммиченные изменения и existing
   30-case compatibility namespace.
5. Не менять визуал, save schema и production generator.

### P1 — read-only importer

1. Добавить parser для manifest/family contracts.
2. Fail closed на неизвестном ID, capability, version или status.
3. Показать counts 39/215/645 и production pool 0 в debug/audit output.
4. Повторно запустить validator; gameplay не должен измениться.

### P2 — capability и economy binding

1. Связать только точные capability IDs с существующим registry.
2. Capability/economy layer назначает цену, turnaround, очередь, расходники и
   доступность оборудования; medical file определяет необходимость и fallback.
3. Любой отсутствующий capability ведёт в authored safe referral.
4. Цена или отказ владельца не переписывают clinical truth.

### P3 — staged family integration

1. Подключать по одному family или маленькому согласованному batch.
2. После каждого batch: syntax, content validation, generator smoke, browser
   flow, deterministic seed, save/reload и `git diff --check`.
3. Проверять полный путь: complaint → history/exam → investigation/time →
   sufficiency → safe/unsafe decision → follow-up/outcome.
4. Сохранять текущего пациента и day seed без silent regeneration.

### P4 — veterinary review import

1. Reviewer принимает/отклоняет точную version на family, variant и
   presentation уровнях.
2. Исправление medical truth повышает version и проходит повторный source/gate
   audit.
3. Программист импортирует reviewer decisions как данные, не как ручной код.

### P5 — activation

1. Выпустить отдельный activation manifest только для approved versions.
2. Повторно проверить capability/economy bindings и safe referrals.
3. Если требуется save migration — сначала утвердить новую save version и
   миграционный тест.
4. Только затем ненулевой approved pool допускается в generator.

## Definition of done одного batch

- exact versions перечислены;
- reviewer gate не обойдён;
- capability IDs разрешены или ведут в safe referral;
- исследования имеют authored result state и корректный turnaround;
- правильные/неправильные решения и outcomes пришли из данных;
- seed воспроизводим;
- generated day persisted immediately;
- save/reload сохраняет тот же patient/case snapshot;
- UI не раскрывает диагноз до discovery path;
- syntax/content/generator/browser/diff checks прошли;
- completion report перечисляет changed, checked, intentionally unchanged и
  known risks.
