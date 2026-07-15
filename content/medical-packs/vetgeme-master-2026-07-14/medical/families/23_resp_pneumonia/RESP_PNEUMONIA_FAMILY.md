# Семейство 23 — пневмония и аспирация

Статус: `source_checked_pending_veterinary_review`

Generator eligibility: `false`

Виды первой версии: собака, кошка

Базовых вариантов: 5

Authored presentation branches: 15

## 1. Граница семейства

Пневмония — не синоним кашля и не автоматическое показание к антибактериальному лечению. В игру входят воспаление
лёгочной паренхимы с бактериальным, аспирационным, грибковым, паразитарным или воспалительным механизмом, а также
заболевания, которые создают похожую клиническую или рентгенологическую картину.

Семейство различает:

- бактериальную бронхопневмонию;
- аспирационный пневмонит и вторичную бактериальную аспирационную пневмонию;
- тяжёлое гипоксемическое/септическое течение;
- небактериальные причины и имитации;
- нормальное разрешение и неразрешающийся процесс.

Инфекция часто вторична. Поэтому обнаружить пневмонию недостаточно: authored truth отдельно хранит её механизм,
тяжесть и первичную проблему — регургитацию, дисфагию, анестезию, инородное тело, иммунодефицит, хроническое заболевание
дыхательных путей или региональную инфекцию.

## 2. Генераторная модель

Это не пять фиксированных пациентов. Генератор выбирает совместимые вид, возраст, источник поступления, владельца,
темперамент, бюджет и доступность оборудования, но не сочиняет причинную связь. Authored-template заранее связывает:

- начало и динамику дыхательных признаков;
- частоту и усилие дыхания в покое;
- кислородный статус и переносимость манипуляций;
- температуру, системные признаки и критерии сепсиса;
- историю рвоты, регургитации, кормления, анестезии или нарушения глотания;
- локализацию и динамику рентгенологических изменений;
- цитологию, культуру и чувствительность нижних дыхательных путей, если sampling допустим;
- возможную небактериальную причину или имитатор;
- ответ на поддержку и утверждённый план;
- контроль первичного заболевания и риск повторной аспирации.

При reload насыщение, рентгенологический pattern, culture truth и причина не меняются. Ранний снимок может быть
неубедительным только в заранее написанной ветке; это не случайная ошибка рендера или лаборатории.

## 3. Общие вопросы и authored-ответы

| Вопрос | Допустимые типы ответа | Клиническая роль |
|---|---|---|
| Когда начались кашель/тахипноэ/слабость? | Время, дата, постепенно, неизвестно | Темп и срочность |
| Как дышит во сне или полном покое? | Измеренная частота, видео, не считали | Домашняя оценка без стрессового завышения |
| Есть ли усилие, синюшность, обморок? | Да/нет/не уверен | Emergency oxygen route |
| Были ли рвота или регургитация? | Что, когда, пассивно/с усилием, неизвестно | Aspiration source |
| Был ли наркоз, принудительное кормление или жидкое лекарство? | Дата, способ, нет | Iatrogenic aspiration risk |
| Есть ли дисфагия, мегаэзофагус, кашель при еде? | Подтверждено/подозрение/нет | Recurrent aspiration route |
| Были ли гостиница, приют, скученность или больные животные? | Да/нет/даты | Infectious context, not diagnosis |
| Есть ли поездки и региональные экспозиции? | География/среда/нет | Fungal/parasitic eligibility |
| Что уже получал пациент? | Название/срок/ответ или неизвестно | Culture interpretation и stewardship |
| Есть ли иммунодефицит или иммуносупрессия? | Подтверждено/нет/не обследовано | Severity и recurrence |
| Улучшается ли аппетит, активность и дыхание? | Дневник/видео/со слов | Longitudinal response |
| Есть ли предыдущее изображение грудной клетки? | Дата/метод/файл/нет | Comparable serial assessment |

Владелец может назвать любой влажный кашель «простудой», а одышку — «усталостью». Клиническая система использует
измерение, осмотр и исследования, не бытовую интерпретацию.

## 4. Первичный триаж

До подробного анамнеза и снимков оцениваются:

- проходимость верхних дыхательных путей;
- частота, усилие и pattern дыхания;
- цвет слизистых, ментальный статус и перфузия;
- pulse oximetry с учётом качества сигнала или внешний blood-gas route;
- температура, пульс, гидратация и признаки сепсиса/шока;
- переносимость фиксации и транспортировки;
- необходимость кислорода, минимизации стресса и срочного стационара.

Цианоз, выраженное усилие, истощение дыхания, коллапс, плохая перфузия, тяжёлая гипоксемия или зависимость от кислорода
переводят случай в emergency. Радиография и sampling не должны ухудшать нестабильного пациента ради заполнения карточки.

## 5. Исследования

| ID | Метод | Capability | Ограничение |
|---|---|---|---|
| `pneumonia_respiratory_triage_and_oxygenation` | RR/effort, слизистые, perfusion, SpO2 | `respiratory_exam`, `pulse_oximetry`, `oxygen` | Стабилизация до длительной диагностики |
| `pneumonia_cbc_biochemistry_and_sepsis_assessment` | CBC, chemistry, perfusion/systemic markers | `cbc`, `biochemistry`, `respiratory_hospital_monitoring` | Не подтверждает этиологию сам по себе |
| `pneumonia_multiview_thoracic_radiography` | Orthogonal views and distribution | `xray_or_referral`, `serial_thoracic_radiography` | Снимок интерпретируется вместе с историей и timing |
| `pneumonia_lower_airway_cytology_culture_and_susceptibility` | TTW/ETW/BAL sample | `lower_airway_sampling_referral`, `respiratory_cytology_culture_external` | До antimicrobial when safe; no harmful delay |
| `pneumonia_blood_culture_when_airway_sampling_is_unsafe` | Blood culture in severe selected cases | `blood_culture_external` | Возможная альтернатива, не идеальная замена BAL |
| `pneumonia_aspiration_source_and_esophageal_swallowing_workup` | Swallow/esophagus/airway source | `aspiration_risk_assessment`, `esophageal_swallowing_workup_external` | После respiratory stabilization |
| `pneumonia_infectious_fungal_parasitic_or_inflammatory_workup` | Region/exposure-directed testing | `respiratory_infectious_panel_external`, `respiratory_fungal_testing_external` | Только совместимая эпидемиология |
| `pneumonia_serial_clinical_hematologic_and_imaging_reassessment` | Clinical, CBC and x-ray response | `pneumonia_longitudinal_monitoring` | Не требует «идеального снимка» при клиническом улучшении |
| `pneumonia_nonresolving_advanced_airway_or_imaging_referral` | Bronchoscopy/CT/advanced workup | `advanced_imaging_referral`, `airway_endoscopy_referral` | При локальном, рецидивирующем или неразрешающемся процессе |

## 6. `resp_pneumonia_bacterial_bronchopneumonia`

Истина: клинические, рентгенологические и при возможности lower-airway данные поддерживают бактериальную инфекцию
лёгких. Бактерия может быть первичной, но чаще процесс вторичен.

### P1 — fever, cough and alveolar pattern

- Priority/urgent; кашель с лихорадкой, вялостью, снижением аппетита или тахипноэ и совместимым alveolar pattern.
- CBC и thoracic radiographs; lower-airway cytology/culture до лечения, если пациент стабилен.
- Поддержка и reviewed antimicrobial protocol выбираются по тяжести и результатам, но код не генерирует препарат или дозу.

### P2 — secondary after airway or viral disease

- Priority; ухудшение после upper-airway/CIRDC-like периода, новый fever/systemic illness или lower-airway signs.
- Вирусная/скученная среда не доказывает бактерию; появление pneumonia evidence меняет ветку.
- Isolation and regional/infectious context сохраняются вместе с bacterial workup.

### P3 — recurrent or immunocompromised patient

- Urgent/complex; повторные эпизоды, необычная тяжесть или слабый ответ.
- Ищутся иммунодефицит, бронхоэктазы, ciliary disorder, airway collapse, foreign body, neoplasia или aspiration source.
- Бесконечная смена эмпирических препаратов без source workup считается небезопасной.

## 7. `resp_pneumonia_aspiration`

Истина: есть совместимая aspiration event или постоянный риск. Раннее воспаление может быть прежде всего chemical
pneumonitis; вторичная бактериальная инфекция не считается автоматической.

### P1 — after vomiting, regurgitation, anesthesia or feeding

- Priority/urgent by breathing; timed event precedes tachypnea/cough/lethargy.
- Stabilization, oxygen as needed and thoracic assessment; bacterial evidence is evaluated separately.
- Force-feeding/mineral oil/liquid medication/anesthesia history is a risk, not owner blame.

### P2 — recurrent aspiration from esophageal or swallowing disease

- Complex/urgent; megaesophagus, dysphagia, laryngeal/pharyngeal dysfunction or cough with eating.
- Pneumonia and underlying source are two linked episodes; discharge without feeding/position/referral plan is incomplete.
- Recurrent aspiration is not generated as random non-adherence when physiology explains it.

### P3 — early or equivocal imaging with clinical progression

- Priority; convincing event and new respiratory abnormality, but first radiographs are normal/equivocal or changes evolve.
- Reassessment timing and repeat imaging are authored; instability gets treatment/referral before waiting.
- A single early negative image does not erase the aspiration event, while history alone does not prove bacterial infection.

## 8. `resp_pneumonia_severe_hypoxemic`

Истина: pulmonary disease produces dangerous oxygenation/ventilatory compromise or systemic sepsis. The safe action is
stabilization and high-level care, not completing every diagnostic branch locally.

### P1 — increased effort, cyanosis or low oxygenation

- Emergency; marked effort, cyanosis, mental change or reliable low oxygenation.
- Oxygen, minimal handling, continuous monitoring and urgent imaging/sampling only when safe.
- A calm-looking exhausted patient can be more dangerous than a loudly coughing stable patient.

### P2 — sepsis, shock or multilobar disease

- Emergency; perfusion abnormality, systemic illness and extensive pulmonary pattern.
- Culture is sought without delaying immediate reviewed treatment; blood culture may be considered when airway sampling is unsafe.
- Hospital/referral capacity, not owner patience, controls disposition.

### P3 — oxygen-dependent or ventilatory failure

- Emergency; cannot maintain acceptable oxygenation off support, worsening fatigue or gas-exchange failure.
- Intensive-care and mechanical-ventilation referral route is visible before local capacity is exceeded.
- Ventilator settings, intubation and drug protocols are never generated by UI.

## 9. `resp_pneumonia_nonbacterial_or_mimic`

Истина: pneumonia-like signs or imaging have a fungal, parasitic, protozoal, inflammatory or noninfectious explanation.
Compatibility is based on species, geography, exposure and authored findings.

### P1 — fungal or regional exposure pattern

- Priority/complex; chronic/systemic signs, nodular/interstitial/alveolar changes or relevant region/exposure.
- Region filter controls eligible testing; negative generic bacterial culture does not itself prove fungus.
- Specific therapy remains a reviewed protocol after organism-focused workup.

### P2 — eosinophilic, parasitic or inflammatory pattern

- Priority/complex; exposure/eosinophilia/airway findings direct parasite or inflammatory workup.
- CBC alone does not determine the diagnosis; cytology/imaging/external tests define the branch.
- Immunosuppression before excluding important infection is an unsafe option.

### P3 — edema, hemorrhage, neoplasia or other mimic

- Urgent/complex; cardiac disease, coagulopathy, trauma, neoplasia or other pattern competes with infection.
- Dangerous alternative remains visible; repeated antimicrobials cannot replace cardiac/coagulation/advanced imaging workup.
- This branch links to the appropriate family once the discriminator is obtained.

## 10. `resp_pneumonia_followup_or_nonresolving`

Истина: clinical response, blood trends and imaging do not have to normalize simultaneously. The plan follows patient
stability and evidence, not a fixed number of days generated by code.

### P1 — clinical response with planned reassessment

- Follow-up; appetite/activity/respiratory effort improve and objective trend is compatible.
- Review no later than the authored checkpoint; continuation/de-escalation uses clinical, hematologic and radiographic data.
- Radiographic lag alone does not force endless treatment when reviewed stopping criteria are met.

### P2 — culture resistance or incorrect initial assumption

- Priority follow-up; inadequate improvement, deterioration or susceptibility mismatch.
- Sample quality, adherence, primary disease and diagnosis are reassessed before escalation.
- Broadening treatment without evidence carries stewardship, cost and adverse-outcome penalties.

### P3 — persistent focus, foreign body, bronchiectasis or underlying disease

- Complex/urgent by state; focal/recurrent lesion or repeated same-lobe disease.
- Advanced imaging, bronchoscopy/airway sampling and source control/referral become the safe route.
- A new random animal or unrelated pneumonia cannot replace the due follow-up.

## 11. Минимальные безопасные планы

Каждая презентация содержит:

1. respiratory stability and oxygen flag;
2. safe handling/monitoring level;
3. thoracic imaging route without destabilizing delay;
4. systemic/CBC assessment appropriate to severity;
5. culture/cytology route when feasible and meaningful;
6. aspiration/infectious/underlying-cause branch;
7. full, staged and minimum-safe support plan;
8. hospital/ICU/referral threshold;
9. authored reassessment target and red flags;
10. source control and recurrence prevention.

## 12. Экономика, оборудование и время

- Oxygen place, pulse oximeter, monitor, x-ray, lab and isolation are limited independent resources.
- A stable patient can use scheduled imaging/sampling; an unstable patient reserves oxygen and urgent referral capacity.
- Lower-airway sampling and external culture have delay and sample-quality risk; results return to the same episode.
- Serial radiography is a planned longitudinal cost, not repeated daily by default.
- Treating the aspiration source may cost more than the initial lung visit but prevents authored recurrence.
- Expensive tests without compatible geography/exposure lose value; safe minimum plans remain available.

## 13. Владелец, темперамент и персонал

- A fearful dyspneic animal cannot be forced through every exam; low-stress handling and observation are legitimate actions.
- Owner anxiety rises with visible breathing effort; a clear stabilization/referral explanation matters more than a long lecture.
- Blame language after force-feeding or a post-anesthetic event is prohibited; the system asks what happened and prevents recurrence.
- Trained staff can count resting respiratory rate, monitor oxygenation, maintain oxygen/isolation and record response.
- Doctor owns interpretation and plan; advanced airway procedures belong to trained referral staff.

## 14. Валидатор противоречий

Ветка отклоняется, если:

- any cough or upper respiratory infection is labeled pneumonia;
- any aspiration event automatically becomes bacterial infection;
- any pneumonia automatically receives the same antimicrobial plan;
- early negative radiographs erase a compatible evolving aspiration branch;
- chest radiography or BAL delays oxygen/stabilization in an unstable patient;
- oropharyngeal/nasal swab is treated as a reliable lower-airway culture substitute;
- blood culture is presented as a perfect BAL replacement;
- geographic fungal/parasitic content appears without regional compatibility;
- one CBC value determines bacterial, fungal or inflammatory etiology;
- failure to improve triggers endless random escalation without source review;
- clinical improvement requires complete radiographic normalization before any reviewed plan change;
- specific drug, dose, duration, ventilation setting or sampling technique is generated by code;
- external culture/imaging/referral returns instantly;
- missing oxygen/monitoring capability has no emergency referral route;
- recurrent aspiration is detached from the same patient and underlying cause.

## 15. Источники

- ISCAID Antimicrobial Use Guidelines for Respiratory Tract Disease in Dogs and Cats:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC5354050/>
- Merck Veterinary Manual, Pneumonia in Dogs and Cats:
  <https://www.merckvetmanual.com/respiratory-system/respiratory-diseases-of-small-animals/pneumonia-in-dogs-and-cats>
- Bacterial infection in dogs with aspiration pneumonia at two tertiary referral practices:
  <https://pubmed.ncbi.nlm.nih.gov/34751462/>
- Clinical, clinicopathologic, and radiographic findings in dogs with aspiration pneumonia:
  <https://pubmed.ncbi.nlm.nih.gov/19046033/>

Конкретные препараты, дозы, длительность курса, кислородные targets, техника airway sampling, интубации и вентиляции
этим файлом не утверждаются. После отдельного ветеринарного review они подключаются как версионированные протоколы;
код их не генерирует.
