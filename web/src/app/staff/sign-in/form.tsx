'use client'

import { useState, useTransition } from 'react'
import { staffSignInAction } from '@/app/actions/staff'
import { Alert, Button, Input, Label } from '@/components/ui'

export function StaffSignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()

  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const result = await staffSignInAction({ email, password })
          if (result && !result.ok) setError(result.message)
        })
      }}
    >
      {error && <Alert>{error}</Alert>}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" busy={busy}>
        Sign in
      </Button>
    </form>
  )
}
