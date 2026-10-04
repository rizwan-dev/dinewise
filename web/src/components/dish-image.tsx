import clsx from 'clsx'
import Image from 'next/image'

/**
 * A dish photo when the restaurant has uploaded one; otherwise a warm illustrated plate, so
 * the menu never shows a broken image or an empty grey box.
 */
export function DishImage({
  src,
  name,
  veg,
  className,
  sizes = '(max-width: 768px) 112px, 160px',
  priority,
}: {
  src: string | null
  name: string
  veg: boolean
  className?: string
  sizes?: string
  priority?: boolean
}) {
  if (src) {
    return (
      <div className={clsx('bg-saffron-100 relative overflow-hidden', className)}>
        <Image src={src} alt={name} fill sizes={sizes} className="object-cover" priority={priority} />
      </div>
    )
  }
  const hue = [...name].reduce((h, c) => h + c.charCodeAt(0), 0) % 30
  return (
    <div
      className={clsx('relative flex items-center justify-center overflow-hidden', className)}
      style={{ background: `linear-gradient(135deg, hsl(${28 + hue} 95% 88%), hsl(${18 + hue} 85% 72%))` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" className="w-1/2 opacity-80">
        <ellipse cx="32" cy="40" rx="26" ry="9" fill="#fff" fillOpacity="0.85" />
        <path d="M10 36h44c0 9-10 14-22 14S10 45 10 36z" fill="#fff" />
        <path d="M18 34c4-8 24-8 28 0" fill={veg ? '#86efac' : '#fca5a5'} />
        <path
          d="M24 22c0-4 4-4 4-8M32 22c0-4 4-4 4-8M40 22c0-4 4-4 4-8"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  )
}
