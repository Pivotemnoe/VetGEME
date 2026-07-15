# Generator v2 Compact Save

## Scope

This document describes only persistent data for `tier-01-v2`.

- Generator save currently uses `saveVersion: 7`.
- `generatorVersion` is `tier-01-v2.3.0`; the seeded namespace remains explicit and reproducible.
- The `tier-01-v2` game-state save currently uses version 10.
- `current` and `legacy-v1` keep game-state save version 1.
- This persistence contract does not approve medical content or activate pending catalog entries.

## Generator Save Version 7

The generator state keeps campaign-level fields unchanged:

```text
saveVersion
generatorVersion
capabilityRegistryId
capabilityRegistryVersion
contentPackId
contentPackVersion
contentPackHash
campaignSeed
generatedDays
pendingFollowUps
completedCases
seenCaseCounts
demandDirectorVersion
demandState
nextVisitId
```

Every generated day is persisted immediately. A persisted visit no longer contains `medicalContent` or embedded owner profile, modifier and home-action objects.

The compact visit stores:

```text
visitId, day, arrivalMinute, source, urgency, severity, family
caseId, caseIds, bundleId, diagnosisMode, maximumDiagnosisSelections
trueDiagnosisIds, diagnosisRoles, selectedDiagnosisIds
diagnosticCoverage, treatmentCoverage
contentPackId, contentPackVersion, contentPackHash
patient identity and optional appearance
owner name, optional appearance, profileId, modifierId, homeActionId
complaintId or complaintTextFallback
historyAnswerSelections
generalExamFindingIds, targetExamFindingIds
sampleActionIds, diagnosticTestIds, diagnosisOptionIds, planOptionIds
bookingReason, returnVisit, originalVisitId, followUpReason
optional appointmentId, treatmentCourseId, appointmentReason
optional attendanceDecision, adherenceState, longitudinalState
missingEquipment, requiresReferral, safeReferralAvailable
selectedPlanId and outcome when present
```

Stable IDs are preferred. If an already selected content element has no stable ID, its exact final text is stored in a `textFallback` field and the missing ID is reported; no synthetic content ID is created.

At runtime a compact visit is hydrated from the catalog selected by `caseId` and the exact content-pack identity. Hydrated `medicalContent` exists only in memory and is removed again before persistence.

## Tier 01 v2 Game Save Version 10

Version 10 continues to compact `queue` and `arrivalSchedule` before serialization:

- `v2Visit.medicalContent` is removed;
- embedded owner content objects are replaced by their stable IDs;
- runtime owner profile data is derived again after hydration;
- clinical progress, selected actions, findings, clinical record, owner state and visit timing remain persisted.

The version-10 whitelist also includes longitudinal care, capability/research/referral state, persistent owner and patient identities, operations, economy, reputation and the gated campaign-director container. The exact version history and whitelist are defined in [GAME_STATE_SAVE.md](GAME_STATE_SAVE.md); this compact-save document does not duplicate or supersede that contract.

Confirmed and rescheduled appointments are mirrored into generator `pendingFollowUps`; this is the generator's compact pending-recheck queue, rather than a second copy of medical content.

After loading, queue patients and arrival templates are hydrated before the browser loop resumes. Hydrated objects are never written back without compaction.

## Migration From Earlier Generator Saves

Migration is copy-on-success:

1. Parse the old value without mutating it.
2. Verify generator version and content-pack identity.
3. Build a separate version-7 candidate through the source-version-specific path.
4. Compact visits only for the older expanded formats that require it; already compact version-5 and version-6 days are not regenerated.
5. Preserve `campaignSeed`, days, fingerprints, outcomes, pending follow-ups, completed cases, seen counts and the next visit ID.
6. Validate that every compact visit can be hydrated from the unchanged catalog.
7. Serialize the complete new snapshot.
8. Replace the original key with one `setItem` call only after all previous steps succeed.

If parsing, compaction, validation, hydration or writing fails, the old key remains untouched and the error is propagated. An incompatible `contentPackHash` is not migrated.

The supported generator migration matrix is explicit:

- version 2 receives the existing metadata, booking-reason and fingerprint migration, then follows the compact path;
- version 3 is compacted before demand state is added;
- version 4 is the pre-demand compact format: deterministic demand state, source categories and routing are added once before validation;
- version 5 is already demand-aware at the campaign level: native version-5 day snapshots, all source categories, persisted routing, fingerprints, outcomes and visits remain unchanged; a day previously carried from version 4 keeps its older day namespace and lack of a snapshot; only the day schema marker advances to version 6 and missing version-6 longitudinal fields are defaulted on pending follow-ups;
- version 6 keeps every persisted field unchanged and adds only the version-7 capability-registry identity;
- every supported source finishes as a validated version-7 snapshot.

Each migration retains the exact source bytes under `pet-clinic-generator-v2:migration-source:v<sourceVersion>` before replacing the primary key. A current version-7 reload performs no migration write.

Version-5 input is accepted only with its historical top-level `tier-01-v2.2.0` namespace, compact pending-follow-up owners and no version-6 longitudinal visit fields. A day generated natively by version 5 uses `tier-01-v2.2.0` and a versioned demand snapshot. A day carried through the historical version-4 migration retains the `tier-01-v2.1.0` day namespace and omits `demandSnapshot`; its already persisted source category and routing are still authoritative and remain unchanged. One campaign may contain both forms. A forward-shaped or otherwise malformed combination fails closed and remains byte-for-byte untouched.

## Quota Failure

`QuotaExceededError` must not be treated as a successful save. The previous value remains in storage, the error is propagated to the game, the simulation is paused and the player receives a persistent message in the existing interface. Saving stays blocked until the page is reloaded or storage is freed.
