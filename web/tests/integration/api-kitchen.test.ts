import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as availability from '../../src/app/api/v1/kitchen/menu/[itemId]/availability/route'
import * as board from '../../src/app/api/v1/kitchen/board/route'
import * as kitchenEvents from '../../src/app/api/v1/kitchen/events/route'
import * as move from '../../src/app/api/v1/kitchen/orders/[code]/move/route'
import * as menu from '../../src/app/api/v1/menu/route'
import * as orders from '../../src/app/api/v1/orders/route'
import * as demoSignIn from '../../src/app/api/v1/staff/demo-sign-in/route'
import * as staffMe from '../../src/app/api/v1/staff/me/route'
import * as staffSignIn from '../../src/app/api/v1/staff/sign-in/route'
import * as staffSignOut from '../../src/app/api/v1/staff/sign-out/route'
import { staff } from '../../src/db/schema'
import { call, configure, signInCustomer, signInStaff } from './api-client'
import { itemId } from './helpers'
import { db } from './setup'

beforeEach(() => configure())

async function placePickup() {
  const token = await signInCustomer('9822011002', 'Priya')
  const { body } = await call(orders.POST, 'POST', '/api/v1/orders', {
    token,
    body: {
      lines: [{ itemId: await itemId('Paneer Tikka'), quantity: 2 }],
      fulfilment: 'PICKUP',
      slot: 'ASAP',
    },
  })
  return body.order.code as string
}

const allTickets = (body: { current: { code: string }[]; later: { code: string }[] }) => [
  ...body.current,
  ...body.later,
]

describe('staff sign-in', () => {
  it('signs in with email and password, and signs out', async () => {
    const wrong = await call(staffSignIn.POST, 'POST', '/api/v1/staff/sign-in', {
      body: { email: 'kitchen@tadkalane.example', password: 'nope-nope-nope' },
    })
    expect(wrong.status).toBe(401)
    expect(wrong.body.error).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect.',
    })

    const ok = await call(staffSignIn.POST, 'POST', '/api/v1/staff/sign-in', {
      body: { email: ' Kitchen@TadkaLane.example ', password: 'test-password-123' },
    })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({
      tokenType: 'Bearer',
      staff: { role: 'KITCHEN', email: 'kitchen@tadkalane.example' },
    })
    const hours = (Date.parse(ok.body.expiresAt) - Date.now()) / 3600_000
    expect(hours).toBeGreaterThan(11.9)
    expect(hours).toBeLessThanOrEqual(12)

    const token = ok.body.accessToken
    const me = await call(staffMe.GET, 'GET', '/api/v1/staff/me', { token })
    expect(me.body.staff).toMatchObject({ name: expect.any(String), role: 'KITCHEN' })

    expect((await call(staffSignOut.POST, 'POST', '/api/v1/staff/sign-out', { token })).status).toBe(204)
    expect((await call(staffMe.GET, 'GET', '/api/v1/staff/me', { token })).status).toBe(401)
  })

  it('offers one-tap demo sign-in only in the demo', async () => {
    const off = await call(demoSignIn.POST, 'POST', '/api/v1/staff/demo-sign-in', {
      body: { role: 'MANAGER' },
    })
    expect(off.status).toBe(403)
    expect(off.body.error.code).toBe('NOT_DEMO')

    configure({ demo: true })
    const on = await call(demoSignIn.POST, 'POST', '/api/v1/staff/demo-sign-in', {
      body: { role: 'MANAGER' },
    })
    expect(on.status).toBe(200)
    expect(on.body.staff).toMatchObject({ role: 'MANAGER', email: 'manager@tadkalane.example' })
    const bad = await call(demoSignIn.POST, 'POST', '/api/v1/staff/demo-sign-in', { body: { role: 'OWNER' } })
    expect(bad.status).toBe(400)
  })

  it('refuses customer tokens, and staff whose account was switched off', async () => {
    const customer = await signInCustomer()
    const asCustomer = await call(board.GET, 'GET', '/api/v1/kitchen/board', { token: customer })
    expect(asCustomer.status).toBe(401)
    expect((await call(board.GET, 'GET', '/api/v1/kitchen/board')).status).toBe(401)

    const token = await signInStaff('kitchen')
    expect((await call(board.GET, 'GET', '/api/v1/kitchen/board', { token })).status).toBe(200)
    await db.update(staff).set({ active: false }).where(eq(staff.email, 'kitchen@tadkalane.example'))
    expect((await call(board.GET, 'GET', '/api/v1/kitchen/board', { token })).status).toBe(401)
  })
})

describe('the kitchen board', () => {
  it('shows each ticket with its next step, and moves it by the web rules', async () => {
    const code = await placePickup()
    for (const role of ['kitchen', 'manager'] as const) {
      const { body } = await call(board.GET, 'GET', '/api/v1/kitchen/board', {
        token: await signInStaff(role),
      })
      expect(body.rejectReasons).toContain('Kitchen too busy')
      const ticket = allTickets(body).find((t) => t.code === code)
      expect(ticket).toMatchObject({
        status: 'PLACED',
        fulfilment: 'PICKUP',
        customerName: 'Priya',
        kitchenNext: 'PREPARING',
        kitchenNextLabel: 'Start cooking',
        canReject: true,
        paidOnline: false,
        cashToCollectPaise: 60900,
        items: [{ quantity: 2, name: 'Paneer Tikka', details: '' }],
      })
    }

    const token = await signInStaff()
    const skip = await call(move.POST, 'POST', '', { token, params: { code }, body: { to: 'READY' } })
    expect(skip.status).toBe(409)
    expect(skip.body.error.code).toBe('INVALID_TRANSITION')

    const cooking = await call(move.POST, 'POST', '', { token, params: { code }, body: { to: 'PREPARING' } })
    expect(cooking.body).toEqual({
      code,
      status: 'PREPARING',
      statusLabel: 'Being prepared',
      kitchenNext: 'READY',
      kitchenNextLabel: 'Mark ready',
      canReject: true,
    })
    // The same request again is refused rather than skipping a step.
    expect(
      (await call(move.POST, 'POST', '', { token, params: { code }, body: { to: 'PREPARING' } })).status,
    ).toBe(409)

    const noReason = await call(move.POST, 'POST', '', { token, params: { code }, body: { to: 'REJECTED' } })
    expect(noReason.status).toBe(422)
    expect(noReason.body.error).toMatchObject({ code: 'REASON_REQUIRED', field: 'note' })
    const rejected = await call(move.POST, 'POST', '', {
      token,
      params: { code },
      body: { to: 'REJECTED', reason: 'Kitchen too busy' },
    })
    expect(rejected.body).toMatchObject({ status: 'REJECTED', kitchenNext: null, canReject: false })

    const { body } = await call(board.GET, 'GET', '/api/v1/kitchen/board', { token })
    expect(allTickets(body).find((t) => t.code === code)).toBeUndefined()

    const missing = await call(move.POST, 'POST', '', {
      token,
      params: { code: 'TL-ZZZZZZ' },
      body: { to: 'READY' },
    })
    expect(missing.status).toBe(404)
  })

  it('marks a dish sold out and back on', async () => {
    const token = await signInStaff()
    const id = await itemId('Paneer Tikka')
    const set = (available: unknown, itemIdParam = String(id)) =>
      call(availability.POST, 'POST', '', { token, params: { itemId: itemIdParam }, body: { available } })

    expect((await set(false)).body).toEqual({ itemId: id, available: false })
    const soldOut = await call(menu.GET, 'GET', '/api/v1/menu')
    const item = soldOut.body.sections
      .flatMap((s: { items: { id: number }[] }) => s.items)
      .find((i: { id: number }) => i.id === id)
    expect(item.available).toBe(false)

    expect((await set(true)).body.available).toBe(true)
    expect((await set('yes')).status).toBe(400)
    expect((await set(true, '999999')).status).toBe(404)
    expect((await set(true, 'abc')).status).toBe(404)

    const customer = await signInCustomer()
    const asCustomer = await call(availability.POST, 'POST', '', {
      token: customer,
      params: { itemId: String(id) },
      body: { available: false },
    })
    expect(asCustomer.status).toBe(401)
  })

  it('streams kitchen updates to staff only', async () => {
    const customer = await signInCustomer()
    const refused = await call(kitchenEvents.GET, 'GET', '/api/v1/kitchen/events', { token: customer })
    expect(refused.status).toBe(401)
  })
})
