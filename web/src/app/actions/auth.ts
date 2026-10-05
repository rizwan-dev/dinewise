'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/db/client'
import { customers } from '@/db/schema'
import { outboxCode, requestCode, verifyCode } from '@/server/auth/otp'
import { endSession, getCustomer, startSession } from '@/server/auth/current'
import { env } from '@/server/env'
import { type ActionResult, AppError, toResult } from '@/server/errors'
import { clientIp, safeNext } from '@/server/request'

export async function sendCodeAction(
  phone: string,
): Promise<ActionResult<{ phone: string; demoCode: string | null }>> {
  return toResult(async () => {
    const normalised = await requestCode(
      { exec: db(), secret: env().AUTH_SECRET },
      String(phone),
      await clientIp(),
    )
    // Demo mode only: there is no SMS provider, so the code is shown on screen instead.
    const demoCode = env().SMS_MODE === 'outbox' ? await outboxCode(db(), normalised) : null
    return { phone: normalised, demoCode }
  })
}

const verifySchema = z.object({
  phone: z.string(),
  code: z.string(),
  name: z.string().trim().max(60).optional(),
  next: z.string().optional(),
})

export async function verifyCodeAction(
  input: z.input<typeof verifySchema>,
): Promise<ActionResult<{ needsName: boolean }>> {
  const result = await toResult(async () => {
    const { phone, code, name, next } = verifySchema.parse(input)
    const { customerId } = await verifyCode({ exec: db(), secret: env().AUTH_SECRET }, phone, code)
    if (name) await db().update(customers).set({ name }).where(eq(customers.id, customerId))
    await startSession('CUSTOMER', customerId)
    return { next: safeNext(next) }
  })
  if (!result.ok) return result
  redirect(result.data.next)
}

export async function saveNameAction(name: string): Promise<ActionResult> {
  return toResult(async () => {
    const customer = await getCustomer()
    if (!customer) throw new AppError('SIGNED_OUT', 'Please sign in again.')
    const clean = z.string().trim().min(2, 'Enter your name').max(60).safeParse(name)
    if (!clean.success) throw new AppError('INVALID_NAME', 'Enter your name.', 'name')
    await db().update(customers).set({ name: clean.data }).where(eq(customers.id, customer.id))
  })
}

export async function signOutAction() {
  await endSession('CUSTOMER')
  redirect('/')
}
