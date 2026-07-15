# Семейство 26 — стоматология и пародонтология

Статус: `source_checked_pending_veterinary_review`

Generator eligibility: `false`

Виды первой версии: собака, кошка

Базовых вариантов: 6

Authored presentation branches: 18

## 1. Граница семейства

Осмотр бодрствующего пациента выявляет жалобы, боль и видимый риск, но не считается полной оценкой каждого зуба.
Полная стоматологическая карта, periodontal probing и intraoral radiography требуют безопасной общей анестезии. «Снять
камень без наркоза» не заменяет диагностику и лечение поддесневой болезни.

Семейство различает профилактический скрининг, пародонтальную болезнь, feline tooth resorption, перелом/эндодонтическую
патологию, feline chronic gingivostomatitis и пациента, которому нужна изменённая анестезиологическая или referral route.

## 2. Генераторная модель

Это не шесть фиксированных пациентов. Authored truth хранит tooth-by-tooth findings, pain, periodontal stage, radiographic
root/bone findings, resorption type/stage, pulp/periapical status, comorbidities, anesthesia plan category, performed
procedure category and longitudinal healing. Видимый calculus не используется как единственная мера тяжести.

До анестезии формируется предварительная смета с диапазоном; окончательный план уточняется после полной карты и снимков.
Это не случайное изменение цены, а заранее допустимая ветка согласия владельца.

## 3. Общие вопросы и authored-ответы

| Вопрос | Допустимые типы ответа | Клиническая роль |
|---|---|---|
| Есть ли запах, слюнотечение, кровь, выпадение корма? | Да/нет/не замечено | Pain/oral disease screen |
| Изменился ли способ жевания или груминг? | Сторона/мягкий корм/нет | Subtle pain |
| Были ли перелом зуба или твёрдые предметы? | Когда/что/неизвестно | Pulp exposure timeline |
| Когда была последняя стоматология и были ли снимки? | Дата/record/нет | Avoid false «clean bill» |
| Какой домашний уход реально выполняется? | Метод/частота/невозможно | Feasible prevention |
| Были ли реакции на анестезию? | Record/со слов/нет | Risk plan |
| Какие хронические болезни и препараты? | Список/неизвестно | Whole-patient assessment |
| Ест ли пациент сейчас и как меняется вес? | Да/нет/динамика | Pain/nutrition urgency |
| Позволяет ли трогать морду? | Да/страх/боль/агрессия | Safe conscious exam boundary |
| Согласен ли владелец на диапазон после снимков? | Полный/поэтапный/лимит | Informed consent |

## 4. Первичный осмотр и срочность

Бодрствующий осмотр оценивает симметрию лица, swelling, discharge, jaw function, видимые зубы/дёсны, bleeding, mass,
pain, hydration и nutrition, не насилуя болезненного или испуганного пациента. Airway compromise, uncontrolled bleeding,
jaw trauma, inability to eat/drink, spreading infection or severe systemic illness create urgent referral/stabilization.

## 5. Исследования

| ID | Метод | Capability | Ограничение |
|---|---|---|---|
| `dental_conscious_oral_screen` | Visible oral/pain screen | `conscious_oral_assessment` | Not a complete dental chart |
| `dental_preanesthetic_whole_patient_assessment` | Comorbidity/anesthesia risk | `dental_anesthetic_risk_assessment` | Age alone is not automatic refusal |
| `dental_anesthetized_tooth_by_tooth_charting` | Visual/probe/mobility chart | `dental_charting` | General anesthesia and monitoring required |
| `dental_full_mouth_intraoral_radiography` | Roots, bone, hidden disease | `dental_xray_or_referral` | Skull radiographs are not equivalent |
| `dental_periodontal_probe_mobility_and_furcation_assessment` | Attachment/pockets/furcation | `periodontal_assessment` | After cleaning and under anesthesia |
| `dental_pulp_vitality_and_periapical_assessment` | Fracture/pulp/root apex | `dental_endodontic_referral` | Tooth color alone is not final plan |
| `dental_feline_resorption_type_and_stage` | Full-mouth radiographic classification | `feline_tooth_resorption_assessment` | Determines treatment category |
| `dental_stomatitis_and_concurrent_disease_workup` | Full oral/dental and selected systemic tests | `feline_stomatitis_referral` | Viral result alone does not explain all disease |
| `dental_postprocedure_pain_nutrition_and_healing_recheck` | Pain/intake/wound healing | `dental_recheck` | Same procedure episode |
| `dental_lifetime_home_care_and_recall_plan` | Feasible prevention/recall | `dental_home_care_plan` | Uses approved products/methods after review |

## 6. Клинические варианты

### `dental_conscious_screen_and_preventive_plan`

- `p1_no_owner_complaint_but_visible_risk`: no complaint does not equal no pain; conscious screening leads to anesthetized
  assessment when indicated.
- `p2_halitosis_calculus_or_early_gingivitis`: visible plaque/calculus/gingivitis sets risk, not final periodontal stage.
- `p3_home_care_and_recheck_after_previous_dental`: prior cleaning does not grant permanent immunity; record and recall matter.

### `dental_periodontal_disease`

- `p1_gingivitis_without_confirmed_attachment_loss`: reversible inflammation is separated from periodontitis after charting.
- `p2_periodontitis_with_pockets_or_bone_loss`: tooth-level attachment/bone loss drives periodontal treatment/extraction route.
- `p3_advanced_mobile_teeth_or_oronasal_complication`: pain, mobility, fistula or severe loss requires definitive treatment/referral.

### `dental_feline_tooth_resorption`

- `p1_painful_cervical_lesion_suspected_awake`: visible lesion/chattering raises suspicion but does not define roots.
- `p2_type_and_stage_defined_by_intraoral_radiographs`: radiographic root/periodontal status determines approved treatment category.
- `p3_recurrent_new_lesions_on_longitudinal_screening`: new teeth can become affected; recurrence remains same patient history.

### `dental_fractured_nonvital_or_endodontic_tooth`

- `p1_recent_complicated_crown_fracture`: pulp exposure and time make timely extraction/endodontic referral explicit.
- `p2_discolored_nonvital_or_chronic_periapical_disease`: quiet tooth can be painful/infected; radiographs and pulp status matter.
- `p3_strategic_tooth_extraction_vs_endodontic_referral`: tooth value, damage, owner goal and specialist access create a real choice.

### `dental_feline_chronic_gingivostomatitis`

- `p1_severe_caudal_oral_pain_and_hyporexia`: pain and nutrition are urgent even before definitive dentistry.
- `p2_concurrent_periodontal_resorptive_or_viral_context`: complete dental assessment separates concurrent disease from associations.
- `p3_persistent_or_refractory_after_prior_dental_surgery`: records, residual roots/disease and specialist reassessment precede escalation.

### `dental_complex_anesthesia_or_referral`

- `p1_geriatric_or_systemic_comorbidity_requires_plan`: age/comorbidity modifies risk, monitoring and staging; it does not authorize
  indefinite untreated pain.
- `p2_airway_brachycephalic_or_monitoring_constraint`: airway and recovery capability determine local vs referral route.
- `p3_extensive_disease_requires_staged_or_specialist_procedure`: staged care may be safer/feasible, but each stage has a complete
  pain/infection plan and informed cost range.

## 7. Минимальные безопасные планы

Каждая ветка содержит pain/nutrition screen, conscious-exam boundary, preanesthetic assessment, full-mouth intraoral imaging
or explicit incomplete-assessment/referral disclosure, tooth-level chart, reviewed procedure category, analgesia, discharge,
home care and recall. Missing dental x-ray/anesthesia capability requires referral rather than confident guessing.

## 8. Экономика, оборудование и время

- Dental table, anesthesia, monitoring, intraoral x-ray, instruments, consumables and trained staff are separate capabilities.
- The owner consents to an estimate range and escalation rules before anesthesia.
- Nonanesthetic cosmetic scaling cannot earn the same medical outcome or fee as complete care.
- Staged procedures trade repeated anesthesia/cost against single-session length; the risk discussion is explicit.
- Prevention and recall reduce future disease probability but never erase authored existing lesions.

## 9. Владелец, темперамент и персонал

Awake refusal by a painful/fearful animal is not «bad behavior». Staff records dental chart and images, monitors anesthesia,
teaches realistic home care and verifies understanding. Owner fear of anesthesia receives a risk/benefit explanation and a
referral/staging option; it does not make hidden oral disease disappear.

## 10. Валидатор противоречий

Ветка отклоняется, если visible calculus equals periodontal stage; conscious exam is called complete; dental radiographs are
omitted without disclosure/referral; anesthesia-free scaling is definitive care; extraction/endodontics is chosen without
tooth-level findings; feline resorption type is guessed from the crown; old age alone forbids care; age alone guarantees safe
anesthesia; viral status alone proves stomatitis cause; final cost changes outside the pre-consented range logic; or code generates
drug doses, anesthesia protocol, extraction technique, root-amputation rule or endodontic procedure.

## 11. Источники

- 2019 AAHA Dental Care Guidelines, overview:
  <https://www.aaha.org/resources/2019-aaha-dental-care-guidelines-for-dogs-and-cats/overview/>
- AAHA, unconscious oral evaluation:
  <https://www.aaha.org/resources/2019-aaha-dental-care-guidelines-for-dogs-and-cats/unconscious/>
- 2025 FelineVMA Feline Oral Health and Dental Care Guidelines:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC12665832/>
- AVDC Position Statement, Feline Tooth Resorption:
  <https://avdc.org/wp-content/uploads/2019/AVDC-pos-stmts/FORL_2019.pdf>
- AVDC Nomenclature:
  <https://avdc.org/avdc-nomenclature/>

Конкретные препараты, дозы, анестезиологические схемы, extraction/root-amputation criteria, эндодонтические и хирургические
техники этим файлом не утверждаются. После ветеринарного/dental review они подключаются как версионированные протоколы.
