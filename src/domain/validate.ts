/**
 * Schedule validation.
 *
 * Produces structured advisory warnings.
 *
 * Per the core design:
 *   - Fairness rules and scheduling policies are ADVISORY — they never block publish.
 *   - Only hard structural errors prevent saving: the same person twice on one
 *     shift, or assigning a non-member.
 *   - "No coverage" is a warning, not a block — the administrator may publish an
 *     incomplete schedule if they choose.
 *
 * Manual assignments always produce warnings but are never rejected.
 */

import type {
  IsoDate, Person, Roster, Assignment, PlanRevision, CalendarDateOverride,
  LeaveObligation, ActualShift, ScheduleWarning, WarningType, DutyRequirements
} from './types'
import { monthDates, monthOf, isHoliday, requiredHeadcount } from './calendar'
import {
  isMemberOn, isUnavailableOn, hasRestObligationOn, countAssignmentsInMonth,
  getPreference, holdsQualification
} from './eligibility'
import { classifyDay } from './fairness'
import type { FairnessReport } from './fairness'
import { addDays } from './calendar'

// ─── Hard error (save-time rejection) ────────────────────────────────────────

export interface HardError {
  date: IsoDate
  personId: string | null
  kind: 'duplicate-date' | 'not-member'
  message: string
}

// ─── Validation result ───────────────────────────────────────────────────────

export interface ValidationResult {
  /** True only if there are no hard structural errors. */
  valid: boolean
  /**
   * Publish is allowed as long as there are no hard errors.
   * Advisory warnings do not block publish — the administrator decides.
   */
  publishable: boolean
  /** Hard errors that prevent saving. */
  hardErrors: HardError[]
  /** Advisory warnings visible to the planner. */
  warnings: ScheduleWarning[]
}

// ─── Legacy compat aliases ───────────────────────────────────────────────────

/** @deprecated Use HardError. */
export type ConflictKind =
  | 'no-coverage'
  | 'not-member'
  | 'unavailable'
  | 'rest-violation'
  | 'monthly-max-exceeded'
  | 'monthly-min-shortfall'
  | 'lock-conflict'
  | 'duplicate-date'

/** @deprecated Use ScheduleWarning / HardError. */
export interface PlanConflict {
  date: IsoDate
  personId: string | null
  kind: ConflictKind
  message: string
  isHard: boolean
}

// ─── Main validation ─────────────────────────────────────────────────────────

export function validateRevision(
  revision: PlanRevision,
  people: Person[],
  roster: Roster,
  leaves: LeaveObligation[],
  overrides: CalendarDateOverride[],
  actuals?: ActualShift[],
  fairnessReport?: FairnessReport,
  dutyRequirements: DutyRequirements = {},
): ValidationResult {
  const hardErrors: HardError[] = []
  const warnings: ScheduleWarning[] = []

  const month = revision.month
  const dates = monthDates(month)
  const assignments = revision.assignments

  // ─── Hard error: one person filling two slots of the same shift ─────────

  const byDate = new Map<IsoDate, Assignment[]>()
  for (const a of assignments) {
    if (!byDate.has(a.date)) byDate.set(a.date, [])
    byDate.get(a.date)!.push(a)
  }
  for (const [date, as] of byDate) {
    const counts = new Map<string, number>()
    for (const a of as) {
      const id = a.allocatedTo ?? a.personId ?? ''
      if (!id) continue
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    for (const [personId, count] of counts) {
      if (count < 2) continue
      const person = people.find(p => p.id === personId)
      hardErrors.push({
        date,
        personId,
        kind: 'duplicate-date',
        message: person
          ? `${person.name} is assigned more than once on ${date}`
          : `Person ${personId} is assigned more than once on ${date}`,
      })
    }
  }

  // ─── Hard error: non-member assigned ─────────────────────────────────────

  for (const a of assignments) {
    const owner = a.allocatedTo ?? a.personId ?? ''
    const person = people.find(p => p.id === owner)
    // Days before history start are optional history, not roster-membership checks.
    if (a.date < roster.historyStartDate && person) continue
    if (!person || !isMemberOn(person, a.date)) {
      hardErrors.push({
        date: a.date,
        personId: owner,
        kind: 'not-member',
        message: person
          ? `${person.name} is not a roster member on ${a.date}`
          : `Person ${owner} not found`,
      })
    }
  }

  // ─── Advisory warnings ────────────────────────────────────────────────────

  // Short staffing — only days in the fairness/planning window.
  for (const date of dates) {
    if (date < roster.historyStartDate) continue
    const required = requiredHeadcount(date, roster, dutyRequirements)
    const ids = new Set<string>()
    for (const a of byDate.get(date) ?? []) {
      const id = a.allocatedTo ?? a.personId ?? ''
      if (id) ids.add(id)
    }
    for (const actual of actuals ?? []) {
      if (actual.date !== date || actual.status === 'cancelled') continue
      const id = actual.plannedPersonId ?? actual.actualPersonId
      if (id) ids.add(id)
    }
    if (ids.size < required) {
      warnings.push({
        type: 'NO_COVERAGE',
        severity: 'warning',
        date,
        message: `Shift on ${date} needs ${required} people; ${ids.size} assigned`,
        data: { required, filled: ids.size },
      })
    }
  }

  // Per-assignment warnings
  for (const a of assignments) {
    const owner = a.allocatedTo ?? a.personId ?? ''
    const person = people.find(p => p.id === owner)
    if (!person) continue // already a hard error

    // Unavailable (vacation) while assigned
    if (isUnavailableOn(person, a.date)) {
      warnings.push({
        type: 'UNAVAILABLE',
        severity: 'warning',
        date: a.date,
        personId: owner,
        message: `${person.name} is on vacation on ${a.date}`,
      })
    }

    // Rest violation
    if (hasRestObligationOn(owner, a.date, leaves)) {
      warnings.push({
        type: 'NEXT_DAY_OFF',
        severity: 'warning',
        date: a.date,
        personId: owner,
        message: `${person.name} has a rest obligation on ${a.date}`,
      })
    }

    // Consecutive shift check (two shifts with no rest day between them)
    const dayBefore = addDays(a.date, -1)
    const prevA = assignments.find(x => x.date === dayBefore && (x.allocatedTo ?? x.personId) === owner)
    if (prevA) {
      warnings.push({
        type: 'CONSECUTIVE_SHIFT',
        severity: 'warning',
        date: a.date,
        personId: owner,
        message: `${person.name} works consecutive shifts on ${dayBefore} and ${a.date}`,
      })
    }

    // Hard avoid overridden (manual assignment)
    const pref = getPreference(person, a.date)
    if (pref === 'AVOID') {
      warnings.push({
        type: 'AVOID_PREFERENCE',
        severity: 'warning',
        date: a.date,
        personId: owner,
        message: `${person.name} has a hard avoid on ${a.date} but was assigned manually`,
      })
    }

    // Qualification missing (advisory for manual; auto should have prevented this)
    const required = dutyRequirements[a.date]?.requiredQualification
    if (required && !holdsQualification(person, required)) {
      warnings.push({
        type: 'QUALIFICATION',
        severity: 'warning',
        date: a.date,
        personId: owner,
        message: `${person.name} does not hold required qualification "${required}" for ${a.date}`,
        data: { required },
      })
    }

    // Monthly max exceeded
    const monthCond = person.monthlyConditions[month]
    if (monthCond?.max !== null && monthCond?.max !== undefined) {
      const count = countAssignmentsInMonth(owner, month, assignments)
      if (count > monthCond.max) {
        warnings.push({
          type: 'MAX_SHIFT_COUNT',
          severity: 'warning',
          date: a.date,
          personId: owner,
          message: `${person.name} has ${count} shifts in ${month}, exceeds max ${monthCond.max}`,
          data: { count, max: monthCond.max },
        })
      }
    }
  }

  // Fairness warnings (if report available)
  if (fairnessReport) {
    for (const proj of fairnessReport.projections['365d']) {
      const person = people.find(p => p.id === proj.personId)
      if (!person) continue
      const buckets = (['NN', 'NH', 'HN', 'HH'] as const)
      for (const bucket of buckets) {
        const balance = proj[bucket].balance
        if (balance > 2) {
          warnings.push({
            type: 'OVER_FAIR_SHARE',
            severity: 'info',
            date: month + '-01',
            personId: proj.personId,
            message: `${person.name} is over fair share for ${bucket} shifts (balance ${balance.toFixed(2)})`,
            data: { bucket, balance },
          })
        } else if (balance < -2) {
          warnings.push({
            type: 'UNDER_FAIR_SHARE',
            severity: 'info',
            date: month + '-01',
            personId: proj.personId,
            message: `${person.name} is under fair share for ${bucket} shifts (balance ${balance.toFixed(2)})`,
            data: { bucket, balance },
          })
        }
      }
    }
  }

  const valid = hardErrors.length === 0
  const publishable = valid // advisory warnings do not block publish

  return { valid, publishable, hardErrors, warnings }
}

// ─── Convenience: compute warnings for a single proposed assignment ───────────

export interface AssignmentImpact {
  warnings: ScheduleWarning[]
  bucketBalanceBefore: number
  bucketBalanceAfter: number
  overallBalanceBefore: number
  overallBalanceAfter: number
}

export function assessAssignment(
  date: IsoDate,
  personId: string,
  person: Person,
  currentAssignments: Assignment[],
  leaves: LeaveObligation[],
  roster: Roster,
  overrides: CalendarDateOverride[],
  fairnessReport: FairnessReport | null,
): AssignmentImpact {
  const warnings: ScheduleWarning[] = []
  const dayType = classifyDay(date, roster, overrides)

  const proj = fairnessReport?.projections['365d'].find(p => p.personId === personId)

  const bucketBalanceBefore = proj ? proj[dayType].balance : 0
  const bucketBalanceAfter = bucketBalanceBefore + 1

  const overallBalanceBefore = proj
    ? (proj.NN.balance + proj.NH.balance + proj.HN.balance + proj.HH.balance)
    : 0
  const overallBalanceAfter = overallBalanceBefore + 1

  if (isUnavailableOn(person, date)) {
    warnings.push({ type: 'UNAVAILABLE', severity: 'warning', date, personId, message: `${person.name} is on vacation on ${date}` })
  }
  if (hasRestObligationOn(personId, date, leaves)) {
    warnings.push({ type: 'NEXT_DAY_OFF', severity: 'warning', date, personId, message: `${person.name} has a rest obligation on ${date}` })
  }
  const dayBefore = addDays(date, -1)
  if (currentAssignments.some(a => a.date === dayBefore && (a.allocatedTo ?? a.personId) === personId)) {
    warnings.push({ type: 'CONSECUTIVE_SHIFT', severity: 'warning', date, personId, message: `${person.name} would work consecutive shifts` })
  }
  const pref = getPreference(person, date)
  if (pref === 'AVOID') {
    warnings.push({
      type: 'AVOID_PREFERENCE',
      severity: 'warning',
      date,
      personId,
      message: `${person.name} has a hard avoid on ${date}`,
    })
  }
  if (bucketBalanceAfter > 2) {
    warnings.push({ type: 'OVER_FAIR_SHARE', severity: 'info', date, personId, message: `${person.name} would be over fair share for ${dayType}`, data: { balance: bucketBalanceAfter } })
  }

  return { warnings, bucketBalanceBefore, bucketBalanceAfter, overallBalanceBefore, overallBalanceAfter }
}
