import { describe, expect, it } from 'vitest'
import { dayLabel, localDate, localInstant } from './time'
import { formatPaise, parseRupees, percentOf } from './money'

describe('restaurant time', () => {
  it('turns Pune wall-clock time into the right instant', () => {
    expect(localInstant('2026-10-05', '19:30').toISOString()).toBe('2026-10-05T14:00:00.000Z')
  })

  it('knows the date in Pune, which can differ from UTC', () => {
    expect(localDate(new Date('2026-10-05T19:00:00Z'))).toBe('2026-10-06')
  })

  it('labels days the way people speak', () => {
    const now = localInstant('2026-10-05', '10:00')
    expect(dayLabel('2026-10-05', now)).toBe('Today')
    expect(dayLabel('2026-10-06', now)).toBe('Tomorrow')
    expect(dayLabel('2026-10-07', now)).toMatch(/Wed/)
  })
})

describe('money', () => {
  it('shows rupees the Indian way, without empty paise', () => {
    expect(formatPaise(1_23_456_00)).toBe('₹1,23,456')
    expect(formatPaise(315_50)).toBe('₹315.50')
  })

  it('rounds tax half up to the paisa', () => {
    expect(percentOf(10, 500)).toBe(1)
    expect(percentOf(9, 500)).toBe(0)
  })

  it('reads rupee amounts typed by staff', () => {
    expect(parseRupees('1,250.5')).toBe(125_050)
    expect(parseRupees('0.29')).toBe(29)
    expect(parseRupees('-5')).toBeNaN()
  })
})
