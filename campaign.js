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
        endMinute: 13 * 60,
        maxWaiting: 1,
        loadLabel: "низкая, учебная",
        goals: [
          { id: "treated", label: "Принять минимум 2 пациентов", target: 2 },
          { id: "completeExam", label: "Провести полный осмотр хотя бы одному", target: 1 },
          { id: "dischargePlan", label: "Завершить выписку с контрольным планом", target: 1 }
        ],
        patients: [
          { arrivalMinute: 8 * 60 + 10, source: "story", bookingLabel: "проблема с ухом", diseaseId: "bacterialOtitis", profileId: "calm", animal: "Бакс", owner: "Зайцева", species: "dog", sex: "самец", ageYears: 4, flags: { durationDays: 7 } },
          { arrivalMinute: 9 * 60 + 35, source: "booked", bookingLabel: "кожный зуд", diseaseId: "dermatitis", profileId: "anxious", animal: "Мурка", owner: "Орлова", species: "cat", sex: "самка", ageYears: 3, flags: { trigger: "после новой лежанки" } },
          { arrivalMinute: 11 * 60 + 15, source: "booked", bookingLabel: "однократная рвота", diseaseId: "gastroenteritis", profileId: "internet", animal: "Рекс", owner: "Иванова", species: "dog", sex: "самец", ageYears: 2, flags: { trigger: "украл еду со стола", vomitCount: 1 } }
        ]
      },
      {
        day: 2,
        chapterDay: 2,
        title: "Повторный визит",
        briefing: "Повторный прием проверяет, замечает ли врач новые детали и объясняет ли план.",
        fallbackTitle: "Неполный анамнез",
        fallbackBriefing: "Повторного контроля нет. День учит находить скрытые подробности в новом случае.",
        endMinute: 15 * 60,
        maxWaiting: 2,
        loadLabel: "умеренная",
        goals: [
          { id: "returns", label: "Закрыть повторный прием", target: 1 },
          { id: "explained", label: "Объяснить план минимум 2 владельцам", target: 2 }
        ],
        patients: [
          { arrivalMinute: 8 * 60 + 20, source: "return", bookingLabel: "повторный контроль", diseaseId: "bacterialOtitis", profileId: "careless", animal: "Бакс", owner: "Зайцева", species: "dog", sex: "самец", ageYears: 4, flags: { durationDays: 18, oldDrops: true }, returnVisit: true },
          { arrivalMinute: 9 * 60 + 40, source: "booked", bookingLabel: "чешет уши", diseaseId: "miteOtitis", profileId: "anxious", animal: "Клевер", owner: "Петрова", species: "rabbit", sex: "самка", ageYears: 2, flags: { contact: "новый кролик" } },
          { arrivalMinute: 11 * 60 + 20, source: "booked", bookingLabel: "ухо покраснело", diseaseId: "inflammatoryOtitis", profileId: "budget", animal: "Ричи", owner: "Макаров", species: "dog", sex: "самец", ageYears: 6, flags: { trigger: "домашняя чистка" } },
          { arrivalMinute: 13 * 60 + 10, source: "walkIn", bookingLabel: "внезапный зуд", diseaseId: "dermatitis", profileId: "careless", animal: "Найда", owner: "приют «Лапа»", species: "cat", sex: "самка", ageYears: 3, eventLabel: "Незапланированный посетитель", flags: { trigger: "после старой подстилки" } }
        ]
      },
      {
        day: 3,
        chapterDay: 3,
        title: "Версия владельца",
        briefing: "Владелец уверен, что зуд связан с кормом. Игрок должен отделить версию от фактов.",
        endMinute: 16 * 60,
        maxWaiting: 3,
        loadLabel: "средняя",
        goals: [
          { id: "budget", label: "Обсудить бюджет минимум с 2 владельцами", target: 2 },
          { id: "targetExam", label: "Провести 2 целевых осмотра", target: 2 }
        ],
        patients: [
          { arrivalMinute: 8 * 60 + 20, source: "return", bookingLabel: "контроль лечения", diseaseId: "bacterialOtitis", profileId: "calm", animal: "Бакс", owner: "Зайцева", species: "dog", sex: "самец", ageYears: 4, returnVisit: true, flags: { durationDays: 10 } },
          { arrivalMinute: 9 * 60 + 15, source: "booked", bookingLabel: "кожный зуд", diseaseId: "dermatitis", profileId: "internet", animal: "Тайга", owner: "Лебедев", species: "dog", sex: "самка", ageYears: 5, ownerLead: "Это точно аллергия на корм", flags: { trigger: "после прогулки" } },
          { arrivalMinute: 10 * 60 + 35, source: "booked", bookingLabel: "рвота после еды", diseaseId: "gastroenteritis", profileId: "anxious", animal: "Буся", owner: "Ким", species: "cat", sex: "самка", ageYears: 1, flags: { trigger: "после смены корма", vomitCount: 1 } },
          { arrivalMinute: 12 * 60 + 10, source: "walkIn", bookingLabel: "трясет головой", diseaseId: "inflammatoryOtitis", profileId: "careless", animal: "Лада", owner: "Алиева", species: "dog", sex: "самка", ageYears: 8, flags: { trigger: "после купания" } },
          { arrivalMinute: 14 * 60, source: "booked", bookingLabel: "расчесы на коже", diseaseId: "dermatitis", profileId: "budget", animal: "Пончик", owner: "Смирнов", species: "rabbit", sex: "самец", ageYears: 2, flags: { trigger: "после новой подстилки" } }
        ]
      },
      {
        day: 4,
        chapterDay: 4,
        title: "Первый триаж",
        briefing: "Срочный кот описан как пациент с запором. Нужно уточнить, идет ли речь о мочеиспускании, и изменить порядок очереди.",
        endMinute: 17 * 60,
        maxWaiting: 3,
        loadLabel: "выше средней",
        goals: [
          { id: "urgent", label: "Оценить срочного пациента безопасно", target: 1 },
          { id: "completeExam", label: "Провести полный осмотр минимум 2 пациентам", target: 2 },
          { id: "explained", label: "Дать понятный план минимум 2 владельцам", target: 2 }
        ],
        patients: [
          { arrivalMinute: 8 * 60 + 20, source: "booked", bookingLabel: "рвота и боль", diseaseId: "pancreatitis", profileId: "anxious", animal: "Сема", owner: "Смирнов", species: "cat", sex: "самец", ageYears: 3, flags: { trigger: "резко сменили корм", vomitCount: 2 } },
          { arrivalMinute: 9 * 60 + 20, source: "booked", bookingLabel: "чешет ухо", diseaseId: "bacterialOtitis", profileId: "calm", animal: "Нора", owner: "Иванова", species: "dog", sex: "самка", ageYears: 9, flags: { durationDays: 4 } },
          { arrivalMinute: 10 * 60 + 30, source: "booked", bookingLabel: "кожный зуд", diseaseId: "dermatitis", profileId: "budget", animal: "Рич", owner: "Орлова", species: "dog", sex: "самец", ageYears: 2, flags: { trigger: "после прогулки" } },
          { arrivalMinute: 11 * 60 + 40, source: "return", bookingLabel: "повторный контроль", diseaseId: "gastroenteritis", profileId: "careless", animal: "Ириска", owner: "Алиева", species: "dog", sex: "самка", ageYears: 4, returnVisit: true, flags: { trigger: "пищевая погрешность", vomitCount: 1 } },
          { arrivalMinute: 12 * 60 + 35, source: "walkIn", bookingLabel: "не может сходить в туалет", diseaseId: "urinaryObstruction", profileId: "anxious", animal: "Рыжик", owner: "Петрова", species: "cat", sex: "самец", ageYears: 6, urgency: "urgent", eventLabel: "Срочный пациент", flags: { lastUrineHours: 14 } },
          { arrivalMinute: 14 * 60 + 30, source: "booked", bookingLabel: "однократная рвота", diseaseId: "gastroenteritis", profileId: "internet", animal: "Тучка", owner: "Ким", species: "cat", sex: "самка", ageYears: 2, flags: { trigger: "украла еду со стола", vomitCount: 1 } }
        ]
      },
      {
        day: 5,
        chapterDay: 5,
        title: "Смешанная проверка",
        briefing: "Подсказок меньше: нужно самостоятельно управлять очередью, диагностикой, бюджетом и последствиями прошлых решений.",
        endMinute: 18 * 60,
        maxWaiting: 4,
        loadLabel: "высокая, смешанная",
        goals: [
          { id: "treated", label: "Принять минимум 5 пациентов", target: 5 },
          { id: "explained", label: "Объяснить план минимум 3 владельцам", target: 3 },
          { id: "noLost", label: "Не потерять ни одного пациента из очереди", target: 1 }
        ],
        patients: [
          { arrivalMinute: 8 * 60 + 15, source: "return", bookingLabel: "повторный контроль", diseaseId: "bacterialOtitis", profileId: "careless", animal: "Бакс", owner: "Зайцева", species: "dog", sex: "самец", ageYears: 4, returnVisit: true, flags: { durationDays: 18, oldDrops: true } },
          { arrivalMinute: 9 * 60, source: "booked", bookingLabel: "ухо покраснело", diseaseId: "inflammatoryOtitis", profileId: "calm", animal: "Марс", owner: "Макаров", species: "dog", sex: "самец", ageYears: 4, flags: { trigger: "после чистки" } },
          { arrivalMinute: 10 * 60 + 10, source: "booked", bookingLabel: "кожный зуд", diseaseId: "dermatitis", profileId: "budget", animal: "Мята", owner: "Иванова", species: "rabbit", sex: "самка", ageYears: 2, flags: { trigger: "после новой подстилки" } },
          { arrivalMinute: 11 * 60 + 20, source: "booked", bookingLabel: "повторная рвота", diseaseId: "pancreatitis", profileId: "anxious", animal: "Нора", owner: "Орлова", species: "dog", sex: "самка", ageYears: 9, flags: { trigger: "дали жирный кусочек", vomitCount: 3 } },
          { arrivalMinute: 12 * 60 + 35, source: "walkIn", bookingLabel: "чешет уши", diseaseId: "miteOtitis", profileId: "internet", animal: "Клевер", owner: "Петрова", species: "rabbit", sex: "самец", ageYears: 3, eventLabel: "Без записи", flags: { contact: "дома есть другие животные" } },
          { arrivalMinute: 14 * 60, source: "booked", bookingLabel: "однократная рвота", diseaseId: "gastroenteritis", profileId: "calm", animal: "Тучка", owner: "Ким", species: "cat", sex: "самка", ageYears: 2, flags: { trigger: "украла еду со стола", vomitCount: 1 } },
          { arrivalMinute: 15 * 60 + 20, source: "booked", bookingLabel: "расчесы на коже", diseaseId: "dermatitis", profileId: "conflict", animal: "Тайга", owner: "Лебедев", species: "dog", sex: "самка", ageYears: 5, flags: { trigger: "после прогулки" } }
        ]
      }
    ]
  };
})();
