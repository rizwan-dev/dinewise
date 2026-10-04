import Link from 'next/link'
import { db } from '@/db/client'
import { formatPaise } from '@/domain/money'
import { addDays, dayLabel, localDate } from '@/domain/time'
import { requireStaff } from '@/server/auth/current'
import { salesForDay } from '@/server/sales'

export default async function SalesPage({ searchParams }: PageProps<'/staff/sales'>) {
  await requireStaff('MANAGER')
  const now = new Date()
  const requested = (await searchParams).date
  const date =
    typeof requested === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : localDate(now)
  const sales = await salesForDay(db(), date)
  const peak = Math.max(1, ...sales.byHour.map((h) => h.orders))
  const cash = sales.byMethod.find((m) => m.method === 'ON_DELIVERY')
  const online = sales.byMethod.find((m) => m.method === 'ONLINE')

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">Sales · {dayLabel(date, now)}</h1>
        <div className="flex gap-1">
          <Link
            href={`/staff/sales?date=${addDays(date, -1)}`}
            className="flex min-h-11 items-center rounded-xl bg-white px-4 font-semibold"
            aria-label="Previous day"
          >
            ‹
          </Link>
          <Link
            href="/staff/sales"
            className="flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold"
          >
            Today
          </Link>
          <Link
            href={`/staff/sales?date=${addDays(date, 1)}`}
            className="flex min-h-11 items-center rounded-xl bg-white px-4 font-semibold"
            aria-label="Next day"
          >
            ›
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sales" value={formatPaise(sales.revenuePaise)} />
        <Stat label="Orders" value={String(sales.orders)} />
        <Stat label="Average order" value={formatPaise(sales.averagePaise)} />
        <Stat label="GST collected" value={formatPaise(sales.taxPaise)} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-2xl bg-white p-4">
          <h2 className="mb-3 font-semibold">Orders by hour</h2>
          {sales.byHour.length === 0 ? (
            <p className="text-sm text-stone-500">No orders yet.</p>
          ) : (
            <ol className="flex h-40 items-end gap-1" aria-label="Orders by hour">
              {sales.byHour.map((h) => (
                <li
                  key={h.hour}
                  className="flex max-w-12 flex-1 flex-col items-center gap-1"
                  title={`${h.orders} orders, ${formatPaise(h.revenuePaise)}`}
                >
                  <span className="text-xs font-semibold">{h.orders}</span>
                  <span
                    className="bg-saffron-500 w-full rounded-t"
                    style={{ height: `${(h.orders / peak) * 100}px` }}
                  />
                  <span className="text-[10px] text-stone-500">{h.hour}h</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4">
          <h2 className="mb-3 font-semibold">Best sellers</h2>
          {sales.topItems.length === 0 ? (
            <p className="text-sm text-stone-500">No orders yet.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {sales.topItems.map((item, i) => (
                <li key={item.name} className="flex justify-between gap-3">
                  <span>
                    {i + 1}. {item.name} <span className="text-stone-500">× {item.quantity}</span>
                  </span>
                  <span className="tabular-nums">{formatPaise(item.revenuePaise)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="rounded-2xl bg-white p-4">
        <h2 className="mb-2 font-semibold">How customers paid</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-stone-600">Online (Razorpay)</dt>
            <dd className="text-lg font-semibold">
              {formatPaise(online?.revenuePaise ?? 0)}{' '}
              <span className="text-sm font-normal text-stone-500">· {online?.orders ?? 0} orders</span>
            </dd>
          </div>
          <div>
            <dt className="text-stone-600">Cash</dt>
            <dd className="text-lg font-semibold">
              {formatPaise(cash?.revenuePaise ?? 0)}{' '}
              <span className="text-sm font-normal text-stone-500">· {cash?.orders ?? 0} orders</span>
            </dd>
          </div>
        </dl>
        {sales.discountPaise > 0 && (
          <p className="mt-2 text-sm text-stone-600">Coupons gave away {formatPaise(sales.discountPaise)}.</p>
        )}
      </section>
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
