import { RESTAURANT } from '@/config/restaurant'

/**
 * Wall-clock time at the restaurant. Customers and staff think in Pune time whatever the
 * server's or phone's zone, so dates and "today" are always worked out in that zone.
 */

const TZ = RESTAURANT.timeZone

const dateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The restaurant's calendar date for an instant, as YYYY-MM-DD. */
export function localDate(instant: Date): string {
  return dateParts.format(instant)
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 0 = Sunday, for a YYYY-MM-DD date. */
export function weekday(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay()
}

function offsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return Math.round((asUtc - instant.getTime()) / 60_000)
}

/**
 * The instant of a wall-clock time on a local date. Computed from the zone's offset at that
 * moment rather than assumed, so it stays correct if the restaurant's zone ever has DST.
 */
export function localInstant(isoDate: string, hhmm: string): Date {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  const [y = 0, mo = 1, d = 1] = isoDate.split('-').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, m)
  const first = guess - offsetMinutes(new Date(guess)) * 60_000
  return new Date(guess - offsetMinutes(new Date(first)) * 60_000)
}

export function minutesOf(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return h * 60 + m
}

const timeFormat = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const dateTimeFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

export const formatTime = (d: Date) => timeFormat.format(d)
export const formatDay = (d: Date) => dayFormat.format(d)
export const formatDateTime = (d: Date) => dateTimeFormat.format(d)

/** "Today", "Tomorrow" or "Mon, 6 Oct" for a local date, relative to now. */
export function dayLabel(isoDate: string, now: Date): string {
  const today = localDate(now)
  if (isoDate === today) return 'Today'
  if (isoDate === addDays(today, 1)) return 'Tomorrow'
  return formatDay(localInstant(isoDate, '12:00'))
}
