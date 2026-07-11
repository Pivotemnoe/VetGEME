(function () {
  "use strict";

  const DAY_START = 8 * 60;
  const DAY_END = 18 * 60;
  const MAX_LOCAL_EXAMS = 2;
  const MICROSCOPY_COST = 2;

  const speciesLabels = {
    dog: "собака",
    cat: "кошка",
    rabbit: "кролик"
  };

  const speciesNames = {
    dog: ["Бакс", "Ричи", "Лада", "Марс", "Нора", "Тайга"],
    cat: ["Мурка", "Сема", "Буся", "Рыжик", "Пиксель", "Тучка"],
    rabbit: ["Пончик", "Мята", "Фунтик", "Ириска", "Клевер"]
  };

  const owners = [
    "Иванова",
    "Смирнов",
    "Ким",
    "Петрова",
    "Лебедев",
    "Орлова",
    "Макаров",
    "Алиева",
    "Зайцева"
  ];

  const ownerProfiles = [
    {
      id: "calm",
      label: "спокойный",
      trust: 78,
      anxiety: 24,
      budget: 760,
      visitLimit: 56,
      reliability: 0.9,
      prefers: "calmDetailed",
      note: "Внимательно слушает и выполняет назначения."
    },
    {
      id: "anxious",
      label: "тревожный",
      trust: 58,
      anxiety: 86,
      budget: 650,
      visitLimit: 46,
      reliability: 0.72,
      prefers: "calmDetailed",
      note: "Паникует и хуже воспринимает короткие ответы."
    },
    {
      id: "budget",
      label: "ограниченный бюджет",
      trust: 62,
      anxiety: 54,
      budget: 360,
      visitLimit: 44,
      reliability: 0.78,
      prefers: "budgetPlan",
      note: "Согласится не на все, нужен безопасный компромисс."
    },
    {
      id: "internet",
      label: "с интернет-диагнозом",
      trust: 44,
      anxiety: 60,
      budget: 560,
      visitLimit: 42,
      reliability: 0.62,
      prefers: "riskFocus",
      note: "Может спорить и требовать уже выбранное лечение."
    },
    {
      id: "careless",
      label: "невнимательный",
      trust: 55,
      anxiety: 38,
      budget: 520,
      visitLimit: 48,
      reliability: 0.52,
      prefers: "strict",
      note: "Может забыть детали и нарушить назначения."
    },
    {
      id: "conflict",
      label: "конфликтный",
      trust: 36,
      anxiety: 68,
      budget: 700,
      visitLimit: 36,
      reliability: 0.58,
      prefers: "riskFocus",
      note: "Требует гарантий и быстро теряет доверие."
    }
  ];

  const communicationOptions = [
    {
      id: "calmDetailed",
      label: "Спокойно и подробно",
      note: "Обсудить, что известно, что пока неясно и что делать дальше."
    },
    {
      id: "riskFocus",
      label: "Объяснить риски",
      note: "Сначала обозначить опасные признаки и сроки повторного обращения."
    },
    {
      id: "budgetPlan",
      label: "План с учетом бюджета",
      note: "Разделить обязательный минимум и дополнительные шаги."
    },
    {
      id: "strict",
      label: "Коротко и строго",
      note: "Дать короткие пункты и попросить владельца повторить план."
    }
  ];

  const localExamOptions = [
    { id: "ears", label: "Отоскопия и осмотр ушей", time: 4 },
    { id: "abdomen", label: "Пальпация живота", time: 4 },
    { id: "skin", label: "Осмотр кожи и расчесов", time: 4 },
    { id: "gait", label: "Осмотр лап и походки", time: 4 },
    { id: "head", label: "Осмотр головы и болезненности", time: 4 }
  ];

  const treatmentOptions = [
    {
      id: "antibacterialDrops",
      label: "Антибактериальные ушные капли",
      note: "Местное лечение бактериального отита.",
      fee: 220
    },
    {
      id: "dropsAntibiotic",
      label: "Капли + системный антибиотик",
      note: "Более сильная схема для затяжного бактериального отита.",
      fee: 420
    },
    {
      id: "antiInflammatoryDrops",
      label: "Противовоспалительные ушные капли",
      note: "Уходовая схема без антибиотика.",
      fee: 180
    },
    {
      id: "antiparasitic",
      label: "Противопаразитарная обработка",
      note: "Схема при ушном клеще.",
      fee: 260
    },
    {
      id: "pancreatitisSupport",
      label: "Поддержка ЖКТ + обезболивание",
      note: "Подозрение на панкреатит без лаборатории.",
      fee: 360
    },
    {
      id: "dermatitisLocal",
      label: "Местная обработка кожи + мазь",
      note: "Простой локальный дерматит.",
      fee: 230
    },
    {
      id: "traumaCare",
      label: "Обработка травмы + покой",
      note: "Поверхностная травма, боль, наблюдение.",
      fee: 280
    },
    {
      id: "watchfulWaiting",
      label: "Только наблюдение",
      note: "Минимальное вмешательство. Дешево, но рискованно.",
      fee: 60
    }
  ];

  const diagnosisOptions = [
    {
      id: "bacterialOtitis",
      label: "Бактериальный отит",
      note: "Ухо, запах, воспаление, длительность важна."
    },
    {
      id: "inflammatoryOtitis",
      label: "Воспалительный отит",
      note: "Легкое воспаление без явной бактериальной или клещевой картины."
    },
    {
      id: "miteOtitis",
      label: "Клещевой отит",
      note: "Сильный зуд, темный налет, контакт с другими животными."
    },
    {
      id: "pancreatitis",
      label: "Подозрение на панкреатит",
      note: "Рвота, боль живота, вялость, пищевой риск."
    },
    {
      id: "dermatitis",
      label: "Простой дерматит",
      note: "Локальный зуд, красное пятно, расчесы."
    },
    {
      id: "trauma",
      label: "Легкая травма",
      note: "Ушиб, царапина, локальная болезненность."
    },
    {
      id: "allergy",
      label: "Аллергия",
      note: "Может проявляться кожным или ушным зудом."
    },
    {
      id: "gastroenteritis",
      label: "Гастроэнтерит",
      note: "Похож на ЖКТ-жалобы, но не равен панкреатиту."
    },
    {
      id: "foreignBody",
      label: "Инородное тело ЖКТ",
      note: "Опасная версия рвоты и боли, которую важно учитывать."
    },
    {
      id: "fractureDislocation",
      label: "Перелом или вывих",
      note: "Возможная причина боли и нарушения опоры на конечность."
    }
  ];

  const diseases = {
    bacterialOtitis: {
      name: "Бактериальный отит",
      short: "ухо воспалено",
      species: ["dog", "cat", "rabbit"],
      baseFee: 120,
      complaints: [
        "трясет головой",
        "чешет уши",
        "уши красные",
        "неприятный запах из уха",
        "не дает гладить голову",
        "идут выделения из уха",
        "есть расчесы около уха"
      ],
      makeFlags() {
        return {
          durationDays: pick([3, 7, 12, 18, 28])
        };
      },
      anamnesis(patient) {
        const days = patient.flags.durationDays;
        return [
          {
            id: "duration",
            label: "Сколько дней длится проблема?",
            answer: days > 14
              ? `Владелец говорит: "Уже примерно ${days} дней, капали что-то дома, но не прошло".`
              : `Владелец говорит: "Началось недавно, примерно ${days} дня назад".`
          },
          {
            id: "parasite",
            label: "Обработки от блох и клещей делали?",
            answer: "Обработки были нерегулярно, но других животных с зудом дома нет."
          },
          {
            id: "discharge",
            label: "Есть запах или выделения?",
            answer: "Запах заметный, выделения влажные, ухо пачкается быстро."
          },
          {
            id: "foodToilet",
            label: "Аппетит, вода, туалет нормальные?",
            answer: "Аппетит и туалет без выраженных изменений."
          },
          {
            id: "previous",
            label: "Были похожие проблемы раньше?",
            answer: days > 20 ? "Похожий эпизод уже был, владелец лечил дома." : "Раньше такой проблемы не помнят."
          }
        ];
      },
      temperature(patient) {
        return patient.flags.durationDays > 14
          ? "Температура слегка повышена, но без тяжелого общего состояния."
          : "Температура в норме.";
      },
      mucous() {
        return "Слизистые розовые, без выраженных изменений.";
      },
      local: {
        ears(patient) {
          return patient.flags.durationDays > 14
            ? "Ухо болезненное, слуховой проход красный, влажные гнойные выделения, запах выражен."
            : "Ухо красное, болезненное, есть влажные выделения и неприятный запах.";
        },
        abdomen: "Живот безболезненный.",
        skin: "Есть расчесы вокруг уха, на остальной коже без явных очагов.",
        gait: "Походка обычная, травмы лап не видно.",
        head: "Болезненность при касании около уха, голова без травм."
      },
      microscopy() {
        return "Микроскопия: клещи не обнаружены, мазок воспалительный, есть бактериальная флора.";
      },
      evaluate(patient, treatmentId) {
        const longCase = patient.flags.durationDays > 14;
        if (longCase && treatmentId === "dropsAntibiotic") return outcome("correct", 0.03, "Затяжной бактериальный отит закрыт усиленной схемой.");
        if (!longCase && (treatmentId === "antibacterialDrops" || treatmentId === "dropsAntibiotic")) {
          return outcome("correct", treatmentId === "dropsAntibiotic" ? 0.04 : 0.03, "Свежий бактериальный отит получает подходящее лечение.");
        }
        if (longCase && treatmentId === "antibacterialDrops") return outcome("partial", 0.15, "Капли могут помочь, но для затяжного случая схема слабоватая.");
        return outcome("wrong", 0.25, "Причина похожа на бактериальный отит, выбранное лечение ее плохо закрывает.");
      }
    },
    inflammatoryOtitis: {
      name: "Воспалительный отит",
      short: "легкое воспаление уха",
      species: ["dog", "cat", "rabbit"],
      baseFee: 110,
      complaints: [
        "чешет ухо",
        "после купания стало хуже",
        "ухо немного красное",
        "запаха почти нет",
        "выделений почти нет",
        "ест нормально",
        "не любит, когда трогают ухо"
      ],
      makeFlags() {
        return { trigger: pick(["купание", "домашняя чистка", "прогулка под дождем"]) };
      },
      anamnesis(patient) {
        return [
          {
            id: "start",
            label: "Когда началось?",
            answer: `Началось 1-3 дня назад, после события: ${patient.flags.trigger}.`
          },
          {
            id: "odor",
            label: "Есть запах и гнойные выделения?",
            answer: "Сильного запаха нет, выделений мало."
          },
          {
            id: "contact",
            label: "Другие животные дома чешутся?",
            answer: "Другие животные дома не чешутся."
          },
          {
            id: "parasite",
            label: "Обработки от паразитов делали?",
            answer: "Обработки делали недавно."
          },
          {
            id: "general",
            label: "Аппетит и поведение изменились?",
            answer: "Общее состояние нормальное."
          }
        ];
      },
      temperature() {
        return "Температура в норме.";
      },
      mucous() {
        return "Слизистые розовые, влажные.";
      },
      local: {
        ears: "Умеренное покраснение, немного серы, гноя и сильного запаха нет.",
        abdomen: "Живот мягкий, безболезненный.",
        skin: "Кожа без распространенного зуда, есть легкий расчес около уха.",
        gait: "Походка обычная.",
        head: "Легкая болезненность около уха, травмы нет."
      },
      microscopy() {
        return "Микроскопия: клещи не обнаружены, выраженной бактериальной картины нет.";
      },
      evaluate(patient, treatmentId) {
        if (treatmentId === "antiInflammatoryDrops") return outcome("correct", 0.03, "Легкое воспаление закрыто местной уходовой схемой.");
        if (treatmentId === "antibacterialDrops" || treatmentId === "dropsAntibiotic") return outcome("partial", 0.08, "Антибиотик здесь избыточен, но воспаление может временно стихнуть.");
        return outcome("wrong", 0.18, "Лечение не подходит легкому воспалительному отиту.");
      }
    },
    miteOtitis: {
      name: "Клещевой отит",
      short: "сильный зуд в ушах",
      species: ["dog", "cat", "rabbit"],
      baseFee: 120,
      complaints: [
        "сильно чешет уши",
        "в ухе темная грязь",
        "трясет головой",
        "есть корочки",
        "дома еще одно животное чешется",
        "новый питомец появился недавно",
        "не дает трогать уши"
      ],
      makeFlags() {
        return { contact: pick(["новый котенок", "второй кролик", "щенок у знакомых"]) };
      },
      anamnesis(patient) {
        return [
          {
            id: "contact",
            label: "Есть контакт с другими животными?",
            answer: `Да, недавно был контакт: ${patient.flags.contact}.`
          },
          {
            id: "parasite",
            label: "Обработки от блох и клещей делали?",
            answer: "Давно не делали или владелец не помнит."
          },
          {
            id: "others",
            label: "Другие животные дома чешутся?",
            answer: "Да, еще одно животное тоже трясет головой."
          },
          {
            id: "debris",
            label: "Что именно видно в ухе?",
            answer: "Владелец описывает темную сухую грязь и корочки."
          },
          {
            id: "general",
            label: "Аппетит и активность изменились?",
            answer: "Общее состояние в целом сохранено, но животное раздражено зудом."
          }
        ];
      },
      temperature() {
        return "Температура в норме.";
      },
      mucous() {
        return "Слизистые без выраженных изменений.";
      },
      local: {
        ears(patient) {
          return patient.species === "rabbit"
            ? "В ушах плотные корки, темный налет, сильный зуд и болезненность."
            : "Темный сухой налет как кофейная крошка, сильный зуд, расчесы у основания уха.";
        },
        abdomen: "Живот безболезненный.",
        skin: "Расчесы около ушей, на теле без крупных очагов.",
        gait: "Походка обычная.",
        head: "Голова без травм, болезненность связана с ушами."
      },
      microscopy() {
        return "Микроскопия: обнаружены ушные клещи. Диагноз почти подтвержден.";
      },
      evaluate(patient, treatmentId) {
        if (treatmentId === "antiparasitic") return outcome("correct", 0.04, "Клещевой отит получает противопаразитарную обработку.");
        if (treatmentId === "antibacterialDrops" || treatmentId === "antiInflammatoryDrops") return outcome("partial", 0.22, "Воспаление может стихнуть, но причина останется.");
        return outcome("wrong", 0.28, "Без противопаразитарной обработки клещевой отит вернется.");
      }
    },
    pancreatitis: {
      name: "Подозрение на панкреатит",
      short: "рвота и боль живота",
      species: ["dog", "cat"],
      baseFee: 130,
      complaints: [
        "вырвало",
        "плохо ест",
        "стал вялый",
        "понос",
        "живот болит",
        "мог съесть жирное",
        "прячется и мало двигается"
      ],
      makeFlags() {
        return { trigger: pick(["дали жирный кусочек", "резко сменили корм", "подобрал еду на улице"]) };
      },
      anamnesis(patient) {
        return [
          {
            id: "food",
            label: "Чем кормили последние дни?",
            answer: `Есть пищевой риск: ${patient.flags.trigger}.`
          },
          {
            id: "vomit",
            label: "Сколько раз была рвота?",
            answer: "Рвота была несколько раз, после еды становится хуже."
          },
          {
            id: "appetite",
            label: "Ест и пьет сейчас?",
            answer: patient.species === "cat"
              ? "Кошка почти не ест, больше прячется."
              : "Аппетит снижен, воду пьет понемногу."
          },
          {
            id: "toilet",
            label: "Стул и мочеиспускание?",
            answer: "Мочеиспускание есть, стул мягкий или был понос."
          },
          {
            id: "pain",
            label: "Болит живот при касании?",
            answer: "Владелец заметил напряжение и дискомфорт при попытке взять на руки."
          }
        ];
      },
      temperature() {
        return "Температура нормальная или слегка повышена.";
      },
      mucous() {
        return "Слизистые немного суховатые, есть риск обезвоживания.";
      },
      local: {
        ears: "Уши без выраженных изменений.",
        abdomen: "Живот болезненный, животное напрягается при пальпации.",
        skin: "Кожных очагов нет.",
        gait: "Походка осторожная из-за общего дискомфорта, травмы лап не видно.",
        head: "Голова без травм."
      },
      microscopy() {
        return "Микроскопия не дает полезных данных для этой проблемы.";
      },
      evaluate(patient, treatmentId) {
        if (treatmentId === "pancreatitisSupport") return outcome("correct", 0.05, "Назначена поддерживающая схема при подозрении на панкреатит.");
        if (treatmentId === "watchfulWaiting") return outcome("wrong", 0.24, "При рвоте, боли и сухих слизистых одного наблюдения мало.");
        return outcome("wrong", 0.2, "Лечение не закрывает ЖКТ-боль и повторную рвоту.");
      }
    },
    dermatitis: {
      name: "Простой дерматит",
      short: "красное зудящее пятно",
      species: ["dog", "cat", "rabbit"],
      baseFee: 105,
      complaints: [
        "появилось красное пятно",
        "чешет одно место",
        "лижет кожу",
        "шерсть выпала на участке",
        "есть расчесы",
        "кожа мокрая",
        "после груминга стало хуже"
      ],
      makeFlags() {
        return { trigger: pick(["после купания", "после груминга", "после прогулки", "после новой лежанки"]) };
      },
      anamnesis(patient) {
        return [
          {
            id: "start",
            label: "Когда появилось пятно?",
            answer: `Пятно заметили недавно, возможно ${patient.flags.trigger}.`
          },
          {
            id: "itch",
            label: "Чешет или разлизывает?",
            answer: "Да, активно чешет и пытается разлизывать."
          },
          {
            id: "parasite",
            label: "Были блохи или обработки?",
            answer: "Блох явно не видели, обработки нерегулярные."
          },
          {
            id: "general",
            label: "Общее состояние нормальное?",
            answer: "Аппетит, вода и туалет без изменений."
          },
          {
            id: "spread",
            label: "Пятно увеличивается?",
            answer: "Немного увеличилось из-за расчесов."
          }
        ];
      },
      temperature() {
        return "Температура в норме.";
      },
      mucous() {
        return "Слизистые без особенностей.";
      },
      local: {
        ears: "Уши без выраженной отитной картины.",
        abdomen: "Живот безболезненный.",
        skin: "Локальное покраснение, расчесы, небольшой участок выпадения шерсти.",
        gait: "Походка обычная.",
        head: "Голова без травм, если пятно не на голове."
      },
      microscopy() {
        return "Микроскопия в MVP неинформативна: специфики не найдено.";
      },
      evaluate(patient, treatmentId) {
        if (treatmentId === "dermatitisLocal") return outcome("correct", 0.08, "Локальный дерматит обработан, владелец получил план ухода.");
        if (treatmentId === "watchfulWaiting") return outcome("partial", 0.18, "Иногда легкое раздражение проходит, но зуд может усилиться.");
        return outcome("wrong", 0.22, "Назначение не решает кожный зуд и расчесы.");
      }
    },
    trauma: {
      name: "Легкая травма",
      short: "ушиб или царапина",
      species: ["dog", "cat", "rabbit"],
      baseFee: 115,
      complaints: [
        "упал",
        "ударился",
        "прихрамывает",
        "бережет лапу",
        "есть царапина",
        "не дает трогать место",
        "появилась небольшая припухлость"
      ],
      makeFlags() {
        return { place: pick(["лапа", "бок", "голова без потери сознания", "хвост"]) };
      },
      anamnesis(patient) {
        return [
          {
            id: "mechanism",
            label: "Как травмировался?",
            answer: `Владелец видел легкую травму: ${patient.flags.place}.`
          },
          {
            id: "weight",
            label: "Наступает на лапу или бережет место?",
            answer: "Бережет место, но тяжелой деформации нет."
          },
          {
            id: "blood",
            label: "Была кровь или глубокая рана?",
            answer: "Есть поверхностная царапина или небольшой ушиб, сильной крови нет."
          },
          {
            id: "head",
            label: "Была потеря сознания или рвота?",
            answer: "Потери сознания и рвоты не было."
          },
          {
            id: "general",
            label: "Аппетит и поведение?",
            answer: "Общее состояние сохранено, но животное осторожничает."
          }
        ];
      },
      temperature() {
        return "Температура в норме.";
      },
      mucous() {
        return "Слизистые нормальные, признаков шока нет.";
      },
      local: {
        ears: "Уши без выраженных изменений.",
        abdomen: "Живот безболезненный.",
        skin: "Если травма с царапиной: поверхностное повреждение кожи.",
        gait: "Осторожная походка, явной деформации нет, конечность используется.",
        head: "Локальная болезненность, грубых неврологических признаков нет."
      },
      microscopy() {
        return "Микроскопия не помогает оценить легкую травму.";
      },
      evaluate(patient, treatmentId) {
        if (treatmentId === "traumaCare") return outcome("correct", 0.05, "Легкая травма обработана: покой, обезболивание, контроль.");
        if (treatmentId === "watchfulWaiting") return outcome("partial", 0.16, "При легком ушибе наблюдение возможно, но боль останется без помощи.");
        return outcome("wrong", 0.2, "Назначение не соответствует локальной травме.");
      }
    }
  };

  const diseaseIds = Object.keys(diseases);

  const state = {
    day: 1,
    minute: DAY_START,
    money: 1350,
    reputation: 74,
    queue: [],
    activeId: null,
    nextPatientId: 1,
    paused: false,
    speed: 1,
    spawnMeter: 0,
    lastTick: 0,
    log: "Клиника открыта. Владелец с животным ждет приема.",
    treatedToday: 0,
    revenueToday: 0,
    returnsToday: 0,
    mistakesToday: 0,
    pendingReturns: [],
    caseJournal: [],
    modalOpen: false,
    animationTime: 0
  };

  const canvas = document.getElementById("clinicCanvas");
  let ctx = canvas.getContext("2d");
  const portraitCanvas = document.getElementById("portraitCanvas");
  const portraitCtx = portraitCanvas.getContext("2d");

  const el = {
    nextPatientCard: document.getElementById("nextPatientCard"),
    queueStrip: document.getElementById("queueStrip"),
    queueCountLabel: document.getElementById("queueCountLabel"),
    caseWindow: document.getElementById("caseWindow"),
    caseStage: document.getElementById("caseStage"),
    caseTitle: document.getElementById("caseTitle"),
    caseOwner: document.getElementById("caseOwner"),
    caseUrgency: document.getElementById("caseUrgency"),
    caseDuration: document.getElementById("caseDuration"),
    closeCaseBtn: document.getElementById("closeCaseBtn"),
    ownerComplaint: document.getElementById("ownerComplaint"),
    findingsList: document.getElementById("findingsList"),
    unknownList: document.getElementById("unknownList"),
    patientFacts: document.getElementById("patientFacts"),
    stressMeter: document.getElementById("stressMeter"),
    trustMeter: document.getElementById("trustMeter"),
    tensionMeter: document.getElementById("tensionMeter"),
    visitTimeMeter: document.getElementById("visitTimeMeter"),
    diagnosisChip: document.getElementById("diagnosisChip"),
    ownerName: document.getElementById("ownerName"),
    ownerBudget: document.getElementById("ownerBudget"),
    ownerConsent: document.getElementById("ownerConsent"),
    anamnesisBtn: document.getElementById("anamnesisBtn"),
    generalExamBtn: document.getElementById("generalExamBtn"),
    localExamBtn: document.getElementById("localExamBtn"),
    sampleBtn: document.getElementById("sampleBtn"),
    microscopyBtn: document.getElementById("microscopyBtn"),
    diagnosisBtn: document.getElementById("diagnosisBtn"),
    communicationBtn: document.getElementById("communicationBtn"),
    treatmentBtn: document.getElementById("treatmentBtn"),
    choiceWindow: document.getElementById("choiceWindow"),
    choiceKicker: document.getElementById("choiceKicker"),
    choiceTitle: document.getElementById("choiceTitle"),
    choiceBody: document.getElementById("choiceBody"),
    closeChoiceBtn: document.getElementById("closeChoiceBtn"),
    summaryWindow: document.getElementById("summaryWindow"),
    summaryTitle: document.getElementById("summaryTitle"),
    summaryText: document.getElementById("summaryText"),
    nextDayBtn: document.getElementById("nextDayBtn"),
    moneyValue: document.getElementById("moneyValue"),
    todayRevenue: document.getElementById("todayRevenue"),
    dateValue: document.getElementById("dateValue"),
    timeValue: document.getElementById("timeValue"),
    closingTime: document.getElementById("closingTime"),
    pauseBtn: document.getElementById("pauseBtn"),
    speedBtn: document.getElementById("speedBtn"),
    nextPatientBtn: document.getElementById("nextPatientBtn"),
    reputationMeter: document.getElementById("reputationMeter"),
    reputationValue: document.getElementById("reputationValue"),
    reputationLabel: document.getElementById("reputationLabel"),
    queueValue: document.getElementById("queueValue"),
    messageLog: document.getElementById("messageLog"),
    developerBtn: document.getElementById("developerBtn"),
    developerPanel: document.getElementById("developerPanel"),
    closeDeveloperBtn: document.getElementById("closeDeveloperBtn"),
    developerData: document.getElementById("developerData")
  };

  function outcome(quality, returnRisk, note) {
    return { quality, returnRisk, note };
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function sample(list, count) {
    const copy = list.slice();
    const result = [];
    while (copy.length && result.length < count) {
      const index = Math.floor(Math.random() * copy.length);
      result.push(copy.splice(index, 1)[0]);
    }
    return result;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatTime(minute) {
    const hour = Math.floor(minute / 60);
    const min = Math.floor(minute % 60);
    return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  function formatMoney(value) {
    return Math.round(value).toLocaleString("ru-RU");
  }

  function diseaseFor(patient) {
    return diseases[patient.diseaseId];
  }

  function diagnosisLabel(id) {
    const diagnosis = diagnosisOptions.find((item) => item.id === id);
    return diagnosis ? diagnosis.label : "";
  }

  function communicationLabel(id) {
    const communication = communicationOptions.find((item) => item.id === id);
    return communication ? communication.label : "";
  }

  function activePatient() {
    return state.queue.find((patient) => patient.id === state.activeId) || null;
  }

  function setLog(text) {
    state.log = text;
    el.messageLog.textContent = text;
  }

  function isPatientInConsult(patient) {
    return Boolean(patient && patient.id === state.activeId && !el.caseWindow.classList.contains("hidden"));
  }

  function isReadingInterfaceOpen() {
    return !el.caseWindow.classList.contains("hidden") || !el.choiceWindow.classList.contains("hidden");
  }

  function waitingMood(patient) {
    return clamp(100 - (patient.age / patient.patience) * 100, 0, 100);
  }

  function adjustTrust(patient, delta) {
    patient.trust = clamp(patient.trust + delta, 0, 100);
  }

  function spendVisitTime(patient, minutes) {
    if (!patient) return;
    patient.visitTimeUsed += minutes;
    if (!patient.overtimeWarned && patient.visitTimeUsed > patient.visitTimeLimit) {
      patient.overtimeWarned = true;
      adjustTrust(patient, -6);
      patient.findings.push("Прием затянулся: владелец начинает уставать от долгого процесса.");
    }
  }

  function createPatient(forcedDiseaseId, isReturn) {
    const diseaseId = forcedDiseaseId || pick(diseaseIds);
    const disease = diseases[diseaseId];
    const species = pick(disease.species);
    const flags = disease.makeFlags ? disease.makeFlags() : {};
    const complaints = sample(disease.complaints, 3);
    const profile = pick(ownerProfiles);
    const patient = {
      id: state.nextPatientId,
      owner: pick(owners),
      ownerProfile: profile,
      budget: profile.budget + Math.round((Math.random() - 0.5) * 120),
      animal: pick(speciesNames[species]),
      species,
      ageYears: species === "rabbit" ? pick([1, 2, 3, 4, 5]) : pick([1, 2, 3, 4, 6, 8, 10]),
      sex: pick(["самец", "самка"]),
      diseaseId,
      flags,
      complaints,
      age: 0,
      patience: 82 + Math.random() * 34,
      mood: 100,
      trust: clamp(profile.trust + Math.round((Math.random() - 0.5) * 10), 12, 95),
      visitTimeUsed: 0,
      visitTimeLimit: profile.visitLimit,
      overtimeWarned: false,
      stress: clamp(18 + Math.round(profile.anxiety * 0.22), 18, 48),
      dxPoints: 0,
      localUsed: 0,
      findings: [],
      asked: {},
      localDone: {},
      generalExamDone: false,
      sampleTaken: false,
      budgetAsked: false,
      temperatureDone: false,
      mucousDone: false,
      microscopyDone: false,
      selectedDiagnosisId: null,
      selectedCommunicationId: null,
      returnVisit: Boolean(isReturn)
    };
    state.nextPatientId += 1;
    patient.findings.push(isReturn
      ? "Повторное обращение: владелец говорит, что прошлое лечение не помогло."
      : `Жалобы владельца: ${complaints.join(", ")}.`);
    return patient;
  }

  function spawnPatient(forcedDiseaseId, isReturn) {
    if (state.queue.length >= 12 && !isReturn) return;
    const patient = createPatient(forcedDiseaseId, isReturn);
    state.queue.push(patient);
    if (!state.activeId) state.activeId = patient.id;
    setLog(isReturn
      ? `${patient.owner} вернулся с ${patient.animal}: прошлое лечение не помогло.`
      : `Новый пациент: ${patient.animal}, ${speciesLabels[patient.species]}.`);
    renderAll();
  }

  function passTime(minutes, options = {}) {
    if (state.modalOpen) return;
    const adjusted = Math.max(1, Math.round(minutes));
    const patientInConsult = activePatient();
    if (options.trackVisit !== false && isPatientInConsult(patientInConsult)) {
      spendVisitTime(patientInConsult, adjusted);
    }
    state.minute += adjusted;
    state.spawnMeter += adjusted;
    state.queue.forEach((patient) => {
      if (isPatientInConsult(patient)) return;
      patient.age += adjusted;
      patient.mood = waitingMood(patient);
    });
    removeLostPatients();
    maybeSpawn();
    if (state.minute >= DAY_END) {
      endDay();
    }
    renderAll();
  }

  function maybeSpawn() {
    const interval = clamp(72 - state.day * 4 - state.reputation * 0.16, 36, 78);
    while (state.spawnMeter >= interval) {
      state.spawnMeter -= interval;
      spawnPatient();
    }
  }

  function removeLostPatients() {
    const before = state.queue.length;
    state.queue = state.queue.filter((patient) => {
      const lost = patient.age > patient.patience;
      if (lost) {
        state.reputation = clamp(state.reputation - 3, 0, 100);
      }
      return !lost;
    });
    if (state.queue.length !== before) {
      setLog("Один владелец ушел из очереди. Репутация немного снизилась.");
      if (state.activeId && !activePatient()) state.activeId = state.queue[0] ? state.queue[0].id : null;
    }
  }

  function askQuestion(patient, question) {
    if (patient.asked[question.id]) return;
    patient.asked[question.id] = true;
    if (question.id === "budget") patient.budgetAsked = true;
    patient.dxPoints += 1;
    patient.findings.push(question.answer);
    setLog("Анамнез собран: +1 диагностическое очко.");
    passTime(question.id === "budget" ? 1 : 2);
  }

  function doGeneralExam() {
    const patient = activePatient();
    if (!patient || patient.generalExamDone) return;
    patient.generalExamDone = true;
    patient.temperatureDone = true;
    patient.mucousDone = true;
    patient.dxPoints += 2;
    patient.stress = clamp(patient.stress + 6, 0, 100);
    patient.findings.push(`Общий осмотр: ${diseaseFor(patient).temperature(patient)} ${diseaseFor(patient).mucous(patient)}`);
    setLog("Проведен общий осмотр: состояние, температура, слизистые и дыхание.");
    passTime(3);
  }

  function doTemperature() {
    const patient = activePatient();
    if (!patient || patient.temperatureDone) return;
    patient.temperatureDone = true;
    patient.dxPoints += 1;
    patient.findings.push(diseaseFor(patient).temperature(patient));
    setLog("Температура измерена: +1 диагностическое очко.");
    passTime(6);
  }

  function doMucous() {
    const patient = activePatient();
    if (!patient || patient.mucousDone) return;
    patient.mucousDone = true;
    patient.dxPoints += 1;
    patient.findings.push(diseaseFor(patient).mucous(patient));
    setLog("Слизистые осмотрены: +1 диагностическое очко.");
    passTime(5);
  }

  function doLocalExam(option) {
    const patient = activePatient();
    if (!patient || patient.localDone[option.id] || patient.localUsed >= MAX_LOCAL_EXAMS) return;
    const disease = diseaseFor(patient);
    const result = disease.local[option.id];
    patient.localDone[option.id] = true;
    patient.localUsed += 1;
    patient.dxPoints += 1;
    patient.stress = clamp(patient.stress + 5, 0, 100);
    patient.findings.push(typeof result === "function" ? result(patient) : result);
    setLog(`Локальный осмотр: ${option.label}.`);
    closeChoice();
    passTime(option.time);
  }

  function doSample() {
    const patient = activePatient();
    if (!patient || patient.sampleTaken) return;
    patient.sampleTaken = true;
    patient.stress = clamp(patient.stress + 4, 0, 100);
    patient.findings.push("Материал для микроскопии взят и промаркирован.");
    setLog("Взят материал для исследования.");
    passTime(2);
  }

  function doMicroscopy() {
    const patient = activePatient();
    if (!patient || patient.microscopyDone) return;
    if (!patient.sampleTaken) {
      setLog("Сначала нужно взять материал для исследования.");
      return;
    }
    if (patient.dxPoints < MICROSCOPY_COST) {
      setLog("Для микроскопии нужно минимум 2 диагностических очка.");
      return;
    }
    patient.dxPoints -= MICROSCOPY_COST;
    patient.microscopyDone = true;
    patient.findings.push(diseaseFor(patient).microscopy(patient));
    state.money += 90;
    state.revenueToday += 90;
    setLog("Микроскопия выполнена: владелец оплатил исследование.");
    passTime(7);
  }

  function selectDiagnosis(diagnosis) {
    const patient = activePatient();
    if (!patient) return;
    patient.selectedDiagnosisId = diagnosis.id;
    patient.findings.push(`Предварительный диагноз: ${diagnosis.label}.`);
    setLog(`Выбран диагноз: ${diagnosis.label}. Теперь можно назначать лечение.`);
    closeChoice();
    passTime(3);
  }

  function selectCommunication(option) {
    const patient = activePatient();
    if (!patient) return;
    patient.selectedCommunicationId = option.id;
    patient.findings.push(`Объяснение владельцу: ${option.label}.`);
    const preferred = option.id === patient.ownerProfile.prefers;
    let trustDelta = preferred ? 8 : 2;
    if (option.id === "strict" && patient.ownerProfile.id === "anxious") trustDelta = -4;
    if (option.id === "budgetPlan" && patient.ownerProfile.id === "budget") trustDelta = 10;
    adjustTrust(patient, trustDelta);
    setLog(`План объяснен: ${option.label.toLowerCase()}. Реакция владельца отражена в шкале доверия.`);
    closeChoice();
    passTime(4);
  }

  function treatPatient(treatment) {
    const patient = activePatient();
    if (!patient) return;
    const disease = diseaseFor(patient);
    const result = disease.evaluate(patient, treatment.id);
    const diagnosisCorrect = patient.selectedDiagnosisId === patient.diseaseId;
    const diagnosticsScore = diagnosticScore(patient);
    const consultFee = disease.baseFee;
    const total = consultFee + treatment.fee;
    const communicationMatch = patient.selectedCommunicationId === patient.ownerProfile.prefers;
    state.money += total;
    state.revenueToday += total;
    state.treatedToday += 1;
    let reputationChange = 0;
    let risk = result.returnRisk;
    let effectiveQuality = result.quality;

    if (diagnosticsScore < 45) {
      risk += 0.08;
    }

    const overtime = Math.max(0, patient.visitTimeUsed - patient.visitTimeLimit);
    if (overtime > 0) {
      risk += Math.min(0.12, overtime / 100);
      if (overtime >= 12) reputationChange -= 1;
      patient.findings.push(`Прием занял ${patient.visitTimeUsed} минут при комфортном лимите ${patient.visitTimeLimit} минут.`);
    }

    if (!patient.selectedDiagnosisId) {
      risk += 0.14;
      state.mistakesToday += 1;
      reputationChange -= 1;
      effectiveQuality = "wrong";
    } else if (!diagnosisCorrect) {
      risk += 0.18;
      state.mistakesToday += 1;
      reputationChange -= patient.returnVisit ? 3 : 1;
      effectiveQuality = result.quality === "correct" ? "partial" : result.quality;
    }

    if (total > patient.budget) {
      risk += 0.1;
      reputationChange -= patient.ownerProfile.id === "budget" ? 2 : 1;
      patient.findings.push("Владелец согласился, но лечение оказалось выше комфортного бюджета.");
    }

    if (!patient.selectedCommunicationId) {
      risk += 0.1 + patient.ownerProfile.anxiety / 1000;
      reputationChange -= patient.ownerProfile.id === "anxious" ? 2 : 1;
      patient.findings.push("Назначения даны без отдельного объяснения владельцу.");
    } else if (communicationMatch) {
      risk = Math.max(0, risk - 0.06);
      reputationChange += 1;
    } else {
      risk += 0.04;
    }

    if (effectiveQuality === "correct") {
      reputationChange += patient.returnVisit ? 2 : 1;
    } else if (effectiveQuality === "partial") {
      if (diagnosisCorrect) state.mistakesToday += 1;
      reputationChange -= patient.returnVisit ? 2 : 0;
    } else {
      if (diagnosisCorrect) state.mistakesToday += 1;
      reputationChange -= patient.returnVisit ? 4 : 1;
    }

    state.reputation = clamp(state.reputation + reputationChange, 0, 100);
    if (Math.random() < risk) {
      state.pendingReturns.push({ diseaseId: patient.diseaseId, day: state.day + 1 });
    }

    state.caseJournal.push({
      day: state.day,
      animal: patient.animal,
      species: patient.species,
      owner: patient.owner,
      ownerType: patient.ownerProfile.label,
      complaint: patient.complaints.join(", "),
      trueDiagnosis: disease.name,
      selectedDiagnosis: diagnosisLabel(patient.selectedDiagnosisId) || "не выбран",
      treatment: treatment.label,
      communication: communicationLabel(patient.selectedCommunicationId) || "без объяснения",
      visitTime: patient.visitTimeUsed,
      trust: patient.trust,
      quality: effectiveQuality,
      risk: Math.round(risk * 100)
    });

    setLog(`${patient.animal}: лечение назначено. Результат станет понятен после наблюдения или повторного обращения.`);
    state.queue = state.queue.filter((item) => item.id !== patient.id);
    state.activeId = state.queue[0] ? state.queue[0].id : null;
    closeChoice();
    if (!state.activeId) el.caseWindow.classList.add("hidden");
    passTime(18, { trackVisit: false });
  }

  function diagnosticScore(patient) {
    let score = patient.dxPoints * 10;
    if (patient.temperatureDone) score += 12;
    if (patient.mucousDone) score += 12;
    if (patient.localUsed > 0) score += 12 * patient.localUsed;
    if (patient.microscopyDone) score += patient.diseaseId.includes("Otitis") ? 18 : 4;
    return clamp(score, 0, 100);
  }

  function endDay() {
    state.modalOpen = true;
    state.paused = true;
    const todayCases = state.caseJournal.filter((item) => item.day === state.day);
    const lastCase = todayCases[todayCases.length - 1];
    el.summaryTitle.textContent = `День ${state.day} завершен`;
    el.summaryText.innerHTML = [
      `Пациентов принято: <b>${state.treatedToday}</b>.`,
      `Доход: <b>${formatMoney(state.revenueToday)} веткоинов</b>.`,
      `Репутация: <b>${state.reputation}</b>/100.`,
      `Повторных обращений сегодня: <b>${state.returnsToday}</b>.`,
      lastCase
        ? `Последний случай: <b>${lastCase.animal}</b>, рабочая версия: <b>${lastCase.selectedDiagnosis}</b>.`
        : "Журнал случаев пока пуст."
    ].join("<br>");
    el.summaryWindow.classList.remove("hidden");
  }

  function startNextDay() {
    state.day += 1;
    state.minute = DAY_START;
    state.spawnMeter = 0;
    state.treatedToday = 0;
    state.revenueToday = 0;
    state.returnsToday = 0;
    state.mistakesToday = 0;
    state.paused = false;
    state.modalOpen = false;
    el.summaryWindow.classList.add("hidden");
    const returns = state.pendingReturns.filter((item) => item.day === state.day);
    state.pendingReturns = state.pendingReturns.filter((item) => item.day !== state.day);
    returns.forEach((item) => {
      state.returnsToday += 1;
      spawnPatient(item.diseaseId, true);
    });
    while (state.queue.length < 3) spawnPatient();
    setLog(returns.length ? "День начался с повторных обращений." : "Новый день. Очередь постепенно собирается.");
    renderAll();
  }

  function openCase(patientId) {
    state.activeId = patientId;
    el.caseWindow.classList.remove("hidden");
    closeChoice();
    renderAll();
  }

  function openChoice(kicker, title, items) {
    el.choiceKicker.textContent = kicker;
    el.choiceTitle.textContent = title;
    el.choiceBody.textContent = "";
    items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-item";
      button.disabled = Boolean(item.disabled);
      const strong = document.createElement("strong");
      strong.textContent = item.label;
      const span = document.createElement("span");
      span.textContent = item.note || "";
      button.append(strong, span);
      button.addEventListener("click", item.onClick);
      el.choiceBody.appendChild(button);
    });
    el.choiceWindow.classList.remove("hidden");
  }

  function closeChoice() {
    el.choiceWindow.classList.add("hidden");
  }

  function openAnamnesis() {
    const patient = activePatient();
    if (!patient) return;
    const disease = diseaseFor(patient);
    const budgetQuestion = {
      id: "budget",
      label: "Есть ограничения по бюджету?",
      answer: `Владелец просит по возможности уложиться примерно в ${Math.max(100, Math.floor((patient.budget - 60) / 50) * 50)}–${Math.ceil((patient.budget + 60) / 50) * 50} веткоинов.`
    };
    const questions = [...disease.anamnesis(patient), budgetQuestion].map((question) => ({
      label: question.label,
      note: patient.asked[question.id] ? "Уже спросили." : `Спросить владельца. Потратит ${question.id === "budget" ? 1 : 2} мин. приема.`,
      disabled: patient.asked[question.id],
      onClick: () => {
        askQuestion(patient, question);
        closeChoice();
      }
    }));
    openChoice("Анамнез", "Что спросить у владельца?", questions);
  }

  function openLocalExam() {
    const patient = activePatient();
    if (!patient) return;
    const items = localExamOptions.map((option) => ({
      label: option.label,
      note: patient.localDone[option.id]
        ? "Уже осмотрено."
        : patient.localUsed >= MAX_LOCAL_EXAMS
          ? "Лимит локальных осмотров исчерпан."
          : `Потратит один локальный осмотр и ${option.time} мин. приема.`,
      disabled: patient.localDone[option.id] || patient.localUsed >= MAX_LOCAL_EXAMS,
      onClick: () => doLocalExam(option)
    }));
    openChoice("Осмотр", "Что осмотреть дополнительно?", items);
  }

  function openDiagnosis() {
    const patient = activePatient();
    if (!patient) return;
    const items = diagnosisOptions.map((diagnosis) => ({
      label: diagnosis.label,
      note: patient.selectedDiagnosisId === diagnosis.id
        ? "Сейчас выбран этот диагноз."
        : `${diagnosis.note} Потратит 3 минуты приема.`,
      onClick: () => selectDiagnosis(diagnosis)
    }));
    openChoice("Диагноз", "Выберите один из 10 диагнозов", items);
  }

  function openCommunication() {
    const patient = activePatient();
    if (!patient) return;
    const items = communicationOptions.map((option) => ({
      label: option.label,
      note: patient.selectedCommunicationId === option.id
        ? "Сейчас выбран этот стиль."
        : `${option.note} Потратит 4 минуты приема.`,
      onClick: () => selectCommunication(option)
    }));
    openChoice("Объяснение", "Как объяснить владельцу план?", items);
  }

  function openTreatment() {
    const patient = activePatient();
    if (!patient) return;
    if (!patient.selectedDiagnosisId) {
      setLog("Сначала выберите предварительный диагноз из списка.");
      openDiagnosis();
      return;
    }
    const items = treatmentOptions.map((treatment) => ({
      label: `${treatment.label} (+${treatment.fee} вет.)`,
      note: `${treatment.note} ${patient.budgetAsked
        ? diseaseFor(patient).baseFee + treatment.fee > patient.budget
          ? "Выше обсужденного бюджета."
          : "В обсужденный бюджет помещается."
        : "Бюджет владельца не обсуждался."}`,
      onClick: () => treatPatient(treatment)
    }));
    openChoice("Лечение", "Назначение владельцу", items);
  }

  function cyclePatient() {
    if (!state.queue.length) return;
    const currentIndex = state.queue.findIndex((patient) => patient.id === state.activeId);
    const next = state.queue[(currentIndex + 1 + state.queue.length) % state.queue.length];
    openCase(next.id);
  }

  function renderQueue() {
    el.nextPatientCard.textContent = "";
    el.queueStrip.textContent = "";
    el.queueCountLabel.textContent = `${state.queue.length} из 12`;
    state.queue.forEach((patient, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `queue-card${patient.id === state.activeId ? " active" : ""}`;
      const title = document.createElement("strong");
      title.textContent = `${patient.animal} • ${speciesLabels[patient.species]}`;
      const note = document.createElement("span");
      note.textContent = patient.returnVisit ? "повторное обращение" : `Ждет ${Math.max(1, Math.round(patient.age))} мин.`;
      const owner = document.createElement("span");
      owner.textContent = `Жалоба: ${patient.complaints[0]}`;
      const bar = document.createElement("div");
      bar.className = "patience-bar";
      const fill = document.createElement("i");
      fill.style.width = `${patient.mood}%`;
      bar.appendChild(fill);
      button.append(title, note, owner, bar);
      button.addEventListener("click", () => openCase(patient.id));
      if (index === 0) el.nextPatientCard.appendChild(button.cloneNode(true));
      el.queueStrip.appendChild(button);
    });
    const nextButton = el.nextPatientCard.querySelector(".queue-card");
    if (nextButton && state.queue[0]) nextButton.addEventListener("click", () => openCase(state.queue[0].id));
    if (!state.queue.length) {
      const empty = document.createElement("div");
      empty.className = "queue-locked";
      empty.textContent = "Очередь пуста";
      el.nextPatientCard.appendChild(empty);
    }
  }

  function renderCase() {
    const patient = activePatient();
    if (!patient) {
      el.caseWindow.classList.add("hidden");
      return;
    }
    el.caseStage.textContent = patient.returnVisit ? "Повторный прием" : "Кабинет врача";
    el.caseTitle.textContent = `${patient.animal} · ${speciesLabels[patient.species]} · ${patient.sex} · ${patient.ageYears} г.`;
    el.caseOwner.textContent = `Владелец: ${patient.owner}`;
    el.caseUrgency.textContent = "Срочность: обычная";
    el.caseDuration.textContent = `Прием длится: ${patient.visitTimeUsed} мин.`;
    el.ownerComplaint.textContent = patient.returnVisit
      ? `«После прошлого лечения не стало нормально. ${patient.complaints.join(", ")}.»`
      : `«${patient.complaints.join(", ")}.»`;
    el.findingsList.textContent = "";
    patient.findings.filter((finding) => !finding.startsWith("Жалобы владельца:")).slice(-8).forEach((finding) => {
      const li = document.createElement("li");
      li.textContent = finding;
      el.findingsList.appendChild(li);
    });
    if (!el.findingsList.children.length) {
      const li = document.createElement("li");
      li.textContent = "Осмотр еще не проводился.";
      el.findingsList.appendChild(li);
    }
    const unknown = [];
    if (!patient.asked.duration && !patient.asked.start) unknown.push("Когда точно начались симптомы");
    if (!patient.asked.previous) unknown.push("Были ли подобные эпизоды");
    if (!patient.asked.parasite) unknown.push("Проводились ли обработки");
    if (!patient.budgetAsked) unknown.push("Есть ли ограничения по бюджету");
    el.unknownList.textContent = "";
    (unknown.length ? unknown : ["Основные сведения уточнены"]).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      el.unknownList.appendChild(li);
    });
    const visitPercent = clamp((patient.visitTimeUsed / patient.visitTimeLimit) * 100, 0, 100);
    el.trustMeter.style.width = `${patient.trust}%`;
    el.tensionMeter.style.width = `${patient.ownerProfile.anxiety}%`;
    el.stressMeter.style.width = `${patient.stress}%`;
    el.visitTimeMeter.style.width = `${visitPercent}%`;
    el.patientFacts.innerHTML = `<strong>${patient.animal}</strong><span>${speciesLabels[patient.species]} · ${patient.sex} · ${patient.ageYears} г.</span><span>Состояние: стабильное</span>`;
    el.ownerName.textContent = patient.owner;
    el.ownerBudget.textContent = patient.budgetAsked
      ? `${Math.max(100, Math.floor((patient.budget - 60) / 50) * 50)}–${Math.ceil((patient.budget + 60) / 50) * 50} V`
      : "не обсуждался";
    el.ownerConsent.textContent = patient.sampleTaken ? "на исследование получено" : "нужно уточнить";
    const selectedDiagnosis = diagnosisOptions.find((diagnosis) => diagnosis.id === patient.selectedDiagnosisId);
    el.diagnosisChip.textContent = selectedDiagnosis
      ? `Рабочая версия: ${selectedDiagnosis.label}`
      : "Рабочая версия не выбрана";
    el.generalExamBtn.disabled = patient.generalExamDone;
    el.localExamBtn.disabled = patient.localUsed >= MAX_LOCAL_EXAMS;
    el.sampleBtn.disabled = patient.sampleTaken;
    el.microscopyBtn.disabled = patient.microscopyDone || !patient.sampleTaken;
    el.treatmentBtn.disabled = !patient.selectedDiagnosisId;
    document.querySelectorAll(".stage-tabs button").forEach((button) => button.classList.remove("active"));
    const stage = patient.selectedCommunicationId ? "discharge"
      : patient.selectedDiagnosisId ? "decision"
        : patient.microscopyDone || patient.sampleTaken ? "research"
          : patient.generalExamDone || patient.localUsed ? "exam"
            : Object.keys(patient.asked).length ? "anamnesis" : "complaint";
    document.querySelector(`.stage-tabs button[data-stage="${stage}"]`)?.classList.add("active");
    el.developerData.textContent = [
      `Истинный диагноз: ${diseaseFor(patient).name}`,
      `Тип владельца: ${patient.ownerProfile.label}`,
      `Точный бюджет: ${patient.budget} V`,
      `Надежность назначений: ${Math.round(patient.ownerProfile.reliability * 100)}%`,
      `Диагностические очки: ${patient.dxPoints}`
    ].join("\n");
    drawPortrait(patient);
  }

  function renderHud() {
    el.moneyValue.textContent = formatMoney(state.money);
    el.todayRevenue.textContent = `+${formatMoney(state.revenueToday)} V`;
    el.dateValue.textContent = `День ${state.day}`;
    el.timeValue.textContent = formatTime(state.minute);
    el.closingTime.textContent = `${Math.max(0, Math.ceil((DAY_END - state.minute) / 60))} ч.`;
    el.reputationMeter.style.width = `${state.reputation}%`;
    el.reputationValue.textContent = `${Math.round(state.reputation)} / 100`;
    el.reputationLabel.textContent = state.reputation >= 80 ? "Известная клиника" : state.reputation >= 55 ? "Новая клиника" : "Клиника под наблюдением";
    el.queueValue.textContent = `${state.queue.length} / 12`;
    el.pauseBtn.textContent = state.paused ? "▶" : "II";
    el.speedBtn.textContent = `${state.speed}x`;
    el.messageLog.textContent = `${formatTime(state.minute)} · ${state.log}`;
  }

  function renderAll() {
    renderQueue();
    renderCase();
    renderHud();
    drawClinic();
  }

  function drawClinic() {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawClinicShell();
    drawCharacters();
    drawFloatingLabels();
  }

  function drawBackground() {
    ctx.fillStyle = "#173a29";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#24523a";
    ctx.fillRect(0, 610, canvas.width, 110);
    ctx.fillStyle = "#345c4c";
    ctx.fillRect(650, 640, 120, 80);
    ctx.fillStyle = "#73808a";
    ctx.fillRect(674, 638, 72, 82);
    for (let x = 10; x < canvas.width; x += 64) {
      ctx.fillStyle = x % 128 ? "#2b6543" : "#31714a";
      ctx.fillRect(x, 30, 36, 60);
      ctx.fillRect(x - 10, 48, 56, 22);
    }
  }

  function drawClinicShell() {
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(54, 100, 1168, 540);
    drawRoom(70, 95, 430, 225, "#d9b6b7", "Кабинет врача");
    drawRoom(500, 95, 310, 225, "#c9b7df", "Лабораторный уголок");
    drawRoom(810, 95, 390, 225, "#5b646b", "Расширение клиники");
    drawRoom(70, 390, 590, 230, "#b8d2b7", "Зона ожидания");
    drawRoom(660, 390, 540, 230, "#d8d5c3", "Регистратура и вход");
    ctx.fillStyle = "#9aa6ad";
    ctx.fillRect(70, 320, 1130, 70);
    drawTiles(70, 320, 1130, 70);
    ctx.fillStyle = "#3c4e5a";
    ctx.font = "bold 14px Trebuchet MS";
    ctx.fillText("ОБЩИЙ КОРИДОР", 560, 360);
    drawReception(865, 445);
    drawExamDesk(205, 182);
    drawMicroscope(615, 190);
    drawBenches();
    drawPlants();
    drawDoors();
    drawLockedRibbon(902, 188);
    drawEntrance();
  }

  function drawRoom(x, y, w, h, floor, label) {
    ctx.fillStyle = "#dce6eb";
    ctx.fillRect(x - 8, y - 10, w + 16, h + 18);
    ctx.fillStyle = "#74828b";
    ctx.fillRect(x - 8, y - 10, w + 16, 13);
    ctx.fillRect(x - 8, y - 10, 13, h + 18);
    ctx.fillStyle = floor;
    ctx.fillRect(x, y, w, h);
    drawTiles(x, y, w, h);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#eaf1f4";
    ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#687784";
    ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
    const labelWidth = Math.max(130, label.length * 8 + 20);
    ctx.fillStyle = "rgba(16,36,59,.86)";
    ctx.fillRect(x + 12, y + 11, labelWidth, 25);
    ctx.fillStyle = "#f4fbff";
    ctx.font = "bold 15px Trebuchet MS";
    ctx.fillText(label, x + 22, y + 29);
  }

  function drawTiles(x, y, w, h) {
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    ctx.lineWidth = 1;
    for (let tx = x; tx <= x + w; tx += 36) {
      ctx.beginPath();
      ctx.moveTo(tx, y);
      ctx.lineTo(tx, y + h);
      ctx.stroke();
    }
    for (let ty = y; ty <= y + h; ty += 28) {
      ctx.beginPath();
      ctx.moveTo(x, ty);
      ctx.lineTo(x + w, ty);
      ctx.stroke();
    }
  }

  function drawExamDesk(x, y) {
    drawFurniture(x, y + 35, 165, 60, "#80b9c7", "#477987");
    ctx.fillStyle = "#dff7fb";
    ctx.fillRect(x + 14, y + 45, 137, 12);
    drawFurniture(x + 205, y, 120, 58, "#6d4730", "#3a2518");
    ctx.fillStyle = "#e8f5f8";
    ctx.fillRect(x + 225, y + 12, 32, 22);
    ctx.fillStyle = "#26384a";
    ctx.fillRect(x + 222, y + 8, 38, 8);
    ctx.fillStyle = "#eef7fa";
    ctx.fillRect(x + 335, y + 25, 42, 55);
    ctx.fillStyle = "#6aa9bd";
    ctx.fillRect(x + 340, y + 42, 32, 9);
  }

  function drawMicroscope(x, y) {
    drawFurniture(x - 54, y + 36, 145, 38, "#d8f9ff", "#71bfd8");
    ctx.fillStyle = "#252e3d";
    ctx.fillRect(x, y, 16, 50);
    ctx.fillRect(x - 8, y + 42, 38, 10);
    ctx.fillStyle = "#f4fcff";
    ctx.fillRect(x + 12, y + 6, 30, 18);
    ctx.fillStyle = "#75cbe5";
    ctx.fillRect(x + 34, y + 12, 12, 28);
  }

  function drawReception(x, y) {
    drawFurniture(x, y, 190, 68, "#8f694c", "#60442f");
    ctx.fillStyle = "#f6fbff";
    ctx.fillRect(x + 115, y - 28, 34, 28);
    ctx.fillStyle = "#0f2641";
    ctx.fillRect(x + 121, y - 22, 22, 14);
    ctx.fillStyle = "#f4d47e";
    ctx.fillRect(x + 20, y + 13, 30, 16);
  }

  function drawBenches() {
    const benches = [
      [135, 455],
      [315, 455],
      [135, 548],
      [315, 548]
    ];
    benches.forEach(([x, y]) => {
      drawFurniture(x, y, 94, 18, "#7ce26f", "#47a94b");
      ctx.fillStyle = "#8a99aa";
      ctx.fillRect(x + 4, y + 18, 6, 18);
      ctx.fillRect(x + 82, y + 18, 6, 18);
    });
  }

  function drawPlants() {
    [[92, 515], [595, 525], [1140, 525], [465, 270], [780, 530]].forEach(([x, y]) => {
      ctx.fillStyle = "#8d6547";
      ctx.fillRect(x - 10, y + 25, 25, 18);
      ctx.fillStyle = "#68452f";
      ctx.fillRect(x - 7, y + 39, 19, 5);
      ctx.fillStyle = "#2f8848";
      ctx.beginPath();
      ctx.arc(x + 2, y + 19, 10, 0, Math.PI * 2);
      ctx.arc(x - 7, y + 12, 9, 0, Math.PI * 2);
      ctx.arc(x + 12, y + 10, 9, 0, Math.PI * 2);
      ctx.arc(x + 2, y + 2, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4caf61";
      ctx.fillRect(x, y + 8, 4, 20);
    });
  }

  function drawDoors() {
    [[445, 250], [745, 250], [835, 250], [610, 410], [710, 410]].forEach(([x, y]) => {
      ctx.fillStyle = "#31424d";
      ctx.fillRect(x, y, 44, 70);
      ctx.fillStyle = "#182832";
      ctx.fillRect(x + 5, y + 5, 34, 65);
      ctx.fillStyle = "#9d6b45";
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 5);
      ctx.lineTo(x + 31, y + 14);
      ctx.lineTo(x + 31, y + 70);
      ctx.lineTo(x + 5, y + 70);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f3d76d";
      ctx.fillRect(x + 25, y + 40, 4, 4);
    });
  }

  function drawEntrance() {
    ctx.fillStyle = "#96d3e3";
    ctx.fillRect(685, 570, 92, 50);
    ctx.strokeStyle = "#27465a";
    ctx.lineWidth = 4;
    ctx.strokeRect(685, 570, 92, 50);
    ctx.beginPath();
    ctx.moveTo(731, 570);
    ctx.lineTo(731, 620);
    ctx.stroke();
    ctx.fillStyle = "#465963";
    ctx.fillRect(674, 620, 114, 16);
  }

  function drawLockedRibbon(x, y) {
    ctx.fillStyle = "rgba(16, 47, 91, 0.82)";
    ctx.fillRect(x, y, 172, 36);
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(x + 4, y + 4, 164, 28);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Trebuchet MS";
    ctx.fillText("будущий кабинет", x + 18, y + 23);
  }

  function drawFurniture(x, y, w, h, top, side) {
    ctx.fillStyle = side;
    ctx.fillRect(x + 6, y + h - 4, w, 10);
    ctx.fillStyle = top;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#26384a";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }

  function drawCharacters() {
    const idle = Math.round(Math.sin(state.animationTime / 380) * 1.5);
    drawPerson(390, 235 + idle, { shirt: "#ffffff", pants: "#253c65", hair: "#1f1f1f", coat: true });
    ctx.fillStyle = "#0f2641";
    ctx.font = "bold 12px Trebuchet MS";
    ctx.fillText("врач", 374, 282 + idle);

    state.queue.forEach((patient, index) => {
      const inCabinet = patient.id === state.activeId && el.caseWindow.classList.contains("hidden") === false;
      const bob = Math.round(Math.sin(state.animationTime / 420 + index) * 1.5);
      const x = inCabinet ? 270 : 175 + (index % 3) * 155;
      const y = inCabinet ? 250 + bob : 505 + Math.floor(index / 3) * 72 + bob;
      const color = ownerColor(index);
      drawPerson(x, y, color);
      drawAnimal(patient.species, x + 27, y + 18, patient.id === state.activeId);
      if (patient.returnVisit) drawBubble(x + 20, y - 42, "!");
    });
  }

  function drawFloatingLabels() {
    state.queue.forEach((patient, index) => {
      if (patient.id === state.activeId && !el.caseWindow.classList.contains("hidden")) return;
      if (patient.mood < 38) drawBubble(190 + (index % 3) * 155, 445 + Math.floor(index / 3) * 72, "ждет долго");
    });
  }

  function drawBubble(x, y, text) {
    const width = Math.max(36, text.length * 7 + 16);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, width, 28);
    ctx.strokeStyle = "#152034";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, 28);
    ctx.fillStyle = "#152034";
    ctx.font = "bold 12px Trebuchet MS";
    ctx.fillText(text, x + 8, y + 18);
  }

  function ownerColor(index) {
    const palette = [
      { shirt: "#e7bb68", pants: "#31507d", hair: "#6b3e26" },
      { shirt: "#b5a2dc", pants: "#3d4e68", hair: "#1d1d1d" },
      { shirt: "#d98c8c", pants: "#35577a", hair: "#61422d" },
      { shirt: "#75c5e8", pants: "#47566c", hair: "#e7c073" },
      { shirt: "#c48c62", pants: "#3d4e68", hair: "#989898" }
    ];
    return palette[index % palette.length];
  }

  function drawPerson(x, y, options) {
    const skin = options.skin || "#e2a184";
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(x - 10, y + 31, 32, 7);
    ctx.fillStyle = options.pants || "#2c4365";
    ctx.fillRect(x - 2, y + 19, 8, 22);
    ctx.fillRect(x + 9, y + 19, 8, 22);
    ctx.fillStyle = options.coat ? "#f4fbff" : options.shirt;
    ctx.fillRect(x - 6, y + 3, 27, 23);
    if (options.coat) {
      ctx.fillStyle = "#8fc6dd";
      ctx.fillRect(x + 6, y + 4, 3, 21);
    }
    ctx.fillStyle = skin;
    ctx.fillRect(x - 2, y - 17, 17, 17);
    ctx.fillStyle = options.hair || "#4a2d1f";
    ctx.fillRect(x - 4, y - 20, 21, 7);
    ctx.fillRect(x - 5, y - 14, 4, 9);
    ctx.fillStyle = "#111827";
    ctx.fillRect(x + 2, y - 10, 3, 3);
    ctx.fillRect(x + 10, y - 10, 3, 3);
    ctx.fillStyle = skin;
    ctx.fillRect(x - 12, y + 8, 6, 15);
    ctx.fillRect(x + 21, y + 8, 6, 15);
  }

  function drawAnimal(species, x, y, active) {
    const scale = active ? 1.15 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
    ctx.fillRect(-9, 18, 30, 6);
    if (species === "dog") drawDog();
    if (species === "cat") drawCat();
    if (species === "rabbit") drawRabbit();
    ctx.restore();
  }

  function drawDog() {
    ctx.fillStyle = "#b77a45";
    ctx.fillRect(-8, 4, 28, 15);
    ctx.fillRect(13, -4, 13, 14);
    ctx.fillStyle = "#6e462a";
    ctx.fillRect(10, -2, 6, 10);
    ctx.fillRect(22, -2, 5, 11);
    ctx.fillRect(-12, 7, 7, 5);
    ctx.fillRect(-4, 18, 5, 9);
    ctx.fillRect(12, 18, 5, 9);
    ctx.fillStyle = "#111827";
    ctx.fillRect(22, 2, 3, 3);
  }

  function drawCat() {
    ctx.fillStyle = "#7a8793";
    ctx.fillRect(-8, 6, 25, 13);
    ctx.fillRect(12, -3, 13, 13);
    ctx.fillRect(13, -8, 5, 7);
    ctx.fillRect(21, -8, 5, 7);
    ctx.fillRect(-15, 4, 7, 5);
    ctx.fillRect(-18, 0, 5, 5);
    ctx.fillRect(-3, 18, 4, 8);
    ctx.fillRect(10, 18, 4, 8);
    ctx.fillStyle = "#101824";
    ctx.fillRect(21, 1, 3, 3);
  }

  function drawRabbit() {
    ctx.fillStyle = "#eee7df";
    ctx.fillRect(-8, 8, 24, 12);
    ctx.fillRect(10, -1, 13, 13);
    ctx.fillRect(11, -18, 5, 18);
    ctx.fillRect(18, -18, 5, 18);
    ctx.fillRect(-4, 19, 4, 8);
    ctx.fillRect(10, 19, 4, 8);
    ctx.fillStyle = "#f2b6c7";
    ctx.fillRect(12, -15, 2, 13);
    ctx.fillRect(19, -15, 2, 13);
    ctx.fillStyle = "#101824";
    ctx.fillRect(20, 3, 3, 3);
  }

  function drawPortrait(patient) {
    portraitCtx.imageSmoothingEnabled = false;
    portraitCtx.clearRect(0, 0, portraitCanvas.width, portraitCanvas.height);
    portraitCtx.fillStyle = "#ccefff";
    portraitCtx.fillRect(0, 0, portraitCanvas.width, portraitCanvas.height);
    portraitCtx.fillStyle = "#b3ddec";
    for (let y = 0; y < portraitCanvas.height; y += 16) {
      portraitCtx.fillRect(0, y, portraitCanvas.width, 8);
    }
    portraitCtx.save();
    portraitCtx.translate(78, 82);
    portraitCtx.scale(2.8, 2.8);
    const old = ctx;
    drawAnimalOnContext(portraitCtx, patient.species);
    portraitCtx.restore();
    portraitCtx.fillStyle = "#102f5b";
    portraitCtx.font = "bold 17px Trebuchet MS";
    portraitCtx.fillText(patient.animal, 16, 168);
    portraitCtx.font = "12px Trebuchet MS";
    portraitCtx.fillText(speciesLabels[patient.species], 16, 184);
    void old;
  }

  function drawAnimalOnContext(target, species) {
    target.fillStyle = "rgba(0, 0, 0, 0.16)";
    target.fillRect(-9, 18, 30, 6);
    const savedCtx = ctx;
    ctx = target;
    if (species === "dog") drawDog();
    if (species === "cat") drawCat();
    if (species === "rabbit") drawRabbit();
    ctx = savedCtx;
  }

  function bindEvents() {
    el.closeCaseBtn.addEventListener("click", () => {
      el.caseWindow.classList.add("hidden");
      closeChoice();
      renderAll();
    });
    el.closeChoiceBtn.addEventListener("click", closeChoice);
    el.anamnesisBtn.addEventListener("click", openAnamnesis);
    el.generalExamBtn.addEventListener("click", doGeneralExam);
    el.localExamBtn.addEventListener("click", openLocalExam);
    el.sampleBtn.addEventListener("click", doSample);
    el.microscopyBtn.addEventListener("click", doMicroscopy);
    el.diagnosisBtn.addEventListener("click", openDiagnosis);
    el.communicationBtn.addEventListener("click", openCommunication);
    el.treatmentBtn.addEventListener("click", openTreatment);
    el.pauseBtn.addEventListener("click", () => {
      state.paused = !state.paused;
      renderHud();
    });
    el.speedBtn.addEventListener("click", () => {
      state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1;
      renderHud();
    });
    el.nextPatientBtn.addEventListener("click", cyclePatient);
    el.nextDayBtn.addEventListener("click", startNextDay);
    el.developerBtn.addEventListener("click", () => el.developerPanel.classList.toggle("hidden"));
    el.closeDeveloperBtn.addEventListener("click", () => el.developerPanel.classList.add("hidden"));
    document.querySelectorAll(".stage-tabs button").forEach((button) => {
      button.addEventListener("click", () => {
        const handlers = {
          anamnesis: openAnamnesis,
          exam: doGeneralExam,
          research: () => activePatient()?.sampleTaken ? doMicroscopy() : doSample(),
          decision: openDiagnosis,
          discharge: openCommunication
        };
        handlers[button.dataset.stage]?.();
      });
    });
    canvas.addEventListener("click", () => {
      if (activePatient()) {
        el.caseWindow.classList.remove("hidden");
        renderAll();
      }
    });
  }

  function tick(timestamp) {
    state.animationTime = timestamp;
    if (!state.lastTick) state.lastTick = timestamp;
    const delta = timestamp - state.lastTick;
    state.lastTick = timestamp;
    if (!state.paused && !state.modalOpen && !isReadingInterfaceOpen()) {
      const minutes = (delta / 1000) * state.speed * 0.5;
      state.minute += minutes;
      state.spawnMeter += minutes;
      state.queue.forEach((patient) => {
        if (isPatientInConsult(patient)) return;
        patient.age += minutes;
        patient.mood = waitingMood(patient);
      });
      removeLostPatients();
      maybeSpawn();
      if (state.minute >= DAY_END) {
        endDay();
      }
      renderAll();
    } else {
      drawClinic();
    }
    window.requestAnimationFrame(tick);
  }

  function init() {
    bindEvents();
    spawnPatient("bacterialOtitis");
    spawnPatient("miteOtitis");
    spawnPatient("pancreatitis");
    el.caseWindow.classList.add("hidden");
    setLog("Клиника открыта. Выберите пациента из очереди и пригласите в кабинет.");
    renderAll();
    window.requestAnimationFrame(tick);
  }

  init();
})();
