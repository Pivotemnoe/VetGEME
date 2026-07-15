# Resource Scheduler v5

Status: `core_integrated_production_catalogs_gated`.

## Scope

P5 adds a deterministic operations layer for `tier-01-v2` without changing the
medical catalog, generated days, current/legacy modes or clinic renderer. The
implementation follows the resource and time model in the master package, while
keeping every missing staff, room, task-duration and maintenance definition
closed instead of replacing it with a guessed default.

Runtime modules:

- `systems/resource-scheduler-v5.js` — pure resource/task scheduler;
- `systems/operations-runtime-v5.js` — canonical persisted operations state,
  exact imports, handoffs and summaries;
- `generator/game-state-save.js` — Tier save v8 and atomic v7-to-v8 migration;
- `game.js` — empty fail-closed production state, reload restoration and a
  read-only readiness/developer summary.

## Scheduler contract

The scheduler accepts only explicit resource definitions. A resource has a
stable ID, positive capacity, an explicit non-empty capability list and explicit
unavailable windows. It does not infer a capacity, skill, shift or room from a
display name, a sprite or an aggregate demand value.

A task contains only operational references and values:

- stable task/source/patient/owner IDs;
- absolute campaign minute, priority and urgency;
- authored positive duration;
- an explicit fatigue percentage and authored duration multiplier;
- AND requirement groups, each with one or more explicit OR alternatives;
- a safe-route requirement for urgent work.

Clinical result, diagnosis, complaint, finding, treatment, free-form narrative
and generic payload fields are rejected. `researchOrders` remains the owner of
authored research results.

Intervals are half-open (`startAt <= minute < endAt`). This and the deterministic
tie-break `priority desc -> queuedAt asc -> taskId asc` are implementation
policies because the package requires deterministic conflict-free scheduling but
does not prescribe the boundary algorithm. They do not create game content.

Scheduling all requirement groups is atomic. A failed attempt does not leave a
partial staff, room or equipment reservation. Simultaneous reservations are
allowed only up to the resource's explicit capacity.

The technical handoff primitive accepts only explicit `reassignments`. Every
entry names `groupId`, `fromResourceId`, `toResourceId`, `capabilityId` and
positive integer `units`. The task must be active and the handoff minute must be
inside its half-open active interval. The previous resource must own that group
at that minute; the target must be an authored alternative with the capability,
capacity and availability required through the task end. All entries transfer
atomically. A successful transfer closes the old reservation at the handoff
minute and opens the new reservation at the same minute, so each requirement
group has sequential, non-overlapping, gap-free ownership segments.
Persisted handoff events are accepted only when their exact scheduler
fingerprint and both reservation boundaries agree. A new transfer cannot be
inserted before a later transfer of the same task/group, so replay cannot erase
or reinterpret already persisted ownership history.

This primitive does not decide who should receive work or when a transfer should
happen. Delegation, supervision and automatic handoff policies remain gated.

## Fatigue and urgent work

Fatigue changes only scheduled duration through the explicit multiplier. It does
not change a clinical result. At 100% fatigue a new routine task is blocked, an
already active task can still be completed, and urgent work remains eligible.

If an urgent task cannot start at the requested time, it stays queued and returns
`urgent_capacity_unavailable_safe_route_required`. It is never silently dropped;
cancelling it requires an explicit stable `safeRouteId`.

## Persistence and compatibility

Tier game save v8 adds:

```text
operationsState
  schemaVersion
  resources
  tasks
  reservations
  handoffs
  appliedCommandIds
  commandFingerprints
```

The state is normalized before persistence, survives reload, uses exact
command-content fingerprints for idempotency and contains no copied registry or
medical text. Reusing a command ID with different content fails closed. Imported
legacy command IDs without a fingerprint remain readable but cannot be reused as
new scheduler commands. The v7-to-v8
migration is atomic, preserves an exact v7 backup, adds only a validated empty
operations state and leaves the active visit, P3/P4 collections and generated
day unchanged. Rollback restores the exact source bytes. Unknown, malformed and
future operations schemas fail without writes.

`deviceQueues` remains the compatibility owner of existing P3 device tasks. The
save validator rejects an operations task with the same task ID or the same
device-order source reference. P5 does not duplicate or silently import them
because a P3 device task does not
contain the staff, room and complete requirement information needed by the new
scheduler. `importExactTask` is available only when a caller supplies a complete
validated task, reservations and source command IDs.

`current` and `legacy-v1` remain on game save v1. The generator save stays on v7.

## Production activation boundary

The browser initializes a valid empty operations state. No assistant, laboratory
employee, administrator, room, procedure, absence or maintenance event is
created. The current two-doctor shift system continues to operate unchanged;
those doctors are not converted into scheduler resources until exact individual
calendar, skills and task requirements are authored.

This is intentional fail-closed activation, not a placeholder. Unit and browser
tests use explicitly marked synthetic fixtures only to prove the engine contract.

## Verification

Automated coverage includes:

- capacity conflicts and atomic multi-resource reservations;
- separate staff/device availability windows;
- AND/OR requirements and deterministic ordering;
- command idempotency and immutable inputs;
- conflicting command-ID reuse, including failed schedule attempts;
- fatigue/result isolation and the 100% fatigue rule;
- urgent full-load safe-route handling;
- exact active-task/reservation reload and handoff ownership restoration;
- previous-owner, target capability/capacity/availability and active-interval
  handoff rejection;
- atomic multi-resource handoff failure and gap/overlap validation;
- persisted handoff/fingerprint tampering and retroactive transfer rejection;
- forbidden medical fields and missing duration/capacity rejection;
- Tier v1-v7 migration, v7 backup/rollback and mode isolation;
- active-visit and generated-day preservation;
- browser console/network checks.

The P5 browser smoke restored one active two-resource task, verified the original
staff owner, performed an explicit handoff, then restored the old/new ownership
segments plus the unchanged room reservation after reload. It kept the active
visit and generated day unchanged and reported no browser errors.
