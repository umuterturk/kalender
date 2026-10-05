/**
 * Tests for the core engine invariants (section 31 of the design).
 *
 * 1.  Manual assignments are never rejected solely because of fairness.
 * 2.  Published allocations remain in fairness history.
 * 3.  Voluntary post-publish substitutions do not change fairness ownership.
 * 4.  NN/NH/HN/HH remain separate fairness dimensions.
 * 5.  Expected fairness share begins only when a person becomes eligible.
 * 6.  New employees do not inherit artificial historical debt.
 * 7.  No January 1 fairness reset exists.
 * 8.  Rolling 12-month fairness is the default optimizer horizon.
 * 9.  Lifetime history does not normally drive automatic scheduling.
 * 10. Long holiday block exposure is tracked separately from individual holiday shift counts.
 * 11. Preferences never erase fairness history.
 * 12. Automatic reoptimization should minimize disruption to existing schedules.
 * 13. Generated results are deterministic for identical inputs.
 * 14. Every automatic assignment is explainable from observable inputs.
 */

import { describe, it, expect } from 'vitest'
import type { Person, Roster, Assignment, ActualShift, CalendarDateOverride } from '../types'
import { computeFairness, classifyDay } from '../fairness'
import { generatePlan } from '../generate'
import { validateRevision } from '../validate'
import type { PlanRevision } from '../types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BASE_ROSTER: Roster = {
  id: 'r1',
  name: 'Test',
  timezone: 'UTC',
  defaultWorkingWeekdays: [1, 2, 3, 4, 5],
  historyStartDate: '2025-01-01',
  weekendHolidayDefault: true,
  restPolicies: [],
  fairnessTolerance: 0.25,
  rareEventOccurrences: 3,
}

function makePerson(id: string, name: string, joinDate = '2025-01-01', capacity = 1): Person {
  return {
    id,
    name,
    capacity,
    memberships: [{ activeFrom: joinDate, inactiveFrom: null }],
    workCalendarOverrides: [],
    monthlyConditions: {},
  }
}

function makeRevision(
  month: string,
  assignments: Assignment[],
  status: PlanRevision['status'] = 'draft',
): PlanRevision {
  return {
    id: `rev-${month}`,
    month,
    status,
    baselineRevisionId: null,
    assignments,
    calendarOverrideSnapshot: [],
    restPolicySnapshot: '',
    tiebreakerSeed: 'test',
    optimizationMode: 'manual',
    outcomeStatus: 'manual',
    createdAt: '2026-01-01T00:00:00Z',
    actor: 'planner',
  }
}

function makeAssignment(date: string, personId: string, source: 'auto' | 'manual' = 'auto'): Assignment {
  return {
    date,
    allocatedTo: personId,
    performedBy: personId,
    locked: false,
    source,
  }
}

// ─── Invariant 4: Separate NN/NH/HN/HH buckets ───────────────────────────────

describe('Invariant 4: Separate NN/NH/HN/HH fairness dimensions', () => {
  it('classifies NN correctly — normal day followed by normal day', () => {
    // Monday in July (not a holiday weekend, no overrides)
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: false }
    const type = classifyDay('2026-07-06', roster, []) // Monday
    expect(type).toBe('NN')
  })

  it('classifies NH correctly — normal day followed by holiday', () => {
    // Friday before a weekend holiday
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: true }
    const type = classifyDay('2026-07-10', roster, []) // Friday; Saturday is a weekend holiday
    expect(type).toBe('NH')
  })

  it('classifies HN correctly — holiday followed by normal day', () => {
    // Sunday (holiday) followed by Monday (normal)
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: true }
    const type = classifyDay('2026-07-12', roster, []) // Sunday
    expect(type).toBe('HN')
  })

  it('classifies HH correctly — holiday followed by holiday', () => {
    // Saturday (holiday) followed by Sunday (holiday)
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: true }
    const type = classifyDay('2026-07-11', roster, []) // Saturday
    expect(type).toBe('HH')
  })

  it('buckets accumulate independently: HN assignment does not affect NN balance', () => {
    const people = [makePerson('p1', 'Ali'), makePerson('p2', 'Ayşe')]
    // Single holiday shift for Ali
    const overrides: CalendarDateOverride[] = [
      { date: '2026-01-05', holiday: true }, // Monday = HN
    ]
    const assignments = [makeAssignment('2026-01-05', 'p1')]
    const revision = makeRevision('2026-01', assignments, 'published')
    const report = computeFairness('2026-01', people, BASE_ROSTER, overrides, [], revision, [], '2025-01-01')
    const p1 = report.projections['365d'].find(p => p.personId === 'p1')!

    // NN balance should be separate and reflect no NN assignment (p1 got 0 NN actuals)
    // NN is normal→normal. The holiday shift on 2026-01-05 is HN not NN.
    expect(p1.HN.actual).toBe(1)
    expect(p1.NN.actual).toBe(0) // separate dimension, not contaminated by the HN
    expect(p1.NH.actual).toBe(0)
    expect(p1.HH.actual).toBe(0)
  })
})

// ─── Invariant 5/6: New employees start from join date ────────────────────────

describe('Invariant 5+6: Expected share begins at join date, no historical debt', () => {
  it('new joiner accrues no expected share before their join date', () => {
    const newJoiner = makePerson('p2', 'Ece', '2026-06-01')
    const senior = makePerson('p1', 'Ali', '2025-01-01')
    const people = [senior, newJoiner]

    // Single normal weekday before Ece joined
    const overrides: CalendarDateOverride[] = []
    // Make 2026-03-02 a normal weekday (Mon)
    const assignments = [makeAssignment('2026-03-02', 'p1')]
    const revision = makeRevision('2026-03', assignments, 'published')
    const report = computeFairness('2026-03', people, { ...BASE_ROSTER, weekendHolidayDefault: false }, overrides, [], revision, [], '2025-01-01')

    const p2 = report.projections['365d'].find(p => p.personId === 'p2')!
    // Ece was not a member in March 2026, so she should have 0 expected share for March
    expect(p2.NN.expected).toBe(0)
    expect(p2.NN.actual).toBe(0)
    expect(p2.NN.balance).toBe(0)
  })

  it('new joiner balance is driven only by post-join history (no pre-join debt)', () => {
    // Ali works every month for a year; Ece joins in Sept 2026.
    // Ece's lifetime expected should equal only what accrued from Sept onward —
    // not a large negative debt from the year Ali was working alone.
    const senior = makePerson('p1', 'Ali', '2025-01-01')
    const newJoiner = makePerson('p2', 'Ece', '2026-09-01')
    const people = [senior, newJoiner]
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: false }

    const report = computeFairness('2026-10', people, roster, [], [], null, [], '2025-01-01')
    const p1Life = report.projections['lifetime'].find(p => p.personId === 'p1')!
    const p2Life = report.projections['lifetime'].find(p => p.personId === 'p2')!

    // Ali has been eligible for much longer, so his lifetime expected >> Ece's
    const p1TotalExpected = p1Life.NN.expected + p1Life.NH.expected + p1Life.HN.expected + p1Life.HH.expected
    const p2TotalExpected = p2Life.NN.expected + p2Life.NH.expected + p2Life.HN.expected + p2Life.HH.expected

    // Ece joined ~2 months before plan boundary; Ali was eligible for ~2 years.
    // Ece's expected share should be far less than Ali's (no artificial inflation).
    expect(p2TotalExpected).toBeLessThan(p1TotalExpected * 0.2)
    // Ece has no actuals, so her lifetime actual should be 0
    const p2TotalActual = p2Life.NN.actual + p2Life.NH.actual + p2Life.HN.actual + p2Life.HH.actual
    expect(p2TotalActual).toBe(0)
  })
})

// ─── Invariant 7: No annual reset ────────────────────────────────────────────

describe('Invariant 7: No annual reset', () => {
  it('fairness accumulated in year 1 is visible in year 2 (lifetime window)', () => {
    const people = [makePerson('p1', 'Ali'), makePerson('p2', 'Ayşe')]
    // Ali gets a shift in 2025, Ayşe gets none
    const overrides: CalendarDateOverride[] = [
      { date: '2025-06-02', holiday: false }
    ]
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: false }
    const assignments2025 = [makeAssignment('2025-06-02', 'p1')]
    const rev2025 = makeRevision('2025-06', assignments2025, 'published')

    // Compute fairness for a month in 2026 (so 2025 falls in lifetime but possibly outside 365d)
    const report = computeFairness(
      '2026-10',
      people,
      roster,
      overrides,
      [],
      null,
      [],
      '2025-01-01',
      [...assignments2025],
    )

    // Ali's lifetime NN actual should include the 2025 shift
    const p1Life = report.projections['lifetime'].find(p => p.personId === 'p1')!
    expect(p1Life.NN.actual).toBeGreaterThanOrEqual(1)
  })
})

// ─── Invariant 3: Post-publish substitution preserves fairness owner ─────────

describe('Invariant 3: Post-publish substitution keeps fairness owner', () => {
  it('when actualPersonId differs from plannedPersonId, credit goes to plannedPersonId', () => {
    const people = [makePerson('p1', 'Ali'), makePerson('p2', 'Ayşe')]
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: false }
    // Ali was allocated the shift (plannedPersonId), Ayşe performed it (actualPersonId)
    const actuals: ActualShift[] = [{
      id: 'a1',
      date: '2026-10-05',
      plannedPersonId: 'p1',
      actualPersonId: 'p2',
      status: 'substituted',
      recordedAsHoliday: false,
    }]
    const report = computeFairness('2026-10', people, roster, [], actuals, null, [], '2025-01-01')
    const p1 = report.projections['365d'].find(p => p.personId === 'p1')!
    const p2 = report.projections['365d'].find(p => p.personId === 'p2')!
    // Ali (planned) gets the actual credit
    expect(p1.NN.actual).toBe(1)
    // Ayşe (performer) does NOT get fairness credit
    expect(p2.NN.actual).toBe(0)
  })
})

// ─── Invariant 11: Preferences do not erase fairness history ─────────────────

describe('Invariant 11: Preferences do not change the fairness ledger', () => {
  it('assigning a person who has AVOID preference still accrues actual credit', () => {
    const people = [
      { ...makePerson('p1', 'Ali'), datePreferences: { '2026-10-05': 'AVOID' as const } },
      makePerson('p2', 'Ayşe'),
    ]
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: false }
    const assignments = [makeAssignment('2026-10-05', 'p1', 'manual')]
    const revision = makeRevision('2026-10', assignments)
    const report = computeFairness('2026-10', people, roster, [], [], revision, [], '2025-01-01')
    const p1 = report.projections['365d'].find(p => p.personId === 'p1')!
    // Ali's fairness history records the shift regardless of his AVOID preference
    expect(p1.NN.actual).toBe(1)
  })
})

// ─── Invariant 1: Manual assignments not rejected ─────────────────────────────

describe('Invariant 1: Manual assignments produce warnings but are not rejected', () => {
  it('a manual assignment violating rest rules produces a warning, not a hard error', () => {
    const people = [makePerson('p1', 'Ali'), makePerson('p2', 'Ayşe')]
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: false }
    // Give Ali consecutive shifts Mon and Tue
    const assignments = [
      makeAssignment('2026-10-05', 'p1', 'manual'),
      makeAssignment('2026-10-06', 'p1', 'manual'),
    ]
    const revision = makeRevision('2026-10', assignments)
    const result = validateRevision(revision, people, roster, [], [], [])
    // Should be publishable (no hard errors)
    expect(result.publishable).toBe(true)
    expect(result.hardErrors).toHaveLength(0)
    // Should have a CONSECUTIVE_SHIFT warning
    const consecutive = result.warnings.find(w => w.type === 'CONSECUTIVE_SHIFT')
    expect(consecutive).toBeDefined()
  })

  it('assignment during vacation produces a warning but is publishable', () => {
    const person = makePerson('p1', 'Ali')
    const personWithVacation: Person = {
      ...person,
      monthlyConditions: {
        '2026-10': {
          unavailableRanges: [{ from: '2026-10-05', to: '2026-10-05' }],
          preferredDates: [],
          avoidedDates: [],
          requiredMin: 0,
          max: null,
        }
      }
    }
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: false }
    const assignments = [makeAssignment('2026-10-05', 'p1', 'manual')]
    const revision = makeRevision('2026-10', assignments)
    const result = validateRevision(revision, [personWithVacation], roster, [], [], [])
    expect(result.publishable).toBe(true)
    expect(result.hardErrors).toHaveLength(0)
    const unavailableWarn = result.warnings.find(w => w.type === 'UNAVAILABLE')
    expect(unavailableWarn).toBeDefined()
  })
})

// ─── Invariant 13: Deterministic generation ───────────────────────────────────

describe('Invariant 13: Deterministic generation', () => {
  it('same inputs produce the same schedule', () => {
    const people = [
      makePerson('p1', 'Ali'),
      makePerson('p2', 'Ayşe'),
      makePerson('p3', 'Can'),
    ]
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: false }

    const runGenerate = () => generatePlan(
      '2026-10', people, roster, [], [], [], [], 'seed-abc', [],
    )

    const result1 = runGenerate()
    const result2 = runGenerate()

    const sig1 = result1.assignments.map(a => `${a.date}:${a.allocatedTo}`).sort().join('|')
    const sig2 = result2.assignments.map(a => `${a.date}:${a.allocatedTo}`).sort().join('|')
    expect(sig1).toBe(sig2)
  })
})

// ─── Invariant 14: Auto assignments are explainable ──────────────────────────

describe('Invariant 14: Every automatic assignment has an explanation', () => {
  it('auto-generated assignments carry an explanation object', () => {
    const people = [makePerson('p1', 'Ali'), makePerson('p2', 'Ayşe')]
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: false }
    const result = generatePlan('2026-10', people, roster, [], [], [], [], 'seed', [])
    const autoAssignments = result.assignments.filter(a => a.source === 'auto')
    expect(autoAssignments.length).toBeGreaterThan(0)
    for (const a of autoAssignments) {
      expect(a.explanation).toBeDefined()
      expect(a.explanation!.bucket).toBeDefined()
      expect(typeof a.explanation!.winnerBalance).toBe('number')
    }
  })
})

// ─── Invariant 5: Capacity-weighted expected share ────────────────────────────

describe('Capacity-weighted expected share', () => {
  it('part-time employee (capacity 0.5) accrues proportionally less expected share', () => {
    const fullTime = makePerson('p1', 'Ali', '2025-01-01', 1)
    const partTime = makePerson('p2', 'Ayşe', '2025-01-01', 0.5)
    const people = [fullTime, partTime]
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: false }

    // One normal shift on a weekday
    const assignments = [makeAssignment('2026-10-05', 'p1')]
    const revision = makeRevision('2026-10', assignments)
    const report = computeFairness('2026-10', people, roster, [], [], revision, [], '2025-01-01')

    // Total capacity = 1.5; full-time share = 1/1.5 ≈ 0.667, part-time = 0.5/1.5 ≈ 0.333
    const p1 = report.projections['365d'].find(p => p.personId === 'p1')!
    const p2 = report.projections['365d'].find(p => p.personId === 'p2')!

    // p1's expected share should be approximately twice p2's (capacity ratio 1:0.5)
    expect(p1.NN.expected).toBeCloseTo(p2.NN.expected * 2, 2)

    // p1 got 1 actual shift; p2 got 0
    expect(p1.NN.actual).toBe(1)
    expect(p2.NN.actual).toBe(0)

    // The key invariant: p1's expected is twice p2's expected (capacity ratio 1:0.5)
    // Because p1 has higher capacity, p1's balance is more negative when neither works,
    // but the RATIO of expected shares is correct.
    expect(p1.NN.expected / p2.NN.expected).toBeCloseTo(2, 1)
  })
})

// ─── Invariant 5: Vacation removes expected share ─────────────────────────────

describe('Vacation vs rest eligibility', () => {
  it('person on vacation does not accrue expected share for that day', () => {
    const personWithVacation: Person = {
      ...makePerson('p1', 'Ali'),
      monthlyConditions: {
        '2026-10': {
          unavailableRanges: [{ from: '2026-10-05', to: '2026-10-05' }],
          preferredDates: [],
          avoidedDates: [],
          requiredMin: 0,
          max: null,
        }
      }
    }
    const person2 = makePerson('p2', 'Ayşe')
    const people = [personWithVacation, person2]
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: false }

    // Ayşe works the day Ali is on vacation
    const assignments = [makeAssignment('2026-10-05', 'p2')]
    const revision = makeRevision('2026-10', assignments)
    const report = computeFairness('2026-10', people, roster, [], [], revision, [], '2025-01-01')

    const p1 = report.projections['365d'].find(p => p.personId === 'p1')!
    const p2 = report.projections['365d'].find(p => p.personId === 'p2')!

    // Key invariant: when Ali is on vacation (not just rest), his expected share
    // for THAT DAY drops to 0 (Ayşe gets the full share that day).
    // Over the whole window Ali still has expected share for other days, but
    // p2's expected should be strictly greater than p1's for the NN bucket
    // because p1 was absent on one NN day.
    expect(p2.NN.expected).toBeGreaterThan(p1.NN.expected)
    // Ayşe worked Oct 5 and has an actual
    expect(p2.NN.actual).toBeGreaterThanOrEqual(1)
    // Ali didn't work (he was on vacation, Ayşe filled the day)
    expect(p1.NN.actual).toBe(0)
  })

  it('person on rest still accrues expected share (rest is a scheduling constraint, not eligibility)', () => {
    // The fairness model grants expected share even on rest days because rest
    // is caused by previous assignments, not by structural ineligibility.
    const people = [makePerson('p1', 'Ali'), makePerson('p2', 'Ayşe')]
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: false }

    // No vacation for p1; p2 works Oct 5
    const assignments = [makeAssignment('2026-10-05', 'p2')]
    const revision = makeRevision('2026-10', assignments)
    const report = computeFairness('2026-10', people, roster, [], [], revision, [], '2025-01-01')

    const p1 = report.projections['365d'].find(p => p.personId === 'p1')!
    // Ali is eligible (no vacation), so he should have an expected share for Oct 5
    expect(p1.NN.expected).toBeGreaterThan(0)
  })
})

// ─── Invariant 10: Holiday block exposure separate from individual shifts ──────

describe('Invariant 10: Holiday block exposure is tracked separately', () => {
  it('tracks blocks touched vs shifts in blocks as distinct metrics', () => {
    const people = [makePerson('p1', 'Ali'), makePerson('p2', 'Ayşe')]
    // 4-day holiday block: Thu–Sun
    const overrides: CalendarDateOverride[] = [
      { date: '2026-10-01', holiday: true, label: 'Eid' },
      { date: '2026-10-02', holiday: true, label: 'Eid' },
      { date: '2026-10-03', holiday: true, label: 'Eid' },
      { date: '2026-10-04', holiday: true, label: 'Eid' },
    ]
    // Ali works 3 shifts inside the block, Ayşe works 1
    const assignments = [
      makeAssignment('2026-10-01', 'p1'),
      makeAssignment('2026-10-02', 'p1'),
      makeAssignment('2026-10-03', 'p1'),
      makeAssignment('2026-10-04', 'p2'),
    ]
    const revision = makeRevision('2026-10', assignments)
    const roster = { ...BASE_ROSTER, weekendHolidayDefault: false }
    const report = computeFairness('2026-10', people, roster, overrides, [], revision, [], '2025-01-01')

    const p1 = report.projections['365d'].find(p => p.personId === 'p1')!
    const p2 = report.projections['365d'].find(p => p.personId === 'p2')!

    // Both touched 1 block, but Ali has more shifts in blocks
    expect(p1.holidayBlocksTouched).toBe(1)
    expect(p2.holidayBlocksTouched).toBe(1)
    expect(p1.holidayShifts).toBe(3)
    expect(p2.holidayShifts).toBe(1)
  })
})

// ─── Invariant 8: 365-day window is the default optimizer horizon ──────────────

describe('Invariant 8: Rolling 365-day window', () => {
  it('reports a 365d window and a separate lifetime window', () => {
    const people = [makePerson('p1', 'Ali')]
    const report = computeFairness('2026-10', people, BASE_ROSTER, [], [], null, [], '2025-01-01')
    expect(report.projections['365d']).toBeDefined()
    expect(report.projections['lifetime']).toBeDefined()
    expect(report.projections['30d']).toBeDefined()
    expect(report.projections['90d']).toBeDefined()
  })
})
