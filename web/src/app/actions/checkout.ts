'use server'

import { z } from 'zod'
import { db } from '@/db/client'
import { getCustomer } from '@/server/auth/current'
import { checkout, type checkoutSchema, parseCheckout } from '@/server/checkout'
import { env } from '@/server/env'
import { type ActionResult, AppError, toResult } from '@/server/errors'
import { housekeepIfDue } from '@/server/housekeeping'
import { markPaid } from '@/server/orders'
import { isValidCheckoutSignature } from '@/server/payments/razorpay'
import { availableSlots, type QuoteResult, quoteCart, quoteSchema } from '@/server/quote'
import { deps } from '@/server/runtime'

export type { QuoteResult, SlotOption } from '@/server/quote'

/** Prices the cart for display. The same rules run again, under locks, when the order is placed. */
export async function quoteAction(input: z.input<typeof quoteSchema>): Promise<QuoteResult> {
  const parsed = quoteSchema.safeParse(input)
  if (!parsed.success)
    return {
      quote: null,
      problem: 'Your cart could not be read. Please refresh.',
      problemCode: 'INVALID',
      couponMessage: null,
      couponProblemCode: null,
    }
  const customer = await getCustomer()
  return quoteCart(db(), parsed.data, customer?.id ?? null)
}

/** "As soon as possible" plus every schedulable slot over the next days. */
export async function slotsAction() {
  await housekeepIfDue()
  return availableSlots(db())
}

export type PlaceOrderResult = {
  code: string
  payment: { keyId: string; providerOrderId: string; amountPaise: number } | null
  prefill: { name: string; contact: string }
}

export async function placeOrderAction(
  input: z.input<typeof checkoutSchema>,
): Promise<ActionResult<PlaceOrderResult>> {
  return toResult(async () => {
    const customer = await getCustomer()
    if (!customer) throw new AppError('SIGNED_OUT', 'Please verify your phone number to place the order.')
    const order = parseCheckout(input)
    const placed = await checkout(deps(), customer, order)
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
