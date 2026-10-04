'use client'

import { useState, useTransition } from 'react'
import { cancelBookingAction, deleteAddressAction } from '@/app/actions/customer'
import { Button } from '@/components/ui'

export function CancelBookingButton({ code }: { code: string }) {
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  if (!confirm) {
    return (
      <Button variant="ghost" className="!text-chilli-600" onClick={() => setConfirm(true)}>
        Cancel
      </Button>
    )
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="danger"
        busy={busy}
        onClick={() =>
          start(async () => {
            const result = await cancelBookingAction(code)
            if (!result.ok) setError(result.message)
          })
        }
      >
        Yes, cancel booking
      </Button>
      {error && <p className="text-chilli-600 text-xs">{error}</p>}
    </div>
  )
}

export function DeleteAddressButton({ id }: { id: number }) {
  const [busy, start] = useTransition()
  return (
    <Button
      variant="ghost"
      busy={busy}
      onClick={() => start(async () => void (await deleteAddressAction(id)))}
      aria-label="Delete address"
    >
      Delete
    </Button>
  )
}
