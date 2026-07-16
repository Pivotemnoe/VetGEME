# VetGEME P5 production authoring 2026.07.16.2

Авторский операционный пакет персонала, помещений, оборудования, задач,
расписания и handoff. Runtime и save schema пакет не меняет.

Содержимое:

- 10 сотрудников и покрытие всех 24 staff skills;
- 12 помещений и точный жизненный цикл каждого;
- 27 единиц оборудования;
- 49 ресурсов всего;
- 447 canonical и 8 supplemental capability mappings;
- 361 research tasks и 1 864 usage tasks;
- 13 lifecycle commands;
- начальное состояние: 5 готовых помещений, отоскоп, микроскоп, два нанятых,
  но ещё не поставленных в смену врача;
- 10 стартовых категорий расходников;
- атомарный handoff с save/reload invariants.

Авторитетные источники: `source/p5-exact-capability-resource-map.json`,
`source/p5-resource-lifecycle.json`, `source/p5-handoff-contract.json`.
`matchTokens` запрещены в runtime.

Проверка выполняется командой:

```bash
node scripts/build-p5-package.mjs
node scripts/author-v2-lifecycle-contracts.mjs
node scripts/build-p5-package.mjs
node scripts/validate-p5-package.mjs
```
