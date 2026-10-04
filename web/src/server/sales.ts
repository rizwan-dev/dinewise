import 'server-only'
import { and, count, desc, gte, lt, notInArray, sql, sum } from 'drizzle-orm'
import { RESTAURANT } from '@/config/restaurant'
import type { Executor } from '@/db/client'
import { orderItems, orders } from '@/db/schema'
import { addDays, localInstant } from '@/domain/time'

/** Orders that count as sales: placed and not cancelled, rejected or abandoned unpaid. */
const NOT_SALES = ['AWAITING_PAYMENT', 'CANCELLED', 'REJECTED', 'EXPIRED'] as const

export async function salesForDay(exec: Executor, date: string) {
  const from = localInstant(date, '00:00')
  const to = localInstant(addDays(date, 1), '00:00')
  const sold = and(gte(orders.createdAt, from), lt(orders.createdAt, to), notInArray(orders.status, [...NOT_SALES]))
  const tz = RESTAURANT.timeZone

  const [[totals], byHour, topItems, byMethod] = await Promise.all([
    exec
      .select({
        orders: count(),
        revenuePaise: sum(orders.totalPaise).mapWith(Number),
        discountPaise: sum(orders.discountPaise).mapWith(Number),
        taxPaise: sum(orders.taxPaise).mapWith(Number),
      })
      .from(orders)
      .where(sold),
    exec
      .select({
        hour: sql<number>`extract(hour from ${orders.createdAt} at time zone ${tz})::int`,
        orders: count(),
        revenuePaise: sum(orders.totalPaise).mapWith(Number),
      })
      .from(orders)
      .where(sold)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    exec
      .select({
        name: orderItems.name,
        quantity: sum(orderItems.quantity).mapWith(Number),
        revenuePaise: sum(orderItems.lineTotalPaise).mapWith(Number),
      })
      .from(orderItems)
      .innerJoin(orders, sql`${orders.id} = ${orderItems.orderId}`)
      .where(sold)
      .groupBy(orderItems.name)
      .orderBy(desc(sql`2`))
      .limit(5),
    exec
      .select({ method: orders.paymentMethod, orders: count(), revenuePaise: sum(orders.totalPaise).mapWith(Number) })
      .from(orders)
      .where(sold)
      .groupBy(orders.paymentMethod),
  ])

  const revenue = totals?.revenuePaise ?? 0
  const orderCount = totals?.orders ?? 0
  return {
    date,
    orders: orderCount,
    revenuePaise: revenue,
    averagePaise: orderCount ? Math.round(revenue / orderCount) : 0,
    discountPaise: totals?.discountPaise ?? 0,
    taxPaise: totals?.taxPaise ?? 0,
    byHour,
    topItems,
    byMethod,
  }
}
