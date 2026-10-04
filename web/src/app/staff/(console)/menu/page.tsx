import { db } from '@/db/client'
import { requireStaff } from '@/server/auth/current'
import { serverless } from '@/server/env'
import { loadMenu } from '@/server/menu'
import { MenuManager } from './menu-manager'

export default async function StaffMenuPage() {
  const member = await requireStaff('KITCHEN')
  const sections = await loadMenu(db())
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold">Menu</h1>
      <p className="mb-4 text-sm text-stone-600">
        Mark dishes sold out the moment you run out: customers see it straight away.
        {member.role === 'MANAGER' ? ' Tap a dish to edit its price, description or photo.' : ''}
      </p>
      <MenuManager sections={sections} canEdit={member.role === 'MANAGER'} photoUploads={!serverless()} />
    </div>
  )
}
