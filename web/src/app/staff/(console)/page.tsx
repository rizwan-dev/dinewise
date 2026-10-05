import { db } from '@/db/client'
import { requireStaff } from '@/server/auth/current'
import { topUpDemoKitchen } from '@/server/demo-activity'
import { env } from '@/server/env'
import { expireUnpaid, kitchenBoard } from '@/server/orders'
import { KitchenBoard, type Ticket } from './kitchen-board'

export default async function KitchenPage({ searchParams }: PageProps<'/staff'>) {
  await requireStaff('KITCHEN')
  const now = new Date()
  await expireUnpaid(db(), now)
  if (env().DEMO_SEED) await topUpDemoKitchen(db(), now)
  const board = await kitchenBoard(db(), now)
  const denied = (await searchParams).denied === '1'

  const tickets: Ticket[] = board.map((o) => ({
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

  return <KitchenBoard tickets={tickets} denied={denied} />
}
