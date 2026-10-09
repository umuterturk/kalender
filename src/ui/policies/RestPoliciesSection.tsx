import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { nanoid } from '../../lib/nanoid'
import type { RestPolicy } from '../../domain/types'
import { useI18n, type MessageKey } from '../../i18n'
import './PoliciesPage.css'

type RestTreatment = RestPolicy['nonworkingTreatment']

function treatmentKey(p: RestPolicy): MessageKey {
  if (!p.enabled || p.nonworkingTreatment === 'none') return 'policies.restNone'
  if (p.nonworkingTreatment === 'calendar-only') return 'policies.calendarOnly'
  return 'policies.nextWorking'
}

export function RestPoliciesSection() {
  const { roster, dispatch } = useStore()
  const { t } = useI18n()
  const [showAddRest, setShowAddRest] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newRestFrom, setNewRestFrom] = useState(new Date().toISOString().slice(0, 10))
  const [newRestTreatment, setNewRestTreatment] = useState<RestTreatment>('calendar-only')

  if (!roster) return null

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

  function beginEdit(policy: RestPolicy) {
    setShowAddRest(false)
    setEditingId(policy.id)
    setNewRestFrom(policy.effectiveFrom)
    setNewRestTreatment(!policy.enabled ? 'none' : policy.nonworkingTreatment)
  }

  function saveEdit() {
    if (!editingId) return
    dispatch({
      type: 'UPDATE_REST_POLICY',
      payload: {
        id: editingId,
        effectiveFrom: newRestFrom,
        enabled: newRestTreatment !== 'none',
        nonworkingTreatment: newRestTreatment,
      },
    })
    setEditingId(null)
  }

  function openAdd() {
    setEditingId(null)
    setNewRestFrom(new Date().toISOString().slice(0, 10))
    setNewRestTreatment('calendar-only')
    setShowAddRest(v => !v)
  }

  const sortedRest = [...(roster.restPolicies ?? [])].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))

  return (
    <section className="card policies-section">
      <div className="section-header">
        <h2 className="section-title">{t('policies.restPolicies')}</h2>
        <button className="btn btn-secondary" onClick={openAdd}>{t('policies.newPolicy')}</button>
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
            <div className="policy-item-actions">
              <button className="btn btn-secondary" onClick={() => beginEdit(p)}>{t('policies.edit')}</button>
            </div>
          </div>
        ))}
      </div>
      {(showAddRest || editingId) && (
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
                onChange={e => setNewRestTreatment(e.target.value as RestTreatment)}
              >
                <option value="none">{t('policies.restNone')}</option>
                <option value="calendar-only">{t('policies.calendarOnly')}</option>
                <option value="next-working">{t('policies.nextWorking')}</option>
              </select>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => { setShowAddRest(false); setEditingId(null) }}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={editingId ? saveEdit : addRestPolicy}>
              {editingId ? t('common.save') : t('policies.add')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
