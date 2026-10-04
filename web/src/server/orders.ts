import 'server-only'
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm'
import { RESTAURANT } from '@/config/restaurant'
import type { Db, Executor, Tx } from '@/db/client'
import {
  type AddressSnapshot,
  couponRedemptions,
  coupons,
  orderEvents,
  orderItems,
  orders,
  payments,
} from '@/db/schema'
import { normaliseCouponCode } from '@/domain/coupons'
import { type Actor, canMove, type OrderStatus } from '@/domain/order-status'
import { type CartLine, type Fulfilment, quote } from '@/domain/pricing'
import { orderSlots } from '@/domain/slots'
import { publicCode } from './auth/crypto'
import { AppError } from './errors'
import { loadMenu, menuById } from './menu'
import type { PaymentGateway } from './payments/razorpay'

/**
 * Placing, paying for and moving orders.
 *
 * Concurrency rules, each covered by an integration test:
 *  - A customer's checkouts run one at a time (advisory lock), so a coupon limited to one use
 *    cannot be redeemed twice by double-tapping "Place order".
 *  - Each kitchen slot is locked while its orders are counted and the new one is added, so a
 *    slot never takes more orders than its capacity, however many people check out at once.
 *  - Locks are always taken customer first, then slot, so two checkouts cannot deadlock.
 *  - Payments are applied with the payment row locked, so the Checkout callback and the
 *    webhook arriving together mark an order paid exactly once.
 */

/** Orders that take kitchen capacity: everything not finished unhappily, and unpaid ones still in their window. */
const RELEASED: OrderStatus[] = ['CANCELLED', 'REJECTED', 'EXPIRED']

export type PlaceOrderInput = {
  customerId: number
  customerName: string
  customerPhone: string
  lines: CartLine[]
  fulfilment: Fulfilment
  address?: AddressSnapshot | null
  /** 'ASAP' or the ISO start of a slot offered to the customer. */
  slot: string
  paymentMethod: 'ONLINE' | 'ON_DELIVERY'
  couponCode?: string | null
  notes?: string | null
}

export type PlacedOrder = {
  id: number
  code: string
  totalPaise: number
  payment: { keyId: string; providerOrderId: string; amountPaise: number } | null
}

type Deps = { db: Db; gateway: PaymentGateway | null; now?: Date }

const lock = (tx: Tx, key: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`)

/** Orders already in each upcoming slot, for the capacity check and the slot picker. */
export async function slotCounts(exec: Executor, now: Date, slotStart?: Date): Promise<Map<number, number>> {
  const rows = await exec
    .select({ slot: orders.slotStart, n: count() })
    .from(orders)
    .where(
      and(
        slotStart
          ? eq(orders.slotStart, slotStart)
          : gte(orders.slotStart, new Date(now.getTime() - 60 * 60_000)),
        notInArray(orders.status, RELEASED),
        or(sql`${orders.status} <> 'AWAITING_PAYMENT'`, gt(orders.paymentDueAt, now)),
      ),
    )
    .groupBy(orders.slotStart)
  return new Map(rows.map((r) => [r.slot.getTime(), r.n]))
}

export async function placeOrder(
  { db, gateway, now = new Date() }: Deps,
  input: PlaceOrderInput,
): Promise<PlacedOrder> {
  if (input.paymentMethod === 'ONLINE' && !gateway) {
    throw new AppError(
      'ONLINE_PAYMENT_OFF',
      'Online payment is not available right now. Choose pay on delivery.',
    )
  }
  if (input.fulfilment === 'DELIVERY' && !input.address) {
    throw new AppError('ADDRESS_REQUIRED', 'Choose a delivery address.', 'address')
  }

  const placed = await db.transaction(async (tx) => {
    await lock(tx, `customer:${input.customerId}`)

    const menu = menuById(await loadMenu(tx))

    let coupon = null
    let couponContext
    if (input.couponCode) {
      const code = normaliseCouponCode(input.couponCode)
      ;[coupon] = await tx.select().from(coupons).where(eq(coupons.code, code))
      if (!coupon) throw new AppError('COUPON_NOT_FOUND', `${code} is not a valid code.`, 'coupon')
      const [[uses], [previous]] = await Promise.all([
        tx
          .select({ n: count() })
          .from(couponRedemptions)
          .where(
            and(eq(couponRedemptions.couponCode, code), eq(couponRedemptions.customerId, input.customerId)),
          ),
        tx
          .select({ n: count() })
          .from(orders)
          .where(and(eq(orders.customerId, input.customerId), notInArray(orders.status, RELEASED))),
      ])
      couponContext = { now, isFirstOrder: (previous?.n ?? 0) === 0, customerUses: uses?.n ?? 0 }
    }

    const priced = quote({
      lines: input.lines,
      menu,
      fulfilment: input.fulfilment,
      pincode: input.address?.pincode,
      coupon,
      couponContext,
    })

    const slotStart = await claimSlot(tx, input.slot, now)
    const online = input.paymentMethod === 'ONLINE'
    const status: OrderStatus = online ? 'AWAITING_PAYMENT' : 'PLACED'

    const [order] = await tx
      .insert(orders)
      .values({
        code: publicCode('TL'),
        customerId: input.customerId,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone,
        fulfilment: input.fulfilment,
        address: input.fulfilment === 'DELIVERY' ? input.address : null,
        slotStart,
        scheduled: input.slot !== 'ASAP',
        status,
        paymentMethod: input.paymentMethod,
        paymentStatus: online ? 'PENDING' : 'NOT_REQUIRED',
        ...priced.totals,
        couponCode: priced.couponCode,
        notes: input.notes?.trim() || null,
        paymentDueAt: online
          ? new Date(now.getTime() + RESTAURANT.ordering.paymentWindowMinutes * 60_000)
          : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: orders.id, code: orders.code, totalPaise: orders.totalPaise })
    if (!order) throw new Error('Order insert returned nothing')

    await tx.insert(orderItems).values(
      priced.lines.map((l) => ({
        orderId: order.id,
        itemId: l.itemId,
        name: l.name,
        variantName: l.variantName,
        addons: l.addons,
        quantity: l.quantity,
        unitPricePaise: l.unitPricePaise,
        lineTotalPaise: l.lineTotalPaise,
      })),
    )
    await tx.insert(orderEvents).values({ orderId: order.id, status, actor: 'CUSTOMER', at: now })
    if (priced.couponCode) {
      await tx
        .insert(couponRedemptions)
        .values({ orderId: order.id, couponCode: priced.couponCode, customerId: input.customerId })
    }
    return order
  })

  if (input.paymentMethod !== 'ONLINE' || !gateway) return { ...placed, payment: null }

  // The gateway is called after commit: a slow network must never hold the slot lock.
  try {
    const remote = await gateway.createOrder(placed.totalPaise, placed.code, { order: placed.code })
    await db.insert(payments).values({
      orderId: placed.id,
      provider: 'RAZORPAY',
      providerOrderId: remote.id,
      amountPaise: placed.totalPaise,
      status: 'CREATED',
    })
    return {
      ...placed,
      payment: { keyId: gateway.keyId, providerOrderId: remote.id, amountPaise: placed.totalPaise },
    }
  } catch (error) {
    console.error(error)
    await move(db, {
      orderId: placed.id,
      to: 'EXPIRED',
      actor: 'SYSTEM',
      note: 'Payment could not be started',
      now,
    })
    throw new AppError(
      'PAYMENT_UNAVAILABLE',
      'We could not start the payment. Please try again or pay on delivery.',
    )
  }
}

/**
 * Picks the slot and takes its lock. For "as soon as possible" it walks forward through the
 * slots until one, re-counted under its lock, still has room.
 */
async function claimSlot(tx: Tx, requested: string, now: Date): Promise<Date> {
  const capacity = RESTAURANT.ordering.ordersPerSlot
  const offered = orderSlots(now, await slotCounts(tx, now))

  const candidates =
    requested === 'ASAP'
      ? offered.filter((s) => !s.full).slice(0, 8)
      : offered.filter((s) => s.start.getTime() === Date.parse(requested))

  if (candidates.length === 0) {
    throw new AppError(
      requested === 'ASAP' ? 'KITCHEN_FULL' : 'SLOT_UNAVAILABLE',
      requested === 'ASAP'
        ? 'The kitchen is fully booked for now. Please schedule for later.'
        : 'That time is no longer available. Please choose another.',
      'slot',
    )
  }
  for (const slot of candidates) {
    await lock(tx, `slot:${slot.start.getTime()}`)
    const taken = (await slotCounts(tx, now, slot.start)).get(slot.start.getTime()) ?? 0
    if (taken < capacity) return slot.start
  }
  throw new AppError('SLOT_FULL', 'That time has just filled up. Please choose another.', 'slot')
}

// --- Payments --------------------------------------------------------------------------------

/**
 * Records a successful payment. Safe to call any number of times, from the Checkout callback
 * and from webhooks, in any order. A payment that lands after the order expired is refunded.
 */
export async function markPaid(
  { db, gateway, now = new Date() }: Deps,
  providerOrderId: string,
  providerPaymentId: string,
): Promise<{ code: string; alreadyApplied: boolean }> {
  const result = await db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.providerOrderId, providerOrderId))
      .for('update')
    if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 'We could not find that payment.')
    const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId)).for('update')
    if (!order) throw new Error(`Payment ${payment.id} has no order`)

    if (payment.status !== 'CREATED' && payment.status !== 'FAILED') {
      return { code: order.code, alreadyApplied: true, refund: false }
    }

    const tooLate = order.status !== 'AWAITING_PAYMENT'
    await tx
      .update(payments)
      .set({ status: tooLate ? 'REFUND_PENDING' : 'PAID', providerPaymentId, updatedAt: now })
      .where(eq(payments.id, payment.id))
    if (tooLate) {
      await tx
        .update(orders)
        .set({ paymentStatus: 'REFUND_PENDING', updatedAt: now })
        .where(eq(orders.id, order.id))
      await tx.insert(orderEvents).values({
        orderId: order.id,
        status: order.status,
        actor: 'SYSTEM',
        note: 'Payment arrived after the order closed; refund started',
        at: now,
      })
    } else {
      await tx
        .update(orders)
        .set({ status: 'PLACED', paymentStatus: 'PAID', paymentDueAt: null, updatedAt: now })
        .where(eq(orders.id, order.id))
      await tx
        .insert(orderEvents)
        .values({ orderId: order.id, status: 'PLACED', actor: 'SYSTEM', note: 'Paid online', at: now })
    }
    return { code: order.code, alreadyApplied: false, refund: tooLate }
  })

  if (result.refund) await startRefund({ db, gateway, now }, providerOrderId)
  return { code: result.code, alreadyApplied: result.alreadyApplied }
}

export async function markPaymentFailed(exec: Executor, providerOrderId: string, now = new Date()) {
  await exec
    .update(payments)
    .set({ status: 'FAILED', updatedAt: now })
    .where(and(eq(payments.providerOrderId, providerOrderId), eq(payments.status, 'CREATED')))
}

/** Asks the gateway for a refund of a payment marked REFUND_PENDING. Retried later if it fails. */
export async function startRefund({ db, gateway }: Deps, providerOrderId: string) {
  const [payment] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.providerOrderId, providerOrderId),
        eq(payments.status, 'REFUND_PENDING'),
        isNull(payments.refundId),
      ),
    )
  if (!payment?.providerPaymentId || !gateway) return
  try {
    const refund = await gateway.refund(payment.providerPaymentId, payment.amountPaise)
    await db
      .update(payments)
      .set({ refundId: refund.id, updatedAt: new Date() })
      .where(eq(payments.id, payment.id))
  } catch (error) {
    console.error('Refund request failed; it stays pending for a retry', error)
  }
}

export async function markRefunded(db: Db, providerPaymentId: string, now = new Date()) {
  await db.transaction(async (tx) => {
    const [payment] = await tx
      .update(payments)
      .set({ status: 'REFUNDED', updatedAt: now })
      .where(and(eq(payments.providerPaymentId, providerPaymentId), eq(payments.status, 'REFUND_PENDING')))
      .returning({ orderId: payments.orderId })
    if (payment) {
      await tx
        .update(orders)
        .set({ paymentStatus: 'REFUNDED', updatedAt: now })
        .where(eq(orders.id, payment.orderId))
    }
  })
}

/** Releases unpaid online orders whose payment window has passed. */
export async function expireUnpaid(db: Db, now = new Date()): Promise<number> {
  return db.transaction(async (tx) => {
    const expired = await tx
      .update(orders)
      .set({ status: 'EXPIRED', updatedAt: now })
      .where(and(eq(orders.status, 'AWAITING_PAYMENT'), lt(orders.paymentDueAt, now)))
      .returning({ id: orders.id })
    if (expired.length) {
      await tx.insert(orderEvents).values(
        expired.map((o) => ({
          orderId: o.id,
          status: 'EXPIRED' as const,
          actor: 'SYSTEM' as const,
          at: now,
        })),
      )
    }
    return expired.length
  })
}

// --- Moving orders ---------------------------------------------------------------------------

export async function move(
  db: Db,
  args: { orderId: number; to: OrderStatus; actor: Actor; note?: string; now?: Date; customerId?: number },
  gateway: PaymentGateway | null = null,
): Promise<{ code: string; status: OrderStatus }> {
  const now = args.now ?? new Date()
  const result = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, args.orderId)).for('update')
    if (!order || (args.customerId !== undefined && order.customerId !== args.customerId)) {
      throw new AppError('ORDER_NOT_FOUND', 'Order not found.')
    }
    if (!canMove(order.status, args.to, order.fulfilment, args.actor)) {
      throw new AppError(
        'INVALID_TRANSITION',
        args.actor === 'CUSTOMER' && args.to === 'CANCELLED'
          ? 'The kitchen has started on this order, so it can no longer be cancelled.'
          : 'This order has already moved on. Refresh to see its current state.',
      )
    }
    if (args.to === 'REJECTED' && !args.note?.trim()) {
      throw new AppError('REASON_REQUIRED', 'Tell the customer why the order cannot be accepted.', 'note')
    }

    const refund = (args.to === 'REJECTED' || args.to === 'CANCELLED') && order.paymentStatus === 'PAID'
    await tx
      .update(orders)
      .set({
        status: args.to,
        updatedAt: now,
        ...(args.to === 'REJECTED' ? { rejectReason: args.note!.trim() } : {}),
        ...(refund ? { paymentStatus: 'REFUND_PENDING' as const } : {}),
      })
      .where(eq(orders.id, order.id))
    if (refund) {
      await tx
        .update(payments)
        .set({ status: 'REFUND_PENDING', updatedAt: now })
        .where(and(eq(payments.orderId, order.id), eq(payments.status, 'PAID')))
    }
    await tx.insert(orderEvents).values({
      orderId: order.id,
      status: args.to,
      actor: args.actor,
      note: args.note?.trim() || null,
      at: now,
    })
    const [payment] = refund
      ? await tx
          .select({ providerOrderId: payments.providerOrderId })
          .from(payments)
          .where(eq(payments.orderId, order.id))
      : []
    return { code: order.code, status: args.to, refundFor: payment?.providerOrderId }
  })

  if (result.refundFor) await startRefund({ db, gateway, now }, result.refundFor)
  return { code: result.code, status: result.status }
}

// --- Reading orders --------------------------------------------------------------------------

export type OrderView = Awaited<ReturnType<typeof orderDetails>>

export async function orderDetails(exec: Executor, where: { code: string } | { id: number }) {
  const [order] = await exec
    .select()
    .from(orders)
    .where('code' in where ? eq(orders.code, where.code) : eq(orders.id, where.id))
  if (!order) return null
  const [items, events] = await Promise.all([
    exec.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.id)),
    exec
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, order.id))
      .orderBy(asc(orderEvents.at), asc(orderEvents.id)),
  ])
  return { ...order, items, events }
}

/** Everything the kitchen screen shows: open orders, oldest slot first. */
export async function kitchenBoard(exec: Executor, now: Date) {
  const open = await exec
    .select()
    .from(orders)
    .where(inArray(orders.status, ['PLACED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']))
    .orderBy(asc(orders.slotStart), asc(orders.id))
  const ids = open.map((o) => o.id)
  const items = ids.length
    ? await exec.select().from(orderItems).where(inArray(orderItems.orderId, ids)).orderBy(asc(orderItems.id))
    : []
  // Scheduled orders join the board an hour before they are due.
  const soon = now.getTime() + 60 * 60_000
  return open.map((o) => ({
    ...o,
    items: items.filter((i) => i.orderId === o.id),
    later: o.slotStart.getTime() > soon,
  }))
}

export async function customerOrders(exec: Executor, customerId: number, limit = 20) {
  return exec
    .select({
      id: orders.id,
      code: orders.code,
      status: orders.status,
      fulfilment: orders.fulfilment,
      totalPaise: orders.totalPaise,
      createdAt: orders.createdAt,
      slotStart: orders.slotStart,
    })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), sql`${orders.status} <> 'EXPIRED'`))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
}

/** The lines of a past order as a new cart, keeping only what is still on the menu. */
export async function reorderLines(exec: Executor, customerId: number, code: string): Promise<CartLine[]> {
  const order = await orderDetails(exec, { code })
  if (!order || order.customerId !== customerId) throw new AppError('ORDER_NOT_FOUND', 'Order not found.')
  const menu = menuById(await loadMenu(exec))
  const lines: CartLine[] = []
  for (const item of order.items) {
    const current = item.itemId ? menu.get(item.itemId) : undefined
    if (!current?.available) continue
    const variant = current.variants.find((v) => v.name === item.variantName)
    if (current.variants.length && !variant) continue
    const wanted = new Set(item.addons.map((a) => a.id))
    const addonIds = current.addonGroups
      .flatMap((g) => g.addons)
      .filter((a) => wanted.has(a.id))
      .map((a) => a.id)
    lines.push({ itemId: current.id, variantId: variant?.id ?? null, addonIds, quantity: item.quantity })
  }
  return lines
}
