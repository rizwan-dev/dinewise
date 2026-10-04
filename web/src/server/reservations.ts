import 'server-only'
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { RESTAURANT } from '@/config/restaurant'
import type { Db, Executor } from '@/db/client'
import { customers, diningTables, reservations } from '@/db/schema'
import { bookableDates, chooseTable, seatingTimes, type Booking } from '@/domain/tables'
import { addDays, localDate, localInstant } from '@/domain/time'
import { publicCode } from './auth/crypto'
import { AppError } from './errors'

/**
 * Table bookings. Bookings for one day are made one at a time under an advisory lock, so two
 * parties choosing the last table at 8pm cannot both get it; the exclusion constraint on
 * reservations stays as the backstop for anything that bypasses this code.
 */

const HOLDING = ['BOOKED', 'SEATED', 'COMPLETED'] as const

async function dayBookings(exec: Executor, date: string): Promise<Booking[]> {
  const from = localInstant(date, '00:00')
  const to = localInstant(addDays(date, 1), '00:00')
  return exec
    .select({ tableId: reservations.tableId, startsAt: reservations.startsAt, endsAt: reservations.endsAt })
    .from(reservations)
    .where(and(gte(reservations.endsAt, from), lt(reservations.startsAt, to), inArray(reservations.status, [...HOLDING])))
}

const activeTables = (exec: Executor) =>
  exec
    .select({ id: diningTables.id, label: diningTables.label, seats: diningTables.seats })
    .from(diningTables)
    .where(eq(diningTables.active, true))

export async function availableTimes(exec: Executor, date: string, partySize: number, now = new Date()) {
  if (!bookableDates(now).includes(date)) return []
  const [tables, bookings] = await Promise.all([activeTables(exec), dayBookings(exec, date)])
  return seatingTimes(date, partySize, tables, bookings, now)
}

export async function book(
  db: Db,
  input: { customerId: number; startsAt: string; partySize: number; notes?: string | null },
  now = new Date(),
) {
  const start = new Date(input.startsAt)
  const { maxPartySize, durationMinutes } = RESTAURANT.reservations
  if (!Number.isInteger(input.partySize) || input.partySize < 1 || input.partySize > maxPartySize) {
    throw new AppError('PARTY_SIZE', `We take bookings for 1 to ${maxPartySize} people. Call us for larger groups.`)
  }
  if (Number.isNaN(start.getTime())) throw new AppError('INVALID_TIME', 'Choose a time.')
  const date = localDate(start)

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'reservations:' + date}))`)
    const offered = await availableTimes(tx, date, input.partySize, now)
    if (!offered.some((t) => t.available && t.start.getTime() === start.getTime())) {
      throw new AppError('TIME_UNAVAILABLE', 'That time has just been taken. Please choose another.')
    }
    const table = chooseTable(await activeTables(tx), input.partySize, start, await dayBookings(tx, date))
    if (!table) throw new AppError('TIME_UNAVAILABLE', 'That time has just been taken. Please choose another.')

    const [row] = await tx
      .insert(reservations)
      .values({
        code: publicCode('TB'),
        customerId: input.customerId,
        tableId: table.id,
        partySize: input.partySize,
        startsAt: start,
        endsAt: new Date(start.getTime() + durationMinutes * 60_000),
        status: 'BOOKED',
        notes: input.notes?.trim() || null,
      })
      .returning({ code: reservations.code })
    return { code: row!.code, startsAt: start, table: table.label }
  })
}

export async function customerReservations(exec: Executor, customerId: number) {
  return exec
    .select({
      code: reservations.code,
      partySize: reservations.partySize,
      startsAt: reservations.startsAt,
      status: reservations.status,
    })
    .from(reservations)
    .where(eq(reservations.customerId, customerId))
    .orderBy(desc(reservations.startsAt))
    .limit(20)
}

export async function cancelReservation(db: Db, customerId: number, code: string, now = new Date()) {
  const [row] = await db
    .update(reservations)
    .set({ status: 'CANCELLED' })
    .where(
      and(
        eq(reservations.code, code),
        eq(reservations.customerId, customerId),
        eq(reservations.status, 'BOOKED'),
        gte(reservations.startsAt, now),
      ),
    )
    .returning({ code: reservations.code })
  if (!row) throw new AppError('CANNOT_CANCEL', 'This booking can no longer be cancelled.')
}

/** Staff: the day's bookings with table and guest. */
export async function bookingsForDay(exec: Executor, date: string) {
  const from = localInstant(date, '00:00')
  const to = localInstant(addDays(date, 1), '00:00')
  return exec
    .select({
      id: reservations.id,
      code: reservations.code,
      partySize: reservations.partySize,
      startsAt: reservations.startsAt,
      status: reservations.status,
      notes: reservations.notes,
      table: diningTables.label,
      guestName: customers.name,
      guestPhone: customers.phone,
    })
    .from(reservations)
    .innerJoin(diningTables, eq(diningTables.id, reservations.tableId))
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .where(and(gte(reservations.startsAt, from), lt(reservations.startsAt, to)))
    .orderBy(asc(reservations.startsAt), asc(diningTables.label))
}

const STAFF_MOVES: Record<string, string[]> = {
  BOOKED: ['SEATED', 'NO_SHOW', 'CANCELLED'],
  SEATED: ['COMPLETED'],
}

export async function setReservationStatus(
  db: Db,
  id: number,
  to: 'SEATED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED',
) {
  const allowedFrom = Object.entries(STAFF_MOVES)
    .filter(([, targets]) => targets.includes(to))
    .map(([from]) => from) as ('BOOKED' | 'SEATED')[]
  const [row] = await db
    .update(reservations)
    .set({ status: to })
    .where(and(eq(reservations.id, id), inArray(reservations.status, allowedFrom)))
    .returning({ id: reservations.id })
  if (!row) throw new AppError('INVALID_TRANSITION', 'This booking has already changed. Refresh the page.')
}
