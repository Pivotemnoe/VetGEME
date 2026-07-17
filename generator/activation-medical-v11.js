(function (root, factory) {
  "use strict";

  const supportLoader = typeof module === "object" && module.exports
    ? require("./content-loader-v2.js")
    : root.PET_CLINIC_CONTENT_V2;
  const operationalLoader = typeof module === "object" && module.exports
    ? require("./activation-operational-v11.js")
    : root.PET_CLINIC_ACTIVATION_OPERATIONAL_V11;
  const p5Loader = typeof module === "object" && module.exports
    ? require("./activation-p5-v11.js")
    : root.PET_CLINIC_ACTIVATION_P5_V11;
  const economyLoader = typeof module === "object" && module.exports
    ? require("./activation-economy-v11.js")
    : root.PET_CLINIC_ACTIVATION_ECONOMY_V11;
  const visualLoader = typeof module === "object" && module.exports
    ? require("./activation-visual-v11.js")
    : root.PET_CLINIC_ACTIVATION_VISUAL_V11;
  const schedulerAuthority = typeof module === "object" && module.exports
    ? require("../systems/resource-scheduler-v5.js")
    : root.PET_CLINIC_RESOURCE_SCHEDULER_V5;
  const api = factory(root, supportLoader, operationalLoader, p5Loader, economyLoader, visualLoader, schedulerAuthority);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_ACTIVATION_MEDICAL_V11 = api;
})(typeof window !== "undefined" ? window : globalThis, function (
  root,
  supportLoader,
  operationalLoader,
  p5Loader,
  economyLoader,
  visualLoader,
  schedulerAuthority
) {
  "use strict";

  const ACTIVATION_ROOT = "content/activation-packs/pet-clinic-local-2026.07.17.1";
  const ACTIVATION_MANIFEST_PATH = `${ACTIVATION_ROOT}/ACTIVATION_MANIFEST.json`;
  const TRAINING_SEQUENCE_PATH = `${ACTIVATION_ROOT}/TRAINING_SEQUENCE.json`;
  const RUNTIME_MEDICAL_ROOT = `${ACTIVATION_ROOT}/medical-source`;
  const P9_SOURCE_ROOT = `${ACTIVATION_ROOT}/visual-source`;
  const P9_ART_SOURCE_MANIFEST_PATH = `${ACTIVATION_ROOT}/visual/ART_ASSET_MANIFEST.json`;
  const P9_RUNTIME_ART_MANIFEST_PATH = "assets/pet-clinic-full-activation-2026.07.17.1/manifest.json";
  const ACTIVATION_MANIFEST_SHA256 = "fd056331fa894f9689bbd794f4ece12fb964ebb3e69b95e907282811ae7ad3bd";
  const PACKAGE_ID = "pet-clinic-local-full-activation";
  const PACKAGE_VERSION = "2026.07.17.1";
  const DAY_PLAN_ADAPTER_VERSION = "medical-40-day-plan-v11.1";
  const EXPECTED_COUNTS = Object.freeze({ families: 39, variants: 215, presentations: 645 });
  const SUPPORT_OPTIONS = Object.freeze({
    packId: "tier-01-v2",
    packVersion: "2026.07.12.2",
    mode: "tier-01-v2",
    context: "review"
  });

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function activationDayPlan(sourcePlan, cases) {
    const caseIds = new Set(cases.map((item) => item.id));
    let removedLegacyUrgentPoolIds = 0;
    const dayPlan = clone(sourcePlan);
    dayPlan.days = dayPlan.days.map((day) => {
      if (!Array.isArray(day.urgentPool)) return day;
      const urgentPool = day.urgentPool.filter((caseId) => caseIds.has(caseId));
      removedLegacyUrgentPoolIds += day.urgentPool.length - urgentPool.length;
      return { ...day, urgentPool };
    });
    return { dayPlan, removedLegacyUrgentPoolIds };
  }

  function assert(condition, message) {
    if (!condition) throw new Error(`Pet Clinic activation validation failed: ${message}`);
  }

  function safeRelativePath(value) {
    return typeof value === "string"
      && value.length > 0
      && !value.startsWith("/")
      && !value.includes("\\")
      && value.split("/").every((part) => part && part !== "." && part !== "..");
  }

  function joinPath(...parts) {
    return parts.map((part, index) => {
      const value = String(part);
      return index === 0 ? value.replace(/\/$/u, "") : value.replace(/^\//u, "").replace(/\/$/u, "");
    }).filter(Boolean).join("/");
  }

  async function sha256Hex(bytes) {
    if (supportLoader?.medicalCatalogApi?.sha256Hex) {
      return supportLoader.medicalCatalogApi.sha256Hex(bytes);
    }
    const cryptoApi = root?.crypto || globalThis.crypto;
    assert(cryptoApi?.subtle, "SHA-256 implementation is unavailable");
    const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
  }

  function createReader(loadBytes) {
    const cache = new Map();
    async function read(relativePath) {
      assert(safeRelativePath(relativePath), `unsafe source path ${relativePath}`);
      if (!cache.has(relativePath)) {
        cache.set(relativePath, Promise.resolve(loadBytes(relativePath)).then(async (raw) => {
          const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
          let value;
          try {
            value = JSON.parse(new TextDecoder().decode(bytes));
          } catch (error) {
            throw new Error(`${relativePath}: invalid JSON (${error.message})`);
          }
          return { bytes, value, sha256: await sha256Hex(bytes) };
        }));
      }
      return cache.get(relativePath);
    }
    return read;
  }

  function internalCaseId(familyId, variantId, presentationId) {
    return `${familyId}::${variantId}::${presentationId}`;
  }

  function chapterUnlockDay(value) {
    return ({ chapter_1: 1, chapter_2: 6, chapter_3: 11, chapter_4: 16, chapter_5: 21, post_chapter_5: 30 })[value] || 1;
  }

  function historyQuestionsFor(family, presentation, ownerIds) {
    const criticalFacts = presentation.criticalFacts || [];
    const safeFacts = new Set(presentation.dataSufficiency?.safePlanRequires || []);
    return family.commonHistoryQuestions
      .filter((question) => Object.prototype.hasOwnProperty.call(presentation.historyAnswers || {}, question.id))
      .map((question) => {
        const revealed = criticalFacts
          .filter((fact) => (fact.discoveryPaths || []).includes(question.id))
          .map((fact) => fact.factId);
        return {
          id: question.id,
          buttonText: question.text,
          category: "anamnesis",
          required: revealed.some((factId) => safeFacts.has(factId)),
          condition: null,
          source: "owner_history",
          revealsFactIds: revealed,
          answers: [{
            id: `${question.id}:authored`,
            ownerTags: ownerIds.slice(),
            source: "owner_history",
            text: presentation.historyAnswers[question.id],
            revealsFactIds: revealed
          }]
        };
      });
  }

  function examGroupsFor(presentation) {
    const generalPathIds = new Set([
      "general_exam",
      "mental_status_and_vitals",
      "hydration_and_perfusion_separate",
      "temperature",
      "perfusion",
      "hydration_assessment"
    ]);
    const criticalByFact = new Map((presentation.criticalFacts || []).map((fact) => [fact.factId, fact]));
    const general = [];
    const target = [];
    for (const finding of presentation.examFindings || []) {
      const paths = criticalByFact.get(finding.factId)?.discoveryPaths || [];
      const normalized = { id: finding.factId, source: finding.source, text: finding.finding };
      (paths.some((path) => generalPathIds.has(path)) ? general : target).push(normalized);
    }
    if (!general.length && target.length) general.push(target.shift());
    return { general, target };
  }

  function normalizePresentation(family, variant, presentation, manifestEntry, operationalBundle, testerUrgencyBand) {
    const id = internalCaseId(family.familyId, variant.id, presentation.id);
    const exams = examGroupsFor(presentation);
    const operationalApi = operationalLoader;
    assert(operationalApi, "operational activation adapter is unavailable");
    const operational = operationalApi.presentationContract(
      operationalBundle,
      family.familyId,
      variant.id,
      presentation
    );
    const resolvedUrgencyBand = operationalApi.resolveTesterUrgency(operational, testerUrgencyBand);
    const diagnosticTests = operational.investigations.map(({ usage, uiClassification }, index) => {
      const item = presentation.investigations[index];
      return {
        id: item.id,
        label: "Клиническое исследование",
        type: "authored",
        source: "diagnostic_test",
        text: item.result,
        requires: [],
        classification: uiClassification,
        authoredClassification: item.classification,
        operationalClassificationBand: usage.classificationBandId,
        operationalDecisionWeight: usage.decisionWeight,
        operationalResultReviewClass: usage.resultReviewClass,
        operationalReviewPolicy: clone(usage.reviewPolicy),
        operationalTurnaroundPolicy: clone(usage.turnaroundPolicy),
        operationalUsageId: usage.usageId,
        costVetcoins: null,
        durationMinutes: usage.turnaroundPolicy.kind === "local" ? usage.turnaroundPolicy.minutes : null
      };
    });
    const requiredInvestigations = diagnosticTests
      .filter((item) => item.classification === "required")
      .map((item) => item.id);
    const ownerIds = operational.behavior.ownerArchetypeIds.slice();
    const communication = (presentation.ownerCommunication || []).slice();
    return {
      schemaVersion: 2,
      id,
      family: family.familyId,
      familyId: family.familyId,
      familyTitle: family.title,
      variantId: variant.id,
      presentationId: presentation.id,
      sourceVersion: presentation.version,
      titleForDeveloper: variant.title,
      preliminaryDiagnosisLabel: variant.title,
      bookingReason: family.title,
      reviewStatus: presentation.review?.veterinaryReviewStatus,
      localActivationAuthority: "product_owner_local_manual_testing",
      tier: 1,
      unlockDay: chapterUnlockDay(presentation.campaignAvailability?.earliest),
      severity: resolvedUrgencyBand,
      authoredUrgency: presentation.urgency,
      operationalUrgencyBand: resolvedUrgencyBand,
      operationalUrgencyResolution: clone(operational.urgency),
      generationEligible: resolvedUrgencyBand !== null,
      species: presentation.species.slice(),
      allowedSex: ["male", "female"],
      ageBands: clone(presentation.ageBands || []),
      requiredEquipment: clone(presentation.equipment?.requiredLocal || []),
      requiredForDefinitiveDiagnosis: clone(presentation.equipment?.requiredLocal || []),
      requiredForTreatment: [],
      preferredEquipment: [],
      safeAlternatives: [presentation.equipment?.referralFallback || family.safeRouteCapability || "safe_referral"],
      safeWithoutEquipmentActions: [presentation.equipment?.referralFallback || family.safeRouteCapability || "safe_referral"],
      safeReferralPath: presentation.equipment?.referralFallback || family.safeRouteCapability || "safe_referral",
      arrivalAllowedWithoutEquipment: true,
      workload: Number(presentation.workload) || 1,
      initialComplaintVariants: [{
        id: presentation.id,
        source: "initial_complaint",
        text: presentation.complaint,
        species: presentation.species.slice()
      }],
      historyQuestions: historyQuestionsFor(family, presentation, ownerIds),
      generalExam: { label: "Общий осмотр", findings: exams.general },
      targetExam: { label: "Целевой осмотр", findings: exams.target },
      sampleActions: [],
      diagnosticTests,
      preliminaryDiagnosisOptions: [{
        id: variant.primaryDiagnosisId,
        source: "medical_authoring_2026.07.16.40",
        label: variant.title,
        requires: requiredInvestigations,
        feedback: variant.diagnosticTruth,
        isCorrectForTemplate: true,
        isUnsafeChoice: false
      }],
      planOptions: [{
        id: presentation.carePlanId,
        source: "medical_authoring_2026.07.16.40",
        label: variant.title,
        steps: communication.slice(),
        requires: [],
        allowsRoutineObservation: presentation.urgency === "routine",
        disabledWhenRedFlags: false,
        followUp: { source: "follow_up", text: presentation.followUp?.timing || "" },
        worseningSigns: []
      }],
      ownerExplanation: {
        source: "medical_authoring_2026.07.16.40",
        known: variant.diagnosticTruth,
        uncertain: presentation.outcomes?.unsafe || "",
        plan: communication.join(" "),
        checkUnderstanding: communication.at(-1) || ""
      },
      compatibleOwnerProfiles: ownerIds,
      compatibleOwnerModifiers: [],
      compatibleTemperaments: operational.behavior.temperamentArchetypeIds.slice(),
      handlingActions: clone(operational.behavior.handlingBindings || []),
      criticalFacts: clone(presentation.criticalFacts || []),
      sourceRecord: {
        familyId: family.familyId,
        variantId: variant.id,
        presentationId: presentation.id,
        familyManifestSha256: manifestEntry.sha256,
        diagnosticTruth: variant.diagnosticTruth,
        operationalPresentationRef: operational.ref,
        operationalHandlingActionIds: operational.behavior.handlingActionIds.slice(),
        presentation: clone(presentation)
      }
    };
  }

  function buildIndex(families) {
    return families.map((family) => ({
      familyId: family.familyId,
      title: family.title,
      variants: family.variants.map((variant) => ({
        variantId: variant.id,
        title: variant.title,
        presentations: variant.presentations.map((presentation) => ({
          presentationId: presentation.id,
          complaint: presentation.complaint,
          caseId: internalCaseId(family.familyId, variant.id, presentation.id)
        }))
      }))
    }));
  }

  function trainingCaseIds(training) {
    return training.lessons.map((lesson) => internalCaseId(lesson.familyId, lesson.variantId, lesson.presentationId));
  }

  function selectedTesterCase(index, params) {
    const requested = internalCaseId(params.get("familyId"), params.get("variantId"), params.get("presentationId"));
    const all = index.flatMap((family) => family.variants.flatMap((variant) => variant.presentations));
    return all.some((entry) => entry.caseId === requested) ? requested : all[0]?.caseId || null;
  }

  function activationManifest(medicalManifestHash, runtimeContentHash, cases) {
    return {
      schemaVersion: 2,
      contentPackId: PACKAGE_ID,
      contentPackVersion: PACKAGE_VERSION,
      contentPackHash: runtimeContentHash,
      tier: "full-local-activation",
      status: "local_manual_testing",
      integrationStatus: "connected_for_local_manual_testing",
      caseCount: cases.length,
      cases: cases.map((item) => ({ id: item.id })),
      contentPolicy: {
        medicalTextSource: "vetgeme-medical-production-authoring@2026.07.16.40",
        runtimeGenerationOfMedicalText: false,
        allowedSpeciesTier01: ["dog", "cat"],
        localManualTestingOnly: true,
        externalVeterinaryCertificationClaimed: false,
        terminology: { preferred: "грибковый отит", policy: "source_text_only" }
      }
    };
  }

  async function loadActivation(read, supportCatalog, options = {}) {
    const activationDocument = await read(ACTIVATION_MANIFEST_PATH);
    assert(activationDocument.sha256 === ACTIVATION_MANIFEST_SHA256, "activation manifest SHA-256 mismatch");
    const activation = activationDocument.value;
    assert(activation.scope === "local_manual_testing", "activation scope is not local_manual_testing");
    assert(activation.publicReleaseAuthorized === false, "activation must not authorize public release");
    assert(activation.externalVeterinaryCertificationClaimed === false, "activation must not claim external veterinary certification");
    assert(activation.medicalSource?.packageVersion === "2026.07.16.40", "unexpected medical source version");
    assert(activation.medicalSource?.selection === "all_manifest_entries", "medical selection is not all_manifest_entries");

    const trainingDocument = await read(TRAINING_SEQUENCE_PATH);
    const medicalDocument = await read(`${RUNTIME_MEDICAL_ROOT}/MANIFEST.json`);
    assert(medicalDocument.sha256 === activation.medicalSource.manifestSha256, "medical manifest SHA-256 mismatch");
    const medicalManifest = medicalDocument.value;
    assert(medicalManifest.packageVersion === "2026.07.16.40", "medical manifest version mismatch");
    assert(medicalManifest.families.length === EXPECTED_COUNTS.families, "medical family count mismatch");

    const sourceRoot = RUNTIME_MEDICAL_ROOT;
    const loadedFamilies = [];
    for (const entry of medicalManifest.families) {
      assert(safeRelativePath(entry.path), `${entry.familyId}: unsafe family path`);
      const document = await read(joinPath(sourceRoot, entry.path));
      assert(document.sha256 === entry.sha256, `${entry.familyId}: family SHA-256 mismatch`);
      assert(document.value.familyId === entry.familyId, `${entry.familyId}: family identity mismatch`);
      loadedFamilies.push({ entry, value: document.value });
    }

    const families = loadedFamilies.map((item) => item.value);
    const variants = families.flatMap((family) => family.variants);
    const presentations = variants.flatMap((variant) => variant.presentations);
    assert(variants.length === EXPECTED_COUNTS.variants, `medical variant count is ${variants.length}`);
    assert(presentations.length === EXPECTED_COUNTS.presentations, `medical presentation count is ${presentations.length}`);
    assert(activation.medicalSource.familyCount === families.length, "activation family count drift");
    assert(activation.medicalSource.variantCount === variants.length, "activation variant count drift");
    assert(activation.medicalSource.presentationCount === presentations.length, "activation presentation count drift");

    const operationalApi = operationalLoader;
    assert(operationalApi?.loadFromReader, "operational activation adapter is unavailable");
    const operationalBundle = await operationalApi.loadFromReader(async (relativePath) => {
      const document = await read(relativePath);
      return document.bytes;
    });
    const p5Api = p5Loader;
    assert(p5Api?.loadFromReader, "P5 activation adapter is unavailable");
    const p5Bundle = await p5Api.loadFromReader(async (relativePath) => {
      const document = await read(relativePath);
      return document.bytes;
    });
    assert(economyLoader?.buildRuntime, "P6 activation adapter is unavailable");
    const economyApprovalDocument = await read(economyLoader.APPROVAL_PATH);
    assert(economyApprovalDocument.sha256 === economyLoader.APPROVAL_SHA256,
      "economy approval SHA-256 mismatch");
    const economyBundle = economyLoader.buildRuntime(p5Bundle, economyApprovalDocument.value);
    assert(visualLoader?.buildRuntime, "P9 activation adapter is unavailable");
    const [
      p9ManifestDocument,
      p9RoomCatalogDocument,
      p9EquipmentCatalogDocument,
      p9StaffCatalogDocument,
      p9HudContractDocument,
      p9CrosswalkDocument,
      p9ArtSourceManifestDocument,
      p9RuntimeArtManifestDocument
    ] = await Promise.all([
      read(`${P9_SOURCE_ROOT}/MANIFEST.json`),
      read(`${P9_SOURCE_ROOT}/generated/room-visual-state-catalog.json`),
      read(`${P9_SOURCE_ROOT}/generated/equipment-visual-state-catalog.json`),
      read(`${P9_SOURCE_ROOT}/generated/staff-visual-state-catalog.json`),
      read(`${P9_SOURCE_ROOT}/generated/hud-data-contract.json`),
      read(`${P9_SOURCE_ROOT}/runtime-crosswalk.json`),
      read(P9_ART_SOURCE_MANIFEST_PATH),
      read(P9_RUNTIME_ART_MANIFEST_PATH)
    ]);
    assert(p9ManifestDocument.sha256 === visualLoader.P9_MANIFEST_SHA256, "P9 manifest SHA-256 mismatch");
    assert(p9RoomCatalogDocument.sha256 === visualLoader.CATALOG_SHA256.rooms,
      "P9 room catalog SHA-256 mismatch");
    assert(p9EquipmentCatalogDocument.sha256 === visualLoader.CATALOG_SHA256.equipment,
      "P9 equipment catalog SHA-256 mismatch");
    assert(p9StaffCatalogDocument.sha256 === visualLoader.CATALOG_SHA256.staff,
      "P9 staff catalog SHA-256 mismatch");
    assert(p9HudContractDocument.sha256 === visualLoader.CATALOG_SHA256.hud,
      "P9 HUD contract SHA-256 mismatch");
    assert(p9CrosswalkDocument.sha256 === visualLoader.CROSSWALK_SHA256, "P9 crosswalk SHA-256 mismatch");
    assert(p9ArtSourceManifestDocument.sha256 === visualLoader.ART_SOURCE_MANIFEST_SHA256,
      "P9 approved art manifest SHA-256 mismatch");
    assert(p9RuntimeArtManifestDocument.sha256 === visualLoader.RUNTIME_ART_MANIFEST_SHA256,
      "P9 runtime art manifest SHA-256 mismatch");
    const visualBundle = visualLoader.buildRuntime({
      p9Manifest: p9ManifestDocument.value,
      roomCatalog: p9RoomCatalogDocument.value,
      equipmentCatalog: p9EquipmentCatalogDocument.value,
      staffCatalog: p9StaffCatalogDocument.value,
      hudContract: p9HudContractDocument.value,
      resourceCatalog: p5Bundle.documents.resourceCatalog,
      assetCrosswalk: p9CrosswalkDocument.value,
      artSourceManifest: p9ArtSourceManifestDocument.value,
      runtimeArtManifest: p9RuntimeArtManifestDocument.value,
      schedulerAuthority
    });
    const runtimeContentHash = await sha256Hex(new TextEncoder().encode([
      medicalDocument.sha256,
      operationalApi.OPERATIONAL_MANIFEST_SHA256,
      operationalApi.P8_MANIFEST_SHA256,
      operationalBundle.version,
      p5Api.P5_MANIFEST_SHA256,
      p5Api.ROOM_CORRECTION_SHA256,
      p5Bundle.version,
      economyApprovalDocument.sha256,
      economyBundle.version,
      p9ManifestDocument.sha256,
      p9CrosswalkDocument.sha256,
      p9ArtSourceManifestDocument.sha256,
      p9RuntimeArtManifestDocument.sha256,
      visualBundle.version,
      DAY_PLAN_ADAPTER_VERSION
    ].join("|")));
    const index = buildIndex(families);
    const modeId = options.modeId || "campaign";
    const params = options.urlSearchParams || new URLSearchParams(root?.location?.search || "");
    const selectedCaseId = modeId === "tester" ? selectedTesterCase(index, params) : null;
    const requestedTesterUrgency = modeId === "tester" ? params.get("testerUrgency") : null;
    const cases = loadedFamilies.flatMap(({ entry, value: family }) => family.variants.flatMap((variant) => (
      variant.presentations.map((presentation) => {
        const caseId = internalCaseId(family.familyId, variant.id, presentation.id);
        return normalizePresentation(
          family,
          variant,
          presentation,
          entry,
          operationalBundle,
          caseId === selectedCaseId ? requestedTesterUrgency : null
        );
      })
    )));
    assert(new Set(cases.map((item) => item.id)).size === cases.length, "duplicate runtime medical identity");
    const adaptedDayPlan = activationDayPlan(supportCatalog.dayPlan, cases);
    const sequenceIds = trainingCaseIds(trainingDocument.value);
    sequenceIds.forEach((id) => assert(cases.some((item) => item.id === id), `unknown training source ${id}`));
    sequenceIds.forEach((id) => assert(cases.find((item) => item.id === id)?.generationEligible,
      `training source ${id} has unresolved dynamic urgency`));

    if (modeId === "tester" && params.get("testerPool") === "legacy30") {
      const requested = params.get("legacyCaseId");
      const legacyCaseId = supportCatalog.casesById[requested] ? requested : supportCatalog.cases[0].id;
      return visualLoader.applyCatalog(visualBundle, economyLoader.applyCatalog(economyBundle, p5Api.applyCatalog(p5Bundle, {
        ...supportCatalog,
        runtimeModeId: modeId,
        activation: clone(activation),
        activationAudit: {
          medicalManifestSha256: medicalDocument.sha256,
          counts: clone(EXPECTED_COUNTS),
          sourceFamilyHashesVerified: loadedFamilies.length,
          normalPoolContainsLegacyIds: false,
          testerPool: "legacy_30_archive"
        },
        activationIndex: index,
        legacyArchiveIndex: supportCatalog.cases.map((item) => ({ caseId: item.id, title: item.preliminaryDiagnosisLabel })),
        selectionPolicy: {
          modeId,
          testerPool: "legacy_30_archive",
          manualSelection: true,
          forcedCaseId: legacyCaseId,
          allowedCaseIds: [legacyCaseId]
        }
      })));
    }

    const catalog = visualLoader.applyCatalog(visualBundle, economyLoader.applyCatalog(economyBundle,
      p5Api.applyCatalog(p5Bundle, operationalApi.applyCatalog(operationalBundle, {
      ...supportCatalog,
      dayPlan: adaptedDayPlan.dayPlan,
      manifest: activationManifest(medicalDocument.sha256, runtimeContentHash, cases),
      cases,
      casesById: Object.fromEntries(cases.map((item) => [item.id, item])),
      runtimeModeId: modeId,
      activation: clone(activation),
      activationAudit: {
        activationManifestSha256: activationDocument.sha256,
        medicalManifestSha256: medicalDocument.sha256,
        trainingSequenceSha256: trainingDocument.sha256,
        counts: clone(EXPECTED_COUNTS),
        sourceFamilyHashesVerified: loadedFamilies.length,
        normalPoolContainsLegacyIds: cases.some((item) => supportCatalog.casesById[item.id]),
        operationalManifestSha256: operationalApi.OPERATIONAL_MANIFEST_SHA256,
        p8ManifestSha256: operationalApi.P8_MANIFEST_SHA256,
        p5ManifestSha256: p5Api.P5_MANIFEST_SHA256,
        p5RoomCorrectionSha256: p5Api.ROOM_CORRECTION_SHA256,
        economyApprovalSha256: economyApprovalDocument.sha256,
        p9ManifestSha256: p9ManifestDocument.sha256,
        p9CrosswalkSha256: p9CrosswalkDocument.sha256,
        p9ArtSourceManifestSha256: p9ArtSourceManifestDocument.sha256,
        p9RuntimeArtManifestSha256: p9RuntimeArtManifestDocument.sha256,
        runtimeContentHash,
        operational: clone(operationalBundle.audit),
        p5: clone(p5Bundle.audit),
        economy: clone(economyBundle.audit),
        visual: clone(visualBundle.audit),
        unresolvedDynamicPresentations: cases.filter((item) => !item.generationEligible).length,
        removedLegacyUrgentPoolIds: adaptedDayPlan.removedLegacyUrgentPoolIds,
        testerPool: "medical_2026.07.16.40"
      },
      activationIndex: index,
      legacyArchiveIndex: supportCatalog.cases.map((item) => ({ caseId: item.id, title: item.preliminaryDiagnosisLabel })),
      trainingSequence: clone(trainingDocument.value),
      selectionPolicy: {
        modeId,
        trainingCaseIds: sequenceIds,
        allowedCaseIds: modeId === "training"
          ? sequenceIds.slice()
          : modeId === "tester" ? [selectedTesterCase(index, params)] : null,
        forcedCaseIdByDay: modeId === "training"
          ? Object.fromEntries(sequenceIds.map((caseId, indexValue) => [String(indexValue + 1), caseId]))
          : {},
        testerPool: "medical_2026.07.16.40",
        manualSelection: modeId === "tester",
        forcedCaseId: modeId === "tester" ? selectedTesterCase(index, params) : null
      }
    }))));
    assert(catalog.activationAudit.normalPoolContainsLegacyIds === false, "legacy case leaked into the activated normal pool");
    const selectedDynamicResolved = modeId === "tester"
      && Boolean(requestedTesterUrgency)
      && cases.find((item) => item.id === selectedCaseId)?.operationalUrgencyResolution?.resolutionMode
        === "runtime_state_required_before_order";
    assert(catalog.activationAudit.unresolvedDynamicPresentations === (selectedDynamicResolved ? 1 : 2),
      "unexpected dynamic urgency resolution count");
    return catalog;
  }

  async function loadFromFetch(options = {}, fetchImpl = fetch) {
    assert(supportLoader?.loadFromFetch, "Tier 01 support loader is unavailable");
    const read = createReader(async (relativePath) => {
      const response = await fetchImpl(relativePath);
      assert(response.ok, `${relativePath}: HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    });
    const supportCatalog = await supportLoader.loadFromFetch(SUPPORT_OPTIONS, fetchImpl);
    return loadActivation(read, supportCatalog, options);
  }

  async function loadFromDirectory(projectRoot, options = {}) {
    assert(typeof require === "function", "directory loading is available only in Node.js");
    const fs = require("node:fs/promises");
    const path = require("node:path");
    const rootPath = path.resolve(projectRoot);
    const read = createReader(async (relativePath) => {
      const resolved = path.resolve(rootPath, relativePath);
      const relative = path.relative(rootPath, resolved);
      assert(relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `${relativePath}: path escapes project root`);
      return fs.readFile(resolved);
    });
    const supportCatalog = await supportLoader.loadFromDirectory(rootPath, SUPPORT_OPTIONS);
    return loadActivation(read, supportCatalog, options);
  }

  function installTesterControls(catalog, storage = root?.localStorage) {
    if (catalog?.runtimeModeId !== "tester" || !root?.document) return;
    const host = root.document.querySelector("#developerPanel .settings-actions");
    if (!host || root.document.getElementById("testerMedicalControls")) return;
    const section = root.document.createElement("section");
    section.id = "testerMedicalControls";
    section.className = "tester-medical-controls";
    section.innerHTML = [
      "<strong>Источник клинического случая</strong>",
      "<label><input id=\"testerArchiveToggle\" type=\"checkbox\"> Архивные 30 карточек</label>",
      "<label><span>Семейство</span><select id=\"testerFamilySelect\"></select></label>",
      "<label><span>Вариант</span><select id=\"testerVariantSelect\"></select></label>",
      "<label><span>Представление</span><select id=\"testerPresentationSelect\"></select></label>",
      "<label class=\"tester-urgency-select\" hidden><span>Срочность для динамического случая</span><select id=\"testerUrgencySelect\"></select></label>",
      "<label class=\"tester-legacy-select\" hidden><span>Архивный случай</span><select id=\"testerLegacyCaseSelect\"></select></label>",
      "<label><span>Экономика</span><select id=\"testerEconomySelect\"><option value=\"unlimited\">Без ограничений</option><option value=\"real\">Реальная экономика</option></select></label>",
      "<button id=\"testerApplyMedicalSource\" type=\"button\">Открыть выбранный случай</button>",
      "<small>Выбор создаёт новый день только в сохранении режима тестировщика.</small>"
    ].join("");
    host.append(section);

    const familySelect = section.querySelector("#testerFamilySelect");
    const variantSelect = section.querySelector("#testerVariantSelect");
    const presentationSelect = section.querySelector("#testerPresentationSelect");
    const archiveToggle = section.querySelector("#testerArchiveToggle");
    const urgencyWrap = section.querySelector(".tester-urgency-select");
    const urgencySelect = section.querySelector("#testerUrgencySelect");
    const legacyWrap = section.querySelector(".tester-legacy-select");
    const legacySelect = section.querySelector("#testerLegacyCaseSelect");
    const economySelect = section.querySelector("#testerEconomySelect");
    const params = new URLSearchParams(root.location.search);
    archiveToggle.checked = catalog.selectionPolicy?.testerPool === "legacy_30_archive";
    economySelect.value = new URL(root.location.href).searchParams.get("testerEconomy") === "real"
      ? "real" : "unlimited";

    function option(select, value, label) {
      const entry = root.document.createElement("option");
      entry.value = value;
      entry.textContent = label;
      select.append(entry);
    }
    catalog.activationIndex.forEach((family) => option(familySelect, family.familyId, family.title));
    catalog.legacyArchiveIndex.forEach((entry) => option(legacySelect, entry.caseId, entry.title));

    function fillVariants() {
      variantSelect.replaceChildren();
      const family = catalog.activationIndex.find((item) => item.familyId === familySelect.value) || catalog.activationIndex[0];
      family.variants.forEach((variant) => option(variantSelect, variant.variantId, variant.title));
      if (params.get("variantId") && [...variantSelect.options].some((entry) => entry.value === params.get("variantId"))) {
        variantSelect.value = params.get("variantId");
      }
      fillPresentations();
    }
    function fillPresentations() {
      presentationSelect.replaceChildren();
      const family = catalog.activationIndex.find((item) => item.familyId === familySelect.value) || catalog.activationIndex[0];
      const variant = family.variants.find((item) => item.variantId === variantSelect.value) || family.variants[0];
      variant.presentations.forEach((presentation, indexValue) => option(
        presentationSelect,
        presentation.presentationId,
        `${indexValue + 1}. ${presentation.complaint}`
      ));
      if (params.get("presentationId") && [...presentationSelect.options].some((entry) => entry.value === params.get("presentationId"))) {
        presentationSelect.value = params.get("presentationId");
      }
      fillUrgency();
    }
    function selectedCaseData() {
      return catalog.casesById[internalCaseId(familySelect.value, variantSelect.value, presentationSelect.value)] || null;
    }
    function fillUrgency() {
      urgencySelect.replaceChildren();
      const resolution = selectedCaseData()?.operationalUrgencyResolution;
      const dynamic = resolution?.resolutionMode === "runtime_state_required_before_order";
      urgencyWrap.hidden = !dynamic || archiveToggle.checked;
      if (!dynamic) return;
      const labels = {
        emergency: "Экстренная",
        urgent: "Срочная",
        priority: "Приоритетная",
        scheduled: "Плановая",
        routine: "Обычная"
      };
      resolution.allowedBandIds.forEach((bandId) => option(urgencySelect, bandId, labels[bandId]));
      if (params.get("testerUrgency") && [...urgencySelect.options].some((entry) => entry.value === params.get("testerUrgency"))) {
        urgencySelect.value = params.get("testerUrgency");
      }
    }
    if (params.get("familyId") && [...familySelect.options].some((entry) => entry.value === params.get("familyId"))) {
      familySelect.value = params.get("familyId");
    }
    fillVariants();
    if (params.get("legacyCaseId") && [...legacySelect.options].some((entry) => entry.value === params.get("legacyCaseId"))) {
      legacySelect.value = params.get("legacyCaseId");
    }

    function toggleFields() {
      const archive = archiveToggle.checked;
      familySelect.closest("label").hidden = archive;
      variantSelect.closest("label").hidden = archive;
      presentationSelect.closest("label").hidden = archive;
      legacyWrap.hidden = !archive;
      fillUrgency();
    }
    toggleFields();
    familySelect.addEventListener("change", fillVariants);
    variantSelect.addEventListener("change", fillPresentations);
    presentationSelect.addEventListener("change", fillUrgency);
    archiveToggle.addEventListener("change", toggleFields);
    section.querySelector("#testerApplyMedicalSource").addEventListener("click", () => {
      const url = new URL(root.location.href);
      if (archiveToggle.checked) {
        url.searchParams.set("testerPool", "legacy30");
        url.searchParams.set("legacyCaseId", legacySelect.value);
        ["familyId", "variantId", "presentationId", "testerUrgency"].forEach((key) => url.searchParams.delete(key));
      } else {
        url.searchParams.delete("testerPool");
        url.searchParams.delete("legacyCaseId");
        url.searchParams.set("familyId", familySelect.value);
        url.searchParams.set("variantId", variantSelect.value);
        url.searchParams.set("presentationId", presentationSelect.value);
        if (!urgencyWrap.hidden) url.searchParams.set("testerUrgency", urgencySelect.value);
        else url.searchParams.delete("testerUrgency");
      }
      url.searchParams.set("testerEconomy", economySelect.value);
      root.PET_CLINIC_SAVE_MANAGER_V11?.clearMode(root.localStorage, "tester");
      root.location.assign(url.toString());
    });
  }

  return Object.freeze({
    ACTIVATION_ROOT,
    ACTIVATION_MANIFEST_PATH,
    TRAINING_SEQUENCE_PATH,
    RUNTIME_MEDICAL_ROOT,
    ACTIVATION_MANIFEST_SHA256,
    PACKAGE_ID,
    PACKAGE_VERSION,
    DAY_PLAN_ADAPTER_VERSION,
    EXPECTED_COUNTS,
    internalCaseId,
    loadFromFetch,
    loadFromDirectory,
    installTesterControls
  });
});
