# Source review — `oncology_mass`

Дата проверки: 16 июля 2026 года.

Авторский статус: `author_complete`.

Source status: `source_checked`.

Внешний ветеринарный статус: `external_veterinary_review_pending`.

## Проверенные решения

- масса является находкой, а не диагнозом; пальпация, размер, подвижность,
  порода, возраст и imaging отдельно не определяют поведение;
- каждая масса имеет неизменяемый ID, участок, слой, три размера, photo date,
  рост, поверхность, боль, функцию и собственные sample/result links;
- несколько масс у одного пациента не наследуют диагноз друг друга;
- cytology может быть definitive, categorical или nondiagnostic;
- blood, necrosis или low cellularity являются неинформативным результатом, а
  не отрицательным тестом;
- cytology часто распознаёт benign/inflammatory и round-cell lesions, но обычно
  не поставляет архитектуру, invasion, grade и margins;
- histology сохраняет type, grade, invasion, prognostic fields, specimen
  orientation и margins;
- grade описывает microscopic behavior, stage — extent/distribution;
- регионарный lymph node выбирается по drainage и tumor biology, а не только
  по размеру; normal-sized node не исключает metastasis;
- staging tests выбираются по диагностической и прогностической ценности,
  practical burden, biologic pertinence и влиянию результата на решение;
- одинаковый staging panel для каждой опухоли отклоняется;
- flow cytometry, immunophenotype и IHC назначаются для определённого вопроса,
  а не автоматически;
- biopsy method, site и track планируются до разреза и защищают definitive
  margins;
- internal mass с bleeding, obstruction, effusion или organ dysfunction
  получает срочную стабилизацию до полного subtype;
- risky/low-yield internal sampling имеет specialist risk-yield route;
- owner intent, cost, burden, surveillance, palliation и quality of life
  сохраняются продольно и могут изменяться;
- missing cytology, histology, imaging, node sampling, advanced pathology или
  oncology planning всегда сохраняет `safe_referral`.

## Намеренно не утверждено автором

- универсальная biopsy или surgical technique;
- chemotherapy, radiation, drug, dose или protocol;
- одинаковый staging panel для всех tumor types;
- универсальный recheck или surveillance interval;
- автоматический grade, stage или prognosis по одному виду массы;
- окончательный статус `approved`.

До независимого ветеринарного review family, 7 variants и 21 presentations
остаются `generatorEligible: false`.

Полные URL и области применения пяти источников находятся в `sourceCatalog`
production-файла.
