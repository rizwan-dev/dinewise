import { devices, expect, type Page, test } from '@playwright/test'
import { signInCustomer, staffPage, testPhone } from './support'

/** Regenerates the README screenshots: `pnpm screenshots` with the demo stack running. */

const OUT = '../docs/screenshots'
const { defaultBrowserType: _, ...pixel7 } = devices['Pixel 7']

/** Waits until every image on screen has actually loaded, so no screenshot has a blank card. */
async function imagesLoaded(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() =>
    [...document.images]
      .filter((i) => i.getBoundingClientRect().top < window.innerHeight)
      .every((i) => i.complete && i.naturalWidth > 0),
  )
}

test.describe('phone', () => {
  test.use(pixel7)

  test('customer screens', async ({ page }) => {
    await page.goto('/')
    await imagesLoaded(page)
    await page.screenshot({ path: `${OUT}/phone-home.png` })

    await page.goto('/menu#biryani-and-rice')
    await imagesLoaded(page)
    await page.screenshot({ path: `${OUT}/phone-menu.png` })

    await page.getByRole('button', { name: 'Add Chicken Dum Biryani' }).click()
    await page.getByRole('dialog').getByText('Full').click()
    await page.getByRole('dialog').getByText('Extra raita').click()
    await imagesLoaded(page)
    await page.screenshot({ path: `${OUT}/phone-dish.png` })
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^Add ·/ })
      .click()

    await page.getByRole('button', { name: 'Add Butter Naan' }).click()
    await page.goto('/cart')
    await page.getByLabel('Delivery pincode').fill('411045')
    await page.getByLabel('Coupon code').fill('WELCOME50')
    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(page.getByText('WELCOME50 applied.')).toBeVisible()
    await page.screenshot({ path: `${OUT}/phone-cart.png`, fullPage: true })

    await page.getByRole('link', { name: /Continue to checkout/ }).click()
    await page.getByLabel('Mobile number').fill(testPhone())
    await page.getByRole('button', { name: 'Send code' }).click()
    await page.screenshot({ path: `${OUT}/phone-sign-in.png` })
    await page.getByRole('button', { name: 'Fill it in' }).click()
    await page.getByRole('button', { name: 'Verify and continue' }).click()
    await page.getByLabel('Name').fill('Priya Joshi')
    await page
      .getByLabel('House or flat, building and street')
      .fill('Flat 12, Sunrise Apartments, Baner Road')
    await page.getByText('Cash on delivery').click()
    await page.getByRole('button', { name: /Place order/ }).click()
    await expect(page.getByRole('heading', { name: 'Order received' })).toBeVisible()
    await page.screenshot({ path: `${OUT}/phone-tracking.png` })
  })

  test('table booking', async ({ page }) => {
    await signInCustomer(page, undefined, '/book')
    await page.getByRole('button', { name: 'Tomorrow' }).click()
    await expect(page.locator('input[name="time"]').first()).toBeAttached()
    await page.screenshot({ path: `${OUT}/phone-booking.png` })
  })
})

test.describe('tablet', () => {
  test('kitchen screen', async ({ browser }) => {
    const kitchen = await staffPage(browser)
    await kitchen.waitForLoadState('networkidle')
    await kitchen.screenshot({ path: `${OUT}/tablet-kitchen.png` })

    const manager = await staffPage(browser, 'manager@tadkalane.example')
    await manager.getByRole('link', { name: 'Sales' }).click()
    await expect(manager.getByRole('heading', { name: /Sales/ })).toBeVisible()
    await manager.screenshot({ path: `${OUT}/tablet-sales.png` })
  })
})
