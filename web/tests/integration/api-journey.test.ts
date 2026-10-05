import { beforeEach, describe, expect, it } from 'vitest'
import * as otp from '../../src/app/api/v1/auth/otp/route'
import * as verify from '../../src/app/api/v1/auth/otp/verify/route'
import * as board from '../../src/app/api/v1/kitchen/board/route'
import * as kitchenEvents from '../../src/app/api/v1/kitchen/events/route'
import * as move from '../../src/app/api/v1/kitchen/orders/[code]/move/route'
import * as menu from '../../src/app/api/v1/menu/route'
import * as orderEvents from '../../src/app/api/v1/orders/[code]/events/route'
import * as order from '../../src/app/api/v1/orders/[code]/route'
import * as orders from '../../src/app/api/v1/orders/route'
import * as quote from '../../src/app/api/v1/quote/route'
import * as staffSignIn from '../../src/app/api/v1/staff/sign-in/route'
import { call, configure, raw, readEvents, signInCustomer } from './api-client'

beforeEach(() => configure({ demo: true }))

type Item = { id: number; name: string; variants: { id: number; name: string }[] }

describe('the mobile journey, end to end', () => {
  it('signs in, quotes, orders, and follows the kitchen to the door', async () => {
    // The customer signs in; the demo hands back the code.
    const sent = await call(otp.POST, 'POST', '/api/v1/auth/otp', { body: { phone: '9822011002' } })
    const verified = await call(verify.POST, 'POST', '/api/v1/auth/otp/verify', {
      body: { phone: '9822011002', code: sent.body.demoCode, name: 'Priya Joshi' },
    })
    const customer = verified.body.accessToken as string

    // A Full Butter Chicken and two Garlic Naan, quoted for delivery with a coupon.
    const items: Item[] = (await call(menu.GET, 'GET', '/api/v1/menu')).body.sections.flatMap(
      (s: { items: Item[] }) => s.items,
    )
    const chicken = items.find((i) => i.name === 'Butter Chicken')!
    const naan = items.find((i) => i.name === 'Garlic Naan')!
    const lines = [
      { itemId: chicken.id, variantId: chicken.variants.find((v) => v.name === 'Full')!.id, quantity: 1 },
      { itemId: naan.id, quantity: 2 },
    ]
    const priced = await call(quote.POST, 'POST', '/api/v1/quote', {
      token: customer,
      body: { lines, fulfilment: 'DELIVERY', pincode: '411021', couponCode: 'WELCOME50' },
    })
    expect(priced.body.ok).toBe(true)
    expect(priced.body.coupon.applied).toBe(true)

    const placed = await call(orders.POST, 'POST', '/api/v1/orders', {
      token: customer,
      body: {
        lines,
        fulfilment: 'DELIVERY',
        newAddress: { line1: '12 Aundh Road', pincode: '411021' },
        slot: priced.body.slots.asap,
        couponCode: 'WELCOME50',
      },
    })
    expect(placed.status).toBe(201)
    const code = placed.body.order.code as string
    // The bill on the order is the bill the quote showed.
    expect(placed.body.order.totals).toEqual(priced.body.totals)

    // The customer and the kitchen each listen for changes.
    const controller = new AbortController()
    const customerStream = readEvents(
      await raw(orderEvents.GET, 'GET', `/api/v1/orders/${code}/events`, {
        token: customer,
        params: { code },
        signal: controller.signal,
      }),
    )
    const staff = await call(staffSignIn.POST, 'POST', '/api/v1/staff/sign-in', {
      body: { email: 'kitchen@tadkalane.example', password: 'test-password-123' },
    })
    const kitchen = staff.body.accessToken as string
    const kitchenResponse = await raw(kitchenEvents.GET, 'GET', '/api/v1/kitchen/events', { token: kitchen })
    expect(kitchenResponse.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
    const kitchenStream = readEvents(kitchenResponse)
    await Promise.all([customerStream.ready(), kitchenStream.ready()])

    try {
      const { body: onBoard } = await call(board.GET, 'GET', '/api/v1/kitchen/board', { token: kitchen })
      const ticket = [...onBoard.current, ...onBoard.later].find((t: { code: string }) => t.code === code)
      expect(ticket).toMatchObject({
        kitchenNext: 'PREPARING',
        cashToCollectPaise: placed.body.order.totals.totalPaise,
      })

      // The kitchen presses its one big button until the order is delivered.
      const seen: string[] = []
      let next: string | null = ticket.kitchenNext
      while (next) {
        const moved = await call(move.POST, 'POST', '', {
          token: kitchen,
          params: { code },
          body: { to: next },
        })
        expect(moved.status).toBe(200)
        seen.push(moved.body.status)
        next = moved.body.kitchenNext

        const { body } = await call(order.GET, 'GET', `/api/v1/orders/${code}`, {
          token: customer,
          params: { code },
        })
        expect(body.order.status).toBe(moved.body.status)
      }
      expect(seen).toEqual(['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'])

      await customerStream.waitFor(4)
      expect(customerStream.events).toEqual(
        seen.map((status) => ({
          event: 'order',
          data: { id: expect.any(Number), code, status, paymentStatus: 'NOT_REQUIRED' },
        })),
      )
      await kitchenStream.waitFor(4)
      expect(kitchenStream.events.filter((e) => e.data.code === code).map((e) => e.data.status)).toEqual(seen)

      const { body } = await call(order.GET, 'GET', `/api/v1/orders/${code}`, {
        token: customer,
        params: { code },
      })
      expect(body.order).toMatchObject({
        status: 'DELIVERED',
        final: true,
        canCancel: false,
        cashDuePaise: null,
      })
      expect(body.order.timeline.map((e: { status: string }) => e.status)).toEqual(['PLACED', ...seen])
      expect(body.order.steps.every((s: { done: boolean }) => s.done)).toBe(true)
    } finally {
      controller.abort()
      await customerStream.close()
      await kitchenStream.close()
    }
  })

  it("refuses to stream someone else's order", async () => {
    configure()
    const priya = await signInCustomer('9822011002', 'Priya')
    const rohan = await signInCustomer('9822011003', 'Rohan')
    const [first] = (await call(menu.GET, 'GET', '/api/v1/menu')).body.sections[0].items
    const placed = await call(orders.POST, 'POST', '/api/v1/orders', {
      token: priya,
      body: { lines: [{ itemId: first.id, quantity: 3 }], fulfilment: 'PICKUP', slot: 'ASAP' },
    })
    const code = placed.body.order.code
    const theirs = await call(orderEvents.GET, 'GET', '', { token: rohan, params: { code } })
    expect(theirs.status).toBe(404)
    const anonymous = await call(orderEvents.GET, 'GET', '', { params: { code } })
    expect(anonymous.status).toBe(401)
  })
})
