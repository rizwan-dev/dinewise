import 'server-only'
import { and, eq, gt, lt } from 'drizzle-orm'
import type { Executor } from '@/db/client'
import { sessions } from '@/db/schema'
import { randomToken, sha256 } from './crypto'

export type SessionKind = 'STAFF' | 'CUSTOMER'

/** Staff sessions end with the shift; customers stay signed in on their own phone. */
export const SESSION_TTL_MS: Record<SessionKind, number> = {
  STAFF: 12 * 60 * 60 * 1000,
  CUSTOMER: 30 * 24 * 60 * 60 * 1000,
}

/** Creates a session and returns the cookie value. Only its hash is stored. */
export async function createSession(
  exec: Executor,
  kind: SessionKind,
  subjectId: number,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS[kind])
  await exec.insert(sessions).values({ id: sha256(token), kind, subjectId, expiresAt })
  return { token, expiresAt }
}

export async function findSession(exec: Executor, kind: SessionKind, token: string, now = new Date()) {
  const [row] = await exec
    .select({ subjectId: sessions.subjectId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.id, sha256(token)), eq(sessions.kind, kind), gt(sessions.expiresAt, now)))
    .limit(1)
  return row
}

export async function deleteSession(exec: Executor, token: string) {
  await exec.delete(sessions).where(eq(sessions.id, sha256(token)))
}

/** Ends every session of one person, e.g. when a staff account is deactivated. */
export async function deleteSessionsFor(exec: Executor, kind: SessionKind, subjectId: number) {
  await exec.delete(sessions).where(and(eq(sessions.kind, kind), eq(sessions.subjectId, subjectId)))
}

export async function purgeExpiredSessions(exec: Executor, now = new Date()) {
  await exec.delete(sessions).where(lt(sessions.expiresAt, now))
}
