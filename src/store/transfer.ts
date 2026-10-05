import type { KalenderState } from '../domain/types'
import { migrateState } from './db'

export function serializeState(state: KalenderState): string {
  return JSON.stringify(state, null, 2)
}

export function exportFilename(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `kalender-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`
}

export function downloadState(state: KalenderState): void {
  const text = serializeState(state)
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = exportFilename()
  a.click()
  URL.revokeObjectURL(url)
}

export function hasExistingData(state: KalenderState): boolean {
  return !!(
    state.roster
    || state.people.length
    || state.revisions.length
    || state.actuals.length
    || state.leaves.length
  )
}

export function parseImportedState(raw: unknown): KalenderState {
  const obj = unwrap(raw)
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('invalid')
  }
  const s = obj as Partial<KalenderState>
  if (!Array.isArray(s.people) || !Array.isArray(s.revisions)) {
    throw new Error('invalid')
  }
  return migrateState({
    roster: s.roster ?? null,
    people: s.people,
    calendarOverrides: Array.isArray(s.calendarOverrides) ? s.calendarOverrides : [],
    holidayPeriods: Array.isArray(s.holidayPeriods) ? s.holidayPeriods : [],
    revisions: s.revisions,
    actuals: Array.isArray(s.actuals) ? s.actuals : [],
    leaves: Array.isArray(s.leaves) ? s.leaves : [],
  })
}

function unwrap(raw: unknown): unknown {
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) throw new Error('invalid')
    return unwrap(JSON.parse(text) as unknown)
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'roster' in raw && 'people' in raw) {
    return raw
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'state' in raw) {
    return (raw as { state: unknown }).state
  }
  return raw
}
