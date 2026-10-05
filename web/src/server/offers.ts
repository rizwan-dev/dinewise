import 'server-only'
import { and, asc, eq, gt, lte } from 'drizzle-orm'
import type { Executor } from '@/db/client'
import { coupons } from '@/db/schema'

/** Coupons a customer could use right now, for the offers strip on the home page. */
export async function activeOffers(exec: Executor, now = new Date()) {
  return exec
    .select({ code: coupons.code, description: coupons.description, firstOrderOnly: coupons.firstOrderOnly })
    .from(coupons)
    .where(and(eq(coupons.active, true), lte(coupons.startsAt, now), gt(coupons.endsAt, now)))
    .orderBy(asc(coupons.minOrderPaise))
}
