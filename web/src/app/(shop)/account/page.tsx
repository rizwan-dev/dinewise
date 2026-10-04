import { desc, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'
import { signOutAction } from '@/app/actions/auth'
import { Badge, Button, ButtonLink, Card } from '@/components/ui'
import { db } from '@/db/client'
import { addresses } from '@/db/schema'
import { formatPaise } from '@/domain/money'
import { CUSTOMER_LABEL, isFinal } from '@/domain/order-status'
import { displayPhone } from '@/domain/phone'
import { formatDateTime } from '@/domain/time'
import { requireCustomer } from '@/server/auth/current'
import { customerOrders } from '@/server/orders'
import { customerReservations } from '@/server/reservations'
import { CancelBookingButton, DeleteAddressButton } from './account-buttons'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'My orders', robots: { index: false } }

export default async function AccountPage() {
  const customer = await requireCustomer('/account')
  const [orderList, bookings, saved] = await Promise.all([
    customerOrders(db(), customer.id),
    customerReservations(db(), customer.id),
    db()
      .select()
      .from(addresses)
      .where(eq(addresses.customerId, customer.id))
      .orderBy(desc(addresses.createdAt)),
  ])
  const now = new Date()
  const upcoming = bookings.filter((b) => b.status === 'BOOKED' && b.startsAt > now)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">
            {customer.name ? `Hi, ${customer.name.split(' ')[0]}` : 'Your account'}
          </h1>
          <p className="text-stone-600">+91 {displayPhone(customer.phone)}</p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      </div>

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Table bookings</h2>
          <ul className="space-y-2">
            {upcoming.map((b) => (
              <li key={b.code}>
                <Card className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{formatDateTime(b.startsAt)}</p>
                    <p className="text-sm text-stone-600">
                      Table for {b.partySize} · {b.code}
                    </p>
                  </div>
                  <CancelBookingButton code={b.code} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Orders</h2>
        {orderList.length === 0 ? (
          <Card className="text-center">
            <p className="text-stone-600">No orders yet.</p>
            <ButtonLink href="/menu" className="mt-3">
              Browse the menu
            </ButtonLink>
          </Card>
        ) : (
          <ul className="divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
            {orderList.map((o) => (
              <li key={o.code}>
                <Link
                  href={`/orders/${o.code}`}
                  className="flex items-center justify-between gap-3 p-4 hover:bg-stone-50"
                >
                  <div>
                    <p className="font-semibold">
                      {o.code}{' '}
                      <span className="font-normal text-stone-500">
                        · {o.fulfilment === 'DELIVERY' ? 'Delivery' : 'Pickup'}
                      </span>
                    </p>
                    <p className="text-sm text-stone-600">{formatDateTime(o.createdAt)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{formatPaise(o.totalPaise)}</span>
                    <Badge
                      tone={
                        isFinal(o.status)
                          ? ['DELIVERED', 'COLLECTED'].includes(o.status)
                            ? 'leaf'
                            : 'stone'
                          : 'saffron'
                      }
                    >
                      {CUSTOMER_LABEL[o.status]}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {saved.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Saved addresses</h2>
          <ul className="space-y-2">
            {saved.map((a) => (
              <li key={a.id}>
                <Card className="flex items-center justify-between gap-3">
                  <p className="text-sm">
                    <strong>{a.label}</strong>
                    <br />
                    {[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')} · {a.pincode}
                  </p>
                  <DeleteAddressButton id={a.id} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
