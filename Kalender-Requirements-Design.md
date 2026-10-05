# Kalender — Requirements and Scheduling Design

Version: 0.1  
Date: 2026-10-03  
Status: Requirements baseline for review; no implementation stack selected.  
Purpose: Specify an explainable, flexible shift scheduler that AI agents can implement without inventing business rules.

## 1. Product goal

Kalender schedules one person for one shift on each calendar day. Plans are prepared monthly, but the primary definition of fairness is each person's allocation over the trailing 12 months. Each month should also be as fair as possible within that longer-term balance.

People join, leave, take time off, and have changing constraints. Calendars, pay rates, rest policies, and published plans can change. Kalender must accommodate those changes, preserve actual work history, and offer either manual corrections or automatic repairs that minimize disruption.

Success means a planner can answer: Who works on each date? Is the plan feasible? Why was each person assigned? Who has received more or less than their fair share? What changes are necessary when someone becomes unavailable?

## 2. Reading rules for implementation agents

- **Confirmed** means the user explicitly requested or selected the behavior.
- **Proposed** means a concrete recommended design, not an approved business rule.
- **Open** means a business decision remains unresolved. Use the stated provisional assumption only for a reviewable prototype; expose it as configuration and document it.
- **MUST** and **MUST NOT** express required behavior within the stated decision status. **SHOULD** expresses a recommendation.
- Requirement IDs are stable references for implementation, acceptance tests, and later changes.
- Do not silently replace an infeasible requirement with a weaker one. Show the conflict and offer a deliberate remedy.
- Do not infer employment law, holiday dates, shift duration, wage entitlements, or contractual obligations from this document. This is a configurable product specification.

## 3. Confirmed decisions

| ID | Decision |
| --- | --- |
| C-01 | The product is named **Kalender**. |
| C-02 | Plan one daily shift, staffed by one person, for every day of a month, including weekends and holidays. |
| C-03 | Fairness considers several measures: shift workload, holiday assignments, shift earnings, and compensatory time off. |
| C-04 | Trailing 12-month fairness is authoritative; monthly fairness is also desirable. An absence in one month can leave a remainder that influences later months. |
| C-05 | People can join or leave at any time. New joiners start accruing a fair share from their joining date, without catching up on earlier months. |
| C-06 | Saturday and Sunday are holidays by default. Other holidays can be selected directly on the calendar. |
| C-07 | Normal-day and holiday shift pay amounts are configurable. |
| C-08 | Every shift triggers a configurable following-day-off policy. The day off includes ordinary work, not merely another Kalender shift. |
| C-09 | Handling a following day that is already nonworking must be configurable. |
| C-10 | Fairness history uses shifts actually worked. Future plans contribute only to projections. |
| C-11 | Initial personal constraints include unavailable dates, preferred or avoided dates, and minimum or maximum monthly shift counts. |
| C-12 | Plans can change. Automatic revisions should minimize changes, and planners must also be able to edit manually. |

## 4. Scope and deliberate boundaries

### Initial scope

- One roster of people, one organization-local calendar, and one person per daily shift.
- Membership dates, recurring personal settings, and month-specific overrides.
- Editable holiday classification, two configurable pay classes, configurable rest policies, and ordinary-work calendars needed to value leave.
- Import and correction of historical actual shifts.
- Initial generation, manual editing, minimal-change repair, review, and publication.
- Rolling and monthly fairness reports, clear constraint failures, and version history.
- A basic planner workflow and a readable monthly roster export.

### Later extensions; do not require them in the first version

- Multiple shifts per day, multiple people per shift, skill-based coverage, or separate teams.
- Unequal participation shares, categorical restrictions such as holiday ineligibility, and personal pay rates.
- Employee self-service, requests, approval chains, notifications, calendar integrations, or shift trading.
- Payroll processing, ordinary-work scheduling, attendance tracking beyond shift completion, or external HR integration.
- A particular programming language, framework, database, hosting provider, or solver library.

The model SHOULD allow dated policies and stable identities so these extensions do not require rewriting history. Avoid speculative product workflows for them.

## 5. Domain vocabulary

| Term | Meaning |
| --- | --- |
| Roster | The scheduling group and its calendar/policy context. |
| Membership | A person's active period in a roster; a departure closes the period rather than deleting the person. |
| Daily shift | A coverage obligation associated with one local calendar date. Exact working hours remain open. |
| Assignment | The person assigned to a daily shift in a particular plan revision. |
| Actual shift | A dated record of work performed, possibly by someone different from the planned assignee. |
| Holiday | A date classified for holiday shift pay and holiday fairness reporting. It still requires coverage. |
| Unavailability | A hard prohibition against assigning a person on a date. |
| Preference | A request that influences a plan but may be unmet. |
| Rest obligation | An absence from work generated by an assignment or actual shift according to the applicable policy. |
| Useful day off | A generated leave day that releases the person from otherwise scheduled ordinary work. |
| Fair-share target | A person's expected allocation for a fairness measure over a specified period. |
| Remainder | Actual allocation minus fair-share target. Negative values indicate under-allocation; positive values indicate over-allocation. |
| Published baseline | The accepted plan revision against which automatic repair measures change. |
| Locked assignment | An assignment that automatic generation or repair must preserve. |

Holiday classification, an individual's ordinary-work calendar, and individual unavailability are distinct concepts. For example, a holiday may be an ordinary working day for some people; being unavailable on a weekday does not make that weekday a holiday.

## 6. People and personal constraints

### REQ-P-01 — Membership dates [Confirmed]

Each person MUST have a stable identity and an effective joining date. Support a leaving date; proposed semantics are `active_from` inclusive and `inactive_from` exclusive. Membership eligibility is evaluated on the shift date. Rejoining preserves identity and creates another active interval.

A person MUST NOT be assigned outside their active interval. Leaving MUST NOT delete actual shifts, pay records, historical targets, or audit entries. Departure produces a repair proposal for affected future assignments; it does not silently reassign them.

### REQ-P-02 — Monthly inputs [Confirmed]

The planner MUST be able to set, update, and remove:

- Unavailable dates or inclusive date ranges.
- Preferred dates and avoided dates.
- A minimum and maximum number of shifts for a particular month.

The same data may be entered before generation or after publication. A changed input triggers impact analysis and may require repair. It MUST NOT silently replace the currently published plan.

### REQ-P-03 — Hard and soft conditions [Proposed]

Unavailability, membership, rest, and maximum monthly shifts are hard constraints. Preferences are soft. Separate a required minimum from a desired minimum; do not present a preference as a guarantee. Until clarified, user-entered minimum counts are hard and unspecified minima are zero. An unspecified maximum imposes no additional cap beyond other rules.

Validate `minimum <= maximum`, date ranges, and conflicting inputs. If every person avoids the same day, the system can assign someone and report the unmet preference. If every person is unavailable, the day has no feasible assignment.

### REQ-P-04 — Effective configuration [Proposed]

Recurring personal defaults MAY be overridden for a month. Show the resolved settings and their source. Date-specific hard unavailability cannot be removed by a soft preference. Detect contradictions instead of choosing an undocumented precedence rule.

Monthly shift limits count shifts whose roster date falls inside that month. They do not replace the rolling fairness target. A temporary low cap can therefore leave a remainder.

## 7. Calendar, holidays, pay, and time off

### REQ-C-01 — Calendar editing [Confirmed]

The month view MUST default Saturdays and Sundays to holiday classification. The planner MUST be able to select or clear holiday classification on individual dates and date ranges. Show both the effective class and its source: weekend default or explicit override. A date that is both weekend and a named holiday is counted and paid once.

Weekend dates MAY be explicitly marked normal; this is a proposed interpretation of editable classification. Named labels are informational unless a configured policy gives them additional meaning. Do not automatically introduce separate Saturday, Sunday, or special-holiday pay tiers.

### REQ-C-02 — Pay configuration [Confirmed / proposed dated treatment]

Configure a currency, normal-day shift amount, and holiday shift amount. Store amounts exactly, with an explicit rounding rule; avoid binary floating-point money. Rates apply by shift date and MUST be effective-dated. Holiday pay may be higher or lower; do not require a particular relationship.

For each assignment display estimated pay. Actual shift records retain the rate/policy context used for their recorded compensation. A new rate MUST NOT silently recalculate historical recorded earnings. Support explicit, audited corrections.

This product calculates shift compensation for planning and fairness. Tax, base salary, payroll settlement, and deductions are outside the initial scope.

### REQ-C-03 — Following-day rest [Confirmed]

By default, each assignment creates a rest obligation on the following local calendar day. That person MUST NOT receive another shift on that day. Show the day as off from ordinary work as well. The policy is configurable, including whether it is enabled and its nonworking-day treatment.

The system MUST evaluate obligations across month and year boundaries. A shift on January 31 affects February 1. A shift on December 31 affects January 1. A candidate plan cannot ignore a neighboring published plan or rest generated by actual work.

### REQ-C-04 — Already nonworking next day [Confirmed configurability; proposed options]

Support these two explicit policy options:

1. **Calendar day only:** the next day remains free of work; if it was already nonworking, no replacement leave is granted.
2. **Next working day additionally:** the next calendar day remains free of work, and if it was already nonworking, the next ordinary working day also becomes compensatory leave.

The second option requires a baseline ordinary-work calendar for each person, with a roster-wide default and personal exceptions. Define ordinary working days independently of generated leave, so the calculation cannot move indefinitely as it encounters its own output.

Kalender MUST show ordinary work released by this policy and conflicts with any recorded non-releasable obligations. Applying leave in an external HR or work-roster system is outside initial scope; publication must not claim that an external system has been updated.

Both the immediate rest day and additional compensatory day prohibit shift assignment. A disabled next-day policy is an explicit configuration change; a manual assignment is not an implicit exception.

Track calendar rest days and useful leave days separately. A Saturday that was already off is not automatically equal in benefit to a Tuesday released from ordinary work. Do not monetize leave without an explicitly selected conversion rule.

### REQ-C-05 — Time-off accounting [Proposed]

Generated leave MUST be derived from its source shift and policy and explainable in the UI. Cancelling an unworked assignment removes only that assignment's projected leave. A worked shift retains its leave entitlement even when the old plan is edited.

If obligations overlap, retain each source but count a released ordinary working day only once in the fairness total. Do not silently grant an additional day for overlap; report a policy conflict if the configured entitlement cannot be satisfied. Count useful leave by the date taken; track pending future entitlement separately to avoid counting the same benefit twice.

### REQ-C-06 — Holiday or policy edits [Proposed]

When a date or policy changes, preview affected compensation, holiday totals, rest dates, fairness, and assignments. Preserve the current plan until a reviewed revision is published. Past changes require explicit correction of historical facts/targets; future settings must not alter recorded past results automatically.

## 8. Fairness model

### 8.1 Principles

**REQ-F-01 [Confirmed]:** Optimize the trailing 12 months first and the current month second. Do not reset fairness at month boundaries or January 1.

**REQ-F-02 [Confirmed]:** Absence can leave an under-allocation that influences later months. The system MUST NOT automatically erase an expected share just because a person was unavailable or avoided certain dates.

**REQ-F-03 [Confirmed]:** New members have no target before joining. Departed members retain history but receive no new target after departure. No one inherits the balance of the person they replace.

**REQ-F-04 [Proposed]:** Fairness is a vector of separate measures; a high payment cannot automatically cancel an excessive workload. Report both raw totals and deviations from fair shares.

**REQ-F-05 [Proposed]:** Fairness is an optimization goal, not a promise of exact equality. Coverage, rest, membership, availability, and explicit limits can prevent equality. Explain remaining imbalances and their causes.

### 8.2 Measures

| Measure | Observed amount | Why it is separate |
| --- | --- | --- |
| Shift workload | Completed daily shifts; hours only if shift duration is later defined | Number of duties and total earnings can differ. |
| Holiday duty | Completed shifts on dates classified as holidays | Holiday work has a distinct burden and compensation. |
| Shift earnings | Recorded compensation in the configured currency | Equal shift counts need not give equal pay. |
| Useful time off | Ordinary workdays actually released by shift-generated leave | Calendar rest days do not always provide the same benefit. |

Also show normal-day count and generated rest-day count. These are supporting breakdowns, not extra mandatory optimization objectives. Imported useful leave requires sufficient historical work-calendar information; otherwise mark that measure incomplete rather than inventing it.

### 8.3 Rolling-window definition [Proposed]

For a monthly plan, let `E` be the first local date of the following month. Evaluate its primary fairness window as `[E minus 12 calendar months, E)`. For example, an October 2026 plan is evaluated over November 1, 2025 through October 31, 2026, inclusive.

For an as-of report, `E` is the date after the last included date. Use calendar-month arithmetic, with an explicit end-of-month clamping rule; do not substitute a fixed 365-day duration. Never mix different anchors in one comparison.

Separate:

- **Recorded fairness:** confirmed actual shifts/leave and accrued targets through the chosen completed-date cutoff.
- **Projected fairness:** those actuals plus exactly one effective assignment per future date from published plans and the candidate under review, with targets for the same horizon.

An actual shift replaces its planned counterpart in calculations. A candidate replaces the revision it is evaluating; it is not added on top. An elapsed but unconfirmed assignment is marked unknown and cannot be silently counted as completed or zero work.

### 8.4 Expected shares and remainder [Proposed algorithm]

The initial fairness baseline is equal participation among active roster members. A target is independent of temporary unavailability, date preferences, and generated rest; otherwise constraints could erase the remainder that the user wants to carry forward.

For each required date `d`:

```text
A(d) = roster members active on d
share(p, d) = 1 / count(A(d)) if p is in A(d), otherwise 0

target_shifts(p, W) = sum over required d in W of share(p, d)
target_holidays(p, W) = sum over holiday d in W of share(p, d)
target_earnings(p, W) = sum over required d in W of share(p, d) * applicable_shift_pay(d)

remainder(p, measure, W) = observed(p, measure, W) - target(p, measure, W)
```

Targets may be fractional. Never round each person's target to an integer before optimization. Remainders are derived from dated contributions inside the window, not an unlimited lifetime balance copied from month to month. Expiring contributions leave the window automatically; actual allocation and target expire together.

Historical target contributions use the active membership and effective calendar/pay context for their dates. Preserve that context, or an auditable reconstruction, so today's member count cannot rewrite last year's expected shares.

An active person on approved leave continues accruing an expected share under this proposed interpretation of the remainder requirement. Closing membership stops accrual. A prolonged absence may make catch-up impossible; keep the imbalance visible and bounded by the rolling window. Do not overload later months to force equality.

If a date has zero active members, report an invalid roster/coverage conflict and leave its share undefined. Do not divide by zero or silently drop that coverage obligation.

### 8.5 Useful-leave targets [Proposed; requires review]

Useful leave is person-dependent: assigning the same shift to two different people can produce different leave dates or benefits. It therefore cannot always use the same simple target formula as money.

For each date, evaluate how many distinct ordinary workdays would be released if each active person worked that shift, using that person's baseline work calendar and the applicable policy. Accrue to each person their equal-share fraction of that counterfactual benefit, dated to the resulting leave dates. Temporary shift unavailability does not erase this target. Report useful leave actually taken and pending entitlements separately.

This is a proposed proportional-benefit baseline, not an assumption that everyone's ordinary-work calendar is identical. Count unique released dates in actual/candidate totals and disclose any shortfall due to overlapping entitlements. If baseline calendars or historical leave are missing, mark the measure unavailable and exclude it from optimization until completed; do not display a fabricated equality result.

The initial product MUST show useful-leave fairness. The exact target policy and relative optimization priority require review before claiming that its fairness algorithm is final.

### 8.6 Optimization priorities [Proposed]

Use explicit priority tiers rather than a hidden sum of days and currency:

1. Satisfy all hard constraints and required coverage.
2. For repair, minimize changed assignments against the selected baseline; for initial generation, this tier is absent.
3. Minimize trailing 12-month fairness imbalance.
4. Improve current-month fairness without worsening a higher tier.
5. Satisfy preferences and improve spacing among otherwise comparable candidates.
6. Resolve equivalent results with a documented, reproducible tie-break that avoids permanent alphabetical favoritism.

Within fairness tiers, separately normalize deviations for workload, holiday duty, earnings, and useful leave before applying configured relative priorities. The UI MUST expose those priorities and the raw per-measure results. No default priority between these four measures has yet been approved. A prototype MAY use equal priorities after normalization, clearly labeled provisional.

A recommended imbalance objective first reduces the largest normalized deviation and then the total deviation. Zero-target dimensions are handled explicitly, with no division by zero. The normalization rule MUST be documented, stable for one solve, and reported with the candidate; changing monetary units alone must not change assignments.

Do not hide unfairness by excluding constrained people from reports or by renormalizing targets around only assignable people. Attainability diagnostics may show a best-achievable allocation separately from the fair-share baseline.

### 8.7 Worked examples

**Absence and remainder:** A, B, and C are active for a 30-day month. Each target is 10 shifts. Because of an absence, A actually works 5, B works 12, and C works 13. Their workload remainders are -5, +2, and +3. In a subsequent comparable month, 15 for A, 8 for B, and 7 for C would balance workload over these two months if rest and monthly limits permit it. Other fairness measures may favor a different valid allocation. Kalender chooses the closest feasible balance according to the configured priorities.

**New member:** A and B are active for a 30-day month; C joins on day 16. Each day before joining is shared between A and B; later dates are shared among three. Targets become A=12.5, B=12.5, C=5. C owes nothing for days 1–15 or earlier months.

**Money versus workload:** With normal pay 100 and holiday pay 200, three normal shifts give 3 shifts and 300, while two holiday shifts give 2 shifts and 400. Equalizing only counts or only earnings leaves a different imbalance. Show and optimize both dimensions explicitly.

**Window expiry:** If an old holiday shift and its target leave the trailing window, the remainder changes even when no new shift was worked. Explain this as window expiry, not an unexplained balance adjustment.

## 9. Generation, revision, and manual control

### REQ-S-01 — Generate a candidate [Confirmed / proposed workflow]

The planner chooses a month, reviews coverage, people, monthly inputs, holiday/pay/rest policies, and available history, then generates a draft candidate. Show assignment choices, generated leave, estimated earnings, projected fairness, unmet preferences, and conflicts before publication.

Generation MUST NOT alter a published plan. An acceptable result may be feasible but uneven; show why. If history is incomplete, show that limitation and use only an explicitly selected initialization policy.

### REQ-S-02 — Repair with minimum changes [Confirmed]

After changed availability, departure, holidays, or other inputs, propose a revision to the accepted baseline. Minimize the number of dates whose assignee changes, subject to feasibility and locks. A swap changes two dates. A change of pay or derived leave without a new assignee is a separate reported impact, not another changed assignment.

Resolve equal-change candidates using rolling fairness, then monthly fairness and preferences. Offer a separate, explicitly selected broader rebalance mode for a planner willing to accept more changes for better fairness. Never widen a repair into a whole-month reshuffle silently.

Minimum-change optimization does not mean a greedy local replacement is sufficient. Rest and monthly limits may require a chain of changes. Evaluate the entire affected constraint context.

### REQ-S-03 — Manual assignment and locks [Confirmed / proposed validation]

The planner can assign, replace, unassign, swap, and lock assignments. Recalculate leave, pay, fairness, and validation immediately. Manual changes use the same validator as generated plans.

A planner can deliberately accept a fairness imbalance or unmet soft preference. A manual edit MUST NOT bypass a hard constraint silently. Proposed initial behavior: infeasible edits may be saved as an invalid draft, but not published. Do not introduce a hard-rule override feature without a separate approved rule and audit model.

### REQ-S-04 — Revision comparison [Proposed]

Before applying a revision, show:

- Date, previous assignee, proposed assignee, and reason for each assignment change.
- Rest days added, removed, moved, or conflicting with ordinary work or a neighboring plan.
- Compensation changes, holiday classification changes, and per-person fairness before/after.
- Locks respected, unresolved conflicts, and any unavailable or incomplete historical inputs.

Preserve earlier revisions and record actor, timestamp, baseline revision, input changes, and chosen scheduling mode. An explanation can cite facts such as a negative remainder or a binding rest rule; do not invent a unique causal explanation for a globally optimized result.

### REQ-S-05 — Publication and stale candidates [Proposed]

Only a fully covered, validated candidate may be published. Publication selects a new current revision; it does not overwrite historical revisions. A plan can remain published while a new invalid draft is being repaired, but show that changed inputs have made the published plan invalid or outdated.

Every candidate is tied to the input/policy/history versions used to generate it. If those inputs or the baseline changed before acceptance, revalidate and require a fresh comparison. Do not overwrite a newer accepted plan with a stale candidate.

### REQ-S-06 — Cross-month changes [Proposed]

Use neighboring actuals, published assignments, locked assignments, and rest obligations as context. A repair MAY propose changes in a neighboring future month when needed, but MUST list that expanded scope and publish all dependent revisions atomically. It cannot mutate another month implicitly.

If the next month has no plan yet, persist boundary rest obligations for its later generation. Actual completed shifts are never optimization variables. An incorrect actual record is corrected through the historical correction workflow.

## 10. Actual work and historical initialization

### REQ-H-01 — Actual records [Confirmed]

Record who actually worked, the shift date, completion/cancellation status, holiday/pay context, and generated leave. Support substitutions and explicit corrections. A scheduled person who did not work MUST NOT receive that shift's actual count or earnings.

Do not infer attendance merely because a date has passed. Distinguish planned, completed, cancelled, and awaiting confirmation. Actual records drive recorded fairness; future assignments drive projected fairness. Confirm or correct actual compensatory leave when it differs from planned leave.

### REQ-H-02 — Import [Proposed]

Support an initial import of up to the trailing 12 months of actual shift history, membership periods, calendar/pay policy context, and leave where available. Preview validation failures, duplicate dates, unknown people, missing amounts, and gaps before accepting the import.

Retried imports MUST NOT duplicate actuals. Do not fabricate historical amounts from today's pay rates. Historical coverage and ordinary-work calendars may be incomplete; distinguish zero actual work from unknown work and identify which fairness dimensions are usable.

### REQ-H-03 — Missing history [Open; proposed provisional policy]

If trustworthy history starts more recently than 12 months ago, choose and display a fairness start date. Accrue targets only from that declared baseline until earlier history is imported. Show the effective history length. Never describe two months of data as measured 12-month fairness, and never invent a year of debt from missing records.

A person joining after the baseline starts at their actual joining date. A person who was active earlier starts at the baseline unless reliable earlier history is added. An imported revision to history recalculates fairness and may warrant a new future candidate; it does not silently reshuffle published shifts.

## 11. Infeasibility and explanation

### REQ-I-01 — Conflict reporting [Proposed]

When no valid schedule exists, return an actionable report with implicated dates, people, constraints, and possible remedies. If available, identify a small conflicting set of rules. Distinguish a proven infeasible result from a timeout or interrupted search.

Examples:

- No active and available person for a date.
- A locked assignment violates new unavailability.
- One person is active all month while next-day rest is enabled, making daily coverage impossible.
- Monthly minimums exceed available coverage, or the sum of maximums is below it.
- A boundary rest day conflicts with an assignment in a neighboring published plan.
- Useful-leave policy requires an ordinary-work calendar that has not been configured.

Offer remedies such as changing a lock, correcting availability, changing a configured limit, or expanding the revision scope. Applying a remedy requires a deliberate planner edit, not automatic relaxation.

### REQ-I-02 — Search outcomes [Proposed]

Differentiate `feasible optimal`, `feasible best found`, `proven infeasible`, and `no conclusion within limit`. An incomplete search MUST NOT claim optimal fairness or a mathematically minimal number of changes. Return an independently validated feasible candidate when one is available, with its quality/status stated.

A partial diagnostic roster with uncovered days may be useful for review but MUST NOT be publishable as complete coverage.

## 12. Required user workflows

1. **Set up roster:** set timezone, currency, rates, weekend defaults, rest treatment, baseline ordinary-work calendar, members, and history baseline/import.
2. **Prepare a month:** select holidays directly, review joiners/leavers, enter unavailability/preferences/count limits, and review boundary obligations.
3. **Generate and review:** inspect a candidate, monthly and rolling fairness, earnings, useful time off, and unmet preferences.
4. **Edit manually:** change assignments or swap people; lock decisions; see immediate constraint and fairness feedback.
5. **Publish:** validate coverage and inputs, review changes against the current revision, and select the accepted plan.
6. **Handle disruption:** record the change, preview a minimal-change repair, review all affected dates/months, and publish the chosen revision.
7. **Record actual work:** confirm completed shifts, substitutions, cancellations, and actual leave; review rolling remainders.

Calendar cells SHOULD show the shift assignee, holiday class, pay, and relevant rest indicators without requiring the planner to decode the fairness algorithm. Personal constraints need a clear per-person monthly view. A fairness report MUST identify its window, recorded/projected status, completeness, targets, actuals, and remainders.

Proposed first-version access: authorized planners edit inputs and publish; other readers can view/export the roster. Employee self-service is outside initial scope. Exact permissions and deployment audience remain open.

## 13. Conceptual information model

This is a requirements model, not a required database schema.

| Concept | Minimum information and relationships |
| --- | --- |
| Person | Stable ID, display name; historical records survive departure. |
| Membership | Person, roster, active interval; multiple intervals support rejoining. |
| Roster | Name, local timezone, currency, configuration references. |
| Calendar date | Local date, effective normal/holiday class, label, override source/version. |
| Pay policy | Effective interval, normal amount, holiday amount, currency, rounding. |
| Rest policy | Effective interval, enabled state, nonworking-day treatment. |
| Ordinary-work calendar | Person/default calendar, dated working/nonworking overrides. |
| Monthly conditions | Person/month, unavailable ranges, preferences, required/desired minimum, maximum. |
| Coverage requirement | Roster/date, one required daily slot in the initial version. |
| Plan revision | Month, status, baseline revision, input versions, creation/publication audit, optimization mode/outcome. |
| Assignment | Revision/date/person, lock, estimated pay and applicable policy context. |
| Actual shift | Date/person, status, recorded compensation/context, correction audit, source assignment if any. |
| Rest/leave obligation | Source actual or assignment, policy context, immediate rest date, compensatory leave date, projected/confirmed status. |
| Fairness contribution | Dated observed and target measure contributions, source/context; derived or persisted with equivalent reproducibility. |
| Audit event | Actor/time/action, affected identities, before/after revisions, stated reason where relevant. |

Avoid a mutable lifetime `fairness_balance` as the only source of truth. Remainders must be reproducible for any trailing window from dated history and target context. Avoid destructive monthly regeneration that replaces assignments without revision identity.

## 14. Invariants and acceptance scenarios

### Required invariants

- `INV-01`: Every published coverage date has exactly one assigned person.
- `INV-02`: Every published assignment satisfies membership, unavailability, rest, locks, and explicit hard count limits.
- `INV-03`: One shift appears at most once in each recorded/projected calculation.
- `INV-04`: New members receive no expected allocation before joining; departures create no new targets after leaving.
- `INV-05`: A completed shift cannot be moved by plan optimization.
- `INV-06`: Cross-month rest obligations cannot be lost by month-local processing.
- `INV-07`: Money uses the applicable dated context, and configuration edits do not silently rewrite actual earnings.
- `INV-08`: Holiday and weekend overlap counts once; useful leave counts distinct released ordinary-work dates.
- `INV-09`: Identical frozen inputs and tie-break seed produce the same candidate or a stated reproducibility limitation.
- `INV-10`: Every published revision is independently validated against its effective input versions.

| ID | Scenario | Expected behavior |
| --- | --- | --- |
| AT-01 | Three equally active people, equal availability, no prior imbalance | Generate a valid near-equal workload distribution, then balance other measures within stated priorities. |
| AT-02 | One person missed shifts during an earlier active month | The rolling deficit influences the current allocation; hard constraints still apply. |
| AT-03 | A new person joins halfway through a month | Only the active dates accrue targets; no catch-up for previous months. |
| AT-04 | A person leaves after publication | Future assignments on/after departure are flagged for repair; actual history remains intact. |
| AT-05 | A normal weekday is marked holiday | Show changed pay, holiday allocation, and fairness; provide a revision without silently replacing the published plan. |
| AT-06 | A shift occurs on the final day of a month | The following month's first day respects its generated rest obligation. |
| AT-07 | The next day was already nonworking | Calendar-only policy grants no replacement; additional-working-day policy grants and validates the configured additional leave. |
| AT-08 | All people are unavailable on one date | Report infeasible coverage; do not break availability or publish a partial plan. |
| AT-09 | One future assignee becomes unavailable; a single replacement is feasible | Automatic repair changes one date; equal-change alternatives are compared by fairness. |
| AT-10 | A replacement would violate rest on another assigned date | Evaluate a wider repair if needed and disclose every changed date. |
| AT-11 | A manual swap violates an adjacent rest obligation | Reject publication and explain the exact conflict. |
| AT-12 | B works A's planned shift | Actual fairness and earnings credit B once; the plan remains part of revision history. |
| AT-13 | Only two months of history are available | Report a two-month measured baseline with incomplete 12-month history; do not infer older deficits. |
| AT-14 | A contribution reaches 12 months of age | Actual and target contributions expire consistently and the remainder updates transparently. |
| AT-15 | Pay rates change next month | Estimates use the new dated rates; existing actual compensation remains unchanged. |
| AT-16 | An input changes while a candidate is awaiting publication | Detect staleness, revalidate, and show a fresh comparison before accepting it. |
| AT-17 | A solver stops before proving minimum change | Label the repair best found; do not claim it is the minimum. |
| AT-18 | Imported history is retried | No duplicated actual shifts, pay, or leave contributions. |
| AT-19 | A locked assignment conflicts with new absence | Show the conflict; do not unlock or override it automatically. |
| AT-20 | Several people have equal scores | Tie-breaking is reproducible and does not repeatedly favor the first name. |
| AT-21 | A Sunday is also a named holiday | One holiday shift and one applicable pay amount are counted. |
| AT-22 | A future assignment is cancelled before work | Remove its projected contributions and generated leave; keep confirmed actuals unchanged. |

## 15. Quality and implementation requirements

- **Explainability:** persist the input context, objective priorities, and outcome status for each generated candidate. Reports must allow a planner to reconstruct the remainder and understand binding constraints.
- **Independent validation:** validate generated and manual candidates through the same domain rules before publication; solver output alone is not proof of validity.
- **Data integrity:** publication and dependent cross-month revisions are atomic. Detect concurrent edits rather than losing updates.
- **Determinism:** use stable input snapshots and a recorded tie-break seed. If the solver is nondeterministic, state the practical reproducibility guarantee explicitly.
- **Responsiveness:** allow bounded generation and cancellation, preserve entered work, and distinguish search progress from a final result. Performance targets depend on roster size and remain open.
- **Privacy:** person-level absence reasons are optional. Store the constraint needed for scheduling without requiring sensitive medical or personal details.
- **Export:** readable monthly roster with holiday and rest indicators; optional fairness/earnings details should be separable so the planner controls disclosure.
- **Portability of rules:** keep calendar classification, hard constraints, fairness accounting, and plan revision semantics explicit and testable. AI may assist explanation or input entry, but should not invent assignments without validation or rewrite policy on its own.

## 16. Open decisions and provisional defaults

The document is usable for a prototype now. These decisions should be resolved before accepting its scheduling policy as final.

| ID | Question | Provisional approach / implication |
| --- | --- | --- |
| O-01 | How many people are typically active, and how large can a roster grow? | No invented capacity promise; collect small, typical, and largest realistic cases for performance validation. |
| O-02 | What are the daily shift's start/end times and duration? | Treat duty as one local-date unit; do not claim hourly rest compliance or cross-midnight correctness until times are specified. |
| O-03 | Which of workload, holidays, earnings, and useful leave has highest priority when they conflict? | Separate reporting; equal normalized priorities only as a labeled prototype default. |
| O-04 | Is equal expected participation valid for everyone? | Equal active-member shares initially. Unequal contractual shares require an explicit extension. |
| O-05 | Should particular long absences suspend accrual of expected share? | Continue targets while membership is active, consistent with remainder behavior; no automatic absence discount. |
| O-06 | Does historical data exist, and how complete are earnings and ordinary-work calendars? | Declare a reliable baseline; mark unknown dimensions instead of estimating facts silently. |
| O-07 | Are minimum monthly counts mandatory or desired? | Explicitly distinguish required and desired; treat a user-entered minimum as required until clarified. |
| O-08 | Which nonworking-next-day policy should a new roster default to? | Require selection during setup; both policies are supported. |
| O-09 | Are ordinary-work calendars shared or individual, and are ordinary-work conflicts managed externally? | Provide a roster default with personal overrides; Kalender records generated leave but does not build the ordinary-work roster. |
| O-10 | Is the proposed useful-leave target definition acceptable? | Use it as a reviewable proposal; show actual and projected benefits separately and disclose missing baselines. |
| O-11 | How are generated leave days confirmed, moved, or settled after departure? | Support dated records and explicit corrections; do not infer payout or additional entitlement. |
| O-12 | Are monetary corrections nominal across rate changes, or should economic fairness use a rate-independent supplement? | Track nominal recorded earnings plus workload and holiday counts; no inflation adjustment. |
| O-13 | Who can view earnings, constraints, and history, and who can publish? | Planner-only editing; exact access rules require deployment context. |
| O-14 | May past calendar errors change historical target contributions as well as actual compensation? | Only an explicit correction with a preview and audit trail; preserve original context. |

## 17. Suggested delivery order for implementation agents

1. **Rules and history baseline:** implement dated membership, calendar/pay/rest context, monthly conditions, actual import, and rolling target/remainder calculation. Validate joins, absences, expiry, and missing history first.
2. **Manual calendar and validator:** implement drafts, assignment editing, generated leave, cross-month checks, revisions, and publication. Demonstrate a complete manually created valid month.
3. **Automatic initial generation:** use the same rules to produce feasible candidates with explicit rolling/monthly fairness priorities and reproducible diagnostics.
4. **Minimal-change repair:** compare to published baselines, honor locks, show all assignment/leave/pay changes, and handle dependent neighboring revisions.
5. **Planner polish:** history confirmation, fairness explanations, calendar shortcuts, and readable export; validate realistic roster sizes.

For each step, implement confirmed requirements first, keep proposed defaults visible, and retain open decisions as configuration or documented gaps. Do not select a technology stack or build integrations merely because an implementation agent prefers them.
