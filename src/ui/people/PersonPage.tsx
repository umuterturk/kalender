import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore'
import { isMemberOn } from '../../domain/eligibility'
import { addDays, localToday } from '../../domain/calendar'
import type { MonthlyConditions } from '../../domain/types'
import { useI18n } from '../../i18n'
import { useFairness } from '../fairness/useFairness'
import { FairnessTable } from '../fairness/FairnessTable'
import { FAIRNESS_WINDOWS, type FairnessWindowKey } from '../fairness/fairnessDisplay'
import { MonthYearPicker } from './MonthYearPicker'
import './PersonPage.css'

export function PersonPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { people, dispatch } = useStore()
  const { t } = useI18n()

  const person = people.find(p => p.id === id)
  const today = new Date().toISOString().slice(0, 10)
  const thisMonth = today.slice(0, 7)

  const [editMonth, setEditMonth] = useState(thisMonth)
  const [leaving, setLeaving] = useState(false)
  const [leaveDate, setLeaveDate] = useState(today)
  const [name, setName] = useState(person?.name ?? '')
  const [fairnessWindow, setFairnessWindow] = useState<FairnessWindowKey>('365d')
  const fairness = useFairness(localToday().slice(0, 7))

  useEffect(() => {
    setName(person?.name ?? '')
  }, [person?.id, person?.name])

  if (!person) return <div className="person-page"><p>{t('people.notFound')}</p></div>

  const fairnessProjection = fairness?.projections[fairnessWindow].find(p => p.personId === person.id)

  function saveName() {
    const trimmed = name.trim()
    if (!trimmed) {
      setName(person!.name)
      return
    }
    if (trimmed === person!.name) return
    dispatch({ type: 'UPDATE_PERSON', payload: { ...person!, name: trimmed } })
    setName(trimmed)
  }

  function saveCapacity(val: string) {
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) return
    dispatch({ type: 'UPDATE_PERSON', payload: { ...person!, capacity: n } })
  }

  const active = isMemberOn(person, today)
  const cond: MonthlyConditions = person.monthlyConditions[editMonth] ?? {
    unavailableRanges: [], preferredDates: [], avoidedDates: [], requiredMin: 0, max: null
  }

  function saveCond(updated: MonthlyConditions) {
    dispatch({ type: 'SET_MONTHLY_CONDITIONS', payload: { personId: person!.id, month: editMonth, conditions: updated } })
  }

  function updateJoinDate(index: number, activeFrom: string) {
    if (!activeFrom) return
    const membership = person!.memberships[index]
    if (!membership) return
    if (membership.inactiveFrom && activeFrom >= membership.inactiveFrom) return
    const memberships = person!.memberships.map((m, i) =>
      i === index ? { ...m, activeFrom } : m
    )
    dispatch({ type: 'UPDATE_PERSON', payload: { ...person!, memberships } })
  }

  function handleLeave() {
    if (!leaveDate) return
    const updated = {
      ...person!,
      memberships: person!.memberships.map((m, i) =>
        i === person!.memberships.length - 1 && m.inactiveFrom === null
          ? { ...m, inactiveFrom: leaveDate }
          : m
      )
    }
    dispatch({ type: 'UPDATE_PERSON', payload: updated })
    setLeaving(false)
  }

  function addUnavailableRange() {
    const from = today, to = today
    saveCond({ ...cond, unavailableRanges: [...cond.unavailableRanges, { from, to }] })
  }

  function updateUnavailableRange(i: number, field: 'from' | 'to', value: string) {
    const ranges = [...cond.unavailableRanges]
    ranges[i] = { ...ranges[i], [field]: value }
    saveCond({ ...cond, unavailableRanges: ranges })
  }

  function removeUnavailableRange(i: number) {
    saveCond({ ...cond, unavailableRanges: cond.unavailableRanges.filter((_, j) => j !== i) })
  }

  return (
    <div className="person-page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost" onClick={() => navigate('/people')}>{t('people.backPeople')}</button>
          <div className="field name-field">
            <label htmlFor="person-name">{t('common.name')}</label>
            <input
              id="person-name"
              className="input name-input"
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
          </div>
        </div>
        <span className={`pill ${active ? 'pill-published' : 'pill-draft'}`}>
          {active ? t('common.active') : t('common.inactive')}
        </span>
      </div>

      <div className="person-sections">
        <section className="card person-section">
          <h2 className="section-title">{t('people.membership')}</h2>
          {person.memberships.map((m, i) => (
            <div key={i} className="membership-edit">
              <div className="field">
                <label htmlFor={`join-${i}`}>
                  {person.memberships.length > 1 ? t('people.joinDateN', { n: i + 1 }) : t('people.joinDate')}
                </label>
                <input
                  id={`join-${i}`}
                  className="input"
                  type="date"
                  value={m.activeFrom}
                  max={m.inactiveFrom ? addDays(m.inactiveFrom, -1) : undefined}
                  onChange={e => updateJoinDate(i, e.target.value)}
                />
              </div>
              <div className="field">
                <label>{t('people.through')}</label>
                <span className="membership-through">{m.inactiveFrom ?? t('common.present')}</span>
              </div>
            </div>
          ))}
          {active && !leaving && (
            <button className="btn btn-danger" onClick={() => setLeaving(true)}>
              {t('people.recordDeparture')}
            </button>
          )}
          {leaving && (
            <div className="leave-form">
              <div className="field">
                <label>{t('people.departureDate')}</label>
                <input className="input" type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} />
              </div>
              <div className="btn-row">
                <button className="btn btn-secondary" onClick={() => setLeaving(false)}>{t('common.cancel')}</button>
                <button className="btn btn-danger" onClick={handleLeave}>{t('people.confirmDeparture')}</button>
              </div>
            </div>
          )}
        </section>

        {fairness && fairnessProjection && (
            <section className="card person-section">
              <h2 className="section-title">{t('people.fairness')}</h2>
              {!fairness.historyComplete && (
                <p className="help-text text-sm text-ink-3">{t('fairness.historyShort')}</p>
              )}
              <div className="fairness-window-tabs">
                {FAIRNESS_WINDOWS.map(w => (
                  <button
                    key={w.key}
                    type="button"
                    className={`side-tab ${fairnessWindow === w.key ? 'active' : ''}`}
                    onClick={() => setFairnessWindow(w.key)}
                  >
                    {t(w.label)}
                  </button>
                ))}
              </div>
              <p className="help-text text-sm text-ink-3">{t('fairness.legend')}</p>
              <FairnessTable projection={fairnessProjection} />
              {(fairnessProjection.holidayBlocksTouched > 0 || fairnessProjection.holidayShifts > 0) && (
                <p className="help-text text-sm text-ink-3">
                  {t('fairness.holidayBlocks', {
                    blocks: fairnessProjection.holidayBlocksTouched,
                    shifts: fairnessProjection.holidayShifts,
                  })}
                </p>
              )}
            </section>
        )}

        <section className="card person-section">
          <h2 className="section-title">{t('people.fairnessCapacity')}</h2>
          <p className="help-text text-sm text-ink-3">
            {t('people.capacityHelp')}
          </p>
          <div className="field">
            <label htmlFor="capacity">{t('people.capacity')}</label>
            <input
              id="capacity"
              className="input"
              type="number"
              min="0.1"
              max="2"
              step="0.1"
              value={person.capacity ?? 1}
              onChange={e => saveCapacity(e.target.value)}
            />
          </div>
        </section>

        <section className="card person-section">
          <h2 className="section-title">{t('people.monthlyConditions')}</h2>
          <div className="field">
            <label htmlFor="edit-month">{t('common.month')}</label>
            <p className="help-text">{t('people.monthHelp')}</p>
            <MonthYearPicker id="edit-month" value={editMonth} onChange={setEditMonth} />
          </div>

          <div className="field">
            <label>{t('people.vacation')}</label>
            {cond.unavailableRanges.map((r, i) => (
              <div key={i} className="range-row">
                <input className="input" type="date" value={r.from} onChange={e => updateUnavailableRange(i, 'from', e.target.value)} />
                <span>–</span>
                <input className="input" type="date" value={r.to} onChange={e => updateUnavailableRange(i, 'to', e.target.value)} />
                <button className="btn btn-ghost text-red" onClick={() => removeUnavailableRange(i)} aria-label={t('common.remove')}>{t('common.remove')}</button>
              </div>
            ))}
            <button className="btn btn-secondary" onClick={addUnavailableRange}>{t('people.addRange')}</button>
          </div>

          <div className="fields-row">
            <div className="field">
              <label htmlFor="required-min">{t('people.requiredMin')}</label>
              <p className="help-text">{t('people.requiredMinHelp')}</p>
              <input
                id="required-min"
                className="input"
                type="number" min="0"
                value={cond.requiredMin}
                onChange={e => saveCond({ ...cond, requiredMin: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="field">
              <label htmlFor="max-shifts">{t('people.maxShifts')}</label>
              <p className="help-text">{t('people.maxShiftsHelp')}</p>
              <input
                id="max-shifts"
                className="input"
                type="number" min="0"
                value={cond.max ?? ''}
                onChange={e => saveCond({ ...cond, max: e.target.value ? parseInt(e.target.value) : null })}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
