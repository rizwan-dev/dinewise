import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as otp from '../../src/app/api/v1/auth/otp/route'
import * as verify from '../../src/app/api/v1/auth/otp/verify/route'
import * as signOut from '../../src/app/api/v1/auth/sign-out/route'
import * as me from '../../src/app/api/v1/me/route'
import * as menu from '../../src/app/api/v1/menu/route'
import * as offers from '../../src/app/api/v1/offers/route'
import * as cancel from '../../src/app/api/v1/orders/[code]/cancel/route'
import * as order from '../../src/app/api/v1/orders/[code]/route'
import * as orders from '../../src/app/api/v1/orders/route'
import * as quote from '../../src/app/api/v1/quote/route'
import * as restaurant from '../../src/app/api/v1/restaurant/route'
import * as slots from '../../src/app/api/v1/slots/route'
import * as move from '../../src/app/api/v1/kitchen/orders/[code]/move/route'
import { menuItems, orders as ordersTable } from '../../src/db/schema'
import { outboxCode } from '../../src/server/auth/otp'
import { call, configure, signInCustomer, signInStaff } from './api-client'
import { itemId } from './helpers'
import { db } from './setup'

beforeEach(() => configure())

const tikka = async (quantity = 2) => [{ itemId: await itemId('Paneer Tikka'), quantity }]

describe('GET /api/v1/restaurant, /menu, /offers, /slots', () => {
  it('describes the restaurant and every rule behind the bill', async () => {
    const { status, body, headers } = await call(restaurant.GET, 'GET', '/api/v1/restaurant')
    expect(status).toBe(200)
    expect(headers.get('cache-control')).toBe('no-store')
    expect(body).toMatchObject({
      name: 'Tadka Lane',
      timeZone: 'Asia/Kolkata',
      currency: 'INR',
      demo: false,
      ordering: { paymentMethods: ['ON_DELIVERY'], slotMinutes: 15, minimumOrderPaise: 20000 },
      charges: {
        packagingPaise: 2000,
        gstBasisPoints: 500,
        delivery: { freeAbovePaise: 80000 },
      },
    })
    expect(body.hours).toHaveLength(7)
    expect(body.hours[1]).toEqual({ weekday: 1, day: 'Monday', open: '11:30', close: '22:30' })
    expect(body.charges.delivery.pincodes).toContainEqual({ pincode: '411045', feePaise: 3000 })
    expect(typeof body.openNow).toBe('boolean')
  })

  it('lists the menu with absolute photo URLs, sizes and extras', async () => {
    const { status, body } = await call(menu.GET, 'GET', '/api/v1/menu')
    expect(status).toBe(200)
    const items = body.sections.flatMap((s: { items: unknown[] }) => s.items)
    const butterChicken = items.find((i: { name: string }) => i.name === 'Butter Chicken')
    expect(butterChicken).toMatchObject({
      veg: false,
      available: true,
      pricePaise: 38000,
      fromPricePaise: 26000,
      variants: [
        { name: 'Half', pricePaise: 26000 },
        { name: 'Full', pricePaise: 38000 },
      ],
    })
    expect(butterChicken.photoUrl).toBe('http://localhost:3000/menu/butter-chicken.webp')

    // Behind a proxy, photo URLs use the host the app called.
    const proxied = await call(menu.GET, 'GET', '/api/v1/menu', {
      headers: { 'x-forwarded-host': 'dinewise.example.com', 'x-forwarded-proto': 'https' },
    })
    expect(proxied.body.sections[0].items[0].photoUrl).toMatch(/^https:\/\/dinewise\.example\.com\/menu\//)
    const kadai = items.find((i: { name: string }) => i.name === 'Kadai Mushroom')
    expect(kadai.addonGroups[0]).toMatchObject({ name: 'Spice level', minSelect: 1, maxSelect: 1 })
  })

  it('lists the offers shown on the home page', async () => {
    const { body } = await call(offers.GET, 'GET', '/api/v1/offers')
    expect(body.offers.map((o: { code: string }) => o.code)).toEqual(['WELCOME50', 'TADKA10'])
    expect(body.offers[0]).toMatchObject({ firstOrderOnly: true })
  })

  it('lists ASAP and scheduled slots', async () => {
    const { body } = await call(slots.GET, 'GET', '/api/v1/slots')
    expect(body.asap).toEqual(expect.any(String))
    expect(body.slots[0]).toMatchObject({ value: expect.any(String), date: expect.any(String), full: false })
  })
})

describe('POST /api/v1/quote', () => {
  it('prices a pickup cart with a coupon, exactly as the web cart does', async () => {
    const { status, body } = await call(quote.POST, 'POST', '/api/v1/quote', {
      body: { lines: await tikka(), fulfilment: 'PICKUP', couponCode: 'welcome50' },
    })
    expect(status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      problem: null,
      currency: 'INR',
      coupon: { applied: true, code: 'WELCOME50', problem: null },
      totals: {
        subtotalPaise: 56000,
        discountPaise: 5000,
        packagingPaise: 2000,
        deliveryFeePaise: 0,
        taxPaise: 2650,
        totalPaise: 55650,
      },
    })
    expect(body.lines[0]).toMatchObject({ name: 'Paneer Tikka', quantity: 2, unitPricePaise: 28000 })
    expect(body.slots.asap).toEqual(expect.any(String))
  })

  it('adds the delivery fee for the pincode, and refuses one outside the area', async () => {
    const lines = await tikka()
    const inArea = await call(quote.POST, 'POST', '/api/v1/quote', {
      body: { lines, fulfilment: 'DELIVERY', pincode: '411045' },
    })
    expect(inArea.body.totals).toMatchObject({ deliveryFeePaise: 3000, taxPaise: 3050, totalPaise: 64050 })

    const outside = await call(quote.POST, 'POST', '/api/v1/quote', {
      body: { lines, fulfilment: 'DELIVERY', pincode: '400001' },
    })
    expect(outside.status).toBe(200)
    expect(outside.body).toMatchObject({ ok: false, totals: null, problem: { code: 'NO_DELIVERY' } })
  })

  it('checks coupon rules for the signed-in customer, and prices the bill without a coupon that fails', async () => {
    const token = await signInCustomer()
    const placed = await call(orders.POST, 'POST', '/api/v1/orders', {
      token,
      body: { lines: await tikka(), name: 'Priya', fulfilment: 'PICKUP', slot: 'ASAP' },
    })
    expect(placed.status).toBe(201)

    const { body } = await call(quote.POST, 'POST', '/api/v1/quote', {
      token,
      body: { lines: await tikka(), fulfilment: 'PICKUP', couponCode: 'WELCOME50' },
    })
    expect(body.ok).toBe(true)
    expect(body.coupon).toEqual({
      applied: false,
      code: null,
      problem: { code: 'COUPON_FIRST_ORDER_ONLY', message: 'WELCOME50 is for your first order only.' },
    })
    expect(body.totals.discountPaise).toBe(0)

    const unknown = await call(quote.POST, 'POST', '/api/v1/quote', {
      body: { lines: await tikka(), fulfilment: 'PICKUP', couponCode: 'NOPE' },
    })
    expect(unknown.body.coupon.problem.code).toBe('COUPON_NOT_FOUND')
  })

  it('answers a malformed request with a 400 in the error format', async () => {
    const bad = await call(quote.POST, 'POST', '/api/v1/quote', { body: { lines: [], fulfilment: 'BOAT' } })
    expect(bad.status).toBe(400)
    expect(bad.body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: expect.stringContaining('fulfilment'),
        field: 'fulfilment',
      },
    })
    const notJson = await call(quote.POST, 'POST', '/api/v1/quote', { body: '{nope' })
    expect(notJson.status).toBe(400)
    expect(notJson.body.error.code).toBe('INVALID_JSON')
  })
})

describe('sign-in by one-time code', () => {
  it('never returns the code outside the demo', async () => {
    const { status, body } = await call(otp.POST, 'POST', '/api/v1/auth/otp', {
      body: { phone: '98220 11002' },
    })
    expect(status).toBe(200)
    expect(body).toEqual({ phone: '+919822011002', expiresInSeconds: 300 })
  })

  it('returns the code in the demo, as the web "Fill it in" button does', async () => {
    configure({ demo: true })
    const { body } = await call(otp.POST, 'POST', '/api/v1/auth/otp', { body: { phone: '9822011002' } })
    expect(body.demoCode).toMatch(/^\d{6}$/)
    expect(body.demoCode).toBe(await outboxCode(db, '+919822011002'))
  })

  it('refuses a bad phone, a wrong code and a fourth code in ten minutes', async () => {
    const bad = await call(otp.POST, 'POST', '/api/v1/auth/otp', { body: { phone: '12345' } })
    expect(bad.status).toBe(400)
    expect(bad.body.error).toMatchObject({ code: 'INVALID_PHONE', field: 'phone' })

    await call(otp.POST, 'POST', '/api/v1/auth/otp', { body: { phone: '9822011002' } })
    const code = (await outboxCode(db, '+919822011002'))!
    const wrong = await call(verify.POST, 'POST', '/api/v1/auth/otp/verify', {
      body: { phone: '9822011002', code: code === '000000' ? '111111' : '000000' },
    })
    expect(wrong.status).toBe(422)
    expect(wrong.body.error).toMatchObject({ code: 'WRONG_CODE', field: 'code' })

    await call(otp.POST, 'POST', '/api/v1/auth/otp', { body: { phone: '9822011002' } })
    await call(otp.POST, 'POST', '/api/v1/auth/otp', { body: { phone: '9822011002' } })
    const fourth = await call(otp.POST, 'POST', '/api/v1/auth/otp', { body: { phone: '9822011002' } })
    expect(fourth.status).toBe(429)
    expect(fourth.body.error.code).toBe('TOO_MANY_CODES')
  })

  it('gives a token that works until it is signed out', async () => {
    await call(otp.POST, 'POST', '/api/v1/auth/otp', { body: { phone: '9822011002' } })
    const code = await outboxCode(db, '+919822011002')
    const verified = await call(verify.POST, 'POST', '/api/v1/auth/otp/verify', {
      body: { phone: '9822011002', code, name: 'Priya Joshi' },
    })
    expect(verified.status).toBe(200)
    expect(verified.body).toMatchObject({
      tokenType: 'Bearer',
      isNewCustomer: true,
      customer: { phone: '+919822011002', name: 'Priya Joshi' },
    })
    const token = verified.body.accessToken
    expect(Date.parse(verified.body.expiresAt) - Date.now()).toBeGreaterThan(29 * 24 * 3600_000)

    const who = await call(me.GET, 'GET', '/api/v1/me', { token })
    expect(who.body).toEqual({ customer: verified.body.customer, addresses: [] })

    expect((await call(signOut.POST, 'POST', '/api/v1/auth/sign-out', { token })).status).toBe(204)
    const after = await call(me.GET, 'GET', '/api/v1/me', { token })
    expect(after.status).toBe(401)
    expect(after.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('refuses a missing, malformed or staff token on customer endpoints', async () => {
    expect((await call(me.GET, 'GET', '/api/v1/me')).status).toBe(401)
    expect(
      (await call(me.GET, 'GET', '/api/v1/me', { token: 'not-a-real-token-but-long-enough' })).status,
    ).toBe(401)
    const staffToken = await signInStaff()
    expect((await call(me.GET, 'GET', '/api/v1/me', { token: staffToken })).status).toBe(401)
    expect((await call(orders.GET, 'GET', '/api/v1/orders', { token: staffToken })).status).toBe(401)
  })
})

describe('orders', () => {
  it('places a cash delivery order, saves the address, and lists it', async () => {
    const token = await signInCustomer()
    const { status, body, headers } = await call(orders.POST, 'POST', '/api/v1/orders', {
      token,
      body: {
        lines: await tikka(),
        name: 'Priya Joshi',
        fulfilment: 'DELIVERY',
        newAddress: { label: 'Home', line1: 'Flat 4, Baner Road', pincode: '411045' },
        saveAddress: true,
        slot: 'ASAP',
        paymentMethod: 'ON_DELIVERY',
        couponCode: 'WELCOME50',
        notes: 'Ring the bell',
      },
    })
    expect(status).toBe(201)
    expect(headers.get('location')).toBe(`/api/v1/orders/${body.order.code}`)
    expect(body.order).toMatchObject({
      status: 'PLACED',
      statusLabel: 'Order received',
      fulfilment: 'DELIVERY',
      paymentMethod: 'ON_DELIVERY',
      paymentStatus: 'NOT_REQUIRED',
      canCancel: true,
      couponCode: 'WELCOME50',
      notes: 'Ring the bell',
      address: { line1: 'Flat 4, Baner Road', pincode: '411045' },
      totals: { subtotalPaise: 56000, discountPaise: 5000, deliveryFeePaise: 3000, totalPaise: 58800 },
      cashDuePaise: 58800,
      timeline: [{ status: 'PLACED', actor: 'CUSTOMER' }],
    })
    expect(body.order.steps.map((s: { status: string }) => s.status)).toEqual([
      'PLACED',
      'PREPARING',
      'READY',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ])

    const who = await call(me.GET, 'GET', '/api/v1/me', { token })
    expect(who.body.addresses).toEqual([expect.objectContaining({ line1: 'Flat 4, Baner Road' })])

    // The saved address can be used by id next time.
    const again = await call(orders.POST, 'POST', '/api/v1/orders', {
      token,
      body: {
        lines: await tikka(),
        fulfilment: 'DELIVERY',
        addressId: who.body.addresses[0].id,
        slot: 'ASAP',
      },
    })
    expect(again.status).toBe(201)
    expect(again.body.order.customerName).toBe('Priya Joshi')

    const list = await call(orders.GET, 'GET', '/api/v1/orders', { token })
    expect(list.body.orders.map((o: { code: string }) => o.code).sort()).toEqual(
      [again.body.order.code, body.order.code].sort(),
    )
    expect(list.body.orders[0]).toMatchObject({ status: 'PLACED', fulfilment: 'DELIVERY', final: false })
  })

  it('takes cash only for now', async () => {
    const token = await signInCustomer()
    const { status, body } = await call(orders.POST, 'POST', '/api/v1/orders', {
      token,
      body: {
        lines: await tikka(),
        name: 'Priya',
        fulfilment: 'PICKUP',
        slot: 'ASAP',
        paymentMethod: 'ONLINE',
      },
    })
    expect(status).toBe(422)
    expect(body.error).toMatchObject({ code: 'ONLINE_PAYMENT_NOT_SUPPORTED', field: 'paymentMethod' })
    expect(await db.select().from(ordersTable)).toHaveLength(0)
  })

  it('applies the web checkout rules', async () => {
    const token = await signInCustomer()
    const place = (body: object) => call(orders.POST, 'POST', '/api/v1/orders', { token, body })
    const base = { lines: await tikka(), name: 'Priya', slot: 'ASAP' }

    const noAddress = await place({ ...base, fulfilment: 'DELIVERY' })
    expect(noAddress.status).toBe(422)
    expect(noAddress.body.error).toMatchObject({ code: 'ADDRESS_REQUIRED', field: 'address' })

    const roti = [{ itemId: await itemId('Tandoori Roti'), quantity: 1 }]
    const tooSmall = await place({ ...base, lines: roti, fulfilment: 'PICKUP' })
    expect(tooSmall.status).toBe(422)
    expect(tooSmall.body.error.code).toBe('MINIMUM_ORDER')

    const badSlot = await place({ ...base, fulfilment: 'PICKUP', slot: '2020-01-01T00:00:00.000Z' })
    expect(badSlot.status).toBe(409)
    expect(badSlot.body.error).toMatchObject({ code: 'SLOT_UNAVAILABLE', field: 'slot' })

    // A customer who has never given a name must give one.
    const noName = await call(orders.POST, 'POST', '/api/v1/orders', {
      token: await signInCustomer('9822011009'),
      body: { lines: await tikka(), fulfilment: 'PICKUP', slot: 'ASAP' },
    })
    expect(noName.status).toBe(400)
    expect(noName.body.error).toMatchObject({ code: 'INVALID', field: 'name' })

    const unauthenticated = await call(orders.POST, 'POST', '/api/v1/orders', {
      body: { ...base, fulfilment: 'PICKUP' },
    })
    expect(unauthenticated.status).toBe(401)
  })

  it('shows an order only to its owner, and lets the owner cancel until cooking starts', async () => {
    const priya = await signInCustomer('9822011002', 'Priya')
    const rohan = await signInCustomer('9822011003', 'Rohan')
    const placed = await call(orders.POST, 'POST', '/api/v1/orders', {
      token: priya,
      body: { lines: await tikka(), fulfilment: 'PICKUP', slot: 'ASAP' },
    })
    const code = placed.body.order.code

    const own = await call(order.GET, 'GET', `/api/v1/orders/${code}`, { token: priya, params: { code } })
    expect(own.status).toBe(200)
    expect(own.body.order.code).toBe(code)

    const other = await call(order.GET, 'GET', `/api/v1/orders/${code}`, { token: rohan, params: { code } })
    expect(other.status).toBe(404)
    expect(other.body.error.code).toBe('ORDER_NOT_FOUND')
    const theirCancel = await call(cancel.POST, 'POST', '', { token: rohan, params: { code } })
    expect(theirCancel.status).toBe(404)

    const cancelled = await call(cancel.POST, 'POST', '', { token: priya, params: { code } })
    expect(cancelled.status).toBe(200)
    expect(cancelled.body.order).toMatchObject({ status: 'CANCELLED', canCancel: false, steps: [] })

    // A second order that the kitchen has started can no longer be cancelled.
    const second = await call(orders.POST, 'POST', '/api/v1/orders', {
      token: priya,
      body: { lines: await tikka(), fulfilment: 'PICKUP', slot: 'ASAP' },
    })
    const secondCode = second.body.order.code
    await call(move.POST, 'POST', '', {
      token: await signInStaff(),
      params: { code: secondCode },
      body: { to: 'PREPARING' },
    })
    const late = await call(cancel.POST, 'POST', '', { token: priya, params: { code: secondCode } })
    expect(late.status).toBe(409)
    expect(late.body.error.code).toBe('INVALID_TRANSITION')
  })

  it('refuses a sold-out dish at quote and at checkout', async () => {
    const token = await signInCustomer()
    await db.update(menuItems).set({ available: false }).where(eq(menuItems.name, 'Paneer Tikka'))
    const q = await call(quote.POST, 'POST', '/api/v1/quote', {
      body: { lines: await tikka(), fulfilment: 'PICKUP' },
    })
    expect(q.body.problem).toEqual({ code: 'UNAVAILABLE', message: 'Paneer Tikka is sold out right now.' })
    const placed = await call(orders.POST, 'POST', '/api/v1/orders', {
      token,
      body: { lines: await tikka(), name: 'Priya', fulfilment: 'PICKUP', slot: 'ASAP' },
    })
    expect(placed.status).toBe(422)
    expect(placed.body.error.code).toBe('UNAVAILABLE')
  })
})
