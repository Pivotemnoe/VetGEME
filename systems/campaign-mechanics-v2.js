(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_CAMPAIGN_MECHANICS_V2 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CREDIT_LIMIT = 2500;
  const CLINICAL_RELIABILITY_CRITICAL = 45;
  const REST_RECOVERY_PER_DAY = 16;
  const FATIGUE_BANDS = Object.freeze([
    { min: 0, max: 39, multiplier: 1, label: "без штрафа", canExtendShift: true, canStartRoutineVisit: true },
    { min: 40, max: 59, multiplier: 1.1, label: "действия примерно на 10% дольше", canExtendShift: true, canStartRoutineVisit: true },
    { min: 60, max: 79, multiplier: 1.2, label: "действия примерно на 20% дольше", canExtendShift: true, canStartRoutineVisit: true },
    { min: 80, max: 99, multiplier: 1.35, label: "действия примерно на 35% дольше; продление недоступно", canExtendShift: false, canStartRoutineVisit: true },
    { min: 100, max: 100, multiplier: 1.35, label: "новый обычный приём недоступен", canExtendShift: false, canStartRoutineVisit: false }
  ]);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function fatigueEffect(fatigue) {
    const value = clamp(fatigue, 0, 100);
    return FATIGUE_BANDS.find((band) => value >= band.min && value <= band.max) || FATIGUE_BANDS[0];
  }

  function adjustedActionMinutes(minutes, fatigue) {
    return Math.max(1, Math.round(Math.max(0, Number(minutes) || 0) * fatigueEffect(fatigue).multiplier));
  }

  function forecastFatigue(options = {}) {
    const current = clamp(options.fatigue, 0, 100);
    const passiveMinutes = Math.max(0, Number(options.remainingShiftMinutes) || 0);
    const activeMinutes = Math.max(0, Number(options.expectedActiveWorkMinutes) || 0);
    const closingLoad = Math.max(0, Number(options.closingLoad) || 0);
    const projectedIncrease = passiveMinutes * 0.002 + activeMinutes * 0.08 + closingLoad;
    return {
      current,
      projectedIncrease,
      projected: clamp(current + projectedIncrease, 0, 100),
      effect: fatigueEffect(current),
      projectedEffect: fatigueEffect(current + projectedIncrease)
    };
  }

  function expectedRecovery(fatigue, restingDays = 1) {
    const days = Math.max(0, Math.floor(Number(restingDays) || 0));
    const recovered = Math.min(clamp(fatigue, 0, 100), days * REST_RECOVERY_PER_DAY);
    return {
      restingDays: days,
      recovered,
      afterRest: clamp(fatigue - recovered, 0, 100)
    };
  }

  function createDailyLedger(options = {}) {
    return {
      day: Math.max(1, Math.floor(Number(options.day) || 1)),
      status: options.status || "planning",
      consultationRevenue: 0,
      diagnosticRevenue: 0,
      procedureCost: 0,
      payroll: 0,
      maintenance: 0,
      refunds: 0,
      freeRechecks: 0,
      freeRecheckValue: 0,
      net: 0,
      ownerTrustStart: clamp(options.ownerTrust, 0, 100),
      ownerTrustEnd: clamp(options.ownerTrust, 0, 100),
      clinicalReliabilityStart: clamp(options.clinicalReliability, 0, 100),
      clinicalReliabilityEnd: clamp(options.clinicalReliability, 0, 100),
      ownerTrustEvents: [],
      clinicalReliabilityEvents: [],
      doctorId: options.doctorId || null,
      fatigueStart: clamp(options.fatigue, 0, 100),
      fatigueBeforeClosing: null,
      closingFatigueLoad: 0,
      fatigueEnd: null,
      fatigueRecoveryIfResting: REST_RECOVERY_PER_DAY
    };
  }

  function calculateLedgerNet(ledger) {
    return (Number(ledger.consultationRevenue) || 0)
      + (Number(ledger.diagnosticRevenue) || 0)
      - (Number(ledger.procedureCost) || 0)
      - (Number(ledger.payroll) || 0)
      - (Number(ledger.maintenance) || 0)
      - (Number(ledger.refunds) || 0)
      - (Number(ledger.freeRecheckValue) || 0);
  }

  function weeklyFinancialReview(options = {}) {
    const money = Number(options.money) || 0;
    const creditLimit = Math.max(0, Number(options.creditLimit) || CREDIT_LIMIT);
    const mandatoryExpenses = Math.max(0, Number(options.mandatoryExpenses) || 0);
    const debt = Math.max(0, -money);
    const projectedDebt = Math.max(0, -(money - mandatoryExpenses));
    const remainingCredit = Math.max(0, creditLimit - debt);
    const closureRisk = debt > creditLimit
      ? "critical"
      : projectedDebt > creditLimit || remainingCredit < mandatoryExpenses
        ? "high"
        : debt > creditLimit * 0.6
          ? "elevated"
          : "stable";
    const recoveryMeasures = [];
    if (closureRisk !== "stable") recoveryMeasures.push("сократить необязательные расходы");
    if (["high", "critical"].includes(closureRisk)) recoveryMeasures.push("перенести расширение клиники");
    if (debt > 0) recoveryMeasures.push("увеличить загрузку без превышения безопасной пропускной способности");
    return {
      day: Math.max(1, Math.floor(Number(options.day) || 1)),
      money,
      mandatoryExpenses,
      debt,
      projectedDebt,
      creditLimit,
      remainingCredit,
      closureRisk,
      recoveryMeasures
    };
  }

  function evaluateCampaignOutcome(options = {}) {
    const day = Math.max(1, Math.floor(Number(options.day) || 1));
    const money = Number(options.money) || 0;
    const creditLimit = Math.max(0, Number(options.creditLimit) || CREDIT_LIMIT);
    const clinicalReliability = clamp(options.clinicalReliability, 0, 100);
    const mandatoryTrainingComplete = Boolean(options.mandatoryTrainingComplete);
    const debtLimitRespected = money >= -creditLimit;
    const clinicalThresholdMet = clinicalReliability >= CLINICAL_RELIABILITY_CRITICAL;
    const completed = day >= 30;
    const success = completed && debtLimitRespected && clinicalThresholdMet && mandatoryTrainingComplete;
    return {
      completed,
      success,
      day,
      debtLimitRespected,
      clinicalThresholdMet,
      mandatoryTrainingComplete,
      financialAssessment: debtLimitRespected ? (money >= 0 ? "устойчивая" : "требует восстановления") : "кредитный лимит превышен",
      clinicalAssessment: clinicalThresholdMet ? "безопасный уровень сохранён" : "клиническая надёжность ниже критического порога",
      freePlayAvailable: completed
    };
  }

  return {
    CREDIT_LIMIT,
    CLINICAL_RELIABILITY_CRITICAL,
    REST_RECOVERY_PER_DAY,
    FATIGUE_BANDS,
    fatigueEffect,
    adjustedActionMinutes,
    forecastFatigue,
    expectedRecovery,
    createDailyLedger,
    calculateLedgerNet,
    weeklyFinancialReview,
    evaluateCampaignOutcome
  };
});
