'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/client'
import { addresses, orders } from '@/db/schema'
import { type CartLine, priceLine } from '@/domain/pricing'
import { getCustomer } from '@/server/auth/current'
import { type ActionResult, AppError, toResult } from '@/server/errors'
import { loadMenu, menuById } from '@/server/menu'
import { move, reorderLines } from '@/server/orders'
import { availableTimes, book, cancelReservation } from '@/server/reservations'
import { deps } from '@/server/runtime'

async function signedIn() {
  const customer = await getCustomer()
  if (!customer) throw new AppError('SIGNED_OUT', 'Please sign in again.')
  return customer
}

const code = z.string().regex(/^T[LB]-[0-9A-Z]{6}$/)

export async function cancelOrderAction(orderCode: string): Promise<ActionResult> {
  return toResult(async () => {
    const customer = await signedIn()
    const [order] = await db()
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.code, code.parse(orderCode)), eq(orders.customerId, customer.id)))
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found.')
    const { db: database, gateway } = deps()
    await move(
      database,
      { orderId: order.id, to: 'CANCELLED', actor: 'CUSTOMER', customerId: customer.id },
      gateway,
    )
    revalidatePath(`/orders/${orderCode}`)
  })
}

export type ReorderLine = CartLine & {
  name: string
  veg: boolean
  variantName: string | null
  addonNames: string[]
  unitPricePaise: number
}

/** A past order as cart lines, priced from today's menu. */
export async function reorderAction(orderCode: string): Promise<ActionResult<ReorderLine[]>> {
  return toResult(async () => {
    const customer = await signedIn()
    const lines = await reorderLines(db(), customer.id, code.parse(orderCode))
    if (lines.length === 0)
      throw new AppError('NOTHING_AVAILABLE', 'None of those dishes are available right now.')
    const menu = menuById(await loadMenu(db()))
    return lines.map((line) => {
      const item = menu.get(line.itemId)!
      const priced = priceLine(item, line)
      return {
        ...line,
        name: priced.name,
        veg: item.veg,
        variantName: priced.variantName,
        addonNames: priced.addons.map((a) => a.name),
        unitPricePaise: priced.unitPricePaise,
      }
    })
  })
}

export async function deleteAddressAction(id: number): Promise<ActionResult> {
  return toResult(async () => {
    const customer = await signedIn()
    await db()
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.customerId, customer.id)))
    revalidatePath('/account')
  })
}

export async function seatingTimesAction(date: string, partySize: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(partySize) || partySize < 1 || partySize > 20)
    return []
  const times = await availableTimes(db(), date, partySize)
  return times.map((t) => ({ startsAt: t.start.toISOString(), available: t.available }))
}

const bookingSchema = z.object({
  startsAt: z.iso.datetime(),
  partySize: z.number().int(),
  notes: z.string().max(300).nullish(),
})

export async function bookTableAction(
  input: z.input<typeof bookingSchema>,
): Promise<ActionResult<{ code: string; table: string }>> {
  return toResult(async () => {
    const customer = await signedIn()
    const b = bookingSchema.parse(input)
    const booking = await book(db(), { customerId: customer.id, ...b })
    revalidatePath('/account')
    return { code: booking.code, table: booking.table }
  })
}

export async function cancelBookingAction(bookingCode: string): Promise<ActionResult> {
  return toResult(async () => {
    const customer = await signedIn()
    await cancelReservation(db(), customer.id, code.parse(bookingCode))
    revalidatePath('/account')
  })
}
