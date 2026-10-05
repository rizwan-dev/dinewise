import { z } from 'zod'
import { db } from '@/db/client'
import { json, readBody, requireStaffToken, route } from '@/server/api/http'
import { AppError } from '@/server/errors'
import { setAvailability } from '@/server/menu'

export const dynamic = 'force-dynamic'

const body = z.object({ available: z.boolean() })

/** Marks a dish sold out (`available: false`) or back on (`true`). It leaves the menu at once. */
export const POST = route(
  async (request: Request, ctx: RouteContext<'/api/v1/kitchen/menu/[itemId]/availability'>) => {
    await requireStaffToken(request, 'KITCHEN')
    const { itemId: raw } = await ctx.params
    const { available } = await readBody(request, body)
    const itemId = /^\d{1,9}$/.test(raw) ? Number(raw) : 0
    if (!itemId || !(await setAvailability(db(), itemId, available)))
      throw new AppError('NOT_FOUND', 'That dish no longer exists.')
    return json({ itemId, available })
  },
)
