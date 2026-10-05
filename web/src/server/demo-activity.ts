import 'server-only'
import { and, count, eq, gte, inArray } from 'drizzle-orm'
import { Client } from 'pg'
import { RESTAURANT } from '@/config/restaurant'
import { type Db, directDatabaseUrl } from '@/db/client'
import { type AddressSnapshot, customers, orders } from '@/db/schema'
import type { OrderStatus } from '@/domain/order-status'
import type { CartLine, Fulfilment } from '@/domain/pricing'
import { addDays, localDate, localInstant } from '@/domain/time'
import { type MenuEntry, loadMenu } from './menu'
import { markPaid, move, placeOrder } from './orders'
import type { PaymentGateway } from './payments/razorpay'
import { availableTimes, book } from './reservations'

/**
 * A believable restaurant day for the public demo: a week of past orders for the sales screen,
 * today's bookings, and tickets in every column of the kitchen screen at any hour.
 *
 * Every order goes through the real services (placeOrder, markPaid, move) at the time it would
 * have happened, so the demo obeys the same rules as real orders: pricing, the order state
 * machine and the database's own checks. The week of past orders also takes kitchen slots like
 * any order; the live kitchen tickets are marked as demo tickets and take none (see
 * topUpDemoKitchen). Only ever called when DEMO_SEED=true.
 */

const DEMO_CUSTOMERS: [string, string, string][] = [
  ['Priya Joshi', '+919822000101', '411045'],
  ['Rohan Patil', '+919822000102', '411021'],
  ['Meera Kulkarni', '+919822000103', '411045'],
  ['Aditya Deshpande', '+919822000104', '411007'],
  ['Sneha Iyer', '+919822000105', '411008'],
  ['Kabir Shaikh', '+919822000106', '411045'],
  ['Ananya Rao', '+919822000107', '411021'],
  ['Vikram Mehta', '+919822000108', '411007'],
  ['Fatima Khan', '+919822000109', '411045'],
  ['Arjun Nair', '+919822000110', '411008'],
  ['Ishita Bose', '+919822000111', '411021'],
  ['Sameer Gokhale', '+919822000112', '411045'],
]

const STREETS = ['Baner Road', 'Pashan Road', 'Aundh Road', 'Balewadi High Street', 'University Road']

/** Online orders in the demo are paid through this stand-in; nothing reaches Razorpay. */
const DEMO_GATEWAY: PaymentGateway = {
  keyId: 'rzp_test_demo',
  async createOrder(_amountPaise, receipt) {
    return { id: `order_demo_${receipt}` }
  },
  async refund() {
    throw new Error('Demo payments cannot be refunded')
  },
}

type Customer = { id: number; name: string; phone: string; pincode: string }

/** Small deterministic random source, so the same date always produces the same demo day. */
function random(key: string) {
  let h = 1779033703 ^ key.length
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

type Rng = () => number
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!

async function demoCustomers(db: Db): Promise<Customer[]> {
  await db
    .insert(customers)
    .values(DEMO_CUSTOMERS.map(([name, phone]) => ({ name, phone })))
    .onConflictDoNothing()
  const rows = await db
    .select()
    .from(customers)
    .where(
      inArray(
        customers.phone,
        DEMO_CUSTOMERS.map(([, phone]) => phone),
      ),
    )
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? 'Guest',
    phone: r.phone,
    pincode: DEMO_CUSTOMERS.find(([, phone]) => phone === r.phone)![2],
  }))
}

/** A plausible basket: one to three dishes, compulsory choices made, comfortably over the minimum. */
function basket(rng: Rng, menu: MenuEntry[]): CartLine[] {
  const lines: CartLine[] = []
  let estimate = 0
  const target = RESTAURANT.ordering.minimumOrderPaise + 100_00
  while ((estimate < target || lines.length < 2) && lines.length < 4) {
    const item = pick(rng, menu)
    if (lines.some((l) => l.itemId === item.id)) continue
    const variant = item.variants.length ? pick(rng, item.variants) : null
    const addonIds: number[] = []
    let price = variant?.pricePaise ?? item.pricePaise
    for (const group of item.addonGroups) {
      const take = group.minSelect > 0 ? group.minSelect : rng() < 0.3 ? 1 : 0
      for (const addon of group.addons.slice(0, take)) {
        addonIds.push(addon.id)
        price += addon.pricePaise
      }
    }
    const quantity = /naan|roti|paratha/i.test(item.name) ? 2 : 1
    lines.push({ itemId: item.id, variantId: variant?.id ?? null, addonIds, quantity })
    estimate += price * quantity
  }
  return lines
}

const minutes = (at: Date, m: number) => new Date(at.getTime() + m * 60_000)

/** The kitchen's steps after an order is placed, with how many minutes after it each one happens. */
function steps(fulfilment: Fulfilment): [OrderStatus, number][] {
  return fulfilment === 'DELIVERY'
    ? [
        ['PREPARING', 5],
        ['READY', 22],
        ['OUT_FOR_DELIVERY', 26],
        ['DELIVERED', 48],
      ]
    : [
        ['PREPARING', 5],
        ['READY', 20],
        ['COLLECTED', 34],
      ]
}

async function placeDemoOrder(
  db: Db,
  rng: Rng,
  menu: MenuEntry[],
  customer: Customer,
  at: Date,
  options: { online: boolean; delivery: boolean; dueAt?: Date; now?: Date },
) {
  const fulfilment: Fulfilment = options.delivery ? 'DELIVERY' : 'PICKUP'
  const address: AddressSnapshot | null = options.delivery
    ? {
        label: 'Home',
        line1: `Flat ${1 + Math.floor(rng() * 40)}, ${pick(rng, ['Sunrise', 'Lotus', 'Silver Oak', 'Green Park'])} Apartments, ${pick(rng, STREETS)}`,
        line2: null,
        landmark: null,
        pincode: customer.pincode,
      }
    : null
  const placed = await placeOrder(
    { db, gateway: options.online ? DEMO_GATEWAY : null, now: at },
    {
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      lines: basket(rng, menu),
      fulfilment,
      address,
      slot: 'ASAP',
      paymentMethod: options.online ? 'ONLINE' : 'ON_DELIVERY',
      notes: rng() < 0.15 ? pick(rng, ['Less spicy please', 'Extra onions', 'Ring the bell twice']) : null,
    },
    { demoDueAt: options.dueAt },
  )
  if (placed.payment) {
    const paidAt = minutes(at, 1)
    await markPaid(
      { db, gateway: DEMO_GATEWAY, now: options.now && options.now < paidAt ? options.now : paidAt },
      placed.payment.providerOrderId,
      `pay_demo_${placed.code}`,
    )
  }
  return { id: placed.id, fulfilment, status: 'PLACED' as OrderStatus }
}

/**
 * Moves an order on through the kitchen's steps that were due by `now`, counted from `at`, when
 * it was placed. Stops at `until` if given.
 */
async function advance(
  db: Db,
  order: { id: number; fulfilment: Fulfilment; status: OrderStatus },
  at: Date,
  now: Date,
  until?: OrderStatus,
) {
  const path = steps(order.fulfilment)
  const done = path.findIndex(([status]) => status === order.status)
  for (const [status, after] of path.slice(done + 1)) {
    const when = minutes(at, after)
    if (when > now) return
    await move(db, { orderId: order.id, to: status, actor: 'KITCHEN', now: when })
    if (status === until) return
  }
}

/** Random times in the lunch and dinner rushes of `date` that are already in the past. */
function rushTimes(rng: Rng, date: string, howMany: number, before: Date): Date[] {
  const times: Date[] = []
  for (let i = 0; i < howMany; i++) {
    const lunch = rng() < 0.4
    const start = localInstant(date, lunch ? '12:15' : '19:00').getTime()
    const span = (lunch ? 150 : 180) * 60_000
    const at = new Date(start + Math.floor((rng() * span) / 60_000) * 60_000)
    if (at < before) times.push(at)
  }
  return times.sort((a, b) => a.getTime() - b.getTime())
}

/**
 * Fills a fresh demo with a week of finished orders and the next two days' bookings.
 * Does nothing if finished orders already exist, so calling it on every start is safe.
 */
export async function seedDemoActivity(
  db: Db,
  now = new Date(),
): Promise<{ orders: number; bookings: number }> {
  // One instance seeds; others starting at the same moment skip. The lock is session-level, so
  // it needs a direct connection: a transaction pooler could run unlock on another session.
  const client = new Client({ connectionString: directDatabaseUrl() })
  await client.connect()
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock(hashtext('dinewise:demo-activity')) as locked",
    )
    if (!rows[0]?.locked) return { orders: 0, bookings: 0 }
    try {
      const [{ n } = { n: 0 }] = await db
        .select({ n: count() })
        .from(orders)
        .where(inArray(orders.status, ['DELIVERED', 'COLLECTED']))
      if (n > 0) return { orders: 0, bookings: 0 }
      return await seed(db, now)
    } finally {
      await client.query("select pg_advisory_unlock(hashtext('dinewise:demo-activity'))")
    }
  } finally {
    await client.end()
  }
}

async function seed(db: Db, now: Date) {
  const today = localDate(now)
  const rng = random(today)
  const menu = (await loadMenu(db)).flatMap((s) => s.items).filter((i) => i.available)
  const people = await demoCustomers(db)
  let placed = 0

  // A week of service, finished an hour before now so nothing here is still on the board.
  const finishedBy = minutes(now, -70)
  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const date = addDays(today, -daysAgo)
    const weekend = [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())
    for (const at of rushTimes(rng, date, (weekend ? 11 : 8) + Math.floor(rng() * 4), finishedBy)) {
      const order = await placeDemoOrder(db, rng, menu, pick(rng, people), at, {
        online: rng() < 0.55,
        delivery: rng() < 0.65,
      })
      placed++
      const roll = rng()
      if (roll < 0.05) {
        await move(db, { orderId: order.id, to: 'CANCELLED', actor: 'CUSTOMER', now: minutes(at, 2) })
      } else {
        await advance(db, order, at, now)
      }
    }
  }

  // Tables for this evening and tomorrow.
  let bookings = 0
  for (const date of [today, addDays(today, 1)]) {
    for (let i = 0; i < 6; i++) {
      const partySize = pick(rng, [2, 2, 3, 4, 4, 6])
      const times = (await availableTimes(db, date, partySize, now)).filter(
        (t) => t.available && t.start.getTime() >= localInstant(date, '19:00').getTime(),
      )
      if (!times.length) continue
      const guest = pick(rng, people)
      await book(
        db,
        {
          customerId: guest.id,
          startsAt: pick(rng, times).start.toISOString(),
          partySize,
          notes:
            rng() < 0.3
              ? pick(rng, ['Birthday dinner', 'Window seat if possible', 'High chair needed'])
              : null,
        },
        now,
      )
      bookings++
    }
  }

  await topUpDemoKitchen(db, now, { force: true })
  return { orders: placed, bookings }
}

/**
 * The demo kitchen's stream of orders: one arrives every few minutes, at any hour, so a visitor
 * always finds a working kitchen. Each one is a function of its arrival time (its basket, how it
 * is paid, pickup or delivery), so every instance agrees on what the stream holds.
 */
const ARRIVAL_EVERY_MINUTES = 4
/** Long enough for the slowest order, a delivery, to have left the board again. */
const STREAM_WINDOW_MINUTES = 50
/** Ready this long after it is placed, the restaurant's own preparation time. */
const DUE_AFTER_MINUTES = 35

function arrivals(now: Date): Date[] {
  const every = ARRIVAL_EVERY_MINUTES * 60_000
  const latest = Math.floor(now.getTime() / every) * every
  const times: Date[] = []
  for (let t = latest; t > now.getTime() - STREAM_WINDOW_MINUTES * 60_000; t -= every) {
    times.push(new Date(t))
  }
  return times.reverse()
}

const globalForDemo = globalThis as unknown as { dinewiseDemoTopUp?: number }

/**
 * Keeps the public demo's kitchen busy at any hour: brings the stream of made-up tickets up to
 * date and moves the ones already on the board on, as a kitchen would. With an order every four
 * minutes the board always has tickets in every column: at least one New, several Cooking, one
 * Ready and a few Out for delivery.
 *
 * The tickets are marked as demo tickets, due about half an hour after they were placed whatever
 * the opening hours, and never take kitchen-slot capacity. So the customer side is untouched: a
 * closed restaurant still shows as closed, and a visitor's order still gets the slot it would
 * have got on an empty board. Only ever called when DEMO_SEED=true. At most once a minute per
 * instance, unless forced.
 */
export async function topUpDemoKitchen(db: Db, now = new Date(), { force = false } = {}) {
  const last = globalForDemo.dinewiseDemoTopUp ?? 0
  if (!force && now.getTime() >= last && now.getTime() - last < 60_000) return 0
  globalForDemo.dinewiseDemoTopUp = now.getTime()

  // Tickets already on the board move on by the clock; finished ones leave it.
  const open = await db
    .select({ id: orders.id, fulfilment: orders.fulfilment, status: orders.status, at: orders.createdAt })
    .from(orders)
    .where(
      and(
        eq(orders.demo, true),
        inArray(orders.status, ['PLACED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']),
      ),
    )
  for (const ticket of open) await advance(db, ticket, ticket.at, now)

  const due = arrivals(now)
  const existing = new Set(
    (
      await db
        .select({ at: orders.createdAt })
        .from(orders)
        .where(and(eq(orders.demo, true), gte(orders.createdAt, due[0]!)))
    ).map((o) => o.at.getTime()),
  )
  const missing = due.filter((at) => !existing.has(at.getTime()))
  if (!missing.length) return 0

  const menu = (await loadMenu(db)).flatMap((s) => s.items).filter((i) => i.available)
  if (!menu.length) return 0
  const people = await demoCustomers(db)
  for (const at of missing) {
    const rng = random(`demo-ticket:${at.getTime()}`)
    // Every third order is a pickup: with an order every four minutes, Ready is never empty.
    const delivery = Math.round(at.getTime() / (ARRIVAL_EVERY_MINUTES * 60_000)) % 3 !== 0
    const dueAt = new Date(Math.ceil(minutes(at, DUE_AFTER_MINUTES).getTime() / 300_000) * 300_000)
    const order = await placeDemoOrder(db, rng, menu, pick(rng, people), at, {
      online: rng() < 0.5,
      delivery,
      dueAt,
      now,
    })
    await advance(db, order, at, now)
  }
  return missing.length
}
