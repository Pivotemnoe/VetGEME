# Capability and Research v3 — activation gaps

> Обновление 2026-07-16: versioned operational authoring candidate теперь
> содержит 361 research contracts и 1 864 usage policies, поэтому прежний
> structural mapping gap снят на review-уровне. Production verdict не изменён:
> пакет `runtimeEligible: false`, 32 imaging-provider routes требуют авторской
> перепроверки, 12 defaulted fallback требуют явного утверждения, а local
> ownership bridge и veterinary approval ещё отсутствуют. См.
> `reports/OPERATIONAL_AUTHORING_P3_P7_PREFLIGHT.md`.
>
> P5 authoring input `2026.07.16.1` теперь добавляет 361 scheduler task и
> requirement-группы, но не снимает gate: девять records имеют start-active
> flags; P5-local requirement-free срез содержит семь records и 124/361
> research templates, но P6 ownership для пяти room всё ещё не доказан;
> 27 external routes одновременно
> требуют local physical resources, а 12 P3 fallback были подставлены
> сборщиком. См. `reports/P5_AUTHORING_PREFLIGHT.md`.

Date: 2026-07-15
Status: mechanics and canonical registry can be integrated; full medical,
economic and referral activation remains blocked by missing authored data.

No placeholders, aliases or generated medical values were added for the gaps
below.

## 1. Master research IDs have no structured capability crosswalk

The 39 imported medical families reference 354 unique `researchIds`. Only two
strings are exact capability IDs in the 447-entry registry:

- `ear_cytology`;
- `skin_cytology`.

The remaining 352 IDs cannot be mapped safely by spelling or clinical
similarity. Markdown discussion is not a machine-readable mapping. Required
author input: a versioned table from each research ID to one capability or an
explicit requirement group, including route and review status.

Until that table exists, `medicalResearchMappingEligible` stays `false` and no
master family is activated through the P3 registry.

## 2. Existing Tier 01 tests also lack a complete crosswalk

The current 30-card Tier 01 pack contains 15 authored diagnostic test instances
and 11 unique test IDs. Only three are exact registry capability IDs:

- `ear_cytology`;
- `fecal_microscopy`;
- `skin_cytology`.

The other IDs include `bilateral_cytology`, `flea_dirt_test`,
`fluorescein_test`, `giardia_test`, `mite_microscopy`,
`optional_repeat_flea_dirt_test`, `optional_skin_cytology` and
`owner_video_review`. Similar-looking capabilities exist for some concepts, but
choosing them would be an invented alias. Required author input: the same
versioned mapping contract for the existing pack.

The current clinical loop therefore keeps its existing authored behavior while
the P3 registry is available as a separate validated system.

## 3. Critical-result metadata is absent

The capability registry does not mark a test or result as critical, define the
review deadline or state what owner contact is mandatory. Required author input:

- criticality on the authored research/result definition;
- review urgency and overdue policy;
- contact obligation and closure rule;
- safe shift-closing behavior for each critical class.

The state machine can persist `resulted -> reviewed_by_doctor ->
communicated_to_owner`, but `criticalityEligible` stays `false` until this data is
authored. The runtime must not infer criticality from a disease name, urgency or
result text.

## 4. Exact external scheduling policy is absent

The registry contains:

- 57 numeric `turnaroundDays` ranges;
- 74 categorical `turnaround` values;
- no rule for choosing one exact time inside a range or category.

Tests may inject an explicit `dueAt` fixture, and the runtime can expose an
earliest/latest window. Production code cannot turn `same_day_or_scheduled`,
`urgent_or_emergency` or `[minDays, maxDays]` into one result time without an
authored deterministic policy. `economicSchedulingEligible` therefore remains
`false` for these external paths.

Required author input: versioned scheduling rules, calendar/working-day policy,
cut-off times, deterministic selection rules and overdue behavior.

## 5. Costs and quantitative consumables are incomplete

The existing Tier 01 diagnostic entries have authored durations. Fourteen of
the fifteen instances have `costVetcoins`; `owner_video_review` intentionally has
no authored cost and must display “cost not authored”, never zero.

The capability registry names 26 `consumable_set` capabilities but does not
provide per-research quantities, units, stage of consumption, stock policy or
cost. It also has no complete price table for local or external services.

Required author input:

- research/action -> consumable capability, quantity and unit;
- the lifecycle stage at which stock is consumed;
- authored local/external price and currency;
- refund/cancellation rules;
- explicit zero only where zero is medically/economically intended.

The P3 order engine accepts explicit charge/consumption payloads at controlled
stages but does not manufacture missing values.

## 6. Referral service outcomes are not authored

External service capabilities describe a route and, sometimes, a turnaround.
They do not provide a concrete destination, current capacity, exact price,
same-day availability, stabilization plan, clinical response/outcome or
reputation consequence.

Required author input: a versioned referral provider/service catalog and
authored outcome/communication rules. Until then, `referralOutcomesEligible`
stays `false`. A referral order may store explicitly supplied fields but cannot
invent them.

## 7. Non-start ownership and activation rules are not authored

The graph has 27 `start` capabilities. In the P3 resolver these are the authored
baseline runtime access of the current clinic; sparse state may still block an
item explicitly for stock, operational, connection, qualification or opening
state. This baseline is read from the registry and is never inferred from room
or equipment artwork.

For non-start capabilities, a reached unlock phase is only a temporal gate and
does not activate a dependency-free capability. Required product input:
purchase, delivery, training, repair, stock and external-contract rules that
write the sparse capability state. An explicit initial sparse-state document is
also still required if any of the 27 start capabilities must begin blocked.

## 8. Capacity exists for only eight devices

Only eight registry entries have `capacityPerDay`. This supports an exact daily
limit for those devices but not for every room, staff member, procedure or
external service. Required author input: capacities and resource ownership for
all other production queues, or an explicit statement that a resource is not
capacity-limited.

No fallback capacity is introduced.

## Activation checklist

A mapping or family can be enabled only after all applicable items are supplied
and validated:

- exact research/action -> capability or requirement-group mapping;
- veterinary approval of the associated medical content and result payload;
- explicit criticality/contact policy;
- explicit duration/due-time policy;
- explicit cost and consumable semantics;
- explicit safe local/referral route;
- referral provider/outcome data where used;
- version bump, migration impact review and deterministic tests.
