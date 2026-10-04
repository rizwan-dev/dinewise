'use client'

/**
 * Razorpay Checkout, loaded only when the customer chooses to pay online. The amount and the
 * Razorpay order come from our server; this just opens Razorpay's own payment window.
 */

import { RESTAURANT } from '@/config/restaurant'

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }

type RazorpayOptions = {
  key: string
  order_id: string
  amount: number
  currency: 'INR'
  name: string
  description: string
  prefill: { name: string; contact: string }
  theme: { color: string }
  handler: (response: RazorpayResponse) => void
  modal: { ondismiss: () => void }
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open(): void }
  }
}

let loading: Promise<void> | undefined

function loadScript(): Promise<void> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => {
      loading = undefined
      reject(new Error('Could not load Razorpay'))
    }
    document.body.appendChild(script)
  })
  return loading
}

/** Opens Checkout. Resolves with the signed response, or null if the customer closed it. */
export async function payWithRazorpay(args: {
  keyId: string
  providerOrderId: string
  amountPaise: number
  orderCode: string
  prefill: { name: string; contact: string }
}): Promise<RazorpayResponse | null> {
  await loadScript()
  return new Promise((resolve) => {
    new window.Razorpay!({
      key: args.keyId,
      order_id: args.providerOrderId,
      amount: args.amountPaise,
      currency: 'INR',
      name: RESTAURANT.name,
      description: `Order ${args.orderCode}`,
      prefill: args.prefill,
      theme: { color: '#c2410c' },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => resolve(null) },
    }).open()
  })
}
