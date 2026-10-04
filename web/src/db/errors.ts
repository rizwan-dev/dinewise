/**
 * The name of the database constraint an error violated, if any. Drizzle wraps the driver's
 * error ("Failed query: ..."), so the PostgreSQL details are on the cause chain.
 */
export function violatedConstraint(error: unknown): string | undefined {
  for (let e = error as { constraint?: unknown; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (typeof e.constraint === 'string') return e.constraint
  }
  return undefined
}
