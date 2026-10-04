import { getStaff } from '@/server/auth/current'
import { orderEventStream } from '@/server/sse'

export const dynamic = 'force-dynamic'
/** Seconds; above the stream's own lifetime (STREAM_LIFETIME_MS), so the stream ends first. */
export const maxDuration = 300

/** Every order change, for the kitchen screen. Staff only. */
export async function GET(request: Request) {
  if (!(await getStaff())) return new Response('Sign in required', { status: 401 })
  return orderEventStream(request, () => true)
}
