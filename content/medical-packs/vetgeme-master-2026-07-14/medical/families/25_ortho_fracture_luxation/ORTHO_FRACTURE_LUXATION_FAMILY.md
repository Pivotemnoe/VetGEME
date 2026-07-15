# Семейство 25 — переломы и вывихи

Статус: `source_checked_pending_veterinary_review`

Generator eligibility: `false`

Виды первой версии: собака, кошка

Базовых вариантов: 7

Authored presentation branches: 21

## 1. Граница семейства

Перелом или вывих рассматривается как травма всего пациента, а не как отдельный снимок лапы. Сила, достаточная для
повреждения кости или крупного сустава, может одновременно повредить грудную клетку, мочевую систему, нервы, сосуды и
мягкие ткани. Обезболивание и безопасная временная стабилизация начинаются до окончательного выбора фиксации.

Семейство различает стабильные и нестабильные переломы, открытые повреждения, суставные/ростковые травмы, таз/осевой
скелет, вывихи и осложнения сращения/ремонта. Конкретная операция, имплант и техника вправления выбираются только
проверенным хирургическим протоколом или специалистом.

## 2. Генераторная модель

Это не семь фиксированных животных. Генератор выбирает совместимые mechanism, species, age, body size, owner, temperament
и бюджет, но authored truth заранее фиксирует:

- whole-patient injuries and stability;
- bone/joint, side, segment and fracture configuration;
- open/closed status and soft-tissue grade;
- neurologic and distal neurovascular status;
- joint and growth-plate involvement;
- imaging views and associated lesions;
- temporary support eligibility and contraindications;
- referral urgency and broad repair category;
- healing trajectory, restriction, recheck and complications.

Положение отломков, открытость, perfusion и неврологический статус не меняются после reload. Нельзя случайно «улучшить»
перелом после того, как игрок выбрал дешёвый ответ.

## 3. Общие вопросы и authored-ответы

| Вопрос | Допустимые типы ответа | Клиническая роль |
|---|---|---|
| Что произошло и когда? | ДТП/падение/драка/не видел/без травмы | Energy and pathologic risk |
| Мог ли пациент ходить после события? | Да/нет/несколько шагов/не проверяли | Function, not fracture exclusion |
| Есть ли рана рядом с больным местом? | Да/нет/не осматривали | Open fracture until assessed |
| Менялся ли цвет/температура лапы? | Да/нет/не замечено | Perfusion risk |
| Двигает ли пальцами, чувствует ли лапу? | Наблюдение/не проверяли | Neurologic route, not owner test mandate |
| Были ли проблемы до травмы? | Хромота/опухоль/операция/нет | Pathologic or implant issue |
| Есть ли мочеиспускание/дефекация после тазовой травмы? | Да/нет/неизвестно | Urinary/rectal/neurologic injury |
| Давали ли обезболивающее дома? | Название/время/нет/неизвестно | Safety and interpretation |
| Наложена ли шина/повязка? | Кем/когда/как выглядит | Iatrogenic pressure risk |
| Может ли семья соблюдать ограничение активности? | Да/барьеры/нет | Feasible aftercare route |
| Есть ли старые снимки/импланты? | Дата/файл/нет | Comparison and complication |
| Каков финансовый предел сейчас? | Диапазон/поэтапно/не знает | Stabilize-and-refer remains mandatory |

## 4. Первичный триаж

До ортопедических манипуляций:

- airway, breathing, circulation and hemorrhage;
- chest/abdomen/urinary and neurologic screen after major trauma;
- pain and shock;
- open wounds with sterile protective cover;
- limb alignment without repeated crepitation testing;
- distal pulse/perfusion, temperature, sensation and motor function;
- safe transport, analgesia and temporary support.

Life-threatening trauma takes precedence over limb radiographs. Absent perfusion, uncontrolled bleeding, open/high-energy
injury, spinal/urinary deficit or severe pain creates urgent/emergency referral.

## 5. Исследования

| ID | Метод | Capability | Ограничение |
|---|---|---|---|
| `fracture_whole_patient_trauma_survey` | ABC, chest/abdomen/urinary screen | `trauma_primary_survey`, `stabilization` | До limb-only tunnel vision |
| `fracture_pain_neurologic_and_neurovascular_assessment` | Pain, motor/sensation, distal perfusion | `pain_assessment`, `neurovascular_limb_assessment` | Before and after support |
| `fracture_open_closed_and_soft_tissue_classification` | Wound communication/contamination | `open_fracture_protocol` | Tiny wound can still communicate |
| `fracture_orthogonal_radiography_and_adjacent_joints` | Two-plane views plus adjacent joints | `fracture_radiographic_planning` | Sedation only when stable; no repeated positioning harm |
| `fracture_cross_sectional_or_surgical_planning_referral` | CT/specialist planning | `advanced_imaging_referral`, `orthopedic_surgery_referral` | Articular/complex anatomy |
| `fracture_temporary_support_and_bandage_monitoring` | Support, toes/skin/perfusion | `fracture_first_aid_stabilization`, `bandage_splint_monitoring` | Not appropriate for every location |
| `fracture_healing_and_implant_followup` | Clinical/radiographic healing | `fracture_followup_imaging`, `fracture_rehabilitation` | Return to activity only after criteria |
| `fracture_growth_plate_and_alignment_monitoring` | Length/alignment/contralateral comparison | `physeal_growth_monitoring` | Longitudinal through growth |
| `fracture_pathologic_bone_workup` | Bone lesion/systemic/neoplastic workup | `bone_pathology_workup_external` | Biopsy route planned to preserve treatment options |
| `luxation_joint_congruence_and_associated_injury_workup` | Radiographs and joint assessment | `joint_reduction_referral` | Confirm before/after reduction; fracture may change plan |

## 6. `fracture_closed_stable_limb`

### P1 — incomplete or minimally displaced young patient

- Priority; incomplete/minimally displaced configuration with intact perfusion and closed skin.
- Growth potential and stability determine support vs surgical referral; youth does not make every fracture harmless.
- Recheck detects displacement or growth disturbance.

### P2 — distal metacarpal, metatarsal or digit pattern

- Priority/routine by pain; weight-bearing anatomy and number/location of bones determine support suitability.
- A generic paw bandage is not automatically sufficient.
- Skin/toes and alignment are monitored throughout healing.

### P3 — stable after appropriate temporary support

- Follow-up; pain/perfusion improve and alignment is preserved in an eligible location.
- Support is a bridge or selected treatment, not proof of union.
- New swelling, odor, cold toes, slippage or pain triggers urgent reassessment.

## 7. `fracture_unstable_displaced_or_comminuted`

### P1 — displaced long-bone fracture

- Urgent; abnormal alignment, pain and non-weight-bearing with intact/compromised soft tissue documented.
- Analgesia, temporary support if anatomically appropriate and orthopedic referral.
- The UI cannot offer «вправить без снимка» as safe treatment.

### P2 — comminuted high-energy injury

- Emergency/urgent by patient stability; multiple fragments and soft-tissue energy matter more than a simple label.
- Biological fixation, reconstruction or salvage category is specialist-authored.
- Whole-patient injury and contamination are tracked.

### P3 — multiple-limb or multi-level fracture

- Emergency/complex; safe mobility and nursing cannot assume three usable limbs.
- Sequencing, transport and hospitalization capacity are explicit.
- Cheapest single-limb repair cannot hide untreated injuries.

## 8. `fracture_open_or_severe_soft_tissue_injury`

### P1 — small wound communicating with fracture

- Urgent; even a puncture-sized wound near the fracture is assessed for communication.
- Sterile cover, stabilization and prompt surgical/antimicrobial reviewed route.
- The wound is not closed cosmetically before adequate assessment/debridement planning.

### P2 — contaminated crush or high-energy open injury

- Emergency; soft tissue viability, perfusion and contamination drive prognosis and route.
- Repeated debridement/reconstruction or salvage may be needed; technique stays specialist-authored.
- Owner receives staged cost and uncertainty, not guaranteed limb salvage.

### P3 — delayed open fracture with infection risk

- Urgent/complex; delayed presentation, discharge, odor or exposed material.
- Culture/tissue strategy and bone/implant infection workup are explicit.
- Delay is not converted into an unrelated abscess case.

## 9. `fracture_articular_or_physeal`

### P1 — articular surface disruption

- Urgent; joint congruity and cartilage injury make accurate planning important.
- Orthogonal/advanced imaging and specialist referral; arthritis risk remains in outcome.
- A superficially small fragment can be functionally important.

### P2 — juvenile physeal injury

- Urgent; open growth plate and age-specific configuration.
- Alignment/length are monitored beyond initial union.
- Adult-fracture logic cannot be copied without growth consequences.

### P3 — feline capital physeal or slipped epiphysis pattern

- Priority/urgent; cat may have minimal or no remembered trauma and chronic hip lameness.
- Bilateral risk and bone quality are recorded; repair/salvage category depends on chronicity and anatomy.
- Breed/sex risk is not diagnosis.

## 10. `fracture_pelvic_or_axial_trauma`

### P1 — pelvic fracture with weight-bearing assessment

- Urgent/complex; stability, acetabular/weight-bearing involvement and pain determine conservative vs surgical route.
- Thoracic/abdominal concurrent injury is checked first.
- Ability to take steps does not exclude clinically important fracture.

### P2 — urinary, neurologic or rectal risk

- Emergency/urgent; inability to urinate, hematuria, rectal injury, tail/perineal deficits or canal narrowing.
- Imaging and specialist route cover organs and nerves, not bone alone.
- Discharge is unsafe without elimination and neurologic plan.

### P3 — mandibular, spinal or other axial route

- Emergency/urgent by airway/neuro status; site-specific stabilization and referral.
- Jaw trauma preserves occlusion/nutrition considerations; spinal trauma preserves immobilization/neuro priorities.
- Specific fixation technique is not generated.

## 11. `joint_luxation_traumatic_or_developmental`

### P1 — acute hip luxation

- Urgent after whole-patient trauma survey; limb carriage and radiographs confirm direction/associated fracture.
- Closed vs open reduction eligibility depends on timing, hip architecture and damage; specialist route visible.
- Post-reduction imaging, support and reluxation risk remain part of the episode.

### P2 — other joint luxation or subluxation

- Urgent; elbow/shoulder/carpus/tarsus or other joint with neurovascular and fracture assessment.
- «Put it back» is not a free universal action; sedation, imaging and stability matter.
- Ligament injury and rehabilitation are longitudinal.

### P3 — patellar luxation: symptomatic vs incidental

- Routine/priority; grade, frequency, pain, deformity and lameness are separated.
- Asymptomatic incidental cases may be monitored; symptomatic/progressive cases get specialist planning.
- Surgery is not rewarded solely for a higher invoice.

## 12. `fracture_pathologic_delayed_union_or_repair_complication`

### P1 — pathologic fracture without adequate trauma

- Urgent/complex; low-energy fracture or pre-existing swelling/pain.
- Bone lesion, metabolic/infectious/neoplastic causes and staging precede definitive fixation choice.
- Biopsy is planned, not sampled randomly through future surgical planes.

### P2 — delayed union, nonunion or malunion

- Complex follow-up; serial images and clinical function distinguish slow progress from failed biology/mechanics.
- Infection, instability, perfusion and adherence are assessed before blame.
- More time is not the only generated answer.

### P3 — implant, bandage or reluxation complication

- Urgent by perfusion/pain/infection; broken/migrated implant, pressure injury, loss of reduction or reluxation.
- Revision/salvage and wound route are explicit.
- Complication remains linked to original procedure and clinic outcome.

## 13. Минимальные безопасные планы

Каждая презентация содержит whole-patient survey, analgesia, open/closed status, neurovascular findings, imaging route,
temporary stabilization eligibility, referral urgency, owner-feasible restriction, recheck criteria and red flags. Missing
x-ray or surgery always produces safe stabilization/transport/referral, never a dead-end.

## 14. Экономика, оборудование и время

- X-ray, sedation/anesthesia, surgery referral, support materials and rehabilitation are separate costs and queues.
- Temporary support is not billed as definitive repair unless the authored configuration allows it.
- Open/high-energy injuries require staged estimates and uncertain soft-tissue care.
- Monitoring a truly asymptomatic patellar luxation can be correct and cannot lose reputation for «missing a sale».
- Follow-up imaging and activity restriction protect the investment; early unrestricted activity raises authored failure risk.

## 15. Владелец, темперамент и персонал

- Pain/fear affects handling but does not erase neurovascular assessment; sedation/referral is the alternative.
- Staff checks bandage position, exposed toes, skin and owner technique.
- Owner finances change repair/referral options, not the minimum analgesia and safe stabilization.
- Inability to confine a patient is treated as a planning barrier requiring alternatives, not automatic moral failure.

## 16. Валидатор противоречий

Ветка отклоняется, если life-threatening trauma is ignored for limb imaging; open status is inferred only from wound size;
repeated manipulation is used to «confirm» pain; distal perfusion/neuro status is missing; every fracture receives the same
splint; a splint is applied to an anatomically unsuitable injury without referral; any patellar luxation automatically gets
surgery; youth guarantees healing; a pathologic fracture is fixed before cause/staging route; imaging, reduction or surgery
returns instantly; or code generates drugs, doses, implant selection, reduction manoeuvre or operative technique.

## 17. Источники

- Merck Veterinary Manual, Bone Fractures in Dogs and Cats:
  <https://www.merckvetmanual.com/musculoskeletal-system/osteopathies-in-small-animals/bone-fractures-in-dogs-and-cats>
- American College of Veterinary Surgeons, Fractured Limbs:
  <https://www.acvs.org/small-animal/fractured-limbs/>
- Merck Veterinary Manual, Joint Trauma in Dogs and Cats:
  <https://www.merckvetmanual.com/musculoskeletal-system/arthropathies-and-related-disorders-in-small-animals/joint-trauma-in-dogs-and-cats>
- ACVS, Hip Luxation:
  <https://www.acvs.org/small-animal/hip-luxation/>
- ACVS, Femoral Capital Physeal Fractures:
  <https://www.acvs.org/small-animal/femoral-capital-physeal-fractures/>
- ACVS, Patellar Luxations:
  <https://www.acvs.org/small-animal/patellar-luxations/>

Конкретные препараты, дозы, шины, сроки фиксации, импланты, методы вправления и операции этим файлом не утверждаются.
После отдельного ветеринарного review они подключаются как версионированные протоколы; код их не генерирует.
