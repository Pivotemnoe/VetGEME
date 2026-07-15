# Семейство 30 — хронический отит и подозрение на среднее ухо

Статус: `source_checked_pending_veterinary_review`

Generator eligibility: `false`

Виды первой версии: собака, кошка

Базовых вариантов: 6

Authored presentation branches: 18

## 1. Граница семейства

Хронический наружный отит, otitis media и otitis interna — связанные, но разные уровни заболевания. Нормально выглядящая
или интактная барабанная перепонка не исключает средний отит; стеноз, экссудат и боль могут сделать её недоступной осмотру.
CT/MRI, video otoscopy и middle-ear sampling имеют разные роли. Посев из наружного канала не считается посевом среднего уха.

Семейство различает recurrent externa with middle-ear risk, media with intact/unseen tympanum, media with rupture, interna with
peripheral vestibular signs, feline polyp/secretory disease и end-stage/cholesteatoma/mass.

## 2. Генераторная модель

Authored truth хранит laterality, canal changes, tympanic visibility/integrity, external and middle-ear cytology/culture, bulla/inner
ear imaging, facial/vestibular/hearing findings, primary trigger, prior procedures and longitudinal response. A created ear cannot
switch sides or regain an intact tympanum after reload without an authored follow-up event.

## 3. Общие вопросы

| Вопрос | Роль |
|---|---|
| Сколько эпизодов, какой стороной и какой был ответ? | Recurrence and laterality |
| Были ли culture, video otoscopy, CT/MRI or surgery? | Prior evidence |
| Болезненно ли открывать рот/жевать? | Middle-ear/bulla suspicion |
| Есть ли head tilt, falling, nystagmus, facial droop? | Inner ear/nerve urgency |
| Есть ли сухой глаз/изменение зрачка/третьего века? | Facial/Horner route |
| Слышит ли пациент и как это проверяли? | Hearing evidence confidence |
| Чем чистили ухо и была ли перепонка известна? | Ototoxic/trauma risk context |
| Есть ли allergy/skin/endocrine pattern? | Primary perpetuating cause |
| У кошки есть nasal noise, dysphagia or polyp history? | Nasopharyngeal source |

## 4. Осмотр и срочность

Оцениваются боль, swelling, canal patency, discharge, bilateral cytology, oral opening, cranial nerves, tear production when
indicated, proprioception and vestibular pattern. Severe pain, facial paralysis with ocular risk, inability to stand/eat, central
neurologic signs, rapidly progressive swelling, sepsis or suspected mass creates urgent specialist route. Painful stenotic ears are
not repeatedly forced with a handheld otoscope.

## 5. Исследования

| ID | Метод | Capability | Ограничение |
|---|---|---|---|
| `ear_chronic_complete_dermatologic_and_neurologic_history` | Skin/ear/neuro timeline | `ear_chronic_history_map` | Same patient longitudinally |
| `ear_chronic_bilateral_cytology_and_external_canal_mapping` | Both canals/site cytology | `ear_cytology` | External result not middle-ear truth |
| `ear_chronic_video_otoscopy_and_tympanic_assessment` | Magnified exam/cleaning route | `video_otoscopy_referral` | Anesthesia/skill; normal membrane not full exclusion |
| `ear_chronic_ct_mri_bulla_and_inner_ear_imaging` | Bulla, bone, canal, inner ear | `middle_ear_imaging_external` | Incidental bulla fluid needs clinical correlation |
| `ear_chronic_middle_ear_sampling_cytology_culture` | True middle-ear sample | `middle_ear_sampling_referral` | Myringotomy/procedure externally reviewed |
| `ear_chronic_facial_nerve_horner_tear_and_hearing_assessment` | CN/tear/hearing | `ear_cranial_nerve_assessment`, `hearing_assessment_external` | Hearing behavior alone has limits |
| `ear_chronic_polyp_nasopharyngeal_and_mass_workup` | Oral/nasopharynx/imaging/histology | `nasopharyngeal_endoscopy_referral`, `histology_external` | Tissue diagnosis for mass |
| `ear_chronic_underlying_allergy_endocrine_and_anatomic_review` | Primary/predisposing/perpetuating factors | `dermatology_referral` | Infection-only treatment is incomplete |
| `ear_chronic_response_tympanum_neurologic_and_hearing_monitoring` | Cytology/pain/neuro/hearing | `ear_longitudinal_monitoring` | Same ear and sampling level |
| `ear_chronic_surgical_salvage_referral` | Bulla/canal surgery assessment | `ear_surgery_referral` | No code-generated procedure |

## 6. Клинические варианты

### `ear_chronic_recurrent_externa_with_middle_ear_risk`

- `p1_repeated_same_ear_or_incomplete_response`: repeated or relapsing same-side disease triggers middle-ear/primary-cause review.
- `p2_stenotic_painful_canal_limits_tympanic_view`: inability to see the membrane is recorded as unknown, not «intact».
- `p3_recurrent_resistant_bacterial_or_mixed_cytology`: site-specific cytology/culture and prior exposure precede escalation.

### `ear_otitis_media_intact_or_unseen_tympanum`

- `p1_normal_appearing_tympanum_but_supporting_signs`: pain, recurrence and imaging can support media despite appearance.
- `p2_bulging_opaque_or_abnormal_tympanum`: video exam and imaging/sampling route; bulging alone is interpreted in context.
- `p3_bilateral_or_subclinical_contralateral_middle_ear_disease`: opposite ear is assessed; bilateral imaging truth is preserved.

### `ear_otitis_media_ruptured_tympanum`

- `p1_spontaneous_rupture_with_otorrhea`: middle-ear involvement and safe topical/systemic reviewed route replace routine externa.
- `p2_foreign_body_or_traumatic_iatrogenic_rupture`: foreign body/aggressive cleaning/procedure history remains a cause modifier.
- `p3_middle_ear_sample_differs_from_external_canal`: discordant results are possible and must not be overwritten by easier sample.

### `ear_otitis_interna_peripheral_vestibular`

- `p1_head_tilt_nystagmus_and_ataxia_with_ear_disease`: peripheral vestibular pattern plus ear evidence; safe mobility/support.
- `p2_facial_nerve_horner_dry_eye_or_hearing_deficit`: ocular protection/tear/hearing route and prognosis are explicit.
- `p3_severe_vestibular_signs_require_central_differential_route`: proprioceptive/mentation/vertical nystagmus or discordance transfers
  to neurologic imaging rather than being forced into ear infection.

### `ear_feline_polyp_or_secretory_middle_ear_disease`

- `p1_young_cat_with_polyp_and_upper_airway_or_ear_signs`: ear/nasopharyngeal views and imaging define origin/extent.
- `p2_primary_secretory_middle_ear_pattern`: fluid and compatible clinical signs without routine bacterial assumption.
- `p3_recurrent_after_incomplete_polyp_removal_or_bilateral_disease`: recurrence follows the same polyp/procedure and bulla.

### `ear_end_stage_cholesteatoma_or_mass`

- `p1_mineralized_obliterated_end_stage_canal`: irreversible canal change and quality-of-life/pain lead to salvage referral.
- `p2_cholesteatoma_or_progressive_bulla_change`: expanding keratin/bone change requires imaging and surgical/histologic plan.
- `p3_mass_neoplasia_or_surgical_salvage_route`: mass does not equal cancer until tissue diagnosis; oncology/ear surgery routes link.

## 7. Минимальные безопасные планы

Every presentation includes pain/neuro/ocular safety, bilateral site-specific cytology, tympanum known/unknown status, advanced
imaging or safe referral, true middle-ear sampling when decision-changing, primary-cause control, recheck and surgical threshold.
Missing video otoscopy/CT/MRI/surgery never produces a dead-end or blind repeated topical therapy.

## 8. Экономика, оборудование и время

Hand otoscope, cytology, anesthesia, video otoscopy, CT/MRI, culture, histology and surgery are separate queues. External results
take time and return to the same ear episode. Repeated inexpensive treatment without identifying middle-ear disease accumulates
pain, resistance risk and total cost. Surgery can be high-cost but is not offered automatically before reversible disease and cause
control are assessed.

## 9. Валидатор противоречий

Reject if normal/intact/unknown tympanum excludes media; external culture equals middle-ear culture; every head tilt is otitis
interna; every bulla fluid finding is infection; stenotic painful ear is repeatedly forced awake; opposite ear is ignored; recurrent
polyp becomes a new patient; mass automatically equals neoplasia; advanced imaging/procedure is instant; or code generates drug,
dose, ototoxicity decision, cleaning solution, myringotomy/flush or ear-surgery technique.

## 10. Источники

- Merck Veterinary Manual, Otitis Media and Interna in Animals:
  <https://www.merckvetmanual.com/ear-disorders/otitis-media-and-interna/otitis-media-and-interna-in-animals>
- Canine Otitis Externa — Treatment and Complications: <https://pmc.ncbi.nlm.nih.gov/articles/PMC6294027/>
- Merck Veterinary Manual, Cholesteatomas in Small Animals:
  <https://www.merckvetmanual.com/ear-disorders/tumors-of-the-ear-in-small-animals/cholesteatomas-in-small-animals>
- Comparative Performance of Video-otoscopy and CT in Cats:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC11529141/>
- University of Minnesota, Otitis Media — Dogs and Cats:
  <https://open.lib.umn.edu/animaldermatology/chapter/otitis-media-dogs-and-cats/>

Specific drugs, doses, topical safety tables, myringotomy/flush and surgical techniques are not approved here.
