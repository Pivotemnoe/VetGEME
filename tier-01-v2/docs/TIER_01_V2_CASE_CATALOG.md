# Tier 01 v2: каталог случаев

| ID | Название | Семейство | День | Срочность | Виды |
|---|---|---|---:|---|---|
| `EAR_FUNGAL_OTITIS` | Грибковый наружный отит | ear | 1 | routine | dog |
| `EAR_MITES` | Ушной клещ | ear | 1 | routine | cat, dog |
| `EAR_BACTERIAL_OTITIS` | Бактериальный наружный отит | ear | 2 | priority | dog |
| `EAR_FOREIGN_BODY` | Подозрение на инородное тело слухового прохода | ear | 5 | priority | dog |
| `EAR_RECURRENT_OTITIS` | Рецидивирующий наружный отит; требуется поиск фоновой причины | ear | 6 | priority | dog |
| `SKIN_FLEA_INFESTATION` | Блошиная инвазия | skin | 1 | routine | dog, cat |
| `SKIN_FLEA_ALLERGY` | Подозрение на блошиный аллергический дерматит | skin | 2 | routine | dog, cat |
| `SKIN_SUPERFICIAL_PYODERMA` | Поверхностная пиодермия | skin | 3 | routine | dog |
| `SKIN_FUNGAL_DERMATITIS` | Грибковый дерматит | skin | 3 | routine | dog |
| `SKIN_GROOMING_IRRITATION` | Раздражение кожи после груминга | skin | 2 | routine | dog, cat |
| `GI_DIETARY_INDISCRETION` | Пищевая погрешность без выявленных тревожных признаков | gastrointestinal | 1 | routine | dog |
| `GI_ACUTE_UPSET` | Острое желудочно-кишечное расстройство без выявленных тревожных признаков | gastrointestinal | 2 | routine | dog, cat |
| `GI_REGURGITATION` | Подозрение на регургитацию | gastrointestinal | 2 | routine | dog, cat |
| `GI_INTESTINAL_PARASITES` | Подозрение на кишечный паразитоз | gastrointestinal | 3 | routine | dog, cat |
| `GI_GIARDIA` | Подозрение на лямблиоз | gastrointestinal | 5 | routine | dog, cat |
| `GI_FOREIGN_BODY` | Подозрение на инородное тело желудочно-кишечного тракта | gastrointestinal | 4 | urgent | dog, cat |
| `URINARY_LOWER_SIGNS` | Симптомы заболевания нижних мочевыводящих путей у кошки; обструкция не выявлена | urinary | 3 | priority | cat |
| `URINARY_OBSTRUCTION` | Подозрение на обструкцию мочеиспускательного канала | urinary | 4 | emergency | cat |
| `EYE_CONJUNCTIVITIS` | Конъюнктивит после исключения поверхностного повреждения роговицы | eyes | 3 | routine | dog, cat |
| `EYE_CORNEAL_ULCER` | Подозрение на язву роговицы | eyes | 4 | urgent | dog, cat |
| `RESP_CAT_URI` | Инфекция верхних дыхательных путей у кошки | respiratory | 5 | routine | cat |
| `RESP_CANINE_COUGH` | Инфекционное респираторное заболевание у собаки | respiratory | 3 | routine | dog |
| `RESP_SUSPECTED_PNEUMONIA` | Подозрение на пневмонию | respiratory | 6 | urgent | dog, cat |
| `PERIANAL_IMPACTION` | Переполнение параанальных желёз | perianal | 2 | routine | dog |
| `PERIANAL_INFLAMMATION` | Воспаление параанальной железы; возможен абсцесс | perianal | 5 | priority | dog, cat |
| `TRAUMA_SUPERFICIAL_WOUND` | Поверхностная рана без признаков глубокого повреждения | trauma | 1 | routine | dog, cat |
| `TRAUMA_BITE_ABSCESS` | Укушенная рана с формирующимся абсцессом | trauma | 5 | priority | dog, cat |
| `TRAUMA_SOFT_TISSUE_LAMENESS` | Подозрение на травму мягких тканей | trauma | 3 | routine | dog, cat |
| `TRAUMA_SUSPECTED_FRACTURE` | Подозрение на перелом | trauma | 4 | urgent | dog, cat |
| `TRAUMA_SUSPECTED_DISLOCATION` | Подозрение на вывих | trauma | 6 | urgent | dog, cat |

Всего: 30 клинических шаблонов. Первый тир поддерживает только собак и кошек.
