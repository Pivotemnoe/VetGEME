# Семейство 20 — хроническая энтеропатия

Статус: `source_checked_pending_veterinary_review`

Generator eligibility: `false`

Виды первой версии: собака, кошка

Базовых вариантов: 6

Authored presentation branches: 18

## 1. Граница семейства

Хроническая энтеропатия — группа заболеваний с длительными или повторяющимися рвотой, диареей, изменением аппетита и
потерей массы. Слово «IBD» не назначается по одним симптомам и не используется как универсальный диагноз после одного
отрицательного анализа кала.

Семейство различает:

- пищевой ответ;
- воспалительную энтеропатию тонкой кишки;
- энтеропатию с потерей белка (PLE);
- хронический толстокишечный колит;
- кошачью сочетанную GI/гепатобилиарно-панкреатическую болезнь;
- рефрактерный случай или заболевание-имитатор.

Игрок проходит ступенчатую диагностику: клиника и питание → паразиты/базовая лаборатория → полноценные диетические
пробы → функциональные маркеры/УЗИ → эндоскопия/биопсия, если тяжесть или отсутствие ответа это оправдывают. Тяжёлый PLE
или быстрое ухудшение не заставляют ждать несколько последовательных диет прежде чем двигаться дальше.

## 2. Генераторная модель

Это не шесть фиксированных животных. Генератор выбирает совместимые вид, возраст, рацион, дом, владельца, бюджет и
темперамент, но authored-истина задаёт единый набор:

- локализацию GI-признаков и chronicity;
- массу, BCS/MCS и activity score;
- albumin/total protein, CBC/biochemistry/urine;
- паразитарные/инфекционные результаты;
- cobalamin/folate, TLI/PLI по показаниям;
- УЗИ и histology, если они доступны;
- конкретную диету, критерии эксклюзивности и клинический ответ;
- comorbidity/evidence graph;
- repeat outcome.

Результат диетической пробы определяется authored-веткой при создании пациента. Он не выбирается после того, как игрок
решил, какую диету купить.

## 3. Общие вопросы и authored-ответы

| Вопрос | Допустимые типы ответа | Клиническая роль |
|---|---|---|
| Сколько длится и бывает ли нормальный период? | Недели/месяцы; постоянно/волнами | Chronicity и оценка ответа |
| Что преобладает: рвота или диарея? | Одно/оба/изменение аппетита | Локализация и differential |
| Как выглядит стул? | Объёмный/частый, слизь, свежая кровь, мелена, жирный | Тонкая/толстая кишка, кровопотеря, EPI |
| Как менялись масса и мышцы? | Стабильно, постепенно/быстро теряет | Severity, PLE, neoplasia |
| Полный рацион за последние месяцы? | Основной корм, лакомства, стол, добавки, доступ к чужой миске | Выбор и валидность diet trial |
| Какие диеты пробовали и строго ли? | Название/срок/эксклюзивность, неизвестно | «Меняли корм» не равно diagnostic trial |
| Были ли паразитарные тесты и каким методом? | Флотация/PCR/антиген/неизвестно | Chronic mimic и ограничения теста |
| Есть ли отёки или увеличение живота? | Да/нет | Hypoalbuminemia/PLE/другая жидкость |
| Есть ли PU/PD, кашель, желтуха, боль? | Нет/один/несколько | Внекишечные и сочетанные болезни |
| Какие лекарства уже были? | Полный список/срок/ответ, неизвестно | Искажённые тесты и antimicrobial stewardship |
| Есть ли домашние животные с симптомами? | Нет/есть/неизвестно | Инфекционный/паразитарный контекст |
| Может ли владелец строго вести журнал/диету? | Да, ограничения, нет | Реалистичная ветка и экономика |

Если владелец не помнит рацион, допустимы фото упаковок, история заказов и список всех членов семьи. Скрытый кусок сыра,
лакомство с лекарством или доступ к кошачьей миске являются данными о комплаенсе, а не случайной шуткой.

## 4. Осмотр и severity

Минимум:

- масса, BCS и MCS с динамикой;
- гидратация, температура, перфузия;
- рот/зубы, кожа/шерсть и общая нутритивность;
- абдоминальная боль, утолщение/масса/жидкость;
- периферический отёк или асцит;
- ректальный/перианальный осмотр по толстокишечным признакам;
- фактический clinical activity score одинаковым методом;
- признаки панкреатита, печени, CKD, эндокринной/онкологической болезни.

Тяжёлая гипоальбуминемия с выпотом/отёком, шок, неконтролируемая рвота, мелена/анемия, обструкция, выраженная боль или
быстрое похудение повышают срочность и сокращают эмпирические ступени.

## 5. Исследования

| ID | Метод | Capability | Ограничение |
|---|---|---|---|
| `chronic_enteropathy_timeline_diet_and_fecal_character` | Хронология, стул, полный рацион | `comprehensive_diet_history` | Без всех лакомств/доступов diet trial невалиден |
| `chronic_enteropathy_nutritional_and_activity_score` | Вес, BCS/MCS, activity index | `nutritional_assessment`, `chronic_gi_activity_score` | Повтор использует ту же шкалу |
| `chronic_enteropathy_cbc_biochemistry_urinalysis` | Анемия, albumin, печень/почки, электролиты, моча | `cbc`, `biochemistry`, `electrolytes`, `urinalysis` | Исключает внекишечную потерю/осложнения, не подтверждает CIE отдельно |
| `chronic_enteropathy_fecal_parasite_and_pathogen_workup` | Флотация, антиген/PCR по риску | `fecal_flotation_centrifugal`, `fecal_pathogen_panel_external` | Положительный организм требует клинической интерпретации |
| `chronic_enteropathy_cobalamin_folate_tli_and_pancreatic_markers` | Малабсорбция, EPI, панкреас | `cobalamin_folate_external`, `tli_external`, `pancreatic_marker_external` | Выбираются по паттерну, не универсальной панелью |
| `chronic_enteropathy_albumin_and_protein_loss_localization` | Albumin, urine/liver, fecal A1PI | `hypoalbuminemia_monitoring`, `fecal_alpha1_protease_inhibitor_external` | PLE требует исключения почечной/печёночной причины |
| `chronic_enteropathy_abdominal_ultrasound` | Слои кишки, узлы, печень/панкреас, жидкость | `ultrasound_or_referral`, `gi_ultrasound_external` | Нормальное УЗИ не исключает микроскопическую болезнь; операторозависимо |
| `chronic_enteropathy_exclusive_diet_trials` | Выбранная therapeutic diet и журнал | `diet_trial`, `diet_trial_compliance_log` | Exclusivity, adequate duration и weekly response обязательны |
| `chronic_enteropathy_endoscopy_biopsy_and_histopathology` | GI sites, число/качество проб, WSAVA report | `gi_endoscopy_referral`, `gi_histopathology_external` | Биопсия имеет sampling/interpretation limits и не отменяет clinical response |

## 6. `chronic_enteropathy_food_responsive`

Истина: хронические GI-признаки у стабильного пациента существенно ремиттируют на полноценной эксклюзивной therapeutic
diet и возвращаются/остаются контролируемыми в соответствии с authored follow-up.

### P1 — хроническая диарея, пациент стабилен для диетической пробы

- Routine/priority; нет тяжёлой потери массы, hypoalbuminemia или systemic red flag.
- Паразиты/базовая лаборатория по риску, затем диета выбирается из полной diet history.
- Weekly score и эксклюзивность required; отсутствие немедленного ответа через два дня не считается провалом.

### P2 — рвота или смешанные признаки при сложной истории питания

- Priority; несколько кормов/лакомств, предыдущие «пробы» были короткими или неэксклюзивными.
- Выбирается отличающийся therapeutic category, владелец получает список разрешённого/запрещённого по approved plan.
- Если кошка/собака перестаёт есть, диета не продолжается ценой анорексии.

### P3 — клинический ответ требует доказанной эксклюзивности

- Follow-up; score, стул/рвота и масса объективно улучшились при подтверждённом соблюдении.
- Ответ является диагностически значимым; автоматическая эндоскопия/иммуносупрессия не требуется.
- Срок поддержания и challenge/transition решаются reviewed protocol, не кодом.

## 7. `chronic_enteropathy_inflammatory_small_intestinal`

Истина: хроническая тонкокишечная энтеропатия сохраняется после разумного исключения имитаторов и адекватных диетических
проб; inflammation может быть поддержана биопсией, но гистология интерпретируется вместе с клиникой.

### P1 — потеря массы и тонкокишечная диарея

- Priority; большой объём/потеря массы, возможна рвота, но albumin не критично низок.
- CBC/chem/urine, кал, cobalamin/TLI по паттерну, УЗИ и diet trial plan.
- Early specialist referral допустим при возрасте, imaging или быстром снижении массы.

### P2 — адекватные диетические пробы не дали ремиссии

- Priority/follow-up; documented exclusivity/duration/score подтверждают failure нескольких разумных категорий.
- Перепроверяются паразиты, EPI, эндокринные/панкреатические/печёночные причины, затем endoscopy/biopsy по показаниям.
- Случай не получает бесконечную случайную смену корма.

### P3 — биопсия поддерживает воспалительную энтеропатию

- Resulted/follow-up; sites/quality/WSAVA-style report и clinical pattern согласованы.
- Histology severity не автоматически равна clinical severity; plan/outcome оцениваются по пациенту.
- Конкретная иммуномодуляция и дозы остаются reviewed protocol.

## 8. `chronic_enteropathy_protein_losing`

Истина: hypoalbuminemia обусловлена enteric loss после исключения почечной, печёночной и значимой кровопотери; причина
может включать inflammatory disease, lymphangiectasia или другую инфильтрацию.

### P1 — hypoalbuminemia, потеря массы и мышц

- Urgent/priority; низкий albumin, плохой BCS/MCS, хроническая диарея/рвота.
- Urine protein, liver function/context и bleeding loss проверяются; nutritional assessment required.
- Тяжесть сокращает число эмпирических ступеней и ускоряет GI referral.

### P2 — отёк, асцит или тромботический риск

- Urgent/emergency по дыханию/перфузии; жидкость/отёк и тяжёлая hypoalbuminemia.
- Fluid characterization/imaging, coagulation/thrombotic assessment и hospital/specialist route.
- Конкретная антитромботическая/инфузионная схема не генерируется.

### P3 — lymphangiectasia или тяжёлая mucosal disease

- Priority; imaging/histology поддерживают лимфатический/диффузный процесс.
- Диета и другое ведение зависят от phenotype и review; «низкожировой всем» не создаётся кодом.
- Serial albumin, weight/MCS и clinical score являются outcome.

## 9. `chronic_enteropathy_large_bowel_colitis`

Истина: хронические частые малые порции, слизь, свежая кровь и тенезмы локализуют толстую кишку, но не определяют причину.

### P1 — слизь, свежая кровь и тенезмы

- Priority/routine; состояние и масса могут быть сохранны.
- Ректальный осмотр, паразиты/патогены, diet/fiber history required; мелена переводит к другой локализации.
- Не назначается системная тяжёлая терапия по одной свежей крови без severity.

### P2 — пищевой или fiber-responsive колит

- Follow-up; documented therapeutic diet/fiber strategy улучшает weekly score.
- Конкретный состав/количество после nutrition review; неподходящая случайная добавка не считается полноценной пробой.
- Рецидив при нарушении diet log связывается с комплаенсом, а не новой случайной болезнью.

### P3 — тяжёлый breed-/histology-specific колит

- Priority/urgent; молодой predisposed dog или тяжёлая кровь/потеря массы, базовый путь не помог.
- Targeted culture/molecular/histology specialist route по approved phenotype; breed не создаёт диагноз.
- Антимикробное лечение допускается только при специфически подтверждённой ветке и review.

## 10. `chronic_enteropathy_feline_multisystem`

Истина: у кошки хроническая рвота/потеря массы может сосуществовать с панкреатитом, холангитом или другой болезнью. Термин
«триадит» не создаёт три диагноза без evidence.

### P1 — хроническая рвота, потеря массы или изменение аппетита

- Priority; «кошки иногда рвут» не нормализует повторные симптомы.
- T4, renal/diabetes, паразиты, cobalamin, imaging и diet trial выбираются по возрасту/клинике.
- Обеспечивается питание; анорексия повышает срочность.

### P2 — есть evidence кишечника, желчных путей или панкреаса

- Priority; каждая система имеет отдельные authored результаты.
- План приоритизирует угрозы и совместимость; один положительный PLI не доказывает весь кластер.
- Biopsy/sampling route определяется специалистом и безопасностью.

### P3 — hypocobalaminemia и нутритивное снижение

- Priority; low cobalamin и weight/MCS loss поддерживают малабсорбцию/дисбиозный контекст, но не этиологию.
- Коррекция и мониторинг — reviewed protocol; основное заболевание всё равно исследуется.
- Повтор оценивает клинику/массу и лабораторию по appropriate interval.

## 11. `chronic_enteropathy_refractory_or_mimic`

Истина: симптомы сохраняются, потому что исходная гипотеза неверна, имитатор не исключён или болезнь действительно
рефрактерна. «Рефрактерная IBD» не присваивается до аудита всего staged path.

### P1 — паразит, инфекция или EPI не исключены

- Priority/follow-up; тест был неправильным/одиночным или TLI не выполнен при совместимом стуле/похудении.
- Targeted repeat/panel выполняется до более опасной иммуносупрессии.
- Положительный результат переводит в своё семейство и сохраняет историю.

### P2 — УЗИ/биопсия вызывает concern лимфомы

- Priority; focal mass, потеря слоёв, узлы или ambiguous histology.
- Adequate multi-site sampling, immunophenotyping/clonality только по specialist decision; ни один тест не читается отдельно.
- Oncology route сохраняет GI supportive/nutrition care.

### P3 — признаки сохраняются после полного staged workup

- Priority; диеты выполнены, mimics/structure/histology задокументированы, response неудовлетворительный.
- Проверяются комплаенс, pathology quality, co-disease и treatment adverse effects; specialist plan versioned.
- Код не генерирует случайную комбинацию антибиотика/стероида/добавок.

## 12. Минимальные безопасные планы

Каждая презентация содержит:

1. chronicity, localization и severity;
2. вес, BCS/MCS и activity score;
3. complete diet history;
4. parasite/pathogen and systemic mimic status;
5. albumin/protein-loss localization;
6. выбранную staged diagnostic step;
7. diet trial с exclusivity/duration/weekly outcome, если безопасно;
8. nutrition plan и red flags;
9. specialist/biopsy criteria;
10. repeat timeline и safe referral.

## 13. Экономика, оборудование и время

- Диетическая проба — не покупка одной миски: нужны рацион, журнал, обучение и повторные weekly scores.
- Внешние cobalamin/TLI/PLI/pathogen/A1PI имеют разные turnaround и не продаются универсальной «GI-панелью всем».
- УЗИ, endoscopy и histology являются отдельными услугами; собственная endoscopy требует позднего equipment/staff project.
- Stable food-responsive case не должен проигрывать дорогой биопсии, а severe PLE не должен ждать дешёвые последовательные
  эксперименты.
- Longitudinal revenue строится на мониторинге массы/ответа и корректировке плана, не на бесконечном повторе всех анализов.

## 14. Владелец, темперамент и персонал

- Владелец с несколькими животными получает физически выполнимый план раздельного кормления.
- Ограниченный бюджет допускает staged plan, если нет severe hypoalbuminemia/mass/bleeding red flag.
- Техник может собрать diet history, вес/MCS и weekly score после обучения; диагноз/biopsy decision остаются врачу.
- Боязливый пациент получает low-stress imaging/referral; отсутствие пальпации не создаёт отрицательный живот.
- Внешние результаты и diet outcome возвращаются в тот же episode и не регенерируют пациента.

## 15. Валидатор противоречий

Ветка отклоняется, если:

- «IBD» поставлена по одним хроническим симптомам;
- один отрицательный кал исключает всех паразитов/патогенов;
- «сменили корм» считается diet trial без состава, срока и exclusivity;
- результат diet trial выбирается после решения игрока;
- тяжёлый PLE обязан пройти несколько диет до specialist workup;
- hypoalbuminemia названа PLE без urine/liver/bleeding localization;
- нормальное УЗИ исключает микроскопическую enteropathy;
- histology читается без sites/quality/clinical context;
- слово «триадит» создаёт неподтверждённые diagnoses;
- breed автоматически создаёт severe colitis;
- lymphoma исключена одним неоднозначным biopsy report;
- препарат, доза, конкретный рацион/состав или biopsy technique созданы кодом;
- endoscopy доступна только потому, что нарисована комната;
- внешний result появляется мгновенно или меняется после reload;
- owner refusal скрывает severe protein loss/mass/bleeding без safe referral.

## 16. Источники

- ACVIM-endorsed 2026 Consensus Statement on Chronic Inflammatory Enteropathy in Dogs:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC12881957/>
- Merck Veterinary Manual, Chronic Enteropathies in Small Animals:
  <https://www.merckvetmanual.com/digestive-system/diseases-of-the-small-intestine-in-small-animals/chronic-enteropathies-in-small-animals>
- WSAVA Gastrointestinal Guidelines:
  <https://wsava.org/Global-Guidelines/Gastrointestinal-Guidelines/>
- Canine Chronic Enteropathy — current state of the art:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC9534534/>
- Comparative pathophysiology of protein-losing enteropathy:
  <https://pubmed.ncbi.nlm.nih.gov/30762910/>

Конкретные препараты, дозы, интервалы, рецептуры/состав терапевтических рационов, эндоскопическая техника и число/место
биопсий этим файлом не утверждаются. После отдельного ветеринарного review они подключаются как версионированные
протоколы; код их не генерирует.
