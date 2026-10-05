# Kalender Core Engine — High-Level Acceptance Tests

## 1. Classify Every Duty Into the Correct Fairness Type

Given a calendar containing normal days and holidays, when the engine evaluates a duty, it must classify the duty according to both the current day and the following day.

The engine must distinguish all four cases:

- normal day followed by a normal day,
- normal day followed by a holiday,
- holiday followed by a normal day,
- holiday followed by another holiday.

Changing whether either the current day or the next day is a holiday must change the classification accordingly.

---

## 2. Keep Fairness Types Independent

Given a person who has received more than their fair share of one duty type but less than their fair share of another, the engine must preserve those balances independently.

An excess in one type must not automatically compensate for a deficit in another type.

For example, being over-allocated holiday-followed-by-normal duties must not make the person appear balanced for normal-followed-by-normal duties.

---

## 3. Track Actual Allocation Against Expected Allocation

Given multiple equally entitled people and a new duty, every entitled person must receive their proportional expected share of that duty type.

Only the person who receives the actual assignment must receive the actual allocation.

After several assignments, the engine must be able to identify who has received more or less than their expected share.

---

## 4. Automatically Prefer the Person Most Behind in the Relevant Fairness Type

Given multiple feasible people for a duty and one person has received materially less than their expected share of that duty type, automatic scheduling should prefer that person.

The selected person should move closer to the group fairness target after receiving the assignment.

---

## 5. Do Not Require a Single Month to Be Fair

Given an intentionally uneven current-month schedule, the system must allow the month to remain uneven.

The resulting fairness imbalance must be preserved in the rolling statistics.

When a future schedule is automatically generated, that historical imbalance must influence future assignments so that the system can compensate over time.

---

## 6. Allow Any Manual Assignment

Given an administrator manually assigning a person in a way that violates configured scheduling rules, the system must allow the assignment.

This includes cases such as:

- consecutive duties,
- violating next-day-off policy,
- exceeding normal shift limits,
- assigning someone who marked the day as avoid,
- creating an unfair assignment.

The system must make relevant violations visible, but must not prevent saving or publishing solely because of those violations.

---

## 7. Manual Assignments Must Affect Fairness

Given a manually created assignment, once that allocation becomes part of the published schedule it must contribute to fairness exactly as an automatically created assignment would.

Manual editing must not provide a way to bypass or reset fairness accounting.

---

## 8. Fairness Ownership Is Fixed at Publication

Given a draft schedule where a duty is reassigned from one person to another before publication, the new assignee must become the fairness owner.

Given the same reassignment after publication as a voluntary shift transfer, the original assignee must remain the fairness owner.

The person who eventually performs the shift may differ from the fairness owner.

---

## 9. Voluntary Shift Trades Must Not Rewrite Fairness History

Given a published duty originally allocated to Ali and later voluntarily performed by Ayşe, the fairness history must continue to count the allocation for Ali.

Ayşe performing the shift must not cause Ali to become artificially under-allocated for that duty type.

---

## 10. A New Person Must Not Inherit Historical Fairness Debt

Given a person who joins the scheduling group partway through the rolling period, the person must begin accumulating expected share only from the time they become eligible.

The engine must not treat them as if they should have received assignments before they joined.

---

## 11. A Person Who Leaves Must Stop Accumulating Expected Share

Given a person who leaves the scheduling group, they must stop receiving expected fairness share after their eligibility ends.

Their previous assignments and expected shares must remain available in historical reporting.

---

## 12. Capacity Must Affect Expected Share

Given people with different configured participation capacities, expected allocation must be proportional to those capacities.

A person configured at half the scheduling capacity of a full-time participant should accumulate approximately half the expected share of the full-time participant when both are otherwise equally eligible.

---

## 13. Rolling Fairness Must Not Reset at Calendar-Year Boundaries

Given fairness history from December and a new schedule generated in January, December's relevant history must still affect January scheduling.

January 1 must not reset fairness balances.

History should leave the fairness calculation only because it becomes older than the configured rolling horizon.

---

## 14. Old Fairness Must Naturally Expire

Given an unfair assignment that occurred outside the configured rolling fairness window, it must no longer influence the primary fairness calculation.

The original assignment must still remain available in historical and lifetime reporting.

The system must therefore remember historical facts without carrying fairness debt forever.

---

## 15. Recent Fairness Must Follow the Moving Window

Given an assignment near the boundary of the rolling window, the assignment must contribute while it is inside the window and stop contributing once it moves outside the window.

Moving the current date by one day must move the fairness window by one day rather than causing any global reset.

---

## 16. Preferences Must Not Rewrite Fairness

Given a person who repeatedly requests or prefers a particular desirable duty type and receives those assignments, every received assignment must still count fully toward their fairness balance.

A person must not remain entitled to more of a duty type merely because previous assignments were requested.

---

## 17. Preferences Should Break Close Fairness Decisions

Given two feasible candidates whose fairness positions for the relevant duty type are sufficiently close, the engine should prefer the candidate with the stronger positive preference.

Given one candidate who is substantially more behind in fairness, a preference from another already-overallocated candidate should not normally override the fairness correction.

---

## 18. Avoid Preferences Must Influence but Not Prohibit Automatic Scheduling

Given a person who marks a duty as avoid, automatic scheduling should prefer similarly fair alternatives when they exist.

If no reasonable alternative exists, the person may still be assigned.

The assignment must remain valid and the avoid preference must remain visible in the explanation or warnings.

---

## 19. Long Holidays Must Be Recognized as Blocks

Given several consecutive holiday days, the engine must recognize them as one holiday block rather than treating the days only as unrelated individual holiday duties.

The engine must be able to determine both:

- how many holiday duties each person received,
- how many distinct holiday blocks each person had interrupted.

---

## 20. Holiday Shift Fairness and Holiday Block Fairness Must Remain Independent

Given two people with the same number of holiday shifts, where one person's shifts occurred within one holiday block and the other's occurred across several different holiday blocks, the engine must preserve this distinction.

They must not be considered identical from the holiday-block fairness perspective.

---

## 21. Automatic Scheduling Should Avoid Repeatedly Disrupting the Same People's Long Holidays

Given several feasible ways to cover a long holiday and historical data showing that some people have already been exposed to more recent holiday blocks than others, automatic scheduling should favor people with lower recent block exposure when other important constraints are comparable.

---

## 22. Long-Holiday Coverage May Be Concentrated When Appropriate

Given a long holiday where the entire block can feasibly be covered by a smaller group, the engine must be capable of using that smaller group rather than automatically distributing one duty to every available person.

Future holiday blocks must then use the historical block exposure to avoid repeatedly concentrating the burden on the same people.

---

## 23. Rare Annual Events Must Not Be Forgotten Solely Because of the 12-Month Boundary

Given a rare recurring event such as New Year's duty or a major holiday block, the engine must be able to consider recent occurrences even when the previous occurrence falls just outside the normal rolling-time window.

Recent comparable occurrences must remain usable for fairness decisions according to the configured occurrence-history policy.

---

## 24. Automatic Scheduling Must Respect Configured Constraints

Given automatic scheduling with operational constraints enabled, generated assignments must satisfy those constraints whenever a feasible schedule exists.

Examples include:

- required staffing,
- qualifications,
- explicit unavailability,
- rest rules,
- next-day-off rules.

If no valid schedule exists, the engine must report the conflict rather than silently violate a configured hard constraint.

---

## 25. Manual Scheduling Must Be Able to Override the Same Constraints

Given a constraint that automatic scheduling respects, an administrator must still be able to create a manual assignment violating that constraint.

The violation must be clearly identifiable afterward.

This verifies the distinction between optimizer constraints and human authority.

---

## 26. Automatic Scheduling Must Not Fail Because It Processes an Easy Duty Too Early

Given a month containing both highly constrained duties and flexible duties, the automatic scheduler should prioritize the more constrained assignments sufficiently to find a feasible solution when one exists.

The engine should not produce an avoidable dead end simply because it assigned flexible duties first.

---

## 27. Reoptimization Must Preserve Unaffected Assignments

Given an already generated schedule where one person becomes unavailable for one duty, reoptimization should change the minimum practical set of assignments necessary to restore a valid schedule.

Assignments unrelated to the affected area should remain unchanged when there is no fairness or feasibility reason to modify them.

---

## 28. Reoptimization Must Still Preserve Fairness History

Given an existing published fairness history and a current schedule being repaired, the optimizer must use the same rolling fairness state as a fresh generation would.

Repairing a schedule must not reset or ignore previous fairness balances.

---

## 29. Identical Inputs Must Produce Identical Automatic Results

Given the same:

- people,
- calendar,
- holidays,
- historical assignments,
- capacities,
- constraints,
- preferences,
- existing schedule,
- algorithm version,

the engine must produce the same automatic schedule each time.

Equivalent candidates must be resolved using deterministic tie-breaking rather than uncontrolled randomness.

---

## 30. Every Automatic Assignment Must Be Explainable

Given an automatically assigned duty, the system must be able to explain the decision in terms understandable from the input data.

The explanation should identify relevant facts such as:

- duty type,
- candidate feasibility,
- relevant rolling fairness balances,
- holiday-block history when applicable,
- preferences,
- tie-breaking factors.

An explanation that only exposes an internal numeric score is not sufficient.

---

## 31. Manual Unfairness Must Be Visually Detectable

Given a manual assignment that materially worsens an existing fairness imbalance, the engine must expose the fairness effect.

A verifier should be able to observe the relevant fairness balance before and after the change and confirm that the imbalance increased.

The assignment must still remain valid.

---

## 32. Historical Data Must Remain Recomputable

Given stored historical assignments and eligibility periods, deleting or rebuilding derived rolling fairness projections must not lose fairness information.

The system must be capable of recomputing the same fairness balances from the underlying historical facts.

Derived fairness statistics must therefore not be the only copy of fairness history.

---

## 33. Changing the Rolling Window Must Change the Projection, Not the Historical Facts

Given the same assignment history, calculating fairness over 90 days and over 365 days may produce different balances.

Changing the fairness horizon must not alter, duplicate, or delete historical assignments.

It should only change which historical events participate in the derived fairness projection.

---

## 34. The Engine Must Preserve Fairness Across Schedule Versions

Given a schedule that is edited and republished, the system must not accidentally count both obsolete and replacement draft assignments as separate fairness allocations.

Only the correct published allocation history must contribute according to the publication and reassignment rules.

---

## 35. Fairness Must Continue Working When Perfect Balance Is Impossible

Given a scheduling population, constraints, preferences, or holiday structure where mathematically equal allocation is impossible, the engine must still produce the best feasible schedule and preserve the remaining imbalance.

It must not require fairness balances to reach zero.

The unresolved imbalance must remain available for compensation in future scheduling periods.

---

## 36. Future Schedules Must Naturally Compensate Historical Imbalance

Given a person who finishes one period materially under-allocated for a particular fairness type, and later periods contain feasible assignments of that same type, automatic scheduling should progressively favor that person until the imbalance is reduced.

The compensation should happen through ordinary future scheduling rather than through an explicit reset or artificial adjustment.