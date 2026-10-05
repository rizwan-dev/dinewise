import { db } from '@/db/client'
import { bearerToken, noContent, requireStaffToken, route } from '@/server/api/http'
import { deleteSession } from '@/server/auth/sessions'

export const dynamic = 'force-dynamic'

/** Revokes the staff token the request carries. */
export const POST = route(async (request: Request) => {
  await requireStaffToken(request)
  await deleteSession(db(), bearerToken(request)!)
  return noContent()
})
