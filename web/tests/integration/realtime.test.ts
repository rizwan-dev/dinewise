import { describe, expect, it } from 'vitest'
import { move, placeOrder } from '../../src/server/orders'
import { type OrderChange, subscribeToOrders } from '../../src/server/realtime'
import { customer, NOW, pickupOrder } from './helpers'
import { db } from './setup'

function collect() {
  const seen: OrderChange[] = []
  const waitFor = (n: number) =>
    new Promise<void>((resolve, reject) => {
      const started = Date.now()
      const check = () =>
        seen.length >= n
          ? resolve()
          : Date.now() - started > 5_000
            ? reject(new Error(`saw ${seen.length}`))
            : setTimeout(check, 20)
      check()
    })
  return { seen, waitFor }
}

describe('live order updates', () => {
  it('announces new orders and each status change, from the database itself', async () => {
    const { seen, waitFor } = collect()
    const stop = await subscribeToOrders((c) => seen.push(c))
    try {
      const priya = await customer()
      const { id, code } = await placeOrder({ db, gateway: null, now: NOW }, await pickupOrder(priya))
      await move(db, { orderId: id, to: 'PREPARING', actor: 'KITCHEN' })
      await waitFor(2)
      expect(seen).toEqual([
        { id, code, status: 'PLACED', paymentStatus: 'NOT_REQUIRED' },
        { id, code, status: 'PREPARING', paymentStatus: 'NOT_REQUIRED' },
      ])
    } finally {
      stop()
    }
  })

  it('stays silent about a change that was rolled back', async () => {
    const { seen } = collect()
    const stop = await subscribeToOrders((c) => seen.push(c))
    try {
      const priya = await customer()
      await db
        .transaction(async (tx) => {
          await placeOrder({ db: tx as never, gateway: null, now: NOW }, await pickupOrder(priya))
          throw new Error('rollback')
        })
        .catch(() => {})
      await new Promise((r) => setTimeout(r, 300))
      expect(seen).toEqual([])
    } finally {
      stop()
    }
  })
})
