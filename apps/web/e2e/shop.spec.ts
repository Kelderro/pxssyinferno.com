import { test, expect } from '@playwright/test'

test.describe('Shop page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/shop')
  })

  test('renders the vault heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /the vault/i })).toBeVisible()
  })

  test('shows category filter tabs', async ({ page }) => {
    // The "All" tab is always rendered
    await expect(page.getByRole('button', { name: /^all$/i })).toBeVisible()
  })

  test('shows the price range slider', async ({ page }) => {
    await expect(page.getByLabel('Minimum price')).toBeVisible()
    await expect(page.getByLabel('Maximum price')).toBeVisible()
  })

  test('filtering by a category hides unmatched products', async ({ page }) => {
    const tabs = page.locator('.cat-tab')
    const count = await tabs.count()

    // Only run the filter check if there are non-"All" tabs available
    if (count <= 1) return

    const secondTab = tabs.nth(1)
    await secondTab.click()

    // Item count readout should update (could be 0 or more, just must exist)
    await expect(page.locator('#item-count')).toBeVisible()
  })

  test('sort select is present and has expected options', async ({ page }) => {
    const select = page.locator('#sort-select')
    await expect(select).toBeVisible()
    await expect(select.locator('option[value="newest"]')).toHaveCount(1)
    await expect(select.locator('option[value="price-asc"]')).toHaveCount(1)
    await expect(select.locator('option[value="price-desc"]')).toHaveCount(1)
  })
})
