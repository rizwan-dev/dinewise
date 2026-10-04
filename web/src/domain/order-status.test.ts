import { describe, expect, it } from 'vitest'
import { canMove, isFinal, kitchenNext, ORDER_STATUSES } from './order-status'

describe('order status', () => {
  it('walks a delivery order through the kitchen', () => {
    const steps = ['PLACED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const
    for (let i = 0; i < steps.length - 1; i++) {
      expect(kitchenNext(steps[i]!, 'DELIVERY')).toBe(steps[i + 1])
    }
    expect(kitchenNext('DELIVERED', 'DELIVERY')).toBeNull()
  })

  it('ends a pickup order at collection, never "out for delivery"', () => {
    expect(kitchenNext('READY', 'PICKUP')).toBe('COLLECTED')
    expect(canMove('READY', 'OUT_FOR_DELIVERY', 'PICKUP', 'KITCHEN')).toBe(false)
  })

  it('lets the customer cancel only before cooking starts', () => {
    expect(canMove('PLACED', 'CANCELLED', 'PICKUP', 'CUSTOMER')).toBe(true)
    expect(canMove('PREPARING', 'CANCELLED', 'PICKUP', 'CUSTOMER')).toBe(false)
  })

  it('keeps each move to its owner: customers cannot cook, the kitchen cannot fake a payment', () => {
    expect(canMove('PLACED', 'PREPARING', 'PICKUP', 'CUSTOMER')).toBe(false)
    expect(canMove('AWAITING_PAYMENT', 'PLACED', 'PICKUP', 'KITCHEN')).toBe(false)
    expect(canMove('AWAITING_PAYMENT', 'PLACED', 'PICKUP', 'SYSTEM')).toBe(true)
  })

  it('final states go nowhere', () => {
    for (const from of ORDER_STATUSES.filter(isFinal)) {
      for (const to of ORDER_STATUSES) {
        for (const by of ['CUSTOMER', 'KITCHEN', 'SYSTEM'] as const) {
          expect(canMove(from, to, 'DELIVERY', by)).toBe(false)
        }
      }
    }
  })
})
