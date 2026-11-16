import { test, expect } from '@playwright/test'

const html = (page: import('@playwright/test').Page) => page.locator('html')

test.describe('Currency selector', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })

  test('defaults to EUR and switches to GBP', async ({ page }) => {
    await page.goto('/')
    await expect(html(page)).toHaveAttribute('data-currency', 'eur')

    const toggle = page.locator('header > div').getByRole('group', { name: 'Currency' })
    await expect(toggle).toBeVisible()
    await toggle.getByRole('button', { name: 'Prices in Pound sterling' }).click()

    await expect(html(page)).toHaveAttribute('data-currency', 'gbp')
    await expect(toggle.getByRole('button', { name: 'Prices in Pound sterling' })).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle.getByRole('button', { name: 'Prices in Euro' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('the choice persists across pages and visits', async ({ page }) => {
    await page.goto('/')
    await page.locator('header > div').getByRole('button', { name: 'Prices in Pound sterling' }).click()

    await page.goto('/shop')
    await expect(html(page)).toHaveAttribute('data-currency', 'gbp')

    await page.reload()
    await expect(html(page)).toHaveAttribute('data-currency', 'gbp')
  })

  test('only the selected currency is shown on product cards', async ({ page }) => {
    await page.goto('/shop')
    // CI may build against an empty/dummy dataset
    test.skip((await page.locator('.product-card').count()) === 0, 'no products in this dataset')
    const card = page.locator('.product-card').first()
    await expect(card.locator('[data-cur="eur"]').first()).toBeVisible()
    await expect(card.locator('[data-cur="gbp"]').first()).toBeHidden()

    await page.locator('header > div').getByRole('button', { name: 'Prices in Pound sterling' }).click()
    await expect(card.locator('[data-cur="eur"]').first()).toBeHidden()
    await expect(card.locator('[data-cur="gbp"]').first()).toBeVisible()
  })
})

test.describe('Currency default for UK browsers', () => {
  test.use({ locale: 'en-GB' })

  test('defaults to GBP without a saved choice', async ({ page }) => {
    await page.goto('/')
    await expect(html(page)).toHaveAttribute('data-currency', 'gbp')
  })

  test('a saved choice wins over the browser language', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('pi_currency', 'eur'))
    await page.reload()
    await expect(html(page)).toHaveAttribute('data-currency', 'eur')
  })
})

test.describe('Currency on mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, locale: 'en-US' })

  test('the switch is in the mobile menu', async ({ page }) => {
    await page.goto('/')
    await page.locator('#mobile-menu-btn').click()
    const menu = page.locator('#mobile-menu')
    await menu.getByRole('button', { name: 'Prices in Pound sterling' }).click()
    await expect(html(page)).toHaveAttribute('data-currency', 'gbp')
    await expect(menu).toBeVisible()
  })
})
