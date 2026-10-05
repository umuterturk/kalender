import { useParams } from 'react-router-dom'
import { useStore } from '../../store/useStore'
import { monthDates, formatDateLong } from '../../domain/calendar'
import type { ActualShift } from '../../domain/types'
import { nanoid } from '../../lib/nanoid'
import { useI18n, type MessageKey } from '../../i18n'
import { trackEvent } from '../../analytics'
import './ActualsPage.css'

export function ActualsPage() {
  const { yyyymm } = useParams<{ yyyymm: string }>()
  const month = yyyymm ?? new Date().toISOString().slice(0, 7)
  const { people, revisions, actuals, roster, dispatch } = useStore()
  const { t, locale, localeTag } = useI18n()

  const publishedRevision = revisions.find(r => r.month === month && r.status === 'published')
  const today = new Date().toISOString().slice(0, 10)
  const dates = monthDates(month).filter(d => d <= today)

  if (!roster) return <div className="actuals-page"><p>{t('actuals.setupFirst')}</p></div>

  function getActual(date: string): ActualShift | undefined {
    return actuals.find(a => a.date === date)
  }

  function getPlannedPersonId(date: string): string | null {
    const a = publishedRevision?.assignments.find(a => a.date === date)
    return a ? (a.allocatedTo ?? a.personId ?? null) : null
  }

  function handleConfirm(date: string) {
    const plannedId = getPlannedPersonId(date)
    if (!plannedId) return
    const existing = getActual(date)
    const a: ActualShift = {
      id: existing?.id ?? nanoid(),
      date,
      plannedPersonId: plannedId,
      actualPersonId: plannedId,
      status: 'completed',
      recordedAsHoliday: false,
      confirmedAt: new Date().toISOString(),
    }
    dispatch({ type: 'SAVE_ACTUAL', payload: a })
    trackEvent('actual_confirmed', { month, locale })
  }

  function handleSubstitute(date: string, substituteId: string) {
    const plannedId = getPlannedPersonId(date)
    const existing = getActual(date)
    const a: ActualShift = {
      id: existing?.id ?? nanoid(),
      date,
      plannedPersonId: plannedId,
      actualPersonId: substituteId,
      status: 'substituted',
      recordedAsHoliday: false,
      confirmedAt: new Date().toISOString(),
    }
    dispatch({ type: 'SAVE_ACTUAL', payload: a })
  }

  function handleCancel(date: string) {
    const plannedId = getPlannedPersonId(date)
    const existing = getActual(date)
    const a: ActualShift = {
      id: existing?.id ?? nanoid(),
      date,
      plannedPersonId: plannedId,
      actualPersonId: plannedId ?? '',
      status: 'cancelled',
      recordedAsHoliday: false,
      confirmedAt: new Date().toISOString(),
    }
    dispatch({ type: 'SAVE_ACTUAL', payload: a })
  }

  const statusKey = (status: string): MessageKey => {
    if (status === 'completed') return 'actuals.completed'
    if (status === 'substituted') return 'actuals.substituted'
    if (status === 'cancelled') return 'actuals.cancelled'
    return 'actuals.awaiting'
  }

  return (
    <div className="actuals-page">
      <div className="page-header">
        <h1 className="page-title">{t('actuals.title', { month })}</h1>
        <p className="help-text">{t('actuals.help')}</p>
      </div>

      {!publishedRevision && (
        <div className="infeasible-banner">{t('actuals.noPublished', { month })}</div>
      )}

      <div className="actuals-list">
        {dates.map(date => {
          const plannedId = getPlannedPersonId(date)
          const planned = people.find(p => p.id === plannedId)
          const actual = getActual(date)
          const statusLabel = actual ? actual.status : 'awaiting'

          return (
            <div key={date} className={`actual-row card ${statusLabel}`}>
              <div className="actual-date">
                <div className="actual-date-label">{formatDateLong(date, localeTag)}</div>
                <span className={`pill ${
                  statusLabel === 'completed' ? 'pill-published'
                  : statusLabel === 'substituted' ? 'pill-stale'
                  : statusLabel === 'cancelled' ? 'pill-invalid'
                  : 'pill-draft'
                }`}>{t(statusKey(statusLabel))}</span>
              </div>
              <div className="actual-planned">
                <span className="text-xs text-ink-3">{t('actuals.planned')}</span>
                <span className="text-sm">{planned?.name ?? t('actuals.unassigned')}</span>
              </div>
              {actual && actual.actualPersonId !== plannedId && (
                <div className="actual-worked">
                  <span className="text-xs text-ink-3">{t('actuals.workedBy')}</span>
                  <span className="text-sm text-amber">{people.find(p => p.id === actual.actualPersonId)?.name ?? t('common.unknown')}</span>
                </div>
              )}
              {statusLabel === 'awaiting' && plannedId && (
                <div className="actual-actions">
                  <button className="btn btn-secondary text-sm" onClick={() => handleConfirm(date)}>
                    {t('actuals.confirmPlanned')}
                  </button>
                  <select
                    className="select"
                    style={{ fontSize: 'var(--text-sm)', padding: '4px 8px' }}
                    onChange={e => { if (e.target.value) handleSubstitute(date, e.target.value) }}
                    defaultValue=""
                  >
                    <option value="" disabled>{t('actuals.substitute')}</option>
                    {people.filter(p => p.id !== plannedId).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button className="btn btn-ghost text-sm text-red" onClick={() => handleCancel(date)}>
                    {t('actuals.cancel')}
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {dates.length === 0 && (
          <p className="text-ink-3 text-sm">{t('actuals.noPast')}</p>
        )}
      </div>
    </div>
  )
}
