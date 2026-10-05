import type { FairnessProjection, BucketFairness } from '../../domain/types'
import { useI18n } from '../../i18n'
import { FAIRNESS_BUCKETS } from './fairnessDisplay'
import './FairnessPanel.css'

export function FairnessTable({ projection }: { projection: FairnessProjection }) {
  const { t } = useI18n()
  return (
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
        {FAIRNESS_BUCKETS.map(({ key, label }) => (
          <BucketRow key={key} label={label} data={projection[key]} />
        ))}
      </tbody>
    </table>
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
