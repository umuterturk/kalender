import { describe, expect, it } from 'vitest'
import {
  expandHolidayPeriods,
  groupPeriodsByYear,
  seedHolidayState,
  syncHolidayOverrides,
} from '../holidays'

describe('public holiday periods', () => {
  it('lists each Turkey holiday type once per year with a start and end', () => {
    const { holidayPeriods } = seedHolidayState([], [], 'TR')
    const groups = groupPeriodsByYear(holidayPeriods)
    expect(groups.map(g => g.year)).toEqual(['2026', '2027'])
    const republic = groups[0].items.find(p => p.officialKind === 'republic')
    expect(republic).toMatchObject({
      label: 'Cumhuriyet Bayramı',
      start: '2026-10-28',
      end: '2026-10-29',
    })
    expect(groups[0].items).toHaveLength(9)
    expect(groups[0].items.every(p => p.start <= p.end)).toBe(true)
  })

  it('expands a range onto each calendar day', () => {
    const days = expandHolidayPeriods([
      { id: 'r', label: 'Cumhuriyet Bayramı', start: '2026-10-28', end: '2026-10-29' },
    ])
    expect(days.map(d => d.date)).toEqual(['2026-10-28', '2026-10-29'])
    expect(days.every(d => d.label === 'Cumhuriyet Bayramı')).toBe(true)
  })

  it('lets an official range grow when extra days are granted', () => {
    const { holidayPeriods } = seedHolidayState([], [], 'TR')
    const republic = holidayPeriods.find(p => p.officialKind === 'republic' && p.start.startsWith('2026'))
    expect(republic).toBeTruthy()
    const extended = holidayPeriods.map(p =>
      p.id === republic!.id ? { ...p, end: '2026-10-30' } : p
    )
    const overrides = syncHolidayOverrides([], extended)
    expect(overrides.some(o => o.date === '2026-10-30' && o.holiday)).toBe(true)
    expect(overrides.filter(o => o.date.startsWith('2026-10-2') || o.date === '2026-10-30').map(o => o.date))
      .toEqual(['2026-10-28', '2026-10-29', '2026-10-30'])
  })
})
