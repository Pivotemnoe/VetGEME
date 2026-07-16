# P5 `.2` engine compatibility report

Дата авторской проверки: 2026-07-16.

Пакет проверен без изменения `resource-scheduler-v5.js`:

- 49 ресурсов;
- 447 canonical + 8 supplemental capabilities;
- 2 606 runtime task-конфигураций;
- атомарный handoff и JSON save/reload;
- urgent capacity fail-closed с `safe_referral`;
- 10 000 кампаний / 300 000 demand-дней;
- 13 lifecycle commands и 7 стартовых активных физических ресурсов.

Это проверка формата и авторских контрактов, а не доказательство, что `.2` уже
подключён в live browser runtime. После адаптера обязательны новый browser smoke,
save/reload каждого lifecycle перехода, три режима reset/cancel и Docker smoke.
