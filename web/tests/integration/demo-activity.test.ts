import { count, inArray, notInArray, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { RESTAURANT } from '../../src/config/restaurant'
import { orders, reservations } from '../../src/db/schema'
import { localDate } from '../../src/domain/time'
import { seedDemoActivity, topUpDemoKitchen } from '../../src/server/demo-activity'
import { NOW } from './helpers'
import { db } from './setup'

/** NOW is 18:00 on a Monday: open, with the evening still ahead. */
describe('the demo restaurant day', () => {
  it('fills a week of service, bookings and every column of the kitchen screen', async () => {
    const result = await seedDemoActivity(db, NOW)
    expect(result.orders).toBeGreaterThan(40)
    expect(result.bookings).toBeGreaterThan(0)

    const finished = await db
      .select({ day: sql<string>`(${orders.createdAt} at time zone 'Asia/Kolkata')::date::text` })
      .from(orders)
      .where(inArray(orders.status, ['DELIVERED', 'COLLECTED']))
    expect(new Set(finished.map((f) => f.day)).size).toBeGreaterThanOrEqual(6)

    const live = new Map(
      (
        await db
          .select({ status: orders.status, n: count() })
          .from(orders)
          .where(inArray(orders.status, ['PLACED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']))
          .groupBy(orders.status)
      ).map((r) => [r.status, r.n]),
    )
    expect(live.get('PLACED')).toBeGreaterThanOrEqual(2)
    expect(live.get('PREPARING')).toBeGreaterThanOrEqual(2)
    expect(live.get('READY')).toBeGreaterThanOrEqual(1)
    expect(live.get('OUT_FOR_DELIVERY')).toBeGreaterThanOrEqual(1)

    const [booked] = await db.select({ n: count() }).from(reservations)
    expect(booked!.n).toBe(result.bookings)
  })

  it('goes through the real rules: no kitchen slot is ever over capacity', async () => {
    await seedDemoActivity(db, NOW)
    const busiest = await db
      .select({ n: count() })
      .from(orders)
      .where(notInArray(orders.status, ['CANCELLED', 'REJECTED', 'EXPIRED']))
      .groupBy(orders.slotStart)
    expect(Math.max(...busiest.map((b) => b.n))).toBeLessThanOrEqual(RESTAURANT.ordering.ordersPerSlot)
  })

  it('runs once: a second call, or a second instance, adds nothing', async () => {
    const first = await seedDemoActivity(db, NOW)
    const [again, alongside] = await Promise.all([seedDemoActivity(db, NOW), seedDemoActivity(db, NOW)])
    expect(first.orders).toBeGreaterThan(0)
    expect(again.orders + alongside.orders).toBe(0)
  })

  it('keeps the kitchen busy while open, and leaves it alone when closed', async () => {
    expect(await topUpDemoKitchen(db, NOW, { force: true })).toBeGreaterThan(0)
    expect(await topUpDemoKitchen(db, NOW, { force: true })).toBe(0)

    const lateNight = new Date(`${localDate(NOW)}T21:00:00Z`) // 02:30 the next morning in Pune
    expect(await topUpDemoKitchen(db, lateNight, { force: true })).toBe(0)
  })
})
