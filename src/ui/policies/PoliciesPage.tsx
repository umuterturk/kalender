import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { nanoid } from '../../lib/nanoid'
import type { RestPolicy } from '../../domain/types'
import { StaffingPoliciesSection } from './StaffingPoliciesSection'
import { useI18n, type MessageKey } from '../../i18n'
import './PoliciesPage.css'

function treatmentKey(p: RestPolicy): MessageKey {
  if (!p.enabled || p.nonworkingTreatment === 'none') return 'policies.restNone'
  if (p.nonworkingTreatment === 'calendar-only') return 'policies.calendarOnly'
  return 'policies.nextWorking'
}

export function PoliciesPage() {
  const { roster, dispatch } = useStore()
  const { t } = useI18n()
  const [showAddRest, setShowAddRest] = useState(false)

  const [newRestFrom, setNewRestFrom] = useState(new Date().toISOString().slice(0, 10))
  const [newRestTreatment, setNewRestTreatment] = useState<'none' | 'calendar-only' | 'next-working'>('calendar-only')

  if (!roster) return <div className="policies-page"><p>{t('policies.setupFirst')}</p></div>

  function addRestPolicy() {
    const p: RestPolicy = {
      id: nanoid(),
      effectiveFrom: newRestFrom,
      enabled: newRestTreatment !== 'none',
      nonworkingTreatment: newRestTreatment,
    }
    dispatch({ type: 'ADD_REST_POLICY', payload: p })
    setShowAddRest(false)
  }

  const sortedRest = [...(roster.restPolicies ?? [])].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))

  return (
    <div className="policies-page">
      <div className="page-header">
        <h1 className="page-title">{t('policies.title')}</h1>
      </div>

      <div className="policies-sections">
        <StaffingPoliciesSection />
        <section className="card policies-section">
          <div className="section-header">
            <h2 className="section-title">{t('policies.restPolicies')}</h2>
            <button className="btn btn-secondary" onClick={() => setShowAddRest(v => !v)}>{t('policies.newPolicy')}</button>
          </div>
          <div className="policy-list">
            <div className="policy-list-head">
              <span>{t('policies.effectiveFrom')}</span>
              <span>{t('policies.treatment')}</span>
            </div>
            {sortedRest.map(p => (
              <div key={p.id} className="policy-item">
                <div className="policy-item-date">
                  <span className="policy-item-label">{t('policies.effectiveFrom')}</span>
                  <span className="mono">{p.effectiveFrom}</span>
                </div>
                <div className="policy-item-treatment">
                  <span className="policy-item-label">{t('policies.treatment')}</span>
                  <span>{t(treatmentKey(p))}</span>
                </div>
              </div>
            ))}
          </div>
          {showAddRest && (
            <div className="add-policy-form">
              <div className="fields-row">
                <div className="field">
                  <label>{t('policies.effectiveFrom')}</label>
                  <input className="input" type="date" value={newRestFrom} onChange={e => setNewRestFrom(e.target.value)} />
                </div>
                <div className="field">
                  <label>{t('policies.treatment')}</label>
                  <select
                    className="select"
                    value={newRestTreatment}
                    onChange={e => setNewRestTreatment(e.target.value as 'none' | 'calendar-only' | 'next-working')}
                  >
                    <option value="none">{t('policies.restNone')}</option>
                    <option value="calendar-only">{t('policies.calendarOnly')}</option>
                    <option value="next-working">{t('policies.nextWorking')}</option>
                  </select>
                </div>
              </div>
              <div className="btn-row">
                <button className="btn btn-secondary" onClick={() => setShowAddRest(false)}>{t('common.cancel')}</button>
                <button className="btn btn-primary" onClick={addRestPolicy}>{t('policies.add')}</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
