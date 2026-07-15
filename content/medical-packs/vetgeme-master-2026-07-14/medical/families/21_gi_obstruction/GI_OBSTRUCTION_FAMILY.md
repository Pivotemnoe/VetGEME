# Семейство 21 — непроходимость желудочно-кишечного тракта

Статус: `source_checked_pending_veterinary_review`

Generator eligibility: `false`

Виды первой версии: собака, кошка

Базовых вариантов: 6

Authored presentation branches: 18

## 1. Граница семейства

Непроходимость — механическое или функциональное нарушение прохождения содержимого. Это семейство концентрируется на
механической обструкции и её послеоперационных осложнениях. Функциональный илеус остаётся differential и не объявляется
механической обструкцией только по расширенным петлям.

Семейство различает:

- одиночное инородное тело;
- линейное инородное тело;
- частичную/перемежающуюся обструкцию;
- инвагинацию;
- массу, стриктуру или ущемление;
- послеоперационный и осложнённый паттерн.

Видимое инородное тело не означает автоматически операцию: некоторые желудочные объекты могут извлекаться эндоскопически,
а безопасно проходящий объект может наблюдаться в стационаре. Но отсутствие продвижения, ухудшение, linear pattern,
перфорация/ишемия или complete obstruction требуют срочного хирургического маршрута.

## 2. Генераторная модель

Это не шесть фиксированных пациентов. Генератор выбирает совместимые вид, возраст, привычки, предмет/причину, владельца,
бюджет и темперамент, но authored-template едино задаёт:

- onset, частоту рвоты, стул и способность удерживать воду;
- hydration/perfusion, боль и температура;
- CBC/биохимию/электролиты/acid-base;
- radiography/ultrasound findings и дату;
- location, complete/partial status и движение предмета;
- viability/perforation/peritonitis flags;
- endoscopic/surgical/observation route;
- postoperative outcome.

Уже созданный день хранит imaging snapshot; перезагрузка не передвигает предмет случайно.

## 3. Общие вопросы и authored-ответы

| Вопрос | Допустимые типы ответа | Клиническая роль |
|---|---|---|
| Видели ли проглатывание и что исчезло? | Предмет/время, подозрение, нет | Материал, размер, токсичность, срок |
| Когда началась рвота и что в ней? | Еда/вода/желчь/каловый запах; частота | Локализация и тяжесть, не абсолютное правило |
| Удерживает ли воду/еду? | Да, частично, нет | Стабильность и hospital need |
| Есть ли стул/газ? | Нормально, меньше, диарея, нет | Наличие стула не исключает partial/early obstruction |
| Есть ли боль или «молитвенная» поза? | Да/нет/не замечено | Severity и differential |
| Есть ли нить изо рта/ануса? | Да/нет/не осматривали | Linear red flag; тянуть запрещено |
| Были ли операции на животе? | Дата/тип, нет, неизвестно | Стриктура, спайки, recurrence, postoperative leak |
| Есть ли грыжа/масса/хроническое похудение? | Да/нет | Non-foreign-body obstruction |
| Что уже давали, вызывали ли рвоту? | Полный список/нет/неизвестно | Безопасность; некоторые предметы/состояния запрещают домашнюю индукцию |
| Были ли снимки и в каких проекциях? | Полный отчёт/одна проекция/нет | Adequacy и serial comparison |
| Изменилось ли состояние после снимка? | Лучше/так же/хуже | Решение observation vs intervention |
| Может ли владелец обеспечить немедленный возврат? | Да/нет/расстояние | Observation eligibility |

Программист не создаёт домашнюю инструкцию «вызвать рвоту» или «вытянуть нитку». Эти действия потенциально опасны и
принадлежат отдельным ветеринарным протоколам.

## 4. Триаж и осмотр

Сначала:

- сознание, перфузия, пульс, давление, температура;
- hydration и электролитный риск;
- дыхание и aspirational risk;
- абдоминальная боль, растяжение, масса и peritoneal signs;
- рот и подъязычная область у подозрения на linear foreign body;
- грыжевые ворота и послеоперационный шов;
- ректальный осмотр по показаниям, без вытягивания линейного предмета.

Шок, сильная/нарастающая боль, перитонит, свободный газ/септическая жидкость, линейное натяжение, persistent vomiting,
complete obstruction или organ dysfunction активируют emergency surgical referral.

## 5. Исследования

| ID | Метод | Capability | Ограничение |
|---|---|---|---|
| `gi_obstruction_stability_hydration_and_abdominal_pain` | Перфузия, hydration, pain, temperature | `general_exam`, `hydration_assessment`, `pain_assessment` | До плановой серии imaging |
| `gi_obstruction_ingestion_and_surgery_history` | Предмет, время, операции, грыжи | `general_exam` | Witnessed ingestion не доказывает location/obstruction |
| `gi_obstruction_cbc_biochemistry_electrolytes_acid_base` | CBC, органы, электролиты, кислотность | `cbc`, `biochemistry`, `electrolytes`, `blood_gas_external` | Определяет тяжесть/подготовку, не визуализирует obstruction |
| `gi_obstruction_multiview_abdominal_radiography` | Несколько ортогональных проекций | `xray_or_referral` | Материал может быть radiolucent; одна проекция недостаточна |
| `gi_obstruction_abdominal_ultrasound` | Предмет, plication, motility, wall, fluid | `ultrasound_or_referral`, `gi_obstruction_ultrasound_external` | Operator-dependent; clinical integration required |
| `gi_obstruction_serial_imaging_when_safe` | Движение объекта/паттерна | `serial_abdominal_radiography`, `foreign_body_passage_monitoring` | Только стабильному кандидату; deterioration прекращает observation |
| `gi_obstruction_perforation_and_fluid_assessment` | Свободный газ/жидкость, cytology/culture | `abdominal_fluid_analysis_external` | Sampling — только безопасным protocol; отрицательный тест не отменяет clinical concern |
| `gi_obstruction_endoscopic_or_surgical_route` | Location/viability определяют referral | `foreign_body_endoscopy_referral`, `gi_surgical_exploration_referral` | Техника не генерируется, решение может уточниться во время операции |
| `gi_obstruction_postoperative_response_and_nutrition` | Pain, appetite, temperature, wound, GI function | `gi_postoperative_monitoring`, `assisted_nutrition` | Leakage/ileus/stricture отслеживаются во времени |

## 6. `gi_obstruction_discrete_foreign_body`

Истина: одиночный предмет механически ограничивает прохождение или имеет высокий риск застревания/повреждения.

### P1 — проглатывание замечено и появились ранние признаки

- Priority/urgent; предмет, время и пациент известны, рвота/анорексия начались.
- Imaging required для location/size/obstruction; слова владельца не определяют, где предмет сейчас.
- Домашняя индукция не предлагается кодом; veterinarian/referral decides safe retrieval route.

### P2 — предмет виден на рентгене или УЗИ

- Urgent/priority; report фиксирует location, dilation, wall/fluid и признаки complete/partial obstruction.
- Желудочный доступный предмет может получить endoscopic referral; кишечный/повреждающий — surgical route.
- Один металлический/костный объект не считается безвредным только потому, что radiopaque.

### P3 — предмет не движется или обструкция ухудшается

- Urgent/emergency; serial imaging/clinical signs показывают lack of passage, нарастающую дилатацию/боль.
- Observation прекращается и surgical referral required.
- Перезагрузка не обнуляет часы ожидания и не перемещает предмет.

## 7. `gi_obstruction_linear_foreign_body`

Истина: нить/лента/ткань фиксируется и вызывает plication, натяжение и риск перфорации. Кошки получают эту ветку чаще, но
собаки не запрещены при compatible exposure.

### P1 — нить под языком или plication

- Emergency/urgent; oral exam находит fixed string либо imaging показывает plicated bowel.
- Нить не тянут и не обрезают без approved surgical decision; full GI imaging/referral.
- Темперамент не допускает силовой рот: sedation/referral по протоколу.

### P2 — видимой нити нет, но УЗИ совместимо

- Urgent; отсутствие нити под языком не исключает distal anchor.
- Ultrasound/radiography integration и surgical consult; one negative view не закрывает.
- Clinical deterioration повышает urgency независимо от окончательной material identification.

### P3 — перфорация или перитонит

- Emergency; свободный газ/жидкость, fever/hypothermia, shock, severe pain.
- Stabilization и surgical/intensive referral идут параллельно; serial observation запрещено.
- Конкретная antimicrobial/surgery technique вне генератора.

## 8. `gi_obstruction_partial_or_chronic`

Истина: lumen закрыт не полностью или объект/сужение даёт intermittent passage. Стул и временное улучшение не исключают
опасность.

### P1 — перемежающаяся рвота и потеря массы

- Priority; недели/эпизоды, между ними может быть нормальный аппетит/стул.
- Ultrasound/multiview imaging ищут partial object/stricture/mass; chronic enteropathy и pancreas остаются differential.
- Один нормальный обзорный снимок не закрывает.

### P2 — предмет движется, но нужен клинический monitoring

- Inpatient/priority; предмет small/smooth, patient stable, no linear/perforation pattern, owner/referral plan надёжен.
- Serial location, vitals, appetite/vomiting and exit criteria authored.
- Observation не означает домашнее «ждать без срока».

### P3 — временное улучшение и рецидив

- Urgent/priority; vomiting stopped then returned, object/obstruction evidence persists.
- Improvement cannot override imaging/timeline; repeat imaging/surgical route.
- System prevents owner trust bonus for premature discharge without criteria.

## 9. `gi_obstruction_intussusception`

Истина: один сегмент кишечника внедряется в другой, часто с underlying motility trigger. Ultrasound target/concentric pattern
поддерживает diagnosis, а viability/recurrence требуют хирургической оценки.

### P1 — молодой пациент после энтерита/паразитов

- Urgent; рвота/диарея/боль, possible mass, recent enteritis/parasites.
- Ultrasound required; underlying cause исследуется, но не задерживает correction.
- Breed/age не создают diagnosis без imaging.

### P2 — target sign на УЗИ

- Urgent/emergency по perfusion/pain; report описывает location, length, blood flow/fluid.
- Surgical referral decides reduction/resection and viability; UI не выбирает technique.
- Apparent transient short intussusception interpreted by expert context, not all sent to surgery automatically.

### P3 — recurrence или compromised bowel

- Emergency/urgent; repeat episode, poor perfusion, free fluid or wall compromise.
- Intensive/surgical route; recurrence prevention is specialist decision with tradeoffs.
- Postoperative timeline remains linked.

## 10. `gi_obstruction_mass_stricture_or_hernia`

Истина: lumen сужен intrinsic mass/stricture либо compressed/incarcerated externally. Older age or prior surgery changes
probability, not truth.

### P1 — пожилой пациент с массой и прогрессирующими признаками

- Priority/urgent; vomiting/weight loss, focal wall/mass/lymph nodes.
- Stabilization, staging/sampling and surgical/oncology route; biopsy approach based on risk.
- Mass not automatically malignant and obstruction not dismissed as chronic enteropathy.

### P2 — послеоперационная или воспалительная стриктура

- Priority/urgent; previous GI procedure/inflammation, narrowing at compatible site.
- Contrast/ultrasound/endoscopy referral as appropriate; postoperative records requested.
- Reoperation decision belongs to surgeon.

### P3 — ущемлённая грыжа или внешнее сдавление

- Emergency/urgent; painful nonreducible hernia or extraluminal lesion, bowel compromise possible.
- Imaging and immediate surgical referral; forceful reduction is not generic action.
- Perfusion and tissue viability determine outcome.

## 11. `gi_obstruction_postoperative_or_complicated`

Истина: после вмешательства пациент может иметь expected ileus, persistent mechanical obstruction, leakage/peritonitis or
long-term malabsorption. Each needs time-linked evidence.

### P1 — илеус против сохранённой механической обструкции

- Postoperative priority; appetite/motility/vomiting are delayed.
- Serial exam/imaging and electrolytes distinguish functional from focal mechanical pattern.
- More surgery is not automatic; deterioration or focal evidence changes route.

### P2 — подозрение на утечку анастомоза/септический перитонит

- Emergency; fever/hypothermia, abdominal pain/distension, wound drainage, deterioration after initial recovery.
- Fluid analysis/imaging and surgical revision referral immediately.
- Normal earlier check does not cancel new red flag.

### P3 — короткая кишка или длительный нутритивный контроль

- Longitudinal; large resection documented, persistent diarrhea/weight loss.
- Nutrition/support and specialist follow-up; adaptation tracked by weight/MCS and stool.
- Exact diet/drug plan needs review, not code.

## 12. Минимальные безопасные планы

Каждая презентация содержит:

1. perfusion, hydration, pain and aspiration/sepsis flags;
2. suspected location and complete/partial status;
3. multiview radiography and/or ultrasound with limitations;
4. linear/perforation/ischemia evaluation;
5. laboratory/electrolyte preparation;
6. observation eligibility and hard exit criteria, if used;
7. endoscopic vs surgical referral rationale;
8. repeat imaging linked to clock and snapshot;
9. postoperative/nutrition plan;
10. safe referral if equipment/surgery unavailable.

## 13. Экономика, оборудование и время

- X-ray and ultrasound have separate queues, staff skills and daily capacity; one does not unlock the other.
- External emergency imaging/surgery costs more and takes transport time, but correct referral protects clinical reliability.
- Serial observation consumes inpatient bed, staff and repeat imaging; it is not free waiting.
- Endoscopy is separate specialist capability and not automatically cheaper/safer for every location.
- Surgery and postoperative care create multi-day resource use and possible complication costs.
- Owner budget can select the most informative first imaging in a stable case, but cannot justify unsafe waiting with
  linear/perforation/shock signs.

## 14. Владелец, темперамент и персонал

- Owner may deny ingestion; diagnosis remains based on imaging and clinical evidence.
- Anxious owner may demand surgery for any object; clinician explains passage eligibility and exit criteria.
- Aggressive/painful patient needs low-stress restraint/sedation/referral, not incomplete imaging labeled negative.
- Technician tracks vitals, vomiting, intake/output and serial timing; doctor/surgeon interprets intervention need.
- All external reports and postoperative visits reuse the same patient/episode.

## 15. Валидатор противоречий

Ветка отклоняется, если:

- наличие стула исключает partial obstruction;
- witnessed ingestion automatically defines location/treatment;
- one radiographic view is called complete imaging;
- normal radiograph always excludes radiolucent/partial obstruction;
- visible string is pulled from mouth/anus by generic action;
- linear/perforation case gets home observation;
- object movement is randomized after player decision;
- observation has no serial imaging/clinical exit criteria;
- functional ileus and mechanical obstruction are merged;
- mass automatically equals cancer;
- procedure, drug, dose, contrast technique or surgery is generated by code;
- x-ray/ultrasound/endoscopy work without equipment/staff/dependencies;
- external intervention happens instantly;
- reload resets time or progression;
- postoperative complication becomes a new unrelated patient;
- owner refusal hides shock/peritonitis/ischemia without safe referral.

## 16. Источники

- Merck Veterinary Manual, Gastrointestinal Obstruction in Small Animals:
  <https://www.merckvetmanual.com/digestive-system/surgical-problems-of-the-gastrointestinal-tract-in-small-animals/gastrointestinal-obstruction-in-small-animals>
- American College of Veterinary Surgeons, Gastrointestinal Foreign Bodies:
  <https://www.acvs.org/small-animal/gastrointestinal-foreign-bodies/>
- American College of Veterinary Surgeons, Intussusception:
  <https://www.acvs.org/small-animal/intussusception/>
- Imaging of gastrointestinal foreign body obstructions in dogs and cats:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC13137067/>
- ACVR/ECVDI consensus on abdominal ultrasound standardization:
  <https://onlinelibrary.wiley.com/doi/full/10.1111/vru.13151>

Конкретные препараты, дозы, инфузионные скорости, вызов рвоты, контрастный протокол, эндоскопическая/хирургическая
техника и aftercare-протокол этим файлом не утверждаются. После отдельного ветеринарного review они подключаются как
версионированные протоколы; код их не генерирует.
