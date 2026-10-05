import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { trackPageView } from './analytics'
import { AppLayout } from './ui/layout/AppLayout'
import { SettingsPage } from './ui/settings/SettingsPage'
import { MonthWorkspace } from './ui/month/MonthWorkspace'
import { PeoplePage } from './ui/people/PeoplePage'
import { PersonPage } from './ui/people/PersonPage'
import { ActualsPage } from './ui/actuals/ActualsPage'
import { WelcomeDialog } from './ui/welcome/WelcomeDialog'
import { markWelcomeSeen, welcomeHasBeenSeen } from './ui/welcome/welcomeSeen'
import { useStore } from './store/useStore'
import { localToday } from './domain/calendar'

function TrackPageViews() {
  const { pathname } = useLocation()
  useEffect(() => {
    trackPageView(pathname)
  }, [pathname])
  return null
}

export default function App() {
  const { roster, loading } = useStore()
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    if (loading) return
    setShowWelcome(!welcomeHasBeenSeen())
  }, [loading, roster])

  function dismissWelcome() {
    markWelcomeSeen()
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
          <TrackPageViews />
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
        <TrackPageViews />
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
