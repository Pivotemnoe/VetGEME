# Compact Save v2 Report

## Result

- Generator persistence schema: version 4.
- `tier-01-v2` game-state persistence schema: version 2.
- `current` and `legacy-v1` game-state schemas remain version 1.
- Generator version remains `tier-01-v2.1.0`, so the seeded random namespace is unchanged.
- Persisted generator days, queue patients and arrival templates contain no `medicalContent`.

## Migration

Generator version-3 state is parsed and converted into a separate version-4 snapshot. Campaign seed, generated days, day outcomes, pending follow-ups, completed cases, seen counts and the next visit ID are preserved. Every compact visit is hydrated against the unchanged content pack before one final `setItem` replaces the source value.

The tier game-state version-1 migration uses the same copy-on-success rule for the queue and `arrivalSchedule`. Invalid JSON, an incompatible content-pack hash, a missing referenced owner/content item, or `QuotaExceededError` leaves the source key unchanged.

## UTF-16 Size

Measurements include all keys of the simulated campaign: generator state, tier game state and selected generator mode.

| Campaign state | Previous equivalent | Compact | Reduction |
| --- | ---: | ---: | ---: |
| First generated day | 102,034 B | 14,238 B | 86.0% |
| Seven completed days | 1,334,658 B | 239,106 B | 82.1% |
| Thirty completed days | 7,419,940 B | 1,309,648 B | 82.3% |

The 30-day simulation is below both the required 2 MiB limit and the preferred 1.5 MiB limit.

Production content currently defines seven day rules. The size test extends days 8–30 with test-only copies of the day-7 rule, so the measurement is a real serialization run but not a prediction of final 30-day campaign balancing.

## Stable IDs

All selected complaints, owner-answer variants, exam findings, sample actions, diagnostic tests, diagnosis choices and plan choices used by the 30-day simulation had stable IDs.

The following generated/gameplay strings do not represent ID-addressable catalog items and remain exact text values:

- `bookingReason`;
- `followUpReason`;
- free-form outcome fields supplied by gameplay.

Nested sample-result text and plan follow-up text do not have independent IDs, but their selectable parent `sampleAction` and `planOption` objects do. They are restored through those parent IDs and the exact content-pack hash rather than through invented child IDs.

Patient and owner appearance is not currently generated as a separate field. The compact schema preserves an optional `appearance` object if it is added later; it does not invent an ID.

## Automated Coverage

`scripts/test-compact-save-v2.js` verifies:

- same seed and different seed behavior;
- reload stability before and after opening every simulated day;
- generator version-3 and game-state version-1 migration;
- follow-up identity and content;
- a partially completed clinical visit;
- incompatible content-pack hashes;
- impossible migration and quota failure without source-key overwrite;
- unchanged version-1 storage for `current` and `legacy-v1`;
- actual 1-, 7- and 30-day UTF-16 sizes.

## Intentionally Unchanged

Medical text, content-pack manifest, `integrationStatus`, content catalog locations, case distribution, seeded random logic, browser visuals and the clinical loop were not changed.
