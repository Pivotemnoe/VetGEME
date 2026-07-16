# Source review — `resp_pneumonia`

Дата проверки: 16 июля 2026 года.

Авторский статус: `author_complete`.

Source status: `source_checked`.

Внешний ветеринарный статус: `external_veterinary_review_pending`.

## Проверенные решения

- pneumonia означает воспаление pulmonary parenchyma и не является синонимом
  любого cough или upper respiratory disease;
- bacterial bronchopneumonia, aspiration pneumonitis, secondary bacterial
  aspiration pneumonia, nonbacterial pneumonia и mimics хранятся раздельно;
- pneumonia evidence, severity, mechanism и primary source являются отдельными
  authored fields;
- onset, resting/sleeping RR, effort, cyanosis/collapse, appetite/activity,
  oxygen status, systemic signs и imaging timing сохраняются до решения игрока;
- upper-airway/CIRDC-like illness, shelter/crowding или viral context не
  подтверждают secondary bacterial pneumonia без нового parenchymal evidence;
- fever, leukogram, radiographic severity или one lobe distribution сами по себе
  не подтверждают bacterial etiology;
- aspiration event поддерживает причинную связь, но не доказывает вторичную
  бактериальную инфекцию;
- chemical injury и bacterial aspiration state имеют отдельные evidence and
  treatment eligibility;
- история vomiting/regurgitation, anesthesia, force feeding, liquid medication,
  dysphagia, megaesophagus и cough with eating собирается без blame language;
- recurrent aspiration сохраняет physiologic source и не создаётся как random
  owner non-adherence;
- respiratory effort, mucosa, mentation, perfusion и signal-quality qualified
  pulse oximetry оцениваются до длительной диагностики;
- oxygen, minimal handling и high-level referral предшествуют radiography,
  airway sampling или длинному анамнезу у unstable patient;
- quiet exhausted patient может быть опаснее громко кашляющего stable patient;
- multiview thoracic radiography хранит distribution, pattern, timing и
  comparison; early normal/equivocal image не удаляет совместимую evolving
  aspiration branch;
- history alone при этом не превращает evolving aspiration в bacterial
  pneumonia;
- meaningful lower-airway sample хранит technique provenance, quality,
  cytology, culture и susceptibility; oropharyngeal/nasal swab его не заменяет;
- lower-airway sampling выполняется до antimicrobial when safe, но не задерживает
  emergency reviewed treatment;
- blood culture является selected alternative в части severe cases и не
  называется perfect BAL replacement;
- bacterial aspiration classification имеет известную неопределённость:
  noninvasive fever, band-neutrophil и radiographic markers не являются
  достаточным criterion standard;
- sepsis, shock, multilobar disease, oxygen dependence и ventilatory fatigue
  получают hospital/ICU/mechanical-ventilation referral до исчерпания local
  capacity;
- UI не генерирует intubation или ventilator settings;
- fungal/parasitic/protozoal routes требуют compatible species, geography,
  travel и environmental exposure;
- negative bacterial culture не подтверждает fungus, а eosinophilia не
  подтверждает parasite/inflammatory disease;
- important infection исключается до reviewed immunosuppression route;
- edema, hemorrhage, cardiac disease, trauma, neoplasia и airway disease
  остаются видимыми dangerous mimics до discriminator evidence;
- confirmed mimic переводит episode в соответствующее семейство без потери
  patient identity, prior imaging и treatment response;
- clinical, CBC и radiographic response могут нормализоваться в разное время;
- radiographic lag alone не требует endless treatment до perfect image;
- nonresponse запускает audit sample quality, susceptibility, adherence,
  primary source и initial diagnosis, а не random broadening;
- persistent same-lobe/focal process получает CT/advanced imaging,
  bronchoscopy/airway sample и source-control route;
- external culture, imaging и specialist referral имеют turnaround и возвращают
  результат в тот же episode;
- отсутствие local oxygen, monitor, imaging или ICU всегда имеет safe emergency
  referral route;
- owner budget/refusal не скрывает hypoxemia, fatigue, sepsis или oxygen
  dependence.

## Намеренно не утверждено автором

- antimicrobial, antifungal, antiparasitic, anti-inflammatory или иной drug,
  dose, route, interval и duration;
- oxygen concentration/target и weaning protocol;
- fluid, vasopressor, nutrition или physiotherapy protocol;
- TTW, ETW, BAL, blood-culture, bronchoscopy или CT technique;
- intubation, mechanical ventilation settings или transfer procedure;
- universal CBC, oxygenation, culture или radiographic treatment threshold;
- окончательный статус `approved`.

До независимого ветеринарного review family, 5 variants и 15 presentations
остаются `generatorEligible: false`.

Полные URL и области применения четырёх источников находятся в `sourceCatalog`
production-файла.
