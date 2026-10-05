import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../../store/useStore'
import { isMemberOn } from '../../domain/eligibility'
import { localToday } from '../../domain/calendar'
import { nanoid } from '../../lib/nanoid'
import type { Person } from '../../domain/types'
import { useI18n } from '../../i18n'
import './PeoplePage.css'

export function PeoplePage() {
  const { people, dispatch } = useStore()
  const { t, localeTag } = useI18n()
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [joinDate, setJoinDate] = useState(localToday())
  const [error, setError] = useState<string | null>(null)
  const today = localToday()

  const sorted = useMemo(
    () => [...people].sort((a, b) => a.name.localeCompare(b.name, localeTag)),
    [people, localeTag],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(localeTag)
    if (!q) return sorted
    return sorted.filter(person => person.name.toLocaleLowerCase(localeTag).includes(q))
  }, [sorted, query, localeTag])

  function addPerson() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('common.required'))
      return
    }
    const person: Person = {
      id: nanoid(),
      name: trimmed,
      memberships: [{ activeFrom: joinDate || today, inactiveFrom: null }],
      workCalendarOverrides: [],
      monthlyConditions: {},
    }
    dispatch({ type: 'ADD_PERSON', payload: person })
    setName('')
    setError(null)
  }

  return (
    <div className="people-page">
      <div className="page-header">
        <h1 className="page-title">{t('people.title')}</h1>
      </div>

      <form
        className="people-add"
        onSubmit={e => {
          e.preventDefault()
          addPerson()
        }}
      >
        <div className="field">
          <label htmlFor="people-add-name">{t('common.name')}</label>
          <input
            id="people-add-name"
            className="input"
            value={name}
            onChange={e => { setName(e.target.value); setError(null) }}
            placeholder={t('people.namePlaceholder')}
            autoComplete="off"
          />
          {error && <span className="error-text">{error}</span>}
        </div>
        <div className="field">
          <label htmlFor="people-add-join">{t('people.joinDate')}</label>
          <input
            id="people-add-join"
            className="input"
            type="date"
            value={joinDate}
            onChange={e => setJoinDate(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary people-add-btn">{t('people.add')}</button>
      </form>

      {people.length === 0 ? (
        <div className="empty-state">{t('people.emptyHint')}</div>
      ) : (
        <>
          <div className="people-toolbar">
            <input
              className="input people-search"
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('people.searchPlaceholder')}
              aria-label={t('people.searchPlaceholder')}
            />
            <span className="people-count text-sm text-ink-3">
              {t('people.showing', { count: filtered.length, total: people.length })}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              {t('people.noMatch', { query })}
            </div>
          ) : (
            <ul className="people-list">
              {filtered.map(person => {
                const active = isMemberOn(person, today)
                const latestMembership = person.memberships[person.memberships.length - 1]
                return (
                  <li key={person.id}>
                    <Link to={`/people/${person.id}`} className="person-row">
                      <div className="person-row-main">
                        <span className="person-name">{person.name}</span>
                        <div className="person-row-meta text-sm text-ink-3">
                          <span>{t('people.joined', { date: latestMembership?.activeFrom ?? '?' })}</span>
                          {latestMembership?.inactiveFrom && (
                            <span>{t('people.left', { date: latestMembership.inactiveFrom })}</span>
                          )}
                          {Object.keys(person.monthlyConditions).length > 0 && (
                            <span>
                              {t('people.monthsWithConditions', {
                                count: Object.keys(person.monthlyConditions).length,
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`pill ${active ? 'pill-published' : 'pill-draft'}`}>
                        {active ? t('common.active') : t('common.inactive')}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
