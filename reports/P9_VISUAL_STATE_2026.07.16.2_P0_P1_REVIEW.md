# P9 visual-state authoring 2026.07.16.2 — independent P0/P1 review

Дата: 16 июля 2026 года.

Final verdict: **PASS**. `P0 = 0`, `P1 = 0`. Production/runtime activation remains forbidden.

## Scope reviewed

- P0 audit of branch, HEAD, origin parity, dirty/untracked ownership and overlap with medical/operational/P5/P8 layers.
- Exact P9 archive/source/provenance registration and closed-world host artifact contract.
- Exact P5 `.2` dependency pins and projection boundary.
- 12 room, 27 equipment, 10 staff and 9 HUD joins.
- P5 lifecycle/scheduler ownership, half-open reservation segments, reload parity and fail-closed unknown states.
- DOM/Canvas ownership, raw-ID filtering, missing-art fallbacks, room/equipment placement and ordinary-runtime isolation.
- Browser evidence at 1920/1440/1280/960/390, open drawer, reduced motion and room lifecycle transition.
- Core regressions, Docker build/image/HTTP/browser matrix and unchanged active production pool.

## Findings and fixes

### First review

- P0 findings: none.
- P1-1: room-level fallback overlays repeated existing furniture/decor placements and could visually duplicate diploma, clock and benches.
- P1-2: delivery pallet/boxes were drawn before the room front wall and could be hidden even though the transition state reported them as present.

### Corrections

- Room placement fallbacks were removed; existing room placements remain the sole source for diploma, clock and benches.
- Added 20 explicit per-asset room overlay anchors bound to the exact scene-layout SHA. Coordinate inference remains forbidden.
- Room transition overlays are drawn in a dedicated pass after the front wall. Missing/unknown anchor fails closed.
- Added negative tests for missing anchors, layout-SHA drift and unknown bindings.

### Final repeated review

- P0 findings: none.
- A later P10 independent mobile review found P1-3: at 390×844 the collapsed resource control used `bottom: 88px` and overlapped the 112 px persistent bottom HUD.
- P1-3 was corrected with a 120 px bottom offset and an edge-docked mobile width outside the protected center. Browser evidence now records the actual `.bottom-hud` rectangle and fails on any rectangle intersection at every tested viewport.
- Final P1 findings after this correction: none.
- Transition evidence confirms visible pallet/boxes: 21 renderer draws and 1,867 changed canvas pixels.
- Placement overlay counts for diploma, clock and both waiting benches are all zero, proving the duplicate path is gone.
- 8 fresh screenshots contain 0 browser issues; ordinary runtime performs 0 P9 review requests.

## Confirmed safety boundaries

- Registry keeps author source and host review harness on separate status axes.
- Query-only activation is rejected; explicit harness marker is required.
- Runtime/generator/production/activation flags are all false and production pool is 0.
- Adapter consumes canonical P5 lifecycle/scheduler state and cannot mutate it.
- Visual presence cannot grant ownership, activation, capability, readiness, stock or capacity.
- Raw IDs and reason codes do not appear in player-facing DOM text.
- No secretary/receptionist Canvas asset is requested.
- `art/runtime-v2`, save schema, current 30 cases, generator randomness, medical truth and economy remain unchanged.
- Review-only source/host/adapter/surface paths are absent from the production Docker image and return HTTP 404.

## Residual non-blocking risks

- The implementation remains an explicit review harness pending live activation design and product-owner acceptance.
- 8 rooms, 26 equipment resources and 10 staff are represented through honest DOM fallbacks; 1 room and 13 equipment resources have no dedicated base art.
- The existing live scene still has a 760 px minimum width.
- P5 lifecycle/save migration and external approval gates remain unresolved outside P9.

## Review conclusion

P9 `.2` is technically valid as an immutable, review-only visual-state projection. The host harness truthfully demonstrates state, reload and placement behavior without changing simulation authority or production content. No P0/P1 issue remains, but nothing in this review authorizes ordinary-runtime activation.
