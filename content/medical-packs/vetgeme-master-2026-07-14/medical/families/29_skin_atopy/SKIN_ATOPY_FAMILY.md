# Семейство 29 — атопия и хронический зуд

Статус: `source_checked_pending_veterinary_review`

Generator eligibility: `false`

Виды первой версии: собака, кошка

Базовых вариантов: 6

Authored presentation branches: 18

## 1. Граница семейства

Атопия — клинический диагноз после последовательного исключения правдоподобных причин зуда, а не результат одного
«анализа на аллергию». Положительный intradermal или serum IgE result показывает сенсибилизацию/экспозицию и используется
прежде всего для подбора аллергенов к иммунотерапии после клинического диагноза.

Семейство различает canine atopic dermatitis, feline atopic skin syndrome, food-induced disease, flea/parasite/contact overlap,
вторичную инфекцию и продольный плохой контроль. Одновременно может существовать больше одного триггера; генератор
использует только заранее утверждённые сочетания.

## 2. Генераторная модель

Это не шесть фиксированных животных. Authored truth связывает:

- onset, seasonality, initial distribution and current lesions;
- pruritus before/after secondary lesions;
- flea/parasite exposure and household control;
- skin/ear cytology and culture when indicated;
- strict diet ingredients, duration, hidden exposures and provocation;
- secondary infection and response;
- environment and barrier factors;
- comorbidities limiting plan components;
- owner feasibility, adherence and observed technique;
- longitudinal itch, lesion, quality-of-life and flare trajectories.

Breed/age pattern changes probability, not truth. A symptom response to anti-inflammatory therapy is supportive context, not a
stand-alone diagnosis. Reload cannot change season, diet exposure or cytology because the player chose a different answer.

## 3. Общие вопросы и authored-ответы

| Вопрос | Допустимые ответы | Роль |
|---|---|---|
| Когда зуд начался и что было первым? | Возраст/date/site/неизвестно | Pattern and differential |
| Зуд был до высыпаний и инфекции? | Да/нет/не уверен | Primary vs secondary process |
| Где лижет, чешет, трёт или выкусывает? | Body map/video | Owner may not call licking itch |
| Есть ли сезонность или flare windows? | Months/environment/none | Environmental pattern |
| Все ли животные в доме защищены от блох? | Product/date/each animal/gaps | Household exposure truth |
| Были ли scraping/cytology/culture? | Result/date/site/none | Avoid repeated assumptions |
| Что именно ел пациент последние недели? | Full ingredient/extras/meds | Diet trial eligibility |
| Есть ли GI signs? | Stool/vomiting/frequency/none | Food-trigger context, not requirement |
| Что менялось дома? | Litter/cleaners/grass/bedding/move | Contact/environment compatibility |
| Какие средства помогали и на сколько? | Component/timeline/partial/none | Response trajectory |
| Были ли побочные эффекты/коморбидности? | Confirmed/none/unknown | Plan constraints |
| Что владелец реально может выполнять? | Time/budget/handling barriers | Feasible minimum plan |

## 4. Первичный осмотр

Документируются full-body lesion map, ears/paws/face/flexures/dorsolumbar and perianal distribution, primary vs secondary
lesions, pain, infection, self-trauma, body condition and quality of life. Severe infection, deep pain, fever/systemic illness,
rapidly progressive ulceration, mucosal disease or suspected autoimmune/neoplastic process leaves allergy shortcut and receives
urgent workup/referral.

## 5. Исследования

| ID | Метод | Capability | Ограничение |
|---|---|---|---|
| `atopy_full_pruritus_history_distribution_and_seasonality` | History/body map/score | `pruritus_lesion_mapping` | Before therapy rewrites lesions |
| `atopy_skin_ear_cytology_and_infection_mapping` | Site-specific cytology | `skin_cytology`, `ear_cytology` | Each relevant site; result not universal |
| `atopy_flea_comb_scraping_and_ectoparasite_control_trial` | Flea comb/scraping/household trial | `strict_ectoparasite_control_trial` | No fleas seen does not exclude FAD |
| `atopy_dermatophyte_and_other_mimic_route` | Direct exam/culture/biopsy route | `dermatophyte_direct_exam`, `dermatophyte_culture_external` | Selected by lesions/risk |
| `atopy_strict_elimination_and_provocation_trial` | Controlled diet then challenge | `allergy_elimination_provocation_trial` | Blood/saliva food tests do not replace it |
| `atopy_secondary_infection_culture_when_indicated` | Cytology/culture/susceptibility | `skin_bacterial_culture_external` | Recurrent/deep/nonresponsive context |
| `atopy_allergy_testing_only_for_immunotherapy_selection` | IDT or allergen-specific IgE | `allergy_testing_external` | After clinical diagnosis; history-compatible allergens |
| `atopy_environment_barrier_and_home_feasibility_review` | Triggers, bathing/barrier, household | `skin_barrier_environment_plan` | No guaranteed single-trigger cure |
| `atopy_pruritus_lesion_quality_of_life_and_flare_monitoring` | Scores/photos/flaring | `atopy_longitudinal_monitoring` | Same methods and patient |
| `atopy_refractory_dermatology_referral` | Specialist/biopsy/advanced plan | `dermatology_referral` | Before indefinite random escalation |

## 6. Клинические варианты

### `atopy_canine_environmental_pattern`

- `p1_seasonal_face_feet_ears_flexural_pruritus`: compatible distribution and season after parasites/infection are assessed;
  clinical criteria support but do not prove the diagnosis.
- `p2_nonseasonal_or_seasonal_flare_on_chronic_background`: perennial disease can flare seasonally; food and persistent household
  triggers remain in the differential.
- `p3_recurrent_otitis_as_dominant_manifestation`: ear disease may dominate, but cytology and chronic-middle-ear route are not
  skipped in favor of a generic allergy label.

### `atopy_feline_atopic_skin_syndrome`

- `p1_head_neck_pruritus_or_self_induced_alopecia`: owner may report hair loss, while grooming video reveals pruritus.
- `p2_miliary_dermatitis_or_eosinophilic_pattern`: reaction pattern is not etiology; fleas, food, environment, parasites and
  infection are evaluated.
- `p3_multifactorial_feline_pruritus_without_single_visible_cause`: validated overlap can preserve more than one trigger without
  letting the generator invent arbitrary combinations.

### `atopy_food_induced_allergic_dermatitis`

- `p1_year_round_pruritus_with_or_without_gi_signs`: GI signs can support but are not required; perennial itch triggers a real
  elimination/provocation pathway.
- `p2_elimination_trial_with_hidden_exposure_or_poor_feasibility`: treats, flavored medication, shared bowls and scavenging are
  authored discovery paths, not automatic owner blame.
- `p3_improvement_then_controlled_provocation_confirms_food_trigger`: improvement alone is not enough when season/treatment also
  changed; controlled challenge confirms the relationship when safe.

### `atopy_flea_parasite_or_contact_overlap`

- `p1_no_fleas_seen_but_exposure_and_distribution_compatible`: absence on one exam does not exclude exposure; all household
  animals and environment are included.
- `p2_mite_or_other_ectoparasite_mimic`: scraping sensitivity limits and compatible therapeutic trial are explicit.
- `p3_contact_insect_or_multiple_allergic_triggers`: contact/insect pattern and validated combined triggers retain separate
  evidence and plans.

### `atopy_secondary_infection_or_flare`

- `p1_staphylococcal_pyoderma_amplifies_pruritus`: cytology confirms secondary bacterial process; infection response does not
  erase the underlying allergy.
- `p2_malassezia_skin_or_ear_overgrowth`: site-specific cytology and recurrence plan; yeast count is interpreted with lesions.
- `p3_recurrent_or_treatment_unresponsive_infection_requires_culture_and_cause_review`: culture, adherence, dose/protocol review
  and underlying disease precede antimicrobial escalation.

### `atopy_longitudinal_poor_control_or_immunotherapy`

- `p1_trigger_adherence_or_home_plan_gap`: verifies flea control, diet, bathing/environment and administration technique before
  declaring treatment failure.
- `p2_treatment_limited_by_comorbidity_or_adverse_effect`: comorbidity and adverse effect create a reviewed alternative/referral,
  not unsafe continuation or abandonment.
- `p3_allergy_testing_for_immunotherapy_after_clinical_diagnosis`: testing selects history-compatible allergens after diagnosis;
  immunotherapy has delayed authored monitoring rather than instant success.

## 7. Минимальные безопасные планы

Every presentation contains parasite/flea route, cytology, infection treatment component, diet-trial decision, environment/barrier
plan, safe symptom relief component, recheck and escalation. A low budget supports staged exclusion and minimum-safe control; it
does not unlock an unsupported «allergy test proves everything» shortcut.

## 8. Экономика, оборудование и время

- Cytology, scraping and household parasite control appear early; culture, diet trial, allergy testing and immunotherapy are
  separate longitudinal costs.
- Elimination diet consumes weeks and owner effort; hidden exposures are discoverable and reproducible.
- Allergy testing is not rewarded as a first-visit diagnostic sale.
- Secondary infection consumes consumables and rechecks; prevention can reduce recurrence but not guarantee it.
- Dermatology referral competes with indefinite local trial-and-error and may be economically preferable in refractory disease.

## 9. Владелец, темперамент и персонал

Staff teaches sampling preparation, bathing/device technique, household flea inventory, diet log and photo/itch scoring. Owner
capacity and pet handling tolerance shape the plan. Missed steps are investigated as feasibility, understanding or access problems
before a conflict modifier is applied.

## 10. Валидатор противоречий

Reject if breed/Favrot criteria/IgE test alone prove atopy; no visible flea excludes FAD; reaction pattern is treated as a cause;
food allergy is diagnosed by serum/saliva test; diet response without controlled context always proves food trigger; secondary
infection is ignored or becomes the only diagnosis forever; every itchy patient receives the same treatment; allergy testing is
sold before clinical workup; external result/immunotherapy response is instant; or code generates a drug, dose, taper, diet recipe,
allergen mixture or immunotherapy schedule.

## 11. Источники

- Merck Veterinary Manual, Atopic Dermatitis in Dogs:
  <https://www.merckvetmanual.com/integumentary-system/atopic-skin-conditions-in-dogs-and-cats/atopic-dermatitis-in-dogs>
- ICADA, Detailed Guidelines for Diagnosis and Allergen Identification:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC4531508/>
- ICADA, Updated Treatment Guidelines:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC4537558/>
- 2023 AAHA Management of Allergic Skin Diseases Guidelines:
  <https://www.aaha.org/wp-content/uploads/2023/10/2023-aaha-management-of-allergic-skin-diseases-guidelines-new.pdf>
- Merck Veterinary Manual, Flea Allergy Dermatitis:
  <https://www.merckvetmanual.com/integumentary-system/fleas-and-flea-allergy-dermatitis/flea-allergy-dermatitis-in-dogs-and-cats>

Specific drugs, doses, tapers, diet formulas, allergen mixtures and immunotherapy schedules are not approved here.
