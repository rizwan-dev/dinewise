import { RESTAURANT } from '@/config/restaurant'
import { addDays, localDate, localInstant, minutesOf, weekday } from './time'

/**
 * When an order can be ready. Each slot has a kitchen capacity, so a rush of orders spreads
 * across the evening instead of piling onto one 15-minute window the kitchen cannot meet.
 */

export type Slot = {
  /** Start of the slot: the time the order should be ready. */
  start: Date
  date: string
  full: boolean
}

export type SlotCounts = Map<number, number>

/**
 * Every slot from the earliest the kitchen can make (now + prep, rounded up to a slot) until
 * closing, over the scheduling window. `counts` maps slot start (ms) to orders already taken.
 */
export function orderSlots(now: Date, counts: SlotCounts): Slot[] {
  const { slotMinutes, prepMinutes, scheduleDaysAhead, ordersPerSlot } = RESTAURANT.ordering
  const slotMs = slotMinutes * 60_000
  const earliest = Math.ceil((now.getTime() + prepMinutes * 60_000) / slotMs) * slotMs
  const today = localDate(now)

  const slots: Slot[] = []
  for (let day = 0; day <= scheduleDaysAhead; day++) {
    const date = addDays(today, day)
    const hours = RESTAURANT.hours[weekday(date)]
    if (!hours) continue
    const open = localInstant(date, hours.open).getTime()
    const close = localInstant(date, hours.close).getTime()
    // The first slot is a prep time after opening; the last starts no later than closing.
    for (let t = open + prepMinutes * 60_000; t <= close; t += slotMs) {
      if (t < earliest) continue
      slots.push({ start: new Date(t), date, full: (counts.get(t) ?? 0) >= ordersPerSlot })
    }
  }
  return slots
}

/** The first slot with room: what "as soon as possible" means right now. */
export function asapSlot(now: Date, counts: SlotCounts): Slot | undefined {
  return orderSlots(now, counts).find((s) => !s.full)
}

/** Is the kitchen taking orders for today at all? */
export function isOpenNow(now: Date): boolean {
  const date = localDate(now)
  const hours = RESTAURANT.hours[weekday(date)]
  if (!hours) return false
  const minutesNow = minutesOf(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: RESTAURANT.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  )
  return minutesNow >= minutesOf(hours.open) && minutesNow < minutesOf(hours.close)
}
