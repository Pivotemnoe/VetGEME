# Diagnostic owner decisions — 2026-07-13

## Scope

Task 4 adds owner consent before diagnostics in the opt-in `tier-01-v2` mode. Medical cards, approved findings, case distribution, seeded generation, `current`, and `legacy-v1` remain unchanged.

## Implemented behavior

- Diagnostic actions are classified as `required`, `recommended`, `optional`, `low_value`, `contraindicated`, or `unavailable`.
- A technically available action is not hidden only because it has low clinical value.
- Cases without an approved diagnostic result expose an optional low-value system action. Its only result is: `Полученный результат не изменил клиническое решение`.
- Before execution, the owner may accept, refuse, ask the price, request a cheaper option, delay, or partially accept a multi-test proposal.
- The decision uses the visible owner state, actual budget, budget discussion, profile or budget modifier, test cost, and clinical importance.
- Refusal, delay, and an unaffordable proposal create no result and no payment. Diagnostic uncertainty remains attached to the patient.
- Accepted low-value diagnostics consume visit time, increase doctor fatigue through the existing time model, add diagnostic income, and reduce trust by three points.
- Tests requiring a sample cannot execute before the approved sample action. Consent is obtained before collection.
- The first waiting patient now becomes selectable even when the game pauses on arrival; the queue HUD is refreshed when the walking route reaches the waiting state.

## Persistence

The existing compact queue serializer already preserves unknown patient-owned fields without embedding `medicalContent`. Task 4 uses that path for `diagnosticDecisions`, `pendingDiagnosticTestId`, `executedDiagnosticTestId`, `diagnosticUncertainty`, and `diagnosticSkipped`.

These fields remain listed in the planned single Tier game-save v3 migration for Tasks 3–6. No save version was advanced in this isolated task.

## Tests

- Pure decision tests cover all six classifications, accepted diagnostics, price request, insufficient budget, refusal, partial consent, and the neutral low-value result.
- Compact save tests reload accepted-pending, asks-cost, refused, cheaper-option, delayed, and partially-accepted states.
- Refusal records assert `noResult` and `noPayment`.
- Browser smoke completes the first guided consultation and boots `current` and `legacy-v1` without console errors.

## Known boundaries

- Equipment-driven `unavailable` states accept an explicit reason, but the full equipment capability model and safe referral route belong to Tasks 5–6.
- Current content offers at most one approved diagnostic action per case. Partial consent is implemented and tested at engine level for future multi-test proposals.
- No new laboratory finding or disease-specific interpretation was authored.
