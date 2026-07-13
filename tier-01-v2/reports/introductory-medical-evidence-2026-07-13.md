# Introductory Medical Evidence Review - 2026-07-13

## Scope

This review covers the first Tier 01 v2 ear-mite, flea-infestation and superficial-wound evidence paths. It does not change case distribution, seeded random, save formats, `current`, `legacy-v1` or the default generator mode.

## Verified

- Ear-mite history and target examination do not reveal the parasite. Sampling alone does not confirm it; microscopy does.
- Live fleas and flea dirt support flea infestation. Flea-allergic dermatitis remains an acceptable hypothesis rather than an automatically proven diagnosis.
- The superficial-wound management action `observe_dirty` is not exposed as a diagnosis.
- The missing fourth wound diagnosis slot is explicitly `pending_medical_review`; no replacement clinical text was invented.
- Every case has at least one complaint variant for every allowed species, and the v2 adapter refuses to display a species-incompatible complaint.
- Examination, investigation and treatment actions are read from the selected clinical card rather than built by UI string replacement.

## Pending Content Structure

- Animal names and sex are still selected independently by generator v2. A stable sex-aware identity catalog is required before this can be enforced without changing generated campaigns.
- History answer variants do not yet carry explicit patient-sex metadata. Russian pronouns cannot be inferred safely because some lines refer to another household animal.
- These two gaps remain `pending_content`/`pending_engine_adapter`. No pronoun or name is rewritten in the UI.

## Verification

- `npm run validate:tier-01-v2`
- `npm run test:introductory-cases:v2`
- `npm run test:adapter:v2`
- `git diff --check`

