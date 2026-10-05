import type { Fulfilment } from './pricing'

/**
 * An order's life.
 *
 *   AWAITING_PAYMENT ──► PLACED ──► PREPARING ──► READY ──► OUT_FOR_DELIVERY ──► DELIVERED
 *        │                 │            │           └──────► COLLECTED (pickup)
 *        └► EXPIRED        ├► CANCELLED (by the customer, before the kitchen starts)
 *                          └► REJECTED  (by the kitchen, with a reason; refunded if paid)
 *
 * Pay-on-delivery orders start at PLACED; online orders become PLACED once payment is verified.
 */
export const ORDER_STATUSES = [
  'AWAITING_PAYMENT',
  'PLACED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COLLECTED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export type Actor = 'CUSTOMER' | 'KITCHEN' | 'SYSTEM'

type Transition = { to: OrderStatus; by: Actor[] }

const FLOW: Record<OrderStatus, (fulfilment: Fulfilment) => Transition[]> = {
  AWAITING_PAYMENT: () => [
    { to: 'PLACED', by: ['SYSTEM'] },
    { to: 'EXPIRED', by: ['SYSTEM'] },
  ],
  PLACED: () => [
    { to: 'PREPARING', by: ['KITCHEN'] },
    { to: 'CANCELLED', by: ['CUSTOMER'] },
    { to: 'REJECTED', by: ['KITCHEN'] },
  ],
  PREPARING: () => [
    { to: 'READY', by: ['KITCHEN'] },
    { to: 'REJECTED', by: ['KITCHEN'] },
  ],
  READY: (f) =>
    f === 'DELIVERY' ? [{ to: 'OUT_FOR_DELIVERY', by: ['KITCHEN'] }] : [{ to: 'COLLECTED', by: ['KITCHEN'] }],
  OUT_FOR_DELIVERY: () => [{ to: 'DELIVERED', by: ['KITCHEN'] }],
  DELIVERED: () => [],
  COLLECTED: () => [],
  CANCELLED: () => [],
  REJECTED: () => [],
  EXPIRED: () => [],
}

export function canMove(from: OrderStatus, to: OrderStatus, fulfilment: Fulfilment, by: Actor): boolean {
  return FLOW[from](fulfilment).some((t) => t.to === to && t.by.includes(by))
}

/** The one step the kitchen takes next, which becomes the big button on its screen. */
export function kitchenNext(status: OrderStatus, fulfilment: Fulfilment): OrderStatus | null {
  const next = FLOW[status](fulfilment).find((t) => t.by.includes('KITCHEN') && t.to !== 'REJECTED')
  return next?.to ?? null
}

export function isFinal(status: OrderStatus): boolean {
  return ['DELIVERED', 'COLLECTED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(status)
}

/** What the customer's tracking page says at each stage. */
export const CUSTOMER_LABEL: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: 'Waiting for payment',
  PLACED: 'Order received',
  PREPARING: 'Being prepared',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'On the way',
  DELIVERED: 'Delivered',
  COLLECTED: 'Collected',
  CANCELLED: 'Cancelled',
  REJECTED: 'Could not be accepted',
  EXPIRED: 'Payment not completed',
}

export const KITCHEN_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  PREPARING: 'Start cooking',
  READY: 'Mark ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  COLLECTED: 'Collected',
}

/** The reasons offered when the kitchen rejects an order. The customer sees the one chosen. */
export const REJECT_REASONS = [
  'Item out of stock',
  'Kitchen too busy',
  'Outside delivery area',
  'Closing soon',
] as const
