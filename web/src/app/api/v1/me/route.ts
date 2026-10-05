import { asc, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { addresses } from '@/db/schema'
import { json, requireCustomerToken, route } from '@/server/api/http'

export const dynamic = 'force-dynamic'

/** The signed-in customer and their saved delivery addresses. */
export const GET = route(async (request: Request) => {
  const customer = await requireCustomerToken(request)
  const saved = await db()
    .select({
      id: addresses.id,
      label: addresses.label,
      line1: addresses.line1,
      line2: addresses.line2,
      landmark: addresses.landmark,
      pincode: addresses.pincode,
    })
    .from(addresses)
    .where(eq(addresses.customerId, customer.id))
    .orderBy(asc(addresses.id))
  return json({ customer, addresses: saved })
})
