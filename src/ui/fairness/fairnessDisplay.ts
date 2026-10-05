import type { FairnessProjection } from '../../domain/types'
import type { MessageKey } from '../../i18n'

export type FairnessWindowKey = '30d' | '90d' | '365d' | 'lifetime'
export type DomainBucket = 'NN' | 'NH' | 'HN' | 'HH'

export const FAIRNESS_WINDOWS: { key: FairnessWindowKey; label: MessageKey }[] = [
  { key: '365d', label: 'fairness.w365' },
  { key: '90d', label: 'fairness.w90' },
  { key: '30d', label: 'fairness.w30' },
  { key: 'lifetime', label: 'fairness.lifetime' },
]

/** Domain keys stay NH/HN/HH; labels show N/T. */
export const FAIRNESS_BUCKETS: { key: DomainBucket; label: string }[] = [
  { key: 'NN', label: 'NN' },
  { key: 'NH', label: 'NT' },
  { key: 'HN', label: 'TN' },
  { key: 'HH', label: 'TT' },
]

export function overallBalance(pf: FairnessProjection): number {
  return pf.NN.balance + pf.NH.balance + pf.HN.balance + pf.HH.balance
}

export function formatBalance(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`
}

export function balanceTone(value: number): 'under' | 'over' | 'balanced' {
  if (value < -0.1) return 'under'
  if (value > 0.1) return 'over'
  return 'balanced'
}
