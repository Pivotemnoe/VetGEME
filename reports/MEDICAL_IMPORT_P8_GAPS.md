# P8 — блокеры медицинского импорта

Дата аудита: 15 июля 2026 года.

Статус: `blocked_external_veterinary_approval_no_activation`.

Этот файл перечисляет только фактически найденные несоответствия и недостающие
решения. Медицинские формулировки, статусы, capabilities, crosswalk и runtime-поля
здесь не дополняются и не угадываются.

## Решение по P8

Ни одно семейство master package сейчас нельзя подключить к production-генератору:

- 39 из 39 семейств имеют статус
  `source_checked_pending_veterinary_review`;
- утверждённых (`approved`) семейств: 0;
- 39 из 39 семейств имеют `generatorEligible: false`;
- production pool master-каталога: 0 семейств, 0 вариантов, 0 presentations;
- registry отдельно фиксирует `productionEligible: false`;
- capability registry отдельно фиксирует
  `medicalResearchMappingEligible: false`.

Поэтому P8 не создаёт activation manifest, не меняет generator pool, не добавляет
в save master-ссылки и не выпускает фиктивные пакеты 1–8. Требование handoff о
раздельном коммите, validator report и generator smoke применяется только после
получения `approved` для конкретного пакета.

## Проверенная целостность источника

Импортированная review-копия совпадает с handoff:

- 83 исходных файла;
- aggregate SHA-256:
  `c114651092f6efc16d722b6495c91dfe51e70251a8a420ea95184dcf5237e094`;
- 39 семейств, 215 вариантов, 645 presentation ID;
- 447 объявлений capabilities;
- 0 production-eligible элементов;
- package validator: 0 предупреждений, 0 ошибок.

ID, версии и review-статусы между `family-registry.json` и 39 `family.json`
совпадают. Ниже перечислены другие контракты, которые не совпадают или отсутствуют.

## Недостающий production-контракт

1. У 215 вариантов нет собственных `version`, `status` и
   `generatorEligible`.
2. 645 presentations представлены строковыми ID. У них нет собственного
   машиночитаемого clinical contract, `version`, `status` и
   `generatorEligible`.
3. Клиническая структура вариантов и presentations находится в Markdown, но не
   перенесена в проверяемые runtime-поля. Автоматически извлекать её нельзя.
4. Нет утверждённого crosswalk между 30 действующими карточками `tier-01-v2` и
   master family/variant/presentation. Существующий compatibility index является
   только identity-индексом старого набора.
5. Нет утверждённого сопоставления research IDs и medical capability IDs.
6. Нет activation manifest с точным составом каждого пакета, его версиями и
   правилами миграции уже созданных дней/визитов/сохранений.
7. Текущий normalizer намеренно считает variant/presentation неподтверждёнными,
   даже если family когда-либо получит `approved`. Одного family-статуса для
   production недостаточно.

## Порядок будущих пакетов и неоднозначность

Однозначно из master map выводится такой порядок:

1. `ear_external`;
2. `skin_ectoparasites`;
3. `gi_acute`;
4. `urinary_feline_lower`;
5. `eye_surface`–`ortho_lameness` (семейства 05–12);
6. `urinary_complex`–`gi_chronic_enteropathy` (13–20) и
   `infectious_vector_borne` (39);
7. `gi_obstruction`–`cardio_chf` (21–28);
8. `skin_atopy`–`neuro_vestibular` (29–36).

`infectious_canine_major` и `infectious_feline_major` (37–38) имеют общую фазу
`chapter_2_to_4`. Их варианты не имеют собственных статусов или chapter mapping,
поэтому распределить их между пакетами 5, 6 и 8 без утверждённого activation
manifest невозможно.

## Несовпадение coreCapabilities

`family-registry.json` и соответствующие `family.json` содержат разные
`coreCapabilities` у всех 39 семейств. Source/package validators сохраняют это
расхождение как часть точной handoff-копии. Runtime review теперь проверяет
существование каждого capability ID и возвращает все 39 различий в
`capabilityReferenceAudit`. При независимом production-импорте fatal gate
применяется только к `approved` + generator-eligible семействам конкретного
пакета: pending/retired семейства остаются audit-only и не блокируют уже
исправленный независимый пакет. Какой из двух списков является авторитетным для
каждого будущего кандидата, всё ещё должен решить автор/ветеринарный reviewer.

В списке ниже `+` означает capability только в `family.json`, а `-` — только в
registry. Эти значения не исправляются автоматически.

| № | Family | Расхождение |
|---:|---|---|
| 01 | `ear_external` | `+ear_cytology` |
| 02 | `skin_ectoparasites` | `+skin_scraping` |
| 03 | `gi_acute` | `+abdominal_palpation` |
| 04 | `urinary_feline_lower` | `+general_exam` |
| 05 | `eye_surface` | `+general_exam`, `+safe_referral` |
| 06 | `resp_cat_upper` | `+general_exam`, `+safe_referral` |
| 07 | `resp_dog_cough` | `+general_exam`, `+auscultation`, `+respiratory_rate` |
| 08 | `perianal` | `+general_exam`, `+digital_rectal_exam`, `+anal_sac_exam`, `+safe_referral`; `-minor_procedure` |
| 09 | `wound_abscess` | `+general_exam`, `+analgesia`, `+safe_referral` |
| 10 | `gi_parasites` | `+general_exam`, `+hydration_assessment`, `+fecal_flotation_centrifugal`, `+safe_referral`; `-fecal_microscopy` |
| 11 | `skin_infectious` | `+skin_exam`, `+safe_referral` |
| 12 | `ortho_lameness` | `+pain_assessment` |
| 13 | `urinary_complex` | `+urine_collection`, `+safe_referral` |
| 14 | `endocrine_diabetes` | `+safe_referral` |
| 15 | `renal_ckd` | `+safe_referral` |
| 16 | `endocrine_feline_hyperthyroid` | `+safe_referral` |
| 17 | `gi_pancreas_acute` | `+safe_referral` |
| 18 | `repro_pyometra` | `+safe_referral` |
| 19 | `hematology_anemia` | `+reticulocyte_count`, `+safe_referral` |
| 20 | `gi_chronic_enteropathy` | `+safe_referral` |
| 21 | `gi_obstruction` | `+safe_referral` |
| 22 | `urinary_uroliths` | `+safe_referral` |
| 23 | `resp_pneumonia` | `+respiratory_exam`, `+safe_referral` |
| 24 | `resp_feline_asthma` | `+respiratory_exam`, `+pulse_oximetry`, `+safe_referral` |
| 25 | `ortho_fracture_luxation` | `+trauma_primary_survey`, `+pain_assessment`, `+fracture_first_aid_stabilization`, `+safe_referral`; `-stabilization` |
| 26 | `dental_periodontal` | `+pain_assessment`, `+safe_referral` |
| 27 | `gi_gdv` | `+trauma_primary_survey`, `+xray_or_referral`, `+safe_referral` |
| 28 | `cardio_chf` | `+respiratory_distress_minimal_handling`, `+ecg`, `+safe_referral` |
| 29 | `skin_atopy` | `+skin_exam`, `+safe_referral` |
| 30 | `ear_chronic_middle` | `+ear_exam`, `+video_otoscopy_referral`, `+middle_ear_imaging_external`, `+safe_referral`; `-otoscope`, `-advanced_imaging_referral` |
| 31 | `endocrine_cushing` | `+urinalysis`, `+safe_referral` |
| 32 | `endocrine_addison` | `+cbc`, `+biochemistry`, `+emergency_stabilization`, `+safe_referral`; `-stabilization` |
| 33 | `gi_epi` | `+cbc`, `+biochemistry`, `+safe_referral` |
| 34 | `hepatobiliary` | `+cbc`, `+urinalysis`, `+safe_referral` |
| 35 | `oncology_mass` | `+general_exam`, `+safe_referral` |
| 36 | `neuro_vestibular` | `+blood_pressure`, `+safe_referral` |
| 37 | `infectious_canine_major` | `+safe_referral` |
| 38 | `infectious_feline_major` | `+regulated_infection_route`, `+safe_referral` |
| 39 | `infectious_vector_borne` | `+safe_referral` |

## Дополнительное source-расхождение

`infectious_feline_major/family.json` содержит дополнительный Merck FeLV URL,
которого нет в source-разделе соседнего Markdown. Оба файла совпадают со своими
версиями из handoff, поэтому источник автоматически не исправлялся.

## Что требуется от автора и ветеринарного review

До первого activation-коммита нужны явные, проверяемые входные данные:

1. `approved` отдельно для каждого активируемого family/variant/presentation;
2. собственные версии и eligibility для variant и presentation;
3. полный машиночитаемый clinical contract без извлечения медицинского текста из
   Markdown программистом;
4. решение, какой список `coreCapabilities` авторитетен, и исправленный единый
   mapping;
5. точное распределение семейств 37–38 по пакетам/главам;
6. утверждённый crosswalk с действующим контентом или явное подтверждение, что
   это новый namespace без crosswalk;
7. activation manifest, migration/rollback plan и ожидаемые generator fixtures.

После получения этих данных каждый из восьми пакетов должен проходить отдельные
content validators, generator smoke, save/reload проверку и выпускаться отдельным
коммитом без scheduler/renderer refactor.

## Выполненное P8 preflight-hardening

Без изменения медицинских source-файлов подготовлена безопасная граница будущей
активации:

- опущенный `context` теперь означает `production`; review-каталог доступен только
  при явном `context: "review"`;
- catalog, package и manifest статусы проверяются совместно; blocked package не
  может объявить production eligibility;
- глобальный legacy `familyStatus` больше не навязывает один lifecycle всем
  семействам: registry/family status валидируется по каждому семейству;
- при наличии собственные variant `version`, `status` и `generatorEligible`
  проходят строгую типовую и approval-проверку;
- aggregate provenance пересчитывается, а встроенные browser/Node readers
  сверяют raw byte length и SHA-256 для 41 runtime medical JSON;
- capability registry также сверяется с зарегистрированным digest;
- неизвестные medical capability/safe-route ссылки отклоняются;
- все 39 registry/family capability-различий видимы в review; production
  отклоняет различия именно в активируемых кандидатах, сохраняя возможность
  независимого пакетного импорта;
- review-контекст не раскрывает consumable `productionPool`: потенциальные
  элементы видны только как audit-only `reviewCandidates`, а generator boundary
  требует `production` load context;
- production loader выдаёт только внутренне аттестованную detached-проекцию,
  рекурсивно замороженную и очищенную от pending/retired дочерних сущностей;
  поддельный объект или JSON-копия аттестацию не наследует;
- variant lifecycle принимает только статусы из handoff: `planned`, `authored`,
  `source_checked`, `pending_veterinary_review`, `approved`, `retired`.

Preflight не создаёт generator adapter для master-семейств и не расширяет compact
save. До activation всё ещё нужны versioned family/variant/presentation refs,
immutable clinical snapshot или явная migration strategy и отрицательные
save/reload тесты для нового namespace.

## Выполненные проверки

- `npm run validate:medical-source-v2`;
- `node scripts/refresh-medical-metadata-v2.mjs --compare-handoff`;
- `npm run validate:medical-catalog:v2`;
- `npm run test:medical-catalog:v2`;
- `npm run validate:content-registry`;
- `npm run validate:capability-registry:v3`;
- `node handoff/vetgeme-master-package/validation/validate-package.mjs`.

Все команды завершились с кодом 0. Они доказывают целостность review-копии и
fail-closed gate, но не заменяют ветеринарное одобрение и не являются разрешением
на production activation.
