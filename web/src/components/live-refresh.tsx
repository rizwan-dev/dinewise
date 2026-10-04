'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Re-renders the page from the server whenever the event stream reports a change. The page
 * itself stays the source of truth; the stream only says "something changed, look again".
 */
export function LiveRefresh({ url, onEvent }: { url: string; onEvent?: () => void }) {
  const router = useRouter()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const source = new EventSource(url)
    const refresh = () => {
      onEvent?.()
      router.refresh()
    }
    source.addEventListener('order', refresh)
    source.addEventListener('resync', refresh)
    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false)
    // Coming back to a tab that slept: catch up at once.
    const onVisible = () => document.visibilityState === 'visible' && router.refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      source.close()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [url, router, onEvent])

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-stone-500" aria-live="polite">
      <span className={`size-2 rounded-full ${connected ? 'animate-pulse bg-green-500' : 'bg-stone-300'}`} />
      {connected ? 'Live' : 'Reconnecting…'}
    </span>
  )
}
