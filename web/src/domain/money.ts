/**
 * Money is whole paise in integers, never floating-point rupees: 0.1 + 0.2 is not 0.3 in
 * binary, and a bill that is a paisa out does not reconcile.
 */

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
const wholeRupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/** ₹1,234.50, or ₹1,234 when there are no paise (menu prices read better that way). */
export function formatPaise(paise: number): string {
  return paise % 100 === 0 ? wholeRupees.format(paise / 100) : rupees.format(paise / 100)
}

/** `amount × basisPoints / 10 000`, rounded half up. Inputs are non-negative integers. */
export function percentOf(amountPaise: number, basisPoints: number): number {
  return Math.floor((amountPaise * basisPoints + 5_000) / 10_000)
}

/** "450", "42.5" or "1,250.75" in rupees -> paise; NaN for anything else. */
export function parseRupees(input: string): number {
  const text = input.trim().replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return Number.NaN
  const [whole = '0', fraction = ''] = text.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}
