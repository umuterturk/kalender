/**
 * High-level acceptance tests for the core scheduling engine.
 * Each section follows core-test-design.md in plain language.
 */

import { describe, expect, it } from 'vitest'
import type {
  ActualShift, Assignment, CalendarDateOverride, DutyRequirements, Person, PreferenceType, Roster,
} from '../types'
import { monthDates } from '../calendar'
import { classifyDay, computeFairness, type FairnessReport } from '../fairness'
import { toggleShiftAssignment } from '../assign'
import { fillDay, generatePlan, type GenerateResult } from '../generate'
import { shouldOfferAutomaticRepair, updateRestPolicy, updateStaffingPolicy } from '../policies'
import { repairPlan } from '../repair'
import { assessAssignment, validateRevision } from '../validate'

// ─── Words the tests use ────────────────────────────────────────────────────

const NORMAL_WEEK: Partial<Roster> = { weekendHolidayDefault: false }

function roster(overrides: Partial<Roster> = {}): Roster {
  return {
    id: 'roster',
    name: 'Ward',
    timezone: 'UTC',
    defaultWorkingWeekdays: [1, 2, 3, 4, 5],
    historyStartDate: '2024-01-01',
    weekendHolidayDefault: false,
    restPolicies: [],
    staffingPolicies: [],
    fairnessTolerance: 0.25,
    rareEventOccurrences: 3,
    ...overrides,
  }
}

function withStaffing(headcount: number, base: Roster = roster()): Roster {
  return roster({
    ...base,
    staffingPolicies: [{
      id: 'staff',
      effectiveFrom: '2020-01-01',
      requiredHeadcount: headcount,
    }],
  })
}

function withNextDayOff(base: Roster = roster()): Roster {
  return roster({
    ...base,
    restPolicies: [{
      id: 'rest',
      effectiveFrom: '2020-01-01',
      enabled: true,
      nonworkingTreatment: 'calendar-only',
    }],
  })
}

function person(
  name: string,
  options: {
    joins?: string
    leaves?: string
    capacity?: number
    qualifications?: string[]
    vacation?: { from: string; to: string }[]
    avoid?: string[]
    want?: string[]
    maxShifts?: number
  } = {},
): Person {
  const preferences: Record<string, PreferenceType> = {}
  for (const date of options.avoid ?? []) preferences[date] = 'AVOID'
  for (const date of options.want ?? []) preferences[date] = 'WANT'

  const months = new Set<string>()
  for (const range of options.vacation ?? []) months.add(range.from.slice(0, 7))
  if (options.maxShifts !== undefined) months.add('2026-10')

  const monthlyConditions: Person['monthlyConditions'] = {}
  for (const month of months) {
    monthlyConditions[month] = {
      unavailableRanges: (options.vacation ?? []).filter(range => range.from.startsWith(month)),
      preferredDates: [],
      avoidedDates: [],
      requiredMin: 0,
      max: options.maxShifts ?? null,
    }
  }
  if (options.maxShifts !== undefined && !monthlyConditions['2026-10']) {
    monthlyConditions['2026-10'] = {
      unavailableRanges: [],
      preferredDates: [],
      avoidedDates: [],
      requiredMin: 0,
      max: options.maxShifts,
    }
  }

  return {
    id: name,
    name,
    capacity: options.capacity ?? 1,
    qualifications: options.qualifications,
    memberships: [{ activeFrom: options.joins ?? '2024-01-01', inactiveFrom: options.leaves ?? null }],
    workCalendarOverrides: [],
    monthlyConditions,
    datePreferences: preferences,
  }
}

function duty(date: string, name: string, source: 'auto' | 'manual' = 'auto'): Assignment {
  return { date, allocatedTo: name, performedBy: name, locked: false, source }
}

function holidays(dates: string[], label?: string): CalendarDateOverride[] {
  return dates.map(date => ({ date, holiday: true, label }))
}

function daysFrom(start: string, count: number): string[] {
  const dates: string[] = []
  let cursor = start
  for (let i = 0; i < count; i++) {
    dates.push(cursor)
    const [year, month, day] = cursor.split('-').map(Number)
    const next = new Date(year, month - 1, day + 1)
    cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
  }
  return dates
}

function manyDuties(name: string, start: string, count: number): Assignment[] {
  return daysFrom(start, count).map(date => duty(date, name))
}

function ledger(input: {
  month: string
  people: Person[]
  duties?: Assignment[]
  earlierDuties?: Assignment[]
  actuals?: ActualShift[]
  calendar?: CalendarDateOverride[]
  rules?: Roster
}): FairnessReport {
  const rules = input.rules ?? roster()
  const revision = input.duties
    ? {
        id: 'draft',
        month: input.month,
        status: 'draft' as const,
        baselineRevisionId: null,
        assignments: input.duties,
        calendarOverrideSnapshot: [],
        restPolicySnapshot: '',
        tiebreakerSeed: 'test',
        optimizationMode: 'manual' as const,
        outcomeStatus: 'manual' as const,
        createdAt: '2026-01-01T00:00:00Z',
        actor: 'planner',
      }
    : null

  return computeFairness(
    input.month,
    input.people,
    rules,
    input.calendar ?? [],
    input.actuals ?? [],
    revision,
    [],
    rules.historyStartDate,
    input.earlierDuties ?? [],
  )
}

function share(report: FairnessReport, name: string, bucket: 'NN' | 'NH' | 'HN' | 'HH', window: '30d' | '90d' | '365d' | 'lifetime' = '365d') {
  const row = report.projections[window].find(person => person.personId === name)!
  return row[bucket]
}

function blocks(report: FairnessReport, name: string, window: '365d' | 'lifetime' = '365d') {
  return report.projections[window].find(person => person.personId === name)!
}

function autoSchedule(
  month: string,
  people: Person[],
  options: {
    calendar?: CalendarDateOverride[]
    earlierDuties?: Assignment[]
    keep?: Assignment[]
    rules?: Roster
    actuals?: ActualShift[]
    /** Per-date duty requirements such as a required qualification. */
    duties?: DutyRequirements
  } = {},
): GenerateResult {
  return generatePlan(
    month,
    people,
    options.rules ?? roster(),
    options.calendar ?? [],
    options.actuals ?? [],
    options.keep ?? [],
    [],
    'acceptance',
    options.earlierDuties ?? [],
    options.duties ?? {},
  )
}

function fillOneDay(
  date: string,
  people: Person[],
  options: {
    calendar?: CalendarDateOverride[]
    earlierDuties?: Assignment[]
    keep?: Assignment[]
    rules?: Roster
    actuals?: ActualShift[]
    duties?: DutyRequirements
  } = {},
): GenerateResult {
  return fillDay(
    date,
    date.slice(0, 7),
    people,
    options.rules ?? roster(),
    options.calendar ?? [],
    options.actuals ?? [],
    options.keep ?? [],
    [],
    options.earlierDuties ?? [],
    options.duties ?? {},
  )
}

function whoWorks(result: GenerateResult, date: string): string | undefined {
  return result.assignments.find(item => item.date === date)?.allocatedTo
}

function whoAllWork(result: GenerateResult, date: string): string[] {
  return result.assignments
    .filter(item => item.date === date)
    .map(item => item.allocatedTo)
    .sort()
}

function review(month: string, people: Person[], duties: Assignment[], rules = roster()) {
  return validateRevision(
    {
      id: 'draft',
      month,
      status: 'draft',
      baselineRevisionId: null,
      assignments: duties,
      calendarOverrideSnapshot: [],
      restPolicySnapshot: '',
      tiebreakerSeed: 'test',
      optimizationMode: 'manual',
      outcomeStatus: 'manual',
      createdAt: '2026-01-01T00:00:00Z',
      actor: 'planner',
    },
    people,
    rules,
    [],
    [],
  )
}

// ─── 1 ──────────────────────────────────────────────────────────────────────

describe('1. Classify every duty into the correct fairness type', () => {
  const weekdays = roster(NORMAL_WEEK)
  const weekendsOff = roster({ weekendHolidayDefault: true })

  it('calls a normal day followed by a normal day NN', () => {
    expect(classifyDay('2026-07-06', weekdays, [])).toBe('NN')
  })

  it('calls a normal day followed by a holiday NH', () => {
    expect(classifyDay('2026-07-10', weekendsOff, [])).toBe('NH')
  })

  it('calls a holiday followed by a normal day HN', () => {
    expect(classifyDay('2026-07-12', weekendsOff, [])).toBe('HN')
  })

  it('calls a holiday followed by another holiday HH', () => {
    expect(classifyDay('2026-07-11', weekendsOff, [])).toBe('HH')
  })

  it('changes the type when either today or the next day becomes a holiday', () => {
    expect(classifyDay('2026-07-06', weekdays, [])).toBe('NN')
    expect(classifyDay('2026-07-06', weekdays, holidays(['2026-07-07']))).toBe('NH')
    expect(classifyDay('2026-07-06', weekdays, holidays(['2026-07-06']))).toBe('HN')
  })
})

// ─── 2 ──────────────────────────────────────────────────────────────────────

describe('2. Keep fairness types independent', () => {
  it('does not let an HN surplus cancel an NN deficit', () => {
    const people = [person('Ali'), person('Ayşe')]
    const report = ledger({
      month: '2026-01',
      people,
      calendar: holidays(['2026-01-05']),
      duties: [duty('2026-01-05', 'Ali')],
    })

    expect(share(report, 'Ali', 'HN').actual).toBe(1)
    expect(share(report, 'Ali', 'NN').actual).toBe(0)
    expect(share(report, 'Ali', 'HN').balance).not.toBe(share(report, 'Ali', 'NN').balance)
  })
})

// ─── 3 ──────────────────────────────────────────────────────────────────────

describe('3. Track actual allocation against expected allocation', () => {
  it('splits the expected share and gives the actual duty to only one person', () => {
    const people = [person('Ali'), person('Ayşe')]
    const report = ledger({
      month: '2026-10',
      people,
      duties: [duty('2026-10-05', 'Ali')],
    })

    expect(share(report, 'Ali', 'NN').actual).toBe(1)
    expect(share(report, 'Ayşe', 'NN').actual).toBe(0)
    expect(share(report, 'Ali', 'NN').expected).toBeGreaterThan(0)
    expect(share(report, 'Ayşe', 'NN').expected).toBeGreaterThan(0)
    expect(share(report, 'Ali', 'NN').balance).toBeGreaterThan(share(report, 'Ayşe', 'NN').balance)
  })
})

// ─── 4 ──────────────────────────────────────────────────────────────────────

describe('4. Prefer the person most behind in that fairness type', () => {
  it('gives the next normal duty to the person who has had fewer of them, and that duty moves her closer', () => {
    const people = [person('Ali'), person('Ayşe')]
    const aliAlreadyAhead = manyDuties('Ali', '2026-09-01', 10)
    const before = ledger({ month: '2026-10', people, earlierDuties: aliAlreadyAhead })
    const result = autoSchedule('2026-10', people, { earlierDuties: aliAlreadyAhead })
    const after = ledger({
      month: '2026-10',
      people,
      duties: result.assignments.filter(item => item.date <= '2026-10-05'),
      earlierDuties: aliAlreadyAhead,
    })

    expect(whoWorks(result, '2026-10-05')).toBe('Ayşe')
    expect(share(before, 'Ayşe', 'NN').balance).toBeLessThan(share(before, 'Ali', 'NN').balance)
    expect(share(after, 'Ayşe', 'NN').balance).toBeGreaterThan(share(before, 'Ayşe', 'NN').balance)
  })
})

// ─── 5 ──────────────────────────────────────────────────────────────────────

describe('5. Do not require a single month to be fair', () => {
  it('keeps an uneven month and lets the next month compensate', () => {
    const people = [person('Ali'), person('Ayşe')]
    const octoberAllAli = daysFrom('2026-10-01', 31).map(date => duty(date, 'Ali', 'manual'))
    const published = review('2026-10', people, octoberAllAli)

    expect(published.publishable).toBe(true)

    const afterOctober = ledger({ month: '2026-10', people, duties: octoberAllAli })
    expect(share(afterOctober, 'Ali', 'NN').balance).toBeGreaterThan(share(afterOctober, 'Ayşe', 'NN').balance)

    const november = autoSchedule('2026-11', people, { earlierDuties: octoberAllAli })
    const ayseDays = november.assignments.filter(item => item.allocatedTo === 'Ayşe').length
    const aliDays = november.assignments.filter(item => item.allocatedTo === 'Ali').length
    expect(ayseDays).toBeGreaterThan(aliDays)
  })
})

// ─── 6 and 25 ───────────────────────────────────────────────────────────────

describe('6. Allow any manual assignment', () => {
  it('saves consecutive duties, an avoid preference, and a shift over the monthly limit', () => {
    const ali = person('Ali', { maxShifts: 1, avoid: ['2026-10-05', '2026-10-06'] })
    const duties = [duty('2026-10-05', 'Ali', 'manual'), duty('2026-10-06', 'Ali', 'manual')]
    const result = review('2026-10', [ali, person('Ayşe')], duties)

    expect(result.publishable).toBe(true)
    expect(result.hardErrors).toEqual([])
    expect(result.warnings.map(warning => warning.type)).toEqual(expect.arrayContaining([
      'CONSECUTIVE_SHIFT',
      'AVOID_PREFERENCE',
      'MAX_SHIFT_COUNT',
    ]))
  })

  it('saves a duty on a vacation day and shows that the person was away', () => {
    const ali = person('Ali', { vacation: [{ from: '2026-10-05', to: '2026-10-05' }] })
    const result = review('2026-10', [ali], [duty('2026-10-05', 'Ali', 'manual')])

    expect(result.publishable).toBe(true)
    expect(result.warnings.some(warning => warning.type === 'UNAVAILABLE')).toBe(true)
  })

  it('saves a duty that breaks the next-day-off rule and shows the warning', () => {
    const ali = person('Ali')
    const result = validateRevision(
      {
        id: 'draft',
        month: '2026-10',
        status: 'draft',
        baselineRevisionId: null,
        assignments: [duty('2026-10-06', 'Ali', 'manual')],
        calendarOverrideSnapshot: [],
        restPolicySnapshot: '',
        tiebreakerSeed: 'test',
        optimizationMode: 'manual',
        outcomeStatus: 'manual',
        createdAt: '2026-01-01T00:00:00Z',
        actor: 'planner',
      },
      [ali, person('Ayşe')],
      withNextDayOff(),
      [{
        id: 'rest-1',
        sourceType: 'assignment',
        sourceId: '2026-10-05:Ali',
        personId: 'Ali',
        shiftDate: '2026-10-05',
        immediateRestDate: '2026-10-06',
        compensatoryLeaveDate: null,
        confirmed: false,
      }],
      [],
    )

    expect(result.publishable).toBe(true)
    expect(result.warnings.some(warning => warning.type === 'NEXT_DAY_OFF' && warning.personId === 'Ali')).toBe(true)
  })
})

// ─── 7 and 16 ───────────────────────────────────────────────────────────────

describe('7. Manual assignments must affect fairness', () => {
  it('counts a published manual duty the same way as an automatic one', () => {
    const people = [person('Ali'), person('Ayşe')]
    const manual = ledger({ month: '2026-10', people, duties: [duty('2026-10-05', 'Ali', 'manual')] })
    const automatic = ledger({ month: '2026-10', people, duties: [duty('2026-10-05', 'Ali', 'auto')] })

    expect(share(manual, 'Ali', 'NN')).toEqual(share(automatic, 'Ali', 'NN'))
  })
})

describe('16. Preferences must not rewrite fairness', () => {
  it('still charges the duty to someone who asked to avoid it', () => {
    const ali = person('Ali', { avoid: ['2026-10-05'] })
    const report = ledger({
      month: '2026-10',
      people: [ali, person('Ayşe')],
      duties: [duty('2026-10-05', 'Ali', 'manual')],
    })

    expect(share(report, 'Ali', 'NN').actual).toBe(1)
  })

  it('still counts every wanted duty, so asking does not keep the person entitled', () => {
    const ali = person('Ali', { want: daysFrom('2026-10-05', 3) })
    const wanted = daysFrom('2026-10-05', 3).map(date => duty(date, 'Ali', 'manual'))
    const report = ledger({
      month: '2026-10',
      people: [ali, person('Ayşe')],
      duties: wanted,
    })

    expect(share(report, 'Ali', 'NN').actual).toBe(3)
    expect(share(report, 'Ali', 'NN').balance).toBeGreaterThan(share(report, 'Ayşe', 'NN').balance)
  })
})

// ─── 8 and 9 ────────────────────────────────────────────────────────────────

describe('8. Fairness ownership is fixed at publication', () => {
  it('follows a reassignment made before publication', () => {
    const people = [person('Ali'), person('Ayşe')]
    const draft = ledger({ month: '2026-10', people, duties: [duty('2026-10-05', 'Ayşe')] })

    expect(share(draft, 'Ayşe', 'NN').actual).toBe(1)
    expect(share(draft, 'Ali', 'NN').actual).toBe(0)
  })

  it('keeps the original owner when someone else works the shift after publication', () => {
    const people = [person('Ali'), person('Ayşe')]
    const traded: ActualShift = {
      id: 'trade',
      date: '2026-10-05',
      plannedPersonId: 'Ali',
      actualPersonId: 'Ayşe',
      status: 'substituted',
      recordedAsHoliday: false,
    }
    const report = ledger({ month: '2026-10', people, actuals: [traded] })

    expect(share(report, 'Ali', 'NN').actual).toBe(1)
    expect(share(report, 'Ayşe', 'NN').actual).toBe(0)
  })
})

describe('9. Voluntary shift trades must not rewrite fairness history', () => {
  it('does not make Ali look under-allocated just because Ayşe worked his published duty', () => {
    const people = [person('Ali'), person('Ayşe')]
    const traded: ActualShift = {
      id: 'trade',
      date: '2026-10-05',
      plannedPersonId: 'Ali',
      actualPersonId: 'Ayşe',
      status: 'substituted',
      recordedAsHoliday: false,
    }
    const report = ledger({ month: '2026-10', people, actuals: [traded] })

    expect(share(report, 'Ali', 'NN').balance).toBeGreaterThan(share(report, 'Ayşe', 'NN').balance)
  })
})

// ─── 10 and 11 ──────────────────────────────────────────────────────────────

describe('10. A new person must not inherit historical fairness debt', () => {
  it('starts Ece at zero for the months before she joined', () => {
    const ece = person('Ece', { joins: '2026-06-01' })
    const report = ledger({
      month: '2026-03',
      people: [person('Ali'), ece],
      duties: [duty('2026-03-02', 'Ali')],
    })

    expect(share(report, 'Ece', 'NN').expected).toBe(0)
    expect(share(report, 'Ece', 'NN').actual).toBe(0)
    expect(share(report, 'Ece', 'NN').balance).toBe(0)
  })

  it('starts Ece’s expected share on the day she joins, not before', () => {
    const ece = person('Ece', { joins: '2026-06-01' })
    const afterSheJoins = ledger({
      month: '2026-06',
      people: [person('Ali'), ece],
    })

    expect(share(afterSheJoins, 'Ece', 'NN').expected).toBeGreaterThan(0)
  })
})

describe('11. A person who leaves must stop accumulating expected share', () => {
  it('stops Ali’s share the day he leaves, and keeps the duty he already worked', () => {
    const ali = person('Ali', { joins: '2026-07-01', leaves: '2026-07-02' })
    const ayse = person('Ayşe', { joins: '2026-07-01' })
    const report = ledger({
      month: '2026-07',
      people: [ali, ayse],
      duties: [duty('2026-07-01', 'Ali')],
    })

    expect(share(report, 'Ali', 'NN').actual).toBe(1)
    expect(share(report, 'Ali', 'NN').expected).toBeGreaterThan(0)
    expect(share(report, 'Ali', 'NN').expected).toBeLessThan(share(report, 'Ayşe', 'NN').expected)
    expect(share(report, 'Ayşe', 'NN').expected).toBeGreaterThan(10)
  })
})

// ─── 12 ─────────────────────────────────────────────────────────────────────

describe('12. Capacity must affect expected share', () => {
  it('gives a half-time person about half the expected share of a full-time colleague', () => {
    const report = ledger({
      month: '2026-10',
      people: [person('Ali', { capacity: 1 }), person('Ayşe', { capacity: 0.5 })],
      duties: [duty('2026-10-05', 'Ali')],
    })

    expect(share(report, 'Ali', 'NN').expected / share(report, 'Ayşe', 'NN').expected).toBeCloseTo(2, 1)
  })
})

// ─── 13, 14, 15, 33 ─────────────────────────────────────────────────────────

describe('13. Rolling fairness must not reset at calendar-year boundaries', () => {
  it('still sees December’s duty when planning the following January', () => {
    const people = [person('Ali'), person('Ayşe')]
    const december = [duty('2025-12-15', 'Ali')]
    const january = ledger({
      month: '2026-01',
      people,
      earlierDuties: december,
    })

    expect(share(january, 'Ali', 'NN').actual).toBeGreaterThanOrEqual(1)
  })
})

describe('14. Old fairness must naturally expire', () => {
  it('drops a duty older than a year from the working balance, but keeps it in lifetime history', () => {
    const people = [person('Ali')]
    const oldDuty = [duty('2025-06-02', 'Ali')]
    const report = ledger({ month: '2026-10', people, earlierDuties: oldDuty })

    expect(share(report, 'Ali', 'NN', '365d').actual).toBe(0)
    expect(share(report, 'Ali', 'NN', 'lifetime').actual).toBe(1)
  })
})

describe('15. Recent fairness must follow the moving window', () => {
  it('keeps a duty while it is inside the year window and drops it once the window moves past it', () => {
    const people = [person('Ali')]
    const onTheBoundary = [duty('2025-11-01', 'Ali')]
    const stillRecent = [duty('2026-10-05', 'Ali')]

    const october = ledger({ month: '2026-10', people, earlierDuties: [...onTheBoundary, ...stillRecent] })
    const november = ledger({ month: '2026-11', people, earlierDuties: [...onTheBoundary, ...stillRecent] })

    expect(share(october, 'Ali', 'NN').actual).toBe(2)
    expect(share(november, 'Ali', 'NN').actual).toBe(1)
    expect(share(november, 'Ali', 'NN', 'lifetime').actual).toBe(2)
  })
})

describe('33. Changing the rolling window changes the projection, not the history', () => {
  it('shows a different 90-day balance and 365-day balance from the same duties', () => {
    const people = [person('Ali')]
    const duties = [duty('2026-06-01', 'Ali'), duty('2026-10-05', 'Ali')]
    const report = ledger({ month: '2026-10', people, earlierDuties: duties })

    expect(share(report, 'Ali', 'NN', '90d').actual).toBe(1)
    expect(share(report, 'Ali', 'NN', '365d').actual).toBe(2)
    expect(share(report, 'Ali', 'NN', 'lifetime').actual).toBe(2)
  })
})

// ─── 17 and 18 ──────────────────────────────────────────────────────────────

describe('17. Preferences should break close fairness decisions', () => {
  it('gives the duty to the person who wants it when both are about equally fair', () => {
    const ayse = person('Ayşe', { want: ['2026-10-05'] })
    const result = autoSchedule('2026-10', [person('Ali'), ayse])

    expect(whoWorks(result, '2026-10-05')).toBe('Ayşe')
  })

  it('still corrects a large fairness gap even when the person ahead wants the duty', () => {
    const ayse = person('Ayşe', { want: ['2026-10-05'] })
    const ayseAlreadyAhead = manyDuties('Ayşe', '2026-09-01', 10)
    const result = autoSchedule('2026-10', [person('Ali'), ayse], { earlierDuties: ayseAlreadyAhead })

    expect(whoWorks(result, '2026-10-05')).toBe('Ali')
  })
})

describe('18. Hard avoid blocks automatic scheduling (fairness share still accrues)', () => {
  it('picks someone else when a colleague is available', () => {
    const ali = person('Ali', { avoid: ['2026-10-05'] })
    const result = autoSchedule('2026-10', [ali, person('Ayşe')])

    expect(whoWorks(result, '2026-10-05')).toBe('Ayşe')
  })

  it('leaves the day uncovered when the only feasible person hard-avoided it', () => {
    const ali = person('Ali', { avoid: ['2026-10-05'] })
    const ayseAway = person('Ayşe', { vacation: [{ from: '2026-10-05', to: '2026-10-05' }] })
    const result = autoSchedule('2026-10', [ali, ayseAway])

    expect(whoWorks(result, '2026-10-05')).toBeUndefined()
    expect(result.warnings.some(w => w.type === 'NO_COVERAGE' && w.date === '2026-10-05')).toBe(true)
  })
})

// ─── 19 and 20 ──────────────────────────────────────────────────────────────

describe('19. Long holidays must be recognized as blocks', () => {
  it('counts holiday duties and distinct interrupted blocks separately', () => {
    const people = [person('Ali'), person('Ayşe')]
    const calendar = [
      ...holidays(daysFrom('2026-10-01', 4), 'Eid'),
      ...holidays(daysFrom('2026-10-08', 4), 'Eid'),
    ]
    const report = ledger({
      month: '2026-10',
      people,
      calendar,
      duties: [
        duty('2026-10-01', 'Ali'),
        duty('2026-10-02', 'Ali'),
        duty('2026-10-03', 'Ali'),
        duty('2026-10-08', 'Ayşe'),
      ],
    })

    expect(blocks(report, 'Ali').holidayShifts).toBe(3)
    expect(blocks(report, 'Ali').holidayBlocksTouched).toBe(1)
    expect(blocks(report, 'Ayşe').holidayBlocksTouched).toBe(1)
  })
})

describe('20. Holiday-shift fairness and holiday-block fairness stay independent', () => {
  it('treats one interrupted holiday differently from the same number of duties spread across two holidays', () => {
    const people = [person('Ali'), person('Ayşe')]
    const calendar = [
      ...holidays(daysFrom('2026-10-01', 4)),
      ...holidays(daysFrom('2026-10-08', 4)),
    ]
    const report = ledger({
      month: '2026-10',
      people,
      calendar,
      duties: [
        duty('2026-10-01', 'Ali'),
        duty('2026-10-02', 'Ali'),
        duty('2026-10-04', 'Ayşe'),
        duty('2026-10-08', 'Ayşe'),
      ],
    })

    expect(blocks(report, 'Ali').holidayShifts).toBe(blocks(report, 'Ayşe').holidayShifts)
    expect(blocks(report, 'Ali').holidayBlocksTouched).toBe(1)
    expect(blocks(report, 'Ayşe').holidayBlocksTouched).toBe(2)
  })
})

// ─── 21, 22, 23 ─────────────────────────────────────────────────────────────

describe('21. Avoid repeatedly disrupting the same people’s long holidays', () => {
  it('covers the next long holiday with the person who has sat out more recent ones', () => {
    const people = [person('Ali'), person('Ayşe')]
    const earlierHoliday = holidays(daysFrom('2026-09-01', 4))
    const nextHoliday = holidays(daysFrom('2026-10-05', 4))
    const aliCoveredTheEarlierOne = daysFrom('2026-09-01', 4).map(date => duty(date, 'Ali'))

    const result = autoSchedule('2026-10', people, {
      calendar: [...earlierHoliday, ...nextHoliday],
      earlierDuties: aliCoveredTheEarlierOne,
    })

    for (const date of daysFrom('2026-10-05', 4)) {
      expect(whoWorks(result, date)).toBe('Ayşe')
      expect(result.assignments.find(item => item.date === date)?.holidayBlockId).toBeTruthy()
    }
  })
})

describe('22. Long-holiday coverage may be concentrated', () => {
  it('uses a small group for one holiday, then a different person for the next one', () => {
    const people = [person('Ali'), person('Ayşe'), person('Can')]
    const firstHoliday = daysFrom('2026-10-05', 4)
    const secondHoliday = daysFrom('2026-10-12', 4)
    const result = autoSchedule('2026-10', people, {
      calendar: [...holidays(firstHoliday), ...holidays(secondHoliday)],
    })

    const firstGroup = new Set(firstHoliday.map(date => whoWorks(result, date)))
    const secondGroup = new Set(secondHoliday.map(date => whoWorks(result, date)))

    expect(firstGroup.size).toBe(1)
    expect(secondGroup.size).toBe(1)
    expect([...firstGroup][0]).not.toBe([...secondGroup][0])
  })
})

describe('23. Rare annual events must not be forgotten at the 12-month boundary', () => {
  it('remembers who worked last New Year even though that block has left the rolling year', () => {
    const people = [person('Ali'), person('Ayşe')]
    const lastNewYear = daysFrom('2025-01-01', 4)
    const thisNewYear = daysFrom('2026-01-01', 4)
    const calendar = [
      ...holidays(lastNewYear, 'New Year'),
      ...holidays(thisNewYear, 'New Year'),
    ]
    const aliWorkedLastYear = lastNewYear.map(date => duty(date, 'Ali'))

    const remembered = ledger({
      month: '2026-01',
      people,
      calendar,
      earlierDuties: aliWorkedLastYear,
    })
    expect(blocks(remembered, 'Ali').holidayBlocksTouched).toBe(0)
    expect(blocks(remembered, 'Ali', 'lifetime').holidayBlocksTouched).toBe(1)

    const result = autoSchedule('2026-01', people, {
      calendar,
      earlierDuties: aliWorkedLastYear,
    })
    for (const date of thisNewYear) {
      expect(whoWorks(result, date)).toBe('Ayşe')
    }
  })
})

// ─── 24, 25, 26 ─────────────────────────────────────────────────────────────

describe('24. Automatic scheduling must respect configured constraints', () => {
  it('does not schedule someone who is on vacation when a colleague can work', () => {
    const ayseAway = person('Ayşe', { vacation: [{ from: '2026-10-01', to: '2026-10-31' }] })
    const result = autoSchedule('2026-10', [person('Ali'), ayseAway])

    expect(result.assignments.every(item => item.allocatedTo === 'Ali')).toBe(true)
  })

  it('gives the next day off after a duty when that rule is turned on', () => {
    const people = [person('Ali'), person('Ayşe')]
    const result = autoSchedule('2026-10', people, {
      rules: withNextDayOff(),
      keep: [duty('2026-10-05', 'Ali', 'manual')],
    })

    expect(whoWorks(result, '2026-10-06')).toBe('Ayşe')
  })

  it('reports the gap instead of assigning a duty nobody can take', () => {
    const everyoneAway = [
      person('Ali', { vacation: [{ from: '2026-10-01', to: '2026-10-31' }] }),
      person('Ayşe', { vacation: [{ from: '2026-10-01', to: '2026-10-31' }] }),
    ]
    const result = autoSchedule('2026-10', everyoneAway)

    expect(whoWorks(result, '2026-10-05')).toBeUndefined()
    expect(result.warnings.some(warning => warning.type === 'NO_COVERAGE' && warning.date === '2026-10-05')).toBe(true)
  })

  it('does not give a qualified duty to the person who lacks that qualification', () => {
    const nurse = person('Ali', { qualifications: ['night'] })
    const clerk = person('Ayşe', { qualifications: [] })
    // Ayşe is the fair choice for this day. The duty still requires a night qualification,
    // so the automatic schedule has to give it to Ali.
    const nurseAlreadyAhead = manyDuties('Ali', '2026-09-01', 10)
    const result = autoSchedule('2026-10', [nurse, clerk], {
      earlierDuties: nurseAlreadyAhead,
      duties: { '2026-10-05': { requiredQualification: 'night' } },
    })

    expect(whoWorks(result, '2026-10-05')).toBe('Ali')
  })
})

describe('25. Manual scheduling must be able to override the same constraints', () => {
  it('lets an administrator publish the duty the optimizer would have refused', () => {
    const people = [person('Ali'), person('Ayşe')]
    const duties = [duty('2026-10-05', 'Ali', 'manual'), duty('2026-10-06', 'Ali', 'manual')]
    const result = review('2026-10', people, duties, withNextDayOff())

    expect(result.publishable).toBe(true)
    expect(result.warnings.some(warning => warning.type === 'CONSECUTIVE_SHIFT')).toBe(true)
  })

  it('lets an administrator assign someone who lacks the required qualification, and shows that', () => {
    const clerk = person('Ayşe', { qualifications: [] })
    const checked = validateRevision(
      {
        id: 'draft',
        month: '2026-10',
        status: 'draft',
        baselineRevisionId: null,
        assignments: [duty('2026-10-05', 'Ayşe', 'manual')],
        calendarOverrideSnapshot: [],
        restPolicySnapshot: '',
        tiebreakerSeed: 'test',
        optimizationMode: 'manual',
        outcomeStatus: 'manual',
        createdAt: '2026-01-01T00:00:00Z',
        actor: 'planner',
      },
      [person('Ali', { qualifications: ['night'] }), clerk],
      roster(),
      [],
      [],
      [],
      undefined,
      { '2026-10-05': { requiredQualification: 'night' } },
    )

    expect(checked.publishable).toBe(true)
    expect(checked.warnings.some(warning => warning.type === 'QUALIFICATION' && warning.personId === 'Ayşe')).toBe(true)
  })
})

describe('26. Do not fail because an easy duty was filled too early', () => {
  it('covers the day only one person can work, instead of using that person up on an easy day', () => {
    const ali = person('Ali', { maxShifts: 1 })
    const ayse = person('Ayşe', { vacation: [{ from: '2026-10-20', to: '2026-10-20' }] })
    const result = autoSchedule('2026-10', [ali, ayse])

    expect(whoWorks(result, '2026-10-20')).toBe('Ali')
    expect(whoWorks(result, '2026-10-05')).toBe('Ayşe')
  })
})

// ─── 27 and 28 ──────────────────────────────────────────────────────────────

describe('27. Reoptimization must preserve unaffected assignments', () => {
  it('changes only the day that became impossible', () => {
    const people = [person('Ali'), person('Ayşe')]
    const original = autoSchedule('2026-10', people)
    const brokenDay = original.assignments.find(item => item.allocatedTo === 'Ali')!
    const ayse = person('Ayşe')
    const aliAwayThatDay = person('Ali', { vacation: [{ from: brokenDay.date, to: brokenDay.date }] })

    const repaired = repairPlan(
      {
        id: 'published',
        month: '2026-10',
        status: 'published',
        baselineRevisionId: null,
        assignments: original.assignments,
        calendarOverrideSnapshot: [],
        restPolicySnapshot: '',
        tiebreakerSeed: 'acceptance',
        optimizationMode: 'initial',
        outcomeStatus: 'feasible-best-found',
        createdAt: '2026-10-01T00:00:00Z',
        actor: 'planner',
      },
      [aliAwayThatDay, ayse],
      roster(),
      [],
      [],
      [],
      'acceptance',
    )

    expect(repaired.assignments.find(item => item.date === brokenDay.date)?.allocatedTo).not.toBe('Ali')
    for (const item of original.assignments) {
      if (item.date === brokenDay.date) continue
      expect(repaired.assignments.find(next => next.date === item.date)?.allocatedTo).toBe(item.allocatedTo)
    }
  })
})

describe('28. Reoptimization must still preserve fairness history', () => {
  it('uses the existing rolling balance when it refills a day, and does not forget earlier duties', () => {
    const ali = person('Ali')
    const ayse = person('Ayşe')
    const can = person('Can')
    const aliAlreadyAhead = manyDuties('Ali', '2026-08-01', 40)
    const november = autoSchedule('2026-11', [ali, ayse, can], { earlierDuties: aliAlreadyAhead })
    const ayseDay = november.assignments.find(item => item.allocatedTo === 'Ayşe')!
    const ayseAway = person('Ayşe', { vacation: [{ from: ayseDay.date, to: ayseDay.date }] })

    const repaired = repairPlan(
      {
        id: 'published',
        month: '2026-11',
        status: 'published',
        baselineRevisionId: null,
        assignments: november.assignments,
        calendarOverrideSnapshot: [],
        restPolicySnapshot: '',
        tiebreakerSeed: 'acceptance',
        optimizationMode: 'initial',
        outcomeStatus: 'feasible-best-found',
        createdAt: '2026-11-01T00:00:00Z',
        actor: 'planner',
      },
      [ali, ayseAway, can],
      roster(),
      [],
      [],
      [],
      'acceptance',
      aliAlreadyAhead,
    )

    expect(repaired.assignments.find(item => item.date === ayseDay.date)?.allocatedTo).toBe('Can')

    const afterRepair = ledger({
      month: '2026-11',
      people: [ali, ayse, can],
      duties: repaired.assignments,
      earlierDuties: aliAlreadyAhead,
    })
    expect(share(afterRepair, 'Ali', 'NN').actual).toBeGreaterThanOrEqual(40)
  })
})

// ─── 29 and 30 ──────────────────────────────────────────────────────────────

describe('29. Identical inputs must produce identical automatic results', () => {
  it('builds the same month twice', () => {
    const people = [person('Ali'), person('Ayşe'), person('Can')]
    const first = autoSchedule('2026-10', people)
    const second = autoSchedule('2026-10', people)
    const signature = (result: GenerateResult) =>
      result.assignments.map(item => `${item.date}:${item.allocatedTo}`).join('|')

    expect(signature(first)).toBe(signature(second))
  })
})

describe('30. Every automatic assignment must be explainable', () => {
  it('records the duty type, how many people could do it, and the winner’s fairness balance', () => {
    const result = autoSchedule('2026-10', [person('Ali'), person('Ayşe')])
    const sample = result.assignments.find(item => item.date === '2026-10-05')!

    expect(sample.explanation).toMatchObject({
      bucket: 'NN',
      feasibleCount: 2,
    })
    expect(typeof sample.explanation?.winnerBalance).toBe('number')
  })

  it('records the preference that decided a close call', () => {
    const ayse = person('Ayşe', { want: ['2026-10-01'] })
    const result = autoSchedule('2026-10', [person('Ali'), ayse])
    const firstDay = result.assignments.find(item => item.date === '2026-10-01')!

    expect(firstDay.allocatedTo).toBe('Ayşe')
    expect(firstDay.explanation?.preferenceUsed).toBe('WANT')
  })
})

// ─── 31 ─────────────────────────────────────────────────────────────────────

describe('31. Manual unfairness must be visually detectable', () => {
  it('shows the fairness balance getting worse, and still accepts the duty', () => {
    const people = [person('Ali'), person('Ayşe')]
    const before = ledger({ month: '2026-10', people })
    const after = ledger({ month: '2026-10', people, duties: [duty('2026-10-05', 'Ali', 'manual')] })
    const impact = assessAssignment(
      '2026-10-05',
      'Ali',
      people[0],
      [],
      [],
      roster(),
      [],
      before,
    )

    expect(share(after, 'Ali', 'NN').balance).toBeGreaterThan(share(before, 'Ali', 'NN').balance)
    expect(impact.bucketBalanceAfter).toBeGreaterThan(impact.bucketBalanceBefore)
    expect(review('2026-10', people, [duty('2026-10-05', 'Ali', 'manual')]).publishable).toBe(true)
  })
})

// ─── 32 and 34 ──────────────────────────────────────────────────────────────

describe('32. Historical data must remain recomputable', () => {
  it('rebuilds the same balances from the same duties', () => {
    const people = [person('Ali'), person('Ayşe')]
    const duties = [duty('2026-10-05', 'Ali'), duty('2026-10-06', 'Ayşe')]
    const first = ledger({ month: '2026-10', people, duties })
    const rebuilt = ledger({ month: '2026-10', people, duties })

    expect(rebuilt.projections).toEqual(first.projections)
  })
})

describe('34. Fairness must not double-count schedule versions', () => {
  it('counts only the replacement assignee, not the person from the discarded draft', () => {
    const people = [person('Ali'), person('Ayşe')]
    const discardedDraft = [duty('2026-10-05', 'Ali')]
    const publishedReplacement = [duty('2026-10-05', 'Ayşe')]
    const report = ledger({
      month: '2026-10',
      people,
      duties: publishedReplacement,
      earlierDuties: discardedDraft,
    })

    expect(share(report, 'Ayşe', 'NN').actual).toBe(1)
    expect(share(report, 'Ali', 'NN').actual).toBe(0)
  })
})

// ─── 35 and 36 ──────────────────────────────────────────────────────────────

describe('35. Fairness must keep working when perfect balance is impossible', () => {
  it('still publishes a usable month and leaves the leftover imbalance in the ledger', () => {
    const people = [person('Ali'), person('Ayşe'), person('Can')]
    const result = autoSchedule('2026-10', people)
    const report = ledger({ month: '2026-10', people, duties: result.assignments })
    const balances = people.map(member => share(report, member.name, 'NN').balance)

    expect(result.outcomeStatus).toBe('feasible-best-found')
    expect(balances.some(balance => Math.abs(balance) > 0.01)).toBe(true)
  })
})

describe('36. Future schedules must naturally compensate historical imbalance', () => {
  it('gives later duties of the same type to the person who finished behind', () => {
    const people = [person('Ali'), person('Ayşe')]
    const ayseFinishedAhead = manyDuties('Ayşe', '2026-09-01', 10)
    const october = autoSchedule('2026-10', people, { earlierDuties: ayseFinishedAhead })
    const ayseDays = october.assignments.filter(item => item.allocatedTo === 'Ayşe').length
    const aliDays = october.assignments.filter(item => item.allocatedTo === 'Ali').length

    expect(aliDays).toBeGreaterThan(ayseDays)
  })
})

// ─── Staffing policy ────────────────────────────────────────────────────────

describe('Staffing policy: a shift can require more than one person', () => {
  it('staffs a shift that requires two people with exactly two distinct people', () => {
    const people = [person('Ali'), person('Ayşe'), person('Can')]
    const result = autoSchedule('2026-10', people, { rules: withStaffing(2) })

    expect(result.outcomeStatus).toBe('feasible-best-found')
    for (const date of monthDates('2026-10')) {
      const names = whoAllWork(result, date)
      expect(names).toHaveLength(2)
      expect(new Set(names).size).toBe(2)
    }
  })

  it('still staffs exactly one person when no staffing policy is set', () => {
    const result = autoSchedule('2026-10', [person('Ali'), person('Ayşe')])

    expect(result.outcomeStatus).toBe('feasible-best-found')
    for (const date of monthDates('2026-10')) {
      expect(whoAllWork(result, date)).toHaveLength(1)
    }
  })

  it('still staffs exactly one person when the policy asks for one', () => {
    const result = autoSchedule('2026-10', [person('Ali'), person('Ayşe')], {
      rules: withStaffing(1),
    })

    expect(result.outcomeStatus).toBe('feasible-best-found')
    for (const date of monthDates('2026-10')) {
      expect(whoAllWork(result, date)).toHaveLength(1)
    }
  })

  it('applies a higher headcount only from the policy effective date', () => {
    const rules = roster({
      staffingPolicies: [{
        id: 'staff',
        effectiveFrom: '2026-10-15',
        requiredHeadcount: 2,
      }],
    })
    const result = autoSchedule('2026-10', [person('Ali'), person('Ayşe'), person('Can')], { rules })

    expect(whoAllWork(result, '2026-10-14')).toHaveLength(1)
    expect(whoAllWork(result, '2026-10-15')).toHaveLength(2)
    expect(new Set(whoAllWork(result, '2026-10-15')).size).toBe(2)
  })

  it('lets one shift require more people than the policy default', () => {
    const people = [person('Ali'), person('Ayşe'), person('Can')]
    const result = autoSchedule('2026-10', people, {
      rules: withStaffing(1),
      duties: { '2026-10-05': { requiredHeadcount: 3 } },
    })

    expect(whoAllWork(result, '2026-10-05')).toEqual(['Ali', 'Ayşe', 'Can'])
    expect(whoAllWork(result, '2026-10-06')).toHaveLength(1)
    expect(result.outcomeStatus).toBe('feasible-best-found')
  })

  it('reports the gap when fewer people are available than the shift requires', () => {
    const people = [person('Ali'), person('Ayşe')]
    const result = autoSchedule('2026-10', people, { rules: withStaffing(3) })
    const dates = monthDates('2026-10')

    expect(result.outcomeStatus).toBe('feasible-best-found')
    for (const date of dates) {
      const names = whoAllWork(result, date)
      expect(names).toEqual(['Ali', 'Ayşe'])
      expect(new Set(names).size).toBe(names.length)
    }
    const gaps = result.warnings.filter(warning => warning.type === 'NO_COVERAGE')
    expect(gaps).toHaveLength(dates.length)
    expect(gaps.every(warning => warning.data?.filled === 2 && warning.data?.required === 3)).toBe(true)
    const checked = review('2026-10', people, result.assignments, withStaffing(3))
    expect(checked.publishable).toBe(true)
    expect(checked.hardErrors).toEqual([])
    expect(checked.warnings.some(warning => warning.type === 'NO_COVERAGE')).toBe(true)
  })

  it('does not give both slots to the person who is furthest behind', () => {
    const people = [person('Ali'), person('Ayşe'), person('Can')]
    const result = autoSchedule('2026-10', people, {
      rules: withStaffing(2),
      earlierDuties: manyDuties('Ali', '2026-09-01', 12),
    })

    expect(whoAllWork(result, '2026-10-05')).toEqual(['Ayşe', 'Can'])
  })

  it('keeps the following-day rest policy for every person on the shift', () => {
    const people = [person('Ali'), person('Ayşe'), person('Can'), person('Deniz')]
    const result = autoSchedule('2026-10', people, {
      rules: withNextDayOff(withStaffing(2)),
      keep: [
        duty('2026-10-05', 'Ali', 'manual'),
        duty('2026-10-05', 'Ayşe', 'manual'),
      ],
    })

    expect(whoAllWork(result, '2026-10-05')).toEqual(['Ali', 'Ayşe'])
    expect(whoAllWork(result, '2026-10-06')).toEqual(['Can', 'Deniz'])
    expect(result.outcomeStatus).toBe('feasible-best-found')
  })

  it('leaves the next day open when rest and headcount cannot both be met', () => {
    const result = autoSchedule('2026-10', [person('Ali'), person('Ayşe')], {
      rules: withNextDayOff(withStaffing(2)),
    })

    expect(whoAllWork(result, '2026-10-01')).toEqual(['Ali', 'Ayşe'])
    expect(whoAllWork(result, '2026-10-02')).toEqual([])
    expect(result.warnings.some(warning => warning.type === 'NO_COVERAGE' && warning.date === '2026-10-02')).toBe(true)
    expect(result.outcomeStatus).toBe('feasible-best-found')
    const checked = review('2026-10', [person('Ali'), person('Ayşe')], result.assignments, withNextDayOff(withStaffing(2)))
    expect(checked.publishable).toBe(true)
    expect(checked.hardErrors).toEqual([])
  })

  it('still requires the qualification on every slot of a multi-person shift', () => {
    const nurse = person('Ali', { qualifications: ['icu'] })
    const nurse2 = person('Ayşe', { qualifications: ['icu'] })
    const clerk = person('Can')
    const clerk2 = person('Deniz')
    const result = autoSchedule('2026-10', [nurse, nurse2, clerk, clerk2], {
      rules: withStaffing(2),
      earlierDuties: [
        ...manyDuties('Ali', '2026-09-01', 10),
        ...manyDuties('Ayşe', '2026-09-01', 10),
      ],
      duties: { '2026-10-05': { requiredQualification: 'icu' } },
    })

    expect(whoAllWork(result, '2026-10-05')).toEqual(['Ali', 'Ayşe'])
  })

  it('refuses to publish the same person in two slots, and accepts two distinct people', () => {
    const people = [person('Ali'), person('Ayşe')]
    const rules = withStaffing(2)
    const duplicated = review('2026-10', people, [
      duty('2026-10-05', 'Ali', 'manual'),
      duty('2026-10-05', 'Ali', 'manual'),
    ], rules)
    const distinct = review('2026-10', people, [
      duty('2026-10-05', 'Ali', 'manual'),
      duty('2026-10-05', 'Ayşe', 'manual'),
    ], rules)

    expect(duplicated.publishable).toBe(false)
    expect(duplicated.hardErrors.some(error => error.kind === 'duplicate-date' && error.personId === 'Ali')).toBe(true)
    expect(distinct.publishable).toBe(true)
    expect(distinct.hardErrors).toEqual([])
  })

  it('removes a person from a shift when Ata is used again, and does not fill the other slot', () => {
    const first = toggleShiftAssignment([], '2026-10-05', 'Ali', 2)
    expect(first.map(item => item.allocatedTo)).toEqual(['Ali'])

    const withPartner = toggleShiftAssignment(first, '2026-10-05', 'Ayşe', 2)
    expect(withPartner.map(item => item.allocatedTo).sort()).toEqual(['Ali', 'Ayşe'])

    const removed = toggleShiftAssignment(withPartner, '2026-10-05', 'Ali', 2)
    expect(removed.map(item => item.allocatedTo)).toEqual(['Ayşe'])

    const again = toggleShiftAssignment(removed, '2026-10-05', 'Ayşe', 2)
    expect(again).toEqual([])
  })

  it('keeps a half-staffed shift publishable until an explicit plan fills the open slot', () => {
    const people = [person('Ali'), person('Ayşe'), person('Can')]
    const rules = withStaffing(2)
    const manual = toggleShiftAssignment([], '2026-10-05', 'Ali', 2)
    const checked = review('2026-10', people, manual, rules)

    expect(manual).toHaveLength(1)
    expect(checked.publishable).toBe(true)
    expect(checked.hardErrors).toEqual([])
    expect(checked.warnings.some(warning => warning.type === 'NO_COVERAGE' && warning.date === '2026-10-05')).toBe(true)
    expect(shouldOfferAutomaticRepair(checked.warnings, checked.hardErrors)).toBe(false)
    expect(shouldOfferAutomaticRepair([{ type: 'NEXT_DAY_OFF' }], [])).toBe(true)

    const filled = autoSchedule('2026-10', people, { rules, keep: manual })
    const names = whoAllWork(filled, '2026-10-05')
    expect(names).toContain('Ali')
    expect(names).toHaveLength(2)
    expect(new Set(names).size).toBe(2)
  })
})

describe('Dated policies can be edited after they are created', () => {
  it('changes a staffing policy headcount and effective date, then staffs from the new date', () => {
    const original = [{
      id: 'staff',
      effectiveFrom: '2026-10-01',
      requiredHeadcount: 1,
    }]
    expect(updateStaffingPolicy(original, {
      id: 'missing',
      effectiveFrom: '2026-01-01',
      requiredHeadcount: 9,
    })).toBe(original)

    const edited = updateStaffingPolicy(original, {
      id: 'staff',
      effectiveFrom: '2026-10-15',
      requiredHeadcount: 2.8,
    })
    expect(edited).toEqual([{
      id: 'staff',
      effectiveFrom: '2026-10-15',
      requiredHeadcount: 2,
    }])

    const result = autoSchedule('2026-10', [person('Ali'), person('Ayşe'), person('Can')], {
      rules: roster({ staffingPolicies: edited }),
    })
    expect(whoAllWork(result, '2026-10-14')).toHaveLength(1)
    expect(whoAllWork(result, '2026-10-15')).toHaveLength(2)
    expect(new Set(whoAllWork(result, '2026-10-15')).size).toBe(2)
  })

  it('changes a rest policy treatment and effective date, then keeps the next day free', () => {
    const original = [{
      id: 'rest',
      effectiveFrom: '2020-01-01',
      enabled: false,
      nonworkingTreatment: 'none' as const,
    }]
    expect(updateRestPolicy(original, {
      id: 'missing',
      effectiveFrom: '2026-10-01',
      enabled: true,
      nonworkingTreatment: 'calendar-only',
    })).toBe(original)

    const turnedOff = updateRestPolicy([{
      id: 'rest',
      effectiveFrom: '2020-01-01',
      enabled: true,
      nonworkingTreatment: 'calendar-only',
    }], {
      id: 'rest',
      effectiveFrom: '2020-01-01',
      enabled: true,
      nonworkingTreatment: 'none',
    })
    expect(turnedOff[0].enabled).toBe(false)

    const edited = updateRestPolicy(original, {
      id: 'rest',
      effectiveFrom: '2026-10-01',
      enabled: true,
      nonworkingTreatment: 'calendar-only',
    })
    const people = [person('Ali'), person('Ayşe'), person('Can'), person('Deniz')]
    const rules = withStaffing(2, roster({ restPolicies: edited }))
    const result = autoSchedule('2026-10', people, {
      rules,
      keep: [
        duty('2026-10-05', 'Ali', 'manual'),
        duty('2026-10-05', 'Ayşe', 'manual'),
      ],
    })

    expect(whoAllWork(result, '2026-10-05')).toEqual(['Ali', 'Ayşe'])
    expect(whoAllWork(result, '2026-10-06')).toEqual(['Can', 'Deniz'])
  })
})

describe('Fill one short day', () => {
  it('fills only that day and keeps people already assigned, including on other days', () => {
    const people = [person('Ali'), person('Ayşe'), person('Can')]
    const rules = withStaffing(2)
    const existing = [
      duty('2026-10-01', 'Can', 'manual'),
      duty('2026-10-05', 'Ali', 'manual'),
      duty('2026-10-08', 'Ayşe', 'auto'),
    ]
    const result = fillOneDay('2026-10-05', people, { rules, keep: existing })

    const names = whoAllWork(result, '2026-10-05')
    expect(names).toContain('Ali')
    expect(names).toHaveLength(2)
    expect(new Set(names).size).toBe(2)
    expect(result.assignments.filter(item => item.date !== '2026-10-05')).toEqual(
      existing.filter(item => item.date !== '2026-10-05'),
    )
    for (const date of monthDates('2026-10')) {
      if (date === '2026-10-01' || date === '2026-10-05' || date === '2026-10-08') continue
      expect(whoAllWork(result, date)).toEqual([])
    }
  })

  it('respects rest, vacation, avoid, qualification, monthly max, and fairness', () => {
    const resting = fillOneDay('2026-10-06', [person('Ali'), person('Ayşe'), person('Can'), person('Deniz')], {
      rules: withNextDayOff(withStaffing(2)),
      keep: [
        duty('2026-10-05', 'Ali', 'manual'),
        duty('2026-10-05', 'Ayşe', 'manual'),
        duty('2026-10-04', 'Can', 'auto'),
      ],
    })
    expect(whoAllWork(resting, '2026-10-05')).toEqual(['Ali', 'Ayşe'])
    expect(whoAllWork(resting, '2026-10-04')).toEqual(['Can'])
    expect(whoAllWork(resting, '2026-10-06')).toEqual(['Can', 'Deniz'])

    const onLeave = person('Ali', { vacation: [{ from: '2026-10-05', to: '2026-10-05' }] })
    expect(whoAllWork(fillOneDay('2026-10-05', [onLeave, person('Ayşe')], { rules: withStaffing(1) }), '2026-10-05')).toEqual(['Ayşe'])

    const avoiding = person('Ali', { avoid: ['2026-10-05'] })
    expect(whoAllWork(fillOneDay('2026-10-05', [avoiding, person('Ayşe')], { rules: withStaffing(1) }), '2026-10-05')).toEqual(['Ayşe'])

    const nurse = person('Ali', { qualifications: ['icu'] })
    const clerk = person('Ayşe')
    expect(whoAllWork(fillOneDay('2026-10-05', [nurse, clerk], {
      rules: withStaffing(1),
      duties: { '2026-10-05': { requiredQualification: 'icu' } },
    }), '2026-10-05')).toEqual(['Ali'])

    const capped = person('Ali', { maxShifts: 1 })
    const cappedResult = fillOneDay('2026-10-05', [capped, person('Ayşe')], {
      rules: withStaffing(1),
      keep: [duty('2026-10-01', 'Ali', 'manual')],
    })
    expect(whoAllWork(cappedResult, '2026-10-05')).toEqual(['Ayşe'])
    expect(whoAllWork(cappedResult, '2026-10-01')).toEqual(['Ali'])

    const behind = fillOneDay('2026-10-05', [person('Ali'), person('Ayşe'), person('Can')], {
      rules: withStaffing(1),
      earlierDuties: manyDuties('Ali', '2026-09-01', 12),
    })
    expect(whoAllWork(behind, '2026-10-05')).not.toContain('Ali')
    expect(whoAllWork(behind, '2026-10-05')).toHaveLength(1)
  })

  it('fills what it can and keeps a coverage warning when not enough people are free', () => {
    const people = [person('Ali'), person('Ayşe')]
    const rules = withStaffing(3)
    const existing = [duty('2026-10-01', 'Ali', 'manual')]
    const result = fillOneDay('2026-10-05', people, { rules, keep: existing })
    const checked = review('2026-10', people, result.assignments, rules)

    expect(whoAllWork(result, '2026-10-05')).toEqual(['Ali', 'Ayşe'])
    expect(whoAllWork(result, '2026-10-01')).toEqual(['Ali'])
    expect(result.outcomeStatus).toBe('feasible-best-found')
    expect(result.warnings.some(warning =>
      warning.type === 'NO_COVERAGE' && warning.date === '2026-10-05' && warning.data?.filled === 2 && warning.data?.required === 3
    )).toBe(true)
    expect(checked.publishable).toBe(true)
    expect(checked.hardErrors).toEqual([])
  })

  it('does not add anyone to a day that is already fully staffed', () => {
    const people = [person('Ali'), person('Ayşe'), person('Can')]
    const existing = [
      duty('2026-10-05', 'Ali', 'manual'),
      duty('2026-10-05', 'Ayşe', 'manual'),
    ]
    const result = fillOneDay('2026-10-05', people, { rules: withStaffing(2), keep: existing })

    expect(whoAllWork(result, '2026-10-05')).toEqual(['Ali', 'Ayşe'])
    expect(result.assignments).toEqual(existing)
    expect(result.warnings.some(warning => warning.type === 'NO_COVERAGE')).toBe(false)
  })
})
