import 'server-only'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { addresses, customers } from '@/db/schema'
import { AppError } from './errors'
import { type PlacedOrder, placeOrder } from './orders'
import type { PaymentGateway } from './payments/razorpay'
import { cartLineSchema } from './quote'

/**
 * Checkout for a signed-in customer: the delivery address, their name, then the order itself.
 * The web checkout and the mobile API both come through here.
 */

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

export const checkoutSchema = z.object({
  lines: z.array(cartLineSchema).min(1).max(30),
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

export type CheckoutInput = z.output<typeof checkoutSchema>

/** Validates checkout input, turning the first problem into an {@link AppError} for its field. */
export function parseCheckout(input: unknown): CheckoutInput {
  const parsed = checkoutSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    throw new AppError('INVALID', issue.message, String(issue.path.at(-1) ?? ''))
  }
  return parsed.data
}

export async function checkout(
  deps: { db: Db; gateway: PaymentGateway | null; now?: Date },
  customer: { id: number; phone: string; name: string | null },
  order: CheckoutInput,
): Promise<PlacedOrder> {
  const { db } = deps
  let address = null
  if (order.fulfilment === 'DELIVERY') {
    if (order.addressId) {
      const [saved] = await db
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
    await db.update(customers).set({ name: order.name }).where(eq(customers.id, customer.id))
  }

  const placed = await placeOrder(deps, {
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
    await db.insert(addresses).values({ customerId: customer.id, ...address })
  }
  return placed
}
