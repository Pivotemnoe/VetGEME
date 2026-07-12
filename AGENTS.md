# VetGEME Development Rules

## Before Changing Code

1. Read `README.md`, `docs/GAME_DESIGN.md`, `docs/CONTENT_GENERATOR.md`, `docs/OWNER_BEHAVIOR.md` and `docs/MECHANICS_BACKLOG.md`.
2. Preserve the working browser loop unless the active task explicitly replaces it.
3. Do not mix new medical content and engine refactoring in one change without explicit approval.
4. Do not change the save schema without a version and migration plan.

## Architecture Boundaries

- Clinical truth belongs to validated content and medical systems, never rendering or ordinary UI.
- Generation is seeded and reproducible.
- A generated day is persisted immediately and never silently regenerated.
- Owner appearance is independent from behavior.
- Humor cannot hide the only path to a critical fact.
- Missing equipment requires a safe referral path.
- Use «грибковый отит» in Russian project terminology.

## Required Checks

- JavaScript syntax checks for the current static build;
- content validation;
- generator smoke test after generator changes;
- browser smoke test for affected player flows;
- `git diff --check`.

## Completion Report

Report changed behavior, checks performed, what was intentionally not changed, and known risks.
