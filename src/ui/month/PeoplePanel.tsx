import type { Person, Assignment, FairnessProjection } from '../../domain/types'
import { addDays } from '../../domain/calendar'
import { isOnVacation, getPreference } from '../../domain/eligibility'
import { useI18n } from '../../i18n'
import { FairnessSummary } from '../fairness/FairnessSummary'
import './PeoplePanel.css'

interface Props {
  people: Person[]
  dates: string[]
  assignments: Assignment[]
  selectedDate: string | null
  selectedPersonId?: string | null
  onSelectDate: (date: string) => void
  onSelectPerson?: (personId: string) => void
  fairnessByPerson?: Map<string, FairnessProjection>
}

export function PeoplePanel({
  people, dates, assignments, selectedDate, selectedPersonId = null, onSelectDate, onSelectPerson,
  fairnessByPerson,
}: Props) {
  const { t } = useI18n()

  return (
    <div className="people-panel">
      {people.length === 0 && (
        <p className="text-sm text-ink-3">{t('peoplePanel.empty')}</p>
      )}
      {people.map(person => {
        const worked = dates.filter(d => assignments.some(a =>
          a.date === d && (a.allocatedTo ?? a.personId) === person.id
        ))
        const vacation = dates.filter(d => isOnVacation(person, d))
        const avoiding = dates.filter(d => getPreference(person, d) === 'AVOID')
        const selected = selectedPersonId === person.id
        return (
          <section key={person.id} className={`people-panel-card ${selected ? 'selected' : ''}`}>
            <button
              type="button"
              className="people-panel-name"
              onClick={() => onSelectPerson?.(person.id)}
              title={t('peoplePanel.highlightTitle')}
            >
              {person.name}
            </button>
            {fairnessByPerson?.get(person.id) && (
              <FairnessSummary projection={fairnessByPerson.get(person.id)!} compact />
            )}
            <DayGroup label={t('peoplePanel.days')} dates={worked} tone="assigned" selectedDate={selectedDate} onSelectDate={onSelectDate} noneLabel={t('peoplePanel.none')} />
            <DayGroup label={t('peoplePanel.no')} dates={avoiding} tone="avoid" selectedDate={selectedDate} onSelectDate={onSelectDate} noneLabel={t('peoplePanel.none')} />
            <DayGroup label={t('peoplePanel.vacation')} dates={vacation} tone="vacation" selectedDate={selectedDate} onSelectDate={onSelectDate} noneLabel={t('peoplePanel.none')} />
          </section>
        )
      })}
    </div>
  )
}

function DayGroup({
  label, dates, tone, selectedDate, onSelectDate, noneLabel,
}: {
  label: string
  dates: string[]
  tone: 'assigned' | 'avoid' | 'vacation' | 'wanted'
  selectedDate: string | null
  onSelectDate: (date: string) => void
  noneLabel: string
}) {
  const chips = compressDates(dates)
  return (
    <div className="people-day-group">
      <span className="people-day-label">{label}</span>
      {chips.length === 0 ? (
        <span className="people-day-empty">{noneLabel}</span>
      ) : (
        <div className="people-day-chips">
          {chips.map(chip => (
            <button
              key={chip.start}
              type="button"
              className={`people-day-chip ${tone} ${selectedDate && selectedDate >= chip.start && selectedDate <= chip.end ? 'selected' : ''}`}
              onClick={() => onSelectDate(chip.start)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function compressDates(dates: string[]): { start: string; end: string; label: string }[] {
  const sorted = [...dates].sort()
  const groups: { start: string; end: string; label: string }[] = []
  for (const date of sorted) {
    const last = groups[groups.length - 1]
    if (last && addDays(last.end, 1) === date) {
      last.end = date
      last.label = `${dayNum(last.start)}–${dayNum(last.end)}`
    } else {
      groups.push({ start: date, end: date, label: String(dayNum(date)) })
    }
  }
  return groups
}

function dayNum(date: string): number {
  return parseInt(date.slice(8), 10)
}
