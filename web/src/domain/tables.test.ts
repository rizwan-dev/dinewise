import { describe, expect, it } from 'vitest'
import { chooseTable, seatingTimes } from './tables'
import { localInstant } from './time'

const tables = [
  { id: 1, label: 'T1', seats: 2 },
  { id: 2, label: 'T2', seats: 2 },
  { id: 3, label: 'T3', seats: 4 },
  { id: 4, label: 'T4', seats: 8 },
]
const at = (hhmm: string) => localInstant('2026-10-05', hhmm)
const booking = (tableId: number, start: string) => ({
  tableId,
  startsAt: at(start),
  endsAt: new Date(at(start).getTime() + 90 * 60_000),
})

describe('choosing a table', () => {
  it('gives a party the smallest table that seats them', () => {
    expect(chooseTable(tables, 2, at('19:00'), [])?.label).toBe('T1')
    expect(chooseTable(tables, 3, at('19:00'), [])?.label).toBe('T3')
    expect(chooseTable(tables, 5, at('19:00'), [])?.label).toBe('T4')
    expect(chooseTable(tables, 9, at('19:00'), [])).toBeUndefined()
  })

  it('moves up a size only when the smaller tables are taken for that time', () => {
    const busy = [booking(1, '18:30'), booking(2, '19:30')]
    expect(chooseTable(tables, 2, at('19:00'), busy)?.label).toBe('T3')
  })

  it('a table is free again the moment the previous 90-minute booking ends', () => {
    expect(chooseTable(tables, 2, at('20:00'), [booking(1, '18:30')])?.label).toBe('T1')
  })
})

describe('seating times', () => {
  it('runs from opening to 90 minutes before closing, in 30-minute steps', () => {
    const times = seatingTimes('2026-10-05', 2, tables, [], at('09:00'))
    expect(times[0]?.start).toEqual(at('11:30'))
    expect(times.at(-1)?.start).toEqual(at('21:00'))
  })

  it('marks past times and times with no fitting table as unavailable', () => {
    const allEight = [booking(4, '19:00')]
    const times = seatingTimes('2026-10-05', 6, tables, allEight, at('12:10'))
    const byTime = (hhmm: string) => times.find((t) => t.start.getTime() === at(hhmm).getTime())
    expect(byTime('12:00')?.available).toBe(false)
    expect(byTime('12:30')?.available).toBe(true)
    expect(byTime('18:00')?.available).toBe(false) // overlaps the 19:00 booking of the only 8-seater
    expect(byTime('20:30')?.available).toBe(true)
  })
})
