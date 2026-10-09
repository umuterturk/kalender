import { describe, expect, it } from 'vitest'
import { hasExistingData, parseImportedState, serializeState } from '../transfer'
import type { KalenderState } from '../../domain/types'

const empty: KalenderState = {
  roster: null,
  people: [],
  calendarOverrides: [],
  holidayPeriods: [],
  revisions: [],
  actuals: [],
  leaves: [],
}

describe('import/export transfer', () => {
  it('round-trips a roster backup', () => {
    const state: KalenderState = {
      ...empty,
      roster: {
        id: 'r1',
        name: 'Ward',
        country: 'TR',
        defaultWorkingWeekdays: [1, 2, 3, 4, 5],
        historyStartDate: '2026-10-05',
        weekendHolidayDefault: true,
        restPolicies: [],
        staffingPolicies: [],
      },
      people: [{
        id: 'p1',
        name: 'Ada',
        memberships: [{ activeFrom: '2026-10-05', inactiveFrom: null }],
        workCalendarOverrides: [],
        monthlyConditions: {},
      }],
    }
    const imported = parseImportedState(serializeState(state))
    expect(imported.roster?.name).toBe('Ward')
    expect(imported.people).toHaveLength(1)
    expect(imported.holidayPeriods.length).toBeGreaterThan(0)
  })

  it('rejects a file that is not Kalender state', () => {
    expect(() => parseImportedState('{"hello":true}')).toThrow()
    expect(() => parseImportedState('not-json')).toThrow()
  })

  it('treats a roster as existing data that needs a replace warning', () => {
    expect(hasExistingData(empty)).toBe(false)
    expect(hasExistingData({
      ...empty,
      roster: {
        id: 'r1',
        name: 'Ward',
        defaultWorkingWeekdays: [1],
        historyStartDate: '2026-01-01',
        weekendHolidayDefault: true,
        restPolicies: [],
        staffingPolicies: [],
      },
    })).toBe(true)
  })
})
