# Source review — `gi_obstruction`

Дата проверки: 16 июля 2026 года.

Авторский статус: `author_complete`.

Source status: `source_checked`.

Внешний ветеринарный статус: `external_veterinary_review_pending`.

## Проверенные решения

- mechanical obstruction и functional ileus являются разными authored states;
- непроходимость рассматривается как потенциально экстренное состояние из-за
  dehydration, electrolyte/acid-base disturbance, aspiration, ischemia,
  perforation, peritonitis, sepsis и shock;
- witnessed ingestion не определяет текущую location, степень obstruction или
  способ retrieval;
- наличие стула, диареи или временного улучшения не исключает partial/early
  obstruction;
- история фиксирует object/material/time, vomiting, water/food retention,
  stool/gas, pain, linear exposure, prior surgery, mass/hernia, home actions,
  imaging views/time и возможность немедленного возврата;
- perfusion, hydration, pain, temperature, aspiration risk, abdominal
  distension/mass, peritoneal signs, oral/sublingual area, hernias и incision
  оцениваются до планового ожидания;
- CBC, biochemistry, electrolytes и acid-base характеризуют тяжесть и
  подготовку, но не визуализируют obstruction;
- radiography требует достаточных проекций; одна проекция и normal overview не
  исключают radiolucent/partial obstruction;
- ultrasound report хранит обследованные сегменты, plication, motility, wall,
  fluid, location, extent и ограничения; incomplete scan не считается normal;
- imaging snapshot и observation clock создаются до решения игрока, сохраняются
  вместе с episode и не меняются после reload;
- visible oral/anal string нельзя тянуть generic action; unsafe forced oral exam
  заменяется low-stress/sedated specialist route;
- отсутствие visible string не исключает distal/hidden linear anchor;
- linear pattern, shock, severe/progressive pain, peritonitis, free gas/septic
  fluid, nonpassage или deterioration прекращают observation;
- stabilization и emergency surgical/intensive referral выполняются параллельно
  и не ждут идеального подтверждения fluid analysis;
- small smooth moving object может наблюдаться только у stable patient без
  linear/perforation pattern, в стационаре или эквивалентно контролируемом
  маршруте с serial imaging и hard exit criteria;
- observation расходует bed, staff time и repeat imaging и не является
  бесплатным домашним ожиданием;
- endoscopy рассматривается для доступного proximal object; location,
  multiplicity, obstruction и damage определяют specialist route;
- surgeon, а не UI, выбирает reduction, resection, anastomosis или иной
  intraoperative decision после viability assessment;
- intussusception требует экспертной imaging/anatomic evidence; age, breed,
  enteritis или parasites меняют вероятность, но не создают диагноз;
- transient short target-sign интерпретируется в clinical context, а recurrence
  и compromised bowel получают срочный surgical route;
- mass не равна автоматически malignancy; structural obstruction и этиология
  подтверждаются отдельно;
- postoperative/inflammatory stricture требует совместимых site, timeline,
  records и structural evidence;
- incarcerated hernia/external compression не получает generic forceful
  reduction;
- postoperative ileus, persistent focal mechanical obstruction, anastomotic
  leak/peritonitis и short-bowel adaptation имеют отдельные time-linked ветки;
- новый postoperative decline отменяет успокаивающее значение более раннего
  normal check и остаётся тем же patient/episode;
- long-term nutrition хранит resection extent, intake, stool, weight, BCS, MCS,
  electrolytes и adaptation, но не генерирует формулу лечения;
- owner budget/refusal меняет доступный маршрут, но не разрешает unsafe waiting
  при shock, linear pattern, ischemia или peritonitis;
- отсутствие локальных X-ray, ultrasound, endoscopy, surgery или ICU всегда
  имеет safe referral route.

## Намеренно не утверждено автором

- домашняя или клиническая схема induction of emesis;
- drug, antimicrobial, analgesic, infusion, electrolyte или nutrition formula,
  dose, rate, interval и duration;
- numeric observation threshold вне versioned protocol;
- contrast material и protocol;
- anesthesia, endoscopy, enterotomy, resection, anastomosis, reduction,
  enteroplication или hernia repair technique;
- exact postoperative feeding/aftercare scheme;
- окончательный статус `approved`.

До независимого ветеринарного review family, 6 variants и 18 presentations
остаются `generatorEligible: false`.

Полные URL и области применения пяти источников находятся в `sourceCatalog`
production-файла.
