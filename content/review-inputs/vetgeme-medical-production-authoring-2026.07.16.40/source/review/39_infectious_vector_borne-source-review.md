# Source review — `infectious_vector_borne`

Дата проверки: 16 июля 2026 года.

Авторский статус: `author_complete`.

Source status: `source_checked`.

Внешний ветеринарный статус: `external_veterinary_review_pending`.

## Проверенные решения

- 3 variants раскрыты в 9 отдельных pathogen/evidence presentations;
- geography, travel/import, season, vector/non-vector exposure и species
  формируют versioned prior, но сами не подтверждают заболевание;
- обновление региональной матрицы влияет только на будущую генерацию и не
  перезаписывает уже сохранённого пациента;
- Ehrlichia/Anaplasma требуют compatible syndrome, raw CBC/organ severity и
  правильно интерпретированных PCR/serology/paired-titer данных;
- morula cell type или один visual organism не считаются безусловным species ID;
- ранняя серонегативность, длительная серопозитивность и коинфекция являются
  допустимыми authored states;
- Borrelia antibody/exposure test не равен current causal disease; клинический
  синдром и renal-complication review остаются отдельными требованиями;
- острый canine Babesia route сначала оценивает hemolysis, thrombocytopenia,
  shock и organ injury, затем organism/species/coinfection evidence;
- один отрицательный smear не исключает low-parasitemia, chronic или
  previously treated Babesia state;
- feline hemoplasma PCR интерпретируется вместе с regenerative anemia,
  FeLV/FIV/comorbidity и возможным carrier state;
- canine leishmaniosis разделяет exposure, subclinical infection, clinical
  disease и renal severity; quantitative serology и tissue/sample identity
  не взаимозаменяются молча;
- canine heartworm использует antigen, microfilaria, confirmation и
  cardiopulmonary staging с сохранением discordant/early/occult states;
- feline heartworm использует отдельный low-worm-burden algorithm: antibody,
  antigen limitations, imaging и clinical context; canine route не копируется;
- microscopy остаётся доступной, но не всеведущей;
- missing local/external capability всегда сохраняет `safe_referral`.

## Намеренно не утверждено автором

- antimicrobial, antiparasitic, transfusion, fluid или drug/dose protocol;
- vector-prevention product или schedule;
- public-health instruction;
- конкретный therapeutic response как самостоятельное подтверждение диагноза;
- окончательный статус `approved`.

До независимого ветеринарного review family, 3 variants и 9 presentations
остаются `generatorEligible: false`.

Полные URL и области применения шести источников находятся в `sourceCatalog`.
