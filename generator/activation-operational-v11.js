(function (root, factory) {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PET_CLINIC_ACTIVATION_OPERATIONAL_V11 = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const ACTIVATION_ROOT = "content/activation-packs/pet-clinic-local-2026.07.17.1";
  const OPERATIONAL_ROOT = `${ACTIVATION_ROOT}/operational-source`;
  const P8_ROOT = `${ACTIVATION_ROOT}/p8-source`;
  const OPERATIONAL_MANIFEST_SHA256 = "5fc89dc34234d0626846fef797ba247ea0154068eeeb6b0953a990b3745f146d";
  const P8_MANIFEST_SHA256 = "077833463f6926a16de93b5ffc647f9588e3193f7fa2fa5d18bd8e09673fc502";
  const FILE_HASHES = Object.freeze({
    [`${OPERATIONAL_ROOT}/MANIFEST.json`]: OPERATIONAL_MANIFEST_SHA256,
    [`${OPERATIONAL_ROOT}/source/p3-exact-source-crosswalk.json`]: "ac185625688fb1b1759c59ef74cf8229cac192d61042c78071be48d2a5a4e012",
    [`${OPERATIONAL_ROOT}/source/p3-explicit-research-routes.json`]: "fbda3ed7817aa93bf3f73274b53dbb3acf554ab58b29139617d0bc3535923552",
    [`${OPERATIONAL_ROOT}/source/p3-policy.json`]: "d37ece17286c3ed7e215ca37e4441ec71042761e2fb3048115672f0c12ee9d7b",
    [`${OPERATIONAL_ROOT}/generated/p3/investigation-usage-policy.json`]: "d50d175edc177ce11714e1a0df5b94b6c933f2773395114c812ff2da3dd53f08",
    [`${OPERATIONAL_ROOT}/generated/p3/provider-catalog.json`]: "1b5c68f5aa435642419d19845376342421ce2a84275643a44841a62a61ddcc97",
    [`${OPERATIONAL_ROOT}/generated/p3/research-catalog.json`]: "7bd5694c608c695399fb09c3fe848a530d5bdc1095dd6be821e571c9da587556",
    [`${OPERATIONAL_ROOT}/source/p4-presentation-medical-fact-crosswalk.json`]: "c4caa9560260b96aad2f0e866c45f764ed54ede44bb4683e6583caa299aa1ddb",
    [`${OPERATIONAL_ROOT}/generated/p4/behavior-crosswalk.json`]: "ba1156f4f381ebafdf489535c1163e4d2f23769abc065dcd31c31b186b6bbdeb",
    [`${OPERATIONAL_ROOT}/generated/p4/owner-profile-catalog.json`]: "60336986618b7b59af11d8cafb079f0581e4a8e313359a6044c66355ed7ff355",
    [`${OPERATIONAL_ROOT}/generated/p4/temperament-catalog.json`]: "65a8c138698c72c594ac442e9b61925664c8b3f7fdede639f4bc8ea84e7a8aa5",
    [`${OPERATIONAL_ROOT}/source/p7-activation-digest-contract.json`]: "793589f645a249008cf76938f3fa169db22c44722c2bba916db9133ea7fdd5f3",
    [`${OPERATIONAL_ROOT}/source/p7-campaign.json`]: "d22b1e29f921361e35f45e902497b4bd7efc72251ab887ea3378d551da4d0621",
    [`${OPERATIONAL_ROOT}/source/p7-evidence-resolver.json`]: "068ce9034fff8875fd1c7e86c2475f4a3eda1dba96d253e1a3f1239f15512a28",
    [`${OPERATIONAL_ROOT}/generated/p7/day-catalog.json`]: "57f8ae13fa8e07e26e91188cd09e8c6ec772169c444f5df407b2adabae6f106f",
    [`${OPERATIONAL_ROOT}/generated/p7/director-catalog.json`]: "2ff697e0900bd1782635b4c6753df138afcfe0d702d3043df44ce7a8d4b7ea28",
    [`${P8_ROOT}/MANIFEST.json`]: P8_MANIFEST_SHA256,
    [`${P8_ROOT}/source/p8-review-policy.json`]: "5b008d7868f651b2369b5732910363bc462d3e860ae03687986e8467c326f71d",
    [`${P8_ROOT}/source/human-dialogue-library.json`]: "a3bf989041f9fdfa4f07209e9b0ba936b4d8d23f04f4677f14ecd9fcd30c6fd5",
    [`${P8_ROOT}/generated/P8_DIALOGUE_VALIDATION.json`]: "e07043fae4cf57e70cee3972a4d5465eb9ff4f8ee2538617964820da7192f33a"
  });
  const UI_CLASSIFICATION_BY_BAND = Object.freeze({
    must_not_delay_safety: "required",
    required: "required",
    conditional: "recommended",
    optional_or_low_value: "optional",
    recommended: "recommended"
  });
  const URGENCY_BANDS = Object.freeze(["emergency", "urgent", "priority", "scheduled", "routine"]);

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function assert(condition, message) {
    if (!condition) throw new Error(`Pet Clinic operational activation rejected: ${message}`);
  }

  function uniqueMap(records, keyFor, label) {
    const map = new Map();
    records.forEach((record) => {
      const key = keyFor(record);
      assert(typeof key === "string" && key.length > 0, `${label}: empty key`);
      assert(!map.has(key), `${label}: duplicate ${key}`);
      map.set(key, record);
    });
    return map;
  }

  function presentationRef(familyId, variantId, presentationId) {
    return `${familyId}.${variantId}.${presentationId}`;
  }

  async function sha256Hex(bytes) {
    const cryptoApi = root?.crypto || globalThis.crypto;
    if (cryptoApi?.subtle) {
      const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
    }
    if (typeof require === "function") {
      return require("node:crypto").createHash("sha256").update(bytes).digest("hex");
    }
    throw new Error("SHA-256 implementation is unavailable");
  }

  async function readVerified(readBytes, relativePath) {
    const raw = await readBytes(relativePath);
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const actual = await sha256Hex(bytes);
    assert(actual === FILE_HASHES[relativePath], `${relativePath}: SHA-256 mismatch`);
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      throw new Error(`${relativePath}: invalid JSON (${error.message})`);
    }
  }

  function validateP3(documents) {
    const exact = documents.p3Exact;
    const usage = documents.p3Usage;
    const research = documents.p3Research;
    const routes = documents.p3Routes;
    const providers = documents.p3Providers;
    assert(exact.catalogId === "vetgeme-p3-exact-source-crosswalk", "unexpected P3 exact catalog");
    assert(exact.catalogVersion === "2026.07.16.3", "unexpected P3 exact catalog version");
    assert(exact.fallbackAllowed === false, "P3 fallback must stay disabled");
    assert(exact.urgencyValues.length === 206, "P3 urgency crosswalk must contain 206 exact values");
    assert(exact.classificationValues.length === 875, "P3 classification crosswalk must contain 875 exact values");
    assert(usage.catalogVersion === "2026.07.16.4" && usage.usages.length === 1864,
      "P3 usage catalog must contain 1,864 .4 records");
    assert(research.research.length === 361 && routes.researchRoutes.length === 361,
      "P3 research catalogs must contain 361 routes");
    assert(providers.providers.length === 6, "P3 provider catalog must contain six providers");
    const urgencyBySource = uniqueMap(exact.urgencyValues, (item) => item.sourceValue, "P3 urgency");
    const classificationBySource = uniqueMap(exact.classificationValues, (item) => item.sourceValue, "P3 classification");
    const researchById = uniqueMap(research.research, (item) => item.researchId, "P3 research");
    const explicitById = uniqueMap(routes.researchRoutes, (item) => item.researchId, "P3 explicit routes");
    const providerById = uniqueMap(providers.providers, (item) => item.providerId, "P3 providers");
    const usageByKey = uniqueMap(usage.usages, (item) => `${item.presentationRef}|${item.researchId}`, "P3 usages");
    assert([...urgencyBySource.values()].filter((item) => item.resolutionMode === "runtime_state_required_before_order").length === 2,
      "P3 must retain exactly two dynamic urgency values");
    usage.usages.forEach((item) => {
      const urgency = urgencyBySource.get(item.sourceUrgency);
      const classification = classificationBySource.get(item.sourceClassification);
      assert(urgency && JSON.stringify(item.urgencyResolution) === JSON.stringify(urgency),
        `${item.usageId}: exact urgency projection drift`);
      assert(classification && item.classificationBandId === classification.bandId,
        `${item.usageId}: exact classification projection drift`);
      assert(researchById.has(item.researchId), `${item.usageId}: unknown research route`);
      assert(UI_CLASSIFICATION_BY_BAND[item.classificationBandId],
        `${item.usageId}: unsupported UI classification band ${item.classificationBandId}`);
    });
    research.research.forEach((item) => {
      const explicit = explicitById.get(item.researchId);
      assert(explicit, `${item.researchId}: missing explicit route`);
      assert(item.medicalResultAuthority === explicit.medicalResultAuthority,
        `${item.researchId}: medical result authority projection drift`);
      assert(item.medicalResultAuthority === "medical_family.presentation.investigations[].result_only",
        `${item.researchId}: forbidden medical result authority`);
      assert(item.operationalPolicyMayGenerateResult === false,
        `${item.researchId}: operational result generation must stay disabled`);
      item.providerIds.forEach((providerId) => assert(providerById.has(providerId), `${item.researchId}: unknown provider ${providerId}`));
    });
    return { urgencyBySource, classificationBySource, researchById, providerById, usageByKey };
  }

  function validateP4(documents) {
    const behavior = documents.p4Behavior;
    const facts = documents.p4Facts;
    const profiles = documents.p4Profiles;
    const temperaments = documents.p4Temperaments;
    assert(behavior.presentations.length === 645, "P4 behavior catalog must contain 645 presentations");
    assert(behavior.ownerModifiers.length === 463, "P4 owner modifier crosswalk must contain 463 records");
    assert(behavior.temperamentTags.length === 128, "P4 temperament crosswalk must contain 128 records");
    assert(behavior.handlingAlternatives.length === 446, "P4 handling crosswalk must contain 446 records");
    assert(facts.bindings.length === 514, "P4 medical fact crosswalk must contain 514 bindings");
    assert(profiles.profiles.length === 12, "P4 owner profile catalog must contain 12 profiles");
    assert(temperaments.temperaments.length === 8, "P4 temperament catalog must contain 8 profiles");
    const behaviorByPresentation = uniqueMap(behavior.presentations, (item) => item.presentationRef, "P4 presentations");
    const profileById = uniqueMap(profiles.profiles, (item) => item.profileId, "P4 owner profiles");
    const temperamentById = uniqueMap(temperaments.temperaments, (item) => item.temperamentId, "P4 temperaments");
    behavior.presentations.forEach((item) => {
      item.ownerArchetypeIds.forEach((id) => assert(profileById.has(id), `${item.presentationRef}: unknown owner profile ${id}`));
      item.temperamentArchetypeIds.forEach((id) => assert(temperamentById.has(id), `${item.presentationRef}: unknown temperament ${id}`));
      item.handlingBindings.forEach((binding) => assert(binding.operationalActionMayGenerateMedicalFact === false,
        `${binding.bindingId}: operational action may not generate medical facts`));
    });
    return { behaviorByPresentation, profileById, temperamentById };
  }

  function validateP7(documents) {
    const campaign = documents.p7Campaign;
    const days = documents.p7Days;
    const resolver = documents.p7Resolver;
    const digest = documents.p7Digest;
    const director = documents.p7Director;
    assert(campaign.days.length === 30 && campaign.campaign.chapters === 6, "P7 campaign must contain 30 days and six chapters");
    assert(days.days.length === 30, "P7 day catalog must contain 30 days");
    const resolverCount = ["goalEvidence", "eventTriggers", "eventEffects", "milestoneAndRecoveryRequirements", "specializationCapabilities", "endingPredicates"]
      .reduce((total, key) => total + resolver[key].length, 0);
    assert(resolverCount === 93, "P7 resolver must contain 93 evidence contracts");
    assert(digest.status === "author_complete_programmer_adapter_required", "P7 digest contract status mismatch");
    assert(typeof director.activationDigest === "string" && director.activationDigest.length === 64,
      "P7 combined activation digest is unavailable");
    return { dayByNumber: uniqueMap(days.days, (item) => String(item.day), "P7 days") };
  }

  function validateP8(documents, p4) {
    const library = documents.p8Dialogue;
    const validation = documents.p8Validation;
    assert(library.catalogId === "vetgeme-p8-human-dialogue-library", "unexpected P8 dialogue catalog");
    assert(library.catalogVersion === "2026.07.16.1", "unexpected P8 dialogue catalog version");
    assert(library.runtimeEligible === false, "P8 source status must remain review-only");
    assert(library.renderingRules.ownerBehaviorCannotRevealClinicalTruth === true, "P8 owner truth boundary is missing");
    assert(library.renderingRules.criticalFactMustExistOutsideHumor === true, "P8 critical fact boundary is missing");
    assert(library.renderingRules.rareAbsurdityForbiddenDuringEmergency === true, "P8 emergency humor boundary is missing");
    assert(validation.status === "pass", "P8 dialogue validation is not pass");
    const dialogueByProfile = uniqueMap(library.ownerProfiles, (item) => item.profileId, "P8 owner dialogue");
    p4.profileById.forEach((_profile, id) => assert(dialogueByProfile.has(id), `P8 dialogue missing owner profile ${id}`));
    return { dialogueByProfile };
  }

  function adaptOwnerProfile(profile, dialogue) {
    const traits = profile.traits;
    return {
      id: profile.profileId,
      label: profile.title,
      unlockDay: 1,
      weight: 1,
      highConflict: traits.conflictTendency >= 60,
      traits: {
        patience: traits.patience,
        anxiety: traits.baselineAnxiety,
        observation: traits.observation,
        trust: traits.clinicTrust,
        conflict: traits.conflictTendency,
        comprehension: traits.medicalComprehension,
        adherence: traits.complexPlanAdherence
      },
      operationalTraits: clone(traits),
      visibleCues: [dialogue.voice],
      p8Voice: dialogue.voice,
      p8Utterances: clone(dialogue.utterances)
    };
  }

  function createBundle(documents) {
    const p3 = validateP3(documents);
    const p4 = validateP4(documents);
    const p7 = validateP7(documents);
    const p8 = validateP8(documents, p4);
    const adaptedOwnerProfiles = [...p4.profileById.values()].map((profile) =>
      adaptOwnerProfile(profile, p8.dialogueByProfile.get(profile.profileId)));
    return Object.freeze({
      version: "pet-clinic-operational-live-adapter@2026.07.17.1",
      sourceVersion: "2026.07.16.4",
      p8SourceVersion: "2026.07.16.2",
      p3,
      p4,
      p7,
      p8,
      documents,
      adaptedOwnerProfiles,
      audit: Object.freeze({
        exactUrgencyValues: p3.urgencyBySource.size,
        exactClassificationValues: p3.classificationBySource.size,
        investigationUsages: p3.usageByKey.size,
        researchRoutes: p3.researchById.size,
        presentationBehaviorBindings: p4.behaviorByPresentation.size,
        ownerProfiles: p4.profileById.size,
        temperaments: p4.temperamentById.size,
        p7Days: p7.dayByNumber.size,
        p7EvidenceContracts: 93,
        approximateFallbacks: 0
      })
    });
  }

  async function loadFromReader(readBytes) {
    const paths = Object.keys(FILE_HASHES);
    const values = await Promise.all(paths.map((path) => readVerified(readBytes, path)));
    const byPath = Object.fromEntries(paths.map((path, index) => [path, values[index]]));
    const operationalManifest = byPath[`${OPERATIONAL_ROOT}/MANIFEST.json`];
    const p8Manifest = byPath[`${P8_ROOT}/MANIFEST.json`];
    assert(operationalManifest.packageVersion === "2026.07.16.4", "operational manifest version mismatch");
    assert(operationalManifest.sources?.medicalPackageVersion === "2026.07.16.40", "operational medical pin mismatch");
    assert(operationalManifest.sources?.p5ReservationAuthorityJoined === false, "P5 must remain fail-closed on this stage");
    assert(p8Manifest.packageVersion === "2026.07.16.2", "P8 manifest version mismatch");
    return createBundle({
      operationalManifest,
      p3Exact: byPath[`${OPERATIONAL_ROOT}/source/p3-exact-source-crosswalk.json`],
      p3Routes: byPath[`${OPERATIONAL_ROOT}/source/p3-explicit-research-routes.json`],
      p3Policy: byPath[`${OPERATIONAL_ROOT}/source/p3-policy.json`],
      p3Usage: byPath[`${OPERATIONAL_ROOT}/generated/p3/investigation-usage-policy.json`],
      p3Providers: byPath[`${OPERATIONAL_ROOT}/generated/p3/provider-catalog.json`],
      p3Research: byPath[`${OPERATIONAL_ROOT}/generated/p3/research-catalog.json`],
      p4Facts: byPath[`${OPERATIONAL_ROOT}/source/p4-presentation-medical-fact-crosswalk.json`],
      p4Behavior: byPath[`${OPERATIONAL_ROOT}/generated/p4/behavior-crosswalk.json`],
      p4Profiles: byPath[`${OPERATIONAL_ROOT}/generated/p4/owner-profile-catalog.json`],
      p4Temperaments: byPath[`${OPERATIONAL_ROOT}/generated/p4/temperament-catalog.json`],
      p7Digest: byPath[`${OPERATIONAL_ROOT}/source/p7-activation-digest-contract.json`],
      p7Campaign: byPath[`${OPERATIONAL_ROOT}/source/p7-campaign.json`],
      p7Resolver: byPath[`${OPERATIONAL_ROOT}/source/p7-evidence-resolver.json`],
      p7Days: byPath[`${OPERATIONAL_ROOT}/generated/p7/day-catalog.json`],
      p7Director: byPath[`${OPERATIONAL_ROOT}/generated/p7/director-catalog.json`],
      p8Manifest,
      p8Policy: byPath[`${P8_ROOT}/source/p8-review-policy.json`],
      p8Dialogue: byPath[`${P8_ROOT}/source/human-dialogue-library.json`],
      p8Validation: byPath[`${P8_ROOT}/generated/P8_DIALOGUE_VALIDATION.json`]
    });
  }

  async function loadFromFetch(fetchImpl = fetch) {
    return loadFromReader(async (relativePath) => {
      const response = await fetchImpl(relativePath);
      assert(response.ok, `${relativePath}: HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    });
  }

  async function loadFromDirectory(projectRoot) {
    assert(typeof require === "function", "directory loading is available only in Node.js");
    const fs = require("node:fs/promises");
    const path = require("node:path");
    return loadFromReader((relativePath) => fs.readFile(path.resolve(projectRoot, relativePath)));
  }

  function presentationContract(bundle, familyId, variantId, presentation) {
    const ref = presentationRef(familyId, variantId, presentation.id);
    const behavior = bundle.p4.behaviorByPresentation.get(ref);
    assert(behavior, `${ref}: missing exact P4 presentation binding`);
    assert(behavior.urgencySource === presentation.urgency, `${ref}: authored urgency does not match P4 exact source`);
    const urgency = bundle.p3.urgencyBySource.get(presentation.urgency);
    assert(urgency && JSON.stringify(urgency) === JSON.stringify(behavior.urgencyResolution),
      `${ref}: exact P3/P4 urgency join mismatch`);
    const investigations = presentation.investigations.map((investigation) => {
      const usage = bundle.p3.usageByKey.get(`${ref}|${investigation.id}`);
      assert(usage, `${ref}.${investigation.id}: missing exact P3 usage`);
      assert(usage.sourceUrgency === presentation.urgency, `${usage.usageId}: urgency source mismatch`);
      assert(usage.sourceClassification === investigation.classification, `${usage.usageId}: classification source mismatch`);
      return {
        usage,
        uiClassification: UI_CLASSIFICATION_BY_BAND[usage.classificationBandId]
      };
    });
    return { ref, behavior, urgency, investigations };
  }

  function applyCatalog(bundle, catalog) {
    const result = { ...catalog, owners: { ...catalog.owners } };
    result.owners["base-profiles"] = {
      schemaVersion: 4,
      source: "vetgeme-operational-production-authoring@2026.07.16.4",
      profiles: clone(bundle.adaptedOwnerProfiles)
    };
    result.owners.modifiers = {
      schemaVersion: 4,
      source: "exact_p4_profile_crosswalk_no_legacy_modifier_mix",
      modifiers: []
    };
    result.patientTemperaments = [...bundle.p4.temperamentById.values()].map((item) => clone(item));
    result.operationalActivation = {
      adapterVersion: bundle.version,
      sourceVersion: bundle.sourceVersion,
      p8SourceVersion: bundle.p8SourceVersion,
      audit: clone(bundle.audit),
      p7: {
        campaign: clone(bundle.documents.p7Days.campaign),
        days: clone(bundle.documents.p7Days.days),
        director: clone(bundle.documents.p7Director),
        evidenceResolver: clone(bundle.documents.p7Resolver)
      },
      dialogue: {
        renderingRules: clone(bundle.documents.p8Dialogue.renderingRules),
        doctorSpeech: clone(bundle.documents.p8Dialogue.doctorSpeech),
        rareAbsurdEvents: clone(bundle.documents.p8Dialogue.rareAbsurdEvents)
      }
    };
    return result;
  }

  function resolveTesterUrgency(contract, requestedBand) {
    if (contract.urgency.resolutionMode === "fixed_author_crosswalk") return contract.urgency.bandId;
    assert(contract.urgency.resolutionMode === "runtime_state_required_before_order", "unknown urgency resolution mode");
    if (!requestedBand) return null;
    assert(contract.urgency.allowedBandIds.includes(requestedBand),
      `tester urgency ${requestedBand} is not allowed for ${contract.ref}`);
    return requestedBand;
  }

  return Object.freeze({
    ACTIVATION_ROOT,
    OPERATIONAL_ROOT,
    P8_ROOT,
    OPERATIONAL_MANIFEST_SHA256,
    P8_MANIFEST_SHA256,
    FILE_HASHES,
    UI_CLASSIFICATION_BY_BAND,
    URGENCY_BANDS,
    presentationRef,
    loadFromReader,
    loadFromFetch,
    loadFromDirectory,
    presentationContract,
    applyCatalog,
    resolveTesterUrgency
  });
});
