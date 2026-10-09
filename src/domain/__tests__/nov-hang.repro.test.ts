/**
 * Repro: November generate after published October with rest carry-in.
 * Also checks that resolveMonth converges (no oscillating forever).
 */
import { describe, it, expect } from 'vitest'
import { generatePlan } from '../generate'
import { resolveMonth } from '../repair'
import { previousMonthRestLeaves, deriveAssignmentLeaves, mergeLeaves, deriveActualLeaves } from '../leave'
import { validateRevision } from '../validate'
import { computeFairness } from '../fairness'
import type { Person, PlanRevision, Roster, CalendarDateOverride, Assignment } from '../types'

const roster: Roster = {
  id: 'r',
  name: 'My Roster',
  timezone: 'Europe/Istanbul',
  defaultWorkingWeekdays: [1, 2, 3, 4, 5],
  historyStartDate: '2026-10-01',
  weekendHolidayDefault: true,
  restPolicies: [{
    id: 'rp',
    effectiveFrom: '2026-10-01',
    enabled: true,
    nonworkingTreatment: 'calendar-only',
  }],
  staffingPolicies: [],
}

function person(
  id: string,
  name: string,
  activeFrom: string,
  novUnavailable: boolean,
): Person {
  return {
    id,
    name,
    memberships: [{ activeFrom, inactiveFrom: null }],
    workCalendarOverrides: [],
    monthlyConditions: {
      '2026-11': {
        unavailableRanges: novUnavailable
          ? [{ from: '2026-11-27', to: '2026-11-27' }]
          : [],
        preferredDates: [],
        avoidedDates: [],
        requiredMin: 0,
        max: null,
      },
    },
    capacity: 1,
  }
}

const people: Person[] = [
  person('umut', 'umut', '2026-10-01', true),
  person('emre', 'emre', '2026-09-03', true),
  person('sahin', 'sahin', '2026-10-03', true),
  person('huseyin', 'huseyin', '2026-10-03', true),
  person('fatma', 'fatma', '2026-10-03', true),
  person('ali', 'ali', '2026-10-03', true),
  person('bulent', 'bulent', '2026-10-03', false),
  person('bora', 'bora', '2026-10-01', false),
  person('hayat', 'hayat', '2026-10-01', true),
]

const overrides: CalendarDateOverride[] = [
  { date: '2026-10-30', holiday: true },
  { date: '2026-10-08', holiday: true },
  { date: '2026-10-09', holiday: true },
]

function octAssignments(): Assignment[] {
  const out: Assignment[] = []
  for (let d = 1; d <= 31; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`
    const p = d === 31 ? 'huseyin' : people[d % people.length].id
    out.push({
      date,
      allocatedTo: p,
      performedBy: p,
      locked: false,
      source: 'auto',
    })
  }
  return out
}

function sig(assignments: Assignment[]): string {
  return assignments
    .map(a => `${a.date}:${a.allocatedTo ?? a.personId}`)
    .sort()
    .join('|')
}

describe('November hang repro', () => {
  it('does not hang when a long holiday block spans into the month (Oct 30–Nov 1)', () => {
    // Oct 30 (override) + Oct 31 (Sat) + Nov 1 (Sun) = 3-day block crossing month boundary.
    // The old category-scan loop reset the cursor whenever cur < monthStart → infinite loop.
    const t0 = performance.now()
    const result = generatePlan(
      '2026-11', people, roster, overrides, [], [], [], 'seed', [],
    )
    expect(performance.now() - t0).toBeLessThan(5_000)
    expect(result.assignments.some(a => a.date === '2026-11-01')).toBe(true)
  })

  it('generatePlan for 2026-11 finishes quickly', () => {
    const oct: PlanRevision = {
      id: 'oct',
      month: '2026-10',
      status: 'published',
      baselineRevisionId: null,
      assignments: octAssignments(),
      calendarOverrideSnapshot: overrides,
      restPolicySnapshot: 'rp',
      tiebreakerSeed: 's',
      optimizationMode: 'initial',
      outcomeStatus: 'feasible-best-found',
      createdAt: '',
      actor: 'planner',
    }
    const boundary = previousMonthRestLeaves([oct], '2026-11', roster, people)
    const t0 = performance.now()
    const result = generatePlan(
      '2026-11', people, roster, overrides, [], [], boundary, 'seed', oct.assignments,
    )
    const ms = performance.now() - t0
    expect(ms).toBeLessThan(15_000)
    expect(result.assignments.length).toBeGreaterThan(20)
  })

  it('auto-resolve chain converges (no infinite unique signatures)', () => {
    const oct: PlanRevision = {
      id: 'oct',
      month: '2026-10',
      status: 'published',
      baselineRevisionId: null,
      assignments: octAssignments(),
      calendarOverrideSnapshot: overrides,
      restPolicySnapshot: 'rp',
      tiebreakerSeed: 's',
      optimizationMode: 'initial',
      outcomeStatus: 'feasible-best-found',
      createdAt: '',
      actor: 'planner',
    }
    const boundary = previousMonthRestLeaves([oct], '2026-11', roster, people)
    const generated = generatePlan(
      '2026-11', people, roster, overrides, [], [], boundary, 'seed', oct.assignments,
    )

    let cur: PlanRevision = {
      id: 'nov',
      month: '2026-11',
      status: 'draft',
      baselineRevisionId: null,
      assignments: generated.assignments,
      calendarOverrideSnapshot: [],
      restPolicySnapshot: 'rp',
      tiebreakerSeed: 'seed',
      optimizationMode: 'initial',
      outcomeStatus: generated.outcomeStatus,
      createdAt: '',
      actor: 'planner',
    }

    const seen = new Set<string>()
    let loops = 0
    for (; loops < 30; loops++) {
      const draftLeaves = mergeLeaves(
        deriveActualLeaves([], roster, people),
        [...boundary, ...deriveAssignmentLeaves(cur.assignments, roster, people)],
      )
      const fairness = computeFairness(
        '2026-11', people, roster, overrides, [], cur, draftLeaves, roster.historyStartDate, oct.assignments,
      )
      const validation = validateRevision(cur, people, roster, draftLeaves, overrides, [], fairness)
      const fixable = validation.warnings.some(w =>
        w.type === 'UNAVAILABLE' || w.type === 'NEXT_DAY_OFF'
      ) || validation.hardErrors.some(e => e.kind === 'not-member')
      if (!fixable) break

      const result = resolveMonth(cur, people, roster, overrides, [], boundary, oct.assignments)
      const before = sig(cur.assignments)
      const after = sig(result.assignments)
      if (before === after || seen.has(after)) break
      seen.add(before)
      seen.add(after)
      cur = { ...cur, assignments: result.assignments, optimizationMode: 'repair' }
    }

    expect(loops).toBeLessThan(20)
  })
})
