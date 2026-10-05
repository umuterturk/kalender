import { useEffect, useId, useRef, useState } from 'react'
import { formatMonth } from '../../domain/calendar'
import { useI18n } from '../../i18n'
import { IconCalendar, IconChevronLeft, IconChevronRight } from '../icons'
import './MonthYearPicker.css'

interface Props {
  value: string
  onChange: (yyyymm: string) => void
  id?: string
}

export function MonthYearPicker({ value, onChange, id }: Props) {
  const { t, localeTag } = useI18n()
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => Number(value.slice(0, 4)))
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()
  const [selectedYear, selectedMonth] = value.split('-').map(Number)
  const monthNames = monthLabels(localeTag)

  useEffect(() => {
    if (open) setViewYear(selectedYear)
  }, [open, selectedYear])

  useEffect(() => {
    if (!open) return
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function pick(month: number) {
    onChange(fmt(viewYear, month))
    setOpen(false)
  }

  return (
    <div className="month-year-field" ref={rootRef}>
      <input
        id={id}
        className="input"
        type="text"
        readOnly
        value={formatMonth(value, localeTag)}
        aria-readonly="true"
      />
      <button
        type="button"
        className="month-year-icon"
        aria-label={t('people.openMonthPicker')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen(v => !v)}
      >
        <IconCalendar size={18} />
      </button>
      {open && (
        <div className="month-year-popover" id={popoverId} role="dialog" aria-label={t('common.month')}>
          <div className="month-year-nav">
            <button
              type="button"
              className="btn btn-ghost month-year-nav-btn"
              onClick={() => setViewYear(y => y - 1)}
              aria-label={t('people.prevYear')}
            >
              <IconChevronLeft size={18} />
            </button>
            <span className="month-year-year">{viewYear}</span>
            <button
              type="button"
              className="btn btn-ghost month-year-nav-btn"
              onClick={() => setViewYear(y => y + 1)}
              aria-label={t('people.nextYear')}
            >
              <IconChevronRight size={18} />
            </button>
          </div>
          <div className="month-year-grid" role="listbox" aria-label={t('common.month')}>
            {monthNames.map((label, i) => {
              const m = i + 1
              const selected = viewYear === selectedYear && m === selectedMonth
              return (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`month-year-cell ${selected ? 'selected' : ''}`}
                  onClick={() => pick(m)}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function fmt(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function monthLabels(localeTag: string): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    new Date(2026, i, 1).toLocaleDateString(localeTag, { month: 'short' }),
  )
}
