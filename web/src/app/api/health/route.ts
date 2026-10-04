import { sql } from 'drizzle-orm'
import { db } from '@/db/client'

export const dynamic = 'force-dynamic'

/** Healthy means the server is up and can reach the database. */
export async function GET() {
  try {
    await db().execute(sql`select 1`)
    return Response.json({ status: 'ok' })
  } catch {
    return Response.json({ status: 'database unavailable' }, { status: 503 })
  }
}
