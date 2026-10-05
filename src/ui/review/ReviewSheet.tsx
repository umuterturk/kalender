import type { PlanRevision, Person, Roster, CalendarDateOverride, LeaveObligation } from '../../domain/types'
import type { FairnessReport } from '../../domain/fairness'
import type { ValidationResult } from '../../domain/validate'
import { formatDateShort } from '../../domain/calendar'
import { useI18n } from '../../i18n'
import { formatDayType } from '../../i18n/dayType'
import './ReviewSheet.css'

interface Props {
  draftRevision: PlanRevision
  publishedRevision: PlanRevision | null
  people: Person[]
  roster: Roster
  overrides: CalendarDateOverride[]
  leaves: LeaveObligation[]
  fairness: FairnessReport | null
  validation: ValidationResult | null
  onConfirmPublish: () => void
  onClose: () => void
}

export function ReviewSheet({
  draftRevision, publishedRevision, people,
  fairness, validation, onConfirmPublish, onClose
}: Props) {
  const { t, tp, localeTag } = useI18n()

  const changes: Array<{
    date: string
    prevPersonId: string | null
    newPersonId: string | null
    reason: string
  }> = []

  if (publishedRevision) {
    const pubMap = new Map(publishedRevision.assignments.map(a => [a.date, a]))
    const draftMap = new Map(draftRevision.assignments.map(a => [a.date, a]))

    const allDates = new Set([...pubMap.keys(), ...draftMap.keys()])
    for (const date of Array.from(allDates).sort()) {
      const pub = pubMap.get(date)
      const draft = draftMap.get(date)
      const pubOwner = pub ? (pub.allocatedTo ?? pub.personId) : null
      const draftOwner = draft ? (draft.allocatedTo ?? draft.personId) : null
      if (pubOwner !== draftOwner) {
        changes.push({
          date,
          prevPersonId: pubOwner ?? null,
          newPersonId: draftOwner ?? null,
          reason: !draft ? t('review.removed') : !pub ? t('review.added') : t('review.reassigned'),
        })
      }
    }
  }

  const personName = (id: string | null) =>
    id ? (people.find(p => p.id === id)?.name ?? id) : '—'

  const canPublish = validation?.publishable ?? true
  const hasWarnings = (validation?.warnings.length ?? 0) > 0
  const hardErrors = validation?.hardErrors ?? []

  return (
    <div className="review-overlay">
      <div className="review-sheet card">
        <div className="review-header">
          <h2 className="review-title">{t('review.title')}</h2>
          <button className="btn btn-ghost" onClick={onClose}>{t('review.close')}</button>
        </div>

        <div className="review-meta">
          <span>{t('review.month')}: <strong>{draftRevision.month}</strong></span>
          <span>{t('review.mode')}: <strong>{draftRevision.optimizationMode}</strong></span>
          <span>
            {t('review.status')}:{' '}
            <strong className={draftRevision.outcomeStatus === 'proven-infeasible' ? 'text-red' : ''}>
              {draftRevision.outcomeStatus}
            </strong>
          </span>
        </div>

        {hardErrors.length > 0 && (
          <div className="review-section">
            <div className="section-title" style={{ color: 'var(--red)', marginBottom: 'var(--space-2)' }}>
              {t('review.hardErrors')}
            </div>
            <ul className="conflict-list">
              {hardErrors.map((e, i) => (
                <li key={i} className="conflict-row">
                  <span className="conflict-date">{e.date}</span>
                  <span className="conflict-msg">{e.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasWarnings && (
          <div className="review-section">
            <div className="section-title" style={{ marginBottom: 'var(--space-2)' }}>
              {t('review.warnings')}
            </div>
            <ul className="conflict-list">
              {(validation?.warnings ?? []).map((w, i) => (
                <li key={i} className="conflict-row">
                  <span className="conflict-date">{w.date}</span>
                  <span className="conflict-msg">{w.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {publishedRevision && changes.length > 0 && (
          <div className="review-section">
            <div className="section-title" style={{ marginBottom: 'var(--space-2)' }}>
              {tp('review.changes', 'review.changes_plural', changes.length)}
            </div>
            <table className="changes-table">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('review.was')}</th>
                  <th>{t('review.now')}</th>
                  <th>{t('review.reason')}</th>
                </tr>
              </thead>
              <tbody>
                {changes.map(c => (
                  <tr key={c.date}>
                    <td className="mono">{formatDateShort(c.date, localeTag)}</td>
                    <td>{personName(c.prevPersonId)}</td>
                    <td>{personName(c.newPersonId)}</td>
                    <td className="text-ink-3 text-xs">{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!publishedRevision && (
          <div className="review-section">
            <div className="section-title">{t('review.firstPlan', { month: draftRevision.month })}</div>
            <p className="text-sm text-ink-2">{t('review.assignments', { count: draftRevision.assignments.length })}</p>
          </div>
        )}

        {fairness && (
          <div className="review-section">
            <div className="section-title" style={{ marginBottom: 'var(--space-2)' }}>
              {t('review.fairness365')}
            </div>
            <table className="changes-table">
              <thead>
                <tr>
                  <th>{t('review.person')}</th>
                  <th>{formatDayType('NN')}</th>
                  <th>{formatDayType('NH')}</th>
                  <th>{formatDayType('HN')}</th>
                  <th>{formatDayType('HH')}</th>
                </tr>
              </thead>
              <tbody>
                {fairness.projections['365d'].map(pf => {
                  const person = people.find(p => p.id === pf.personId)
                  const fmt = (b: number) => (b > 0 ? '+' : '') + b.toFixed(2)
                  return (
                    <tr key={pf.personId}>
                      <td>{person?.name}</td>
                      {(['NN', 'NH', 'HN', 'HH'] as const).map(bucket => (
                        <td key={bucket} className={`mono ${pf[bucket].balance < -0.05 ? 'text-red' : ''}`}>
                          {fmt(pf[bucket].balance)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="review-footer">
          <div className="review-footer-note text-xs text-ink-3">
            {canPublish
              ? hasWarnings
                ? tp('review.footerWarn', 'review.footerWarn_plural', validation!.warnings.length)
                : t('review.footerOk')
              : t('review.footerBlocked')}
          </div>
          <div className="review-footer-actions">
            <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
            <button
              className="btn btn-primary"
              onClick={onConfirmPublish}
              disabled={!canPublish}
            >
              {t('review.publishPlan')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
