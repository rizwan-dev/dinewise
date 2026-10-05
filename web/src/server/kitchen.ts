import 'server-only'
import type { Db } from '@/db/client'
import { type OrderStatus } from '@/domain/order-status'
import { topUpDemoKitchen } from './demo-activity'
import { env } from './env'
import { expireUnpaid, kitchenBoard } from './orders'

export type KitchenTicket = {
  id: number
  code: string
  status: OrderStatus
  fulfilment: 'DELIVERY' | 'PICKUP'
  customerName: string
  slotStart: string
  /** Scheduled for more than an hour from now: shown apart from the live columns. */
  later: boolean
  paidOnline: boolean
  totalPaise: number
  notes: string | null
  pincode: string | null
  placedAt: string
  items: { id: number; quantity: number; name: string; details: string }[]
}

/**
 * The tickets on the kitchen screen, for the web board and the mobile app alike. Lapsed online
 * payments are released first, and the public demo keeps its board busy.
 */
export async function kitchenTickets(db: Db, now = new Date()): Promise<KitchenTicket[]> {
  await expireUnpaid(db, now)
  if (env().DEMO_SEED) await topUpDemoKitchen(db, now)
  const board = await kitchenBoard(db, now)
  return board.map((o) => ({
    id: o.id,
    code: o.code,
    status: o.status,
    fulfilment: o.fulfilment,
    customerName: o.customerName,
    slotStart: o.slotStart.toISOString(),
    later: o.later,
    paidOnline: o.paymentMethod === 'ONLINE',
    totalPaise: o.totalPaise,
    notes: o.notes,
    pincode: o.address?.pincode ?? null,
    placedAt: o.createdAt.toISOString(),
    items: o.items.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      name: i.name,
      details: [i.variantName, ...i.addons.map((a) => a.name)].filter(Boolean).join(' · '),
    })),
  }))
}
