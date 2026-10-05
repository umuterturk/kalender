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
import { monthDates } from './calendar'
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
    const wasLocked = stillFeasibleLocked.find(a => a.date === newA.date)
    if (!wasLocked) {
      const owner = newA.allocatedTo ?? newA.personId ?? ''
      const oldA = published.find(a => a.date === newA.date)
      const oldOwner = oldA ? (oldA.allocatedTo ?? oldA.personId ?? '') : null
      if (oldOwner && oldOwner !== owner) {
        const alreadyRecorded = changedDates.find(c => c.date === newA.date)
        if (!alreadyRecorded) {
          changedDates.push({
            date: newA.date,
            previousPersonId: oldOwner,
            newPersonId: owner,
            reason: 'Reassigned to improve feasibility / fairness',
          })
        } else {
          alreadyRecorded.newPersonId = owner
        }
      }
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
  const original = new Map(revision.assignments.map(a => [a.date, a.allocatedTo ?? a.personId ?? '']))

  for (let pass = 0; pass < 12; pass++) {
    const actualLeaves = deriveActualLeaves(existingActuals, roster, people)
    const assignmentLeaves = deriveAssignmentLeaves(assignments, roster, people)
    leaves = mergeLeaves(mergeLeaves(actualLeaves, outsideLeaves), assignmentLeaves)

    const broken = new Set<IsoDate>()
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
      if (violates) broken.add(a.date)
    }

    if (broken.size === 0) break

    const keep = assignments.filter(a => !broken.has(a.date))
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
  const allDates = new Set<IsoDate>([...original.keys(), ...assignments.map(a => a.date)])
  for (const date of allDates) {
    const origOwner = original.get(date) ?? null
    const newA = assignments.find(a => a.date === date)
    const newOwner = newA ? (newA.allocatedTo ?? newA.personId ?? '') : null
    if (origOwner !== newOwner) {
      changedDates.push({ date, previousPersonId: origOwner, newPersonId: newOwner, reason: 'Resolved' })
    }
  }

  // Build a draft revision to derive warnings
  const infeasibleDates = monthDates(revision.month).filter(d => {
    const covered = assignments.some(a => a.date === d)
    const actual = existingActuals.some(a => a.date === d && a.status !== 'cancelled')
    return !covered && !actual
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
