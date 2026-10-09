import { useStore } from '../../store/useStore'
import { StaffingPoliciesSection } from './StaffingPoliciesSection'
import { RestPoliciesSection } from './RestPoliciesSection'
import { useI18n } from '../../i18n'
import './PoliciesPage.css'

export function PoliciesPage() {
  const { roster } = useStore()
  const { t } = useI18n()

  if (!roster) return <div className="policies-page"><p>{t('policies.setupFirst')}</p></div>

  return (
    <div className="policies-page">
      <div className="page-header">
        <h1 className="page-title">{t('policies.title')}</h1>
      </div>

      <div className="policies-sections">
        <StaffingPoliciesSection />
        <RestPoliciesSection />
      </div>
    </div>
  )
}
