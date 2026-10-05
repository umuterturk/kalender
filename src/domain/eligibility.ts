/**
 * Person eligibility for a given date and plan context.
 *
 * Two distinct concepts:
 *  1. Fairness eligibility – who accrues expected share (membership + capacity + not on vacation)
 *  2. Scheduling feasibility – who the optimizer can assign (adds rest, monthly-max, qualifications)
 */

import type {
  IsoDate, Person, Roster, Assignment, LeaveObligation,
  MonthlyConditions, DateRange, PreferenceType
} from './types'
import {
  monthOf, addDays, formatDateShort
} from './calendar'
import type { CalendarDateOverride } from './types'

export type IneligibleReason =
  | 'not-member'
  | 'unavailable'
  | 'rest-obligation'
  | 'monthly-max'
  | 'locked-other'
  | 'qualification'

export interface EligibilityResult {
  personId: string
  eligible: boolean
  reasons: IneligibleReason[]
}

// ─── Membership ─────────────────────────────────────────────────────────────

/** Is person active on a given date? */
export function isMemberOn(person: Person, date: IsoDate): boolean {
  return person.memberships.some(m =>
    m.activeFrom <= date && (m.inactiveFrom === null || date < m.inactiveFrom)
  )
}

// ─── Vacation ───────────────────────────────────────────────────────────────

/** Is the person on vacation on a date (stored as unavailableRanges)? */
export function isOnVacation(person: Person, date: IsoDate): boolean {
  const month = monthOf(date)
  const cond = person.monthlyConditions[month]
  if (!cond) return false
  return cond.unavailableRanges.some(r => date >= r.from && date <= r.to)
}

/** Does this person hold the required qualification for a duty? No requirement ⇒ everyone qualifies. */
export function holdsQualification(person: Person, required?: string): boolean {
  if (!required) return true
  return (person.qualifications ?? []).includes(required)
}

/** Alias for isOnVacation — vacation is the only hard unavailability gate. */
export function isUnavailableOn(person: Person, date: IsoDate): boolean {
  return isOnVacation(person, date)
}

// ─── Preferences ────────────────────────────────────────────────────────────

const EMPTY_CONDITIONS: MonthlyConditions = {
  unavailableRanges: [],
  preferredDates: [],
  avoidedDates: [],
  requiredMin: 0,
  max: null,
}

/** Get the preference for a person on a specific date. */
export function getPreference(person: Person, date: IsoDate): PreferenceType | null {
  // New-style per-date preferences take priority
  if (person.datePreferences?.[date]) return person.datePreferences[date]
  // Fall back to legacy MonthlyConditions fields
  const month = monthOf(date)
  const cond = person.monthlyConditions[month]
  if (!cond) return null
  if (cond.preferredDates?.includes(date)) return 'WANT'
  if (cond.avoidedDates?.includes(date)) return 'AVOID'
  return null
}

/** Numeric rank for preference sorting (lower = more preferred). */
export function preferenceRank(pref: PreferenceType | null): number {
  switch (pref) {
    case 'HAVE': return 0
    case 'WANT': return 1
    case 'PREFER': return 2
    case null: return 3    // NEUTRAL
    case 'AVOID': return 4
  }
}

/** @deprecated Use getPreference. */
export function isPreferredOn(person: Person, date: IsoDate): boolean {
  const p = getPreference(person, date)
  return p === 'HAVE' || p === 'WANT' || p === 'PREFER'
}

/** @deprecated Use getPreference. */
export function isAvoidedOn(person: Person, date: IsoDate): boolean {
  return getPreference(person, date) === 'AVOID'
}

// ─── Preference mutation helpers ─────────────────────────────────────────────

/** True if the person has a preference on any date in YYYY-MM. */
export function hasMonthPreferences(person: Person, month: string): boolean {
  if (Object.keys(person.datePreferences ?? {}).some(date => date.startsWith(month))) return true
  const cond = person.monthlyConditions[month]
  return (cond?.preferredDates?.length ?? 0) > 0 || (cond?.avoidedDates?.length ?? 0) > 0
}

/** Remove date preferences for every day in YYYY-MM. Vacation ranges stay. */
export function withoutMonthPreferences(person: Person, month: string): Person {
  const prefs = { ...(person.datePreferences ?? {}) }
  for (const date of Object.keys(prefs)) {
    if (date.startsWith(month)) delete prefs[date]
  }
  const cond = person.monthlyConditions[month]
  return {
    ...person,
    datePreferences: prefs,
    monthlyConditions: cond
      ? {
          ...person.monthlyConditions,
          [month]: { ...cond, preferredDates: [], avoidedDates: [] },
        }
      : person.monthlyConditions,
  }
}

/** Set a preference on a person for a specific date (null removes it). */
export function withPreference(person: Person, date: IsoDate, pref: PreferenceType | null): Person {
  const prefs = { ...(person.datePreferences ?? {}) }
  if (pref === null) {
    delete prefs[date]
  } else {
    prefs[date] = pref
  }
  return { ...person, datePreferences: prefs }
}

/** Add or remove a single-day prohibition. Longer ranges that contain the date are split. */
export function withDateProhibition(person: Person, date: IsoDate, prohibited: boolean): Person {
  const month = monthOf(date)
  const cond = person.monthlyConditions[month] ?? EMPTY_CONDITIONS
  let ranges = cond.unavailableRanges

  if (prohibited) {
    if (!ranges.some(r => date >= r.from && date <= r.to)) {
      ranges = [...ranges, { from: date, to: date }]
    }
  } else {
    ranges = ranges.flatMap(r => {
      if (date < r.from || date > r.to) return [r]
      const parts: DateRange[] = []
      if (r.from < date) parts.push({ from: r.from, to: addDays(date, -1) })
      if (r.to > date) parts.push({ from: addDays(date, 1), to: r.to })
      return parts
    })
  }

  return {
    ...person,
    monthlyConditions: {
      ...person.monthlyConditions,
      [month]: { ...cond, unavailableRanges: ranges },
    },
  }
}

/** Vacation on or off for one date. */
export function withVacation(person: Person, date: IsoDate, on: boolean): Person {
  const next = withDateProhibition(person, date, on)
  if (!on) return next
  // Turning on vacation clears preferences for that date
  return withPreference(next, date, null)
}

/** @deprecated Use withPreference(person, date, 'AVOID') instead. */
export function withAvoidedDate(person: Person, date: IsoDate, avoided: boolean): Person {
  const base = avoided ? withDateProhibition(person, date, false) : person
  return withPreference(base, date, avoided ? 'AVOID' : null)
}

/** @deprecated Use withPreference(person, date, 'WANT') instead. */
export function withPreferredDate(person: Person, date: IsoDate, wanted: boolean): Person {
  const cleared = wanted ? withDateProhibition(person, date, false) : person
  return withPreference(cleared, date, wanted ? 'WANT' : null)
}

// ─── Assignment counts ───────────────────────────────────────────────────────

/** Count assignments to person in a given month from a draft. */
export function countAssignmentsInMonth(
  personId: string,
  month: string,
  assignments: Assignment[]
): number {
  return assignments.filter(a => {
    const owner = a.allocatedTo ?? a.personId ?? ''
    return owner === personId && monthOf(a.date) === month
  }).length
}

// ─── Rest obligation ─────────────────────────────────────────────────────────

/** Is person under a rest obligation on this date? */
export function hasRestObligationOn(
  personId: string,
  date: IsoDate,
  leaves: LeaveObligation[]
): boolean {
  return leaves.some(l =>
    l.personId === personId && (
      l.immediateRestDate === date ||
      l.compensatoryLeaveDate === date
    )
  )
}

// ─── Full eligibility for display ────────────────────────────────────────────

/** Compute eligibility for a person on a date within a plan revision context. */
export function computeEligibility(
  person: Person,
  date: IsoDate,
  draftAssignments: Assignment[],
  leaves: LeaveObligation[],
  lockedDate: string | null,
  _roster: Roster
): EligibilityResult {
  const reasons: IneligibleReason[] = []

  if (!isMemberOn(person, date)) reasons.push('not-member')
  if (isUnavailableOn(person, date)) reasons.push('unavailable')
  if (hasRestObligationOn(person.id, date, leaves)) reasons.push('rest-obligation')

  const month = monthOf(date)
  const cond = person.monthlyConditions[month]
  const max = cond?.max ?? null
  if (max !== null) {
    const count = countAssignmentsInMonth(person.id, month, draftAssignments)
    if (count >= max) reasons.push('monthly-max')
  }

  if (lockedDate) reasons.push('locked-other')

  return {
    personId: person.id,
    eligible: reasons.length === 0,
    reasons,
  }
}

// ─── Scored candidate (for display panels) ───────────────────────────────────

export interface ScoredCandidate {
  personId: string
  rollingDeviation: number
  isPreferred: boolean
  isAvoided: boolean
  monthShifts: number
  lastShiftGap: number
}

export function candidateReason(scored: ScoredCandidate): string {
  if (scored.isPreferred) return 'Preferred this date'
  if (scored.rollingDeviation < -0.5) return 'Largest workload deficit'
  if (scored.rollingDeviation < 0) return 'Under fair-share target'
  if (scored.rollingDeviation > 0.5) return 'Over fair-share target'
  return 'Near fair-share target'
}

export interface DateBlock {
  personId: string
  name: string
  reason: string
}

/** Why each person can or cannot take an unassigned date. */
export function explainDateBlocks(
  date: IsoDate,
  people: Person[],
  leaves: LeaveObligation[],
  assignments: Assignment[],
): { blocks: DateBlock[]; eligibleNames: string[] } {
  const blocks: DateBlock[] = []
  const eligibleNames: string[] = []

  for (const person of people) {
    const reasons: string[] = []
    if (!isMemberOn(person, date)) {
      const nextJoin = person.memberships.map(m => m.activeFrom).filter(d => d > date).sort()[0]
      const leftDates = person.memberships
        .map(m => m.inactiveFrom)
        .filter((d): d is IsoDate => !!d && d <= date)
        .sort()
      const left = leftDates[leftDates.length - 1]
      if (nextJoin && (!left || nextJoin >= left)) reasons.push(`joins ${formatDateShort(nextJoin)}`)
      else if (left) reasons.push(`membership ended ${formatDateShort(left)}`)
      else reasons.push('not a member')
    }
    if (isOnVacation(person, date)) reasons.push('on vacation')
    const rest = leaves.find(l =>
      l.personId === person.id && (l.immediateRestDate === date || l.compensatoryLeaveDate === date)
    )
    if (rest) {
      reasons.push(
        rest.compensatoryLeaveDate === date
          ? `compensatory leave from ${formatDateShort(rest.shiftDate)}`
          : `rest after ${formatDateShort(rest.shiftDate)}`
      )
    }
    const cond = person.monthlyConditions[monthOf(date)]
    const max = cond?.max ?? null
    if (max !== null && countAssignmentsInMonth(person.id, monthOf(date), assignments) >= max) {
      reasons.push(`monthly limit of ${max} reached`)
    }
    if (reasons.length === 0) eligibleNames.push(person.name)
    else blocks.push({ personId: person.id, name: person.name, reason: reasons.join(', ') })
  }

  return { blocks, eligibleNames }
}

export function ineligibleReason(reasons: IneligibleReason[]): string {
  const map: Record<IneligibleReason, string> = {
    'not-member':      'Not a roster member on this date',
    'unavailable':     'Marked unavailable',
    'rest-obligation': 'On rest / leave today',
    'monthly-max':     'Monthly shift limit reached',
    'locked-other':    'Date locked to another person',
    'qualification':   'Does not hold required qualification',
  }
  return reasons.map(r => map[r]).join('; ')
}
