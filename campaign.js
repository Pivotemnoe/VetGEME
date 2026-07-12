(function () {
  "use strict";

  window.PET_CLINIC_CAMPAIGN = {
    doctors: [
      {
        id: "sokolova",
        name: "Вера Соколова",
        shortName: "Соколова",
        role: "ветеринарный врач",
        fatigue: 10,
        color: "#2d7fb8",
        hair: "#53372a",
        note: "Спокойно ведет тревожных владельцев."
      },
      {
        id: "morozov",
        name: "Алексей Морозов",
        shortName: "Морозов",
        role: "ветеринарный врач",
        fatigue: 6,
        color: "#397c68",
        hair: "#282421",
        note: "Быстро собирает анамнез и любит четкий план."
      }
    ],
    days: [
      {
        day: 1,
        chapterDay: 1,
        title: "Открытие клиники",
        briefing: "Первый день нужен не для скорости, а для полного и понятного приема.",
        goals: [
          { id: "treated", label: "Принять минимум 2 пациентов", target: 2 },
          { id: "completeExam", label: "Провести полный осмотр хотя бы одному", target: 1 }
        ],
        patients: [
          { diseaseId: "bacterialOtitis", profileId: "calm", animal: "Бакс", owner: "Зайцева", species: "dog", sex: "самец", ageYears: 4, flags: { durationDays: 7 } },
          { diseaseId: "inflammatoryOtitis", profileId: "calm", animal: "Мурка", owner: "Орлова", species: "cat", sex: "самка", ageYears: 3, flags: { trigger: "купание" } },
          { diseaseId: "bacterialOtitis", profileId: "budget", animal: "Фунтик", owner: "Иванова", species: "rabbit", sex: "самец", ageYears: 2, flags: { durationDays: 3 } }
        ]
      },
      {
        day: 2,
        chapterDay: 2,
        title: "Повторный визит",
        briefing: "Повторный прием проверяет, замечает ли врач новые детали и объясняет ли план.",
        goals: [
          { id: "returns", label: "Закрыть повторный прием", target: 1 },
          { id: "explained", label: "Объяснить план минимум 2 владельцам", target: 2 }
        ],
        patients: [
          { diseaseId: "bacterialOtitis", profileId: "careless", animal: "Бакс", owner: "Зайцева", species: "dog", sex: "самец", ageYears: 4, flags: { durationDays: 18, oldDrops: true }, returnVisit: true },
          { diseaseId: "miteOtitis", profileId: "anxious", animal: "Клевер", owner: "Петрова", species: "rabbit", sex: "самка", ageYears: 2, flags: { contact: "новый кролик" } },
          { diseaseId: "inflammatoryOtitis", profileId: "internet", animal: "Ричи", owner: "Макаров", species: "dog", sex: "самец", ageYears: 6, flags: { trigger: "домашняя чистка" } }
        ]
      },
      {
        day: 3,
        chapterDay: 3,
        title: "Версия владельца",
        briefing: "Владелец уверен, что зуд связан с кормом. Игрок должен отделить версию от фактов.",
        goals: [
          { id: "budget", label: "Обсудить бюджет минимум с 2 владельцами", target: 2 },
          { id: "targetExam", label: "Провести 2 целевых осмотра", target: 2 }
        ],
        patients: [
          { diseaseId: "dermatitis", profileId: "internet", animal: "Тайга", owner: "Лебедев", species: "dog", sex: "самка", ageYears: 5, ownerLead: "Это точно аллергия на корм", flags: { trigger: "после прогулки" } },
          { diseaseId: "dermatitis", profileId: "budget", animal: "Буся", owner: "Ким", species: "cat", sex: "самка", ageYears: 1, flags: { trigger: "после новой лежанки" } },
          { diseaseId: "dermatitis", profileId: "calm", animal: "Лада", owner: "Алиева", species: "dog", sex: "самка", ageYears: 8, flags: { trigger: "после прогулки" } }
        ]
      },
      {
        day: 4,
        chapterDay: 4,
        title: "Рвота и боль в животе",
        briefing: "Основная задача дня — оценить тяжесть рвоты и распознать подозрение на панкреатит без полноценной лаборатории.",
        goals: [
          { id: "completeExam", label: "Провести полный осмотр минимум 2 пациентам", target: 2 },
          { id: "explained", label: "Дать понятный план минимум 2 владельцам", target: 2 }
        ],
        patients: [
          { diseaseId: "pancreatitis", profileId: "anxious", animal: "Сема", owner: "Смирнов", species: "cat", sex: "самец", ageYears: 3, flags: { trigger: "резко сменили корм", vomitCount: 2 } },
          { diseaseId: "pancreatitis", profileId: "calm", animal: "Нора", owner: "Иванова", species: "dog", sex: "самка", ageYears: 9, flags: { trigger: "дали жирный кусочек" } },
          { diseaseId: "gastroenteritis", profileId: "careless", animal: "Рич", owner: "Орлова", species: "dog", sex: "самец", ageYears: 2, flags: { trigger: "украл еду со стола", vomitCount: 1 } }
        ]
      },
      {
        day: 5,
        chapterDay: 5,
        title: "Первый срочный пациент",
        briefing: "Кот не ходит в туалет. Игрок должен распознать риск обструкции и не задерживать помощь.",
        goals: [
          { id: "urgent", label: "Безопасно закрыть срочный случай", target: 1 },
          { id: "noLost", label: "Не потерять ни одного пациента из очереди", target: 1 }
        ],
        patients: [
          { diseaseId: "urinaryObstruction", profileId: "anxious", animal: "Рыжик", owner: "Петрова", species: "cat", sex: "самец", ageYears: 6, urgency: "urgent", flags: { lastUrineHours: 14 } },
          { diseaseId: "bacterialOtitis", profileId: "budget", animal: "Марс", owner: "Макаров", species: "dog", sex: "самец", ageYears: 4, flags: { durationDays: 4 } },
          { diseaseId: "gastroenteritis", profileId: "calm", animal: "Тучка", owner: "Ким", species: "cat", sex: "самка", ageYears: 2, flags: { trigger: "украла еду со стола", vomitCount: 1 } }
        ]
      }
    ]
  };
})();
