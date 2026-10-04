import 'server-only'
import { db } from '@/db/client'
import { env } from './env'
import { type PaymentGateway, RazorpayGateway } from './payments/razorpay'

/** The payment gateway, or null when no Razorpay keys are configured (cash only). */
export function gateway(): PaymentGateway | null {
  const e = env()
  return e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET
    ? new RazorpayGateway(e.RAZORPAY_KEY_ID, e.RAZORPAY_KEY_SECRET)
    : null
}

export function deps(now = new Date()) {
  return { db: db(), gateway: gateway(), now }
}
