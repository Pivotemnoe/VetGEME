# P5 authoring contract

## Runtime resource

Поле `runtimeResourceTemplate` передаётся в `resource-scheduler-v5.createState` без медицинских данных:

```json
{
  "id": "stable.resource.id",
  "capacity": 1,
  "capabilities": ["stable.capability.id"],
  "unavailableWindows": []
}
```

Каталог содержит все потенциальные ресурсы. В runtime-state попадают только фактически нанятые/приобретённые/доставленные и готовые ресурсы. Само наличие записи или chapter unlock не означает владение.

## Runtime task

`runtimeTemplate` дополняется уникальными `id`, `queuedAt`, `fatigue`, `sourceType`, `sourceId`, `patientId` и `ownerId`:

```json
{
  "id": "stable.instance.id",
  "queuedAt": 0,
  "priority": 200,
  "authoredDurationMinutes": 15,
  "fatigue": {"percent": 0, "durationMultiplier": 1},
  "requirementGroups": [
    {
      "id": "staff",
      "anyOf": [
        {"resourceId": "staff.doctor.sokolova", "capabilityId": "task.exam", "units": 1}
      ]
    }
  ],
  "urgency": "routine",
  "safeRouteRequired": false,
  "sourceType": "research_usage",
  "sourceId": "stable.usage.id",
  "patientId": "stable.patient.id",
  "ownerId": "stable.owner.id"
}
```

`requirementGroups` соединяются по AND, альтернативы внутри `anyOf` — по OR. Навык сотрудника используется как capability того же staff-resource и не создаёт вторую бронь, когда один сотрудник обладает всеми нужными квалификациями.

## Handoff

Команда использует только поля текущего P5-контракта:

```json
{
  "commandId": "stable.command.id",
  "taskId": "stable.task.id",
  "at": 100,
  "reassignments": [
    {
      "groupId": "staff",
      "fromResourceId": "staff.doctor.sokolova",
      "toResourceId": "staff.doctor.morozov",
      "capabilityId": "task.exam",
      "units": 1
    }
  ]
}
```

Клинические результаты в handoff не передаются и не изменяются.

## Authority matrix

| Данные | Владелец | Роль P5 |
|---|---|---|
| Результат исследования | P3/medical presentation | Только планирует выполнение |
| Владение оборудованием | P6 | Создаёт доступный ресурс после подтверждения P6 |
| Расходники | P6 | Блокирует запуск при отсутствии запаса |
| Обслуживание | P6 | Получает точное unavailable window |
| Отсутствие сотрудника | P7 или решение игрока об обучении | Получает точное unavailable window |
| Усталость | P5 | Меняет длительность/доступность, не клиническую истину |
| Визуальное состояние | renderer | Только отображает сохранённое состояние |

## Compatibility

- save schema этим пакетом не меняется;
- импорт включается для новых кампаний после gate-проверок;
- существующие игровые карточки остаются доступными, пока новый источник не прошёл полный интеграционный smoke;
- неизвестный resource/capability должен завершаться fail-closed, без автоматической подстановки.
