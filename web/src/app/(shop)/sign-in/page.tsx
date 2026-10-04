import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCustomer } from '@/server/auth/current'
import { safeNext } from '@/server/request'
import { SignInForm } from './sign-in-form'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } }

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const next = safeNext((await searchParams).next)
  if (await getCustomer()) redirect(next)
  return (
    <div className="mx-auto max-w-sm py-6">
      <h1 className="font-display text-3xl font-semibold">Sign in</h1>
      <p className="mt-1 text-stone-600">We will text you a code. No password to remember.</p>
      <SignInForm next={next} />
    </div>
  )
}
