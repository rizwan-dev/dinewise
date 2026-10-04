import { eq } from 'drizzle-orm'
import { violatedConstraint } from '../../src/db/errors'
import { customers, menuItems } from '../../src/db/schema'
import { localInstant } from '../../src/domain/time'
import type { PaymentGateway } from '../../src/server/payments/razorpay'
import { db } from './setup'

/** Monday 5 October 2026, 18:00 in Pune: the kitchen is open and the evening rush is starting. */
export const NOW = localInstant('2026-10-05', '18:00')

export async function customer(phone = '+919822011002', name = 'Priya Joshi') {
  const [row] = await db.insert(customers).values({ phone, name }).returning()
  return row!
}

export async function itemId(name: string) {
  const [row] = await db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.name, name))
  return row!.id
}

/** A pickup order of two Paneer Tikka for the given customer, ready ASAP, paid on collection. */
export async function pickupOrder(c: { id: number; name: string | null; phone: string }, overrides = {}) {
  return {
    customerId: c.id,
    customerName: c.name ?? 'Guest',
    customerPhone: c.phone,
    lines: [{ itemId: await itemId('Paneer Tikka'), quantity: 2 }],
    fulfilment: 'PICKUP' as const,
    slot: 'ASAP',
    paymentMethod: 'ON_DELIVERY' as const,
    ...overrides,
  }
}

/** Behaves like Razorpay without the network, and records what it was asked to do. */
export class FakeGateway implements PaymentGateway {
  readonly keyId = 'rzp_test_fake'
  orders: { amountPaise: number; receipt: string }[] = []
  refunds: { paymentId: string; amountPaise: number }[] = []
  failCreate = false

  async createOrder(amountPaise: number, receipt: string) {
    if (this.failCreate) throw new Error('gateway down')
    this.orders.push({ amountPaise, receipt })
    return { id: `order_${receipt}_${this.orders.length}` }
  }

  async refund(paymentId: string, amountPaise: number) {
    this.refunds.push({ paymentId, amountPaise })
    return { id: `rfnd_${this.refunds.length}` }
  }
}

export function settle<T>(promises: Promise<T>[]) {
  return Promise.allSettled(promises).then((results) => ({
    ok: results.filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled').map((r) => r.value),
    failed: results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => r.reason as { code?: string; message: string }),
  }))
}

/** Resolves to the constraint a write violated; fails the test if the write succeeded. */
export async function constraintViolated(write: Promise<unknown>): Promise<string | undefined> {
  try {
    await write
  } catch (error) {
    return violatedConstraint(error)
  }
  throw new Error('Expected the database to refuse this write')
}
