import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { nanoid } from '../../lib/nanoid'
import type { StaffingPolicy } from '../../domain/types'
import { useI18n } from '../../i18n'
import './PoliciesPage.css'

export function StaffingPoliciesSection() {
  const { roster, dispatch } = useStore()
  const { t } = useI18n()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10))
  const [headcount, setHeadcount] = useState(2)

  if (!roster) return null

  function addStaffingPolicy() {
    const count = Math.max(1, Math.floor(headcount) || 1)
    const policy: StaffingPolicy = {
      id: nanoid(),
      effectiveFrom,
      requiredHeadcount: count,
    }
    dispatch({ type: 'ADD_STAFFING_POLICY', payload: policy })
    setShowAdd(false)
  }

  function beginEdit(policy: StaffingPolicy) {
    setShowAdd(false)
    setEditingId(policy.id)
    setEffectiveFrom(policy.effectiveFrom)
    setHeadcount(policy.requiredHeadcount)
  }

  function saveEdit() {
    if (!editingId) return
    const count = Math.max(1, Math.floor(headcount) || 1)
    dispatch({
      type: 'UPDATE_STAFFING_POLICY',
      payload: { id: editingId, effectiveFrom, requiredHeadcount: count },
    })
    setEditingId(null)
  }

  function openAdd() {
    setEditingId(null)
    setEffectiveFrom(new Date().toISOString().slice(0, 10))
    setHeadcount(2)
    setShowAdd(v => !v)
  }

  const sorted = [...(roster.staffingPolicies ?? [])].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))

  return (
    <section className="card policies-section">
      <div className="section-header">
        <h2 className="section-title">{t('policies.staffingPolicies')}</h2>
        <button className="btn btn-secondary" onClick={openAdd}>{t('policies.newPolicy')}</button>
      </div>
      <p className="help-text">{t('policies.headcountHelp')}</p>
      <div className="policy-list">
        <div className="policy-list-head">
          <span>{t('policies.effectiveFrom')}</span>
          <span>{t('policies.headcount')}</span>
        </div>
        {sorted.length === 0 && (
          <div className="policy-item">
            <div className="policy-item-treatment">
              <span className="policy-item-label">{t('policies.headcount')}</span>
              <span>1</span>
            </div>
          </div>
        )}
        {sorted.map(p => (
          <div key={p.id} className="policy-item">
            <div className="policy-item-date">
              <span className="policy-item-label">{t('policies.effectiveFrom')}</span>
              <span className="mono">{p.effectiveFrom}</span>
            </div>
            <div className="policy-item-treatment">
              <span className="policy-item-label">{t('policies.headcount')}</span>
              <span>{p.requiredHeadcount}</span>
            </div>
            <div className="policy-item-actions">
              <button className="btn btn-secondary" onClick={() => beginEdit(p)}>{t('policies.edit')}</button>
            </div>
          </div>
        ))}
      </div>
      {(showAdd || editingId) && (
        <div className="add-policy-form">
          <div className="fields-row">
            <div className="field">
              <label>{t('policies.effectiveFrom')}</label>
              <input className="input" type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="field">
              <label>{t('policies.headcount')}</label>
              <input
                className="input"
                type="number"
                min={1}
                step={1}
                value={headcount}
                onChange={e => setHeadcount(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setEditingId(null) }}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={editingId ? saveEdit : addStaffingPolicy}>
              {editingId ? t('common.save') : t('policies.add')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
