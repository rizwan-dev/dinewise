import { expect, test } from '@playwright/test'
import { staffPage, testPhone, ticket } from './support'

/**
 * A customer orders on their phone and pays cash; the kitchen moves the order along on its
 * tablet; the customer's tracking page follows every step without being reloaded.
 */
test('an order goes from the menu to the door, live', async ({ page, browser }) => {
  // --- Menu: a dish with choices, and a simple one ------------------------------------------
  await page.goto('/menu')
  await page.getByRole('button', { name: 'Add Chicken Dum Biryani' }).click()
  const sheet = page.getByRole('dialog', { name: 'Chicken Dum Biryani' })
  await sheet.getByText('Full').click()
  await sheet.getByText('Extra raita').click()
  await sheet.getByRole('button', { name: 'Add · ₹420' }).click()
  await page.getByRole('button', { name: 'Add Butter Naan' }).click()
  await page.getByRole('button', { name: 'Add Butter Naan' }).click()
  await expect(page.getByRole('link', { name: /3 items · ₹540/ })).toBeVisible()

  // --- Cart: delivery pincode and a first-order coupon ---------------------------------------
  await page.getByRole('link', { name: /View cart/ }).click()
  await page.getByLabel('Delivery pincode').fill('411045')
  await page.getByLabel('Coupon code').fill('WELCOME50')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('WELCOME50 applied.')).toBeVisible()
  // 540 - 50 discount + 20 packing + 30 delivery = 540; 5% GST = 27.
  await expect(page.getByRole('link', { name: 'Continue to checkout · ₹567' })).toBeVisible()
  await page.getByRole('link', { name: /Continue to checkout/ }).click()

  // --- Sign in with a one-time code, then straight back to checkout --------------------------
  await page.getByLabel('Mobile number').fill(testPhone())
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByRole('button', { name: 'Fill it in' }).click()
  await page.getByRole('button', { name: 'Verify and continue' }).click()
  await expect(page).toHaveURL(/\/checkout$/)

  // --- Checkout: cash on delivery --------------------------------------------------------------
  await page.getByLabel('Name').fill('Priya Joshi')
  await page.getByLabel('House or flat, building and street').fill('Flat 12, Sunrise Apartments, Baner Road')
  await expect(page.getByLabel('Pincode')).toHaveValue('411045')
  await page.getByText('Cash on delivery').click()
  await page.getByRole('button', { name: 'Place order · ₹567' }).click()

  await expect(page.getByRole('heading', { name: 'Order received' })).toBeVisible()
  await expect(page.getByText('Please keep ₹567 ready in cash.')).toBeVisible()
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  const code = (await page.getByText(/^Order TL-/).textContent())!.replace('Order ', '').trim()

  // --- The kitchen, on a tablet ---------------------------------------------------------------
  const kitchen = await staffPage(browser)
  const card = await ticket(kitchen, code)
  await expect(card.getByText('Collect ₹567 cash')).toBeVisible()
  await expect(card.getByText('Full · Extra raita')).toBeVisible()

  for (const [button, customerSees] of [
    ['Start cooking', 'Being prepared'],
    ['Mark ready', 'Ready'],
    ['Out for delivery', 'On the way'],
  ] as const) {
    await (await ticket(kitchen, code)).getByRole('button', { name: button }).click()
    // The customer's page is never reloaded: the change arrives over the live stream.
    await expect(page.getByRole('heading', { name: customerSees })).toBeVisible()
  }
  await (await ticket(kitchen, code)).getByRole('button', { name: 'Delivered' }).click()
  await expect(page.getByRole('heading', { name: 'Delivered' })).toBeVisible()

  // --- Reorder from the finished order ---------------------------------------------------------
  await page.getByRole('button', { name: 'Order this again' }).click()
  await expect(page).toHaveURL(/\/cart$/)
  await expect(page.getByText('Chicken Dum Biryani')).toBeVisible()
  await expect(page.getByText('Full · Extra raita')).toBeVisible()
})
