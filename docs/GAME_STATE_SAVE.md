# Game State Save

## Versions

`current` and `legacy-v1` remain on `gameStateSaveVersion: 1`.

`tier-01-v2` uses `gameStateSaveVersion: 7`. Version 3 extended the compact version-2 snapshot with campaign mechanics state:

- owner trust and clinical reliability;
- awareness and reserved demand-director state;
- campaign finance, credit limit and weekly review;
- per-day ledgers and campaign outcome;
- reserved equipment capability state.

Version 4 adds compact per-patient action state for the free clinical flow: stable IDs of completed general-exam actions, target-exam actions and diagnostic tests. Full medical text remains in the validated content pack and is not duplicated in the save.

Version 5 adds longitudinal state: appointments, treatment courses, attendance events and stable patient histories. Appointment and course records use stable IDs and content action IDs; approved medical text remains in the content pack.

Version 6 adds the P3 capability, research-order, referral-order, async-event and device-queue state. The save records the exact capability-registry identity and validates every lifecycle and cross-reference.

Version 7 adds the P4 owner/patient identity registry, per-visit references and historical state snapshots. Stable identities are scoped by the exact campaign seed and the explicit root visit (`originalVisitId || sourceVisitId || visitId`); names and appearance never participate in identity. The raw save uses compact format `identity-v4-delta-2`: derivable IDs and current snapshots are restored at load, while authored profile, state, appearance and idempotent history differences are stored as validated deltas. A historical visit keeps its own snapshot when a repeat changes current state.

Tier snapshots from versions 1 through 6 migrate atomically to version 7. Versions 1 and 2 also receive the version-3 campaign defaults. Longitudinal and P3 collections are initialized without fabricating historical appointments, tasks or results. The v6-to-v7 step preserves every pre-existing state field, creates only identities justified by exact source references, validates campaign ownership and reciprocal links, and never changes generator saves or already generated days. During migration queued and scheduled visits are hydrated from the current content pack, legacy aggregate exam flags are converted to action IDs, and the candidate is compacted and validated before it is written. A failed migration leaves the original key byte-for-byte unchanged.

Unknown, missing or future versions are not loaded and are not overwritten during that browser session. A mode mismatch is handled the same way. This prevents a campaign from being silently reset or interpreted under another generator.

## Isolation

Each generator mode owns one game-state key:

| Mode | Key |
|---|---|
| `current` | `pet-clinic-game-current` |
| `legacy-v1` | `pet-clinic-game-legacy-v1` |
| `tier-01-v2` | `pet-clinic-game-tier-01-v2` |

Generator persistence remains separate. Switching `generatorMode` cannot load the clinic state, queue or journal of another mode.

## Persisted State

The whitelist includes:

- current day and phase (`planning`, `running`, `closing`, `summary`);
- clinic time, schedule and queue;
- money, revenue, expenses and clinic metric events;
- selected doctor, fatigue and shift history;
- case journal, completed visits and pending returns;
- appointments, linked treatment courses, attendance outcomes and longitudinal patient state;
- the compact persistent owner/patient registry, exact per-visit identity references, snapshots and visit history;
- capability state, research/referral lifecycles, async events and queued device work;
- daily goals and counters;
- tutorial progress;
- stable IDs of performed questions, exam actions, measurements and diagnostic tests;
- end-of-day summary needed to restore the current screen.

DOM nodes, canvas context, animation timestamps and transient departing sprites are never serialized. Restored patients keep their clinical data and selected diagnoses; movement resumes from stored routes or a stable room state.

## Migration Policy

Any change to the whitelist meaning or stored value shape requires:

1. incrementing the save version for the affected mode;
2. adding an explicit migration from every supported previous version;
3. tests proving that queue, money, reputation, doctors, journal and pending returns survive;
4. a browser reload smoke test in all three generator modes.

Until such a migration exists, an incompatible save must remain untouched.
