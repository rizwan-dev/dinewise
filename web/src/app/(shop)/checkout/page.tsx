import { desc, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { db } from '@/db/client'
import { addresses } from '@/db/schema'
import { requireCustomer } from '@/server/auth/current'
import { onlinePaymentsEnabled } from '@/server/env'
import { CheckoutLoader } from './checkout-loader'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Checkout', robots: { index: false } }

export default async function CheckoutPage() {
  const customer = await requireCustomer('/checkout')
  const saved = await db()
    .select()
    .from(addresses)
    .where(eq(addresses.customerId, customer.id))
    .orderBy(desc(addresses.createdAt))

  return (
    <CheckoutLoader
      name={customer.name ?? ''}
      phone={customer.phone}
      addresses={saved.map((a) => ({
        id: a.id,
        label: a.label,
        line1: a.line1,
        line2: a.line2,
        landmark: a.landmark,
        pincode: a.pincode,
      }))}
      onlinePayments={onlinePaymentsEnabled()}
    />
  )
}
