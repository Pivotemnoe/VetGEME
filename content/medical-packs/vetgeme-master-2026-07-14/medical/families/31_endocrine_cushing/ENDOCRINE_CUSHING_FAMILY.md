# Семейство 31 — гиперадренокортицизм

Статус: `source_checked_pending_veterinary_review`

Generator eligibility: `false`

Виды первой версии: собака; кошка только в редкой specialist-authored ветке

Базовых вариантов: 5

Authored presentation branches: 15

## 1. Граница семейства

Hyperadrenocorticism диагностируется у пациента с совместимыми прогрессирующими клиническими признаками и routine-lab
pattern, подтверждёнными корректно выбранным endocrine test. Incidental adrenal enlargement, stress cortisol, isolated alkaline
phosphatase, thin skin or one positive screening result in a тяжело больном пациенте не являются диагнозом сами по себе.

После подтверждения disease differentiated into pituitary-dependent, adrenal-dependent or iatrogenic. Differentiating imaging or
endogenous ACTH is not a substitute for first confirming clinically relevant hypercortisolism.

## 2. Генераторная модель

Authored truth хранит water intake/urine, appetite, panting, abdominal/skin/muscle changes, medication exposure through every
route, concurrent illness, screening-test protocol/results, adrenal/pituitary imaging, complications and treatment monitoring.
Test timing and sample identity persist after reload. A stressed sick patient cannot become «Cushing confirmed» because a random
test rolled high.

## 3. Общие вопросы

| Вопрос | Роль |
|---|---|
| Измерено ли питьё и мочеиспускание? | Objective PU/PD trend |
| Как менялись аппетит, panting, abdomen, muscle and skin? | Compatible progressive pattern |
| Все препараты за месяцы, включая ear/eye/skin/inhaled/injections? | Hidden glucocorticoid exposure |
| Есть ли acute illness, pain, hospitalization or stress? | False-positive testing risk |
| Есть ли diabetes, infection, pancreatitis, thrombosis signs? | Complications/comorbidity |
| Какой endocrine test, protocol, timing and lab? | Interpretability |
| Imaging was before or after confirmation? | Avoid incidentaloma shortcut |
| Есть ли pacing, altered behavior, seizures or vision change? | Pituitary macroadenoma route |

## 4. Первичный маршрут

Before endocrine testing: history, physical exam, CBC/biochemistry, urinalysis with culture when indicated, blood pressure and
assessment of active nonadrenal illness. Unstable diabetes, infection/sepsis, pancreatitis, thromboembolism or acute neurologic
signs are managed first. Endocrine tests are scheduled when results will be interpretable and action-changing.

## 5. Исследования

| ID | Метод | Capability | Ограничение |
|---|---|---|---|
| `cushing_clinical_sign_routine_lab_and_medication_inventory` | Signs/CBC/chem/urine/full exposure | `cushing_clinical_inventory` | Required before screening |
| `cushing_delay_testing_during_significant_nonadrenal_illness` | Illness/stress gate | `endocrine_test_timing_gate` | Prevents misleading testing |
| `cushing_screening_lddst_acth_or_uccr_route` | Selected screening test | `cushing_screening_external` | UCCR mainly useful to rule out when appropriate; stress affects it |
| `cushing_confirm_before_differentiation` | Confirmation evidence set | `cushing_confirmation_review` | Imaging alone cannot pass |
| `cushing_endogenous_acth_and_adrenal_imaging` | eACTH + US/CT | `endogenous_acth_external`, `adrenal_imaging_external` | After confirmation; equivocal bilateral cases exist |
| `cushing_pituitary_imaging_when_neurologically_indicated` | Brain/pituitary imaging | `pituitary_imaging_referral` | Not mandatory for every stable PDH case |
| `cushing_infection_diabetes_blood_pressure_and_thrombosis_workup` | Complication screen | `cushing_complication_assessment` | Triggered by findings/risk |
| `cushing_treatment_response_and_hypoadrenal_safety_monitoring` | Clinical + protocol-specific lab safety | `cushing_longitudinal_monitoring` | Symptoms and safety, not one cortisol number alone |
| `cushing_adrenal_surgery_or_advanced_endocrine_referral` | Specialist staging/route | `adrenal_surgery_referral`, `endocrinology_referral` | No automatic local surgery |
| `cushing_owner_water_appetite_skin_strength_and_quality_of_life_log` | Home trend | `cushing_home_monitoring` | Same definitions over time |

## 6. Клинические варианты

### `cushing_appropriate_suspicion_or_false_positive_risk`

- `p1_classic_progressive_clinical_and_routine_lab_pattern`: compatible multi-system pattern justifies selected screening.
- `p2_incidental_adrenal_or_liver_finding_without_compatible_signs`: incidental imaging/lab change leads to review/monitoring, not
  automatic endocrine treatment.
- `p3_concurrent_illness_stress_or_recent_glucocorticoid_exposure`: stabilize/wait and document washout/test limitations through
  reviewed protocol rather than forcing a result.

### `cushing_pituitary_dependent`

- `p1_confirmed_hypercortisolism_with_pituitary_pattern`: confirmation plus compatible differentiation; bilateral adrenal change
  is supportive, not sufficient alone.
- `p2_macroadenoma_neurologic_or_behavioral_concern`: neurologic signs trigger pituitary imaging and specialist options.
- `p3_medical_control_and_longitudinal_quality_of_life`: water/appetite/panting/skin/muscle and safety are followed longitudinally.

### `cushing_adrenal_dependent`

- `p1_unilateral_adrenal_mass_with_confirmed_hypercortisolism`: function is confirmed before staging/surgical decision.
- `p2_bilateral_or_equivocal_adrenal_findings`: bilateral nodules/tumors or discordant tests require endocrine review; side is not
  chosen randomly.
- `p3_invasive_or_metastatic_risk_and_surgical_referral`: vascular invasion/metastasis/comorbidity determine surgery vs medical/
  palliative route with explicit uncertainty.

### `cushing_iatrogenic`

- `p1_chronic_systemic_glucocorticoid_exposure`: phenotype plus exposure and suppressed-axis risk; abrupt withdrawal is unsafe.
- `p2_topical_otic_ophthalmic_inhaled_or_hidden_exposure`: non-oral routes count and are discoverable in full inventory.
- `p3_withdrawal_or_illness_reveals_adrenal_suppression_risk`: stress-dose/taper details remain reviewed protocols, with emergency
  hypoadrenal route visible.

### `cushing_complicated_or_monitoring`

- `p1_diabetes_insulin_resistance_or_hyperlipidemia_overlap`: both diseases retain separate monitoring and causal uncertainty.
- `p2_recurrent_urinary_skin_or_other_infection`: culture/cytology and antimicrobial stewardship; infection cannot be assumed from
  endocrine status.
- `p3_thrombosis_hypertension_pancreatitis_or_hypoadrenal_treatment_risk`: red flags create urgent complication or Addison-like
  safety route rather than increasing therapy blindly.

## 7. Минимальные безопасные планы

Every presentation includes compatible-sign gate, full medication inventory, routine labs/urine, selected screening with timing,
confirmation before differentiation, complication assessment, full/staged/referral plan, safety monitoring and urgent hypoadrenal/
thrombotic/diabetic red flags. Missing endocrine or imaging access yields external testing, not diagnosis by appearance.

## 8. Экономика, оборудование и время

Dynamic endocrine tests occupy timed external slots; imaging and surgery are separate. Repeating an uninterpretable test costs
money/time and reduces decision quality. Home logs and infection checks are ongoing costs. Adrenal surgery has staging, referral and
post-op care; it is not a single upgrade. Rare feline cases default to specialist workup.

## 9. Валидатор противоречий

Reject if isolated lab sign, incidental adrenal mass, breed or appearance proves Cushing; testing is forced during major nonadrenal
illness without limitation; imaging differentiates disease before confirmation; every positive screen becomes treatment; topical/
otic/inhaled glucocorticoids are omitted from exposure; abrupt withdrawal is safe; monitoring uses one number without clinical
status; external results are instant; or code generates drug, dose, taper, dynamic-test protocol or surgical threshold.

## 10. Источники

- 2023 AAHA Selected Endocrinopathies Guidelines:
  <https://www.aaha.org/resources/2023-aaha-selected-endocrinopathies-of-dogs-and-cats-guidelines/>
- Merck Veterinary Manual, Cushing Syndrome in Animals:
  <https://www.merckvetmanual.com/endocrine-system/the-adrenal-glands/cushing-syndrome-hyperadrenocorticism-in-animals>
- ACVIM Consensus, Diagnosis of Spontaneous Canine Hyperadrenocorticism:
  <https://academic.oup.com/jvim/article/27/6/1292/8483203>
- Merck Veterinary Manual, Pituitary-dependent Cushing Disease:
  <https://www.merckvetmanual.com/endocrine-system/the-pituitary-gland/cushing-disease-pituitary-dependent-hyperadrenocorticism-in-animals>

Specific drugs, doses, tapers, endocrine-test protocols and surgery thresholds are not approved here.
