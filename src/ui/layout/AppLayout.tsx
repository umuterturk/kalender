import type { ReactNode } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useStore } from '../../store/useStore'
import { localToday } from '../../domain/calendar'
import { useI18n, type Locale } from '../../i18n'
import { IconCalendar, IconPeople, IconSettings } from '../icons'
import './AppLayout.css'

export function AppLayout() {
  const { roster, people } = useStore()
  const { pathname } = useLocation()
  const { t, tp, locale, setLocale } = useI18n()
  const openMonth = pathname.match(/^\/month\/(\d{4}-\d{2})/)?.[1]
  const scheduleTo = `/month/${openMonth ?? localToday().slice(0, 7)}`

  return (
    <div className="app-shell">
      <aside className="app-rail" aria-label={t('nav.mainNav')}>
        <div className="rail-brand">
          <span className="brand-mark">K</span>
          <div className="brand-text">
            <span className="brand-name">Kalender</span>
            {roster && <span className="brand-sub">{roster.name}</span>}
          </div>
        </div>

        <nav className="rail-nav">
          <NavItem to={scheduleTo} label={t('nav.schedule')} icon={<IconCalendar />} matchPrefix="/month" />
          <NavItem to="/people" label={t('nav.people')} icon={<IconPeople />} matchPrefix="/people" />
          <NavItem to="/settings" label={t('nav.settings')} icon={<IconSettings />} matchPrefix="/settings" />
        </nav>

        <div className="rail-footer">
          <span className="rail-meta">
            {tp('nav.members', 'nav.members_plural', people.length)}
          </span>
          <LanguageSwitcher locale={locale} setLocale={setLocale} label={t('nav.language')} />
        </div>
      </aside>

      <div className="app-stage">
        <header className="app-topbar">
          <div className="topbar-brand">
            <span className="brand-mark sm">K</span>
            <div>
              <div className="brand-name">Kalender</div>
              {roster && <div className="brand-sub">{roster.name}</div>}
            </div>
          </div>
          <LanguageSwitcher locale={locale} setLocale={setLocale} label={t('nav.language')} compact />
        </header>

        <main className="app-main">
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav" aria-label={t('nav.mobileNav')}>
        <NavItem to={scheduleTo} label={t('nav.schedule')} icon={<IconCalendar size={22} />} matchPrefix="/month" />
        <NavItem to="/people" label={t('nav.people')} icon={<IconPeople size={22} />} matchPrefix="/people" />
        <NavItem to="/settings" label={t('nav.settings')} icon={<IconSettings size={22} />} matchPrefix="/settings" />
      </nav>
    </div>
  )
}

function LanguageSwitcher({
  locale, setLocale, label, compact,
}: {
  locale: Locale
  setLocale: (locale: Locale) => void
  label: string
  compact?: boolean
}) {
  return (
    <div className={`lang-switcher ${compact ? 'compact' : ''}`} role="group" aria-label={label}>
      <button
        type="button"
        className={`lang-btn ${locale === 'tr' ? 'active' : ''}`}
        onClick={() => setLocale('tr')}
      >
        TR
      </button>
      <button
        type="button"
        className={`lang-btn ${locale === 'en' ? 'active' : ''}`}
        onClick={() => setLocale('en')}
      >
        EN
      </button>
    </div>
  )
}

function NavItem({
  to, label, icon, matchPrefix,
}: {
  to: string
  label: string
  icon: ReactNode
  matchPrefix?: string
}) {
  const { pathname } = useLocation()
  const active = matchPrefix
    ? pathname.startsWith(matchPrefix)
    : pathname === to

  return (
    <NavLink
      to={to}
      className={`nav-item ${active ? 'active' : ''}`}
      end={!matchPrefix}
    >
      <span className="nav-item-icon">{icon}</span>
      <span className="nav-item-label">{label}</span>
    </NavLink>
  )
}
