import { describe, it, expect } from 'vitest'
import { validateRevision } from '../validate'
import { generatePlan } from '../generate'
import type { Person, Roster, PlanRevision } from '../types'

const roster: Roster = {
  id: 'r1',
  name: 'Test',
  country: 'TR',
  defaultWorkingWeekdays: [1, 2, 3, 4, 5],
  historyStartDate: '2026-10-05',
  weekendHolidayDefault: true,
  restPolicies: [],
}

const people: Person[] = [{
  id: 'p1',
  name: 'Ada',
  memberships: [{ activeFrom: '2026-10-05', inactiveFrom: null }],
  workCalendarOverrides: [],
  monthlyConditions: {},
}]

function emptyDraft(): PlanRevision {
  return {
    id: 'd1',
    month: '2026-10',
    status: 'draft',
    baselineRevisionId: null,
    assignments: [],
    calendarOverrideSnapshot: [],
    restPolicySnapshot: '',
    tiebreakerSeed: 'seed',
    optimizationMode: 'initial',
    outcomeStatus: 'feasible-best-found',
    createdAt: '2026-10-05T00:00:00Z',
    actor: 'planner',
  }
}

describe('history start is the first required plan day', () => {
  it('does not warn about missing coverage before history start', () => {
    const result = validateRevision(emptyDraft(), people, roster, [], [])
    expect(result.publishable).toBe(true)
    expect(result.warnings.some(w => w.type === 'NO_COVERAGE' && w.date < '2026-10-05')).toBe(false)
    expect(result.warnings.some(w => w.type === 'NO_COVERAGE' && w.date === '2026-10-05')).toBe(true)
  })

  it('does not auto-fill or warn on days before history start', () => {
    const result = generatePlan('2026-10', people, roster, [], [], [], [], 'seed')
    expect(result.assignments.every(a => a.date >= '2026-10-05')).toBe(true)
    expect(result.warnings.some(w => w.date < '2026-10-05')).toBe(false)
  })

  it('allows a manual set before history start without blocking publish', () => {
    const draft = emptyDraft()
    draft.assignments = [{
      date: '2026-10-02',
      allocatedTo: 'p1',
      performedBy: 'p1',
      locked: true,
      source: 'manual',
    }]
    const result = validateRevision(draft, people, roster, [], [])
    expect(result.valid).toBe(true)
    expect(result.publishable).toBe(true)
    expect(result.hardErrors).toHaveLength(0)
  })
})
