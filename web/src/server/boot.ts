import { pool, db } from '@/db/client'
import { runMigrations } from '@/db/migrate'
import { purgeExpiredSessions } from './auth/sessions'
import { env } from './env'
import { expireUnpaid } from './orders'
import { seedDemo } from './seed'

/**
 * Runs once when the server process starts: check configuration, migrate, seed the demo if
 * asked, and start the housekeeping that releases abandoned payments and old sessions.
 */
export async function boot() {
  const e = env() // throws with a readable list if configuration is wrong
  await runMigrations(pool())
  if (e.DEMO_SEED && (await seedDemo(db(), e.DEMO_STAFF_PASSWORD!))) {
    console.log('Demo restaurant created: manager@tadkalane.example and kitchen@tadkalane.example')
  }

  const housekeeping = async () => {
    try {
      await expireUnpaid(db())
      await purgeExpiredSessions(db())
    } catch (error) {
      console.error('Housekeeping failed', error)
    }
  }
  await housekeeping()
  setInterval(housekeeping, 60_000).unref()
}
