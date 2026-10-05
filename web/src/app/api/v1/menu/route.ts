import { db } from '@/db/client'
import { json, route } from '@/server/api/http'
import { menuView } from '@/server/api/views'
import { loadMenu } from '@/server/menu'

export const dynamic = 'force-dynamic'

/** The whole menu in display order, sold-out dishes included (marked unavailable). */
export const GET = route(async (request: Request) => json(menuView(request, await loadMenu(db()))))
