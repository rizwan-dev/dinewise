import { sql } from 'drizzle-orm'
import { Pool } from 'pg'
import { afterAll, beforeEach, inject } from 'vitest'
import { useDb } from '../../src/db/client'
import { seedDemo } from '../../src/server/seed'

const url = inject('databaseUrl')
process.env.DATABASE_URL = url

const pool = new Pool({ connectionString: url, max: 30 })
export const db = useDb(pool)

/** Every test starts from the demo restaurant and nothing else. */
beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE sessions, otp_challenges, sms_outbox, addresses, webhook_events, payments,
             coupon_redemptions, order_events, order_items, orders, reservations, dining_tables,
             coupons, addons, addon_groups, item_variants, menu_items, categories, customers, staff
    RESTART IDENTITY CASCADE`)
  await seedDemo(db, 'test-password-123')
})

afterAll(async () => {
  await pool.end()
})
