import { z } from 'zod'
import { db } from '@/db/client'
import { json, readBody, route } from '@/server/api/http'
import { staffSignInResponse } from '@/server/api/staff'
import { authenticateStaff } from '@/server/auth/staff'

export const dynamic = 'force-dynamic'

const body = z.object({ email: z.string().max(200), password: z.string().max(200) })

/** Email and password to a staff access token (12 hours, a shift). */
export const POST = route(async (request: Request) => {
  const { email, password } = await readBody(request, body)
  const id = await authenticateStaff(db(), email, password)
  return json(await staffSignInResponse(id))
})
