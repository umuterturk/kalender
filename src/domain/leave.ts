/**
 * Leave obligation derivation.
 * Computes immediate rest dates and compensatory leave days from assignments/actuals.
 */

import type {
  IsoDate, Assignment, ActualShift, LeaveObligation, Roster, Person, PlanRevision
} from './types'
import {
  immediateRestDate as calcImmediateRest,
  compensatoryLeaveDate,
  isOrdinaryWorkingDay,
  effectiveRestPolicy,
  prevMonth,
} from './calendar'
import { nanoid } from '../lib/nanoid'

/** Derive leave obligations for a set of assignments. */
export function deriveAssignmentLeaves(
  assignments: Assignment[],
  roster: Roster,
  people: Person[]
): LeaveObligation[] {
  const restPolicy = getLatestRestPolicy(roster)
  if (!restPolicy || !isRestActive(restPolicy)) return []

  const leaves: LeaveObligation[] = []
  for (const a of assignments) {
    const ownerId = a.allocatedTo ?? a.personId ?? ''
    const person = people.find(p => p.id === ownerId)
    if (!person) continue

    const policy = effectiveRestPolicy(a.date, roster.restPolicies)
    if (!policy || !isRestActive(policy)) continue

    const immediateRest = calcImmediateRest(a.date)
    let compLeave: IsoDate | null = null

    if (policy.nonworkingTreatment === 'next-working') {
      const personOverrides = person.workCalendarOverrides
      const immediateIsWorking = isOrdinaryWorkingDay(immediateRest, roster, personOverrides)
      if (!immediateIsWorking) {
        compLeave = compensatoryLeaveDate(immediateRest, roster, personOverrides)
      }
    }

    leaves.push({
      id: nanoid(),
      sourceType: 'assignment',
      sourceId: a.date + ':' + ownerId,
      personId: ownerId,
      shiftDate: a.date,
      immediateRestDate: immediateRest,
      compensatoryLeaveDate: compLeave,
      confirmed: false,
    })
  }
  return leaves
}

/** Derive leave obligations for actual shifts (confirmed). */
export function deriveActualLeaves(
  actuals: ActualShift[],
  roster: Roster,
  people: Person[]
): LeaveObligation[] {
  const leaves: LeaveObligation[] = []
  for (const actual of actuals) {
    if (actual.status === 'cancelled') continue
    const person = people.find(p => p.id === actual.actualPersonId)
    if (!person) continue

    const policy = effectiveRestPolicy(actual.date, roster.restPolicies)
    if (!policy || !isRestActive(policy)) continue

    const immediateRest = calcImmediateRest(actual.date)
    let compLeave: IsoDate | null = null

    if (policy.nonworkingTreatment === 'next-working') {
      const personOverrides = person.workCalendarOverrides
      const immediateIsWorking = isOrdinaryWorkingDay(immediateRest, roster, personOverrides)
      if (!immediateIsWorking) {
        compLeave = compensatoryLeaveDate(immediateRest, roster, personOverrides)
      }
    }

    leaves.push({
      id: actual.id + '-leave',
      sourceType: 'actual',
      sourceId: actual.id,
      personId: actual.actualPersonId,
      shiftDate: actual.date,
      immediateRestDate: immediateRest,
      compensatoryLeaveDate: compLeave,
      confirmed: true,
    })
  }
  return leaves
}

/** Rest created by the previous month's plan that lands in this month, including the 1st. */
export function previousMonthRestLeaves(
  revisions: PlanRevision[],
  month: string,
  roster: Roster,
  people: Person[],
): LeaveObligation[] {
  const prev = prevMonth(month)
  const prevPlans = revisions.filter(r => r.month === prev)
  const prevPlan = prevPlans[prevPlans.length - 1]
  if (!prevPlan) return []
  const start = month + '-01'
  return deriveAssignmentLeaves(prevPlan.assignments, roster, people).filter(l =>
    l.immediateRestDate >= start || (l.compensatoryLeaveDate !== null && l.compensatoryLeaveDate >= start)
  )
}

function getLatestRestPolicy(roster: Roster) {
  if (!roster.restPolicies.length) return null
  return [...roster.restPolicies].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
}

function isRestActive(policy: { enabled: boolean; nonworkingTreatment: string }): boolean {
  return policy.enabled && policy.nonworkingTreatment !== 'none'
}

/** Merge actual leaves (confirmed) and assignment leaves (projected),
 *  with actuals taking priority for the same person+date. */
export function mergeLeaves(
  actualLeaves: LeaveObligation[],
  assignmentLeaves: LeaveObligation[]
): LeaveObligation[] {
  // Deduplicate: for the same person+shiftDate, prefer the actual-sourced one
  const map = new Map<string, LeaveObligation>()
  for (const l of assignmentLeaves) {
    map.set(l.personId + ':' + l.shiftDate, l)
  }
  for (const l of actualLeaves) {
    map.set(l.personId + ':' + l.shiftDate, l)
  }
  return Array.from(map.values())
}

/** Count useful leave days for a person on a given date (for fairness targets). */
export function usefulLeaveDays(leave: LeaveObligation, roster: Roster, person: Person): number {
  let count = 0
  // Immediate rest day: count if it would have been a working day
  const personOverrides = person.workCalendarOverrides
  if (isOrdinaryWorkingDay(leave.immediateRestDate, roster, personOverrides)) {
    count += 1
  }
  if (leave.compensatoryLeaveDate !== null) {
    count += 1
  }
  return count
}
