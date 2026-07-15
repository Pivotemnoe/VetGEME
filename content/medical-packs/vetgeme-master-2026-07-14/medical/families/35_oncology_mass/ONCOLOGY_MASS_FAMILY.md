# Семейство 35 — объёмное образование и подозрение на опухоль

Статус: `source_checked_pending_veterinary_review`; generator eligibility: `false`

Виды: собака и кошка. Базовых вариантов: 7. Authored presentation branches: 21.

## 1. Граница семейства

«Масса» — находка, а не диагноз. Palpation, photo, size, imaging, breed or age cannot determine benign/malignant behavior alone.
Nonneoplastic lesions can look identical. Cytology often identifies benign/inflammatory and round-cell lesions but may only classify
or be nondiagnostic; histology supplies architecture, grade, invasion and margin information. Stage describes extent, grade describes
microscopic behavior, and tests are selectively chosen after diagnosis according to tumor biology, patient and owner priorities.

## 2. Генераторная модель

Every mass has immutable `massId`, anatomic layer/site, three-dimensional measurement, photo date, growth/ulceration/function/pain,
regional node map and every sample/result linked to the same ID. Multiple masses are not assumed identical. A removed mass retains
specimen orientation, pathology type/grade/margins and planned follow-up. A random «oncology roll» cannot replace sampled truth.

## 3. Исследования и решения

| ID | Capability | Правило |
|---|---|---|
| `mass_map_measure_photo_growth_function_and_sample_identity` | `mass_mapping` | Baseline and separate IDs |
| `mass_cytology_with_pathologist_review` | `mass_cytology_review` | Result can be definitive, categorical or nondiagnostic |
| `mass_inflammation_infection_and_non_neoplastic_differential` | `mass_non_neoplastic_review` | Culture/response only when indicated |
| `mass_biopsy_method_site_and_definitive_surgery_planning` | `oncology_biopsy_planning_referral` | Track must not compromise final surgery |
| `mass_histopathology_grade_invasion_and_margin_review` | `oncology_histopathology_review` | Preserve report fields, not only label |
| `mass_regional_lymph_node_sampling_by_drainage_not_size_alone` | `regional_node_sampling_external` | Normal size does not universally exclude metastasis |
| `mass_selective_thoracic_abdominal_or_advanced_imaging_staging` | `oncology_staging_external` | Tumor-specific, not same panel for all |
| `mass_flow_cytometry_immunophenotype_or_immunohistochemistry_referral` | `oncology_advanced_pathology_external` | Selected after morphology/question |
| `mass_baseline_patient_comorbidity_and_treatment_readiness` | `oncology_patient_readiness` | Whole patient before intervention |
| `mass_quality_of_life_owner_goals_cost_and_followup_plan` | `oncology_quality_of_life_plan` | Curative/control/palliative routes explicit |

## 4. Варианты

- `mass_non_neoplastic_or_inflammatory`: benign/cyst/lipoma-like, inflammatory/abscess/granuloma, or defined recheck showing
  resolution/persistence/change. Improvement does not retroactively prove every future mass benign.
- `mass_cutaneous_or_subcutaneous_undifferentiated`: small mobile slow mass still gets measured/sampled; large/fixed/ulcerated/rapid
  mass gets planned biopsy/referral; multiple masses preserve independent truth.
- `mass_round_cell_or_mast_cell_pattern`: cytology may support MCT/round-cell class; histology grade/margins and selective staging
  remain separate; systemic/degranulation signs change safety, not random malignancy score.
- `mass_lymph_node_or_systemic_pattern`: reactive, metastatic and lymphoma routes remain distinct; generalized pattern may require
  flow/immunophenotype/histology, not node size alone.
- `mass_internal_or_organ_associated`: incidentaloma, organ dysfunction/obstruction/bleeding/effusion, and risky/low-yield sampling
  each have different urgency and referral logic.
- `mass_nondiagnostic_or_biopsy_planning`: blood/necrosis/low cellularity is a real outcome; categorical cytology is not a final
  subtype; biopsy selection protects definitive margins.
- `mass_confirmed_neoplasia_staging_and_followup`: pathology type/grade/margins, selective stage, then reviewed treatment,
  surveillance or palliative quality-of-life route.

## 5. Полнота, экономика и время

Every branch has mass identity/map, patient baseline, first sampling or reason not to, interpretation limits, full/staged/referral
route, red flags and follow-up. Cytology, histology, advanced pathology, node sampling and imaging have separate price/turnaround.
Doing every stage test for every mass is not good medicine or economy; cutting before diagnosis can make definitive surgery larger
and costlier. Owner goals and quality-of-life are state, not a one-time dialogue choice.

## 6. Валидатор противоречий

Reject if appearance/size/breed/imaging alone declares cancer or benignity; all masses on one animal share diagnosis; nondiagnostic
cytology becomes negative; cytology always supplies grade/margins; grade and stage are conflated; every tumor gets identical staging;
biopsy track/surgical planning is absent; removed tissue has no histology/margins; chemotherapy is ordinary inventory; external
results are instant; or code generates biopsy/surgery/chemotherapy/radiation/drug protocols or doses.

## 7. Источники

- 2026 AAHA Oncology Guidelines, Diagnostics & Staging: <https://www.aaha.org/resources/2026-aaha-oncology-guidelines-for-dogs-and-cats/section-3-tumor-diagnostics-staging/>
- 2026 AAHA Oncology Guidelines, Common Cancers: <https://www.aaha.org/resources/2026-aaha-oncology-guidelines-for-dogs-and-cats/section-1-overview-of-common-cancers/>
- Merck, Skin and Soft Tissue Tumors: <https://www.merckvetmanual.com/integumentary-system/tumors-of-the-skin-and-soft-tissues/overview-of-tumors-of-the-skin-and-soft-tissues-in-animals>
- Merck, Lymphocytic/Histiocytic Cutaneous Tumors: <https://www.merckvetmanual.com/integumentary-system/tumors-of-the-skin-and-soft-tissues/lymphocytic-histiocytic-and-related-cutaneous-tumors-in-animals>
- Oncology-Pathology Working Group, Nodal Lymphoma: <https://pmc.ncbi.nlm.nih.gov/articles/PMC12378112/>

Specific biopsy, surgery, chemotherapy, radiation and drug protocols/doses are not approved here.
