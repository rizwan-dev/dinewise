import { db } from '@/db/client'
import { bearerToken, noContent, requireCustomerToken, route } from '@/server/api/http'
import { deleteSession } from '@/server/auth/sessions'

export const dynamic = 'force-dynamic'

/** Revokes the customer token the request carries. */
export const POST = route(async (request: Request) => {
  await requireCustomerToken(request)
  await deleteSession(db(), bearerToken(request)!)
  return noContent()
})
