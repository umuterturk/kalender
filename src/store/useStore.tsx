/**
 * Central React store (Context + useReducer).
 * All state mutations go through typed commands.
 */

import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react'
import type {
  KalenderState, Roster, Person, CalendarDateOverride, PlanRevision,
  Assignment, ActualShift, LeaveObligation, MonthlyConditions, Membership,
  RestPolicy, HolidayPeriod
} from '../domain/types'
import { loadState, saveState, migrateState } from './db'
import { registerLiveState } from '../debug/consoleApi'
import { nanoid } from '../lib/nanoid'
import { dateInPeriods, seedHolidayState, syncHolidayOverrides } from '../domain/holidays'

// ─── Initial state ─────────────────────────────────────────────────────────

const INITIAL_STATE: KalenderState = {
  roster: null,
  people: [],
  calendarOverrides: [],
  holidayPeriods: [],
  revisions: [],
  actuals: [],
  leaves: [],
}

// ─── Actions ───────────────────────────────────────────────────────────────

export type Action =
  | { type: 'LOAD_STATE'; payload: KalenderState }
  | { type: 'SETUP_ROSTER'; payload: Roster }
  | { type: 'ADD_PERSON'; payload: Person }
  | { type: 'UPDATE_PERSON'; payload: Person }
  | { type: 'SET_MONTHLY_CONDITIONS'; payload: { personId: string; month: string; conditions: MonthlyConditions } }
  | { type: 'SET_CALENDAR_OVERRIDE'; payload: CalendarDateOverride }
  | { type: 'REMOVE_CALENDAR_OVERRIDE'; payload: string /* date */ }
  | { type: 'UPSERT_HOLIDAY_PERIOD'; payload: HolidayPeriod }
  | { type: 'REMOVE_HOLIDAY_PERIOD'; payload: string /* id */ }
  | { type: 'ADD_REST_POLICY'; payload: RestPolicy }
  | { type: 'SAVE_REVISION'; payload: PlanRevision }
  | { type: 'PUBLISH_REVISION'; payload: { revisionId: string; publishedAt: string } }
  | { type: 'MARK_STALE'; payload: { revisionId: string } }
  | { type: 'SAVE_ACTUAL'; payload: ActualShift }
  | { type: 'SAVE_LEAVES'; payload: LeaveObligation[] }
  | { type: 'DROP_ASSIGNMENT_LEAVES'; payload: string /* YYYY-MM */ }
  | { type: 'CLEAR_ALL' }

// ─── Reducer ───────────────────────────────────────────────────────────────

function reducer(state: KalenderState, action: Action): KalenderState {
  switch (action.type) {
    case 'LOAD_STATE':
      return action.payload

    case 'SETUP_ROSTER': {
      const firstSetup = !state.roster
      const country = action.payload.country ?? 'TR'
      const holidays = firstSetup
        ? seedHolidayState(state.holidayPeriods, state.calendarOverrides, country)
        : null
      return {
        ...state,
        roster: { ...action.payload, country },
        ...(holidays ?? {}),
      }
    }

    case 'ADD_PERSON':
      return { ...state, people: [...state.people, action.payload] }

    case 'UPDATE_PERSON':
      return {
        ...state,
        people: state.people.map(p => p.id === action.payload.id ? action.payload : p)
      }

    case 'SET_MONTHLY_CONDITIONS': {
      const { personId, month, conditions } = action.payload
      return {
        ...state,
        people: state.people.map(p =>
          p.id === personId
            ? { ...p, monthlyConditions: { ...p.monthlyConditions, [month]: conditions } }
            : p
        )
      }
    }

    case 'SET_CALENDAR_OVERRIDE': {
      const existing = state.calendarOverrides.filter(o => o.date !== action.payload.date)
      const overrides = [...existing, action.payload]
      if (!action.payload.holiday || dateInPeriods(action.payload.date, state.holidayPeriods)) {
        return { ...state, calendarOverrides: overrides }
      }
      const period: HolidayPeriod = {
        id: nanoid(),
        label: (action.payload.label || action.payload.date).trim(),
        start: action.payload.date,
        end: action.payload.date,
      }
      const holidayPeriods = [...state.holidayPeriods, period]
      return {
        ...state,
        holidayPeriods,
        calendarOverrides: syncHolidayOverrides(overrides, holidayPeriods),
      }
    }

    case 'REMOVE_CALENDAR_OVERRIDE': {
      const holidayPeriods = state.holidayPeriods.filter(p =>
        !(p.start === action.payload && p.end === action.payload && !p.officialKind)
      )
      return {
        ...state,
        holidayPeriods,
        calendarOverrides: syncHolidayOverrides(
          state.calendarOverrides.filter(o => o.date !== action.payload),
          holidayPeriods,
        ),
      }
    }

    case 'UPSERT_HOLIDAY_PERIOD': {
      const holidayPeriods = [
        ...state.holidayPeriods.filter(p => p.id !== action.payload.id),
        action.payload,
      ]
      return {
        ...state,
        holidayPeriods,
        calendarOverrides: syncHolidayOverrides(state.calendarOverrides, holidayPeriods),
      }
    }

    case 'REMOVE_HOLIDAY_PERIOD': {
      const holidayPeriods = state.holidayPeriods.filter(p => p.id !== action.payload)
      return {
        ...state,
        holidayPeriods,
        calendarOverrides: syncHolidayOverrides(state.calendarOverrides, holidayPeriods),
      }
    }

    case 'ADD_REST_POLICY':
      if (!state.roster) return state
      return {
        ...state,
        roster: {
          ...state.roster,
          restPolicies: [...state.roster.restPolicies, action.payload]
        }
      }

    case 'SAVE_REVISION': {
      const existing = state.revisions.filter(r =>
        !(r.month === action.payload.month && r.id === action.payload.id)
      )
      return { ...state, revisions: [...existing, action.payload] }
    }

    case 'PUBLISH_REVISION': {
      const publishing = state.revisions.find(r => r.id === action.payload.revisionId)
      return {
        ...state,
        revisions: state.revisions
          .filter(r =>
            r.id === action.payload.revisionId
            || !publishing
            || r.month !== publishing.month
            || r.status === 'published'
          )
          .map(r =>
            r.id === action.payload.revisionId
              ? { ...r, status: 'published', publishedAt: action.payload.publishedAt }
              : r
          ),
      }
    }

    case 'MARK_STALE':
      return {
        ...state,
        revisions: state.revisions.map(r =>
          r.id === action.payload.revisionId
            ? { ...r, status: 'stale' }
            : r
        )
      }

    case 'SAVE_ACTUAL': {
      const existing = state.actuals.filter(a => a.id !== action.payload.id)
      return { ...state, actuals: [...existing, action.payload] }
    }

    case 'SAVE_LEAVES': {
      // Merge: keep leaves not covered by new payload, add new
      const newIds = new Set(action.payload.map(l => l.id))
      const existing = state.leaves.filter(l => !newIds.has(l.id))
      return { ...state, leaves: [...existing, ...action.payload] }
    }

    case 'DROP_ASSIGNMENT_LEAVES':
      return {
        ...state,
        leaves: state.leaves.filter(l =>
          !(l.sourceType === 'assignment' && l.shiftDate.startsWith(action.payload))
        ),
      }

    case 'CLEAR_ALL':
      return INITIAL_STATE

    default:
      return state
  }
}

// ─── Context ───────────────────────────────────────────────────────────────

interface StoreContextValue extends KalenderState {
  dispatch: React.Dispatch<Action>
  loading: boolean
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const [loading, setLoading] = React.useState(true)

  // Load from IndexedDB on mount
  useEffect(() => {
    loadState().then(saved => {
      if (saved) dispatch({ type: 'LOAD_STATE', payload: migrateState(saved) })
      setLoading(false)
    })
  }, [])

  // Persist on every state change
  useEffect(() => {
    if (!loading) {
      saveState(state).catch(console.error)
    }
  }, [state, loading])

  // Keep console dump in sync with in-memory state (including unsaved edits)
  useEffect(() => {
    registerLiveState(() => state)
  }, [state])

  return (
    <StoreContext.Provider value={{ ...state, dispatch, loading }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
