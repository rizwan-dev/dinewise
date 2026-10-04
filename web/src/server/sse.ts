import 'server-only'
import { type OrderChange, subscribeToOrders } from './realtime'

/**
 * A Server-Sent Events response that forwards matching order changes until the browser goes
 * away. A comment line every 20 seconds keeps proxies from closing an idle connection, and
 * the browser's EventSource reconnects by itself if the connection drops.
 */
export async function orderEventStream(
  request: Request,
  matches: (change: OrderChange) => boolean,
): Promise<Response> {
  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          cleanup()
        }
      }
      const unsubscribe = await subscribeToOrders(
        (change) => {
          if (matches(change)) send(`event: order\ndata: ${JSON.stringify(change)}\n\n`)
        },
        () => send('event: resync\ndata: {}\n\n'),
      )
      const heartbeat = setInterval(() => send(': keep-alive\n\n'), 20_000)
      cleanup = () => {
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
      request.signal.addEventListener('abort', cleanup, { once: true })
      // Tell the browser to retry after 3 seconds if the stream drops.
      send('retry: 3000\n\n')
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
