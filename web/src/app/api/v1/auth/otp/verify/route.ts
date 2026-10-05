import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/client'
import { customers } from '@/db/schema'
import { json, readBody, route } from '@/server/api/http'
import { verifyCode } from '@/server/auth/otp'
import { createSession } from '@/server/auth/sessions'
import { env } from '@/server/env'

export const dynamic = 'force-dynamic'

const body = z.object({
  phone: z.string().max(20),
  code: z.string().max(10),
  name: z.string().trim().min(2).max(60).optional(),
})

/** Checks the code and returns a customer access token. First sign-in creates the customer. */
export const POST = route(async (request: Request) => {
  const { phone, code, name } = await readBody(request, body)
  const { customerId, isNew } = await verifyCode({ exec: db(), secret: env().AUTH_SECRET }, phone, code)
  if (name) await db().update(customers).set({ name }).where(eq(customers.id, customerId))
  const { token, expiresAt } = await createSession(db(), 'CUSTOMER', customerId)
  const [customer] = await db()
    .select({ id: customers.id, phone: customers.phone, name: customers.name })
    .from(customers)
    .where(eq(customers.id, customerId))
  return json({
    accessToken: token,
    tokenType: 'Bearer',
    expiresAt: expiresAt.toISOString(),
    isNewCustomer: isNew,
    customer,
  })
})
