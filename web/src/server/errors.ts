/**
 * An expected failure with a stable code and a message written for the person who will read
 * it. Server Actions return these as data; anything else is a bug and is logged, not shown.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export type ActionResult<T = void> =
  { ok: true; data: T } | { ok: false; code: string; message: string; field?: string }

/** Runs an action body, turning expected errors into a result and logging the rest. */
export async function toResult<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await body() }
  } catch (error) {
    if (isRedirectOrNotFound(error)) throw error
    if (error instanceof AppError) {
      return { ok: false, code: error.code, message: error.message, field: error.field }
    }
    const named = error as { name?: string; code?: string; message?: string }
    if (named?.name === 'CartError' || named?.name === 'CouponError') {
      return {
        ok: false,
        code: named.code ?? 'INVALID',
        message: named.message ?? 'Please check your order.',
      }
    }
    console.error(error)
    return { ok: false, code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' }
  }
}

/** Next.js signals redirect() and notFound() by throwing; those must pass through. */
function isRedirectOrNotFound(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest
  return (
    typeof digest === 'string' &&
    (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_HTTP_ERROR_FALLBACK'))
  )
}
