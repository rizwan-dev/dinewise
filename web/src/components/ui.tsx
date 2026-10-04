import clsx from 'clsx'
import Link, { type LinkProps } from 'next/link'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'

const variants: Record<Variant, string> = {
  primary: 'bg-leaf-700 text-white hover:bg-leaf-800 disabled:bg-leaf-700/40',
  accent: 'bg-saffron-600 text-white hover:bg-saffron-700 disabled:bg-saffron-600/40',
  secondary: 'bg-white text-ink ring-1 ring-inset ring-stone-300 hover:bg-stone-50 disabled:text-stone-400',
  ghost: 'text-stone-700 hover:bg-stone-100 disabled:text-stone-400',
  danger: 'bg-chilli-600 text-white hover:bg-red-800 disabled:bg-chilli-600/40',
}

// 44px tall on phones: a comfortable thumb target.
const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed'

export function Button({
  variant = 'primary',
  busy,
  className,
  children,
  type = 'button',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type={type}
      className={clsx(base, variants[variant], className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy && <Spinner />}
      {children}
    </button>
  )
}

export function ButtonLink({
  variant = 'primary',
  className,
  children,
  ...props
}: LinkProps & { variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link className={clsx(base, variants[variant], className)} {...props}>
      {children}
    </Link>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('size-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

const control =
  'block min-h-11 w-full rounded-xl border-0 bg-white px-3 text-base text-ink ring-1 ring-inset ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-leaf-600 focus:outline-none aria-invalid:ring-chilli-600 sm:text-sm'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(control, className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} className={clsx(control, 'py-2', className)} {...props} />
}

export function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-stone-700">
      {children}
    </label>
  )
}

export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null
  return (
    <p id={id} className="text-chilli-600 mt-1 text-sm">
      {children}
    </p>
  )
}

/** The Indian food-labelling mark: a green dot in a square for veg, a red triangle for non-veg. */
export function VegMark({ veg, className }: { veg: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'}
      className={clsx(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border-2 bg-white',
        veg ? 'border-leaf-600' : 'border-chilli-600',
        className,
      )}
    >
      {veg ? (
        <span className="bg-leaf-600 size-1.5 rounded-full" />
      ) : (
        <span className="border-b-chilli-600 size-0 border-x-[4px] border-b-[7px] border-x-transparent" />
      )}
    </span>
  )
}

export function Chillies({ level }: { level: number }) {
  if (level <= 0) return null
  return (
    <span className="text-chilli-600 text-xs" aria-label={['', 'Mild heat', 'Medium hot', 'Hot'][level]}>
      {'🌶'.repeat(level)}
    </span>
  )
}

export function Badge({
  children,
  tone = 'stone',
}: {
  children: ReactNode
  tone?: 'stone' | 'saffron' | 'leaf' | 'chilli'
}) {
  const tones = {
    stone: 'bg-stone-100 text-stone-700',
    saffron: 'bg-saffron-100 text-saffron-700',
    leaf: 'bg-leaf-50 text-leaf-700',
    chilli: 'bg-red-50 text-chilli-600',
  }
  return (
    <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 sm:p-5', className)}>
      {children}
    </section>
  )
}

export function Alert({
  children,
  tone = 'error',
}: {
  children: ReactNode
  tone?: 'error' | 'info' | 'success'
}) {
  const tones = {
    error: 'bg-red-50 text-chilli-600 ring-red-200',
    info: 'bg-saffron-50 text-saffron-700 ring-saffron-200',
    success: 'bg-leaf-50 text-leaf-700 ring-green-200',
  }
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx('rounded-xl px-4 py-3 text-sm ring-1', tones[tone])}
    >
      {children}
    </p>
  )
}
