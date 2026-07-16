import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const catalogPath = path.join(root, 'p8-medical-review-authoring/source/human-dialogue-library.json');
const ownerPath = path.join(root, 'operational-production-authoring/generated/p4/owner-profile-catalog.json');
const outputPath = path.join(root, 'p8-medical-review-authoring/generated/P8_DIALOGUE_VALIDATION.json');

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const ownerCatalog = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
const requiredOwnerFunctions = ['arrival', 'complaint', 'uncertainty', 'consent', 'refusal', 'teachBack', 'followUp', 'lightHumor'];
const requiredDoctorFunctions = [
  'openVisit', 'clarifyTimeline', 'inviteHomeTreatmentDisclosure', 'summarizeKnownUnknown',
  'explainInvestigation', 'explainUncertainty', 'proposeStagedPlan', 'respondToRefusal',
  'urgentRoute', 'giveHomePlan', 'teachBack', 'closeVisit', 'deescalate', 'plainLanguage',
  'evidenceResponse'
];
const forbidden = [/\bauthored\b/iu, /\bfixed\b/iu, /\bplaceholder\b/iu, /\btbd\b/iu];
const issues = [];

function checkText(value, location) {
  if (typeof value !== 'string' || !value.trim()) {
    issues.push({ severity: 'P0', code: 'EMPTY_PLAYER_TEXT', location });
    return;
  }
  if (!/[А-Яа-яЁё]/u.test(value)) issues.push({ severity: 'P0', code: 'PLAYER_TEXT_NOT_RUSSIAN', location, value });
  for (const pattern of forbidden) {
    if (pattern.test(value)) issues.push({ severity: 'P0', code: 'SERVICE_TOKEN_IN_PLAYER_TEXT', location, value });
  }
}

const expectedProfiles = new Set(ownerCatalog.profiles.map((profile) => profile.profileId));
const actualProfiles = new Set(catalog.ownerProfiles.map((profile) => profile.profileId));
for (const profileId of expectedProfiles) {
  if (!actualProfiles.has(profileId)) issues.push({ severity: 'P0', code: 'OWNER_PROFILE_MISSING', profileId });
}
for (const profile of catalog.ownerProfiles) {
  if (!expectedProfiles.has(profile.profileId)) issues.push({ severity: 'P1', code: 'UNKNOWN_OWNER_PROFILE', profileId: profile.profileId });
  checkText(profile.voice, `ownerProfiles.${profile.profileId}.voice`);
  for (const functionId of requiredOwnerFunctions) {
    const lines = profile.utterances?.[functionId];
    if (!Array.isArray(lines) || lines.length === 0) {
      issues.push({ severity: 'P0', code: 'OWNER_FUNCTION_MISSING', profileId: profile.profileId, functionId });
      continue;
    }
    lines.forEach((line, index) => checkText(line, `ownerProfiles.${profile.profileId}.${functionId}.${index}`));
  }
}

for (const functionId of requiredDoctorFunctions) {
  const lines = catalog.doctorSpeech?.[functionId];
  if (!Array.isArray(lines) || lines.length === 0) {
    issues.push({ severity: 'P0', code: 'DOCTOR_FUNCTION_MISSING', functionId });
    continue;
  }
  lines.forEach((line, index) => checkText(line, `doctorSpeech.${functionId}.${index}`));
}

for (const event of catalog.rareAbsurdEvents ?? []) {
  checkText(event.ownerLine, `rareAbsurdEvents.${event.eventId}.ownerLine`);
  checkText(event.doctorLine, `rareAbsurdEvents.${event.eventId}.doctorLine`);
  if ((event.allowedUrgency ?? []).includes('emergency')) {
    issues.push({ severity: 'P0', code: 'ABSURD_EVENT_ALLOWED_IN_EMERGENCY', eventId: event.eventId });
  }
}

const report = {
  schemaVersion: 1,
  catalogVersion: catalog.catalogVersion,
  status: issues.some((issue) => issue.severity === 'P0') ? 'blocked' : 'pass',
  counts: {
    expectedOwnerProfiles: expectedProfiles.size,
    actualOwnerProfiles: actualProfiles.size,
    ownerFunctionsPerProfile: requiredOwnerFunctions.length,
    doctorFunctions: requiredDoctorFunctions.length,
    rareAbsurdEvents: catalog.rareAbsurdEvents?.length ?? 0,
    issues: issues.length
  },
  safetyRules: catalog.renderingRules,
  issues
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, counts: report.counts }, null, 2));
if (process.argv.includes('--require-clean') && report.status !== 'pass') process.exitCode = 1;
