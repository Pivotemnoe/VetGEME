# Семейство 39 — трансмиссивные инфекции

Статус: `source_checked_pending_veterinary_review`; generator eligibility: `false`

Виды: собака и кошка. Базовых синдромных вариантов: 3. Authored disease presentations: 9.

## 1. Граница семейства

Это regional disease matrix, а не три расплывчатые карточки. Каждая из 9 подач имеет собственный pathogen/evidence route, но общий
вариант объединяет заболевания по первичному диагностическому решению и оборудованию. Disease generation is gated by geography,
season, travel/import, vector or non-vector exposure (eg transfusion) and species. Seropositivity usually proves exposure/immune
response, not necessarily current causal disease; PCR/smear can be negative with low organism burden or after treatment.

## 2. Generator truth

Persist lifetime/current geography and travel dates, origin/rescue/import, vector sightings/removal, prevention product/date/adherence,
transfusion/fight/splenectomy, onset, raw CBC/reticulocytes/smear, organ injury, exact organism/test/sample/time, paired titers/PCR and
coinfection matrix. The region dataset is versioned separately; changing it does not silently regenerate an already saved patient.

## 3. Исследования

| ID | Capability | Правило |
|---|---|---|
| `vector_region_season_travel_import_transfusion_vector_and_prevention_timeline` | `vector_exposure_map` | Required before disease prior |
| `vector_cbc_reticulocyte_smear_biochemistry_urinalysis_and_organ_severity` | `vector_core_lab_assessment` | Anemia/cytopenia/organ severity |
| `vector_ehrlichia_anaplasma_pcr_morula_serology_and_paired_titer_context` | `tick_bacterial_testing_external` | Acute seronegative/chronic antibody possible |
| `vector_borrelia_exposure_test_compatible_syndrome_and_complication_review` | `borrelia_evidence_review` | Positive exposure test has low disease PPV alone |
| `vector_babesia_smear_species_pcr_and_coinfection_assessment` | `babesia_testing_external` | Species matters; low parasitemia possible |
| `vector_feline_hemoplasma_smear_pcr_retrovirus_and_carrier_context` | `hemoplasma_testing_external` | PCR plus anemia/retrovirus context |
| `vector_leishmania_quantitative_serology_tissue_cytology_pcr_and_renal_staging` | `leishmania_testing_external` | Region/travel and tissue/sample sensitivity |
| `vector_heartworm_species_specific_antigen_antibody_microfilaria_and_imaging_route` | `heartworm_staged_testing` | Dog and cat algorithms differ |
| `vector_hemolysis_shock_bleeding_respiratory_or_renal_emergency_route` | `vector_emergency_stabilization` | Stabilize/referral without generated doses |
| `vector_longitudinal_response_relapse_transmission_prevention_and_retest_plan` | `vector_longitudinal_monitoring` | Same disease/test definitions over time |

## 4. Девять disease presentations

### `vector_tick_borne_bacterial_complex`

- Ehrlichia/Anaplasma: fever, cytopenias, bleeding/lameness; morula cell type may not reliably name organism, PCR/paired serology and
  timing matter.
- Borrelia: compatible exposure plus intermittent lameness/systemic or renal concern; most seropositive animals are not clinically ill.
- Acute seronegative/chronic seropositive/coinfection: discordant tests are expected states, not validator errors.

### `vector_hemoparasite_complex`

- Canine Babesia acute: hemolysis/thrombocytopenia/collapse requires smear/PCR/species/coinfection and emergency assessment.
- Babesia low-parasitemia/chronic: negative single smear cannot exclude; transfusion/fight/travel and relapse remain visible.
- Feline hemoplasma: regenerative anemia vs carrier state, smear limitations, PCR and FeLV/FIV/comorbidity context.

### `vector_travel_regional_complex`

- Leishmaniosis: endemic travel/import plus cutaneous/systemic/renal evidence; quantitative serology, tissue cytology/PCR and staging;
  infection can be subclinical and treatment may not sterilize.
- Canine heartworm: antigen plus microfilaria testing, confirmation and cardiopulmonary/renal staging; early/occult discordance exists.
- Feline heartworm: low worm burden makes single tests unreliable; combine antibody, antigen handling, imaging and clinical context.

## 5. Полнота, экономика и время

Every branch has regional/exposure gate, vector prevention history, routine lab/smear, specific confirmatory route, coinfection/mimic
review, full/staged/emergency/referral route and longitudinal prevention/retest. Microscopy is available but not omniscient. Species-
specific PCR/serology, paired titers and imaging have separate costs/turnaround. Region updates change future probabilities only.

## 6. Валидатор противоречий

Reject if disease appears without compatible region/travel/exposure; one tick sighting or positive antibody proves active disease;
negative early serology or one smear excludes infection; all morulae/parasites are identified visually without limits; dog and cat
heartworm testing is identical; coinfections are impossible; a saved case changes when regional prevalence updates; external results
are instant; or code generates antiparasitic/antimicrobial, transfusion, fluid, prevention or public-health protocols/doses.

## 7. Источники

- Merck, Ehrlichiosis in Dogs: <https://www.merckvetmanual.com/infectious-diseases/rickettsial-diseases-in-dogs/ehrlichiosis-in-dogs>
- Merck, Anaplasmosis in Dogs: <https://www.merckvetmanual.com/infectious-diseases/rickettsial-diseases-in-dogs/anaplasmosis-in-dogs>
- Merck, Lyme Borreliosis: <https://www.merckvetmanual.com/infectious-diseases/lyme-borreliosis/lyme-borreliosis-in-animals>
- Merck, Hemotropic Mycoplasma: <https://www.merckvetmanual.com/circulatory-system/blood-parasites/hemotropic-mycoplasma-infections-in-animals>
- Merck, Canine Leishmaniosis: <https://www.merckvetmanual.com/infectious-diseases/leishmaniosis/leishmaniosis-in-dogs>
- CAPC Heartworm Guideline: <https://capcvet.org/guidelines/heartworm/>

Specific drugs, doses, transfusion, fluids, vector prevention and public-health protocols are not approved here.
