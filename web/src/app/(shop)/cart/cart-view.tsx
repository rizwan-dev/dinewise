'use client'

import clsx from 'clsx'
import { useEffect, useState, useTransition } from 'react'
import { quoteAction, type QuoteResult } from '@/app/actions/checkout'
import { Bill } from '@/components/bill'
import { cart, checkoutPrefs, type CheckoutPrefs, toCartLines, useCart } from '@/components/cart-store'
import { Stepper } from '@/components/stepper'
import { Alert, ButtonLink, Card, Input, Label, Spinner, VegMark } from '@/components/ui'
import { RESTAURANT } from '@/config/restaurant'
import { formatPaise } from '@/domain/money'

export function CartView() {
  const { lines, count } = useCart()
  // This view renders in the browser only, so saved choices can be read straight away.
  const [prefs, setPrefs] = useState<CheckoutPrefs>(() => checkoutPrefs.read())
  const [couponInput, setCouponInput] = useState(prefs.couponCode)
  const [result, setResult] = useState<QuoteResult | null>(null)
  const [pending, startTransition] = useTransition()

  const update = (changes: Partial<CheckoutPrefs>) => {
    const next = { ...prefs, ...changes }
    setPrefs(next)
    checkoutPrefs.write(next)
  }

  const pincodeReady = prefs.fulfilment === 'PICKUP' || /^\d{6}$/.test(prefs.pincode)

  // Re-price on the server whenever the cart or choices change. The cart store hands back the
  // same array until the cart actually changes, so `lines` is a safe dependency.
  useEffect(() => {
    if (lines.length === 0) return
    startTransition(async () => {
      setResult(
        await quoteAction({
          lines: toCartLines(lines),
          fulfilment: prefs.fulfilment,
          pincode: prefs.fulfilment === 'DELIVERY' && pincodeReady ? prefs.pincode : null,
          couponCode: prefs.couponCode || null,
        }),
      )
    })
  }, [lines, prefs, pincodeReady])

  if (count === 0) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-display text-3xl font-semibold">Your cart is empty</h1>
        <p className="mt-2 text-stone-600">Hungry? The menu is one tap away.</p>
        <ButtonLink href="/menu" className="mt-6">
          Browse the menu
        </ButtonLink>
      </div>
    )
  }

  const quote = result?.quote
  const deliveryNeedsPincode = prefs.fulfilment === 'DELIVERY' && !pincodeReady

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-3xl font-semibold">Your cart</h1>

      <Card>
        <ul className="divide-y divide-stone-100">
          {lines.map((line) => (
            <li key={line.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <VegMark veg={line.veg} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{line.name}</p>
                {(line.variantName || line.addonNames.length > 0) && (
                  <p className="text-xs text-stone-500">
                    {[line.variantName, ...line.addonNames].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="text-sm text-stone-600 tabular-nums">
                  {formatPaise(line.unitPricePaise * line.quantity)}
                </p>
              </div>
              <Stepper
                value={line.quantity}
                min={0}
                onChange={(n) => cart.setQuantity(line.key, n)}
                label={line.name}
              />
            </li>
          ))}
        </ul>
        <ButtonLink href="/menu" variant="ghost" className="!text-leaf-700 mt-2 -ml-2">
          + Add more
        </ButtonLink>
      </Card>

      <Card className="space-y-4">
        <div
          role="radiogroup"
          aria-label="Delivery or pickup"
          className="grid grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1"
        >
          {(['DELIVERY', 'PICKUP'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={prefs.fulfilment === f}
              onClick={() => update({ fulfilment: f })}
              className={clsx(
                'min-h-11 rounded-lg text-sm font-semibold',
                prefs.fulfilment === f ? 'bg-white shadow-sm' : 'text-stone-600',
              )}
            >
              {f === 'DELIVERY' ? 'Delivery' : 'Pickup'}
            </button>
          ))}
        </div>
        {prefs.fulfilment === 'DELIVERY' ? (
          <div>
            <Label htmlFor="pincode">Delivery pincode</Label>
            <Input
              id="pincode"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              placeholder="411045"
              value={prefs.pincode}
              onChange={(e) => update({ pincode: e.target.value.replace(/\D/g, '') })}
            />
            <p className="mt-1 text-xs text-stone-500">
              We deliver to {Object.keys(RESTAURANT.delivery.pincodes).join(', ')}. Free over{' '}
              {formatPaise(RESTAURANT.delivery.freeAbovePaise)}.
            </p>
          </div>
        ) : (
          <p className="text-sm text-stone-600">
            Collect from {RESTAURANT.address.street}, {RESTAURANT.address.city}.
          </p>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            update({ couponCode: couponInput.trim() })
          }}
        >
          <label htmlFor="coupon" className="sr-only">
            Coupon code
          </label>
          <Input
            id="coupon"
            placeholder="Coupon code, e.g. WELCOME50"
            value={couponInput}
            onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
            autoCapitalize="characters"
          />
          {prefs.couponCode && prefs.couponCode === couponInput ? (
            <button
              type="button"
              className="text-chilli-600 min-h-11 shrink-0 px-3 text-sm font-semibold"
              onClick={() => {
                setCouponInput('')
                update({ couponCode: '' })
              }}
            >
              Remove
            </button>
          ) : (
            <button
              type="submit"
              className="text-leaf-700 min-h-11 shrink-0 px-3 text-sm font-semibold"
              disabled={!couponInput.trim()}
            >
              Apply
            </button>
          )}
        </form>
        {result?.couponMessage && <p className="text-chilli-600 -mt-2 text-sm">{result.couponMessage}</p>}
        {quote?.couponCode && <p className="text-leaf-700 -mt-2 text-sm">{quote.couponCode} applied.</p>}
      </Card>

      <Card>
        {deliveryNeedsPincode ? (
          <p className="text-sm text-stone-600">Enter your pincode to see delivery charges and the total.</p>
        ) : result?.problem ? (
          <Alert>{result.problem}</Alert>
        ) : quote ? (
          <div className={clsx(pending && 'opacity-60')}>
            <Bill totals={quote.totals} couponCode={quote.couponCode} />
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-stone-500">
            <Spinner /> Working out your total…
          </p>
        )}
      </Card>

      <ButtonLink
        href="/checkout"
        className={clsx(
          'w-full',
          (!quote || Boolean(result?.problem) || deliveryNeedsPincode || pending) &&
            'pointer-events-none opacity-40',
        )}
        aria-disabled={!quote || Boolean(result?.problem) || deliveryNeedsPincode}
      >
        Continue to checkout
        {quote && !deliveryNeedsPincode ? ` · ${formatPaise(quote.totals.totalPaise)}` : ''}
      </ButtonLink>
    </div>
  )
}
