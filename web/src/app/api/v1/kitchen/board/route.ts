import { db } from '@/db/client'
import { REJECT_REASONS } from '@/domain/order-status'
import { json, requireStaffToken, route } from '@/server/api/http'
import { ticketView } from '@/server/api/views'
import { kitchenTickets } from '@/server/kitchen'

export const dynamic = 'force-dynamic'

/** The kitchen screen: open tickets, oldest slot first, and those scheduled for later. */
export const GET = route(async (request: Request) => {
  await requireStaffToken(request, 'KITCHEN')
  const now = new Date()
  const tickets = (await kitchenTickets(db(), now)).map((t) => ticketView(t, now))
  return json({
    serverTime: now.toISOString(),
    currency: 'INR',
    rejectReasons: REJECT_REASONS,
    current: tickets.filter((t) => !t.later),
    later: tickets.filter((t) => t.later),
  })
})
