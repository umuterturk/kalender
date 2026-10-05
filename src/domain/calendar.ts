/**
 * Calendar date utilities.
 * All calendar arithmetic uses YYYY-MM-DD strings and explicit month rules —
 * never a fixed 365-day approximation.
 */

import type { IsoDate, Roster, CalendarDateOverride, RestPolicy } from './types'

/** Parse a YYYY-MM-DD string into { y, m, d } (1-based). */
export function parseDate(d: IsoDate): { y: number; m: number; d: number } {
  const parts = d.split('-')
  return { y: +parts[0], m: +parts[1], d: +parts[2] }
}

/** Format { y, m, d } back to YYYY-MM-DD. */
export function fmtDate(y: number, m: number, d: number): IsoDate {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Add N calendar days to a date string. */
export function addDays(date: IsoDate, n: number): IsoDate {
  const js = new Date(date + 'T12:00:00')
  js.setDate(js.getDate() + n)
  return js.toISOString().slice(0, 10)
}

/** Subtract months from a date using calendar-month arithmetic.
 *  End-of-month clamping: if the result month is shorter, clamp to its last day. */
export function subtractMonths(date: IsoDate, n: number): IsoDate {
  const { y, m, d } = parseDate(date)
  let newM = m - n
  let newY = y
  while (newM <= 0) { newM += 12; newY -= 1 }
  const daysInNew = daysInMonth(newY, newM)
  return fmtDate(newY, newM, Math.min(d, daysInNew))
}

/** Number of days in month m (1-based) of year y. */
export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate()
}

/** All dates in a month, sorted ascending. */
export function monthDates(yyyymm: string): IsoDate[] {
  const [y, m] = yyyymm.split('-').map(Number)
  const days = daysInMonth(y, m)
  return Array.from({ length: days }, (_, i) => fmtDate(y, m, i + 1))
}

/** First date of a month. */
export function monthStart(yyyymm: string): IsoDate {
  return yyyymm + '-01'
}

/** Last date of a month. */
export function monthEnd(yyyymm: string): IsoDate {
  const [y, m] = yyyymm.split('-').map(Number)
  return fmtDate(y, m, daysInMonth(y, m))
}

/** Fairness window for a month plan: [E - 12 months, E).
 *  E = first day of the following month. */
export function fairnessWindow(yyyymm: string): { start: IsoDate; end: IsoDate } {
  const [y, m] = yyyymm.split('-').map(Number)
  // E = first day of next month
  let ey = y, em = m + 1
  if (em > 12) { em = 1; ey += 1 }
  const E = fmtDate(ey, em, 1)
  const start = subtractMonths(E, 12)
  return { start, end: E } // end is exclusive
}

/** Return the day-of-week (0=Sun…6=Sat) for a date string. */
export function dayOfWeek(date: IsoDate): number {
  return new Date(date + 'T12:00:00').getDay()
}

/** Is the date on a weekend (Sat=6 or Sun=0)? */
export function isWeekend(date: IsoDate): boolean {
  const d = dayOfWeek(date)
  return d === 0 || d === 6
}

/** Determine if a date is classified as a holiday. */
export function isHoliday(
  date: IsoDate,
  roster: Roster,
  overrides: CalendarDateOverride[]
): boolean {
  const override = overrides.find(o => o.date === date)
  if (override) {
    return override.holiday
  }
  if (roster.weekendHolidayDefault && isWeekend(date)) return true
  return false
}

/** Holiday source label for display. */
export function holidaySource(
  date: IsoDate,
  roster: Roster,
  overrides: CalendarDateOverride[]
): 'weekend-default' | 'explicit' | 'explicit-override-normal' | null {
  const override = overrides.find(o => o.date === date)
  if (override) {
    return override.holiday ? 'explicit' : 'explicit-override-normal'
  }
  if (roster.weekendHolidayDefault && isWeekend(date)) return 'weekend-default'
  return null
}

/** Find the effective rest policy for a date. */
export function effectiveRestPolicy(
  date: IsoDate,
  policies: RestPolicy[]
): RestPolicy | null {
  const sorted = [...policies].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
  return sorted.find(p => p.effectiveFrom <= date) ?? null
}

/** Is a date an ordinary working day per the roster default and person overrides? */
export function isOrdinaryWorkingDay(
  date: IsoDate,
  roster: Roster,
  personWorkCalendarOverrides: { date: IsoDate; working: boolean }[]
): boolean {
  const override = personWorkCalendarOverrides.find(o => o.date === date)
  if (override) return override.working
  return roster.defaultWorkingWeekdays.includes(dayOfWeek(date))
}

/** Compute the immediate rest date (shift date + 1 calendar day). */
export function immediateRestDate(shiftDate: IsoDate): IsoDate {
  return addDays(shiftDate, 1)
}

/** Compute compensatory leave date (next ordinary working day after immediateRest).
 *  Returns null if policy is calendar-only. */
export function compensatoryLeaveDate(
  immediateRest: IsoDate,
  roster: Roster,
  personOverrides: { date: IsoDate; working: boolean }[]
): IsoDate | null {
  // Find next ordinary working day after immediateRest
  let candidate = addDays(immediateRest, 1)
  for (let i = 0; i < 60; i++) {
    if (isOrdinaryWorkingDay(candidate, roster, personOverrides)) {
      return candidate
    }
    candidate = addDays(candidate, 1)
  }
  return null // shouldn't happen in practice
}

/** Compare two date strings: -1, 0, 1. */
export function cmpDate(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Is date in [start, end) (end exclusive)? */
export function inHalfOpenRange(date: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return date >= start && date < end
}

/** YYYY-MM from a date string. */
export function monthOf(date: IsoDate): string {
  return date.slice(0, 7)
}

/** Today's local calendar date, not the UTC date from toISOString. */
export function localToday(): IsoDate {
  const n = new Date()
  return fmtDate(n.getFullYear(), n.getMonth() + 1, n.getDate())
}

/** Format a month string for display, e.g. "October 2026". */
export function formatMonth(yyyymm: string, locale = 'en-US'): string {
  const [y, m] = yyyymm.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

/** Format a date for display, e.g. "Mon 3 Oct 2026". */
export function formatDateLong(date: IsoDate, locale = 'en-US'): string {
  return new Date(date + 'T12:00:00').toLocaleDateString(locale, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  })
}

/** Format a date briefly, e.g. "3 Oct". */
export function formatDateShort(date: IsoDate, locale = 'en-US'): string {
  return new Date(date + 'T12:00:00').toLocaleDateString(locale, {
    day: 'numeric', month: 'short'
  })
}

/** Previous month YYYY-MM. */
export function prevMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Next month YYYY-MM. */
export function nextMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  if (m === 12) return `${y + 1}-01`
  return `${y}-${String(m + 1).padStart(2, '0')}`
}
