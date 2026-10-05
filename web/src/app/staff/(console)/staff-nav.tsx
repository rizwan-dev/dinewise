'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function StaffNav({ manager }: { manager: boolean }) {
  const pathname = usePathname()
  const links = [
    ...(manager ? [{ href: '/staff/today', label: 'Today' }] : []),
    { href: '/staff', label: 'Kitchen' },
    { href: '/staff/menu', label: 'Menu' },
    ...(manager
      ? [
          { href: '/staff/reservations', label: 'Bookings' },
          { href: '/staff/sales', label: 'Sales' },
        ]
      : []),
  ]
  return (
    <nav aria-label="Staff" className="flex scrollbar-none gap-1 overflow-x-auto">
      {links.map((l) => {
        const active = l.href === '/staff' ? pathname === '/staff' : pathname.startsWith(l.href)
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold',
              active ? 'text-ink bg-white' : 'text-stone-300 hover:bg-white/10',
            )}
          >
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
