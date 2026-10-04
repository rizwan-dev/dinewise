'use client'

import { Button } from '@/components/ui'

/** Anything unexpected: a calm message and a way to try again. Details go to the server log. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-stone-600">It is not you, it is us. Please try again.</p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </main>
  )
}
