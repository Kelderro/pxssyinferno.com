import { test, expect } from '@playwright/test'

test.describe('Mobile navigation', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('menu button opens and closes the menu', async ({ page }) => {
    await page.goto('/')
    const menuBtn = page.locator('#mobile-menu-btn')
    const menu = page.locator('#mobile-menu')

    await expect(menuBtn).toBeVisible()
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'false')
    await expect(menu).toBeHidden()

    await menuBtn.click()
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'true')
    for (const label of ['Shop', 'FAQ', 'About', 'Contact']) {
      await expect(menu.getByRole('link', { name: label, exact: true })).toBeVisible()
    }

    await page.keyboard.press('Escape')
    await expect(menuBtn).toHaveAttribute('aria-expanded', 'false')
    await expect(menu).toBeHidden()
    await expect(menuBtn).toBeFocused()
  })

  test('closes when tapping outside the menu', async ({ page }) => {
    await page.goto('/')
    await page.locator('#mobile-menu-btn').click()
    await expect(page.locator('#mobile-menu')).toBeVisible()

    await page.locator('main').click({ position: { x: 10, y: 400 } })
    await expect(page.locator('#mobile-menu')).toBeHidden()
  })

  test('menu links navigate', async ({ page }) => {
    await page.goto('/')
    await page.locator('#mobile-menu-btn').click()
    await page.locator('#mobile-menu').getByRole('link', { name: 'Shop', exact: true }).click()
    await expect(page).toHaveURL(/\/shop\/?$/)
  })

  test('header does not overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('/')
    const header = page.locator('header > div').first()
    const overflow = await header.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await expect(page.locator('#mobile-menu-btn')).toBeInViewport({ ratio: 1 })
    await expect(page.locator('#open-cart-btn')).toBeInViewport({ ratio: 1 })
  })
})

test.describe('Desktop navigation', () => {
  test('shows inline nav and hides the menu button', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await expect(page.locator('#mobile-menu-btn')).toBeHidden()
    await expect(page.locator('header nav[aria-label="Main"]').first().getByRole('link', { name: 'Shop', exact: true })).toBeVisible()
  })
})
