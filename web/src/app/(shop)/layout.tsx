import Link from 'next/link'
import { BottomBar, CartButton, DesktopNav } from '@/components/shop-chrome'
import { PRODUCT } from '@/config/product'
import { RESTAURANT } from '@/config/restaurant'

export default function ShopLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <header className="bg-cream/95 sticky top-0 z-20 border-b border-stone-200/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="bg-saffron-700 font-display flex size-9 items-center justify-center rounded-xl text-lg font-bold text-white">
              {RESTAURANT.name.charAt(0)}
            </span>
            <span className="font-display text-xl font-semibold tracking-tight">{RESTAURANT.name}</span>
          </Link>
          <div className="flex items-center gap-2">
            <DesktopNav />
            <CartButton />
          </div>
        </div>
      </header>

      {/* Room at the bottom for the phone tab bar and cart bar. */}
      <main className="mx-auto max-w-6xl px-4 pt-4 pb-40 md:pb-16">{children}</main>

      <footer className="border-t border-stone-200 bg-white px-4 py-8 pb-40 text-sm text-stone-600 md:pb-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:justify-between">
          <p>
            <strong className="text-ink">{RESTAURANT.name}</strong> · {RESTAURANT.address.street},{' '}
            {RESTAURANT.address.city}
          </p>
          <p>
            A demo restaurant; orders are not real. Ordering by{' '}
            <a href={PRODUCT.sourceUrl} className="text-ink font-semibold underline-offset-2 hover:underline">
              {PRODUCT.name}
            </a>
            .
          </p>
        </div>
      </footer>
      <BottomBar />
    </>
  )
}
