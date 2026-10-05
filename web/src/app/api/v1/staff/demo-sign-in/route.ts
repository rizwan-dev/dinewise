import { z } from 'zod'
import { db } from '@/db/client'
import { json, readBody, route } from '@/server/api/http'
import { staffSignInResponse } from '@/server/api/staff'
import { demoStaffId } from '@/server/auth/staff'

export const dynamic = 'force-dynamic'

const body = z.object({ role: z.enum(['KITCHEN', 'MANAGER']) })

/** The web's "Try as kitchen / manager" buttons: the demo restaurant only (403 elsewhere). */
export const POST = route(async (request: Request) => {
  const { role } = await readBody(request, body)
  return json(await staffSignInResponse(await demoStaffId(db(), role)))
})
