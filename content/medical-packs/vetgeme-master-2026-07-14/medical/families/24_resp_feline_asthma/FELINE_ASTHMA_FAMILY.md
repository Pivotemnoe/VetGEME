# Семейство 24 — астма кошек

Статус: `source_checked_pending_veterinary_review`

Generator eligibility: `false`

Виды первой версии: кошка

Базовых вариантов: 4

Authored presentation branches: 12

## 1. Граница семейства

Астма кошек — хроническое воспалительное заболевание нижних дыхательных путей с гиперреактивностью и обратимой
бронхоконстрикцией. Она может проявляться редким кашлем, свистящим дыханием или жизнеугрожающей одышкой. Одного
симптома, одного снимка или одной эозинофилии недостаточно: общепринятого единственного gold-standard теста нет.

Семейство различает:

- стабильное подозрение на asthma-like lower airway disease;
- острое обострение;
- тяжёлый бронхоспазм/астматический статус;
- имитирующее заболевание или плохой контроль.

Астма, хронический бронхит, паразитарная болезнь, heartworm-associated respiratory disease, пневмония, отёк,
неоплазия и инородное тело не объединяются в одну кнопку «бронхит».

## 2. Генераторная модель

Это не четыре фиксированные кошки. Генератор выбирает совместимые возраст, телосложение, среду, владельца,
темперамент и доступность оборудования. Authored-template заранее связывает:

- характер и частоту cough/wheeze episodes;
- resting respiratory rate, expiratory effort и oxygenation;
- рентгенологический pattern и возможные нормальные/неспецифические findings;
- airway cytology/culture, если sampling безопасен;
- региональную совместимость parasites/heartworm;
- environment inventory и конкретный trigger exposure;
- controller/rescue-plan components после review;
- технику mask/spacer и реальную выполнимость владельцем;
- симптомную динамику, обострения и осложнения.

Порода может менять вероятность, но не устанавливает диагноз. Эозинофилы в крови или BAL не превращают любую кошку в
астматика и не исключают паразитов/heartworm.

## 3. Общие вопросы и authored-ответы

| Вопрос | Допустимые типы ответа | Клиническая роль |
|---|---|---|
| Это кашель, рвотные движения или шерсть? | Видео/описание/не уверен | Symptom classification |
| Как часто и сколько длится эпизод? | Дневник/примерно/неизвестно | Control and severity |
| Как кошка дышит во сне? | Измеренная RR/видео/не считали | Resting trend |
| Есть ли открытый рот, синюшность, слабость? | Да/нет/не уверен | Emergency route |
| Есть ли дым, аэрозоли, духи, пыльный наполнитель, ремонт? | Exposure/date/нет | Modifiable irritants |
| Изменился ли дом, сезон или вентиляция? | Да/нет/детали | Trigger timeline |
| Живёт ли на улице, охотится, путешествовала? | Да/нет/география | Parasite/heartworm filter |
| Какие лекарства и устройства назначены? | Название/устройство/нет/не помню | Plan reconstruction |
| Покажите, как используется маска/spacer | Демонстрация/видео/невозможно | Technique is observable fact |
| Сколько доз реально пропущено? | Число/примерно/скрывает | Adherence without moral label |
| Есть ли ожирение или малая активность? | BCS/activity | Respiratory burden and handling |
| Были ли снимки/BAL/сердечное обследование? | Дата/файл/результат/нет | Avoid duplicate assumptions |

## 4. Первичный триаж

До подробной диагностики оцениваются:

- airway patency, rate и expiratory effort;
- открытое дыхание ртом, cyanosis и mental status;
- chest movement, wheeze или опасно тихие lung sounds;
- pulse oximetry только при надёжном сигнале;
- переносимость фиксации и транспортировки;
- признаки pleural-space disease, pulmonary edema или upper-airway obstruction;
- потребность в oxygen, low-stress handling и emergency referral.

Тяжёлая одышка не требует насильственной рентгенографии или BAL перед стабилизацией. Отсутствие громких свистов у
истощённой кошки не считается улучшением.

## 5. Исследования

| ID | Метод | Capability | Ограничение |
|---|---|---|---|
| `feline_asthma_respiratory_triage_and_minimal_handling` | RR/effort/SpO2/observation | `respiratory_distress_minimal_handling`, `pulse_oximetry`, `oxygen` | До длительной фиксации |
| `feline_asthma_thoracic_radiography` | Bronchial pattern, hyperinflation, mimics | `xray_or_referral` | Может быть неспецифична; instability first |
| `feline_asthma_airway_cytology_and_culture` | BAL/airway sample | `feline_airway_cytology_external`, `lower_airway_sampling_referral` | Не у нестабильной кошки; eosinophilia not specific |
| `feline_asthma_parasite_heartworm_and_regional_exclusion` | Faecal/antigen/serology by risk | `feline_lungworm_testing_external`, `feline_heartworm_testing_external`, `regional_disease_filter` | Geography/exposure required |
| `feline_asthma_cardiac_and_structural_mimic_exclusion` | Cardiac/advanced imaging route | `echocardiography_external`, `advanced_imaging_referral` | Only compatible differential route |
| `feline_asthma_environment_and_trigger_inventory` | Home exposure inventory | `feline_asthma_environment_plan` | Correlation is not proof; removal can be therapeutic test |
| `feline_asthma_inhaler_device_technique_check` | Mask/spacer demonstration | `feline_inhaler_training` | Technique checked before owner is labelled non-adherent |
| `feline_asthma_longitudinal_symptom_and_exacerbation_log` | Cough/RR/rescue/use log | `feline_asthma_longitudinal_monitoring` | Same patient; no random reset |
| `feline_asthma_refractory_advanced_airway_referral` | CT/bronchoscopy/reassessment | `airway_endoscopy_referral`, `advanced_imaging_referral` | After stabilization and initial exclusions |

## 6. `feline_asthma_stable_lower_airway_disease`

Истина: признаки совместимы с lower-airway disease, пациент стабилен, а опасные имитации имеют явные пути исключения.

### P1 — intermittent cough or wheeze

- Routine/priority; редкие эпизоды, нормальное дыхание между ними, без hypoxemia.
- Video and symptom log, examination and imaging/exclusion plan; no instant diagnosis from one cough.
- Long-term inflammation risk and reviewed controller plan are explained even if current signs are mild.

### P2 — chronic cough with bronchial pattern

- Priority; repeated cough and compatible bronchial/hyperinflation findings.
- Airway sampling may distinguish eosinophilic, neutrophilic, infectious or mixed inflammation when safe.
- Chronic bronchitis remains a meaningful differential; image alone does not decide.

### P3 — cough mistaken for hairball or nausea

- Routine/priority; owner video reveals crouched neck-extended cough without produced hairball, or remains ambiguous.
- The correct action is symptom clarification and respiratory workup, not ridicule.
- GI signs are retained if real; the interface does not rewrite them after doctor interpretation.

## 7. `feline_asthma_acute_exacerbation`

Истина: a previously stable or suspected airway disease has an acute increase in bronchoconstriction/inflammation while the
cat still responds to initial stabilization and does not meet the severe-status route.

### P1 — after smoke, dust, aerosol or environment change

- Urgent by effort; a compatible exposure precedes worsening.
- Remove exposure, assess oxygen need and use reviewed acute/support plan; environment plan prevents recurrence.
- Correlation does not license a new unreviewed allergen diagnosis.

### P2 — inhaler or spacer technique failure

- Urgent/stable; prescribed therapy is not reaching the cat because seal, breaths, timing or conditioning is inadequate.
- Staff observes demonstration and retrains; owner is not automatically penalized for an unteachable device.
- The plan offers feasible device/administration alternatives after review.

### P3 — breakthrough despite reported plan

- Urgent; technique and actual use appear adequate but attacks recur.
- Reassess dose/protocol only through reviewed content, plus triggers, comorbidity and mimics.
- Repeated rescue-only use is not treated as adequate chronic control.

## 8. `feline_asthma_severe_status`

Истина: bronchospasm and airway inflammation threaten oxygenation or ventilatory endurance. Minimal handling and emergency
care take precedence over completing the diagnosis.

### P1 — marked expiratory distress or cyanosis

- Emergency; open-mouth breathing, pronounced expiratory push, cyanosis or reliable hypoxemia.
- Oxygen/low-stress stabilization and reviewed emergency components; imaging only when safe.
- Owner communication is short and action-focused.

### P2 — exhaustion, quiet chest or worsening gas exchange

- Emergency; decreasing air movement, fatigue, mental change or failure to respond.
- Intensive-care/ventilation referral appears before collapse.
- Quiet auscultation cannot be marked as normal lungs in this authored context.

### P3 — pneumothorax or other acute complication

- Emergency; sudden worsening, asymmetric/absent sounds or poor response triggers pleural/complication assessment.
- Stabilization and external emergency procedure route; technique is not generated.
- The complication is stored in the same episode, not replaced by a new random diagnosis.

## 9. `feline_asthma_mimic_or_poor_control`

Истина: a competing disease explains part or all of the signs, or control is poor because the plan, environment or diagnosis
is incomplete.

### P1 — lungworm or heartworm-compatible context

- Priority/complex; outdoor/region/travel and compatible findings.
- Faecal/antigen/serology route is selected by epidemiology; BAL eosinophilia alone cannot distinguish asthma.
- Region-incompatible parasites are not generated for variety.

### P2 — chronic bronchitis, infection or mixed inflammation

- Priority/complex; neutrophilic/mixed airway findings, culture or chronic mucus pattern.
- Antimicrobial treatment requires bacterial evidence/clinical context; neutrophils alone are not a prescription.
- Mixed disease can preserve an asthma component without collapsing everything into one label.

### P3 — cardiac, neoplastic, foreign-body or other mimic

- Urgent/complex by status; imaging/exam suggests edema, mass, focal airway disease or foreign body.
- Cardiac and advanced-airway routes become visible; inappropriate immunosuppression has consequences.
- The family handoff preserves all collected facts and patient identity.

## 10. Минимальные безопасные планы

Каждая презентация содержит:

1. respiratory stability and minimal-handling flag;
2. oxygen/emergency route;
3. imaging only when safe;
4. explicit mimic exclusions by regional and clinical compatibility;
5. airway sampling route when stable and decision-changing;
6. reviewed acute and long-term plan components;
7. environmental inventory and modifiable irritants;
8. observed device-technique check;
9. symptom/exacerbation monitoring and red flags;
10. ICU/advanced-airway referral threshold.

## 11. Экономика, оборудование и время

- Oxygen, monitor, x-ray and advanced airway service are independent queues.
- Mask/spacer is equipment plus owner/staff training, not a cosmetic unlock.
- Environmental change can be low-cost and high-value; it is not sold as a guaranteed cure.
- Stable diagnostic sampling is an elective resource; emergency handling must not force it.
- Long-term control consumes follow-ups and training time but reduces emergency risk and future cost.
- Unnecessary region-incompatible tests reduce value; safe exclusions remain available.

## 12. Владелец, темперамент и персонал

- Fearful/dyspneic cats need observation and low-stress care; aggressive behavior under air hunger is not a personality flaw.
- Owner can confuse cough with hairball, but the game asks for video and description rather than mocking the mistake.
- Staff demonstrates the inhaler, observes return demonstration and records barriers.
- Smoke, perfume, aerosol or litter discussions are specific and non-moralizing.
- Repeated exacerbation changes owner anxiety and adherence within the same relationship.

## 13. Валидатор противоречий

Ветка отклоняется, если:

- one cough, breed or bronchial radiograph automatically proves asthma;
- blood or BAL eosinophilia is treated as specific for asthma;
- parasite/heartworm content ignores geography and exposure;
- unstable cat is forced through radiographs, BAL or bronchoscopy before stabilization;
- bronchodilator-only rescue is presented as complete chronic inflammation control;
- repeated rescue use counts as good control;
- device prescription succeeds without technique and feasibility check;
- owner is labelled non-adherent before observed technique/adherence assessment;
- quiet chest in an exhausted cat is interpreted as normal;
- any respiratory distress is assigned to asthma without pleural/cardiac/pneumonia alternatives;
- specific drug, dose, taper, inhaler actuation count or emergency procedure is generated by code;
- external results/referral return instantly;
- longitudinal attack history resets after reload or becomes another cat.

## 14. Источники

- Merck Veterinary Manual, Feline Bronchial Asthma:
  <https://www.merckvetmanual.com/respiratory-system/respiratory-diseases-of-small-animals/feline-bronchial-asthma>
- Feline Asthma: What's New and Where Might Clinical Practice Be Heading?:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC11148999/>
- Feline Asthma and Heartworm Disease: Clinical Features, Diagnostics and Therapeutics:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC10814146/>
- Do Inhaled or Oral Glucocorticoids More Effectively Control Feline Asthma?:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC13082273/>

Конкретные препараты, дозы, длительность, taper, inhaler actuation counts, кислородные targets и техника emergency airway
procedures этим файлом не утверждаются. После отдельного ветеринарного review они подключаются как версионированные
протоколы; код их не генерирует.
