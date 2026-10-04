import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { orderEvents, payments } from '../../src/db/schema'
import {
  expireUnpaid,
  markPaid,
  markRefunded,
  move,
  orderDetails,
  placeOrder,
  slotCounts,
} from '../../src/server/orders'
import { customer, FakeGateway, NOW, pickupOrder, settle } from './helpers'
import { db } from './setup'

async function onlineOrder(gateway: FakeGateway) {
  const priya = await customer()
  return placeOrder({ db, gateway, now: NOW }, await pickupOrder(priya, { paymentMethod: 'ONLINE' }))
}

describe('online payment', () => {
  it('asks Razorpay for exactly the server-calculated total, and holds the order until paid', async () => {
    const gateway = new FakeGateway()
    const placed = await onlineOrder(gateway)

    expect(gateway.orders).toEqual([{ amountPaise: 609_00, receipt: placed.code }])
    expect(placed.payment).toMatchObject({ keyId: 'rzp_test_fake', amountPaise: 609_00 })
    expect(await orderDetails(db, { id: placed.id })).toMatchObject({
      status: 'AWAITING_PAYMENT',
      paymentStatus: 'PENDING',
    })
  })

  it('applies a payment once when the callback and the webhook arrive together', async () => {
    const gateway = new FakeGateway()
    const placed = await onlineOrder(gateway)
    const providerOrderId = placed.payment!.providerOrderId

    const { ok } = await settle(
      Array.from({ length: 4 }, () => markPaid({ db, gateway, now: NOW }, providerOrderId, 'pay_123')),
    )
    expect(ok.filter((r) => !r.alreadyApplied)).toHaveLength(1)

    const order = await orderDetails(db, { id: placed.id })
    expect(order).toMatchObject({ status: 'PLACED', paymentStatus: 'PAID' })
    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, placed.id))
    expect(events.map((e) => e.note)).toEqual([null, 'Paid online'])
  })

  it('releases the kitchen slot when payment is abandoned', async () => {
    const gateway = new FakeGateway()
    const placed = await onlineOrder(gateway)
    const slot = (await orderDetails(db, { id: placed.id }))!.slotStart

    expect((await slotCounts(db, NOW, slot)).get(slot.getTime())).toBe(1)
    const later = new Date(NOW.getTime() + 21 * 60_000)
    expect(await expireUnpaid(db, later)).toBe(1)
    expect((await slotCounts(db, later, slot)).get(slot.getTime())).toBeUndefined()
  })

  it('refunds a payment that lands after the order expired, instead of keeping the money', async () => {
    const gateway = new FakeGateway()
    const placed = await onlineOrder(gateway)
    await expireUnpaid(db, new Date(NOW.getTime() + 21 * 60_000))

    await markPaid({ db, gateway, now: NOW }, placed.payment!.providerOrderId, 'pay_late')

    expect(await orderDetails(db, { id: placed.id })).toMatchObject({
      status: 'EXPIRED',
      paymentStatus: 'REFUND_PENDING',
    })
    expect(gateway.refunds).toEqual([{ paymentId: 'pay_late', amountPaise: 609_00 }])

    await markRefunded(db, 'pay_late')
    expect((await orderDetails(db, { id: placed.id }))!.paymentStatus).toBe('REFUNDED')
  })

  it('refunds a paid order the kitchen has to reject', async () => {
    const gateway = new FakeGateway()
    const placed = await onlineOrder(gateway)
    await markPaid({ db, gateway, now: NOW }, placed.payment!.providerOrderId, 'pay_ok')

    await move(
      db,
      { orderId: placed.id, to: 'REJECTED', actor: 'KITCHEN', note: 'Gas supply problem' },
      gateway,
    )

    expect(gateway.refunds).toEqual([{ paymentId: 'pay_ok', amountPaise: 609_00 }])
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, placed.id))
    expect(payment).toMatchObject({ status: 'REFUND_PENDING', refundId: 'rfnd_1' })
  })

  it('gives the slot back and says so when the gateway cannot be reached', async () => {
    const gateway = new FakeGateway()
    gateway.failCreate = true
    await expect(onlineOrder(gateway)).rejects.toMatchObject({ code: 'PAYMENT_UNAVAILABLE' })
    expect((await slotCounts(db, NOW)).size).toBe(0)
  })
})
