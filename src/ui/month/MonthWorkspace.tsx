import { useEffect, useRef, useState, useMemo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore'
import {
  monthDates, formatMonth, prevMonth, nextMonth, isHoliday,
  dayOfWeek, holidaySource, desiredHolidayAction, formatDateLong, formatDateShort, monthStart, monthEnd, localToday, addDays,
  requiredHeadcount,
} from '../../domain/calendar'
import { isMemberOn, isOnVacation, isUnavailableOn, hasRestObligationOn, withVacation, withAvoidedDate, explainDateBlocks, withPreference, getPreference, hasMonthPreferences, withoutMonthPreferences } from '../../domain/eligibility'
import { deriveAssignmentLeaves, deriveActualLeaves, mergeLeaves, previousMonthRestLeaves } from '../../domain/leave'
import { computeFairness } from '../../domain/fairness'
import { validateRevision } from '../../domain/validate'
import { generatePlan } from '../../domain/generate'
import { resolveMonth } from '../../domain/repair'
import { toggleShiftAssignment } from '../../domain/assign'
import { shouldOfferAutomaticRepair } from '../../domain/policies'
import type { PlanRevision, Assignment, CalendarDateOverride, PreferenceType, ActualShift, FairnessProjection } from '../../domain/types'
import { nanoid } from '../../lib/nanoid'
import { uniqueInitials } from '../../lib/initials'
import { DaySheet } from './DaySheet'
import { PeoplePanel } from './PeoplePanel'
import { FairnessPanel } from '../fairness/FairnessPanel'
import { FairnessSummary } from '../fairness/FairnessSummary'
import { ReviewSheet } from '../review/ReviewSheet'
import { IssuesBar } from './IssuesBar'
import {
  IconCalendar, IconChevronLeft, IconChevronRight, IconClose, IconLock, IconMenu, IconPeople, IconPrefNo, IconPublish, IconTrash, IconVacation, IconWand, IconWarn,
} from '../icons'
import { useI18n, type MessageKey } from '../../i18n'
import { trackEvent } from '../../analytics'
import './MonthWorkspace.css'

const CONFLICT_NOTE_HINTS: Partial<Record<string, MessageKey>> = {
  UNAVAILABLE: 'issues.vacationHint',
  NEXT_DAY_OFF: 'issues.restDayHint',
  CONSECUTIVE_SHIFT: 'issues.consecutiveHint',
}

export function MonthWorkspace() {
  const { yyyymm } = useParams<{ yyyymm: string }>()
  const month = yyyymm ?? new Date().toISOString().slice(0, 7)
  const navigate = useNavigate()
  const { t, tp, locale, localeTag } = useI18n()

  const dayHeaders = [
    t('weekdaysShort.mon'),
    t('weekdaysShort.tue'),
    t('weekdaysShort.wed'),
    t('weekdaysShort.thu'),
    t('weekdaysShort.fri'),
    t('weekdaysShort.sat'),
    t('weekdaysShort.sun'),
  ]

  const { roster, people, revisions, actuals, calendarOverrides, dispatch } = useStore()
  const peopleByName = useMemo(
    () => [...people].sort((a, b) => a.name.localeCompare(b.name, localeTag)),
    [people, localeTag],
  )
  const initialsById = useMemo(
    () => uniqueInitials(people, localeTag),
    [people, localeTag],
  )

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [highlightedPersonId, setHighlightedPersonId] = useState<string | null>(null)
  const [view, setView] = useState<'calendar' | 'people'>('calendar')
  const [sidePanel, setSidePanel] = useState<'fairness' | 'day' | 'people' | 'issues'>('fairness')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [clearMonthOpen, setClearMonthOpen] = useState(false)
  const [clearAlsoPrefs, setClearAlsoPrefs] = useState(false)
  const [resolvedNote, setResolvedNote] = useState<string | null>(null)
  const [planConfirmOpen, setPlanConfirmOpen] = useState(false)
  const [repairConfirmOpen, setRepairConfirmOpen] = useState(false)
  const resolvedSignatures = useRef(new Set<string>())
  const autoResolveAttempts = useRef(0)
  const dismissedRepairSig = useRef<string | null>(null)

  // Get or create a draft revision for this month
  const monthRevisions = revisions.filter(r => r.month === month)
  const activeRevision = monthRevisions[monthRevisions.length - 1] ?? null
  const publishedRevision = [...monthRevisions].reverse().find(r => r.status === 'published')
  const draftRevision = activeRevision && activeRevision.status !== 'published' ? activeRevision : undefined

  const dates = useMemo(() => monthDates(month), [month])

  const priorAssignments = useMemo(() => {
    const latest = new Map<string, PlanRevision>()
    for (const revision of revisions) {
      if (revision.month === month) continue
      latest.set(revision.month, revision)
    }
    return [...latest.values()].flatMap(revision => revision.assignments)
  }, [revisions, month])

  const boundaryLeaves = useMemo(() => {
    if (!roster) return []
    return previousMonthRestLeaves(revisions, month, roster, people)
  }, [revisions, month, roster, people])

  // Current month shifts, plus rest carried in from the previous month's last day.
  const activeDraftLeaves = useMemo(() => {
    if (!roster) return []
    const assignmentLeaves = activeRevision
      ? deriveAssignmentLeaves(activeRevision.assignments, roster, people)
      : []
    const actualLeaves = deriveActualLeaves(actuals, roster, people)
    return mergeLeaves(actualLeaves, [...boundaryLeaves, ...assignmentLeaves])
  }, [activeRevision, roster, people, actuals, boundaryLeaves])

  // Fairness (must precede validation — validateRevision consumes fairness)
  const fairness = useMemo(() => {
    if (!roster) return null
    return computeFairness(
      month, people, roster, calendarOverrides, actuals, activeRevision,
      activeDraftLeaves, roster.historyStartDate, priorAssignments,
    )
  }, [month, people, roster, calendarOverrides, actuals, activeRevision, activeDraftLeaves, priorAssignments])

  const fairnessByPerson365 = useMemo(
    () => new Map((fairness?.projections['365d'] ?? []).map(p => [p.personId, p])),
    [fairness],
  )

  // Validation
  const validation = useMemo(() => {
    if (!activeRevision || !roster) return null
    return validateRevision(activeRevision, people, roster, activeDraftLeaves, calendarOverrides, actuals, fairness ?? undefined)
  }, [activeRevision, people, roster, activeDraftLeaves, calendarOverrides, actuals, fairness])

  useEffect(() => {
    autoResolveAttempts.current = 0
    resolvedSignatures.current.clear()
    setSheetOpen(false)
    setDrawerOpen(false)
    setSelectedDate(null)
    setHighlightedPersonId(null)
  }, [month])

  useEffect(() => {
    if (!drawerOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const highlightedPerson = highlightedPersonId
    ? people.find(p => p.id === highlightedPersonId) ?? null
    : null

  const highlightedDates = useMemo(() => {
    if (!highlightedPersonId) return null
    const person = people.find(p => p.id === highlightedPersonId)
    if (!person) return null
    const related = new Set<string>()
    for (const a of activeRevision?.assignments ?? []) {
      if ((a.allocatedTo ?? a.personId) === highlightedPersonId) related.add(a.date)
    }
    for (const date of dates) {
      if (isOnVacation(person, date)) related.add(date)
      if (hasRestObligationOn(highlightedPersonId, date, activeDraftLeaves)) related.add(date)
      if (getPreference(person, date)) related.add(date)
    }
    return related
  }, [highlightedPersonId, dates, people, activeDraftLeaves, activeRevision])

  function handleSelectPerson(personId: string) {
    setHighlightedPersonId(prev => prev === personId ? null : personId)
    setView('calendar')
  }

  function clearPersonHighlight() {
    setHighlightedPersonId(null)
  }

  const repairSig = useMemo(() => {
    if (!validation || !shouldOfferAutomaticRepair(validation.warnings, validation.hardErrors)) return null
    const bits = [
      ...validation.warnings
        .filter(w => w.type === 'UNAVAILABLE' || w.type === 'NEXT_DAY_OFF' || w.type === 'AVOID_PREFERENCE')
        .map(w => `${w.type}:${w.date}:${w.personId ?? ''}`),
      ...validation.hardErrors
        .filter(e => e.kind === 'not-member')
        .map(e => `${e.kind}:${e.date}:${e.personId ?? ''}`),
    ]
    return bits.sort().join('|')
  }, [validation])

  useEffect(() => {
    if (!repairSig || !roster || !activeRevision) {
      setRepairConfirmOpen(false)
      return
    }
    if (autoResolveAttempts.current >= 2) return
    if (dismissedRepairSig.current === repairSig) return
    setRepairConfirmOpen(true)
  }, [repairSig, roster, activeRevision])

  function confirmAutomaticRepair() {
    setRepairConfirmOpen(false)
    if (!roster || !activeRevision || !validation) return
    if (autoResolveAttempts.current >= 2) return
    const result = resolveMonth(
      activeRevision, people, roster, calendarOverrides, actuals, boundaryLeaves, priorAssignments,
    )
    const before = activeRevision.assignments.map(a => `${a.date}:${a.allocatedTo ?? a.personId}`).sort().join('|')
    const after = result.assignments.map(a => `${a.date}:${a.allocatedTo ?? a.personId}`).sort().join('|')
    if (before === after || resolvedSignatures.current.has(after)) return
    resolvedSignatures.current.add(before)
    resolvedSignatures.current.add(after)
    autoResolveAttempts.current += 1
    dismissedRepairSig.current = null

    const updated: PlanRevision = {
      ...activeRevision,
      id: activeRevision.status === 'published' ? nanoid() : activeRevision.id,
      status: 'draft',
      baselineRevisionId: activeRevision.status === 'published'
        ? activeRevision.id
        : activeRevision.baselineRevisionId,
      assignments: result.assignments,
      optimizationMode: 'repair',
      outcomeStatus: 'manual',
      publishedAt: undefined,
    }
    dispatch({ type: 'SAVE_REVISION', payload: updated })
    dispatch({ type: 'SAVE_LEAVES', payload: result.leaves })
    const moved = result.changedDates.length
    setResolvedNote(
      moved === 0
        ? null
        : tp('month.reassigned', 'month.reassigned_plural', moved)
    )
  }

  function dismissAutomaticRepair() {
    dismissedRepairSig.current = repairSig
    setRepairConfirmOpen(false)
  }

  if (!roster) {
    return (
      <div className="workspace-empty">
        {t('month.noRoster')} <a href="/settings">{t('nav.settings')}</a>
      </div>
    )
  }

  const assignmentsByDate = new Map<string, Assignment[]>()
  if (activeRevision) {
    for (const a of activeRevision.assignments) {
      const list = assignmentsByDate.get(a.date) ?? []
      list.push(a)
      assignmentsByDate.set(a.date, list)
    }
  }

  function ownerOf(a: Assignment): string {
    return a.allocatedTo ?? a.personId ?? ''
  }

  function getStatus(): 'draft' | 'published' | 'stale' | 'invalid' | 'empty' {
    if (!activeRevision || activeRevision.assignments.length === 0) return 'empty'
    // Only hard structural errors (duplicate date, non-member) mark as invalid
    if (validation && !validation.valid) return 'invalid'
    if (activeRevision.status === 'published') return 'published'
    if (activeRevision.status === 'stale') return 'stale'
    return 'draft'
  }

  function handleGenerate() {
    clearPersonHighlight()
    if (!roster) return
    autoResolveAttempts.current = 0
    resolvedSignatures.current.clear()
    const lockedAssignments = activeRevision?.assignments.filter(a => a.locked || a.source === 'manual') ?? []
    const currentSig = (activeRevision?.assignments ?? [])
      .filter(a => !(a.locked || a.source === 'manual'))
      .map(a => `${a.date}:${a.allocatedTo ?? a.personId}`)
      .sort()
      .join('|')
    let seed = nanoid(12)
    let result = generatePlan(
      month, people, roster, calendarOverrides, actuals,
      lockedAssignments, boundaryLeaves, seed, priorAssignments
    )
    for (let attempt = 0; attempt < 6; attempt++) {
      const nextSig = result.assignments
        .filter(a => !(a.locked || a.source === 'manual'))
        .map(a => `${a.date}:${a.allocatedTo ?? a.personId}`)
        .sort()
        .join('|')
      if (nextSig !== currentSig) break
      seed = nanoid(12)
      result = generatePlan(
        month, people, roster, calendarOverrides, actuals,
        lockedAssignments, boundaryLeaves, seed, priorAssignments
      )
    }
    setResolvedNote(null)
    const hasCoverage = result.warnings.every(w => w.type !== 'NO_COVERAGE')
    const rev: PlanRevision = {
      id: nanoid(),
      month,
      status: 'draft',
      baselineRevisionId: publishedRevision?.id ?? null,
      assignments: result.assignments,
      calendarOverrideSnapshot: calendarOverrides.filter(o => o.date >= monthStart(month) && o.date <= monthEnd(month)),
      restPolicySnapshot: roster.restPolicies[0]?.id ?? '',
      tiebreakerSeed: seed,
      optimizationMode: 'initial',
      outcomeStatus: result.outcomeStatus,
      createdAt: new Date().toISOString(),
      actor: 'planner',
    }
    dispatch({ type: 'SAVE_REVISION', payload: rev })
    dispatch({ type: 'SAVE_LEAVES', payload: result.leaves })
    trackEvent('plan', {
      month,
      locale,
      workable: hasCoverage ? 'yes' : 'no',
    })
  }

  function handlePublish() {
    clearPersonHighlight()
    if (!draftRevision) return
    setShowReview(true)
  }

  function confirmPublish() {
    if (!draftRevision) return
    dispatch({ type: 'PUBLISH_REVISION', payload: { revisionId: draftRevision.id, publishedAt: new Date().toISOString() } })
    trackEvent('publish', { month, locale })
    setShowReview(false)
  }

  function openSide(panel: 'fairness' | 'day' | 'people' | 'issues', date?: string) {
    if (date) setSelectedDate(date)
    setSidePanel(panel)
    setSheetOpen(true)
  }

  function handleDateClick(date: string) {
    clearPersonHighlight()
    openSide('day', date)
  }

  function handleSetOfficialHoliday(date: string, wantHoliday: boolean) {
    if (!roster) return
    const action = desiredHolidayAction(date, roster, calendarOverrides, wantHoliday)
    if (action.kind === 'set') {
      dispatch({ type: 'SET_CALENDAR_OVERRIDE', payload: action.override })
    } else if (action.kind === 'remove') {
      dispatch({ type: 'REMOVE_CALENDAR_OVERRIDE', payload: date })
    }
  }

  function ensureDraft(): PlanRevision | null {
    if (!roster) return null
    if (draftRevision) return draftRevision
    if (publishedRevision) {
      return {
        ...publishedRevision,
        id: nanoid(),
        status: 'draft',
        baselineRevisionId: publishedRevision.id,
        optimizationMode: 'manual',
        outcomeStatus: 'manual',
        createdAt: new Date().toISOString(),
        publishedAt: undefined,
      }
    }
    return {
      id: nanoid(),
      month,
      status: 'draft',
      baselineRevisionId: null,
      assignments: [],
      calendarOverrideSnapshot: [],
      restPolicySnapshot: roster.restPolicies[0]?.id ?? '',
      tiebreakerSeed: nanoid(12),
      optimizationMode: 'manual',
      outcomeStatus: 'manual',
      createdAt: new Date().toISOString(),
      actor: 'planner',
    }
  }

  function handleAssign(date: string, personId: string) {
    clearPersonHighlight()
    if (!roster) return
    const person = people.find(p => p.id === personId)
    if (!person) return
    if (date >= roster.historyStartDate && !isMemberOn(person, date)) return
    const base = ensureDraft()
    if (!base) return
    const needed = requiredHeadcount(date, roster)
    const wasAssigned = base.assignments.some(a => a.date === date && ownerOf(a) === personId)
    const nextAssignments = toggleShiftAssignment(base.assignments, date, personId, needed)
    const updated: PlanRevision = {
      ...base,
      assignments: nextAssignments,
    }
    dispatch({ type: 'SAVE_REVISION', payload: updated })
    const assignmentLeaves = deriveAssignmentLeaves(updated.assignments, roster, people)
    const actualLeaves = deriveActualLeaves(actuals, roster, people)
    dispatch({ type: 'SAVE_LEAVES', payload: mergeLeaves(actualLeaves, assignmentLeaves) })
    const stillOnDate = nextAssignments.filter(a => a.date === date)
    if (wasAssigned) {
      if (stillOnDate.length === 0) recordPastActual(date, null)
      return
    }
    if (stillOnDate.length === 1) {
      recordPastActual(date, personId, base.assignments.find(a => a.date === date))
    }
  }

  function recordPastActual(date: string, personId: string | null, previous?: Assignment) {
    if (date >= localToday() || !roster) return
    const existing = actuals.find(a => a.date === date)
    if (!personId) {
      if (!existing) return
      dispatch({
        type: 'SAVE_ACTUAL',
        payload: { ...existing, status: 'cancelled', confirmedAt: new Date().toISOString() },
      })
      return
    }
    const planned = existing?.plannedPersonId
      ?? previous?.allocatedTo
      ?? previous?.personId
      ?? personId
    const payload: ActualShift = {
      id: existing?.id ?? nanoid(),
      date,
      plannedPersonId: planned,
      actualPersonId: personId,
      status: planned !== personId ? 'substituted' : 'completed',
      recordedAsHoliday: isHoliday(date, roster, calendarOverrides),
      confirmedAt: new Date().toISOString(),
    }
    dispatch({ type: 'SAVE_ACTUAL', payload })
  }

  function handleProhibit(date: string, personId: string, onVacation: boolean) {
    clearPersonHighlight()
    const person = people.find(p => p.id === personId)
    if (!person) return
    dispatch({ type: 'UPDATE_PERSON', payload: withVacation(person, date, onVacation) })
  }

  function handleAvoid(date: string, personId: string, avoided: boolean) {
    clearPersonHighlight()
    const person = people.find(p => p.id === personId)
    if (!person) return
    dispatch({ type: 'UPDATE_PERSON', payload: withAvoidedDate(person, date, avoided) })
  }

  function handleSetPreference(date: string, personId: string, pref: import('../../domain/types').PreferenceType | null) {
    clearPersonHighlight()
    const person = people.find(p => p.id === personId)
    if (!person) return
    dispatch({ type: 'UPDATE_PERSON', payload: withPreference(person, date, pref) })
  }

  function isKeptAssignment(a: Assignment): boolean {
    return a.source === 'manual' || a.locked
  }

  const hasAutoAssignments = (activeRevision?.assignments.some(a => !isKeptAssignment(a)) ?? false)
  const hasMonthPrefs = people.some(p => hasMonthPreferences(p, month))
  const canClearMonth = hasAutoAssignments || hasMonthPrefs

  function openClearMonth() {
    clearPersonHighlight()
    setDrawerOpen(false)
    setClearAlsoPrefs(hasMonthPrefs && !hasAutoAssignments)
    setClearMonthOpen(true)
  }

  function handleClearMonth() {
    if (!roster || !canClearMonth) return
    const remaining = (activeRevision?.assignments ?? []).filter(isKeptAssignment)
    if (activeRevision) {
      const cleared: PlanRevision = {
        ...activeRevision,
        id: activeRevision.status === 'published' ? nanoid() : activeRevision.id,
        status: 'draft',
        baselineRevisionId: activeRevision.status === 'published'
          ? activeRevision.id
          : activeRevision.baselineRevisionId,
        assignments: remaining,
        optimizationMode: 'manual',
        outcomeStatus: 'manual',
        publishedAt: undefined,
      }
      dispatch({ type: 'SAVE_REVISION', payload: cleared })
      dispatch({ type: 'DROP_ASSIGNMENT_LEAVES', payload: month })
      const assignmentLeaves = deriveAssignmentLeaves(remaining, roster, people)
      const actualLeaves = deriveActualLeaves(actuals, roster, people)
      dispatch({ type: 'SAVE_LEAVES', payload: mergeLeaves(actualLeaves, assignmentLeaves) })
    }
    if (clearAlsoPrefs) {
      for (const person of people) {
        if (!hasMonthPreferences(person, month)) continue
        dispatch({ type: 'UPDATE_PERSON', payload: withoutMonthPreferences(person, month) })
      }
    }
    setClearMonthOpen(false)
    setResolvedNote(null)
    trackEvent('clear_month', { month, locale })
  }

  function handleUnassign(date: string, personId?: string) {
    clearPersonHighlight()
    if (!activeRevision) return
    const updated: PlanRevision = {
      ...activeRevision,
      status: 'draft',
      assignments: activeRevision.assignments.filter(a => {
        if (a.date !== date) return true
        if (!personId) return false
        return ownerOf(a) !== personId
      }),
    }
    dispatch({ type: 'SAVE_REVISION', payload: updated })
    if (!personId || updated.assignments.every(a => a.date !== date)) {
      recordPastActual(date, null)
    }
  }

  // Build calendar grid (Monday-start)
  const firstDay = new Date(month + '-01T12:00:00')
  // ISO: Mon=1 … Sun=7. We want Mon=0 offset
  const firstDow = ((firstDay.getDay() + 6) % 7) // Mon=0

  const cells: (string | null)[] = [
    ...Array(firstDow).fill(null),
    ...dates,
  ]
  // Pad to complete weeks
  while (cells.length % 7 !== 0) cells.push(null)

  const cellWarningDates = new Set(
    (validation?.warnings.filter(w =>
      w.type === 'UNAVAILABLE' || w.type === 'NEXT_DAY_OFF' || w.type === 'CONSECUTIVE_SHIFT'
    ) ?? []).map(w => w.date)
  )
  const hardErrorDates = new Set(
    (validation?.hardErrors ?? []).map(e => e.date)
  )

  const impossibleDates = dates
    .filter(date => {
      if (date < roster.historyStartDate) return false
      const filled = new Set((assignmentsByDate.get(date) ?? []).map(ownerOf).filter(Boolean))
      return filled.size < requiredHeadcount(date, roster)
    })
    .map(date => ({
      date,
      ...explainDateBlocks(date, people, activeDraftLeaves, activeRevision?.assignments ?? []),
    }))
    .filter(item => item.eligibleNames.length === 0)

  const impossibleGroups: { start: string; end: string; detail: string }[] = []
  for (const item of impossibleDates) {
    const detail = item.blocks.map(b => `${b.name}: ${b.reason}`).join(' · ')
    const last = impossibleGroups[impossibleGroups.length - 1]
    if (last && last.detail === detail && addDays(last.end, 1) === item.date) {
      last.end = item.date
    } else {
      impossibleGroups.push({ start: item.date, end: item.date, detail })
    }
  }
  const impossibleSet = new Set(impossibleDates.map(item => item.date))
  const status = getStatus()
  // Only paint infeasibility when a real plan exists — empty months aren't "conflicts"
  const showImpossibleConflicts = people.length > 0 && (activeRevision?.assignments.length ?? 0) > 0

  // Hard errors prevent publish; advisory warnings are shown as info
  const hardErrorMessages: { key: string; date: string | null; text: string }[] = []
  for (const err of validation?.hardErrors ?? []) {
    if (err.kind === 'duplicate-date') {
      hardErrorMessages.push({ key: `dup-${err.date}`, date: err.date, text: err.message })
    } else if (err.kind === 'not-member') {
      hardErrorMessages.push({ key: `member-${err.date}-${err.personId}`, date: err.date, text: err.message })
    }
  }
  // Advisory warnings for display only — skip fairness (shown in Fairness panel)
  // and skip "unassigned" noise when the month has no plan yet.
  const hasAnyAssignments = (activeRevision?.assignments.length ?? 0) > 0
  const advisoryWarnings = (validation?.warnings ?? []).filter(w => {
    if (w.type === 'OVER_FAIR_SHARE' || w.type === 'UNDER_FAIR_SHARE') return false
    if (w.type === 'NO_COVERAGE' && !hasAnyAssignments) return false
    return true
  })

  const selectedDayConflictNotes = selectedDate
    ? [
        ...hardErrorMessages
          .filter(err => err.date === selectedDate)
          .map(err => ({ key: err.key, text: err.text })),
        ...advisoryWarnings
          .filter(w => w.date === selectedDate && CONFLICT_NOTE_HINTS[w.type])
          .map(w => {
            const hint = CONFLICT_NOTE_HINTS[w.type]!
            const person = w.personId ? people.find(p => p.id === w.personId) : null
            return {
              key: `${w.type}-${w.date}-${w.personId ?? ''}`,
              text: person ? `${person.name}: ${t(hint)}` : t(hint),
            }
          }),
        ...(showImpossibleConflicts && impossibleSet.has(selectedDate)
          ? [{
              key: `impossible-${selectedDate}`,
              text: (() => {
                const item = impossibleDates.find(d => d.date === selectedDate)
                const detail = item?.blocks.map(b => `${b.name}: ${b.reason}`).join(' · ')
                return detail ? `${t('day.noOneAvailable')} ${detail}` : t('day.noOneAvailable')
              })(),
            }]
          : []),
      ]
    : []

  const desktopActions = (
    <>
      <div className="view-toggle">
        <button
          className={`btn btn-ghost ${view === 'calendar' ? 'active' : ''}`}
          onClick={() => { setView('calendar'); clearPersonHighlight() }}
        >{t('month.grid')}</button>
        <button
          className={`btn btn-ghost ${view === 'people' ? 'active' : ''}`}
          onClick={() => { setView('people'); clearPersonHighlight() }}
        >{t('month.people')}</button>
      </div>
      <button
        className="btn btn-ghost"
        onClick={openClearMonth}
        disabled={!canClearMonth}
        title={t('month.clearMonthTitle')}
      >
        <IconTrash size={16} /> {t('month.clearMonth')}
      </button>
      <button
        className="btn btn-secondary"
        onClick={() => setPlanConfirmOpen(true)}
        title={t('month.newPlanTitle')}
      >
        <IconWand size={16} /> {t('month.newPlan')}
      </button>
      <button
        className="btn btn-primary"
        onClick={handlePublish}
        disabled={!draftRevision || !validation?.publishable}
        title={!draftRevision ? t('month.publishNoDraft') : t('month.publishTitle')}
      >
        <IconPublish size={16} /> {t('month.publish')}
      </button>
    </>
  )

  function closeDrawer() {
    setDrawerOpen(false)
  }

  const mobileDrawer = (
    <div className="actions-drawer-root" role="presentation">
      <div className="actions-drawer-backdrop" onClick={closeDrawer} />
      <aside
        className="actions-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t('month.actions')}
      >
        <div className="actions-drawer-head">
          <h3>{t('month.actions')}</h3>
          <button className="btn btn-ghost icon-btn" aria-label={t('month.closePanel')} onClick={closeDrawer}>
            <IconClose size={18} />
          </button>
        </div>
        <div className="actions-drawer-section">
          <div className="actions-drawer-label">{t('month.views')}</div>
          <button
            className={`btn btn-ghost ${view === 'calendar' ? 'active' : ''}`}
            onClick={() => { setView('calendar'); clearPersonHighlight(); closeDrawer() }}
          >
            <IconCalendar size={16} /> {t('month.grid')}
          </button>
          <button
            className={`btn btn-ghost ${view === 'people' ? 'active' : ''}`}
            onClick={() => { setView('people'); clearPersonHighlight(); closeDrawer() }}
          >
            <IconPeople size={16} /> {t('month.people')}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => { openSide('fairness'); closeDrawer() }}
          >{t('month.fairness')}</button>
          <button
            className="btn btn-ghost"
            onClick={() => { navigate(`/actuals/${month}`); closeDrawer() }}
          >{t('month.actuals')}</button>
        </div>
        <div className="actions-drawer-section">
          <div className="actions-drawer-label">{t('month.actions')}</div>
          <button
            className="btn btn-secondary"
            onClick={() => { setPlanConfirmOpen(true); closeDrawer() }}
          >
            <IconWand size={16} /> {t('month.newPlan')}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => { handlePublish(); closeDrawer() }}
            disabled={!draftRevision || !validation?.publishable}
          >
            <IconPublish size={16} /> {t('month.publish')}
          </button>
          <button
            className="btn btn-ghost"
            onClick={openClearMonth}
            disabled={!canClearMonth}
          >
            <IconTrash size={16} /> {t('month.clearMonth')}
          </button>
        </div>
      </aside>
    </div>
  )

  return (
    <div className="month-workspace">
      <div className="workspace-topbar">
        <div className="topbar-left">
          <button className="btn btn-ghost topbar-nav" aria-label={t('month.prevMonth')} onClick={() => navigate(`/month/${prevMonth(month)}`)}>
            <IconChevronLeft size={18} />
          </button>
          <h2 className="workspace-month-title">{formatMonth(month, localeTag)}</h2>
          <button className="btn btn-ghost topbar-nav" aria-label={t('month.nextMonth')} onClick={() => navigate(`/month/${nextMonth(month)}`)}>
            <IconChevronRight size={18} />
          </button>
          {month < localToday().slice(0, 7) && (
            <span className="past-month-badge" title={t('month.pastDateHint')}>
              <IconWarn size={14} /> {t('month.pastDate')}
            </span>
          )}
          <StatusPill status={status} t={t} />
          {(hardErrorMessages.length > 0 || advisoryWarnings.length > 0) && (
            <button
              type="button"
              className={`topbar-issue-chip ${hardErrorMessages.length > 0 ? 'blocking' : ''}`}
              onClick={() => openSide('issues')}
            >
              <IconWarn size={14} />
              {hardErrorMessages.length > 0
                ? tp('issues.blockingOne', 'issues.blockingOther', hardErrorMessages.length)
                : tp('issues.noteOne', 'issues.noteOther', advisoryWarnings.length)}
            </button>
          )}
          {highlightedPerson && (
            <span className="topbar-issue-chip focus">
              {t('month.highlightingPerson', { name: highlightedPerson.name })}
              <button type="button" className="topbar-chip-clear" onClick={() => setHighlightedPersonId(null)}>
                {t('month.clearHighlight')}
              </button>
            </span>
          )}
        </div>
        <div className="topbar-actions">
          <div className="actions-desktop">{desktopActions}</div>
          <div className="actions-mobile">
            <button
              className={`btn btn-ghost icon-btn ${drawerOpen ? 'is-open' : ''}`}
              onClick={() => setDrawerOpen(open => !open)}
              aria-label={t('month.actions')}
              aria-expanded={drawerOpen}
            >
              <IconMenu />
            </button>
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="workspace-body">
        <div className="workspace-content">
          {view === 'calendar' ? (
            <div className="month-grid-container">
              <div className={`month-grid ${highlightedDates ? 'person-focus' : ''}`}>
                <div className="grid-header">
                  {dayHeaders.map(d => (
                    <div key={d} className="grid-header-cell">{d}</div>
                  ))}
                </div>
                <div className="grid-body">
                  {cells.map((date, i) => {
                    if (!date) return <div key={i} className="grid-cell empty" />
                    const dayAssignments = assignmentsByDate.get(date) ?? []
                    const dayPeople = dayAssignments
                      .map(a => people.find(p => p.id === ownerOf(a)))
                      .filter((p): p is NonNullable<typeof p> => !!p)
                    const holiday = roster ? isHoliday(date, roster, calendarOverrides) : false
                    const src = roster ? holidaySource(date, roster, calendarOverrides) : null
                    const hasConflict = cellWarningDates.has(date) || hardErrorDates.has(date)
                      || (showImpossibleConflicts && impossibleSet.has(date))
                    const blocked = people.filter(p => isOnVacation(p, date))
                    const dayPrefs = people
                      .map(p => {
                        const pref = getPreference(p, date)
                        return pref ? { person: p, pref } : null
                      })
                      .filter((x): x is { person: typeof people[number]; pref: PreferenceType } => x != null)
                    const today = localToday()
                    const isPast = date < today
                    const isToday = date === today
                    const actualForDate = actuals.find(a => a.date === date && a.status !== 'cancelled')
                    const personRelated = highlightedDates?.has(date) ?? false
                    const personDimmed = !!highlightedDates && !personRelated
                    const noMarks = dayPrefs.filter(p => p.pref === 'AVOID')
                    const isManual = dayAssignments.some(a => a.locked || a.source === 'manual')

                    return (
                      <div
                        key={date}
                        className={[
                          'grid-cell',
                          holiday ? 'holiday' : '',
                          hasConflict ? 'conflict' : '',
                          selectedDate === date ? 'selected' : '',
                          isPast ? 'past' : '',
                          isToday ? 'today' : '',
                          personRelated ? 'person-related' : '',
                          personDimmed ? 'person-dimmed' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => handleDateClick(date)}
                      >
                        <div className="cell-top">
                          <span className="cell-date-num">{parseInt(date.slice(8))}</span>
                          {src && (
                            <span
                              className={`cell-holiday-tag ${src === 'explicit-override-normal' ? 'override-normal' : ''}`}
                              title={
                                src === 'explicit' ? t('month.tagHolidayTitle')
                                  : src === 'weekend-default' ? t('month.tagWeekendTitle')
                                    : t('month.tagNormalTitle')
                              }
                            >
                              {src === 'explicit' ? t('month.tagHoliday')
                                : src === 'weekend-default' ? t('month.tagWeekend')
                                  : t('month.tagNormal')}
                            </span>
                          )}
                          {dayPeople.some(p => isOnVacation(p, date) || hasRestObligationOn(p.id, date, activeDraftLeaves)) && (
                            <span className="cell-warn" title={dayPeople.some(p => isOnVacation(p, date)) ? t('month.assignedVacation') : t('month.assignedRest')}><IconWarn /></span>
                          )}
                        </div>
                        <div className={`cell-person ${isManual ? 'manual' : ''}`} title={dayPeople.map(p => p.name).join(', ')} aria-label={dayPeople.map(p => p.name).join(', ')}>
                          {dayPeople.length > 0 ? (
                            <>
                              <span className="cell-person-name" aria-hidden="true">{dayPeople.map(p => p.name).join(' · ')}</span>
                              <span className="cell-person-initials" aria-hidden="true">
                                {dayPeople.map(p => initialsById.get(p.id) ?? p.name).join('·')}
                              </span>
                              {isManual && (
                                <span className="cell-lock" title={t('month.locked')}><IconLock size={12} /></span>
                              )}
                            </>
                          ) : (
                            <span className="cell-unassigned">—</span>
                          )}
                        </div>
                        <div className="cell-marks">
                          <CellMarkLine
                            items={noMarks.map(({ person: p, pref }) => ({
                              id: p.id,
                              title: `${prefLabel(pref, t)}: ${p.name}`,
                              initials: initialsById.get(p.id) ?? p.name,
                            }))}
                            className="cell-pref-avoid"
                            icon={<IconPrefNo size={12} />}
                          />
                          <CellMarkLine
                            items={blocked.map(p => ({
                              id: p.id,
                              title: `${p.name} ${t('month.onVacation')}`,
                              initials: initialsById.get(p.id) ?? p.name,
                            }))}
                            className="cell-vacation-icon"
                            icon={<IconVacation size={12} />}
                          />
                        </div>
                        {actualForDate && !dayAssignments.some(a => ownerOf(a) === actualForDate.actualPersonId) && dayAssignments.length > 0 && (
                          <div className="cell-substituted" title={t('month.substituted')}>↔</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <PeopleMatrix
              month={month}
              dates={dates}
              people={people}
              assignmentMap={assignmentsByDate}
              leaves={activeDraftLeaves}
              roster={roster}
              overrides={calendarOverrides}
              fairnessByPerson={fairnessByPerson365}
              onSelectDate={(date) => { clearPersonHighlight(); openSide('day', date) }}
              t={t}
            />
          )}
        </div>

        <div
          className={`sheet-backdrop ${sheetOpen ? 'open' : ''}`}
          onClick={() => setSheetOpen(false)}
        />

        <aside className={`workspace-side ${sheetOpen ? 'open' : ''}`} aria-hidden={!sheetOpen}>
          <div className="sheet-handle" />
          <button className="sheet-close btn btn-ghost" aria-label={t('month.closePanel')} onClick={() => setSheetOpen(false)}>
            <IconClose size={18} />
          </button>
          <div className="side-tabs">
            <button
              className={`side-tab ${sidePanel === 'fairness' ? 'active' : ''}`}
              onClick={() => setSidePanel('fairness')}
            >{t('month.fairness')}</button>
            <button
              className={`side-tab ${sidePanel === 'day' ? 'active' : ''}`}
              onClick={() => setSidePanel('day')}
            >{t('month.day')}</button>
            <button
              className={`side-tab ${sidePanel === 'people' ? 'active' : ''}`}
              onClick={() => setSidePanel('people')}
            >{t('month.people')}</button>
            <button
              className={`side-tab ${sidePanel === 'issues' ? 'active' : ''} ${(hardErrorMessages.length > 0 || advisoryWarnings.length > 0) ? 'has-badge' : ''}`}
              onClick={() => setSidePanel('issues')}
            >
              {t('month.issues')}
              {(hardErrorMessages.length + advisoryWarnings.length) > 0 && (
                <span className={`side-tab-count ${hardErrorMessages.length > 0 ? 'blocking' : ''}`}>
                  {hardErrorMessages.length + advisoryWarnings.length}
                </span>
              )}
            </button>
          </div>
          {sidePanel === 'fairness' && fairness && (
            <FairnessPanel
              fairness={fairness}
              people={peopleByName}
              selectedPersonId={highlightedPersonId}
              onSelectPerson={handleSelectPerson}
            />
          )}
          {sidePanel === 'day' && selectedDate && (
            <DaySheet
              date={selectedDate}
              people={peopleByName}
              roster={roster}
              overrides={calendarOverrides}
              assignments={assignmentsByDate.get(selectedDate) ?? []}
              leaves={activeDraftLeaves}
              draftAssignments={activeRevision?.assignments ?? []}
              fairness={fairness}
              conflictNotes={selectedDayConflictNotes}
              onAssign={handleAssign}
              onUnassign={handleUnassign}
              onProhibit={handleProhibit}
              onAvoid={handleAvoid}
              onSetOfficialHoliday={handleSetOfficialHoliday}
            />
          )}
          {sidePanel === 'people' && (
            <PeoplePanel
              people={peopleByName}
              dates={dates}
              assignments={activeRevision?.assignments ?? []}
              selectedDate={selectedDate}
              selectedPersonId={highlightedPersonId}
              onSelectDate={(date) => { clearPersonHighlight(); openSide('day', date) }}
              onSelectPerson={handleSelectPerson}
              fairnessByPerson={fairnessByPerson365}
            />
          )}
          {sidePanel === 'issues' && (
            <div className="issues-panel">
              {resolvedNote && <div className="status-note">{resolvedNote}</div>}
              {activeRevision?.optimizationMode === 'initial' && activeRevision.outcomeStatus === 'feasible-best-found' && (
                <div className="status-note">{t('month.workableNote')}</div>
              )}
              {hardErrorMessages.length === 0 && advisoryWarnings.length === 0 && !resolvedNote && (
                <div className="side-empty text-ink-3 text-sm">{t('month.noIssues')}</div>
              )}
              <IssuesBar
                hardErrors={hardErrorMessages}
                warnings={advisoryWarnings}
                people={people}
                onOpenDate={(date) => { clearPersonHighlight(); openSide('day', date) }}
                expanded
              />
            </div>
          )}
          {sidePanel === 'day' && !selectedDate && (
            <div className="side-empty text-ink-3 text-sm">
              {t('month.tapDay')}
            </div>
          )}
        </aside>
      </div>

      {drawerOpen && createPortal(mobileDrawer, document.body)}

      {/* Review sheet overlay */}
      {showReview && draftRevision && (
        <ReviewSheet
          draftRevision={draftRevision}
          publishedRevision={publishedRevision ?? null}
          people={people}
          roster={roster}
          overrides={calendarOverrides}
          leaves={activeDraftLeaves}
          fairness={fairness}
          validation={validation}
          onConfirmPublish={confirmPublish}
          onClose={() => setShowReview(false)}
        />
      )}

      {planConfirmOpen && (
        <div className="confirm-overlay" onClick={() => setPlanConfirmOpen(false)}>
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="plan-confirm-title"
            aria-describedby="plan-confirm-lead"
            onClick={e => e.stopPropagation()}
          >
            <h3 id="plan-confirm-title" className="confirm-dialog-title">{t('month.confirmPlanTitle')}</h3>
            <p id="plan-confirm-lead" className="confirm-dialog-lead">{t('month.confirmPlanLead')}</p>
            <div className="confirm-dialog-actions">
              <button className="btn btn-secondary" onClick={() => setPlanConfirmOpen(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={() => { setPlanConfirmOpen(false); handleGenerate() }}>{t('month.confirmPlanAction')}</button>
            </div>
          </div>
        </div>
      )}

      {repairConfirmOpen && (
        <div className="confirm-overlay" onClick={dismissAutomaticRepair}>
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="repair-confirm-title"
            aria-describedby="repair-confirm-lead"
            onClick={e => e.stopPropagation()}
          >
            <h3 id="repair-confirm-title" className="confirm-dialog-title">{t('month.confirmRepairTitle')}</h3>
            <p id="repair-confirm-lead" className="confirm-dialog-lead">{t('month.confirmRepairLead')}</p>
            <div className="confirm-dialog-actions">
              <button className="btn btn-secondary" onClick={dismissAutomaticRepair}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={confirmAutomaticRepair}>{t('month.confirmRepairAction')}</button>
            </div>
          </div>
        </div>
      )}

      {clearMonthOpen && (
        <div
          className="confirm-overlay"
          onClick={() => setClearMonthOpen(false)}
        >
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="clear-month-title"
            aria-describedby="clear-month-lead"
            onClick={e => e.stopPropagation()}
          >
            <div className="confirm-dialog-icon"><IconTrash size={22} /></div>
            <h3 id="clear-month-title" className="confirm-dialog-title">
              {t('month.clearMonth')}
            </h3>
            <p id="clear-month-lead" className="confirm-dialog-lead">
              {t('month.clearMonthLead')}
            </p>
            <div className="clear-month-choices" role="radiogroup" aria-label={t('month.clearMonth')}>
              <label className="clear-month-choice">
                <input
                  type="radio"
                  name="clear-month-scope"
                  checked={!clearAlsoPrefs}
                  onChange={() => setClearAlsoPrefs(false)}
                  disabled={!hasAutoAssignments}
                />
                <span>
                  <strong>{t('month.clearAutoOnly')}</strong>
                  <span className="help-text">{t('month.clearAutoOnlyDesc')}</span>
                </span>
              </label>
              <label className="clear-month-choice">
                <input
                  type="radio"
                  name="clear-month-scope"
                  checked={clearAlsoPrefs}
                  onChange={() => setClearAlsoPrefs(true)}
                  disabled={!hasMonthPrefs}
                />
                <span>
                  <strong>{t('month.clearAlsoPrefs')}</strong>
                  <span className="help-text">{t('month.clearAlsoPrefsDesc')}</span>
                </span>
              </label>
            </div>
            <div className="confirm-dialog-actions">
              <button className="btn btn-secondary" onClick={() => setClearMonthOpen(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-danger" onClick={handleClearMonth}>
                {t('month.clearMonthConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CellMarkLine({
  items,
  className,
  icon,
}: {
  items: { id: string; title: string; initials: string }[]
  className: string
  icon: ReactNode
}) {
  const empty = items.length === 0
  const extra = Math.max(0, items.length - 1)
  const titles = items.map(item => item.title).join('\n')
  const initials = items.map(item => item.initials).join(' ')
  return (
    <div className={`cell-mark-row ${empty ? 'is-empty' : ''}`}>
      <span
        className={`cell-pref-icon ${className}${empty ? ' is-empty' : ''}`}
        title={empty ? undefined : titles}
      >
        {icon}
      </span>
      <span className="cell-mark-people" title={empty ? undefined : titles}>
        <span className="cell-mark-initials">{initials}</span>
        {extra > 0 && <span className="cell-mark-more">+{extra}</span>}
      </span>
    </div>
  )
}

function prefShort(pref: PreferenceType, t: (key: MessageKey) => string): string {
  switch (pref) {
    case 'HAVE': return t('pref.have')
    case 'WANT': return t('pref.want')
    case 'PREFER': return t('pref.prefer')
    case 'AVOID': return t('pref.no')
  }
}

function prefLabel(pref: PreferenceType, t: (key: MessageKey) => string): string {
  return prefShort(pref, t)
}

function formatRange(start: string, end: string): string {
  if (start === end) return formatDateShort(start)
  return `${parseInt(start.slice(8), 10)}–${formatDateShort(end)}`
}

function formatDateList(dates: string[]): string {
  const groups: { start: string; end: string }[] = []
  for (const date of dates) {
    const last = groups[groups.length - 1]
    if (last && addDays(last.end, 1) === date) last.end = date
    else groups.push({ start: date, end: date })
  }
  return groups.map(group => formatRange(group.start, group.end)).join(', ')
}

function StatusPill({ status, t }: { status: string; t: (key: MessageKey) => string }) {
  const cls = status === 'published' ? 'pill-published'
    : status === 'stale' ? 'pill-stale'
    : status === 'invalid' ? 'pill-invalid'
    : status === 'empty' ? 'pill-draft'
    : 'pill-draft'
  const labelKey: MessageKey =
    status === 'published' ? 'status.published'
    : status === 'stale' ? 'status.stale'
    : status === 'invalid' ? 'status.invalid'
    : status === 'empty' ? 'status.empty'
    : 'status.draft'
  return <span className={`pill ${cls}`}>{t(labelKey)}</span>
}

function PeopleMatrix({
  dates, people, assignmentMap, leaves, roster, overrides, fairnessByPerson, onSelectDate, t,
}: {
  month: string
  dates: string[]
  people: any[]
  assignmentMap: Map<string, Assignment[]>
  leaves: any[]
  roster: any
  overrides: CalendarDateOverride[]
  fairnessByPerson: Map<string, FairnessProjection>
  onSelectDate: (date: string) => void
  t: (key: MessageKey, params?: Record<string, string | number>) => string
}) {
  return (
    <div className="people-matrix">
      <div className="matrix-header">
        <div className="matrix-name-col">{t('common.person')}</div>
        {dates.map(d => (
          <div key={d} className={`matrix-day-col ${isHoliday(d, roster, overrides) ? 'holiday' : ''}`}>
            {parseInt(d.slice(8))}
          </div>
        ))}
      </div>
      {people.map(person => {
        const month_ = dates[0]?.slice(0, 7)
        const shifts = dates.filter(d =>
          (assignmentMap.get(d) ?? []).some(a => (a.allocatedTo ?? a.personId) === person.id)
        ).length
        return (
          <div key={person.id} className="matrix-row">
            <div className="matrix-name-col">
              <span>{person.name}</span>
              <span className="matrix-count text-xs text-ink-3">{t('month.shifts', { count: shifts })}</span>
              {fairnessByPerson.get(person.id) && (
                <FairnessSummary projection={fairnessByPerson.get(person.id)!} compact />
              )}
            </div>
            {dates.map(d => {
              const assigned = (assignmentMap.get(d) ?? []).some(a => (a.allocatedTo ?? a.personId) === person.id)
              const unavailable = isUnavailableOn(person, d)
              const onRest = leaves.some(l =>
                l.personId === person.id &&
                (l.immediateRestDate === d || l.compensatoryLeaveDate === d)
              )
              const pref = person.datePreferences?.[d] ??
                (person.monthlyConditions[d.slice(0,7)]?.avoidedDates?.includes(d) ? 'AVOID' : null)
              const avoided = pref === 'AVOID'
              const isMember = isMemberOn(person, d)
              return (
                <div
                  key={d}
                  className={[
                    'matrix-cell',
                    assigned ? 'assigned' : '',
                    unavailable ? 'unavailable' : '',
                    onRest ? 'rest' : '',
                    avoided ? 'avoided' : '',
                    !isMember ? 'not-member' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => onSelectDate(d)}
                  title={
                    unavailable ? t('month.matrixVacation')
                    : onRest ? t('month.matrixRest')
                    : avoided ? t('month.matrixNo')
                    : !isMember ? t('month.matrixNotMember')
                    : assigned ? t('month.matrixAssigned')
                    : ''
                  }
                >
                  {assigned ? '●' : unavailable ? '✗' : onRest ? '░' : avoided ? '✕' : !isMember ? '—' : ''}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
