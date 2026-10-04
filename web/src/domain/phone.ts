/**
 * Indian mobile numbers in the forms people type them: "98220 11002", "+91 98220-11002",
 * "098220 11002". Returns E.164 (+919822011002), or null if it is not an Indian mobile number.
 */
export function normaliseIndianMobile(input: string): string | null {
  let digits = input.replace(/[\s()-]/g, '')
  if (digits.startsWith('+91')) digits = digits.slice(3)
  else if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2)
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1)
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null
}

/** +919822011002 -> "98220 11002" */
export function displayPhone(e164: string): string {
  const local = e164.replace(/^\+91/, '')
  return `${local.slice(0, 5)} ${local.slice(5)}`
}

/** +919822011002 -> "98220 ••002": enough to recognise, not enough to misuse. */
export function maskedPhone(e164: string): string {
  const local = e164.replace(/^\+91/, '')
  return `${local.slice(0, 5)} ••${local.slice(7)}`
}
