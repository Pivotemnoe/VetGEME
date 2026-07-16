#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const sourceRoot = path.resolve(
  repoRoot,
  process.env.MEDICAL_SOURCE_ROOT || 'content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source'
);
const baselineRoot = path.resolve(
  repoRoot,
  process.env.MEDICAL_BASELINE_ROOT || 'content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.39/source'
);
const cache = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'p8-medical-review-authoring/generated/P8_TRANSLATION_CACHE.json'), 'utf8')
).translations;

function byId(items = []) {
  return new Map(items.map((item) => [item.id, item]));
}

const currentFamilyRoot = path.join(sourceRoot, 'families');
const files = fs.readdirSync(currentFamilyRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    current: path.join(currentFamilyRoot, entry.name, 'family.production.json'),
    baseline: path.join(baselineRoot, 'families', entry.name, 'family.production.json')
  }))
  .filter(({ current, baseline }) => fs.existsSync(current) && fs.existsSync(baseline))
  .sort((a, b) => a.current.localeCompare(b.current));

let restored = 0;
let preservedAuthoredNullState = 0;
let missingMatches = 0;

for (const { current, baseline } of files) {
  const family = JSON.parse(fs.readFileSync(current, 'utf8'));
  const sourceFamily = JSON.parse(fs.readFileSync(baseline, 'utf8'));
  const sourceVariants = byId(sourceFamily.variants);
  for (const variant of family.variants ?? []) {
    const sourceVariant = sourceVariants.get(variant.id);
    if (!sourceVariant) { missingMatches += 1; continue; }
    const sourcePresentations = byId(sourceVariant.presentations);
    for (const presentation of variant.presentations ?? []) {
      const sourcePresentation = sourcePresentations.get(presentation.id);
      if (!sourcePresentation) { missingMatches += 1; continue; }
      const sourceInvestigations = byId(sourcePresentation.investigations);
      for (const investigation of presentation.investigations ?? []) {
        const sourceInvestigation = sourceInvestigations.get(investigation.id);
        if (!sourceInvestigation) { missingMatches += 1; continue; }
        if (typeof sourceInvestigation.result === 'string' && sourceInvestigation.result.trim()) {
          investigation.result = cache[sourceInvestigation.result] ?? sourceInvestigation.result;
          restored += 1;
        } else {
          investigation.result = null;
          preservedAuthoredNullState += 1;
        }
      }
    }
  }
  fs.writeFileSync(current, `${JSON.stringify(family, null, 2)}\n`);
}

console.log(JSON.stringify({
  families: files.length,
  restoredNonNullResults: restored,
  preservedAuthoredNullState,
  missingMatches
}, null, 2));
if (missingMatches > 0) process.exitCode = 1;
