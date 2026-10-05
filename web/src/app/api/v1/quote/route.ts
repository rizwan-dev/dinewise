import { db } from '@/db/client'
import { bearerToken, json, readBody, route } from '@/server/api/http'
import { quoteView } from '@/server/api/views'
import { customerForToken } from '@/server/auth/current'
import { housekeepIfDue } from '@/server/housekeeping'
import { availableSlots, quoteCart, quoteSchema } from '@/server/quote'

export const dynamic = 'force-dynamic'

/**
 * Prices a cart exactly as the web cart and checkout do. Signing in is optional: with a
 * customer token, coupon rules (first order, uses per customer) are checked for that customer.
 * A cart that cannot be ordered is still a 200, with `ok: false` and the problem.
 */
export const POST = route(async (request: Request) => {
  const input = await readBody(request, quoteSchema)
  const token = bearerToken(request)
  const customer = token ? await customerForToken(token) : null
  await housekeepIfDue()
  const [quote, slots] = await Promise.all([
    quoteCart(db(), input, customer?.id ?? null),
    availableSlots(db()),
  ])
  return json(quoteView(quote, slots))
})
