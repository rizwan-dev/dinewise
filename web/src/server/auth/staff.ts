import 'server-only'
import { hash, verify } from '@node-rs/argon2'
import { and, eq } from 'drizzle-orm'
import type { Executor } from '@/db/client'
import { staff } from '@/db/schema'
import { env } from '../env'
import { AppError } from '../errors'

export type StaffRole = 'MANAGER' | 'KITCHEN'

/** OWASP's minimum Argon2id parameters: 19 MiB of memory, 2 passes. */
const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const

export const hashPassword = (password: string) => hash(password, ARGON2)

// Verified against when the email is unknown, so a wrong email takes as long as a wrong password.
let dummyHash: Promise<string> | undefined

export async function authenticateStaff(exec: Executor, email: string, password: string) {
  const [row] = await exec
    .select({ id: staff.id, passwordHash: staff.passwordHash, active: staff.active })
    .from(staff)
    .where(eq(staff.email, email.trim().toLowerCase()))
    .limit(1)

  dummyHash ??= hashPassword('not-a-real-password')
  const ok = await verify(row?.passwordHash ?? (await dummyHash), password).catch(() => false)
  // One message for unknown email, wrong password and disabled account alike.
  if (!row || !ok || !row.active) {
    throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.')
  }
  return row.id
}

/**
 * The seeded demo account for a role, for one-tap sign-in to the demo restaurant. Refused
 * unless this installation is the demo.
 */
export async function demoStaffId(exec: Executor, role: StaffRole): Promise<number> {
  if (!env().DEMO_SEED) throw new AppError('NOT_DEMO', 'Demo sign-in is only available in the demo.')
  const email = role === 'MANAGER' ? 'manager@tadkalane.example' : 'kitchen@tadkalane.example'
  const [member] = await exec
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.email, email), eq(staff.active, true)))
  if (!member) throw new AppError('NOT_FOUND', 'The demo staff accounts are not set up yet.')
  return member.id
}
