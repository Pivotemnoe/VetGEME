# Clinical Visit UI Stabilization — 2026-07-13

## Scope

This change stabilizes one guided Tier 01 v2 visit. It does not change generator selection, seeded random, generated days, the 30 clinical cards, save schema version, default generator mode or combined bundle eligibility.

## Changed Behavior

- The patient moves from `waiting` to `in_consultation` when called and is removed from the waiting and next-patient cards.
- An active consultation survives reload without changing the patient or stage.
- Clinical information is routed into history, physical examination, diagnostic tests, clinical interpretation and care plan sections.
- Required and optional history questions are displayed separately.
- Urgency is `not_assessed` before the general exam and is assessed after it.
- The visit ends through explanation, care-plan agreement and a separate completion action.
- A full guided visit increments both compatible day goals.

## Browser Evidence

- [Queue during consultation](../../artifacts/playtest-clinical-visit/01-queue-during-visit.png)
- [After required history](../../artifacts/playtest-clinical-visit/02-after-history.png)
- [After general and target examinations](../../artifacts/playtest-clinical-visit/03-after-exams.png)
- [After care-plan agreement](../../artifacts/playtest-clinical-visit/04-after-care-plan.png)

The automated run observed `0 waiting / 1 in consultation` during the visit and `0 waiting / 0 in consultation` after completion. Day goals became `finish guided visit 1/1` and `complete two full visits 1/2`. Browser console and page-error lists were empty.

## Verification

- `npm run test:clinical-visit`
- `npm run validate:tier-01-v2`
- `npm run test:adapter:v2`
- `npm run test:generator:v2`
- `npm run test:generator:legacy`
- `npm run test:game-state-save`
- `npm run test:save-isolation`
- `npm run test:multi-diagnosis-v2`
- full guided browser visit with reload after call, history, examinations and care-plan agreement
- boot smoke for `current` and `legacy-v1`
- `git diff --check`

## Intentionally Unchanged

- `current` remains the default mode.
- Generator v2 and its content pack are unchanged.
- Save schema remains version 1.
- All combined bundles remain `pending_content` and disabled.
- Medical statements in the 30 cards were not edited.

## Known Risks

- The clinical record uses the existing scrollable visit workspace; dense later cases may need a separate information-density pass.
- The urgency mapping is ready for routine, priority, urgent and emergency states, but the medical review must confirm which approved cards should use the priority category.
