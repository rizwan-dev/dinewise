import { RESTAURANT } from '@/config/restaurant'
import { addDays, localDate, localInstant, weekday } from './time'

/** Table reservations: which times can be offered, and which table a party gets. */

export type Table = { id: number; label: string; seats: number }

export type Booking = { tableId: number; startsAt: Date; endsAt: Date }

/**
 * The smallest free table that seats the party, so a couple is not given the table for eight.
 * Ties go to the lowest id, so the choice is stable and testable.
 */
export function chooseTable(
  tables: Table[],
  partySize: number,
  start: Date,
  bookings: Booking[],
): Table | undefined {
  const end = start.getTime() + RESTAURANT.reservations.durationMinutes * 60_000
  const busy = new Set(
    bookings
      .filter((b) => b.startsAt.getTime() < end && b.endsAt.getTime() > start.getTime())
      .map((b) => b.tableId),
  )
  return tables
    .filter((t) => t.seats >= partySize && !busy.has(t.id))
    .sort((a, b) => a.seats - b.seats || a.id - b.id)[0]
}

export type SeatingTime = { start: Date; available: boolean }

/** Every bookable start time on a day, marked available if some table fits the party. */
export function seatingTimes(
  date: string,
  partySize: number,
  tables: Table[],
  bookings: Booking[],
  now: Date,
): SeatingTime[] {
  const hours = RESTAURANT.hours[weekday(date)]
  if (!hours) return []
  const { slotMinutes, lastSeatingBeforeCloseMinutes } = RESTAURANT.reservations
  const open = localInstant(date, hours.open).getTime()
  const last = localInstant(date, hours.close).getTime() - lastSeatingBeforeCloseMinutes * 60_000
  const times: SeatingTime[] = []
  for (let t = open; t <= last; t += slotMinutes * 60_000) {
    const start = new Date(t)
    times.push({
      start,
      available: t > now.getTime() && chooseTable(tables, partySize, start, bookings) !== undefined,
    })
  }
  return times
}

/** The dates a customer may book, today first. */
export function bookableDates(now: Date): string[] {
  const today = localDate(now)
  return Array.from({ length: RESTAURANT.reservations.daysAhead + 1 }, (_, i) => addDays(today, i))
}
