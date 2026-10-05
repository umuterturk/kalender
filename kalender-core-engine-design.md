# Kalender Core Scheduling Engine Design

**Status:** Draft  
**Scope:** Core scheduling and fairness engine  
**Primary goal:** Produce explainably fair schedules over time while allowing unrestricted manual control.

---

## 1. Purpose

Kalender is a shift scheduling system where **fairness is measured continuously across schedules rather than enforced within a single month**.

The engine must support two equally important modes:

1. **Automatic scheduling**
   - Generates a feasible schedule.
   - Tries to improve long-term fairness.
   - Respects configured constraints and preferences.
   - Minimizes changes when modifying an existing schedule.

2. **Manual scheduling**
   - Allows administrators to assign any person to any shift.
   - Does not block assignments because of fairness, consecutive-shift rules, next-day-off rules, preferences, or other scheduling policies.
   - Clearly exposes warnings and fairness impact.
   - Preserves all manual assignments in fairness history.

The core principle is:

> **Fairness is persistent and advisory. Human authority is final.**

A single month does not need to be fair. The system should make unfair decisions visible and naturally compensate for them in future periods.

---

## 2. Design Principles

### 2.1 Fairness is measured, not enforced

The engine must never reject a manual assignment solely because it is unfair.

Example:

```text
Mon  Ali
Tue  Ali
Wed  Ali
Thu  Ali
Fri  Ali
```

Even if the organization normally requires a day off after every shift, Kalender must allow this schedule to be saved and published.

The UI/engine should instead report:

```text
WARNING: 4 consecutive-shift rule violations
WARNING: Ali is over-allocated in NN shifts
```

Automatic scheduling should avoid these violations when configured to do so.

---

### 2.2 Rules constrain the optimizer, not the administrator

Rules such as:

- no consecutive shifts,
- next day off,
- maximum shifts per month,
- minimum rest,
- qualification requirements,
- availability,
- holiday policies,

are constraints for automatic scheduling.

Manual editing may override any of them.

Violations must remain visible and queryable.

---

### 2.3 Fairness follows the original allocation

For fairness purposes, Kalender tracks **who received the shift allocation**, not necessarily who eventually performed the work.

Example:

```text
Saturday shift
allocated_to = Ali
performed_by = Ayşe
```

If Ali voluntarily transfers the shift to Ayşe after publication:

```text
fairness owner = Ali
actual worker  = Ayşe
```

Reason:

- Ali originally received the valuable or burdensome allocation.
- Informal transfers may involve favors, reciprocal agreements, or cash.
- Rewriting fairness according to the final worker would allow the fairness ledger to be gamed.

This rule applies to voluntary post-publication transfers.

Before publication, reassignment changes the fairness owner because the allocation has not yet become final.

Forced or emergency reassignment may later be treated differently, but this is outside the first version of the engine.

---

## 3. Core Fairness Model

Kalender should **not** use one opaque fairness score as its source of truth.

Fairness is tracked using discrete dimensions.

### 3.1 Day classification

Every duty day is classified using two binary properties:

```text
is_today_holiday
is_next_day_holiday
```

This produces four shift types:

| Type | Today | Next day | Meaning |
|---|---|---|---|
| NN | Normal | Normal | Normal duty, followed by a normal day |
| NH | Normal | Holiday | Normal duty, followed by a holiday |
| HN | Holiday | Normal | Holiday duty, followed by a normal day |
| HH | Holiday | Holiday | Holiday duty, followed by another holiday |

These categories must remain separate.

The engine must not assume arbitrary equivalences such as:

```text
HN = 1.7 * NN
```

The four types can have materially different economic and personal value.

Discrete accounting is more explainable:

```text
Ali received 7 HN shifts.
His expected share was 4.8.
His HN balance is +2.2.
```

This is preferable to:

```text
Ali fairness score = 82.4
```

A composite score may later be derived for visualization, but it must never replace the underlying ledgers.

---

## 4. Actual vs Expected Allocation

For each person `p` and fairness bucket `b`:

```text
actual[p,b]
expected[p,b]
balance[p,b] = actual[p,b] - expected[p,b]
```

Interpretation:

```text
balance > 0  => person received more than their fair share
balance < 0  => person received less than their fair share
balance = 0  => approximately balanced
```

Example:

| Person | HN Actual | HN Expected | HN Balance |
|---|---:|---:|---:|
| Ali | 7 | 4.8 | +2.2 |
| Ayşe | 3 | 4.6 | -1.6 |
| Can | 4 | 4.6 | -0.6 |

The next HN assignment should normally favor Ayşe, assuming feasibility and other considerations are comparable.

---

## 5. Expected Share

Expected allocation must be accumulated continuously.

If one HN shift exists and four equally entitled people are active:

```text
Ali    expected HN += 0.25
Ayşe   expected HN += 0.25
Can    expected HN += 0.25
Deniz  expected HN += 0.25
```

If Ali receives the shift:

```text
Ali actual HN += 1
```

Result:

| Person | Expected | Actual | Balance |
|---|---:|---:|---:|
| Ali | 0.25 | 1 | +0.75 |
| Ayşe | 0.25 | 0 | -0.25 |
| Can | 0.25 | 0 | -0.25 |
| Deniz | 0.25 | 0 | -0.25 |

This model naturally compensates over future shifts.

---

## 6. Eligibility for Expected Share

Fairness eligibility and scheduling feasibility must be separated.

### 6.1 Fairness eligibility

A person should normally receive expected share when they are structurally entitled to participate.

Examples:

- employed during the period,
- belongs to the scheduling group,
- has the required qualification,
- has non-zero scheduling capacity,
- is not on a long-term exclusion from this duty type.

### 6.2 Scheduling feasibility

A person may be entitled to fairness share but temporarily infeasible for a specific assignment.

Examples:

- worked the previous day,
- would violate rest requirements,
- would exceed configured consecutive shifts,
- conflicts with another assignment.

This distinction matters because the scheduling algorithm must not manipulate fairness entitlement through its own previous decisions.

Example:

```text
Kalender assigns Ali on Monday.
That makes Ali infeasible on Tuesday due to next-day-off.
```

Ali should not necessarily lose all fairness entitlement for Tuesday simply because the optimizer made him infeasible by assigning Monday.

The exact eligibility policy should be configurable, but the engine must represent these two concepts separately.

---

## 7. Capacity and Part-Time Participation

Expected shares should support unequal participation.

Each person may have a fairness capacity:

```text
capacity[p]
```

For a fairness event:

```text
share[p] =
    capacity[p] /
    sum(capacity[e] for all fairness-eligible e)
```

Example:

```text
Ali   capacity = 1.0
Ayşe  capacity = 0.5
Can   capacity = 1.0
```

Total capacity:

```text
2.5
```

Expected shares:

```text
Ali   0.4
Ayşe  0.2
Can   0.4
```

This supports part-time employees and other organization-specific participation ratios without changing the fairness model.

---

## 8. New Joiners and Leavers

Do not initialize new people with synthetic historical debt.

A person begins accumulating expected share when they become fairness-eligible.

Example:

```text
Ece joins on June 1.
```

Ece has no entitlement for January-May.

From June onward she participates normally.

When someone leaves, they stop accumulating future expected share.

Historical events remain immutable.

This avoids artificial corrections against employees who did not participate in earlier periods.

---

## 9. Rolling Fairness

### 9.1 Do not reset annually

There must be no reset such as:

```text
January 1:
all fairness balances = 0
```

This creates an arbitrary discontinuity.

Instead, use rolling statistics.

On October 4, 2026:

```text
window = October 5, 2025 .. October 4, 2026
```

On October 5, 2026:

```text
window = October 6, 2025 .. October 5, 2026
```

Old history gradually leaves the window.

---

### 9.2 Primary window: 12 months

The default optimization horizon should be:

```text
rolling 12 months
```

Reasons:

- captures annual seasonality,
- includes weekends throughout the year,
- usually captures each major annual holiday period,
- allows previous unfairness to be compensated,
- prevents ancient unfairness from becoming permanent debt,
- handles organizational change better than lifetime fairness.

The system must retain lifetime history, but **automatic optimization should not normally optimize against lifetime balance**.

---

### 9.3 Additional windows

The engine should be able to derive multiple views from the event history:

```text
30 days
90 days
365 days
lifetime
```

Recommended semantics:

- **30/90 days:** recent-pattern diagnostics,
- **365 days:** primary optimizer input,
- **lifetime:** reporting/audit only.

Example:

| Window | HN Actual | HN Expected | Balance |
|---|---:|---:|---:|
| 90 days | 2 | 1.2 | +0.8 |
| 365 days | 7 | 4.8 | +2.2 |
| Lifetime | 19 | 17.7 | +1.3 |

---

## 10. Event History Is the Source of Truth

Do not persist only computed fairness totals.

Persist the underlying events.

Example domain model:

```text
Assignment {
    id
    schedule_id
    duty_date

    allocated_to
    performed_by

    day_type          // NN | NH | HN | HH
    holiday_block_id? // optional

    assignment_source // AUTO | MANUAL
    state             // DRAFT | PUBLISHED | CANCELLED

    created_at
    published_at?
}
```

The fairness ledger is derived from events plus fairness-eligibility history.

This allows future changes to:

- rolling-window duration,
- fairness calculation,
- reporting,
- diagnostics,
- policy configuration,

without losing historical truth.

---

## 11. Publication Boundary

Fairness ownership should become authoritative when an allocation is published.

### Before publication

Assignments are drafts.

Changing:

```text
Ali -> Ayşe
```

changes the fairness owner.

### After publication

A voluntary shift transfer:

```text
allocated_to = Ali
performed_by = Ayşe
```

preserves Ali as the fairness owner.

This gives the engine an explicit point at which a planned assignment becomes an allocation with fairness consequences.

---

## 12. Preferences

A person may express:

```text
HAVE
WANT
PREFER
NEUTRAL
AVOID
```

Suggested meanings:

### HAVE

Strong requirement entered by the scheduler or user.

Automatic generation should treat it as a high-priority requirement.

Manual scheduling may still override it.

### WANT

Strong positive preference.

### PREFER

Weak positive preference.

### NEUTRAL

No stated preference.

### AVOID

Negative preference.

Preferences do not change fairness accounting.

If Ali repeatedly asks for lucrative HN shifts and receives them, those allocations still increase:

```text
actual[Ali,HN]
```

Otherwise the system would allow preference to defeat fairness permanently.

---

## 13. Fairness Before Preference

Automatic scheduling should primarily correct fairness imbalance.

Preferences should decide between candidates who are already reasonably close in fairness.

Example:

```text
HN balances:

Ali   -1.10
Ayşe  -1.02  WANT
```

Ayşe can reasonably receive the shift.

But:

```text
Ali   -3.40
Ayşe  +2.10  WANT
```

Ali should normally receive it.

The implementation should therefore support a **fairness tolerance**.

Conceptually:

```text
best_balance = minimum balance among feasible candidates

fair_candidates =
    candidates within configured tolerance of best_balance

choose among fair_candidates using preferences
```

The tolerance may differ per organization.

Do not encode preferences and fairness into an unexplained arbitrary weighted formula unless necessary.

---

## 14. Long Holiday Blocks

The NN/NH/HN/HH model is not sufficient for long consecutive holidays.

Example:

```text
Sat Sun Mon Tue Wed Thu Fri Sat Sun
 H   H   H   H   H   H   H   H   H
```

Most days are HH, but holiday experience is not additive.

One shift may destroy the possibility of taking the whole holiday as leave.

Therefore Kalender introduces:

```text
HolidayBlock
```

Example:

```text
HolidayBlock {
    id
    start_date
    end_date
}
```

A block is a consecutive sequence of holidays.

---

## 15. Holiday Block Fairness

Track both:

```text
holiday_shift allocation
holiday_block exposure
```

These answer different questions.

### Holiday shift fairness

How many individual holiday duties did the person receive?

Captured by HN/HH ledgers.

### Holiday block fairness

How many separate holiday periods were interrupted?

Example:

```text
Ali:
5 holiday shifts
1 holiday block touched

Ayşe:
5 holiday shifts
5 holiday blocks touched
```

These are not equivalent experiences.

The engine must preserve both dimensions.

---

## 16. Long Holiday Optimization

For a long holiday block, the optimizer should treat the block as a unit.

Recommended strategy:

1. Determine all duties inside the holiday block.
2. Determine the smallest feasible group of people capable of covering the block under configured rules.
3. Prefer people with lower historical holiday-block exposure.
4. Schedule the individual duties within that group using normal HN/HH fairness.
5. Expand the group only when needed for feasibility or fairness.
6. Apply preferences within fairness tolerance.

This intentionally allows concentration.

Example:

Instead of interrupting nine people's holiday with one duty each, the organization may prefer a smaller rotating group to cover the block.

Historical block fairness prevents the same people from being repeatedly sacrificed across successive holidays.

---

## 17. Holiday Block Statistics

For each person, derive:

```text
holiday_blocks_touched
holiday_shifts_allocated
```

Optionally also derive:

```text
holiday_block_load
```

Example possible definition:

```text
person assignments in block /
total duties in block
```

The first implementation should prefer simple, explainable metrics over complex scoring.

Recommended source-of-truth metrics:

```text
number of distinct blocks touched
number of shifts allocated within those blocks
```

---

## 18. Rare Events

Pure 365-day rolling statistics are insufficient for rare events.

Example:

```text
New Year's duty
```

If last year's shift falls just outside the 365-day window when the new schedule is generated, the system may effectively forget who worked the previous occurrence.

For rare events, support occurrence-based history.

Examples:

```text
last 3 New Year duties
last 3 Eid blocks
last 3 organization-defined special holiday blocks
```

Therefore:

### Frequent fairness dimensions

Use rolling time:

```text
NN
NH
HN
HH
```

Primary window:

```text
365 days
```

### Rare fairness dimensions

Use recent occurrences:

```text
last N matching events or blocks
```

Lifetime history remains available for reporting.

---

## 19. Manual Scheduling

Manual scheduling has no fairness or constraint gate.

An administrator can create any schedule.

Every manual action should still produce:

```text
constraint warnings
preference warnings
fairness delta
```

Example:

```text
Assign Ali to 29 Oct HN

Current HN balance:
+2.2

After assignment:
+3.0

Warnings:
- Ali is already above fair share for HN
- consecutive duty rule violated
```

The administrator may still publish.

This is intentional.

Kalender assumes humans may possess information the optimizer does not.

---

## 20. Automatic Scheduling Goals

Automatic generation should use lexicographic priorities rather than one unexplained weighted score.

Recommended priority order:

### 1. Feasibility

Satisfy configured hard constraints.

Examples:

- required coverage,
- qualifications,
- explicitly unavailable people,
- configured rest rules.

### 2. Long-term fairness

Reduce the largest relevant rolling fairness deficits.

Use the discrete bucket corresponding to the shift being assigned.

### 3. Holiday-block fairness

For duties inside long holiday blocks, consider historical block exposure.

### 4. Preferences

Within reasonably fair alternatives:

```text
HAVE
WANT
PREFER
NEUTRAL
AVOID
```

### 5. Stability

When modifying an existing schedule, minimize unnecessary assignment changes.

---

## 21. Greedy Generation Strategy

A first implementation does not require a globally optimal mathematical solver.

Use a constraint-aware greedy algorithm with limited backtracking.

### 21.1 Schedule most constrained duties first

Do not simply schedule chronologically.

Rank unassigned duties by difficulty:

```text
fewest feasible candidates first
rare qualification first
holiday blocks / rare categories
remaining duties
```

This reduces dead ends.

---

### 21.2 Candidate ranking

For a normal duty:

```text
candidate ranking:

1. feasible
2. lowest balance in relevant NN/NH/HN/HH bucket
3. within fairness tolerance:
       HAVE
       WANT
       PREFER
       NEUTRAL
       AVOID
4. overall recent fairness as tie-breaker
5. deterministic stable tie-breaker
```

For long-holiday duties, holiday-block exposure is included before day-level preference resolution.

---

### 21.3 Limited repair

If greedy scheduling reaches an infeasible state:

```text
try local reassignment
try pairwise swap
backtrack recent assignments
expand holiday-block worker pool
```

The first version should avoid expensive exhaustive search.

A more sophisticated constraint solver can be added later without changing the fairness model.

---

## 22. Reoptimization

When an existing schedule changes:

```text
person becomes unavailable
new employee joins
holiday changes
manual assignment added
coverage requirement changes
```

Kalender should not regenerate the month from scratch unless necessary.

The objective is:

```text
preserve existing assignments where possible
restore feasibility
improve fairness where possible
```

Existing assignments can be treated as preferred/pinned values.

Conceptually:

```text
1. keep all still-valid assignments
2. identify affected region
3. repair affected assignments
4. only widen changes when required
```

The engine should report:

```text
2 assignments changed
1 fairness warning improved
0 new hard-rule violations
```

---

## 23. Fairness Is Allowed to Drift

A monthly schedule is not required to end with all balances near zero.

Example:

```text
October:
Ali HN balance = +2.4
Ayşe HN balance = -1.8
```

This may be acceptable because of:

- manual decisions,
- preferences,
- staffing constraints,
- unexpected absences,
- temporary organizational requirements.

November's optimizer naturally sees these balances and prefers Ayşe for future HN assignments.

This is a core behavior, not a failure.

> **Kalender optimizes fairness over time, not within every isolated schedule.**

---

## 24. Rolling Statistics and Historical Decay

Kalender should keep historical assignments indefinitely if storage permits.

However, old fairness debt should lose operational relevance.

Recommended behavior:

```text
event history: retained
365-day fairness: drives optimizer
90-day fairness: diagnostic
lifetime fairness: reporting only
rare-event history: last N occurrences
```

This avoids situations where an assignment from several years ago affects current scheduling.

No explicit decay formula is required in V1 because the rolling window provides natural expiration.

---

## 25. Determinism

Given:

```text
same people
same historical fairness state
same calendar
same constraints
same preferences
same existing assignments
same algorithm version
```

the engine should generate the same result.

Use deterministic tie-breaking.

Example:

```text
stable person id ordering
```

Do not use unseeded randomness.

Determinism is important for:

- debugging,
- explainability,
- testing,
- user trust,
- comparing optimization changes.

---

## 26. Explainability

Every automatic assignment should be explainable using source data.

Example:

```text
29 Oct -> Ayşe

Why:
- Ayşe is feasible.
- HN balance: -1.6
- Ali HN balance: +2.2
- Can HN balance: -0.6
- Ayşe had the largest HN fairness deficit.
- Ayşe also marked this day PREFER.
```

For a long holiday:

```text
Ayşe selected for Eid block

Why:
- Ayşe touched 0 of the last 3 comparable holiday blocks.
- Ali touched 2.
- Can touched 1.
- Ayşe is feasible for the block.
```

Avoid explanations based only on internal numeric optimization scores.

---

## 27. Visual Warning Model

The engine must expose structured warnings.

Example:

```text
Warning {
    type
    severity
    assignment_ids
    person_ids
    message_key
    explanation_data
}
```

Possible warning types:

```text
CONSECUTIVE_SHIFT
NEXT_DAY_OFF
OVER_FAIR_SHARE
UNDER_FAIR_SHARE
AVOID_PREFERENCE
UNAVAILABLE
QUALIFICATION
HOLIDAY_BLOCK_IMBALANCE
MAX_SHIFT_COUNT
```

Warnings are informational unless an automatic optimization mode explicitly treats them as constraints.

---

## 28. Suggested Core Data Model

```text
Person
    id
    active_periods
    qualifications
    capacity

CalendarDay
    date
    is_holiday
    holiday_block_id?

Duty
    id
    date
    required_qualification?
    required_count

Preference
    person_id
    duty/date
    type: HAVE | WANT | PREFER | AVOID

Assignment
    id
    duty_id
    allocated_to
    performed_by
    source: AUTO | MANUAL
    state: DRAFT | PUBLISHED | CANCELLED

HolidayBlock
    id
    start_date
    end_date
    category?

FairnessEligibility
    person_id
    effective_from
    effective_to
    capacity
    duty scope / qualification scope

ConstraintPolicy
    consecutive_shift_policy
    next_day_off_policy
    maximum_shift_policy
    other rules

Schedule
    id
    period
    version
    state
```

The exact persistence design may differ, but the domain model must retain these distinctions.

---

## 29. Derived Fairness Projection

The engine should expose something conceptually like:

```text
FairnessProjection {
    person_id
    window

    NN: { actual, expected, balance }
    NH: { actual, expected, balance }
    HN: { actual, expected, balance }
    HH: { actual, expected, balance }

    holiday_blocks_touched
    holiday_shifts
}
```

This projection is derived, not authoritative source data.

---

## 30. Pseudocode

### 30.1 Normal duty

```text
function assignDuty(duty, scheduleState):

    bucket = classifyDay(duty.date)

    candidates = structurallyEligiblePeople(duty)

    updateExpectedShares(
        candidates,
        bucket,
        duty
    )

    feasible = candidates.filter(
        person -> satisfiesConfiguredConstraints(
            person,
            duty,
            scheduleState
        )
    )

    if feasible is empty:
        return UNASSIGNED_WITH_WARNING

    balances = rollingBalances(feasible, bucket, 365_days)

    bestBalance = minimum(balances)

    fairCandidates = feasible.filter(
        person ->
            balance(person, bucket)
            <= bestBalance + fairnessTolerance
    )

    selected =
        rankByPreference(fairCandidates, duty)
        .thenBy(overallRecentFairness)
        .thenBy(stableId)
        .first()

    assign(selected, duty)

    return selected
```

---

### 30.2 Holiday block

```text
function scheduleHolidayBlock(block):

    duties = dutiesInside(block)

    candidates =
        peopleEligibleForAtLeastOne(duties)

    candidates =
        orderBy(
            recentComparableBlockExposure ASC,
            holidayDayFairness ASC,
            stableId ASC
        )

    pool = empty

    for candidate in candidates:

        pool.add(candidate)

        if blockCanBeScheduled(duties, pool):
            break

    scheduleDutiesWithinPool(
        duties,
        using HN/HH fairness,
        preferences,
        configured constraints
    )

    if scheduling fails:
        expand pool and retry
```

---

## 31. Engine Invariants

The implementation must preserve these invariants:

1. Manual assignments are never rejected solely because of fairness.
2. Published allocations remain in fairness history.
3. Voluntary post-publication transfers do not change fairness ownership.
4. NN/NH/HN/HH remain separate fairness dimensions.
5. Expected fairness share begins only when a person becomes eligible.
6. New employees do not inherit artificial historical debt.
7. No January 1 fairness reset exists.
8. Rolling 12-month fairness is the default optimizer horizon.
9. Lifetime history does not normally drive automatic scheduling.
10. Long holiday exposure is tracked separately from individual holiday shift counts.
11. Preferences never erase fairness history.
12. Automatic reoptimization should minimize disruption to existing schedules.
13. Generated results are deterministic for identical inputs.
14. Every automatic assignment is explainable from observable inputs.

---

## 32. Explicit Non-Goals for V1

The first version should not implement:

- auctions,
- preference currencies,
- bidding points,
- financial settlement between employees,
- machine-learning-based fairness,
- one universal weighted fairness score,
- lifetime fairness optimization,
- perfect global mathematical optimality,
- automatic policing of informal shift trades,
- payroll calculation.

These can be revisited later without changing the core fairness ledger.

---

## 33. Future Extensions

Possible later additions:

### Organization-defined fairness dimensions

Example:

```text
night shift
Friday night
special holiday
high-value duty
```

These should be added as explicit buckets rather than hidden weights.

### Advanced solver

The greedy engine can eventually be replaced by:

- CP-SAT,
- Timefold,
- another constraint optimizer.

The solver should consume the same fairness projections and domain events.

### Emergency reassignment semantics

Organizations may choose whether forced replacements update fairness ownership.

### Configurable fairness horizon

Default:

```text
12 months
```

Possible organization-level alternatives:

```text
6 months
18 months
24 months
```

The event model supports this without migration.

---

## 34. Final Core Model

Kalender's scheduling engine can be summarized as:

```text
                     historical assignments
                              |
                              v
                    rolling fairness ledger
                  NN / NH / HN / HH / blocks
                              |
                              v
calendar + people + constraints + preferences
                              |
                              v
                    automatic scheduler
                              |
                +-------------+-------------+
                |                           |
                v                           v
          proposed schedule             explanations
                |
                v
          manual editing
       (always permitted)
                |
                v
             warnings
                |
                v
             publish
                |
                v
      new fairness history events
                |
                +------> future schedules
```

The defining principle is:

> **Kalender does not attempt to make every schedule fair. It remembers what happened, measures imbalance over a rolling horizon, and continuously gives future schedules the opportunity to compensate.**
