'use client'

import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { cart } from '@/components/cart-store'
import { DishImage } from '@/components/dish-image'
import { Badge, Button, Chillies, Input, VegMark } from '@/components/ui'
import { formatPaise } from '@/domain/money'
import type { MenuEntry, MenuSection } from '@/server/menu'
import { ItemSheet } from './item-sheet'

const fromPrice = (i: MenuEntry) =>
  i.variants.length ? Math.min(...i.variants.map((v) => v.pricePaise)) : i.pricePaise
const needsChoices = (i: MenuEntry) => i.variants.length > 0 || i.addonGroups.length > 0

export function MenuBrowser({ sections }: { sections: MenuSection[] }) {
  const [vegOnly, setVegOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<MenuEntry | null>(null)
  const [added, setAdded] = useState<number | null>(null)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter(
          (i) =>
            (!vegOnly || i.veg) &&
            (!q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)),
        ),
      }))
      .filter((s) => s.items.length > 0)
  }, [sections, vegOnly, search])

  const quickAdd = (item: MenuEntry) => {
    if (needsChoices(item)) return setOpen(item)
    cart.add({
      itemId: item.id,
      variantId: null,
      addonIds: [],
      quantity: 1,
      name: item.name,
      veg: item.veg,
      variantName: null,
      addonNames: [],
      unitPricePaise: item.pricePaise,
    })
    setAdded(item.id)
    setTimeout(() => setAdded((id) => (id === item.id ? null : id)), 1200)
  }

  return (
    <div>
      <div className="bg-cream/95 sticky top-16 z-10 -mx-4 space-y-3 px-4 pt-2 pb-3 backdrop-blur">
        <div className="flex gap-2">
          <label htmlFor="menu-search" className="sr-only">
            Search the menu
          </label>
          <Input
            id="menu-search"
            type="search"
            placeholder="Search dishes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            role="switch"
            aria-checked={vegOnly}
            onClick={() => setVegOnly(!vegOnly)}
            className={clsx(
              'flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold ring-1 ring-inset',
              vegOnly ? 'bg-leaf-50 text-leaf-700 ring-leaf-600' : 'bg-white text-stone-700 ring-stone-300',
            )}
          >
            <VegMark veg /> Veg only
          </button>
        </div>
        <nav aria-label="Menu sections" className="-mx-4 flex scrollbar-none gap-2 overflow-x-auto px-4">
          {visible.map((s) => (
            <a
              key={s.id}
              href={`#${s.slug}`}
              className="hover:ring-saffron-400 shrink-0 rounded-full bg-white px-4 py-2 text-sm font-medium ring-1 ring-stone-200"
            >
              {s.name}
            </a>
          ))}
        </nav>
      </div>

      {visible.length === 0 && (
        <p className="py-16 text-center text-stone-600">No dishes match “{search}”.</p>
      )}

      <div className="space-y-8">
        {visible.map((section) => (
          <section key={section.id} id={section.slug} className="scroll-mt-40">
            <h2 className="font-display mb-3 text-2xl font-semibold">{section.name}</h2>
            <ul className="divide-y divide-stone-200 rounded-2xl bg-white ring-1 ring-stone-200">
              {section.items.map((item) => (
                <li key={item.id} id={item.slug} className="flex scroll-mt-40 gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <VegMark veg={item.veg} />
                      {item.bestseller && <Badge tone="saffron">Bestseller</Badge>}
                      <Chillies level={item.spice} />
                    </div>
                    <h3 className="mt-1 font-semibold">{item.name}</h3>
                    <p className="text-sm font-medium">
                      {item.variants.length > 0 && <span className="font-normal text-stone-500">from </span>}
                      {formatPaise(fromPrice(item))}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-stone-600">{item.description}</p>
                  </div>
                  <div className="flex w-28 shrink-0 flex-col items-center">
                    <DishImage
                      src={item.imagePath}
                      name={item.name}
                      veg={item.veg}
                      className="aspect-square w-28 rounded-xl"
                    />
                    {item.available ? (
                      <Button
                        variant="secondary"
                        className="!text-leaf-700 relative z-10 -mt-5 w-24 shadow-sm"
                        onClick={() => quickAdd(item)}
                        aria-label={`Add ${item.name}`}
                      >
                        {added === item.id ? 'Added ✓' : 'Add'}
                      </Button>
                    ) : (
                      <span className="relative z-10 -mt-4 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-500">
                        Sold out
                      </span>
                    )}
                    {item.available && needsChoices(item) && (
                      <span className="mt-1 text-[11px] text-stone-500">Customisable</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {open && <ItemSheet item={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
