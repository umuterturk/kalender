/**
 * Manual shift staffing.
 *
 * Ata is a toggle: the same person on the same shift is removed, not duplicated.
 * Adding someone never fills the other open slots. Those stay empty until an
 * explicit automatic plan is requested.
 */

import type { Assignment, IsoDate } from './types'

function ownerOf(assignment: Assignment): string {
  return assignment.allocatedTo ?? assignment.personId ?? ''
}

export function toggleShiftAssignment(
  assignments: Assignment[],
  date: IsoDate,
  personId: string,
  requiredHeadcount: number,
): Assignment[] {
  const onDate = assignments.filter(a => a.date === date)
  if (onDate.some(a => ownerOf(a) === personId)) {
    return assignments.filter(a => a.date !== date || ownerOf(a) !== personId)
  }

  const needed = Math.max(1, Math.floor(requiredHeadcount) || 1)
  let kept = assignments
  if (onDate.length >= needed) {
    const replace = [...onDate].reverse().find(a => !a.locked && a.source !== 'manual') ?? onDate[onDate.length - 1]
    kept = assignments.filter(a => a !== replace)
  }

  const added: Assignment = {
    date,
    allocatedTo: personId,
    performedBy: personId,
    locked: true,
    source: 'manual',
  }
  return [...kept, added]
}
