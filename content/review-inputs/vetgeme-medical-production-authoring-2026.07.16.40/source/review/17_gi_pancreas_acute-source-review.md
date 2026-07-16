# Source review — `gi_pancreas_acute`

Дата проверки: 15 июля 2026 года.

Авторский статус: `author_complete`.

Source status: `source_checked`.

Внешний ветеринарный статус: `external_veterinary_review_pending`.

## Проверенные решения

- production-family допускает `dog` и `cat`, а кошачьи presentations не
  наследуют обязательную собачью картину рвоты и явной боли;
- клинический панкреатит не подтверждается одной кнопкой: clinical picture,
  method-identified specific pancreatic lipase, imaging и important
  differentials интерпретируются совместно;
- ordinary amylase и general lipase не считаются подтверждением;
- rapid semiquantitative PLI и внешний количественный PLI остаются разными
  capability-продуктами с методом, датой и turnaround;
- положительный PLI поддерживает диагноз, но не объясняет автоматически все
  признаки, органную недостаточность или случайную находку у клинически
  неподходящего пациента;
- CBC, chemistry и electrolytes используются для тяжести, осложнений,
  коморбидностей и differential, а не как специфический тест панкреатита;
- один ultrasound sign не подтверждает панкреатит; normal/equivocal ultrasound
  не всегда исключает его;
- отчёт УЗИ сохраняет timing, severity context, equipment и operator/expertise;
- radiography используется для obstruction/foreign body/other differential, а
  не как самостоятельное доказательство панкреатита;
- stable и shock/poor-perfusion ветки имеют разные планы; ожидание PLI или
  imaging не задерживает emergency stabilization;
- renal, respiratory, coagulation, perfusion и metabolic red flags хранятся
  отдельно, а не одним ярлыком `severe`;
- положительный PLI не закрывает sepsis, toxin, obstruction и другие причины
  системной декомпенсации;
- локальная коллекция или biliary obstruction получает экспертную
  характеристику и procedure/referral route; infection, drainage или surgery
  не угадываются;
- antimicrobials не становятся рутинным следствием диагноза панкреатита;
- у кошки отсутствие vomiting или guarding не делает случай лёгким;
- actual food intake, weight, hydration, temperature и hepatic lipidosis risk
  обязательны в кошачьей ветке;
- assisted nutrition требует расходников/обучения, а feeding-tube остаётся
  referral capability; force-feeding не является свободной UI-кнопкой;
- chronic, recurrent и acute-on-chronic состояния сохраняют uncertainty:
  clinical history не притворяется histology;
- старый положительный test не объясняет каждый новый acute abdomen;
- diabetes и EPI возможны при хроническом процессе, но подтверждаются своими
  методами и не генерируются как гарантированное осложнение;
- discordant PLI и ultrasound не усредняются и не разрешаются случайным выбором;
- повтор или expert referral выполняется, когда конфликт меняет решение;
- слово `triaditis` не создаёт автоматически pancreatitis, cholangitis и
  enteropathy и не открывает три лечения;
- stable follow-up оценивает appetite, vomiting, pain, hydration и weight;
  routine repeat всех тестов не обязателен без decision relevance;
- external results и follow-up привязаны к исходному episode и не меняются при
  reload;
- owner budget допускает staged workup стабильного пациента, но не скрывает
  shock, organ failure, prolonged feline anorexia или unsafe transfer.

## Намеренно не утверждено автором

- конкретный препарат, доза, interval и infusion rate;
- состав, калорийность и схема лечебного питания;
- точные numeric thresholds PLI и внутренних анализаторов;
- техника feeding tube, aspiration, biopsy, drainage или surgery;
- автоматическая antimicrobial или immunosuppressive схема;
- definitive acute/chronic histologic classification без соответствующих данных;
- окончательный статус `approved`.

До независимого ветеринарного review family, 5 variants и 15 presentations
остаются `generatorEligible: false`.

Полные URL и область применения четырёх источников находятся в `sourceCatalog`
production-файла.
