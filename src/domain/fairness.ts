/**
 * Kalender fairness ledger.
 *
 * Fairness is tracked with discrete day-type buckets (NN / NH / HN / HH) and
 * holiday-block exposure. The ledger is always derived from the event history
 * (assignments + actuals); totals are never persisted separately.
 *
 * Rolling windows: 30d / 90d / 365d / lifetime.
 *
 * Fairness eligibility vs scheduling feasibility
 * ──────────────────────────────────────────────
 * Expected share accrues to a person when they are:
 *   - a roster member on that date, AND
 *   - not on explicit vacation (unavailableRanges), AND
 *   - have positive capacity.
 *
 * Rest obligations, consecutive-shift limits, and monthly-max do NOT reduce
 * expected share. They are scheduling constraints caused by the optimizer's own
 * decisions and must not shrink a person's entitlement.
 *
 * Actual credit
 * ─────────────
 * Credit goes to the person the shift was allocated_to (fairness owner).
 * After publish a voluntary substitution does not change the owner.
 * For published months, credit goes to plannedPersonId in the ActualShift
 * (which records who was originally allocated the shift).
 */

import type {
  IsoDate, Person, Roster, Assignment, ActualShift, CalendarDateOverride,
  LeaveObligation, PlanRevision, DayType, BucketFairness, FairnessProjection,
  DutyRequirements
} from './types'
import { addDays, isHoliday, inHalfOpenRange, requiredHeadcount } from './calendar'
import { isMemberOn, isOnVacation, holdsQualification } from './eligibility'
import { longHolidayBlocks } from './shiftQuality'

// ─── Day classification ─────────────────────────────────────────────────────

export function classifyDay(
  date: IsoDate,
  roster: Roster,
  overrides: CalendarDateOverride[],
): DayType {
  const today = isHoliday(date, roster, overrides)
  const next = isHoliday(addDays(date, 1), roster, overrides)
  if (!today && !next) return 'NN'
  if (!today && next) return 'NH'
  if (today && !next) return 'HN'
  return 'HH'
}

// ─── Window helpers ─────────────────────────────────────────────────────────

type WindowKey = '30d' | '90d' | '365d' | 'lifetime'

interface Window {
  start: IsoDate
  end: IsoDate // exclusive
}

function windowFor(key: WindowKey, planBoundary: IsoDate, historyStart: IsoDate): Window {
  const end = planBoundary // exclusive upper bound
  if (key === 'lifetime') {
    return { start: historyStart, end }
  }
  const days = key === '30d' ? 30 : key === '90d' ? 90 : 365
  const start = addDays(end, -days)
  const effective = start < historyStart ? historyStart : start
  return { start: effective, end }
}

// ─── Holiday block helpers ──────────────────────────────────────────────────

interface BlockInfo {
  id: string
  start: IsoDate
  end: IsoDate
  /** Category derived from shared labels of the run, or undefined if mixed/unlabelled. */
  category?: string
}

function buildBlockInfo(
  start: IsoDate,
  end: IsoDate, // exclusive
  roster: Roster,
  overrides: CalendarDateOverride[],
): BlockInfo[] {
  const rawBlocks = longHolidayBlocks(start, end, roster, overrides)
  return rawBlocks.map(b => {
    // Derive category: all days in [b.start, b.end] must have the same non-empty label.
    let cat: string | undefined = undefined
    let cur = b.start
    let allSame = true
    let firstLabel: string | undefined = undefined
    while (cur <= b.end) {
      const ov = overrides.find(o => o.date === cur && o.holiday)
      const label = ov?.label
      if (firstLabel === undefined && label) firstLabel = label
      if (label !== firstLabel) { allSame = false; break }
      cur = addDays(cur, 1)
    }
    if (allSame && firstLabel) cat = firstLabel
    return { id: b.id, start: b.start, end: b.end, category: cat }
  })
}

/** Which block (if any) does `date` fall inside? */
function blockForDate(date: IsoDate, blocks: BlockInfo[]): BlockInfo | null {
  return blocks.find(b => date >= b.start && date <= b.end) ?? null
}

// ─── Core computation ───────────────────────────────────────────────────────

interface PersonAccum {
  NN: { actual: number; expected: number }
  NH: { actual: number; expected: number }
  HN: { actual: number; expected: number }
  HH: { actual: number; expected: number }
  blocksTouched: Set<string>
  holidayShifts: number
}

function emptyAccum(): PersonAccum {
  return {
    NN: { actual: 0, expected: 0 },
    NH: { actual: 0, expected: 0 },
    HN: { actual: 0, expected: 0 },
    HH: { actual: 0, expected: 0 },
    blocksTouched: new Set(),
    holidayShifts: 0,
  }
}

function datesInHalfOpen(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = []
  let cur = start
  while (cur < end) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

/**
 * Compute a single fairness projection window for all people.
 */
function computeWindow(
  window: Window,
  people: Person[],
  roster: Roster,
  overrides: CalendarDateOverride[],
  /** All published actuals. Used for months that have been closed. */
  actuals: ActualShift[],
  /** The open draft revision (if any — month currently being planned). */
  candidateRevision: PlanRevision | null,
  /** Published assignments from other months (for cross-month block tracking). */
  priorAssignments: Assignment[],
  dutyRequirements: DutyRequirements = {},
): Map<string, PersonAccum> {
  const accums = new Map<string, PersonAccum>()
  for (const p of people) accums.set(p.id, emptyAccum())

  const blocks = buildBlockInfo(window.start, window.end, roster, overrides)

  // date → distinct allocation owners.
  // A later source replaces an earlier one for that date (it does not append):
  // draft assignments replace actuals, which replace prior assignments.
  // Within one source, every distinct person on the shift receives credit.
  const ownersByDate = new Map<IsoDate, string[]>()

  function putOwners(date: IsoDate, owner: string) {
    if (date < window.start || date >= window.end || !owner) return
    const list = ownersByDate.get(date) ?? []
    if (!list.includes(owner)) list.push(owner)
    ownersByDate.set(date, list)
  }

  function replaceOwners(dates: IsoDate[], ownersFor: (date: IsoDate) => string[]) {
    const touched = new Set(dates)
    for (const date of touched) {
      if (date < window.start || date >= window.end) continue
      const owners = ownersFor(date).filter(Boolean)
      const distinct: string[] = []
      for (const owner of owners) {
        if (!distinct.includes(owner)) distinct.push(owner)
      }
      if (distinct.length > 0) ownersByDate.set(date, distinct)
    }
  }

  for (const a of priorAssignments) {
    putOwners(a.date, a.allocatedTo ?? a.personId ?? '')
  }

  const actualDates = [...new Set(
    actuals.filter(a => a.status !== 'cancelled').map(a => a.date)
  )]
  replaceOwners(actualDates, date =>
    actuals
      .filter(a => a.date === date && a.status !== 'cancelled')
      .map(a => a.plannedPersonId ?? a.actualPersonId)
  )

  if (candidateRevision) {
    const draftDates = [...new Set(candidateRevision.assignments.map(a => a.date))]
    replaceOwners(draftDates, date =>
      candidateRevision.assignments
        .filter(a => a.date === date)
        .map(a => a.allocatedTo ?? a.personId ?? '')
    )
  }

  const dates = datesInHalfOpen(window.start, window.end)

  for (const date of dates) {
    const dayType = classifyDay(date, roster, overrides)
    const block = blockForDate(date, blocks)

    // Fairness-eligible: member + capacity + not on vacation + holds required qualification
    const required = dutyRequirements[date]?.requiredQualification
    const eligible = people.filter(p =>
      isMemberOn(p, date) &&
      !isOnVacation(p, date) &&
      (p.capacity === undefined || p.capacity > 0) &&
      holdsQualification(p, required)
    )
    if (eligible.length === 0) continue

    const totalCapacity = eligible.reduce((s, p) => s + (p.capacity ?? 1), 0)
    const headcount = requiredHeadcount(date, roster, dutyRequirements)
    const owners = ownersByDate.get(date) ?? []

    for (const p of eligible) {
      const accum = accums.get(p.id)!
      const share = (p.capacity ?? 1) / totalCapacity
      // A shift staffed by N people is N allocations of this day type.
      accum[dayType].expected += headcount * share
    }

    for (const owner of owners) {
      const accum = accums.get(owner)
      if (!accum) continue
      accum[dayType].actual += 1
      if (block) {
        accum.blocksTouched.add(block.id)
        if (dayType === 'HN' || dayType === 'HH') {
          accum.holidayShifts += 1
        }
      }
    }
  }

  return accums
}

function accumToProjection(
  personId: string,
  windowKey: WindowKey,
  accum: PersonAccum,
): FairnessProjection {
  const bucket = (b: { actual: number; expected: number }): BucketFairness => ({
    actual: b.actual,
    expected: b.expected,
    balance: b.actual - b.expected,
  })
  return {
    personId,
    window: windowKey,
    NN: bucket(accum.NN),
    NH: bucket(accum.NH),
    HN: bucket(accum.HN),
    HH: bucket(accum.HH),
    holidayBlocksTouched: accum.blocksTouched.size,
    holidayShifts: accum.holidayShifts,
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface FairnessReport {
  /** The month this report was computed for. */
  month: string
  /** End of the 365-day window (exclusive) = first day of the month after `month`. */
  planBoundary: IsoDate
  /** Projections for each person, indexed by window size. */
  projections: {
    '30d': FairnessProjection[]
    '90d': FairnessProjection[]
    '365d': FairnessProjection[]
    'lifetime': FairnessProjection[]
  }
  /** Whether the 365-day history is complete. */
  historyComplete: boolean
}

/**
 * Compute rolling fairness for a month, combining actuals + plan assignments.
 * The plan boundary (exclusive end of the 365-day optimizer window) is the
 * first day of the month following `month`.
 */
export function computeFairness(
  month: string,
  allPeople: Person[],
  roster: Roster,
  overrides: CalendarDateOverride[],
  actuals: ActualShift[],
  candidateRevision: PlanRevision | null,
  _leaves: LeaveObligation[], // retained for API compat, unused in new model
  historyStartDate: IsoDate,
  priorAssignments: Assignment[] = [],
  dutyRequirements: DutyRequirements = {},
): FairnessReport {
  // Plan boundary: first day of next month (same as old fairnessWindow end)
  const [y, m] = month.split('-').map(Number)
  let ey = y, em = m + 1
  if (em > 12) { em = 1; ey += 1 }
  const planBoundary = `${String(ey).padStart(4, '0')}-${String(em).padStart(2, '0')}-01`

  const historyComplete = addDays(planBoundary, -365) >= historyStartDate

  const windowKeys: WindowKey[] = ['30d', '90d', '365d', 'lifetime']
  const result: FairnessReport['projections'] = {
    '30d': [],
    '90d': [],
    '365d': [],
    'lifetime': [],
  }

  for (const key of windowKeys) {
    const win = windowFor(key, planBoundary, historyStartDate)
    const accums = computeWindow(
      win, allPeople, roster, overrides, actuals, candidateRevision, priorAssignments, dutyRequirements
    )
    result[key] = allPeople.map(p => accumToProjection(p.id, key, accums.get(p.id)!))
  }

  return { month, planBoundary, projections: result, historyComplete }
}

// ─── Optimizer helpers ──────────────────────────────────────────────────────

/**
 * Get the 365-day bucket balance for a person on a specific day type.
 * Used by the scheduler to rank candidates.
 */
export function getBucketBalance(
  projection: FairnessProjection,
  dayType: DayType,
): number {
  return projection[dayType].balance
}

/**
 * Overall 365-day fairness balance for a person (sum of all four buckets).
 * Used as a secondary tie-breaker.
 */
export function getOverallBalance(projection: FairnessProjection): number {
  return (
    projection.NN.balance +
    projection.NH.balance +
    projection.HN.balance +
    projection.HH.balance
  )
}

/**
 * For each person, how many of the most recent N matching holiday blocks
 * (by category label) have they been assigned to (across all history)?
 * Returns a map from personId → count.
 */
export function recentCategoryBlockExposure(
  category: string,
  nOccurrences: number,
  people: Person[],
  roster: Roster,
  overrides: CalendarDateOverride[],
  actuals: ActualShift[],
  allAssignments: Assignment[],
  historyStartDate: IsoDate,
  planBoundary: IsoDate,
): Map<string, number> {
  // Build all blocks with this category across all history
  const allBlocks = buildBlockInfo(historyStartDate, planBoundary, roster, overrides)
  const catBlocks = allBlocks
    .filter(b => b.category === category)
    .sort((a, b) => b.start.localeCompare(a.start)) // most recent first
    .slice(0, nOccurrences)

  const exposure = new Map<string, number>(people.map(p => [p.id, 0]))

  for (const block of catBlocks) {
    const datesInBlock = datesInHalfOpen(block.start, addDays(block.end, 1))
    const touched = new Set<string>()

    for (const date of datesInBlock) {
      const dayActuals = actuals.filter(a => a.date === date && a.status !== 'cancelled')
      if (dayActuals.length > 0) {
        for (const actual of dayActuals) {
          const owner = actual.plannedPersonId ?? actual.actualPersonId
          if (owner) touched.add(owner)
        }
        continue
      }
      for (const asgn of allAssignments) {
        if (asgn.date !== date) continue
        const owner = asgn.allocatedTo ?? asgn.personId ?? ''
        if (owner) touched.add(owner)
      }
    }

    for (const personId of touched) {
      exposure.set(personId, (exposure.get(personId) ?? 0) + 1)
    }
  }

  return exposure
}

// ─── Legacy compat shim ─────────────────────────────────────────────────────

/**
 * Sort people by their 365-day overall balance (most under-allocated first).
 */
export function sortByFairness(report: FairnessReport, personIds: string[]): string[] {
  const map = new Map<string, number>()
  for (const proj of report.projections['365d']) {
    map.set(proj.personId, getOverallBalance(proj))
  }
  return [...personIds].sort((a, b) => (map.get(a) ?? 0) - (map.get(b) ?? 0))
}

// ─── Backward-compat shims for components still importing old names ────────

/** @deprecated Access projections directly. */
export interface FairnessMeasures {
  shiftWorkload: number
  normalDuty: number
  holidayDuty: number
  bridgeShifts: number
  awkwardShifts: number
  longHolidays: number
  usefulLeave: number
}

/** @deprecated Use FairnessProjection. */
export interface PersonFairness {
  personId: string
  target: FairnessMeasures
  observed: FairnessMeasures
  remainder: FairnessMeasures
  normalizedDeviation: number
  historyComplete: boolean
  usefulLeaveAvailable: boolean
  longHolidayBlockIds: string[]
}
