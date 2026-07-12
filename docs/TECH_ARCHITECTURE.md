# Technical Architecture

## Current Runtime

The playable prototype is intentionally dependency-free: `index.html`, `styles.css`, `campaign.js` and `game.js`. It remains the protected baseline while mechanics are validated.

## Target Boundaries

- campaign direction and day planning;
- deterministic visit, owner and patient generation;
- universal medical actions, treatment and outcomes;
- owner runtime behavior and communication;
- queue, staff, rooms, equipment and economy;
- Canvas rendering separated from DOM UI;
- versioned persistence and migrations;
- content validation, generator simulation and debug export.

The eventual TypeScript/Vite module layout from [PROJECT_HANDOFF_AND_OWNER_CONTENT.md](PROJECT_HANDOFF_AND_OWNER_CONTENT.md) is a target architecture, not permission for an all-at-once rewrite. Migration must proceed behind tests and keep the playable loop available after every step.

## Dependency Direction

Content is data. Generation combines validated content. Medical systems own clinical truth. UI and rendering observe state and emit actions; they never decide diagnoses or outcomes.
