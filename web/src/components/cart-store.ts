'use client'

import { useSyncExternalStore } from 'react'
import type { CartLine } from '@/domain/pricing'

/**
 * The cart, kept in the browser so it survives a reload or a closed tab. It stores what the
 * customer chose plus enough to draw it; the server re-prices every line from the menu at
 * checkout, so a stale price here can never be charged.
 */

export type StoredLine = CartLine & {
  /** Identifies a dish with a particular size and set of extras. */
  key: string
  name: string
  veg: boolean
  variantName: string | null
  addonNames: string[]
  unitPricePaise: number
}

const STORAGE_KEY = 'dinewise:cart:v1'
const listeners = new Set<() => void>()
let lines: StoredLine[] = []
let loaded = false

function load() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    lines = Array.isArray(parsed) ? parsed : []
  } catch {
    lines = []
  }
  // Another tab changed the cart: follow it.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    loaded = false
    load()
    listeners.forEach((l) => l())
  })
}

function save(next: StoredLine[]) {
  lines = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private browsing or full storage: the cart still works for this page.
  }
  listeners.forEach((l) => l())
}

export function lineKey(itemId: number, variantId: number | null | undefined, addonIds: number[] = []) {
  return [itemId, variantId ?? '-', [...addonIds].sort((a, b) => a - b).join('.')].join(':')
}

const EMPTY: StoredLine[] = []

export const cart = {
  subscribe(listener: () => void) {
    load()
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  snapshot(): StoredLine[] {
    load()
    return lines
  },
  serverSnapshot(): StoredLine[] {
    return EMPTY
  },
  add(line: Omit<StoredLine, 'key'>) {
    const key = lineKey(line.itemId, line.variantId, line.addonIds)
    const existing = lines.find((l) => l.key === key)
    save(
      existing
        ? lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, l.quantity + line.quantity) } : l))
        : [...lines, { ...line, key }],
    )
  },
  setQuantity(key: string, quantity: number) {
    save(
      quantity <= 0
        ? lines.filter((l) => l.key !== key)
        : lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, quantity) } : l)),
    )
  },
  replace(next: StoredLine[]) {
    save(next)
  },
  clear() {
    save([])
  },
}

export function useCart() {
  const current = useSyncExternalStore(cart.subscribe, cart.snapshot, cart.serverSnapshot)
  const count = current.reduce((n, l) => n + l.quantity, 0)
  const subtotalPaise = current.reduce((n, l) => n + l.unitPricePaise * l.quantity, 0)
  return { lines: current, count, subtotalPaise }
}

export type CheckoutPrefs = { fulfilment: 'DELIVERY' | 'PICKUP'; pincode: string; couponCode: string }

const PREFS_KEY = 'dinewise:checkout:v1'
const DEFAULT_PREFS: CheckoutPrefs = { fulfilment: 'DELIVERY', pincode: '', couponCode: '' }

/** Choices made on the cart page, carried to checkout and remembered for next time. */
export const checkoutPrefs = {
  read(): CheckoutPrefs {
    try {
      return { ...DEFAULT_PREFS, ...JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}') }
    } catch {
      return DEFAULT_PREFS
    }
  },
  write(prefs: CheckoutPrefs) {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      // Not remembered; nothing else depends on it.
    }
  },
}

/** Only ids and quantities go to the server. */
export function toCartLines(stored: StoredLine[]): CartLine[] {
  return stored.map(({ itemId, variantId, addonIds, quantity }) => ({
    itemId,
    variantId,
    addonIds,
    quantity,
  }))
}
