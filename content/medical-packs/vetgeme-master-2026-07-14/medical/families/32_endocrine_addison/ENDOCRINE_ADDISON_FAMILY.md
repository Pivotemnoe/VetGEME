# Семейство 32 — гипоадренокортицизм

Статус: `source_checked_pending_veterinary_review`

Generator eligibility: `false`

Виды первой версии: собака

Базовых вариантов: 4

Authored presentation branches: 12

## 1. Граница семейства

Addison disease строго означает primary hypoadrenocorticism. Secondary and iatrogenic adrenal insufficiency are retained as
related but distinct routes. Hyponatremia/hyperkalemia and low Na:K ratio support the suspicion but are not pathognomonic. Normal
electrolytes do not exclude glucocorticoid-deficient primary or secondary disease.

Baseline cortisol can be a useful rule-out test in an appropriate patient, but a low result does not confirm the disease. Definitive
confirmation requires an interpretable ACTH stimulation test. In crisis, samples are obtained if possible without delaying
life-saving stabilization.

## 2. Генераторная модель

Authored truth fixes episodic signs, stress association, perfusion, CBC/chemistry/electrolytes/glucose/urine, baseline and ACTH
results, exogenous steroid/Cushing-treatment exposure, primary/secondary classification and longitudinal replacement response.
Fluid response and electrolytes evolve along an authored trajectory and do not reroll after each player action.

## 3. Общие вопросы

| Вопрос | Роль |
|---|---|
| Были ли прошлые эпизоды vomiting/diarrhea/lethargy and stress triggers? | Waxing/waning pattern |
| Weight/appetite/water/urine changes? | Chronic course |
| Collapse, weakness, melena or tremor now? | Crisis severity |
| All glucocorticoid routes and Cushing treatments? | Iatrogenic suppression |
| Prior sodium, potassium, glucose, creatinine and urine? | Trend/mimics |
| Baseline cortisol or ACTH test protocol/result? | Rule-out vs confirmation |
| Missed replacement or new illness/stress event? | Longitudinal crisis risk |

## 4. Исследования

| ID | Метод | Capability | Ограничение |
|---|---|---|---|
| `addison_history_exam_cbc_chemistry_electrolytes_glucose_and_urinalysis` | Core pattern | `addison_core_assessment` | Before assigning endocrine cause |
| `addison_baseline_cortisol_as_rule_out_not_confirmation` | Resting cortisol | `baseline_cortisol_external` | Low result requires ACTH confirmation |
| `addison_acth_stimulation_confirmation` | Pre/post ACTH cortisol | `acth_test_external` | Samples/timing/exogenous steroid context stored |
| `addison_primary_secondary_and_mineralocorticoid_classification` | eACTH/aldosterone-renin context | `addison_classification_external` | Classification after confirmation |
| `addison_crisis_perfusion_ecg_glucose_electrolyte_and_acid_base_monitoring` | Shock/ECG/lab trends | `addison_crisis_stabilization` | Immediate and repeated by clinical need |
| `addison_acute_kidney_gi_sepsis_and_other_mimic_review` | Differential workup | `addison_mimic_review` | Fluid-responsive azotemia not automatic proof |
| `addison_glucocorticoid_exposure_and_endocrine_treatment_inventory` | Full medication history | `cushing_clinical_inventory` | Includes topical/inhaled/otic/eye routes |
| `addison_longitudinal_electrolyte_clinical_and_weight_monitoring` | Symptoms/electrolytes/weight | `addison_longitudinal_monitoring` | Individualized authored interval |
| `addison_owner_stress_event_and_emergency_plan` | Illness/stress/missed dose plan | `addison_owner_emergency_plan` | Reviewable and teach-back verified |
| `addison_endocrinology_referral_for_discordant_cases` | Specialist review | `endocrinology_referral` | Discordant/rare/secondary cases |

## 5. Клинические варианты

### `addison_primary_with_electrolyte_changes`

- `p1_waxing_waning_gi_lethargy_and_weight_loss`: recurrent vague signs become meaningful through timeline and routine labs.
- `p2_hyponatremia_hyperkalemia_azotemia_or_hypoglycemia_pattern`: supportive constellation prompts ACTH confirmation; Na:K alone
  cannot pass validation.
- `p3_mimics_renal_gi_or_other_chronic_disease`: kidney/GI/parasite/protein-losing and other causes remain until discriminators.

### `addison_eunatremic_eukalemic_or_secondary`

- `p1_recurrent_gi_or_weakness_without_classic_electrolytes`: appropriate suspicion despite normal sodium/potassium.
- `p2_low_baseline_cortisol_requires_acth_confirmation`: low resting value opens ACTH route and never directly activates treatment.
- `p3_primary_vs_secondary_classification_and_future_electrolyte_monitoring`: classification affects plan; initially normal electrolytes
  remain monitored for evolution in primary disease.

### `addisonian_crisis`

- `p1_hypovolemic_shock_collapse_or_severe_gi_loss`: emergency stabilization while diagnostic samples are preserved when safe.
- `p2_hyperkalemic_bradyarrhythmia_hypoglycemia_or_acidosis`: ECG/glucose/electrolyte and perfusion response drive reviewed care.
- `p3_crisis_mimics_acute_kidney_injury_sepsis_or_gi_catastrophe`: life threats are treated and evidence retained; a dramatic
  response to fluids alone does not prove Addison.

### `addison_iatrogenic_or_longitudinal_management`

- `p1_glucocorticoid_withdrawal_or_cushing_treatment_suppression`: exposure/treatment history and HPA suppression are explicit;
  abrupt change is unsafe.
- `p2_stable_replacement_monitoring_and_individualized_interval`: symptoms, weight and electrolytes determine reviewed adjustments,
  not one fixed schedule generated for every dog.
- `p3_stress_illness_missed_dose_or_owner_emergency_plan`: owner receives a reviewed stress/emergency plan and red flags; teach-back
  affects adherence.

## 6. Минимальные безопасные планы

Every branch includes perfusion/glucose/electrolyte safety, baseline cortisol interpretation, ACTH confirmation, primary/secondary
classification, mimic review, full/staged/emergency route, longitudinal monitoring and owner emergency plan. Missing ACTH or ICU
capability requires urgent referral; crisis is not sent home while waiting for an external result.

## 7. Экономика, оборудование и время

ACTH testing and classification are external timed services. Crisis reserves monitor, ECG, pump, electrolytes/glucose and hospital
capacity. Stable disease creates recurring monitoring and replacement costs with explicit schedule. A low-cost baseline cortisol
can avoid unnecessary full testing when it rules disease out, but cannot be sold as confirmation when low.

## 8. Валидатор противоречий

Reject if Na:K, breed, low baseline cortisol or fluid response alone proves disease; normal electrolytes exclude it; crisis waits for
all results before stabilization; secondary/iatrogenic disease is called Addison disease without distinction; exogenous steroid
history is omitted; stable monitoring uses one universal interval; missed medication creates random collapse unrelated to the same
patient; external ACTH result is instant; or code generates fluid, electrolyte, glucocorticoid/mineralocorticoid dose or stress plan.

## 9. Источники

- Merck Veterinary Manual, Addison Disease in Animals:
  <https://www.merckvetmanual.com/endocrine-system/the-adrenal-glands/addison-disease-hypoadrenocorticism-in-animals>
- 2023 AAHA Categorical Diagnostic Approach:
  <https://www.aaha.org/resources/2023-aaha-selected-endocrinopathies-of-dogs-and-cats-guidelines/categorical-approach-to-diagnosis-based-on-clinical-presentation-3/>
- 2023 AAHA Diagnostic Testing and Monitoring:
  <https://www.aaha.org/resources/2023-aaha-selected-endocrinopathies-of-dogs-and-cats-guidelines/diagnostic-testing-and-monitoring-3/>
- Diagnosis of Canine Spontaneous Hypoadrenocorticism: <https://pmc.ncbi.nlm.nih.gov/articles/PMC9066729/>
- Management of Hypoadrenocorticism in Dogs: <https://pmc.ncbi.nlm.nih.gov/articles/PMC6055912/>

Specific drugs, doses, fluid/electrolyte protocols, test protocols and stress-dose schedules are not approved here.
