import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadP8V2AuthoringReviewInput } from "./lib/p8-authoring-review-input-v2.mjs";
import {
  buildMedicalReviewServiceView,
  isEmergencyUrgency,
  renderMedicalReviewServiceHtml,
  technicalDisplayName,
} from "./lib/medical-review-service-view.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE_TOKEN = /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/u;

function collectStrings(value, result = []) {
  if (typeof value === "string") result.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => collectStrings(entry, result));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => collectStrings(entry, result));
  return result;
}

function flattenPresentations(families) {
  return families.flatMap((family) => family.variants.flatMap((variant) => variant.presentations));
}

function collectSourceIds(families) {
  const ids = [];
  for (const family of families) {
    ids.push(family.familyId, family.safeRouteCapability);
    ids.push(...family.coreCapabilities);
    for (const group of family.requirementGroups) ids.push(group.id, ...group.anyOf);
    for (const mapping of family.researchCapabilityMap) ids.push(mapping.researchId, ...mapping.requires, mapping.fallback);
    for (const variant of family.variants) {
      ids.push(variant.id, variant.planBundleId, ...variant.sourceIds);
      for (const presentation of variant.presentations) {
        ids.push(presentation.id, presentation.carePlanId);
        ids.push(...presentation.investigations.map((investigation) => investigation.id));
      }
    }
  }
  return [...new Set(ids.filter(Boolean))];
}

const p8 = await loadP8V2AuthoringReviewInput(projectRoot, { context: "review" });
const view = buildMedicalReviewServiceView(p8);
const html = renderMedicalReviewServiceHtml(view);
const sourceFamilies = p8.medicalReviewInput.families;
const sourcePresentationContexts = sourceFamilies.flatMap((family) => (
  family.variants.flatMap((variant) => variant.presentations.map((presentation) => ({ family, presentation })))
));
const sourcePresentations = sourcePresentationContexts.map(({ presentation }) => presentation);
const viewPresentations = flattenPresentations(view.families);

assert.deepEqual(view.counts, {
  families: 39,
  variants: 215,
  presentations: 645,
  investigations: 1864,
});
assert.equal(view.serviceOnly, true);
assert.equal(view.reviewOnly, true);
assert.equal(view.activationAllowed, false);
assert.equal(view.externalVeterinaryApproval, false);
assert.equal(view.labels.ownerCommunication, "Авторская коммуникация врача с владельцем");
assert.equal(view.p8Authority.speechFormOnly, true);
for (const authorityField of [
  "mayChangeMedicalTruth",
  "mayChangeInvestigationResult",
  "mayChangeConsentOrRefusal",
  "mayChangeCost",
  "mayChangeTime",
  "mayChangeOutcome",
  "emergencyHumorAllowed",
]) assert.equal(view.p8Authority[authorityField], false, `${authorityField} unexpectedly enabled`);

assert.ok(Object.isFrozen(view));
assert.ok(Object.isFrozen(view.families));
assert.ok(Object.isFrozen(view.families[0].variants[0].presentations[0].investigations));
assert.throws(() => {
  view.families[0].title = "mutated";
}, TypeError);

assert.equal(sourcePresentations.length, viewPresentations.length);
for (let index = 0; index < sourcePresentations.length; index += 1) {
  const source = sourcePresentations[index];
  const sourceFamily = sourcePresentationContexts[index].family;
  const rendered = viewPresentations[index];
  assert.equal(rendered.complaint, source.complaint, `complaint ${index} changed`);
  assert.deepEqual(
    rendered.investigations.map((investigation) => investigation.result),
    source.investigations.map((investigation) => investigation.result),
    `investigation results ${index} changed`,
  );
  assert.deepEqual(rendered.ownerCommunication, source.ownerCommunication, `owner communication ${index} changed`);
  assert.equal(rendered.decisions.correctOutcome, source.outcomes.safe, `safe outcome ${index} changed`);
  assert.equal(rendered.decisions.unsafeOutcome, source.outcomes.unsafe, `unsafe outcome ${index} changed`);
  assert.equal(rendered.safeReferral.available, true, `safe referral ${index} disappeared`);
  assert.deepEqual(
    rendered.safeReferral.missingLocalRoutes,
    (source.equipment?.missingLocalRoute || []).map(technicalDisplayName),
    `missing-local routes ${index} changed`,
  );
  assert.deepEqual(
    rendered.safeReferral.presentationFallbacks,
    source.equipment?.referralFallback ? [technicalDisplayName(source.equipment.referralFallback)] : [],
    `presentation fallback ${index} changed`,
  );
  assert.deepEqual(
    rendered.safeReferral.familyFallbacks,
    sourceFamily.safeRouteCapability ? [technicalDisplayName(sourceFamily.safeRouteCapability)] : [],
    `family fallback ${index} changed`,
  );
  const sourceResearch = new Map(sourceFamily.researchCapabilityMap.map((mapping) => [mapping.researchId, mapping]));
  assert.deepEqual(
    rendered.investigations.map((investigation) => investigation.fallbackRoutes),
    source.investigations.map((investigation) => {
      const fallback = sourceResearch.get(investigation.id)?.fallback;
      return fallback ? [technicalDisplayName(fallback)] : [];
    }),
    `investigation fallbacks ${index} changed`,
  );
  const sourceEmergency = isEmergencyUrgency(source.urgency);
  assert.equal(rendered.speech.emergency, sourceEmergency, `emergency status ${index} changed`);
  if (sourceEmergency) {
    assert.equal(rendered.speech.humorAllowed, false, `emergency humor ${index} was enabled`);
    assert.deepEqual(rendered.speech.humorLines, [], `emergency humor ${index} leaked`);
  }
}

assert.equal(isEmergencyUrgency("emergency"), true);
assert.equal(isEmergencyUrgency("future_emergency_variant"), true);
assert.equal(isEmergencyUrgency("regulated_EMERGENCY_route"), true);
assert.equal(isEmergencyUrgency("urgent_without_escalation"), false);
assert.equal(technicalDisplayName("safe_referral"), "Safe referral");
assert.doesNotMatch(technicalDisplayName("gdv_ecg_and_continuous_monitoring"), SERVICE_TOKEN);

const visibleStrings = collectStrings(view);
assert.equal(
  visibleStrings.filter((value) => SERVICE_TOKEN.test(value)).length,
  0,
  "service tokens survived in the service view",
);
const exactVisibleStrings = new Set(visibleStrings);
for (const sourceId of collectSourceIds(sourceFamilies)) {
  assert.equal(exactVisibleStrings.has(sourceId), false, `source ID ${sourceId} leaked into the service view`);
}

const baselineManifest = JSON.parse(await fs.readFile(
  path.join(projectRoot, "content/packs/tier-01-v2/clinical/tier-01/manifest.json"),
  "utf8",
));
assert.equal(baselineManifest.cases.length, 30);
for (const activeCase of baselineManifest.cases) {
  assert.equal(exactVisibleStrings.has(activeCase.id), false, `active player case ID ${activeCase.id} leaked`);
}

assert.doesNotMatch(html, /\.innerHTML\b/u, "renderer must not use innerHTML");
assert.match(html, /\.textContent\s*=/u, "renderer must insert authored data with textContent");
assert.doesNotMatch(html, new RegExp(view.families[0].variants[0].diagnosticTruth.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
assert.match(html, /Discovery проверен — показать истину/u);
assert.match(html, /text-overflow:\s*clip/u);
assert.match(html, /-webkit-line-clamp:\s*unset/u);
assert.doesNotMatch(html, /text-overflow:\s*ellipsis/u);

const maliciousView = JSON.parse(JSON.stringify(view));
maliciousView.title = "</script><img src=x onerror=alert(1)>";
const maliciousHtml = renderMedicalReviewServiceHtml(maliciousView);
assert.doesNotMatch(maliciousHtml, /<img src=x/u, "authored HTML was not encoded");
assert.doesNotMatch(maliciousHtml, /onerror=alert/u, "authored event handler was not encoded");

console.log(JSON.stringify({
  status: "passed",
  hierarchy: view.counts,
  exactPresentationChecks: viewPresentations.length,
  emergencyPresentations: viewPresentations.filter((presentation) => presentation.speech.emergency).length,
  playerCaseIdsChecked: baselineManifest.cases.length,
  renderedHtmlBytes: Buffer.byteLength(html),
}, null, 2));
