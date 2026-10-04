'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { confirmPaymentAction } from '@/app/actions/checkout'
import { cancelOrderAction, reorderAction } from '@/app/actions/customer'
import { cart } from '@/components/cart-store'
import { payWithRazorpay } from '@/components/razorpay'
import { Alert, Button } from '@/components/ui'

export function OrderActions({
  code,
  canCancel,
  canReorder,
  pending,
  prefill,
}: {
  code: string
  canCancel: boolean
  canReorder: boolean
  pending: { keyId: string; providerOrderId: string; amountPaise: number } | null
  prefill: { name: string; contact: string }
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, start] = useTransition()

  if (!canCancel && !canReorder && !pending) return null

  return (
    <div className="space-y-2">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {pending && (
          <Button
            variant="accent"
            className="flex-1"
            busy={busy}
            onClick={() =>
              start(async () => {
                const response = await payWithRazorpay({ ...pending, orderCode: code, prefill }).catch(
                  () => null,
                )
                if (response) {
                  const result = await confirmPaymentAction(response)
                  if (!result.ok) setError(result.message)
                }
                router.refresh()
              })
            }
          >
            Complete payment
          </Button>
        )}
        {canReorder && (
          <Button
            className="flex-1"
            busy={busy}
            onClick={() =>
              start(async () => {
                const result = await reorderAction(code)
                if (!result.ok) return setError(result.message)
                for (const line of result.data) cart.add(line)
                router.push('/cart')
              })
            }
          >
            Order this again
          </Button>
        )}
        {canCancel && !confirming && (
          <Button variant="secondary" className="!text-chilli-600 flex-1" onClick={() => setConfirming(true)}>
            Cancel order
          </Button>
        )}
      </div>
      {confirming && (
        <div className="rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
          <p className="text-chilli-600 text-sm">
            Cancel this order? You can only do this before the kitchen starts cooking.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              variant="danger"
              busy={busy}
              onClick={() =>
                start(async () => {
                  const result = await cancelOrderAction(code)
                  setConfirming(false)
                  if (!result.ok) setError(result.message)
                  router.refresh()
                })
              }
            >
              Yes, cancel
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
