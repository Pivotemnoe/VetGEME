# Economy and Reputation v6 — approved data gaps

> Обновление 2026-07-16: получен полный quantitative balance authoring
> candidate для 447 capabilities, inventory, четырёх reputation axes и
> recovery. Он остаётся `runtimeEligible: false`; product-owner balance
> acceptance, exact P5 resource mapping и runtime activation отсутствуют.
> См. `reports/OPERATIONAL_AUTHORING_P3_P7_PREFLIGHT.md`.

Status: `technical_core_available_production_balance_and_activation_blocked`.

This report separates the P6 audit primitives from balance and policy data. The
master package describes the intended economy and marks its model
`canonical_model_complete_balance_requires_simulation`, but it does not contain
a versioned approved balance, reputation, inventory, clinic-asset or recovery
catalog. Its prices, costs, starting funds and ranges are explicitly preliminary
simulation inputs, not approved production values.

No candidate amount, range or threshold from prose is promoted to production by
P6. Ordinary `tier-01-v2` play therefore keeps `economyState` empty, keeps
`reputationState` without a baseline and wires no automatic production command
source.

## 1. Balance catalog

Production still needs one machine-readable, independently approved catalog
with a stable ID, version, status and integrity metadata. It must define:

- the accounting currency/unit, precision and rounding rules;
- starting cash, credit, debt and protected reserve;
- service prices for consultations, research, procedures, observation,
  prevention, medicines, supplies and external services;
- variable cost per performed action, including the stage at which the cost is
  recognized or cash is paid;
- refund, cancellation, free-recheck, bad-debt, instalment and write-off rules;
- staff accruals, pay cadence, overtime, training and absence effects;
- rent, utilities, cleaning, waste, insurance, software, regulatory,
  maintenance, marketing, loan and other recurring obligations;
- obligation due dates, arrears, interest and payment priority;
- owner-budget bands, disclosure rules and the exact semantics of full, staged,
  minimum-safe, deferred, referral, charity and instalment plans;
- anti-overdiagnosis scoring and the financial treatment of safe referral;
- purchase, grant, loan and campaign-reward accounting rules;
- chapter/unlock restrictions and every specialization-specific modifier.

The existing `money`, `campaignFinance` and `dailyLedger` fields are legacy
runtime behavior. They are not an approved P6 balance catalog and are not
replayed into the new audit state.

## 2. Four-axis reputation catalog

The four canonical axes are `clinical`, `communication`, `accessibility` and
`organization`. The following approved values and policies are absent:

- an initial score for every axis and the catalog identity that owns it;
- score bounds, precision, clamping and rounding semantics;
- a stable event taxonomy and an exact delta for every allowed event;
- source uniqueness, timing, deferral, reversal and correction policy for each
  event type;
- rules separating clinic-wide reputation from owner trust, satisfaction,
  adherence, medical outcome and marketing awareness;
- decay, recovery and persistence rules between visits, days and chapters;
- an optional displayed aggregate-rating formula;
- demand, review, referral, story, progression and ending effects for each axis;
- the approved crosswalk, if any, from legacy `reputation`, `ownerTrust` and
  `clinicalReliability`.

Until that catalog exists, no reputation baseline or event is accepted in
production. P6 does not copy the two old Tier metrics into four axes, split a
legacy delta by assumption or reconstruct reputation by replaying old journals.

## 3. Inventory and procurement

The master package names inventory categories, but it does not approve the
quantitative production records needed to operate them. Missing data includes:

- stable category/item IDs, units and allowed precision;
- starting quantity, usable quantity and storage capacity;
- action/research/procedure to item mappings with exact consumption quantities;
- the lifecycle stage for reservation, consumption, release and wastage;
- reorder points, target stock and emergency-stock policy;
- supplier IDs, purchase price, order lot, lead time, cut-off and working-day
  rules;
- receipt, partial delivery, backorder, cancellation and substitution rules;
- shelf life, lot/expiry tracking, spoilage and disposal cost;
- stock-out behavior and an authored safe external or referral route;
- procurement authorization and manager auto-order policy.

P6 must not derive quantities from capability names, diagnostic prices, prose
categories or the presence of a research order. Explicit audit primitives do not
constitute an inventory catalog.

## 4. Clinic assets and maintenance

Gameplay assets require records independent of visual PNGs and room art. Missing
approved values and mappings include:

- stable clinic-asset IDs and exact asset-to-capability/resource links;
- initial ownership, location, operational state and concurrent capacity;
- purchase price, delivery, installation, grant and unlock rules;
- useful condition/usage units and any wear model;
- inspection and maintenance intervals, cost, duration and staff/room needs;
- breakdown triggers, downtime, repair, replacement and warranty rules;
- required consumables and quality-control costs;
- lease, loan, depreciation, resale and salvage rules;
- rules preventing sale or shutdown of the only safe clinical/referral route;
- external-laboratory contracts, prices, service capacity and accounting;
- asset effects for each clinic specialization.

The master package's provisional asset price ranges are not approved values.
Visual asset IDs are not evidence that an asset is owned, installed or usable.
P3 capability state and P5 reservations remain separate sources of capability
and occupancy truth until an exact crosswalk is approved.

## 5. Recovery and closure

The design names `stable`, `watch`, `elevated`, `recovery`, `critical` and
`closure_review`, but does not provide an executable approved policy. Missing
values and rules include:

- the obligation horizon and financial inputs used by each review;
- exact entry, exit and persistence thresholds for every risk level;
- review cadence, grace periods and warning deadlines;
- credit-limit, repayment, arrears and exhausted-credit behavior;
- recovery-plan IDs, eligibility, required actions, costs, effects and duration;
- which purchases, hours, marketing or assets may be reduced without removing a
  minimum-safe care route;
- terms and limits for programs, grants, charity support or story loans;
- success, partial-success, repeated-failure and plan-replacement rules;
- the exact conditions for `closure_review` and final closure;
- interaction between financial crisis, systematic clinical unsafety and the
  four reputation axes.

Therefore the technical core cannot automatically choose a recovery action,
sell an asset, change prices or close the clinic. One poor day or one error must
not be converted into closure by an invented threshold.

## 6. Demand and specialization gates

The master package identifies three intended profiles:

1. diagnostic center;
2. accessible neighborhood practice;
3. strong-communication and low-stress clinic.

Their viability cannot be evaluated until approved balance, asset, staffing,
inventory, demand and four-axis reputation mappings exist. In particular, there
is no approved rule connecting an axis score to source-specific demand, no
complete cost/capacity model for each profile and no approved success boundary.

The required 10,000 deterministic 30-day **production** simulations are blocked.
Synthetic unit fixtures may test arithmetic, audit history and persistence, but
they cannot validate profitability, recovery, anti-overdiagnosis, safe referral,
debt limits or specialization viability. All three specialization-viability
claims remain blocked until the approved catalogs above are loaded and the
simulation report records failing seeds and distributions.

## 7. Data required to open production P6

Activation requires, at minimum:

1. approved versioned balance and four-axis reputation catalogs;
2. approved inventory/procurement and clinic-asset/maintenance catalogs;
3. approved recovery/closure policy;
4. explicit legacy crosswalks, or an explicit decision to start the new systems
   only for new campaigns;
5. exact integration mappings to P3 capability/research/referral and P5
   resource/reservation state;
6. deterministic 30-day strategy fixtures and acceptance criteria;
7. 10,000 production campaigns covering weak, medium and strong play, safe
   referral, internal/external laboratory paths and all three specializations;
8. reviewed reports proving that unnecessary testing is not dominant, one error
   is recoverable, infinite debt is impossible and each specialization is
   viable.

Until every applicable input is present, the correct production result is an
empty validated P6 state, no automatic economy commands and a closed reputation
event gate, not a guessed default.
