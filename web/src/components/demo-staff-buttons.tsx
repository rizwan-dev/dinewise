'use client'

import { useState, useTransition } from 'react'
import { demoStaffSignInAction } from '@/app/actions/staff'
import { Alert, Button } from '@/components/ui'

/** "Try as kitchen" / "Try as manager": the demo's way into the staff side, no password. */
export function DemoStaffButtons({ className }: { className?: string }) {
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const signIn = (role: 'KITCHEN' | 'MANAGER') =>
    start(async () => {
      const result = await demoStaffSignInAction(role)
      if (result && !result.ok) setError(result.message)
    })

  return (
    <div className={className}>
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button busy={busy} onClick={() => signIn('KITCHEN')}>
          Try as kitchen
        </Button>
        <Button variant="secondary" busy={busy} onClick={() => signIn('MANAGER')}>
          Try as manager
        </Button>
      </div>
    </div>
  )
}
