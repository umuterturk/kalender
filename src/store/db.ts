/**
 * IndexedDB persistence via idb.
 * All state lives in a single 'kalender' database.
 *
 * migrateState() handles forward migration of persisted blobs:
 *   v0→v1: Assignment.personId → allocatedTo / performedBy / source
 *           MonthlyConditions.preferredDates → Person.datePreferences (WANT)
 *           MonthlyConditions.avoidedDates   → Person.datePreferences (AVOID)
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { KalenderState, Assignment, Person, PreferenceType } from '../domain/types'
import { seedHolidayState } from '../domain/holidays'

const DB_NAME = 'kalender'
const DB_VERSION = 1

let db: IDBPDatabase | null = null

async function getDb(): Promise<IDBPDatabase> {
  if (db) return db
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('state')) {
        database.createObjectStore('state')
      }
    },
  })
  return db
}

const STATE_KEY = 'main'

export async function loadState(): Promise<KalenderState | null> {
  try {
    const database = await getDb()
    const data = await database.get('state', STATE_KEY)
    return data ?? null
  } catch {
    return null
  }
}

export async function saveState(state: KalenderState): Promise<void> {
  const database = await getDb()
  await database.put('state', state, STATE_KEY)
}

export async function clearState(): Promise<void> {
  const database = await getDb()
  await database.delete('state', STATE_KEY)
}

// ─── Migration ───────────────────────────────────────────────────────────────

/** Migrate persisted state forward to the current domain model. */
export function migrateState(state: KalenderState): KalenderState {
  const country = state.roster?.country ?? 'TR'
  const holidays = seedHolidayState(state.holidayPeriods, state.calendarOverrides, country)
  return {
    ...state,
    roster: state.roster
      ? {
          ...state.roster,
          country,
          staffingPolicies: state.roster.staffingPolicies ?? [],
        }
      : null,
    holidayPeriods: holidays.holidayPeriods,
    calendarOverrides: holidays.calendarOverrides,
    revisions: state.revisions.map(rev => ({
      ...rev,
      assignments: rev.assignments.map(migrateAssignment),
    })),
    people: state.people.map(migratePerson),
  }
}

function migrateAssignment(a: Assignment): Assignment {
  // Already migrated
  if (a.allocatedTo) return a

  // Old format had `personId` only — cast to unknown first to read legacy fields
  const legacy = a as unknown as { personId?: string; manual?: boolean }
  const personId = legacy.personId ?? ''
  return {
    ...a,
    allocatedTo: personId,
    performedBy: personId,
    source: legacy.manual ? 'manual' : 'auto',
  }
}

function migratePerson(p: Person): Person {
  const prefs: Record<string, PreferenceType> = { ...(p.datePreferences ?? {}) }

  // Lift preferred/avoided dates from MonthlyConditions into datePreferences
  for (const [, cond] of Object.entries(p.monthlyConditions)) {
    if (!cond) continue
    for (const date of cond.preferredDates ?? []) {
      if (!prefs[date]) prefs[date] = 'WANT'
    }
    for (const date of cond.avoidedDates ?? []) {
      if (!prefs[date]) prefs[date] = 'AVOID'
    }
  }

  return {
    ...p,
    capacity: p.capacity ?? 1,
    datePreferences: Object.keys(prefs).length > 0 ? prefs : undefined,
  }
}
