import { RESTAURANT } from '@/config/restaurant'
import type { Coupon } from './coupons'
import { evaluateCoupon } from './coupons'
import type { MenuItem } from './menu'
import { percentOf } from './money'

/**
 * Prices a cart. The browser keeps the cart, but it only ever sends ids and quantities: every
 * price, discount, fee and tax is worked out here from the current menu, so a tampered or
 * stale cart cannot change what the customer pays.
 */

export type CartLine = {
  itemId: number
  variantId?: number | null
  addonIds?: number[]
  quantity: number
}

export type PricedLine = {
  itemId: number
  name: string
  variantId: number | null
  variantName: string | null
  addons: { id: number; name: string; pricePaise: number }[]
  quantity: number
  unitPricePaise: number
  lineTotalPaise: number
}

export type Fulfilment = 'DELIVERY' | 'PICKUP'

export type Totals = {
  subtotalPaise: number
  discountPaise: number
  packagingPaise: number
  deliveryFeePaise: number
  taxPaise: number
  totalPaise: number
}

export class CartError extends Error {
  constructor(
    readonly code:
      | 'EMPTY_CART'
      | 'UNKNOWN_ITEM'
      | 'UNAVAILABLE'
      | 'BAD_QUANTITY'
      | 'CHOOSE_VARIANT'
      | 'UNKNOWN_VARIANT'
      | 'UNKNOWN_ADDON'
      | 'ADDON_LIMIT'
      | 'MINIMUM_ORDER'
      | 'NO_DELIVERY',
    message: string,
  ) {
    super(message)
    this.name = 'CartError'
  }
}

export const MAX_QUANTITY = 20
export const MAX_LINES = 30

export function priceLine(item: MenuItem | undefined, line: CartLine): PricedLine {
  if (!item) throw new CartError('UNKNOWN_ITEM', 'An item in your cart is no longer on the menu.')
  if (!item.available) {
    throw new CartError('UNAVAILABLE', `${item.name} is sold out right now.`)
  }
  if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
    throw new CartError('BAD_QUANTITY', `Choose between 1 and ${MAX_QUANTITY} of ${item.name}.`)
  }

  let base = item.pricePaise
  let variant: { id: number; name: string } | null = null
  if (item.variants.length > 0) {
    if (line.variantId == null) {
      throw new CartError('CHOOSE_VARIANT', `Choose a size for ${item.name}.`)
    }
    const found = item.variants.find((v) => v.id === line.variantId)
    if (!found) throw new CartError('UNKNOWN_VARIANT', `That size of ${item.name} is no longer offered.`)
    base = found.pricePaise
    variant = { id: found.id, name: found.name }
  } else if (line.variantId != null) {
    throw new CartError('UNKNOWN_VARIANT', `${item.name} does not come in sizes.`)
  }

  const chosen = new Set(line.addonIds ?? [])
  const addons: PricedLine['addons'] = []
  for (const group of item.addonGroups) {
    const picked = group.addons.filter((a) => chosen.has(a.id))
    if (picked.length < group.minSelect || picked.length > group.maxSelect) {
      const rule =
        group.minSelect === group.maxSelect
          ? `exactly ${group.minSelect}`
          : group.minSelect === 0
            ? `up to ${group.maxSelect}`
            : `${group.minSelect} to ${group.maxSelect}`
      throw new CartError('ADDON_LIMIT', `${item.name}: choose ${rule} from ${group.name}.`)
    }
    for (const a of picked) {
      addons.push({ id: a.id, name: a.name, pricePaise: a.pricePaise })
      chosen.delete(a.id)
    }
  }
  if (chosen.size > 0) {
    throw new CartError('UNKNOWN_ADDON', `An extra chosen for ${item.name} is no longer offered.`)
  }

  const unit = base + addons.reduce((sum, a) => sum + a.pricePaise, 0)
  return {
    itemId: item.id,
    name: item.name,
    variantId: variant?.id ?? null,
    variantName: variant?.name ?? null,
    addons,
    quantity: line.quantity,
    unitPricePaise: unit,
    lineTotalPaise: unit * line.quantity,
  }
}

export type QuoteInput = {
  lines: CartLine[]
  menu: Map<number, MenuItem>
  fulfilment: Fulfilment
  pincode?: string | null
  coupon?: Coupon | null
  couponContext?: { now: Date; isFirstOrder: boolean; customerUses: number }
}

export type Quote = {
  lines: PricedLine[]
  totals: Totals
  couponCode: string | null
}

/** The whole bill. Throws {@link CartError} or {@link CouponError} with a message for the customer. */
export function quote(input: QuoteInput): Quote {
  if (input.lines.length === 0) throw new CartError('EMPTY_CART', 'Your cart is empty.')
  if (input.lines.length > MAX_LINES) {
    throw new CartError('BAD_QUANTITY', `A single order can have up to ${MAX_LINES} lines.`)
  }
  const lines = input.lines.map((line) => priceLine(input.menu.get(line.itemId), line))
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotalPaise, 0)

  const { minimumOrderPaise } = RESTAURANT.ordering
  if (subtotal < minimumOrderPaise) {
    throw new CartError(
      'MINIMUM_ORDER',
      `The minimum order is ₹${minimumOrderPaise / 100}. Add ₹${Math.ceil((minimumOrderPaise - subtotal) / 100)} more.`,
    )
  }

  let deliveryFee = 0
  if (input.fulfilment === 'DELIVERY') {
    const fee = input.pincode ? RESTAURANT.delivery.pincodes[input.pincode] : undefined
    if (fee === undefined) {
      throw new CartError('NO_DELIVERY', 'We do not deliver to that pincode yet. Pickup is available.')
    }
    deliveryFee = subtotal >= RESTAURANT.delivery.freeAbovePaise ? 0 : fee
  }

  const discount =
    input.coupon && input.couponContext
      ? evaluateCoupon(input.coupon, { subtotalPaise: subtotal, ...input.couponContext })
      : 0

  return {
    lines,
    totals: totals(subtotal, discount, RESTAURANT.packagingPaise, deliveryFee),
    couponCode: input.coupon && discount > 0 ? input.coupon.code : null,
  }
}

/** GST is charged on what the customer actually pays for: after the discount, with fees. */
export function totals(
  subtotalPaise: number,
  discountPaise: number,
  packagingPaise: number,
  deliveryFeePaise: number,
): Totals {
  const taxable = subtotalPaise - discountPaise + packagingPaise + deliveryFeePaise
  const tax = percentOf(taxable, RESTAURANT.gstBasisPoints)
  return {
    subtotalPaise,
    discountPaise,
    packagingPaise,
    deliveryFeePaise,
    taxPaise: tax,
    totalPaise: taxable + tax,
  }
}
