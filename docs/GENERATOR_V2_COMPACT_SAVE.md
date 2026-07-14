# Generator v2 Compact Save

## Scope

This change affects only persistent data for `tier-01-v2`.

- Generator save currently uses `saveVersion: 6`.
- `generatorVersion` is `tier-01-v2.2.0`; the seeded namespace remains explicit and reproducible.
- The `tier-01-v2` game-state save currently uses version 5.
- `current` and `legacy-v1` keep game-state save version 1.
- Medical content, content-pack metadata, generation rules and runtime player behavior do not change.

## Generator Save Version 6

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
optional appointmentId, treatmentCourseId, appointmentReason
optional attendanceDecision, adherenceState, longitudinalState
missingEquipment, requiresReferral, safeReferralAvailable
selectedPlanId and outcome when present
```

Stable IDs are preferred. If an already selected content element has no stable ID, its exact final text is stored in a `textFallback` field and the missing ID is reported; no synthetic content ID is created.

At runtime a compact visit is hydrated from the catalog selected by `caseId` and the exact content-pack identity. Hydrated `medicalContent` exists only in memory and is removed again before persistence.

## Tier 01 v2 Game Save Version 5

The game-state field list remains unchanged. Before serialization, `queue` and `arrivalSchedule` are compacted:

- `v2Visit.medicalContent` is removed;
- embedded owner content objects are replaced by their stable IDs;
- runtime owner profile data is derived again after hydration;
- clinical progress, selected actions, findings, clinical record, owner state and visit timing remain persisted.

The version-5 whitelist also includes `appointments`, `treatmentCourses`, `longitudinalPatients` and `attendanceEvents`. Confirmed and rescheduled appointments are mirrored into generator `pendingFollowUps`; this is the generator's compact pending-recheck queue, rather than a second copy of medical content.

After loading, queue patients and arrival templates are hydrated before the browser loop resumes. Hydrated objects are never written back without compaction.

## Migration From Earlier Generator Saves

Migration is copy-on-success:

1. Parse the old value without mutating it.
2. Verify generator version and content-pack identity.
3. Build a separate version-6 state.
4. Compact every visit in every generated day.
5. Preserve `campaignSeed`, days, fingerprints, outcomes, pending follow-ups, completed cases, seen counts and the next visit ID.
6. Validate that every compact visit can be hydrated from the unchanged catalog.
7. Serialize the complete new snapshot.
8. Replace the original key with one `setItem` call only after all previous steps succeed.

If parsing, compaction, validation, hydration or writing fails, the old key remains untouched and the error is propagated. An incompatible `contentPackHash` is not migrated.

Generator save versions 2 and 3 first follow their existing metadata migration. Versions 4 and 5 are compacted directly to version 6, adding deterministic appointment defaults only where the old follow-up record has no longitudinal fields.

## Quota Failure

`QuotaExceededError` must not be treated as a successful save. The previous value remains in storage, the error is propagated to the game, the simulation is paused and the player receives a persistent message in the existing interface. Saving stays blocked until the page is reloaded or storage is freed.
