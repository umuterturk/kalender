import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './ui/layout/AppLayout'
import { SettingsPage } from './ui/settings/SettingsPage'
import { MonthWorkspace } from './ui/month/MonthWorkspace'
import { PeoplePage } from './ui/people/PeoplePage'
import { PersonPage } from './ui/people/PersonPage'
import { ActualsPage } from './ui/actuals/ActualsPage'
import { WelcomeDialog } from './ui/welcome/WelcomeDialog'
import { useStore } from './store/useStore'
import { localToday } from './domain/calendar'

const WELCOME_KEY = 'kalender.welcomeSeen'

export default function App() {
  const { roster, loading } = useStore()
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    if (loading) return
    try {
      setShowWelcome(localStorage.getItem(WELCOME_KEY) !== '1')
    } catch {
      setShowWelcome(true)
    }
  }, [loading])

  function dismissWelcome() {
    try { localStorage.setItem(WELCOME_KEY, '1') } catch { /* ignore */ }
    setShowWelcome(false)
  }

  if (loading) {
    return <div className="app-boot">Kalender</div>
  }

  const todayMonth = localToday().slice(0, 7)
  const welcome = showWelcome ? <WelcomeDialog onDismiss={dismissWelcome} /> : null
  const basename = import.meta.env.BASE_URL === '/'
    ? undefined
    : import.meta.env.BASE_URL.replace(/\/$/, '')

  if (!roster) {
    return (
      <>
        {welcome}
        <BrowserRouter basename={basename}>
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/setup" element={<Navigate to="/settings" replace />} />
            <Route path="*" element={<Navigate to="/settings" replace />} />
          </Routes>
        </BrowserRouter>
      </>
    )
  }

  return (
    <>
      {welcome}
      <BrowserRouter basename={basename}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to={`/month/${todayMonth}`} replace />} />
            <Route path="month" element={<Navigate to={`/month/${todayMonth}`} replace />} />
            <Route path="month/:yyyymm" element={<MonthWorkspace />} />
            <Route path="people" element={<PeoplePage />} />
            <Route path="people/:id" element={<PersonPage />} />
            <Route path="policies" element={<Navigate to="/settings" replace />} />
            <Route path="actuals/:yyyymm" element={<ActualsPage />} />
            <Route path="setup" element={<Navigate to="/settings" replace />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  )
}
