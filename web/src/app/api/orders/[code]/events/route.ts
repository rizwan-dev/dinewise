import { orderEventStream } from '@/server/sse'

export const dynamic = 'force-dynamic'
/** Seconds; above the stream's own lifetime (STREAM_LIFETIME_MS), so the stream ends first. */
export const maxDuration = 300

/** Live status for one order. The code is unguessable, and only the status is sent. */
export async function GET(request: Request, ctx: RouteContext<'/api/orders/[code]/events'>) {
  const { code } = await ctx.params
  if (!/^TL-[0-9A-Z]{6}$/.test(code)) return new Response('Not found', { status: 404 })
  return orderEventStream(request, (change) => change.code === code)
}
