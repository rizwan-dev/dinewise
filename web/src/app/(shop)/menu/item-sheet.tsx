'use client'

import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { cart } from '@/components/cart-store'
import { DishImage } from '@/components/dish-image'
import { Stepper } from '@/components/stepper'
import { Button, Chillies, VegMark } from '@/components/ui'
import { formatPaise } from '@/domain/money'
import type { MenuEntry } from '@/server/menu'

/** Size, extras and quantity for one dish. A bottom sheet on phones, a dialog on desktop. */
export function ItemSheet({ item, onClose }: { item: MenuEntry; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [variantId, setVariantId] = useState<number | null>(item.variants[0]?.id ?? null)
  // Required single-choice groups start on their first option: one less tap.
  const [chosen, setChosen] = useState<Set<number>>(
    () =>
      new Set(
        item.addonGroups.filter((g) => g.minSelect === 1 && g.maxSelect === 1).map((g) => g.addons[0]!.id),
      ),
  )
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    ref.current?.showModal?.()
  }, [])

  const base = item.variants.find((v) => v.id === variantId)?.pricePaise ?? item.pricePaise
  const allAddons = item.addonGroups.flatMap((g) => g.addons)
  const extras = allAddons.filter((a) => chosen.has(a.id)).reduce((sum, a) => sum + a.pricePaise, 0)
  const unit = base + extras
  const unmet = item.addonGroups.find((g) => g.addons.filter((a) => chosen.has(a.id)).length < g.minSelect)

  const toggle = (groupId: number, addonId: number) => {
    const group = item.addonGroups.find((g) => g.id === groupId)!
    const next = new Set(chosen)
    if (group.maxSelect === 1) {
      group.addons.forEach((a) => next.delete(a.id))
      next.add(addonId)
    } else if (next.has(addonId)) {
      next.delete(addonId)
    } else if (group.addons.filter((a) => next.has(a.id)).length < group.maxSelect) {
      next.add(addonId)
    }
    setChosen(next)
  }

  const add = () => {
    const addonIds = allAddons.filter((a) => chosen.has(a.id)).map((a) => a.id)
    cart.add({
      itemId: item.id,
      variantId,
      addonIds,
      quantity,
      name: item.name,
      veg: item.veg,
      variantName: item.variants.find((v) => v.id === variantId)?.name ?? null,
      addonNames: allAddons.filter((a) => chosen.has(a.id)).map((a) => a.name),
      unitPricePaise: unit,
    })
    ref.current?.close()
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="item-sheet-title"
      className="m-0 mt-auto w-full max-w-none rounded-t-3xl p-0 backdrop:bg-black/40 md:m-auto md:max-w-lg md:rounded-3xl"
    >
      <div className="max-h-[85dvh] overflow-y-auto">
        <DishImage
          src={item.imagePath}
          name={item.name}
          veg={item.veg}
          className="aspect-[16/9] w-full"
          sizes="(max-width: 768px) 100vw, 512px"
        />
        <div className="space-y-5 p-5">
          <div>
            <div className="flex items-center gap-2">
              <VegMark veg={item.veg} />
              <Chillies level={item.spice} />
            </div>
            <h2 id="item-sheet-title" className="font-display mt-1 text-2xl font-semibold">
              {item.name}
            </h2>
            <p className="mt-1 text-sm text-stone-600">{item.description}</p>
          </div>

          {item.variants.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">
                Size <span className="font-normal text-stone-500">· choose 1</span>
              </legend>
              <div className="space-y-2">
                {item.variants.map((v) => (
                  <Choice
                    key={v.id}
                    type="radio"
                    name="variant"
                    checked={variantId === v.id}
                    onChange={() => setVariantId(v.id)}
                    label={v.name}
                    price={formatPaise(v.pricePaise)}
                  />
                ))}
              </div>
            </fieldset>
          )}

          {item.addonGroups.map((group) => {
            const picked = group.addons.filter((a) => chosen.has(a.id)).length
            const rule =
              group.minSelect === 1 && group.maxSelect === 1
                ? 'choose 1'
                : group.minSelect === 0
                  ? `optional, up to ${group.maxSelect}`
                  : `choose ${group.minSelect}–${group.maxSelect}`
            return (
              <fieldset key={group.id}>
                <legend className="mb-2 text-sm font-semibold">
                  {group.name} <span className="font-normal text-stone-500">· {rule}</span>
                </legend>
                <div className="space-y-2">
                  {group.addons.map((a) => {
                    const checked = chosen.has(a.id)
                    return (
                      <Choice
                        key={a.id}
                        type={group.maxSelect === 1 ? 'radio' : 'checkbox'}
                        name={`group-${group.id}`}
                        checked={checked}
                        disabled={!checked && group.maxSelect > 1 && picked >= group.maxSelect}
                        onChange={() => toggle(group.id, a.id)}
                        label={a.name}
                        price={a.pricePaise ? `+${formatPaise(a.pricePaise)}` : ''}
                      />
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-stone-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Stepper value={quantity} onChange={setQuantity} label={item.name} />
        <Button className="flex-1" onClick={add} disabled={Boolean(unmet)}>
          {unmet ? `Choose ${unmet.name.toLowerCase()}` : `Add · ${formatPaise(unit * quantity)}`}
        </Button>
      </div>
      <button
        type="button"
        onClick={() => ref.current?.close()}
        className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-full bg-white/90 text-lg shadow"
        aria-label="Close"
      >
        ✕
      </button>
    </dialog>
  )
}

function Choice({
  label,
  price,
  ...input
}: {
  label: string
  price: string
  type: 'radio' | 'checkbox'
  name: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <label
      className={clsx(
        'has-focus-visible:outline-leaf-600 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 ring-1 ring-inset has-focus-visible:outline-2',
        input.checked ? 'bg-leaf-50 ring-leaf-600' : 'bg-white ring-stone-200',
        input.disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input {...input} className="accent-leaf-700 size-4" />
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span className="text-sm text-stone-600">{price}</span>
    </label>
  )
}
