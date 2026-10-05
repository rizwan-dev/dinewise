import 'server-only'
import { and, count, gt, inArray } from 'drizzle-orm'
import { Client } from 'pg'
import { RESTAURANT } from '@/config/restaurant'
import { type Db, directDatabaseUrl } from '@/db/client'
import { type AddressSnapshot, customers, orders } from '@/db/schema'
import type { OrderStatus } from '@/domain/order-status'
import type { CartLine, Fulfilment } from '@/domain/pricing'
import { isOpenNow } from '@/domain/slots'
import { addDays, localDate, localInstant } from '@/domain/time'
import { type MenuEntry, loadMenu } from './menu'
import { markPaid, move, placeOrder } from './orders'
import type { PaymentGateway } from './payments/razorpay'
import { availableTimes, book } from './reservations'

/**
 * A believable restaurant day for the public demo: a week of past orders for the sales screen,
 * today's bookings, and tickets in every column of the kitchen screen.
 *
 * Every order goes through the real services (placeOrder, markPaid, move) at the time it would
 * have happened, so the demo obeys the same rules as real orders: kitchen-slot capacity, pricing,
 * the order state machine and the database's own checks. Only ever called when DEMO_SEED=true.
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
    .where(inArray(customers.phone, DEMO_CUSTOMERS.map(([, phone]) => phone)))
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

/** The kitchen's steps after an order is placed, with when each one happened. */
function steps(fulfilment: Fulfilment): [OrderStatus, number][] {
  return fulfilment === 'DELIVERY'
    ? [
        ['PREPARING', 4],
        ['READY', 22],
        ['OUT_FOR_DELIVERY', 26],
        ['DELIVERED', 48],
      ]
    : [
        ['PREPARING', 3],
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
  options: { online: boolean; delivery: boolean },
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
  )
  if (placed.payment) {
    await markPaid(
      { db, gateway: DEMO_GATEWAY, now: minutes(at, 1) },
      placed.payment.providerOrderId,
      `pay_demo_${placed.code}`,
    )
  }
  return { id: placed.id, fulfilment }
}

/** Moves an order through the kitchen's steps, stopping once it reaches `until` or the clock. */
async function advance(db: Db, order: { id: number; fulfilment: Fulfilment }, at: Date, until: OrderStatus, now: Date) {
  for (const [status, after] of steps(order.fulfilment)) {
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
export async function seedDemoActivity(db: Db, now = new Date()): Promise<{ orders: number; bookings: number }> {
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
        await advance(db, order, at, order.fulfilment === 'DELIVERY' ? 'DELIVERED' : 'COLLECTED', now)
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
          notes: rng() < 0.3 ? pick(rng, ['Birthday dinner', 'Window seat if possible', 'High chair needed']) : null,
        },
        now,
      )
      bookings++
    }
  }

  await topUpDemoKitchen(db, now, { force: true })
  return { orders: placed, bookings }
}

/** How many tickets the demo kitchen keeps in each column while the restaurant is open. */
const LIVE: [OrderStatus, number, number][] = [
  // status, how many, placed this many minutes ago
  ['PLACED', 2, 2],
  ['PREPARING', 2, 10],
  ['READY', 1, 24],
  ['OUT_FOR_DELIVERY', 1, 32],
]

const globalForDemo = globalThis as unknown as { dinewiseDemoTopUp?: number }

/**
 * Keeps the demo kitchen busy: while the restaurant is open, tops each column of the kitchen
 * screen up to a few tickets. Visitors' own orders count too. At most once a minute per instance.
 */
export async function topUpDemoKitchen(db: Db, now = new Date(), { force = false } = {}) {
  if (!isOpenNow(now)) return 0
  const last = globalForDemo.dinewiseDemoTopUp ?? 0
  if (!force && now.getTime() - last < 60_000) return 0
  globalForDemo.dinewiseDemoTopUp = now.getTime()

  const rng = random(`${now.getTime()}`)
  const menu = (await loadMenu(db)).flatMap((s) => s.items).filter((i) => i.available)
  if (!menu.length) return 0
  const people = await demoCustomers(db)
  const counts = new Map(
    (
      await db
        .select({ status: orders.status, n: count() })
        .from(orders)
        .where(and(inArray(orders.status, LIVE.map(([s]) => s)), gt(orders.createdAt, minutes(now, -120))))
        .groupBy(orders.status)
    ).map((r) => [r.status, r.n]),
  )

  let added = 0
  for (const [status, wanted, ago] of LIVE) {
    for (let i = counts.get(status) ?? 0; i < wanted; i++) {
      const at = minutes(now, -ago - i)
      const order = await placeDemoOrder(db, rng, menu, pick(rng, people), at, {
        online: false,
        delivery: status === 'OUT_FOR_DELIVERY' || rng() < 0.6,
      })
      if (status !== 'PLACED') await advance(db, order, at, status, now)
      added++
    }
  }
  return added
}
