import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { orders } from '@/db/schema'
import { requireCustomerToken, route } from '@/server/api/http'
import { AppError } from '@/server/errors'
import { orderEventStream } from '@/server/sse'

export const dynamic = 'force-dynamic'
/** Seconds; above the stream's own lifetime (STREAM_LIFETIME_MS), so the stream ends first. */
export const maxDuration = 300

/** Live status changes for one of the customer's own orders, as Server-Sent Events. */
export const GET = route(async (request: Request, ctx: RouteContext<'/api/v1/orders/[code]/events'>) => {
  const customer = await requireCustomerToken(request)
  const { code } = await ctx.params
  const [order] = /^TL-[0-9A-Z]{6}$/.test(code)
    ? await db()
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.code, code), eq(orders.customerId, customer.id)))
    : []
  if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found.')
  return orderEventStream(request, (change) => change.code === code)
})
