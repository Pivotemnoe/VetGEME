# Source review — `infectious_canine_major`

Дата проверки: 16 июля 2026 года.

Авторский статус: `author_complete`.

Source status: `source_checked`.

Внешний ветеринарный статус: `external_veterinary_review_pending`.

## Проверенные решения

- пакет разделён на parvovirus, distemper, adenovirus hepatitis,
  leptospirosis и regulated rabies route;
- infectious-control triage выполняется до общей очереди;
- вакцинация изменяет вероятность/интерпретацию, но не доказывает и не
  исключает active disease;
- parvo antigen учитывает timing, dilution и false-negative context;
- severe parvo urgency определяется leukopenia, hydration, glucose, perfusion
  и sepsis, а не одним rapid result;
- delayed/progressive neurologic distemper не требует одновременного cough;
- distemper PCR сохраняет sample site, timing и recent-vaccine context;
- adenoviral hepatic pattern не подтверждается ALT и требует coagulation,
  function, mimic review и specific confirmation;
- leptospirosis возможен у любого signalment/lifestyle;
- blood/urine PCR и acute/convalescent MAT интерпретируются вместе с vaccine
  context; MAT не считается надёжным infecting-serovar identifier;
- suspected leptospirosis открывает zoonotic urine/blood barrier и human
  exposure guidance до подтверждения;
- suspected rabies не входит в routine waiting/exam flow;
- public-health authority и local law определяют handling, testing/observation
  и disposition; gameplay не выбирает legal outcome;
- external results имеют turnaround и не регенерируют truth;
- missing isolation/ICU/testing/regulatory capability сохраняет
  `safe_referral`.

## Намеренно не утверждено автором

- drug, antimicrobial, dose, fluid или support protocol;
- isolation duration или decontamination recipe;
- vaccine product/schedule;
- quarantine, observation, testing или disposition rule для rabies;
- окончательный статус `approved`.

До независимого ветеринарного review family, 5 variants и 15 presentations
остаются `generatorEligible: false`.

Полные URL и области применения шести источников находятся в `sourceCatalog`.
