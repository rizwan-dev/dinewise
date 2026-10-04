import type { Metadata } from 'next'
import { db } from '@/db/client'
import { loadMenu } from '@/server/menu'
import { MenuBrowser } from './menu-browser'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Menu',
  description:
    'Starters, curries, biryani, breads and desserts. Order for delivery or pickup in Baner, Pune.',
}

export default async function MenuPage() {
  const sections = await loadMenu(db())
  return <MenuBrowser sections={sections} />
}
