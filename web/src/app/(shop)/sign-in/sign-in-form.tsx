'use client'

import { useState, useTransition } from 'react'
import { sendCodeAction, verifyCodeAction } from '@/app/actions/auth'
import { Alert, Button, FieldError, Input, Label } from '@/components/ui'
import { displayPhone } from '@/domain/phone'

export function SignInForm({ next }: { next: string }) {
  const [phone, setPhone] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [demoCode, setDemoCode] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const send = () =>
    start(async () => {
      setError(null)
      const result = await sendCodeAction(phone)
      if (!result.ok) return setError(result.message)
      setSentTo(result.data.phone)
      setDemoCode(result.data.demoCode)
      setCode('')
    })

  const verify = () =>
    start(async () => {
      setError(null)
      const result = await verifyCodeAction({ phone: sentTo!, code, next })
      // On success the action redirects; we only get here on failure.
      if (result && !result.ok) setError(result.message)
    })

  if (!sentTo) {
    return (
      <form className="mt-6 space-y-4" onSubmit={(e) => (e.preventDefault(), send())} noValidate>
        <div>
          <Label htmlFor="phone">Mobile number</Label>
          <div className="flex gap-2">
            <span className="flex min-h-11 items-center rounded-xl bg-stone-100 px-3 text-stone-600">
              +91
            </span>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="98220 11002"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'phone-error' : undefined}
              autoFocus
            />
          </div>
          <FieldError id="phone-error">{error}</FieldError>
        </div>
        <Button
          type="submit"
          className="w-full"
          busy={pending}
          disabled={phone.replace(/\D/g, '').length < 10}
        >
          Send code
        </Button>
      </form>
    )
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={(e) => (e.preventDefault(), verify())} noValidate>
      <p className="text-sm text-stone-600">
        Code sent to <strong className="text-ink">+91 {displayPhone(sentTo)}</strong>.{' '}
        <button type="button" className="text-leaf-700 font-semibold" onClick={() => setSentTo(null)}>
          Change
        </button>
      </p>
      {demoCode && (
        <Alert tone="info">
          Demo mode: no SMS is sent. Your code is <strong className="tracking-widest">{demoCode}</strong>.{' '}
          <button type="button" className="font-semibold underline" onClick={() => setCode(demoCode)}>
            Fill it in
          </button>
        </Alert>
      )}
      <div>
        <Label htmlFor="code">6-digit code</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="text-center text-2xl tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? 'code-error' : undefined}
          autoFocus
        />
        <FieldError id="code-error">{error}</FieldError>
      </div>
      <Button type="submit" className="w-full" busy={pending} disabled={code.length !== 6}>
        Verify and continue
      </Button>
      <button
        type="button"
        className="text-leaf-700 w-full text-sm font-semibold"
        onClick={send}
        disabled={pending}
      >
        Send a new code
      </button>
    </form>
  )
}
