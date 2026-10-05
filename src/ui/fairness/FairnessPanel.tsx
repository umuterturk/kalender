import { useState } from 'react'
import type { FairnessReport } from '../../domain/fairness'
import type { Person } from '../../domain/types'
import { useI18n } from '../../i18n'
import { FAIRNESS_WINDOWS, overallBalance, formatBalance, balanceTone, type FairnessWindowKey } from './fairnessDisplay'
import { FairnessTable } from './FairnessTable'
import './FairnessPanel.css'

interface Props {
  fairness: FairnessReport
  people: Person[]
  selectedPersonId?: string | null
  onSelectPerson: (personId: string) => void
}

export function FairnessPanel({ fairness, people, selectedPersonId = null, onSelectPerson }: Props) {
  const { t } = useI18n()
  const [window, setWindow] = useState<FairnessWindowKey>('365d')

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
          {FAIRNESS_WINDOWS.map(w => (
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
        const overall = overallBalance(pf)
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
              <span className={`dev-badge ${balanceTone(overall)}`}>
                {formatBalance(overall)} {t('fairness.overall')}
              </span>
            </div>
            <FairnessTable projection={pf} />
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
