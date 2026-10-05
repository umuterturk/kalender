import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store/useStore'
import { downloadState, hasExistingData, parseImportedState } from '../../store/transfer'
import { useI18n } from '../../i18n'
import { trackEvent } from '../../analytics'
import './ImportExport.css'

type Props = {
  variant: 'settings' | 'onboarding' | 'welcome'
  onImported?: () => void
}

export function ImportExport({ variant, onImported }: Props) {
  const store = useStore()
  const { t, locale } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ReturnType<typeof parseImportedState> | null>(null)
  const [error, setError] = useState('')

  const canExport = variant === 'settings' && !!store.roster

  function openPicker() {
    setError('')
    fileRef.current?.click()
  }

  function onFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = parseImportedState(String(reader.result ?? ''))
        if (hasExistingData(store)) {
          setPending(imported)
          return
        }
        apply(imported)
      } catch {
        setError(t('transfer.invalid'))
      }
    }
    reader.onerror = () => setError(t('transfer.invalid'))
    reader.readAsText(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  function apply(state: ReturnType<typeof parseImportedState>) {
    store.dispatch({ type: 'LOAD_STATE', payload: state })
    trackEvent('import', { locale })
    setPending(null)
    setError('')
    onImported?.()
  }

  const importButton = (
    <button
      type="button"
      className={variant === 'welcome' ? 'btn btn-secondary welcome-cta' : 'btn btn-secondary'}
      onClick={openPicker}
    >
      {variant === 'welcome' ? t('welcome.import') : t('transfer.import')}
    </button>
  )

  return (
    <div className={`transfer transfer-${variant}`}>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={e => onFile(e.target.files?.[0])}
      />

      {variant === 'settings' && (
        <section className="card settings-section">
          <h2 className="section-title">{t('transfer.title')}</h2>
          <p className="help-text">{t('transfer.help')}</p>
          <div className="btn-row transfer-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { downloadState(store); trackEvent('export', { locale }) }} disabled={!canExport}>
              {t('transfer.export')}
            </button>
            {importButton}
          </div>
          {error && <span className="error-text">{error}</span>}
        </section>
      )}

      {variant === 'onboarding' && (
        <div className="transfer-onboarding">
          <p className="help-text">{t('transfer.onboardingHelp')}</p>
          {importButton}
          {error && <span className="error-text">{error}</span>}
        </div>
      )}

      {variant === 'welcome' && (
        <>
          {importButton}
          {error && <span className="error-text">{error}</span>}
        </>
      )}

      {pending && createPortal(
        <div className="transfer-overlay" role="presentation" onClick={() => setPending(null)}>
          <div
            className="transfer-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transfer-replace-title"
            onClick={e => e.stopPropagation()}
          >
            <h3 id="transfer-replace-title">{t('transfer.replaceTitle')}</h3>
            <p>{t('transfer.replaceBody')}</p>
            <div className="btn-row transfer-dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPending(null)}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => apply(pending)}>
                {t('transfer.replace')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
