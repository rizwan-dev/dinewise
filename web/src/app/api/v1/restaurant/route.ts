import { db } from '@/db/client'
import { asapSlot, isOpenNow } from '@/domain/slots'
import { json, route } from '@/server/api/http'
import { restaurantView } from '@/server/api/views'
import { env } from '@/server/env'
import { slotCounts } from '@/server/orders'

export const dynamic = 'force-dynamic'

/** The restaurant: hours, whether it is open, and the rules behind every charge on the bill. */
export const GET = route(async () => {
  const now = new Date()
  const next = asapSlot(now, await slotCounts(db(), now))
  return json(restaurantView(now, isOpenNow(now), next ? next.start.toISOString() : null, env().DEMO_SEED))
})
