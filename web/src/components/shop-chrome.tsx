'use client'

import clsx from 'clsx'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { formatPaise } from '@/domain/money'
import { useCart } from './cart-store'

const TABS = [
  { href: '/', label: 'Home', icon: 'M3 11l9-7 9 7M5 9.5V20h14V9.5' },
  { href: '/menu', label: 'Menu', icon: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h4' },
  { href: '/book', label: 'Book', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
  { href: '/account', label: 'Orders', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
]

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

export function CartButton() {
  const { count } = useCart()
  return (
    <Link
      href="/cart"
      className="hover:bg-saffron-50 relative inline-flex size-11 items-center justify-center rounded-xl"
      aria-label={`Cart, ${count} items`}
    >
      <Icon d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" />
      {count > 0 && (
        <span className="bg-saffron-600 absolute top-1 right-1 flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white">
          {count}
        </span>
      )}
    </Link>
  )
}

/** Phone navigation, plus a cart bar above it whenever the cart has something in it. */
export function BottomBar() {
  const pathname = usePathname()
  const { count, subtotalPaise } = useCart()
  const showCartBar = count > 0 && !['/cart', '/checkout', '/sign-in'].includes(pathname)

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 md:hidden">
      {showCartBar && (
        <Link
          href="/cart"
          className="bg-leaf-700 mx-3 mb-2 flex min-h-12 items-center justify-between rounded-2xl px-4 text-white shadow-lg"
        >
          <span className="text-sm font-semibold">
            {count} {count === 1 ? 'item' : 'items'} · {formatPaise(subtotalPaise)}
          </span>
          <span className="text-sm font-semibold">View cart →</span>
        </Link>
      )}
      <nav aria-label="Main" className="border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="flex">
          {TABS.map((tab) => {
            const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                    active ? 'text-saffron-700' : 'text-stone-500',
                  )}
                >
                  <Icon d={tab.icon} />
                  {tab.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

export function DesktopNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {TABS.slice(1).map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={clsx(
            'rounded-xl px-3 py-2 text-sm font-medium',
            pathname.startsWith(tab.href)
              ? 'bg-saffron-50 text-saffron-700'
              : 'hover:text-ink text-stone-600',
          )}
        >
          {tab.label === 'Book' ? 'Book a table' : tab.label === 'Orders' ? 'My orders' : tab.label}
        </Link>
      ))}
    </nav>
  )
}
