import 'server-only'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { staff } from '@/db/schema'
import { createSession } from '../auth/sessions'

/** A staff access token, and who it belongs to. */
export async function staffSignInResponse(staffId: number) {
  const { token, expiresAt } = await createSession(db(), 'STAFF', staffId)
  const [member] = await db()
    .select({ id: staff.id, name: staff.name, email: staff.email, role: staff.role })
    .from(staff)
    .where(eq(staff.id, staffId))
  return { accessToken: token, tokenType: 'Bearer', expiresAt: expiresAt.toISOString(), staff: member }
}
