import { db } from '@/db/client'
import { json, requireCustomerToken, route } from '@/server/api/http'
import { orderView } from '@/server/api/views'
import { AppError } from '@/server/errors'
import { housekeepIfDue } from '@/server/housekeeping'
import { orderDetails } from '@/server/orders'

export const dynamic = 'force-dynamic'

/** One of the customer's own orders: status, progress, timeline, items and bill. */
export const GET = route(async (request: Request, ctx: RouteContext<'/api/v1/orders/[code]'>) => {
  const customer = await requireCustomerToken(request)
  const { code } = await ctx.params
  await housekeepIfDue() // so a lapsed online payment shows as lapsed
  const order = /^TL-[0-9A-Z]{6}$/.test(code) ? await orderDetails(db(), { code }) : null
  // Someone else's order is "not found", so codes cannot be probed.
  if (!order || order.customerId !== customer.id) throw new AppError('ORDER_NOT_FOUND', 'Order not found.')
  return json({ order: orderView(order) })
})
