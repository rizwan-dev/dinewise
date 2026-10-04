import { and, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Bill } from '@/components/bill'
import { LiveRefresh } from '@/components/live-refresh'
import { Alert, Card, VegMark } from '@/components/ui'
import { RESTAURANT } from '@/config/restaurant'
import { db } from '@/db/client'
import { payments } from '@/db/schema'
import { formatPaise } from '@/domain/money'
import { CUSTOMER_LABEL, isFinal, type OrderStatus } from '@/domain/order-status'
import { maskedPhone } from '@/domain/phone'
import { dayLabel, formatDateTime, formatTime, localDate } from '@/domain/time'
import { getCustomer } from '@/server/auth/current'
import { orderDetails } from '@/server/orders'
import { gateway } from '@/server/runtime'
import { OrderActions } from './order-actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your order', robots: { index: false } }

const STEPS: Record<'DELIVERY' | 'PICKUP', OrderStatus[]> = {
  DELIVERY: ['PLACED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'],
  PICKUP: ['PLACED', 'PREPARING', 'READY', 'COLLECTED'],
}

export default async function OrderPage({ params }: PageProps<'/orders/[code]'>) {
  const { code } = await params
  const order = /^TL-[0-9A-Z]{6}$/.test(code) ? await orderDetails(db(), { code }) : null
  if (!order) notFound()

  const viewer = await getCustomer()
  // Anyone with the link sees the progress; only the customer sees the address and phone.
  const isOwner = viewer?.id === order.customerId
  const steps = STEPS[order.fulfilment]
  const reached = steps.indexOf(order.status)
  const unhappy = ['CANCELLED', 'REJECTED', 'EXPIRED'].includes(order.status)

  let pending: { keyId: string; providerOrderId: string; amountPaise: number } | null = null
  const g = gateway()
  if (isOwner && order.status === 'AWAITING_PAYMENT' && g) {
    const [p] = await db()
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.status, 'CREATED')))
    if (p) pending = { keyId: g.keyId, providerOrderId: p.providerOrderId, amountPaise: p.amountPaise }
  }

  const readyBy = order.slotStart
  const readyLabel = `${dayLabel(localDate(readyBy), new Date())}, ${formatTime(readyBy)}`

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-600">Order {order.code}</p>
          <h1 className="font-display text-3xl font-semibold">{CUSTOMER_LABEL[order.status]}</h1>
          {!unhappy && !isFinal(order.status) && order.status !== 'AWAITING_PAYMENT' && (
            <p className="mt-1 text-stone-700">
              {order.fulfilment === 'DELIVERY' ? 'Expected at your door around' : 'Ready for pickup around'}{' '}
              <strong>{readyLabel}</strong>
            </p>
          )}
        </div>
        {!isFinal(order.status) && <LiveRefresh url={`/api/orders/${order.code}/events`} />}
      </div>

      {order.status === 'REJECTED' && (
        <Alert>
          The restaurant could not accept this order: {order.rejectReason}.
          {order.paymentStatus !== 'NOT_REQUIRED' && ' Your payment is being refunded.'}
        </Alert>
      )}
      {order.status === 'EXPIRED' && (
        <Alert tone="info">The payment was not completed, so the order was not sent to the kitchen.</Alert>
      )}
      {order.paymentStatus === 'REFUND_PENDING' && order.status !== 'REJECTED' && (
        <Alert tone="info">Your refund has been started. Banks usually take 5–7 working days.</Alert>
      )}
      {order.paymentStatus === 'REFUNDED' && <Alert tone="success">Refunded in full.</Alert>}

      {!unhappy && order.status !== 'AWAITING_PAYMENT' && (
        <Card>
          <ol className="flex justify-between gap-1" aria-label="Order progress">
            {steps.map((step, i) => (
              <li
                key={step}
                className="flex flex-1 flex-col items-center gap-1 text-center"
                aria-current={i === reached ? 'step' : undefined}
              >
                <span
                  className={`flex size-8 items-center justify-center rounded-full text-sm font-bold ${i <= reached ? 'bg-leaf-700 text-white' : 'bg-stone-100 text-stone-400'} ${i === reached && !isFinal(order.status) ? 'ring-leaf-600/20 ring-4' : ''}`}
                >
                  {i < reached || isFinal(order.status) ? '✓' : i + 1}
                </span>
                <span
                  className={`text-[11px] leading-tight sm:text-xs ${i <= reached ? 'text-ink font-semibold' : 'text-stone-500'}`}
                >
                  {CUSTOMER_LABEL[step]}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {isOwner && (
        <OrderActions
          code={order.code}
          canCancel={order.status === 'PLACED'}
          canReorder={isFinal(order.status)}
          pending={pending}
          prefill={{ name: order.customerName, contact: order.customerPhone }}
        />
      )}

      <Card>
        <h2 className="mb-3 font-semibold">
          {order.fulfilment === 'DELIVERY' ? 'Delivery' : 'Pickup'} ·{' '}
          {order.paymentMethod === 'ONLINE'
            ? 'Paid online'
            : order.fulfilment === 'DELIVERY'
              ? 'Cash on delivery'
              : 'Cash at pickup'}
        </h2>
        <ul className="mb-4 space-y-2 text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span>
                {item.quantity} × {item.name}
                {(item.variantName || item.addons.length > 0) && (
                  <span className="block text-xs text-stone-500">
                    {[item.variantName, ...item.addons.map((a) => a.name)].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              <span className="tabular-nums">{formatPaise(item.lineTotalPaise)}</span>
            </li>
          ))}
        </ul>
        <Bill totals={order} couponCode={order.couponCode} />
        {order.paymentMethod === 'ON_DELIVERY' && !unhappy && !isFinal(order.status) && (
          <p className="bg-saffron-50 text-saffron-700 mt-3 rounded-xl px-3 py-2 text-sm">
            Please keep {formatPaise(order.totalPaise)} ready in cash.
          </p>
        )}
      </Card>

      {isOwner && (
        <Card className="text-sm">
          {order.address ? (
            <p>
              <strong>Deliver to:</strong>{' '}
              {[order.address.line1, order.address.line2, order.address.landmark].filter(Boolean).join(', ')},{' '}
              {order.address.pincode}
            </p>
          ) : (
            <p>
              <strong>Pick up from:</strong> {RESTAURANT.address.street}, {RESTAURANT.address.city}
            </p>
          )}
          <p className="mt-1 text-stone-600">
            {order.customerName} · {maskedPhone(order.customerPhone)}
          </p>
          {order.notes && <p className="mt-1 text-stone-600">Note: {order.notes}</p>}
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">History</h2>
        <ol className="space-y-1 text-sm">
          {order.events.map((e) => (
            <li key={e.id} className="flex justify-between gap-3">
              <span>
                {CUSTOMER_LABEL[e.status]}
                {e.note && <span className="text-stone-500"> · {e.note}</span>}
              </span>
              <time className="shrink-0 text-stone-500">{formatDateTime(e.at)}</time>
            </li>
          ))}
        </ol>
      </Card>
      <p className="flex items-center justify-center gap-2 text-xs text-stone-500">
        <VegMark veg /> Prepared fresh in our kitchen in Baner, Pune
      </p>
    </div>
  )
}
