import 'server-only'
import { hmacSha256, safeEqualHex } from '../auth/crypto'

/**
 * Razorpay, behind a small interface. The order and refund calls are the only network calls;
 * everything that decides whether money has arrived is a local signature check.
 *
 * Flow: the server creates a Razorpay order for the amount it calculated (never one sent by
 * the browser), the customer pays in Razorpay Checkout, and the payment is accepted when
 * either the Checkout callback or the webhook arrives with a valid signature, whichever comes
 * first. Both paths are idempotent.
 */

export interface PaymentGateway {
  readonly keyId: string
  createOrder(amountPaise: number, receipt: string, notes: Record<string, string>): Promise<{ id: string }>
  refund(paymentId: string, amountPaise: number): Promise<{ id: string }>
}

/** Checkout's callback signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function isValidCheckoutSignature(
  keySecret: string,
  providerOrderId: string,
  paymentId: string,
  signature: string,
): boolean {
  if (!/^[0-9a-f]{64}$/.test(signature)) return false
  return safeEqualHex(hmacSha256(keySecret, `${providerOrderId}|${paymentId}`), signature)
}

/** Webhook signature: HMAC-SHA256 of the exact raw body with the webhook secret. */
export function isValidWebhookSignature(webhookSecret: string, rawBody: string, signature: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(signature)) return false
  return safeEqualHex(hmacSha256(webhookSecret, rawBody), signature)
}

export class RazorpayGateway implements PaymentGateway {
  constructor(
    readonly keyId: string,
    private readonly keySecret: string,
    private readonly baseUrl = 'https://api.razorpay.com/v1',
  ) {}

  private async call<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      // Razorpay's error body explains the problem; it is logged, never shown to the customer.
      throw new Error(`Razorpay ${path} failed: ${response.status} ${await response.text()}`)
    }
    return (await response.json()) as T
  }

  createOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
    return this.call<{ id: string }>('/orders', { amount: amountPaise, currency: 'INR', receipt, notes })
  }

  refund(paymentId: string, amountPaise: number) {
    return this.call<{ id: string }>(`/payments/${paymentId}/refund`, {
      amount: amountPaise,
      speed: 'normal',
    })
  }
}
