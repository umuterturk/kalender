/**
 * Kalender greedy scheduler.
 *
 * Priority order (lexicographic — earlier criteria dominate):
 *   1. Feasibility (hard constraints for optimizer)
 *   2. Long-term fairness (365-day bucket balance for the day's type)
 *   3. Holiday-block fairness (for duties inside long holiday blocks)
 *   4. Preferences (HAVE > WANT > PREFER > neutral; AVOID is a hard feasibility block)
 *   5. Overall recent fairness (sum of four 365-day balances)
 *   6. Stable person-id tie-break
 *
 * Manual assignments are never rejected.
 * The generator skips locked assignments and already-confirmed actuals.
 */

import type {
  IsoDate, Person, Roster, Assignment, PlanRevision, CalendarDateOverride,
  LeaveObligation, ActualShift, DayType, AssignmentExplanation, ScheduleWarning,
  DutyRequirements
} from './types'
import {
  monthDates, isHoliday, monthOf, fairnessWindow, addDays
} from './calendar'
import {
  isMemberOn, isUnavailableOn, hasRestObligationOn, countAssignmentsInMonth,
  getPreference, preferenceRank, holdsQualification, isAvoidedOn
} from './eligibility'
import { deriveAssignmentLeaves, mergeLeaves, deriveActualLeaves } from './leave'
import {
  computeFairness, classifyDay, getBucketBalance, getOverallBalance,
  recentCategoryBlockExposure
} from './fairness'
import { longHolidayBlocks, blockOn } from './shiftQuality'
import { nanoid } from '../lib/nanoid'

// ─── Result type ─────────────────────────────────────────────────────────────

export interface GenerateResult {
  assignments: Assignment[]
  leaves: LeaveObligation[]
  outcomeStatus: 'feasible-best-found' | 'proven-infeasible'
  warnings: ScheduleWarning[]
}

// ─── Stable deterministic id ordering ───────────────────────────────────────

function stableIdOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// ─── Core generate function ──────────────────────────────────────────────────

export function generatePlan(
  month: string,
  people: Person[],
  roster: Roster,
  overrides: CalendarDateOverride[],
  existingActuals: ActualShift[],
  /** Locked assignments to preserve (manual or previously pinned). */
  lockedAssignments: Assignment[],
  previousRevisionLeaves: LeaveObligation[],
  _seed: string, // retained for API compat; determinism comes from stable id sort now
  priorAssignments: Assignment[] = [],
  dutyRequirements: DutyRequirements = {},
): GenerateResult {
  const tolerance = roster.fairnessTolerance ?? 0.25
  const rareN = roster.rareEventOccurrences ?? 3

  const dates = monthDates(month)
  const assignments: Assignment[] = [...lockedAssignments]
  const warnings: ScheduleWarning[] = []

  const { start: winStart, end: winEnd } = fairnessWindow(month)
  const historyStart = roster.historyStartDate
  const effectiveWinStart = winStart < historyStart ? historyStart : winStart
  const holidayBlocks = longHolidayBlocks(effectiveWinStart, winEnd, roster, overrides)

  // Build actual leaves (confirmed, immutable)
  const actualLeaves = deriveActualLeaves(existingActuals, roster, people)
  let currentLeaves: LeaveObligation[] = mergeLeaves(actualLeaves, previousRevisionLeaves)
  const lockedLeaves = deriveAssignmentLeaves(lockedAssignments, roster, people)
  currentLeaves = mergeLeaves(currentLeaves, lockedLeaves)

  // Dates that are covered by confirmed actuals (skip)
  const actualDates = new Set(
    existingActuals.filter(a => a.status !== 'cancelled').map(a => a.date)
  )
  // Dates that are locked
  const lockedDates = new Set(lockedAssignments.map(a => a.date))

  // Fill only from history start — earlier days are optional history, not required plan.
  const openDates = dates.filter(d =>
    d >= historyStart && !lockedDates.has(d) && !actualDates.has(d)
  )

  // ─── Helper: build a draft revision for fairness computation ───────────────

  function makeDraft(): PlanRevision {
    return {
      id: 'draft',
      month,
      status: 'draft',
      baselineRevisionId: null,
      assignments: [...assignments],
      calendarOverrideSnapshot: overrides,
      restPolicySnapshot: '',
      tiebreakerSeed: '',
      optimizationMode: 'initial',
      outcomeStatus: 'feasible-best-found',
      createdAt: new Date().toISOString(),
      actor: 'planner',
    }
  }

  // ─── Feasibility check ────────────────────────────────────────────────────

  function isFeasible(person: Person, date: IsoDate, leaves: LeaveObligation[]): boolean {
    if (!isMemberOn(person, date)) return false
    if (isUnavailableOn(person, date)) return false
    // Hard no: automatic scheduling must not assign this person.
    // Expected share still accrues (unlike vacation).
    if (isAvoidedOn(person, date)) return false
    if (!holdsQualification(person, dutyRequirements[date]?.requiredQualification)) return false
    if (hasRestObligationOn(person.id, date, leaves)) return false
    const month_ = monthOf(date)
    const cond = person.monthlyConditions[month_]
    const max = cond?.max ?? null
    if (max !== null && countAssignmentsInMonth(person.id, month_, assignments) >= max) return false
    return true
  }

  // ─── Most-constrained-first ordering ─────────────────────────────────────

  /**
   * Count how many people are feasible for a date given current leaves.
   * Lower = more constrained = schedule first.
   */
  function feasibleCount(date: IsoDate): number {
    return people.filter(p => isMemberOn(p, date) && isFeasible(p, date, currentLeaves)).length
  }

  // ─── Identify long holiday blocks in THIS month ───────────────────────────

  const monthStart = dates[0]
  const monthEnd = dates[dates.length - 1]
  const monthBlocks = holidayBlocks.filter(b => b.end >= monthStart && b.start <= monthEnd)

  // Collect dates in each block that are open
  const blockDates = new Map<string, IsoDate[]>()
  for (const block of monthBlocks) {
    const dts = openDates.filter(d => d >= block.start && d <= block.end)
    if (dts.length > 0) blockDates.set(block.id, dts)
  }
  const blockScheduledDates = new Set<IsoDate>()

  // ─── Schedule holiday blocks first ───────────────────────────────────────

  for (const block of monthBlocks) {
    const dts = blockDates.get(block.id) ?? []
    if (dts.length === 0) continue

    // Determine block category for rare-event ranking
    let category: string | undefined = undefined
    {
      let cur = block.start
      let firstLabel: string | undefined = undefined
      let allSame = true
      while (cur <= block.end) {
        const ov = overrides.find(o => o.date === cur && o.holiday)
        const label = ov?.label
        if (firstLabel === undefined && label) firstLabel = label
        if (label !== firstLabel) { allSame = false; break }
        cur = addDays(cur, 1)
      }
      if (allSame && firstLabel) category = firstLabel
    }

    // Build exposure map (rare-event or block-count)
    let blockExposure: Map<string, number>
    if (category) {
      blockExposure = recentCategoryBlockExposure(
        category, rareN, people, roster, overrides, existingActuals,
        [...priorAssignments, ...assignments], historyStart, winEnd,
      )
    } else {
      // Use 365-day block-touch count from fairness
      const report = computeFairness(
        month, people, roster, overrides, existingActuals, makeDraft(),
        currentLeaves, historyStart, priorAssignments, dutyRequirements,
      )
      blockExposure = new Map(
        report.projections['365d'].map(p => [p.personId, p.holidayBlocksTouched])
      )
    }

    // Build smallest feasible pool: add people ordered by exposure, then hday balance, then id
    const report365 = computeFairness(
      month, people, roster, overrides, existingActuals, makeDraft(),
      currentLeaves, historyStart, priorAssignments, dutyRequirements,
    )

    const candidates = people
      .filter(p => isMemberOn(p, block.start) || dts.some(d => isMemberOn(p, d)))
      .sort((a, b) => {
        const expA = blockExposure.get(a.id) ?? 0
        const expB = blockExposure.get(b.id) ?? 0
        if (expA !== expB) return expA - expB
        const projA = report365.projections['365d'].find(p => p.personId === a.id)
        const projB = report365.projections['365d'].find(p => p.personId === b.id)
        const hnA = projA ? (projA.HN.balance + projA.HH.balance) : 0
        const hnB = projB ? (projB.HN.balance + projB.HH.balance) : 0
        if (hnA !== hnB) return hnA - hnB
        return stableIdOrder(a.id, b.id)
      })

    // Grow pool until block can be covered
    let pool: Person[] = []
    for (const candidate of candidates) {
      pool.push(candidate)
      // Check if every block date has at least one feasible pool member
      const canCover = dts.every(d =>
        pool.some(p => isFeasible(p, d, currentLeaves))
      )
      if (canCover) break
    }

    // Schedule duties within the pool using HN/HH bucket fairness
    for (const date of dts) {
      const dayType = classifyDay(date, roster, overrides)
      const freshReport = computeFairness(
        month, people, roster, overrides, existingActuals, makeDraft(),
        currentLeaves, historyStart, priorAssignments, dutyRequirements,
      )

      const feasible = pool.filter(p => isFeasible(p, date, currentLeaves))
      if (feasible.length === 0) {
        // Expand pool for this date
        const extra = candidates.filter(c => !pool.includes(c) && isFeasible(c, date, currentLeaves))
        if (extra.length > 0) feasible.push(extra[0])
      }
      if (feasible.length === 0) {
        warnings.push({
          type: 'NO_COVERAGE',
          severity: 'warning',
          date,
          message: `No feasible person for ${date} (holiday block)`,
        })
        continue
      }

      const chosen = pickBest(date, dayType, feasible, freshReport, tolerance)
      const newA = makeAssignment(date, chosen, dayType, block.id, freshReport, feasible.length)
      assignments.push(newA)
      blockScheduledDates.add(date)

      const newLeaves = deriveAssignmentLeaves([newA], roster, people)
      currentLeaves = mergeLeaves(currentLeaves, newLeaves)
    }
  }

  // ─── Schedule remaining dates (most-constrained first) ───────────────────

  const remainingDates = openDates.filter(d => !blockScheduledDates.has(d))

  // Order: most constrained (fewest feasible people) first, stable by date as tie-break
  const orderedRemaining = [...remainingDates].sort((a, b) => {
    const fa = feasibleCount(a)
    const fb = feasibleCount(b)
    if (fa !== fb) return fa - fb
    return a.localeCompare(b)
  })

  for (const date of orderedRemaining) {
    const dayType = classifyDay(date, roster, overrides)
    const freshReport = computeFairness(
      month, people, roster, overrides, existingActuals, makeDraft(),
      currentLeaves, historyStart, priorAssignments, dutyRequirements,
    )

    const feasible = people.filter(p => isFeasible(p, date, currentLeaves))

    if (feasible.length === 0) {
      warnings.push({
        type: 'NO_COVERAGE',
        severity: 'warning',
        date,
        message: `No feasible person for ${date}`,
        data: buildInfeasibleData(date, people, currentLeaves, assignments),
      })
      // Try limited repair: pairwise swap
      const rescued = tryRescue(date, dayType, people, assignments, currentLeaves, freshReport, roster, people, tolerance)
      if (rescued) {
        assignments.push(rescued)
        const newLeaves = deriveAssignmentLeaves([rescued], roster, people)
        currentLeaves = mergeLeaves(currentLeaves, newLeaves)
      }
      continue
    }

    const chosen = pickBest(date, dayType, feasible, freshReport, tolerance)
    const newA = makeAssignment(date, chosen, dayType, undefined, freshReport, feasible.length)
    assignments.push(newA)

    const newLeaves = deriveAssignmentLeaves([newA], roster, people)
    currentLeaves = mergeLeaves(currentLeaves, newLeaves)
  }

  const coveredDates = new Set([
    ...assignments.map(a => a.date),
    ...existingActuals.filter(a => a.status !== 'cancelled').map(a => a.date),
  ])
  const stillEmpty = dates.filter(d => !coveredDates.has(d))

  const outcomeStatus = stillEmpty.length === 0 ? 'feasible-best-found' : 'proven-infeasible'

  return { assignments, leaves: currentLeaves, outcomeStatus, warnings }
}

// ─── Candidate selection ─────────────────────────────────────────────────────

/**
 * Pick the best candidate for a date using lexicographic priority:
 *   1. Lowest balance in the day's bucket
 *   2. Within tolerance: best preference rank
 *   3. Lowest overall balance (sum of four buckets)
 *   4. Stable person id
 */
function pickBest(
  date: IsoDate,
  dayType: DayType,
  feasible: Person[],
  report: import('./fairness').FairnessReport,
  tolerance: number,
): Person {
  const proj365 = report.projections['365d']

  const scored = feasible.map(p => {
    const proj = proj365.find(x => x.personId === p.id)
    const bucketBal = proj ? getBucketBalance(proj, dayType) : 0
    const overallBal = proj ? getOverallBalance(proj) : 0
    const pref = getPreference(p, date)
    return { person: p, bucketBal, overallBal, prefRank: preferenceRank(pref) }
  })

  const bestBalance = Math.min(...scored.map(s => s.bucketBal))

  const fairCandidates = scored.filter(s => s.bucketBal <= bestBalance + tolerance)

  // Sort by: prefRank ASC, overallBal ASC, stableId ASC
  fairCandidates.sort((a, b) => {
    if (a.prefRank !== b.prefRank) return a.prefRank - b.prefRank
    if (a.overallBal !== b.overallBal) return a.overallBal - b.overallBal
    return stableIdOrder(a.person.id, b.person.id)
  })

  return fairCandidates[0].person
}

function makeAssignment(
  date: IsoDate,
  person: Person,
  dayType: DayType,
  holidayBlockId: string | undefined,
  report: import('./fairness').FairnessReport,
  feasibleCount: number,
): Assignment {
  const proj = report.projections['365d'].find(p => p.personId === person.id)
  const preferenceUsed = getPreference(person, date) ?? undefined
  const explanation: AssignmentExplanation = {
    feasibleCount,
    bucket: dayType,
    winnerBalance: proj ? getBucketBalance(proj, dayType) : 0,
    winnerOverallBalance: proj ? getOverallBalance(proj) : 0,
    preferenceUsed,
  }
  return {
    date,
    allocatedTo: person.id,
    performedBy: person.id,
    locked: false,
    source: 'auto',
    dayType,
    holidayBlockId,
    explanation,
  }
}

// ─── Rescue: limited repair for stuck dates ───────────────────────────────────

/**
 * Attempt to rescue a date with no feasible candidate by trying a pairwise swap:
 * find an already-assigned date where the person is also feasible here, and the
 * other candidate is feasible on that date instead.
 */
function tryRescue(
  date: IsoDate,
  dayType: DayType,
  people: Person[],
  assignments: Assignment[],
  leaves: LeaveObligation[],
  _report: import('./fairness').FairnessReport,
  roster: Roster,
  allPeople: Person[],
  _tolerance: number,
): Assignment | null {
  // Simple rescue: look for someone who was assigned on a day where they have rest,
  // causing this day to be blocked, and see if swapping helps.
  // For now, just try any person who could work this date if we removed their rest obligation
  for (const person of people) {
    if (!isMemberOn(person, date)) continue
    if (isUnavailableOn(person, date)) continue
    // Check if they are blocked only by rest
    const restBlocked = hasRestObligationOn(person.id, date, leaves)
    if (!restBlocked) continue

    // Find which of their leaves blocks this day
    const blockingLeave = leaves.find(l =>
      l.personId === person.id && (l.immediateRestDate === date || l.compensatoryLeaveDate === date)
    )
    if (!blockingLeave) continue

    // Find the assignment that caused this leave
    const causingAssignment = assignments.find(a =>
      (a.allocatedTo ?? a.personId) === person.id && a.date === blockingLeave.shiftDate
    )
    if (!causingAssignment || causingAssignment.locked || causingAssignment.source === 'manual') continue

    // Can we swap: is there another person who is feasible on the causing date AND not blocked on this date?
    const idx = assignments.indexOf(causingAssignment)
    const altPeople = allPeople.filter(p =>
      p.id !== person.id &&
      !hasRestObligationOn(p.id, causingAssignment.date, leaves) &&
      !isUnavailableOn(p, causingAssignment.date) &&
      isMemberOn(p, causingAssignment.date) &&
      !hasRestObligationOn(p.id, date, leaves) === false // this person would then be free
    )

    if (altPeople.length > 0) {
      // Perform the swap: reassign causing date to alt, then this person is free for target date
      const alt = altPeople[0]
      assignments[idx] = {
        ...causingAssignment,
        allocatedTo: alt.id,
        performedBy: alt.id,
        source: 'auto',
      }
      // Rough re-derive leaves — caller will rebuild
      return {
        date,
        allocatedTo: person.id,
        performedBy: person.id,
        locked: false,
        source: 'auto',
        dayType,
        holidayBlockId: undefined,
      }
    }
  }
  return null
}

// ─── Infeasible reason data ───────────────────────────────────────────────────

function buildInfeasibleData(
  date: IsoDate,
  people: Person[],
  leaves: LeaveObligation[],
  assignments: Assignment[],
): Record<string, string> {
  const reasons: string[] = []
  for (const p of people) {
    const month_ = monthOf(date)
    const cond = p.monthlyConditions[month_]
    const max = cond?.max ?? null
    if (!isMemberOn(p, date)) reasons.push(`${p.name}: not a member`)
    else if (isUnavailableOn(p, date)) reasons.push(`${p.name}: on vacation`)
    else if (isAvoidedOn(p, date)) reasons.push(`${p.name}: hard avoid`)
    else if (hasRestObligationOn(p.id, date, leaves)) reasons.push(`${p.name}: rest obligation`)
    else if (max !== null && countAssignmentsInMonth(p.id, month_, assignments) >= max) reasons.push(`${p.name}: monthly max`)
  }
  return { reasons: reasons.join('; ') || 'No active members' }
}

// ─── Backward-compat legacy export fields ────────────────────────────────────

/** @deprecated Use GenerateResult.warnings[].type === 'NO_COVERAGE'. */
export interface LegacyGenerateResult extends GenerateResult {
  infeasibleDates: IsoDate[]
  infeasibleReasons: Record<IsoDate, string>
}

export function generatePlanLegacy(
  ...args: Parameters<typeof generatePlan>
): LegacyGenerateResult {
  const result = generatePlan(...args)
  const infeasibleDates = result.warnings
    .filter(w => w.type === 'NO_COVERAGE')
    .map(w => w.date)
  const infeasibleReasons: Record<IsoDate, string> = {}
  for (const w of result.warnings.filter(w => w.type === 'NO_COVERAGE')) {
    infeasibleReasons[w.date] = w.data?.reasons as string ?? w.message
  }
  return { ...result, infeasibleDates, infeasibleReasons }
}
