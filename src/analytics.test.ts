import { describe, expect, it } from 'vitest'
import { analyticsPath } from './analytics'

describe('analyticsPath', () => {
  it('keeps month routes and drops person ids', () => {
    expect(analyticsPath('/month/2026-10')).toBe('/month/2026-10')
    expect(analyticsPath('/people/abc_123-XY')).toBe('/people/:id')
    expect(analyticsPath('/settings')).toBe('/settings')
  })
})
