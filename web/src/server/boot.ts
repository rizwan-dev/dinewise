import { pool, db } from '@/db/client'
import { runMigrations } from '@/db/migrate'
import { seedDemoActivity } from './demo-activity'
import { env, serverless } from './env'
import { housekeep } from './housekeeping'
import { seedDemo } from './seed'

/**
 * Runs once when the server process starts: check configuration, migrate, seed the demo if
 * asked, and start the housekeeping that releases abandoned payments and old sessions.
 *
 * On serverless hosting every cold start runs this, so it does less: migrations run once per
 * deploy (`vercel-build`), and housekeeping runs from requests and the daily cron instead of
 * a timer.
 */
export async function boot() {
  const e = env() // throws with a readable list if configuration is wrong
  if (!serverless()) await runMigrations(pool())
  if (e.DEMO_SEED) {
    if (await seedDemo(db(), e.DEMO_STAFF_PASSWORD!)) {
      console.log('Demo restaurant created: manager@tadkalane.example and kitchen@tadkalane.example')
    }
    const activity = await seedDemoActivity(db())
    if (activity.orders)
      console.log(`Demo week created: ${activity.orders} orders, ${activity.bookings} bookings`)
  }
  if (serverless()) return

  const run = () => housekeep().catch((error) => console.error('Housekeeping failed', error))
  await run()
  setInterval(run, 60_000).unref()
}
