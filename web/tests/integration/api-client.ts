import { outboxCode } from '../../src/server/auth/otp'
import { resetEnvForTests } from '../../src/server/env'
import * as otp from '../../src/app/api/v1/auth/otp/route'
import * as verify from '../../src/app/api/v1/auth/otp/verify/route'
import * as staffSignIn from '../../src/app/api/v1/staff/sign-in/route'
import { db } from './setup'

/**
 * Calls /api/v1 route handlers in-process, as Next.js would, against the test database.
 * Configuration is set per test, so demo-only behaviour can be switched on and off.
 */

export function configure({ demo = false }: { demo?: boolean } = {}) {
  Object.assign(process.env, {
    AUTH_SECRET: 'integration-test-secret-0123456789abcdef',
    DEMO_SEED: String(demo),
    DEMO_STAFF_PASSWORD: 'test-password-123',
    SMS_MODE: 'outbox',
    TRUST_PROXY: 'false',
  })
  resetEnvForTests()
}

type Handler = (request: Request, ctx: never) => Promise<Response>

export type Call = {
  token?: string | null
  body?: unknown
  params?: Record<string, string>
  signal?: AbortSignal
}

export function request(method: string, path: string, { token, body, signal }: Call = {}) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    signal,
  })
}

// oxlint-disable-next-line no-explicit-any
export type Json = any

/** Calls a handler and parses its JSON (null for an empty body). */
export async function call(
  handler: Handler,
  method: string,
  path: string,
  options: Call = {},
): Promise<{ status: number; body: Json; headers: Headers }> {
  const response = await raw(handler, method, path, options)
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers }
}

export function raw(handler: Handler, method: string, path: string, options: Call = {}) {
  const ctx = { params: Promise.resolve(options.params ?? {}) }
  return handler(request(method, path, options), ctx as never)
}

/** Signs a customer in through the API, reading the code from the SMS outbox. */
export async function signInCustomer(phone = '9822011002', name?: string): Promise<string> {
  const sent = await call(otp.POST, 'POST', '/api/v1/auth/otp', { body: { phone } })
  if (sent.status !== 200) throw new Error(`otp: ${JSON.stringify(sent.body)}`)
  const code = await outboxCode(db, sent.body.phone)
  const verified = await call(verify.POST, 'POST', '/api/v1/auth/otp/verify', {
    body: { phone, code, ...(name ? { name } : {}) },
  })
  if (verified.status !== 200) throw new Error(`verify: ${JSON.stringify(verified.body)}`)
  return verified.body.accessToken
}

export async function signInStaff(role: 'kitchen' | 'manager' = 'kitchen'): Promise<string> {
  const result = await call(staffSignIn.POST, 'POST', '/api/v1/staff/sign-in', {
    body: { email: `${role}@tadkalane.example`, password: 'test-password-123' },
  })
  if (result.status !== 200) throw new Error(`staff sign-in: ${JSON.stringify(result.body)}`)
  return result.body.accessToken
}

/** Reads a Server-Sent Events response as it arrives. */
export function readEvents(response: Response) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const events: { event: string; data: Json }[] = []
  let buffer = ''
  let subscribed = false
  const pump = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let end: number
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (chunk.startsWith('retry:')) subscribed = true
          const event = /^event: (.+)$/m.exec(chunk)?.[1]
          const data = /^data: (.+)$/m.exec(chunk)?.[1]
          if (event && data) events.push({ event, data: JSON.parse(data) })
        }
      }
    } catch {
      // cancelled
    }
  })()

  const until = (check: () => boolean, what: string) =>
    new Promise<void>((resolve, reject) => {
      const started = Date.now()
      const tick = () =>
        check()
          ? resolve()
          : Date.now() - started > 5_000
            ? reject(new Error(`timed out waiting for ${what}; saw ${JSON.stringify(events)}`))
            : setTimeout(tick, 20)
      tick()
    })

  return {
    events,
    /** The stream sends `retry:` once it is subscribed; changes before that are not seen. */
    ready: () => until(() => subscribed, 'the subscription'),
    waitFor: (n: number) => until(() => events.length >= n, `${n} events`),
    close: async () => {
      await reader.cancel()
      await pump
    },
  }
}
