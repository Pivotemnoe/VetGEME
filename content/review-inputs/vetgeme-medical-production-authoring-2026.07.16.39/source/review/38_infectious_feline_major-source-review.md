# Source review — `infectious_feline_major`

Дата проверки: 16 июля 2026 года.

Авторский статус: `author_complete`.

Source status: `source_checked`.

Внешний ветеринарный статус: `external_veterinary_review_pending`.

## Проверенные решения

- FPV, FHV/FCV, FeLV, FIV, FIP и rabies являются отдельными truth models;
- infectious-control flow начинается до общей очереди;
- FPV antigen имеет ограниченную sensitivity и intermittent-shedding/recent-
  vaccine context; отрицательный тест не всегда исключает болезнь;
- severe FPV определяется shock, glucose, CBC/DIC и capacity, а не одним тестом;
- FHV/FCV clinical overlap, carrier shedding и coinfection сохраняются;
- respiratory PCR не автоматически доказывает current causal disease;
- FeLV screen требует confirmatory/serial characterization; progressive,
  regressive и discordant states не перезаписываются;
- FeLV infection не равна current illness, prognosis или euthanasia;
- FIV screen сохраняет kitten age, maternal antibody, vaccine region/history и
  recent-exposure window;
- FIV является feline-specific и не представляет human zoonotic risk;
- FCoV antibody/fecal PCR доказывают exposure/shedding, а не FIP;
- FIP требует multimodal synthesis с sample-site quality, effusion/lesion,
  imaging, CBC/chemistry и selected PCR/antigen/cytology;
- Rivalta, generic blood test или treatment response отдельно не подтверждают
  FIP;
- rabies bypasses routine handling и остаётся authority/local-law controlled;
- positive retrovirus result не создаёт automatic campaign penalty;
- missing confirmation/isolation/specialist capability сохраняет
  `safe_referral`.

## Намеренно не утверждено автором

- antiviral, antimicrobial, fluid, nutrition, drug или dose;
- vaccine product/schedule;
- isolation duration/decontamination recipe;
- FIP treatment-response diagnostic rule;
- rabies quarantine/testing/disposition;
- окончательный статус `approved`.

До независимого ветеринарного review family, 6 variants и 18 presentations
остаются `generatorEligible: false`.

Полные URL и области применения семи источников находятся в `sourceCatalog`.
