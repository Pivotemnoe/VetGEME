# Source review — `urinary_uroliths`

Дата проверки: 16 июля 2026 года.

Авторский статус: `author_complete`.

Source status: `source_checked`.

Внешний ветеринарный статус: `external_veterinary_review_pending`.

## Проверенные решения

- crystalluria, urolith и urinary obstruction хранятся раздельно;
- urine pH, crystal morphology, radiopacity, breed и внешний вид не
  подтверждают quantitative composition по отдельности;
- LUTS и FLUTD являются признаками/umbrella category, а не этиологическим
  диагнозом;
- actual urine output, последний normal stream и bladder size/pain проверяются
  до детального обсуждения рациона или минерала;
- owner label «запор» не отменяет emergency obstruction triage;
- непродуктивные попытки, большой болезненный пузырь, systemic weakness,
  bradyarrhythmia, hyperkalemia, oliguria/anuria и postrenal azotemia повышают
  срочность;
- при obstruction renal values, potassium/electrolytes, acid-base и ECG
  оцениваются по состоянию одновременно со stabilization/outflow route;
- процедура decompression/catheterization и drug protocol не генерируются;
- obstructed patient не получает routine dissolution до безопасного
  восстановления или обхода outflow;
- urinalysis и sediment сохраняют collection method, timing относительно
  лечения и specimen limitations;
- culture интерпретируется по клинике и способу получения, а не по факту любого
  bacterial result;
- canine infection-induced struvite требует compatible culture/urine context;
- feline struvite не наследует автоматически собачью infection logic;
- валидный dissolution route требует baseline size/count/location, approved
  exclusive protocol, same-method serial imaging и hard exit criteria;
- authored dissolution trajectory создаётся до решения игрока и не меняется
  после reload;
- отсутствие shrinkage, growth, obstruction, symptoms, infection или diet
  intolerance запускают reassessment composition/compliance/retrieval;
- calcium oxalate pattern не получает generated dissolution/acidification;
- urate/cystine concern требует quantitative analysis и hepatic/metabolic
  context; breed является только risk modifier;
- low-risk asymptomatic lower stone может безопасно наблюдаться и не должен
  приносить penalty только за отсутствие продажи процедуры;
- monitoring всегда содержит date, same imaging method и exit criteria;
- specialist выбирает least-invasive/anatomy-appropriate retrieval, lithotripsy,
  stent, bypass или surgery; UI не выбирает технику;
- normal urination и nondistended bladder не исключают unilateral ureteral
  obstruction, поскольку contralateral kidney может поддерживать output;
- modest creatinine не исключает unilateral renal damage; нужны upper-tract
  imaging и serial pelvis/function assessment;
- bilateral obstruction, single functioning kidney или CKD-complicated
  obstruction получают emergency stabilization/intensive specialist route;
- incidental nonobstructive nephrolith не требует автоматического удаления и не
  доказывает CKD progression без временной связи;
- postobstructive urine output/electrolyte course остаётся в том же episode;
- salvage urethral procedure может уменьшать blockage risk, но не излечивает
  underlying stones, plugs, inflammation, infection или environmental drivers;
- removal/dissolution не завершает disease plan без quantitative composition,
  clearance imaging и prevention;
- mixed stone хранит компоненты и proportions, а не сводится к одному
  визуальному label;
- symptom improvement после процедуры не доказывает отсутствие residual
  fragment;
- recurrence сохраняет исходный patient/episode и требует аудита composition,
  residual material, reinfection, metabolic cause, diet exclusivity, water и
  recheck adherence до обвинения владельца;
- random diet switching запрещён; prevention является type-specific reviewed
  protocol;
- microscopy, culture, X-ray, ultrasound, quantitative analysis, emergency
  urinary care и specialist intervention остаются разными capabilities и
  очередями;
- отсутствие local equipment/staff или owner refusal не скрывает obstruction,
  hyperkalemia или upper-tract emergency и всегда ведёт к safe referral.

## Намеренно не утверждено автором

- drug, antimicrobial, analgesic, infusion или electrolyte formula, dose, rate,
  interval и duration;
- commercial diet, nutrient composition, calorie target или urinary pH/USG
  target;
- universal dissolution duration или imaging interval вне versioned protocol;
- urine collection, decompression или catheterization technique;
- contrast study, uroendoscopy, lithotripsy, retropulsion, stent, SUB,
  urethrostomy или surgical technique;
- device selection и numeric intervention threshold;
- окончательный статус `approved`.

До независимого ветеринарного review family, 5 variants и 15 presentations
остаются `generatorEligible: false`.

Полные URL и области применения пяти источников находятся в `sourceCatalog`
production-файла.
