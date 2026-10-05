import Image from 'next/image'
import Link from 'next/link'
import { DemoStaffButtons } from '@/components/demo-staff-buttons'
import { DishImage } from '@/components/dish-image'
import { ButtonLink, Card, VegMark } from '@/components/ui'
import { RESTAURANT } from '@/config/restaurant'
import { db } from '@/db/client'
import { formatPaise } from '@/domain/money'
import { asapSlot, isOpenNow } from '@/domain/slots'
import { formatTime } from '@/domain/time'
import { env } from '@/server/env'
import { fromPrice, loadMenu, type MenuEntry } from '@/server/menu'
import { activeOffers } from '@/server/offers'
import { slotCounts } from '@/server/orders'

export const dynamic = 'force-dynamic'

/** What happens to an order, in the order it happens: the same steps the kitchen screen has. */
const JOURNEY = [
  ['You order', 'From your phone, for delivery or pickup. Pay online or in cash.'],
  ['The kitchen accepts', 'Your ticket lands on the kitchen tablet with a chime, and cooking starts.'],
  ['Cooked to order', 'Nothing is made ahead. You see each step as it happens.'],
  ['At your door', 'Our rider brings it over, or it waits at the counter for you.'],
] as const

export default async function HomePage() {
  const now = new Date()
  const [menu, counts, offers] = await Promise.all([loadMenu(db()), slotCounts(db(), now), activeOffers(db(), now)])
  const all = menu.flatMap((s) => s.items).filter((i) => i.available)
  const bestsellers = all.filter((i) => i.bestseller).slice(0, 8)
  const combos = menu.find((s) => s.slug === 'combos-and-thalis')?.items.filter((i) => i.available) ?? []
  const categories = menu
    .map((s) => ({ ...s, cover: s.items.find((i) => i.imagePath) }))
    .filter((s): s is typeof s & { cover: MenuEntry } => Boolean(s.cover))
  const open = isOpenNow(now)
  const next = asapSlot(now, counts)
  const demo = env().DEMO_SEED

  return (
    <div className="space-y-10">
      <section className="relative isolate overflow-hidden rounded-3xl bg-stone-900 px-6 py-10 text-white md:px-12 md:py-20">
        <Image
          src="/hero.webp"
          alt=""
          fill
          priority
          sizes="(max-width: 1152px) 100vw, 1152px"
          className="-z-10 object-cover"
        />
        {/* Darkened towards the text so it stays readable over any part of the photo. */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-stone-950/90 via-stone-950/65 to-stone-950/20" />
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-medium">
          <span className={`size-2 rounded-full ${open ? 'bg-green-300' : 'bg-stone-300'}`} />
          {open ? 'Open now' : 'Closed now'}
          {next && ` · next ready by ${formatTime(next.start)}`}
        </p>
        <h1 className="font-display max-w-xl text-4xl leading-tight font-semibold md:text-5xl">
          Home-style North Indian food, cooked to order.
        </h1>
        <p className="mt-3 max-w-lg text-stone-100">
          {RESTAURANT.tagline}. {all.length} dishes, delivery, pickup and table bookings.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/menu" className="!text-saffron-700 hover:bg-saffron-50 bg-white">
            Order now
          </ButtonLink>
          <ButtonLink
            href="/book"
            variant="ghost"
            className="text-white ring-1 ring-white/50 hover:bg-white/10"
          >
            Book a table
          </ButtonLink>
        </div>
      </section>

      {offers.length > 0 && (
        <section aria-label="Offers" className="-mx-4 flex scrollbar-none gap-3 overflow-x-auto px-4">
          {offers.map((o) => (
            <div
              key={o.code}
              className="border-saffron-300 bg-saffron-50 min-w-64 flex-1 rounded-2xl border border-dashed p-4"
            >
              <p className="text-saffron-800 text-xs font-bold tracking-wide uppercase">
                {o.firstOrderOnly ? 'First order' : 'Offer'}
              </p>
              <p className="font-display mt-1 text-lg font-semibold">{o.description}</p>
              <p className="mt-2 text-sm text-stone-600">
                Use code <span className="text-ink font-mono font-bold">{o.code}</span> in your cart
              </p>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2 className="font-display mb-4 text-2xl font-semibold">What are you craving?</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categories.map((c) => (
            <li key={c.id}>
              <Link
                href={`/menu#${c.slug}`}
                className="group relative block aspect-[4/3] overflow-hidden rounded-2xl bg-stone-200"
              >
                <DishImage
                  src={c.cover.imagePath}
                  name={c.cover.name}
                  veg={c.cover.veg}
                  className="absolute inset-0 size-full transition duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 50vw, 25vw"
                />
                <span className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-stone-950/10 to-transparent" />
                <span className="absolute inset-x-3 bottom-3 text-white">
                  <span className="font-display block text-lg leading-tight font-semibold">{c.name}</span>
                  <span className="text-xs text-stone-200">{c.items.length} dishes</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <DishRow title="Most loved" items={bestsellers} />

      {combos.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold">Combos &amp; thalis</h2>
              <p className="text-sm text-stone-600">A full meal in one tap.</p>
            </div>
            <Link href="/menu#combos-and-thalis" className="text-saffron-700 text-sm font-semibold">
              See all →
            </Link>
          </div>
          <ul className="-mx-4 flex scrollbar-none snap-x gap-3 overflow-x-auto px-4 pb-1">
            {combos.map((item) => (
              <li key={item.id} className="w-72 shrink-0 snap-start">
                <Link
                  href={`/menu#${item.slug}`}
                  className="hover:ring-saffron-300 block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200"
                >
                  <DishImage
                    src={item.imagePath}
                    name={item.name}
                    veg={item.veg}
                    className="aspect-[16/10] w-full"
                    sizes="288px"
                  />
                  <div className="p-3">
                    <p className="flex items-start gap-2 font-semibold">
                      <VegMark veg={item.veg} className="mt-1" />
                      {item.name}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-stone-600">{item.description}</p>
                    <p className="mt-2 font-semibold">{formatPaise(fromPrice(item))}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display mb-4 text-2xl font-semibold">From our kitchen to your door</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {JOURNEY.map(([title, text], i) => (
            <li key={title} className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
              <span className="bg-saffron-100 text-saffron-800 flex size-8 items-center justify-center rounded-full text-sm font-bold">
                {i + 1}
              </span>
              <h3 className="font-display mt-3 text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-stone-600">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {demo && (
        <section className="rounded-3xl bg-stone-900 p-6 text-white md:p-8">
          <p className="text-saffron-300 text-xs font-bold tracking-wide uppercase">Demo</p>
          <h2 className="font-display mt-1 text-2xl font-semibold">See the kitchen side</h2>
          <p className="mt-2 max-w-2xl text-stone-300">
            Place an order here, then open the kitchen screen to accept it, cook it and send it out. Your
            order page follows along live. The manager also gets today&apos;s dashboard, the menu, table
            bookings and sales. Everything resets every night.
          </p>
          <DemoStaffButtons className="mt-4" />
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold">Hours</h2>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
              <div key={day} className="contents">
                <dt className="text-stone-600">{day}</dt>
                <dd>
                  {RESTAURANT.hours[i]?.open}–{RESTAURANT.hours[i]?.close}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <h2 className="font-display text-lg font-semibold">Delivery</h2>
          <p className="mt-2 text-sm text-stone-600">
            We deliver to {Object.keys(RESTAURANT.delivery.pincodes).join(', ')}. Free delivery on orders over{' '}
            {formatPaise(RESTAURANT.delivery.freeAbovePaise)}. Minimum order{' '}
            {formatPaise(RESTAURANT.ordering.minimumOrderPaise)}.
          </p>
        </Card>
      </section>
    </div>
  )
}

function DishRow({ title, items }: { title: string; items: MenuEntry[] }) {
  if (!items.length) return null
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <h2 className="font-display text-2xl font-semibold">{title}</h2>
        <Link href="/menu" className="text-saffron-700 text-sm font-semibold">
          Full menu →
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/menu#${item.slug}`}
              className="hover:ring-saffron-300 block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200"
            >
              <DishImage
                src={item.imagePath}
                name={item.name}
                veg={item.veg}
                className="aspect-[4/3] w-full"
                sizes="(max-width: 768px) 50vw, 25vw"
              />
              <div className="p-3">
                <p className="flex items-start gap-2 text-sm font-semibold">
                  <VegMark veg={item.veg} className="mt-0.5" />
                  {item.name}
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  {item.variants.length ? 'from ' : ''}
                  {formatPaise(fromPrice(item))}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
