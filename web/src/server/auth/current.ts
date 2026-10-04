import 'server-only'
import { and, eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { db } from '@/db/client'
import { customers, staff } from '@/db/schema'
import { env } from '../env'
import { createSession, deleteSession, findSession, type SessionKind } from './sessions'
import type { StaffRole } from './staff'

/**
 * Who is making this request. Staff and customers have separate cookies and separate session
 * kinds, so a customer cookie can never be presented as a staff one. Checks live here, next
 * to the data, and are called by every page, action and route that needs them; layouts are
 * not relied on, because they do not run for every request.
 */

const COOKIE: Record<SessionKind, string> = { STAFF: 'tl_staff', CUSTOMER: 'tl_customer' }

export async function startSession(kind: SessionKind, subjectId: number) {
  const { token, expiresAt } = await createSession(db(), kind, subjectId)
  ;(await cookies()).set(COOKIE[kind], token, {
    httpOnly: true,
    secure: env().COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function endSession(kind: SessionKind) {
  const store = await cookies()
  const token = store.get(COOKIE[kind])?.value
  if (token) await deleteSession(db(), token)
  store.delete(COOKIE[kind])
}

export type CurrentCustomer = { id: number; phone: string; name: string | null }

export const getCustomer = cache(async (): Promise<CurrentCustomer | null> => {
  const token = (await cookies()).get(COOKIE.CUSTOMER)?.value
  if (!token) return null
  const session = await findSession(db(), 'CUSTOMER', token)
  if (!session) return null
  const [row] = await db()
    .select({ id: customers.id, phone: customers.phone, name: customers.name })
    .from(customers)
    .where(eq(customers.id, session.subjectId))
  return row ?? null
})

export async function requireCustomer(next: string): Promise<CurrentCustomer> {
  const customer = await getCustomer()
  if (!customer) redirect(`/sign-in?next=${encodeURIComponent(next)}`)
  return customer
}

export type CurrentStaff = { id: number; name: string; email: string; role: StaffRole }

export const getStaff = cache(async (): Promise<CurrentStaff | null> => {
  const token = (await cookies()).get(COOKIE.STAFF)?.value
  if (!token) return null
  const session = await findSession(db(), 'STAFF', token)
  if (!session) return null
  const [row] = await db()
    .select({ id: staff.id, name: staff.name, email: staff.email, role: staff.role })
    .from(staff)
    .where(and(eq(staff.id, session.subjectId), eq(staff.active, true)))
  return row ?? null
})

/** For staff pages and actions. Managers can do everything the kitchen can. */
export async function requireStaff(...roles: StaffRole[]): Promise<CurrentStaff> {
  const member = await getStaff()
  if (!member) redirect('/staff/sign-in')
  if (roles.length > 0 && !roles.includes(member.role) && member.role !== 'MANAGER') {
    redirect('/staff?denied=1')
  }
  return member
}
