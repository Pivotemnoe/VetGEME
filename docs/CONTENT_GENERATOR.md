# Content Generator

## Principle

The generator does not invent medicine. It assembles a visit from compatible, validated data:

```text
clinical template
+ complaint variant
+ patient
+ owner base profile
+ 0–2 compatible modifiers
+ hidden facts with discovery paths
+ animal temperament
```

## Runtime Levels

1. Campaign director defines chapter, difficulty, equipment, staffing, teaching task and workload ceiling.
2. Day planner adds due follow-ups, teaching/story slots, new visits, arrival times and compatible goals.
3. Visit builder assembles one concrete visit without linking appearance to behavior.
4. Validator rejects medically impossible, unfair or overloaded combinations.
5. Consequence planner creates controls, calls, results, deterioration, non-adherence, gratitude and complaints.

## Persistence Contract

- a new campaign creates a new `campaignSeed`;
- reopening the application reuses the existing campaign and generated days;
- the next day is generated once after the previous day;
- the generated day is saved immediately;
- the same seed and generator version reproduce the same result;
- regeneration is a developer-only action.

Required save fields: `saveVersion`, `generatorVersion`, `campaignSeed`, `difficulty`, `generatedDays`, `pendingFollowUps`, `seenCaseCounts`, recent case IDs and structural fingerprints.

## First Week, Standard Difficulty

| Day | Visits | Follow-ups | Urgent | Max waiting |
|---|---:|---:|---:|---:|
| 1 | 3 | 0 | 0 | 1 |
| 2 | 4 | 0–1 | 0 | 2 |
| 3 | 5 | 1 | 0 | 3 |
| 4 | 5 | 1–2 | 1 | 3 |
| 5 | 6 | 1–2 | 0–1 | 4 |

The first week uses 16 validated templates from ear, skin, gastrointestinal and urinary families. The first visit has a fixed tutorial role, not a fixed patient identity.

## Hard Validation Rules

- critical facts have at least one available discovery action;
- required equipment exists or a safe referral path exists;
- no unsupported final diagnosis is required;
- clinical truth and test results do not change after reload;
- no more than two visits from one family per day;
- no more than one urgent and one high-conflict owner per first-week day;
- exact templates and owner bases do not repeat adjacently;
- goals are selected only after the schedule exists;
- follow-ups preserve patient and owner identity;
- a valid manual fallback day always exists.

## Developer Verification

Generator changes require deterministic smoke tests and a large in-memory simulation. The full target is 10,000 first weeks with saved failing seeds, distribution reports and structural fingerprints. Browser rendering is not involved in this test.

Full source material: [SCENARIO_GENERATOR_SPEC.md](SCENARIO_GENERATOR_SPEC.md), [GENERATOR_ARCHITECTURE_NOTES.md](GENERATOR_ARCHITECTURE_NOTES.md).
