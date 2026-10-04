import { describe, expect, it } from 'vitest'
import type { Coupon } from './coupons'
import { CouponError } from './coupons'
import type { MenuItem } from './menu'
import { CartError, priceLine, quote, totals } from './pricing'

const paneer: MenuItem = {
  id: 1,
  name: 'Paneer Tikka',
  pricePaise: 280_00,
  available: true,
  veg: true,
  variants: [],
  addonGroups: [],
}

const biryani: MenuItem = {
  id: 2,
  name: 'Chicken Biryani',
  pricePaise: 0,
  available: true,
  veg: false,
  variants: [
    { id: 21, name: 'Half', pricePaise: 220_00 },
    { id: 22, name: 'Full', pricePaise: 360_00 },
  ],
  addonGroups: [
    {
      id: 30,
      name: 'Extras',
      minSelect: 0,
      maxSelect: 2,
      addons: [
        { id: 31, name: 'Extra raita', pricePaise: 40_00 },
        { id: 32, name: 'Boiled egg', pricePaise: 25_00 },
        { id: 33, name: 'Salan', pricePaise: 30_00 },
      ],
    },
  ],
}

const thali: MenuItem = {
  id: 3,
  name: 'Thali',
  pricePaise: 320_00,
  available: true,
  veg: true,
  variants: [],
  addonGroups: [
    {
      id: 40,
      name: 'Bread',
      minSelect: 1,
      maxSelect: 1,
      addons: [
        { id: 41, name: 'Roti', pricePaise: 0 },
        { id: 42, name: 'Butter naan', pricePaise: 20_00 },
      ],
    },
  ],
}

const menu = new Map([paneer, biryani, thali].map((i) => [i.id, i]))

describe('pricing a line', () => {
  it('uses the variant price plus extras, times the quantity', () => {
    const line = priceLine(biryani, { itemId: 2, variantId: 22, addonIds: [31, 32], quantity: 2 })
    expect(line.unitPricePaise).toBe(360_00 + 40_00 + 25_00)
    expect(line.lineTotalPaise).toBe(2 * 425_00)
    expect(line.variantName).toBe('Full')
    expect(line.addons.map((a) => a.name)).toEqual(['Extra raita', 'Boiled egg'])
  })

  it('insists on a size when the item has sizes', () => {
    expect(() => priceLine(biryani, { itemId: 2, quantity: 1 })).toThrow(
      expect.objectContaining({ code: 'CHOOSE_VARIANT' }),
    )
  })

  it('enforces "choose exactly one" and "up to two"', () => {
    expect(() => priceLine(thali, { itemId: 3, quantity: 1 })).toThrow('choose exactly 1 from Bread')
    expect(() => priceLine(thali, { itemId: 3, quantity: 1, addonIds: [41, 42] })).toThrow(CartError)
    expect(() =>
      priceLine(biryani, { itemId: 2, variantId: 21, quantity: 1, addonIds: [31, 32, 33] }),
    ).toThrow('choose up to 2 from Extras')
  })

  it('rejects extras that belong to another dish, sold-out items and silly quantities', () => {
    expect(() => priceLine(paneer, { itemId: 1, quantity: 1, addonIds: [31] })).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_ADDON' }),
    )
    expect(() => priceLine({ ...paneer, available: false }, { itemId: 1, quantity: 1 })).toThrow(
      'Paneer Tikka is sold out right now.',
    )
    for (const quantity of [0, -1, 1.5, 21]) {
      expect(() => priceLine(paneer, { itemId: 1, quantity })).toThrow(
        expect.objectContaining({ code: 'BAD_QUANTITY' }),
      )
    }
    expect(() => priceLine(undefined, { itemId: 99, quantity: 1 })).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_ITEM' }),
    )
  })
})

describe('the whole bill', () => {
  it('adds packing and 5% GST for pickup', () => {
    const q = quote({ lines: [{ itemId: 1, quantity: 1 }], menu, fulfilment: 'PICKUP' })
    // 280 + 20 packing = 300; 5% GST = 15.
    expect(q.totals).toEqual({
      subtotalPaise: 280_00,
      discountPaise: 0,
      packagingPaise: 20_00,
      deliveryFeePaise: 0,
      taxPaise: 15_00,
      totalPaise: 315_00,
    })
  })

  it('charges the pincode delivery fee, and delivers free above ₹800', () => {
    const small = quote({
      lines: [{ itemId: 1, quantity: 1 }],
      menu,
      fulfilment: 'DELIVERY',
      pincode: '411021',
    })
    expect(small.totals.deliveryFeePaise).toBe(40_00)

    const large = quote({
      lines: [{ itemId: 1, quantity: 3 }],
      menu,
      fulfilment: 'DELIVERY',
      pincode: '411021',
    })
    expect(large.totals.deliveryFeePaise).toBe(0)
  })

  it('refuses pincodes outside the delivery area, and orders under the minimum', () => {
    expect(() =>
      quote({ lines: [{ itemId: 1, quantity: 1 }], menu, fulfilment: 'DELIVERY', pincode: '400001' }),
    ).toThrow(expect.objectContaining({ code: 'NO_DELIVERY' }))
    const chai: MenuItem = { ...paneer, id: 9, name: 'Masala chai', pricePaise: 40_00 }
    expect(() =>
      quote({ lines: [{ itemId: 9, quantity: 2 }], menu: new Map([[9, chai]]), fulfilment: 'PICKUP' }),
    ).toThrow('The minimum order is ₹200. Add ₹120 more.')
    expect(() => quote({ lines: [], menu, fulfilment: 'PICKUP' })).toThrow('Your cart is empty.')
  })

  it('taxes the discounted amount, not the list price', () => {
    const coupon: Coupon = {
      code: 'WELCOME20',
      kind: 'PERCENT',
      value: 2000,
      minOrderPaise: 0,
      maxDiscountPaise: 100_00,
      startsAt: new Date('2026-01-01'),
      endsAt: new Date('2027-01-01'),
      active: true,
      firstOrderOnly: true,
      perCustomerLimit: 1,
    }
    const q = quote({
      lines: [{ itemId: 1, quantity: 2 }],
      menu,
      fulfilment: 'PICKUP',
      coupon,
      couponContext: { now: new Date('2026-10-05'), isFirstOrder: true, customerUses: 0 },
    })
    // 560 subtotal, 20% = 112 capped at 100. Taxable 560 - 100 + 20 = 480, GST 24.
    expect(q.totals.discountPaise).toBe(100_00)
    expect(q.totals.taxPaise).toBe(24_00)
    expect(q.totals.totalPaise).toBe(504_00)
    expect(q.couponCode).toBe('WELCOME20')

    expect(() =>
      quote({
        lines: [{ itemId: 1, quantity: 2 }],
        menu,
        fulfilment: 'PICKUP',
        coupon,
        couponContext: { now: new Date('2026-10-05'), isFirstOrder: false, customerUses: 0 },
      }),
    ).toThrow(CouponError)
  })

  it('always adds up: total = subtotal - discount + packing + delivery + tax', () => {
    for (const [s, d, p, f] of [
      [1, 0, 0, 0],
      [33_33, 3_33, 20_00, 40_00],
      [999_99, 999_99, 0, 0],
    ] as const) {
      const t = totals(s, d, p, f)
      expect(t.totalPaise).toBe(s - d + p + f + t.taxPaise)
    }
  })
})
