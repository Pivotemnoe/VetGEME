# Семейство 36 — вестибулярный синдром

Статус: `source_checked_pending_veterinary_review`; generator eligibility: `false`

Виды: собака и кошка. Базовых вариантов: 5. Authored presentation branches: 15.

## 1. Граница семейства

Vestibular syndrome describes localization/signs, not cause. First decision is peripheral vs central vs uncertain using complete
neurologic examination, not head tilt direction or age alone. Idiopathic vestibular syndrome is acute/peracute, nonpainful,
peripheral/no-central-involvement and improving; it is a diagnosis of exclusion and serial course is part of the evidence. Otitis
media/interna, central inflammation/infection/vascular/neoplasia, toxin, trauma, systemic disease and feline polyps remain available.

## 2. Generator truth

Persist exact onset and progression, owner video, ability to stand/eat/drink, vomiting/aspiration/falls, mentation, postural reactions,
nystagmus description, strabismus, every cranial nerve, facial/Horner signs, ear pain/history/exposures, BP/labs/imaging/CSF, and daily
recovery. Head tilt may persist after improvement and cannot cause a new random central diagnosis on reload.

## 3. Исследования

| ID | Capability | Ограничение |
|---|---|---|
| `vestibular_onset_course_video_fall_vomiting_and_exposure_history` | `vestibular_history_video` | Owner description plus observable state |
| `vestibular_complete_neurologic_localization_and_cranial_nerve_exam` | `vestibular_neuro_localization` | Peripheral/central/uncertain, not instant etiology |
| `vestibular_otoscopy_middle_inner_ear_and_hearing_route` | `vestibular_ear_route` | Normal external canal does not rule out middle ear |
| `vestibular_cbc_biochemistry_electrolytes_glucose_blood_pressure_and_selected_thyroid_tests` | `vestibular_systemic_screen` | Tests selected by signalment/context |
| `vestibular_mri_ct_and_csf_referral_when_central_atypical_or_persistent` | `vestibular_advanced_neuro_referral` | CSF safety after imaging review |
| `vestibular_ear_sampling_or_polyp_endoscopy_referral` | `vestibular_ear_specialist_referral` | Site-specific sampling |
| `vestibular_hydration_nausea_aspiration_mobility_and_injury_safety` | `vestibular_support_safety` | No generated drug/dose |
| `vestibular_serial_localization_recovery_and_recurrence_monitoring` | `vestibular_longitudinal_monitoring` | Expected direction/time, residual deficits allowed |
| `vestibular_owner_home_environment_and_emergency_red_flag_plan` | `vestibular_owner_safety_plan` | Fall/feeding/aspiration/new-central red flags |
| `vestibular_neurology_or_ear_specialist_referral` | `vestibular_advanced_neuro_referral` | Urgent when central/progressive/unsafe |

## 4. Варианты

- `vestibular_idiopathic_peripheral_improving`: geriatric dog, cat of any age, or residual/recurrent course; the generator requires
  improvement and lacks central evidence before the idiopathic label is allowed.
- `vestibular_otitis_media_interna_or_peripheral_ear`: facial/Horner signs, chronic hidden middle-ear disease, or painful/febrile
  otogenic intracranial extension; external otitis alone is not automatically the cause.
- `vestibular_central_syndrome`: altered mentation/postural deficits/other cranial nerves, paradoxical/multifocal localization, then
  vascular/inflammatory/infectious/neoplastic/metabolic differential with advanced referral.
- `vestibular_toxic_traumatic_congenital_or_systemic`: complete ear-product/medication history, trauma/temporal bone injury, or
  congenital/bilateral/systemic context; exposure is not invented after result.
- `vestibular_feline_polyp_mass_or_uncertain_course`: feline polyp route, progressive ear/skull-base mass, or failure to improve/new
  central signs that reopens localization and imaging.

## 5. Полнота, экономика и время

Every branch has localization, ear/systemic screen, safety state, full/staged/referral route, serial course and owner red flags. MRI/CT,
CSF, ear imaging/sampling and endoscopy are distinct external services. Observation is a legitimate staged route only for stable,
peripheral/no-central and improving patients with reliable recheck; it is not a cheap substitute for referral in progressive disease.

## 6. Валидатор противоречий

Reject if age/head tilt/nystagmus direction alone proves idiopathic or lesion side; central signs are ignored; normal external canal
excludes middle-ear disease; idiopathic label persists despite no improvement/new deficits; residual tilt equals treatment failure;
all cats/dogs recover identically; MRI/CSF is instant; or code generates antiemetic, antimicrobial, steroid, ear procedure or other
drug/procedure names, doses and protocols.

## 7. Источники

- Definition, diagnosis and treatment of canine/feline IVS: <https://pmc.ncbi.nlm.nih.gov/articles/PMC10556701/>
- Dogs with peripheral vestibular disease, MRI and outcome: <https://pmc.ncbi.nlm.nih.gov/articles/PMC7249679/>
- Vestibular disease in UK primary care: <https://pmc.ncbi.nlm.nih.gov/articles/PMC7517853/>
- Merck, Otitis Media and Interna: <https://www.merckvetmanual.com/ear-disorders/otitis-media-and-interna/otitis-media-and-interna-in-animals>

Specific drugs, doses, ear procedures, CSF protocols and surgical techniques are not approved here.
