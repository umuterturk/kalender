import type { FairnessProjection } from '../../domain/types'
import { useI18n } from '../../i18n'
import { FAIRNESS_BUCKETS, balanceTone, formatBalance, overallBalance } from './fairnessDisplay'
import './FairnessPanel.css'
import './FairnessSummary.css'

interface Props {
  projection: FairnessProjection
  compact?: boolean
}

export function FairnessSummary({ projection, compact = false }: Props) {
  const { t } = useI18n()
  const overall = overallBalance(projection)
  return (
    <div className={`fairness-summary ${compact ? 'compact' : ''}`} aria-label={t('people.fairness')}>
      <span className={`dev-badge ${balanceTone(overall)}`}>
        {formatBalance(overall)} {t('fairness.overall')}
      </span>
      <div className="fairness-summary-buckets">
        {FAIRNESS_BUCKETS.map(({ key, label }) => {
          const bal = projection[key].balance
          return (
            <span key={key} className="fairness-summary-bucket">
              <span className="fairness-summary-label">{label}</span>
              <span className={`mono remainder ${bal < -0.01 ? 'under' : bal > 0.01 ? 'over' : ''}`}>
                {formatBalance(bal)}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
