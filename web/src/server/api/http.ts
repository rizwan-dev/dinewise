import 'server-only'
import { z } from 'zod'
import {
  type CurrentCustomer,
  type CurrentStaff,
  customerForToken,
  hasRole,
  staffForToken,
} from '../auth/current'
import type { StaffRole } from '../auth/staff'
import { AppError } from '../errors'

/**
 * The plumbing shared by every /api/v1 route: JSON in and out, one error format, and bearer
 * tokens. Routes stay thin; the rules live in the same server functions the web pages use.
 *
 * Every error is `{ "error": { "code", "message", "field"? } }` with an HTTP status that says
 * what kind of failure it is. `code` is stable and meant for programs; `message` is written for
 * the person using the app and can be shown as it is.
 */

export const API_VERSION = 'v1'

/** HTTP status for each error code; any other expected error is a 422. */
const STATUS: Record<string, number> = {
  INVALID_JSON: 400,
  VALIDATION_FAILED: 400,
  INVALID: 400,
  INVALID_PHONE: 400,
  INVALID_CODE: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_DEMO: 403,
  NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  ADDRESS_NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  SLOT_FULL: 409,
  SLOT_UNAVAILABLE: 409,
  KITCHEN_FULL: 409,
  TOO_MANY_CODES: 429,
  INTERNAL: 500,
}

export function statusFor(code: string): number {
  return STATUS[code] ?? 422
}

const NO_STORE = { 'Cache-Control': 'no-store' }

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } })
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE })
}

export function errorResponse(code: string, message: string, field?: string): Response {
  return json({ error: field ? { code, message, field } : { code, message } }, statusFor(code))
}

/** Coupon rules have short codes of their own (EXPIRED, USED_UP...); the API prefixes them. */
export const couponCode = (code: string) => (code.startsWith('COUPON_') ? code : `COUPON_${code}`)

/** Turns whatever a route threw into the error format. Unexpected errors are logged, not shown. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError) return errorResponse(error.code, error.message, error.field)
  if (error instanceof z.ZodError) {
    const issue = error.issues[0]
    const field = issue?.path.join('.') || undefined
    return errorResponse(
      'VALIDATION_FAILED',
      issue ? `${field ? `${field}: ` : ''}${issue.message}` : 'The request is not valid.',
      field,
    )
  }
  const named = error as { name?: string; code?: string; message?: string }
  if (named?.name === 'CartError') {
    return errorResponse(named.code ?? 'INVALID', named.message ?? 'Please check your order.')
  }
  if (named?.name === 'CouponError') {
    return errorResponse(couponCode(named.code ?? 'INVALID'), named.message ?? 'That code cannot be used.')
  }
  console.error(error)
  return errorResponse('INTERNAL', 'Something went wrong on our side. Please try again.')
}

/** Wraps a route handler so that every failure comes back in the error format. */
export function route<C>(
  body: (request: Request, ctx: C) => Promise<Response>,
): (request: Request, ctx: C) => Promise<Response> {
  return async (request, ctx) => {
    try {
      return await body(request, ctx)
    } catch (error) {
      return toErrorResponse(error)
    }
  }
}

/** Reads and validates a JSON body. A missing or malformed body is a 400, never a crash. */
export async function readBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T>> {
  let raw: unknown
  try {
    const text = await request.text()
    raw = text.trim() === '' ? {} : JSON.parse(text)
  } catch {
    throw new AppError('INVALID_JSON', 'The request body must be JSON.')
  }
  return schema.parse(raw)
}

// --- Bearer tokens -----------------------------------------------------------------------------

/** The token from `Authorization: Bearer <token>`, or null. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  const match = header?.match(/^Bearer\s+([A-Za-z0-9_-]{20,200})\s*$/i)
  return match?.[1] ?? null
}

const signedOut = () => new AppError('UNAUTHENTICATED', 'Please sign in again.')

/** The customer behind the request's bearer token. Staff tokens are not accepted here. */
export async function requireCustomerToken(request: Request): Promise<CurrentCustomer> {
  const token = bearerToken(request)
  const customer = token ? await customerForToken(token) : null
  if (!customer) throw signedOut()
  return customer
}

/** The staff member behind the bearer token, with one of `roles` (managers pass every check). */
export async function requireStaffToken(request: Request, ...roles: StaffRole[]): Promise<CurrentStaff> {
  const token = bearerToken(request)
  const member = token ? await staffForToken(token) : null
  if (!member) throw signedOut()
  if (!hasRole(member, roles)) throw new AppError('FORBIDDEN', 'Your role cannot do that.')
  return member
}

/**
 * An absolute URL for a path on this server, such as a dish photo, on the host the app called,
 * so it works against the public site and a local stack alike. The request's own URL is not
 * used: behind Next.js's standalone server it names the bind address (0.0.0.0:3000), not the
 * host the caller used. Only this caller's own response depends on these headers, and API
 * responses are never cached.
 */
export function absoluteUrl(request: Request, path: string | null): string | null {
  if (!path) return null
  return new URL(path, publicOrigin(request)).toString()
}

function publicOrigin(request: Request): string {
  const fallback = new URL(request.url)
  const first = (name: string) => request.headers.get(name)?.split(',')[0]?.trim()
  const host = first('x-forwarded-host') || first('host') || fallback.host
  const proto = first('x-forwarded-proto') || fallback.protocol.replace(':', '')
  return /^[A-Za-z0-9.-]+(:\d+)?$/.test(host) && /^https?$/.test(proto)
    ? `${proto}://${host}`
    : fallback.origin
}
