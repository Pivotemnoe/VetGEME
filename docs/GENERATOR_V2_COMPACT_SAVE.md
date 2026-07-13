# Generator v2 Compact Save

## Scope

This change affects only persistent data for `tier-01-v2`.

- Generator save moves from `saveVersion: 3` to `saveVersion: 4`.
- `generatorVersion` remains `tier-01-v2.1.0`; changing it would change the seeded random namespace.
- The `tier-01-v2` game-state save moves from version 1 to version 2.
- `current` and `legacy-v1` keep game-state save version 1.
- Medical content, content-pack metadata, generation rules and runtime player behavior do not change.

## Generator Save Version 4

The generator state keeps campaign-level fields unchanged:

```text
saveVersion
generatorVersion
contentPackId
contentPackVersion
contentPackHash
campaignSeed
generatedDays
pendingFollowUps
completedCases
seenCaseCounts
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
missingEquipment, requiresReferral, safeReferralAvailable
selectedPlanId and outcome when present
```

Stable IDs are preferred. If an already selected content element has no stable ID, its exact final text is stored in a `textFallback` field and the missing ID is reported; no synthetic content ID is created.

At runtime a compact visit is hydrated from the catalog selected by `caseId` and the exact content-pack identity. Hydrated `medicalContent` exists only in memory and is removed again before persistence.

## Tier 01 v2 Game Save Version 2

The game-state field list remains unchanged. Before serialization, `queue` and `arrivalSchedule` are compacted:

- `v2Visit.medicalContent` is removed;
- embedded owner content objects are replaced by their stable IDs;
- runtime owner profile data is derived again after hydration;
- clinical progress, selected actions, findings, clinical record, owner state and visit timing remain persisted.

After loading, queue patients and arrival templates are hydrated before the browser loop resumes. Hydrated objects are never written back without compaction.

## Migration From Generator Save Version 3

Migration is copy-on-success:

1. Parse the old value without mutating it.
2. Verify generator version and content-pack identity.
3. Build a separate version-4 state.
4. Compact every visit in every generated day.
5. Preserve `campaignSeed`, days, fingerprints, outcomes, pending follow-ups, completed cases, seen counts and the next visit ID.
6. Validate that every compact visit can be hydrated from the unchanged catalog.
7. Serialize the complete new snapshot.
8. Replace the original key with one `setItem` call only after all previous steps succeed.

If parsing, compaction, validation, hydration or writing fails, the old key remains untouched and the error is propagated. An incompatible `contentPackHash` is not migrated.

Generator save version 2 first follows its existing metadata migration and is then compacted to version 4.

## Quota Failure

`QuotaExceededError` must not be treated as a successful save. The previous value remains in storage, the error is propagated to the game, the simulation is paused and the player receives a persistent message in the existing interface. Saving stays blocked until the page is reloaded or storage is freed.
