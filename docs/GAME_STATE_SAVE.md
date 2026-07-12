# Game State Save

## Version

The first implemented full game-state format is `gameStateSaveVersion: 1`. Earlier builds reserved keys but did not write a full game state, so there is no preceding serialized schema to migrate.

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
- money, revenue, expenses and reputation events;
- selected doctor, fatigue and shift history;
- case journal, completed visits and pending returns;
- daily goals and counters;
- tutorial progress;
- end-of-day summary needed to restore the current screen.

DOM nodes, canvas context, animation timestamps and transient departing sprites are never serialized. Restored patients keep their clinical data and selected diagnoses; movement resumes from stored routes or a stable room state.

## Migration Policy

Any change to the whitelist meaning or stored value shape requires:

1. incrementing `GAME_STATE_SAVE_VERSION`;
2. adding an explicit migration from every supported previous version;
3. tests proving that queue, money, reputation, doctors, journal and pending returns survive;
4. a browser reload smoke test in all three generator modes.

Until such a migration exists, an incompatible save must remain untouched.
