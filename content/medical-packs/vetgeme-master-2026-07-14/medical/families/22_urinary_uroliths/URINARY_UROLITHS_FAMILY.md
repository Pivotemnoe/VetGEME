# Семейство 22 — уролиты и обструкция мочевых путей

Статус: `source_checked_pending_veterinary_review`

Generator eligibility: `false`

Виды первой версии: собака, кошка

Базовых вариантов: 5

Authored presentation branches: 15

## 1. Граница семейства

Кристаллы, камень и обструкция — разные сущности. Кристаллурия не доказывает наличие уролита, а состав камня нельзя
надёжно объявить только по pH или внешнему виду. При затруднённом мочеиспускании первый вопрос — выходит ли моча и нет ли
жизнеугрожающей обструкции.

Семейство различает:

- струвитный уролит, потенциально пригодный для растворения;
- нерастворимый уролит нижних мочевых путей;
- уретральную обструкцию;
- нефролит/уретеролит;
- рецидив и контроль после растворения/удаления.

Удаление или обход камня не устраняет условия его образования. Поэтому analysis и prevention являются частью одного
продольного случая, а не декоративным письмом после операции.

## 2. Генераторная модель

Это не пять фиксированных пациентов. Генератор выбирает совместимые вид, пол, возраст, рацион, регион, владельца,
темперамент и бюджет. При этом authored-template связывает:

- фактический urine output и bladder status;
- creatinine/electrolytes/ECG при обструкции;
- urine collection method, sediment, pH и culture;
- размер, число, radiopacity и location камней;
- composition likelihood и конечный quantitative analysis;
- infection/метаболическую причину;
- dissolution/removal/bypass/monitoring route;
- serial imaging и recurrence outcome.

При reload камень не меняет состав, число или место случайно. Serial imaging использует заранее заданную траекторию,
зависящую от authored truth и выполненного approved plan.

## 3. Общие вопросы и authored-ответы

| Вопрос | Допустимые типы ответа | Клиническая роль |
|---|---|---|
| Мочится ли пациент и какой объём? | Нормально, часто по капле, капли/нет, неизвестно | Emergency obstruction triage |
| Когда последний нормальный поток? | Время/дата, неизвестно | Длительность postrenal risk |
| Есть ли кровь, боль, вокализация? | Да/нет/не замечено | Нижние пути и тяжесть, но не причина |
| Были ли камни/обструкция раньше? | Analysis/report/date, «со слов», нет | Recurrence и тип |
| Есть ли инфекция/культура? | Метод/изолят/date, нет, не делали | Infection-induced struvite и stewardship |
| Как собирали мочу и когда? | Цистоцентез/катетер/free catch; до/после лечения | Интерпретация culture/sediment |
| Какой рацион и строго ли? | Полный список, лакомства/чужая миска | Dissolution/prevention validity |
| Сколько пьёт, какая влажность питания? | Измерено/примерно/неизвестно | Urine dilution strategy и compliance |
| Были ли печёночные/метаболические болезни? | Подтверждено/нет/не обследовано | Urate/cystine/other predisposition |
| Есть ли CKD или одна работающая почка? | Да/нет/неизвестно | Upper tract urgency |
| Были ли операции/стент/SUB/уретростомия? | Дата/тип/нет | Device, stricture, recurrence route |
| Что уже давали/делали дома? | Ничего, лекарства, давили живот, неизвестно | Safety и specimen interpretation |

Владелец может назвать любой минеральный тип «песком». Клиническая система использует лабораторный analysis/report, а не
бытовое слово.

## 4. Первичный триаж

До состава камня:

- ментальный статус, перфузия, температура, пульс;
- дыхание и сердечный ритм;
- bladder size/pain и фактический urine output;
- abdominal/renal pain;
- hydration, vomiting и systemic weakness;
- creatinine, potassium/electrolytes, acid-base и ECG по состоянию;
- возможность безопасной decompression/referral.

Непродуктивные попытки, большой болезненный пузырь, тяжёлая гиперкалиемия/брадикардия, коллапс, анурия/олигурия или
двусторонняя upper-tract obstruction являются emergency и не ждут планового stone analysis.

## 5. Исследования

| ID | Метод | Capability | Ограничение |
|---|---|---|---|
| `urolith_obstruction_perfusion_and_bladder_triage` | Поток, пузырь, перфузия, боль | `general_exam`, `abdominal_palpation`, `urinary_obstruction_stabilization` | До detailed diet discussion |
| `urolith_urinalysis_sediment_pH_and_culture` | Плотность, pH, кристаллы, клетки, culture | `urinalysis`, `urine_sediment_microscopy`, `urine_culture_external` | Кристаллы не равны камню; collection/time mandatory |
| `urolith_cbc_biochemistry_electrolytes_ecg` | Kidney, potassium, infection, ECG | `cbc`, `biochemistry`, `electrolytes`, `ecg` | Особенно при obstruction/upper tract |
| `urolith_multiview_radiography` | Размер, число, location/radiopacity | `xray_or_referral` | Radiolucent stone possible; urethra must be included when relevant |
| `urolith_ultrasound_upper_and_lower_tract` | Bladder, kidneys, ureters, pelvis | `ultrasound_or_referral` | Operator-dependent; acoustic shadowing/location documented |
| `urolith_serial_size_number_and_location` | Повторные снимки тем же методом | `urolith_dissolution_monitoring`, `upper_urinary_tract_monitoring` | Required for dissolution/observation; stable protocol |
| `urolith_quantitative_composition_analysis` | Quantitative mineral analysis | `urolith_analysis_external`, `urolith_database_lookup` | Кристалл/цвет не заменяет composition report |
| `urolith_endoscopic_surgical_or_bypass_referral` | Lithotripsy/removal/stent/SUB | `uroendoscopy_lithotripsy_referral`, `ureteral_intervention_referral`, `surgery_or_referral` | Method selected by specialist/anatomy, not UI |
| `urolith_recurrence_and_prevention_monitoring` | Urine, culture, imaging, diet/water | `urolith_prevention_plan`, `longitudinal_care` | Type-specific and evidence-based after analysis |

## 6. `urolith_struvite_dissolution_candidate`

Истина: location, stability, imaging и urine/culture pattern support a stone type for which medical dissolution may be
appropriate. Obstructed patients are not routine dissolution candidates until obstruction is safely resolved/bypassed.

### P1 — canine infection-induced struvite pattern

- Priority/urgent; dog, radiopaque bladder stones, alkaline urine/urease-producing bacterial culture compatible.
- Baseline imaging size/count, urine culture before treatment and renal/systemic status required.
- Dissolution diet and antimicrobial selection/duration are reviewed protocols; culture response and serial imaging are
  part of the same plan.

### P2 — feline sterile struvite pattern

- Priority/routine if nonobstructed; cat, compatible stone/crystal/imaging pattern without bacterial infection evidence.
- Infection is not invented because dog logic was copied; culture by risk/sample quality.
- Exclusive therapeutic diet and water plan require weekly clinical monitoring and scheduled imaging.

### P3 — serial imaging confirms or refutes dissolution

- Follow-up; stone size/number change is authored with same modality/time.
- Shrinkage supports continuation under protocol; unchanged/growth triggers compliance/type/retrieval reassessment.
- Symptoms/obstruction override waiting for the next planned image.

## 7. `urolith_nondissolvable_lower_tract`

Истина: composition/pattern is unlikely to dissolve safely or patient factors require removal/monitoring rather than a
blind dissolution attempt.

### P1 — calcium oxalate bladder stone pattern

- Priority; radiopaque stones, compatible species/patient, no infection-induced dissolution pattern.
- Removal route favors minimally invasive options when available; quantitative analysis required after retrieval.
- Acidification/dissolution cannot be generated by code as an incorrect universal plan.

### P2 — urate or cystine requires metabolic context

- Priority; radiolucent/variable stones and breed/liver/metabolic context.
- Contrast/ultrasound and specialist metabolic/hepatic workup; breed is risk, not diagnosis.
- Prevention/treatment needs composition confirmation and reviewed protocol.

### P3 — asymptomatic stone: monitor or remove

- Routine; no LUTS, stone too large/irregular to pass into urethra or otherwise low immediate risk.
- Watchful waiting can be correct with size/location monitoring and obstruction education.
- Growth, symptoms, infection or passage risk change the route; expensive removal is not automatically rewarded.

## 8. `urolith_urethral_obstruction`

Истина: urine outflow is mechanically/functional blocked by stone, plug, stricture, mass or combined inflammation. Cause is
documented after immediate emergency assessment.

### P1 — male cat strains without producing urine

- Emergency; repeated attempts, painful large bladder or uncertain output, possible vomiting/weakness.
- Electrolytes/ECG/kidneys and decompression/stabilization are prioritized; imaging/urine follow safely.
- Procedure technique, sedation and drugs are not generated.

### P2 — dog with urethrolith or mass pattern

- Emergency/urgent; rectal/urethral/imaging evidence, partial or complete obstruction.
- Reposition/lithotripsy/stent/surgery selected by specialist; direct urethral surgery is not automatic default.
- Prostate/mass/stricture differentials remain.

### P3 — recurrent obstruction and salvage route

- Emergency at each obstruction; recurrence history includes cause, environment, stones/plugs and previous procedure.
- Salvage surgery may reduce future blockage but is not cure for underlying inflammation/stones and has complications.
- Owner gets realistic prevention and recheck plan, not a guarantee.

## 9. `urolith_upper_urinary_tract`

Истина: nephrolith/ureterolith may be incidental or cause unilateral/bilateral obstruction. Lower urinary signs and a large
bladder may be absent.

### P1 — incidental nonobstructive nephrolith

- Routine/priority; stable renal function, no pain/infection/outflow obstruction.
- Monitoring may be preferred over removal; size, pelvis and kidney function tracked.
- Presence alone does not prove CKD progression or require invasive procedure.

### P2 — unilateral ureteral obstruction with subtle signs

- Urgent; vomiting/lethargy/renal pain may be mild, bladder not distended, creatinine can be modest if contralateral kidney works.
- Ultrasound/advanced imaging and serial renal pelvis/function required; early specialist referral.
- Normal urination does not exclude unilateral ureteral obstruction.

### P3 — bilateral or CKD-complicated obstruction

- Emergency; azotemia rises, oliguria/anuria or pre-existing contralateral CKD.
- Stabilization and experienced ureteral intervention referral; success/complication depends on anatomy/operator.
- Device placement/bypass technique and thresholds remain reviewed protocol.

## 10. `urolith_recurrent_or_post_removal`

Истина: recurrence prevention depends on quantitative composition and correction of underlying factors. A removed stone
without analysis leaves an incomplete plan.

### P1 — quantitative analysis changes prevention

- Follow-up; report lists components/proportions, not just a visual label.
- Diet, urine target, infection/metabolic workup selected from reviewed type-specific protocol.
- Mixed stone follows dominant/clinically relevant composition, not one generic diet.

### P2 — residual fragment or incomplete clearance

- Postprocedure priority; imaging shows residual material/location.
- Further removal vs monitoring based on size/risk, with same specialist route.
- Procedure is not marked complete solely because symptoms improved.

### P3 — recurrence despite reported diet or infection control

- Follow-up/priority; verifies exclusive diet, water, culture resolution, type and imaging schedule.
- Wrong composition, residual stone, reinfection or metabolic cause considered before blaming owner.
- Endless random diet switching is prohibited.

## 11. Минимальные безопасные планы

Каждая презентация содержит:

1. urine output and obstruction flag;
2. perfusion, kidneys, electrolytes and ECG if indicated;
3. urine collection/microscopy/culture context;
4. multiview imaging of relevant tract;
5. size, number, location, radiopacity and risk;
6. composition likelihood vs confirmed quantitative analysis;
7. dissolution/removal/observation/referral eligibility;
8. serial imaging and hard exit criteria;
9. recurrence prevention after analysis;
10. safe referral when procedure/equipment unavailable.

## 12. Экономика, оборудование и время

- Microscopy, culture, x-ray, ultrasound and stone analysis are separate capabilities and queues.
- Emergency obstruction reserves monitor, pump, urinary skill and referral transport; no ordinary appointment delay.
- Dissolution is longitudinal and consumes therapeutic diet, cultures and serial imaging; it is not a cheap instant button.
- Minimally invasive referral may cost more upfront but avoids automatic urethral surgery; economics show real tradeoffs.
- Incidental low-risk stone monitoring can be clinically correct and must not lose reputation for avoiding an unnecessary sale.
- SUB/stent/lithotripsy are external specialist services, not equipment a small clinic casually buys in chapter 5.

## 13. Владелец, темперамент и персонал

- Owner may confuse constipation with urinary straining; actual urine output and bladder exam decide emergency.
- Fearful painful cat needs low-stress emergency handling and trained staff; aggression is pain/stress, not refusal of care.
- Multi-pet homes need feasible separate feeding/water monitoring.
- Technician can run urine sediment/type-specific logs after training; physician interprets composition/route.
- External culture/analysis/intervention returns to the same patient/episode.

## 14. Валидатор противоречий

Ветка отклоняется, если:

- crystal equals stone or determines composition automatically;
- urine pH alone determines mineral type;
- any straining is labeled constipation without urine output check;
- obstructed patient starts routine dissolution while blocked;
- normal urination excludes unilateral ureteral obstruction;
- any nephrolith requires removal;
- asymptomatic low-risk stone removal is always rewarded over monitoring;
- removed stone is considered complete without analysis/prevention;
- infection-induced and sterile struvite share identical logic;
- specific drug, dose, diet composition, catheterization/lithotripsy/SUB technique is generated by code;
- device/procedure is available without specialist capability;
- serial imaging changes randomly after decision/reload;
- external result/intervention is instant;
- recurrence becomes a new unrelated animal;
- owner refusal hides obstruction/hyperkalemia/upper-tract emergency without safe referral.

## 15. Источники

- ACVIM Consensus Recommendations on Treatment and Prevention of Uroliths:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC5032870/>
- 2025 iCatCare Consensus Guidelines on Lower Urinary Tract Diseases in Cats:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC11816079/>
- Merck Veterinary Manual, Urethral Obstruction:
  <https://www.merckvetmanual.com/urinary-system/urolithiasis-in-small-animals/urethral-obstruction-in-small-animals>
- Merck Veterinary Manual, Obstructive Uropathy:
  <https://www.merckvetmanual.com/urinary-system/noninfectious-diseases-of-the-urinary-system-in-small-animals/obstructive-uropathy-in-dogs-and-cats>
- Merck Veterinary Manual, Overview of Urolithiasis:
  <https://www.merckvetmanual.com/urinary-system/urolithiasis-in-small-animals/overview-of-urolithiasis-in-small-animals>

Конкретные препараты, дозы, состав лечебных рационов, urinary targets, техника катетеризации/декомпрессии, литотрипсии,
стентирования, SUB и операции этим файлом не утверждаются. После отдельного ветеринарного review они подключаются как
версионированные протоколы; код их не генерирует.
