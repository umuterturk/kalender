import { useState } from 'react'
import type { Person, ScheduleWarning } from '../../domain/types'
import { addDays, formatDateShort } from '../../domain/calendar'
import { useI18n, type MessageKey } from '../../i18n'
import { IconChevronRight, IconWarn, IconClose } from '../icons'
import './IssuesBar.css'

type HardIssue = { key: string; date: string | null; text: string }

type Props = {
  hardErrors: HardIssue[]
  warnings: ScheduleWarning[]
  people: Person[]
  onOpenDate: (date: string) => void
  /** When true, details stay open — used in the side panel. */
  expanded?: boolean
}

const TYPE_KEYS: Record<string, { label: MessageKey; hint: MessageKey }> = {
  NO_COVERAGE: { label: 'issues.unassigned', hint: 'issues.unassignedHint' },
  UNAVAILABLE: { label: 'issues.vacation', hint: 'issues.vacationHint' },
  NEXT_DAY_OFF: { label: 'issues.restDay', hint: 'issues.restDayHint' },
  CONSECUTIVE_SHIFT: { label: 'issues.consecutive', hint: 'issues.consecutiveHint' },
  AVOID_PREFERENCE: { label: 'issues.no', hint: 'issues.noHint' },
  QUALIFICATION: { label: 'issues.qualification', hint: 'issues.qualificationHint' },
  MAX_SHIFT_COUNT: { label: 'issues.overMax', hint: 'issues.overMaxHint' },
  HAVE_MISSED: { label: 'issues.missedHave', hint: 'issues.missedHaveHint' },
  HOLIDAY_BLOCK_IMBALANCE: { label: 'issues.holidayBalance', hint: 'issues.holidayBalanceHint' },
}

const TYPE_ORDER = [
  'NO_COVERAGE',
  'UNAVAILABLE',
  'NEXT_DAY_OFF',
  'CONSECUTIVE_SHIFT',
  'QUALIFICATION',
  'MAX_SHIFT_COUNT',
  'AVOID_PREFERENCE',
  'HAVE_MISSED',
  'HOLIDAY_BLOCK_IMBALANCE',
]

export function IssuesBar({ hardErrors, warnings, people, onOpenDate, expanded = false }: Props) {
  const { t, tp, localeTag } = useI18n()
  const groups = groupWarnings(warnings, t)
  const totalNotes = warnings.length
  const [hardOpen, setHardOpen] = useState(expanded)
  const [open, setOpen] = useState(expanded)
  const [dismissed, setDismissed] = useState(false)

  if (hardErrors.length === 0 && totalNotes === 0) return null
  if (dismissed && hardErrors.length === 0) return null

  const summaryBits = groups.slice(0, 3).map(g => `${g.meta.label} ${g.items.length}`)
  const showHard = expanded || hardOpen
  const showNotes = expanded || open

  return (
    <div className="issues-bar">
      {hardErrors.length > 0 && (
        <section className={`issues-block blocking ${showHard ? 'open' : ''}`}>
          <button
            type="button"
            className="issues-head as-button"
            onClick={() => !expanded && setHardOpen(v => !v)}
            aria-expanded={showHard}
          >
            <span className="issues-icon"><IconWarn size={16} /></span>
            <div className="issues-title-wrap">
              <strong className="issues-title">
                {tp('issues.blockingOne', 'issues.blockingOther', hardErrors.length)}
              </strong>
              <span className="issues-sub">
                {showHard ? t('issues.mustFix') : hardErrors.slice(0, 2).map(e => e.text).join(' · ')}
              </span>
            </div>
            {!expanded && (
              <span className={`issues-chevron ${showHard ? 'open' : ''}`}>
                <IconChevronRight size={16} />
              </span>
            )}
          </button>
          {showHard && (
            <ul className="issues-hard-list">
              {hardErrors.map(err => (
                <li key={err.key}>
                  <button
                    type="button"
                    className="issue-chip hard"
                    onClick={() => err.date && onOpenDate(err.date)}
                    disabled={!err.date}
                  >
                    {err.date && <span className="issue-chip-date">{formatDateShort(err.date, localeTag)}</span>}
                    <span className="issue-chip-text">{shorten(err.text)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {totalNotes > 0 && !dismissed && (
        <section className={`issues-block notes ${showNotes ? 'open' : ''}`}>
          <button
            type="button"
            className="issues-head as-button"
            onClick={() => !expanded && setOpen(v => !v)}
            aria-expanded={showNotes}
          >
            <span className="issues-icon soft"><IconWarn size={16} /></span>
            <div className="issues-title-wrap">
              <strong className="issues-title">
                {tp('issues.noteOne', 'issues.noteOther', totalNotes)}
              </strong>
              <span className="issues-sub">
                {showNotes
                  ? t('issues.advisoryOpen')
                  : summaryBits.join(' · ')}
              </span>
            </div>
            {!expanded && (
              <span className={`issues-chevron ${showNotes ? 'open' : ''}`}>
                <IconChevronRight size={16} />
              </span>
            )}
          </button>

          {showNotes && (
            <div className="issues-body">
              {groups.map(group => (
                <div key={group.type} className={`issue-group ${group.type === 'NO_COVERAGE' ? 'coverage' : ''}`}>
                  <div className="issue-group-head">
                    <span className="issue-group-label">{group.meta.label}</span>
                    <span className="issue-group-count">{group.items.length}</span>
                    <span className="issue-group-hint">{group.meta.hint}</span>
                  </div>
                  <div className="issue-chips">
                    {group.type === 'NO_COVERAGE'
                      ? compressDates(group.items.map(w => w.date)).map(range => (
                          <button
                            key={range.start}
                            type="button"
                            className="issue-chip"
                            onClick={() => onOpenDate(range.start)}
                            title={`${range.start}${range.end !== range.start ? ` – ${range.end}` : ''}`}
                          >
                            <span className="issue-chip-date">{formatRange(range.start, range.end, localeTag)}</span>
                          </button>
                        ))
                      : group.items.slice(0, 10).map((w, i) => {
                          const person = w.personId ? people.find(p => p.id === w.personId) : null
                          return (
                            <button
                              key={`${w.type}-${w.date}-${w.personId ?? i}`}
                              type="button"
                              className="issue-chip"
                              onClick={() => onOpenDate(w.date)}
                              title={w.message}
                            >
                              <span className="issue-chip-date">{formatDateShort(w.date, localeTag)}</span>
                              {person && <span className="issue-chip-who">{person.name}</span>}
                            </button>
                          )
                        })}
                    {group.type !== 'NO_COVERAGE' && group.items.length > 10 && (
                      <span className="issue-more">{t('common.more', { count: group.items.length - 10 })}</span>
                    )}
                  </div>
                </div>
              ))}
              <div className="issues-footer">
                <button type="button" className="btn btn-ghost issues-dismiss" onClick={() => setDismissed(true)}>
                  <IconClose size={14} /> {t('issues.dismiss')}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function groupWarnings(warnings: ScheduleWarning[], t: (key: MessageKey) => string) {
  const map = new Map<string, ScheduleWarning[]>()
  for (const w of warnings) {
    const list = map.get(w.type) ?? []
    list.push(w)
    map.set(w.type, list)
  }
  return TYPE_ORDER
    .filter(type => map.has(type))
    .map(type => {
      const keys = TYPE_KEYS[type]
      return {
        type,
        meta: keys
          ? { label: t(keys.label), hint: t(keys.hint) }
          : { label: type, hint: '' },
        items: [...(map.get(type) ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
      }
    })
}

function shorten(text: string): string {
  return text.length > 72 ? `${text.slice(0, 69)}…` : text
}

function compressDates(dates: string[]): { start: string; end: string }[] {
  const sorted = [...dates].sort()
  const groups: { start: string; end: string }[] = []
  for (const date of sorted) {
    const last = groups[groups.length - 1]
    if (last && addDays(last.end, 1) === date) last.end = date
    else groups.push({ start: date, end: date })
  }
  return groups
}

function formatRange(start: string, end: string, locale: string): string {
  if (start === end) return formatDateShort(start, locale)
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  if (sameMonth) {
    const month = new Date(end + 'T12:00:00').toLocaleDateString(locale, { month: 'short' })
    return `${parseInt(start.slice(8), 10)}–${parseInt(end.slice(8), 10)} ${month}`
  }
  return `${formatDateShort(start, locale)} – ${formatDateShort(end, locale)}`
}
