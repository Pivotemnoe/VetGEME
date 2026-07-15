# Семейство 27 — расширение и заворот желудка

Статус: `source_checked_pending_veterinary_review`

Generator eligibility: `false`

Виды первой версии: собака

Базовых вариантов: 3

Authored presentation branches: 9

## 1. Граница семейства

Острое расширение желудка и gastric dilatation-volvulus (GDV) — не одно и то же. GDV является быстро прогрессирующим
жизнеугрожающим состоянием, в котором стабилизация и хирургический маршрут идут параллельно, а не последовательно после
долгого заполнения карточки. Порода/глубокая грудная клетка повышают риск, но не устанавливают диагноз.

## 2. Генераторная модель

Authored truth заранее фиксирует onset, productive/nonproductive retching, abdominal contour, perfusion/shock, respiratory
effect, radiographic position/pattern, stomach/spleen viability risk, arrhythmia, decompression/surgery route, postoperative
trajectory and gastropexy status. Delay is a real time-dependent risk, not an arbitrary countdown. After reload a suspected
volvulus cannot turn into simple food bloat because the player selected a cheaper plan.

## 3. Общие вопросы и первичный триаж

- Когда начались беспокойство, слюнотечение, позывы и увеличение живота?
- Выходит ли рвота или позывы непродуктивны?
- Был ли большой приём пищи, но без превращения этого факта в диагноз?
- Были ли GDV, gastropexy, splenectomy or relatives affected?
- Есть ли collapse, weakness, pale mucosa or breathing difficulty?

До подробной истории оцениваются airway/breathing, pulses/perfusion, shock, abdominal distension/pain, respiratory compromise,
ECG rhythm and safe vascular access. Nonproductive retching with progressive distension, poor pulses, collapse or shock is an
emergency even before confirmatory imaging.

## 4. Исследования

| ID | Метод | Capability | Ограничение |
|---|---|---|---|
| `gdv_immediate_perfusion_and_abdominal_triage` | Perfusion, abdomen, respiration | `gdv_emergency_triage` | Immediate |
| `gdv_stabilization_and_decompression_route` | Shock support and pressure relief route | `gdv_stabilization`, `gastric_decompression_referral` | Must not delay surgery |
| `gdv_abdominal_radiographic_confirmation` | Correctly positioned abdominal views | `gdv_radiography` | Only when transport/position safe |
| `gdv_cbc_biochemistry_electrolytes_lactate_and_coagulation` | Systemic/perfusion trends | `cbc`, `biochemistry`, `electrolytes`, `lactate_measurement`, `coagulation` | Prognostic/monitoring, not reason to wait |
| `gdv_ecg_and_continuous_monitoring` | Rhythm and perfusion | `ecg`, `gdv_continuous_monitoring` | Continues perioperatively |
| `gdv_emergency_surgical_assessment` | Stomach rotation/viability/spleen | `gdv_surgery_referral` | Procedure details stay external |
| `gdv_postoperative_reperfusion_arrhythmia_and_organ_monitoring` | ECG, BP, kidneys, bleeding, pain | `gdv_postoperative_monitoring` | Longitudinal same episode |
| `gdv_gastropexy_status_and_recurrence_assessment` | Records and imaging | `gdv_gastropexy_followup` | Gastropexy reduces volvulus risk, not all dilation |
| `gdv_individual_prevention_and_prophylactic_referral` | Risk/family/history discussion | `prophylactic_gastropexy_referral` | Shared decision, not breed-only guarantee |

## 5. Клинические варианты

### `gdv_gastric_dilatation_without_confirmed_volvulus`

- `p1_gastric_dilatation_stable_enough_for_differentiation`: dilated stomach but stable enough for correct imaging and
  differential; observation/treatment still has escalation criteria.
- `p2_equivocal_early_or_position_limited_imaging`: unsafe positioning or equivocal view keeps emergency suspicion alive and
  requires expert imaging/referral rather than a false negative.
- `p3_food_bloat_or_other_acute_abdominal_mimic`: simple dilation, obstruction, splenic event or other abdomen is distinguished
  by authored findings; risk breed does not force GDV.

### `gdv_confirmed_or_highly_suspected_volvulus`

- `p1_nonproductive_retching_distension_and_shock`: simultaneous stabilization, decompression and emergency surgery route.
- `p2_gastric_wall_or_splenic_compromise_risk`: prolonged/severe disease raises viability and resection/splenic uncertainty;
  owner receives a range, not a guarantee.
- `p3_delayed_collapse_arrhythmia_or_multiorgan_risk`: shock, arrhythmia, coagulopathy and organ injury need intensive monitoring;
  the delay consequence is linked to the original visit.

### `gdv_postoperative_recurrence_or_prevention`

- `p1_postoperative_arrhythmia_perfusion_and_incision_monitoring`: improvement after surgery does not end ECG/perfusion/pain
  and organ monitoring.
- `p2_gastric_dilatation_after_gastropexy_without_volvulus`: gastropexy can prevent rotation while dilation still occurs; the
  game must not declare the previous surgery failed without evidence.
- `p3_prophylactic_gastropexy_discussion_in_at_risk_dog`: breed, conformation, relatives, age and concurrent surgery inform a
  specialist discussion; prophylaxis is not a zero-risk promise.

## 6. Минимальные безопасные планы

Every branch includes emergency recognition, perfusion/respiratory support, safe imaging or immediate referral, decompression
route, surgical availability, continuous rhythm/perfusion monitoring, informed uncertainty and postoperative red flags. A clinic
without surgery/ICU cannot keep the patient waiting for a routine slot.

## 7. Экономика, персонал и время

GDV reserves emergency staff, monitor, pumps, imaging and transport/surgical capacity. Deposit/financial discussion cannot delay
minimum stabilization and transfer. Surgery estimate has authored ranges for viability, spleen, intensive care and complications.
Prophylactic gastropexy is a separate elective referral, not an emergency upsell during unrelated visits.

## 8. Валидатор противоречий

Reject if breed proves GDV; any distension equals volvulus; normal early/equivocal image silently closes the case; stabilization
waits for every test; decompression is presented as definitive GDV treatment without surgery; gastropexy prevents all future
dilation; a post-op arrhythmia becomes a random new patient; external surgery is instantaneous; or code generates fluid dose,
decompression technique, anesthetic plan, gastropexy technique or resection threshold.

## 9. Источники

- ACVS, Gastric Dilatation-Volvulus: <https://www.acvs.org/small-animal/gastric-dilatation-volvulus/>
- Merck Veterinary Manual, Gastric Dilation and Volvulus in Small Animals:
  <https://www.merckvetmanual.com/digestive-system/surgical-problems-of-the-gastrointestinal-tract-in-small-animals/gastric-dilation-and-volvulus-in-small-animals>
- ACVS, Prophylactic Gastropexy: <https://www.acvs.org/small-animal/prophylactic-gastropexy/>
- Gastric Dilatation-Volvulus in Dogs: Analysis of 130 Cases:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC11851494/>

Specific drugs, doses, decompression/surgery/anesthesia techniques and tissue-resection thresholds are not approved here.
