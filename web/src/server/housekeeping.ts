import 'server-only'
import { db } from '@/db/client'
import { purgeExpiredSessions } from './auth/sessions'
import { serverless } from './env'
import { expireUnpaid } from './orders'

/** Releases abandoned online payments (and their kitchen slots and coupons), and old sessions. */
export async function housekeep() {
  await expireUnpaid(db())
  await purgeExpiredSessions(db())
}

const EVERY_MS = 60_000
const globalForHousekeeping = globalThis as unknown as { dinewiseLastHousekeeping?: number }

/**
 * On a long-lived server a timer runs housekeeping every minute (see boot). Serverless functions
 * have no timers between requests, so there the pages that depend on it (slots, checkout, the
 * kitchen and tracking pages) call this instead: it runs at most once a minute per instance.
 */
export async function housekeepIfDue(now = Date.now()) {
  if (!serverless()) return
  const last = globalForHousekeeping.dinewiseLastHousekeeping ?? 0
  if (now - last < EVERY_MS) return
  globalForHousekeeping.dinewiseLastHousekeeping = now
  try {
    await housekeep()
  } catch (error) {
    console.error('Housekeeping failed', error)
  }
}
