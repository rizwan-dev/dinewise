'use client'

import { useTransition } from 'react'
import { reservationStatusAction } from '@/app/actions/staff'
import { Badge, Button } from '@/components/ui'

export function ReservationButtons({ id, status }: { id: number; status: string }) {
  const [busy, start] = useTransition()
  const set = (to: 'SEATED' | 'COMPLETED' | 'NO_SHOW') =>
    start(async () => void (await reservationStatusAction(id, to)))

  if (status === 'BOOKED') {
    return (
      <div className="flex gap-2">
        <Button busy={busy} onClick={() => set('SEATED')}>
          Seat
        </Button>
        <Button variant="ghost" busy={busy} onClick={() => set('NO_SHOW')}>
          No-show
        </Button>
      </div>
    )
  }
  if (status === 'SEATED') {
    return (
      <Button variant="secondary" busy={busy} onClick={() => set('COMPLETED')}>
        Table free
      </Button>
    )
  }
  return <Badge>{status === 'NO_SHOW' ? 'No-show' : status.charAt(0) + status.slice(1).toLowerCase()}</Badge>
}
