import { requireStaffToken, route } from '@/server/api/http'
import { orderEventStream } from '@/server/sse'

export const dynamic = 'force-dynamic'
/** Seconds; above the stream's own lifetime (STREAM_LIFETIME_MS), so the stream ends first. */
export const maxDuration = 300

/** Every order change, for the kitchen. Staff only. */
export const GET = route(async (request: Request) => {
  await requireStaffToken(request, 'KITCHEN')
  return orderEventStream(request, () => true)
})
