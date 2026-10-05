import { json, requireStaffToken, route } from '@/server/api/http'

export const dynamic = 'force-dynamic'

/** The signed-in staff member. */
export const GET = route(async (request: Request) => {
  const { id, name, email, role } = await requireStaffToken(request)
  return json({ staff: { id, name, email, role } })
})
