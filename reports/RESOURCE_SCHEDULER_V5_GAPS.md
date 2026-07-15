# Resource Scheduler v5 — authored data gaps

Status: `runtime_core_complete_production_activation_blocked_by_authored_data`.

This report separates implemented engine behavior from staff, room and task data
that do not exist in the 2026-07-14 master package. Missing values were not
invented and empty catalogs were not added.

## Exact data present

- 447 versioned capability records;
- 24 `staff_skill`, 14 `staff_protocol`, one `room_protocol`, two late-game
  `room` capabilities and one `room_capability`;
- eight devices with `capacityPerDay`;
- two current doctors with stable IDs (`sokolova`, `morozov`) and current fatigue;
- one selected doctor per current shift and clinic opening/closing time;
- 15 diagnostic-test instances with authored duration in the current 30-card
  Tier pack;
- 11 unique current test IDs, of which only `ear_cytology`,
  `fecal_microscopy` and `skin_cytology` exactly match the capability registry.

`capacityPerDay` is not concurrent capacity and therefore is not converted into
a scheduler capacity.

## Missing machine-readable definitions

- hired assistant, administrator, laboratory, care, management and trainee
  staff records;
- individual staff skills, certifications, calendars, leave and absence rules;
- exact independent calendar for each current doctor;
- canonical starting consultation, waiting, reception and laboratory room IDs,
  ownership, capacity, preparation and cleaning rules;
- task/action to staff, room, equipment and consumable requirement chains;
- authored duration for most actions and procedures;
- consumable units and availability;
- delegation, supervision and automatic handoff policies (the explicit atomic
  reservation-transfer primitive exists, but no policy invokes it);
- absence and maintenance frequency, duration and recovery rules;
- complete urgent-overcapacity workflow;
- a versioned task catalog and stable production task IDs.

Visual room IDs are rendering configuration, not proof of gameplay ownership or
availability. Demand values such as `rooms: 1`, `doctorsOnShift: 1` and
`staffSupport: 1` are aggregate inputs, not resource definitions.

## Gates retained

Until exact versioned data is supplied, production does not:

- hire or schedule a new role;
- assign a capability or duration by similarity;
- turn visual rooms into operational rooms;
- create absence, maintenance, delegation or procedure events;
- schedule current clinical actions through the new engine;
- copy a P3 device queue into a second source of occupancy;
- alter a clinical result because of fatigue or resource state.

The existing P3 immediate authored diagnostic flow and device queue remain the
only compatibility sources for those visits. The new operations state stays
empty in ordinary production play but is fully validated, persisted and ready
for exact definitions.

## Data required to open the remaining P5 gameplay

Provide versioned, independently approved catalogs for:

1. staff and individual calendars;
2. operational rooms and concurrent capacities;
3. tasks with authored duration and complete requirement groups;
4. delegation/supervision and handoff rules;
5. absence and maintenance event definitions;
6. urgent full-load outcomes and safe-route IDs;
7. exact P3-device-task to scheduler-task migration mappings.

Each catalog needs stable IDs, version/status metadata, validation rules and an
explicit migration policy. Without those definitions the correct runtime result
is a closed gate, not fallback content.
