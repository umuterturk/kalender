import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { StoreProvider } from './store/useStore'
import { I18nProvider } from './i18n'
import { installKalenderConsole } from './debug/consoleApi'
import { initAnalytics } from './analytics'
import './tokens.css'

installKalenderConsole()
initAnalytics()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </I18nProvider>
  </React.StrictMode>
)
