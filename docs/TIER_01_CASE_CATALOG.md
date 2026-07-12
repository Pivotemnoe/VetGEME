# Tier 01 Case Catalog

Статус: пакет создан для проверки и не подключен к игре. Все медицинские карточки имеют статус `pending_medical_review`.

| ID | Название | Семейство | День | Срочность | Действия | Оборудование | Владельцы | Юмор | Повтор |
|---|---|---|---:|---|---|---|---|---:|---|
| `EAR_FUNGAL_OTITIS` | Грибковый наружный отит | ear | 1 | routine | general_exam, otoscopy, sample, microscopy | otoscope, microscope | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `EAR_MITES` | Ушной клещ | ear | 1 | routine | general_exam, otoscopy, sample, microscopy | otoscope, microscope | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `EAR_BACTERIAL_OTITIS` | Бактериальный наружный отит | ear | 2 | priority | general_exam, otoscopy, sample, microscopy | otoscope, microscope | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `EAR_FOREIGN_BODY` | Подозрение на инородное тело слухового прохода | ear | 5 | priority | general_exam, otoscopy, assess_removal | otoscope | спокойный, наблюдательный, тревожный | 0 | да |
| `EAR_RECURRENT_OTITIS` | Рецидивирующий наружный отит | ear | 6 | priority | general_exam, otoscopy, sample, microscopy, review_history | otoscope, microscope | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `SKIN_FLEA_INFESTATION` | Блошиная инвазия | skin | 1 | routine | general_exam, skin_exam, flea_comb | flea_comb | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `SKIN_FLEA_ALLERGY` | Блошиный аллергический дерматит | skin | 2 | routine | general_exam, skin_exam, flea_comb | flea_comb | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `SKIN_SUPERFICIAL_PYODERMA` | Поверхностная пиодермия | skin | 3 | routine | general_exam, skin_exam, sample, cytology | microscope | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `SKIN_FUNGAL_DERMATITIS` | Грибковый дерматит | skin | 3 | routine | general_exam, skin_exam, sample, microscopy | microscope | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `SKIN_GROOMING_IRRITATION` | Раздражение кожи после груминга | skin | 2 | routine | general_exam, skin_exam | нет | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `GI_DIETARY_INDISCRETION` | Пищевая погрешность | gastrointestinal | 1 | routine | general_exam, abdominal_exam, hydration_assessment | нет | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `GI_ACUTE_UPSET` | Острое желудочно-кишечное расстройство без выявленных тревожных признаков | gastrointestinal | 2 | routine | general_exam, abdominal_exam, hydration_assessment | нет | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `GI_REGURGITATION` | Подозрение на регургитацию | gastrointestinal | 2 | routine | general_exam, abdominal_exam, review_video | нет | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `GI_INTESTINAL_PARASITES` | Подозрение на кишечный паразитоз | gastrointestinal | 3 | routine | general_exam, abdominal_exam, fecal_sample | fecal_test | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `GI_GIARDIA` | Подозрение на лямблиоз | gastrointestinal | 5 | routine | general_exam, abdominal_exam, fecal_sample, giardia_test | fecal_test | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `GI_FOREIGN_BODY` | Подозрение на инородное тело желудочно-кишечного тракта | gastrointestinal | 4 | urgent | triage, general_exam, abdominal_exam, urgent_referral | нет | спокойный, наблюдательный, тревожный | 0 | да |
| `URINARY_LOWER_SIGNS` | Симптомы заболевания нижних мочевыводящих путей у кошки | urinary | 3 | priority | triage, general_exam, bladder_assessment | нет | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `URINARY_OBSTRUCTION` | Подозрение на обструкцию мочеиспускательного канала | urinary | 4 | emergency | triage, general_exam, bladder_assessment, urgent_referral | нет | спокойный, наблюдательный, тревожный | 0 | да |
| `EYE_CONJUNCTIVITIS` | Конъюнктивит | eyes | 3 | routine | general_exam, eye_exam, fluorescein_test | fluorescein | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `EYE_CORNEAL_ULCER` | Подозрение на язву роговицы | eyes | 4 | urgent | triage, general_exam, eye_exam, fluorescein_test, urgent_plan | fluorescein | спокойный, наблюдательный, тревожный | 0 | да |
| `RESP_CAT_URI` | Инфекция верхних дыхательных путей у кошки | respiratory | 5 | routine | general_exam, respiratory_exam, temperature | нет | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `RESP_CANINE_COUGH` | Инфекционное респираторное заболевание у собаки | respiratory | 3 | routine | general_exam, respiratory_exam, temperature | нет | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `RESP_SUSPECTED_PNEUMONIA` | Подозрение на пневмонию | respiratory | 6 | urgent | triage, general_exam, respiratory_exam, urgent_referral | нет | спокойный, наблюдательный, тревожный | 0 | да |
| `PERIANAL_IMPACTION` | Переполнение параанальных желёз | perianal | 2 | routine | general_exam, perianal_exam | нет | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `PERIANAL_INFLAMMATION` | Воспаление параанальной железы | perianal | 5 | priority | general_exam, perianal_exam, sample_if_discharge | нет | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `TRAUMA_SUPERFICIAL_WOUND` | Поверхностная рана | trauma | 1 | routine | general_exam, wound_exam, clean_wound | wound_supplies | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `TRAUMA_BITE_ABSCESS` | Укушенная рана с подозрением на абсцесс | trauma | 5 | priority | general_exam, wound_exam, abscess_assessment | wound_supplies | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `TRAUMA_SOFT_TISSUE_LAMENESS` | Подозрение на травму мягких тканей | trauma | 3 | routine | general_exam, gait_exam, limb_palpation | нет | спокойный, наблюдательный, тревожный, невнимательный, с ограниченным бюджетом | 1 | да |
| `TRAUMA_SUSPECTED_FRACTURE` | Подозрение на перелом | trauma | 4 | urgent | triage, general_exam, minimal_limb_exam, stabilize, urgent_referral | splint_supplies | спокойный, наблюдательный, тревожный | 0 | да |
| `TRAUMA_SUSPECTED_DISLOCATION` | Подозрение на вывих | trauma | 6 | urgent | triage, general_exam, minimal_limb_exam, stabilize, urgent_referral | splint_supplies | спокойный, наблюдательный, тревожный | 0 | да |
