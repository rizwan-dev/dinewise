import { describe, expect, it } from 'vitest'
import { reservations } from '../../src/db/schema'
import { localInstant } from '../../src/domain/time'
import { availableTimes, book, cancelReservation } from '../../src/server/reservations'
import { constraintViolated, customer, NOW, settle } from './helpers'
import { db } from './setup'

const EIGHT_PM = localInstant('2026-10-05', '20:00')

describe('table reservations', () => {
  it('books the smallest table that fits', async () => {
    const priya = await customer()
    const booking = await book(
      db,
      { customerId: priya.id, startsAt: EIGHT_PM.toISOString(), partySize: 2 },
      NOW,
    )
    expect(booking).toMatchObject({ table: 'T1' })
    expect(booking.code).toMatch(/^TB-/)
  })

  it('never seats two parties at one table, even when they book the same moment', async () => {
    // Seven tables. Twelve parties of four want 8pm: only the five tables seating 4+ can take them.
    const people = await Promise.all(
      Array.from({ length: 12 }, (_, i) => customer(`+9198220130${String(i).padStart(2, '0')}`)),
    )
    const { ok, failed } = await settle(
      people.map((p) => book(db, { customerId: p.id, startsAt: EIGHT_PM.toISOString(), partySize: 4 }, NOW)),
    )
    expect(ok.map((b) => b.table).sort()).toEqual(['T3', 'T4', 'T5', 'T6', 'T7'])
    expect(failed.every((f) => f.code === 'TIME_UNAVAILABLE')).toBe(true)

    const times = await availableTimes(db, '2026-10-05', 4, NOW)
    expect(times.find((t) => t.start.getTime() === EIGHT_PM.getTime())?.available).toBe(false)
  })

  it('is backed by the database, which refuses an overlapping booking written directly', async () => {
    const priya = await customer()
    await book(db, { customerId: priya.id, startsAt: EIGHT_PM.toISOString(), partySize: 2 }, NOW)
    const violated = await constraintViolated(
      db.insert(reservations).values({
        code: 'TB-MANUAL',
        customerId: priya.id,
        tableId: 1,
        partySize: 2,
        startsAt: localInstant('2026-10-05', '20:45'),
        endsAt: localInstant('2026-10-05', '22:15'),
        status: 'BOOKED',
      }),
    )
    expect(violated).toBe('reservations_no_overlap')
  })

  it('offers only future times within the booking window, for parties it can seat', async () => {
    const priya = await customer()
    await expect(
      book(
        db,
        { customerId: priya.id, startsAt: localInstant('2026-10-05', '17:00').toISOString(), partySize: 2 },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'TIME_UNAVAILABLE' })
    await expect(
      book(db, { customerId: priya.id, startsAt: EIGHT_PM.toISOString(), partySize: 12 }, NOW),
    ).rejects.toMatchObject({ code: 'PARTY_SIZE' })
    expect(await availableTimes(db, '2026-11-30', 2, NOW)).toEqual([])
  })

  it('frees the table when a guest cancels', async () => {
    const people = await Promise.all([customer('+919822014000'), customer('+919822014001')])
    const first = await book(
      db,
      { customerId: people[0]!.id, startsAt: EIGHT_PM.toISOString(), partySize: 8 },
      NOW,
    )
    await expect(
      book(db, { customerId: people[1]!.id, startsAt: EIGHT_PM.toISOString(), partySize: 8 }, NOW),
    ).rejects.toMatchObject({ code: 'TIME_UNAVAILABLE' })

    await cancelReservation(db, people[0]!.id, first.code, NOW)
    await expect(
      book(db, { customerId: people[1]!.id, startsAt: EIGHT_PM.toISOString(), partySize: 8 }, NOW),
    ).resolves.toMatchObject({ table: 'T7' })
  })
})
