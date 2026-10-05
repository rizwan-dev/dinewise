import { timingSafeEqual } from 'node:crypto'
import { db } from '@/db/client'
import { seedDemoActivity } from '@/server/demo-activity'
import { env } from '@/server/env'
import { housekeep } from '@/server/housekeeping'
import { resetDemo } from '@/server/seed'

export const dynamic = 'force-dynamic'

/**
 * The daily job, called by Vercel Cron (see vercel.json) with `Authorization: Bearer
 * $CRON_SECRET`. Runs housekeeping, and on a public demo wipes and re-seeds the restaurant.
 */
export async function GET(request: Request) {
  const e = env()
  if (!e.CRON_SECRET || !sameSecret(request.headers.get('authorization'), `Bearer ${e.CRON_SECRET}`)) {
    return new Response('Unauthorized', { status: 401 })
  }

  await housekeep()
  const reset = e.DEMO_SEED && e.DEMO_DAILY_RESET
  if (reset) {
    await resetDemo(db(), e.DEMO_STAFF_PASSWORD!)
    await seedDemoActivity(db())
  }
  return Response.json({ ok: true, reset })
}

function sameSecret(given: string | null, expected: string): boolean {
  const a = Buffer.from(given ?? '')
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
