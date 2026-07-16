# Identity and Behavior V4 — открытые данные и интеграционные границы

> Обновление 2026-07-16: operational authoring candidate добавил profiles,
> temperaments, cues, history policy и explicit 645-presentation crosswalk.
> Production verdict не изменён: восемь resource IDs отсутствуют в canonical
> registry, safe alternatives потеряны во всех 446 runtime action templates,
> а first-match substring crosswalk содержит 5 owner и 183 handling conflicts
> плюс две точные лексические ошибки temperament mapping.
> См. `reports/OPERATIONAL_AUTHORING_P3_P7_PREFLIGHT.md`.

Статус: `runtime_integrated_data_catalogs_pending`.

Ниже перечислены реальные несоответствия между каноническим P4-контрактом и
текущей веткой. Они не заполнены заглушками.

## 1. Стабильные source identity

Текущая runtime-policy создаёт технические `ownerId`/`patientId` из campaign seed и
точного корня `originalVisitId || sourceVisitId || visitId`. Это сохраняет
личность в текущих повторах и не объединяет совпавшие имена.

Для полной canonical-модели нужно утвердить независимые source keys для:

- нового владельца;
- нескольких животных одного владельца;
- нескольких владельцев одного животного;
- повторного визита без курса лечения;
- импорта/сюжетного персонажа;
- объединения ранее созданных snapshots при миграции.

Старый completed repeat без `identitySourceVisitId`, `originalVisitId` и appointment mapping
остаётся отдельной сущностью. Для его слияния нет достоверного source key;
слияние по имени запрещено.

## 2. Полный каталог черт владельца

В текущем `base-profiles.json` authored profiles содержат семь коротких шкал:
`patience`, `anxiety`, `observation`, `trust`, `conflict`, `comprehension`,
`adherence`.

P4 требует двенадцать раздельных постоянных осей. Нет утверждённого crosswalk для:

- baseline anxiety против текущей visit anxiety;
- clinic trust против текущего `trust`;
- conflict tendency против текущего `conflict`;
- medical comprehension против текущего `comprehension`;
- complex-plan adherence против текущего `adherence`;
- honesty, responsibility, financial flexibility, uncertainty sensitivity и
  second-opinion tendency, которых в каталоге нет.

Ядро не копирует и не вычисляет эти поля автоматически.

## 3. Каталог темпераментов животных

В production-контенте нет утверждённых:

- temperament preset и диапазонов осей;
- совместимости со species/age/clinic history;
- начальных runtime fear/pain/arousal/handling/sampleQuality;
- правил переноса состояний между визитами.

При отсутствии authored `temperament` поле не создаётся. Это является gate, а не
пустым production preset.

## 4. Каталог низкострессовых действий

В пакете есть design list действий, но нет машинно-читаемого утверждённого
каталога с точными:

- `actionId` и UI-текстом;
- длительностью;
- требованиями к сотруднику, помещению, оборудованию и расходникам;
- абсолютными/дельта-эффектами runtime state;
- изменением доступности конкретных facts;
- условиями по temperament axes;
- безопасной альтернативой для каждого блокируемого required fact.

Ядро не содержит встроенного списка и не выбирает «осмотр в переноске»,
ассистента, обезболивание, перенос или направление самостоятельно.

## 5. Наблюдаемые сигналы renderer/DOM

Нет утверждённого cue catalog с порогами, текстами, animation IDs и приоритетом
одновременных сигналов. Ядро умеет оценить переданные rules, но не генерирует
русские фразы и не связывает внешний sprite с поведением.

Текущие authored `visibleCues` из owner profile сохраняются без потери, а первая
точная строка выводится в DOM карточки приёма. Они не содержат порогов runtime-state и
потому не заменяют отсутствующий cue-rule catalog и animation mapping.

## 6. Save/runtime integration

Интеграция в `index.html`, static/Docker inventory, `game-state-save.js`, `game.js` и DOM
завершена. Tier game save v7 имеет atomic `v6 -> v7` migration, exact backup,
rollback, fail-closed validation и compact registry `identity-v4-delta-2`. Current/legacy-v1
остаются на game save v1, Generator save остаётся v7.

Реалистичный 30-дневный save с authored profiles и тремя событиями на каждый визит
занимает 1 860 960 UTF-16 bytes. Это ниже hard limit 2 MiB, но выше preferred
1.5 MiB. Перед добавлением новых больших identity payload нужен повторный size budget.

## 7. Что намеренно не входит

- истинный диагноз, варианты диагноза и медицинские результаты;
- изменение диагноза из-за темперамента;
- новые медицинские факты или тексты;
- staff/task/room scheduling — это P5;
- экономика ресурсов — это P6;
- визуальные assets и animation production;
- связь внешности с профилем поведения.

Техническая identity/history-основа работает в Tier runtime. Поведенческие механики,
независимые multi-owner/multi-patient identity и анимации не активируются до появления
утверждённых каталогов/source keys.
