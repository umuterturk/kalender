import { useMemo } from 'react'
import { computeFairness } from '../../domain/fairness'
import type { FairnessReport } from '../../domain/fairness'
import { useStore } from '../../store/useStore'

/** Rolling fairness for a month, using the latest revision as the candidate plan. */
export function useFairness(month: string): FairnessReport | null {
  const { roster, people, revisions, actuals, calendarOverrides } = useStore()

  const activeRevision = useMemo(() => {
    const monthRevisions = revisions.filter(r => r.month === month)
    return monthRevisions[monthRevisions.length - 1] ?? null
  }, [revisions, month])

  const priorAssignments = useMemo(() => {
    const latest = new Map<string, typeof revisions[number]>()
    for (const revision of revisions) {
      if (revision.month === month) continue
      latest.set(revision.month, revision)
    }
    return [...latest.values()].flatMap(revision => revision.assignments)
  }, [revisions, month])

  return useMemo(() => {
    if (!roster) return null
    return computeFairness(
      month, people, roster, calendarOverrides, actuals, activeRevision,
      [], roster.historyStartDate, priorAssignments,
    )
  }, [month, people, roster, calendarOverrides, actuals, activeRevision, priorAssignments])
}
