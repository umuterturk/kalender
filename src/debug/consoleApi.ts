/**
 * Browser console diagnostics for Kalender.
 *
 * In DevTools:
 *   await kalender.dump()       // full state JSON → clipboard + return value
 *   await kalender.download()   // download kalender-dump-<timestamp>.json
 *   await kalender.summary()    // compact counts / months overview
 *   await kalender.load(json)   // replace persisted state and reload
 *   kalender.help()
 */

import type { KalenderState } from '../domain/types'
import { clearState, loadState, migrateState, saveState } from '../store/db'
import { downloadState, parseImportedState, serializeState } from '../store/transfer'

export interface KalenderConsoleApi {
  dump: () => Promise<KalenderState | null>
  download: () => Promise<KalenderState | null>
  summary: () => Promise<Record<string, unknown>>
  load: (json: string | KalenderState) => Promise<void>
  clear: () => Promise<void>
  help: () => void
}

type LiveStateGetter = () => KalenderState

let getLiveState: LiveStateGetter | null = null

/** Called from StoreProvider so dump prefers in-memory state (includes unsaved edits). */
export function registerLiveState(getter: LiveStateGetter): void {
  getLiveState = getter
}

async function resolveState(): Promise<KalenderState | null> {
  if (getLiveState) {
    try {
      return getLiveState()
    } catch {
      // fall through to IndexedDB
    }
  }
  const saved = await loadState()
  return saved ? migrateState(saved) : null
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function buildSummary(state: KalenderState): Record<string, unknown> {
  const months = [...new Set(state.revisions.map(r => r.month))].sort()
  const byMonth = months.map(month => {
    const revs = state.revisions.filter(r => r.month === month)
    const published = revs.filter(r => r.status === 'published').length
    const drafts = revs.filter(r => r.status === 'draft').length
    const latest = revs[revs.length - 1]
    return {
      month,
      revisions: revs.length,
      published,
      drafts,
      latestStatus: latest?.status,
      latestAssignments: latest?.assignments.length ?? 0,
      latestOutcome: latest?.outcomeStatus,
    }
  })

  return {
    exportedAt: new Date().toISOString(),
    source: getLiveState ? 'live' : 'indexeddb',
    rosterId: state.roster?.id ?? null,
    rosterName: state.roster?.name ?? null,
    historyStartDate: state.roster?.historyStartDate ?? null,
    people: state.people.length,
    calendarOverrides: state.calendarOverrides.length,
    revisions: state.revisions.length,
    actuals: state.actuals.length,
    leaves: state.leaves.length,
    months: byMonth,
  }
}

function help(): void {
  console.info(`Kalender console API
  await kalender.dump()        Full config/state as JSON (copies to clipboard)
  await kalender.download()    Same, plus downloads a .json file
  await kalender.summary()     Compact overview (people, months, revision counts)
  await kalender.load(json)    Replace IndexedDB state from JSON string/object, then reload
  await kalender.clear()       Wipe persisted state and reload
  kalender.help()              This message

Paste dump output into chat so generate/fairness issues can be reproduced.`)
}

export function installKalenderConsole(): KalenderConsoleApi {
  const api: KalenderConsoleApi = {
    async dump() {
      const state = await resolveState()
      if (!state) {
        console.warn('[kalender] no state found (live or IndexedDB)')
        return null
      }
      const json = serializeState(state)
      const copied = await copyText(json)
      console.info(
        `[kalender] dump ready (${json.length} chars)${copied ? ', copied to clipboard' : ' — copy failed; use return value or kalender.download()'}`
      )
      console.log(json)
      return state
    },

    async download() {
      const state = await resolveState()
      if (!state) {
        console.warn('[kalender] no state found (live or IndexedDB)')
        return null
      }
      const json = serializeState(state)
      downloadState(state)
      const copied = await copyText(json)
      console.info(`[kalender] downloaded backup${copied ? ' (also copied to clipboard)' : ''}`)
      return state
    },

    async summary() {
      const state = await resolveState()
      if (!state) {
        console.warn('[kalender] no state found (live or IndexedDB)')
        return { empty: true }
      }
      const s = buildSummary(state)
      console.table(s.months as unknown[])
      console.info('[kalender] summary', s)
      return s
    },

    async load(json) {
      const migrated = parseImportedState(json)
      await saveState(migrated)
      console.info('[kalender] state loaded into IndexedDB — reloading…')
      location.reload()
    },

    async clear() {
      await clearState()
      console.info('[kalender] cleared IndexedDB — reloading…')
      location.reload()
    },

    help,
  }

  ;(window as unknown as { kalender: KalenderConsoleApi }).kalender = api
  console.info('[kalender] console ready — run kalender.help()')
  return api
}
