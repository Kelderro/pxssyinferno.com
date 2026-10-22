import { test, expect } from '@playwright/test'

test.describe('Home page', () => {
  test('loads and displays the hero headline', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Pussy Inferno/i)
    await expect(page.getByText(/RAW\. UNFILTERED\. INFERNO\./i)).toBeVisible()
  })

  test('shows the product grid section', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/Active Collection/i)).toBeVisible()
  })

  test('has no broken console errors on load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/')
    expect(errors).toHaveLength(0)
  })
})
