import { describe, expect, it } from 'vitest'
import { desiredHolidayAction, isHoliday } from '../calendar'
import type { Roster } from '../types'

function roster(weekendHolidayDefault = true): Roster {
  return {
    id: 'r',
    name: 'Ward',
    defaultWorkingWeekdays: [1, 2, 3, 4, 5],
    historyStartDate: '2024-01-01',
    weekendHolidayDefault,
    restPolicies: [],
    staffingPolicies: [],
  }
}

describe('desiredHolidayAction', () => {
  it('marks a weekday as an official holiday', () => {
    const r = roster()
    expect(desiredHolidayAction('2026-10-05', r, [], true)).toEqual({
      kind: 'set',
      override: { date: '2026-10-05', holiday: true },
    })
  })

  it('clears an official weekday holiday back to normal', () => {
    const r = roster()
    const overrides = [{ date: '2026-10-29', holiday: true, label: 'Cumhuriyet Bayramı' }]
    expect(desiredHolidayAction('2026-10-29', r, overrides, false)).toEqual({ kind: 'remove' })
  })

  it('forces a weekend back to a normal day', () => {
    const r = roster()
    expect(isHoliday('2026-10-03', r, [])).toBe(true)
    expect(desiredHolidayAction('2026-10-03', r, [], false)).toEqual({
      kind: 'set',
      override: { date: '2026-10-03', holiday: false },
    })
  })

  it('does nothing when the day is already in the requested state', () => {
    const r = roster()
    expect(desiredHolidayAction('2026-10-05', r, [], false)).toEqual({ kind: 'noop' })
    expect(desiredHolidayAction('2026-10-03', r, [], true)).toEqual({ kind: 'noop' })
  })
})
