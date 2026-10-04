'use server'

import { and, count, eq, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/client'
import { addresses, couponRedemptions, coupons, customers, orders } from '@/db/schema'
import { CouponError, normaliseCouponCode } from '@/domain/coupons'
import { CartError, quote, type Quote } from '@/domain/pricing'
import { asapSlot, orderSlots } from '@/domain/slots'
import { getCustomer } from '@/server/auth/current'
import { env } from '@/server/env'
import { type ActionResult, AppError, toResult } from '@/server/errors'
import { loadMenu, menuById } from '@/server/menu'
import { markPaid, placeOrder, slotCounts } from '@/server/orders'
import { isValidCheckoutSignature } from '@/server/payments/razorpay'
import { deps } from '@/server/runtime'

const cartLine = z.object({
  itemId: z.number().int().positive(),
  variantId: z.number().int().positive().nullish(),
  addonIds: z.array(z.number().int().positive()).max(20).optional(),
  quantity: z.number().int().min(1).max(20),
})

const quoteSchema = z.object({
  lines: z.array(cartLine).max(30),
  fulfilment: z.enum(['DELIVERY', 'PICKUP']),
  pincode: z
    .string()
    .regex(/^\d{6}$/)
    .nullish(),
  couponCode: z.string().max(30).nullish(),
})

export type QuoteResult = {
  quote: Quote | null
  /** Why the cart cannot be ordered as it is, in words for the customer. */
  problem: string | null
  couponMessage: string | null
}

/** Prices the cart for display. The same rules run again, under locks, when the order is placed. */
export async function quoteAction(input: z.input<typeof quoteSchema>): Promise<QuoteResult> {
  const parsed = quoteSchema.safeParse(input)
  if (!parsed.success)
    return { quote: null, problem: 'Your cart could not be read. Please refresh.', couponMessage: null }
  const { lines, fulfilment, pincode, couponCode } = parsed.data
  const menu = menuById(await loadMenu(db()))
  const customer = await getCustomer()

  let coupon = null
  let couponContext: { now: Date; isFirstOrder: boolean; customerUses: number } | undefined
  let couponMessage: string | null = null
  if (couponCode?.trim()) {
    const code = normaliseCouponCode(couponCode)
    ;[coupon] = await db().select().from(coupons).where(eq(coupons.code, code))
    if (!coupon) couponMessage = `${code} is not a valid code.`
    else if (customer) {
      const [[uses], [previous]] = await Promise.all([
        db()
          .select({ n: count() })
          .from(couponRedemptions)
          .where(and(eq(couponRedemptions.couponCode, code), eq(couponRedemptions.customerId, customer.id))),
        db()
          .select({ n: count() })
          .from(orders)
          .where(
            and(
              eq(orders.customerId, customer.id),
              notInArray(orders.status, ['CANCELLED', 'REJECTED', 'EXPIRED']),
            ),
          ),
      ])
      couponContext = { now: new Date(), isFirstOrder: (previous?.n ?? 0) === 0, customerUses: uses?.n ?? 0 }
    } else {
      // Not signed in yet: assume a first order; it is checked properly at checkout.
      couponContext = { now: new Date(), isFirstOrder: true, customerUses: 0 }
    }
  }

  const attempt = (withCoupon: boolean) =>
    quote({ lines, menu, fulfilment, pincode, coupon: withCoupon ? coupon : null, couponContext })

  try {
    return { quote: attempt(true), problem: null, couponMessage }
  } catch (error) {
    if (error instanceof CouponError) {
      // Show the bill without the coupon, and say why it did not apply.
      try {
        return { quote: attempt(false), problem: null, couponMessage: error.message }
      } catch (inner) {
        if (inner instanceof CartError)
          return { quote: null, problem: inner.message, couponMessage: error.message }
        throw inner
      }
    }
    if (error instanceof CartError) return { quote: null, problem: error.message, couponMessage }
    throw error
  }
}

export type SlotOption = { value: string; date: string; startsAt: string; full: boolean }

/** "As soon as possible" plus every schedulable slot over the next days. */
export async function slotsAction(): Promise<{ asap: string | null; slots: SlotOption[] }> {
  const now = new Date()
  const counts = await slotCounts(db(), now)
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

const addressSchema = z.object({
  label: z.string().trim().min(1).max(30).default('Home'),
  line1: z.string().trim().min(3, 'Enter house or flat and street').max(120),
  line2: z.string().trim().max(120).nullish(),
  landmark: z.string().trim().max(80).nullish(),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter a 6-digit pincode'),
})

const placeSchema = z.object({
  lines: z.array(cartLine).min(1).max(30),
  name: z.string().trim().min(2, 'Enter your name').max(60),
  fulfilment: z.enum(['DELIVERY', 'PICKUP']),
  addressId: z.number().int().positive().nullish(),
  newAddress: addressSchema.nullish(),
  saveAddress: z.boolean().optional(),
  slot: z.string().max(40),
  paymentMethod: z.enum(['ONLINE', 'ON_DELIVERY']),
  couponCode: z.string().max(30).nullish(),
  notes: z.string().max(300).nullish(),
})

export type PlaceOrderResult = {
  code: string
  payment: { keyId: string; providerOrderId: string; amountPaise: number } | null
  prefill: { name: string; contact: string }
}

export async function placeOrderAction(
  input: z.input<typeof placeSchema>,
): Promise<ActionResult<PlaceOrderResult>> {
  return toResult(async () => {
    const customer = await getCustomer()
    if (!customer) throw new AppError('SIGNED_OUT', 'Please verify your phone number to place the order.')
    const parsed = placeSchema.safeParse(input)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!
      throw new AppError('INVALID', issue.message, String(issue.path.at(-1) ?? ''))
    }
    const order = parsed.data

    let address = null
    if (order.fulfilment === 'DELIVERY') {
      if (order.addressId) {
        const [saved] = await db()
          .select()
          .from(addresses)
          .where(and(eq(addresses.id, order.addressId), eq(addresses.customerId, customer.id)))
        if (!saved) throw new AppError('ADDRESS_NOT_FOUND', 'Choose a delivery address.', 'address')
        address = {
          label: saved.label,
          line1: saved.line1,
          line2: saved.line2,
          landmark: saved.landmark,
          pincode: saved.pincode,
        }
      } else if (order.newAddress) {
        address = {
          ...order.newAddress,
          line2: order.newAddress.line2 ?? null,
          landmark: order.newAddress.landmark ?? null,
        }
      } else {
        throw new AppError('ADDRESS_REQUIRED', 'Add a delivery address.', 'address')
      }
    }

    if (order.name !== customer.name) {
      await db().update(customers).set({ name: order.name }).where(eq(customers.id, customer.id))
    }

    const placed = await placeOrder(deps(), {
      customerId: customer.id,
      customerName: order.name,
      customerPhone: customer.phone,
      lines: order.lines,
      fulfilment: order.fulfilment,
      address,
      slot: order.slot,
      paymentMethod: order.paymentMethod,
      couponCode: order.couponCode,
      notes: order.notes,
    })

    // Saved after the order succeeds, so a failed order does not leave a stray address behind.
    if (address && order.newAddress && order.saveAddress) {
      await db()
        .insert(addresses)
        .values({ customerId: customer.id, ...address })
    }

    return {
      code: placed.code,
      payment: placed.payment,
      prefill: { name: order.name, contact: customer.phone },
    }
  })
}

const paymentSchema = z.object({
  razorpay_order_id: z.string().min(1).max(64),
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_signature: z.string().min(1).max(128),
})

/** Called by the page when Razorpay Checkout reports success. The signature proves it. */
export async function confirmPaymentAction(
  input: z.input<typeof paymentSchema>,
): Promise<ActionResult<{ code: string }>> {
  return toResult(async () => {
    const p = paymentSchema.parse(input)
    const secret = env().RAZORPAY_KEY_SECRET
    if (
      !secret ||
      !isValidCheckoutSignature(secret, p.razorpay_order_id, p.razorpay_payment_id, p.razorpay_signature)
    ) {
      throw new AppError(
        'BAD_SIGNATURE',
        'We could not confirm that payment. If money left your account, it will be refunded.',
      )
    }
    const { code } = await markPaid(deps(), p.razorpay_order_id, p.razorpay_payment_id)
    return { code }
  })
}
