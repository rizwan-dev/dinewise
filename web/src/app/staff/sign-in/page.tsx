import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PRODUCT } from '@/config/product'
import { RESTAURANT } from '@/config/restaurant'
import { DemoStaffButtons } from '@/components/demo-staff-buttons'
import { getStaff } from '@/server/auth/current'
import { env } from '@/server/env'
import { StaffSignInForm } from './form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Staff sign in', robots: { index: false } }

export default async function StaffSignInPage() {
  if (await getStaff()) redirect('/staff')
  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-900 px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <p className="text-saffron-700 text-sm font-semibold">
          {PRODUCT.name} · {RESTAURANT.name} staff
        </p>
        <h1 className="font-display mt-1 text-2xl font-semibold">Sign in</h1>
        <StaffSignInForm />
        {env().DEMO_SEED && (
          <div className="mt-6 border-t border-stone-200 pt-5">
            <p className="text-sm font-semibold">Just looking around?</p>
            <p className="mb-3 text-sm text-stone-600">
              This is a demo restaurant. Step into the kitchen or the manager&apos;s office with one tap.
            </p>
            <DemoStaffButtons />
          </div>
        )}
      </div>
    </main>
  )
}
