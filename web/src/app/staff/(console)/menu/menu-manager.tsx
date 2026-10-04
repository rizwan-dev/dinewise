'use client'

import clsx from 'clsx'
import { useState, useTransition } from 'react'
import { setAvailabilityAction, updateItemAction, uploadPhotoAction } from '@/app/actions/staff'
import { DishImage } from '@/components/dish-image'
import { Alert, Button, Input, Label, Textarea, VegMark } from '@/components/ui'
import { formatPaise } from '@/domain/money'
import type { MenuEntry, MenuSection } from '@/server/menu'

export function MenuManager({
  sections,
  canEdit,
  photoUploads,
}: {
  sections: MenuSection[]
  canEdit: boolean
  /** Off on serverless hosting, which has no disk to keep the photos on. */
  photoUploads: boolean
}) {
  const [editing, setEditing] = useState<number | null>(null)
  return (
    <div className="space-y-6">
      {sections.map((s) => (
        <section key={s.id}>
          <h2 className="mb-2 text-sm font-bold tracking-wide text-stone-500 uppercase">{s.name}</h2>
          <ul className="divide-y divide-stone-100 rounded-2xl bg-white">
            {s.items.map((item) => (
              <li key={item.id} className="p-3">
                <Row
                  item={item}
                  canEdit={canEdit}
                  onEdit={() => setEditing(editing === item.id ? null : item.id)}
                />
                {editing === item.id && (
                  <Editor item={item} photoUploads={photoUploads} onDone={() => setEditing(null)} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Row({ item, canEdit, onEdit }: { item: MenuEntry; canEdit: boolean; onEdit: () => void }) {
  const [available, setAvailable] = useState(item.available)
  const [busy, start] = useTransition()
  return (
    <div className="flex items-center gap-3">
      <DishImage
        src={item.imagePath}
        name={item.name}
        veg={item.veg}
        className="size-12 shrink-0 rounded-lg"
        sizes="48px"
      />
      <button
        type="button"
        className="min-w-0 flex-1 text-left disabled:cursor-default"
        onClick={onEdit}
        disabled={!canEdit}
      >
        <p className="flex items-center gap-2 font-semibold">
          <VegMark veg={item.veg} /> <span className="truncate">{item.name}</span>
        </p>
        <p className="text-sm text-stone-600">
          {item.variants.length
            ? item.variants.map((v) => `${v.name} ${formatPaise(v.pricePaise)}`).join(' · ')
            : formatPaise(item.pricePaise)}
        </p>
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={available}
        aria-label={`${item.name} available`}
        disabled={busy}
        onClick={() =>
          start(async () => {
            const next = !available
            setAvailable(next) // show the change at once; undo if the server refuses
            const result = await setAvailabilityAction(item.id, next)
            if (!result.ok) setAvailable(!next)
          })
        }
        className={clsx(
          'flex min-h-11 w-28 shrink-0 items-center justify-center rounded-xl text-sm font-semibold',
          available ? 'bg-leaf-50 text-leaf-700' : 'text-chilli-600 bg-red-50',
        )}
      >
        {available ? 'Available' : 'Sold out'}
      </button>
    </div>
  )
}

function Editor({
  item,
  photoUploads,
  onDone,
}: {
  item: MenuEntry
  photoUploads: boolean
  onDone: () => void
}) {
  const [name, setName] = useState(item.name)
  const [description, setDescription] = useState(item.description)
  const [price, setPrice] = useState((item.pricePaise / 100).toFixed(2))
  const [bestseller, setBestseller] = useState(item.bestseller)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [busy, start] = useTransition()

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-stone-50 p-3">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`name-${item.id}`}>Name</Label>
          <Input id={`name-${item.id}`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`price-${item.id}`}>
            Price (₹){item.variants.length > 0 && ' · sizes are priced separately'}
          </Label>
          <Input
            id={`price-${item.id}`}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={item.variants.length > 0}
          />
        </div>
      </div>
      <div>
        <Label htmlFor={`desc-${item.id}`}>Description</Label>
        <Textarea
          id={`desc-${item.id}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={300}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={bestseller}
          onChange={(e) => setBestseller(e.target.checked)}
          className="accent-leaf-700 size-4"
        />
        Show as a bestseller
      </label>
      {photoUploads ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            start(async () => {
              const result = await uploadPhotoAction(item.id, form)
              setMessage(
                result.ok
                  ? { tone: 'success', text: 'Photo updated.' }
                  : { tone: 'error', text: result.message },
              )
            })
          }}
        >
          <label htmlFor={`photo-${item.id}`} className="text-sm font-medium">
            Photo
          </label>
          <input
            id={`photo-${item.id}`}
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="min-w-0 flex-1 text-sm"
          />
          <Button type="submit" variant="secondary" busy={busy}>
            Upload
          </Button>
        </form>
      ) : (
        <p className="text-sm text-stone-500">
          Photo uploads are off in this hosted demo. Run it with Docker to try them.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          busy={busy}
          onClick={() =>
            start(async () => {
              const result = await updateItemAction(item.id, { name, description, price, bestseller })
              if (result.ok) onDone()
              else setMessage({ tone: 'error', text: result.message })
            })
          }
        >
          Save changes
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
