import 'server-only'
import { type OrderChange, subscribeToOrders } from './realtime'

/**
 * How long one stream lives before the server ends it. The browser's EventSource reconnects by
 * itself, and the page catches up on reconnect, so nothing is missed. This keeps each stream
 * inside a serverless function's time limit (route `maxDuration`), and costs a long-lived
 * server one reconnect every few minutes.
 */
export const STREAM_LIFETIME_MS = 270_000

/**
 * A Server-Sent Events response that forwards matching order changes until the browser goes
 * away or the stream's lifetime ends. A comment line every 20 seconds keeps proxies from
 * closing an idle connection.
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
      const lifetime = setTimeout(() => cleanup(), STREAM_LIFETIME_MS)
      cleanup = () => {
        clearInterval(heartbeat)
        clearTimeout(lifetime)
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
