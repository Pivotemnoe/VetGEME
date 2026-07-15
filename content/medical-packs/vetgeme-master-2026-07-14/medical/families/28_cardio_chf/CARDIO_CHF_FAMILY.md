# Семейство 28 — застойная сердечная недостаточность

Статус: `source_checked_pending_veterinary_review`

Generator eligibility: `false`

Виды первой версии: собака, кошка

Базовых вариантов: 5

Authored presentation branches: 15

## 1. Граница семейства

Heart disease, murmur, cardiomegaly и congestive heart failure (CHF) — разные состояния. CHF требует клинического
застоя: pulmonary edema, pleural/pericardial effusion, ascites or systemic congestion, sometimes with low output. У пожилой
маленькой собаки кашель чаще может быть первично респираторным, а кошка с CHF может не кашлять и не иметь слышимого шума.

Семейство различает левосторонний отёк, pleural effusion, правосторонний застой, острую декомпенсацию/low output и
продольный контроль либо респираторную имитацию.

## 2. Генераторная модель

Authored truth фиксирует cardiac phenotype/stage, congestion location, respiratory rate/effort, perfusion, imaging pattern,
effusion type, rhythm, blood pressure, renal/electrolyte response, home monitoring, treatment-response trajectory and emergency
complications. Murmur grade or breed never generates edema automatically. Created visits preserve the same heart disease,
owner and medication history across relapse and recheck.

## 3. Общие вопросы и триаж

| Вопрос | Роль |
|---|---|
| Resting/sleeping respiratory rate and video | Trend outside clinic stress |
| Cough vs effort vs syncope | Respiratory/cardiac discrimination |
| Appetite, water, urine and weight change | Congestion/renal/medication context |
| Previous echo, x-ray, ECG and diagnosis | Cardiac phenotype and comparison |
| Exact medication list and missed/extra doses | Safety and response, no free generation |
| Collapse, limb pain/paralysis, open-mouth breathing | Emergency complications |

Severe effort, cyanosis, collapse, hypothermia/poor perfusion, hypotension, dangerous arrhythmia, pleural-space restriction or
painful cold paresed limbs triggers minimal-handling emergency care. A full echocardiogram is not required before initial oxygen
and life-saving drainage/referral when the patient cannot ventilate.

## 4. Исследования

| ID | Метод | Capability | Ограничение |
|---|---|---|---|
| `chf_minimal_handling_respiratory_and_perfusion_triage` | Effort, mucosa, perfusion, temperature | `respiratory_distress_minimal_handling`, `oxygen` | Before stressful imaging |
| `chf_thoracic_radiography_or_pocus_route` | Edema/effusion/heart/veins | `xray_or_referral`, `thoracic_pocus` | POCUS supports triage, not full phenotype |
| `chf_ecg_blood_pressure_and_oxygenation` | Rhythm, BP, SpO2 | `ecg`, `blood_pressure`, `pulse_oximetry` | Signal/context limitations stored |
| `chf_echocardiography_and_cardiac_phenotype` | Structure/function/atria | `echocardiography_external`, `cardiology_referral` | Heart enlargement alone not CHF proof |
| `chf_pleural_or_abdominal_effusion_assessment` | Fluid impact/sample/cause | `thoracocentesis_referral`, `abdominocentesis_referral` | Drain for ventilation/comfort when indicated |
| `chf_cbc_biochemistry_electrolyte_renal_and_thyroid_context` | Systemic/comorbidity | `cbc`, `biochemistry`, `electrolytes`, `t4_external` | Guides safety, not edema proof |
| `chf_cardiac_biomarker_as_support_not_proof` | Cardiac biomarker | `cardiac_biomarker_external` | Supports probability; not stand-alone diagnosis |
| `chf_home_resting_respiratory_rate_and_weight_log` | Home trend | `cardiac_home_monitoring` | Technique taught and baseline individualized |
| `chf_response_renal_perfusion_and_quality_of_life_monitoring` | Congestion vs kidney/BP/QoL | `chf_longitudinal_monitoring` | Same episode and protocol version |
| `chf_refractory_or_advanced_cardiology_referral` | Advanced/refractory route | `advanced_heart_failure_referral` | No infinite local escalation |

## 5. Клинические варианты

### `chf_left_sided_cardiogenic_pulmonary_edema`

- `p1_dog_with_tachypnea_dyspnea_and_cardiac_context`: compatible edema/venous/heart findings plus respiratory distress;
  cough alone does not qualify.
- `p2_cat_with_occult_cardiomyopathy_and_acute_distress`: no murmur does not exclude cardiomyopathy; low-stress triage and
  cardiology route follow stabilization.
- `p3_recurrent_pulmonary_edema_after_previous_control`: verifies home rate, protocol, renal status and trigger; recurrence is
  the same patient, not a generated duplicate.

### `chf_pleural_effusion_cardiac_or_mixed`

- `p1_cat_with_pleural_effusion_and_reduced_ventilation`: oxygen/minimal handling and drainage route precede exhaustive imaging.
- `p2_effusion_requires_sampling_or_competing_cause`: neoplasia, pyothorax, chylous and other causes stay visible; cardiac
  disease does not automatically own every effusion.
- `p3_reaccumulating_effusion_and_drainage_decision`: recurrence rate, comfort and underlying control determine repeat
  drainage/hospital/referral.

### `chf_right_sided_systemic_congestion`

- `p1_ascites_jugular_distension_or_hepatomegaly`: systemic venous findings and cardiac cause are assessed together.
- `p2_pulmonary_hypertension_or_tricuspid_context`: echo/right-heart and respiratory cause routes remain linked.
- `p3_refractory_ascites_with_quality_of_life_tradeoff`: drainage is for discomfort/respiration when appropriate, while renal,
  protein, liver and neoplastic alternatives remain.

### `chf_acute_decompensated_or_low_output`

- `p1_severe_hypoxemic_distress_needing_minimal_handling`: stabilization before definitive phenotype.
- `p2_arrhythmia_syncope_hypotension_or_cardiogenic_shock`: rhythm and perfusion require ICU/cardiology; code cannot choose a
  universal cardiovascular drug.
- `p3_concurrent_arterial_thromboembolism_or_other_emergency`: painful cold limb/neuro deficit in a cat creates simultaneous
  cardiopulmonary and thromboembolic emergency route.

### `chf_longitudinal_control_or_respiratory_mimic`

- `p1_stable_home_resting_respiratory_rate_followup`: trends plus exam/renal/BP data guide reviewed plan; one excited clinic RR
  does not equal relapse.
- `p2_azotemia_electrolyte_or_blood_pressure_tradeoff`: congestion control and kidney/perfusion safety form a real compromise,
  not an automatic penalty for either side.
- `p3_cough_tachypnea_without_confirmed_congestion`: bronchitis, pneumonia, asthma, pain, obesity and other causes are tested;
  murmur/cardiomegaly alone cannot unlock CHF treatment.

## 6. Минимальные безопасные планы

Every branch includes respiratory/perfusion stability, oxygen/minimal handling, congestion evidence, effusion drainage when
ventilation is limited, rhythm/BP/renal context, echo/referral after stabilization, reviewed treatment components, home trend,
recheck and hard emergency thresholds. Missing imaging/cardiology/ICU capability yields a safe transfer path.

## 7. Экономика, оборудование и время

Oxygen, monitoring, x-ray/POCUS, drainage, echo and ICU are separate queues. Emergency stabilization cannot wait for a full
financial interview, but ongoing hospitalization/referral has transparent estimates. Home respiratory-rate monitoring is low cost
and useful when taught correctly; it cannot replace examination during red flags. Renal/electrolyte rechecks are part of treatment
cost, not optional surprise charges.

## 8. Владелец, темперамент и персонал

Dyspneic animals get minimal handling; fear is not noncompliance. Staff teaches sleeping RR/weight logs and reconciles medication
containers. Owner reports are evidence with confidence levels. Medication mistakes trigger safety review and explanation, not
moral labeling.

## 9. Валидатор противоречий

Reject if murmur or cardiomegaly equals CHF; cough alone is cardiogenic edema; lack of feline murmur excludes heart disease;
every effusion is cardiac; unstable patient must finish radiographs/echo before oxygen/drainage; biomarker alone proves edema;
one clinic RR overrides home trend; renal compromise is ignored; gastro/respiratory mimics disappear; external echo/drainage is
instant; or code generates drug, dose, oxygen target, thoracocentesis technique or escalation protocol.

## 10. Источники

- Merck Veterinary Manual, Heart Failure in Dogs and Cats:
  <https://www.merckvetmanual.com/circulatory-system/heart-failure-in-dogs-and-cats/heart-failure-in-dogs-and-cats>
- ACVIM MMVD Consensus Guidelines: <https://pmc.ncbi.nlm.nih.gov/articles/PMC6524084/>
- ACVIM Feline Cardiomyopathy Consensus: <https://pmc.ncbi.nlm.nih.gov/articles/PMC7255676/>
- Merck Veterinary Manual, Diagnosis of Heart Disease in Animals:
  <https://www.merckvetmanual.com/circulatory-system/diagnosis-of-heart-disease/diagnosis-of-heart-disease-in-animals>

Specific drugs, doses, oxygen targets, drainage procedures and advanced cardiovascular protocols are not approved here.
