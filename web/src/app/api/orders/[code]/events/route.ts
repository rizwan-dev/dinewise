import { orderEventStream } from '@/server/sse'

export const dynamic = 'force-dynamic'

/** Live status for one order. The code is unguessable, and only the status is sent. */
export async function GET(request: Request, ctx: RouteContext<'/api/orders/[code]/events'>) {
  const { code } = await ctx.params
  if (!/^TL-[0-9A-Z]{6}$/.test(code)) return new Response('Not found', { status: 404 })
  return orderEventStream(request, (change) => change.code === code)
}
