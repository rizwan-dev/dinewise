import { and, count, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { RESTAURANT } from '../../src/config/restaurant'
import { orders, reservations } from '../../src/db/schema'
import { asapSlot, isOpenNow } from '../../src/domain/slots'
import { localInstant } from '../../src/domain/time'
import { seedDemoActivity, topUpDemoKitchen } from '../../src/server/demo-activity'
import { kitchenTickets } from '../../src/server/kitchen'
import { kitchenBoard, placeOrder, slotCounts } from '../../src/server/orders'
import { configure } from './api-client'
import { customer, NOW, pickupOrder } from './helpers'
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
    expect(live.get('PLACED')).toBeGreaterThanOrEqual(1)
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
      .where(and(notInArray(orders.status, ['CANCELLED', 'REJECTED', 'EXPIRED']), eq(orders.demo, false)))
      .groupBy(orders.slotStart)
    expect(Math.max(...busiest.map((b) => b.n))).toBeLessThanOrEqual(RESTAURANT.ordering.ordersPerSlot)
  })

  it('runs once: a second call, or a second instance, adds nothing', async () => {
    const first = await seedDemoActivity(db, NOW)
    const [again, alongside] = await Promise.all([seedDemoActivity(db, NOW), seedDemoActivity(db, NOW)])
    expect(first.orders).toBeGreaterThan(0)
    expect(again.orders + alongside.orders).toBe(0)
  })

  it('keeps the kitchen busy, and adds nothing when it is already up to date', async () => {
    expect(await topUpDemoKitchen(db, NOW, { force: true })).toBeGreaterThan(0)
    expect(await topUpDemoKitchen(db, NOW, { force: true })).toBe(0)
  })
})

/** 02:30 and 03:10 on Tuesday morning in Pune: long after closing, hours before opening. */
const LATE_NIGHT = localInstant('2026-10-06', '02:30')
const SMALL_HOURS = localInstant('2026-10-06', '03:10')
const COLUMNS = ['PLACED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] as const

describe('the demo kitchen outside opening hours', () => {
  afterEach(() => configure())

  it('has tickets in every column of the board, none of them late or scheduled', async () => {
    configure({ demo: true })
    expect(isOpenNow(SMALL_HOURS)).toBe(false)

    const board = await kitchenTickets(db, SMALL_HOURS)
    for (const status of COLUMNS) {
      expect(board.filter((t) => t.status === status).length, status).toBeGreaterThanOrEqual(1)
    }
    expect(board.every((t) => !t.later)).toBe(true)
    const late = board.filter(
      (t) =>
        Date.parse(t.slotStart) < SMALL_HOURS.getTime() && !['READY', 'OUT_FOR_DELIVERY'].includes(t.status),
    )
    expect(late).toEqual([])
  })

  it('stays empty on a real installation', async () => {
    configure({ demo: false })
    expect(await kitchenTickets(db, SMALL_HOURS)).toEqual([])
    const [{ n } = { n: -1 }] = await db.select({ n: count() }).from(orders)
    expect(n).toBe(0)
  })

  it('moves its tickets on by the clock, so the board never piles up', async () => {
    await topUpDemoKitchen(db, LATE_NIGHT, { force: true })
    const [first] = await db.select().from(orders).where(eq(orders.status, 'PLACED')).limit(1)

    const muchLater = new Date(LATE_NIGHT.getTime() + 3 * 60 * 60_000)
    await topUpDemoKitchen(db, muchLater, { force: true })
    const [moved] = await db.select().from(orders).where(eq(orders.id, first!.id))
    expect(['DELIVERED', 'COLLECTED']).toContain(moved!.status)

    const [{ n } = { n: 0 }] = await db
      .select({ n: count() })
      .from(orders)
      .where(inArray(orders.status, [...COLUMNS]))
    expect(n).toBeLessThanOrEqual(15)
  })
})

describe("a visitor's own order with the demo kitchen busy", () => {
  it('is still scheduled for opening time when the restaurant is closed', async () => {
    await topUpDemoKitchen(db, LATE_NIGHT, { force: true })
    expect(await slotCounts(db, LATE_NIGHT)).toEqual(new Map())

    const visitor = await customer()
    const placed = await placeOrder({ db, gateway: null, now: LATE_NIGHT }, await pickupOrder(visitor))
    const [order] = await db.select().from(orders).where(eq(orders.id, placed.id))
    expect(order!.demo).toBe(false)
    expect(order!.slotStart).toEqual(localInstant('2026-10-06', '12:00'))
    expect(order!.slotStart).toEqual(asapSlot(LATE_NIGHT, new Map())!.start)

    const board = await kitchenBoard(db, LATE_NIGHT)
    expect(board.find((o) => o.id === placed.id)!.later).toBe(true)
  })

  it('gets the slot it would get on an empty board while open, and can fill it', async () => {
    await topUpDemoKitchen(db, NOW, { force: true })
    expect(await slotCounts(db, NOW)).toEqual(new Map())

    const first = asapSlot(NOW, new Map())!.start
    for (let i = 0; i < RESTAURANT.ordering.ordersPerSlot; i++) {
      const visitor = await customer(`+91982201${String(1100 + i)}`)
      const placed = await placeOrder({ db, gateway: null, now: NOW }, await pickupOrder(visitor))
      const [order] = await db.select().from(orders).where(eq(orders.id, placed.id))
      expect(order!.slotStart).toEqual(first)
    }
  })
})
