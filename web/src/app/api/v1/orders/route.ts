import { z } from 'zod'
import { db } from '@/db/client'
import { json, readBody, requireCustomerToken, route } from '@/server/api/http'
import { orderSummaryView, orderView } from '@/server/api/views'
import { checkout, parseCheckout } from '@/server/checkout'
import { AppError } from '@/server/errors'
import { housekeepIfDue } from '@/server/housekeeping'
import { customerOrders, orderDetails } from '@/server/orders'
import { deps } from '@/server/runtime'

export const dynamic = 'force-dynamic'

/** The signed-in customer's recent orders, newest first (lapsed online payments left out). */
export const GET = route(async (request: Request) => {
  const customer = await requireCustomerToken(request)
  const rows = await customerOrders(db(), customer.id, 50)
  return json({ currency: 'INR', orders: rows.map(orderSummaryView) })
})

/**
 * Places an order through the same checkout as the web: the same validation, slot capacity and
 * coupon rules. The app pays in cash for now (on delivery, or at pickup).
 */
export const POST = route(async (request: Request) => {
  const customer = await requireCustomerToken(request)
  const raw = await readBody(request, z.record(z.string(), z.unknown()))
  const paymentMethod = raw.paymentMethod ?? 'ON_DELIVERY'
  if (paymentMethod === 'ONLINE') {
    throw new AppError(
      'ONLINE_PAYMENT_NOT_SUPPORTED',
      'Online payment is not available in the app yet. Choose cash on delivery or pay at pickup.',
      'paymentMethod',
    )
  }
  const name = raw.name ?? customer.name
  if (!name) throw new AppError('INVALID', 'Enter your name', 'name')
  const order = parseCheckout({ ...raw, paymentMethod, name })
  await housekeepIfDue()
  const placed = await checkout(deps(), customer, order)
  const details = await orderDetails(db(), { id: placed.id })
  return json({ order: orderView(details!) }, 201, { Location: `/api/v1/orders/${placed.code}` })
})
