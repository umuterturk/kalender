import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { nanoid } from '../../lib/nanoid'
import type { HolidayPeriod } from '../../domain/types'
import { localToday } from '../../domain/calendar'
import { groupPeriodsByYear } from '../../domain/holidays'
import { useI18n } from '../../i18n'
import './HolidaysSection.css'

export function HolidaysSection() {
  const { roster, holidayPeriods, dispatch } = useStore()
  const { t } = useI18n()
  const [label, setLabel] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState('')

  const groups = useMemo(() => groupPeriodsByYear(holidayPeriods ?? []), [holidayPeriods])
  const [openYears, setOpenYears] = useState<string[]>(() => [localToday().slice(0, 4)])

  if (!roster) return null

  function upsert(period: HolidayPeriod) {
    const nextStart = period.start
    const nextEnd = period.end >= period.start ? period.end : period.start
    dispatch({ type: 'UPSERT_HOLIDAY_PERIOD', payload: { ...period, start: nextStart, end: nextEnd } })
  }

  function addCustom() {
    const name = label.trim()
    if (!name) {
      setError(t('settings.holidayNameRequired'))
      return
    }
    if (!start) {
      setError(t('settings.holidayStartRequired'))
      return
    }
    const last = end || start
    if (last < start) {
      setError(t('settings.holidayRangeInvalid'))
      return
    }
    upsert({ id: nanoid(), label: name, start, end: last })
    setLabel('')
    setStart('')
    setEnd('')
    setError('')
  }

  return (
    <section className="card settings-section holidays-section">
      <h2 className="section-title">{t('settings.holidaysTitle')}</h2>
      <p className="help-text">{t('settings.holidaysHelp')}</p>

      {groups.map(group => (
        <details
          key={group.year}
          className="holiday-year"
          open={openYears.includes(group.year)}
          onToggle={e => {
            const nextOpen = e.currentTarget.open
            setOpenYears(prev => nextOpen
              ? (prev.includes(group.year) ? prev : [...prev, group.year])
              : prev.filter(year => year !== group.year))
          }}
        >
          <summary className="holiday-year-title">
            <span>{group.year}</span>
            <span className="holiday-year-count">{group.items.length}</span>
          </summary>
          <ol className="holiday-list">
            {group.items.map(item => (
              <li key={item.id} className="holiday-item">
                <div className="holiday-item-main">
                  <div className="holiday-item-head">
                    {item.officialKind ? (
                      <span className="holiday-item-name">{item.label}</span>
                    ) : (
                      <input
                        className="input holiday-name-input"
                        value={item.label}
                        aria-label={t('settings.holidayName')}
                        onChange={e => upsert({ ...item, label: e.target.value })}
                      />
                    )}
                    {!item.officialKind && (
                      <button
                        type="button"
                        className="btn btn-ghost holiday-remove"
                        onClick={() => dispatch({ type: 'REMOVE_HOLIDAY_PERIOD', payload: item.id })}
                      >
                        {t('common.remove')}
                      </button>
                    )}
                  </div>
                  <div className="holiday-range">
                    <label className="holiday-range-field">
                      <span>{t('settings.holidayStart')}</span>
                      <input
                        className="input"
                        type="date"
                        value={item.start}
                        onChange={e => upsert({ ...item, start: e.target.value, end: item.end < e.target.value ? e.target.value : item.end })}
                      />
                    </label>
                    <span className="holiday-range-sep" aria-hidden="true">–</span>
                    <label className="holiday-range-field">
                      <span>{t('settings.holidayEnd')}</span>
                      <input
                        className="input"
                        type="date"
                        value={item.end}
                        onChange={e => upsert({ ...item, end: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </details>
      ))}

      <div className="holiday-add">
        <h3 className="holiday-add-title">{t('settings.holidayAddTitle')}</h3>
        <div className="holiday-add-fields">
          <div className="field">
            <label htmlFor="holiday-add-name">{t('settings.holidayName')}</label>
            <input
              id="holiday-add-name"
              className="input"
              value={label}
              onChange={e => { setLabel(e.target.value); setError('') }}
              placeholder={t('settings.holidayNamePlaceholder')}
            />
          </div>
          <div className="holiday-add-range">
            <div className="field">
              <label htmlFor="holiday-add-start">{t('settings.holidayStart')}</label>
              <input
                id="holiday-add-start"
                className="input"
                type="date"
                value={start}
                onChange={e => {
                  setStart(e.target.value)
                  if (!end || end < e.target.value) setEnd(e.target.value)
                  setError('')
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="holiday-add-end">{t('settings.holidayEnd')}</label>
              <input
                id="holiday-add-end"
                className="input"
                type="date"
                value={end}
                onChange={e => { setEnd(e.target.value); setError('') }}
              />
            </div>
          </div>
        </div>
        {error && <span className="error-text">{error}</span>}
        <div className="btn-row">
          <button type="button" className="btn btn-secondary" onClick={addCustom}>
            {t('settings.holidayAdd')}
          </button>
        </div>
      </div>
    </section>
  )
}
