import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { webhookEvents } from '@/db/schema'
import { env } from '@/server/env'
import { markPaid, markPaymentFailed, markRefunded } from '@/server/orders'
import { isValidWebhookSignature } from '@/server/payments/razorpay'
import { deps } from '@/server/runtime'

export const dynamic = 'force-dynamic'

type RazorpayEvent = {
  event: string
  payload: {
    payment?: { entity: { id: string; order_id: string } }
    refund?: { entity: { id: string; payment_id: string } }
  }
}

/**
 * Razorpay's server-to-server notifications: the source of truth when a customer closes the
 * tab before the Checkout callback reaches us. The signature is checked over the exact raw
 * body, each event id is processed once, and every handler is idempotent anyway, because
 * Razorpay retries until it gets a 2xx.
 */
export async function POST(request: Request) {
  const secret = env().RAZORPAY_WEBHOOK_SECRET
  if (!secret) return new Response('Webhooks are not configured', { status: 404 })

  const raw = await request.text()
  const signature = request.headers.get('x-razorpay-signature') ?? ''
  if (!isValidWebhookSignature(secret, raw, signature))
    return new Response('Invalid signature', { status: 400 })

  const eventId = request.headers.get('x-razorpay-event-id')
  const event = JSON.parse(raw) as RazorpayEvent
  if (eventId) {
    const [fresh] = await db()
      .insert(webhookEvents)
      .values({ id: eventId, type: event.event })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id })
    if (!fresh) return Response.json({ status: 'duplicate' })
  }

  try {
    const payment = event.payload.payment?.entity
    switch (event.event) {
      case 'payment.captured':
      case 'order.paid':
        if (payment) await markPaid(deps(), payment.order_id, payment.id)
        break
      case 'payment.failed':
        if (payment) await markPaymentFailed(db(), payment.order_id)
        break
      case 'refund.processed':
        if (event.payload.refund) await markRefunded(db(), event.payload.refund.entity.payment_id)
        break
    }
  } catch (error) {
    // Forget the event so Razorpay's retry is processed rather than skipped as a duplicate.
    if (eventId) await db().delete(webhookEvents).where(eq(webhookEvents.id, eventId))
    console.error('Webhook processing failed', error)
    return new Response('Processing failed', { status: 500 })
  }
  return Response.json({ status: 'ok' })
}
