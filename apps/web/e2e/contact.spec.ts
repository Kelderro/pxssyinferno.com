import { test, expect } from '@playwright/test'

test.describe('Contact page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact')
  })

  test('renders the contact heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /contact us/i })).toBeVisible()
  })

  test('shows the Instagram DM button', async ({ page }) => {
    const dmLink = page.getByRole('link', { name: /message @pxssyinferno/i })
    await expect(dmLink).toBeVisible()
    await expect(dmLink).toHaveAttribute('href', 'https://ig.me/m/pxssyinferno')
  })

  test('shows the contact form with required fields', async ({ page }) => {
    await expect(page.locator('input[name="name"]')).toBeVisible()
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('textarea[name="message"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('submit button is labelled SEND MESSAGE', async ({ page }) => {
    await expect(page.locator('#contact-submit')).toHaveText('SEND MESSAGE')
  })

  test('honeypot field is hidden from users', async ({ page }) => {
    const honeypot = page.locator('input[name="company"]')
    await expect(honeypot).toHaveClass(/hidden/)
  })
})
