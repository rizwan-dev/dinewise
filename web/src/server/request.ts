import 'server-only'
import { headers } from 'next/headers'
import { env } from './env'

/**
 * The client's IP for rate limiting. Only the last X-Forwarded-For entry is used, and only
 * when a trusted proxy is configured: earlier entries, or the header without a proxy, are
 * whatever the client chose to send.
 */
export async function clientIp(): Promise<string | null> {
  return clientIpFrom(await headers())
}

export function clientIpFrom(requestHeaders: Headers): string | null {
  if (!env().TRUST_PROXY) return null
  const forwarded = requestHeaders.get('x-forwarded-for')
  const last = forwarded?.split(',').at(-1)?.trim()
  return last || null
}

/** A same-site path to return to after sign-in; anything else becomes "/". */
export function safeNext(next: unknown): string {
  return typeof next === 'string' && /^\/(?![/\\])/.test(next) ? next : '/'
}
