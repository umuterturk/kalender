import { describe, expect, it } from 'vitest'
import { uniqueInitials } from '../initials'

function labels(...names: string[]): string[] {
  const people = names.map((name, i) => ({ id: String(i + 1), name }))
  const map = uniqueInitials(people, 'tr-TR')
  return people.map(p => map.get(p.id) ?? '')
}

describe('uniqueInitials', () => {
  it('uses first+last letters for two-word names', () => {
    expect(labels('Ayşe Yılmaz')).toEqual(['AY'])
  })

  it('uses two letters of a single name', () => {
    expect(labels('Ada', 'Ben')).toEqual(['AD', 'BE'])
  })

  it('expands first names when last initials collide', () => {
    expect(labels('Ali Yılmaz', 'Ayşe Yılmaz')).toEqual(['ALY', 'AYY'])
  })

  it('uses middle-name initials when that distinguishes', () => {
    expect(labels('Fatma Nur Yılmaz', 'Fatma Yılmaz')).toEqual(['FNY', 'FAY'])
  })

  it('keeps unique people short while expanding only collisions', () => {
    expect(labels('Ada', 'Ali Yılmaz', 'Ayşe Yılmaz')).toEqual(['AD', 'ALY', 'AYY'])
  })

  it('distinguishes single names with a shared prefix', () => {
    expect(labels('Can', 'Canan')).toEqual(['CAN', 'CANA'])
  })

  it('expands last names when first names match', () => {
    const people = [
      { id: '1', name: 'John Smith' },
      { id: '2', name: 'John Smythe' },
    ]
    const map = uniqueInitials(people, 'en-US')
    expect([map.get('1'), map.get('2')]).toEqual(['JSMI', 'JSMY'])
  })

  it('skips medical titles', () => {
    expect(labels('Dr. Ayşe Yılmaz', 'Ali Demir')).toEqual(['AY', 'AD'])
  })

  it('treats hyphenated given names as extra words', () => {
    expect(labels('Ayşe-Nur Yılmaz', 'Ayşe Yılmaz')).toEqual(['ANY', 'AYY'])
  })

  it('numbers identical names', () => {
    expect(labels('Ali Yılmaz', 'Ali Yılmaz')).toEqual(['AY', 'AY2'])
  })

  it('uppercases Turkish dotted/dotless i by locale', () => {
    expect(labels('ışık yılmaz', 'ipek demir')).toEqual(['IY', 'İD'])
  })
})
