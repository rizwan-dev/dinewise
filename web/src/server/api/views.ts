import 'server-only'
import { RESTAURANT } from '@/config/restaurant'
import {
  canMove,
  CUSTOMER_LABEL,
  isFinal,
  KITCHEN_ACTION_LABEL,
  kitchenNext,
  type OrderStatus,
} from '@/domain/order-status'
import { MAX_LINES, MAX_QUANTITY, type Quote, type Totals } from '@/domain/pricing'
import type { KitchenTicket } from '../kitchen'
import { fromPrice, type MenuSection } from '../menu'
import type { OrderView } from '../orders'
import type { QuoteResult } from '../quote'
import { absoluteUrl } from './http'

/**
 * The JSON shapes of /api/v1. Money is always integer paise, with `currency` alongside;
 * times are ISO 8601 instants in UTC; the restaurant's own clock (hours, slot dates) is in
 * `RESTAURANT.timeZone`.
 */

export const CURRENCY = 'INR'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function restaurantView(now: Date, openNow: boolean, asap: string | null, demo: boolean) {
  const { ordering, delivery } = RESTAURANT
  return {
    name: RESTAURANT.name,
    tagline: RESTAURANT.tagline,
    phone: RESTAURANT.phone,
    email: RESTAURANT.email,
    address: RESTAURANT.address,
    timeZone: RESTAURANT.timeZone,
    hours: DAYS.map((day, weekday) => ({
      weekday,
      day,
      open: RESTAURANT.hours[weekday]?.open ?? null,
      close: RESTAURANT.hours[weekday]?.close ?? null,
    })),
    openNow,
    nextReadyAt: asap,
    serverTime: now.toISOString(),
    currency: CURRENCY,
    ordering: {
      fulfilment: ['DELIVERY', 'PICKUP'],
      paymentMethods: ['ON_DELIVERY'],
      slotMinutes: ordering.slotMinutes,
      ordersPerSlot: ordering.ordersPerSlot,
      prepMinutes: ordering.prepMinutes,
      scheduleDaysAhead: ordering.scheduleDaysAhead,
      minimumOrderPaise: ordering.minimumOrderPaise,
      maxQuantityPerLine: MAX_QUANTITY,
      maxLines: MAX_LINES,
    },
    charges: {
      packagingPaise: RESTAURANT.packagingPaise,
      gstBasisPoints: RESTAURANT.gstBasisPoints,
      gstNote:
        'GST is charged at 5% on the whole bill after any discount, including packing and delivery: half CGST, half SGST.',
      delivery: {
        freeAbovePaise: delivery.freeAbovePaise,
        pincodes: Object.entries(delivery.pincodes).map(([pincode, feePaise]) => ({ pincode, feePaise })),
      },
    },
    demo,
  }
}

export function menuView(request: Request, sections: MenuSection[]) {
  return {
    currency: CURRENCY,
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      items: s.items.map((i) => ({
        id: i.id,
        slug: i.slug,
        name: i.name,
        description: i.description,
        pricePaise: i.pricePaise,
        fromPricePaise: fromPrice(i),
        veg: i.veg,
        spice: i.spice,
        bestseller: i.bestseller,
        available: i.available,
        photoUrl: absoluteUrl(request, i.imagePath),
        variants: i.variants,
        addonGroups: i.addonGroups,
      })),
    })),
  }
}

const totalsView = (t: Totals) => ({
  subtotalPaise: t.subtotalPaise,
  discountPaise: t.discountPaise,
  packagingPaise: t.packagingPaise,
  deliveryFeePaise: t.deliveryFeePaise,
  taxPaise: t.taxPaise,
  totalPaise: t.totalPaise,
})

export function quoteView(q: QuoteResult, slots: { asap: string | null; slots: unknown[] }) {
  return {
    currency: CURRENCY,
    ok: q.quote !== null,
    problem: q.problem ? { code: q.problemCode ?? 'INVALID', message: q.problem } : null,
    coupon: q.couponMessage
      ? { applied: false, code: null, problem: { code: q.couponProblemCode, message: q.couponMessage } }
      : { applied: Boolean(q.quote?.couponCode), code: q.quote?.couponCode ?? null, problem: null },
    lines: q.quote ? q.quote.lines.map(lineView) : [],
    totals: q.quote ? totalsView(q.quote.totals) : null,
    slots,
  }
}

const lineView = (l: Quote['lines'][number]) => ({
  itemId: l.itemId,
  name: l.name,
  variantId: l.variantId,
  variantName: l.variantName,
  addons: l.addons,
  quantity: l.quantity,
  unitPricePaise: l.unitPricePaise,
  lineTotalPaise: l.lineTotalPaise,
})

const STEPS: Record<'DELIVERY' | 'PICKUP', OrderStatus[]> = {
  DELIVERY: ['PLACED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'],
  PICKUP: ['PLACED', 'PREPARING', 'READY', 'COLLECTED'],
}
const UNHAPPY: OrderStatus[] = ['CANCELLED', 'REJECTED', 'EXPIRED']

/** One order as its customer sees it: what the web order page shows. */
export function orderView(order: NonNullable<OrderView>) {
  const steps = STEPS[order.fulfilment]
  const reached = steps.indexOf(order.status)
  const unhappy = UNHAPPY.includes(order.status)
  const open = !unhappy && !isFinal(order.status)
  return {
    code: order.code,
    status: order.status,
    statusLabel: CUSTOMER_LABEL[order.status],
    final: isFinal(order.status),
    fulfilment: order.fulfilment,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    readyBy: order.slotStart.toISOString(),
    scheduled: order.scheduled,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    canCancel: order.status === 'PLACED',
    steps:
      unhappy || order.status === 'AWAITING_PAYMENT'
        ? []
        : steps.map((status, i) => ({
            status,
            label: CUSTOMER_LABEL[status],
            done: i < reached || (i === reached && isFinal(order.status)),
            current: i === reached && !isFinal(order.status),
          })),
    rejectReason: order.rejectReason,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    address: order.address,
    notes: order.notes,
    currency: CURRENCY,
    items: order.items.map((i) => ({
      id: i.id,
      itemId: i.itemId,
      name: i.name,
      variantName: i.variantName,
      addons: i.addons,
      quantity: i.quantity,
      unitPricePaise: i.unitPricePaise,
      lineTotalPaise: i.lineTotalPaise,
    })),
    couponCode: order.couponCode,
    totals: totalsView(order),
    cashDuePaise: order.paymentMethod === 'ON_DELIVERY' && open ? order.totalPaise : null,
    timeline: order.events.map((e) => ({
      status: e.status,
      label: CUSTOMER_LABEL[e.status],
      actor: e.actor,
      note: e.note,
      at: e.at.toISOString(),
    })),
  }
}

export function orderSummaryView(o: {
  code: string
  status: OrderStatus
  fulfilment: 'DELIVERY' | 'PICKUP'
  totalPaise: number
  createdAt: Date
  slotStart: Date
}) {
  return {
    code: o.code,
    status: o.status,
    statusLabel: CUSTOMER_LABEL[o.status],
    final: isFinal(o.status),
    fulfilment: o.fulfilment,
    totalPaise: o.totalPaise,
    readyBy: o.slotStart.toISOString(),
    createdAt: o.createdAt.toISOString(),
  }
}

/** The kitchen's view of one order's next step: the big button, and whether Reject is offered. */
export function kitchenActions(status: OrderStatus, fulfilment: 'DELIVERY' | 'PICKUP') {
  const next = kitchenNext(status, fulfilment)
  return {
    kitchenNext: next,
    kitchenNextLabel: next ? (KITCHEN_ACTION_LABEL[next] ?? null) : null,
    canReject: canMove(status, 'REJECTED', fulfilment, 'KITCHEN'),
  }
}

export function ticketView(t: KitchenTicket, now: Date) {
  const late =
    !t.later && now.getTime() > Date.parse(t.slotStart) && !['READY', 'OUT_FOR_DELIVERY'].includes(t.status)
  return {
    code: t.code,
    status: t.status,
    fulfilment: t.fulfilment,
    customerName: t.customerName,
    dueAt: t.slotStart,
    placedAt: t.placedAt,
    later: t.later,
    late,
    paidOnline: t.paidOnline,
    totalPaise: t.totalPaise,
    cashToCollectPaise: t.paidOnline ? null : t.totalPaise,
    notes: t.notes,
    pincode: t.pincode,
    items: t.items,
    ...kitchenActions(t.status, t.fulfilment),
  }
}
