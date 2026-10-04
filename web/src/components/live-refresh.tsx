'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Re-renders the page from the server whenever the event stream reports a change. The page
 * itself stays the source of truth; the stream only says "something changed, look again".
 *
 * The stream is open only while the tab is visible. A hidden tab (a phone in a pocket, a
 * kitchen screen left in the background) holds no connection, and catches up on return.
 */
export function LiveRefresh({ url, onEvent }: { url: string; onEvent?: () => void }) {
  const router = useRouter()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let source: EventSource | null = null
    const refresh = () => {
      onEvent?.()
      router.refresh()
    }
    const open = () => {
      if (source) return
      source = new EventSource(url)
      source.addEventListener('order', refresh)
      source.addEventListener('resync', refresh)
      source.onopen = () => setConnected(true)
      source.onerror = () => setConnected(false)
    }
    const close = () => {
      source?.close()
      source = null
      setConnected(false)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        open()
        router.refresh()
      } else {
        close()
      }
    }

    if (document.visibilityState === 'visible') open()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      close()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [url, router, onEvent])

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-stone-500" aria-live="polite">
      <span className={`size-2 rounded-full ${connected ? 'animate-pulse bg-green-500' : 'bg-stone-300'}`} />
      {connected ? 'Live' : 'Reconnecting…'}
    </span>
  )
}
