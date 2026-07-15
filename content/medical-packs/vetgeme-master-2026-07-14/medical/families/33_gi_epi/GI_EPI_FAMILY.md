# Семейство 33 — экзокринная недостаточность поджелудочной железы

Статус: `source_checked_pending_veterinary_review`

Generator eligibility: `false`

Виды: собака и кошка

Базовых вариантов: 4

Authored presentation branches: 12

## 1. Граница семейства

EPI — синдром недостаточной секреции пищеварительных ферментов с мальдигестией. Вес, стул, аппетит и порода создают подозрение,
но не заменяют species-specific serum TLI. Обычные lipase/amylase, УЗИ, пробное улучшение или внешний вид кала сами по себе не
подтверждают EPI. Кобаламин оценивается отдельно; особенно у кошек и собак с неполным ответом ищутся concurrent intestinal,
pancreatic, endocrine, parasitic или neoplastic disease.

## 2. Генераторная модель

Сохраняются вес/BCS/MCS, динамика аппетита и стула, рацион, доступ к чужой пище, TLI с species/reference interval, cobalamin/folate,
pancreatic history, назначенная и фактически соблюдённая схема, ответ и побочные эффекты. Низкий TLI не превращает каждый случай в
одинаковую «немецкую овчарку с поносом»: генератор выбирает возраст, причину, выраженность и comorbidity из согласованной ветки.

## 3. Общие вопросы

| Вопрос | Зачем |
|---|---|
| Как менялись вес, muscle condition, аппетит и объём/частота стула? | Объективная мальдигестия |
| Какой рацион, лакомства, scavenging и доступ к корму других животных? | Диетические мимики и adherence |
| Были pancreatitis, diabetes, abdominal surgery или pancreatic mass? | Возможная причина/comorbidity |
| Как взят и интерпретирован TLI, какой вид и reference interval? | Диагностическая валидность |
| Проверены cobalamin/folate? | Частая корректируемая причина плохого исхода |
| Enzyme product давался с каждым кормлением и правильно хранился? | Неполный ответ не равен неверному диагнозу |
| Есть vomiting, pain, anorexia, blood, fever or dehydration? | Не списывать красные флаги на EPI |

## 4. Исследования

| ID | Метод | Capability | Ограничение |
|---|---|---|---|
| `epi_history_weight_body_condition_stool_and_diet_inventory` | History + serial weight/BCS/MCS | `epi_core_assessment` | Объективная исходная точка |
| `epi_cbc_biochemistry_urinalysis_and_malabsorption_mimic_screen` | Routine lab | `epi_mimic_screen` | Не подтверждает EPI |
| `epi_species_specific_serum_tli_confirmation` | Serum TLI | `tli_external` | Species-specific; external turnaround |
| `epi_serum_cobalamin_and_folate_assessment` | Vitamins | `cobalamin_folate_external` | Интерпретируется с клиникой |
| `epi_pancreatic_and_intestinal_comorbidity_review` | Integrated review | `epi_comorbidity_review` | Especially feline/poor response |
| `epi_structured_response_weight_stool_and_appetite_monitoring` | Serial outcome | `epi_longitudinal_monitoring` | Same measures over time |
| `epi_adherence_storage_meal_and_product_review` | Teach-back/audit | `epi_owner_adherence_review` | До эскалации лечения |
| `epi_chronic_enteropathy_or_dysbiosis_workup_when_poor_response` | GI workup | `gi_specialist_referral` | Не автоматический antimicrobial route |
| `epi_owner_lifelong_management_and_red_flag_plan` | Home plan | `epi_owner_home_plan` | Reviewed; no generated dose |
| `epi_internal_medicine_referral_for_discordant_or_refractory_case` | Specialist | `gi_specialist_referral` | Scheduled/urgent by red flags |

## 5. Клинические варианты

### `epi_classic_canine_maldigestion`

- `p1_weight_loss_polyphagia_and_voluminous_stool`: classic suspicion, then TLI confirmation and vitamin assessment.
- `p2_breed_or_young_dog_with_acinar_atrophy_pattern`: breed/age informs prior probability but never proves diagnosis.
- `p3_adult_dog_after_chronic_pancreatic_disease`: pancreatitis/diabetes and structural disease stay visible as linked problems.

### `epi_feline_or_atypical_presentation`

- `p1_feline_weight_loss_and_loose_stool_with_concurrent_disease`: feline EPI often needs wider intestinal/pancreatic review.
- `p2_intermittent_or_subclinical_low_tli_pattern`: discordant sign/test pattern is repeated/reviewed, not forced into a severe case.
- `p3_diarrhea_without_polyphagia_or_obvious_steatorrhea`: absence of textbook stool/appetite does not block appropriate TLI testing.

### `epi_cobalamin_deficiency_or_poor_response`

- `p1_severe_cobalamin_deficiency_and_poor_weight_gain`: cobalamin is an explicit result and monitored problem.
- `p2_persistent_diarrhea_despite_reported_enzyme_use`: verify product, storage, meals and actual use before calling refractory.
- `p3_concurrent_chronic_enteropathy_dysbiosis_or_other_mimic`: investigate concurrent disease; no automatic antibiotic shortcut.

### `epi_longitudinal_management`

- `p1_early_response_weight_and_stool_recheck`: improvement is measured with weight, condition, stool and appetite.
- `p2_relapse_from_adherence_storage_diet_or_batch_problem`: continuity preserves causal audit and owner conversation.
- `p3_stable_lifelong_care_with_comorbidity_surveillance`: recurring supplies/monitoring and diabetes/pancreatitis alerts persist.

## 6. Безопасность, экономика и время

Every branch includes confirmation, vitamin assessment, mimic/comorbidity screen, adherence audit, measurable follow-up and referral
for discordant cases. TLI/cobalamin are external timed services. Enzyme replacement is a recurring owner cost and supply dependency;
failed adherence wastes less money if detected before repeated imaging/testing. Missing external lab creates a staged safe route, not
diagnosis by treatment trial. Red flags trigger stabilization/referral.

## 7. Валидатор противоречий

Reject if breed, fecal appearance, low weight, ordinary lipase/amylase, ultrasound or treatment response alone confirms EPI; canine
and feline TLI are treated identically; cobalamin is omitted; every poor response becomes dysbiosis/antimicrobial treatment; a stable
lifelong patient loses previous results after reload; external results are instant; or code generates enzyme, vitamin, diet or drug
names, doses and schedules.

## 8. Источники

- Merck Veterinary Manual, Exocrine Pancreatic Insufficiency in Dogs and Cats:
  <https://www.merckvetmanual.com/digestive-system/the-exocrine-pancreas/exocrine-pancreatic-insufficiency-in-dogs-and-cats>
- Merck Veterinary Manual, Malabsorption Syndromes in Small Animals:
  <https://www.merckvetmanual.com/digestive-system/diseases-of-the-small-intestine-in-small-animals/malabsorption-syndromes-in-small-animals>

Specific enzyme/vitamin products, doses, diets, antimicrobials and treatment schedules are not approved here.
