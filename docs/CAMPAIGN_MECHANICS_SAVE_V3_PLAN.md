# Campaign Mechanics Save v3 Plan

## Scope

The next Tier 01 v2 game-state schema will collect all persistent fields introduced by mechanics tasks 3-6. `current` and `legacy-v1` remain on game-state schema 1. Generator compact visits remain on their existing compact schema until the demand-director migration is applied.

## Tier 01 v2 Game-State Schema 3

Existing schema 2 fields remain unchanged. The following top-level fields are added:

- `ownerTrust`: clinic-level owner trust; initialized from the previous `reputation` value.
- `clinicalReliability`: professional clinical reliability; initialized from the previous `reputation` value.
- `awareness`: local clinic awareness used by demand calculations.
- `campaignFinance`: credit limit, debt, weekly review and closure-risk state.
- `dailyLedger`: consultation revenue, diagnostic revenue, procedure cost, payroll, maintenance, refunds and free rechecks.
- `equipmentCapabilities`: owned, unlocked, operational and capacity state keyed by capability id.
- `demandState`: director version, deferred demand, waiting list, incoming and outgoing referrals, source totals and the last persisted demand decision.
- `campaignOutcome`: 30-day completion and free-play state.

Patient objects in `queue` and `arrivalSchedule` may add the following compact runtime fields without embedding medical cards:

- `communicationResult` and `ownerComprehension`;
- `diagnosticDecisions` and `diagnosticUncertainty`;
- `prescriptionComponents`, `selectedPlanIds` and `ownerPlanDecision`;
- `immediateDecisionReview`;
- `clinicalSafety`, `diagnosticCoverage`, `treatmentCoverage`, `unnecessaryTreatment` and `communicationQuality`.

These patient fields are already carried by the compact queue representation. Hydrated `medicalContent` remains excluded from localStorage.

## Generator Save 5

Generator v2 will retain every existing compact generated day and add:

- `demandDirectorVersion`;
- `demandState` with deferred and waiting demand;
- a compact `demandSnapshot` on each newly generated day;
- `sourceCategory` on each newly generated visit while preserving legacy `source` aliases during migration.

Already generated days are never recalculated. New campaign-state or equipment values affect only days that do not yet exist.

## Atomic Migration

1. Parse the source snapshot without mutating storage.
2. Validate mode, source version and compact visit hydration.
3. Clone all existing state, queue, arrival schedule and generated days.
4. Add defaults only for missing schema-3 fields.
5. Preserve campaign seed, generated days, outcomes, pending follow-ups, active consultation and all selected clinical actions.
6. Validate and hydrate the complete candidate snapshot.
7. Write the candidate only after every previous step succeeds.
8. On any error, leave the original storage key byte-for-byte unchanged.

Quota errors retain the previous snapshot, pause the game and display the existing save-failure message.

## Compatibility

- `current`: intentionally unchanged.
- `legacy-v1`: intentionally unchanged.
- Tier 01 v2 schema 1 remains migratable through the compact schema-2 representation and then schema 3 in memory before one write.
- Tier 01 v2 schema 2 migrates directly to schema 3.
- Unknown versions and incompatible content-pack hashes remain blocked and are not overwritten.

