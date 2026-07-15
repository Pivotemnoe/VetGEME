# Семейство 34 — гепатобилиарные заболевания

Статус: `source_checked_pending_veterinary_review`; generator eligibility: `false`

Виды: собака и кошка. Базовых вариантов: 6. Authored presentation branches: 18.

## 1. Граница семейства

Генератор обязан разделять hepatocellular injury, cholestasis, hepatic function/failure и конкретную этиологию. Повышенный ALT/ALP,
желтуха, УЗИ-находка, порода или улучшение от «гепатопротектора» не являются единым диагнозом. Chronic hepatitis требует интеграции
клиники, лаборатории, imaging и в подходящей ветке histopathology; FNA cytology не заменяет biopsy. Обструкция/разрыв желчного пузыря,
acute failure, hypoglycemia, coagulopathy и encephalopathy — срочные безопасные ветки.

## 2. Генераторная модель и вопросы

Persist: anorexia/weight trajectory, GI/neuro signs, jaundice/ascites/bleeding, complete medications/supplements/toxins, raw enzyme and
function results with dates, glucose/coagulation, ultrasound structures, bile acids/ammonia context, samples/culture/histology/copper,
and response. Ask about food cessation in cats, drug/toxin access, travel/infection risk, timing of episodes around meals, urinary
stones, pancreatitis/intestinal/endocrine disease and previous values. A normal single ammonia result cannot erase compatible HE.

## 3. Исследования

| ID | Capability | Правило |
|---|---|---|
| `hepatobiliary_history_medication_toxin_diet_and_weight_inventory` | `hepatic_core_assessment` | Exposure and anorexia timeline first |
| `hepatobiliary_cbc_biochemistry_urinalysis_glucose_and_serial_enzyme_pattern` | `hepatic_routine_lab_pattern` | Injury/cholestasis are not function |
| `hepatobiliary_function_bilirubin_albumin_bun_cholesterol_bile_acid_and_ammonia_route` | `hepatic_function_external` | Selected/handled by indication |
| `hepatobiliary_coagulation_platelet_and_bleeding_risk_assessment` | `hepatic_bleeding_risk_assessment` | Before invasive sampling and in failure |
| `hepatobiliary_ultrasound_biliary_patency_gallbladder_vessels_and_mass_review` | `hepatobiliary_ultrasound_external` | Structure supports, does not name histology |
| `hepatobiliary_culture_cytology_histology_and_copper_quantification_referral` | `hepatic_tissue_referral` | Samples linked to site/method; biopsy safety |
| `hepatobiliary_portosystemic_shunt_advanced_imaging_referral` | `shunt_imaging_referral` | Congenital vs acquired route retained |
| `hepatobiliary_encephalopathy_acute_failure_and_biliary_rupture_stabilization` | `hepatic_emergency_stabilization` | Stabilize while preserving safe samples |
| `hepatobiliary_assisted_nutrition_referral_for_feline_lipidosis` | `feeding_tube_referral` | Refeeding risk remains reviewed protocol |
| `hepatobiliary_serial_clinical_lab_imaging_and_quality_of_life_monitoring` | `hepatic_longitudinal_monitoring` | Same endpoints over time |

## 4. Клинические варианты

### `hepatic_enzyme_elevation_or_reactive_pattern`

- Incidental persistent ALT prompts trend/exposure/systemic review; it is not «liver failure».
- Cholestatic enzymes during endocrine/GI/drug disease retain extrahepatic causality uncertainty.
- Recheck can resolve or progress, creating a reproducible escalation rather than a new random patient.

### `hepatic_chronic_hepatitis_or_cirrhosis`

- Subclinical persistent injury can precede overt signs; breed only changes prior probability.
- Clinical CH requires integrated evidence and tissue route when decision-changing and safe.
- Ascites/portal hypertension/low synthetic function create advanced-risk monitoring/referral.

### `hepatic_acute_failure_or_toxic_injury`

- Drug/toxin product, amount, time and packaging become evidence; no guessed antidote/dose.
- Hypoglycemia, coagulopathy, encephalopathy or shock trigger emergency capacity/referral.
- Acute-on-chronic decompensation keeps both baseline and new insult visible.

### `biliary_cholestasis_cholecystitis_or_obstruction`

- Jaundice requires hemolytic/hepatic/posthepatic differentiation.
- Mucocele/obstruction uses serial clinical-lab-ultrasound progression and surgical referral threshold review.
- Fever, pain, gas, free fluid or leakage/rupture risk is urgent; suspected mucocele is not punctured casually.

### `hepatic_portosystemic_shunt_or_encephalopathy`

- Young/small/growth-neuro-GI pattern uses function tests and vascular imaging, not breed certainty.
- Ammonium biurate urinary disease/postprandial episodes cross-link urinary and hepatic systems.
- Acquired shunts imply portal hypertension/advanced disease and cannot be labelled congenital.

### `feline_hepatobiliary_syndrome`

- Obese cat after anorexia gets hepatic lipidosis plus underlying-cause/nutrition route.
- Cholangitis may overlap pancreatic/intestinal disease; culture/tissue decisions remain explicit.
- Feline jaundice differentiates biliary, hepatic, hemolytic, pancreatic and neoplastic causes.

## 5. Полнота, экономика и время

Every branch has exposure/diet history, injury/cholestasis/function separation, routine labs/urine, imaging/referral, bleeding safety,
urgent red flags, full/staged plan and longitudinal endpoints. Ultrasound, bile acids/ammonia, culture/histology/copper and surgery are
separate priced services with turnaround and capacity. Feline assisted nutrition consumes staff/hospital time. Missing equipment uses
referral, never a fabricated definitive result.

## 6. Валидатор противоречий

Reject if one enzyme, bilirubin, breed, bile-acid/ammonia value, ultrasound, FNA or treatment response proves etiology; injury equals
failure; reactive hepatopathy becomes chronic hepatitis; biopsy ignores coagulation/platelet/monitoring safety; suspected mucocele is
sampled unsafely; feline anorexia has no nutrition route; external tests are instant; or code generates toxin, drug, nutrition,
biopsy, surgery or fluid protocols/doses.

## 7. Источники

- ACVIM Canine Chronic Hepatitis Consensus: <https://pmc.ncbi.nlm.nih.gov/articles/PMC6524396/>
- WSAVA Liver Disease Guidelines: <https://wsava.org/Global-Guidelines/Liver-Disease-Guidelines/>
- Merck, Hepatic Function Tests: <https://www.merckvetmanual.com/digestive-system/laboratory-analyses-and-imaging-in-hepatic-disease-in-small-animals/hepatic-function-tests-in-small-animals>
- Merck, Cholecystitis: <https://www.merckvetmanual.com/digestive-system/hepatic-diseases-of-small-animals/cholecystitis-in-small-animals>
- Merck, Canine Gallbladder Mucocele: <https://www.merckvetmanual.com/digestive-system/hepatic-diseases-of-small-animals/canine-gallbladder-mucocele>
- Merck, Hepatic Portal Venous Hypoperfusion: <https://www.merckvetmanual.com/digestive-system/hepatic-diseases-of-small-animals/hepatic-portal-venous-hypoperfusion-in-small-animals>
- Merck, Feline Hepatic Lipidosis: <https://www.merckvetmanual.com/digestive-system/hepatic-diseases-of-small-animals/feline-hepatic-lipidosis>

Specific drugs, doses, biopsy/surgery/nutrition protocols and toxin treatment are not approved here.
