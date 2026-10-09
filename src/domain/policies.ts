/**
 * Dated roster policies.
 * Editing replaces the policy with the same id. An unknown id is left untouched.
 */

import type { RestPolicy, StaffingPolicy } from './types'

export function updateRestPolicy(policies: RestPolicy[], next: RestPolicy): RestPolicy[] {
  if (!policies.some(policy => policy.id === next.id)) return policies
  const treatment = next.nonworkingTreatment
  return policies.map(policy => policy.id === next.id
    ? {
        ...next,
        enabled: treatment !== 'none' && next.enabled,
        nonworkingTreatment: treatment,
      }
    : policy)
}

export function updateStaffingPolicy(policies: StaffingPolicy[], next: StaffingPolicy): StaffingPolicy[] {
  if (!policies.some(policy => policy.id === next.id)) return policies
  const requiredHeadcount = Math.max(1, Math.floor(next.requiredHeadcount) || 1)
  return policies.map(policy => policy.id === next.id
    ? { ...next, requiredHeadcount }
    : policy)
}

const REPAIR_WARNING_TYPES = new Set(['UNAVAILABLE', 'NEXT_DAY_OFF', 'AVOID_PREFERENCE'])

/**
 * True when a plan breaks a rule the user may choose to repair.
 * A short shift is not one of those rules: an empty slot is only a warning.
 */
export function shouldOfferAutomaticRepair(
  warnings: { type: string }[],
  hardErrors: { kind: string }[],
): boolean {
  return warnings.some(warning => REPAIR_WARNING_TYPES.has(warning.type))
    || hardErrors.some(error => error.kind === 'not-member')
}
