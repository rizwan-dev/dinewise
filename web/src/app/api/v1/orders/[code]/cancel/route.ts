import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { orders } from '@/db/schema'
import { json, requireCustomerToken, route } from '@/server/api/http'
import { orderView } from '@/server/api/views'
import { AppError } from '@/server/errors'
import { move, orderDetails } from '@/server/orders'
import { deps } from '@/server/runtime'

export const dynamic = 'force-dynamic'

/** Cancels the customer's order, allowed until the kitchen starts cooking (status PLACED). */
export const POST = route(async (request: Request, ctx: RouteContext<'/api/v1/orders/[code]/cancel'>) => {
  const customer = await requireCustomerToken(request)
  const { code } = await ctx.params
  const [order] = /^TL-[0-9A-Z]{6}$/.test(code)
    ? await db()
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.code, code), eq(orders.customerId, customer.id)))
    : []
  if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found.')
  const { db: database, gateway } = deps()
  await move(
    database,
    { orderId: order.id, to: 'CANCELLED', actor: 'CUSTOMER', customerId: customer.id },
    gateway,
  )
  return json({ order: orderView((await orderDetails(db(), { id: order.id }))!) })
})
