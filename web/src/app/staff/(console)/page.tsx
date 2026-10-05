import { db } from '@/db/client'
import { requireStaff } from '@/server/auth/current'
import { kitchenTickets } from '@/server/kitchen'
import { KitchenBoard } from './kitchen-board'

export default async function KitchenPage({ searchParams }: PageProps<'/staff'>) {
  await requireStaff('KITCHEN')
  const tickets = await kitchenTickets(db())
  const denied = (await searchParams).denied === '1'
  return <KitchenBoard tickets={tickets} denied={denied} />
}
