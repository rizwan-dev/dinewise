/** A quiet placeholder while a browser-only screen loads, shaped like what is coming. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-48 rounded-xl bg-stone-200" />
      <div className="h-40 rounded-2xl bg-white ring-1 ring-stone-200" />
      <div className="h-28 rounded-2xl bg-white ring-1 ring-stone-200" />
      <div className="h-11 rounded-xl bg-stone-200" />
    </div>
  )
}
