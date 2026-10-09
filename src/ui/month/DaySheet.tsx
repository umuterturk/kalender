import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  Person, Roster, Assignment, LeaveObligation, CalendarDateOverride, PreferenceType, DayType
} from '../../domain/types'
import type { FairnessReport } from '../../domain/fairness'
import { classifyDay, getBucketBalance, getOverallBalance } from '../../domain/fairness'
import {
  isHoliday, formatDateLong, localToday, addDays, monthOf
} from '../../domain/calendar'
import {
  isMemberOn, isOnVacation, hasRestObligationOn, getPreference, countAssignmentsInMonth
} from '../../domain/eligibility'
import type { MessageKey } from '../../i18n'
import { useI18n } from '../../i18n'
import { formatDayType } from '../../i18n/dayType'
import { IconWand, IconWarn } from '../icons'
import './DaySheet.css'

interface Props {
  date: string
  people: Person[]
  roster: Roster
  overrides: CalendarDateOverride[]
  assignments: Assignment[]
  leaves: LeaveObligation[]
  draftAssignments: Assignment[]
  fairness: FairnessReport | null
  onAssign: (date: string, personId: string) => void
  onUnassign: (date: string, personId?: string) => void
  onProhibit: (date: string, personId: string, prohibited: boolean) => void
  onAvoid: (date: string, personId: string, avoided: boolean) => void
  onSetPreference?: (date: string, personId: string, pref: PreferenceType | null) => void
  onSetOfficialHoliday?: (date: string, holiday: boolean) => void
  onFillDay?: (date: string) => void
  conflictNotes?: { key: string; text: string }[]
}

type PendingAction =
  | { kind: 'set'; personId: string }
  | { kind: 'no'; personId: string }
  | { kind: 'clear'; personId: string }
  | { kind: 'vacation'; personId: string; on: boolean }
  | { kind: 'preference'; personId: string; pref: PreferenceType | null }
  | { kind: 'holiday'; want: boolean }

function dayTypeKeys(dayType: DayType): {
  code: MessageKey
  title: MessageKey
  help: MessageKey
} {
  switch (dayType) {
    case 'NH':
      return { code: 'day.typeNT', title: 'day.typeTitleNT', help: 'day.typeHelpNT' }
    case 'HN':
      return { code: 'day.typeTN', title: 'day.typeTitleTN', help: 'day.typeHelpTN' }
    case 'HH':
      return { code: 'day.typeTT', title: 'day.typeTitleTT', help: 'day.typeHelpTT' }
    default:
      return { code: 'day.typeNN', title: 'day.typeTitleNN', help: 'day.typeHelpNN' }
  }
}

function ownerId(a: Assignment): string {
  return a.allocatedTo ?? a.personId ?? ''
}

/** Warnings a manual Set would create for this person on this date. */
function setWarningKeys(
  person: Person,
  date: string,
  assignedHere: boolean,
  onVacation: boolean,
  onRest: boolean,
  pref: PreferenceType | null,
  assignments: Assignment[],
  isPast: boolean,
): MessageKey[] {
  const keys: MessageKey[] = []
  if (isPast) keys.push('day.warnPast')
  if (onVacation) keys.push('day.warnVacation')
  if (onRest) keys.push('day.warnRest')
  if (pref === 'AVOID') keys.push('day.warnAvoid')
  const neighbors = [addDays(date, -1), addDays(date, 1)]
  if (assignments.some(a => neighbors.includes(a.date) && ownerId(a) === person.id)) {
    keys.push('day.warnConsecutive')
  }
  const max = person.monthlyConditions[monthOf(date)]?.max
  if (max != null) {
    const count = countAssignmentsInMonth(person.id, monthOf(date), assignments)
    const next = assignedHere ? count : count + 1
    if (next > max) keys.push('day.warnMax')
  }
  return keys
}

function reasonsForPending(
  pending: PendingAction,
  person: Person | null,
  date: string,
  assignedIds: Set<string>,
  leaves: LeaveObligation[],
  draftAssignments: Assignment[],
  isPast: boolean,
): MessageKey[] {
  if (pending.kind === 'clear') {
    return isPast ? ['day.warnPast'] : []
  }
  if (!person) return []
  if (pending.kind === 'set') {
    return setWarningKeys(
      person,
      date,
      assignedIds.has(person.id),
      isOnVacation(person, date),
      hasRestObligationOn(person.id, date, leaves),
      getPreference(person, date),
      draftAssignments,
      isPast,
    )
  }
  if (pending.kind === 'no') {
    const keys: MessageKey[] = []
    if (isPast) keys.push('day.warnPast')
    if (assignedIds.has(person.id)) keys.push('day.warnNoOnSet')
    return keys
  }
  return isPast ? ['day.warnPast'] : []
}

export function DaySheet({
  date, people, roster, overrides, assignments, leaves, draftAssignments, fairness,
  onAssign, onUnassign, onProhibit, onAvoid, onSetPreference, onSetOfficialHoliday, onFillDay,
  conflictNotes = [],
}: Props) {
  const { t, localeTag } = useI18n()
  const [pending, setPending] = useState<PendingAction | null>(null)
  useEffect(() => { setPending(null) }, [date])
  const holiday = isHoliday(date, roster, overrides)
  const holidayLabel = overrides.find(o => o.date === date)?.label
  const dayType = classifyDay(date, roster, overrides)
  const typeCopy = dayTypeKeys(dayType)
  const isPast = date < localToday()

  const dayAssignments = assignments.filter(a => a.date === date)
  const assignedIds = new Set(dayAssignments.map(ownerId).filter(Boolean))

  const restOblsOnDate = leaves.filter(l =>
    l.immediateRestDate === date || l.compensatoryLeaveDate === date
  )

  const preferenceOpts: { pref: PreferenceType | null; label: string }[] = [
    { pref: null, label: t('pref.neutral') },
    { pref: 'AVOID', label: t('pref.no') },
  ]

  const pendingPersonId = pending && 'personId' in pending ? pending.personId : null
  const pendingPerson = pendingPersonId
    ? people.find(p => p.id === pendingPersonId) ?? null
    : null

  const pendingReasons = pending
    ? reasonsForPending(
        pending,
        pendingPerson,
        date,
        assignedIds,
        leaves,
        draftAssignments,
        isPast,
      )
    : []

  function requestOrRun(action: PendingAction, run: () => void, needsConfirm: boolean) {
    if (needsConfirm) setPending(action)
    else run()
  }

  function confirmPending() {
    if (!pending) return
    switch (pending.kind) {
      case 'set':
        onAssign(date, pending.personId)
        break
      case 'no':
        if (onSetPreference) onSetPreference(date, pending.personId, 'AVOID')
        else onAvoid(date, pending.personId, true)
        break
      case 'clear':
        onUnassign(date, pending.personId)
        break
      case 'vacation':
        onProhibit(date, pending.personId, pending.on)
        break
      case 'preference':
        onSetPreference?.(date, pending.personId, pending.pref)
        break
      case 'holiday':
        onSetOfficialHoliday?.(date, pending.want)
        break
    }
    setPending(null)
  }

  const confirmTitle: MessageKey =
    pending?.kind === 'set' && isPast ? 'day.confirmPastSetTitle'
    : pending?.kind === 'set' ? 'day.confirmSetTitle'
    : pending?.kind === 'no' ? 'day.confirmNoTitle'
    : pending?.kind === 'clear' ? 'day.confirmClearTitle'
    : 'day.confirmEditTitle'

  const confirmActionLabel: MessageKey =
    pending?.kind === 'set' ? 'day.setAnyway'
    : pending?.kind === 'no' ? 'day.noAnyway'
    : pending?.kind === 'clear' ? 'day.clearAnyway'
    : 'day.editAnyway'

  return (
    <div className="day-sheet">
      <div className="day-sheet-header">
        <div className="day-date-row">
          <div className="day-date">{formatDateLong(date, localeTag)}</div>
          {onFillDay && (
            <button
              type="button"
              className="btn btn-secondary day-fill"
              title={t('month.fillDayTitle')}
              aria-label={t('month.fillDayTitle')}
              onClick={() => onFillDay(date)}
            >
              <IconWand size={16} /> {t('month.fillDay')}
            </button>
          )}
        </div>
        {conflictNotes.length > 0 && (
          <div className="day-conflict-notes" role="status">
            {conflictNotes.map(note => (
              <div key={note.key} className="day-conflict-note">
                <IconWarn size={16} />
                <span>{note.text}</span>
              </div>
            ))}
          </div>
        )}
        <div className="day-meta">
          <span className={`badge-${holiday ? 'holiday' : 'normal'}`}>
            {t(typeCopy.code)}
          </span>
          {holidayLabel && (
            <span className="day-holiday-name">{holidayLabel}</span>
          )}
        </div>
        <p className="day-type-title">{t(typeCopy.title)}</p>
        <p className="day-type-help">{t(typeCopy.help)}</p>
        {onSetOfficialHoliday && (
          <label className="day-holiday-mark" title={t('day.officialHolidayHint')}>
            <input
              type="checkbox"
              checked={holiday}
              onChange={e => {
                const want = e.target.checked
                requestOrRun(
                  { kind: 'holiday', want },
                  () => onSetOfficialHoliday(date, want),
                  isPast,
                )
              }}
            />
            <span>{t('day.officialHoliday')}</span>
          </label>
        )}
      </div>

      {isPast && (
        <div className="past-day-warning" role="status">
          <span className="past-day-warning-icon"><IconWarn size={16} /></span>
          <div>
            <strong>{t('day.pastWarningTitle')}</strong>
            <p>{t('day.pastWarningBody')}</p>
          </div>
        </div>
      )}

      {dayAssignments.map(assignment => {
        const assignedPersonId = ownerId(assignment)
        return (
          <div key={assignedPersonId || assignment.date} className="current-assignment">
            <div className="current-label">{t('day.assigned')}</div>
            <div className="current-person">
              {people.find(p => p.id === assignedPersonId)?.name ?? t('common.unknown')}
              {assignment.source === 'manual' && <span className="lock-badge" style={{ background: 'var(--amber, #f59e0b)' }}>{t('day.manual')}</span>}
              {assignment.locked && assignment.source !== 'manual' && <span className="lock-badge">{t('day.locked')}</span>}
            </div>
            {assignment.explanation && (
              <div className="text-xs text-ink-3" style={{ marginTop: 4 }}>
                {formatDayType(dayType)} {t('day.balance')}: {assignment.explanation.winnerBalance.toFixed(2)} · {t('day.overall')}: {assignment.explanation.winnerOverallBalance.toFixed(2)}
                {assignment.explanation.preferenceUsed && ` · ${t('day.preference')}: ${assignment.explanation.preferenceUsed}`}
              </div>
            )}
            <div className="current-actions">
              <button
                className="btn btn-ghost text-sm text-red"
                onClick={() => requestOrRun(
                  { kind: 'clear', personId: assignedPersonId },
                  () => onUnassign(date, assignedPersonId),
                  isPast,
                )}
              >
                {t('day.clear')}
              </button>
            </div>
          </div>
        )
      })}

      <div className="candidate-section">
        <div className="section-title">{t('day.peopleThisDay')}</div>
        <p className="help-text">
          {t('day.help')}
        </p>
        {people.length === 0 && (
          <div className="empty-state text-sm text-ink-3">{t('day.addPeopleFirst')}</div>
        )}
        {people.map(person => {
          const assigned = assignedIds.has(person.id)
          const vacation = isOnVacation(person, date)
          const pref = getPreference(person, date)
          const member = isMemberOn(person, date) || date < roster.historyStartDate
          const onRest = hasRestObligationOn(person.id, date, leaves)
          const off = vacation || onRest

          const proj = fairness?.projections['365d'].find(p => p.personId === person.id)
          const bucketBal = proj ? getBucketBalance(proj, dayType) : null
          const overallBal = proj ? getOverallBalance(proj) : null

          const notes = [
            !member ? t('day.beforeJoin') : null,
            vacation ? t('day.vacationOut') : null,
            pref === 'AVOID' ? t('day.noKeepsShare') : null,
            onRest ? t('day.restAdvisory') : null,
          ].filter(Boolean)

          return (
            <div key={person.id} className={`person-day-row ${assigned ? 'assigned' : ''} ${!member ? 'not-member' : ''}`}>
              <div className="person-day-info">
                <span className="candidate-name">
                  {off && member && <span className="warn-icon" title={notes.join(' · ')}><IconWarn /></span>}
                  {person.name}
                </span>
                {notes.length > 0 && (
                  <span className="candidate-reason">{notes.join(' · ')}</span>
                )}
                {proj && (
                  <span className="text-xs text-ink-3">
                    {formatDayType(dayType)}: {bucketBal !== null ? (bucketBal > 0 ? '+' : '') + bucketBal.toFixed(2) : '—'}
                    {' '}{t('day.overall')}: {overallBal !== null ? (overallBal > 0 ? '+' : '') + overallBal.toFixed(2) : '—'}
                  </span>
                )}
              </div>
              <div className="person-day-actions">
                <button
                  className={`btn text-sm ${assigned ? 'btn-primary' : 'btn-secondary'}`}
                  aria-pressed={assigned}
                  disabled={!member && !assigned}
                  title={!member && !assigned ? t('day.cannotAssign') : assigned ? t('day.set') : vacation ? t('day.setDespiteVacation') : onRest ? t('day.setDespiteRest') : undefined}
                  onClick={() => {
                    if (assigned) {
                      requestOrRun(
                        { kind: 'clear', personId: person.id },
                        () => onUnassign(date, person.id),
                        isPast,
                      )
                      return
                    }
                    const reasons = setWarningKeys(
                      person, date, assigned, vacation, onRest, pref, draftAssignments, isPast,
                    )
                    requestOrRun(
                      { kind: 'set', personId: person.id },
                      () => onAssign(date, person.id),
                      reasons.length > 0,
                    )
                  }}
                >
                  {t('day.set')}
                </button>
                {onSetPreference ? (
                  <select
                    className="select text-sm"
                    style={{ fontSize: 'var(--text-sm)', padding: '2px 6px' }}
                    value={pref ?? ''}
                    onChange={e => {
                      const val = e.target.value as PreferenceType | ''
                      const next = val === '' ? null : val
                      if (next === 'AVOID') {
                        requestOrRun(
                          { kind: 'no', personId: person.id },
                          () => onSetPreference(date, person.id, 'AVOID'),
                          isPast || assigned,
                        )
                        return
                      }
                      requestOrRun(
                        { kind: 'preference', personId: person.id, pref: next },
                        () => onSetPreference(date, person.id, next),
                        isPast,
                      )
                    }}
                  >
                    {preferenceOpts.map(o => (
                      <option key={o.pref ?? 'neutral'} value={o.pref ?? ''}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <button
                      className={`btn text-sm ${pref === 'AVOID' ? 'btn-secondary' : 'btn-ghost'}`}
                      title={t('day.noTitle')}
                      onClick={() => {
                        const turningOn = pref !== 'AVOID'
                        if (!turningOn) {
                          onAvoid(date, person.id, false)
                          return
                        }
                        requestOrRun(
                          { kind: 'no', personId: person.id },
                          () => onAvoid(date, person.id, true),
                          isPast || assigned,
                        )
                      }}
                    >
                      {t('pref.no')}
                    </button>
                  </>
                )}
                <button
                  className={`btn text-sm ${vacation ? 'btn-danger' : 'btn-ghost'}`}
                  onClick={() => {
                    const on = !vacation
                    requestOrRun(
                      { kind: 'vacation', personId: person.id, on },
                      () => onProhibit(date, person.id, on),
                      isPast,
                    )
                  }}
                >
                  {vacation ? t('day.onVacation') : t('day.vacation')}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {restOblsOnDate.length > 0 && (
        <div className="rest-section">
          <div className="section-title">{t('day.restOnDate')}</div>
          {restOblsOnDate.map(l => {
            const p = people.find(x => x.id === l.personId)
            return (
              <div key={l.id} className="rest-item">
                <span>{p?.name ?? l.personId}</span>
                <span className="text-xs text-ink-3">
                  {l.compensatoryLeaveDate === date ? t('day.compensatory') : t('day.restDay')}{' '}
                  {t('day.fromShift', { date: l.shiftDate })}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {pending && createPortal(
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={() => setPending(null)}
        >
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-body"
            onClick={e => e.stopPropagation()}
          >
            <div className="confirm-dialog-icon"><IconWarn size={22} /></div>
            <h3 id="confirm-dialog-title" className="confirm-dialog-title">
              {t(confirmTitle)}
            </h3>
            <p id="confirm-dialog-body" className="confirm-dialog-lead">
              {pendingPerson
                ? t('day.confirmLead', { name: pendingPerson.name, date: formatDateLong(date, localeTag) })
                : t('day.confirmLeadDate', { date: formatDateLong(date, localeTag) })}
            </p>
            {pendingReasons.length > 0 && (
              <ul className="confirm-dialog-reasons">
                {pendingReasons.map(key => (
                  <li key={key}>{t(key, { name: pendingPerson?.name ?? '' })}</li>
                ))}
              </ul>
            )}
            <div className="confirm-dialog-actions">
              <button className="btn btn-ghost" onClick={() => setPending(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-danger" onClick={confirmPending}>
                {t(confirmActionLabel)}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
