(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_VISIT_STATE = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const FLOW_STATES = new Set([
    "scheduled",
    "arrived",
    "waiting",
    "called",
    "in_consultation",
    "ready_for_discharge",
    "completed",
    "left"
  ]);
  const WAITING_STATES = new Set(["waiting", "called"]);
  const CONSULTATION_STATES = new Set(["in_consultation", "ready_for_discharge"]);
  const CLINICAL_SECTIONS = ["history", "physicalExam", "diagnosticTests", "clinicalInterpretation", "carePlan"];
  const URGENCY_RANK = { not_assessed: 0, routine: 1, priority: 2, urgent: 3, emergency: 4 };

  function createClinicalRecord(record) {
    const normalized = {};
    CLINICAL_SECTIONS.forEach((section) => {
      normalized[section] = Array.isArray(record?.[section]) ? [...record[section]] : [];
    });
    return normalized;
  }

  function normalizePatient(patient, options = {}) {
    if (!patient || typeof patient !== "object") return patient;
    if (!FLOW_STATES.has(patient.flowState)) {
      patient.flowState = options.inConsultation ? "in_consultation" : "waiting";
    }
    patient.clinicalRecord = createClinicalRecord(patient.clinicalRecord);
    patient.clinicalUrgency = patient.clinicalUrgency || "not_assessed";
    patient.patientState = patient.patientState || "requires_assessment";
    patient.explanationDone = Boolean(patient.explanationDone || patient.selectedCommunicationId);
    patient.carePlanAgreed = Boolean(patient.carePlanAgreed || patient.selectedTreatmentId);
    return patient;
  }

  function waitingPatients(patients) {
    return (patients || []).filter((patient) => WAITING_STATES.has(patient.flowState || "waiting"));
  }

  function markInConsultation(patient) {
    patient.flowState = "in_consultation";
    return patient;
  }

  function markScheduled(patient) {
    patient.flowState = "scheduled";
    return patient;
  }

  function markArrived(patient) {
    patient.flowState = "arrived";
    return patient;
  }

  function markWaiting(patient) {
    patient.flowState = "waiting";
    return patient;
  }

  function markReadyForDischarge(patient) {
    patient.flowState = "ready_for_discharge";
    return patient;
  }

  function markCompleted(patient) {
    patient.flowState = "completed";
    return patient;
  }

  function isInConsultation(patient) {
    return Boolean(patient && CONSULTATION_STATES.has(patient.flowState));
  }

  function record(patient, section, value) {
    normalizePatient(patient);
    if (!CLINICAL_SECTIONS.includes(section) || !value) return false;
    const values = Array.isArray(value) ? value : [value];
    values.filter(Boolean).forEach((item) => {
      if (!patient.clinicalRecord[section].includes(item)) patient.clinicalRecord[section].push(item);
    });
    return true;
  }

  function assessUrgency(patient, assessment) {
    normalizePatient(patient);
    const requested = URGENCY_RANK[assessment] === undefined ? "routine" : assessment;
    const current = patient.clinicalUrgency || "not_assessed";
    patient.clinicalUrgency = URGENCY_RANK[requested] > URGENCY_RANK[current] ? requested : current;
    const states = {
      routine: "stable",
      priority: "requires_attention",
      urgent: "urgent",
      emergency: "critical"
    };
    patient.patientState = states[patient.clinicalUrgency] || "requires_assessment";
    return patient.clinicalUrgency;
  }

  function incrementCompatibleGoals(goalStats, goalIds) {
    [...new Set(goalIds.filter(Boolean))].forEach((id) => {
      goalStats[id] = (goalStats[id] || 0) + 1;
    });
    return goalStats;
  }

  return {
    FLOW_STATES,
    WAITING_STATES,
    CONSULTATION_STATES,
    CLINICAL_SECTIONS,
    createClinicalRecord,
    normalizePatient,
    waitingPatients,
    isInConsultation,
    markScheduled,
    markArrived,
    markInConsultation,
    markWaiting,
    markReadyForDischarge,
    markCompleted,
    record,
    assessUrgency,
    incrementCompatibleGoals
  };
});
