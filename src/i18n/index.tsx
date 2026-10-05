import {
  createContext, useContext, useMemo, useState, useCallback, type ReactNode,
} from 'react'
import { en, type Messages } from './en'
import { tr } from './tr'

export type Locale = 'en' | 'tr'

const STORAGE_KEY = 'kalender.locale'

const catalogs: Record<Locale, Messages> = { en, tr }

const localeTags: Record<Locale, string> = {
  en: 'en-US',
  tr: 'tr-TR',
}

type NestedKeyOf<T, P extends string = ''> = T extends string
  ? P
  : {
      [K in keyof T & string]: NestedKeyOf<
        T[K],
        P extends '' ? K : `${P}.${K}`
      >
    }[keyof T & string]

export type MessageKey = NestedKeyOf<Messages>

type Params = Record<string, string | number>

type I18nContextValue = {
  locale: Locale
  localeTag: string
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, params?: Params) => string
  tp: (one: MessageKey, other: MessageKey, count: number, params?: Params) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'tr') return saved
  } catch { /* ignore */ }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'tr'
  return nav.toLowerCase().startsWith('en') ? 'en' : 'tr'
}

function getByPath(obj: unknown, path: string): string | undefined {
  let cur: unknown = obj
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return typeof cur === 'string' ? cur : undefined
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    params[key] !== undefined ? String(params[key]) : `{{${key}}}`
  )
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  }, [])

  const value = useMemo<I18nContextValue>(() => {
    const messages = catalogs[locale]
    const t = (key: MessageKey, params?: Params) => {
      const raw = getByPath(messages, key) ?? getByPath(en, key) ?? key
      return interpolate(raw, params)
    }
    const tp = (one: MessageKey, other: MessageKey, count: number, params?: Params) =>
      t(count === 1 ? one : other, { count, ...params })
    return {
      locale,
      localeTag: localeTags[locale],
      setLocale,
      t,
      tp,
    }
  }, [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

export { localeTags }
export { formatDayType } from './dayType'
