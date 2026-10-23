import { test, expect } from '@playwright/test';

test('has title and heading', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/POS SYSTEM/);
  await expect(page.locator('h1')).toContainText('POS SYSTEM');
});
