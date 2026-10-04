'use client'

import clsx from 'clsx'
import { useEffect, useRef, useState, useTransition } from 'react'
import { moveOrderAction } from '@/app/actions/staff'
import { LiveRefresh } from '@/components/live-refresh'
import { Alert, Button } from '@/components/ui'
import { formatPaise } from '@/domain/money'
import { KITCHEN_ACTION_LABEL, kitchenNext, type OrderStatus } from '@/domain/order-status'
import { formatTime } from '@/domain/time'

export type Ticket = {
  id: number
  code: string
  status: OrderStatus
  fulfilment: 'DELIVERY' | 'PICKUP'
  customerName: string
  slotStart: string
  later: boolean
  paidOnline: boolean
  totalPaise: number
  notes: string | null
  pincode: string | null
  placedAt: string
  items: { id: number; quantity: number; name: string; details: string }[]
}

const COLUMNS: { status: OrderStatus; title: string }[] = [
  { status: 'PLACED', title: 'New' },
  { status: 'PREPARING', title: 'Cooking' },
  { status: 'READY', title: 'Ready' },
  { status: 'OUT_FOR_DELIVERY', title: 'Out' },
]

const REASONS = ['Item out of stock', 'Kitchen too busy', 'Outside delivery area', 'Closing soon']

/** A short two-tone chime for new orders, generated rather than loaded from a file. */
function chime() {
  try {
    const ctx = new AudioContext()
    ;[880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.18)
      osc.stop(ctx.currentTime + i * 0.18 + 0.32)
    })
  } catch {
    // Sound is a nicety; the screen still updates.
  }
}

export function KitchenBoard({ tickets, denied }: { tickets: Ticket[]; denied: boolean }) {
  const [tab, setTab] = useState<OrderStatus>('PLACED')
  const [sound, setSound] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const seen = useRef<Set<number> | null>(null)
  const [fresh, setFresh] = useState<Set<number>>(new Set())

  // Chime and highlight for orders that were not on the board a moment ago.
  useEffect(() => {
    const ids = new Set(tickets.filter((t) => t.status === 'PLACED').map((t) => t.id))
    if (seen.current) {
      const arrived = [...ids].filter((id) => !seen.current!.has(id))
      if (arrived.length) {
        if (sound) chime()
        setFresh((f) => new Set([...f, ...arrived]))
        setTimeout(() => setFresh((f) => new Set([...f].filter((id) => !arrived.includes(id)))), 8000)
      }
    }
    seen.current = ids
  }, [tickets, sound])

  // Keep "late" badges honest without a server round trip.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const current = tickets.filter((t) => !t.later)
  const later = tickets.filter((t) => t.later)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold">Kitchen</h1>
        <div className="flex items-center gap-3">
          <LiveRefresh url="/api/kitchen/events" />
          <Button
            variant={sound ? 'primary' : 'secondary'}
            onClick={() => {
              setSound(!sound)
              if (!sound) chime()
            }}
          >
            {sound ? '🔔 Sound on' : '🔕 Turn sound on'}
          </Button>
        </div>
      </div>
      {denied && (
        <div className="mb-3">
          <Alert>That page is for managers only.</Alert>
        </div>
      )}

      {/* Phones and portrait tablets: one column at a time, with counts. */}
      <div
        role="tablist"
        aria-label="Order stages"
        className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-white p-1 lg:hidden"
      >
        {COLUMNS.map((c) => {
          const n = current.filter((t) => t.status === c.status).length
          return (
            <button
              key={c.status}
              role="tab"
              aria-selected={tab === c.status}
              onClick={() => setTab(c.status)}
              className={clsx(
                'min-h-11 rounded-lg text-sm font-semibold',
                tab === c.status ? 'bg-stone-900 text-white' : 'text-stone-600',
              )}
            >
              {c.title}{' '}
              {n > 0 && (
                <span
                  className={clsx(
                    'ml-1 rounded-full px-1.5 text-xs',
                    c.status === 'PLACED' ? 'bg-saffron-600 text-white' : 'bg-stone-200 text-stone-700',
                  )}
                >
                  {n}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {COLUMNS.map((c) => {
          const column = current.filter((t) => t.status === c.status)
          return (
            <section
              key={c.status}
              aria-label={c.title}
              className={clsx(tab !== c.status && 'hidden lg:block')}
            >
              <h2 className="mb-2 hidden text-sm font-bold tracking-wide text-stone-500 uppercase lg:block">
                {c.title} · {column.length}
              </h2>
              <ul className="space-y-3">
                {column.length === 0 && (
                  <li className="rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
                    Nothing here
                  </li>
                )}
                {column.map((t) => (
                  <TicketCard key={t.id} ticket={t} fresh={fresh.has(t.id)} now={now} />
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      {later.length > 0 && (
        <details className="mt-6 rounded-2xl bg-white p-4">
          <summary className="cursor-pointer font-semibold">Scheduled for later · {later.length}</summary>
          <ul className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {later.map((t) => (
              <TicketCard key={t.id} ticket={t} fresh={false} now={now} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function TicketCard({ ticket: t, fresh, now }: { ticket: Ticket; fresh: boolean; now: number }) {
  const [busy, start] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const next = kitchenNext(t.status, t.fulfilment)
  const due = Date.parse(t.slotStart)
  const late = !t.later && now > due && !['READY', 'OUT_FOR_DELIVERY'].includes(t.status)

  const go = (to: OrderStatus, note?: string) =>
    start(async () => {
      setError(null)
      const result = await moveOrderAction({ orderId: t.id, to, note })
      if (!result.ok) setError(result.message)
    })

  return (
    <li
      className={clsx(
        'rounded-2xl bg-white p-4 shadow-sm ring-2 transition',
        fresh ? 'ring-saffron-500' : late ? 'ring-chilli-600' : 'ring-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-bold">{t.code}</p>
          <p className="text-sm text-stone-600">{t.customerName}</p>
        </div>
        <div className="text-right">
          <p className={clsx('text-sm font-bold', late ? 'text-chilli-600' : 'text-ink')}>
            {late ? 'LATE · ' : 'Due '}
            {formatTime(new Date(due))}
          </p>
          <p className="text-xs text-stone-500">
            {t.fulfilment === 'DELIVERY' ? `Delivery · ${t.pincode}` : 'Pickup'}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 border-y border-stone-100 py-3">
        {t.items.map((i) => (
          <li key={i.id} className="text-base leading-snug">
            <span className="font-bold">{i.quantity}×</span> {i.name}
            {i.details && <span className="block pl-6 text-sm text-stone-600">{i.details}</span>}
          </li>
        ))}
      </ul>
      {t.notes && (
        <p className="bg-saffron-50 text-saffron-700 mt-2 rounded-lg px-2 py-1 text-sm font-medium">
          Note: {t.notes}
        </p>
      )}
      <p className="mt-2 text-sm font-semibold">
        {t.paidOnline ? (
          <span className="text-leaf-700">Paid online</span>
        ) : (
          <span className="text-saffron-700">Collect {formatPaise(t.totalPaise)} cash</span>
        )}
      </p>

      {error && <p className="text-chilli-600 mt-2 text-sm">{error}</p>}
      {rejecting ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-semibold">Why can it not be accepted? The customer sees this.</p>
          <div className="grid grid-cols-2 gap-2">
            {REASONS.map((r) => (
              <Button
                key={r}
                variant="secondary"
                className="text-xs"
                busy={busy}
                onClick={() => go('REJECTED', r)}
              >
                {r}
              </Button>
            ))}
          </div>
          <Button variant="ghost" className="w-full" onClick={() => setRejecting(false)}>
            Back
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          {next && (
            <Button className="min-h-12 flex-1 text-base" busy={busy} onClick={() => go(next)}>
              {KITCHEN_ACTION_LABEL[next]}
            </Button>
          )}
          {(t.status === 'PLACED' || t.status === 'PREPARING') && (
            <Button variant="ghost" className="!text-chilli-600" onClick={() => setRejecting(true)}>
              Reject
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
