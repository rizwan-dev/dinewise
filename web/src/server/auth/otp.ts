import 'server-only'
import { and, count, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { RESTAURANT } from '@/config/restaurant'
import type { Executor } from '@/db/client'
import { customers, otpChallenges, smsOutbox } from '@/db/schema'
import { normaliseIndianMobile } from '@/domain/phone'
import { AppError } from '../errors'
import { hmacSha256, safeEqualHex, sixDigitCode } from './crypto'

/**
 * Sign-in by one-time code. The rules, each tested:
 *  - a code lives 5 minutes and works once;
 *  - 5 wrong guesses lock that code (a million codes, 5 guesses: a 1 in 200,000 chance);
 *  - at most 3 codes per phone per 10 minutes, and 10 per IP address per hour, so the
 *    endpoint cannot be used to flood someone's phone or to grind through codes;
 *  - codes are stored as an HMAC keyed by a server secret, so a leaked table cannot be
 *    brute-forced offline.
 */

export const OTP_TTL_MS = 5 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5
const PER_PHONE = { limit: 3, windowMs: 10 * 60 * 1000 }
const PER_IP = { limit: 10, windowMs: 60 * 60 * 1000 }

type Deps = { exec: Executor; secret: string; now?: Date }

const digest = (secret: string, phone: string, code: string) => hmacSha256(secret, `${phone}:${code}`)

export function parsePhone(input: string): string {
  const phone = normaliseIndianMobile(input)
  if (!phone) throw new AppError('INVALID_PHONE', 'Enter a 10-digit Indian mobile number.', 'phone')
  return phone
}

/** Creates a code, "sends" it, and returns the normalised phone. */
export async function requestCode(
  { exec, secret, now = new Date() }: Deps,
  phoneInput: string,
  ip: string | null,
): Promise<string> {
  const phone = parsePhone(phoneInput)
  // Requests for one phone queue behind each other, so two at once cannot both pass the limit.
  return exec.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'otp:' + phone}))`)
    await issueCode(tx, secret, now, phone, ip)
    return phone
  })
}

async function issueCode(exec: Executor, secret: string, now: Date, phone: string, ip: string | null) {
  const [{ value: recentForPhone = 0 } = {}] = await exec
    .select({ value: count() })
    .from(otpChallenges)
    .where(
      and(
        eq(otpChallenges.phone, phone),
        gt(otpChallenges.createdAt, new Date(now.getTime() - PER_PHONE.windowMs)),
      ),
    )
  if (recentForPhone >= PER_PHONE.limit) {
    throw new AppError('TOO_MANY_CODES', 'Too many codes sent to this number. Please wait 10 minutes.')
  }
  if (ip) {
    const [{ value: recentForIp = 0 } = {}] = await exec
      .select({ value: count() })
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.requestIp, ip),
          gt(otpChallenges.createdAt, new Date(now.getTime() - PER_IP.windowMs)),
        ),
      )
    if (recentForIp >= PER_IP.limit) {
      throw new AppError('TOO_MANY_CODES', 'Too many sign-in attempts from this network. Please try later.')
    }
  }

  const code = sixDigitCode()
  // A new code replaces any earlier one still outstanding for this phone.
  await exec
    .update(otpChallenges)
    .set({ consumedAt: now })
    .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt)))
  await exec.insert(otpChallenges).values({
    phone,
    codeHash: digest(secret, phone, code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    requestIp: ip,
    createdAt: now,
  })
  await exec.insert(smsOutbox).values({
    phone,
    body: `${code} is your ${RESTAURANT.name} sign-in code. It expires in 5 minutes. Do not share it.`,
    createdAt: now,
  })
}

/**
 * Checks a code and returns the customer it signs in, creating them on first sign-in.
 * Every wrong guess is counted atomically, so parallel guesses cannot exceed the limit.
 */
export async function verifyCode(
  { exec, secret, now = new Date() }: Deps,
  phoneInput: string,
  codeInput: string,
): Promise<{ customerId: number; isNew: boolean }> {
  const phone = parsePhone(phoneInput)
  const code = codeInput.replace(/\s/g, '')
  if (!/^\d{6}$/.test(code)) throw new AppError('INVALID_CODE', 'Enter the 6-digit code.', 'code')

  // Claim one attempt before comparing: the counter, not the comparison, bounds guessing.
  const [challenge] = await exec
    .update(otpChallenges)
    .set({ attempts: sql`${otpChallenges.attempts} + 1` })
    .where(
      and(
        eq(otpChallenges.phone, phone),
        isNull(otpChallenges.consumedAt),
        gt(otpChallenges.expiresAt, now),
        lt(otpChallenges.attempts, OTP_MAX_ATTEMPTS),
      ),
    )
    .returning({ id: otpChallenges.id, codeHash: otpChallenges.codeHash, attempts: otpChallenges.attempts })

  if (!challenge) {
    throw new AppError('CODE_EXPIRED', 'That code has expired or been used up. Ask for a new one.', 'code')
  }
  if (!safeEqualHex(challenge.codeHash, digest(secret, phone, code))) {
    const left = OTP_MAX_ATTEMPTS - challenge.attempts
    throw new AppError(
      'WRONG_CODE',
      left > 0
        ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`
        : 'That code is not right. Ask for a new one.',
      'code',
    )
  }

  // Single use, even if the same correct code is submitted twice at once.
  const [consumed] = await exec
    .update(otpChallenges)
    .set({ consumedAt: now })
    .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
    .returning({ id: otpChallenges.id })
  if (!consumed)
    throw new AppError('CODE_EXPIRED', 'That code has already been used. Ask for a new one.', 'code')

  const [created] = await exec
    .insert(customers)
    .values({ phone })
    .onConflictDoNothing({ target: customers.phone })
    .returning({ id: customers.id })
  if (created) return { customerId: created.id, isNew: true }

  const [existing] = await exec.select({ id: customers.id }).from(customers).where(eq(customers.phone, phone))
  return { customerId: existing!.id, isNew: false }
}

/** The demo's stand-in for an SMS inbox: the latest message sent to a phone. */
export async function latestSms(exec: Executor, phone: string) {
  const [row] = await exec
    .select({ body: smsOutbox.body, createdAt: smsOutbox.createdAt })
    .from(smsOutbox)
    .where(eq(smsOutbox.phone, phone))
    .orderBy(desc(smsOutbox.id))
    .limit(1)
  return row
}
