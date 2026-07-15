# Семейство 38 — основные инфекции кошек

Статус: `source_checked_pending_veterinary_review`; generator eligibility: `false`

Вид: кошка. Базовых вариантов: 6. Authored presentation branches: 18.

## 1. Граница семейства

Шесть distinct truth models: FPV, FHV/FCV complex, FeLV, FIV, FIP and rabies-regulated exposure. A positive retrovirus screen means
infection evidence to confirm/characterize, not automatic clinical disease, prognosis or euthanasia. FCoV antibody/fecal PCR proves
exposure/shedding, not FIP. FIP is a multimodal evidence synthesis; effusion/lesion antigen detection can be more specific, while
noneffusive cases remain difficult. Carrier shedding means a respiratory PCR can be positive in a clinically unrelated episode.

## 2. Generator truth

Persist origin/group housing, contacts/fights/outdoor/wildlife, vaccine dates, pregnancy/kitten age, onset, samples and collection
sites, CBC/organ disease, each antigen/antibody/PCR result, confirmatory state, isolation/outbreak/environment log and household plan.
FeLV infection status may evolve and must use serial linked tests. FIV kitten age and prior vaccine region/history cannot disappear.

## 3. Исследования

| ID | Capability | Правило |
|---|---|---|
| `feline_infectious_origin_group_housing_contacts_vaccine_and_exposure_timeline` | `feline_infectious_history` | Exact exposure and vaccine timeline |
| `feline_infectious_triage_isolation_ppe_flow_and_outbreak_log` | `feline_infectious_control` | Flow before shared rooms |
| `feline_panleukopenia_antigen_cbc_pcr_and_vaccine_timing_context` | `feline_panleukopenia_testing` | Limited sensitivity/intermittent shedding |
| `feline_respiratory_multisite_pcr_and_carrier_coinfection_context` | `feline_respiratory_testing_external` | Positive may reflect carrier/shedding |
| `feline_felv_antigen_confirmatory_pcr_and_serial_infection_status` | `felv_staged_testing` | Progressive/regressive/discordant state |
| `feline_fiv_antibody_confirmatory_age_vaccine_and_exposure_window_review` | `fiv_staged_testing` | Maternal/vaccine/window context |
| `feline_fip_multimodal_evidence_effusion_cytology_pcr_and_antigen_detection` | `fip_evidence_synthesis` | No single generic blood test |
| `feline_retrovirus_secondary_disease_household_and_longitudinal_plan` | `feline_retrovirus_longitudinal_plan` | Good quality of life is possible |
| `feline_rabies_no_routine_handling_public_health_notification_and_exposure_log` | `rabies_regulated_protocol` | Authority/local law controls route |
| `feline_infectious_external_lab_emergency_and_regulated_referral_route` | `infectious_disease_referral` | Transfer with control communication |

## 4. Варианты

- `feline_panleukopenia`: kitten/unvaccinated GI-fever-leukopenia pattern; negative antigen with shedding/recent-vaccine context; or
  peracute/group outbreak with environmental persistence and capacity pressure.
- `feline_herpes_calicivirus_complex`: conjunctival/nasal/keratitis-dominant FHV pattern; oral-ulcer/lameness/lower-airway FCV pattern;
  or carrier/coinfection/virulent systemic red flags. Clinical overlap remains.
- `feline_felv_infection`: screen-positive well cat; progressive/regressive/discordant antigen-PCR route; or confirmed infection
  with anemia/neoplasia/secondary disease and longitudinal care. Infection is not identical to current illness.
- `feline_fiv_infection`: risk/sick-cat antibody screen; kitten maternal antibody/prior vaccine/exposure window; or confirmed infection
  with secondary disease and long-term preventive care. It is feline-specific and not a human risk.
- `feline_infectious_peritonitis`: effusive evidence, noneffusive ocular/neuro/organ disease, or misleading stand-alone FCoV PCR/
  serology/response. Evidence must accumulate by sample quality and compatibility.
- `feline_rabies_exposure_or_suspected_case`: exposure/vaccine assessment, compatible neurologic/behavioral signs, then human exposure
  log/public-health notification/regulated disposition without routine handling.

## 5. Полнота, экономика и время

Every branch has exposure/vaccine timeline, control state, severity, specific testing limitations, full/staged/emergency/regulated
route, household/outbreak plan and longitudinal endpoint. Rapid tests are capacity/consumable choices; PCR/confirmatory methods and
paired/serial tests take time. Isolation/decontamination affects rooms and staff. Missing confirmatory capability creates referral,
not a definitive label. Positive FeLV/FIV alone never justifies an automatic euthanasia or campaign penalty.

## 6. Валидатор противоречий

Reject if vaccine/indoor lifestyle absolutely excludes infection; negative FPV antigen always excludes disease; any respiratory PCR
proves current cause; one FeLV/FIV screen fixes lifelong clinical prognosis; FIV kitten maternal antibody is ignored; FCoV antibody/
fecal PCR/Rivalta/response alone proves FIP; rabies is routinely handled or legally resolved by generator; external results are instant;
or code generates antiviral, antimicrobial, fluid, nutrition, vaccine, isolation-duration or regulatory protocols/doses.

## 7. Источники

- WSAVA 2024 Vaccination Guidelines: <https://wsava.org/wp-content/uploads/2024/04/WSAVA-Vaccination-guidelines-2024.pdf>
- Merck, Feline Panleukopenia: <https://www.merckvetmanual.com/digestive-system/infectious-diseases-of-the-gastrointestinal-tract-in-small-animals/feline-panleukopenia>
- Merck, Feline Respiratory Disease Complex: <https://www.merckvetmanual.com/respiratory-system/respiratory-diseases-of-small-animals/feline-respiratory-disease-complex>
- 2020 AAFP Retrovirus Guidelines: <https://catvets.com/resource/feline-retrovirus-management-guidelines/>
- 2022 AAFP/EveryCat FIP Diagnosis Guidelines: <https://catvets.com/resource/aafp-everycat-feline-infectious-peritonitis-diagnosis-fip-guidelines/>
- Merck, FIP: <https://www.merckvetmanual.com/infectious-diseases/feline-infectious-peritonitis/feline-infectious-peritonitis>
- WHO, Rabies: <https://www.who.int/news-room/fact-sheets/detail/rabies>

Specific drugs, doses, antivirals, fluids, nutrition, vaccines, isolation durations and regulatory dispositions are not approved here.
