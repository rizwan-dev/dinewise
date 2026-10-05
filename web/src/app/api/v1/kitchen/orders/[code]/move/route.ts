import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/client'
import { orders } from '@/db/schema'
import { ORDER_STATUSES, CUSTOMER_LABEL } from '@/domain/order-status'
import { json, readBody, requireStaffToken, route } from '@/server/api/http'
import { kitchenActions } from '@/server/api/views'
import { AppError } from '@/server/errors'
import { move } from '@/server/orders'
import { deps } from '@/server/runtime'

export const dynamic = 'force-dynamic'

const body = z.object({
  to: z.enum(ORDER_STATUSES),
  reason: z.string().max(200).optional(),
})

/**
 * Moves an order on, exactly like the kitchen screen's buttons: the state machine decides what
 * is allowed. The target status is explicit, so a retried request cannot skip a step.
 */
export const POST = route(
  async (request: Request, ctx: RouteContext<'/api/v1/kitchen/orders/[code]/move'>) => {
    await requireStaffToken(request, 'KITCHEN')
    const { code } = await ctx.params
    const { to, reason } = await readBody(request, body)
    const [order] = /^TL-[0-9A-Z]{6}$/.test(code)
      ? await db()
          .select({ id: orders.id, fulfilment: orders.fulfilment })
          .from(orders)
          .where(eq(orders.code, code))
      : []
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found.')
    const { db: database, gateway } = deps()
    const moved = await move(database, { orderId: order.id, to, actor: 'KITCHEN', note: reason }, gateway)
    return json({
      code: moved.code,
      status: moved.status,
      statusLabel: CUSTOMER_LABEL[moved.status],
      ...kitchenActions(moved.status, order.fulfilment),
    })
  },
)
