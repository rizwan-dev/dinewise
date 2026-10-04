import { describe, expect, it } from 'vitest'
import { type Coupon, evaluateCoupon, normaliseCouponCode } from './coupons'

const base: Coupon = {
  code: 'FLAT50',
  kind: 'FLAT',
  value: 50_00,
  minOrderPaise: 300_00,
  maxDiscountPaise: null,
  startsAt: new Date('2026-10-01T00:00:00Z'),
  endsAt: new Date('2026-11-01T00:00:00Z'),
  active: true,
  firstOrderOnly: false,
  perCustomerLimit: null,
}
const ctx = {
  subtotalPaise: 400_00,
  now: new Date('2026-10-05T12:00:00Z'),
  isFirstOrder: false,
  customerUses: 0,
}

describe('coupons', () => {
  it('gives a flat amount off', () => {
    expect(evaluateCoupon(base, ctx)).toBe(50_00)
  })

  it('caps a percentage, and never discounts more than the food costs', () => {
    const pct: Coupon = { ...base, kind: 'PERCENT', value: 5000, maxDiscountPaise: 150_00, minOrderPaise: 0 }
    expect(evaluateCoupon(pct, ctx)).toBe(150_00)
    const huge: Coupon = { ...base, value: 10_000_00, minOrderPaise: 0 }
    expect(evaluateCoupon(huge, ctx)).toBe(400_00)
  })

  it.each([
    [{ active: false }, ctx, 'INACTIVE'],
    [{}, { ...ctx, now: new Date('2026-09-30T23:59:59Z') }, 'NOT_STARTED'],
    [{}, { ...ctx, now: new Date('2026-11-01T00:00:00Z') }, 'EXPIRED'],
    [{}, { ...ctx, subtotalPaise: 299_99 }, 'MIN_ORDER'],
    [{ firstOrderOnly: true }, ctx, 'FIRST_ORDER_ONLY'],
    [{ perCustomerLimit: 1 }, { ...ctx, customerUses: 1 }, 'USED_UP'],
  ] as const)('refuses with a reason: %o -> %s', (changes, context, code) => {
    expect(() => evaluateCoupon({ ...base, ...changes }, context)).toThrow(expect.objectContaining({ code }))
  })

  it('reads codes the way people type them', () => {
    expect(normaliseCouponCode('  welcome 20 ')).toBe('WELCOME20')
  })
})
