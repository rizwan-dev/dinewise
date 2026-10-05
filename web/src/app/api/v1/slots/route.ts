import { db } from '@/db/client'
import { json, route } from '@/server/api/http'
import { housekeepIfDue } from '@/server/housekeeping'
import { availableSlots } from '@/server/quote'

export const dynamic = 'force-dynamic'

/** "As soon as possible" and every time an order can be scheduled for. */
export const GET = route(async () => {
  await housekeepIfDue()
  return json(await availableSlots(db()))
})
