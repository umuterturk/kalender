import type { CalendarDateOverride } from './types'

export type CountryCode = 'TR'

/** Official public holidays for Turkey, 2026 (full days + arefe). */
export const TURKEY_HOLIDAYS_2026: CalendarDateOverride[] = [
  { date: '2026-01-01', holiday: true, label: 'Yılbaşı' },
  { date: '2026-03-19', holiday: true, label: 'Ramazan Bayramı Arefesi' },
  { date: '2026-03-20', holiday: true, label: 'Ramazan Bayramı 1. gün' },
  { date: '2026-03-21', holiday: true, label: 'Ramazan Bayramı 2. gün' },
  { date: '2026-03-22', holiday: true, label: 'Ramazan Bayramı 3. gün' },
  { date: '2026-04-23', holiday: true, label: 'Ulusal Egemenlik ve Çocuk Bayramı' },
  { date: '2026-05-01', holiday: true, label: 'Emek ve Dayanışma Günü' },
  { date: '2026-05-19', holiday: true, label: 'Atatürk’ü Anma, Gençlik ve Spor Bayramı' },
  { date: '2026-05-26', holiday: true, label: 'Kurban Bayramı Arefesi' },
  { date: '2026-05-27', holiday: true, label: 'Kurban Bayramı 1. gün' },
  { date: '2026-05-28', holiday: true, label: 'Kurban Bayramı 2. gün' },
  { date: '2026-05-29', holiday: true, label: 'Kurban Bayramı 3. gün' },
  { date: '2026-05-30', holiday: true, label: 'Kurban Bayramı 4. gün' },
  { date: '2026-07-15', holiday: true, label: 'Demokrasi ve Millî Birlik Günü' },
  { date: '2026-08-30', holiday: true, label: 'Zafer Bayramı' },
  { date: '2026-10-28', holiday: true, label: 'Cumhuriyet Bayramı Arefesi' },
  { date: '2026-10-29', holiday: true, label: 'Cumhuriyet Bayramı' },
]

/** Official public holidays for Turkey, 2027 (full days + arefe). */
export const TURKEY_HOLIDAYS_2027: CalendarDateOverride[] = [
  { date: '2027-01-01', holiday: true, label: 'Yılbaşı' },
  { date: '2027-03-08', holiday: true, label: 'Ramazan Bayramı Arefesi' },
  { date: '2027-03-09', holiday: true, label: 'Ramazan Bayramı 1. gün' },
  { date: '2027-03-10', holiday: true, label: 'Ramazan Bayramı 2. gün' },
  { date: '2027-03-11', holiday: true, label: 'Ramazan Bayramı 3. gün' },
  { date: '2027-04-23', holiday: true, label: 'Ulusal Egemenlik ve Çocuk Bayramı' },
  { date: '2027-05-01', holiday: true, label: 'Emek ve Dayanışma Günü' },
  { date: '2027-05-15', holiday: true, label: 'Kurban Bayramı Arefesi' },
  { date: '2027-05-16', holiday: true, label: 'Kurban Bayramı 1. gün' },
  { date: '2027-05-17', holiday: true, label: 'Kurban Bayramı 2. gün' },
  { date: '2027-05-18', holiday: true, label: 'Kurban Bayramı 3. gün' },
  { date: '2027-05-19', holiday: true, label: 'Kurban Bayramı 4. gün / Atatürk’ü Anma, Gençlik ve Spor Bayramı' },
  { date: '2027-07-15', holiday: true, label: 'Demokrasi ve Millî Birlik Günü' },
  { date: '2027-08-30', holiday: true, label: 'Zafer Bayramı' },
  { date: '2027-10-28', holiday: true, label: 'Cumhuriyet Bayramı Arefesi' },
  { date: '2027-10-29', holiday: true, label: 'Cumhuriyet Bayramı' },
]

export function holidaysForCountry(country: CountryCode): CalendarDateOverride[] {
  if (country === 'TR') return [...TURKEY_HOLIDAYS_2026, ...TURKEY_HOLIDAYS_2027]
  return []
}

/** Add official holidays that are not already overridden. */
export function mergeOfficialHolidays(
  existing: CalendarDateOverride[],
  country: CountryCode,
): CalendarDateOverride[] {
  const have = new Set(existing.map(o => o.date))
  const extras = holidaysForCountry(country).filter(h => !have.has(h.date))
  return extras.length === 0 ? existing : [...existing, ...extras]
}
