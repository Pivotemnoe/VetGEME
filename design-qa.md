# Design QA: Pet Clinic, redraw of chapter 1

- Source visual truth: `docs/references/pet-clinic-ui-reference.png` and the annotated clinic reference supplied by the user.
- Current implementation: `docs/references/mvp-clinic-redraw.png`.
- Consult state: `docs/references/mvp-readable-case.png`.
- State: day 1, clinic open, two owners with animals moving through the clinic.

## Scope decision

The reference defines the visual language: a detailed pseudo-isometric 2D clinic, visible rooms, animated people and animals, right-side queue and bottom operational HUD. The current chapter intentionally omits the dark expansion room shown in the old reference. The active product direction and the user's July 12 review require only one consult room, a microscopy corner, waiting and entry until expansion has real gameplay.

## Visual comparison

- The clinic remains the primary screen rather than a dashboard.
- Four functional zones have distinct floors, wall depth, signs and fixed equipment.
- Furniture is anchored to working areas and walls; plants occupy free corners and do not overlap cabinets or devices.
- The microscopy corner is a small first-stage diagnostic workspace, not a full unlocked laboratory.
- The empty staffed reception desk was replaced by a self check-in terminal, matching the first-stage rule that no administrator is required.
- Owners, animals and the active doctor use the same smaller-pixel visual scale and move through explicit door routes.
- The right queue and bottom HUD preserve the reference hierarchy.

## Findings resolved

- P1 resolved: the premature second/expansion room was removed.
- P1 resolved: flowers and cabinets no longer overlap.
- P1 resolved: day-specific diagnoses now follow the canonical five-day teaching sequence.
- P2 resolved: room doors align with character paths.
- P2 resolved: the clinic received a full environment pass with windows, storage, clinical furniture, laboratory equipment, seating, check-in and exterior landscaping.
- P2 resolved: oversized character blocks were reduced and movement remains readable.

## Remaining polish

- P3: final production art can replace the procedural Canvas sprites with a dedicated authored sprite atlas without changing the simulation.
- P3: a later unlocked second cabinet will need its own art and route only when its management mechanic is implemented.

## Interaction verification

- Day 1 opens with two of five scheduled patients and only otitis-family cases.
- Later arrivals use the current day's disease pool.
- Patient routes use entry, corridor, waiting and consult-room doors.
- The consult panel remains readable and retains all medical actions.
- Day 2 remains the repeat-otitis and old-drops lesson; the shelter event uses mite otitis rather than an unrelated trauma.

final result: passed
