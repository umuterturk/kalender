import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore'
import { nanoid } from '../../lib/nanoid'
import type { Roster, Person } from '../../domain/types'
import { localToday } from '../../domain/calendar'
import { useI18n } from '../../i18n'
import './SetupPage.css'

const DEFAULT_WORKING = [1, 2, 3, 4, 5] // Mon-Fri

export function SetupPage() {
  const { roster, people, dispatch } = useStore()
  const navigate = useNavigate()
  const { t, locale, setLocale } = useI18n()

  const weekdays = [
    t('weekdays.sun'),
    t('weekdays.mon'),
    t('weekdays.tue'),
    t('weekdays.wed'),
    t('weekdays.thu'),
    t('weekdays.fri'),
    t('weekdays.sat'),
  ]

  const [step, setStep] = useState<'roster' | 'policy' | 'people'>('roster')
  const defaultRosterName = t('setup.defaultRosterName')
  const [rosterName, setRosterName] = useState(roster?.name ?? defaultRosterName)
  const prevDefaultRosterName = useRef(defaultRosterName)
  const [weekendDefault, setWeekendDefault] = useState(roster?.weekendHolidayDefault ?? true)
  const [workingWeekdays, setWorkingWeekdays] = useState<number[]>(roster?.defaultWorkingWeekdays ?? DEFAULT_WORKING)
  const [historyStart, setHistoryStart] = useState(roster?.historyStartDate ?? new Date().toISOString().slice(0, 7) + '-01')

  const [restTreatment, setRestTreatment] = useState<'none' | 'calendar-only' | 'next-working'>(() => {
    const current = roster?.restPolicies?.[0]
    if (!current) return 'calendar-only'
    if (!current.enabled || current.nonworkingTreatment === 'none') return 'none'
    return current.nonworkingTreatment
  })

  const [newPersonName, setNewPersonName] = useState('')
  const [newPersonJoined, setNewPersonJoined] = useState(new Date().toISOString().slice(0, 10))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!roster && rosterName === prevDefaultRosterName.current) {
      setRosterName(defaultRosterName)
    }
    prevDefaultRosterName.current = defaultRosterName
  }, [defaultRosterName, roster, rosterName])

  function toggleWeekday(d: number) {
    setWorkingWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  function saveRoster() {
    if (!rosterName.trim()) { setErrors({ rosterName: t('common.required') }); return }
    const restId = nanoid()
    const r: Roster = {
      id: roster?.id ?? nanoid(),
      name: rosterName.trim(),
      country: 'TR',
      defaultWorkingWeekdays: workingWeekdays,
      historyStartDate: historyStart,
      weekendHolidayDefault: weekendDefault,
      restPolicies: [{
        id: restId,
        effectiveFrom: historyStart,
        enabled: restTreatment !== 'none',
        nonworkingTreatment: restTreatment,
      }],
    }
    dispatch({ type: 'SETUP_ROSTER', payload: r })
    setStep('people')
  }

  function addPerson() {
    if (!newPersonName.trim()) { setErrors({ personName: t('common.required') }); return }
    const p: Person = {
      id: nanoid(),
      name: newPersonName.trim(),
      memberships: [{ activeFrom: newPersonJoined, inactiveFrom: null }],
      workCalendarOverrides: [],
      monthlyConditions: {},
    }
    dispatch({ type: 'ADD_PERSON', payload: p })
    setNewPersonName('')
  }

  function finish() {
    navigate(`/month/${localToday().slice(0, 7)}`)
  }

  return (
    <div className="setup-page">
      <div className="setup-card card">
        <div className="setup-header">
          <div className="setup-header-top">
            {!roster && <div className="setup-brand">{t('setup.brand')}</div>}
            <div className="lang-switcher compact" role="group" aria-label={t('nav.language')}>
              <button type="button" className={`lang-btn ${locale === 'tr' ? 'active' : ''}`} onClick={() => setLocale('tr')}>TR</button>
              <button type="button" className={`lang-btn ${locale === 'en' ? 'active' : ''}`} onClick={() => setLocale('en')}>EN</button>
            </div>
          </div>
          <h1 className="setup-title">
            {roster ? t('setup.titleEdit') : t('setup.titleNew')}
          </h1>
          {!roster && (
            <p className="setup-subtitle text-ink-2">
              {t('setup.subtitle')}
            </p>
          )}
        </div>

        <div className="setup-steps">
          <Step active={step === 'roster'} done={step !== 'roster'} n={1} label={t('setup.stepRoster')} />
          <Step active={step === 'policy'} done={step === 'people'} n={2} label={t('setup.stepPolicy')} />
          <Step active={step === 'people'} done={false} n={3} label={t('setup.stepPeople')} />
        </div>

        {step === 'roster' && (
          <div className="setup-form">
            <div className="field">
              <label>{t('setup.country')}</label>
              <select className="select" value="TR" onChange={() => { /* only Turkey */ }}>
                <option value="TR">{t('setup.countryTR')}</option>
              </select>
              <span className="help-text">{t('setup.countryHelp')}</span>
            </div>
            <div className="field">
              <label>{t('setup.rosterName')}</label>
              <input className="input" value={rosterName} onChange={e => setRosterName(e.target.value)} />
              {errors.rosterName && <span className="error-text">{errors.rosterName}</span>}
            </div>
            <div className="field">
              <label>{t('setup.historyStart')}</label>
              <input className="input" type="date" value={historyStart} onChange={e => setHistoryStart(e.target.value)} />
              <span className="help-text">{t('setup.historyHelp')}</span>
            </div>
            <div className="field">
              <label>{t('setup.workingDays')}</label>
              <div className="weekday-picker">
                {weekdays.map((name, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`weekday-btn ${workingWeekdays.includes(i) ? 'active' : ''}`}
                    onClick={() => toggleWeekday(i)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <span className="help-text">{t('setup.workingHelp')}</span>
            </div>
            <div className="field">
              <label>
                <input type="checkbox" checked={weekendDefault} onChange={e => setWeekendDefault(e.target.checked)} />
                {' '}{t('setup.weekendDefault')}
              </label>
            </div>
            <button className="btn btn-primary" onClick={() => setStep('policy')}>{t('setup.nextPolicy')}</button>
          </div>
        )}

        {step === 'policy' && (
          <div className="setup-form">
            <div className="field">
              <label>{t('setup.restPolicy')} <span className="text-red">*</span></label>
              <p className="help-text" style={{ marginBottom: 'var(--space-2)' }}>
                {t('setup.restRequired')}
              </p>
              <label className="radio-label">
                <input
                  type="radio"
                  name="rest"
                  value="none"
                  checked={restTreatment === 'none'}
                  onChange={() => setRestTreatment('none')}
                />
                <strong>{t('setup.restNone')}</strong> {t('setup.restNoneDesc')}
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="rest"
                  value="calendar-only"
                  checked={restTreatment === 'calendar-only'}
                  onChange={() => setRestTreatment('calendar-only')}
                />
                <strong>{t('setup.calendarOnly')}</strong> {t('setup.calendarOnlyDesc')}
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="rest"
                  value="next-working"
                  checked={restTreatment === 'next-working'}
                  onChange={() => setRestTreatment('next-working')}
                />
                <strong>{t('setup.nextWorking')}</strong> {t('setup.nextWorkingDesc')}
              </label>
            </div>
            <div className="btn-row">
              <button className="btn btn-secondary" onClick={() => setStep('roster')}>{t('setup.back')}</button>
              <button className="btn btn-primary" onClick={saveRoster}>{t('setup.savePeople')}</button>
            </div>
          </div>
        )}

        {step === 'people' && (
          <div className="setup-form">
            <p className="help-text" style={{ marginBottom: 'var(--space-4)' }}>
              {t('setup.peopleHelp')}
            </p>
            {people.length > 0 && (
              <ul className="people-list">
                {people.map(p => (
                  <li key={p.id} className="person-list-item">
                    <span>{p.name}</span>
                    <span className="text-xs text-ink-3">
                      {t('setup.joined', { date: p.memberships[0]?.activeFrom ?? '?' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="fields-row">
              <div className="field">
                <label>{t('common.name')}</label>
                <input
                  className="input"
                  value={newPersonName}
                  onChange={e => setNewPersonName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addPerson()}
                  placeholder={t('setup.displayName')}
                />
                {errors.personName && <span className="error-text">{errors.personName}</span>}
              </div>
              <div className="field">
                <label>{t('setup.joinDate')}</label>
                <input className="input" type="date" value={newPersonJoined} onChange={e => setNewPersonJoined(e.target.value)} />
              </div>
              <button className="btn btn-secondary add-btn" onClick={addPerson}>{t('setup.addPerson')}</button>
            </div>
            <div className="btn-row">
              <button className="btn btn-secondary" onClick={() => setStep('policy')}>{t('setup.back')}</button>
              <button
                className="btn btn-primary"
                onClick={finish}
                disabled={people.length === 0}
              >
                {t('setup.goSchedule')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`setup-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
      <span className="step-num">{done ? '✓' : n}</span>
      <span>{label}</span>
    </div>
  )
}
