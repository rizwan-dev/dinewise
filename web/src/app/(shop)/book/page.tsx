import type { Metadata } from 'next'
import { RESTAURANT } from '@/config/restaurant'
import { bookableDates } from '@/domain/tables'
import { getCustomer } from '@/server/auth/current'
import { BookingForm } from './booking-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Book a table',
  description: `Reserve a table at ${RESTAURANT.name} in Baner, Pune. Instant confirmation.`,
}

export default async function BookPage() {
  const customer = await getCustomer()
  const now = new Date()
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-semibold">Book a table</h1>
      <p className="mt-1 text-stone-600">
        Instant confirmation. We hold your table for {RESTAURANT.reservations.durationMinutes / 60} hours. For
        groups over {RESTAURANT.reservations.maxPartySize}, please call us.
      </p>
      <BookingForm dates={bookableDates(now)} signedIn={Boolean(customer)} nowIso={now.toISOString()} />
    </div>
  )
}
