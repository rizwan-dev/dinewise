import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { orderEvents, orders } from '../../src/db/schema'
import { localInstant } from '../../src/domain/time'
import { kitchenBoard, move, orderDetails, placeOrder, reorderLines } from '../../src/server/orders'
import { constraintViolated, customer, itemId, NOW, pickupOrder, settle } from './helpers'
import { db } from './setup'

const deps = { db, gateway: null, now: NOW }

describe('placing an order', () => {
  it('stores the server-calculated bill and a snapshot of what was ordered', async () => {
    const priya = await customer()
    const placed = await placeOrder(deps, await pickupOrder(priya))

    const order = await orderDetails(db, { code: placed.code })
    expect(order).toMatchObject({
      status: 'PLACED',
      paymentStatus: 'NOT_REQUIRED',
      subtotalPaise: 560_00,
      packagingPaise: 20_00,
      taxPaise: 29_00, // 5% of 580
      totalPaise: 609_00,
      slotStart: localInstant('2026-10-05', '18:30'),
    })
    expect(order!.code).toMatch(/^TL-[2-9A-HJ-NP-Z]{6}$/)
    expect(order!.items).toEqual([
      expect.objectContaining({ name: 'Paneer Tikka', quantity: 2, unitPricePaise: 280_00, lineTotalPaise: 560_00 }),
    ])
    expect(order!.events.map((e) => e.status)).toEqual(['PLACED'])
  })

  it('delivers to a covered pincode with the fee, and refuses others', async () => {
    const priya = await customer()
    const address = { label: 'Home', line1: '12 Baner Road', line2: null, landmark: null, pincode: '411045' }
    const placed = await placeOrder(deps, await pickupOrder(priya, { fulfilment: 'DELIVERY', address }))
    expect((await orderDetails(db, { code: placed.code }))!.deliveryFeePaise).toBe(30_00)

    await expect(
      placeOrder(deps, await pickupOrder(priya, { fulfilment: 'DELIVERY', address: { ...address, pincode: '400001' } })),
    ).rejects.toMatchObject({ code: 'NO_DELIVERY' })
  })

  it('never lets one kitchen slot take more than eight orders, however many arrive at once', async () => {
    const slot = localInstant('2026-10-05', '20:00').toISOString()
    const people = await Promise.all(
      Array.from({ length: 12 }, (_, i) => customer(`+9198220110${String(i).padStart(2, '0')}`, `Guest ${i}`)),
    )
    const { ok, failed } = await settle(people.map(async (p) => placeOrder(deps, await pickupOrder(p, { slot }))))

    expect(ok).toHaveLength(8)
    expect(failed.map((f) => f.code)).toEqual(Array(4).fill('SLOT_FULL'))
  })

  it('moves "as soon as possible" orders on to the next slot when one fills up', async () => {
    const people = await Promise.all(
      Array.from({ length: 10 }, (_, i) => customer(`+9198220120${String(i).padStart(2, '0')}`, `Guest ${i}`)),
    )
    const { ok } = await settle(people.map(async (p) => placeOrder(deps, await pickupOrder(p))))
    expect(ok).toHaveLength(10)

    const bySlot = await db.execute<{ slot: Date; n: string }>(
      sql`select slot_start as slot, count(*) as n from orders group by 1 order by 1`,
    )
    expect(bySlot.rows.map((r) => Number(r.n))).toEqual([8, 2])
  })

  it('redeems a one-per-customer coupon once, even when the button is tapped five times', async () => {
    const priya = await customer()
    const { ok, failed } = await settle(
      Array.from({ length: 5 }, async () => placeOrder(deps, await pickupOrder(priya, { couponCode: 'welcome50' }))),
    )
    expect(ok).toHaveLength(1)
    expect(failed.every((f) => f.code === 'FIRST_ORDER_ONLY' || f.code === 'USED_UP')).toBe(true)
    const [order] = await db.select().from(orders)
    expect(order!.discountPaise).toBe(50_00)
    expect(order!.couponCode).toBe('WELCOME50')
  })

  it('explains an unknown coupon instead of silently ignoring it', async () => {
    const priya = await customer()
    await expect(placeOrder(deps, await pickupOrder(priya, { couponCode: 'FREEFOOD' }))).rejects.toMatchObject({
      code: 'COUPON_NOT_FOUND',
      message: 'FREEFOOD is not a valid code.',
    })
  })

  it('refuses a time that is not offered, such as one in the past', async () => {
    const priya = await customer()
    const past = localInstant('2026-10-05', '17:00').toISOString()
    await expect(placeOrder(deps, await pickupOrder(priya, { slot: past }))).rejects.toMatchObject({
      code: 'SLOT_UNAVAILABLE',
    })
  })
})

describe('the database as the last line of defence', () => {
  it('refuses a bill that does not add up, whoever writes it', async () => {
    const priya = await customer()
    const placed = await placeOrder(deps, await pickupOrder(priya))
    expect(await constraintViolated(db.update(orders).set({ totalPaise: 1 }).where(eq(orders.code, placed.code)))).toBe('orders_total_adds_up')
  })

  it('refuses an online order reaching the kitchen unpaid', async () => {
    const priya = await customer()
    const placed = await placeOrder(deps, await pickupOrder(priya))
    expect(await constraintViolated(db.update(orders).set({ paymentMethod: 'ONLINE', paymentStatus: 'PENDING' }).where(eq(orders.code, placed.code)))).toBe('orders_online_paid_before_kitchen')
  })
})

describe('moving an order along', () => {
  it('follows the kitchen through to collection, recording every step', async () => {
    const priya = await customer()
    const { id } = await placeOrder(deps, await pickupOrder(priya))
    for (const to of ['PREPARING', 'READY', 'COLLECTED'] as const) {
      await move(db, { orderId: id, to, actor: 'KITCHEN', now: NOW })
    }
    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, id))
    expect(events.map((e) => e.status)).toEqual(['PLACED', 'PREPARING', 'READY', 'COLLECTED'])
  })

  it('lets the customer cancel only until the kitchen starts, and only their own order', async () => {
    const priya = await customer()
    const rohan = await customer('+919822011004', 'Rohan')
    const first = await placeOrder(deps, await pickupOrder(priya))
    await expect(
      move(db, { orderId: first.id, to: 'CANCELLED', actor: 'CUSTOMER', customerId: rohan.id }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })

    await move(db, { orderId: first.id, to: 'PREPARING', actor: 'KITCHEN' })
    await expect(
      move(db, { orderId: first.id, to: 'CANCELLED', actor: 'CUSTOMER', customerId: priya.id }),
    ).rejects.toMatchObject({ message: 'The kitchen has started on this order, so it can no longer be cancelled.' })
  })

  it('needs a reason to reject, which the customer then sees', async () => {
    const priya = await customer()
    const { id, code } = await placeOrder(deps, await pickupOrder(priya))
    await expect(move(db, { orderId: id, to: 'REJECTED', actor: 'KITCHEN' })).rejects.toMatchObject({
      code: 'REASON_REQUIRED',
    })
    await move(db, { orderId: id, to: 'REJECTED', actor: 'KITCHEN', note: 'Out of paneer tonight' })
    expect((await orderDetails(db, { code }))!.rejectReason).toBe('Out of paneer tonight')
  })

  it('two staff tapping "Start cooking" at once move the order once', async () => {
    const priya = await customer()
    const { id } = await placeOrder(deps, await pickupOrder(priya))
    const { ok, failed } = await settle(
      [1, 2].map(() => move(db, { orderId: id, to: 'PREPARING', actor: 'KITCHEN' })),
    )
    expect(ok).toHaveLength(1)
    expect(failed[0]!.code).toBe('INVALID_TRANSITION')
  })

  it('shows open orders on the kitchen board, with scheduled ones flagged for later', async () => {
    const priya = await customer()
    await placeOrder(deps, await pickupOrder(priya))
    const later = localInstant('2026-10-05', '21:00').toISOString()
    await placeOrder(deps, await pickupOrder(priya, { slot: later }))

    const board = await kitchenBoard(db, NOW)
    expect(board.map((o) => o.later)).toEqual([false, true])
    expect(board[0]!.items[0]!.name).toBe('Paneer Tikka')
  })
})

describe('reordering', () => {
  it('rebuilds the cart from a past order, skipping what is no longer available', async () => {
    const priya = await customer()
    const naan = await itemId('Butter Naan')
    const { code } = await placeOrder(
      deps,
      await pickupOrder(priya, {
        lines: [
          { itemId: await itemId('Paneer Tikka'), quantity: 1 },
          { itemId: naan, quantity: 3 },
        ],
      }),
    )
    await db.execute(sql`update menu_items set available = false where id = ${naan}`)

    expect(await reorderLines(db, priya.id, code)).toEqual([
      { itemId: await itemId('Paneer Tikka'), variantId: null, addonIds: [], quantity: 1 },
    ])
  })
})
