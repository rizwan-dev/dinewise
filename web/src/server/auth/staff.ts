import 'server-only'
import { hash, verify } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import type { Executor } from '@/db/client'
import { staff } from '@/db/schema'
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
