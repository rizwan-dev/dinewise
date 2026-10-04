'use client'

/** Minus, count, plus: big enough to tap reliably with a thumb. */
export function Stepper({
  value,
  onChange,
  label,
  min = 1,
}: {
  value: number
  onChange: (n: number) => void
  label: string
  min?: number
}) {
  return (
    <div
      className="flex items-center rounded-xl ring-1 ring-stone-300"
      role="group"
      aria-label={`Quantity of ${label}`}
    >
      <button
        type="button"
        className="text-leaf-700 flex size-11 items-center justify-center text-xl disabled:text-stone-300"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="One fewer"
      >
        −
      </button>
      <span className="w-7 text-center font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="text-leaf-700 flex size-11 items-center justify-center text-xl disabled:text-stone-300"
        onClick={() => onChange(value + 1)}
        disabled={value >= 20}
        aria-label="One more"
      >
        +
      </button>
    </div>
  )
}
