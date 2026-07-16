# Source review — `gi_chronic_enteropathy`

Дата проверки: 16 июля 2026 года.

Авторский статус: `author_complete`.

Source status: `source_checked`.

Внешний ветеринарный статус: `external_veterinary_review_pending`.

## Проверенные решения

- хронические GI-признаки хранятся как синдром и диагностический маршрут, а не
  как автоматический диагноз IBD;
- продолжительность, характер стула, рвота, аппетит, полный diet history,
  доступ к чужим мискам/лакомствам, масса, BCS, MCS и activity score образуют
  обязательный исходный профиль;
- стабильный пациент и пациент с анорексией, быстрой потерей массы,
  гипоальбуминемией, кровотечением, массой или непроходимостью получают разные
  скорости маршрута;
- у нестабильного или истощённого пациента диагностика и поддержка не
  откладываются ради последовательного прохождения нескольких diet trials;
- одна отрицательная fecal-проба не закрывает паразитарные и инфекционные
  mimics: сохраняются метод, образец, timing и эпидемиологическая применимость;
- CBC, biochemistry, electrolytes и urinalysis используются для оценки
  системных причин, безопасности, albumin и потерь, а не как бинарный тест на
  enteropathy;
- TLI, cobalamin, folate и pancreatic markers интерпретируются вместе с
  species, клиникой и остальными данными; отдельное отклонение не называет
  этиологию;
- низкий cobalamin поддерживает malabsorption context и необходимость
  коррекции/наблюдения, но не является самостоятельным этиологическим
  диагнозом;
- protein-losing enteropathy подтверждается только после локализации потери и
  оценки renal, hepatic, bleeding и других альтернатив;
- edema, ascites, severe hypoalbuminemia и thrombotic risk повышают срочность и
  не отправляют пациента в обычную длинную диетическую последовательность;
- diet trial требует полного предыдущего diet exposure, терапевтической
  категории, клинически адекватной продолжительности, полной эксклюзивности,
  weekly score и контрольной оценки;
- обычная смена корма, короткая проба или кормление с лакомствами/доступом к
  другим мискам не считаются диагностической diet trial;
- authored outcome диетической пробы задаётся при генерации пациента, до
  решения игрока, поэтому движок не подстраивает результат под выбранный корм;
- падение аппетита или анорексия прерывают выбранный diet route и переводят
  приоритет на nutrition safety;
- food-responsive phenotype подтверждается объективным ответом при доказанной
  эксклюзивности, а не субъективным впечатлением владельца;
- large-bowel pattern локализуется по mucus, fresh blood, urgency и tenesmus,
  но не исключает systemic, infectious или structural disease;
- breed association не является диагнозом; antimicrobial route допустим
  только для подтверждённого phenotype в versioned specialist plan;
- экспертное abdominal ultrasound оценивает bowel layers, nodes, mass,
  obstruction и соседние органы, но нормальное УЗИ не исключает microscopic
  disease;
- endoscopy и biopsy выполняются только когда результат изменит решение;
  сохраняются участки, число и качество samples, подготовка, ограничения и
  pathology confidence;
- histologic inflammation не различает автоматически food-responsive и
  immunosuppressant-responsive disease и всегда интерпретируется с клиникой и
  response history;
- применяется стандартизованный WSAVA-style pathology report, а плохой или
  неполный sample не превращается в отрицательный результат;
- feline multisystem presentation хранит enteric, pancreatic и hepatobiliary
  evidence раздельно; слово «triaditis» не создаёт три подтверждённых диагноза;
- положительный pancreatic marker сам по себе не подтверждает весь
  multisystem cluster;
- concern lymphoma после УЗИ или неоднозначной histology ведёт к adequate
  multisite/contextual pathology и oncology route, а не к самовольному
  подтверждению или исключению;
- refractory phenotype разрешён только после аудита адекватных diet trials,
  parasite/pathogen workup, systemic/EPI mimics, imaging, sample quality,
  pathology и compliance;
- положительный mimic переводит эпизод в соответствующее семейство без потери
  уже собранной истории, результатов и состояния пациента;
- external results сохраняют turnaround, episode identity, метод и provenance;
- отсутствие локального УЗИ, endoscopy, histopathology или specialist care
  всегда имеет safe referral route;
- owner refusal меняет доступный маршрут, но не скрывает опасное состояние и
  не делает недостаточные данные достаточными;
- follow-up сохраняет одинаковые шкалы stool/vomiting/activity, serial weight,
  BCS, MCS, albumin, intake, exclusivity, adverse effects и outcome.

## Намеренно не утверждено автором

- конкретная commercial diet, формула, калорийность и схема кормления;
- универсальная продолжительность diet trial вне утверждённого протокола и
  индивидуальной безопасности пациента;
- antimicrobial, immunosuppressive, antithrombotic, cobalamin или иная drug,
  dose, interval и duration;
- состав infusion, nutrition, thrombo-prophylaxis или intensive-care protocol;
- numeric albumin, activity-score, biomarker или biopsy threshold;
- техника endoscopy, biopsy, aspirate, surgery или anesthesia;
- histopathology interpretation вне specialist report и clinical context;
- oncology treatment scheme;
- окончательный статус `approved`.

До независимого ветеринарного review family, 6 variants и 18 presentations
остаются `generatorEligible: false`.

Полные URL и области применения пяти источников находятся в `sourceCatalog`
production-файла.
