# Source review — `repro_pyometra`

Дата проверки: 15 июля 2026 года.

Авторский статус: `author_complete`.

Source status: `source_checked`.

Внешний ветеринарный статус: `external_veterinary_review_pending`.

## Проверенные решения

- обычный production-generator допускает только самку с сохранённой маткой;
- заявленная стерилизация не закрывает редкую stump/remnant ветку, но она
  разрешена только при authored остаточной ткани и гормональном источнике;
- документированное полное удаление без residual tissue/hormonal source
  запрещает stump truth: код не выдумывает матку;
- reproductive status, cycle timing, mating/pregnancy, hormonal exposure и
  operation records сохраняются как отдельные доказательства;
- выделения поддерживают открытую форму, но не означают лёгкую болезнь или
  устранённый источник;
- отсутствие выделений не исключает и может сопровождать более тяжёлую
  closed-cervix форму;
- запах/цвет выделений и CBC по отдельности не подтверждают пиометру;
- нормальный leukocyte count не исключает раннюю или тяжёлую болезнь;
- expert ultrasound оценивает uterus, wall, contents, pregnancy/differentials и
  free fluid; не любое содержимое автоматически объявляется гноем;
- radiography может поддерживать, но не окончательно характеризует uterine
  contents;
- pregnancy, mucometra/hydrometra и другие abdominal/reproductive causes не
  удаляются из differential одним изображением;
- сильно растянутая матка исключает repeated rough palpation и blind
  cystocentesis;
- stable, systemic, shock и rupture/peritonitis ветки имеют разные urgency и
  resource routes;
- нестабильная пациентка получает stabilization и source-control referral
  параллельно; culture и полный внешний результат не задерживают помощь;
- renal, hepatic, coagulation, respiratory и perfusion flags хранятся отдельно;
- leukocytosis/neutropenia интерпретируются с физиологией и динамикой, а не как
  самостоятельное определение sepsis;
- культура имеет источник, дату и turnaround; contaminated discharge не
  притворяется uterine surgical sample;
- кошачья ветка допускает малозаметные anorexia/lethargy/dehydration без
  обязательной собачьей PU/PD или выраженных выделений;
- reproductive-preserving management не является вариантом «подешевле» и
  остаётся отдельным reviewed specialist protocol только для строго отобранной
  стабильной breeding patient;
- closed, systemic, endotoxemic, rupture и organ-failure presentations не
  допускаются к обычной conservative ветке;
- breeding priority обсуждается после безопасности и не отменяет emergency;
- postoperative presentation связан с исходной операцией и baseline;
- ранние lab changes интерпретируются во времени и не становятся осложнением
  без clinical context;
- failure to improve, fever, vomiting, weakness, wound/discharge or organ
  decline активируют repeat imaging/culture/referral;
- owner budget допускает прозрачный staged estimate, но не домашний маршрут при
  sepsis, rupture или unsafe transfer.

## Намеренно не утверждено автором

- конкретный antimicrobial, reproductive drug, dose или interval;
- infusion, anesthesia и perioperative protocol;
- conservative breeding protocol и его eligibility thresholds;
- техника cystocentesis, uterine sampling, lavage, drainage или surgery;
- точные numeric sepsis/laboratory cutoffs;
- окончательный статус `approved`.

До независимого ветеринарного review family, 4 variants и 12 presentations
остаются `generatorEligible: false`.

Полные URL и область применения четырёх источников находятся в `sourceCatalog`
production-файла.
