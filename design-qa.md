# Design QA: Pet Clinic MVP 1

- Source visual truth: `docs/references/pet-clinic-ui-reference.png`
- Implementation main screen: `docs/references/pet-clinic-implementation-start.png`
- Implementation consult state: `docs/references/pet-clinic-implementation-case.png`
- Side-by-side comparison: `docs/references/design-qa-comparison.png`
- Viewport: 1536 x 900 implementation; 1536 x 1024 source reference
- State: clinic open, one active patient, consult window open

## Full-view comparison evidence

The first-stage implementation reproduces the reference's structural hierarchy: clinic is the primary surface, fixed rooms occupy the center, the patient rail stays on the right, the operational HUD stays at the bottom, and the consult window opens over the lower part of the clinic while preserving world context.

The reference is treated as a product-layout and information-architecture target, not as a final pixel-art asset sheet. Detailed room art, character sprites, and environmental props remain a later art pass.

## Focused region comparison evidence

The consult region was checked separately. It contains the same functional regions as the source: patient summary, six visit stages, owner-reported complaint, unknown information, confirmed findings, owner state, and action costs. The diagnosis selector was verified with ten choices.

## Findings

- No P0, P1, or P2 issues remain within the agreed first-stage structural scope.
- P3: clinic furniture and character sprites are materially simpler than the visual reference. This is accepted for the current functional MVP and should be addressed through a dedicated sprite and environment asset pass.
- P3: characters currently have idle movement only. Room-to-room path animation remains the next world-simulation layer.

## Required fidelity surfaces

- Fonts and typography: compact game UI hierarchy is consistent and readable at the tested desktop viewport; the current system font is intentionally temporary.
- Spacing and layout rhythm: clinic, right rail, consult window, and HUD remain separated without overlap at 1536 x 900.
- Colors and visual tokens: white, blue, cyan, black, muted clinic-room colors, warning yellow, and state green/red are centralized in CSS variables.
- Image quality and asset fidelity: the implementation uses the existing canvas pixel-art runtime. Asset richness is below the reference and explicitly deferred as P3 for this MVP stage.
- Copy and content: hidden diagnosis, owner archetype, exact budget, reliability, and internal diagnostic score are absent from normal play and available only in developer mode.

## Interaction verification

- Selected a patient from the right rail.
- Asked an anamnesis question.
- Completed general and targeted examination.
- Confirmed microscopy is disabled before sampling and enabled after sampling.
- Confirmed ten diagnostic choices plus one close control.
- Selected a working diagnosis, communication style, and treatment.
- Confirmed treatment closes the completed case and does not reveal correctness immediately.
- Confirmed developer mode contains hidden simulation data.
- Browser console: no warnings or errors.

## Comparison history

1. Initial pass found plant silhouettes resembling medical crosses and doors resembling cabinets.
2. Plants were redrawn as potted foliage and doors as open framed doorways.
3. Post-fix screenshots show the room boundaries and circulation path without the misleading cross symbols.

final result: passed
