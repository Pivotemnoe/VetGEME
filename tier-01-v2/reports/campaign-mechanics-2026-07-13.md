# Campaign Mechanics Task 5 Report

Date: 2026-07-13

## Scope

Task 5 adds tier-v2 fatigue thresholds, separate clinic trust metrics, an explicit daily economy ledger, weekly financial review and the 30-day outcome calculation. Medical text, case distribution, generator randomness, `current` and `legacy-v1` mechanics were not changed.

## Before and after

Before this change every action used the linear multiplier `1 + fatigue / 180`; 80% fatigue therefore produced about 44% extra time, while even 10% fatigue already added a penalty. Tier v2 now uses the approved bands: 0-39% no penalty, 40-59% +10%, 60-79% +20%, 80-100% +35%. At 80% shift extension is unavailable. At 100% the doctor may finish the active visit and accept an urgent patient, but cannot begin a new routine visit.

The old clinic `reputation` mixed waiting experience, communication and clinical safety. Tier v2 now has:

- `ownerTrust` for service experience, consent and the starting trust of future owners;
- `clinicalReliability` for diagnosis, treatment quality and safe urgent referral.

The old `reputation` field remains a compatibility alias for owner trust inside tier runtime and remains the only unchanged metric in `current` and `legacy-v1`.

## Economy and campaign

The daily ledger stores consultation and diagnostic revenue, procedure costs, payroll, maintenance, refunds, free rechecks, net result, both clinic metric changes and fatigue explanation. A negative balance is allowed up to the 2500 V credit limit. Every seventh day records money, debt, immediate mandatory expenses, remaining credit, closure risk and recovery measures. No single error ends the campaign.

On day 30 the outcome checks debt limit, the 45/100 clinical reliability threshold and required tutorial completion. The result includes financial and clinical assessments, compact development history and free-play availability.

## Save migration

Tier game-state save version changed from 2 to 3. Versions 1 and 2 migrate through a complete in-memory candidate. The source key is written only after compaction, validation and hydration succeed. Defaults reserve the Task 6 `equipmentCapabilities` and `demandState` fields so no second game-state migration is required for Tasks 3-6.

`current` and `legacy-v1` remain on game-state save version 1 and do not serialize the new tier fields.

## Checks

- fatigue boundary and campaign mechanics unit test: passed;
- game-state v1/v2 to v3 migration: passed;
- impossible migration preserves source snapshot: passed;
- compact UTF-16 save sizes: day 1 — 14,184 bytes; day 7 — 247,164 bytes; day 30 with 30 daily ledgers — 1,342,836 bytes, under the preferred 1.5 MiB target;
- browser smoke for tier v2: separate metrics and fatigue forecast visible, no console errors;
- browser smoke for current and legacy-v1: legacy metric label retained, no console errors.

## Known limits

- clinical reliability affects referral demand only after Task 6 connects the demand director;
- the current catalog still plans the introductory seven-day chapter; generation of days 8-30 belongs to Task 6;
- refund and free-recheck ledger lines are present but remain zero until a later approved outcome explicitly creates those transactions.
