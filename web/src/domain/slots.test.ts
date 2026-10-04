import { describe, expect, it } from 'vitest'
import { asapSlot, isOpenNow, orderSlots } from './slots'
import { localInstant } from './time'

// Monday 5 October 2026 (open 11:30-22:30); prep 30 min, 15-min slots, 8 orders each.
const at = (hhmm: string, date = '2026-10-05') => localInstant(date, hhmm)

describe('order slots', () => {
  it('starts a prep time from now, rounded up to the next slot', () => {
    expect(asapSlot(at('18:07'), new Map())?.start).toEqual(at('18:45'))
    expect(asapSlot(at('18:00'), new Map())?.start).toEqual(at('18:30'))
  })

  it('before opening, the first slot is a prep time after the doors open', () => {
    expect(asapSlot(at('09:00'), new Map())?.start).toEqual(at('12:00'))
  })

  it('skips full slots, so a rush spreads out instead of overwhelming the kitchen', () => {
    const counts = new Map([[at('18:45').getTime(), 8]])
    const slots = orderSlots(at('18:07'), counts)
    expect(slots[0]).toMatchObject({ start: at('18:45'), full: true })
    expect(asapSlot(at('18:07'), counts)?.start).toEqual(at('19:00'))
  })

  it('stops at closing and continues the next days', () => {
    const slots = orderSlots(at('22:10'), new Map())
    // 22:10 + 30 min prep is past Monday's 22:30 close, so the first slot is Tuesday's.
    expect(slots[0]?.start).toEqual(at('12:00', '2026-10-06'))
    expect(slots[0]?.date).toBe('2026-10-06')
    expect(slots.at(-1)?.date).toBe('2026-10-07')
  })

  it('knows when the restaurant is open, in Pune time', () => {
    expect(isOpenNow(at('11:29'))).toBe(false)
    expect(isOpenNow(at('11:30'))).toBe(true)
    expect(isOpenNow(at('22:30'))).toBe(false)
  })
})
