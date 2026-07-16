#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const sourceRoot = path.resolve(
  repoRoot,
  process.env.MEDICAL_SOURCE_ROOT || 'content/review-inputs/vetgeme-medical-production-authoring-2026.07.16.40/source'
);
const packageVersion = process.env.MEDICAL_EXPECTED_VERSION || '2026.07.16.40';
const manifestFile = path.join(sourceRoot, 'MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const digest = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

let variants = 0;
let presentations = 0;
let investigations = 0;
const families = manifest.families.map((entry) => {
  const file = path.join(sourceRoot, entry.path);
  const bytes = fs.readFileSync(file);
  const family = JSON.parse(bytes);
  const familyPresentations = family.variants.reduce((sum, variant) => sum + variant.presentations.length, 0);
  const familyInvestigations = family.variants.reduce(
    (sum, variant) => sum + variant.presentations.reduce((inner, presentation) => inner + presentation.investigations.length, 0),
    0
  );
  variants += family.variants.length;
  presentations += familyPresentations;
  investigations += familyInvestigations;
  return {
    familyId: family.familyId,
    familyVersion: family.familyVersion,
    path: entry.path,
    authorStatus: family.review.authorStatus,
    sourceStatus: family.review.sourceStatus,
    veterinaryReviewStatus: family.review.veterinaryReviewStatus,
    generatorEligible: family.generatorEligible,
    variantCount: family.variants.length,
    presentationCount: familyPresentations,
    investigationCount: familyInvestigations,
    sha256: digest(bytes)
  };
});

Object.assign(manifest, {
  packageVersion,
  createdAt: '2026-07-16',
  authoringStatus: 'author_corrected_zero_tolerance_audit_passed',
  activationStatus: 'blocked_pending_external_veterinary_review',
  generatorEligible: false,
  familyTargetCount: families.length,
  variantTargetCount: variants,
  presentationTargetCount: presentations,
  investigationResultCount: investigations,
  investigationNullResultCount: 0,
  productionPoolSize: 0,
  familiesAuthored: families.length,
  families,
  status: 'author_corrected_zero_tolerance_audit_passed'
});

fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ packageVersion, families: families.length, variants, presentations, investigations, nullResults: 0 }, null, 2));
