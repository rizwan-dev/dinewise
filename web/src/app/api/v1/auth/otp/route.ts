import { z } from 'zod'
import { db } from '@/db/client'
import { json, readBody, route } from '@/server/api/http'
import { OTP_TTL_MS, outboxCode, requestCode } from '@/server/auth/otp'
import { env } from '@/server/env'
import { clientIpFrom } from '@/server/request'

export const dynamic = 'force-dynamic'

const body = z.object({ phone: z.string().max(20) })

/**
 * Sends a one-time sign-in code, with the same limits as the web (3 per phone per 10 minutes,
 * 10 per network per hour). In the demo only, the response carries the code itself, as the
 * web's "Fill it in" button does; a real installation never returns it.
 */
export const POST = route(async (request: Request) => {
  const { phone } = await readBody(request, body)
  const e = env()
  const normalised = await requestCode(
    { exec: db(), secret: e.AUTH_SECRET },
    phone,
    clientIpFrom(request.headers),
  )
  const demo = e.DEMO_SEED && e.SMS_MODE === 'outbox'
  return json({
    phone: normalised,
    expiresInSeconds: OTP_TTL_MS / 1000,
    ...(demo ? { demoCode: await outboxCode(db(), normalised) } : {}),
  })
})
