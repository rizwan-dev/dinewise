import { expect, test } from '@playwright/test'
import { signInCustomer, staffPage, ticket } from './support'

test('a guest books a table and can cancel it', async ({ page }) => {
  await signInCustomer(page, undefined, '/book')
  await page.getByRole('button', { name: 'One more' }).click() // three guests
  await page.getByRole('button', { name: 'Tomorrow' }).click()
  const firstFree = page.locator('label:has(input[name="time"]:not([disabled]))').first()
  await firstFree.click()
  await page.getByRole('button', { name: /^Book for 3 at/ }).click()

  await expect(page.getByRole('heading', { name: 'You are booked' })).toBeVisible()
  await page.getByRole('link', { name: 'My bookings' }).click()
  await expect(page.getByText(/Table for 3 · TB-/)).toBeVisible()

  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Yes, cancel booking' }).click()
  await expect(page.getByText(/Table for 3 · TB-/)).toBeHidden()
})

test('marking a dish sold out takes it off sale at once', async ({ page, browser }) => {
  const kitchen = await staffPage(browser)
  await kitchen.getByRole('link', { name: 'Menu' }).click()
  const toggle = kitchen.getByRole('switch', { name: 'Gulab Jamun available' })
  await toggle.click()
  await expect(toggle).toHaveText('Sold out')

  try {
    await page.goto('/menu')
    const dish = page.getByRole('listitem').filter({ hasText: 'Gulab Jamun' })
    await expect(dish.getByText('Sold out')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Gulab Jamun' })).toHaveCount(0)
  } finally {
    await toggle.click()
    await expect(toggle).toHaveText('Available')
  }
})

test('a rejected order tells the customer why', async ({ page, browser }) => {
  await signInCustomer(page)
  await page.goto('/menu')
  await page.getByRole('button', { name: 'Add Paneer Tikka' }).click()
  await page.goto('/cart')
  await page.getByRole('radio', { name: 'Pickup' }).click()
  await page.getByRole('link', { name: /Continue to checkout/ }).click()
  await page.getByLabel('Name').fill('Rohan Patil')
  await expect(page.getByText('Cash at pickup')).toBeVisible()
  await page.getByRole('button', { name: /Place order/ }).click()
  await expect(page.getByRole('heading', { name: 'Order received' })).toBeVisible()
  const code = (await page.getByText(/^Order TL-/).textContent())!.replace('Order ', '').trim()

  const kitchen = await staffPage(browser)
  const card = await ticket(kitchen, code)
  await card.getByRole('button', { name: 'Reject' }).click()
  await card.getByRole('button', { name: 'Item out of stock' }).click()

  await expect(page.getByRole('heading', { name: 'Could not be accepted' })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'could not accept' })).toContainText('Item out of stock')
})

test('nothing on a phone screen scrolls sideways', async ({ page }) => {
  await signInCustomer(page)
  for (const path of ['/', '/menu', '/cart', '/book', '/account']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, path).toBe(0)
  }
})

test('the menu search bar stays on top of dishes scrolling under it', async ({ page }) => {
  await page.goto('/menu')
  for (const scroll of [300, 700, 1200]) {
    await page.evaluate((y) => window.scrollTo(0, y), scroll)
    const onTop = await page.evaluate(() => {
      const input = document.getElementById('menu-search')!
      const box = input.getBoundingClientRect()
      return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === input
    })
    expect(onTop, `scrolled to ${scroll}px`).toBe(true)
  }
})

test('customers cannot reach staff pages', async ({ page }) => {
  await signInCustomer(page)
  await page.goto('/staff')
  await expect(page).toHaveURL(/\/staff\/sign-in$/)
})
