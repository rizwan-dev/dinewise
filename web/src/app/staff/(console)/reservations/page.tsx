import Link from 'next/link'
import { db } from '@/db/client'
import { displayPhone } from '@/domain/phone'
import { addDays, dayLabel, formatTime, localDate } from '@/domain/time'
import { requireStaff } from '@/server/auth/current'
import { bookingsForDay } from '@/server/reservations'
import { ReservationButtons } from './reservation-buttons'

export default async function StaffReservationsPage({ searchParams }: PageProps<'/staff/reservations'>) {
  await requireStaff('MANAGER')
  const now = new Date()
  const requested = (await searchParams).date
  const date =
    typeof requested === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : localDate(now)
  const bookings = await bookingsForDay(db(), date)
  const covers = bookings
    .filter((b) => b.status !== 'CANCELLED' && b.status !== 'NO_SHOW')
    .reduce((n, b) => n + b.partySize, 0)

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Bookings · {dayLabel(date, now)}</h1>
          <p className="text-sm text-stone-600">
            {bookings.length} bookings · {covers} guests expected
          </p>
        </div>
        <div className="flex gap-1">
          <Link
            href={`/staff/reservations?date=${addDays(date, -1)}`}
            className="flex min-h-11 items-center rounded-xl bg-white px-4 font-semibold"
            aria-label="Previous day"
          >
            ‹
          </Link>
          <Link
            href="/staff/reservations"
            className="flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold"
          >
            Today
          </Link>
          <Link
            href={`/staff/reservations?date=${addDays(date, 1)}`}
            className="flex min-h-11 items-center rounded-xl bg-white px-4 font-semibold"
            aria-label="Next day"
          >
            ›
          </Link>
        </div>
      </div>
      {bookings.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-stone-300 p-8 text-center text-stone-500">
          No bookings for this day.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-2xl bg-white">
          {bookings.map((b) => (
            <li
              key={b.id}
              className={`flex flex-wrap items-center justify-between gap-3 p-4 ${['CANCELLED', 'NO_SHOW'].includes(b.status) ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-4">
                <div className="w-16 text-center">
                  <p className="font-bold">{formatTime(b.startsAt)}</p>
                  <p className="text-xs text-stone-500">{b.table}</p>
                </div>
                <div>
                  <p className="font-semibold">
                    {b.guestName ?? 'Guest'} · {b.partySize} {b.partySize === 1 ? 'guest' : 'guests'}
                  </p>
                  <p className="text-sm text-stone-600">
                    +91 {displayPhone(b.guestPhone)} · {b.code}
                  </p>
                  {b.notes && <p className="text-saffron-700 text-sm">{b.notes}</p>}
                </div>
              </div>
              <ReservationButtons id={b.id} status={b.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
