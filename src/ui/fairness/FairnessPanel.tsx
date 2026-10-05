import { useState } from 'react'
import type { FairnessReport } from '../../domain/fairness'
import type { Person, BucketFairness } from '../../domain/types'
import { useI18n, type MessageKey } from '../../i18n'
import './FairnessPanel.css'

interface Props {
  fairness: FairnessReport
  people: Person[]
  selectedPersonId?: string | null
  onSelectPerson: (personId: string) => void
}

type WindowKey = '30d' | '90d' | '365d' | 'lifetime'
type DomainBucket = 'NN' | 'NH' | 'HN' | 'HH'

const WINDOW_KEYS: { key: WindowKey; label: MessageKey }[] = [
  { key: '365d', label: 'fairness.w365' },
  { key: '90d', label: 'fairness.w90' },
  { key: '30d', label: 'fairness.w30' },
  { key: 'lifetime', label: 'fairness.lifetime' },
]

/** Domain keys stay NH/HN/HH; labels show N/T. */
const BUCKETS: { key: DomainBucket; label: string }[] = [
  { key: 'NN', label: 'NN' },
  { key: 'NH', label: 'NT' },
  { key: 'HN', label: 'TN' },
  { key: 'HH', label: 'TT' },
]

export function FairnessPanel({ fairness, people, selectedPersonId = null, onSelectPerson }: Props) {
  const { t } = useI18n()
  const [window, setWindow] = useState<WindowKey>('365d')

  const projections = [...fairness.projections[window]].sort((a, b) => {
    const nameA = people.find(p => p.id === a.personId)?.name ?? a.personId
    const nameB = people.find(p => p.id === b.personId)?.name ?? b.personId
    return nameA.localeCompare(nameB)
  })

  return (
    <div className="fairness-panel">
      <div className="fairness-header">
        <div className="fairness-window-label">{t('fairness.title')}</div>
        <div className="fairness-window-range text-xs text-ink-3">
          {fairness.planBoundary}
        </div>
        {!fairness.historyComplete && (
          <div className="fairness-incomplete-note text-xs">
            {t('fairness.historyShort')}
          </div>
        )}
        <div className="fairness-window-tabs">
          {WINDOW_KEYS.map(w => (
            <button
              key={w.key}
              className={`side-tab ${window === w.key ? 'active' : ''}`}
              onClick={() => setWindow(w.key)}
            >
              {t(w.label)}
            </button>
          ))}
        </div>
        <div className="fairness-legend text-xs text-ink-3">
          {t('fairness.legend')}
        </div>
      </div>

      {projections.map(pf => {
        const person = people.find(p => p.id === pf.personId)
        if (!person) return null
        const overallBalance = pf.NN.balance + pf.NH.balance + pf.HN.balance + pf.HH.balance
        return (
          <div
            key={pf.personId}
            className={`person-fairness-card ${selectedPersonId === pf.personId ? 'selected' : ''}`}
            onClick={() => onSelectPerson(pf.personId)}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelectPerson(pf.personId)
              }
            }}
          >
            <div className="pf-header">
              <div className="pf-name">{person.name}</div>
              {person.capacity !== undefined && person.capacity !== 1 && (
                <span className="text-xs text-ink-3">{t('fairness.capacity', { value: person.capacity })}</span>
              )}
              <span className={`dev-badge ${overallBalance < -0.1 ? 'under' : overallBalance > 0.1 ? 'over' : 'balanced'}`}>
                {overallBalance > 0 ? '+' : ''}{overallBalance.toFixed(2)} {t('fairness.overall')}
              </span>
            </div>
            <table className="fairness-table">
              <thead>
                <tr>
                  <th>{t('fairness.bucket')}</th>
                  <th>{t('fairness.actual')}</th>
                  <th>{t('fairness.expected')}</th>
                  <th>{t('fairness.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {BUCKETS.map(({ key, label }) => (
                  <BucketRow key={key} label={label} data={pf[key]} />
                ))}
              </tbody>
            </table>
            {(pf.holidayBlocksTouched > 0 || pf.holidayShifts > 0) && (
              <div className="pf-blocks text-xs text-ink-3">
                {t('fairness.holidayBlocks', { blocks: pf.holidayBlocksTouched, shifts: pf.holidayShifts })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function BucketRow({ label, data }: { label: string; data: BucketFairness }) {
  const bal = data.balance
  return (
    <tr>
      <td className="measure-label">{label}</td>
      <td className="mono">{data.actual.toFixed(2)}</td>
      <td className="mono">{data.expected.toFixed(2)}</td>
      <td className={`mono remainder ${bal < -0.01 ? 'under' : bal > 0.01 ? 'over' : ''}`}>
        {bal > 0 ? '+' : ''}{bal.toFixed(2)}
      </td>
    </tr>
  )
}
