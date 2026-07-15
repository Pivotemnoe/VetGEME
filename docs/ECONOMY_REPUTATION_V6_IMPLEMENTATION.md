# Economy and Reputation v6

Status: `technical_core_implemented_production_catalogs_gated`.

P6 adds explicit, auditable economy and four-axis reputation primitives for
`tier-01-v2`. It does not activate the candidate balance from prose, infer
transactions from clinical activity or replace the existing player loop before
approved machine-readable catalogs exist.

Canonical design sources are
`handoff/vetgeme-master-package/systems/04_ECONOMY_MODEL.md` and P6 in
`handoff/vetgeme-master-package/implementation/00_PROGRAMMER_HANDOFF_PLAN.md`.
Missing production values are recorded separately in
[`reports/ECONOMY_REPUTATION_V6_GAPS.md`](../reports/ECONOMY_REPUTATION_V6_GAPS.md).

## Runtime boundary

The technical slice consists of:

- `systems/economy-runtime-v6.js` — explicit ledger, obligation, inventory,
  procurement, asset, maintenance, owner-plan and recovery audit commands;
- `systems/reputation-runtime-v6.js` — explicit four-axis baseline, events,
  reversals, validation, normalization, serialization and summaries;
- `generator/game-state-save.js` — Tier game save v9 and atomic v8-to-v9
  migration for `economyState` and `reputationState`;
- `game.js` — empty fail-closed production defaults, reload restoration and a
  read-only developer/readiness summary;
- `scripts/test-economy-runtime-v6.js` and
  `scripts/test-reputation-runtime-v6.js` — pure-core contract checks;
- `scripts/playtest-p6-runtime.js` — browser persistence smoke.

The new modules own audit state only. P3 remains the source of capability,
research, referral and device-order state. P5 remains the source of tasks,
resources and reservations. Clinical truth remains in approved medical content
and medical systems. The P6 core does not reinterpret any of those records.

## Explicit audit contract

Both modules use schema version 1 and accept only explicit commands; reputation
also requires explicit baseline initialization. A caller must provide stable
command and source identities plus every quantitative value needed by the
command. The modules do not fill an absent price, amount, score, category,
account, time, threshold or reason from a display name or nearby runtime state.

Commands are applied atomically to cloned normalized state. Successful commands
are appended to audit history; prior records are not edited or deleted.
Command-content fingerprints provide exact idempotency:

- replaying the same command ID with exactly the same content returns the same
  logical result without a second effect;
- reusing a command ID with different content fails closed;
- in economy state, one exact `(sourceType, sourceId)` owns one command across all domains; a future multi-effect caller must issue domain-specific source IDs rather than reuse one upstream identity;
- a reversal is an explicit append-only command linked to the original record;
- an already reversed record cannot be reversed again;
- invalid input or an invalid candidate leaves the caller's state unchanged.

Strict allow-lists reject unknown payload fields and clinical data. Audit
metadata may identify the approved external source, but it cannot carry a
diagnosis, finding, test result, treatment instruction or other medical truth.

### Economy primitive

`economyState` starts as schema-versioned empty collections. The core can
validate and preserve caller-authored accounting effects without deciding when
an effect should happen. Its explicit primitives cover:

- ledger posting and reversal;
- obligation accrual and settlement;
- inventory receipt, consumption and expiry;
- procurement creation, receipt and cancellation;
- clinic-asset acquisition and disposal;
- maintenance scheduling and completion;
- owner-plan and budget decisions;
- recovery attempts and explicit recovery-state transitions.

Batch application is atomic: if one command fails, none of the commands in the
batch changes state. Full-state validation deterministically replays the audit
history and rejects collections that cannot be reproduced from their commands.
Nested histories remain append-only. `closure_review` is structurally blocked
until at least two explicit failed recovery attempts exist; P6 does not infer
those failures or their thresholds. Lifecycle timestamps cannot move backwards,
and a recovery record can close only after `stabilized` or `closure_review`.
These are minimum audit-safety invariants, not a production recovery or clinic-
closure policy.

The primitive does not automatically:

- charge a consultation or research order;
- accrue payroll, rent, maintenance or debt;
- consume or procure inventory;
- buy, sell, damage, repair or maintain a clinic asset;
- choose an owner-budget plan, refund or instalment;
- select a recovery action or close the clinic.

Those are production policies and catalog values, not consequences that can be
derived safely from the presence of a visit, order, capability or reservation.

### Reputation primitive

`reputationState` uses exactly four internal axes:

- `clinical`;
- `communication`;
- `accessibility`;
- `organization`.

Initialization requires an explicit approved catalog identity and one exact
baseline score per axis. A reputation event names one axis, a finite non-zero
delta and a unique source. Reversal is explicit and append-only. Until an
approved baseline exists, event and reversal commands fail closed.

The primitive does not compute an aggregate public rating, choose an axis from
free text, connect an axis to demand or infer reputation from satisfaction,
trust, adherence, a medical result or a queue outcome. Those mappings remain
closed until independently approved.

## Production fail-closed state

The master package contains design prose and preliminary simulation numbers, but
no approved versioned P6 catalogs. A fresh production `tier-01-v2` campaign
therefore creates valid schema-versioned `economyState` and `reputationState`
containers: economy has empty domain/audit collections, while reputation has no
catalog or baseline and an empty audit history.

This is the only safe production default. It is not a zero-price economy, four
zero reputation scores or a hidden fallback balance. No production caller posts
economy commands, and reputation events are rejected without its approved
baseline. Tests may apply explicitly marked synthetic commands and initialize a
synthetic reputation fixture to prove the mechanics, but fixture values do not
become production defaults.

## Save v9 and reload

Tier game save v9 adds these top-level state fields:

```text
economyState
reputationState
```

The v8-to-v9 migration:

1. validates the source v8 snapshot;
2. stores the exact source bytes in the atomic migration backup;
3. preserves every existing v8 field, including active visit, generated day,
   P3 orders/queues, P4 identity registry and P5 operations state;
4. adds only validated empty P6 states;
5. validates the complete v9 candidate before writing it;
6. leaves the primary save unchanged if any source, migration or candidate check
   fails.

Rollback restores the exact v8 source bytes. Earlier supported Tier versions
continue through the existing migration chain before receiving the empty P6
states. Unknown, malformed or future P6 schemas fail closed rather than being
discarded or replaced.

Normalization and serialization preserve audit order, command IDs,
fingerprints, source identities, reversals and explicit values across reload.
Corrupted history, a conflicting fingerprint or an impossible reversal makes
the save invalid; reload does not repair it by replaying commands.

## Legacy behavior preservation

P6 intentionally runs beside, not in place of, the current prototype economy:

- `current` and `legacy-v1` remain on game save v1 and keep their existing
  economy/reputation behavior;
- Generator save remains v7 and generated days are not regenerated;
- Tier fields `money`, `campaignFinance`, `dailyLedger`, `reputation`,
  `ownerTrust` and `clinicalReliability` remain unchanged;
- the existing UI, demand calculation, daily summary and campaign outcome keep
  reading the existing fields;
- P6 does not replay `dailyLedger`, `reputationEvents`, case journals, P3 orders
  or P5 task history into the new states;
- P6 does not split `ownerTrust` or `clinicalReliability` into the four axes and
  does not merge four axes back into legacy metrics.

An approved crosswalk may later define a one-time migration or a new-campaign
boundary. Until then, keeping the two models separate avoids silently changing
old campaign outcomes or charging past actions a second time.

## Required verification

The P6 technical core is acceptable only when all applicable checks below pass.

### Pure economy core

`node scripts/test-economy-runtime-v6.js` must cover:

- empty production state with no inserted balance/default commands;
- strict field and finite-value validation;
- ledger/reversal, obligation, inventory, procurement, asset, maintenance,
  owner-plan/budget and recovery command lifecycles;
- atomic single/batch application and caller-input immutability;
- exact replay idempotency and conflicting command-ID rejection;
- explicit single reversal and double/conflicting reversal rejection;
- deterministic full audit replay, append-only nested histories and
  `closure_review` structural guard;
- normalization, serialization, reload and corrupted-history rejection;
- proof that no inventory, asset, maintenance or recovery policy is inferred.

### Pure reputation core

`node scripts/test-reputation-runtime-v6.js` must cover:

- empty/uninitialized production state and closed event gate;
- required approved baseline with all four exact axes;
- rejection of missing/extra axes, free-text inference and clinical fields;
- one-axis finite non-zero events and unique sources;
- exact replay idempotency and conflicting command-ID rejection;
- explicit single reversal and double/conflicting reversal rejection;
- normalization, serialization, reload, corruption and input immutability.

### Save and compatibility

The game-state save suite must prove:

- Tier v8-to-v9 exact backup, atomic candidate write and exact rollback;
- supported v1-v7 sources reach v9 through the existing chain without losing
  data;
- active visit, queue, generated day, P3, P4 and P5 state are unchanged;
- fresh and migrated economy state is empty, while reputation is empty and
  uninitialized;
- synthetic audit history survives compact save and reload exactly;
- malformed/future P6 state fails without writing;
- `current`/`legacy-v1` mode isolation and game save v1 remain unchanged;
- Generator save v7 and fingerprints remain unchanged.

### Browser smoke

`node scripts/playtest-p6-runtime.js` must verify the actual persisted audit
state, not only summary counts:

- ordinary Tier production starts with empty economy state and empty,
  uninitialized reputation state;
- explicitly marked synthetic economy commands plus a synthetic reputation
  baseline/event can be persisted without activating a production catalog;
- audit identity, values, command fingerprint and reversal state are the same
  after reload;
- legacy money, ledger, reputation metrics, active visit, generated day and P5
  operations remain unchanged;
- the browser reports no console or network errors.

JavaScript syntax checks, the existing content/generator/system tests, static
runtime inventory checks and `git diff --check` remain required by project
policy. A unit fixture is not evidence that balance is approved.

## Intentionally not implemented

- approved prices, costs, salaries, reserves, debt or risk thresholds;
- production inventory, procurement, asset or maintenance catalogs;
- owner-budget and assistance policies;
- recovery-plan and closure automation;
- demand/review/story effects of the four reputation axes;
- an aggregate reputation formula or legacy metric crosswalk;
- automatic postings, event generation, retroactive import or replay;
- 30-day balance tuning, Campaign Director behavior or specialization outcomes;
- any medical, generator, scheduler or visual policy change.

The required 10,000 production economy simulations and proof that all three
specializations are viable remain blocked by approved data, as detailed in the
gap report. Core fixture tests prove only deterministic audit mechanics,
persistence and failure boundaries.
