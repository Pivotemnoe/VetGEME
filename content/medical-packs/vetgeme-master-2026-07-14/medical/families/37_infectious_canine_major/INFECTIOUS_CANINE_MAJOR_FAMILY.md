# Семейство 37 — основные инфекции собак

Статус: `source_checked_pending_veterinary_review`; generator eligibility: `false`

Вид: собака. Базовых вариантов: 5. Authored presentation branches: 15.

## 1. Граница семейства

Пакет содержит четыре конкретных заболевания и один regulated public-health route, а не карточку «вирусная инфекция». Clinical
pattern and vaccine status set suspicion; antigen/PCR/serology/sample timing and organ findings determine evidence. Recent vaccination,
early/late sampling, intermittent shedding and sample site can change interpretation. Suspected rabies is never an ordinary exam-room
case: local law/public-health authority controls handling, observation/testing and human-exposure response.

## 2. Генераторная модель

Persist source/travel/shelter/wildlife/water contacts, household animals, full vaccine product/date/age series, onset, sample type/time,
isolation/barrier state, organ injury, lab result and contagious/exposure log. Infectious truth is seeded before presentation. A rapid
negative cannot reroll disease away after reload; a positive without context cannot automatically prove active causal disease.

## 3. Исследования и инфекционный контроль

| ID | Capability | Правило |
|---|---|---|
| `canine_infectious_exposure_travel_origin_contacts_vaccine_and_timeline_inventory` | `canine_infectious_history` | Exact dates and vaccine series |
| `canine_infectious_triage_isolation_ppe_flow_and_outbreak_log` | `canine_infectious_control` | Before common waiting-room exposure |
| `canine_parvovirus_fecal_antigen_pcr_and_false_negative_context` | `canine_parvo_testing` | Timing/dilution/vaccine context |
| `canine_distemper_multisite_rt_pcr_antibody_and_vaccine_context` | `canine_distemper_testing_external` | Site and vaccine strain limitations |
| `canine_adenovirus_hepatic_coagulation_and_pcr_confirmation_route` | `canine_adenovirus_testing_external` | Hepatic failure/coagulation safety |
| `canine_leptospira_blood_urine_pcr_acute_convalescent_mat_and_vaccine_context` | `canine_lepto_testing_external` | Combined/timed evidence |
| `canine_leptospira_barrier_precautions_environment_and_owner_health_guidance` | `canine_lepto_zoonotic_protocol` | Urine/blood barrier route |
| `canine_rabies_no_routine_handling_public_health_notification_and_exposure_log` | `rabies_regulated_protocol` | No generator-selected legal disposition |
| `canine_serial_organ_support_contagious_window_and_household_monitoring` | `canine_infectious_longitudinal_monitoring` | Same patient/contacts persist |
| `canine_infectious_external_lab_emergency_and_regulated_referral_route` | `infectious_disease_referral` | Safe transfer communication |

## 4. Варианты

- `canine_parvoviral_enteritis`: young/incomplete-vaccine GI case; early/late false-negative antigen with PCR review; or severe
  leukopenia/dehydration/sepsis and household environmental exposure.
- `canine_distemper_multisystemic`: febrile respiratory/GI/ocular pattern; delayed/progressive neurologic disease; or testing
  complicated by recent vaccination/sample site/concurrent infection.
- `canine_infectious_hepatitis_adenovirus`: fever/abdominal/hepatic pattern; severe coagulopathy/acute failure; or hepatic mimics
  requiring confirmation rather than a liver-enzyme shortcut.
- `canine_leptospirosis_zoonotic`: kidney/liver/respiratory disease in any signalment/lifestyle; blood-vs-urine PCR and acute/
  convalescent MAT with vaccination context; zoonotic barrier precautions and human-health advice.
- `canine_rabies_exposure_or_suspected_case`: exposure/vaccine-status assessment; compatible unexplained neurologic/behavioral/
  swallowing signs; public-health reporting, human exposure log and regulated disposition. No gameplay guess overrides law.

## 5. Полнота, экономика и время

Every branch includes exposure/vaccine timeline, infection-control state, organ severity, disease-specific testing with limitations,
full/staged/emergency/regulated route, contact monitoring and prevention. Isolation consumes a room and trained staff; external PCR/
paired serology consumes time; outbreaks affect decontamination and capacity. The player may refer safely when isolation/ICU/testing is
missing. Rabies and zoonotic flows are not purchasable shortcuts or reputation gambles.

## 6. Валидатор противоречий

Reject if vaccination or breed alone proves/excludes disease; one rapid negative always excludes parvo; any positive PCR equals causal
active infection without sample context; distemper neurologic disease requires simultaneous respiratory signs; leptospirosis is only
an outdoor large-dog disease; MAT names the infecting serovar reliably; suspected rabies enters routine waiting room or receives a
local invented legal outcome; external results are instant; or code generates drug, dose, fluid, antimicrobial, isolation-duration,
vaccine or regulatory protocol.

## 7. Источники

- WSAVA 2024 Vaccination Guidelines: <https://wsava.org/wp-content/uploads/2024/04/WSAVA-Vaccination-guidelines-2024.pdf>
- Merck, Canine Parvovirus: <https://www.merckvetmanual.com/digestive-system/infectious-diseases-of-the-gastrointestinal-tract-in-small-animals/canine-parvovirus-infection-parvoviral-enteritis-in-dogs>
- Merck, Canine Distemper: <https://www.merckvetmanual.com/infectious-diseases/canine-distemper/canine-distemper>
- Merck, Infectious Canine Hepatitis: <https://www.merckvetmanual.com/infectious-diseases/infectious-canine-hepatitis/infectious-canine-hepatitis>
- Merck, Leptospirosis in Dogs: <https://www.merckvetmanual.com/infectious-diseases/leptospirosis/leptospirosis-in-dogs>
- WHO, Rabies: <https://www.who.int/news-room/fact-sheets/detail/rabies>

Specific drugs, doses, fluids, vaccines, isolation durations and legal/regulatory dispositions are not approved here.
