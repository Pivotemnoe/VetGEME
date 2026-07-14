# Longitudinal Care v2

This slice is active only in `tier-01-v2`. It does not change `current`, `legacy-v1`, combined bundles or clinic assets.

## Model

An approved content plan may declare `longitudinalCare` with a care setting, duration, stable home and clinic action IDs, approved follow-up options, early-return sign IDs and completion criterion IDs. The runtime creates one `treatmentCourseId` and one stable `appointmentId` for every scheduled visit.

Consent to the selected plan, consent to the control visit, adherence and attendance are separate state. Adherence and attendance are seeded from the campaign seed and stable IDs. Exact probabilities are not shown in the interface. A reminder recalculates attendance once from the same seed and is persisted both in game state and the generator's pending appointment.

Visit reasons are distinct: `planned_recheck`, `scheduled_procedure`, `course_visit`, `test_result_review`, `deterioration`, `complication`, `relapse`, `owner_concern`, `error_return` and `rescheduled_visit`. A planned recheck is not a complication or error return.

## Scheduling

Pending visits are selected in this order:

1. scheduled procedures and course visits;
2. confirmed planned rechecks;
3. rescheduled visits;
4. other returns;
5. new booked patients and walk-ins supplied by the demand director.

The day follow-up limit remains the clinic capacity. Excess real appointments stay pending for a later day. Missing target rechecks are filled by new patients; the generator does not invent a longitudinal patient.

## Reviewed Vertical Slice

- superficial wound: three-day home-care structure and an approved day-4 control;
- fungal otitis: approved 7-10 day control choices and conditional repeat microscopy;
- future infectious daily course: technical `pending_content` shell, excluded from generation and without medical text.

Day 1 keeps the guided default. From day 2 the player selects an available plan and, when the reviewed card offers more than one interval, selects one of those approved control dates.
