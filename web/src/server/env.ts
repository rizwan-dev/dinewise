import 'server-only'
import { z } from 'zod'

/**
 * Configuration from the environment, checked once. A missing or malformed setting stops the
 * server at start-up with a clear message instead of failing on the first order.
 */
const schema = z
  .object({
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** The public origin, used for absolute links (tracking pages, the Razorpay callback). */
    APP_URL: z.url().default('http://localhost:3000'),
    /** Keys the hashes of one-time codes, so a leaked table cannot be brute-forced offline. */
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    /** Fill an empty database with the demo restaurant on start-up. */
    DEMO_SEED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    /** Password for the seeded demo staff accounts. Required when DEMO_SEED is true. */
    DEMO_STAFF_PASSWORD: z.string().min(8).optional(),
    /**
     * Show one-time codes on the sign-in screen instead of sending SMS. For the demo and
     * tests only; a real deployment plugs in an SMS provider.
     */
    SMS_MODE: z.enum(['outbox', 'log']).default('outbox'),
    RAZORPAY_KEY_ID: z.string().startsWith('rzp_').optional(),
    RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
    /** Session cookies get the Secure flag unless explicitly turned off for plain-HTTP local runs. */
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .refine((e) => !e.DEMO_SEED || e.DEMO_STAFF_PASSWORD, {
    message: 'DEMO_STAFF_PASSWORD is required when DEMO_SEED=true',
    path: ['DEMO_STAFF_PASSWORD'],
  })
  .refine((e) => !e.RAZORPAY_KEY_ID || e.RAZORPAY_KEY_SECRET, {
    message: 'RAZORPAY_KEY_SECRET is required with RAZORPAY_KEY_ID',
    path: ['RAZORPAY_KEY_SECRET'],
  })

export type Env = z.infer<typeof schema>

let cached: Env | undefined

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env)
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
      throw new Error(`Invalid configuration:\n${problems}`)
    }
    cached = parsed.data
  }
  return cached
}

/** Online payment is offered only when Razorpay keys are configured. */
export function onlinePaymentsEnabled(): boolean {
  const e = env()
  return Boolean(e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET)
}
