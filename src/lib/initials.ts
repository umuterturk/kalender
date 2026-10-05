const TITLES = new Set([
  'dr', 'prof', 'uzm', 'op', 'doç', 'doc', 'mr', 'mrs', 'ms', 'prd', 'yrd',
])

function splitName(name: string): string[] {
  return name
    .trim()
    .split(/[\s-]+/)
    .map(part => part.replace(/[.,;:]+$/g, ''))
    .filter(part => {
      if (!part) return false
      return !TITLES.has(part.toLocaleLowerCase())
    })
}

function take(word: string, n: number, locale: string): string {
  const chars = [...word]
  if (chars.length === 0) return ''
  return chars.slice(0, Math.max(1, n)).join('').toLocaleUpperCase(locale)
}

function candidates(parts: string[], locale: string): string[] {
  const out: string[] = []
  const add = (label: string) => {
    if (label && !out.includes(label)) out.push(label)
  }

  if (parts.length === 0) return ['?']
  if (parts.length === 1) {
    const len = [...parts[0]].length
    for (let n = Math.min(2, len); n <= len; n++) add(take(parts[0], n, locale))
    return out.length > 0 ? out : ['?']
  }

  const first = parts[0]
  const last = parts[parts.length - 1]
  const firstLen = [...first].length
  const lastLen = [...last].length

  add(take(first, 1, locale) + take(last, 1, locale))
  if (parts.length > 2) add(parts.map(p => take(p, 1, locale)).join(''))

  for (let total = 3; total <= firstLen + lastLen; total++) {
    for (let fn = total - 1; fn >= 1; fn--) {
      const ln = total - fn
      if (fn <= firstLen && ln <= lastLen) {
        add(take(first, fn, locale) + take(last, ln, locale))
      }
    }
  }
  return out.length > 0 ? out : ['?']
}

/** Short unique labels for a roster. Prefers 2-letter initials; expands only collisions. */
export function uniqueInitials(
  people: { id: string; name: string }[],
  locale = 'tr-TR',
): Map<string, string> {
  const parsed = people.map(p => ({
    id: p.id,
    candidates: candidates(splitName(p.name), locale),
  }))
  const assigned = new Map<string, string>()
  const used = new Set<string>()
  const maxRounds = Math.max(1, ...parsed.map(p => p.candidates.length))

  for (let round = 0; round < maxRounds; round++) {
    const remaining = parsed.filter(p => !assigned.has(p.id))
    const buckets = new Map<string, string[]>()
    for (const p of remaining) {
      const label = p.candidates[Math.min(round, p.candidates.length - 1)]
      const group = buckets.get(label) ?? []
      group.push(p.id)
      buckets.set(label, group)
    }
    for (const [label, ids] of buckets) {
      if (ids.length === 1 && !used.has(label)) {
        assigned.set(ids[0], label)
        used.add(label)
      }
    }
    if (assigned.size === parsed.length) return assigned
  }

  const leftover = parsed.filter(p => !assigned.has(p.id)).sort((a, b) => a.id.localeCompare(b.id))
  for (const p of leftover) {
    const base = p.candidates[0] ?? '?'
    if (!used.has(base)) {
      assigned.set(p.id, base)
      used.add(base)
      continue
    }
    let n = 2
    let label = `${base}${n}`
    while (used.has(label)) {
      n += 1
      label = `${base}${n}`
    }
    assigned.set(p.id, label)
    used.add(label)
  }

  return assigned
}
