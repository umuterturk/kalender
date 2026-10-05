import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore'
import { nanoid } from '../../lib/nanoid'
import type { Roster } from '../../domain/types'
import { localToday } from '../../domain/calendar'
import { useI18n } from '../../i18n'
import { RestPoliciesSection } from '../policies/RestPoliciesSection'
import '../setup/SetupPage.css'
import '../policies/PoliciesPage.css'
import './SettingsPage.css'

const DEFAULT_WORKING = [1, 2, 3, 4, 5]

export function SettingsPage() {
  const { roster, dispatch } = useStore()
  const navigate = useNavigate()
  const { t, locale, setLocale } = useI18n()
  const firstTime = !roster

  const weekdays = [
    t('weekdays.sun'),
    t('weekdays.mon'),
    t('weekdays.tue'),
    t('weekdays.wed'),
    t('weekdays.thu'),
    t('weekdays.fri'),
    t('weekdays.sat'),
  ]

  const defaultRosterName = t('setup.defaultRosterName')
  const [rosterName, setRosterName] = useState(roster?.name ?? defaultRosterName)
  const prevDefaultRosterName = useRef(defaultRosterName)
  const [weekendDefault, setWeekendDefault] = useState(roster?.weekendHolidayDefault ?? true)
  const [workingWeekdays, setWorkingWeekdays] = useState<number[]>(roster?.defaultWorkingWeekdays ?? DEFAULT_WORKING)
  const [historyStart, setHistoryStart] = useState(roster?.historyStartDate ?? localToday())
  const [restTreatment, setRestTreatment] = useState<'none' | 'calendar-only' | 'next-working'>(() => {
    const current = roster?.restPolicies?.[0]
    if (!current) return 'calendar-only'
    if (!current.enabled || current.nonworkingTreatment === 'none') return 'none'
    return current.nonworkingTreatment
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!roster && rosterName === prevDefaultRosterName.current) {
      setRosterName(defaultRosterName)
    }
    prevDefaultRosterName.current = defaultRosterName
  }, [defaultRosterName, roster, rosterName])

  function toggleWeekday(d: number) {
    setWorkingWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  function save() {
    if (!rosterName.trim()) {
      setErrors({ rosterName: t('common.required') })
      return
    }
    setErrors({})
    const restId = roster?.restPolicies[0]?.id ?? nanoid()
    const restPolicies = roster
      ? roster.restPolicies
      : [{
          id: restId,
          effectiveFrom: historyStart,
          enabled: restTreatment !== 'none',
          nonworkingTreatment: restTreatment,
        }]
    const next: Roster = {
      id: roster?.id ?? nanoid(),
      name: rosterName.trim(),
      country: 'TR',
      defaultWorkingWeekdays: workingWeekdays,
      historyStartDate: historyStart,
      weekendHolidayDefault: weekendDefault,
      restPolicies,
    }
    dispatch({ type: 'SETUP_ROSTER', payload: next })
    if (firstTime) {
      navigate(`/month/${localToday().slice(0, 7)}`)
      return
    }
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className={`settings-page ${firstTime ? 'first-time' : ''}`}>
      <div className={firstTime ? 'setup-card card' : 'settings-stack'}>
        <div className="setup-header">
          {firstTime && (
            <div className="setup-header-top">
              <div className="setup-brand">{t('setup.brand')}</div>
              <div className="lang-switcher compact" role="group" aria-label={t('nav.language')}>
                <button type="button" className={`lang-btn ${locale === 'tr' ? 'active' : ''}`} onClick={() => setLocale('tr')}>TR</button>
                <button type="button" className={`lang-btn ${locale === 'en' ? 'active' : ''}`} onClick={() => setLocale('en')}>EN</button>
              </div>
            </div>
          )}
          <h1 className={firstTime ? 'setup-title' : 'page-title'}>
            {firstTime ? t('setup.titleNew') : t('nav.settings')}
          </h1>
          {firstTime && (
            <p className="setup-subtitle text-ink-2">{t('setup.subtitle')}</p>
          )}
        </div>

        <section className={firstTime ? 'setup-form' : 'card settings-section'}>
          {!firstTime && <h2 className="section-title">{t('setup.stepRoster')}</h2>}
          <div className="setup-form">
            <div className="field">
              <label htmlFor="settings-country">{t('setup.country')}</label>
              <select id="settings-country" className="select" value="TR" onChange={() => { /* only Turkey */ }}>
                <option value="TR">{t('setup.countryTR')}</option>
              </select>
              <span className="help-text">{t('setup.countryHelp')}</span>
            </div>
            <div className="field">
              <label htmlFor="settings-roster-name">{t('setup.rosterName')}</label>
              <input id="settings-roster-name" className="input" value={rosterName} onChange={e => setRosterName(e.target.value)} />
              {errors.rosterName && <span className="error-text">{errors.rosterName}</span>}
            </div>
            <div className="field">
              <label htmlFor="settings-history">{t('setup.historyStart')}</label>
              <input id="settings-history" className="input" type="date" value={historyStart} onChange={e => setHistoryStart(e.target.value)} />
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

            {firstTime && (
              <div className="field">
                <label>{t('setup.restPolicy')} <span className="text-red">*</span></label>
                <p className="help-text">{t('setup.restRequired')}</p>
                <label className="radio-label">
                  <input type="radio" name="rest" value="none" checked={restTreatment === 'none'} onChange={() => setRestTreatment('none')} />
                  <span><strong>{t('setup.restNone')}</strong> {t('setup.restNoneDesc')}</span>
                </label>
                <label className="radio-label">
                  <input type="radio" name="rest" value="calendar-only" checked={restTreatment === 'calendar-only'} onChange={() => setRestTreatment('calendar-only')} />
                  <span><strong>{t('setup.calendarOnly')}</strong> {t('setup.calendarOnlyDesc')}</span>
                </label>
                <label className="radio-label">
                  <input type="radio" name="rest" value="next-working" checked={restTreatment === 'next-working'} onChange={() => setRestTreatment('next-working')} />
                  <span><strong>{t('setup.nextWorking')}</strong> {t('setup.nextWorkingDesc')}</span>
                </label>
              </div>
            )}

            <div className="btn-row settings-save-row">
              <button className="btn btn-primary" onClick={save}>
                {firstTime ? t('setup.start') : t('common.save')}
              </button>
              {saved && <span className="help-text">{t('settings.saved')}</span>}
            </div>
          </div>
        </section>

        {!firstTime && (
          <div className="settings-rules">
            <h2 className="section-title settings-rules-title">{t('policies.title')}</h2>
            <RestPoliciesSection />
          </div>
        )}
      </div>
    </div>
  )
}
