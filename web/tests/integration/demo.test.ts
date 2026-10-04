import { count, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { customers, menuItems, reservations, staff } from '../../src/db/schema'
import { localInstant } from '../../src/domain/time'
import { book } from '../../src/server/reservations'
import { resetDemo } from '../../src/server/seed'
import { customer, NOW } from './helpers'
import { db } from './setup'

const rows = async (table: typeof customers | typeof reservations | typeof staff) =>
  (await db.select({ n: count() }).from(table))[0]!.n

describe('the daily demo reset', () => {
  it('removes what visitors did and puts the demo restaurant back', async () => {
    const visitor = await customer()
    await book(
      db,
      { customerId: visitor.id, startsAt: localInstant('2026-10-05', '20:00').toISOString(), partySize: 2 },
      NOW,
    )
    const [dish] = await db.select().from(menuItems).limit(1)
    await db.update(menuItems).set({ name: 'Renamed by a visitor' }).where(eq(menuItems.id, dish!.id))

    expect(await resetDemo(db, 'test-password-123')).toBe(true)

    expect(await rows(customers)).toBe(0)
    expect(await rows(reservations)).toBe(0)
    expect(await rows(staff)).toBe(2)
    const [restored] = await db.select().from(menuItems).where(eq(menuItems.id, dish!.id))
    expect(restored!.name).toBe(dish!.name)
  })
})
