import { addDays } from './calendar'
import type { CalendarDateOverride, CountryCode, HolidayPeriod } from './types'

export type { CountryCode }

export const TURKEY_HOLIDAY_PERIODS_2026: HolidayPeriod[] = [
  { id: 'tr-2026-new-year', label: 'Yılbaşı', start: '2026-01-01', end: '2026-01-01', officialKind: 'new-year' },
  { id: 'tr-2026-ramazan', label: 'Ramazan Bayramı', start: '2026-03-19', end: '2026-03-22', officialKind: 'ramazan' },
  { id: 'tr-2026-april-23', label: 'Ulusal Egemenlik ve Çocuk Bayramı', start: '2026-04-23', end: '2026-04-23', officialKind: 'april-23' },
  { id: 'tr-2026-may-1', label: 'Emek ve Dayanışma Günü', start: '2026-05-01', end: '2026-05-01', officialKind: 'may-1' },
  { id: 'tr-2026-may-19', label: 'Atatürk’ü Anma, Gençlik ve Spor Bayramı', start: '2026-05-19', end: '2026-05-19', officialKind: 'may-19' },
  { id: 'tr-2026-kurban', label: 'Kurban Bayramı', start: '2026-05-26', end: '2026-05-30', officialKind: 'kurban' },
  { id: 'tr-2026-july-15', label: 'Demokrasi ve Millî Birlik Günü', start: '2026-07-15', end: '2026-07-15', officialKind: 'july-15' },
  { id: 'tr-2026-august-30', label: 'Zafer Bayramı', start: '2026-08-30', end: '2026-08-30', officialKind: 'august-30' },
  { id: 'tr-2026-republic', label: 'Cumhuriyet Bayramı', start: '2026-10-28', end: '2026-10-29', officialKind: 'republic' },
]

export const TURKEY_HOLIDAY_PERIODS_2027: HolidayPeriod[] = [
  { id: 'tr-2027-new-year', label: 'Yılbaşı', start: '2027-01-01', end: '2027-01-01', officialKind: 'new-year' },
  { id: 'tr-2027-ramazan', label: 'Ramazan Bayramı', start: '2027-03-08', end: '2027-03-11', officialKind: 'ramazan' },
  { id: 'tr-2027-april-23', label: 'Ulusal Egemenlik ve Çocuk Bayramı', start: '2027-04-23', end: '2027-04-23', officialKind: 'april-23' },
  { id: 'tr-2027-may-1', label: 'Emek ve Dayanışma Günü', start: '2027-05-01', end: '2027-05-01', officialKind: 'may-1' },
  { id: 'tr-2027-may-19', label: 'Atatürk’ü Anma, Gençlik ve Spor Bayramı', start: '2027-05-19', end: '2027-05-19', officialKind: 'may-19' },
  { id: 'tr-2027-kurban', label: 'Kurban Bayramı', start: '2027-05-15', end: '2027-05-19', officialKind: 'kurban' },
  { id: 'tr-2027-july-15', label: 'Demokrasi ve Millî Birlik Günü', start: '2027-07-15', end: '2027-07-15', officialKind: 'july-15' },
  { id: 'tr-2027-august-30', label: 'Zafer Bayramı', start: '2027-08-30', end: '2027-08-30', officialKind: 'august-30' },
  { id: 'tr-2027-republic', label: 'Cumhuriyet Bayramı', start: '2027-10-28', end: '2027-10-29', officialKind: 'republic' },
]

export function periodsForCountry(country: CountryCode): HolidayPeriod[] {
  if (country === 'TR') return [...TURKEY_HOLIDAY_PERIODS_2026, ...TURKEY_HOLIDAY_PERIODS_2027]
  return []
}

export function datesInRange(start: string, end: string): string[] {
  if (!start) return []
  const last = end >= start ? end : start
  const dates: string[] = []
  let date = start
  for (let i = 0; i < 62 && date <= last; i++) {
    dates.push(date)
    date = addDays(date, 1)
  }
  return dates
}

export function expandHolidayPeriods(periods: HolidayPeriod[]): CalendarDateOverride[] {
  const byDate = new Map<string, CalendarDateOverride>()
  for (const period of periods) {
    for (const date of datesInRange(period.start, period.end || period.start)) {
      byDate.set(date, { date, holiday: true, label: period.label })
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function holidaysForCountry(country: CountryCode): CalendarDateOverride[] {
  return expandHolidayPeriods(periodsForCountry(country))
}

export function dateInPeriods(date: string, periods: HolidayPeriod[]): boolean {
  return periods.some(p => date >= p.start && date <= (p.end || p.start))
}

export function officialKindKey(period: HolidayPeriod): string | null {
  if (!period.officialKind) return null
  return `${period.officialKind}:${period.start.slice(0, 4)}`
}

export function mergeOfficialPeriods(
  existing: HolidayPeriod[],
  country: CountryCode,
): HolidayPeriod[] {
  const have = new Set(existing.map(officialKindKey).filter((k): k is string => !!k))
  const extras = periodsForCountry(country).filter(p => {
    const key = officialKindKey(p)
    return key ? !have.has(key) : false
  })
  return extras.length === 0 ? existing : [...existing, ...extras]
}

export function liftCustomHolidayOverrides(
  overrides: CalendarDateOverride[],
  periods: HolidayPeriod[],
): HolidayPeriod[] {
  const extras: HolidayPeriod[] = []
  for (const override of overrides) {
    if (!override.holiday) continue
    if (dateInPeriods(override.date, periods)) continue
    extras.push({
      id: `custom-${override.date}`,
      label: (override.label || override.date).trim(),
      start: override.date,
      end: override.date,
    })
  }
  return extras.length === 0 ? periods : [...periods, ...extras]
}

/** Keep forced-normal days; rebuild holiday:true days from periods. */
export function syncHolidayOverrides(
  overrides: CalendarDateOverride[],
  periods: HolidayPeriod[],
): CalendarDateOverride[] {
  const forcedNormal = overrides.filter(o => !o.holiday)
  const forcedDates = new Set(forcedNormal.map(o => o.date))
  const fromPeriods = expandHolidayPeriods(periods).filter(o => !forcedDates.has(o.date))
  return [...forcedNormal, ...fromPeriods]
}

export function seedHolidayState(
  periods: HolidayPeriod[] | undefined,
  overrides: CalendarDateOverride[] | undefined,
  country: CountryCode,
): { holidayPeriods: HolidayPeriod[]; calendarOverrides: CalendarDateOverride[] } {
  if (country !== 'TR') {
    const custom = (periods ?? []).filter(p => !p.officialKind)
    const lifted = liftCustomHolidayOverrides(overrides ?? [], custom)
    return {
      holidayPeriods: sortPeriods(lifted),
      calendarOverrides: syncHolidayOverrides(overrides ?? [], lifted),
    }
  }
  const merged = mergeOfficialPeriods(periods ?? [], country)
  const lifted = liftCustomHolidayOverrides(overrides ?? [], merged)
  return {
    holidayPeriods: sortPeriods(lifted),
    calendarOverrides: syncHolidayOverrides(overrides ?? [], lifted),
  }
}

export function sortPeriods(periods: HolidayPeriod[]): HolidayPeriod[] {
  return [...periods].sort((a, b) => a.start.localeCompare(b.start) || a.label.localeCompare(b.label))
}

export function groupPeriodsByYear(
  periods: HolidayPeriod[],
): { year: string; items: HolidayPeriod[] }[] {
  const years = new Map<string, HolidayPeriod[]>()
  for (const period of sortPeriods(periods)) {
    const year = period.start.slice(0, 4)
    const list = years.get(year) ?? []
    list.push(period)
    years.set(year, list)
  }
  return [...years.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, items]) => ({ year, items }))
}

/** @deprecated Day-by-day catalog; prefer periodsForCountry. */
export const TURKEY_HOLIDAYS_2026 = expandHolidayPeriods(TURKEY_HOLIDAY_PERIODS_2026)
/** @deprecated Day-by-day catalog; prefer periodsForCountry. */
export const TURKEY_HOLIDAYS_2027 = expandHolidayPeriods(TURKEY_HOLIDAY_PERIODS_2027)

/** Add official holidays that are not already overridden. */
export function mergeOfficialHolidays(
  existing: CalendarDateOverride[],
  country: CountryCode,
): CalendarDateOverride[] {
  return seedHolidayState([], existing, country).calendarOverrides
}
