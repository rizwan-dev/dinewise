'use client'

import clsx from 'clsx'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useState, useTransition } from 'react'
import {
  confirmPaymentAction,
  placeOrderAction,
  quoteAction,
  type QuoteResult,
  slotsAction,
  type SlotOption,
} from '@/app/actions/checkout'
import { Bill } from '@/components/bill'
import { cart, checkoutPrefs, type CheckoutPrefs, toCartLines, useCart } from '@/components/cart-store'
import { payWithRazorpay } from '@/components/razorpay'
import { Alert, Button, ButtonLink, Card, FieldError, Input, Label, Spinner, Textarea } from '@/components/ui'
import { RESTAURANT } from '@/config/restaurant'
import { formatPaise } from '@/domain/money'
import { displayPhone } from '@/domain/phone'
import { dayLabel, formatTime } from '@/domain/time'

type SavedAddress = {
  id: number
  label: string
  line1: string
  line2: string | null
  landmark: string | null
  pincode: string
}

export function CheckoutForm({
  name: initialName,
  phone,
  addresses,
  onlinePayments,
}: {
  name: string
  phone: string
  addresses: SavedAddress[]
  onlinePayments: boolean
}) {
  const router = useRouter()
  const { lines, count } = useCart()
  // Rendered in the browser only, so saved choices are read straight away.
  const [prefs] = useState<CheckoutPrefs>(() => checkoutPrefs.read())
  const [now] = useState(() => new Date())
  const [name, setName] = useState(initialName)
  const [addressId, setAddressId] = useState<number | 'new'>(
    () => (addresses.find((a) => a.pincode === prefs.pincode) ?? addresses[0])?.id ?? 'new',
  )
  const [draft, setDraft] = useState({
    label: 'Home',
    line1: '',
    line2: '',
    landmark: '',
    pincode: prefs.pincode,
  })
  const [saveAddress, setSaveAddress] = useState(true)
  const [when, setWhen] = useState<'ASAP' | 'LATER'>('ASAP')
  const [slot, setSlot] = useState<string>('')
  const [slots, setSlots] = useState<{ asap: string | null; slots: SlotOption[] } | null>(null)
  const [payment, setPayment] = useState<'ONLINE' | 'ON_DELIVERY'>(onlinePayments ? 'ONLINE' : 'ON_DELIVERY')
  const [notes, setNotes] = useState('')
  const [quote, setQuote] = useState<QuoteResult | null>(null)
  const [error, setError] = useState<{ message: string; field?: string } | null>(null)
  const [placing, startPlacing] = useTransition()

  useEffect(() => {
    slotsAction().then(setSlots)
  }, [])

  const delivery = prefs.fulfilment === 'DELIVERY'
  const chosenAddress = addresses.find((a) => a.id === addressId)
  const pincode = delivery ? (chosenAddress?.pincode ?? draft.pincode) : null
  // A delivery total needs a pincode; until then the bill is not shown.
  const canQuote = lines.length > 0 && (!delivery || /^\d{6}$/.test(pincode ?? ''))

  useEffect(() => {
    if (!canQuote) return
    quoteAction({
      lines: toCartLines(lines),
      fulfilment: prefs.fulfilment,
      pincode,
      couponCode: prefs.couponCode || null,
    }).then(setQuote)
  }, [canQuote, lines, prefs, pincode])

  const days = useMemo(() => {
    const byDay = new Map<string, SlotOption[]>()
    for (const s of slots?.slots ?? []) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s])
    return [...byDay.entries()]
  }, [slots])
  const [day, setDay] = useState<string>('')
  const activeDay = day || days[0]?.[0] || ''

  if (count === 0 && !placing) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-display text-3xl font-semibold">Nothing to check out</h1>
        <ButtonLink href="/menu" className="mt-6">
          Browse the menu
        </ButtonLink>
      </div>
    )
  }

  const shownQuote = canQuote ? quote : null
  const total = shownQuote?.quote?.totals.totalPaise
  const place = () =>
    startPlacing(async () => {
      setError(null)
      const result = await placeOrderAction({
        lines: toCartLines(lines),
        name,
        fulfilment: prefs.fulfilment,
        addressId: delivery && typeof addressId === 'number' ? addressId : null,
        newAddress:
          delivery && addressId === 'new'
            ? { ...draft, line2: draft.line2 || null, landmark: draft.landmark || null }
            : null,
        saveAddress,
        slot: when === 'ASAP' ? 'ASAP' : slot,
        paymentMethod: payment,
        couponCode: prefs.couponCode || null,
        notes: notes || null,
      })
      if (!result.ok) {
        setError({ message: result.message, field: result.field })
        if (result.field === 'slot') slotsAction().then(setSlots)
        return
      }
      const { code, payment: pay, prefill } = result.data
      cart.clear()
      if (pay) {
        const response = await payWithRazorpay({ ...pay, orderCode: code, prefill }).catch(() => null)
        if (response) await confirmPaymentAction(response)
      }
      router.push(`/orders/${code}`)
    })

  return (
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-semibold">Checkout</h1>

        <Card className="space-y-3">
          <h2 className="font-semibold">Your details</h2>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={error?.field === 'name' || undefined}
            />
            <p className="mt-1 text-xs text-stone-500">Phone +91 {displayPhone(phone)} (verified)</p>
          </div>
        </Card>

        {delivery && (
          <Card className="space-y-3">
            <h2 className="font-semibold">Deliver to</h2>
            <div className="space-y-2" role="radiogroup" aria-label="Delivery address">
              {addresses.map((a) => (
                <label
                  key={a.id}
                  className={clsx(
                    'flex cursor-pointer gap-3 rounded-xl p-3 ring-1 ring-inset',
                    addressId === a.id ? 'bg-leaf-50 ring-leaf-600' : 'ring-stone-200',
                  )}
                >
                  <input
                    type="radio"
                    name="address"
                    checked={addressId === a.id}
                    onChange={() => setAddressId(a.id)}
                    className="accent-leaf-700 mt-1"
                  />
                  <span className="text-sm">
                    <strong>{a.label}</strong>
                    <br />
                    {[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')} · {a.pincode}
                  </span>
                </label>
              ))}
              {addresses.length > 0 && (
                <label
                  className={clsx(
                    'flex cursor-pointer items-center gap-3 rounded-xl p-3 ring-1 ring-inset',
                    addressId === 'new' ? 'bg-leaf-50 ring-leaf-600' : 'ring-stone-200',
                  )}
                >
                  <input
                    type="radio"
                    name="address"
                    checked={addressId === 'new'}
                    onChange={() => setAddressId('new')}
                    className="accent-leaf-700"
                  />
                  <span className="text-sm font-semibold">Use a new address</span>
                </label>
              )}
            </div>
            {addressId === 'new' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="line1">House or flat, building and street</Label>
                  <Input
                    id="line1"
                    autoComplete="address-line1"
                    value={draft.line1}
                    onChange={(e) => setDraft({ ...draft, line1: e.target.value })}
                    aria-invalid={error?.field === 'line1' || undefined}
                  />
                </div>
                <div>
                  <Label htmlFor="line2">Area (optional)</Label>
                  <Input
                    id="line2"
                    autoComplete="address-line2"
                    value={draft.line2}
                    onChange={(e) => setDraft({ ...draft, line2: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="landmark">Landmark (optional)</Label>
                  <Input
                    id="landmark"
                    value={draft.landmark}
                    onChange={(e) => setDraft({ ...draft, landmark: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="addr-pincode">Pincode</Label>
                  <Input
                    id="addr-pincode"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="postal-code"
                    value={draft.pincode}
                    onChange={(e) => setDraft({ ...draft, pincode: e.target.value.replace(/\D/g, '') })}
                    aria-invalid={error?.field === 'pincode' || undefined}
                  />
                </div>
                <div>
                  <Label htmlFor="label">Save as</Label>
                  <Input
                    id="label"
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={saveAddress}
                    onChange={(e) => setSaveAddress(e.target.checked)}
                    className="accent-leaf-700 size-4"
                  />
                  Save this address for next time
                </label>
              </div>
            )}
          </Card>
        )}

        <Card className="space-y-3">
          <h2 className="font-semibold">{delivery ? 'When' : 'Pickup time'}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <OptionCard
              checked={when === 'ASAP'}
              onSelect={() => setWhen('ASAP')}
              name="when"
              title="As soon as possible"
              detail={
                slots?.asap
                  ? `Ready by about ${formatTime(new Date(slots.asap))}`
                  : slots
                    ? 'The kitchen is full for now'
                    : 'Checking the kitchen…'
              }
            />
            <OptionCard
              checked={when === 'LATER'}
              onSelect={() => setWhen('LATER')}
              name="when"
              title="Schedule for later"
              detail="Today or the next two days"
            />
          </div>
          {when === 'LATER' && (
            <div className="space-y-3">
              <div className="-mx-1 flex scrollbar-none gap-2 overflow-x-auto px-1">
                {days.map(([date]) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => {
                      setDay(date)
                      setSlot('')
                    }}
                    aria-pressed={activeDay === date}
                    className={clsx(
                      'min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ring-1 ring-inset',
                      activeDay === date ? 'bg-leaf-700 ring-leaf-700 text-white' : 'bg-white ring-stone-300',
                    )}
                  >
                    {dayLabel(date, now)}
                  </button>
                ))}
              </div>
              <label htmlFor="slot" className="sr-only">
                Time
              </label>
              <select
                id="slot"
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
                className="block min-h-11 w-full rounded-xl bg-white px-3 text-base ring-1 ring-stone-300 ring-inset sm:text-sm"
                aria-invalid={error?.field === 'slot' || undefined}
              >
                <option value="">Choose a time</option>
                {days
                  .find(([date]) => date === activeDay)?.[1]
                  .map((s) => (
                    <option key={s.value} value={s.value} disabled={s.full}>
                      {formatTime(new Date(s.startsAt))}
                      {s.full ? ' (full)' : ''}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {error?.field === 'slot' && <FieldError id="slot-error">{error.message}</FieldError>}
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">Payment</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {onlinePayments && (
              <OptionCard
                checked={payment === 'ONLINE'}
                onSelect={() => setPayment('ONLINE')}
                name="payment"
                title="Pay online"
                detail="UPI, cards or netbanking via Razorpay"
              />
            )}
            <OptionCard
              checked={payment === 'ON_DELIVERY'}
              onSelect={() => setPayment('ON_DELIVERY')}
              name="payment"
              title={delivery ? 'Cash on delivery' : 'Cash at pickup'}
              detail={delivery ? 'Pay the rider in cash' : 'Pay at the counter in cash'}
            />
          </div>
        </Card>

        <Card>
          <Label htmlFor="notes">Note for the kitchen (optional)</Label>
          <Textarea
            id="notes"
            maxLength={300}
            placeholder="Less spicy, no onions, ring the bell twice…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Card>
      </div>

      <aside className="space-y-3 md:sticky md:top-20 md:self-start">
        <Card>
          <h2 className="mb-3 font-semibold">
            {count} {count === 1 ? 'item' : 'items'}
          </h2>
          {!canQuote ? (
            <p className="text-sm text-stone-600">Add your address to see the total.</p>
          ) : shownQuote?.problem ? (
            <Alert>{shownQuote.problem}</Alert>
          ) : shownQuote?.quote ? (
            <Bill totals={shownQuote.quote.totals} couponCode={shownQuote.quote.couponCode} />
          ) : (
            <p className="flex items-center gap-2 text-sm text-stone-500">
              <Spinner /> Calculating…
            </p>
          )}
          {shownQuote?.couponMessage && (
            <p className="text-chilli-600 mt-2 text-sm">{shownQuote.couponMessage}</p>
          )}
        </Card>
        {error && error.field !== 'slot' && <Alert>{error.message}</Alert>}
        <Button
          variant="accent"
          className="w-full text-base"
          onClick={place}
          busy={placing}
          disabled={
            !total ||
            Boolean(shownQuote?.problem) ||
            name.trim().length < 2 ||
            (when === 'LATER' && !slot) ||
            (when === 'ASAP' && slots?.asap === null)
          }
        >
          {total
            ? payment === 'ONLINE'
              ? `Pay ${formatPaise(total)}`
              : `Place order · ${formatPaise(total)}`
            : 'Place order'}
        </Button>
        <p className="text-center text-xs text-stone-500">
          {RESTAURANT.name} is a demo.{' '}
          {payment === 'ONLINE' ? 'Razorpay test mode: no real money moves.' : 'No real food will arrive.'}
        </p>
      </aside>
    </div>
  )
}

function OptionCard({
  checked,
  onSelect,
  name,
  title,
  detail,
}: {
  checked: boolean
  onSelect: () => void
  name: string
  title: string
  detail: string
}) {
  const id = useId()
  return (
    // The label's text is the `title` prop, which the linter cannot see.
    // oxlint-disable-next-line jsx-a11y/label-has-associated-control
    <label
      htmlFor={id}
      className={clsx(
        'has-focus-visible:outline-leaf-600 flex cursor-pointer gap-3 rounded-xl p-3 ring-1 ring-inset has-focus-visible:outline-2',
        checked ? 'bg-leaf-50 ring-leaf-600' : 'ring-stone-200',
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="accent-leaf-700 mt-1"
      />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-stone-600">{detail}</span>
      </span>
    </label>
  )
}
