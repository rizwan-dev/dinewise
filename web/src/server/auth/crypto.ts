import 'server-only'
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/** 256 random bits, URL-safe: for session cookies. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hmacSha256(key: string, value: string): string {
  return createHmac('sha256', key).update(value).digest('hex')
}

/** Compares two hex digests without leaking how many leading characters matched. */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length === right.length && timingSafeEqual(left, right)
}

/** A 6-digit one-time code, uniformly random (no modulo bias). */
export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // no 0/O, 1/I/L: easy to read aloud

/** A short public reference such as TL-7K3QX9, readable over the phone. */
export function publicCode(prefix: string, length = 6): string {
  let code = ''
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(0, ALPHABET.length)]
  return `${prefix}-${code}`
}
