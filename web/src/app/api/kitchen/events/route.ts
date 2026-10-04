import { getStaff } from '@/server/auth/current'
import { orderEventStream } from '@/server/sse'

export const dynamic = 'force-dynamic'

/** Every order change, for the kitchen screen. Staff only. */
export async function GET(request: Request) {
  if (!(await getStaff())) return new Response('Sign in required', { status: 401 })
  return orderEventStream(request, () => true)
}
