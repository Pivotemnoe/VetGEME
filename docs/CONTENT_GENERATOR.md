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

1. Campaign director defines chapter, difficulty, equipment, staffing and teaching constraints.
2. Visitor Demand Director calculates deterministic potential demand, safe capacity, sources and the explicit disposition of excess demand.
3. Equipment and referral routing rejects only cases without a safe local action or referral path.
4. Day planner adds due follow-ups, teaching/story slots, new visits, arrival times and compatible goals inside the accepted capacity.
5. Visit builder assembles one concrete visit without linking appearance to behavior.
6. Validator rejects medically impossible, unfair or overloaded combinations.
7. Consequence planner creates controls, calls, results, deterioration, non-adherence, gratitude and complaints.

## Persistence Contract

- a new campaign creates a new `campaignSeed`;
- reopening the application reuses the existing campaign and generated days;
- the next day is generated once after the previous day;
- the generated day is saved immediately;
- the same seed and generator version reproduce the same result;
- regeneration is a developer-only action.

Required generator save fields: `saveVersion`, `generatorVersion`, `campaignSeed`, `difficulty`, `generatedDays`, `pendingFollowUps`, `seenCaseCounts`, recent case IDs, full and structural fingerprints, `contentPackId`, `contentPackVersion`, `contentPackHash`, `demandDirectorVersion` and compact `demandState`.

Every newly generated day stores the exact demand decision used to build it. Every visit stores a source category while preserving its old scheduling alias. Trust, staffing or equipment changes affect only days that do not yet exist.

The active capability registry contains `microscope`, `xray` and `ultrasound`. Only the approved microscope is operational in the current game. Imaging capabilities are future-compatible test entries and do not create medical text.

The game state is stored separately from generated content. Modes use the isolated keys `pet-clinic-game-current`, `pet-clinic-game-legacy-v1` and `pet-clinic-game-tier-01-v2`; the schema contract is documented in [GAME_STATE_SAVE.md](GAME_STATE_SAVE.md).

## First Week, Standard Difficulty

| Day | Visits | Follow-ups | Urgent | Max waiting |
|---|---:|---:|---:|---:|
| 1 | 3 | 0 | 0 | 1 |
| 2 | 4 | 0–1 | 0 | 2 |
| 3 | 5 | 1 | 0 | 3 |
| 4 | 5–6 | 1 | 1 | 3 |
| 5 | 6 | 1 | 0–1 | 4 |
| 6 | 6–7 | 1–2 | 0–1 | 4 |
| 7 | 6–8 | 2–3 | 0–1 | 4 |

The `tier-01-v2` test mode uses 30 editorially complete cards from eight clinical families. They still require a separate medical review before this mode can become the production default. The first visit has a fixed tutorial role, not a fixed patient identity.

Day 3 has one guaranteed teaching walk-in. Days 4–7 use seeded probabilities from the seven-day plan. Missing follow-up targets are filled with new booked visits and never with invented return patients.

Combined cases are selected only from the approved bundle manifest. Bundles with `status: pending_content` are validated as technical shells but are never eligible for generation.

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
- days 1–3 contain only single-diagnosis cases;
- a combined bundle is ineligible until its own complaint, history, examinations, tests, diagnosis options, plans and outcomes are medically approved.

## Developer Verification

Generator changes require deterministic smoke tests and a large in-memory simulation. The full target is 10,000 first weeks with saved failing seeds, distribution reports and structural fingerprints. Browser rendering is not involved in this test.

Full source material: [SCENARIO_GENERATOR_SPEC.md](SCENARIO_GENERATOR_SPEC.md), [GENERATOR_ARCHITECTURE_NOTES.md](GENERATOR_ARCHITECTURE_NOTES.md).
