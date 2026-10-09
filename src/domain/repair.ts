/**
 * Minimum-change repair.
 *
 * The repair pass:
 *  1. Keeps every assignment that is still feasible — including manual
 *     assignments even when they break rest or other scheduling rules.
 *  2. Clears assignments that violate structural membership (person left roster).
 *  3. Re-runs the greedy generator on the uncovered dates only.
 *  4. Reports which dates changed and whether warning counts moved.
 *
 * Manual assignments are never cleared by the repair pass.
 */

import type {
  IsoDate, Person, Roster, Assignment, PlanRevision, CalendarDateOverride,
  LeaveObligation, ActualShift, ScheduleWarning
} from './types'
import { isMemberOn, isUnavailableOn, hasRestObligationOn, isAvoidedOn } from './eligibility'
import { monthDates, requiredHeadcount } from './calendar'
import { deriveAssignmentLeaves, mergeLeaves, deriveActualLeaves } from './leave'
import { generatePlan } from './generate'

export interface RepairResult {
  assignments: Assignment[]
  leaves: LeaveObligation[]
  changedDates: ChangedDate[]
  outcomeStatus: 'feasible-best-found' | 'proven-infeasible'
  infeasibleDates: IsoDate[]
  /** Structured warnings from the resulting schedule. */
  warnings: ScheduleWarning[]
}

export interface ChangedDate {
  date: IsoDate
  previousPersonId: string | null
  newPersonId: string | null
  reason: string
}

export function repairPlan(
  publishedRevision: PlanRevision,
  people: Person[],
  roster: Roster,
  overrides: CalendarDateOverride[],
  existingActuals: ActualShift[],
  currentLeaves: LeaveObligation[],
  seed: string,
  priorAssignments: Assignment[] = [],
): RepairResult {
  const month = publishedRevision.month
  const published = publishedRevision.assignments

  const brokenDates: IsoDate[] = []
  const stillFeasibleLocked: Assignment[] = []
  const changedDates: ChangedDate[] = []

  const actualLeaves = deriveActualLeaves(existingActuals, roster, people)

  for (const a of published) {
    const owner = a.allocatedTo ?? a.personId ?? ''
    const person = people.find(p => p.id === owner)

    if (!person) {
      brokenDates.push(a.date)
      changedDates.push({
        date: a.date,
        previousPersonId: owner,
        newPersonId: null,
        reason: 'Person no longer exists',
      })
      continue
    }

    // Manual assignments: only clear if person is no longer a member.
    // Keep them even if rest/vacation rules are violated.
    if (a.source === 'manual' || a.locked) {
      if (!isMemberOn(person, a.date)) {
        brokenDates.push(a.date)
        changedDates.push({
          date: a.date,
          previousPersonId: owner,
          newPersonId: null,
          reason: 'Membership ended',
        })
      } else {
        stillFeasibleLocked.push(a)
      }
      continue
    }

    // Auto assignments: clear if membership, vacation, hard avoid, or rest is broken
    const broken =
      !isMemberOn(person, a.date) ||
      isUnavailableOn(person, a.date) ||
      isAvoidedOn(person, a.date) ||
      hasRestObligationOn(owner, a.date, mergeLeaves(actualLeaves, currentLeaves))

    if (broken) {
      brokenDates.push(a.date)
      changedDates.push({
        date: a.date,
        previousPersonId: owner,
        newPersonId: null,
        reason: !isMemberOn(person, a.date)
          ? 'Membership ended'
          : isUnavailableOn(person, a.date)
            ? 'Now unavailable'
            : isAvoidedOn(person, a.date)
              ? 'Hard avoid'
              : 'Rest obligation conflict',
      })
    } else {
      stillFeasibleLocked.push(a)
    }
  }

  const result = generatePlan(
    month, people, roster, overrides, existingActuals,
    stillFeasibleLocked, currentLeaves, seed, priorAssignments,
  )

  for (const newA of result.assignments) {
    const owner = newA.allocatedTo ?? newA.personId ?? ''
    const wasKept = stillFeasibleLocked.some(a =>
      a.date === newA.date && (a.allocatedTo ?? a.personId ?? '') === owner
    )
    if (wasKept) continue
    const oldOwners = published
      .filter(a => a.date === newA.date)
      .map(a => a.allocatedTo ?? a.personId ?? '')
    if (oldOwners.includes(owner)) continue
    const alreadyRecorded = changedDates.find(c => c.date === newA.date && !c.newPersonId)
    if (alreadyRecorded) {
      alreadyRecorded.newPersonId = owner
    } else if (!changedDates.some(c => c.date === newA.date && c.newPersonId === owner)) {
      const previous = oldOwners.find(id => !result.assignments.some(a =>
        a.date === newA.date && (a.allocatedTo ?? a.personId ?? '') === id
      )) ?? null
      changedDates.push({
        date: newA.date,
        previousPersonId: previous,
        newPersonId: owner,
        reason: 'Reassigned to improve feasibility / fairness',
      })
    }
  }

  const infeasibleDates = result.warnings
    .filter(w => w.type === 'NO_COVERAGE')
    .map(w => w.date)

  return {
    assignments: result.assignments,
    leaves: result.leaves,
    changedDates,
    outcomeStatus: result.outcomeStatus,
    infeasibleDates,
    warnings: result.warnings,
  }
}

/**
 * Iterative resolve for a draft revision:
 * drop assignments that break structural membership, leave them uncovered,
 * then re-generate. Repeat until stable.
 */
export function resolveMonth(
  revision: PlanRevision,
  people: Person[],
  roster: Roster,
  overrides: CalendarDateOverride[],
  existingActuals: ActualShift[],
  outsideLeaves: LeaveObligation[],
  priorAssignments: Assignment[] = [],
): RepairResult {
  let assignments = revision.assignments
  let leaves = outsideLeaves
  const originalOwners = (date: IsoDate) => revision.assignments
    .filter(a => a.date === date)
    .map(a => a.allocatedTo ?? a.personId ?? '')
    .filter(Boolean)
    .sort()
    .join(',')

  for (let pass = 0; pass < 12; pass++) {
    const actualLeaves = deriveActualLeaves(existingActuals, roster, people)
    const assignmentLeaves = deriveAssignmentLeaves(assignments, roster, people)
    leaves = mergeLeaves(mergeLeaves(actualLeaves, outsideLeaves), assignmentLeaves)

    const broken = new Set<string>()
    for (const a of assignments) {
      if (a.locked) continue
      const owner = a.allocatedTo ?? a.personId ?? ''
      const person = people.find(p => p.id === owner)
      const restFromElsewhere = leaves.filter(l => l.shiftDate !== a.date)
      // For manual assignments, only break on membership loss
      const isManual = a.source === 'manual'
      const violates = !person
        || !isMemberOn(person, a.date)
        || (!isManual && (
          isUnavailableOn(person, a.date) ||
          isAvoidedOn(person, a.date) ||
          hasRestObligationOn(owner, a.date, restFromElsewhere)
        ))
      if (violates) broken.add(`${a.date}:${owner}`)
    }

    if (broken.size === 0) break

    const keep = assignments.filter(a => !broken.has(`${a.date}:${a.allocatedTo ?? a.personId ?? ''}`))
    const filled = generatePlan(
      revision.month, people, roster, overrides, existingActuals, keep,
      mergeLeaves(actualLeaves, outsideLeaves),
      revision.tiebreakerSeed || 'resolve',
      priorAssignments,
    )
    const same = filled.assignments.length === assignments.length
      && filled.assignments.every(a => assignments.some(b =>
        b.date === a.date && (b.allocatedTo ?? b.personId) === (a.allocatedTo ?? a.personId)
      ))
    assignments = filled.assignments
    leaves = filled.leaves
    if (same) break
  }

  const changedDates: ChangedDate[] = []
  const allDates = new Set<IsoDate>([
    ...revision.assignments.map(a => a.date),
    ...assignments.map(a => a.date),
  ])
  for (const date of allDates) {
    const origOwner = originalOwners(date) || null
    const newOwner = assignments
      .filter(a => a.date === date)
      .map(a => a.allocatedTo ?? a.personId ?? '')
      .filter(Boolean)
      .sort()
      .join(',') || null
    if (origOwner !== newOwner) {
      changedDates.push({ date, previousPersonId: origOwner, newPersonId: newOwner, reason: 'Resolved' })
    }
  }

  const infeasibleDates = monthDates(revision.month).filter(d => {
    if (d < roster.historyStartDate) return false
    const ids = new Set<string>()
    for (const a of assignments) {
      if (a.date !== d) continue
      const id = a.allocatedTo ?? a.personId ?? ''
      if (id) ids.add(id)
    }
    for (const actual of existingActuals) {
      if (actual.date !== d || actual.status === 'cancelled') continue
      const id = actual.plannedPersonId ?? actual.actualPersonId
      if (id) ids.add(id)
    }
    return ids.size < requiredHeadcount(d, roster)
  })

  return {
    assignments,
    leaves,
    changedDates,
    outcomeStatus: infeasibleDates.length === 0 ? 'feasible-best-found' : 'proven-infeasible',
    infeasibleDates,
    warnings: infeasibleDates.map(d => ({
      type: 'NO_COVERAGE' as const,
      severity: 'warning' as const,
      date: d,
      message: `No assignment for ${d}`,
    })),
  }
}
