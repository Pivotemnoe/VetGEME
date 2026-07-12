# Generator v2 Stabilization, Combined Engine and Game Save

Date: 2026-07-13

## Status

- production default remains `current`;
- `legacy-v1` remains an isolated control implementation;
- `tier-01-v2` remains an opt-in test mode;
- all 30 single-diagnosis cards remain unchanged and pending medical review;
- all 10 combined bundles remain `pending_content` and are excluded from generation.

## Implemented

1. Versioned full game-state save (`gameStateSaveVersion: 1`).
2. Isolated game keys for `current`, `legacy-v1` and `tier-01-v2`.
3. Persisted clinic phase, day, time, economy, reputation, doctors, fatigue, queue, case journal, pending returns, goals and tutorial progress.
4. Unknown save versions and mode mismatches are blocked without overwrite.
5. Patient arrival forces an immediate save before the automatic tutorial pause.
6. A pure combined-case engine calculates diagnostic coverage, treatment coverage, clinical safety and unnecessary treatment.
7. The diagnosis UI data model supports one slot for single cases and two unique slots for future multiple cases.
8. A deterministic adapter pipeline checks one representative from each of the eight clinical families.

## Browser Smoke

Tested at `http://127.0.0.1:5174/?generatorMode=tier-01-v2`.

- planning shows only name, species, visit type and short booking reason;
- first arrived patient used the approved complaint and four contextual diagnoses;
- a completed visit changed money from 1350 V to 1680 V and reputation from 74.0 to 74.5;
- reload restored day 1, time 08:49, money 1680 V, reputation 74.5 and the completed queue state;
- an earlier smoke found and fixed a stale pre-arrival snapshot; reload now preserves the arrived patient at 08:20;
- switching to `current` and `legacy-v1` loaded independent empty day-one states;
- returning to `tier-01-v2` restored its exact time and queue;
- browser console contained no warnings or errors.

## Eight-family Pipeline Representatives

| Family | Case |
|---|---|
| ear | `EAR_MITES` |
| skin | `SKIN_GROOMING_IRRITATION` |
| gastrointestinal | `GI_DIETARY_INDISCRETION` |
| urinary | `URINARY_LOWER_SIGNS` |
| eyes | `EYE_CONJUNCTIVITIS` |
| respiratory | `RESP_CANINE_COUGH` |
| trauma | `TRAUMA_SUPERFICIAL_WOUND` |
| perianal | `PERIANAL_IMPACTION` |

For every representative, the test verifies that complaint, history questions and answers, target examination, diagnostic result and diagnosis options come from the same approved card. No rabbit or global legacy diagnosis is introduced.

## Generator Simulation

10,000 seven-day campaigns:

- full unique weeks: 10,000;
- structural unique weeks: 10,000;
- exact structural duplicates: 0;
- average structural similarity: 0.0109906545;
- maximum structural similarity: 0.1076923077;
- cases covered: 30/30;
- follow-up visits: 74,933;
- unplanned visits: 31,999;
- day 3 walk-in frequency: 100%;
- day 4 walk-in frequency: 45.04%;
- day 5 walk-in frequency: 59.48%;
- day 6 walk-in frequency: 65.23%;
- day 7 walk-in frequency: 50.24%;
- same-seed, different-seed, reload, incompatibility guard and v2 migration checks passed.

The full distribution remains in [generator-v2-10000-2026-07-12.md](generator-v2-10000-2026-07-12.md).

## Checks

- JavaScript syntax: passed;
- Tier 01 content validation: passed;
- Tier 01 v2 validation: 55 JSON, 30 clinical files, 0 errors;
- adapter and eight-family pipeline: passed;
- follow-up negative scenarios: passed;
- generator save isolation: passed;
- game-state save and incompatibility: passed;
- combined-case engine: passed;
- legacy generator, 1,000 weeks: passed;
- Generator v2, 1,000 and 10,000 weeks: passed;
- browser smoke in all three modes: passed;
- `git diff --check`: passed.

There is no production build step in the current static HTML/JavaScript project. Syntax, content validation and browser loading are the production-equivalent checks.

## Intentionally Not Changed

- no combined bundle was enabled;
- no medical text was added, merged or rewritten;
- no new diagnosis was added;
- no visual redesign was performed;
- no production default was switched;
- no save reset UI was added.

## Remaining Risks

1. Combined-case UI and outcome flow are dormant until an approved bundle supplies its own clinical content and treatment components.
2. The 30 single cards still require medical review.
3. Save schema v1 has no prior full-state migration because earlier builds did not serialize full game state. Any future schema change requires an explicit migration.
