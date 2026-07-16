# Source review — `endocrine_feline_hyperthyroid`

Дата проверки: 15 июля 2026 года.

Авторский статус: `author_complete`.

Source status: `source_checked`.

Внешний ветеринарный статус: `external_veterinary_review_pending`.

## Проверенные решения

- production-family допускает только `cat`;
- потеря массы, тахикардия или пальпируемый узел сами по себе не подтверждают
  функциональный гипертиреоз;
- клинически совместимая кошка с повышенным total T4 имеет overt disease;
- normal total T4 не всегда исключает ранний гипертиреоз: актуальный Merck
  указывает, что часть подтверждённых кошек имеет normal T4;
- high-normal total T4 у senior cat интерпретируется с возрастом, клиникой,
  повтором и nonthyroidal illness;
- free T4 и feline TSH не используются как standalone screen и не
  cherry-pick-ятся против total T4/clinical context;
- palpable nodule хранится как анатомическая находка; mass differential и
  функциональная локализация остаются отдельными;
- significant nonthyroidal illness может снижать total T4 и требует
  характеристики/стабилизации и timed repeat;
- CBC, chemistry, urinalysis, hydration, weight/MCS, BP и cardiac screen
  фиксируются до долгосрочного маршрута;
- ordinary biochemistry analyzer не открывает T4 capability;
- hyperthyroidism и CKD могут сосуществовать; CKD не является причиной
  автоматически не лечить thyroid disease;
- pre-control renal baseline и post-control snapshot остаются отдельными;
- post-control azotemia не объявляется необратимой CKD без hydration,
  thyroid-treatment state, acute factors и нового stable baseline;
- protocol-defined reversible control может уменьшить renal uncertainty, но не
  обещает идеально предсказать definitive outcome;
- tachycardia, murmur или gallop направляют cardiac workup, но не равны CHF;
- dyspnea получает minimal-handling oxygen/hospital/cardiology route до
  планового hormone discussion;
- BP измеряется standardized series; retinal/neurologic target-organ damage не
  ждёт недель подтверждения;
- retina finding является authored exam result, а не выводом renderer из BP;
- apathetic/decompensated hyperthyroid cat остаётся возможной веткой: низкая
  активность не исключает заболевание;
- radioiodine, surgery, reversible medical и exclusive-diet routes представлены
  как future reviewed capabilities с eligibility, стоимостью и monitoring;
- exclusive diet feasibility учитывает treats и multi-cat household, но
  конкретный состав не генерируется;
- external T4/fT4/TSH/scintigraphy/echo/definitive services сохраняют turnaround
  и тот же episode snapshot;
- owner budget допускает staged testing у стабильной кошки, но не скрывает
  blindness, dyspnea или decompensation.

## Намеренно не утверждено автором

- препарат, доза, interval и target T4;
- threshold гормональных тестов и точный approved equivocal algorithm;
- конкретный reversible-control protocol;
- состав iodine-restricted diet и eligibility;
- radioiodine activity/protocol, isolation logistics и surgery technique;
- cardiac, antihypertensive или renal treatment protocol;
- окончательный статус `approved`.

До независимого ветеринарного review family, 4 variants и 12 presentations
остаются `generatorEligible: false`.

Полные URL и область применения четырёх источников находятся в `sourceCatalog`
production-файла.
