(function () {
  "use strict";

  const DAY_START = 8 * 60;
  const STANDARD_DAY_END = 18 * 60;
  const EXTENDED_DAY_END = 20 * 60;
  const MAX_LOCAL_EXAMS = 2;
  const MICROSCOPY_COST = 2;
  const MICROSCOPY_FEE = 90;
  const MAX_CONSECUTIVE_SHIFTS = 3;
  const SIMULATION_MINUTES_PER_REAL_SECOND = 2;
  const PATIENT_ROUTE_SPEED = 4;
  const DOCTOR_ROUTE_SPEED = 5.2;
  const LAB_HOLD_MS = 1200;
  const CLINIC_VIEW = { x: 28, y: 42, scale: 0.88 };
  let campaign = window.PET_CLINIC_CAMPAIGN;
  let generatorRuntime = { mode: "current", catalog: null, generator: null };
  const visitState = window.PET_CLINIC_VISIT_STATE;
  const clinicalDecisions = window.PET_CLINIC_CLINICAL_DECISIONS_V2;
  const diagnosticDecisions = window.PET_CLINIC_DIAGNOSTIC_DECISIONS_V2;
  const campaignMechanics = window.PET_CLINIC_CAMPAIGN_MECHANICS_V2;
  let gameSaveBlocked = false;
  let lastGameSaveAt = 0;

  function campaignDayCount() {
    return generatorRuntime.mode === "tier-01-v2" ? 7 : 5;
  }

  function isTier01V2() {
    return generatorRuntime.mode === "tier-01-v2";
  }

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

  const legacyCommunicationOptions = [
    { id: "calmDetailed", label: "Спокойно и подробно", note: "Обсудить, что известно, что пока неясно и что делать дальше." },
    { id: "riskFocus", label: "Объяснить риски", note: "Сначала обозначить опасные признаки и сроки повторного обращения." },
    { id: "budgetPlan", label: "План с учетом бюджета", note: "Разделить обязательный минимум и дополнительные шаги." },
    { id: "strict", label: "Коротко и строго", note: "Дать короткие пункты и попросить владельца повторить план." }
  ];
  const communicationOptions = clinicalDecisions.COMMUNICATION_OPTIONS;

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
    },
    {
      id: "giSupport",
      label: "Поддержка ЖКТ и домашнее наблюдение",
      note: "Регидратация, щадящий режим и четкие тревожные признаки.",
      fee: 250
    },
    {
      id: "urgentReferral",
      label: "Стабилизация и срочное направление",
      note: "Не задерживать пациента, если кабинета недостаточно для безопасной помощи.",
      fee: 180
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
      label: "Острое расстройство ЖКТ",
      note: "Короткий эпизод рвоты или диареи без признаков тяжелого состояния."
    },
    {
      id: "foreignBody",
      label: "Инородное тело ЖКТ",
      note: "Опасная версия рвоты и боли, которую важно учитывать."
    },
    {
      id: "urinaryObstruction",
      label: "Обструкция мочевыводящих путей",
      note: "Срочная версия жалобы «не ходит в туалет» у кота."
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
            id: "medications",
            label: "Что уже применяли дома?",
            answer: patient.flags.oldDrops
              ? "После уточнения владелец вспоминает: несколько дней капал оставшиеся с прошлого раза ушные капли, название и срок годности не проверял."
              : "До приема ушные препараты и антибиотики не применяли."
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
    gastroenteritis: {
      name: "Острое расстройство ЖКТ",
      short: "рвота или диарея",
      species: ["dog", "cat"],
      baseFee: 120,
      complaints: [
        "один-два раза вырвало",
        "стал хуже есть",
        "жидкий стул",
        "урчит живот",
        "недавно сменили корм",
        "мог стащить еду",
        "пьет воду"
      ],
      makeFlags() {
        return { trigger: pick(["резко сменили корм", "украл еду со стола", "получил новое лакомство"]), vomitCount: pick([1, 2]) };
      },
      anamnesis(patient) {
        return [
          { id: "start", label: "Когда началось и сколько эпизодов?", answer: `Началось сегодня, рвота была ${patient.flags.vomitCount || 1} раз.` },
          { id: "food", label: "Что ел в последние сутки?", answer: `Возможный пищевой фактор: ${patient.flags.trigger}.` },
          { id: "water", label: "Пьет и удерживает воду?", answer: "Воду пьет небольшими порциями и не срыгивает." },
          { id: "toilet", label: "Мочеиспускание сохранено?", answer: "Мочеиспускание есть, стул мягкий или жидкий." },
          { id: "danger", label: "Есть кровь, сильная боль или инородное тело?", answer: "Крови нет, сильной постоянной боли и известного инородного тела нет." }
        ];
      },
      temperature() { return "Температура в норме."; },
      mucous() { return "Слизистые розовые, умеренно влажные, тяжелого обезвоживания нет."; },
      local: {
        ears: "Уши без выраженных изменений.",
        abdomen: "Живот мягкий, умеренно чувствительный, без резкой локальной боли.",
        skin: "Кожа без значимых очагов.",
        gait: "Походка обычная, слабости нет.",
        head: "Голова без травм, сознание ясное."
      },
      microscopy() { return "Микроскопия материала из уха не относится к этой жалобе и не дает полезных данных."; },
      evaluate(patient, treatmentId) {
        if (treatmentId === "giSupport") return outcome("correct", 0.05, "Выбран безопасный поддерживающий план с контролем тревожных признаков.");
        if (treatmentId === "watchfulWaiting") return outcome("partial", 0.14, "Наблюдение возможно, но владельцу не хватает четкого плана поддержки.");
        if (treatmentId === "pancreatitisSupport") return outcome("partial", 0.09, "Поддержка поможет, но схема избыточна для неосложненного случая.");
        return outcome("wrong", 0.2, "Назначение не соответствует острой желудочно-кишечной жалобе.");
      }
    },
    urinaryObstruction: {
      name: "Обструкция мочевыводящих путей",
      short: "не может помочиться",
      species: ["cat"],
      baseFee: 150,
      complaints: [
        "как будто запор",
        "часто садится в лоток",
        "мяукает в туалете",
        "лижет под хвостом",
        "выходит по капле",
        "стал беспокойным",
        "прячется и не ест"
      ],
      makeFlags() { return { lastUrineHours: 12 }; },
      anamnesis(patient) {
        return [
          { id: "urine", label: "Моча или кал не выходят?", answer: "Владелец сначала говорит о запоре, но в лотке нет нормальной мочи, только несколько капель." },
          { id: "duration", label: "Когда последний раз нормально мочился?", answer: `Нормального мочеиспускания не было около ${patient.flags.lastUrineHours || 12} часов.` },
          { id: "sex", label: "Кот или кошка?", answer: "Это кот. Риск закупорки мочеиспускательного канала выше." },
          { id: "pain", label: "Есть боль, вокализация, рвота?", answer: "Кот беспокоится, мяукает в лотке и не дает трогать низ живота." },
          { id: "foodToilet", label: "Аппетит, вода, рвота?", answer: "Аппетит снизился, рвоты пока не было." }
        ];
      },
      temperature() { return "Температура пока в норме, но состояние потенциально срочное."; },
      mucous() { return "Слизистые розовые. Отсутствие изменений не исключает обструкцию."; },
      local: {
        ears: "Уши без выраженных изменений.",
        abdomen: "Внизу живота пальпируется напряженный болезненный мочевой пузырь. Осмотр нужно прекратить без лишнего давления.",
        skin: "Кожа без значимых очагов.",
        gait: "Движения скованные из-за боли, травмы конечностей нет.",
        head: "Сознание ясное, но кот беспокоен и болезненно реагирует."
      },
      microscopy() { return "Микроскопия ушного материала не относится к срочной жалобе и задерживает помощь."; },
      evaluate(patient, treatmentId) {
        if (treatmentId === "urgentReferral") return outcome("correct", 0.02, "Срочный пациент не задержан и направлен для катетеризации и мониторинга.");
        if (treatmentId === "watchfulWaiting") return outcome("wrong", 0.7, "Домашнее наблюдение при вероятной обструкции опасно.");
        return outcome("wrong", 0.48, "Назначение задерживает помощь при вероятной обструкции.");
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
    phase: "planning",
    day: 1,
    minute: DAY_START,
    dayEnd: STANDARD_DAY_END,
    money: 1350,
    reputation: 74,
    ownerTrust: 74,
    clinicalReliability: 74,
    awareness: 30,
    campaignFinance: { creditLimit: 2500, debt: 0, weeklyReview: null, closureRisk: "stable" },
    dailyLedger: [],
    equipmentCapabilities: {},
    demandState: null,
    campaignOutcome: null,
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
    expensesToday: 0,
    diagnosticRevenueToday: 0,
    microscopyToday: 0,
    arrivalsToday: 0,
    plannedArrivalsToday: 0,
    specialEventsToday: 0,
    handledSpecialEventsToday: 0,
    arrivalSchedule: [],
    departures: [],
    doctorScreenX: 440,
    doctorScreenY: 190,
    doctorRoute: [],
    doctorRouteIndex: 0,
    doctorMotion: "idle",
    doctorHoldUntil: 0,
    reputationStartToday: 74,
    reputationEvents: [],
    returnsToday: 0,
    mistakesToday: 0,
    pendingReturns: [],
    caseJournal: [],
    modalOpen: true,
    animationTime: 0,
    dayStarted: false,
    hoursMode: "standard",
    selectedDoctorId: campaign.doctors[0].id,
    doctors: campaign.doctors.map((doctor) => ({ ...doctor, shiftsWorked: 0, consecutiveShifts: 0, lastShiftDay: -1 })),
    lostToday: 0,
    goalStats: {},
    shiftExtended: false,
    chapterComplete: false,
    firstArrivalPaused: false,
    tutorialVisitId: null,
    tutorialStepIndex: 0,
    tutorialComplete: false,
    summaryTitle: "",
    summaryHtml: ""
  };

  function blockGameForSaveError(error) {
    gameSaveBlocked = true;
    state.paused = true;
    state.log = error?.name === "QuotaExceededError"
      ? "Сохранение не выполнено: в браузере закончилось место. Игра поставлена на паузу; освободите место и перезагрузите страницу."
      : "Сохранение не выполнено. Игра поставлена на паузу, чтобы не продолжать без подтвержденного сохранения.";
    if (el?.messageLog) el.messageLog.textContent = `${formatClinicTime(state.minute)} · ${state.log}`;
    document.body.dataset.saveError = "true";
  }

  function persistGameState(force = false) {
    if (gameSaveBlocked || !window.PET_CLINIC_GAME_STATE_SAVE || !window.localStorage) return;
    const now = Date.now();
    if (!force && now - lastGameSaveAt < 5000) return;
    try {
      window.PET_CLINIC_GAME_STATE_SAVE.save(window.localStorage, generatorRuntime.mode, state, {
        catalog: generatorRuntime.catalog
      });
      lastGameSaveAt = now;
    } catch (error) {
      blockGameForSaveError(error);
      console.error("Game state save failed and has been disabled for this session.", error);
    }
  }

  function restoreRuntimePatient(patient) {
    if (patient?.v2Visit && isTier01V2()) {
      patient.ownerProfile = window.PET_CLINIC_GAME_ADAPTER_V2.ownerProfileForVisit(patient.v2Visit);
    }
    return patient;
  }

  function restoreGameState() {
    if (!window.PET_CLINIC_GAME_STATE_SAVE || !window.localStorage) return false;
    try {
      const snapshot = window.PET_CLINIC_GAME_STATE_SAVE.load(window.localStorage, generatorRuntime.mode, {
        catalog: generatorRuntime.catalog
      });
      if (!snapshot) return "empty";
      Object.assign(state, snapshot.state);
      state.queue = Array.isArray(state.queue) ? state.queue : [];
      state.queue.forEach((patient) => {
        restoreRuntimePatient(patient);
        normalizeVisitPatient(patient);
        patient.selectedDiagnosisIds = Array.isArray(patient.selectedDiagnosisIds)
          ? patient.selectedDiagnosisIds
          : patient.selectedDiagnosisId ? [patient.selectedDiagnosisId] : [];
      });
      state.arrivalSchedule = Array.isArray(state.arrivalSchedule) ? state.arrivalSchedule : [];
      state.arrivalSchedule.forEach((arrival) => restoreRuntimePatient(arrival.template));
      state.departures = [];
      state.doctorRoute = [];
      state.doctorRouteIndex = 0;
      state.doctorMotion = "idle";
      state.doctorHoldUntil = 0;
      state.lastTick = 0;
      return "restored";
    } catch (error) {
      gameSaveBlocked = true;
      console.error("Incompatible game state was not loaded or overwritten.", error);
      state.log = "Сохранение этого режима несовместимо с текущей версией и не было перезаписано.";
      return "blocked";
    }
  }

  const canvas = document.getElementById("clinicCanvas");
  let ctx = canvas.getContext("2d");
  const portraitCanvas = document.getElementById("portraitCanvas");
  const portraitCtx = portraitCanvas.getContext("2d");
  const expandedClinicalStages = new Set();

  const el = {
    campaignProgress: document.getElementById("campaignProgress"),
    dayTitle: document.getElementById("dayTitle"),
    dayGoalsList: document.getElementById("dayGoalsList"),
    goalScore: document.getElementById("goalScore"),
    nextPatientCard: document.getElementById("nextPatientCard"),
    queueStrip: document.getElementById("queueStrip"),
    queueCountLabel: document.getElementById("queueCountLabel"),
    queueForecast: document.getElementById("queueForecast"),
    caseWindow: document.getElementById("caseWindow"),
    caseStage: document.getElementById("caseStage"),
    caseTitle: document.getElementById("caseTitle"),
    caseOwner: document.getElementById("caseOwner"),
    caseUrgencyBtn: document.getElementById("caseUrgencyBtn"),
    caseDuration: document.getElementById("caseDuration"),
    closeCaseBtn: document.getElementById("closeCaseBtn"),
    ownerComplaint: document.getElementById("ownerComplaint"),
    clinicalMap: document.getElementById("clinicalMap"),
    complaintSummary: document.getElementById("complaintSummary"),
    anamnesisSummary: document.getElementById("anamnesisSummary"),
    examSummary: document.getElementById("examSummary"),
    researchSummary: document.getElementById("researchSummary"),
    decisionSummary: document.getElementById("decisionSummary"),
    prescriptionsSummary: document.getElementById("prescriptionsSummary"),
    dischargeSummary: document.getElementById("dischargeSummary"),
    unknownList: document.getElementById("unknownList"),
    optionalUnknownList: document.getElementById("optionalUnknownList"),
    historyList: document.getElementById("historyList"),
    examList: document.getElementById("examList"),
    testList: document.getElementById("testList"),
    assessmentList: document.getElementById("assessmentList"),
    decisionReview: document.getElementById("decisionReview"),
    reviewSelectedDiagnosis: document.getElementById("reviewSelectedDiagnosis"),
    reviewConfirmed: document.getElementById("reviewConfirmed"),
    reviewUncertain: document.getElementById("reviewUncertain"),
    reviewSupporting: document.getElementById("reviewSupporting"),
    reviewMissing: document.getElementById("reviewMissing"),
    reviewAssessment: document.getElementById("reviewAssessment"),
    reviewTreatmentCoverage: document.getElementById("reviewTreatmentCoverage"),
    reviewUnnecessaryTreatment: document.getElementById("reviewUnnecessaryTreatment"),
    reviewClinicalSafety: document.getElementById("reviewClinicalSafety"),
    reviewCommunicationQuality: document.getElementById("reviewCommunicationQuality"),
    reviewOwnerDecision: document.getElementById("reviewOwnerDecision"),
    planList: document.getElementById("planList"),
    patientFacts: document.getElementById("patientFacts"),
    stressMeter: document.getElementById("stressMeter"),
    trustMeter: document.getElementById("trustMeter"),
    tensionMeter: document.getElementById("tensionMeter"),
    irritationMeter: document.getElementById("irritationMeter"),
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
    finishVisitBtn: document.getElementById("finishVisitBtn"),
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
    ownerTrustTitle: document.getElementById("ownerTrustTitle"),
    clinicalReliabilityRow: document.getElementById("clinicalReliabilityRow"),
    clinicalReliabilityValue: document.getElementById("clinicalReliabilityValue"),
    clinicalReliabilityMeterTrack: document.getElementById("clinicalReliabilityMeterTrack"),
    clinicalReliabilityMeter: document.getElementById("clinicalReliabilityMeter"),
    queueValue: document.getElementById("queueValue"),
    messageLog: document.getElementById("messageLog"),
    developerBtn: document.getElementById("developerBtn"),
    developerPanel: document.getElementById("developerPanel"),
    closeDeveloperBtn: document.getElementById("closeDeveloperBtn"),
    developerData: document.getElementById("developerData"),
    shiftWindow: document.getElementById("shiftWindow"),
    shiftTitle: document.getElementById("shiftTitle"),
    shiftBriefing: document.getElementById("shiftBriefing"),
    shiftForecast: document.getElementById("shiftForecast"),
    standardHoursLabel: document.getElementById("standardHoursLabel"),
    doctorOptions: document.getElementById("doctorOptions"),
    startShiftBtn: document.getElementById("startShiftBtn"),
    closeShiftWindow: document.getElementById("closeShiftWindow"),
    closeShiftSummary: document.getElementById("closeShiftSummary"),
    extendShiftBtn: document.getElementById("extendShiftBtn"),
    transferQueueBtn: document.getElementById("transferQueueBtn"),
    finishShiftBtn: document.getElementById("finishShiftBtn"),
    closeShiftBtn: document.getElementById("closeShiftBtn"),
    doctorHudName: document.getElementById("doctorHudName"),
    doctorFatigue: document.getElementById("doctorFatigue"),
    doctorFatigueMeter: document.getElementById("doctorFatigueMeter"),
    doctorFatigueEffect: document.getElementById("doctorFatigueEffect"),
    doctorFatigueForecast: document.getElementById("doctorFatigueForecast"),
    devResolvePatientBtn: document.getElementById("devResolvePatientBtn"),
    devFinishDayBtn: document.getElementById("devFinishDayBtn"),
    tutorialGuide: document.getElementById("tutorialGuide"),
    tutorialTitle: document.getElementById("tutorialTitle"),
    tutorialText: document.getElementById("tutorialText"),
    tutorialResult: document.getElementById("tutorialResult")
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

  function formatClinicTime(minute) {
    if (minute <= state.dayEnd) return formatTime(minute);
    const overtime = Math.max(0, Math.floor(minute - state.dayEnd));
    const hours = Math.floor(overtime / 60);
    const minutes = overtime % 60;
    const parts = [];
    if (hours) parts.push(`${hours} ч`);
    if (minutes || !parts.length) parts.push(`${minutes} мин`);
    return `${formatTime(state.dayEnd)} + ${parts.join(" ")}`;
  }

  function formatMoney(value) {
    return Math.round(value).toLocaleString("ru-RU");
  }

  function diseaseFor(patient) {
    if (patient?.v2Visit) return window.PET_CLINIC_GAME_ADAPTER_V2.diseaseForVisit(patient.v2Visit);
    return diseases[patient.diseaseId];
  }

  function diagnosisLabel(id) {
    const diagnosis = diagnosisOptions.find((item) => item.id === id);
    if (diagnosis) return diagnosis.label;
    const patient = activePatient();
    if (patient?.v2Visit && generatorRuntime.catalog) {
      const contextualDiagnosis = window.PET_CLINIC_GAME_ADAPTER_V2
        .diagnosisOptionsFor(patient, generatorRuntime.catalog)
        .find((item) => item.id === id);
      if (contextualDiagnosis) return contextualDiagnosis.label;
    }
    if (generatorRuntime.catalog) {
      if (id?.startsWith("distractor:")) return generatorRuntime.catalog.casesById[id.slice(11)]?.preliminaryDiagnosisLabel || "";
      return generatorRuntime.catalog.casesById[id]?.preliminaryDiagnosisLabel || "";
    }
    return "";
  }

  function communicationLabel(id) {
    const communication = [...communicationOptions, ...legacyCommunicationOptions].find((item) => item.id === id);
    return communication ? communication.label : "";
  }

  function activePatient() {
    return state.queue.find((patient) => patient.id === state.activeId) || null;
  }

  function normalizeVisitPatient(patient) {
    if (!patient || !visitState) return patient;
    const needsClinicalRecord = !patient.clinicalRecord;
    const inConsultation = patient.id === state.activeId
      && (patient.motion === "inCabinet" || patient.motion === "toCabinet");
    visitState.normalizePatient(patient, { inConsultation });
    if (!Array.isArray(patient.diagnosticDecisions)) patient.diagnosticDecisions = [];
    if (needsClinicalRecord) rebuildClinicalRecord(patient);
    return patient;
  }

  function rebuildClinicalRecord(patient) {
    const disease = diseaseFor(patient);
    disease.anamnesis(patient)
      .filter((question) => patient.asked?.[question.id])
      .forEach((question) => recordClinical(patient, "history", question.answer));
    if (patient.generalExamDone) {
      recordClinical(patient, "physicalExam", patient.v2Visit
        ? patient.v2Visit.medicalContent.generalExam.findings.map((item) => item.text)
        : [disease.temperature(patient), disease.mucous(patient)]);
      assessClinicalUrgency(patient);
    }
    if (patient.localUsed > 0) {
      recordClinical(patient, "physicalExam", patient.v2Visit
        ? patient.v2Visit.medicalContent.targetExam.findings.map((item) => item.text)
        : Object.keys(patient.localDone || {}).map((id) => {
          const finding = disease.local[id];
          return typeof finding === "function" ? finding(patient) : finding;
        }).filter(Boolean));
    }
    if (patient.sampleTaken) {
      recordClinical(patient, "diagnosticTests", patient.v2Visit
        ? window.PET_CLINIC_GAME_ADAPTER_V2.sampleResultFor(patient)
        : "Материал для исследования взят и промаркирован.");
    }
    if (patient.microscopyDone) {
      const completedTest = patient.v2Visit
        ? diagnosticOptionsForPatient(patient).find((test) => test.id === patient.executedDiagnosticTestId)
          || diagnosticOptionsForPatient(patient)[0]
        : null;
      recordClinical(patient, "diagnosticTests", patient.v2Visit ? completedTest?.resultText : disease.microscopy(patient));
    }
    if (patient.selectedDiagnosisId) {
      recordClinical(patient, "clinicalInterpretation", `Основной диагноз: ${diagnosisLabel(patient.selectedDiagnosisId)}.`);
    }
    if (patient.selectedCommunicationId) {
      recordClinical(patient, "carePlan", patient.v2Visit
        ? patient.v2Visit.medicalContent.ownerExplanation.plan
        : communicationLabel(patient.selectedCommunicationId));
    }
  }

  function waitingPatients() {
    return visitState ? visitState.waitingPatients(state.queue) : state.queue.slice();
  }

  function recordClinical(patient, section, value) {
    if (visitState) visitState.record(patient, section, value);
  }

  function clinicalAssessmentFor(patient) {
    const severity = patient.v2Visit?.medicalContent?.severity || patient.urgency;
    if (severity === "emergency") return "emergency";
    if (severity === "urgent") return "urgent";
    if (severity === "priority") return "priority";
    return "routine";
  }

  function assessClinicalUrgency(patient) {
    if (!patient?.generalExamDone || !visitState) return;
    const urgency = visitState.assessUrgency(patient, clinicalAssessmentFor(patient));
    patient.selectedUrgency = urgency === "urgent" || urgency === "emergency" ? "urgent" : "routine";
  }

  function clinicalUrgencyLabel(patient) {
    const labels = {
      not_assessed: "не оценена",
      routine: "обычная",
      priority: "приоритетная",
      urgent: "срочная",
      emergency: "экстренная"
    };
    return labels[patient.clinicalUrgency || "not_assessed"];
  }

  function requiredHistoryComplete(patient) {
    if (!patient?.v2Visit) return Object.keys(patient?.asked || {}).length > 0;
    return patient.v2Visit.medicalContent.historyQuestions
      .filter((question) => question.required)
      .every((question) => patient.asked[question.id]);
  }

  function guidedVisitPosition(patient) {
    const hasSample = Boolean(patient.v2Visit?.medicalContent.sampleActions.length);
    const hasTest = Boolean(patient.v2Visit && diagnosticOptionsForPatient(patient).length);
    const historyComplete = requiredHistoryComplete(patient);
    const examComplete = patient.generalExamDone && patient.localUsed > 0;
    const researchComplete = hasTest ? diagnosticFlowResolved(patient) : hasSample ? patient.sampleTaken : examComplete;
    const diagnosisComplete = Boolean(patient.selectedDiagnosisId && patient.explanationDone);
    const prescriptionComplete = Boolean(patient.carePlanAgreed);
    let stage = "anamnesis";
    let action = "history";
    if (historyComplete && !patient.generalExamDone) {
      stage = "exam";
      action = "general_exam";
    } else if (historyComplete && patient.generalExamDone && patient.localUsed === 0) {
      stage = "exam";
      action = "target_exam";
    } else if (examComplete && !researchComplete && hasSample && !patient.sampleTaken) {
      stage = "research";
      action = "sample";
    } else if (examComplete && !researchComplete && hasTest && !patient.microscopyDone) {
      stage = "research";
      action = "diagnostic_test";
    } else if (researchComplete && !patient.selectedDiagnosisId) {
      stage = "decision";
      action = "preliminary_diagnosis";
    } else if (patient.selectedDiagnosisId && !patient.explanationDone) {
      stage = "decision";
      action = "explanation";
    } else if (diagnosisComplete && !prescriptionComplete) {
      stage = "prescriptions";
      action = "plan";
    } else if (prescriptionComplete) {
      stage = "discharge";
      action = "finish";
    }
    return {
      stage,
      action,
      complete: {
        complaint: true,
        anamnesis: historyComplete,
        exam: examComplete,
        research: researchComplete,
        decision: diagnosisComplete,
        prescriptions: prescriptionComplete,
        discharge: patient.flowState === "completed"
      }
    };
  }

  function compactClinicalSummary(prefix, values, emptyText) {
    const clean = (values || []).filter(Boolean);
    return clean.length ? `${prefix} ${clean.slice(0, 3).join(" ")}` : emptyText;
  }

  function renderGuidedClinicalMap(patient, position) {
    const selectedDiagnosis = diagnosisLabel(patient.selectedDiagnosisId);
    el.complaintSummary.textContent = patient.v2Visit.complaint.text;
    el.anamnesisSummary.textContent = compactClinicalSummary("Анамнез собран.", patient.clinicalRecord.history, "Анамнез ещё не собран.");
    el.examSummary.textContent = compactClinicalSummary("Осмотр выполнен.", patient.clinicalRecord.physicalExam, "Осмотр ещё не выполнен.");
    el.researchSummary.textContent = patient.diagnosticUncertainty?.text
      || compactClinicalSummary("Исследования выполнены.", patient.clinicalRecord.diagnosticTests, "Исследования ещё не выполнены.");
    el.decisionSummary.textContent = selectedDiagnosis
      ? `${patient.explanationDone ? "Результат объяснён владельцу." : "Предварительный диагноз выбран."} ${selectedDiagnosis}.`
      : "Предварительный диагноз ещё не выбран.";
    el.prescriptionsSummary.textContent = compactClinicalSummary("Назначения сделаны.", patient.clinicalRecord.carePlan, "Назначения ещё не сделаны.");
    el.dischargeSummary.textContent = patient.carePlanAgreed
      ? "Карта приёма заполнена. Пациент готов к выписке."
      : "Выписка станет доступна после назначений.";
    const order = ["complaint", "anamnesis", "exam", "research", "decision", "prescriptions", "discharge"];
    const currentIndex = order.indexOf(position.stage);
    document.querySelectorAll(".case-stage-card").forEach((card) => {
      const stage = card.dataset.caseStage;
      const complete = Boolean(position.complete[stage]);
      const current = stage === position.stage;
      card.classList.toggle("complete", complete);
      card.classList.toggle("current", current);
      card.classList.toggle("future", order.indexOf(stage) > currentIndex && !complete);
      card.classList.toggle("expanded", expandedClinicalStages.has(stage));
      const status = card.querySelector(".stage-state");
      if (status) status.textContent = current ? "Текущий этап" : complete ? "Завершено" : "Впереди";
      const detail = card.querySelector(".stage-detail");
      if (detail) detail.textContent = expandedClinicalStages.has(stage) ? "Свернуть" : "Показать подробно";
    });
  }

  function guidedActionButton(action) {
    return {
      history: el.anamnesisBtn,
      general_exam: el.generalExamBtn,
      target_exam: el.localExamBtn,
      sample: el.sampleBtn,
      diagnostic_test: el.microscopyBtn,
      preliminary_diagnosis: el.diagnosisBtn,
      explanation: el.communicationBtn,
      plan: el.treatmentBtn,
      finish: el.finishVisitBtn
    }[action] || null;
  }

  function uniqueText(values) {
    return [...new Set((values || []).filter(Boolean))];
  }

  function diagnosisAssessmentLabel(value) {
    return {
      justified: "обоснованно",
      acceptable: "допустимо при имеющихся данных",
      insufficient: "недостаточно данных",
      contradictory: "противоречит полученным данным",
      unsafe: "небезопасно"
    }[value] || "недостаточно данных";
  }

  function diagnosisReviewFor(patient) {
    if (!patient?.v2Visit || !patient.selectedDiagnosisId) return null;
    const options = window.PET_CLINIC_GAME_ADAPTER_V2.diagnosisOptionsFor(patient, generatorRuntime.catalog);
    const selectedIds = patient.selectedDiagnosisIds?.length ? patient.selectedDiagnosisIds : [patient.selectedDiagnosisId];
    const selected = selectedIds.map((id) => options.find((option) => option.id === id)).filter(Boolean);
    if (!selected.length) return null;
    const rank = { justified: 0, acceptable: 1, insufficient: 2, contradictory: 3, unsafe: 4 };
    const assessment = selected.reduce((worst, option) => (rank[option.assessment] > rank[worst] ? option.assessment : worst), "justified");
    const supporting = uniqueText(selected.flatMap((option) => option.supportingEvidence || []));
    const missing = uniqueText(selected.flatMap((option) => [
      ...(option.missingEvidence || []),
      ...(option.contradictingEvidence || []).map((value) => `Противоречит: ${value}`)
    ]));
    const uncertain = uniqueText(selected.flatMap((option) => (
      option.uncertainEvidence?.length ? option.uncertainEvidence : (option.missingEvidence || [])
    )));
    const confirmed = uniqueText([
      ...patient.clinicalRecord.diagnosticTests,
      ...patient.clinicalRecord.physicalExam.slice(-1)
    ]).slice(0, 3);
    return {
      selected: selected.map((option) => option.label).join(" + "),
      confirmed,
      uncertain,
      supporting,
      missing,
      assessment: diagnosisAssessmentLabel(assessment)
    };
  }

  function ownerStatusFor(patient) {
    if (patient.carePlanAgreed) {
      if (patient.ownerPlanDecision?.decisionText) return patient.ownerPlanDecision.decisionText;
      if (patient.selectedTreatment?.planType === "owner_refusal") return "владелец отказался";
      const total = diseaseFor(patient).baseFee + (patient.selectedTreatment?.fee || 0);
      if (total > patient.budget) return "принял назначения частично";
      return "назначения выданы";
    }
    if (patient.explanationDone) return "результат объяснён";
    if (patient.lastDiagnosticOwnerDecision === "asks_cost") return "владелец спрашивает стоимость";
    if (patient.lastDiagnosticOwnerDecision === "requests_cheaper_option") return "владелец просит более доступный вариант";
    if (patient.lastDiagnosticOwnerDecision === "refused") return "владелец отказался от исследования";
    if (patient.lastDiagnosticOwnerDecision === "delayed") return "владелец отложил решение";
    if (patient.sampleTaken || patient.microscopyDone) return "согласие на исследование получено";
    return "требуется уточнить";
  }

  function patientStateLabel(patient) {
    const labels = {
      requires_assessment: "требует оценки",
      stable: "стабильное",
      requires_attention: "требует внимания",
      urgent: "требует срочной помощи",
      critical: "критическое"
    };
    return labels[patient.patientState || "requires_assessment"];
  }

  function tutorialDefinition() {
    return isTier01V2() ? generatorRuntime.catalog.tutorial : null;
  }

  function tutorialPatient(patient = activePatient()) {
    return Boolean(patient && state.tutorialVisitId === patient.v2Visit?.visitId && !state.tutorialComplete);
  }

  function currentTutorialStep() {
    return tutorialDefinition()?.steps[state.tutorialStepIndex] || null;
  }

  function tutorialStepCopy(patient, step) {
    if (!step) return null;
    if (step.id === "sample") {
      const action = patient.v2Visit?.medicalContent?.sampleActions?.[0];
      return {
        title: action?.label || "Возьмите материал",
        text: "Осмотр показывает, какие изменения есть, но не всегда позволяет определить их причину. Выполните предусмотренное случаем действие."
      };
    }
    return { title: step.title, text: step.text };
  }

  function activateTutorial(patient) {
    const tutorial = tutorialDefinition();
    if (!tutorial || state.day !== 1 || state.tutorialComplete || state.tutorialVisitId) return;
    if (!tutorial.eligibleCaseIds.includes(patient.v2Visit?.caseId)) return;
    state.tutorialVisitId = patient.v2Visit.visitId;
    state.tutorialStepIndex = 0;
    patient.protectedFromLeaving = true;
    state.speed = 1;
  }

  function tutorialAllows(action) {
    const step = currentTutorialStep();
    if (!step) return true;
    const map = {
      history: ["history", "history_questions_required"],
      general_exam: ["general_exam"],
      target_exam: ["target_exam"],
      sample: ["sample"],
      diagnostic_test: ["diagnostic_test"],
      preliminary_diagnosis: ["preliminary_diagnosis"],
      explanation: ["explanation"],
      plan: ["plan"],
      finish: ["finish"]
    };
    return (map[action] || []).some((id) => step.enabledActions.includes(id));
  }

  function advanceTutorial(expectedStepId, result = "") {
    if (currentTutorialStep()?.id !== expectedStepId) return;
    const patient = activePatient();
    if (patient && result) patient.tutorialResult = result;
    state.tutorialStepIndex += 1;
    renderCase();
  }

  function currentPlan() {
    if (generatorRuntime.mode === "legacy-v1") {
      return generatorRuntime.generator.getOrGenerateDay(state.day, { caseJournal: state.caseJournal });
    }
    if (isTier01V2()) {
      let day;
      try {
        day = generatorRuntime.generator.getOrGenerateDay(state.day);
      } catch (error) {
        blockGameForSaveError(error);
        console.error("Generator state could not be persisted.", error);
        return null;
      }
      return day ? window.PET_CLINIC_GAME_ADAPTER_V2.planFromDay(day, generatorRuntime.catalog) : null;
    }
    const basePlan = campaign.days.find((plan) => plan.day === state.day) || null;
    if (!basePlan || state.day !== 2) return basePlan;
    const completedDayOne = state.caseJournal.filter((item) => item.day === 1);
    if (!completedDayOne.length) {
      const fallbackPatient = {
        ...basePlan.patients[0],
        source: "story",
        bookingLabel: "скрытые подробности",
        returnVisit: false,
        animal: "Рекс",
        owner: "Лебедев",
        profileId: "careless"
      };
      return {
        ...basePlan,
        title: basePlan.fallbackTitle,
        briefing: basePlan.fallbackBriefing,
        goals: [
          { id: "hiddenFact", label: "Выяснить скрытый факт", target: 1 },
          ...basePlan.goals.filter((goal) => goal.id !== "returns")
        ],
        patients: [fallbackPatient, ...basePlan.patients.slice(1)]
      };
    }
    const previous = completedDayOne[0];
    return {
      ...basePlan,
      patients: [{
        ...basePlan.patients[0],
        diseaseId: previous.diseaseId || basePlan.patients[0].diseaseId,
        animal: previous.animal,
        owner: previous.owner,
        species: previous.species,
        sex: previous.sex || basePlan.patients[0].sex,
        ageYears: previous.ageYears || basePlan.patients[0].ageYears
      }, ...basePlan.patients.slice(1)]
    };
  }

  function currentDoctor() {
    return state.doctors.find((doctor) => doctor.id === state.selectedDoctorId) || state.doctors[0];
  }

  function currentDailyLedger(create = false) {
    if (!isTier01V2()) return null;
    let ledger = state.dailyLedger.find((item) => item.day === state.day);
    if (!ledger && create) {
      const doctor = currentDoctor();
      ledger = campaignMechanics.createDailyLedger({
        day: state.day,
        ownerTrust: state.ownerTrust,
        clinicalReliability: state.clinicalReliability,
        doctorId: doctor?.id,
        fatigue: doctor?.fatigue
      });
      state.dailyLedger.push(ledger);
    }
    return ledger || null;
  }

  function adjustedActionMinutes(minutes) {
    const doctor = currentDoctor();
    if (isTier01V2() && campaignMechanics) {
      return campaignMechanics.adjustedActionMinutes(minutes, doctor.fatigue);
    }
    const multiplier = 1 + doctor.fatigue / 180;
    return Math.max(1, Math.round(minutes * multiplier));
  }

  function fatigueForecastFor(doctor = currentDoctor(), plan = currentPlan()) {
    if (!isTier01V2() || !campaignMechanics) return null;
    const remainingShiftMinutes = Math.max(0, state.dayEnd - state.minute);
    const waitingWork = waitingPatients().length * 24;
    const scheduledWork = state.dayStarted
      ? state.arrivalSchedule.length * 24
      : (plan?.patients?.length || 0) * 24;
    const closingLoad = 12
      + (state.hoursMode === "extended" ? 10 : 0)
      + (state.shiftExtended ? 8 : 0)
      + Math.max(0, doctor.consecutiveShifts - 1) * 5;
    return campaignMechanics.forecastFatigue({
      fatigue: doctor.fatigue,
      remainingShiftMinutes,
      expectedActiveWorkMinutes: waitingWork + scheduledWork,
      closingLoad
    });
  }

  function maxAllowedSpeed() {
    if (state.day === 1 && state.treatedToday === 0) return 1;
    if (state.day <= campaignDayCount() && waitingPatients().length > 0) return 2;
    return 4;
  }

  function cycleSpeed() {
    const maxSpeed = maxAllowedSpeed();
    if (maxSpeed === 1) {
      state.speed = 1;
      setLog("На первом обучающем приеме доступна только скорость 1x.");
      renderHud();
      return;
    }
    const candidates = maxSpeed === 2 ? [1, 2] : [1, 2, 4];
    const currentIndex = candidates.indexOf(state.speed);
    state.speed = candidates[(currentIndex + 1) % candidates.length];
    renderHud();
  }

  function addDoctorFatigue(amount) {
    const doctor = currentDoctor();
    doctor.fatigue = clamp(doctor.fatigue + amount, 0, 100);
  }

  function incrementGoal(id, amount = 1) {
    state.goalStats[id] = (state.goalStats[id] || 0) + amount;
  }

  function goalProgress(goal) {
    return clamp(state.goalStats[goal.id] || 0, 0, goal.target);
  }

  function goalComplete(goal) {
    return goalProgress(goal) >= goal.target;
  }

  function setLog(text) {
    state.log = text;
    el.messageLog.textContent = text;
  }

  function isPatientInConsult(patient) {
    return visitState ? visitState.isInConsultation(patient) : Boolean(patient && patient.flowState === "in_consultation");
  }

  function isReadingInterfaceOpen() {
    return !el.caseWindow.classList.contains("hidden")
      || !el.choiceWindow.classList.contains("hidden")
      || !el.shiftWindow.classList.contains("hidden")
      || !el.closeShiftWindow.classList.contains("hidden")
      || !el.summaryWindow.classList.contains("hidden");
  }

  function waitingMood(patient) {
    return clamp(100 - (patient.age / patient.patience) * 100, 0, 100);
  }

  function waitingObservation(patient) {
    if (patient.waitingStage >= 4) return "Владелец собирается уйти — требуется реакция";
    if (patient.waitingStage === 3) return "Владелец недоволен задержкой";
    if (patient.waitingStage === 2) return "Владелец заметно теряет терпение";
    if (patient.waitingStage === 1) return patient.anxiety > patient.irritation
      ? "Владелец беспокоится о животном"
      : "Владелец начинает смотреть на часы";
    return "Владелец ожидает спокойно";
  }

  function updateWaitingState(patient, minutes) {
    if (patient.age > patient.patience * 0.35) {
      adjustOwnerState(patient, minutes * 0.18, minutes * 0.28);
    }
    const ratio = patient.age / patient.patience;
    const nextStage = ratio >= 0.92 ? 4 : ratio >= 0.75 ? 3 : ratio >= 0.58 ? 2 : ratio >= 0.4 ? 1 : 0;
    if (nextStage <= patient.waitingStage) return;
    patient.waitingStage = nextStage;
    const messages = {
      1: `${patient.owner} начинает беспокоиться во время ожидания.`,
      2: `${patient.animal} ждет уже ${Math.round(patient.age)} минут. Владелец теряет терпение.`,
      3: `${patient.owner} недоволен задержкой и ждет объяснения.`,
      4: `${patient.owner} собирается уйти. Требуется немедленная реакция.`
    };
    setLog(messages[nextStage]);
    if (nextStage >= 4) {
      state.speed = 1;
      state.paused = true;
    }
  }

  function adjustTrust(patient, delta) {
    patient.trust = clamp(patient.trust + delta, 0, 100);
  }

  function adjustOwnerState(patient, anxietyDelta = 0, irritationDelta = 0) {
    patient.anxiety = clamp(patient.anxiety + anxietyDelta, 0, 100);
    patient.irritation = clamp(patient.irritation + irritationDelta, 0, 100);
  }

  function changeReputation(delta, reason) {
    if (isTier01V2()) {
      changeOwnerTrust(delta, reason);
      return;
    }
    const before = state.reputation;
    state.reputation = clamp(state.reputation + delta, 0, 100);
    const applied = state.reputation - before;
    if (Math.abs(applied) < 0.01) return;
    state.reputationEvents.push({ delta: applied, reason });
  }

  function reputationDeltaToday() {
    if (isTier01V2()) {
      const ledger = currentDailyLedger();
      return state.ownerTrust - (ledger?.ownerTrustStart ?? state.ownerTrust);
    }
    return state.reputation - state.reputationStartToday;
  }

  function changeOwnerTrust(delta, reason) {
    const before = state.ownerTrust;
    state.ownerTrust = clamp(state.ownerTrust + delta, 0, 100);
    state.reputation = state.ownerTrust;
    const applied = state.ownerTrust - before;
    if (Math.abs(applied) < 0.01) return;
    const ledger = currentDailyLedger(true);
    ledger.ownerTrustEnd = state.ownerTrust;
    ledger.ownerTrustEvents.push({ delta: applied, reason });
  }

  function changeClinicalReliability(delta, reason) {
    if (!isTier01V2()) {
      changeReputation(delta, reason);
      return;
    }
    const before = state.clinicalReliability;
    state.clinicalReliability = clamp(state.clinicalReliability + delta, 0, 100);
    const applied = state.clinicalReliability - before;
    if (Math.abs(applied) < 0.01) return;
    const ledger = currentDailyLedger(true);
    ledger.clinicalReliabilityEnd = state.clinicalReliability;
    ledger.clinicalReliabilityEvents.push({ delta: applied, reason });
  }

  function spendVisitTime(patient, minutes) {
    if (!patient) return;
    patient.visitTimeUsed += minutes;
    if (!patient.overtimeWarned && patient.visitTimeUsed > patient.visitTimeLimit) {
      patient.overtimeWarned = true;
      adjustTrust(patient, -6);
      adjustOwnerState(patient, 7, 11);
      patient.findings.push("Прием затянулся: владелец начинает уставать от долгого процесса.");
    }
  }

  function createPatient(forcedDiseaseId, isReturn, overrides = {}) {
    const diseaseId = forcedDiseaseId || pick(diseaseIds);
    const disease = overrides.v2Visit
      ? window.PET_CLINIC_GAME_ADAPTER_V2.diseaseForVisit(overrides.v2Visit)
      : diseases[diseaseId];
    const species = overrides.species || pick(disease.species);
    const flags = { ...(disease.makeFlags ? disease.makeFlags() : {}), ...(overrides.flags || {}) };
    const complaints = overrides.complaints || sample(disease.complaints, 3);
    const profile = overrides.ownerProfile || ownerProfiles.find((item) => item.id === overrides.profileId) || pick(ownerProfiles);
    const patient = {
      id: state.nextPatientId,
      owner: overrides.owner || pick(owners),
      ownerProfile: profile,
      budget: profile.budget + Math.round((Math.random() - 0.5) * 120),
      animal: overrides.animal || pick(speciesNames[species]),
      species,
      ageYears: overrides.ageYears || (species === "rabbit" ? pick([1, 2, 3, 4, 5]) : pick([1, 2, 3, 4, 6, 8, 10])),
      sex: overrides.sex || pick(["самец", "самка"]),
      diseaseId,
      v2Visit: overrides.v2Visit || null,
      flags,
      complaints,
      ownerLead: overrides.ownerLead || "",
      urgency: overrides.urgency || "routine",
      selectedUrgency: null,
      clinicalUrgency: "not_assessed",
      patientState: "requires_assessment",
      flowState: overrides.flowState || "arrived",
      age: 0,
      patience: clamp(30 + profile.visitLimit * 0.35 + (Math.random() - 0.5) * 8, 34, 58),
      mood: 100,
      trust: clamp(
        profile.trust
          + (isTier01V2() ? (state.ownerTrust - 74) * 0.25 : 0)
          + Math.round((Math.random() - 0.5) * 10),
        12,
        95
      ),
      anxiety: clamp(profile.anxiety + Math.round((Math.random() - 0.5) * 8), 8, 96),
      irritation: clamp((profile.id === "conflict" ? 58 : profile.id === "internet" ? 42 : 16) + Math.round((Math.random() - 0.5) * 8), 4, 90),
      visitTimeUsed: 0,
      visitTimeLimit: profile.visitLimit,
      overtimeWarned: false,
      stress: clamp(18 + Math.round(profile.anxiety * 0.22), 18, 48),
      dxPoints: 0,
      localUsed: 0,
      findings: [],
      clinicalRecord: visitState.createClinicalRecord(),
      asked: {},
      localDone: {},
      generalExamDone: false,
      sampleTaken: false,
      budgetAsked: false,
      temperatureDone: false,
      mucousDone: false,
      microscopyDone: false,
      selectedDiagnosisId: null,
      selectedDiagnosisIds: Array.isArray(overrides.v2Visit?.selectedDiagnosisIds)
        ? [...overrides.v2Visit.selectedDiagnosisIds]
        : [],
      selectedCommunicationId: null,
      explanationDone: false,
      selectedTreatmentId: null,
      selectedTreatment: null,
      carePlanAgreed: false,
      controlGoalCredited: false,
      tutorialResult: "",
      returnVisit: Boolean(isReturn || overrides.returnVisit),
      eventLabel: overrides.eventLabel || "",
      bookingLabel: overrides.bookingLabel || disease.short,
      source: overrides.source || "booked",
      waitingStage: 0,
      protectedFromLeaving: false,
      completeExamCredited: false,
      screenX: 932,
      screenY: 675,
      motion: "arriving",
      routeIndex: 0,
      route: [[932, 620], [932, 410], [760, 410], [760, 360], [610, 360], [610, 410]]
    };
    state.nextPatientId += 1;
    patient.findings.push(isReturn
      ? "Повторное обращение: владелец говорит, что прошлое лечение не помогло."
      : `Жалобы владельца: ${complaints.join(", ")}.`);
    normalizeVisitPatient(patient);
    return patient;
  }

  function spawnPatient(forcedDiseaseId, isReturn, overrides = {}) {
    if (state.queue.length >= 12 && !isReturn) return;
    const isFirstArrival = state.arrivalsToday === 0;
    const patient = createPatient(forcedDiseaseId, isReturn, { ...overrides, flowState: "arrived" });
    patient.protectedFromLeaving = state.day === 1 && isFirstArrival;
    state.queue.push(patient);
    state.arrivalsToday += 1;
    if (patient.eventLabel) state.specialEventsToday += 1;
    if (state.day <= campaignDayCount()) state.speed = 1;
    if ((state.day === 1 && isFirstArrival) || patient.urgency === "urgent" || patient.eventLabel) {
      state.paused = true;
      state.firstArrivalPaused = state.firstArrivalPaused || isFirstArrival;
    }
    setLog(patient.eventLabel
      ? `Событие: ${patient.eventLabel}. Привезли пациента ${patient.animal}.`
      : isReturn
        ? `${patient.owner} вернулся с ${patient.animal}: прошлое лечение не помогло.`
        : `Новый пациент: ${patient.animal}, ${speciesLabels[patient.species]}.`);
    renderAll();
    persistGameState(true);
  }

  function buildArrivalSchedule(plan) {
    if (!plan) return [];
    const schedule = plan.patients.map((template, index) => ({
      minute: template.arrivalMinute || DAY_START + 20 + index * 65,
      template: { ...template, flowState: "scheduled" }
    }));
    state.plannedArrivalsToday = schedule.length;
    return schedule.sort((left, right) => left.minute - right.minute);
  }

  function passTime(minutes, options = {}) {
    if (state.modalOpen) return;
    const adjusted = options.rawTime ? Math.max(1, Math.round(minutes)) : adjustedActionMinutes(minutes);
    const patientInConsult = activePatient();
    if (options.trackVisit !== false && isPatientInConsult(patientInConsult)) {
      spendVisitTime(patientInConsult, adjusted);
    }
    if (options.doctorWork !== false) addDoctorFatigue(adjusted * 0.08);
    state.minute += adjusted;
    state.spawnMeter += adjusted;
    state.queue.forEach((patient) => {
      if (isPatientInConsult(patient)) return;
      patient.age += adjusted;
      patient.mood = waitingMood(patient);
      updateWaitingState(patient, adjusted);
    });
    removeLostPatients();
    maybeSpawn();
    if (state.minute >= state.dayEnd) {
      requestShiftClose(true);
    }
    renderAll();
    persistGameState(true);
  }

  function maybeSpawn() {
    if (state.day <= campaignDayCount()) {
      while (state.arrivalSchedule.length && state.arrivalSchedule[0].minute <= state.minute) {
        const plan = currentPlan();
        if (plan && waitingPatients().length >= plan.maxWaiting) break;
        const arrival = state.arrivalSchedule.shift();
        const template = arrival.template || {};
        spawnPatient(arrival.diseaseId || template.diseaseId, Boolean(template.returnVisit), template);
      }
      return;
    }
    const interval = clamp(72 - state.day * 4 - state.reputation * 0.16, 36, 78);
    while (state.spawnMeter >= interval) {
      state.spawnMeter -= interval;
      spawnPatient();
    }
  }

  function removeLostPatients() {
    const before = state.queue.length;
    state.queue = state.queue.filter((patient) => {
      const lost = visitState.WAITING_STATES.has(patient.flowState || "waiting")
        && !patient.protectedFromLeaving
        && patient.age > patient.patience;
      if (lost) {
        patient.flowState = "left";
        changeReputation(-3, "владелец ушел из очереди");
        state.lostToday += 1;
        state.goalStats.noLost = 0;
        patient.motion = "leaving";
        patient.routeIndex = 0;
        patient.route = [[610, 410], [610, 360], [760, 360], [760, 410], [932, 570], [932, 675]];
        state.departures.push(patient);
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
    if (question.id === "budget") {
      patient.budgetAsked = true;
      incrementGoal("budget");
    }
    if (question.id === "medications" && patient.flags.oldDrops) incrementGoal("hiddenFact");
    patient.dxPoints += 1;
    patient.findings.push(question.answer);
    recordClinical(patient, "history", question.answer);
    if (tutorialPatient(patient) && currentTutorialStep()?.id === "history") {
      const required = patient.v2Visit.medicalContent.historyQuestions.filter((item) => item.required);
      if (required.every((item) => patient.asked[item.id])) {
        advanceTutorial("history", "Обязательные сведения анамнеза уточнены.");
      }
    }
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
    const findings = patient.v2Visit
      ? patient.v2Visit.medicalContent.generalExam.findings.map((item) => item.text)
      : [diseaseFor(patient).temperature(patient), diseaseFor(patient).mucous(patient)];
    patient.findings.push(`Общий осмотр: ${findings.join(" ")}`);
    recordClinical(patient, "physicalExam", findings);
    assessClinicalUrgency(patient);
    setLog("Проведен общий осмотр: состояние, температура, слизистые и дыхание.");
    creditCompleteExam(patient);
    if (tutorialPatient(patient)) advanceTutorial("general_exam", `Общее состояние оценено. Срочность: ${clinicalUrgencyLabel(patient)}.`);
    passTime(3);
  }

  function doTemperature() {
    const patient = activePatient();
    if (!patient || patient.temperatureDone) return;
    patient.temperatureDone = true;
    patient.dxPoints += 1;
    const result = diseaseFor(patient).temperature(patient);
    patient.findings.push(result);
    recordClinical(patient, "physicalExam", result);
    setLog("Температура измерена: +1 диагностическое очко.");
    passTime(6);
  }

  function doMucous() {
    const patient = activePatient();
    if (!patient || patient.mucousDone) return;
    patient.mucousDone = true;
    patient.dxPoints += 1;
    const result = diseaseFor(patient).mucous(patient);
    patient.findings.push(result);
    recordClinical(patient, "physicalExam", result);
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
    const resultText = typeof result === "function" ? result(patient) : result;
    const resultItems = patient.v2Visit
      ? patient.v2Visit.medicalContent.targetExam.findings.map((item) => item.text)
      : [resultText];
    patient.findings.push(resultText);
    recordClinical(patient, "physicalExam", resultItems);
    assessClinicalUrgency(patient);
    incrementGoal("targetExam");
    setLog(`Локальный осмотр: ${option.label}.`);
    closeChoice();
    creditCompleteExam(patient);
    if (tutorialPatient(patient)) advanceTutorial("target_exam", `${option.label} выполнен: объективные признаки добавлены в карту случая.`);
    passTime(option.time);
  }

  function creditCompleteExam(patient) {
    if (!patient.completeExamCredited && patient.generalExamDone && patient.localUsed > 0) {
      patient.completeExamCredited = true;
      incrementGoal("completeExam");
    }
  }

  function diagnosticOptionsForPatient(patient) {
    if (!patient?.v2Visit || !diagnosticDecisions) return [];
    return diagnosticDecisions.diagnosticOptionsFor(patient.v2Visit.medicalContent);
  }

  function diagnosticTestRequiresSample(patient, test) {
    if (!patient?.v2Visit) return true;
    const sampleActions = patient.v2Visit.medicalContent.sampleActions || [];
    if (!sampleActions.length) return false;
    const requirements = test?.requires || [];
    return requirements.some((requirement) => requirement === "sample"
      || requirement.includes("sample")
      || sampleActions.some((action) => action.id === requirement));
  }

  function diagnosticFlowResolved(patient) {
    if (!patient?.v2Visit) return Boolean(patient?.microscopyDone);
    if (patient.microscopyDone || patient.diagnosticSkipped) return true;
    const latest = patient.diagnosticDecisions?.[patient.diagnosticDecisions.length - 1];
    if (!latest || patient.pendingDiagnosticTestId) return false;
    return diagnosticDecisions.isTerminalDecision(latest.decision);
  }

  function diagnosticOwnerState(patient) {
    const traits = patient.v2Visit?.owner?.profile?.traits || {};
    return {
      trust: patient.trust,
      anxiety: patient.anxiety,
      irritation: patient.irritation,
      comprehension: patient.ownerComprehension ?? traits.comprehension ?? Math.round(patient.ownerProfile.reliability * 100),
      budget: patient.budget,
      budgetDiscussed: patient.budgetAsked,
      budgetLimited: patient.ownerProfile.id === "budget_limited" || patient.v2Visit?.owner?.modifierId === "limited_budget"
    };
  }

  function diagnosticDecisionText(decision) {
    return {
      accepted: "Владелец согласился на исследование.",
      partially_accepted: "Владелец согласился только на часть предложенных исследований.",
      asks_cost: "Владелец попросил сначала назвать стоимость исследования.",
      requests_cheaper_option: "Владелец просит более доступный вариант.",
      refused: "Владелец отказался от исследования.",
      delayed: "Владелец отложил решение об исследовании.",
      skipped_not_required: "Дополнительное исследование не выбрано.",
      unavailable: "Исследование недоступно."
    }[decision] || "Решение владельца зафиксировано.";
  }

  function rememberDiagnosticDecision(patient, tests, result) {
    const record = {
      ...result,
      classifications: tests.map((test) => ({ testId: test.id, classification: test.classification })),
      decidedAtMinute: state.minute,
      resultStatus: result.noResult ? "not_performed" : "owner_accepted_pending_execution",
      chargedVetcoins: 0
    };
    patient.diagnosticDecisions.push(record);
    patient.lastDiagnosticOwnerDecision = result.decision;
    return record;
  }

  function offerDiagnosticTest(test) {
    const patient = activePatient();
    if (!patient?.v2Visit || !test) return;
    const decision = diagnosticDecisions.evaluateDiagnosticProposal([test], diagnosticOwnerState(patient), {
      explanationQuality: patient.explanationDone ? "recorded" : "brief_offer"
    });
    const record = rememberDiagnosticDecision(patient, [test], decision);
    closeChoice();
    if (decision.decision === "asks_cost") {
      patient.budgetAsked = true;
      setLog(diagnosticDecisionText(decision.decision));
      passTime(1);
      return;
    }
    if (decision.acceptedTestIds.includes(test.id)) {
      patient.pendingDiagnosticTestId = test.id;
      patient.diagnosticUncertainty = null;
      if (diagnosticTestRequiresSample(patient, test) && !patient.sampleTaken) {
        setLog(`${diagnosticDecisionText(decision.decision)} Сначала нужно взять предусмотренный карточкой материал.`);
        passTime(1);
        return;
      }
      doMicroscopy({ test, ownerApproved: true, decisionRecord: record });
      return;
    }
    if (decision.diagnosticUncertainty) {
      patient.diagnosticUncertainty = {
        testId: test.id,
        reason: decision.decision,
        text: "Исследование не выполнено; предварительное решение сохраняет неопределённость."
      };
    }
    setLog(diagnosticDecisionText(decision.decision));
    passTime(1);
  }

  function skipAdditionalDiagnostic() {
    const patient = activePatient();
    if (!patient?.v2Visit) return;
    const options = diagnosticOptionsForPatient(patient);
    rememberDiagnosticDecision(patient, options, {
      decision: "skipped_not_required",
      offeredTestIds: options.map((test) => test.id),
      acceptedTestIds: [],
      declinedTestIds: options.map((test) => test.id),
      totalCost: 0,
      noResult: true,
      noPayment: true,
      diagnosticUncertainty: false
    });
    patient.diagnosticSkipped = true;
    closeChoice();
    setLog("Дополнительное исследование не обязательно; приём продолжается без него.");
    passTime(1);
  }

  function openDiagnosticOffer() {
    const patient = activePatient();
    if (!patient) return;
    if (!patient.v2Visit) {
      doMicroscopy({ ownerApproved: true });
      return;
    }
    const options = diagnosticOptionsForPatient(patient);
    const pending = options.find((test) => test.id === patient.pendingDiagnosticTestId);
    if (pending) {
      if (diagnosticTestRequiresSample(patient, pending) && !patient.sampleTaken) {
        setLog("Сначала нужно взять предусмотренный карточкой материал.");
        return;
      }
      doMicroscopy({ test: pending, ownerApproved: true });
      return;
    }
    const items = options.map((test) => ({
      label: `${test.label} · ${test.classificationLabel}`,
      note: `${test.reason} Стоимость: ${test.costVetcoins || 0} V; время: ${test.durationMinutes || 1} мин.`,
      disabled: ["unavailable", "contraindicated"].includes(test.classification),
      onClick: () => offerDiagnosticTest(test)
    }));
    if (options.length && options.every((test) => ["optional", "low_value", "unavailable"].includes(test.classification))) {
      items.push({
        label: "Продолжить без дополнительного исследования",
        note: "Дополнительное исследование не обязательно. Результат и оплата не создаются.",
        onClick: skipAdditionalDiagnostic
      });
    }
    openChoice("Исследования", "Что предложить владельцу?", items);
  }

  function doSample() {
    const patient = activePatient();
    if (!patient || patient.sampleTaken) return;
    if (patient.v2Visit && !patient.pendingDiagnosticTestId && !diagnosticFlowResolved(patient)) {
      openDiagnosticOffer();
      return;
    }
    patient.sampleTaken = true;
    patient.stress = clamp(patient.stress + 4, 0, 100);
    const approvedResult = patient.v2Visit
      ? window.PET_CLINIC_GAME_ADAPTER_V2.sampleResultFor(patient)
      : null;
    const result = approvedResult || "Материал для микроскопии взят и промаркирован.";
    patient.findings.push(result);
    recordClinical(patient, "diagnosticTests", result);
    setLog("Взят материал для исследования.");
    if (tutorialPatient(patient)) advanceTutorial("sample", result);
    passTime(2);
  }

  function doMicroscopy(options = {}) {
    const patient = activePatient();
    if (!patient || patient.microscopyDone) return;
    if (patient.v2Visit && !options.ownerApproved) {
      openDiagnosticOffer();
      return;
    }
    const approvedTest = options.test || (patient.v2Visit
      ? diagnosticOptionsForPatient(patient).find((test) => test.id === patient.pendingDiagnosticTestId)
        || diagnosticOptionsForPatient(patient)[0]
      : null);
    const requiresSample = !patient.v2Visit || diagnosticTestRequiresSample(patient, approvedTest);
    if (requiresSample && !patient.sampleTaken) {
      setLog("Сначала нужно взять материал для исследования.");
      return;
    }
    if (patient.dxPoints < MICROSCOPY_COST) {
      setLog("Для микроскопии нужно минимум 2 диагностических очка.");
      return;
    }
    const testFee = approvedTest?.costVetcoins ?? MICROSCOPY_FEE;
    const testMinutes = approvedTest?.durationMinutes ?? 7;
    patient.dxPoints -= MICROSCOPY_COST;
    patient.microscopyDone = true;
    patient.pendingDiagnosticTestId = null;
    patient.executedDiagnosticTestId = approvedTest?.id || null;
    const result = patient.v2Visit ? approvedTest.resultText : diseaseFor(patient).microscopy(patient);
    patient.findings.push(`${result} Стоимость исследования: ${testFee} V.`);
    recordClinical(patient, "diagnosticTests", result);
    assessClinicalUrgency(patient);
    state.money += testFee;
    state.revenueToday += testFee;
    state.diagnosticRevenueToday += testFee;
    const ledger = currentDailyLedger(true);
    if (ledger) ledger.diagnosticRevenue += testFee;
    state.microscopyToday += 1;
    const decisionRecord = options.decisionRecord || [...(patient.diagnosticDecisions || [])]
      .reverse().find((record) => record.acceptedTestIds?.includes(approvedTest?.id) && record.resultStatus !== "completed");
    if (decisionRecord) {
      decisionRecord.resultStatus = "completed";
      decisionRecord.chargedVetcoins = testFee;
      decisionRecord.resultRefId = approvedTest?.id || null;
    }
    if (approvedTest?.classification === "low_value") {
      adjustTrust(patient, -3);
      if (isTier01V2()) changeOwnerTrust(-0.25, "малоценное исследование не изменило решение");
    }
    if (!patient.v2Visit || ["laboratory", "system_low_value"].includes(approvedTest?.type)) startDoctorLabTrip();
    setLog(`Исследование выполнено и оплачено: +${testFee} V.`);
    if (tutorialPatient(patient)) advanceTutorial("test", `${approvedTest?.label || "Исследование"}: результат получен.`);
    passTime(testMinutes);
  }

  function selectDiagnosis(diagnosis) {
    const patient = activePatient();
    if (!patient) return;
    const schema = patient.v2Visit && window.PET_CLINIC_MULTI_DIAGNOSIS_V2
      ? window.PET_CLINIC_MULTI_DIAGNOSIS_V2.normalizeVisitSchema(patient.v2Visit)
      : { diagnosisMode: "single", maximumDiagnosisSelections: 1 };
    const selected = Array.isArray(patient.selectedDiagnosisIds)
      ? [...patient.selectedDiagnosisIds]
      : patient.selectedDiagnosisId ? [patient.selectedDiagnosisId] : [];

    if (schema.diagnosisMode === "multiple") {
      if (selected.includes(diagnosis.id)) {
        setLog("Этот диагноз уже выбран и не может занимать второй слот.");
        return;
      }
      if (selected.length >= schema.maximumDiagnosisSelections) {
        setLog("Можно выбрать не более двух предварительных диагнозов.");
        return;
      }
      selected.push(diagnosis.id);
    } else {
      selected.splice(0, selected.length, diagnosis.id);
    }

    patient.selectedDiagnosisIds = selected;
    patient.selectedDiagnosisId = selected[0] || null;
    if (patient.v2Visit) patient.v2Visit.selectedDiagnosisIds = [...selected];
    const slotLabel = selected.length === 1 ? "Основной диагноз" : "Дополнительный диагноз или осложнение";
    patient.findings.push(`${slotLabel}: ${diagnosis.label}.`);
    recordClinical(patient, "clinicalInterpretation", `${slotLabel}: ${diagnosis.label}.`);
    setLog(`Предварительный диагноз сформулирован: ${diagnosis.label}. Теперь объясните владельцу результат и дальнейшие действия.`);
    closeChoice();
    if (tutorialPatient(patient)) advanceTutorial("preliminary_diagnosis", `Предварительный диагноз: ${diagnosis.label}.`);
    passTime(3);
  }

  function selectCommunication(option) {
    const patient = activePatient();
    if (!patient) return;
    if (!patient.v2Visit) {
      patient.selectedCommunicationId = option.id;
      patient.explanationDone = true;
      recordClinical(patient, "carePlan", option.note);
      const preferred = option.id === patient.ownerProfile.prefers;
      let trustDelta = preferred ? 8 : 2;
      if (option.id === "strict" && patient.ownerProfile.id === "anxious") trustDelta = -4;
      if (option.id === "budgetPlan" && patient.ownerProfile.id === "budget") trustDelta = 10;
      if (currentDoctor().fatigue >= 70) trustDelta -= 2;
      adjustTrust(patient, trustDelta);
      if (preferred) adjustOwnerState(patient, -10, -8);
      else adjustOwnerState(patient, 3, 6);
      incrementGoal("explained");
      setLog("Результат объяснен владельцу. Реакция отражена в шкале доверия.");
      closeChoice();
      passTime(4);
      return;
    }
    const communicationResult = clinicalDecisions.evaluateCommunication(option, {
      trust: patient.trust,
      anxiety: patient.anxiety,
      irritation: patient.irritation,
      comprehension: patient.ownerComprehension ?? Math.round(patient.ownerProfile.reliability * 100),
      adherence: patient.ownerAdherence ?? Math.round(patient.ownerProfile.reliability * 100),
      budget: patient.budget,
      budgetDiscussed: patient.budgetAsked,
      budgetLimited: ["budget", "budget_limited"].includes(patient.ownerProfile.id),
      underestimatesRisk: patient.ownerProfile.id === "inattentive"
    }, {
      complexPlan: (patient.v2Visit?.medicalContent.planOptions[0]?.steps.length || 0) >= 4,
      totalCost: diseaseFor(patient).baseFee,
      doctorFatigue: currentDoctor().fatigue
    });
    patient.selectedCommunicationId = option.id;
    patient.explanationDone = true;
    patient.communicationResult = communicationResult;
    patient.ownerComprehension = communicationResult.comprehension;
    patient.ownerAdherence = communicationResult.adherence;
    const explanation = patient.v2Visit
      ? `${patient.v2Visit.medicalContent.ownerExplanation.known} ${patient.v2Visit.medicalContent.ownerExplanation.uncertain}`
      : option.note;
    recordClinical(patient, "carePlan", `Результат объяснён владельцу: ${explanation}`);
    patient.trust = communicationResult.trust;
    patient.anxiety = communicationResult.anxiety;
    patient.irritation = communicationResult.irritation;
    recordClinical(patient, "carePlan", communicationResult.reactionText);
    incrementGoal("explained");
    setLog(`Результат объяснён. ${communicationResult.reactionText}`);
    closeChoice();
    if (tutorialPatient(patient)) advanceTutorial("explanation", "Подтверждённые данные и оставшаяся неопределённость объяснены владельцу.");
    passTime(communicationResult.timeCost);
  }

  function planTypeFor(treatment) {
    const value = `${treatment.id} ${treatment.label}`.toLowerCase();
    if (/refer|направ|urgentreferral/.test(value)) return "referral";
    if (/stabili|стабилиз/.test(value)) return "stabilization";
    if (/monitor|наблюд/.test(value)) return "monitoring";
    if (/recheck|контрол|повтор/.test(value)) return "recheck";
    if (/refusal|отказ/.test(value)) return "owner_refusal";
    return "treatment";
  }

  function selectCarePlan(treatment) {
    const patient = activePatient();
    if (!patient) return;
    patient.selectedTreatmentId = treatment.id;
    patient.selectedTreatment = { ...treatment, planType: planTypeFor(treatment) };
    if (patient.v2Visit) patient.v2Visit.selectedPlanId = treatment.id;
    const selectedDiagnosisIds = patient.selectedDiagnosisIds?.length
      ? patient.selectedDiagnosisIds
      : patient.selectedDiagnosisId ? [patient.selectedDiagnosisId] : [];
    const approvedPlan = patient.v2Visit
      ? patient.v2Visit.medicalContent.planOptions.find((plan) => plan.id === treatment.id)
      : null;
    patient.prescriptionComponents = clinicalDecisions.prescriptionComponentsFor(approvedPlan, selectedDiagnosisIds);
    patient.selectedPlanIds = [treatment.id];
    patient.ownerPlanDecision = clinicalDecisions.evaluateOwnerPlanDecision(patient.prescriptionComponents, {
      trust: patient.trust,
      irritation: patient.irritation,
      comprehension: patient.ownerComprehension ?? 50,
      budget: patient.budget
    }, {
      communicationReaction: patient.communicationResult?.reactionId
    });
    if (patient.v2Visit && window.PET_CLINIC_MULTI_DIAGNOSIS_V2) {
      const evaluation = window.PET_CLINIC_MULTI_DIAGNOSIS_V2.evaluateCombinedOutcome(
        patient.v2Visit,
        selectedDiagnosisIds,
        [treatment.id],
        window.PET_CLINIC_GAME_ADAPTER_V2.treatmentOptionsFor(patient)
      );
      patient.diagnosticCoverage = evaluation.diagnosticCoverage;
      patient.treatmentCoverage = evaluation.treatmentCoverage;
      patient.clinicalSafety = evaluation.clinicalSafety;
      patient.unnecessaryTreatment = evaluation.unnecessaryTreatment;
      patient.communicationQuality = patient.communicationResult?.reactionId || "not_completed";
    }
    patient.immediateDecisionReview = {
      ...diagnosisReviewFor(patient),
      diagnosticCoverage: patient.diagnosticCoverage ?? null,
      treatmentCoverage: patient.treatmentCoverage ?? null,
      clinicalSafety: patient.clinicalSafety || "pending_outcome",
      unnecessaryTreatment: Boolean(patient.unnecessaryTreatment),
      communicationQuality: patient.communicationResult?.reactionText || "Объяснение не завершено.",
      ownerDecision: patient.ownerPlanDecision.decisionText,
      acceptedComponentIds: patient.ownerPlanDecision.acceptedComponentIds,
      declinedComponentIds: patient.ownerPlanDecision.declinedComponentIds
    };
    patient.carePlanAgreed = true;
    visitState.markReadyForDischarge(patient);
    const planText = patient.v2Visit
      ? patient.v2Visit.medicalContent.planOptions.find((plan) => plan.id === treatment.id)
      : null;
    recordClinical(patient, "carePlan", [
      `Назначения: ${treatment.label}.`,
      ...(planText?.steps || []),
      planText?.followUp?.text || "",
      `Реакция владельца: ${patient.ownerPlanDecision.decisionText}.`
    ]);
    incrementGoal("dischargePlan");
    if (planText?.followUp?.text && !patient.controlGoalCredited) {
      patient.controlGoalCredited = true;
      incrementGoal("include_control_in_discharge");
    }
    closeChoice();
    setLog(`Назначения сделаны: ${patient.ownerPlanDecision.decisionText}. Приём можно завершить.`);
    if (tutorialPatient(patient)) advanceTutorial("plan", `Назначения сделаны: ${treatment.label}.`);
    passTime(2);
  }

  function finishVisit() {
    const patient = activePatient();
    if (!patient?.selectedTreatment) {
      setLog("Сначала сделайте назначения.");
      openTreatment();
      return;
    }
    treatPatient(patient.selectedTreatment);
  }

  function treatPatient(treatment) {
    const patient = activePatient();
    if (!patient) return;
    const disease = diseaseFor(patient);
    const guidedVisit = tutorialPatient(patient);
    const result = disease.evaluate(patient, treatment.id);
    const diagnosisCorrect = patient.selectedDiagnosisId === patient.diseaseId;
    const diagnosticsScore = diagnosticScore(patient);
    const consultFee = disease.baseFee;
    const total = consultFee + treatment.fee;
    const communicationMatch = patient.v2Visit
      ? Boolean(
        patient.communicationResult
        && patient.communicationResult.comprehension >= 55
        && !["more_anxious", "irritated"].includes(patient.communicationResult.reactionId)
      )
      : patient.selectedCommunicationId === patient.ownerProfile.prefers;
    state.money += total;
    state.revenueToday += total;
    const ledger = currentDailyLedger(true);
    if (ledger) ledger.consultationRevenue += total;
    state.treatedToday += 1;
    if (patient.eventLabel) state.handledSpecialEventsToday += 1;
    if (patient.returnVisit) incrementGoal("returns");
    let ownerTrustChange = 0;
    let clinicalReliabilityChange = 0;
    let risk = result.returnRisk;
    let effectiveQuality = result.quality;

    if (diagnosticsScore < 45) {
      risk += 0.08;
    }

    if (patient.urgency === "urgent" && patient.selectedUrgency !== "urgent") {
      risk += 0.2;
      clinicalReliabilityChange -= 2;
    }

    const overtime = Math.max(0, patient.visitTimeUsed - patient.visitTimeLimit);
    if (overtime > 0) {
      risk += Math.min(0.12, overtime / 100);
      if (overtime >= 12) ownerTrustChange -= 1;
      patient.findings.push(`Прием занял ${patient.visitTimeUsed} минут при комфортном лимите ${patient.visitTimeLimit} минут.`);
    }

    if (!patient.selectedDiagnosisId) {
      risk += 0.14;
      state.mistakesToday += 1;
      clinicalReliabilityChange -= 1;
      effectiveQuality = "wrong";
    } else if (!diagnosisCorrect) {
      risk += 0.18;
      state.mistakesToday += 1;
      clinicalReliabilityChange -= patient.returnVisit ? 3 : 1;
      effectiveQuality = result.quality === "correct" ? "partial" : result.quality;
    }

    if (total > patient.budget) {
      risk += 0.1;
      ownerTrustChange -= patient.ownerProfile.id === "budget" ? 2 : 1;
      patient.findings.push("Владелец согласился, но лечение оказалось выше комфортного бюджета.");
    }

    if (!patient.selectedCommunicationId) {
      risk += 0.1 + patient.ownerProfile.anxiety / 1000;
      ownerTrustChange -= patient.ownerProfile.id === "anxious" ? 2 : 1;
      patient.findings.push("Назначения даны без отдельного объяснения владельцу.");
    } else if (communicationMatch) {
      risk = Math.max(0, risk - 0.06);
      ownerTrustChange += 0.35;
    } else {
      risk += 0.04;
    }

    if (effectiveQuality === "correct") {
      clinicalReliabilityChange += patient.returnVisit ? 1 : 0.45;
    } else if (effectiveQuality === "partial") {
      if (diagnosisCorrect) state.mistakesToday += 1;
      clinicalReliabilityChange -= patient.returnVisit ? 2 : 0;
    } else {
      if (diagnosisCorrect) state.mistakesToday += 1;
      clinicalReliabilityChange -= patient.returnVisit ? 4 : 1;
    }

    const reputationReason = effectiveQuality === "correct"
      ? "корректно завершенный прием"
      : effectiveQuality === "partial" ? "неполный результат лечения" : "ошибка в лечении";
    if (isTier01V2()) {
      changeOwnerTrust(ownerTrustChange, reputationReason);
      changeClinicalReliability(clinicalReliabilityChange, reputationReason);
    } else {
      changeReputation(ownerTrustChange + clinicalReliabilityChange, reputationReason);
    }
    if (patient.diseaseId === "urinaryObstruction"
      && patient.selectedUrgency === "urgent"
      && diagnosisCorrect
      && treatment.id === "urgentReferral") {
      incrementGoal("urgent");
      changeClinicalReliability(2, "срочный пациент безопасно направлен");
    }
    if (Math.random() < risk) {
      state.pendingReturns.push({ diseaseId: patient.diseaseId, day: state.day + 1 });
    }

    state.caseJournal.push({
      day: state.day,
      visitId: patient.v2Visit?.visitId || null,
      animal: patient.animal,
      species: patient.species,
      sex: patient.sex,
      ageYears: patient.ageYears,
      diseaseId: patient.diseaseId,
      owner: patient.owner,
      doctor: currentDoctor().name,
      ownerType: patient.ownerProfile.label,
      complaint: patient.complaints.join(", "),
      trueDiagnosis: disease.name,
      selectedDiagnosis: diagnosisLabel(patient.selectedDiagnosisId) || "не выбран",
      selectedPlanId: patient.selectedTreatmentId,
      treatment: treatment.label,
      planType: treatment.planType || planTypeFor(treatment),
      communication: communicationLabel(patient.selectedCommunicationId) || "без объяснения",
      communicationQuality: patient.communicationQuality || "not_completed",
      ownerPlanDecision: patient.ownerPlanDecision?.decision || null,
      visitTime: patient.visitTimeUsed,
      trust: patient.trust,
      quality: effectiveQuality,
      risk: Math.round(risk * 100),
      followUpRequested: Boolean(patient.v2Visit?.medicalContent.planOptions.find((plan) => plan.id === treatment.id)?.followUp)
    });

    const completionGoals = ["treated"];
    if (isFullVisit(patient)) completionGoals.push("complete_two_full_visits");
    if (guidedVisit) completionGoals.push("finish_guided_visit");
    visitState.incrementCompatibleGoals(state.goalStats, completionGoals);

    if (guidedVisit) {
      advanceTutorial("finish", "Приём завершён. Случай сохранён в журнале клиники.");
      state.tutorialComplete = true;
    }

    setLog(`${patient.animal}: приём завершён. Результат станет понятен после наблюдения или повторного обращения.`);
    patient.motion = "leaving";
    visitState.markCompleted(patient);
    patient.routeIndex = 0;
    patient.route = [[420, 280], [500, 315], [500, 360], [760, 360], [760, 410], [932, 570], [932, 675]];
    state.departures.push(patient);
    state.queue = state.queue.filter((item) => item.id !== patient.id);
    state.activeId = null;
    closeChoice();
    el.caseWindow.classList.add("hidden");
    passTime(12, { trackVisit: false });
  }

  function diagnosticScore(patient) {
    let score = patient.dxPoints * 10;
    if (patient.temperatureDone) score += 12;
    if (patient.mucousDone) score += 12;
    if (patient.localUsed > 0) score += 12 * patient.localUsed;
    if (patient.microscopyDone) score += patient.diseaseId.includes("Otitis") ? 18 : 4;
    return clamp(score, 0, 100);
  }

  function isFullVisit(patient) {
    const requiredHistoryComplete = patient.v2Visit
      ? patient.v2Visit.medicalContent.historyQuestions
        .filter((question) => question.required)
        .every((question) => patient.asked[question.id])
      : Object.keys(patient.asked).length > 0;
    return requiredHistoryComplete
      && patient.generalExamDone
      && patient.localUsed > 0
      && Boolean(patient.selectedDiagnosisId)
      && patient.explanationDone
      && patient.carePlanAgreed;
  }

  function correctTreatmentId(patient) {
    if (patient.v2Visit) return patient.v2Visit.medicalContent.planOptions[0]?.id || null;
    const map = {
      bacterialOtitis: patient.flags.durationDays > 14 ? "dropsAntibiotic" : "antibacterialDrops",
      inflammatoryOtitis: "antiInflammatoryDrops",
      miteOtitis: "antiparasitic",
      pancreatitis: "pancreatitisSupport",
      gastroenteritis: "giSupport",
      dermatitis: "dermatitisLocal",
      trauma: "traumaCare",
      urinaryObstruction: "urgentReferral"
    };
    return map[patient.diseaseId] || "watchfulWaiting";
  }

  function debugResolveActivePatient() {
    const patient = activePatient();
    if (!patient) return;
    visitState.markInConsultation(patient);
    el.caseWindow.classList.remove("hidden");
    if (tutorialPatient(patient) && currentTutorialStep()?.id === "intro") openAnamnesis();
    if (patient.v2Visit) {
      const questions = diseaseFor(patient).anamnesis(patient);
      patient.v2Visit.medicalContent.historyQuestions
        .filter((question) => question.required && !patient.asked[question.id])
        .forEach((question) => askQuestion(patient, questions.find((item) => item.id === question.id)));
    }
    if (!patient.selectedUrgency) selectUrgency(patient.urgency);
    if (!patient.generalExamDone) doGeneralExam();
    if (patient.localUsed === 0) {
      const localOption = patient.v2Visit
        ? window.PET_CLINIC_GAME_ADAPTER_V2.targetExamOptionFor(patient)
        : localExamOptions.find((option) => option.id === (patient.diseaseId.includes("Otitis") ? "ears"
          : patient.diseaseId === "dermatitis" ? "skin"
            : patient.diseaseId === "trauma" ? "gait" : "abdomen"));
      doLocalExam(localOption);
    }
    if (!patient.budgetAsked) {
      patient.budgetAsked = true;
      incrementGoal("budget");
    }
    if ((patient.diseaseId.includes("Otitis") || patient.v2Visit) && !diagnosticFlowResolved(patient)) {
      const test = patient.v2Visit ? diagnosticOptionsForPatient(patient)[0] : null;
      if (patient.v2Visit) {
        const decisionRecord = rememberDiagnosticDecision(patient, [test], {
          decision: "accepted",
          offeredTestIds: [test.id],
          acceptedTestIds: [test.id],
          declinedTestIds: [],
          totalCost: test.costVetcoins || 0,
          noResult: false,
          noPayment: false,
          diagnosticUncertainty: false
        });
        patient.pendingDiagnosticTestId = test.id;
        if (diagnosticTestRequiresSample(patient, test) && !patient.sampleTaken) doSample();
        doMicroscopy({ test, ownerApproved: true, decisionRecord });
      } else {
        if (!patient.sampleTaken) doSample();
        doMicroscopy({ ownerApproved: true });
      }
    }
    const diagnosis = patient.v2Visit
      ? window.PET_CLINIC_GAME_ADAPTER_V2.diagnosisOptionsFor(patient, generatorRuntime.catalog).find((item) => item.id === patient.diseaseId)
      : diagnosisOptions.find((item) => item.id === patient.diseaseId);
    selectDiagnosis(diagnosis);
    const options = patient.v2Visit ? communicationOptions : legacyCommunicationOptions;
    selectCommunication(options.find((option) => option.id === patient.ownerProfile.prefers) || options[0]);
    const treatment = patient.v2Visit
      ? window.PET_CLINIC_GAME_ADAPTER_V2.treatmentOptionsFor(patient).find((item) => item.id === correctTreatmentId(patient))
      : treatmentOptions.find((item) => item.id === correctTreatmentId(patient));
    selectCarePlan(treatment);
    finishVisit();
  }

  function debugFinishDay() {
    while (state.arrivalSchedule.length) {
      const arrival = state.arrivalSchedule.shift();
      const template = arrival.template || {};
      spawnPatient(arrival.diseaseId || template.diseaseId, Boolean(template.returnVisit), template);
    }
    state.queue.forEach((patient) => { patient.patience = 999; });
    let safety = 20;
    while (state.queue.length && safety > 0) {
      state.activeId = state.queue[0].id;
      debugResolveActivePatient();
      safety -= 1;
    }
    requestShiftClose(false);
    finishShift();
  }

  function renderShiftPlanning() {
    const plan = currentPlan();
    el.shiftTitle.textContent = plan ? `День ${state.day} · ${plan.title}` : `День ${state.day} · Свободная работа`;
    el.shiftBriefing.textContent = plan
      ? plan.briefing
      : "Сюжетная глава завершена. Клиника продолжает работу в свободном режиме.";
    renderShiftForecast(plan);
    if (el.standardHoursLabel) {
      el.standardHoursLabel.textContent = plan
        ? `08:00–${formatTime(plan.endMinute)} · по плану дня`
        : "08:00–18:00 · свободная смена";
    }
    el.doctorOptions.textContent = "";
    state.doctors.forEach((doctor) => {
      const unavailable = doctor.consecutiveShifts >= MAX_CONSECUTIVE_SHIFTS;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `doctor-option${doctor.id === state.selectedDoctorId ? " selected" : ""}`;
      button.disabled = unavailable;
      const avatar = document.createElement("span");
      avatar.className = "doctor-avatar";
      avatar.style.background = doctor.color;
      avatar.textContent = doctor.name.split(" ").map((part) => part[0]).join("");
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = doctor.name;
      const fatigue = document.createElement("span");
      fatigue.textContent = `Усталость: ${Math.round(doctor.fatigue)}% · смен подряд: ${doctor.consecutiveShifts}/${MAX_CONSECUTIVE_SHIFTS}`;
      const note = document.createElement("small");
      const effect = isTier01V2() ? campaignMechanics.fatigueEffect(doctor.fatigue) : null;
      const recovery = isTier01V2() ? campaignMechanics.expectedRecovery(doctor.fatigue, 1) : null;
      note.textContent = unavailable
        ? "После трех смен подряд врачу нужен выходной."
        : effect
          ? `${effect.label}. После дня отдыха: ${Math.round(recovery.afterRest)}%.`
          : doctor.note;
      copy.append(name, fatigue, note);
      button.append(avatar, copy);
      button.addEventListener("click", () => {
        state.selectedDoctorId = doctor.id;
        renderShiftPlanning();
      });
      el.doctorOptions.appendChild(button);
    });
    const selectedMode = document.querySelector(`input[name="hoursMode"][value="${state.hoursMode}"]`);
    if (selectedMode) selectedMode.checked = true;
    const extendedMode = document.querySelector('input[name="hoursMode"][value="extended"]');
    if (extendedMode) {
      const fatigueBlocksExtension = isTier01V2() && !campaignMechanics.fatigueEffect(currentDoctor().fatigue).canExtendShift;
      extendedMode.disabled = state.day <= campaignDayCount() || fatigueBlocksExtension;
      const description = extendedMode.closest("label")?.querySelector("small");
      if (description && fatigueBlocksExtension) description.textContent = "Недоступно при усталости 80% и выше";
      else if (description) description.textContent = "Откроется после первой недели";
    }
  }

  function renderShiftForecast(plan) {
    if (!el.shiftForecast) return;
    if (!plan) {
      el.shiftForecast.innerHTML = "<h3>Запись на сегодня</h3><p>Свободный режим: поток формируется после открытия.</p>";
      return;
    }
    const returns = plan.patients.filter((patient) => patient.returnVisit).length;
    const walkIns = plan.patients.filter((patient) => patient.source === "walkIn").length;
    const walkInRange = plan.unplannedRange
      ? `${plan.unplannedRange.min}–${plan.unplannedRange.max}`
      : walkIns ? `0–${walkIns}` : "0";
    const rows = plan.patients.map((patient) => `
      <div class="shift-forecast-row">
        <strong>${formatTime(patient.arrivalMinute)}</strong>
        <span>${patient.animal}, ${speciesLabels[patient.species] || patient.species} · ${patient.returnVisit ? "повторный" : "первичный"}<small>${patient.bookingLabel || "Причина обращения"}</small></span>
      </div>`).join("");
    const walkInSummary = plan.unplannedRange?.max > 0
      ? `<span>Возможны без записи: <b>${walkInRange}</b></span>`
      : "";
    el.shiftForecast.innerHTML = `
      <h3>Запись на сегодня</h3>
      <div class="shift-forecast-summary">
        <span>Записано: <b>${plan.patients.length - walkIns}</b></span>
        <span>Повторных: <b>${returns}</b></span>
        ${walkInSummary}
        <span>Нагрузка: <b>${plan.loadLabel}</b></span>
        <span>Закрытие: <b>${formatTime(plan.endMinute)}</b></span>
      </div>
      <div class="shift-forecast-list">${rows}</div>`;
  }

  function openShiftPlanning() {
    state.phase = "planning";
    state.modalOpen = true;
    state.paused = true;
    state.dayStarted = false;
    el.caseWindow.classList.add("hidden");
    el.choiceWindow.classList.add("hidden");
    el.summaryWindow.classList.add("hidden");
    el.closeShiftWindow.classList.add("hidden");
    el.shiftWindow.classList.remove("hidden");
    const availableDoctors = state.doctors
      .filter((doctor) => doctor.consecutiveShifts < MAX_CONSECUTIVE_SHIFTS)
      .sort((left, right) => left.fatigue - right.fatigue);
    if (availableDoctors.length) state.selectedDoctorId = availableDoctors[0].id;
    renderShiftPlanning();
    renderAll();
    persistGameState(true);
  }

  function resetDayState() {
    state.minute = DAY_START;
    state.hoursMode = "standard";
    state.dayEnd = STANDARD_DAY_END;
    state.spawnMeter = 0;
    state.treatedToday = 0;
    state.revenueToday = 0;
    state.expensesToday = 0;
    state.diagnosticRevenueToday = 0;
    state.microscopyToday = 0;
    state.arrivalsToday = 0;
    state.plannedArrivalsToday = 0;
    state.specialEventsToday = 0;
    state.handledSpecialEventsToday = 0;
    state.arrivalSchedule = [];
    state.departures = [];
    state.reputationStartToday = state.reputation;
    state.reputationEvents = [];
    state.returnsToday = 0;
    state.mistakesToday = 0;
    state.lostToday = 0;
    state.goalStats = { noLost: 1 };
    state.shiftExtended = false;
    state.firstArrivalPaused = false;
    state.speed = 1;
    state.queue = [];
    state.activeId = null;
  }

  function startShift() {
    const doctor = currentDoctor();
    if (doctor.consecutiveShifts >= MAX_CONSECUTIVE_SHIFTS) {
      setLog(`${doctor.name} отработал три смены подряд и должен отдохнуть.`);
      renderShiftPlanning();
      return;
    }
    const selectedMode = document.querySelector('input[name="hoursMode"]:checked');
    state.hoursMode = state.day <= campaignDayCount() ? "standard" : selectedMode ? selectedMode.value : "standard";
    if (isTier01V2()) {
      try {
        generatorRuntime.generator.openDay(state.day);
      } catch (error) {
        blockGameForSaveError(error);
        renderHud();
        return;
      }
    }
    const plan = currentPlan();
    state.dayEnd = plan && plan.endMinute
      ? plan.endMinute
      : state.hoursMode === "extended" ? EXTENDED_DAY_END : STANDARD_DAY_END;
    state.dayStarted = true;
    state.phase = "running";
    state.modalOpen = false;
    state.paused = false;
    doctor.shiftsWorked += 1;
    doctor.consecutiveShifts = doctor.lastShiftDay === state.day - 1 ? doctor.consecutiveShifts + 1 : 1;
    doctor.lastShiftDay = state.day;
    const ledger = currentDailyLedger(true);
    if (ledger) {
      ledger.status = "running";
      ledger.doctorId = doctor.id;
      ledger.fatigueStart = doctor.fatigue;
    }
    if (state.hoursMode === "extended") addDoctorFatigue(5);
    el.shiftWindow.classList.add("hidden");

    const returns = state.day <= campaignDayCount() ? [] : state.pendingReturns.filter((item) => item.day === state.day);
    if (state.day > campaignDayCount()) state.pendingReturns = state.pendingReturns.filter((item) => item.day !== state.day);
    returns.forEach((item) => {
      state.returnsToday += 1;
      spawnPatient(item.diseaseId, true, item);
    });
    if (plan) {
      state.arrivalSchedule = buildArrivalSchedule(plan);
    } else {
      while (state.queue.length < (state.hoursMode === "extended" ? 5 : 3)) spawnPatient();
    }
    setLog(`${doctor.name} начал${doctor.name.endsWith("а") ? "а" : ""} смену. ${plan ? plan.briefing : "Клиника работает в свободном режиме."}`);
    renderAll();
    persistGameState(true);
  }

  function requestShiftClose(forced = false) {
    if (!state.dayStarted || !el.closeShiftWindow.classList.contains("hidden")) return;
    if (!forced && state.queue.length > 0 && state.minute < state.dayEnd - 120) {
      setLog("Смену рано закрывать: в очереди остаются пациенты и рабочее время еще не закончилось.");
      return;
    }
    state.modalOpen = true;
    state.phase = "closing";
    state.paused = true;
    const urgent = state.queue.filter((patient) => patient.selectedUrgency === "urgent").length;
    el.closeShiftSummary.innerHTML = [
      `<b>В очереди:</b> ${state.queue.length}.`,
      `<b>Срочных:</b> ${urgent}.`,
      `<b>Непросмотренных результатов:</b> 0.`,
      `<b>Усталость ${currentDoctor().shortName}:</b> ${Math.round(currentDoctor().fatigue)}%.`,
      `<b>Текущее время:</b> ${formatClinicTime(state.minute)}.`
    ].join("<br>");
    const fatigueEffect = isTier01V2() ? campaignMechanics.fatigueEffect(currentDoctor().fatigue) : null;
    el.extendShiftBtn.disabled = state.shiftExtended || Boolean(fatigueEffect && !fatigueEffect.canExtendShift);
    el.extendShiftBtn.title = fatigueEffect && !fatigueEffect.canExtendShift
      ? "Продление недоступно при усталости 80% и выше"
      : "Продлить смену на 60 минут";
    el.finishShiftBtn.disabled = urgent > 0;
    el.closeShiftWindow.classList.remove("hidden");
    persistGameState(true);
  }

  function extendShift() {
    if (isTier01V2() && !campaignMechanics.fatigueEffect(currentDoctor().fatigue).canExtendShift) {
      setLog("Продление смены недоступно: усталость врача достигла 80%.");
      renderAll();
      return;
    }
    state.dayEnd += 60;
    state.shiftExtended = true;
    addDoctorFatigue(8);
    state.modalOpen = false;
    state.phase = "running";
    state.paused = false;
    el.closeShiftWindow.classList.add("hidden");
    setLog("Смена продлена на 60 минут. Дополнительные часы увеличат зарплату и усталость.");
    renderAll();
    persistGameState(true);
  }

  function transferAndClose() {
    const routine = state.queue.filter((patient) => patient.selectedUrgency !== "urgent").length;
    const urgent = state.queue.length - routine;
    if (routine > 0) changeReputation(-Math.min(3, routine), "пациенты перенесены на другой день");
    if (urgent > 0) changeReputation(1, "срочные пациенты безопасно направлены");
    state.queue = [];
    state.activeId = null;
    setLog(`Обычные пациенты перенесены: ${routine}. Срочные направлены: ${urgent}.`);
    endDay();
  }

  function finishShift() {
    if (state.queue.length > 0) {
      state.lostToday += state.queue.length;
      state.goalStats.noLost = 0;
      changeReputation(-Math.min(5, state.queue.length * 2), "клиника закрылась с незавершенной очередью");
      state.queue = [];
      state.activeId = null;
    }
    endDay();
  }

  function endDay() {
    state.modalOpen = true;
    state.paused = true;
    state.dayStarted = false;
    state.phase = "summary";
    el.closeShiftWindow.classList.add("hidden");
    const plan = currentPlan();
    const goals = plan ? plan.goals : [];
    const completedGoals = goals.filter(goalComplete).length;
    const todayCases = state.caseJournal.filter((item) => item.day === state.day);
    if (isTier01V2()) {
      try {
        generatorRuntime.generator.closeDay(state.day, todayCases.map((item) => ({
          visitId: item.visitId,
          completed: Boolean(item.visitId),
          followUpRequested: item.followUpRequested,
          followUpAfterDays: 1,
          selectedPlanId: item.selectedPlanId,
          quality: item.quality
        })));
      } catch (error) {
        blockGameForSaveError(error);
        renderHud();
        return;
      }
    }
    const doctor = currentDoctor();
    const payroll = state.hoursMode === "extended" ? 430 : 360;
    const rentAndUtilities = state.hoursMode === "extended" ? 150 : 110;
    const supplies = state.treatedToday * 35;
    state.expensesToday = payroll + rentAndUtilities + supplies;
    state.money -= state.expensesToday;
    const net = state.revenueToday - state.expensesToday;
    const fatigueBeforeClosing = doctor.fatigue;
    const closingFatigueLoad = 12
      + (state.hoursMode === "extended" ? 10 : 0)
      + (state.shiftExtended ? 8 : 0)
      + Math.max(0, doctor.consecutiveShifts - 1) * 5;
    addDoctorFatigue(closingFatigueLoad);
    state.doctors.forEach((item) => {
      if (item.id !== doctor.id) {
        item.fatigue = clamp(item.fatigue - 16, 0, 100);
        item.consecutiveShifts = 0;
      }
    });
    const ledger = currentDailyLedger(true);
    if (ledger) {
      ledger.status = "closed";
      ledger.diagnosticRevenue = state.diagnosticRevenueToday;
      ledger.consultationRevenue = state.revenueToday - state.diagnosticRevenueToday;
      ledger.procedureCost = supplies;
      ledger.payroll = payroll;
      ledger.maintenance = rentAndUtilities;
      ledger.net = campaignMechanics.calculateLedgerNet(ledger);
      ledger.ownerTrustEnd = state.ownerTrust;
      ledger.clinicalReliabilityEnd = state.clinicalReliability;
      ledger.fatigueBeforeClosing = fatigueBeforeClosing;
      ledger.closingFatigueLoad = closingFatigueLoad;
      ledger.fatigueEnd = doctor.fatigue;
      state.campaignFinance.debt = Math.max(0, -state.money);
      if (state.day % 7 === 0) {
        state.campaignFinance.weeklyReview = campaignMechanics.weeklyFinancialReview({
          day: state.day,
          money: state.money,
          mandatoryExpenses: payroll + rentAndUtilities,
          creditLimit: state.campaignFinance.creditLimit
        });
        state.campaignFinance.closureRisk = state.campaignFinance.weeklyReview.closureRisk;
      }
      if (state.day >= 30) {
        state.campaignOutcome = {
          ...campaignMechanics.evaluateCampaignOutcome({
            day: state.day,
            money: state.money,
            creditLimit: state.campaignFinance.creditLimit,
            clinicalReliability: state.clinicalReliability,
            mandatoryTrainingComplete: state.tutorialComplete
          }),
          ownerTrust: state.ownerTrust,
          clinicalReliability: state.clinicalReliability,
          developmentHistory: state.dailyLedger.map((item) => ({
            day: item.day,
            net: item.net,
            ownerTrust: item.ownerTrustEnd,
            clinicalReliability: item.clinicalReliabilityEnd
          }))
        };
      }
    }
    const goalsHtml = goals.length
      ? goals.map((goal) => `${goalComplete(goal) ? "Выполнено" : "Не выполнено"}: ${goal.label} (${goalProgress(goal)}/${goal.target})`).join("<br>")
      : "Свободный режим без сюжетных целей.";
    const reputationDelta = reputationDeltaToday();
    const reputationByReason = state.reputationEvents.reduce((totals, event) => {
      totals[event.reason] = (totals[event.reason] || 0) + event.delta;
      return totals;
    }, {});
    const reputationReasons = Object.keys(reputationByReason).length
      ? Object.entries(reputationByReason).map(([reason, delta]) => `${delta > 0 ? "+" : ""}${delta.toFixed(1)} — ${reason}`).join("<br>")
      : "Изменений не было.";
    state.chapterComplete = state.day === campaignDayCount();
    if (state.day === 30 && state.campaignOutcome?.completed) {
      state.summaryTitle = state.campaignOutcome.success ? "Кампания завершена успешно" : "Кампания завершена";
    } else {
      state.summaryTitle = state.chapterComplete ? "Первая глава завершена" : `День ${state.day} завершен`;
    }
    if (ledger) {
      const ownerDelta = ledger.ownerTrustEnd - ledger.ownerTrustStart;
      const reliabilityDelta = ledger.clinicalReliabilityEnd - ledger.clinicalReliabilityStart;
      const fatigueDuringShift = Math.max(0, fatigueBeforeClosing - ledger.fatigueStart);
      const weekly = state.day % 7 === 0 ? state.campaignFinance.weeklyReview : null;
      const weeklyRiskLabels = { stable: "стабильный", elevated: "повышенный", high: "высокий", critical: "критический" };
      state.summaryHtml = [
        `<b>${plan ? plan.title : "Свободная смена"}</b>`,
        `Врач: <b>${doctor.name}</b>. Усталость: ${Math.round(ledger.fatigueStart)}% → ${Math.round(fatigueBeforeClosing)}% за работу (+${Math.round(fatigueDuringShift)}), закрытие смены +${Math.round(closingFatigueLoad)}, итог <b>${Math.round(doctor.fatigue)}%</b>. После дня отдыха ожидается ${Math.round(campaignMechanics.expectedRecovery(doctor.fatigue, 1).afterRest)}%.`,
        `Посетителей пришло: <b>${state.arrivalsToday} из ${state.plannedArrivalsToday}</b>. Принято: <b>${state.treatedToday}</b>. Ушло без приема: <b>${state.lostToday}</b>.`,
        state.specialEventsToday ? `Особые события: <b>${state.handledSpecialEventsToday}/${state.specialEventsToday}</b> обработано.` : "",
        `Доход приёмов: <b>${formatMoney(ledger.consultationRevenue)} V</b>. Доход исследований: <b>${formatMoney(ledger.diagnosticRevenue)} V</b>.`,
        `Стоимость процедур: <b>${formatMoney(ledger.procedureCost)} V</b>. Зарплаты: <b>${formatMoney(ledger.payroll)} V</b>. Обслуживание: <b>${formatMoney(ledger.maintenance)} V</b>.`,
        `Возвраты: <b>${formatMoney(ledger.refunds)} V</b>. Бесплатные повторные приёмы: <b>${ledger.freeRechecks}</b> (${formatMoney(ledger.freeRecheckValue)} V).`,
        `Итог дня: <b>${ledger.net >= 0 ? "+" : ""}${formatMoney(ledger.net)} V</b>. Баланс: <b>${formatMoney(state.money)} V</b>. Долг: <b>${formatMoney(state.campaignFinance.debt)} V</b> из ${formatMoney(state.campaignFinance.creditLimit)} V.`,
        `Доверие владельцев: <b>${state.ownerTrust.toFixed(1)}/100</b> (${ownerDelta >= 0 ? "+" : ""}${ownerDelta.toFixed(1)}). Клиническая надёжность: <b>${state.clinicalReliability.toFixed(1)}/100</b> (${reliabilityDelta >= 0 ? "+" : ""}${reliabilityDelta.toFixed(1)}).`,
        weekly ? `Недельная финансовая проверка: риск закрытия <b>${weeklyRiskLabels[weekly.closureRisk]}</b>, обязательные расходы следующей смены ${formatMoney(weekly.mandatoryExpenses)} V, доступный кредит ${formatMoney(weekly.remainingCredit)} V.${weekly.recoveryMeasures.length ? ` Меры: ${weekly.recoveryMeasures.join(", ")}.` : ""}` : "",
        state.day === 30 && state.campaignOutcome?.completed ? `Итог кампании: <b>${state.campaignOutcome.success ? "условия успеха выполнены" : "не все условия успеха выполнены"}</b>. Клиническая оценка: ${state.campaignOutcome.clinicalAssessment}. Финансовая оценка: ${state.campaignOutcome.financialAssessment}. Доступен свободный режим.` : "",
        `Цели: <b>${completedGoals}/${goals.length}</b>.<br>${goalsHtml}`
      ].filter(Boolean).join("<br>");
    } else {
      state.summaryHtml = [
        `<b>${plan ? plan.title : "Свободная смена"}</b>`,
        `Врач: <b>${doctor.name}</b>. Усталость после смены: <b>${Math.round(doctor.fatigue)}%</b>.`,
        `Посетителей пришло: <b>${state.arrivalsToday} из ${state.plannedArrivalsToday}</b>. Принято: <b>${state.treatedToday}</b>. Ушло без приема: <b>${state.lostToday}</b>.`,
        state.specialEventsToday ? `Особые события: <b>${state.handledSpecialEventsToday}/${state.specialEventsToday}</b> обработано.` : "",
        `Доход: <b>${formatMoney(state.revenueToday)} V</b>. Расходы: <b>${formatMoney(state.expensesToday)} V</b>. Итог: <b>${net >= 0 ? "+" : ""}${formatMoney(net)} V</b>.`,
        `Исследования: <b>${state.microscopyToday}</b>, доход от них: <b>${formatMoney(state.diagnosticRevenueToday)} V</b>.`,
        `Репутация: <b>${state.reputation.toFixed(1)}/100</b> (${reputationDelta >= 0 ? "+" : ""}${reputationDelta.toFixed(1)} за день).<br>${reputationReasons}`,
        `Цели: <b>${completedGoals}/${goals.length}</b>.<br>${goalsHtml}`
      ].filter(Boolean).join("<br>");
    }
    el.summaryTitle.textContent = state.summaryTitle;
    el.summaryText.innerHTML = state.summaryHtml;
    el.nextDayBtn.textContent = state.day === 30 && state.campaignOutcome?.completed
      ? "Продолжить в свободной игре"
      : state.chapterComplete ? "Продолжить после главы" : "Планировать следующий день";
    el.summaryWindow.classList.remove("hidden");
    renderAll();
    persistGameState(true);
  }

  function startNextDay() {
    state.day += 1;
    state.phase = "planning";
    resetDayState();
    setLog("Выберите врача и режим работы перед открытием клиники.");
    el.developerPanel.classList.add("hidden");
    el.summaryWindow.classList.add("hidden");
    openShiftPlanning();
  }

  function openCase(patientId) {
    const previous = activePatient();
    if (previous && previous.id !== patientId && isPatientInConsult(previous)) {
      setLog(`${previous.animal} ещё находится в кабинете. Сначала завершите текущий приём.`);
      el.caseWindow.classList.remove("hidden");
      renderAll();
      return;
    }
    const requestedPatient = state.queue.find((patient) => patient.id === patientId);
    if (isTier01V2()
      && requestedPatient
      && requestedPatient.urgency !== "urgent"
      && !isPatientInConsult(requestedPatient)
      && !campaignMechanics.fatigueEffect(currentDoctor().fatigue).canStartRoutineVisit) {
      setLog("Усталость врача 100%: новый обычный приём начать нельзя. Завершите смену или безопасно направьте срочного пациента.");
      renderAll();
      return;
    }
    state.activeId = patientId;
    const patient = activePatient();
    if (patient && patient.flowState !== "ready_for_discharge") visitState.markInConsultation(patient);
    if (patient) activateTutorial(patient);
    if (patient && patient.motion !== "inCabinet") {
      patient.motion = "toCabinet";
      patient.routeIndex = 0;
      patient.route = [[610, 410], [610, 360], [500, 360], [500, 315], [420, 280], [350, 245]];
    }
    el.caseWindow.classList.remove("hidden");
    closeChoice();
    renderAll();
    persistGameState(true);
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
      if (item.sections?.some((section) => section.items?.length)) {
        const evidence = document.createElement("div");
        evidence.className = "choice-evidence";
        item.sections.filter((section) => section.items?.length).forEach((section) => {
          const row = document.createElement("section");
          const heading = document.createElement("b");
          heading.textContent = section.label;
          const list = document.createElement("ul");
          section.items.forEach((value) => {
            const entry = document.createElement("li");
            entry.textContent = value;
            list.appendChild(entry);
          });
          row.append(heading, list);
          evidence.appendChild(row);
        });
        button.appendChild(evidence);
      }
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
    if (tutorialPatient(patient)) advanceTutorial("intro");
    const budgetQuestion = {
      id: "budget",
      label: "Есть ограничения по бюджету?",
      answer: `Владелец просит по возможности уложиться примерно в ${Math.max(100, Math.floor((patient.budget - 60) / 50) * 50)}–${Math.ceil((patient.budget + 60) / 50) * 50} веткоинов.`,
      requiredForSafeDecision: false,
      optional: true
    };
    const anamnesisQuestions = disease.anamnesis(patient).map((question) => {
      const sourceQuestion = patient.v2Visit?.medicalContent.historyQuestions.find((item) => item.id === question.id);
      return {
        ...question,
        requiredForSafeDecision: patient.v2Visit ? Boolean(sourceQuestion?.required) : true,
        optional: patient.v2Visit ? !sourceQuestion?.required : false
      };
    });
    const availableQuestions = tutorialPatient(patient) && currentTutorialStep()?.id === "history"
      ? anamnesisQuestions.filter((question) => patient.v2Visit.medicalContent.historyQuestions.find((item) => item.id === question.id)?.required)
      : [...anamnesisQuestions, budgetQuestion];
    const questions = availableQuestions.map((question) => ({
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
    const availableOptions = patient.v2Visit
      ? [window.PET_CLINIC_GAME_ADAPTER_V2.targetExamOptionFor(patient)]
      : localExamOptions;
    const items = availableOptions.map((option) => ({
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

  function openTriage() {
    const patient = activePatient();
    if (!patient) return;
    openChoice("Триаж", "Какую срочность установить?", [
      {
        label: "Обычная",
        note: "Пациент может ждать в общей очереди.",
        onClick: () => selectUrgency("routine")
      },
      {
        label: "Высокая",
        note: "Пациента нельзя задерживать обычной очередью.",
        onClick: () => selectUrgency("urgent")
      }
    ]);
  }

  function selectUrgency(value) {
    const patient = activePatient();
    if (!patient) return;
    patient.selectedUrgency = value;
    patient.findings.push(`Триаж: установлена ${value === "urgent" ? "высокая" : "обычная"} срочность.`);
    recordClinical(patient, "clinicalInterpretation", `Срочность: ${value === "urgent" ? "срочная" : "обычная"}.`);
    closeChoice();
    setLog(`Срочность пациента ${patient.animal} определена.`);
    passTime(1);
  }

  function openDiagnosis() {
    const patient = activePatient();
    if (!patient) return;
    const availableDiagnoses = patient.v2Visit
      ? window.PET_CLINIC_GAME_ADAPTER_V2.diagnosisOptionsFor(patient, generatorRuntime.catalog)
      : diagnosisOptions;
    const schema = patient.v2Visit && window.PET_CLINIC_MULTI_DIAGNOSIS_V2
      ? window.PET_CLINIC_MULTI_DIAGNOSIS_V2.normalizeVisitSchema(patient.v2Visit)
      : { diagnosisMode: "single", maximumDiagnosisSelections: 1 };
    const selectedIds = Array.isArray(patient.selectedDiagnosisIds)
      ? patient.selectedDiagnosisIds
      : patient.selectedDiagnosisId ? [patient.selectedDiagnosisId] : [];
    const items = availableDiagnoses.map((diagnosis) => ({
      label: diagnosis.label,
      note: selectedIds.includes(diagnosis.id)
        ? "Этот диагноз уже выбран."
        : schema.diagnosisMode === "multiple" && selectedIds.length >= schema.maximumDiagnosisSelections
          ? "Оба диагностических слота уже заняты."
          : `Клиническая оценка. Потратит 3 минуты приема.`,
      sections: patient.v2Visit ? [
        { label: "Поддерживает", items: diagnosis.supportingEvidence },
        { label: "Не хватает данных", items: diagnosis.missingEvidence },
        { label: "Противоречит", items: diagnosis.contradictingEvidence }
      ] : [],
      disabled: selectedIds.includes(diagnosis.id)
        || (schema.diagnosisMode === "multiple" && selectedIds.length >= schema.maximumDiagnosisSelections),
      onClick: () => selectDiagnosis(diagnosis)
    }));
    const title = schema.diagnosisMode === "multiple"
      ? `Основной и дополнительный диагноз: выбрано ${selectedIds.length} из 2`
      : `Выберите один из ${availableDiagnoses.length} вариантов`;
    openChoice(schema.diagnosisMode === "multiple" ? "Предварительные диагнозы" : "Предварительный диагноз", title, items);
  }

  function openCommunication() {
    const patient = activePatient();
    if (!patient) return;
    if (!patient.selectedDiagnosisId) {
      setLog("Сначала сформулируйте предварительный диагноз.");
      return;
    }
    if (!patient.v2Visit) {
      openChoice("Объяснение", "Как объяснить владельцу результат?", legacyCommunicationOptions.map((option) => ({
        label: option.label,
        note: `${option.note} Потратит 4 минуты приема.`,
        onClick: () => selectCommunication(option)
      })));
      return;
    }
    const observedSigns = clinicalDecisions.observableOwnerSigns({
      anxiety: patient.anxiety,
      irritation: patient.irritation,
      comprehension: patient.ownerComprehension ?? Math.round(patient.ownerProfile.reliability * 100),
      budgetDiscussed: patient.budgetAsked,
      underestimatesRisk: patient.ownerProfile.id === "inattentive"
    });
    const items = communicationOptions.map((option) => ({
      label: option.label,
      note: patient.selectedCommunicationId === option.id
        ? "Сейчас выбран этот стиль."
        : `${option.timeCost} мин. Цель: ${option.communicationGoal}. Риск: ${option.risk}.`,
      sections: [{ label: "Наблюдаемые признаки", items: observedSigns }],
      onClick: () => selectCommunication(option)
    }));
    openChoice("Объяснение", "Как объяснить владельцу результат?", items);
  }

  function openTreatment() {
    const patient = activePatient();
    if (!patient) return;
    if (!patient.selectedDiagnosisId) {
      setLog("Сначала выберите предварительный диагноз из списка.");
      openDiagnosis();
      return;
    }
    if (patient.v2Visit && !patient.explanationDone) {
      setLog("Сначала объясните владельцу результат и дальнейшие действия.");
      openCommunication();
      return;
    }
    const availableTreatments = patient.v2Visit
      ? window.PET_CLINIC_GAME_ADAPTER_V2.treatmentOptionsFor(patient)
      : treatmentOptions;
    if (patient.v2Visit && availableTreatments.length === 1) {
      selectCarePlan(availableTreatments[0]);
      return;
    }
    const items = availableTreatments.map((treatment) => ({
      label: `${treatment.label} (+${treatment.fee} вет.)`,
      note: `${treatment.note} ${patient.budgetAsked
        ? diseaseFor(patient).baseFee + treatment.fee > patient.budget
          ? "Выше обсужденного бюджета."
          : "В обсужденный бюджет помещается."
        : "Бюджет владельца не обсуждался."}`,
      onClick: () => patient.v2Visit ? selectCarePlan(treatment) : treatPatient(treatment)
    }));
    openChoice(patient.v2Visit ? "Назначения" : "Лечение", patient.v2Visit ? "Какие назначения выдать?" : "Назначение владельцу", items);
  }

  function cyclePatient() {
    const waiting = waitingPatients();
    if (!waiting.length) return;
    const currentIndex = waiting.findIndex((patient) => patient.id === state.activeId);
    const next = waiting[(currentIndex + 1 + waiting.length) % waiting.length];
    openCase(next.id);
  }

  function renderQueue() {
    el.nextPatientCard.textContent = "";
    el.queueStrip.textContent = "";
    const waiting = waitingPatients();
    const inConsultation = state.queue.filter((patient) => isPatientInConsult(patient)).length;
    el.queueCountLabel.textContent = state.dayStarted
      ? `${waiting.length} ждут · ${inConsultation} в кабинете`
      : `${waiting.length} ждут · ${state.arrivalsToday} пришло`;
    if (!state.dayStarted) {
      el.queueForecast.textContent = state.arrivalsToday > 0
        ? `Дневной поток завершен: ${state.arrivalsToday} из ${state.plannedArrivalsToday} пришло`
        : "Поток появится после открытия клиники";
    } else if (state.arrivalSchedule.some((arrival) => arrival.template?.source !== "walkIn")) {
      const booked = state.arrivalSchedule.filter((arrival) => arrival.template?.source !== "walkIn");
      el.queueForecast.textContent = `${state.arrivalsToday}/${state.plannedArrivalsToday} пришло · записано ещё ${booked.length} · следующий приём в ${formatTime(booked[0].minute)}`;
    } else {
      el.queueForecast.textContent = `${state.arrivalsToday}/${state.plannedArrivalsToday} пришло · все запланированные пациенты уже здесь`;
    }
    waiting.forEach((patient, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `queue-card${patient.id === state.activeId ? " active" : ""}`;
      const portrait = document.createElement("canvas");
      portrait.className = "queue-card-portrait";
      portrait.width = 48;
      portrait.height = 48;
      drawQueuePortrait(portrait, patient.species);
      const copy = document.createElement("div");
      copy.className = "queue-card-copy";
      const title = document.createElement("strong");
      title.textContent = `${patient.animal} • ${speciesLabels[patient.species]}`;
      const note = document.createElement("span");
      note.className = "queue-urgency";
      note.textContent = patient.eventLabel
        ? `СОБЫТИЕ · ${patient.eventLabel}`
        : patient.selectedUrgency === "urgent"
        ? `СРОЧНО · ждет ${Math.max(1, Math.round(patient.age))} мин.`
        : patient.returnVisit ? "повторное обращение" : `Ждет ${Math.max(1, Math.round(patient.age))} мин.`;
      if (patient.selectedUrgency === "urgent") button.classList.add("urgent");
      const owner = document.createElement("span");
      owner.className = "queue-complaint";
      owner.textContent = `Жалоба: ${patient.complaints[0]}`;
      const observation = document.createElement("span");
      observation.className = `queue-observation stage-${patient.waitingStage}`;
      observation.textContent = waitingObservation(patient);
      const bar = document.createElement("div");
      bar.className = "patience-bar";
      const fill = document.createElement("i");
      fill.style.width = `${patient.mood}%`;
      bar.appendChild(fill);
      copy.append(title, note, owner, observation);
      button.append(portrait, copy, bar);
      button.addEventListener("click", () => openCase(patient.id));
      if (index === 0) {
        const nextClone = button.cloneNode(true);
        drawQueuePortrait(nextClone.querySelector("canvas"), patient.species);
        el.nextPatientCard.appendChild(nextClone);
      }
      el.queueStrip.appendChild(button);
    });
    const nextButton = el.nextPatientCard.querySelector(".queue-card");
    if (nextButton && waiting[0]) nextButton.addEventListener("click", () => openCase(waiting[0].id));
    if (!waiting.length) {
      const nextBooked = state.arrivalSchedule.find((arrival) => arrival.template?.source !== "walkIn");
      if (state.dayStarted && nextBooked) {
        const card = document.createElement("div");
        card.className = "next-booking-card";
        const time = document.createElement("strong");
        time.textContent = `Следующий приём в ${formatTime(nextBooked.minute)}`;
        const patient = document.createElement("span");
        patient.textContent = `${nextBooked.template.animal} · ${speciesLabels[nextBooked.template.species]}`;
        const type = document.createElement("span");
        type.textContent = nextBooked.template.returnVisit ? "Повторный приём" : "Первичный приём";
        const reason = document.createElement("span");
        reason.textContent = `Причина записи: ${nextBooked.template.bookingLabel}`;
        card.append(time, patient, type, reason);
        el.nextPatientCard.appendChild(card);
      } else {
        const empty = document.createElement("div");
        empty.className = "queue-locked";
        empty.textContent = state.dayStarted ? "Записей больше нет" : "Очередь пуста";
        el.nextPatientCard.appendChild(empty);
      }
    }
  }

  function drawQueuePortrait(targetCanvas, species) {
    if (!targetCanvas) return;
    const targetContext = targetCanvas.getContext("2d");
    targetContext.imageSmoothingEnabled = false;
    targetContext.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    targetContext.save();
    targetContext.translate(12, 11);
    targetContext.scale(0.9, 0.9);
    drawAnimalOnContext(targetContext, species);
    targetContext.restore();
  }

  function renderClinicalList(target, values, emptyText) {
    target.textContent = "";
    (values?.length ? values : [emptyText]).forEach((value) => {
      const li = document.createElement("li");
      li.textContent = value;
      target.appendChild(li);
    });
  }

  function renderCase() {
    const patient = activePatient();
    if (!patient) {
      el.caseWindow.classList.add("hidden");
      el.tutorialGuide.classList.add("hidden");
      return;
    }
    const clinicalScrollTop = el.clinicalMap?.parentElement?.scrollTop || 0;
    normalizeVisitPatient(patient);
    el.caseWindow.classList.toggle("staged-completion", Boolean(patient.v2Visit));
    el.caseWindow.classList.toggle("guided-map", Boolean(patient.v2Visit));
    const guidedPosition = patient.v2Visit ? guidedVisitPosition(patient) : null;
    el.caseStage.textContent = patient.returnVisit ? "Повторный прием" : "Кабинет врача";
    el.caseTitle.textContent = `${patient.animal} · ${speciesLabels[patient.species]} · ${patient.sex} · ${patient.ageYears} г.`;
    el.caseOwner.textContent = `Владелец: ${patient.owner}`;
    el.caseUrgencyBtn.textContent = `Срочность: ${clinicalUrgencyLabel(patient)}`;
    el.caseUrgencyBtn.classList.toggle("urgent", ["urgent", "emergency"].includes(patient.clinicalUrgency));
    el.caseDuration.textContent = `Прием длится: ${patient.visitTimeUsed} мин.`;
    el.ownerComplaint.textContent = patient.v2Visit
      ? patient.v2Visit.complaint.text
      : patient.returnVisit
      ? `«После прошлого лечения не стало нормально. ${patient.complaints.join(", ")}.»`
      : `«${patient.ownerLead ? `${patient.ownerLead}. ` : ""}${patient.complaints.join(", ")}.»`;
    const requiredUnknown = patient.v2Visit
      ? patient.v2Visit.medicalContent.historyQuestions
        .filter((question) => question.required && !patient.asked[question.id])
        .map((question) => question.buttonText)
      : [];
    const optionalUnknown = patient.v2Visit
      ? patient.v2Visit.medicalContent.historyQuestions
        .filter((question) => !question.required && !patient.asked[question.id])
        .map((question) => question.buttonText)
      : [];
    if (!patient.v2Visit && !patient.asked.duration && !patient.asked.start) requiredUnknown.push("Когда точно начались симптомы");
    if (!patient.v2Visit && !patient.asked.previous) requiredUnknown.push("Были ли подобные эпизоды");
    if (!patient.v2Visit && !patient.asked.parasite) requiredUnknown.push("Проводились ли обработки");
    if (!patient.v2Visit && patient.flags.oldDrops && !patient.asked.medications) requiredUnknown.push("Какие препараты уже применяли дома");
    if (!patient.budgetAsked) optionalUnknown.push("Есть ли ограничения по бюджету");
    renderClinicalList(el.unknownList, requiredUnknown, "Обязательные вопросы уточнены.");
    renderClinicalList(el.optionalUnknownList, optionalUnknown, "Дополнительных вопросов нет.");
    renderClinicalList(el.historyList, patient.clinicalRecord.history, "Ответы пока не получены.");
    renderClinicalList(el.examList, patient.clinicalRecord.physicalExam, "Осмотр ещё не проводился.");
    renderClinicalList(el.testList, patient.clinicalRecord.diagnosticTests, "Исследования ещё не проводились.");
    const assessment = patient.generalExamDone
      ? [`Срочность: ${clinicalUrgencyLabel(patient)}.`, ...patient.clinicalRecord.clinicalInterpretation]
      : ["Срочность требует оценки после общего осмотра.", ...patient.clinicalRecord.clinicalInterpretation];
    renderClinicalList(el.assessmentList, assessment, "Клиническая оценка ещё не сформирована.");
    const decisionReview = patient.immediateDecisionReview || diagnosisReviewFor(patient);
    el.decisionReview.classList.toggle("hidden", !decisionReview);
    if (decisionReview) {
      el.reviewSelectedDiagnosis.textContent = decisionReview.selected;
      renderClinicalList(el.reviewConfirmed, decisionReview.confirmed, "Прямых подтверждений пока нет.");
      renderClinicalList(el.reviewUncertain, decisionReview.uncertain, "Дополнительная неопределённость не отмечена.");
      renderClinicalList(el.reviewSupporting, decisionReview.supporting, "Поддерживающие данные не выделены.");
      renderClinicalList(el.reviewMissing, decisionReview.missing, "Недостающие данные не выделены.");
      el.reviewAssessment.textContent = decisionReview.assessment;
      el.reviewTreatmentCoverage.textContent = decisionReview.treatmentCoverage === null || decisionReview.treatmentCoverage === undefined
        ? "Назначения ещё не сделаны."
        : `${Math.round(decisionReview.treatmentCoverage * 100)}%.`;
      el.reviewUnnecessaryTreatment.textContent = decisionReview.unnecessaryTreatment ? "Есть лишние действия." : "Лишних действий не выявлено.";
      el.reviewClinicalSafety.textContent = decisionReview.clinicalSafety === "safe" ? "Безопасное решение." : "Безопасность требует проверки.";
      el.reviewCommunicationQuality.textContent = decisionReview.communicationQuality || "Объяснение ещё не завершено.";
      el.reviewOwnerDecision.textContent = decisionReview.ownerDecision || "Решение по назначениям ещё не принято.";
    }
    renderClinicalList(el.planList, patient.clinicalRecord.carePlan, "Назначения ещё не сделаны.");
    const visitPercent = clamp((patient.visitTimeUsed / patient.visitTimeLimit) * 100, 0, 100);
    el.trustMeter.style.width = `${patient.trust}%`;
    el.tensionMeter.style.width = `${patient.anxiety}%`;
    el.irritationMeter.style.width = `${patient.irritation}%`;
    el.stressMeter.style.width = `${patient.stress}%`;
    el.visitTimeMeter.style.width = `${visitPercent}%`;
    el.patientFacts.innerHTML = `<strong>${patient.animal}</strong><span>${speciesLabels[patient.species]} · ${patient.sex} · ${patient.ageYears} г.</span><span>Состояние: ${patientStateLabel(patient)}</span>`;
    el.ownerName.textContent = patient.owner;
    el.ownerBudget.textContent = patient.budgetAsked
      ? `${Math.max(100, Math.floor((patient.budget - 60) / 50) * 50)}–${Math.ceil((patient.budget + 60) / 50) * 50} V`
      : "не обсуждался";
    el.ownerConsent.textContent = ownerStatusFor(patient);
    const selectedDiagnosisIds = Array.isArray(patient.selectedDiagnosisIds) && patient.selectedDiagnosisIds.length
      ? patient.selectedDiagnosisIds
      : patient.selectedDiagnosisId ? [patient.selectedDiagnosisId] : [];
    const selectedDiagnosis = selectedDiagnosisIds.map(diagnosisLabel).filter(Boolean).join(" + ");
    el.diagnosisChip.textContent = selectedDiagnosis
      ? `${selectedDiagnosisIds.length > 1 ? "Предварительные диагнозы" : "Предварительный диагноз"}: ${selectedDiagnosis}`
      : "Предварительный диагноз не выбран";
    const diagnosisButtonLabel = el.diagnosisBtn.querySelector("span");
    const diagnosisCount = el.diagnosisBtn.querySelector("small");
    if (diagnosisButtonLabel) diagnosisButtonLabel.textContent = patient.v2Visit ? "Выбрать предварительный диагноз" : "Предварительный диагноз";
    if (diagnosisCount) diagnosisCount.textContent = patient.v2Visit
      ? `${window.PET_CLINIC_GAME_ADAPTER_V2.diagnosisOptionsFor(patient, generatorRuntime.catalog).length} варианта`
      : "10 диагнозов";
    el.anamnesisBtn.disabled = false;
    el.generalExamBtn.disabled = patient.generalExamDone;
    el.localExamBtn.disabled = patient.localUsed >= MAX_LOCAL_EXAMS;
    el.diagnosisBtn.disabled = false;
    el.communicationBtn.disabled = selectedDiagnosisIds.length === 0;
    const supportsSample = !patient.v2Visit || patient.v2Visit.medicalContent.sampleActions.length > 0;
    const diagnosticOptions = patient.v2Visit ? diagnosticOptionsForPatient(patient) : [];
    const diagnosticTest = diagnosticOptions.find((test) => test.id === patient.pendingDiagnosticTestId) || diagnosticOptions[0];
    const supportsTest = !patient.v2Visit || diagnosticOptions.length > 0;
    if (patient.v2Visit) {
      const sampleAction = patient.v2Visit.medicalContent.sampleActions[0];
      el.anamnesisBtn.querySelector("span").textContent = "Собрать анамнез";
      el.generalExamBtn.querySelector("span").textContent = "Провести общий осмотр";
      el.localExamBtn.querySelector("span").textContent = patient.v2Visit.family === "ear" ? "Осмотреть уши" : "Провести целевой осмотр";
      el.sampleBtn.querySelector("span").textContent = sampleAction ? "Взять материал" : "Материал не требуется";
      el.microscopyBtn.querySelector("span").textContent = patient.pendingDiagnosticTestId
        ? "Выполнить согласованное исследование"
        : diagnosticTest?.classification === "low_value"
          ? "Дополнительное исследование не обязательно"
          : /микроскоп/iu.test(diagnosticTest?.label || "") ? "Предложить микроскопию" : "Предложить исследование";
      el.communicationBtn.querySelector("span").textContent = "Объяснить результат";
      el.communicationBtn.querySelector("small").textContent = "3–6 мин. · зависит от стиля";
      el.microscopyBtn.querySelector("small").textContent = diagnosticTest
        ? `${diagnosticTest.classificationLabel} · ${diagnosticTest.durationMinutes || 1} мин. · ${diagnosticTest.costVetcoins || 0} V`
        : "варианты недоступны";
    } else {
      el.sampleBtn.querySelector("span").textContent = "Взять материал";
      el.microscopyBtn.querySelector("span").textContent = "Микроскопия";
      el.microscopyBtn.querySelector("small").textContent = "7 мин. · доход 90 V";
    }
    el.sampleBtn.disabled = patient.sampleTaken || !supportsSample;
    const testRequiresSample = !patient.v2Visit || diagnosticTestRequiresSample(patient, diagnosticTest);
    el.microscopyBtn.disabled = diagnosticFlowResolved(patient)
      || (Boolean(patient.pendingDiagnosticTestId) && testRequiresSample && !patient.sampleTaken)
      || !supportsTest;
    el.treatmentBtn.querySelector("span").textContent = patient.v2Visit ? "Сделать назначения" : "Назначить лечение";
    el.treatmentBtn.querySelector("small").textContent = patient.v2Visit
      ? patient.v2Visit.medicalContent.planOptions.length === 1 ? "выполнить утверждённый план" : "выбрать назначения"
      : "завершить приём";
    el.treatmentBtn.disabled = patient.v2Visit
      ? !patient.explanationDone || patient.carePlanAgreed
      : selectedDiagnosisIds.length === 0;
    el.finishVisitBtn.classList.toggle("hidden", !patient.v2Visit);
    el.finishVisitBtn.disabled = !patient.carePlanAgreed;
    document.querySelectorAll(".case-actions button").forEach((button) => button.classList.remove("current-action"));
    if (guidedPosition) {
      renderGuidedClinicalMap(patient, guidedPosition);
      guidedActionButton(guidedPosition.action)?.classList.add("current-action");
    }
    const guided = tutorialPatient(patient);
    const tutorialStep = guided ? currentTutorialStep() : null;
    const tutorialActions = [
      [el.anamnesisBtn, "history"],
      [el.generalExamBtn, "general_exam"],
      [el.localExamBtn, "target_exam"],
      [el.sampleBtn, "sample"],
      [el.microscopyBtn, "diagnostic_test"],
      [el.diagnosisBtn, "preliminary_diagnosis"],
      [el.communicationBtn, "explanation"],
      [el.treatmentBtn, "plan"],
      [el.finishVisitBtn, "finish"]
    ];
    if (tutorialStep) {
      const copy = tutorialStepCopy(patient, tutorialStep);
      el.tutorialTitle.textContent = copy.title;
      el.tutorialText.textContent = copy.text;
      el.tutorialResult.textContent = patient.tutorialResult || "";
      el.tutorialResult.classList.toggle("hidden", !patient.tutorialResult);
      el.tutorialGuide.classList.remove("hidden");
      el.caseUrgencyBtn.disabled = true;
      tutorialActions.forEach(([button, action]) => {
        const allowed = tutorialAllows(action);
        button.disabled = button.disabled || !allowed;
        button.classList.toggle("tutorial-focus", allowed);
      });
    } else {
      el.tutorialGuide.classList.add("hidden");
      el.tutorialResult.classList.add("hidden");
      el.caseUrgencyBtn.disabled = Boolean(patient.v2Visit) || !patient.generalExamDone;
      tutorialActions.forEach(([button]) => button.classList.remove("tutorial-focus"));
    }
    document.querySelectorAll(".stage-tabs button").forEach((button) => {
      button.classList.remove("active");
      button.disabled = Boolean(patient.v2Visit);
    });
    const stage = guidedPosition?.stage || (patient.carePlanAgreed || patient.selectedCommunicationId ? "discharge"
      : patient.selectedDiagnosisId ? "decision"
        : patient.microscopyDone || patient.sampleTaken ? "research"
          : patient.generalExamDone || patient.localUsed ? "exam"
            : Object.keys(patient.asked).length ? "anamnesis" : "complaint");
    document.querySelector(`.stage-tabs button[data-stage="${stage}"]`)?.classList.add("active");
    el.developerData.textContent = [
      `Истинный диагноз: ${diseaseFor(patient).name}`,
      `Истинная срочность: ${patient.urgency === "urgent" ? "высокая" : "обычная"}`,
      `Тип владельца: ${patient.ownerProfile.label}`,
      `Точный бюджет: ${patient.budget} V`,
      `Надежность назначений: ${Math.round(patient.ownerProfile.reliability * 100)}%`,
      `Диагностические очки: ${patient.dxPoints}`,
      `Врач смены: ${currentDoctor().name}, усталость ${Math.round(currentDoctor().fatigue)}%`
    ].join("\n");
    drawPortrait(patient);
    if (el.clinicalMap?.parentElement) el.clinicalMap.parentElement.scrollTop = clinicalScrollTop;
  }

  function renderCampaign() {
    const plan = currentPlan();
    el.campaignProgress.textContent = plan
      ? `Глава 1 · день ${plan.chapterDay}/${campaignDayCount()} · кампания ${state.day}/30`
      : `Свободный режим · день ${state.day}`;
    el.dayTitle.textContent = plan ? plan.title : "Клиника продолжает работу";
    el.dayGoalsList.textContent = "";
    const goals = plan ? plan.goals : [];
    goals.forEach((goal) => {
      const row = document.createElement("div");
      row.className = `goal-row${goalComplete(goal) ? " complete" : ""}`;
      row.textContent = `${goal.label}: ${goalProgress(goal)}/${goal.target}`;
      el.dayGoalsList.appendChild(row);
    });
    if (!goals.length) {
      const row = document.createElement("div");
      row.className = "goal-row complete";
      row.textContent = "Свободная работа клиники";
      el.dayGoalsList.appendChild(row);
    }
    el.goalScore.textContent = `${goals.filter(goalComplete).length}/${goals.length}`;
  }

  function renderHud() {
    const doctor = currentDoctor();
    el.moneyValue.textContent = formatMoney(state.money);
    el.todayRevenue.textContent = `+${formatMoney(state.revenueToday)} V`;
    el.dateValue.textContent = `День ${state.day}/30`;
    el.timeValue.textContent = formatClinicTime(state.minute);
    el.closingTime.textContent = `${Math.max(0, Math.ceil((state.dayEnd - state.minute) / 60))} ч.`;
    const tierMetrics = isTier01V2();
    const displayedTrust = tierMetrics ? state.ownerTrust : state.reputation;
    el.ownerTrustTitle.textContent = tierMetrics ? "Доверие владельцев" : "Репутация клиники";
    el.reputationMeter.style.width = `${displayedTrust}%`;
    el.reputationValue.textContent = `${displayedTrust.toFixed(1)} / 100`;
    el.clinicalReliabilityRow.classList.toggle("hidden", !tierMetrics);
    el.clinicalReliabilityMeterTrack.classList.toggle("hidden", !tierMetrics);
    if (tierMetrics) {
      el.clinicalReliabilityMeter.style.width = `${state.clinicalReliability}%`;
      el.clinicalReliabilityValue.textContent = `${state.clinicalReliability.toFixed(1)} / 100`;
    }
    const reputationDelta = reputationDeltaToday();
    const ledger = currentDailyLedger();
    const lastReputationEvent = tierMetrics
      ? ledger?.ownerTrustEvents?.[ledger.ownerTrustEvents.length - 1]
      : state.reputationEvents[state.reputationEvents.length - 1];
    el.reputationLabel.textContent = lastReputationEvent
      ? `${reputationDelta >= 0 ? "+" : ""}${reputationDelta.toFixed(1)} сегодня · ${lastReputationEvent.reason}`
      : "Сегодня без изменений";
    el.queueValue.textContent = `${waitingPatients().length} / 12`;
    el.doctorHudName.textContent = state.dayStarted ? doctor.shortName : "Смена не открыта";
    el.doctorFatigue.textContent = `${Math.round(doctor.fatigue)}%`;
    el.doctorFatigueMeter.style.width = `${doctor.fatigue}%`;
    if (tierMetrics && campaignMechanics) {
      const effect = campaignMechanics.fatigueEffect(doctor.fatigue);
      const forecast = fatigueForecastFor(doctor, null);
      const recovery = campaignMechanics.expectedRecovery(doctor.fatigue, 1);
      el.doctorFatigueEffect.textContent = effect.label;
      el.doctorFatigueForecast.textContent = state.dayStarted
        ? `прогноз: ${Math.round(forecast.projected)}% · после отдыха: ${Math.round(recovery.afterRest)}%`
        : `после дня отдыха: ${Math.round(recovery.afterRest)}%`;
    } else {
      el.doctorFatigueEffect.textContent = "";
      el.doctorFatigueForecast.textContent = "";
    }
    el.pauseBtn.textContent = state.paused ? "▶" : "II";
    el.speedBtn.textContent = `${state.speed}x`;
    el.speedBtn.title = maxAllowedSpeed() < 4
      ? `Скорость ограничена до ${maxAllowedSpeed()}x условиями обучения и очереди`
      : "Скорость";
    el.messageLog.textContent = `${formatClinicTime(state.minute)} · ${state.log}`;
  }

  function renderAll() {
    renderQueue();
    renderCase();
    renderCampaign();
    renderHud();
    drawClinic();
  }

  function drawClinic() {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    ctx.save();
    ctx.translate(CLINIC_VIEW.x, CLINIC_VIEW.y);
    ctx.scale(CLINIC_VIEW.scale, CLINIC_VIEW.scale);
    drawClinicShell();
    drawCharacters();
    drawFloatingLabels();
    ctx.restore();
  }

  function drawBackground() {
    ctx.fillStyle = "#1e4932";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 24) {
      for (let x = 0; x < canvas.width; x += 24) {
        ctx.fillStyle = (x / 24 + y / 24) % 2 ? "#23543a" : "#275b3e";
        ctx.fillRect(x, y, 24, 24);
      }
    }
    ctx.fillStyle = "#173b29";
    ctx.fillRect(0, 0, canvas.width, 88);
    for (let x = 18; x < canvas.width; x += 78) {
      ctx.fillStyle = "#2d6844";
      ctx.fillRect(x, 20, 50, 54);
      ctx.fillRect(x - 10, 38, 70, 22);
    }
    const pathX = CLINIC_VIEW.x + 885 * CLINIC_VIEW.scale;
    const pathY = CLINIC_VIEW.y + 620 * CLINIC_VIEW.scale;
    const pathWidth = 94 * CLINIC_VIEW.scale;
    ctx.fillStyle = "#6f7d84";
    ctx.fillRect(pathX, pathY, pathWidth, canvas.height - pathY);
    ctx.fillStyle = "#86949b";
    ctx.fillRect(pathX + 14, pathY, pathWidth - 28, canvas.height - pathY);
    ctx.fillStyle = "#b8c3c8";
    ctx.fillRect(pathX + 14, pathY, pathWidth - 28, 5);
  }

  function drawFlowerBed(x, y, width) {
    ctx.fillStyle = "#163b28";
    ctx.fillRect(x, y, width, 34);
    ctx.fillStyle = "#32714a";
    for (let dx = 8; dx < width - 8; dx += 20) {
      ctx.fillRect(x + dx, y + 8 + (dx % 3), 12, 18);
      ctx.fillStyle = ["#f4cf58", "#ed7b7b", "#91cce0"][Math.floor(dx / 20) % 3];
      ctx.fillRect(x + dx + 3, y + 5, 6, 6);
      ctx.fillStyle = "#32714a";
    }
  }

  function drawClinicShell() {
    ctx.fillStyle = "rgba(7,20,18,.42)";
    ctx.fillRect(43, 83, 1182, 568);
    drawRoom(70, 90, 560, 240, "#d8a4a5", "Кабинет врача");
    drawRoom(630, 90, 570, 240, "#b9a5d2", "Лаборатория");
    ctx.fillStyle = "#aeb8bd";
    ctx.fillRect(70, 330, 1130, 55);
    drawTiles(70, 330, 1130, 55, "#aeb8bd", "#9faab0");
    ctx.fillStyle = "#53616a";
    ctx.font = "bold 11px Trebuchet MS";
    ctx.fillText("КОРИДОР", 602, 362);
    drawRoom(70, 385, 620, 235, "#a9c8a8", "Ожидание");
    drawRoom(690, 385, 510, 235, "#c8c5b7", "Вход и запись");
    drawReception(915, 455);
    drawExamDesk(225, 185);
    drawMicroscope(880, 180);
    drawClinicFixtures();
    drawBenches();
    drawPlants();
    drawDoors();
    drawEntrance();
    drawFlowerBed(110, 640, 210);
    drawFlowerBed(1030, 640, 150);
  }

  function drawRoom(x, y, w, h, floor, label) {
    ctx.fillStyle = "#485963";
    ctx.fillRect(x - 12, y - 18, w + 26, h + 32);
    ctx.fillStyle = "#dfe8eb";
    ctx.fillRect(x - 7, y - 13, w + 14, h + 20);
    ctx.fillStyle = floor;
    ctx.fillRect(x, y, w, h);
    drawTiles(x, y, w, h, floor, shadeColor(floor, -10));
    ctx.fillStyle = "#edf3f5";
    ctx.fillRect(x, y, w, 13);
    ctx.fillStyle = "#c8d5da";
    ctx.fillRect(x, y + 13, w, 5);
    ctx.fillStyle = "#f5f8f9";
    ctx.fillRect(x, y, 8, h);
    ctx.fillStyle = "#40515b";
    ctx.fillRect(x + w - 5, y, 5, h);
    const labelWidth = Math.max(132, label.length * 8 + 22);
    ctx.fillStyle = "rgba(20,43,61,.92)";
    ctx.fillRect(x + 18, y + 20, labelWidth, 28);
    ctx.fillStyle = "#91a8b5";
    ctx.fillRect(x + 18, y + 45, labelWidth, 3);
    ctx.fillStyle = "#f4fbff";
    ctx.font = "bold 14px Trebuchet MS";
    ctx.fillText(label, x + 28, y + 39);
  }

  function shadeColor(hex, amount) {
    const value = Number.parseInt(hex.slice(1), 16);
    const red = clamp((value >> 16) + amount, 0, 255);
    const green = clamp(((value >> 8) & 255) + amount, 0, 255);
    const blue = clamp((value & 255) + amount, 0, 255);
    return `rgb(${red},${green},${blue})`;
  }

  function drawTiles(x, y, w, h, colorA = "#aeb8bd", colorB = "#9faab0") {
    const tileW = 32;
    const tileH = 24;
    for (let ty = y; ty < y + h; ty += tileH) {
      for (let tx = x; tx < x + w; tx += tileW) {
        ctx.fillStyle = ((tx - x) / tileW + (ty - y) / tileH) % 2 ? colorA : colorB;
        ctx.fillRect(tx, ty, Math.min(tileW, x + w - tx), Math.min(tileH, y + h - ty));
        ctx.strokeStyle = "rgba(255,255,255,.24)";
        ctx.strokeRect(tx, ty, Math.min(tileW, x + w - tx), Math.min(tileH, y + h - ty));
      }
    }
  }

  function drawExamDesk(x, y) {
    drawFurniture(x, y + 32, 190, 54, "#75afbd", "#477987");
    ctx.fillStyle = "#dff7fb";
    ctx.fillRect(x + 14, y + 43, 162, 10);
    ctx.fillStyle = "#5f8f9d";
    ctx.fillRect(x + 22, y + 86, 12, 25);
    ctx.fillRect(x + 156, y + 86, 12, 25);
    drawFurniture(x + 250, y - 28, 118, 54, "#81593f", "#523824");
    ctx.fillStyle = "#d5edf4";
    ctx.fillRect(x + 274, y - 20, 36, 24);
    ctx.fillStyle = "#203746";
    ctx.fillRect(x + 270, y - 24, 44, 7);
    ctx.fillStyle = "#f2f6f7";
    ctx.fillRect(x + 328, y - 12, 22, 29);
  }

  function drawMicroscope(x, y) {
    drawFurniture(x - 165, y + 35, 330, 54, "#d7e4e7", "#8b9da5");
    ctx.fillStyle = "#263744";
    ctx.fillRect(x - 18, y - 8, 16, 56);
    ctx.fillRect(x - 32, y + 39, 54, 11);
    ctx.fillStyle = "#edf8fa";
    ctx.fillRect(x - 4, y - 1, 31, 20);
    ctx.fillStyle = "#55b8d0";
    ctx.fillRect(x + 20, y + 8, 11, 30);
    ctx.fillStyle = "#677c86";
    ctx.fillRect(x + 55, y + 50, 72, 22);
    ctx.fillStyle = "#e9f1f3";
    ctx.fillRect(x + 61, y + 54, 60, 14);
  }

  function drawReception(x, y) {
    drawFurniture(x, y, 104, 58, "#8a684f", "#594532");
    ctx.fillStyle = "#edf6f8";
    ctx.fillRect(x + 32, y - 31, 42, 31);
    ctx.fillStyle = "#18364c";
    ctx.fillRect(x + 38, y - 25, 30, 18);
    ctx.fillStyle = "#f2cc69";
    ctx.fillRect(x + 12, y + 14, 26, 13);
    ctx.fillStyle = "#eef7f9";
    ctx.font = "bold 8px Trebuchet MS";
    ctx.fillText("ЗАПИСЬ", x + 51, y + 27);
  }

  function drawClinicFixtures() {
    drawWindow(260, 105, 128);
    drawWindow(860, 105, 150);
    drawWallCabinet(92, 150, 90, 44, "ПЕРВАЯ ПОМОЩЬ");
    drawPoster(535, 142, "УХО", "ОСМОТР");
    drawSink(105, 258);
    drawScale(485, 282);
    drawInstrumentTrolley(470, 225);
    drawStool(430, 285, "#4d91aa");
    drawWallCabinet(660, 145, 92, 42, "МАТЕРИАЛ");
    drawShelf(1080, 135);
    drawTallStorage(655, 208);
    drawStool(1030, 275, "#8d78aa");
    [0, 1, 2, 3].forEach((index) => {
      ctx.fillStyle = ["#e95d67", "#f2cc56", "#62b985", "#6caed1"][index];
      ctx.fillRect(735 + index * 18, 260 - index * 3, 10, 18 + index * 3);
      ctx.fillStyle = "#eef9fc";
      ctx.fillRect(734 + index * 18, 256 - index * 3, 12, 5);
    });
    drawPoster(560, 415, "ПРИЕМ", "ПО ОЧЕРЕДИ");
    drawWaterCooler(620, 480);
    drawClock(1150, 425);
    drawNoticeBoard(735, 430);
    drawWallCabinet(1060, 480, 82, 44, "ДОКУМЕНТЫ");
    ctx.fillStyle = "#52646d";
    ctx.fillRect(855, 590, 155, 18);
    ctx.fillStyle = "#70838c";
    ctx.fillRect(865, 594, 135, 10);
  }

  function drawWindow(x, y, width) {
    ctx.fillStyle = "#314954";
    ctx.fillRect(x, y, width, 34);
    ctx.fillStyle = "#bfe2eb";
    ctx.fillRect(x + 5, y + 5, width - 10, 23);
    ctx.fillStyle = "#eaf7fa";
    ctx.fillRect(x + 10, y + 8, width - 20, 5);
    ctx.fillStyle = "#66828d";
    ctx.fillRect(x + width / 2 - 2, y + 5, 4, 23);
  }

  function drawInstrumentTrolley(x, y) {
    ctx.fillStyle = "#8499a2";
    ctx.fillRect(x, y, 56, 7);
    ctx.fillRect(x, y + 28, 56, 7);
    ctx.fillRect(x + 4, y + 6, 5, 40);
    ctx.fillRect(x + 47, y + 6, 5, 40);
    ctx.fillStyle = "#dcecef";
    ctx.fillRect(x + 7, y + 9, 42, 17);
    ctx.fillStyle = "#d85e63";
    ctx.fillRect(x + 12, y + 13, 7, 9);
    ctx.fillStyle = "#67b8ce";
    ctx.fillRect(x + 24, y + 13, 7, 9);
    ctx.fillStyle = "#293d49";
    ctx.fillRect(x + 2, y + 44, 10, 5);
    ctx.fillRect(x + 44, y + 44, 10, 5);
  }

  function drawTallStorage(x, y) {
    ctx.fillStyle = "#536973";
    ctx.fillRect(x, y, 58, 78);
    ctx.fillStyle = "#dce9ec";
    ctx.fillRect(x + 5, y + 5, 48, 68);
    ctx.fillStyle = "#9eb1b8";
    ctx.fillRect(x + 8, y + 27, 42, 4);
    ctx.fillRect(x + 8, y + 49, 42, 4);
    ["#6eb7cf", "#efca65", "#8ac595", "#d88182", "#b49bd0", "#7c9eab"].forEach((color, index) => {
      ctx.fillStyle = color;
      const row = Math.floor(index / 3);
      const col = index % 3;
      ctx.fillRect(x + 11 + col * 13, y + 10 + row * 23, 8, 13);
    });
  }

  function drawStool(x, y, color) {
    ctx.fillStyle = "rgba(20,35,40,.18)";
    ctx.fillRect(x - 13, y + 12, 32, 6);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#546872";
    ctx.fillRect(x - 2, y + 10, 4, 15);
    ctx.fillRect(x - 12, y + 23, 24, 3);
  }

  function drawWallCabinet(x, y, w, h, label) {
    ctx.fillStyle = "rgba(13,31,46,.2)";
    ctx.fillRect(x + 5, y + 6, w, h);
    ctx.fillStyle = "#edf8fb";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#304958";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.stroke();
    ctx.fillStyle = "#2d84b7";
    ctx.fillRect(x + w / 2 - 2, y + 12, 4, 17);
    ctx.fillStyle = "#40596a";
    ctx.font = "bold 7px Trebuchet MS";
    ctx.fillText(label, x + 5, y + h - 5);
  }

  function drawPoster(x, y, top, bottom) {
    ctx.fillStyle = "#f7fbf4";
    ctx.fillRect(x, y, 64, 48);
    ctx.strokeStyle = "#79583d";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, 64, 48);
    ctx.fillStyle = "#2d81b5";
    ctx.fillRect(x + 7, y + 7, 12, 12);
    ctx.fillStyle = "#edf8fb";
    ctx.fillRect(x + 11, y + 8, 4, 10);
    ctx.fillRect(x + 8, y + 11, 10, 4);
    ctx.fillStyle = "#40576a";
    ctx.font = "bold 8px Trebuchet MS";
    ctx.fillText(top, x + 24, y + 17);
    ctx.font = "7px Trebuchet MS";
    ctx.fillText(bottom, x + 7, y + 36);
  }

  function drawSink(x, y) {
    ctx.fillStyle = "#d8eef3";
    ctx.fillRect(x, y, 58, 27);
    ctx.strokeStyle = "#314958";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 58, 27);
    ctx.fillStyle = "#9cc8d2";
    ctx.fillRect(x + 11, y + 7, 36, 13);
    ctx.fillStyle = "#617b86";
    ctx.fillRect(x + 25, y - 10, 7, 12);
    ctx.fillRect(x + 29, y - 10, 12, 5);
  }

  function drawScale(x, y) {
    ctx.fillStyle = "#a8cbd3";
    ctx.fillRect(x, y, 55, 18);
    ctx.strokeStyle = "#314958";
    ctx.strokeRect(x, y, 55, 18);
    ctx.fillStyle = "#f0f7f8";
    ctx.fillRect(x + 19, y + 4, 17, 8);
  }

  function drawShelf(x, y) {
    ctx.fillStyle = "#5d493c";
    ctx.fillRect(x, y, 88, 8);
    ctx.fillRect(x, y + 36, 88, 8);
    ctx.fillRect(x, y, 6, 44);
    ctx.fillRect(x + 82, y, 6, 44);
    ["#d8edf2", "#78bad0", "#f2d472", "#8ac798"].forEach((color, index) => {
      ctx.fillStyle = color;
      ctx.fillRect(x + 11 + index * 17, y + 14, 12, 17);
    });
  }

  function drawWaterCooler(x, y) {
    ctx.fillStyle = "#e9f4f6";
    ctx.fillRect(x, y + 31, 35, 57);
    ctx.strokeStyle = "#405868";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y + 31, 35, 57);
    ctx.fillStyle = "#81d3e6";
    ctx.fillRect(x + 6, y, 23, 35);
    ctx.fillStyle = "#2c79a5";
    ctx.fillRect(x + 7, y + 43, 8, 5);
    ctx.fillStyle = "#df5b5b";
    ctx.fillRect(x + 20, y + 43, 8, 5);
  }

  function drawClock(x, y) {
    ctx.fillStyle = "#f7fbfc";
    ctx.beginPath();
    ctx.arc(x, y, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#314958";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 10);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 9, y + 5);
    ctx.stroke();
  }

  function drawNoticeBoard(x, y) {
    ctx.fillStyle = "#8a6547";
    ctx.fillRect(x, y, 85, 55);
    ctx.strokeStyle = "#4f3c30";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, 85, 55);
    [[8, 9, 27, 16], [44, 7, 31, 21], [13, 33, 54, 13]].forEach(([dx, dy, w, h], index) => {
      ctx.fillStyle = ["#f7f0ca", "#d8edf4", "#ffffff"][index];
      ctx.fillRect(x + dx, y + dy, w, h);
    });
  }

  function drawBenches() {
    const benches = [
      [145, 470],
      [390, 470],
      [145, 555],
      [390, 555]
    ];
    benches.forEach(([x, y]) => {
      drawFurniture(x, y, 135, 18, "#6fcf70", "#3e914b");
      ctx.fillStyle = "#a8bcc5";
      ctx.fillRect(x + 5, y - 15, 125, 13);
      ctx.fillStyle = "#8a99aa";
      ctx.fillRect(x + 4, y + 18, 6, 18);
      ctx.fillRect(x + 124, y + 18, 6, 18);
    });
  }

  function drawPlants() {
    [[600, 255], [1170, 272], [104, 548], [1160, 548]].forEach(([x, y]) => {
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
    drawDoorOpening(500, 315, 1);
    drawDoorOpening(850, 315, -1);
    drawDoorOpening(610, 370, -1);
    drawDoorOpening(760, 370, 1);
  }

  function drawDoorOpening(x, y, direction) {
    ctx.fillStyle = "#243743";
    ctx.fillRect(x, y, 58, 18);
    ctx.fillStyle = "#dce6eb";
    ctx.fillRect(x + 3, y + 2, 4, 16);
    ctx.fillRect(x + 51, y + 2, 4, 16);
    const hingeX = direction > 0 ? x + 7 : x + 51;
    const farX = hingeX + direction * 28;
    ctx.fillStyle = "#6d442c";
    ctx.beginPath();
    ctx.moveTo(hingeX, y + 9);
    ctx.lineTo(farX, y - 5);
    ctx.lineTo(farX, y - 55);
    ctx.lineTo(hingeX, y - 43);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#a66a3d";
    ctx.beginPath();
    ctx.moveTo(hingeX + direction * 4, y + 4);
    ctx.lineTo(farX - direction * 4, y - 7);
    ctx.lineTo(farX - direction * 4, y - 49);
    ctx.lineTo(hingeX + direction * 4, y - 39);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f0cf62";
    ctx.fillRect(farX - direction * 7 - 2, y - 29, 4, 4);
    ctx.strokeStyle = "rgba(56,39,31,.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(direction > 0 ? x + 10 : x + 48, y + 8, 39, direction > 0 ? -Math.PI / 2 : Math.PI, direction > 0 ? 0 : Math.PI * 1.5);
    ctx.stroke();
  }

  function drawEntrance() {
    ctx.fillStyle = "#96d3e3";
    ctx.fillRect(885, 570, 94, 50);
    ctx.strokeStyle = "#27465a";
    ctx.lineWidth = 4;
    ctx.strokeRect(885, 570, 94, 50);
    ctx.beginPath();
    ctx.moveTo(932, 570);
    ctx.lineTo(932, 620);
    ctx.stroke();
    ctx.fillStyle = "#465963";
    ctx.fillRect(874, 620, 116, 16);
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
    const doctor = currentDoctor();
    advanceDoctorMotion();
    drawPerson(Math.round(state.doctorScreenX), Math.round(state.doctorScreenY + idle), { shirt: doctor.color, pants: "#253c65", hair: doctor.hair, coat: true });

    state.queue.forEach((patient, index) => {
      const bob = Math.round(Math.sin(state.animationTime / 420 + index) * 1.5);
      advancePatientMotion(patient, index);
      const x = Math.round(patient.screenX);
      const y = Math.round(patient.screenY + bob);
      const color = ownerColor(index);
      drawPerson(x, y, color);
      drawAnimal(patient.species, x + 22, y + 17, patient.id === state.activeId);
      if (patient.returnVisit) drawBubble(x + 20, y - 42, "!");
    });
    state.departures.forEach((patient, index) => {
      advancePatientMotion(patient, index);
      const x = Math.round(patient.screenX);
      const y = Math.round(patient.screenY);
      drawPerson(x, y, ownerColor(patient.id));
      drawAnimal(patient.species, x + 22, y + 17, false);
    });
    state.departures = state.departures.filter((patient) => patient.motion !== "gone");
  }

  function startDoctorLabTrip() {
    state.doctorMotion = "toLab";
    state.doctorRouteIndex = 0;
    state.doctorRoute = [[500, 300], [525, 350], [825, 350], [850, 300], [875, 225]];
  }

  function advanceDoctorMotion() {
    if (state.doctorMotion === "labWorking" && state.animationTime >= state.doctorHoldUntil) {
      state.doctorMotion = "returning";
      state.doctorRouteIndex = 0;
      state.doctorRoute = [[850, 300], [825, 350], [525, 350], [500, 300], [430, 240]];
    }
    if (state.doctorRouteIndex < state.doctorRoute.length) {
      const [targetX, targetY] = state.doctorRoute[state.doctorRouteIndex];
      const dx = targetX - state.doctorScreenX;
      const dy = targetY - state.doctorScreenY;
      const distance = Math.hypot(dx, dy);
      if (distance <= 3.5) {
        state.doctorScreenX = targetX;
        state.doctorScreenY = targetY;
        state.doctorRouteIndex += 1;
        if (state.doctorRouteIndex >= state.doctorRoute.length) {
          if (state.doctorMotion === "toLab") {
            state.doctorMotion = "labWorking";
            state.doctorHoldUntil = state.animationTime + LAB_HOLD_MS;
          } else if (state.doctorMotion === "returning") {
            state.doctorMotion = "idle";
            state.doctorRoute = [];
          }
        }
      } else {
        const step = Math.min(DOCTOR_ROUTE_SPEED, distance);
        state.doctorScreenX += (dx / distance) * step;
        state.doctorScreenY += (dy / distance) * step;
      }
      return;
    }
    if (state.doctorMotion === "labWorking") return;
    const doctorTargetX = !el.caseWindow.classList.contains("hidden") ? 430 : 440;
    const doctorTargetY = !el.caseWindow.classList.contains("hidden") ? 240 : 190;
    state.doctorScreenX += (doctorTargetX - state.doctorScreenX) * 0.12;
    state.doctorScreenY += (doctorTargetY - state.doctorScreenY) * 0.12;
  }

  function advancePatientMotion(patient, index) {
    if (patient.route && patient.routeIndex < patient.route.length) {
      const [targetX, targetY] = patient.route[patient.routeIndex];
      const dx = targetX - patient.screenX;
      const dy = targetY - patient.screenY;
      const distance = Math.hypot(dx, dy);
      const step = Math.min(PATIENT_ROUTE_SPEED, distance);
      if (distance <= 3.3) {
        patient.screenX = targetX;
        patient.screenY = targetY;
        patient.routeIndex += 1;
        if (patient.routeIndex >= patient.route.length) {
          if (patient.motion === "arriving") {
            patient.motion = "waiting";
            visitState.markWaiting(patient);
            if (!state.activeId) state.activeId = patient.id;
            renderQueue();
            renderHud();
            persistGameState(true);
          }
          else if (patient.motion === "toCabinet") patient.motion = "inCabinet";
          else if (patient.motion === "leaving") patient.motion = "gone";
        }
      } else {
        patient.screenX += (dx / distance) * step;
        patient.screenY += (dy / distance) * step;
      }
      return;
    }
    if (patient.motion === "waiting") {
      const waitingSpots = [[215, 510], [460, 510], [215, 592], [460, 592], [575, 510], [575, 585]];
      const [targetX, targetY] = waitingSpots[index % waitingSpots.length];
      patient.screenX += (targetX - patient.screenX) * 0.14;
      patient.screenY += (targetY - patient.screenY) * 0.14;
    }
  }

  function drawFloatingLabels() {
    state.queue.forEach((patient, index) => {
      if (patient.id === state.activeId && !el.caseWindow.classList.contains("hidden")) return;
      if (patient.motion === "waiting" && patient.mood < 38) drawBubble(patient.screenX + 18, patient.screenY - 42, "ждет долго");
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
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.8, 0.8);
    x = 0;
    y = 0;
    const skin = options.skin || "#e2a184";
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.fillRect(x - 10, y + 31, 32, 7);
    ctx.fillStyle = options.pants || "#2c4365";
    ctx.fillRect(x - 2, y + 19, 8, 22);
    ctx.fillRect(x + 9, y + 19, 8, 22);
    ctx.fillStyle = "#26313b";
    ctx.fillRect(x - 5, y + 38, 11, 5);
    ctx.fillRect(x + 9, y + 38, 12, 5);
    ctx.fillStyle = options.coat ? "#f4fbff" : options.shirt;
    ctx.fillRect(x - 6, y + 3, 27, 23);
    if (options.coat) {
      ctx.fillStyle = "#8fc6dd";
      ctx.fillRect(x + 6, y + 4, 3, 21);
      ctx.fillStyle = "#2c79a5";
      ctx.fillRect(x + 13, y + 8, 5, 6);
    }
    ctx.fillStyle = skin;
    ctx.fillRect(x - 2, y - 17, 17, 17);
    ctx.fillStyle = options.hair || "#4a2d1f";
    ctx.fillRect(x - 4, y - 20, 21, 7);
    ctx.fillRect(x - 5, y - 14, 4, 9);
    ctx.fillStyle = "#111827";
    ctx.fillRect(x + 2, y - 10, 3, 3);
    ctx.fillRect(x + 10, y - 10, 3, 3);
    ctx.fillStyle = "#a85f50";
    ctx.fillRect(x + 6, y - 4, 5, 2);
    ctx.fillStyle = skin;
    ctx.fillRect(x - 12, y + 8, 6, 15);
    ctx.fillRect(x + 21, y + 8, 6, 15);
    ctx.restore();
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
    ctx.fillRect(27, 7, 3, 3);
    ctx.fillStyle = "#3b78a2";
    ctx.fillRect(12, 9, 14, 3);
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
    ctx.fillStyle = "#eef5d0";
    ctx.fillRect(18, 1, 2, 2);
    ctx.fillStyle = "#c95e66";
    ctx.fillRect(20, 7, 4, 2);
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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-13, 10, 7, 7);
    ctx.fillStyle = "#d69daf";
    ctx.fillRect(22, 8, 3, 2);
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
      persistGameState(true);
    });
    el.closeChoiceBtn.addEventListener("click", closeChoice);
    el.anamnesisBtn.addEventListener("click", openAnamnesis);
    el.generalExamBtn.addEventListener("click", doGeneralExam);
    el.localExamBtn.addEventListener("click", openLocalExam);
    el.sampleBtn.addEventListener("click", doSample);
    el.microscopyBtn.addEventListener("click", doMicroscopy);
    el.diagnosisBtn.addEventListener("click", openDiagnosis);
    el.caseUrgencyBtn.addEventListener("click", openTriage);
    el.communicationBtn.addEventListener("click", openCommunication);
    el.treatmentBtn.addEventListener("click", openTreatment);
    el.finishVisitBtn.addEventListener("click", finishVisit);
    el.pauseBtn.addEventListener("click", () => {
      if (gameSaveBlocked) {
        state.paused = true;
        renderHud();
        return;
      }
      state.paused = !state.paused;
      renderHud();
    });
    el.speedBtn.addEventListener("click", cycleSpeed);
    el.nextPatientBtn.addEventListener("click", cyclePatient);
    el.nextDayBtn.addEventListener("click", startNextDay);
    el.startShiftBtn.addEventListener("click", startShift);
    el.closeShiftBtn.addEventListener("click", () => requestShiftClose(false));
    el.extendShiftBtn.addEventListener("click", extendShift);
    el.transferQueueBtn.addEventListener("click", transferAndClose);
    el.finishShiftBtn.addEventListener("click", finishShift);
    el.developerBtn.addEventListener("click", () => el.developerPanel.classList.toggle("hidden"));
    el.closeDeveloperBtn.addEventListener("click", () => el.developerPanel.classList.add("hidden"));
    el.devResolvePatientBtn.addEventListener("click", debugResolveActivePatient);
    el.devFinishDayBtn.addEventListener("click", debugFinishDay);
    document.querySelectorAll(".stage-tabs button").forEach((button) => {
      button.addEventListener("click", () => {
        const handlers = {
          anamnesis: openAnamnesis,
          exam: doGeneralExam,
          research: () => {
            const patient = activePatient();
            if (!patient) return;
            if (patient.v2Visit && patient.v2Visit.medicalContent.sampleActions.length && !patient.sampleTaken) doSample();
            else openDiagnosticOffer();
          },
          decision: openDiagnosis,
          prescriptions: openCommunication,
          discharge: finishVisit
        };
        handlers[button.dataset.stage]?.();
      });
    });
    document.querySelectorAll(".stage-detail").forEach((button) => {
      button.addEventListener("click", () => {
        const stage = button.dataset.caseDetail;
        if (!stage) return;
        if (expandedClinicalStages.has(stage)) expandedClinicalStages.delete(stage);
        else expandedClinicalStages.add(stage);
        renderCase();
      });
    });
    canvas.addEventListener("click", () => {
      if (activePatient()) {
        openCase(state.activeId);
      }
    });
  }

  function tick(timestamp) {
    state.animationTime = timestamp;
    if (!state.lastTick) state.lastTick = timestamp;
    const delta = timestamp - state.lastTick;
    state.lastTick = timestamp;
    if (state.dayStarted && !state.paused && !state.modalOpen && !isReadingInterfaceOpen()) {
      const minutes = (delta / 1000) * state.speed * SIMULATION_MINUTES_PER_REAL_SECOND;
      state.minute += minutes;
      state.spawnMeter += minutes;
      addDoctorFatigue(minutes * 0.002);
      state.queue.forEach((patient) => {
      if (isPatientInConsult(patient)) return;
      patient.age += minutes;
      patient.mood = waitingMood(patient);
      updateWaitingState(patient, minutes);
      });
      removeLostPatients();
      maybeSpawn();
      if (state.minute >= state.dayEnd) {
        requestShiftClose(true);
      }
      renderAll();
      persistGameState(false);
    } else {
      drawClinic();
    }
    window.requestAnimationFrame(tick);
  }

  function resumeRestoredGame() {
    el.shiftWindow.classList.add("hidden");
    el.summaryWindow.classList.add("hidden");
    el.closeShiftWindow.classList.add("hidden");
    el.caseWindow.classList.add("hidden");
    el.choiceWindow.classList.add("hidden");

    if (state.phase === "summary") {
      state.modalOpen = true;
      state.paused = true;
      state.dayStarted = false;
      el.summaryTitle.textContent = state.summaryTitle || `День ${state.day} завершен`;
      el.summaryText.innerHTML = state.summaryHtml || "Смена завершена.";
      el.nextDayBtn.textContent = state.chapterComplete ? "Продолжить после главы" : "Планировать следующий день";
      el.summaryWindow.classList.remove("hidden");
      renderAll();
      return;
    }

    if (state.phase === "closing") {
      state.modalOpen = false;
      state.paused = false;
      requestShiftClose(true);
      renderAll();
      return;
    }

    if (state.phase === "running" && state.dayStarted) {
      state.modalOpen = false;
      const patient = activePatient();
      if (isPatientInConsult(patient)) {
        el.caseWindow.classList.remove("hidden");
        patient.motion = "inCabinet";
      }
      renderAll();
      return;
    }

    openShiftPlanning();
  }

  function init() {
    bindEvents();
    const restoreStatus = restoreGameState();
    if (restoreStatus === "restored") {
      resumeRestoredGame();
    } else {
      resetDayState();
      setLog(restoreStatus === "blocked"
        ? "Несовместимое сохранение этого режима не загружено и не перезаписано. Начата временная новая сессия."
        : "Выберите врача и режим работы перед открытием клиники.");
      openShiftPlanning();
    }
    window.requestAnimationFrame(tick);
  }

  function initBlockedGenerator(error) {
    bindEvents();
    blockGameForSaveError(error);
    state.modalOpen = true;
    el.shiftWindow.classList.add("hidden");
    el.messageLog.textContent = state.log;
    renderHud();
    drawClinic();
    window.requestAnimationFrame(tick);
  }

  window.PET_CLINIC_GENERATOR_READY
    .then((runtime) => {
      generatorRuntime = runtime;
      window.__PET_CLINIC_RUNTIME__ = generatorRuntime;
      if (runtime.initializationError) {
        console.error("Tier 01 v2 generator initialization failed; game remains paused.", runtime.initializationError);
        initBlockedGenerator(runtime.initializationError);
        return;
      }
      init();
    })
    .catch((error) => {
      console.error("Generator mode initialization failed; current mode retained.", error);
      generatorRuntime = { mode: "current", catalog: null, generator: null };
      window.__PET_CLINIC_RUNTIME__ = generatorRuntime;
      init();
    });
})();
