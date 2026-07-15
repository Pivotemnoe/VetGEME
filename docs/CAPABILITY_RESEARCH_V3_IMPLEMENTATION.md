# Capability, Research and Referral v3

## Status

P3 introduces a canonical capability graph and deterministic state machines for
research orders, referrals, asynchronous events and device queues. It does not
activate unreviewed medical families or infer missing clinical/economic data.

The canonical source is registered as:

- registry ID: `vetgeme-clinic-capabilities`;
- registry version: `2026.07.14.38`;
- package: `vetgeme-master-package@2026.07.14.2`;
- runtime path: `content/system-packs/vetgeme-master-2026-07-14/capability-registry.json`;
- SHA-256: `16ff64c015a8edb302c15289540a4ed760cfc356d832bca31094f992b1da3c81`;
- allowed mode: `tier-01-v2`.

The imported JSON is byte-identical to the audited handoff file. It contains
447 unique capabilities, 324 `requires` edges and 13 `anyOf` edges. It has no
missing references, self-references or dependency cycles.

## Runtime boundary

Simulation owns capability availability, orders, queues and events. The renderer
may display those states but cannot create them and cannot infer a capability
from a room, sprite or equipment image.

`content/registry.json` is the only loading entry point. The Tier 01 loader:

1. resolves an exact registered ID and version;
2. enforces the mode allow-list and audited digest metadata;
3. fetches the single registered JSON path;
4. validates identity, status, rules, count and the full dependency graph;
5. returns `catalog.capabilityRegistry` and
   `catalog.capabilityRegistryEntry`;
6. fails before generator creation when any contract is invalid.

The full 447-entry catalog is never copied into a visit or save. Saved state is
sparse and references the registry by ID/version plus changed entries only.

## Capability resolution

`systems/capability-registry-v3.js` is the shared resolver.

- The capability's own unlock and sparse state gate must pass.
- Every entry in `requires` must be available.
- When `anyOf` exists, at least one alternative must be available.
- `requires` and `anyOf`, when both are present, are combined with AND.
- All alternatives and their reason codes are returned to the caller. The
  resolver never silently chooses one route for the player.
- Canonical `unlock: start` is the authored baseline runtime access of the
  current clinic. A sparse entry can still block it explicitly because stock is
  empty, equipment is inoperable, a service is disconnected or staff is not
  qualified.
- For every non-start capability, reaching the phase is only a temporal gate.
  A dependency-free capability still needs an explicit sparse-state activation;
  dependencies must also resolve before a dependent capability is available.

The capability phase clock is deliberately separate from the legacy Demand
Director chapter calculation:

| Campaign day | Capability phase |
|---:|---|
| 1–5 | `start` |
| 6–10 | `chapter_2` |
| 11–15 | `chapter_3` |
| 16–20 | `chapter_4` |
| 21–25 | `chapter_5` |
| 26–30 | `post_chapter_5` |
| 31+ | `post_campaign` |

The start baseline comes from the canonical registry, never from sprites or room
art. For non-start capabilities, unlock alone does not prove that the clinic has
purchased or received equipment, has stock, employs trained staff or has an open
room.

## Research order lifecycle

`systems/research-orders-v3.js` allows only this transition graph:

```text
proposed
  -> owner_accepted
     -> sample_planned
        -> sample_collected
           -> sent_or_queued
              -> processing
                 -> resulted
                    -> reviewed_by_doctor
                       -> communicated_to_owner
                          -> follow_up_closed
  -> owner_refused
  -> deferred
```

`owner_refused` and `deferred` are terminal for that order. A later offer creates
a new order that explicitly supersedes the terminal one.

Side effects are stage-bound and require authored payloads:

- sample consumption can occur only at `sample_collected`;
- processing consumption and a charge can occur only at `sent_or_queued`;
- no charge or consumption is created when fields are absent;
- an order can reach `resulted` only with an explicit `authoredResult`;
- doctor review and owner communication remain separate persisted stages;
- commands are idempotent by `commandId`.

No code path generates a laboratory value, medical interpretation, price,
duration or consumable requirement.

## Device queues and time

`systems/device-queue-v3.js` stores tasks outside the medical result. A task can
be `queued`, `processing`, `completed` or `cancelled`. It requires an authored
positive duration; completion before `dueAt` is rejected. The queue cannot store
`result` or `authoredResult` because the research order owns clinical truth.

Only the eight canonical capabilities with an authored `capacityPerDay` can
provide a catalog-derived daily capacity. Other devices do not receive a
fallback capacity.

`systems/async-events-v3.js` uses an absolute campaign minute:

```text
(day - 1) * 1440 + floor(minute)
```

Events are sorted by `dueAt`, priority and stable ID. A turnaround range can be
represented as an earliest/latest window, but a range or categorical turnaround
is not converted into one exact production `dueAt` without an authored policy.

## Referral lifecycle

`systems/referral-orders-v3.js` persists this graph:

```text
proposed
  -> owner_accepted -> sent -> response_received -> reviewed -> communicated -> closed
  -> owner_refused
  -> deferred
```

Destination, preliminary cost, same-day availability, stabilization, response
and outcome remain optional authored fields. The runtime stores a field only
when it is supplied; it does not synthesize a clinic, price, availability,
medical outcome or reputation effect.

A requirement group such as `local OR referral` is resolved through `anyOf`.
The UI must keep unavailable local actions visible with a reason and expose the
authored safe alternative. It must not auto-select the referral.

## Activation gates

The registry itself is runtime-eligible in `tier-01-v2`. The following gates are
explicitly false in `content/registry.json`:

- `medicalResearchMappingEligible`;
- `criticalityEligible`;
- `economicSchedulingEligible`;
- `referralOutcomesEligible`.

These gates prevent the 354 master research IDs, critical-result behavior,
external scheduling, economic effects and referral outcomes from becoming
production behavior merely because the capability graph is present.

## Static and Docker runtime

The browser loads all five P3 system modules before
`generator/game-state-save.js`; the capability registry also loads before the
content loader. Atomic save migration loads before both save runtimes. This
order is covered by the fail-closed browser-script contract.

The static build follows the loader to collect the exact registered system JSON.
Nginx serves only that exact JSON path. The source handoff, Markdown documents,
unregistered system files and arbitrary JSON below `content/system-packs/` are
not shipped or served.

## Verification

Primary commands:

```bash
npm run validate:capability-registry:v3
npm run test:capability-registry:v3
npm run test:research-referral:v3
npm run test:content-registry
npm run test:generator-mode-fail-closed
npm run test:docker:prebuild
```

Known data blockers are recorded in
[`reports/CAPABILITY_RESEARCH_V3_GAPS.md`](../reports/CAPABILITY_RESEARCH_V3_GAPS.md).
