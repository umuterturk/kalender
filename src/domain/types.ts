/**
 * Kalender domain types.
 * Dates are always YYYY-MM-DD strings (local calendar dates).
 */

export type IsoDate = string // YYYY-MM-DD

// ─── Day classification ─────────────────────────────────────────────────────

/**
 * Every duty day is classified by whether today and the next calendar day are
 * holidays.
 *
 * NN – Normal followed by Normal
 * NH – Normal followed by Holiday
 * HN – Holiday followed by Normal
 * HH – Holiday followed by another Holiday
 */
export type DayType = 'NN' | 'NH' | 'HN' | 'HH'

// ─── Preferences ────────────────────────────────────────────────────────────

/**
 * Scheduling preference for a person on a given date.
 * HAVE – strong requirement (entered by scheduler; auto treats as high-priority but does not block manual override)
 * WANT – strong positive preference
 * PREFER – weak positive preference
 * AVOID – hard no for automatic scheduling (still accrues expected share; manual Set may override)
 * Absence of an entry means NEUTRAL.
 */
export type PreferenceType = 'HAVE' | 'WANT' | 'PREFER' | 'AVOID'

// ─── People ────────────────────────────────────────────────────────────────

export interface Person {
  id: string
  name: string
  /** Sorted list of active intervals. inactive_from is exclusive. */
  memberships: Membership[]
  /** Per-person dated overrides to the roster's default working weekdays. */
  workCalendarOverrides: WorkCalendarOverride[]
  /** Month-specific conditions; key is YYYY-MM. */
  monthlyConditions: Record<string, MonthlyConditions>
  /**
   * Fairness participation weight. Default 1.
   * Part-time employees may have e.g. 0.5.
   */
  capacity?: number
  /** Qualifications this person holds. */
  qualifications?: string[]
  /**
   * Per-date scheduling preferences. Key is YYYY-MM-DD.
   * Supersedes the old preferredDates / avoidedDates in MonthlyConditions
   * (which remain for backward-compat migration only).
   */
  datePreferences?: Record<IsoDate, PreferenceType>
}

export interface Membership {
  activeFrom: IsoDate
  /** Exclusive: person is no longer active on this date. null = still active. */
  inactiveFrom: IsoDate | null
}

export interface WorkCalendarOverride {
  date: IsoDate
  working: boolean
}

/** Per-person per-month planning inputs. */
export interface MonthlyConditions {
  /** Vacation: out of the rota. No fair-share target accrues, and the day is shared by everyone else. */
  unavailableRanges: DateRange[]
  /**
   * @deprecated Superseded by Person.datePreferences. Kept for migration.
   * Soft: prefer this person on these dates.
   */
  preferredDates: IsoDate[]
  /**
   * @deprecated Superseded by Person.datePreferences. Kept for migration.
   * Rather not: the person does not want the date. Still accrues a fair share.
   */
  avoidedDates: IsoDate[]
  /** Hard minimum number of shifts this month. Default 0. */
  requiredMin: number
  /** Hard maximum number of shifts this month. Default unlimited. */
  max: number | null
}

export interface DateRange {
  from: IsoDate
  to: IsoDate // inclusive
}

// ─── Roster ────────────────────────────────────────────────────────────────

export interface Roster {
  id: string
  name: string
  /** ISO country used for official holidays. Currently only TR. */
  country?: 'TR'
  timezone?: string
  /** Default weekdays that count as "working" (0=Sun, 1=Mon … 6=Sat). */
  defaultWorkingWeekdays: number[]
  /** Fair-share history start date. Targets accrue from this date. */
  historyStartDate: IsoDate
  /** If true, Sat/Sun are holiday by default. */
  weekendHolidayDefault: boolean
  restPolicies: RestPolicy[]
  /**
   * Fairness tolerance for candidate selection.
   * Candidates whose balance is within this margin of the best balance are
   * treated as equally fair and ranked by preference instead.
   * Default 0.25.
   */
  fairnessTolerance?: number
  /**
   * Number of recent occurrences to look back for rare event (categorized
   * holiday block) fairness. Default 3.
   */
  rareEventOccurrences?: number
}

// ─── Calendar ──────────────────────────────────────────────────────────────

/** Effective classification of a roster date. */
export type HolidaySource = 'weekend-default' | 'explicit' | 'explicit-override-normal'

export interface CalendarDateOverride {
  date: IsoDate
  /** If set, the date is classified as holiday (true) or forced normal (false). */
  holiday: boolean
  label?: string
}

/** A named public-holiday range. Inclusive start and end. */
export interface HolidayPeriod {
  id: string
  label: string
  start: IsoDate
  end: IsoDate
  /** Stable official type, e.g. republic / ramazan. Absent for custom ranges. */
  officialKind?: string
}

/**
 * Per-duty operational requirements for automatic scheduling.
 * When requiredQualification is set, only people who hold that qualification
 * are feasible (and fairness-eligible) for that date.
 */
export interface DutyRequirement {
  requiredQualification?: string
}

/** Optional map of date → duty requirement. Absence means no special requirement. */
export type DutyRequirements = Record<IsoDate, DutyRequirement>

// ─── Rest policy ───────────────────────────────────────────────────────────

export interface RestPolicy {
  id: string
  effectiveFrom: IsoDate
  enabled: boolean
  /**
   * Following-day rest after a duty:
   *  "none"          = no rest day is granted.
   *  "calendar-only" = next calendar day is rest; no replacement if already off.
   *  "next-working"  = also grant the next ordinary working day when the
   *                    immediate rest day is already non-working.
   */
  nonworkingTreatment: 'none' | 'calendar-only' | 'next-working'
}

// ─── Plan revisions ────────────────────────────────────────────────────────

export type RevisionStatus = 'draft' | 'published' | 'stale' | 'invalid'

export interface PlanRevision {
  id: string
  month: string // YYYY-MM
  status: RevisionStatus
  /** The revision id this was branched from (null for first). */
  baselineRevisionId: string | null
  assignments: Assignment[]
  /** Snapshot of calendar overrides at generation time. */
  calendarOverrideSnapshot: CalendarDateOverride[]
  /** Snapshot of rest policy id used. */
  restPolicySnapshot: string
  /** Tie-break seed for deterministic generation. */
  tiebreakerSeed: string
  /** 'initial' | 'repair' | 'manual' */
  optimizationMode: 'initial' | 'repair' | 'manual'
  /** 'feasible-best-found' | 'proven-infeasible' | 'manual' */
  outcomeStatus: 'feasible-best-found' | 'proven-infeasible' | 'manual'
  createdAt: string // ISO timestamp
  publishedAt?: string
  /** Actor (always 'planner' for MVP). */
  actor: string
}

export interface AssignmentExplanation {
  /** Number of feasible candidates considered. */
  feasibleCount: number
  /** Bucket being optimized (e.g. 'HN'). */
  bucket: DayType
  /** Balances of the winning person in this bucket and overall. */
  winnerBalance: number
  winnerOverallBalance: number
  /** Whether a preference influenced the pick within the tolerance band. */
  preferenceUsed?: PreferenceType
}

export interface Assignment {
  date: IsoDate
  /**
   * Fairness owner — the person who received the allocation.
   * For pre-publish assignments, this is the person assigned.
   * After publish, a voluntary substitution does not change this.
   */
  allocatedTo: string
  /**
   * Who actually worked the shift.
   * Equals allocatedTo until a post-publish substitution is recorded in Actuals.
   */
  performedBy: string
  locked: boolean
  /** Whether this was a manual assignment or generated automatically. */
  source: 'auto' | 'manual'
  /** Day type classification at the time of assignment. */
  dayType?: DayType
  /** ID of the long holiday block this duty falls inside, if any. */
  holidayBlockId?: string
  /** Explanation for automatic picks, for display and debugging. */
  explanation?: AssignmentExplanation
  /**
   * @deprecated Use allocatedTo. Retained for migration from older persisted state.
   */
  personId?: string
}

// ─── Schedule warnings ─────────────────────────────────────────────────────

export type WarningType =
  | 'CONSECUTIVE_SHIFT'
  | 'NEXT_DAY_OFF'
  | 'OVER_FAIR_SHARE'
  | 'UNDER_FAIR_SHARE'
  | 'AVOID_PREFERENCE'
  | 'HAVE_MISSED'
  | 'UNAVAILABLE'
  | 'QUALIFICATION'
  | 'HOLIDAY_BLOCK_IMBALANCE'
  | 'MAX_SHIFT_COUNT'
  | 'NO_COVERAGE'

export interface ScheduleWarning {
  type: WarningType
  severity: 'info' | 'warning'
  date: IsoDate
  personId?: string
  /** Human-readable message summarising the violation. */
  message: string
  /** Numeric context for display (e.g. balances). */
  data?: Record<string, number | string>
}

// ─── Leave obligations ─────────────────────────────────────────────────────

export interface LeaveObligation {
  id: string
  /** Source: 'assignment' | 'actual' */
  sourceType: 'assignment' | 'actual'
  sourceId: string
  personId: string
  shiftDate: IsoDate
  /** Immediate rest day (shift date + 1 calendar day). */
  immediateRestDate: IsoDate
  /** Only populated under next-working policy when immediateRest is non-working. */
  compensatoryLeaveDate: IsoDate | null
  /** Projected (assignment) vs confirmed (actual). */
  confirmed: boolean
}

// ─── Actual shifts ─────────────────────────────────────────────────────────

export type ActualStatus = 'awaiting' | 'completed' | 'substituted' | 'cancelled'

export interface ActualShift {
  id: string
  date: IsoDate
  /** Original planned person (may differ from actualPersonId). */
  plannedPersonId: string | null
  /** Who actually worked. */
  actualPersonId: string
  status: ActualStatus
  recordedAsHoliday: boolean
  confirmedAt?: string
  correctionNote?: string
}

// ─── Fairness projections ──────────────────────────────────────────────────

export interface BucketFairness {
  actual: number
  expected: number
  balance: number // actual - expected (positive = over-allocated)
}

export interface FairnessProjection {
  personId: string
  window: '30d' | '90d' | '365d' | 'lifetime'
  NN: BucketFairness
  NH: BucketFairness
  HN: BucketFairness
  HH: BucketFairness
  /** Number of distinct holiday blocks this person has worked in the window. */
  holidayBlocksTouched: number
  /** Number of individual shifts inside holiday blocks in the window. */
  holidayShifts: number
}

// ─── Legacy fairness contribution (retained for compatibility) ─────────────

/** @deprecated Replaced by FairnessProjection / computeFairnessProjections. */
export interface FairnessContribution {
  date: IsoDate
  personId: string
  shiftWorkload: number
  holidayDuty: number
  usefulLeave: number
  targetShare: number
  isHoliday: boolean
  isActual: boolean
}

// ─── Store state ───────────────────────────────────────────────────────────

export interface KalenderState {
  roster: Roster | null
  people: Person[]
  calendarOverrides: CalendarDateOverride[]
  holidayPeriods: HolidayPeriod[]
  revisions: PlanRevision[]
  actuals: ActualShift[]
  leaves: LeaveObligation[]
}
