import Image from 'next/image'
import Link from 'next/link'
import { DishImage } from '@/components/dish-image'
import { ButtonLink, Card, VegMark } from '@/components/ui'
import { RESTAURANT } from '@/config/restaurant'
import { db } from '@/db/client'
import { formatPaise } from '@/domain/money'
import { asapSlot, isOpenNow } from '@/domain/slots'
import { formatTime } from '@/domain/time'
import { fromPrice, loadMenu } from '@/server/menu'
import { slotCounts } from '@/server/orders'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const now = new Date()
  const [menu, counts] = await Promise.all([loadMenu(db()), slotCounts(db(), now)])
  const bestsellers = menu
    .flatMap((s) => s.items)
    .filter((i) => i.bestseller && i.available)
    .slice(0, 6)
  const open = isOpenNow(now)
  const next = asapSlot(now, counts)

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
          {RESTAURANT.tagline}. Delivery, pickup and table bookings.
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

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="font-display text-2xl font-semibold">Most loved</h2>
          <Link href="/menu" className="text-saffron-700 text-sm font-semibold">
            Full menu →
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {bestsellers.map((item) => (
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
                  sizes="(max-width: 768px) 50vw, 33vw"
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

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ['Order', 'Delivery across Baner and nearby, or pick up. Schedule for later if you like.'],
          ['Pay your way', 'UPI or card online, or cash to the rider or at the counter.'],
          ['Track it live', 'Watch your order go from kitchen to door, no refreshing.'],
        ].map(([title, text]) => (
          <Card key={title}>
            <h3 className="font-display text-lg font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-stone-600">{text}</p>
          </Card>
        ))}
      </section>

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
