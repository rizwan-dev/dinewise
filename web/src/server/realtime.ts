import 'server-only'
import { EventEmitter } from 'node:events'
import { Client } from 'pg'
import { directDatabaseUrl } from '@/db/client'
import type { OrderStatus } from '@/domain/order-status'

/**
 * Live order updates, from PostgreSQL to the browser.
 *
 * A trigger announces every order change on the "orders" channel when its transaction
 * commits. Each server process holds one LISTEN connection and passes changes to whoever is
 * subscribed: the kitchen screen, or a customer watching their order. Going through the
 * database rather than in-memory events means it keeps working with several app instances.
 */

export type OrderChange = {
  id: number
  code: string
  status: OrderStatus
  paymentStatus: string
}

type State = { emitter: EventEmitter; client?: Client; connecting?: Promise<void> }

const globalForRealtime = globalThis as unknown as { dinewiseRealtime?: State }

function state(): State {
  if (!globalForRealtime.dinewiseRealtime) {
    const emitter = new EventEmitter()
    // Every open kitchen screen and tracking page is a listener.
    emitter.setMaxListeners(0)
    globalForRealtime.dinewiseRealtime = { emitter }
  }
  return globalForRealtime.dinewiseRealtime
}

async function connect(s: State): Promise<void> {
  const client = new Client({ connectionString: directDatabaseUrl() })
  client.on('notification', (msg) => {
    if (msg.channel !== 'orders' || !msg.payload) return
    try {
      s.emitter.emit('order', JSON.parse(msg.payload) as OrderChange)
    } catch {
      // A malformed payload is dropped; the next change will carry the current state.
    }
  })
  client.on('error', () => reconnect(s))
  client.on('end', () => reconnect(s))
  await client.connect()
  await client.query('LISTEN orders')
  s.client = client
  // Subscribers missed whatever happened while disconnected; tell them to refetch.
  s.emitter.emit('resync')
}

function reconnect(s: State) {
  if (s.connecting) return
  s.client = undefined
  s.connecting = new Promise<void>((resolve) => {
    const attempt = (delay: number) =>
      setTimeout(() => {
        connect(s)
          .then(resolve)
          .catch(() => attempt(Math.min(delay * 2, 10_000)))
      }, delay)
    attempt(500)
  }).finally(() => {
    s.connecting = undefined
  })
}

async function ensureListening(s: State) {
  if (s.client) return
  s.connecting ??= connect(s).finally(() => {
    s.connecting = undefined
  })
  await s.connecting
}

/** Calls `onChange` for every order change, and `onResync` after a reconnect. Returns unsubscribe. */
export async function subscribeToOrders(
  onChange: (change: OrderChange) => void,
  onResync: () => void = () => {},
): Promise<() => void> {
  const s = state()
  await ensureListening(s)
  s.emitter.on('order', onChange)
  s.emitter.on('resync', onResync)
  return () => {
    s.emitter.off('order', onChange)
    s.emitter.off('resync', onResync)
  }
}
