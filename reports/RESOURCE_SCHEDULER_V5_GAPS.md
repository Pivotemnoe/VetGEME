# Resource Scheduler v5 — P5 authoring activation gaps

Status: `review_input_available_production_activation_blocked`.

> Update 2026-07-16: `vetgeme-p5-production-authoring@2026.07.16.1`
> supplies the versioned staff, room, equipment, task, delegation, fatigue,
> handoff, absence, maintenance and urgent-capacity candidates that were absent
> from the master handoff. The package is now pinned as an immutable review-only
> input. Its own status remains
> `author_validated_programmer_integration_required`, every generated catalog
> has `runtimeEligible: false`, and the production pool remains empty. See
> `reports/P5_AUTHORING_PREFLIGHT.md` and
> `reports/P5_AUTHORING_MISMATCHES.json`.

## Authored data now present

- 10 staff, 12 rooms and 27 equipment resources (49 potential resources);
- 14 visit-task templates, 447 capability mappings (367 task-bearing), 361
  research tasks and 1,864 investigation-usage task mappings;
- 30 recommended staffing days and 24/24 referenced staff skills;
- authored fatigue, delegation, handoff, absence, maintenance, activation and
  urgent-overcapacity policies;
- explicit boundary that P3 owns research results, P6 owns asset, stock and
  maintenance state, P7 owns event triggering, and medical results are never
  changed by fatigue;
- an exact technical handoff command shape compatible with the scheduler's
  atomic reservation-transfer primitive.

The package's own isolated builder and validator can construct all 2,606 task
configurations (14 + 367 + 361 + 1,864) when all 49 potential resources are
preloaded. That is useful
authoring evidence, not proof that the production activation lifecycle works.

## Blocking mismatches

1. **The production resource set is not mutable.** The scheduler creates a
   fixed resource map and fixed unavailable windows. Runtime has no safe
   add/update/remove resource commands and no exact hire, shift, delivery,
   training or room-readiness bridge. Later unlocks, disposal, maintenance,
   break and absence state therefore cannot be projected without inventing a
   second ownership source.

2. **Only nine records have start-active flags; seven are P5 requirement-free.**
   The nine candidates are two doctors, five rooms and two pieces of equipment;
   the otoscope and microscope still fail their own maintenance/stock gates.
   On the seven-record P5-local slice, only 13/14 visit templates, 124/361
   research templates and 125/367 task-bearing capability templates retain a
   complete requirement route. In particular `visit.checkin` requires the chapter-2
   administrator and has no doctor fallback. All 11 referral-route
   capabilities have the same day-one administrator dependency, so even the
   authored urgent safe route is not schedulable at campaign start.

3. **Activation evidence is incomplete.** The starting otoscope and microscope
   still require `maintenance_current` and `required_stock_available`, but the
   new-campaign P6 state supplies neither initial ownership/maintenance/stock
   evidence nor exact stock category and unit mappings. The five starting rooms
   have no P6 asset IDs or initial ownership seed either; P5's empty local
   requirements are not yet an explicit exception to P6 ownership authority.

4. **P5/P6 ownership mapping is incomplete.** Canonical capability matching can
   identify 27 equipment assets and the procedure, imaging and short-stay
   rooms, but P5 deliberately supplies no authoritative `assetCatalogId`
   crosswalk. Four locked rooms require `p6_asset_owned` and have no P6 asset:
   `room.isolation.1`, `room.consult.2`, `room.staff.1` and
   `room.dental.1`. Automatic ID inference is forbidden.

5. **Staffing authority is unresolved.** The recommended schedule is not an
   accepted production roster, both doctors are marked start-active while the
   policy also says one doctor until a second consult room is owned, and the P6
   wage table has no `imaging_staff` role. Product-owner staffing acceptance is
   still explicitly required.

6. **Task alternatives require an activation-aware adapter.** Potential
   inactive resources appear inside `anyOf` groups, while the scheduler rejects
   unknown resources. An adapter must deterministically remove inactive
   alternatives and fail closed when a requirement group becomes empty; it
   cannot preload all 49 candidates as owned.

7. **Five research templates double-reserve qualifications.** Thirty-three
   tasks express `skill.*` as separate resource groups. In five multi-skill
   tasks, the selected base staff already owns one of those skills, but
   scheduler capacity 1 forces extra staff reservations instead of treating
   the skill as a qualification. The affected IDs are preserved in the P5
   mismatch report and require an authored/runtime representation decision.

8. **Handoff policy is not enforced.** The low-level primitive safely transfers
   reservations and survives reload, but no layer checks the package's
   `not_allowed`, midpoint or urgent-quarter policy. The bundled handoff test
   itself transfers `visit.history`, whose authored policy is `not_allowed`.
   No automatic rule for who or when hands off is added. In addition, none of
   the 447 capability mappings (including 367 task-bearing mappings) carries a
   handoff policy for independently enqueued capability tasks.

9. **Other policies have no command bridge.** Runtime does not yet enforce the
   authored fatigue bands, shift/rest/break/extension limits, doctor overlap,
   delegation, absence, maintenance and safe-route catalog authority. P7 also
   has no exact event mapping for the three authored absence types. P5 source
   defines fatigue bands and ten per-staff `baseFatigue` values (10, 6 and eight
   zeroes), but the generated resource catalog drops every authored value and
   no explicit contract defines whether or how they seed runtime fatigue. P5
   also has no accumulation/recovery rule for its ten staff; current mechanics
   changes fatigue only for the two legacy doctors.

10. **Duration authorities are distinct.** P5 scheduler duration differs from
    P6 economic/service duration for 312/447 capabilities. The values describe
    different semantics and must not be silently merged. Fifty-one midpoint
    usage tasks have odd authored durations, but no rounding rule for the exact
    handoff minute is supplied. Across all usages, 476 urgent-quarter and 51
    midpoint records produce fractional breakpoints.

11. **Cross-state atomicity and clock ownership are missing.** P5 reservation
    and P6 stock/asset mutation are independent runtimes, P3 in-flight device
    work has no exact ownership-transfer migration, and the game clock/visit
    queue does not drive P5 enqueue/schedule/complete. Wiring only one side
    would permit partial mutation, duplicate occupancy or double time.

12. **Upstream inputs remain review-only.** P3/P6 operational catalogs are not
    runtime eligible; 12 P3 null fallbacks were defaulted to `safe_referral`,
    27 external research routes also retain local physical requirements, and
    the 11 referenced safe-route IDs have no approved runtime catalog binding.

## Gates retained

Production continues to keep the ordinary `operationsState` empty and does
not:

- preload potential staff, rooms or equipment as owned;
- infer P5/P6 IDs, wages, inventory or lifecycle evidence;
- route current 30-card actions into the P5 catalog by similarity;
- reserve a qualification as a second person when the selected person already
  has it;
- invoke handoff, absence, maintenance, delegation or urgent-route policy
  automatically;
- change clinical truth or a medical result because of fatigue or resources;
- alter save schema or migrate existing campaigns.

Activation requires corrected/approved source catalogs, explicit lifecycle and
cross-system adapters, product-owner staffing acceptance, browser smoke and
save/reload replay. Until then, the correct result is a closed runtime gate,
not fallback content.
