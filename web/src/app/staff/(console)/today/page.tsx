import type { Metadata } from 'next'
import Link from 'next/link'
import { DishImage } from '@/components/dish-image'
import { db } from '@/db/client'
import { formatPaise } from '@/domain/money'
import { CUSTOMER_LABEL, type OrderStatus } from '@/domain/order-status'
import { addDays, formatTime, localDate } from '@/domain/time'
import { requireStaff } from '@/server/auth/current'
import { topUpDemoKitchen } from '@/server/demo-activity'
import { env } from '@/server/env'
import { loadMenu } from '@/server/menu'
import { expireUnpaid, kitchenBoard } from '@/server/orders'
import { bookingsForDay } from '@/server/reservations'
import { salesForDay } from '@/server/sales'

export const metadata: Metadata = { title: 'Today', robots: { index: false } }

const COLUMNS: { status: OrderStatus; label: string }[] = [
  { status: 'PLACED', label: 'New' },
  { status: 'PREPARING', label: 'Cooking' },
  { status: 'READY', label: 'Ready' },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
]

/** The manager's first screen: how the day is going, at a glance. */
export default async function TodayPage() {
  await requireStaff('MANAGER')
  const now = new Date()
  await expireUnpaid(db(), now)
  if (env().DEMO_SEED) await topUpDemoKitchen(db(), now)

  const today = localDate(now)
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const [sales, board, bookings, menu, ...days] = await Promise.all([
    salesForDay(db(), today),
    kitchenBoard(db(), now),
    bookingsForDay(db(), today),
    loadMenu(db()),
    ...week.map((d) => salesForDay(db(), d)),
  ])
  const items = menu.flatMap((s) => s.items)
  const soldOut = items.filter((i) => !i.available)
  const imageFor = new Map(items.map((i) => [i.name, i]))
  const upcoming = bookings.filter((b) => b.status === 'BOOKED' && b.startsAt >= now)
  const late = board.filter((o) => !o.later && o.slotStart < now && o.status !== 'OUT_FOR_DELIVERY').length
  const weekPeak = Math.max(1, ...days.map((d) => d.revenuePaise))

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Today</h1>
        <p className="text-sm text-stone-400">Updated {formatTime(now)}. Refresh for the latest.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sales so far" value={formatPaise(sales.revenuePaise)} />
        <Stat label="Orders" value={String(sales.orders)} />
        <Stat label="Average order" value={formatPaise(sales.averagePaise)} />
        <Stat label="Tables booked" value={String(bookings.filter((b) => b.status !== 'CANCELLED').length)} />
      </div>

      <section className="rounded-2xl bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">In the kitchen now</h2>
          <Link href="/staff" className="text-saffron-700 text-sm font-semibold">
            Open kitchen →
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {COLUMNS.map((c) => (
            <li key={c.status} className="rounded-xl bg-stone-50 p-3">
              <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{c.label}</p>
              <p className="font-display text-3xl font-semibold tabular-nums">
                {board.filter((o) => o.status === c.status && !o.later).length}
              </p>
            </li>
          ))}
        </ul>
        {late > 0 && (
          <p className="text-chilli-600 mt-3 text-sm font-semibold">
            {late} {late === 1 ? 'order is' : 'orders are'} past their promised time.
          </p>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-2xl bg-white p-4">
          <h2 className="mb-3 font-semibold">Best sellers today</h2>
          {sales.topItems.length === 0 ? (
            <p className="text-sm text-stone-500">No orders yet today.</p>
          ) : (
            <ol className="space-y-2">
              {sales.topItems.slice(0, 5).map((item) => {
                const dish = imageFor.get(item.name)
                return (
                  <li key={item.name} className="flex items-center gap-3">
                    <DishImage
                      src={dish?.imagePath ?? null}
                      name={item.name}
                      veg={dish?.veg ?? true}
                      className="size-12 shrink-0 rounded-xl"
                      sizes="48px"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
                    <span className="text-sm text-stone-500 tabular-nums">× {item.quantity}</span>
                    <span className="w-20 text-right text-sm tabular-nums">{formatPaise(item.revenuePaise)}</span>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Next tables</h2>
            <Link href="/staff/reservations" className="text-saffron-700 text-sm font-semibold">
              All bookings →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-stone-500">No more bookings today.</p>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {upcoming.slice(0, 5).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="font-semibold tabular-nums">{formatTime(b.startsAt)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {b.guestName ?? 'Guest'} · {b.partySize} people
                    {b.notes && <span className="text-stone-500"> · {b.notes}</span>}
                  </span>
                  <span className="rounded-lg bg-stone-100 px-2 py-0.5 font-semibold">{b.table}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-2xl bg-white p-4">
          <h2 className="mb-3 font-semibold">Last 7 days</h2>
          <ol className="flex h-40 items-end gap-2" aria-label="Sales over the last 7 days">
            {days.map((d, i) => (
              <li
                key={week[i]}
                className="flex flex-1 flex-col items-center gap-1"
                title={`${formatPaise(d.revenuePaise)}, ${d.orders} orders`}
              >
                <span className="text-[10px] text-stone-500 tabular-nums">
                  {Math.round(d.revenuePaise / 100_000)}k
                </span>
                <span
                  className={`w-full rounded-t ${week[i] === today ? 'bg-saffron-600' : 'bg-saffron-300'}`}
                  style={{ height: `${Math.max(2, (d.revenuePaise / weekPeak) * 110)}px` }}
                />
                <span className="text-[10px] text-stone-500">
                  {new Date(`${week[i]}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short' })}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-2xl bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">Sold out</h2>
            <Link href="/staff/menu" className="text-saffron-700 text-sm font-semibold">
              Menu →
            </Link>
          </div>
          {soldOut.length === 0 ? (
            <p className="text-sm text-stone-500">Everything is available.</p>
          ) : (
            <ul className="flex flex-wrap gap-2 text-sm">
              {soldOut.map((i) => (
                <li key={i.id} className="rounded-full bg-stone-100 px-3 py-1">
                  {i.name}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-stone-500">
            Order status names customers see: {COLUMNS.map((c) => CUSTOMER_LABEL[c.status]).join(' → ')}.
          </p>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{label}</p>
      <p className="font-display mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
