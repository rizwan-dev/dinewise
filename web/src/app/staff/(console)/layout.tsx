import type { Metadata } from 'next'
import { staffSignOutAction } from '@/app/actions/staff'
import { requireStaff } from '@/server/auth/current'
import { StaffNav } from './staff-nav'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Staff', robots: { index: false } }

/**
 * Staff chrome. The layout shows who is signed in, but it is not the security check: every
 * staff page and action calls requireStaff itself, because layouts do not run on every request.
 */
export default async function StaffLayout({ children }: LayoutProps<'/staff'>) {
  const member = await requireStaff()
  return (
    <div className="min-h-dvh bg-stone-100">
      <header className="sticky top-0 z-20 bg-stone-900 text-white">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="bg-saffron-600 font-display flex size-9 items-center justify-center rounded-xl font-bold">
              T
            </span>
            <StaffNav manager={member.role === 'MANAGER'} />
          </div>
          <form action={staffSignOutAction} className="flex items-center gap-3">
            <span className="hidden text-sm text-stone-300 sm:inline">{member.name}</span>
            <button
              type="submit"
              className="min-h-11 rounded-xl px-3 text-sm font-semibold hover:bg-white/10"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="p-3 sm:p-4">{children}</main>
    </div>
  )
}
