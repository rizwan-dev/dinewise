import 'server-only'
import { and, count, eq, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import type { Executor } from '@/db/client'
import { couponRedemptions, coupons, orders } from '@/db/schema'
import { CouponError, normaliseCouponCode } from '@/domain/coupons'
import { CartError, quote, type Quote } from '@/domain/pricing'
import { asapSlot, orderSlots } from '@/domain/slots'
import { loadMenu, menuById } from './menu'
import { slotCounts } from './orders'

/**
 * Pricing a cart for display, and the times an order can be ready. The web cart and checkout,
 * and the mobile API, all call these, so they always show the same bill. The same rules run
 * again, under locks, when the order is placed.
 */

export const cartLineSchema = z.object({
  itemId: z.number().int().positive(),
  variantId: z.number().int().positive().nullish(),
  addonIds: z.array(z.number().int().positive()).max(20).optional(),
  quantity: z.number().int().min(1).max(20),
})

export const quoteSchema = z.object({
  lines: z.array(cartLineSchema).max(30),
  fulfilment: z.enum(['DELIVERY', 'PICKUP']),
  pincode: z
    .string()
    .regex(/^\d{6}$/)
    .nullish(),
  couponCode: z.string().max(30).nullish(),
})

export type QuoteInput = z.output<typeof quoteSchema>

export type QuoteResult = {
  quote: Quote | null
  /** Why the cart cannot be ordered as it is, in words for the customer. */
  problem: string | null
  problemCode: string | null
  couponMessage: string | null
  couponProblemCode: string | null
}

/**
 * Prices a cart. A coupon that does not apply is reported, and the bill is shown without it.
 * `customerId` is null before sign-in: the coupon is then checked as if for a first order, and
 * checked properly at checkout.
 */
export async function quoteCart(
  exec: Executor,
  input: QuoteInput,
  customerId: number | null,
  now = new Date(),
): Promise<QuoteResult> {
  const { lines, fulfilment, pincode, couponCode } = input
  const menu = menuById(await loadMenu(exec))

  let coupon = null
  let couponContext: { now: Date; isFirstOrder: boolean; customerUses: number } | undefined
  let couponMessage: string | null = null
  let couponProblemCode: string | null = null
  if (couponCode?.trim()) {
    const code = normaliseCouponCode(couponCode)
    ;[coupon] = await exec.select().from(coupons).where(eq(coupons.code, code))
    if (!coupon) {
      couponMessage = `${code} is not a valid code.`
      couponProblemCode = 'COUPON_NOT_FOUND'
    } else if (customerId !== null) {
      const [[uses], [previous]] = await Promise.all([
        exec
          .select({ n: count() })
          .from(couponRedemptions)
          .where(and(eq(couponRedemptions.couponCode, code), eq(couponRedemptions.customerId, customerId))),
        exec
          .select({ n: count() })
          .from(orders)
          .where(
            and(
              eq(orders.customerId, customerId),
              notInArray(orders.status, ['CANCELLED', 'REJECTED', 'EXPIRED']),
            ),
          ),
      ])
      couponContext = { now, isFirstOrder: (previous?.n ?? 0) === 0, customerUses: uses?.n ?? 0 }
    } else {
      couponContext = { now, isFirstOrder: true, customerUses: 0 }
    }
  }

  const attempt = (withCoupon: boolean) =>
    quote({ lines, menu, fulfilment, pincode, coupon: withCoupon ? coupon : null, couponContext })
  const result = (
    q: Quote | null,
    problem: CartError | null,
    couponError: { code: string | null; message: string | null },
  ): QuoteResult => ({
    quote: q,
    problem: problem?.message ?? null,
    problemCode: problem?.code ?? null,
    couponMessage: couponError.message,
    couponProblemCode: couponError.code,
  })

  const unmatched = { code: couponProblemCode, message: couponMessage }
  try {
    return result(attempt(true), null, unmatched)
  } catch (error) {
    if (error instanceof CouponError) {
      const couponError = { code: error.code, message: error.message }
      try {
        return result(attempt(false), null, couponError)
      } catch (inner) {
        if (inner instanceof CartError) return result(null, inner, couponError)
        throw inner
      }
    }
    if (error instanceof CartError) return result(null, error, unmatched)
    throw error
  }
}

export type SlotOption = { value: string; date: string; startsAt: string; full: boolean }

/** "As soon as possible" plus every schedulable slot over the next days. */
export async function availableSlots(
  exec: Executor,
  now = new Date(),
): Promise<{ asap: string | null; slots: SlotOption[] }> {
  const counts = await slotCounts(exec, now)
  const asap = asapSlot(now, counts)
  return {
    asap: asap ? asap.start.toISOString() : null,
    slots: orderSlots(now, counts).map((s) => ({
      value: s.start.toISOString(),
      date: s.date,
      startsAt: s.start.toISOString(),
      full: s.full,
    })),
  }
}
