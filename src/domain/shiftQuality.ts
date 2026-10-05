/**
 * What a shift is worth, beyond "one day".
 *
 * The day after a shift is always rest. If that rest runs into holidays,
 * the person gets a longer break. A Thursday shift before a normal weekend
 * rests Friday and then Saturday and Sunday: three days off. A Friday shift
 * rests on Saturday, which was already off, so the break is shorter and the
 * rest day was not a new weekday. That Friday is the worse shift.
 *
 * A long holiday is three or more holidays in a row. A normal weekend is two
 * days and is not one. Working inside a long holiday is a separate burden,
 * and one person should not cover two different long holidays in the window
 * when someone else is free.
 */

import type { IsoDate, Roster, CalendarDateOverride } from './types'
import { addDays, isHoliday } from './calendar'

export type ShiftShape = 'bridge' | 'awkward' | 'plain'

export interface HolidayBlock {
  id: string
  start: IsoDate
  end: IsoDate
}

/** Rest day, then any holidays that follow it. Thursday before a weekend is 3. */
export function consecutiveOffAfter(
  shiftDate: IsoDate,
  roster: Roster,
  overrides: CalendarDateOverride[],
): number {
  let count = 1
  let date = addDays(shiftDate, 2)
  for (let i = 0; i < 14; i++) {
    if (!isHoliday(date, roster, overrides)) break
    count++
    date = addDays(date, 1)
  }
  return count
}

export function shiftShape(
  shiftDate: IsoDate,
  roster: Roster,
  overrides: CalendarDateOverride[],
): ShiftShape {
  const run = consecutiveOffAfter(shiftDate, roster, overrides)
  if (run >= 3) return 'bridge'
  if (isHoliday(addDays(shiftDate, 1), roster, overrides)) return 'awkward'
  return 'plain'
}

/** Holiday runs of 3 or more days inside [start, end). */
export function longHolidayBlocks(
  start: IsoDate,
  end: IsoDate,
  roster: Roster,
  overrides: CalendarDateOverride[],
): HolidayBlock[] {
  const blocks: HolidayBlock[] = []
  let runStart: IsoDate | null = null
  let runEnd: IsoDate | null = null
  const flush = () => {
    if (!runStart || !runEnd) return
    let length = 1
    let cursor = runStart
    while (cursor < runEnd) {
      cursor = addDays(cursor, 1)
      length++
    }
    if (length >= 3) blocks.push({ id: runStart, start: runStart, end: runEnd })
    runStart = null
    runEnd = null
  }

  let date = start
  while (date < end) {
    if (isHoliday(date, roster, overrides)) {
      if (!runStart) runStart = date
      runEnd = date
    } else {
      flush()
    }
    date = addDays(date, 1)
  }
  flush()
  return blocks
}

export function blockOn(date: IsoDate, blocks: HolidayBlock[]): HolidayBlock | null {
  return blocks.find(block => date >= block.start && date <= block.end) ?? null
}
