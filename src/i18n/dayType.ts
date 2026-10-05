/** Domain day-type codes use H for holiday; UI shows T (tatil). */
export function formatDayType(code: string): string {
  switch (code) {
    case 'NH': return 'NT'
    case 'HN': return 'TN'
    case 'HH': return 'TT'
    default: return code
  }
}
