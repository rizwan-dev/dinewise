import { type Browser, devices, expect, type Page } from '@playwright/test'

export const STAFF_PASSWORD = process.env.DEMO_STAFF_PASSWORD ?? 'tadka-demo-2026'

/** A fresh Indian mobile number per test, so one-time-code rate limits never carry over. */
export function testPhone(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`
}

/** Signs a customer in through the real flow, reading the code the demo shows instead of an SMS. */
export async function signInCustomer(page: Page, phone = testPhone(), next = '/account') {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`)
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByRole('button', { name: 'Fill it in' }).click()
  await page.getByRole('button', { name: 'Verify and continue' }).click()
  await page.waitForURL((url) => url.pathname === next)
  return phone
}

/** Staff use a tablet on the counter; their pages open in a separate, larger browser. */
export async function staffPage(browser: Browser, email = 'kitchen@tadkalane.example') {
  const { defaultBrowserType: _, ...ipad } = devices['iPad Pro 11 landscape']
  const context = await browser.newContext(ipad)
  const page = await context.newPage()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(STAFF_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Kitchen' })).toBeVisible()
  return page
}

/** The ticket for one order on the kitchen screen, opening "Scheduled for later" if it is there. */
export async function ticket(page: Page, code: string) {
  const later = page.getByText(/Scheduled for later/)
  if (await later.isVisible()) {
    // Read the live property: an open <details> has open="", which is falsy, so testing the
    // attribute would click the summary again and fold the ticket away.
    const open = await page.locator('details').evaluate((d) => (d as HTMLDetailsElement).open)
    if (!open) await later.click()
  }
  return page.getByRole('listitem').filter({ hasText: code })
}
