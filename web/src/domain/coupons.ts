import { percentOf } from './money'

export type Coupon = {
  code: string
  kind: 'PERCENT' | 'FLAT'
  /** Basis points for PERCENT (1000 = 10%), paise for FLAT. */
  value: number
  minOrderPaise: number
  /** Caps a percentage discount; null for no cap. */
  maxDiscountPaise: number | null
  startsAt: Date
  endsAt: Date
  active: boolean
  firstOrderOnly: boolean
  /** Times one customer may use it; null for unlimited. */
  perCustomerLimit: number | null
}

export class CouponError extends Error {
  constructor(
    readonly code: 'INACTIVE' | 'NOT_STARTED' | 'EXPIRED' | 'MIN_ORDER' | 'FIRST_ORDER_ONLY' | 'USED_UP',
    message: string,
  ) {
    super(message)
    this.name = 'CouponError'
  }
}

/** The discount in paise, or a {@link CouponError} saying, in plain words, why it does not apply. */
export function evaluateCoupon(
  coupon: Coupon,
  ctx: { subtotalPaise: number; now: Date; isFirstOrder: boolean; customerUses: number },
): number {
  if (!coupon.active) throw new CouponError('INACTIVE', `${coupon.code} is not active.`)
  if (ctx.now < coupon.startsAt) throw new CouponError('NOT_STARTED', `${coupon.code} has not started yet.`)
  if (ctx.now >= coupon.endsAt) throw new CouponError('EXPIRED', `${coupon.code} has expired.`)
  if (coupon.firstOrderOnly && !ctx.isFirstOrder) {
    throw new CouponError('FIRST_ORDER_ONLY', `${coupon.code} is for your first order only.`)
  }
  if (coupon.perCustomerLimit !== null && ctx.customerUses >= coupon.perCustomerLimit) {
    throw new CouponError('USED_UP', `You have already used ${coupon.code}.`)
  }
  if (ctx.subtotalPaise < coupon.minOrderPaise) {
    throw new CouponError(
      'MIN_ORDER',
      `${coupon.code} needs an order of ₹${coupon.minOrderPaise / 100} or more.`,
    )
  }

  const raw =
    coupon.kind === 'PERCENT' ? percentOf(ctx.subtotalPaise, coupon.value) : coupon.value
  const capped = coupon.maxDiscountPaise === null ? raw : Math.min(raw, coupon.maxDiscountPaise)
  // A discount never makes the food free or negative.
  return Math.min(capped, ctx.subtotalPaise)
}

export function normaliseCouponCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '')
}
