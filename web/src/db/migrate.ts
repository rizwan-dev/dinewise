import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import path from 'node:path'
import type { Pool } from 'pg'

/**
 * Applies pending migrations. Several app instances may start at once, so they take a
 * session-level advisory lock first: one migrates, the others wait and then find nothing to do.
 */
export async function runMigrations(pool: Pool, folder = path.join(process.cwd(), 'drizzle')) {
  const client = await pool.connect()
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('tadka:migrations'))")
    await migrate(drizzle(client), { migrationsFolder: folder })
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('tadka:migrations'))").catch(() => {})
    client.release()
  }
}
