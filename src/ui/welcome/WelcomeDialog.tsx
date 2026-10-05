import { useI18n } from '../../i18n'
import './WelcomeDialog.css'

type Props = {
  onDismiss: () => void
}

export function WelcomeDialog({ onDismiss }: Props) {
  const { t, locale, setLocale } = useI18n()

  return (
    <div className="welcome-overlay" role="presentation">
      <div
        className="welcome-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-body"
      >
        <div className="welcome-top">
          <div className="welcome-brand">Kalender</div>
          <div className="lang-switcher compact" role="group" aria-label={t('nav.language')}>
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
        </div>
        <h1 id="welcome-title" className="welcome-title">{t('welcome.title')}</h1>
        <p id="welcome-body" className="welcome-lead">{t('welcome.lead')}</p>
        <ul className="welcome-points">
          <li>
            <strong>{t('welcome.ease')}</strong>
            <span>{t('welcome.easeBody')}</span>
          </li>
          <li>
            <strong>{t('welcome.fair')}</strong>
            <span>{t('welcome.fairBody')}</span>
          </li>
          <li>
            <strong>{t('welcome.flex')}</strong>
            <span>{t('welcome.flexBody')}</span>
          </li>
        </ul>
        <button className="btn btn-primary welcome-cta" onClick={onDismiss}>
          {t('welcome.cta')}
        </button>
      </div>
    </div>
  )
}
